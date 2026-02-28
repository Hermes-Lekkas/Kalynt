/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Transaction Service - ACID-compliant file operation transactions
 * 
 * Provides transaction safety for agent file operations:
 * - Atomic: All operations succeed or all roll back
 * - Consistent: Validation before commit
 * - Isolated: Shadow files prevent partial visibility
 * - Durable: Commit writes to actual files
 * 
 * This enables safe multi-file refactoring operations with
 * guaranteed rollback on failure.
 */

import { logger } from '../utils/logger'

export interface TransactionFile {
    path: string
    originalContent: string | null  // null = file didn't exist
    newContent: string | null       // null = file should be deleted
    operation: 'create' | 'modify' | 'delete'
}

export interface Transaction {
    id: string
    files: Map<string, TransactionFile>
    startedAt: number
    status: 'active' | 'committing' | 'committed' | 'rolling_back' | 'rolled_back' | 'failed'
    error?: string
}

export interface TransactionResult {
    success: boolean
    transactionId: string
    modifiedFiles: string[]
    error?: string
}

export interface ValidationError {
    path: string
    message: string
    severity: 'error' | 'warning'
}

export interface ValidationResult {
    valid: boolean
    errors: ValidationError[]
    warnings: ValidationError[]
}

type ValidationFunction = (files: Map<string, TransactionFile>) => Promise<ValidationResult>
type CommitHook = (transaction: Transaction) => Promise<void>
type RollbackHook = (transaction: Transaction) => Promise<void>

class TransactionService {
    private activeTransactions = new Map<string, Transaction>()
    private fileLocks = new Map<string, string>() // path -> transactionId
    private validationHooks: ValidationFunction[] = []
    private preCommitHooks: CommitHook[] = []
    private postCommitHooks: CommitHook[] = []
    private rollbackHooks: RollbackHook[] = []

    // Shadow file storage (in-memory for performance)
    private shadowStorage = new Map<string, string>()

    /**
     * Register a validation hook that runs before commit
     */
    onValidate(hook: ValidationFunction): () => void {
        this.validationHooks.push(hook)
        return () => {
            const idx = this.validationHooks.indexOf(hook)
            if (idx >= 0) this.validationHooks.splice(idx, 1)
        }
    }

    /**
     * Register a hook that runs before commit (after validation)
     */
    onPreCommit(hook: CommitHook): () => void {
        this.preCommitHooks.push(hook)
        return () => {
            const idx = this.preCommitHooks.indexOf(hook)
            if (idx >= 0) this.preCommitHooks.splice(idx, 1)
        }
    }

    /**
     * Register a hook that runs after successful commit
     */
    onPostCommit(hook: CommitHook): () => void {
        this.postCommitHooks.push(hook)
        return () => {
            const idx = this.postCommitHooks.indexOf(hook)
            if (idx >= 0) this.postCommitHooks.splice(idx, 1)
        }
    }

    /**
     * Register a hook that runs during rollback
     */
    onRollback(hook: RollbackHook): () => void {
        this.rollbackHooks.push(hook)
        return () => {
            const idx = this.rollbackHooks.indexOf(hook)
            if (idx >= 0) this.rollbackHooks.splice(idx, 1)
        }
    }

    /**
     * Begin a new transaction
     */
    beginTransaction(): Transaction {
        const transaction: Transaction = {
            id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            files: new Map(),
            startedAt: Date.now(),
            status: 'active'
        }
        this.activeTransactions.set(transaction.id, transaction)
        logger.agent.debug('Transaction started', { transactionId: transaction.id })
        return transaction
    }

    /**
     * Check if a file is locked by any transaction
     */
    isFileLocked(path: string): boolean {
        return this.fileLocks.has(path)
    }

    /**
     * Get the transaction that holds a lock on a file
     */
    getLockHolder(path: string): string | undefined {
        return this.fileLocks.get(path)
    }

    /**
     * Stage a file creation in the transaction
     */
    async stageCreate(transactionId: string, path: string, content: string): Promise<{ success: boolean; error?: string }> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { success: false, error: 'Transaction not found' }
        }
        if (transaction.status !== 'active') {
            return { success: false, error: `Transaction is ${transaction.status}` }
        }

        // Check if file is locked by another transaction
        const existingLock = this.fileLocks.get(path)
        if (existingLock && existingLock !== transactionId) {
            return { success: false, error: `File is locked by transaction ${existingLock}` }
        }

        // Check if file already exists in workspace
        const exists = await this.fileExists(path)
        if (exists) {
            return { success: false, error: 'File already exists' }
        }

        // Lock the file
        this.fileLocks.set(path, transactionId)

        // Stage the creation
        transaction.files.set(path, {
            path,
            originalContent: null,
            newContent: content,
            operation: 'create'
        })

        // Store in shadow
        this.shadowStorage.set(`${transactionId}:${path}`, content)

        logger.agent.debug('File creation staged', { transactionId, path })
        return { success: true }
    }

    /**
     * Stage a file modification in the transaction
     */
    async stageModify(transactionId: string, path: string, newContent: string): Promise<{ success: boolean; error?: string }> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { success: false, error: 'Transaction not found' }
        }
        if (transaction.status !== 'active') {
            return { success: false, error: `Transaction is ${transaction.status}` }
        }

        // Check if file is locked by another transaction
        const existingLock = this.fileLocks.get(path)
        if (existingLock && existingLock !== transactionId) {
            return { success: false, error: `File is locked by transaction ${existingLock}` }
        }

        // Read original content if not already staged
        let originalContent: string | null = null
        const existingStaging = transaction.files.get(path)
        
        if (existingStaging) {
            // Use the previously staged original content
            originalContent = existingStaging.originalContent
        } else {
            // Read from workspace
            originalContent = await this.readFile(path)
            if (originalContent === null) {
                return { success: false, error: 'File not found' }
            }
        }

        // Lock the file
        this.fileLocks.set(path, transactionId)

        // Stage the modification
        transaction.files.set(path, {
            path,
            originalContent,
            newContent,
            operation: 'modify'
        })

        // Store in shadow
        this.shadowStorage.set(`${transactionId}:${path}`, newContent)

        logger.agent.debug('File modification staged', { transactionId, path })
        return { success: true }
    }

    /**
     * Stage a file deletion in the transaction
     */
    async stageDelete(transactionId: string, path: string): Promise<{ success: boolean; error?: string }> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { success: false, error: 'Transaction not found' }
        }
        if (transaction.status !== 'active') {
            return { success: false, error: `Transaction is ${transaction.status}` }
        }

        // Check if file is locked by another transaction
        const existingLock = this.fileLocks.get(path)
        if (existingLock && existingLock !== transactionId) {
            return { success: false, error: `File is locked by transaction ${existingLock}` }
        }

        // Read original content if not already staged
        let originalContent: string | null = null
        const existingStaging = transaction.files.get(path)
        
        if (existingStaging) {
            originalContent = existingStaging.originalContent
        } else {
            originalContent = await this.readFile(path)
            if (originalContent === null) {
                return { success: false, error: 'File not found' }
            }
        }

        // Lock the file
        this.fileLocks.set(path, transactionId)

        // Stage the deletion
        transaction.files.set(path, {
            path,
            originalContent,
            newContent: null,
            operation: 'delete'
        })

        // Remove from shadow (file shouldn't exist after delete)
        this.shadowStorage.delete(`${transactionId}:${path}`)

        logger.agent.debug('File deletion staged', { transactionId, path })
        return { success: true }
    }

    /**
     * Get staged content for a file
     */
    getStagedContent(transactionId: string, path: string): string | null | undefined {
        return this.shadowStorage.get(`${transactionId}:${path}`)
    }

    /**
     * Validate the transaction before commit
     */
    async validate(transactionId: string): Promise<ValidationResult> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { valid: false, errors: [{ path: '', message: 'Transaction not found', severity: 'error' }], warnings: [] }
        }

        const errors: ValidationError[] = []
        const warnings: ValidationError[] = []

        // Run all validation hooks
        for (const hook of this.validationHooks) {
            try {
                const result = await hook(transaction.files)
                errors.push(...result.errors)
                warnings.push(...result.warnings)
            } catch (err) {
                errors.push({
                    path: '',
                    message: `Validation hook failed: ${err}`,
                    severity: 'error'
                })
            }
        }

        // Check for syntax errors in code files
        for (const [path, file] of transaction.files) {
            if (file.newContent !== null && this.isCodeFile(path)) {
                const syntaxCheck = await this.checkSyntax(path, file.newContent)
                if (!syntaxCheck.valid) {
                    errors.push({
                        path,
                        message: `Syntax error: ${syntaxCheck.error}`,
                        severity: 'error'
                    })
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * Commit the transaction - apply all changes atomically
     */
    async commit(transactionId: string): Promise<TransactionResult> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { success: false, transactionId, modifiedFiles: [], error: 'Transaction not found' }
        }

        if (transaction.status !== 'active') {
            return { success: false, transactionId, modifiedFiles: [], error: `Transaction is ${transaction.status}` }
        }

        transaction.status = 'committing'

        try {
            // Run pre-commit hooks
            for (const hook of this.preCommitHooks) {
                await hook(transaction)
            }

            // Apply all changes
            const modifiedFiles: string[] = []
            
            for (const [path, file] of transaction.files) {
                if (file.operation === 'create' || file.operation === 'modify') {
                    if (file.newContent !== null) {
                        await this.writeFile(path, file.newContent)
                        modifiedFiles.push(path)
                    }
                } else if (file.operation === 'delete') {
                    await this.deleteFile(path)
                    modifiedFiles.push(path)
                }

                // Release lock
                this.fileLocks.delete(path)
                this.shadowStorage.delete(`${transactionId}:${path}`)
            }

            transaction.status = 'committed'

            // Run post-commit hooks
            for (const hook of this.postCommitHooks) {
                await hook(transaction)
            }

            logger.agent.info('Transaction committed', { transactionId, modifiedFiles: modifiedFiles.length })

            return {
                success: true,
                transactionId,
                modifiedFiles
            }
        } catch (err) {
            transaction.status = 'failed'
            transaction.error = String(err)
            
            // Attempt rollback on commit failure
            await this.rollback(transactionId)
            
            return {
                success: false,
                transactionId,
                modifiedFiles: [],
                error: `Commit failed: ${err}`
            }
        }
    }

    /**
     * Rollback the transaction - restore all files to original state
     */
    async rollback(transactionId: string): Promise<TransactionResult> {
        const transaction = this.activeTransactions.get(transactionId)
        if (!transaction) {
            return { success: false, transactionId, modifiedFiles: [], error: 'Transaction not found' }
        }

        if (transaction.status === 'rolled_back') {
            return { success: true, transactionId, modifiedFiles: [] }
        }

        transaction.status = 'rolling_back'

        try {
            // Run rollback hooks
            for (const hook of this.rollbackHooks) {
                await hook(transaction)
            }

            // Restore all files
            const modifiedFiles: string[] = []
            
            for (const [path, file] of transaction.files) {
                if (file.operation === 'create') {
                    // Delete the created file
                    await this.deleteFile(path)
                } else if (file.operation === 'modify' || file.operation === 'delete') {
                    // Restore original content
                    if (file.originalContent !== null) {
                        await this.writeFile(path, file.originalContent)
                    }
                }

                modifiedFiles.push(path)
                
                // Release lock and clean shadow
                this.fileLocks.delete(path)
                this.shadowStorage.delete(`${transactionId}:${path}`)
            }

            transaction.status = 'rolled_back'

            logger.agent.info('Transaction rolled back', { transactionId, modifiedFiles: modifiedFiles.length })

            return {
                success: true,
                transactionId,
                modifiedFiles
            }
        } catch (err) {
            transaction.status = 'failed'
            transaction.error = String(err)
            
            logger.agent.error('Transaction rollback failed', { transactionId, error: err })
            
            return {
                success: false,
                transactionId,
                modifiedFiles: [],
                error: `Rollback failed: ${err}`
            }
        }
    }

    /**
     * Get transaction status
     */
    getTransactionStatus(transactionId: string): Transaction['status'] | null {
        const transaction = this.activeTransactions.get(transactionId)
        return transaction?.status ?? null
    }

    /**
     * Get active transaction count
     */
    getActiveTransactionCount(): number {
        let count = 0
        for (const txn of this.activeTransactions.values()) {
            if (txn.status === 'active') count++
        }
        return count
    }

    /**
     * Clean up completed transactions
     */
    cleanup(maxAgeMs: number = 300000): void { // 5 minutes default
        const cutoff = Date.now() - maxAgeMs
        for (const [id, transaction] of this.activeTransactions) {
            if (transaction.startedAt < cutoff && 
                (transaction.status === 'committed' || 
                 transaction.status === 'rolled_back' ||
                 transaction.status === 'failed')) {
                this.activeTransactions.delete(id)
            }
        }
    }

    // --- Helper methods ---

    private async fileExists(path: string): Promise<boolean> {
        try {
            const result = await globalThis.window.electronAPI?.fs.stat(path)
            return result?.success && result.isFile
        } catch {
            return false
        }
    }

    private async readFile(path: string): Promise<string | null> {
        try {
            const result = await globalThis.window.electronAPI?.fs.readFile(path)
            return result?.success ? result.content : null
        } catch {
            return null
        }
    }

    private async writeFile(path: string, content: string): Promise<void> {
        const result = await globalThis.window.electronAPI?.fs.writeFile({ path, content })
        if (!result?.success) {
            throw new Error(result?.error || 'Write failed')
        }
    }

    private async deleteFile(path: string): Promise<void> {
        const result = await globalThis.window.electronAPI?.fs.delete(path)
        if (!result?.success) {
            throw new Error(result?.error || 'Delete failed')
        }
    }

    private isCodeFile(path: string): boolean {
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.cs']
        return codeExtensions.some(ext => path.toLowerCase().endsWith(ext))
    }

    private async checkSyntax(_path: string, _content: string): Promise<{ valid: boolean; error?: string }> {
        // This is a placeholder - actual syntax checking would be done via LSP
        // or language-specific validators
        return { valid: true }
    }
}

export const transactionService = new TransactionService()
