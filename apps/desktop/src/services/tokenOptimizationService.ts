/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Token Optimization Service - Context Window Optimization
 * 
 * Optimizes token usage for LLM context windows through intelligent
 * compression, summarization strategies, and window management.
 */

import { logger } from '../utils/logger'

export interface CompressionStrategy {
    name: string
    compress: (text: string, targetRatio: number) => string
    preserve?: (text: string, preservePatterns: RegExp[]) => string
}

export interface WindowConfig {
    maxInputTokens: number
    maxOutputTokens: number
    reservedTokens: number
    bufferRatio: number
}

export interface OptimizationResult {
    originalTokens: number
    optimizedTokens: number
    compressionRatio: number
    strategies: string[]
    quality: number  // 0-1, estimated preservation of meaning
}

export interface ConversationWindow {
    messages: Array<{
        role: 'user' | 'assistant' | 'system'
        content: string
        tokens: number
        timestamp: number
        priority: number
    }>
    totalTokens: number
    maxTokens: number
}

class TokenOptimizationService {
    private config: WindowConfig = {
        maxInputTokens: 8000,
        maxOutputTokens: 2000,
        reservedTokens: 500,
        bufferRatio: 0.9
    }

    private strategies: Map<string, CompressionStrategy> = new Map()

    constructor() {
        this.registerDefaultStrategies()
    }

    /**
     * Initialize the service
     */
    initialize(config?: Partial<WindowConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config }
        }
        logger.agent.info('Token optimization service initialized', this.config)
    }

    /**
     * Optimize text to fit within token budget
     */
    optimize(text: string, maxTokens?: number): OptimizationResult {
        const targetTokens = maxTokens || this.getAvailableTokens()
        const originalTokens = this.estimateTokens(text)

        if (originalTokens <= targetTokens) {
            return {
                originalTokens,
                optimizedTokens: originalTokens,
                compressionRatio: 1,
                strategies: [],
                quality: 1
            }
        }

        const targetRatio = targetTokens / originalTokens
        const strategies: string[] = []
        let optimized = text
        let quality = 1

        // Apply strategies in order of preference
        if (targetRatio < 0.5) {
            // Aggressive compression needed
            optimized = this.applyStrategy(optimized, 'aggressive_summarization', 0.5)
            strategies.push('aggressive_summarization')
            quality *= 0.7
        }

        if (this.estimateTokens(optimized) > targetTokens) {
            optimized = this.applyStrategy(optimized, 'remove_comments', 0.9)
            strategies.push('remove_comments')
        }

        if (this.estimateTokens(optimized) > targetTokens) {
            optimized = this.applyStrategy(optimized, 'remove_whitespace', 0.95)
            strategies.push('remove_whitespace')
        }

        if (this.estimateTokens(optimized) > targetTokens) {
            optimized = this.applyStrategy(optimized, 'truncate_end', targetRatio)
            strategies.push('truncate_end')
            quality *= 0.8
        }

        const optimizedTokens = this.estimateTokens(optimized)

        return {
            originalTokens,
            optimizedTokens,
            compressionRatio: optimizedTokens / originalTokens,
            strategies,
            quality
        }
    }

    /**
     * Manage conversation window - trim old messages to fit
     */
    manageConversationWindow(window: ConversationWindow): ConversationWindow {
        const availableTokens = this.getAvailableTokens()
        
        if (window.totalTokens <= availableTokens) {
            return window
        }

        // Sort by priority and recency
        const sortedMessages = [...window.messages].sort((a, b) => {
            // Keep system messages
            if (a.role === 'system' && b.role !== 'system') return -1
            if (b.role === 'system' && a.role !== 'system') return 1
            
            // Then by priority
            if (b.priority !== a.priority) {
                return b.priority - a.priority
            }
            
            // Then by recency
            return b.timestamp - a.timestamp
        })

        const keptMessages: typeof window.messages = []
        let currentTokens = 0

        for (const msg of sortedMessages) {
            if (currentTokens + msg.tokens <= availableTokens) {
                keptMessages.push(msg)
                currentTokens += msg.tokens
            } else if (msg.role === 'system') {
                // Always try to keep system messages by truncating if needed
                const remainingTokens = availableTokens - currentTokens
                if (remainingTokens > 50) {
                    const truncated = this.truncateToTokens(msg.content, remainingTokens)
                    keptMessages.push({
                        ...msg,
                        content: truncated,
                        tokens: this.estimateTokens(truncated)
                    })
                    currentTokens += this.estimateTokens(truncated)
                }
            }
        }

        // Sort back to original order
        keptMessages.sort((a, b) => a.timestamp - b.timestamp)

        return {
            messages: keptMessages,
            totalTokens: currentTokens,
            maxTokens: window.maxTokens
        }
    }

    /**
     * Summarize long content
     */
    summarize(content: string, maxLength: number = 500): string {
        const lines = content.split('\n')
        
        if (lines.length <= 10) {
            return content
        }

        // Keep first 3 lines
        const start = lines.slice(0, 3)
        
        // Keep last 3 lines
        const end = lines.slice(-3)
        
        // Add summary of middle section
        const middle = lines.slice(3, -3)
        const summary = `\n... (${middle.length} lines omitted) ...\n`

        return [...start, summary, ...end].join('\n').substring(0, maxLength)
    }

    /**
     * Estimate token count
     */
    estimateTokens(text: string): number {
        // GPT-style tokenization estimate: ~4 chars per token
        // This is a rough approximation
        let tokens = 0
        
        // Count words (roughly 0.75 tokens per word)
        const words = text.split(/\s+/)
        tokens += words.length * 0.75
        
        // Count special characters/punctuation
        const specialChars = text.match(/[^\w\s]/g)
        if (specialChars) {
            tokens += specialChars.length * 0.25
        }
        
        // Add overhead for code blocks
        const codeBlocks = text.match(/```[\s\S]*?```/g)
        if (codeBlocks) {
            tokens += codeBlocks.length * 2  // Newline overhead
        }

        return Math.ceil(tokens)
    }

    /**
     * Register a custom compression strategy
     */
    registerStrategy(strategy: CompressionStrategy): void {
        this.strategies.set(strategy.name, strategy)
    }

    /**
     * Get available tokens for input
     */
    getAvailableTokens(): number {
        return Math.floor(
            (this.config.maxInputTokens - this.config.reservedTokens) * 
            this.config.bufferRatio
        )
    }

    /**
     * Check if content fits within budget
     */
    fitsInBudget(text: string, budget?: number): boolean {
        const tokens = this.estimateTokens(text)
        const limit = budget || this.getAvailableTokens()
        return tokens <= limit
    }

    /**
     * Calculate optimal chunk size for splitting content
     */
    calculateChunkSize(totalTokens: number, maxChunkTokens?: number): number {
        const maxChunk = maxChunkTokens || this.getAvailableTokens()
        const numChunks = Math.ceil(totalTokens / maxChunk)
        return Math.ceil(totalTokens / numChunks)
    }

    /**
     * Split content into chunks that fit within token budget
     */
    chunkContent(content: string, maxChunkTokens?: number): string[] {
        const maxChunk = maxChunkTokens || this.getAvailableTokens()
        const lines = content.split('\n')
        const chunks: string[] = []
        let currentChunk: string[] = []
        let currentTokens = 0

        for (const line of lines) {
            const lineTokens = this.estimateTokens(line)

            if (currentTokens + lineTokens > maxChunk && currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'))
                currentChunk = [line]
                currentTokens = lineTokens
            } else {
                currentChunk.push(line)
                currentTokens += lineTokens
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'))
        }

        return chunks
    }

    /**
     * Get optimization statistics
     */
    getStats(texts: string[]): {
        totalTexts: number
        totalTokens: number
        averageTokens: number
        maxTokens: number
        minTokens: number
    } {
        const tokenCounts = texts.map(t => this.estimateTokens(t))
        
        return {
            totalTexts: texts.length,
            totalTokens: tokenCounts.reduce((a, b) => a + b, 0),
            averageTokens: tokenCounts.length > 0 
                ? tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length 
                : 0,
            maxTokens: Math.max(...tokenCounts, 0),
            minTokens: Math.min(...tokenCounts, Infinity)
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<WindowConfig>): void {
        this.config = { ...this.config, ...config }
        logger.agent.info('Token optimization config updated', this.config)
    }

    // --- Private helpers ---

    private registerDefaultStrategies(): void {
        this.strategies.set('remove_comments', {
            name: 'remove_comments',
            compress: (text) => {
                // Remove line comments
                return text.replace(/\/\/.*$/gm, '')
                    // Remove block comments
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    // Clean up extra whitespace
                    .replace(/\n\s*\n/g, '\n')
            }
        })

        this.strategies.set('remove_whitespace', {
            name: 'remove_whitespace',
            compress: (text) => {
                return text
                    .replace(/[ \t]+/g, ' ')  // Multiple spaces to single
                    .replace(/\n\s*\n/g, '\n')  // Empty lines
                    .trim()
            }
        })

        this.strategies.set('aggressive_summarization', {
            name: 'aggressive_summarization',
            compress: (text, ratio) => {
                const targetLength = Math.floor(text.length * ratio)
                return this.summarize(text, targetLength)
            }
        })

        this.strategies.set('truncate_end', {
            name: 'truncate_end',
            compress: (text, ratio) => {
                const targetLength = Math.floor(text.length * ratio)
                return text.substring(0, targetLength) + '\n... [truncated]'
            }
        })
    }

    private applyStrategy(text: string, strategyName: string, targetRatio: number): string {
        const strategy = this.strategies.get(strategyName)
        if (!strategy) {
            return text
        }
        return strategy.compress(text, targetRatio)
    }

    private truncateToTokens(text: string, maxTokens: number): string {
        // Rough estimate: 4 chars per token
        const maxChars = Math.floor(maxTokens * 4)
        if (text.length <= maxChars) {
            return text
        }
        return text.substring(0, maxChars - 20) + '... [truncated]'
    }
}

export const tokenOptimizationService = new TokenOptimizationService()
