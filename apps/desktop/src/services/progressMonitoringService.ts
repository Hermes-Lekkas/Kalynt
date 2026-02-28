/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Progress Monitoring Service
 * 
 * Tracks and reports progress of agent tasks with detailed metrics,
visual indicators, and milestone tracking.
 */

import { logger } from '../utils/logger'

export interface ProgressState {
    runId: string
    status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
    currentIteration: number
    totalIterations: number
    currentGoal?: string
    completedGoals: string[]
    failedGoals: string[]
    startTime: number
    estimatedEndTime?: number
    percentComplete: number
}

export interface ProgressMetrics {
    iteration: number
    successCount: number
    failureCount: number
    toolUsage: Map<string, number>
    fileChanges: string[]
    errors: string[]
    warnings: string[]
    cycleDetections: number
}

export interface Milestone {
    id: string
    name: string
    description: string
    targetIteration: number
    completed: boolean
    completedAt?: number
}

export interface ProgressReport {
    state: ProgressState
    metrics: ProgressMetrics
    recentActivity: ActivityItem[]
    milestones: Milestone[]
    summary: {
        duration: number
        successRate: number
        toolsUsed: number
        filesModified: number
    }
}

export interface ActivityItem {
    timestamp: number
    type: 'tool_call' | 'goal_complete' | 'goal_fail' | 'cycle_detected' | 'error' | 'warning'
    description: string
    details?: Record<string, unknown>
}

type ProgressListener = (report: ProgressReport) => void

class ProgressMonitoringService {
    private states = new Map<string, ProgressState>()
    private metrics = new Map<string, ProgressMetrics>()
    private activities = new Map<string, ActivityItem[]>()
    private milestones = new Map<string, Milestone[]>()
    private listeners: ProgressListener[] = []

    /**
     * Initialize progress tracking for a run
     */
    startRun(runId: string, totalIterations: number, goals?: string[]): void {
        const now = Date.now()
        
        const state: ProgressState = {
            runId,
            status: 'running',
            currentIteration: 0,
            totalIterations,
            completedGoals: [],
            failedGoals: [],
            startTime: now,
            estimatedEndTime: now + (totalIterations * 30000), // 30s per iteration estimate
            percentComplete: 0
        }

        const metrics: ProgressMetrics = {
            iteration: 0,
            successCount: 0,
            failureCount: 0,
            toolUsage: new Map(),
            fileChanges: [],
            errors: [],
            warnings: [],
            cycleDetections: 0
        }

        // Create milestones based on goals
        const goalsList = goals || []
        const runMilestones: Milestone[] = goalsList.map((goal, index) => ({
            id: `milestone-${index}`,
            name: goal,
            description: `Complete: ${goal}`,
            targetIteration: Math.floor(totalIterations * (index + 1) / (goalsList.length + 1)),
            completed: false
        }))

        this.states.set(runId, state)
        this.metrics.set(runId, metrics)
        this.activities.set(runId, [])
        this.milestones.set(runId, runMilestones)

        logger.agent.info('Progress monitoring started', { runId, totalIterations })
        this.notifyListeners(runId)
    }

    /**
     * Update progress for a run
     */
    updateProgress(
        runId: string,
        update: {
            iteration?: number
            currentGoal?: string
            goalCompleted?: string
            goalFailed?: string
            toolUsed?: string
            fileChanged?: string
            error?: string
            warning?: string
            cycleDetected?: boolean
        }
    ): void {
        const state = this.states.get(runId)
        const metrics = this.metrics.get(runId)
        const activities = this.activities.get(runId)

        if (!state || !metrics || !activities) {
            logger.agent.warn('Progress update for unknown run', { runId })
            return
        }

        // Update iteration
        if (update.iteration !== undefined) {
            state.currentIteration = update.iteration
            metrics.iteration = update.iteration
            state.percentComplete = Math.min(100, 
                (state.currentIteration / state.totalIterations) * 100)
        }

        // Update current goal
        if (update.currentGoal) {
            state.currentGoal = update.currentGoal
            this.addActivity(activities, 'goal_complete', `Working on: ${update.currentGoal}`)
        }

        // Track goal completion
        if (update.goalCompleted) {
            state.completedGoals.push(update.goalCompleted)
            metrics.successCount++
            this.addActivity(activities, 'goal_complete', `Completed: ${update.goalCompleted}`)
            this.checkMilestones(runId, update.goalCompleted)
        }

        // Track goal failure
        if (update.goalFailed) {
            state.failedGoals.push(update.goalFailed)
            metrics.failureCount++
            this.addActivity(activities, 'goal_fail', `Failed: ${update.goalFailed}`)
        }

        // Track tool usage
        if (update.toolUsed) {
            const current = metrics.toolUsage.get(update.toolUsed) || 0
            metrics.toolUsage.set(update.toolUsed, current + 1)
            this.addActivity(activities, 'tool_call', `Used: ${update.toolUsed}`, 
                { tool: update.toolUsed })
        }

        // Track file changes
        if (update.fileChanged && !metrics.fileChanges.includes(update.fileChanged)) {
            metrics.fileChanges.push(update.fileChanged)
        }

        // Track errors
        if (update.error) {
            metrics.errors.push(update.error)
            this.addActivity(activities, 'error', update.error)
        }

        // Track warnings
        if (update.warning) {
            metrics.warnings.push(update.warning)
            this.addActivity(activities, 'warning', update.warning)
        }

        // Track cycle detections
        if (update.cycleDetected) {
            metrics.cycleDetections++
            this.addActivity(activities, 'cycle_detected', 'Cycle detected and handled')
        }

        this.notifyListeners(runId)
    }

    /**
     * Mark a run as completed
     */
    completeRun(runId: string, success: boolean): void {
        const state = this.states.get(runId)
        if (!state) return

        state.status = success ? 'completed' : 'failed'
        state.percentComplete = 100

        logger.agent.info('Run completed', { 
            runId, 
            success, 
            duration: Date.now() - state.startTime 
        })

        this.notifyListeners(runId)
    }

    /**
     * Pause a run
     */
    pauseRun(runId: string): void {
        const state = this.states.get(runId)
        if (state) {
            state.status = 'paused'
            this.notifyListeners(runId)
        }
    }

    /**
     * Resume a run
     */
    resumeRun(runId: string): void {
        const state = this.states.get(runId)
        if (state) {
            state.status = 'running'
            this.notifyListeners(runId)
        }
    }

    /**
     * Cancel a run
     */
    cancelRun(runId: string): void {
        const state = this.states.get(runId)
        if (state) {
            state.status = 'cancelled'
            this.notifyListeners(runId)
        }
    }

    /**
     * Get progress report for a run
     */
    getReport(runId: string): ProgressReport | undefined {
        const state = this.states.get(runId)
        const metrics = this.metrics.get(runId)
        const activities = this.activities.get(runId)
        const milestones = this.milestones.get(runId)

        if (!state || !metrics || !activities || !milestones) {
            return undefined
        }

        const duration = Date.now() - state.startTime
        const totalActions = metrics.successCount + metrics.failureCount
        const successRate = totalActions > 0 ? metrics.successCount / totalActions : 0

        return {
            state,
            metrics,
            recentActivity: activities.slice(-10), // Last 10 activities
            milestones,
            summary: {
                duration,
                successRate,
                toolsUsed: metrics.toolUsage.size,
                filesModified: metrics.fileChanges.length
            }
        }
    }

    /**
     * Subscribe to progress updates
     */
    subscribe(listener: ProgressListener): () => void {
        this.listeners.push(listener)
        
        return () => {
            const index = this.listeners.indexOf(listener)
            if (index > -1) {
                this.listeners.splice(index, 1)
            }
        }
    }

    /**
     * Get all active runs
     */
    getActiveRuns(): string[] {
        return Array.from(this.states.entries())
            .filter(([_, state]) => state.status === 'running')
            .map(([runId, _]) => runId)
    }

    /**
     * Get run statistics
     */
    getStats(): {
        totalRuns: number
        activeRuns: number
        completedRuns: number
        failedRuns: number
        averageSuccessRate: number
    } {
        let completed = 0
        let failed = 0
        let totalSuccessRate = 0

        for (const [runId, _] of this.states) {
            const report = this.getReport(runId)
            if (report) {
                if (report.state.status === 'completed') completed++
                if (report.state.status === 'failed') failed++
                totalSuccessRate += report.summary.successRate
            }
        }

        const total = this.states.size
        const active = this.getActiveRuns().length

        return {
            totalRuns: total,
            activeRuns: active,
            completedRuns: completed,
            failedRuns: failed,
            averageSuccessRate: total > 0 ? totalSuccessRate / total : 0
        }
    }

    /**
     * Clean up completed runs
     */
    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
        const now = Date.now()
        const toRemove: string[] = []

        for (const [runId, state] of this.states) {
            if (state.status !== 'running' && 
                (now - state.startTime) > maxAgeMs) {
                toRemove.push(runId)
            }
        }

        for (const runId of toRemove) {
            this.states.delete(runId)
            this.metrics.delete(runId)
            this.activities.delete(runId)
            this.milestones.delete(runId)
        }

        if (toRemove.length > 0) {
            logger.agent.info('Progress monitoring cleanup completed', { 
                removed: toRemove.length 
            })
        }
    }

    // --- Private methods ---

    private addActivity(
        activities: ActivityItem[],
        type: ActivityItem['type'],
        description: string,
        details?: Record<string, unknown>
    ): void {
        activities.push({
            timestamp: Date.now(),
            type,
            description,
            details
        })

        // Trim old activities
        if (activities.length > 100) {
            activities.shift()
        }
    }

    private checkMilestones(runId: string, completedGoal: string): void {
        const milestones = this.milestones.get(runId)
        if (!milestones) return

        const milestone = milestones.find(m => m.name === completedGoal && !m.completed)
        if (milestone) {
            milestone.completed = true
            milestone.completedAt = Date.now()
        }
    }

    private notifyListeners(runId: string): void {
        const report = this.getReport(runId)
        if (!report) return

        for (const listener of this.listeners) {
            try {
                listener(report)
            } catch (err) {
                logger.agent.error('Progress listener failed', err)
            }
        }
    }
}

export const progressMonitoringService = new ProgressMonitoringService()
