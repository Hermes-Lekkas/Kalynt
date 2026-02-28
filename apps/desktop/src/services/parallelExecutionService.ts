/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Parallel Execution Service - Concurrent Tool Execution
 * 
 * Executes independent tool calls in parallel to maximize performance.
 * Manages concurrency limits, result aggregation, and error handling.
 */

import { logger } from '../utils/logger'
import { dependencyAnalysisService, type ToolCall } from './dependencyAnalysisService'

export interface ParallelExecutionConfig {
    maxConcurrency: number
    timeoutMs: number
    retryAttempts: number
    retryDelayMs: number
}

export interface ToolExecutionResult {
    toolId: string
    success: boolean
    result?: unknown
    error?: string
    duration: number
    retries: number
}

export interface ParallelExecutionResult {
    success: boolean
    results: ToolExecutionResult[]
    completed: string[]
    failed: string[]
    totalDuration: number
    parallelGroups: number
}

export interface ExecutionContext {
    runId: string
    iteration: number
    abortSignal?: AbortSignal
}

type ToolExecutor = (call: ToolCall) => Promise<unknown>

class ParallelExecutionService {
    private config: ParallelExecutionConfig = {
        maxConcurrency: 5,
        timeoutMs: 30000,
        retryAttempts: 2,
        retryDelayMs: 1000
    }
    private executor: ToolExecutor | null = null

    /**
     * Initialize the service with configuration
     */
    initialize(config?: Partial<ParallelExecutionConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        logger.agent.info('Parallel execution service initialized', this.config)
    }

    /**
     * Set the tool executor function
     */
    setExecutor(executor: ToolExecutor): void {
        this.executor = executor
    }

    /**
     * Execute tool calls with automatic parallelization
     */
    async execute(
        toolCalls: ToolCall[],
        context: ExecutionContext
    ): Promise<ParallelExecutionResult> {
        if (!this.executor) {
            throw new Error('Tool executor not set. Call setExecutor() first.')
        }

        if (toolCalls.length === 0) {
            return {
                success: true,
                results: [],
                completed: [],
                failed: [],
                totalDuration: 0,
                parallelGroups: 0
            }
        }

        const startTime = Date.now()
        logger.agent.info('Starting parallel execution', {
            runId: context.runId,
            toolCount: toolCalls.length
        })

        // Analyze dependencies and create execution plan
        const dependencyGraph = dependencyAnalysisService.buildDependencyGraph(toolCalls)
        const executionPlan = dependencyAnalysisService.createExecutionPlan(dependencyGraph)

        // Check for resource conflicts
        const conflicts = dependencyAnalysisService.findResourceConflicts(toolCalls)
        if (conflicts.length > 0) {
            logger.agent.warn('Resource conflicts detected', { conflicts })
        }

        const results: ToolExecutionResult[] = []
        const completed: string[] = []
        const failed: string[] = []

        // Execute each level of the plan
        for (let levelIndex = 0; levelIndex < executionPlan.sequential.length; levelIndex++) {
            const level = executionPlan.sequential[levelIndex]
            
            logger.agent.debug('Executing parallel level', {
                level: levelIndex + 1,
                toolCount: level.length
            })

            // Execute tools in this level concurrently
            const levelResults = await this.executeLevel(level, context)
            
            results.push(...levelResults)

            for (const result of levelResults) {
                if (result.success) {
                    completed.push(result.toolId)
                } else {
                    failed.push(result.toolId)
                }
            }

            // If any critical tool failed, we might want to stop
            // For now, continue with next level
        }

        const totalDuration = Date.now() - startTime

        const finalResult: ParallelExecutionResult = {
            success: failed.length === 0,
            results,
            completed,
            failed,
            totalDuration,
            parallelGroups: executionPlan.sequential.length
        }

        logger.agent.info('Parallel execution completed', {
            runId: context.runId,
            totalDuration,
            completed: completed.length,
            failed: failed.length,
            parallelGroups: executionPlan.sequential.length
        })

        return finalResult
    }

    /**
     * Execute a single level of tool calls concurrently
     */
    private async executeLevel(
        toolCalls: ToolCall[],
        context: ExecutionContext
    ): Promise<ToolExecutionResult[]> {
        const results: ToolExecutionResult[] = []
        
        // Process in chunks based on maxConcurrency
        for (let i = 0; i < toolCalls.length; i += this.config.maxConcurrency) {
            const chunk = toolCalls.slice(i, i + this.config.maxConcurrency)
            
            // Check for abort signal
            if (context.abortSignal?.aborted) {
                throw new Error('Execution aborted')
            }

            // Execute chunk concurrently
            const chunkPromises = chunk.map(call => this.executeWithRetry(call, context))
            const chunkResults = await Promise.all(chunkPromises)
            
            results.push(...chunkResults)
        }

        return results
    }

    /**
     * Execute a single tool call with retry logic
     */
    private async executeWithRetry(
        toolCall: ToolCall,
        context: ExecutionContext
    ): Promise<ToolExecutionResult> {
        let lastError: Error | undefined
        let retries = 0

        for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
            const startTime = Date.now()

            try {
                // Check for abort
                if (context.abortSignal?.aborted) {
                    throw new Error('Execution aborted')
                }

                // Execute with timeout
                const result = await Promise.race([
                    this.executor!(toolCall),
                    this.createTimeoutPromise()
                ])

                const duration = Date.now() - startTime

                return {
                    toolId: toolCall.id,
                    success: true,
                    result,
                    duration,
                    retries
                }

            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                retries = attempt

                if (attempt < this.config.retryAttempts) {
                    logger.agent.warn('Tool execution failed, retrying', {
                        toolId: toolCall.id,
                        attempt: attempt + 1,
                        error: lastError.message
                    })
                    
                    // Wait before retry
                    await this.delay(this.config.retryDelayMs * Math.pow(2, attempt))
                }
            }
        }

        // All retries exhausted
        return {
            toolId: toolCall.id,
            success: false,
            error: lastError?.message || 'Unknown error',
            duration: 0,
            retries
        }
    }

    /**
     * Execute tools sequentially (fallback for when parallel execution isn't safe)
     */
    async executeSequential(
        toolCalls: ToolCall[],
        context: ExecutionContext
    ): Promise<ParallelExecutionResult> {
        if (!this.executor) {
            throw new Error('Tool executor not set')
        }

        const startTime = Date.now()
        const results: ToolExecutionResult[] = []
        const completed: string[] = []
        const failed: string[] = []

        for (const call of toolCalls) {
            const result = await this.executeWithRetry(call, context)
            results.push(result)

            if (result.success) {
                completed.push(result.toolId)
            } else {
                failed.push(result.toolId)
            }
        }

        return {
            success: failed.length === 0,
            results,
            completed,
            failed,
            totalDuration: Date.now() - startTime,
            parallelGroups: toolCalls.length
        }
    }

    /**
     * Get execution statistics
     */
    getStats(): {
        maxConcurrency: number
        timeoutMs: number
        retryAttempts: number
    } {
        return { ...this.config }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ParallelExecutionConfig>): void {
        this.config = { ...this.config, ...config }
        logger.agent.info('Parallel execution config updated', this.config)
    }

    // --- Private helpers ---

    private createTimeoutPromise(): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Execution timeout after ${this.config.timeoutMs}ms`))
            }, this.config.timeoutMs)
        })
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export const parallelExecutionService = new ParallelExecutionService()
