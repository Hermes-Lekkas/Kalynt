/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Tool Cache Service - LRU cache for tool execution results
 * 
 * Prevents redundant file reads and other expensive operations
 * within the same agent loop iteration. Automatically invalidates
 * when files are modified.
 */

import { logger } from '../utils/logger'

interface CacheEntry<T> {
    value: T
    timestamp: number
    accessCount: number
    lastAccessed: number
}

interface CacheStats {
    hits: number
    misses: number
    evictions: number
    size: number
    maxSize: number
}

class ToolCacheService {
    private cache = new Map<string, CacheEntry<unknown>>()
    private maxSize: number
    private ttlMs: number
    private stats: CacheStats
    private invalidatedKeys = new Set<string>()

    // Track file modifications for cache invalidation
    private fileDependencies = new Map<string, Set<string>>() // filePath -> cache keys

    constructor(maxSize: number = 100, ttlMs: number = 300000) { // 5 min default TTL
        this.maxSize = maxSize
        this.ttlMs = ttlMs
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            size: 0,
            maxSize
        }
    }

    /**
     * Get a cached value
     */
    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key)
        
        if (!entry) {
            this.stats.misses++
            return undefined
        }

        // Check TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key)
            this.stats.misses++
            this.updateSize()
            return undefined
        }

        // Check if invalidated
        if (this.invalidatedKeys.has(key)) {
            this.cache.delete(key)
            this.invalidatedKeys.delete(key)
            this.stats.misses++
            this.updateSize()
            return undefined
        }

        // Update access stats
        entry.accessCount++
        entry.lastAccessed = Date.now()
        
        this.stats.hits++
        return entry.value as T
    }

    /**
     * Store a value in the cache
     */
    set<T>(key: string, value: T, dependencies?: string[]): void {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU()
        }

        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: Date.now()
        }

        this.cache.set(key, entry as CacheEntry<unknown>)

        // Track file dependencies for invalidation
        if (dependencies) {
            for (const filePath of dependencies) {
                if (!this.fileDependencies.has(filePath)) {
                    this.fileDependencies.set(filePath, new Set())
                }
                this.fileDependencies.get(filePath)!.add(key)
            }
        }

        this.updateSize()
    }

    /**
     * Invalidate cache entries related to a file
     */
    invalidateFile(filePath: string): void {
        const keys = this.fileDependencies.get(filePath)
        if (keys) {
            for (const key of keys) {
                this.invalidatedKeys.add(key)
                logger.agent.debug('Cache entry invalidated', { key, filePath })
            }
            this.fileDependencies.delete(filePath)
        }
    }

    /**
     * Invalidate a specific cache key
     */
    invalidate(key: string): void {
        this.invalidatedKeys.add(key)
    }

    /**
     * Check if a key exists in cache
     */
    has(key: string): boolean {
        return this.cache.has(key) && !this.invalidatedKeys.has(key)
    }

    /**
     * Clear all cached values
     */
    clear(): void {
        this.cache.clear()
        this.invalidatedKeys.clear()
        this.fileDependencies.clear()
        this.updateSize()
        logger.agent.debug('Tool cache cleared')
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats }
    }

    /**
     * Get hit rate percentage
     */
    getHitRate(): number {
        const total = this.stats.hits + this.stats.misses
        return total > 0 ? (this.stats.hits / total) * 100 : 0
    }

    /**
     * Generate a cache key for a tool call
     */
    generateKey(toolName: string, params: Record<string, unknown>): string {
        const sortedParams = Object.keys(params)
            .sort()
            .map(k => `${k}:${JSON.stringify(params[k])}`)
            .join('|')
        return `${toolName}(${sortedParams})`
    }

    /**
     * Wrap a tool function with caching
     */
    wrap<T extends Record<string, unknown>, R>(
        toolName: string,
        fn: (params: T) => Promise<R>,
        getDependencies?: (params: T, result: R) => string[]
    ): (params: T) => Promise<R> {
        return async (params: T): Promise<R> => {
            const cacheKey = this.generateKey(toolName, params)
            
            // Try cache first
            const cached = this.get<R>(cacheKey)
            if (cached !== undefined) {
                logger.agent.debug('Cache hit', { toolName, cacheKey })
                return cached
            }

            // Execute and cache
            const result = await fn(params)
            
            const dependencies = getDependencies ? getDependencies(params, result) : undefined
            this.set(cacheKey, result, dependencies)
            
            logger.agent.debug('Cache miss - stored', { toolName, cacheKey })
            return result
        }
    }

    /**
     * Evict least recently used entry
     */
    private evictLRU(): void {
        let oldestKey: string | null = null
        let oldestTime = Infinity

        for (const [key, entry] of this.cache) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed
                oldestKey = key
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey)
            this.stats.evictions++
            
            // Clean up file dependencies
            for (const [filePath, keys] of this.fileDependencies) {
                if (keys.has(oldestKey)) {
                    keys.delete(oldestKey)
                    if (keys.size === 0) {
                        this.fileDependencies.delete(filePath)
                    }
                }
            }
            
            logger.agent.debug('LRU eviction', { key: oldestKey })
        }
    }

    /**
     * Update size statistic
     */
    private updateSize(): void {
        this.stats.size = this.cache.size
    }

    /**
     * Get cache contents summary (for debugging)
     */
    getSummary(): Array<{ key: string; age: number; accessCount: number }> {
        const now = Date.now()
        return Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            age: now - entry.timestamp,
            accessCount: entry.accessCount
        }))
    }

    /**
     * Preload cache with values
     */
    preload<T>(entries: Array<{ key: string; value: T; dependencies?: string[] }>): void {
        for (const entry of entries) {
            this.set(entry.key, entry.value, entry.dependencies)
        }
        logger.agent.debug('Cache preloaded', { count: entries.length })
    }
}

// Export singleton instance for agent loop
export const toolCacheService = new ToolCacheService()

// Export class for custom instances
export { ToolCacheService }
