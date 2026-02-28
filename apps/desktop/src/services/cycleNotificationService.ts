/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Cycle Notification Service
 * 
 * Manages UI notifications for detected cycles in the agent loop.
Provides user-visible alerts with context and resolution suggestions.
 */

import { logger } from '../utils/logger'
import { type DetectedCycle, type CycleBreakStrategy } from './cycleDetectionService'

export interface CycleNotification {
    id: string
    runId: string
    cycle: DetectedCycle
    timestamp: number
    severity: 'info' | 'warning' | 'error'
    message: string
    details: string
    suggestedAction: string
    breakStrategy: CycleBreakStrategy
    acknowledged: boolean
    acknowledgedAt?: number
    autoResolved: boolean
}

export interface NotificationConfig {
    showInfo: boolean
    showWarning: boolean
    showError: boolean
    autoDismissInfo: boolean
    autoDismissDelayMs: number
    maxNotifications: number
}

type NotificationHandler = (notification: CycleNotification) => void
type NotificationDismissHandler = (notificationId: string) => void

class CycleNotificationService {
    private notifications = new Map<string, CycleNotification>()
    private notificationHandler: NotificationHandler | null = null
    private dismissHandler: NotificationDismissHandler | null = null
    private config: NotificationConfig = {
        showInfo: true,
        showWarning: true,
        showError: true,
        autoDismissInfo: true,
        autoDismissDelayMs: 10000,
        maxNotifications: 10
    }

    /**
     * Initialize the service
     */
    initialize(config?: Partial<NotificationConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        logger.agent.info('Cycle notification service initialized', this.config)
    }

    /**
     * Set notification handler (UI component)
     */
    setNotificationHandler(handler: NotificationHandler): void {
        this.notificationHandler = handler
    }

    /**
     * Set dismiss handler
     */
    setDismissHandler(handler: NotificationDismissHandler): void {
        this.dismissHandler = handler
    }

    /**
     * Notify about a detected cycle
     */
    notifyCycleDetected(
        runId: string,
        cycle: DetectedCycle,
        breakStrategy: CycleBreakStrategy
    ): CycleNotification {
        const severity = this.determineSeverity(cycle)
        
        const notification: CycleNotification = {
            id: `cycle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            runId,
            cycle,
            timestamp: Date.now(),
            severity,
            message: this.generateMessage(cycle),
            details: this.generateDetails(cycle),
            suggestedAction: this.generateSuggestion(breakStrategy),
            breakStrategy,
            acknowledged: false,
            autoResolved: false
        }

        this.notifications.set(notification.id, notification)

        // Trim old notifications if needed
        this.trimNotifications()

        // Show notification
        if (this.shouldShow(severity)) {
            this.showNotification(notification)
        }

        logger.agent.info('Cycle notification created', {
            notificationId: notification.id,
            runId,
            type: cycle.type,
            severity
        })

        // Auto-dismiss info notifications
        if (severity === 'info' && this.config.autoDismissInfo) {
            setTimeout(() => {
                this.dismiss(notification.id)
            }, this.config.autoDismissDelayMs)
        }

        return notification
    }

    /**
     * Notify that a cycle was automatically resolved
     */
    notifyCycleResolved(
        notificationId: string,
        resolution: string
    ): void {
        const notification = this.notifications.get(notificationId)
        if (!notification) return

        notification.autoResolved = true
        notification.suggestedAction = `Resolved: ${resolution}`

        if (this.notificationHandler) {
            this.notificationHandler(notification)
        }

        logger.agent.info('Cycle auto-resolved', {
            notificationId,
            resolution
        })

        // Auto-dismiss after resolution
        setTimeout(() => {
            this.dismiss(notificationId)
        }, 5000)
    }

    /**
     * Acknowledge a notification
     */
    acknowledge(notificationId: string): void {
        const notification = this.notifications.get(notificationId)
        if (!notification) return

        notification.acknowledged = true
        notification.acknowledgedAt = Date.now()

        logger.agent.debug('Cycle notification acknowledged', { notificationId })
    }

    /**
     * Dismiss a notification
     */
    dismiss(notificationId: string): void {
        const existed = this.notifications.has(notificationId)
        this.notifications.delete(notificationId)

        if (existed && this.dismissHandler) {
            this.dismissHandler(notificationId)
        }
    }

    /**
     * Get all notifications for a run
     */
    getNotificationsForRun(runId: string): CycleNotification[] {
        return Array.from(this.notifications.values())
            .filter(n => n.runId === runId)
            .sort((a, b) => b.timestamp - a.timestamp)
    }

    /**
     * Get all pending (non-acknowledged) notifications
     */
    getPendingNotifications(): CycleNotification[] {
        return Array.from(this.notifications.values())
            .filter(n => !n.acknowledged)
            .sort((a, b) => b.timestamp - a.timestamp)
    }

    /**
     * Get notification by ID
     */
    getNotification(id: string): CycleNotification | undefined {
        return this.notifications.get(id)
    }

    /**
     * Clear all notifications for a run
     */
    clearRun(runId: string): void {
        for (const [id, notification] of this.notifications) {
            if (notification.runId === runId) {
                this.notifications.delete(id)
                if (this.dismissHandler) {
                    this.dismissHandler(id)
                }
            }
        }
    }

    /**
     * Get notification statistics
     */
    getStats(): {
        total: number
        pending: number
        acknowledged: number
        bySeverity: Record<string, number>
        byType: Record<string, number>
    } {
        const bySeverity: Record<string, number> = { info: 0, warning: 0, error: 0 }
        const byType: Record<string, number> = { 
            repetition: 0, 
            oscillation: 0, 
            stagnation: 0 
        }

        let pending = 0
        let acknowledged = 0

        for (const notification of this.notifications.values()) {
            bySeverity[notification.severity]++
            byType[notification.cycle.type]++
            
            if (notification.acknowledged) {
                acknowledged++
            } else {
                pending++
            }
        }

        return {
            total: this.notifications.size,
            pending,
            acknowledged,
            bySeverity,
            byType
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<NotificationConfig>): void {
        this.config = { ...this.config, ...config }
    }

    // --- Private methods ---

    private determineSeverity(cycle: DetectedCycle): CycleNotification['severity'] {
        switch (cycle.severity) {
            case 'high':
                return 'error'
            case 'medium':
                return 'warning'
            default:
                return 'info'
        }
    }

    private shouldShow(severity: CycleNotification['severity']): boolean {
        switch (severity) {
            case 'info':
                return this.config.showInfo
            case 'warning':
                return this.config.showWarning
            case 'error':
                return this.config.showError
            default:
                return true
        }
    }

    private showNotification(notification: CycleNotification): void {
        if (this.notificationHandler) {
            this.notificationHandler(notification)
        }
    }

    private trimNotifications(): void {
        if (this.notifications.size <= this.config.maxNotifications) {
            return
        }

        // Remove oldest acknowledged notifications first
        const sorted = Array.from(this.notifications.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)

        let toRemove = this.notifications.size - this.config.maxNotifications

        for (const [id, notification] of sorted) {
            if (toRemove <= 0) break
            
            if (notification.acknowledged || notification.autoResolved) {
                this.notifications.delete(id)
                toRemove--
            }
        }
    }

    private generateMessage(cycle: DetectedCycle): string {
        const typeNames: Record<string, string> = {
            repetition: 'Repetitive pattern detected',
            oscillation: 'Oscillating behavior detected',
            stagnation: 'Progress stagnation detected'
        }

        return typeNames[cycle.type] || 'Cycle detected in agent reasoning'
    }

    private generateDetails(cycle: DetectedCycle): string {
        const iterations = cycle.iterations.join(', ')
        
        switch (cycle.type) {
            case 'repetition':
                return `The agent repeated the same state at iterations ${iterations}. This indicates the agent is stuck in a loop.`
            case 'oscillation':
                return `The agent is oscillating between states at iterations ${iterations}. The agent keeps switching back and forth without making progress.`
            case 'stagnation':
                return `The agent has stagnated at iterations ${iterations}. Multiple attempts to fix the same issue have failed.`
            default:
                return `Detected at iterations ${iterations}`
        }
    }

    private generateSuggestion(strategy: CycleBreakStrategy): string {
        switch (strategy.type) {
            case 'alternative_tool':
                return `Try using ${strategy.suggestedTool} instead of ${strategy.currentTool}`
            case 'increase_temperature':
                return `Increasing randomness (temperature: ${strategy.suggested}) to break the pattern`
            case 'simplify_request':
                return 'Simplifying the request and breaking it into smaller steps'
            case 'ask_clarification':
                return `Asking for clarification: ${strategy.question}`
            case 'reset_context':
                return 'Resetting context while preserving relevant files'
            case 'escalate_to_user':
                return `Escalating to user: ${strategy.explanation}`
            default:
                return 'Applying automatic cycle breaking strategy'
        }
    }
}

export const cycleNotificationService = new CycleNotificationService()
