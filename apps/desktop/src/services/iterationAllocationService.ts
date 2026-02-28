/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Dynamic Iteration Allocation Service
 * 
 * Dynamically allocates iteration budget based on task complexity,
progress, and confidence scores. Adapts to task needs in real-time.
 */

import { logger } from '../utils/logger'
import { taskComplexityService, type ComplexityLevel } from './taskComplexityService'

export interface IterationBudget {
    total: number
    used: number
    remaining: number
    allocated: number
    bonus: number
}

export interface AllocationConfig {
    baseIterations: number
    minIterations: number
    maxIterations: number
    bonusThreshold: number
    compressionFactor: number
}

export interface ProgressMetrics {
    iteration: number
    successRate: number
    confidence: number
    complexity: ComplexityLevel
    stagnationCount: number
}

export interface AllocationDecision {
    shouldContinue: boolean
    newBudget: number
    reason: string
    confidence: number
}

class IterationAllocationService {
    private config: AllocationConfig = {
        baseIterations: 25,
        minIterations: 5,
        maxIterations: 50,
        bonusThreshold: 0.8,
        compressionFactor: 0.8
    }

    private budgets = new Map<string, IterationBudget>()

    /**
     * Initialize the service
     */
    initialize(config?: Partial<AllocationConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        logger.agent.info('Iteration allocation service initialized', this.config)
    }

    /**
     * Allocate initial budget for a task
     */
    allocateInitialBudget(
        runId: string,
        taskText: string,
        context?: { files?: string[] }
    ): IterationBudget {
        // Estimate complexity
        const complexity = taskComplexityService.estimate(taskText, context)
        
        // Calculate base budget from complexity
        let baseBudget = complexity.estimatedIterations
        
        // Apply bounds
        baseBudget = Math.max(this.config.minIterations, 
            Math.min(this.config.maxIterations, baseBudget))

        const budget: IterationBudget = {
            total: baseBudget,
            used: 0,
            remaining: baseBudget,
            allocated: baseBudget,
            bonus: 0
        }

        this.budgets.set(runId, budget)

        logger.agent.info('Initial iteration budget allocated', {
            runId,
            total: budget.total,
            complexity: complexity.level
        })

        return budget
    }

    /**
     * Check and potentially adjust budget based on progress
     */
    checkAndAdjust(runId: string, metrics: ProgressMetrics): AllocationDecision {
        const budget = this.budgets.get(runId)
        if (!budget) {
            return {
                shouldContinue: false,
                newBudget: 0,
                reason: 'No budget found for run',
                confidence: 0
            }
        }

        // Update used iterations
        budget.used = metrics.iteration
        budget.remaining = budget.total - budget.used

        // Check if we've exceeded budget
        if (budget.remaining <= 0 && budget.bonus <= 0) {
            // Consider granting bonus iterations
            const bonusDecision = this.considerBonus(runId, metrics)
            if (bonusDecision.grant) {
                budget.bonus = bonusDecision.amount
                budget.total += bonusDecision.amount
                budget.remaining = bonusDecision.amount
                
                return {
                    shouldContinue: true,
                    newBudget: budget.total,
                    reason: `Bonus iterations granted: ${bonusDecision.reason}`,
                    confidence: bonusDecision.confidence
                }
            }

            return {
                shouldContinue: false,
                newBudget: budget.total,
                reason: 'Budget exhausted',
                confidence: 0.9
            }
        }

        // Check for early termination conditions
        const earlyStop = this.checkEarlyTermination(metrics)
        if (earlyStop.shouldStop) {
            return {
                shouldContinue: false,
                newBudget: budget.total,
                reason: earlyStop.reason,
                confidence: earlyStop.confidence
            }
        }

        // Consider budget compression if doing well
        if (metrics.successRate > this.config.bonusThreshold && 
            metrics.iteration > budget.total * 0.5) {
            const compressed = Math.floor(budget.total * this.config.compressionFactor)
            if (compressed >= metrics.iteration + 3) {  // Ensure at least 3 more iterations
                budget.total = compressed
                budget.remaining = compressed - budget.used
                
                return {
                    shouldContinue: true,
                    newBudget: budget.total,
                    reason: 'Budget compressed - task progressing well',
                    confidence: metrics.successRate
                }
            }
        }

        return {
            shouldContinue: true,
            newBudget: budget.total,
            reason: `Continuing with ${budget.remaining} iterations remaining`,
            confidence: metrics.confidence
        }
    }

    /**
     * Request additional budget
     */
    requestAdditionalBudget(
        runId: string,
        reason: string,
        requestedAmount: number
    ): { granted: boolean; amount: number; newTotal: number } {
        const budget = this.budgets.get(runId)
        if (!budget) {
            return { granted: false, amount: 0, newTotal: 0 }
        }

        // Limit additional budget
        const maxAdditional = Math.floor(this.config.maxIterations * 0.5)
        const granted = Math.min(requestedAmount, maxAdditional)

        budget.bonus += granted
        budget.total += granted
        budget.remaining += granted

        logger.agent.info('Additional budget granted', {
            runId,
            amount: granted,
            reason,
            newTotal: budget.total
        })

        return {
            granted: granted > 0,
            amount: granted,
            newTotal: budget.total
        }
    }

    /**
     * Get current budget for a run
     */
    getBudget(runId: string): IterationBudget | undefined {
        return this.budgets.get(runId)
    }

    /**
     * Get utilization statistics
     */
    getUtilization(runId: string): {
        used: number
        remaining: number
        utilizationRate: number
        efficiency: number
    } | undefined {
        const budget = this.budgets.get(runId)
        if (!budget) return undefined

        return {
            used: budget.used,
            remaining: budget.remaining,
            utilizationRate: budget.used / budget.total,
            efficiency: budget.used > 0 ? budget.allocated / budget.used : 0
        }
    }

    /**
     * Release budget for a completed run
     */
    releaseBudget(runId: string): void {
        this.budgets.delete(runId)
        logger.agent.debug('Budget released', { runId })
    }

    /**
     * Get all active budgets
     */
    getActiveBudgets(): Array<{ runId: string; budget: IterationBudget }> {
        return Array.from(this.budgets.entries()).map(([runId, budget]) => ({
            runId,
            budget
        }))
    }

    // --- Private methods ---

    private considerBonus(
        _runId: string,
        metrics: ProgressMetrics
    ): { grant: boolean; amount: number; reason: string; confidence: number } {
        // Don't grant bonus if stagnating
        if (metrics.stagnationCount > 3) {
            return {
                grant: false,
                amount: 0,
                reason: 'Too much stagnation',
                confidence: 0.3
            }
        }

        // Grant bonus if high confidence and recent success
        if (metrics.confidence > 0.7 && metrics.successRate > 0.6) {
            return {
                grant: true,
                amount: 5,
                reason: 'High confidence and good success rate',
                confidence: metrics.confidence
            }
        }

        // Grant smaller bonus if making some progress
        if (metrics.successRate > 0.4) {
            return {
                grant: true,
                amount: 3,
                reason: 'Moderate progress, small extension granted',
                confidence: 0.5
            }
        }

        return {
            grant: false,
            amount: 0,
            reason: 'Insufficient progress to justify bonus',
            confidence: 0.2
        }
    }

    private checkEarlyTermination(metrics: ProgressMetrics): {
        shouldStop: boolean
        reason: string
        confidence: number
    } {
        // Stop if too much stagnation
        if (metrics.stagnationCount > 5) {
            return {
                shouldStop: true,
                reason: 'Excessive stagnation detected',
                confidence: 0.9
            }
        }

        // Stop if confidence is very low
        if (metrics.confidence < 0.2 && metrics.iteration > 10) {
            return {
                shouldStop: true,
                reason: 'Very low confidence after significant iterations',
                confidence: 0.8
            }
        }

        // Stop if success rate is terrible
        if (metrics.successRate < 0.1 && metrics.iteration > 15) {
            return {
                shouldStop: true,
                reason: 'Extremely low success rate',
                confidence: 0.85
            }
        }

        return {
            shouldStop: false,
            reason: '',
            confidence: 0
        }
    }
}

export const iterationAllocationService = new IterationAllocationService()
