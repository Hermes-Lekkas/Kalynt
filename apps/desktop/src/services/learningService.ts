/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Learning Service - Correction History & Adaptive Tool Selection
 * 
 * Tracks successful and failed corrections to improve agent performance over time.
 * Implements pattern matching for similar errors and adaptive tool selection.
 */

import { logger } from '../utils/logger'

export interface CorrectionRecord {
    id: string
    timestamp: number
    originalError: {
        type: string
        message: string
        filePath?: string
        lineNumber?: number
    }
    attemptedFix: {
        toolName: string
        params: Record<string, unknown>
        description: string
    }
    outcome: 'success' | 'failure' | 'partial'
    finalSolution?: {
        toolName: string
        params: Record<string, unknown>
        description: string
    }
    context: {
        language?: string
        fileType?: string
        taskCategory?: string
        relatedFiles: string[]
    }
    learningTags: string[]
}

export interface ErrorPattern {
    id: string
    errorSignature: string  // Normalized error pattern
    frequency: number
    successRate: number
    recommendedTools: string[]
    commonSolutions: Array<{
        description: string
        successRate: number
        usageCount: number
    }>
    lastOccurred: number
}

export interface AdaptationSuggestion {
    type: 'tool_preference' | 'parameter_adjustment' | 'approach_change'
    originalApproach: string
    suggestedApproach: string
    confidence: number
    reason: string
    basedOnRecords: number
}

class LearningService {
    private correctionHistory: CorrectionRecord[] = []
    private errorPatterns = new Map<string, ErrorPattern>()
    private maxHistorySize = 500

    /**
     * Record a correction attempt
     */
    recordCorrection(record: Omit<CorrectionRecord, 'id' | 'timestamp'>): CorrectionRecord {
        const fullRecord: CorrectionRecord = {
            ...record,
            id: `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: Date.now()
        }

        this.correctionHistory.push(fullRecord)

        // Trim history if needed
        if (this.correctionHistory.length > this.maxHistorySize) {
            this.correctionHistory.shift()
        }

        // Update error patterns
        this.updateErrorPattern(fullRecord)

        logger.agent.debug('Correction recorded', {
            errorType: record.originalError.type,
            outcome: record.outcome,
            toolUsed: record.attemptedFix.toolName
        })

        return fullRecord
    }

    /**
     * Find similar past corrections
     */
    findSimilarCorrections(
        errorType: string,
        errorMessage: string,
        context?: { language?: string; fileType?: string }
    ): CorrectionRecord[] {
        const signature = this.normalizeError(errorType, errorMessage)
        
        return this.correctionHistory
            .filter(record => {
                // Match error signature
                const recordSignature = this.normalizeError(
                    record.originalError.type,
                    record.originalError.message
                )
                const signatureMatch = this.calculateSimilarity(signature, recordSignature) > 0.7

                // Match context if provided
                let contextMatch = true
                if (context?.language && record.context.language) {
                    contextMatch = contextMatch && context.language === record.context.language
                }
                if (context?.fileType && record.context.fileType) {
                    contextMatch = contextMatch && context.fileType === record.context.fileType
                }

                return signatureMatch && contextMatch
            })
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10)
    }

    /**
     * Get recommended approach for an error
     */
    getRecommendedApproach(
        errorType: string,
        errorMessage: string
    ): {
        recommendedTool: string | null
        suggestedParams: Record<string, unknown> | null
        confidence: number
        similarCases: number
    } {
        const signature = this.normalizeError(errorType, errorMessage)
        const pattern = this.errorPatterns.get(signature)

        if (!pattern || pattern.frequency < 2) {
            return {
                recommendedTool: null,
                suggestedParams: null,
                confidence: 0,
                similarCases: 0
            }
        }

        // Get most successful solution (for future use)
        // const bestSolution = pattern.commonSolutions
        //     .sort((a, b) => b.successRate - a.successRate)[0]

        return {
            recommendedTool: pattern.recommendedTools[0] || null,
            suggestedParams: null,  // Would need to extract from solution patterns
            confidence: pattern.successRate,
            similarCases: pattern.frequency
        }
    }

    /**
     * Get adaptive tool selection based on error patterns
     */
    getAdaptiveToolSelection(
        currentTool: string,
        error: { type: string; message: string }
    ): AdaptationSuggestion | null {
        const similarCorrections = this.findSimilarCorrections(
            error.type,
            error.message
        )

        if (similarCorrections.length < 3) return null

        // Analyze patterns
        const toolOutcomes = new Map<string, { success: number; failure: number }>()
        
        for (const record of similarCorrections) {
            const tool = record.attemptedFix.toolName
            const existing = toolOutcomes.get(tool) || { success: 0, failure: 0 }
            
            if (record.outcome === 'success') {
                existing.success++
            } else {
                existing.failure++
            }
            
            toolOutcomes.set(tool, existing)
        }

        // Find best performing tool
        let bestTool = currentTool
        let bestRate = 0

        for (const [tool, outcomes] of toolOutcomes) {
            const total = outcomes.success + outcomes.failure
            if (total > 0) {
                const rate = outcomes.success / total
                if (rate > bestRate && tool !== currentTool) {
                    bestRate = rate
                    bestTool = tool
                }
            }
        }

        if (bestTool === currentTool || bestRate < 0.6) return null

        const totalCases = similarCorrections.length

        return {
            type: 'tool_preference',
            originalApproach: currentTool,
            suggestedApproach: bestTool,
            confidence: bestRate,
            reason: `${bestTool} succeeded ${(bestRate * 100).toFixed(0)}% of the time for similar errors`,
            basedOnRecords: totalCases
        }
    }

    /**
     * Get learning statistics
     */
    getStatistics(): {
        totalCorrections: number
        successRate: number
        patternsLearned: number
        mostCommonErrors: Array<{ type: string; count: number }>
        mostSuccessfulTools: Array<{ tool: string; successRate: number }>
    } {
        const total = this.correctionHistory.length
        const successes = this.correctionHistory.filter(r => r.outcome === 'success').length
        
        // Count error types
        const errorCounts = new Map<string, number>()
        for (const record of this.correctionHistory) {
            const type = record.originalError.type
            errorCounts.set(type, (errorCounts.get(type) || 0) + 1)
        }

        // Calculate tool success rates
        const toolStats = new Map<string, { success: number; total: number }>()
        for (const record of this.correctionHistory) {
            const tool = record.attemptedFix.toolName
            const stats = toolStats.get(tool) || { success: 0, total: 0 }
            stats.total++
            if (record.outcome === 'success') {
                stats.success++
            }
            toolStats.set(tool, stats)
        }

        return {
            totalCorrections: total,
            successRate: total > 0 ? successes / total : 0,
            patternsLearned: this.errorPatterns.size,
            mostCommonErrors: Array.from(errorCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => ({ type, count })),
            mostSuccessfulTools: Array.from(toolStats.entries())
                .map(([tool, stats]) => ({
                    tool,
                    successRate: stats.total > 0 ? stats.success / stats.total : 0
                }))
                .sort((a, b) => b.successRate - a.successRate)
                .slice(0, 5)
        }
    }

    /**
     * Get error patterns
     */
    getErrorPatterns(): ErrorPattern[] {
        return Array.from(this.errorPatterns.values())
            .sort((a, b) => b.frequency - a.frequency)
    }

    /**
     * Export learning data
     */
    exportData(): {
        corrections: CorrectionRecord[]
        patterns: ErrorPattern[]
    } {
        return {
            corrections: this.correctionHistory,
            patterns: Array.from(this.errorPatterns.values())
        }
    }

    /**
     * Import learning data
     */
    importData(data: {
        corrections: CorrectionRecord[]
        patterns: ErrorPattern[]
    }): void {
        this.correctionHistory = data.corrections.slice(-this.maxHistorySize)
        this.errorPatterns = new Map(data.patterns.map(p => [p.errorSignature, p]))
        logger.agent.info('Learning data imported', {
            corrections: data.corrections.length,
            patterns: data.patterns.length
        })
    }

    /**
     * Clear all learning data
     */
    reset(): void {
        this.correctionHistory = []
        this.errorPatterns.clear()
        logger.agent.info('Learning data reset')
    }

    // --- Private methods ---

    private normalizeError(type: string, message: string): string {
        // Create a normalized signature for error matching
        return `${type.toLowerCase()}:${message.toLowerCase()
            .replace(/['"`]/g, '')  // Remove quotes
            .replace(/\d+/g, '#')   // Normalize numbers
            .replace(/\s+/g, ' ')   // Normalize whitespace
            .trim()
            .substring(0, 100)}`   // Limit length
    }

    private calculateSimilarity(a: string, b: string): number {
        // Simple Levenshtein-based similarity
        const maxLength = Math.max(a.length, b.length)
        if (maxLength === 0) return 1

        const distance = this.levenshteinDistance(a, b)
        return 1 - distance / maxLength
    }

    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = []
        for (let i = 0; i <= b.length; i++) matrix[i] = [i]
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1]
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                }
            }
        }

        return matrix[b.length][a.length]
    }

    private updateErrorPattern(record: CorrectionRecord): void {
        const signature = this.normalizeError(
            record.originalError.type,
            record.originalError.message
        )

        let pattern = this.errorPatterns.get(signature)
        if (!pattern) {
            pattern = {
                id: `pattern-${Date.now()}`,
                errorSignature: signature,
                frequency: 0,
                successRate: 0,
                recommendedTools: [],
                commonSolutions: [],
                lastOccurred: Date.now()
            }
            this.errorPatterns.set(signature, pattern)
        }

        pattern.frequency++
        pattern.lastOccurred = Date.now()

        // Update recommended tools
        if (!pattern.recommendedTools.includes(record.attemptedFix.toolName)) {
            pattern.recommendedTools.push(record.attemptedFix.toolName)
        }

        // Update success rate
        const totalAttempts = this.correctionHistory.filter(
            r => this.normalizeError(r.originalError.type, r.originalError.message) === signature
        ).length

        const successes = this.correctionHistory.filter(
            r => this.normalizeError(r.originalError.type, r.originalError.message) === signature &&
                 r.outcome === 'success'
        ).length

        pattern.successRate = totalAttempts > 0 ? successes / totalAttempts : 0

        // Update common solutions
        const solutionDesc = record.attemptedFix.description
        const existingSolution = pattern.commonSolutions.find(s => s.description === solutionDesc)
        
        if (existingSolution) {
            existingSolution.usageCount++
            if (record.outcome === 'success') {
                const total = existingSolution.usageCount
                const currentSuccesses = existingSolution.successRate * (total - 1)
                existingSolution.successRate = (currentSuccesses + 1) / total
            }
        } else {
            pattern.commonSolutions.push({
                description: solutionDesc,
                successRate: record.outcome === 'success' ? 1 : 0,
                usageCount: 1
            })
        }
    }
}

export const learningService = new LearningService()
