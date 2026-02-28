/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Goal Stack Service - Hierarchical Task Planning
 * 
 * Implements a goal stack architecture for complex task decomposition.
 * Enables the agent to break down complex tasks into manageable subtasks
 * and track progress through hierarchical goal structures.
 */

import { logger } from '../utils/logger'

export type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
export type GoalType = 'root' | 'composite' | 'atomic' | 'alternative' | 'retry'

export interface Goal {
    id: string
    parentId: string | null
    type: GoalType
    description: string
    status: GoalStatus
    children: string[]
    dependencies: string[]  // Goal IDs that must complete before this goal
    createdAt: number
    startedAt?: number
    completedAt?: number
    metadata: {
        estimatedComplexity?: number  // 1-10 scale
        estimatedIterations?: number
        actualIterations?: number
        toolPreference?: string[]
        maxRetries?: number
        retryCount?: number
    }
    context: {
        relevantFiles: string[]
        notes: string[]
        partialResults: any
    }
}

export interface GoalStack {
    rootGoalId: string
    goals: Map<string, Goal>
    currentGoalId: string | null
    completedGoalIds: string[]
    failedGoalIds: string[]
}

export interface Plan {
    id: string
    description: string
    rootGoal: Goal
    goals: Goal[]
    createdAt: number
    estimatedComplexity: number
}

export interface DecompositionStrategy {
    name: string
    canHandle: (goal: Goal) => boolean
    decompose: (goal: Goal) => Goal[]
}

class GoalStackService {
    private stacks = new Map<string, GoalStack>()
    private decompositionStrategies: DecompositionStrategy[] = []

    constructor() {
        this.registerDefaultStrategies()
    }

    /**
     * Create a new goal stack for a task
     */
    createStack(runId: string, rootDescription: string): GoalStack {
        const rootGoal: Goal = {
            id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            parentId: null,
            type: 'root',
            description: rootDescription,
            status: 'pending',
            children: [],
            dependencies: [],
            createdAt: Date.now(),
            metadata: {
                estimatedComplexity: this.estimateComplexity(rootDescription)
            },
            context: {
                relevantFiles: [],
                notes: [],
                partialResults: null
            }
        }

        const stack: GoalStack = {
            rootGoalId: rootGoal.id,
            goals: new Map([[rootGoal.id, rootGoal]]),
            currentGoalId: null,
            completedGoalIds: [],
            failedGoalIds: []
        }

        this.stacks.set(runId, stack)
        logger.agent.debug('Goal stack created', { runId, rootGoalId: rootGoal.id })
        
        return stack
    }

    /**
     * Get a goal stack by run ID
     */
    getStack(runId: string): GoalStack | undefined {
        return this.stacks.get(runId)
    }

    /**
     * Add a subgoal to a parent goal
     */
    addSubgoal(
        runId: string,
        parentId: string,
        description: string,
        type: GoalType = 'atomic',
        dependencies: string[] = []
    ): Goal | null {
        const stack = this.stacks.get(runId)
        if (!stack) return null

        const parent = stack.goals.get(parentId)
        if (!parent) return null

        const goal: Goal = {
            id: `goal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            parentId,
            type,
            description,
            status: 'pending',
            children: [],
            dependencies,
            createdAt: Date.now(),
            metadata: {
                estimatedComplexity: this.estimateComplexity(description)
            },
            context: {
                relevantFiles: [...parent.context.relevantFiles],
                notes: [],
                partialResults: null
            }
        }

        stack.goals.set(goal.id, goal)
        parent.children.push(goal.id)

        logger.agent.debug('Subgoal added', { runId, goalId: goal.id, parentId })
        return goal
    }

    /**
     * Decompose a goal using registered strategies
     */
    decomposeGoal(runId: string, goalId: string): Goal[] | null {
        const stack = this.stacks.get(runId)
        if (!stack) return null

        const goal = stack.goals.get(goalId)
        if (!goal) return null

        // Find applicable strategy
        for (const strategy of this.decompositionStrategies) {
            if (strategy.canHandle(goal)) {
                const subgoals = strategy.decompose(goal)
                
                // Add subgoals to stack
                for (const subgoal of subgoals) {
                    subgoal.parentId = goalId
                    stack.goals.set(subgoal.id, subgoal)
                    goal.children.push(subgoal.id)
                }

                goal.type = 'composite'
                logger.agent.debug('Goal decomposed', { 
                    runId, 
                    goalId, 
                    strategy: strategy.name,
                    subgoals: subgoals.length 
                })

                return subgoals
            }
        }

        return null
    }

    /**
     * Get the next goal to work on
     */
    getNextGoal(runId: string): Goal | null {
        const stack = this.stacks.get(runId)
        if (!stack) return null

        // Find pending goals with satisfied dependencies
        for (const [_, goal] of stack.goals) {
            if (goal.status !== 'pending') continue

            // Check dependencies
            const depsSatisfied = goal.dependencies.every(depId => {
                const dep = stack.goals.get(depId)
                return dep?.status === 'completed'
            })

            if (depsSatisfied) {
                return goal
            }
        }

        return null
    }

    /**
     * Start working on a goal
     */
    startGoal(runId: string, goalId: string): boolean {
        const stack = this.stacks.get(runId)
        if (!stack) return false

        const goal = stack.goals.get(goalId)
        if (!goal || goal.status !== 'pending') return false

        goal.status = 'in_progress'
        goal.startedAt = Date.now()
        stack.currentGoalId = goalId

        logger.agent.debug('Goal started', { runId, goalId })
        return true
    }

    /**
     * Complete a goal
     */
    completeGoal(runId: string, goalId: string, result?: any): boolean {
        const stack = this.stacks.get(runId)
        if (!stack) return false

        const goal = stack.goals.get(goalId)
        if (!goal || goal.status !== 'in_progress') return false

        goal.status = 'completed'
        goal.completedAt = Date.now()
        goal.context.partialResults = result
        stack.completedGoalIds.push(goalId)

        // Update parent progress
        if (goal.parentId) {
            this.updateParentStatus(runId, goal.parentId)
        }

        logger.agent.debug('Goal completed', { runId, goalId })
        return true
    }

    /**
     * Mark a goal as failed
     */
    failGoal(runId: string, goalId: string, error?: string): boolean {
        const stack = this.stacks.get(runId)
        if (!stack) return false

        const goal = stack.goals.get(goalId)
        if (!goal) return false

        goal.status = 'failed'
        goal.completedAt = Date.now()
        if (error) {
            goal.context.notes.push(`Error: ${error}`)
        }
        stack.failedGoalIds.push(goalId)

        // Check if we should retry
        if (goal.metadata.retryCount && goal.metadata.maxRetries) {
            if (goal.metadata.retryCount < goal.metadata.maxRetries) {
                this.createRetryGoal(runId, goal)
            }
        }

        logger.agent.debug('Goal failed', { runId, goalId, error })
        return true
    }

    /**
     * Skip a goal (with optional reason)
     */
    skipGoal(runId: string, goalId: string, reason?: string): boolean {
        const stack = this.stacks.get(runId)
        if (!stack) return false

        const goal = stack.goals.get(goalId)
        if (!goal || goal.status !== 'pending') return false

        goal.status = 'skipped'
        if (reason) {
            goal.context.notes.push(`Skipped: ${reason}`)
        }

        logger.agent.debug('Goal skipped', { runId, goalId, reason })
        return true
    }

    /**
     * Get goal hierarchy for display
     */
    getGoalHierarchy(runId: string, goalId?: string): any {
        const stack = this.stacks.get(runId)
        if (!stack) return null

        const targetId = goalId || stack.rootGoalId
        const goal = stack.goals.get(targetId)
        if (!goal) return null

        return {
            ...goal,
            children: goal.children.map(childId => this.getGoalHierarchy(runId, childId))
        }
    }

    /**
     * Get stack statistics
     */
    getStackStats(runId: string): {
        total: number
        pending: number
        inProgress: number
        completed: number
        failed: number
        skipped: number
        progress: number
    } | null {
        const stack = this.stacks.get(runId)
        if (!stack) return null

        const stats = {
            total: stack.goals.size,
            pending: 0,
            inProgress: 0,
            completed: 0,
            failed: 0,
            skipped: 0,
            progress: 0
        }

        for (const [_, goal] of stack.goals) {
            switch (goal.status) {
                case 'pending': stats.pending++; break
                case 'in_progress': stats.inProgress++; break
                case 'completed': stats.completed++; break
                case 'failed': stats.failed++; break
                case 'skipped': stats.skipped++; break
            }
        }

        if (stats.total > 0) {
            stats.progress = Math.round((stats.completed / stats.total) * 100)
        }

        return stats
    }

    /**
     * Register a decomposition strategy
     */
    registerDecompositionStrategy(strategy: DecompositionStrategy): void {
        this.decompositionStrategies.push(strategy)
    }

    /**
     * Clean up completed stacks
     */
    cleanup(maxAgeMs: number = 3600000): void { // 1 hour default
        const cutoff = Date.now() - maxAgeMs
        for (const [runId, stack] of this.stacks) {
            const rootGoal = stack.goals.get(stack.rootGoalId)
            if (rootGoal?.createdAt && rootGoal.createdAt < cutoff) {
                this.stacks.delete(runId)
            }
        }
    }

    // --- Private methods ---

    private registerDefaultStrategies(): void {
        // Strategy: File modification task decomposition
        this.registerDecompositionStrategy({
            name: 'file_modification',
            canHandle: (goal) => {
                const desc = goal.description.toLowerCase()
                return desc.includes('modify') || desc.includes('edit') || 
                       desc.includes('update') || desc.includes('change')
            },
            decompose: (goal) => {
                return [
                    {
                        id: `sub-${Date.now()}-1`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Read and understand current implementation`,
                        status: 'pending',
                        children: [],
                        dependencies: [],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: 2 },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    },
                    {
                        id: `sub-${Date.now()}-2`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Apply modifications: ${goal.description}`,
                        status: 'pending',
                        children: [],
                        dependencies: [`sub-${Date.now()}-1`],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: goal.metadata.estimatedComplexity },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    },
                    {
                        id: `sub-${Date.now()}-3`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Verify changes work correctly`,
                        status: 'pending',
                        children: [],
                        dependencies: [`sub-${Date.now()}-2`],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: 2 },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    }
                ]
            }
        })

        // Strategy: Multi-file refactoring
        this.registerDecompositionStrategy({
            name: 'multi_file_refactor',
            canHandle: (goal) => {
                const desc = goal.description.toLowerCase()
                return (desc.includes('refactor') || desc.includes('rename')) &&
                       (desc.includes('files') || desc.includes('multiple'))
            },
            decompose: (goal) => {
                return [
                    {
                        id: `sub-${Date.now()}-1`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Identify all files to be modified`,
                        status: 'pending',
                        children: [],
                        dependencies: [],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: 3 },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    },
                    {
                        id: `sub-${Date.now()}-2`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Apply changes to each file`,
                        status: 'pending',
                        children: [],
                        dependencies: [`sub-${Date.now()}-1`],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: 5 },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    },
                    {
                        id: `sub-${Date.now()}-3`,
                        parentId: goal.id,
                        type: 'atomic',
                        description: `Run tests to verify nothing broke`,
                        status: 'pending',
                        children: [],
                        dependencies: [`sub-${Date.now()}-2`],
                        createdAt: Date.now(),
                        metadata: { estimatedComplexity: 3 },
                        context: { relevantFiles: [], notes: [], partialResults: null }
                    }
                ]
            }
        })
    }

    private estimateComplexity(description: string): number {
        // Simple heuristic for complexity estimation
        let complexity = 5 // Default medium complexity
        
        const desc = description.toLowerCase()
        
        // Reduce complexity for simple tasks
        if (desc.includes('fix typo') || desc.includes('add comment')) complexity = 2
        else if (desc.includes('rename') || desc.includes('extract')) complexity = 3
        else if (desc.includes('implement') || desc.includes('create')) complexity = 7
        else if (desc.includes('refactor') || desc.includes('redesign')) complexity = 8
        else if (desc.includes('architecture') || desc.includes('migrate')) complexity = 10
        
        return complexity
    }

    private updateParentStatus(runId: string, parentId: string): void {
        const stack = this.stacks.get(runId)
        if (!stack) return

        const parent = stack.goals.get(parentId)
        if (!parent) return

        // Check if all children are completed
        const allCompleted = parent.children.every(childId => {
            const child = stack.goals.get(childId)
            return child?.status === 'completed' || child?.status === 'skipped'
        })

        if (allCompleted) {
            this.completeGoal(runId, parentId)
        }
    }

    private createRetryGoal(runId: string, failedGoal: Goal): Goal {
        const stack = this.stacks.get(runId)
        if (!stack) throw new Error('Stack not found')

        const retryGoal: Goal = {
            id: `retry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            parentId: failedGoal.parentId,
            type: 'retry',
            description: `Retry: ${failedGoal.description}`,
            status: 'pending',
            children: [],
            dependencies: [],
            createdAt: Date.now(),
            metadata: {
                ...failedGoal.metadata,
                retryCount: (failedGoal.metadata.retryCount || 0) + 1
            },
            context: {
                ...failedGoal.context,
                notes: [...failedGoal.context.notes, `Retry attempt ${(failedGoal.metadata.retryCount || 0) + 1}`]
            }
        }

        stack.goals.set(retryGoal.id, retryGoal)
        
        if (failedGoal.parentId) {
            const parent = stack.goals.get(failedGoal.parentId)
            if (parent) {
                parent.children.push(retryGoal.id)
            }
        }

        return retryGoal
    }
}

export const goalStackService = new GoalStackService()
