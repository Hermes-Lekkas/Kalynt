/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Context Assembly Service - Priority-Based Context Management
 * 
 * Assembles context for LLM requests with priority-based inclusion,
 * critical context protection, and token budget management.
 */

import { logger } from '../utils/logger'

export interface ContextItem {
    id: string
    type: 'file' | 'symbol' | 'documentation' | 'conversation' | 'error' | 'custom'
    content: string
    priority: number  // 1-10, higher = more important
    tokens: number
    isCritical: boolean
    metadata?: {
        filePath?: string
        lineStart?: number
        lineEnd?: number
        symbolName?: string
        relevance?: number
    }
}

export interface AssemblyConfig {
    maxTokens: number
    criticalTokenBudget: number  // Reserve for critical items
    minPriorityThreshold: number
    prioritizeRecent: boolean
    deduplicate: boolean
}

export interface AssemblyResult {
    items: ContextItem[]
    totalTokens: number
    criticalTokens: number
    regularTokens: number
    includedCount: number
    excludedCount: number
    coverage: number  // Percentage of critical items included
}

export interface TokenEstimate {
    input: string
    tokens: number
    chars: number
}

class ContextAssemblyService {
    private config: AssemblyConfig = {
        maxTokens: 8000,
        criticalTokenBudget: 2000,
        minPriorityThreshold: 3,
        prioritizeRecent: true,
        deduplicate: true
    }

    // Approximate tokens per character ratio
    private readonly TOKEN_RATIO = 0.25

    /**
     * Initialize the service
     */
    initialize(config?: Partial<AssemblyConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        logger.agent.info('Context assembly service initialized', this.config)
    }

    /**
     * Assemble context from available items
     */
    assemble(items: ContextItem[]): AssemblyResult {
        if (items.length === 0) {
            return {
                items: [],
                totalTokens: 0,
                criticalTokens: 0,
                regularTokens: 0,
                includedCount: 0,
                excludedCount: 0,
                coverage: 100
            }
        }

        // Calculate tokens for items that don't have them
        const itemsWithTokens = items.map(item => ({
            ...item,
            tokens: item.tokens || this.estimateTokens(item.content)
        }))

        // Separate critical and regular items
        const criticalItems = itemsWithTokens.filter(i => i.isCritical)
        const regularItems = itemsWithTokens.filter(i => !i.isCritical)

        // Sort by priority (descending)
        const sortedCritical = this.sortByPriority(criticalItems)
        const sortedRegular = this.sortByPriority(regularItems)

        // Calculate available budget
        const availableBudget = this.config.maxTokens
        const criticalBudget = Math.min(
            this.config.criticalTokenBudget,
            availableBudget * 0.3  // Max 30% for critical
        )
        // Regular budget is what's left after critical allocation
        // const _regularBudget = availableBudget - criticalBudget

        // Select critical items
        const selectedCritical: ContextItem[] = []
        let criticalTokenCount = 0

        for (const item of sortedCritical) {
            if (criticalTokenCount + item.tokens <= criticalBudget) {
                selectedCritical.push(item)
                criticalTokenCount += item.tokens
            } else if (item.isCritical) {
                // Try to include at least partial content for critical items
                const remainingTokens = criticalBudget - criticalTokenCount
                if (remainingTokens > 100) {
                    const truncatedItem = this.truncateItem(item, remainingTokens)
                    selectedCritical.push(truncatedItem)
                    criticalTokenCount += truncatedItem.tokens
                }
            }
        }

        // Select regular items
        const selectedRegular: ContextItem[] = []
        let regularTokenCount = 0

        for (const item of sortedRegular) {
            // Skip if below priority threshold
            if (item.priority < this.config.minPriorityThreshold) {
                continue
            }

            const totalTokens = criticalTokenCount + regularTokenCount + item.tokens
            
            if (totalTokens <= availableBudget) {
                selectedRegular.push(item)
                regularTokenCount += item.tokens
            }
        }

        // Combine and deduplicate if enabled
        let finalItems = [...selectedCritical, ...selectedRegular]
        
        if (this.config.deduplicate) {
            finalItems = this.deduplicate(finalItems)
        }

        const totalTokens = criticalTokenCount + regularTokenCount
        const criticalCoverage = criticalItems.length > 0
            ? (selectedCritical.length / criticalItems.length) * 100
            : 100

        logger.agent.debug('Context assembled', {
            totalItems: items.length,
            included: finalItems.length,
            excluded: items.length - finalItems.length,
            totalTokens,
            criticalCoverage: criticalCoverage.toFixed(1) + '%'
        })

        return {
            items: finalItems,
            totalTokens,
            criticalTokens: criticalTokenCount,
            regularTokens: regularTokenCount,
            includedCount: finalItems.length,
            excludedCount: items.length - finalItems.length,
            coverage: criticalCoverage
        }
    }

    /**
     * Assemble context with a specific focus (e.g., on a file or symbol)
     */
    assembleWithFocus(
        items: ContextItem[],
        focus: {
            filePath?: string
            symbolName?: string
            lineNumber?: number
        }
    ): AssemblyResult {
        // Boost priority for related items
        const boostedItems = items.map(item => {
            let priorityBoost = 0

            if (focus.filePath && item.metadata?.filePath === focus.filePath) {
                priorityBoost += 3
            }

            if (focus.symbolName && item.metadata?.symbolName === focus.symbolName) {
                priorityBoost += 4
            }

            if (focus.lineNumber && item.metadata?.lineStart !== undefined) {
                const distance = Math.abs(item.metadata.lineStart - focus.lineNumber)
                if (distance < 10) priorityBoost += 2
                else if (distance < 50) priorityBoost += 1
            }

            return {
                ...item,
                priority: Math.min(10, item.priority + priorityBoost)
            }
        })

        return this.assemble(boostedItems)
    }

    /**
     * Estimate token count for text
     */
    estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length * this.TOKEN_RATIO)
    }

    /**
     * Estimate tokens for multiple inputs
     */
    estimateBatch(inputs: string[]): TokenEstimate[] {
        return inputs.map(input => ({
            input: input.substring(0, 100),
            tokens: this.estimateTokens(input),
            chars: input.length
        }))
    }

    /**
     * Add critical context protection - ensures critical items are always included
     */
    protectCriticalContext(
        currentAssembly: AssemblyResult,
        criticalItems: ContextItem[]
    ): AssemblyResult {
        // Check which critical items are missing
        const currentIds = new Set(currentAssembly.items.map(i => i.id))
        const missingCritical = criticalItems.filter(i => !currentIds.has(i.id))

        if (missingCritical.length === 0) {
            return currentAssembly
        }

        // Calculate space needed
        const neededTokens = missingCritical.reduce((sum, i) => 
            sum + (i.tokens || this.estimateTokens(i.content)), 0
        )

        // If we have space, add them
        if (currentAssembly.totalTokens + neededTokens <= this.config.maxTokens) {
            const newItems = [...currentAssembly.items, ...missingCritical]
            const newTotal = currentAssembly.totalTokens + neededTokens

            return {
                ...currentAssembly,
                items: newItems,
                totalTokens: newTotal,
                criticalTokens: currentAssembly.criticalTokens + neededTokens,
                includedCount: newItems.length,
                coverage: 100
            }
        }

        // Otherwise, we need to make room by removing lower priority items
        const sortedItems = [...currentAssembly.items]
            .filter(i => !i.isCritical)  // Keep existing critical
            .sort((a, b) => a.priority - b.priority)

        let freedTokens = 0
        const itemsToRemove = new Set<string>()

        for (const item of sortedItems) {
            if (freedTokens >= neededTokens) break
            freedTokens += item.tokens
            itemsToRemove.add(item.id)
        }

        const remainingItems = currentAssembly.items.filter(i => !itemsToRemove.has(i.id))
        const newItems = [...remainingItems, ...missingCritical]
        const newTotal = remainingItems.reduce((sum, i) => sum + i.tokens, 0) +
                         missingCritical.reduce((sum, i) => sum + (i.tokens || this.estimateTokens(i.content)), 0)

        return {
            ...currentAssembly,
            items: newItems,
            totalTokens: newTotal,
            includedCount: newItems.length,
            excludedCount: currentAssembly.excludedCount + itemsToRemove.size,
            coverage: 100
        }
    }

    /**
     * Optimize context for a specific token budget
     */
    optimizeForBudget(
        items: ContextItem[],
        targetTokens: number
    ): AssemblyResult {
        const originalMax = this.config.maxTokens
        this.config.maxTokens = targetTokens
        
        const result = this.assemble(items)
        
        this.config.maxTokens = originalMax
        return result
    }

    /**
     * Get statistics about context usage
     */
    getStats(items: ContextItem[]): {
        totalItems: number
        totalTokens: number
        criticalItems: number
        criticalTokens: number
        averagePriority: number
        byType: Record<string, number>
    } {
        const totalTokens = items.reduce((sum, i) => 
            sum + (i.tokens || this.estimateTokens(i.content)), 0
        )
        const criticalItems = items.filter(i => i.isCritical)
        const criticalTokens = criticalItems.reduce((sum, i) => 
            sum + (i.tokens || this.estimateTokens(i.content)), 0
        )
        const averagePriority = items.length > 0
            ? items.reduce((sum, i) => sum + i.priority, 0) / items.length
            : 0

        const byType: Record<string, number> = {}
        for (const item of items) {
            byType[item.type] = (byType[item.type] || 0) + 1
        }

        return {
            totalItems: items.length,
            totalTokens,
            criticalItems: criticalItems.length,
            criticalTokens,
            averagePriority,
            byType
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<AssemblyConfig>): void {
        this.config = { ...this.config, ...config }
        logger.agent.info('Context assembly config updated', this.config)
    }

    // --- Private helpers ---

    private sortByPriority(items: ContextItem[]): ContextItem[] {
        return [...items].sort((a, b) => {
            // First by priority (descending)
            if (b.priority !== a.priority) {
                return b.priority - a.priority
            }
            
            // Then by critical flag
            if (b.isCritical !== a.isCritical) {
                return b.isCritical ? 1 : -1
            }
            
            return 0
        })
    }

    private truncateItem(item: ContextItem, maxTokens: number): ContextItem {
        const maxChars = Math.floor(maxTokens / this.TOKEN_RATIO)
        const truncatedContent = item.content.substring(0, maxChars) + '\n... [truncated]'
        
        return {
            ...item,
            content: truncatedContent,
            tokens: this.estimateTokens(truncatedContent)
        }
    }

    private deduplicate(items: ContextItem[]): ContextItem[] {
        const seen = new Set<string>()
        const unique: ContextItem[] = []

        for (const item of items) {
            const key = `${item.type}:${item.metadata?.filePath}:${item.metadata?.lineStart}`
            
            if (!seen.has(key)) {
                seen.add(key)
                unique.push(item)
            }
        }

        return unique
    }
}

export const contextAssemblyService = new ContextAssemblyService()
