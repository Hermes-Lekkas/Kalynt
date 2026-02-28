/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * File Watcher Service - Incremental AIME Updates
 * 
 * Watches workspace files for changes and triggers incremental updates
to the AIME (AI Memory Engine) index. Enables real-time code intelligence
 * without full re-indexing.
 */

import { logger } from '../utils/logger'

export interface FileChangeEvent {
    type: 'created' | 'modified' | 'deleted' | 'renamed'
    path: string
    oldPath?: string
    timestamp: number
    size?: number
    contentHash?: string
}

export interface WatcherConfig {
    ignoredPatterns: RegExp[]
    debounceMs: number
    batchSize: number
    maxQueueSize: number
}

export interface IndexUpdate {
    files: string[]
    symbols: string[]
    relationships: string[]
}

export type FileChangeHandler = (event: FileChangeEvent) => void | Promise<void>
export type BatchChangeHandler = (events: FileChangeEvent[]) => void | Promise<void>

class FileWatcherService {
    private changeQueue: FileChangeEvent[] = []
    private handlers = new Map<string, FileChangeHandler>()
    private batchHandlers: BatchChangeHandler[] = []
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private config: WatcherConfig = {
        ignoredPatterns: [
            /node_modules/,
            /\.git/,
            /\.vscode/,
            /dist/,
            /build/,
            /\.next/,
            /\.nuxt/,
            /coverage/,
            /\.cache/,
            /\.DS_Store/,
            /\.env$/,
            /\.log$/,
            /\.tmp$/
        ],
        debounceMs: 500,
        batchSize: 50,
        maxQueueSize: 1000
    }
    private isWatching = false
    private lastUpdateTime = 0

    /**
     * Initialize the file watcher
     */
    initialize(config?: Partial<WatcherConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        this.changeQueue = []
        this.isWatching = true
        logger.agent.info('File watcher initialized', this.config)
    }

    /**
     * Record a file change event (to be called by the main process file watcher)
     */
    recordChange(event: FileChangeEvent): void {
        // Check if path should be ignored
        if (this.shouldIgnore(event.path)) {
            return
        }

        // Add to queue
        this.changeQueue.push(event)

        // Trim queue if it exceeds max size
        if (this.changeQueue.length > this.config.maxQueueSize) {
            this.changeQueue = this.changeQueue.slice(-this.config.maxQueueSize)
            logger.agent.warn('File change queue truncated', {
                newSize: this.changeQueue.length
            })
        }

        // Debounce processing
        this.debounceProcessing()

        logger.agent.debug('File change recorded', {
            type: event.type,
            path: event.path
        })
    }

    /**
     * Register a handler for file changes
     */
    onChange(handlerId: string, handler: FileChangeHandler): () => void {
        this.handlers.set(handlerId, handler)
        
        // Return unsubscribe function
        return () => {
            this.handlers.delete(handlerId)
        }
    }

    /**
     * Register a batch handler for multiple changes
     */
    onBatchChange(handler: BatchChangeHandler): () => void {
        this.batchHandlers.push(handler)
        
        // Return unsubscribe function
        return () => {
            const idx = this.batchHandlers.indexOf(handler)
            if (idx > -1) {
                this.batchHandlers.splice(idx, 1)
            }
        }
    }

    /**
     * Get pending changes
     */
    getPendingChanges(): FileChangeEvent[] {
        return [...this.changeQueue]
    }

    /**
     * Get changes since a specific timestamp
     */
    getChangesSince(timestamp: number): FileChangeEvent[] {
        return this.changeQueue.filter(e => e.timestamp > timestamp)
    }

    /**
     * Process pending changes immediately
     */
    async processChanges(): Promise<IndexUpdate> {
        if (this.changeQueue.length === 0) {
            return { files: [], symbols: [], relationships: [] }
        }

        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }

        // Get batch of changes
        const batch = this.changeQueue.splice(0, this.config.batchSize)
        
        // Group changes by type for efficient processing
        // const _grouped = this.groupChanges(batch)  // For future use
        
        // Calculate what needs to be updated
        const update: IndexUpdate = {
            files: [],
            symbols: [],
            relationships: []
        }

        for (const event of batch) {
            if (event.type === 'deleted') {
                // File deleted - remove from index
                update.files.push(event.path)
            } else if (event.type === 'modified' || event.type === 'created') {
                // File modified or created - re-index
                update.files.push(event.path)
                update.symbols.push(event.path)
                update.relationships.push(event.path)
            } else if (event.type === 'renamed' && event.oldPath) {
                // File renamed - update references
                update.files.push(event.path)
                update.files.push(event.oldPath)
                update.relationships.push(event.path)
            }
        }

        // Notify individual handlers
        for (const event of batch) {
            for (const [_, handler] of this.handlers) {
                try {
                    await handler(event)
                } catch (err) {
                    logger.agent.error('File change handler failed', {
                        error: err,
                        path: event.path
                    })
                }
            }
        }

        // Notify batch handlers
        for (const handler of this.batchHandlers) {
            try {
                await handler(batch)
            } catch (err) {
                logger.agent.error('Batch change handler failed', {
                    error: err,
                    batchSize: batch.length
                })
            }
        }

        this.lastUpdateTime = Date.now()

        logger.agent.debug('File changes processed', {
            processed: batch.length,
            remaining: this.changeQueue.length,
            filesToUpdate: update.files.length
        })

        return update
    }

    /**
     * Get statistics
     */
    getStats(): {
        pendingChanges: number
        totalHandlers: number
        batchHandlers: number
        lastUpdateTime: number
        isWatching: boolean
    } {
        return {
            pendingChanges: this.changeQueue.length,
            totalHandlers: this.handlers.size,
            batchHandlers: this.batchHandlers.length,
            lastUpdateTime: this.lastUpdateTime,
            isWatching: this.isWatching
        }
    }

    /**
     * Pause watching
     */
    pause(): void {
        this.isWatching = false
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        logger.agent.info('File watcher paused')
    }

    /**
     * Resume watching
     */
    resume(): void {
        this.isWatching = true
        logger.agent.info('File watcher resumed')
    }

    /**
     * Stop and cleanup
     */
    stop(): void {
        this.isWatching = false
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        this.changeQueue = []
        this.handlers.clear()
        this.batchHandlers = []
        logger.agent.info('File watcher stopped')
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<WatcherConfig>): void {
        this.config = { ...this.config, ...config }
        logger.agent.info('File watcher config updated', this.config)
    }

    // --- Private methods ---

    private shouldIgnore(filePath: string): boolean {
        return this.config.ignoredPatterns.some(pattern => pattern.test(filePath))
    }

    private debounceProcessing(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }

        this.debounceTimer = setTimeout(() => {
            this.processChanges().catch(err => {
                logger.agent.error('Failed to process file changes', err)
            })
        }, this.config.debounceMs)
    }

}

export const fileWatcherService = new FileWatcherService()
