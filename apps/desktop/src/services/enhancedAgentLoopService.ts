/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Enhanced Agent Loop Service - Phase 2 Integration
 * 
 * Integrates all Phase 2 services:
 * - Goal Stack Service for hierarchical planning
 * - Intent Classification for task routing
 * - Confidence Scoring for tool selection
 * - Learning System for adaptive behavior
 * - Cycle Detection for infinite loop prevention
 * - Tool Cache for performance optimization
 */

import { goalStackService, type Goal, type GoalStack } from './goalStackService'
import { intentClassificationService, type IntentClassification } from './intentClassificationService'
import { confidenceScoringService, type ConfidenceScore } from './confidenceScoringService'
import { learningService, type AdaptationSuggestion } from './learningService'
import { cycleDetectionService, type DetectedCycle } from './cycleDetectionService'
import { toolCacheService } from './toolCacheService'
import { logger } from '../utils/logger'

export interface AgentState {
    iteration: number
    runId: string
    currentGoal: Goal | null
    intent: IntentClassification | null
    lastAction: string | null
    lastResult: unknown
    confidence: number
    cycleDetected: DetectedCycle | null
}

export interface AgentConfig {
    maxIterations: number
    autoApproveThreshold: number
    enableCycleDetection: boolean
    enableLearning: boolean
    enableCaching: boolean
}

export interface AgentStep {
    type: 'plan' | 'execute' | 'reflect' | 'correct' | 'complete'
    action: string
    params?: Record<string, unknown>
    confidence: number
    reasoning: string
}

export interface AgentExecutionResult {
    success: boolean
    steps: AgentStep[]
    iterationsUsed: number
    finalState: AgentState
    cyclesDetected: DetectedCycle[]
    cacheHits: number
    adaptationsApplied: number
}

export interface ToolCallRequest {
    tool: string
    params: Record<string, unknown>
    confidence: ConfidenceScore
    shouldAutoApprove: boolean
    alternatives?: Array<{ tool: string; confidence: ConfidenceScore; reason: string }>
}

class EnhancedAgentLoopService {
    private state: AgentState = {
        iteration: 0,
        runId: '',
        currentGoal: null,
        intent: null,
        lastAction: null,
        lastResult: null,
        confidence: 0.5,
        cycleDetected: null
    }

    private config: AgentConfig = {
        maxIterations: 25,
        autoApproveThreshold: 0.8,
        enableCycleDetection: true,
        enableLearning: true,
        enableCaching: true
    }

    private stepHistory: AgentStep[] = []
    private currentRunCycles: DetectedCycle[] = []

    /**
     * Initialize the enhanced agent loop
     */
    initialize(runId: string, config?: Partial<AgentConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }

        // Clear previous state
        this.state = {
            iteration: 0,
            runId: runId,
            currentGoal: null,
            intent: null,
            lastAction: null,
            lastResult: null,
            confidence: 0.5,
            cycleDetected: null
        }

        this.stepHistory = []
        this.currentRunCycles = []

        // Initialize services
        cycleDetectionService.startRun(runId)
        toolCacheService.clear()

        logger.agent.info('Enhanced agent loop initialized', { runId, config: this.config })
    }

    /**
     * Start processing a task with full Phase 2 capabilities
     */
    async processTask(
        runId: string,
        userRequest: string,
        tools: string[]
    ): Promise<AgentExecutionResult> {
        this.initialize(runId)

        logger.agent.info('Starting enhanced task processing', {
            request: userRequest.substring(0, 100),
            toolCount: tools.length
        })

        // Step 1: Classify intent
        const intent = intentClassificationService.classify(userRequest)
        this.state.intent = intent

        logger.agent.debug('Intent classified', {
            category: intent.category,
            confidence: intent.confidence.toFixed(2)
        })

        // Step 2: Create goal stack
        const stack = goalStackService.createStack(runId, userRequest)

        // Step 3: Decompose if needed based on intent
        if (intent.complexity === 'complex' || intent.complexity === 'medium') {
            const subgoals = goalStackService.decomposeGoal(runId, stack.rootGoalId)
            if (subgoals) {
                logger.agent.debug('Goal decomposed', {
                    subtaskCount: subgoals.length
                })
            }
        }

        // Step 4: Execute the goal stack
        return this.executeGoalStack(runId, stack, tools)
    }

    /**
     * Execute goals from the stack
     */
    private async executeGoalStack(
        runId: string,
        stack: GoalStack,
        tools: string[]
    ): Promise<AgentExecutionResult> {
        let cyclesDetected = 0
        let cacheHits = 0
        let adaptationsApplied = 0

        while (this.state.iteration < this.config.maxIterations) {
            this.state.iteration++

            // Get next goal to work on
            const goal = goalStackService.getNextGoal(runId)
            if (!goal) {
                // Check if root goal is completed
                const rootGoal = stack.goals.get(stack.rootGoalId)
                if (rootGoal?.status === 'completed') {
                    logger.agent.info('All goals completed')
                    break
                }

                // No more pending goals, but root not complete - issue
                logger.agent.warn('No pending goals but root not complete')
                break
            }

            // Start working on this goal
            goalStackService.startGoal(runId, goal.id)
            this.state.currentGoal = goal

            // Check for cycles
            if (this.config.enableCycleDetection) {
                const cycle = cycleDetectionService.recordState(
                    this.state.lastAction ? [this.state.lastAction] : [],
                    goal.context.relevantFiles,
                    goal.description
                )

                if (cycle) {
                    this.state.cycleDetected = cycle
                    this.currentRunCycles.push(cycle)
                    cyclesDetected++

                    logger.agent.warn('Cycle detected', {
                        type: cycle.type,
                        iterations: cycle.iterations,
                        severity: cycle.severity
                    })

                    // Record step
                    this.stepHistory.push({
                        type: 'correct',
                        action: 'cycle_break',
                        params: { strategy: cycle.suggestedAction },
                        confidence: cycle.severity === 'high' ? 0.3 : 0.5,
                        reasoning: `Cycle detected: ${cycle.type} at iterations ${cycle.iterations.join(',')}. Suggested action: ${cycle.suggestedAction.type}`
                    })

                    // Handle high severity cycles
                    if (cycle.severity === 'high') {
                        goalStackService.failGoal(runId, goal.id, 'Cycle detected - high severity')
                        continue
                    }
                }
            }

            // Plan the next step
            const step = await this.planStep(goal, tools)
            this.stepHistory.push(step)

            // Check cache for read operations
            if (this.config.enableCaching && step.action === 'readFile') {
                const filePath = step.params?.filePath as string
                if (filePath) {
                    const cacheKey = toolCacheService.generateKey(step.action, { filePath })
                    const cached = toolCacheService.get<string>(cacheKey)
                    if (cached !== undefined) {
                        cacheHits++
                        this.state.lastResult = cached
                        this.state.confidence = 0.9
                        goalStackService.completeGoal(runId, goal.id, { cached: true, content: cached })
                        continue
                    }
                }
            }

            // Get tool call request with confidence
            const toolRequest = this.prepareToolCall(step, tools)

            // Apply learning adaptations
            let adaptation: AdaptationSuggestion | null = null
            if (this.config.enableLearning && this.state.lastAction) {
                const lastResult = this.state.lastResult as { success?: boolean; error?: { type?: string; message?: string } }
                if (lastResult && !lastResult.success && lastResult.error) {
                    adaptation = learningService.getAdaptiveToolSelection(
                        this.state.lastAction,
                        {
                            type: lastResult.error.type || 'unknown',
                            message: lastResult.error.message || 'Unknown error'
                        }
                    )

                    if (adaptation) {
                        adaptationsApplied++
                        logger.agent.info('Learning adaptation applied', {
                            from: adaptation.originalApproach,
                            to: adaptation.suggestedApproach
                        })
                    }
                }
            }

            // Update state
            this.state.lastAction = step.action
            this.state.confidence = toolRequest.confidence.score

            // Check for completion
            if (step.type === 'complete') {
                goalStackService.completeGoal(runId, goal.id, { completed: true, reasoning: step.reasoning })
                break
            }

            // Simulate execution result (in real implementation, this would call the actual tool)
            const executionResult = await this.simulateExecution(toolRequest, adaptation)
            this.state.lastResult = executionResult

            // Record execution in confidence scoring
            confidenceScoringService.recordExecution(
                {
                    toolName: toolRequest.tool,
                    params: toolRequest.params,
                    fileExtension: toolRequest.params.filePath ?
                        String(toolRequest.params.filePath).split('.').pop() : undefined
                },
                {
                    success: executionResult.success,
                    duration: executionResult.duration,
                    error: executionResult.error,
                    cancelled: executionResult.cancelled
                }
            )

            // Handle result
            if (executionResult.success) {
                // Cache successful read operations
                if (this.config.enableCaching && step.action === 'readFile' && step.params?.filePath) {
                    const filePath = step.params.filePath as string
                    const cacheKey = toolCacheService.generateKey(step.action, { filePath })
                    toolCacheService.set(cacheKey, executionResult.result, [filePath])
                }

                goalStackService.completeGoal(runId, goal.id, {
                    success: true,
                    result: executionResult.result
                })
            } else {
                goalStackService.failGoal(runId, goal.id, executionResult.error || 'Unknown error')

                // Record correction for learning
                if (this.config.enableLearning) {
                    learningService.recordCorrection({
                        originalError: {
                            type: 'tool_execution_failed',
                            message: executionResult.error || 'Unknown error',
                            filePath: goal.context.relevantFiles[0]
                        },
                        attemptedFix: {
                            toolName: toolRequest.tool,
                            params: toolRequest.params,
                            description: step.reasoning
                        },
                        outcome: 'failure',
                        context: {
                            language: goal.metadata.estimatedComplexity ? 'complex' : undefined,
                            fileType: goal.context.relevantFiles[0]?.split('.').pop(),
                            taskCategory: this.state.intent?.category,
                            relatedFiles: goal.context.relevantFiles
                        },
                        learningTags: ['execution_failure', this.state.intent?.category || 'unknown']
                    })
                }
            }
        }

        // Get final cycles
        const allCycles = cycleDetectionService.endRun()

        // Check completion status
        const currentStack = goalStackService.getStack(runId)
        const rootGoal = currentStack?.goals.get(currentStack.rootGoalId)
        const allGoalsCompleted = rootGoal?.status === 'completed'

        return {
            success: allGoalsCompleted,
            steps: this.stepHistory,
            iterationsUsed: this.state.iteration,
            finalState: { ...this.state },
            cyclesDetected: allCycles,
            cacheHits,
            adaptationsApplied
        }
    }

    /**
     * Plan the next step based on current goal
     */
    private async planStep(goal: Goal, tools: string[]): Promise<AgentStep> {
        // Get best tool based on confidence
        const bestTool = confidenceScoringService.getBestTool(
            tools.filter(t => !['approve', 'reject'].includes(t)),
            { taskCategory: this.state.intent?.category }
        )

        if (!bestTool) {
            return {
                type: 'complete',
                action: 'complete',
                confidence: 0.5,
                reasoning: 'No suitable tool found'
            }
        }

        return {
            type: 'execute',
            action: bestTool.tool,
            params: { goalId: goal.id, filePath: goal.context.relevantFiles[0] },
            confidence: bestTool.confidence.score,
            reasoning: `Selected ${bestTool.tool} based on confidence score ${bestTool.confidence.score.toFixed(2)}: ${bestTool.confidence.reason}`
        }
    }

    /**
     * Prepare tool call with confidence scoring
     */
    private prepareToolCall(step: AgentStep, tools: string[]): ToolCallRequest {
        const confidence = confidenceScoringService.calculateConfidence(
            step.action,
            { taskCategory: this.state.intent?.category }
        )

        const autoApproval = confidenceScoringService.shouldAutoApprove(
            step.action,
            step.params || {},
            this.config.autoApproveThreshold
        )

        // Get alternative suggestions if confidence is low
        let alternatives: ToolCallRequest['alternatives']
        if (confidence.score < 0.7) {
            alternatives = confidenceScoringService.getAdaptiveSuggestions(
                step.action,
                { taskCategory: this.state.intent?.category },
                tools
            )
        }

        return {
            tool: step.action,
            params: step.params || {},
            confidence,
            shouldAutoApprove: autoApproval.approved,
            alternatives
        }
    }

    /**
     * Simulate execution (placeholder for actual tool execution)
     */
    private async simulateExecution(
        request: ToolCallRequest,
        _adaptation: AdaptationSuggestion | null
    ): Promise<{ success: boolean; duration: number; error?: string; result?: unknown; cancelled?: boolean }> {
        // This is a simulation - in real implementation, call actual tools
        const duration = Math.floor(Math.random() * 1000) + 500

        // Simulate success/failure based on confidence
        const success = Math.random() < request.confidence.score

        await this.delay(duration)

        if (success) {
            return {
                success: true,
                duration,
                result: { message: 'Operation completed successfully' }
            }
        } else {
            return {
                success: false,
                duration,
                error: `Tool ${request.tool} failed with confidence ${request.confidence.score.toFixed(2)}`
            }
        }
    }

    /**
     * Get current state
     */
    getState(): AgentState {
        return { ...this.state }
    }

    /**
     * Get step history
     */
    getStepHistory(): AgentStep[] {
        return [...this.stepHistory]
    }

    /**
     * Get performance metrics
     */
    getMetrics(): {
        iterations: number
        cacheHitRate: number
        cycleDetectionCount: number
        averageConfidence: number
        learningStats: ReturnType<typeof learningService.getStatistics>
    } {
        const confidenceScores = this.stepHistory.map(s => s.confidence)
        const avgConfidence = confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0

        return {
            iterations: this.state.iteration,
            cacheHitRate: toolCacheService.getHitRate(),
            cycleDetectionCount: this.currentRunCycles.length,
            averageConfidence: avgConfidence,
            learningStats: learningService.getStatistics()
        }
    }

    /**
     * Reset the service
     */
    reset(): void {
        this.initialize('reset')
        learningService.reset()
        logger.agent.info('Enhanced agent loop reset')
    }

    // --- Private helpers ---

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export const enhancedAgentLoopService = new EnhancedAgentLoopService()
