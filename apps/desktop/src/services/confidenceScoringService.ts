/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Confidence Scoring Service - Tool Success Tracking & Adaptive Learning
 * 
 * Tracks tool success rates and implements confidence scoring for suggestions.
 * Enables adaptive tool selection based on historical performance.
 */

import { logger } from '../utils/logger'

export interface ToolPerformance {
    toolName: string
    totalUses: number
    successes: number
    failures: number
    cancellations: number
    averageDuration: number
    lastUsed: number
    successRate: number
    confidence: number  // 0-1 calculated score
}

export interface ToolContext {
    toolName: string
    params: Record<string, unknown>
    fileExtension?: string
    taskCategory?: string
    workspaceType?: string
}

export interface ToolExecutionResult {
    success: boolean
    duration: number
    error?: string
    cancelled?: boolean
}

export interface ConfidenceScore {
    score: number  // 0-1
    factors: {
        historicalSuccess: number
        contextMatch: number
        complexity: number
        recency: number
    }
    recommended: boolean
    reason: string
}

interface ToolHistoryEntry {
    timestamp: number
    context: ToolContext
    result: ToolExecutionResult
}

class ConfidenceScoringService {
    private toolPerformance = new Map<string, ToolPerformance>()
    private toolHistory = new Map<string, ToolHistoryEntry[]>()
    private maxHistoryPerTool = 100

    /**
     * Record a tool execution result
     */
    recordExecution(context: ToolContext, result: ToolExecutionResult): void {
        const { toolName } = context

        // Update performance metrics
        let perf = this.toolPerformance.get(toolName)
        if (!perf) {
            perf = {
                toolName,
                totalUses: 0,
                successes: 0,
                failures: 0,
                cancellations: 0,
                averageDuration: 0,
                lastUsed: Date.now(),
                successRate: 0,
                confidence: 0.5  // Start with neutral confidence
            }
            this.toolPerformance.set(toolName, perf)
        }

        // Update stats
        perf.totalUses++
        perf.lastUsed = Date.now()

        if (result.cancelled) {
            perf.cancellations++
        } else if (result.success) {
            perf.successes++
        } else {
            perf.failures++
        }

        // Update average duration
        perf.averageDuration = (perf.averageDuration * (perf.totalUses - 1) + result.duration) / perf.totalUses

        // Recalculate success rate
        const completedExecutions = perf.successes + perf.failures
        if (completedExecutions > 0) {
            perf.successRate = perf.successes / completedExecutions
        }

        // Update confidence score
        perf.confidence = this.calculateToolConfidence(perf)

        // Store in history
        let history = this.toolHistory.get(toolName)
        if (!history) {
            history = []
            this.toolHistory.set(toolName, history)
        }

        history.push({
            timestamp: Date.now(),
            context,
            result
        })

        // Trim history if needed
        if (history.length > this.maxHistoryPerTool) {
            history.shift()
        }

        logger.agent.debug('Tool execution recorded', {
            toolName,
            success: result.success,
            successRate: perf.successRate.toFixed(2),
            confidence: perf.confidence.toFixed(2)
        })
    }

    /**
     * Calculate confidence for a specific tool usage
     */
    calculateConfidence(toolName: string, context?: Partial<ToolContext>): ConfidenceScore {
        const perf = this.toolPerformance.get(toolName)
        
        if (!perf || perf.totalUses < 3) {
            return {
                score: 0.5,
                factors: {
                    historicalSuccess: 0.5,
                    contextMatch: 0.5,
                    complexity: 0.5,
                    recency: 0.5
                },
                recommended: true,
                reason: 'Insufficient data - neutral confidence'
            }
        }

        const factors = {
            historicalSuccess: perf.successRate,
            contextMatch: this.calculateContextMatch(toolName, context),
            complexity: this.calculateComplexityScore(toolName),
            recency: this.calculateRecencyScore(perf.lastUsed)
        }

        // Weighted average of factors
        const score = (
            factors.historicalSuccess * 0.4 +
            factors.contextMatch * 0.3 +
            factors.complexity * 0.2 +
            factors.recency * 0.1
        )

        // Determine recommendation
        let recommended = score >= 0.6
        let reason = ''

        if (score >= 0.8) {
            reason = 'High confidence based on strong historical performance'
        } else if (score >= 0.6) {
            reason = 'Moderate confidence - tool has performed well'
        } else if (score >= 0.4) {
            reason = 'Low confidence - mixed results or insufficient data'
            recommended = false
        } else {
            reason = 'Very low confidence - tool has poor track record'
            recommended = false
        }

        return {
            score,
            factors,
            recommended,
            reason
        }
    }

    /**
     * Get best tool for a task based on confidence scores
     */
    getBestTool(candidates: string[], context?: Partial<ToolContext>): {
        tool: string
        confidence: ConfidenceScore
    } | null {
        if (candidates.length === 0) return null

        let bestTool = candidates[0]
        let bestConfidence = this.calculateConfidence(bestTool, context)

        for (const tool of candidates.slice(1)) {
            const confidence = this.calculateConfidence(tool, context)
            if (confidence.score > bestConfidence.score) {
                bestTool = tool
                bestConfidence = confidence
            }
        }

        return {
            tool: bestTool,
            confidence: bestConfidence
        }
    }

    /**
     * Get performance stats for all tools
     */
    getAllPerformance(): ToolPerformance[] {
        return Array.from(this.toolPerformance.values())
            .sort((a, b) => b.confidence - a.confidence)
    }

    /**
     * Get performance for a specific tool
     */
    getToolPerformance(toolName: string): ToolPerformance | undefined {
        return this.toolPerformance.get(toolName)
    }

    /**
     * Get tool recommendations for a task
     */
    getRecommendations(
        taskDescription: string,
        availableTools: string[],
        topN: number = 3
    ): Array<{ tool: string; confidence: ConfidenceScore }> {
        const scored = availableTools.map(tool => ({
            tool,
            confidence: this.calculateConfidence(tool, { taskCategory: taskDescription })
        }))

        return scored
            .sort((a, b) => b.confidence.score - a.confidence.score)
            .slice(0, topN)
    }

    /**
     * Check if auto-approval should be granted
     */
    shouldAutoApprove(
        toolName: string,
        _params: Record<string, unknown>,
        threshold: number = 0.8
    ): { approved: boolean; reason: string } {
        const confidence = this.calculateConfidence(toolName)

        // Check for destructive operations
        const destructiveTools = ['delete', 'writeFile', 'replaceInFile']
        const isDestructive = destructiveTools.includes(toolName)

        if (isDestructive) {
            return {
                approved: false,
                reason: 'Destructive operation requires manual approval'
            }
        }

        if (confidence.score >= threshold && confidence.recommended) {
            return {
                approved: true,
                reason: `High confidence (${(confidence.score * 100).toFixed(0)}%) based on historical performance`
            }
        }

        return {
            approved: false,
            reason: `Low confidence (${(confidence.score * 100).toFixed(0)}%) - requires manual approval`
        }
    }

    /**
     * Get adaptive tool suggestions based on context
     */
    getAdaptiveSuggestions(
        currentTool: string,
        context: Partial<ToolContext>,
        alternatives: string[]
    ): Array<{ tool: string; confidence: ConfidenceScore; reason: string }> {
        const currentConfidence = this.calculateConfidence(currentTool, context)
        
        if (currentConfidence.score >= 0.7) {
            // Current tool is good, no need for alternatives
            return []
        }

        // Score alternatives
        const scored = alternatives
            .filter(tool => tool !== currentTool)
            .map(tool => ({
                tool,
                confidence: this.calculateConfidence(tool, context),
                reason: ''
            }))
            .filter(item => item.confidence.score > currentConfidence.score)
            .sort((a, b) => b.confidence.score - a.confidence.score)
            .slice(0, 2)

        // Add reasons
        return scored.map(item => ({
            ...item,
            reason: `Better historical success rate (${(item.confidence.score * 100).toFixed(0)}% vs ${(currentConfidence.score * 100).toFixed(0)}%)`
        }))
    }

    /**
     * Export performance data
     */
    exportData(): {
        performance: ToolPerformance[]
        summary: {
            totalExecutions: number
            overallSuccessRate: number
            topPerformingTools: string[]
            problematicTools: string[]
        }
    } {
        const performance = this.getAllPerformance()
        const totalExecutions = performance.reduce((sum, p) => sum + p.totalUses, 0)
        const totalSuccesses = performance.reduce((sum, p) => sum + p.successes, 0)
        const overallSuccessRate = totalExecutions > 0 ? totalSuccesses / totalExecutions : 0

        return {
            performance,
            summary: {
                totalExecutions,
                overallSuccessRate,
                topPerformingTools: performance
                    .filter(p => p.confidence >= 0.8)
                    .map(p => p.toolName),
                problematicTools: performance
                    .filter(p => p.confidence < 0.5 && p.totalUses >= 5)
                    .map(p => p.toolName)
            }
        }
    }

    /**
     * Import performance data
     */
    importData(data: { performance: ToolPerformance[] }): void {
        for (const perf of data.performance) {
            this.toolPerformance.set(perf.toolName, perf)
        }
        logger.agent.info('Performance data imported', { toolCount: data.performance.length })
    }

    /**
     * Reset all statistics
     */
    reset(): void {
        this.toolPerformance.clear()
        this.toolHistory.clear()
        logger.agent.info('Confidence scoring data reset')
    }

    // --- Private methods ---

    private calculateToolConfidence(perf: ToolPerformance): number {
        // Base confidence from success rate
        let confidence = perf.successRate

        // Adjust for sample size (small samples = less confident)
        const sampleSizeFactor = Math.min(perf.totalUses / 20, 1) // Max confidence at 20+ uses
        confidence = confidence * sampleSizeFactor + 0.5 * (1 - sampleSizeFactor)

        // Penalize recent cancellations
        if (perf.cancellations > 0) {
            const cancellationRate = perf.cancellations / perf.totalUses
            confidence *= (1 - cancellationRate * 0.3)  // Up to 30% penalty
        }

        return Math.max(0.1, Math.min(0.95, confidence))
    }

    private calculateContextMatch(toolName: string, context?: Partial<ToolContext>): number {
        if (!context) return 0.5

        const history = this.toolHistory.get(toolName)
        if (!history || history.length === 0) return 0.5

        // Check recent executions with similar context
        const recentHistory = history.slice(-20)
        let matchingContexts = 0

        for (const entry of recentHistory) {
            let matchScore = 0
            let factors = 0

            if (context.fileExtension && entry.context.fileExtension) {
                factors++
                if (context.fileExtension === entry.context.fileExtension) {
                    matchScore++
                }
            }

            if (context.taskCategory && entry.context.taskCategory) {
                factors++
                if (context.taskCategory === entry.context.taskCategory) {
                    matchScore++
                }
            }

            if (factors > 0 && matchScore / factors >= 0.5) {
                matchingContexts++
            }
        }

        return matchingContexts / recentHistory.length
    }

    private calculateComplexityScore(toolName: string): number {
        const perf = this.toolPerformance.get(toolName)
        if (!perf) return 0.5

        // Higher average duration = more complex = potentially less reliable
        const durationScore = Math.max(0, 1 - (perf.averageDuration / 10000))  // Penalize if avg > 10s

        return durationScore
    }

    private calculateRecencyScore(lastUsed: number): number {
        const hoursSinceLastUse = (Date.now() - lastUsed) / (1000 * 60 * 60)
        
        // Recent use = higher confidence
        if (hoursSinceLastUse < 1) return 1.0
        if (hoursSinceLastUse < 24) return 0.9
        if (hoursSinceLastUse < 168) return 0.8  // 1 week
        if (hoursSinceLastUse < 720) return 0.7  // 1 month
        return 0.6
    }
}

export const confidenceScoringService = new ConfidenceScoringService()
