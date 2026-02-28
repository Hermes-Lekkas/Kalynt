/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * User Confirmation Service
 * 
 * Manages user confirmation dialogs for multi-file changes and
destructive operations. Tracks pending confirmations and responses.
 */

import { logger } from '../utils/logger'

export interface ChangeRequest {
    id: string
    type: 'write' | 'delete' | 'replace' | 'move' | 'batch'
    filePath: string
    oldContent?: string
    newContent?: string
    description: string
    isDestructive: boolean
    estimatedImpact: 'low' | 'medium' | 'high'
}

export interface ConfirmationDialog {
    id: string
    title: string
    message: string
    changes: ChangeRequest[]
    timestamp: number
    timeoutMs: number
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface ConfirmationResponse {
    dialogId: string
    approved: boolean
    approvedChanges: string[]  // IDs of approved changes
    rejectedChanges: string[]  // IDs of rejected changes
    timestamp: number
    notes?: string
}

export interface ConfirmationStats {
    totalRequested: number
    totalApproved: number
    totalRejected: number
    averageResponseTime: number
    byRiskLevel: Record<string, { approved: number; rejected: number }>
}

type ConfirmationHandler = (dialog: ConfirmationDialog) => Promise<ConfirmationResponse>
type ChangePreviewGenerator = (change: ChangeRequest) => string

class UserConfirmationService {
    private pendingDialogs = new Map<string, ConfirmationDialog>()
    private responses = new Map<string, ConfirmationResponse>()
    private confirmationHandler: ConfirmationHandler | null = null
    private previewGenerator: ChangePreviewGenerator | null = null
    private defaultTimeoutMs = 300000  // 5 minutes
    private history: Array<{ dialog: ConfirmationDialog; response: ConfirmationResponse }> = []

    /**
     * Set the confirmation handler (UI component)
     */
    setConfirmationHandler(handler: ConfirmationHandler): void {
        this.confirmationHandler = handler
    }

    /**
     * Set the preview generator for showing diffs
     */
    setPreviewGenerator(generator: ChangePreviewGenerator): void {
        this.previewGenerator = generator
    }

    /**
     * Request confirmation for a single change
     */
    async requestConfirmation(
        change: Omit<ChangeRequest, 'id'>
    ): Promise<ConfirmationResponse> {
        const dialog = this.createDialog([{ ...change, id: `change-${Date.now()}` }])
        return this.showDialog(dialog)
    }

    /**
     * Request confirmation for multiple changes (batch)
     */
    async requestBatchConfirmation(
        changes: Omit<ChangeRequest, 'id'>[],
        options?: {
            title?: string
            message?: string
            allowPartial?: boolean
        }
    ): Promise<ConfirmationResponse> {
        const changesWithIds: ChangeRequest[] = changes.map((c, i) => ({
            ...c,
            id: `change-${Date.now()}-${i}`
        }))

        const dialog = this.createDialog(changesWithIds, options)
        return this.showDialog(dialog)
    }

    /**
     * Check if a change should require confirmation
     */
    shouldRequireConfirmation(change: Omit<ChangeRequest, 'id'>): boolean {
        // Always require confirmation for destructive operations
        if (change.isDestructive) return true

        // Require confirmation for high impact changes
        if (change.estimatedImpact === 'high') return true

        // Require confirmation for deletes
        if (change.type === 'delete') return true

        // Check if file is in protected paths
        const protectedPaths = [
            /package\.json$/,
            /tsconfig\.json$/,
            /\.env/,
            /config\./
        ]
        if (protectedPaths.some(p => p.test(change.filePath))) {
            return true
        }

        return false
    }

    /**
     * Quick confirm for low-risk changes (if no handler set, auto-approve)
     */
    async quickConfirm(change: Omit<ChangeRequest, 'id'>): Promise<boolean> {
        if (!this.shouldRequireConfirmation(change)) {
            // Auto-approve low-risk changes
            return true
        }

        const response = await this.requestConfirmation(change)
        return response.approved
    }

    /**
     * Get pending dialog
     */
    getPendingDialog(dialogId: string): ConfirmationDialog | undefined {
        return this.pendingDialogs.get(dialogId)
    }

    /**
     * Get all pending dialogs
     */
    getAllPendingDialogs(): ConfirmationDialog[] {
        return Array.from(this.pendingDialogs.values())
    }

    /**
     * Get response for a dialog
     */
    getResponse(dialogId: string): ConfirmationResponse | undefined {
        return this.responses.get(dialogId)
    }

    /**
     * Cancel a pending dialog
     */
    cancelDialog(dialogId: string, reason?: string): void {
        const dialog = this.pendingDialogs.get(dialogId)
        if (!dialog) return

        const response: ConfirmationResponse = {
            dialogId,
            approved: false,
            approvedChanges: [],
            rejectedChanges: dialog.changes.map(c => c.id),
            timestamp: Date.now(),
            notes: reason || 'Cancelled by system'
        }

        this.responses.set(dialogId, response)
        this.pendingDialogs.delete(dialogId)
        this.history.push({ dialog, response })

        logger.agent.info('Dialog cancelled', { dialogId, reason })
    }

    /**
     * Generate preview/diff for a change
     */
    generatePreview(change: ChangeRequest): string {
        if (this.previewGenerator) {
            return this.previewGenerator(change)
        }

        // Default preview
        if (change.type === 'delete') {
            return `Delete: ${change.filePath}`
        }

        if (change.oldContent && change.newContent) {
            return `--- ${change.filePath}\n+++ ${change.filePath}\n@@ -1 +1 @@\n${change.newContent}`
        }

        return `Modify: ${change.filePath}`
    }

    /**
     * Get confirmation statistics
     */
    getStats(): ConfirmationStats {
        const byRiskLevel: ConfirmationStats['byRiskLevel'] = {
            low: { approved: 0, rejected: 0 },
            medium: { approved: 0, rejected: 0 },
            high: { approved: 0, rejected: 0 },
            critical: { approved: 0, rejected: 0 }
        }

        let totalResponseTime = 0

        for (const { dialog, response } of this.history) {
            const responseTime = response.timestamp - dialog.timestamp
            totalResponseTime += responseTime

            if (response.approved) {
                byRiskLevel[dialog.riskLevel].approved++
            } else {
                byRiskLevel[dialog.riskLevel].rejected++
            }
        }

        const total = this.history.length
        const approved = this.history.filter(h => h.response.approved).length

        return {
            totalRequested: total + this.pendingDialogs.size,
            totalApproved: approved,
            totalRejected: total - approved,
            averageResponseTime: total > 0 ? totalResponseTime / total : 0,
            byRiskLevel
        }
    }

    /**
     * Clear history
     */
    clearHistory(): void {
        this.history = []
        logger.agent.info('Confirmation history cleared')
    }

    // --- Private methods ---

    private createDialog(
        changes: ChangeRequest[],
        options?: {
            title?: string
            message?: string
            allowPartial?: boolean
        }
    ): ConfirmationDialog {
        const destructiveCount = changes.filter(c => c.isDestructive).length
        const highImpactCount = changes.filter(c => c.estimatedImpact === 'high').length

        // Determine risk level
        let riskLevel: ConfirmationDialog['riskLevel'] = 'low'
        if (destructiveCount > 0 || highImpactCount > 0) {
            riskLevel = 'high'
        } else if (changes.length > 5) {
            riskLevel = 'medium'
        }
        if (changes.some(c => /package\.json|\.env/.test(c.filePath))) {
            riskLevel = 'critical'
        }

        const title = options?.title || this.generateTitle(changes, riskLevel)
        const message = options?.message || this.generateMessage(changes, riskLevel)

        return {
            id: `dialog-${Date.now()}`,
            title,
            message,
            changes,
            timestamp: Date.now(),
            timeoutMs: this.defaultTimeoutMs,
            riskLevel
        }
    }

    private async showDialog(dialog: ConfirmationDialog): Promise<ConfirmationResponse> {
        if (!this.confirmationHandler) {
            // No handler set - auto-approve if low risk
            if (dialog.riskLevel === 'low') {
                return {
                    dialogId: dialog.id,
                    approved: true,
                    approvedChanges: dialog.changes.map(c => c.id),
                    rejectedChanges: [],
                    timestamp: Date.now()
                }
            }

            throw new Error('No confirmation handler set and risk level requires confirmation')
        }

        this.pendingDialogs.set(dialog.id, dialog)

        try {
            const response = await this.confirmationHandler(dialog)
            
            this.responses.set(dialog.id, response)
            this.pendingDialogs.delete(dialog.id)
            this.history.push({ dialog, response })

            logger.agent.info('Confirmation received', {
                dialogId: dialog.id,
                approved: response.approved,
                approvedCount: response.approvedChanges.length
            })

            return response

        } catch (err) {
            // Dialog failed or timed out
            this.cancelDialog(dialog.id, err instanceof Error ? err.message : 'Unknown error')
            throw err
        }
    }

    private generateTitle(changes: ChangeRequest[], riskLevel: ConfirmationDialog['riskLevel']): string {
        const count = changes.length
        
        if (count === 1) {
            return `Confirm ${changes[0].type} operation`
        }

        if (riskLevel === 'critical') {
            return `CRITICAL: Confirm ${count} changes`
        }

        if (riskLevel === 'high') {
            return `Confirm ${count} changes (High Risk)`
        }

        return `Confirm ${count} changes`
    }

    private generateMessage(changes: ChangeRequest[], riskLevel: ConfirmationDialog['riskLevel']): string {
        const destructive = changes.filter(c => c.isDestructive).length
        const files = [...new Set(changes.map(c => c.filePath))]

        let message = `About to modify ${files.length} file(s)`
        
        if (destructive > 0) {
            message += ` including ${destructive} destructive operation(s)`
        }

        if (riskLevel === 'critical') {
            message += '. This includes protected files. Please review carefully.'
        } else if (riskLevel === 'high') {
            message += '. High impact changes detected.'
        }

        return message
    }
}

export const userConfirmationService = new UserConfirmationService()
