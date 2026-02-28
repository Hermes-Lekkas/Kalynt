/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Task Complexity Estimation Service
 * 
 * Estimates task complexity based on various factors to enable
dynamic iteration allocation and resource planning.
 */

import { logger } from '../utils/logger'
import { intentClassificationService, type IntentClassification } from './intentClassificationService'

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex'

export interface ComplexityFactors {
    scope: number        // 1-10: How many files/components affected
    uncertainty: number  // 1-10: How well understood is the task
    dependencies: number // 1-10: Number of dependencies
    risk: number        // 1-10: Risk of breaking changes
    novelty: number     // 1-10: How novel/specialized is the task
}

export interface ComplexityEstimate {
    level: ComplexityLevel
    score: number        // 1-100 aggregate score
    factors: ComplexityFactors
    estimatedIterations: number
    estimatedDuration: number  // minutes
    recommendedApproach: 'direct' | 'step_by_step' | 'exploratory' | 'collaborative'
    confidence: number   // 0-1
}

export interface TaskAnalysis {
    text: string
    fileCount: number
    estimatedLines: number
    keywords: string[]
    hasTests: boolean
    hasDocumentation: boolean
}

class TaskComplexityService {
    private complexityPatterns = new Map<ComplexityLevel, RegExp[]>()

    constructor() {
        this.registerPatterns()
    }

    /**
     * Estimate complexity of a task
     */
    estimate(taskText: string, context?: {
        files?: string[]
        existingCode?: boolean
        hasTests?: boolean
    }): ComplexityEstimate {
        // Get intent classification
        const intent = intentClassificationService.classify(taskText)
        
        // Analyze task text
        const analysis = this.analyzeTask(taskText, context)
        
        // Calculate individual factors
        const factors = this.calculateFactors(analysis, intent, context)
        
        // Calculate aggregate score
        const score = this.calculateScore(factors)
        const level = this.scoreToLevel(score)
        
        // Estimate iterations and duration
        const estimatedIterations = this.estimateIterations(level, factors)
        const estimatedDuration = this.estimateDuration(level, factors)
        
        // Determine recommended approach
        const recommendedApproach = this.determineApproach(level, factors)
        
        const estimate: ComplexityEstimate = {
            level,
            score,
            factors,
            estimatedIterations,
            estimatedDuration,
            recommendedApproach,
            confidence: this.calculateConfidence(analysis)
        }

        logger.agent.debug('Complexity estimated', {
            level: estimate.level,
            score: estimate.score,
            iterations: estimate.estimatedIterations
        })

        return estimate
    }

    /**
     * Analyze task text for complexity indicators
     */
    private analyzeTask(text: string, context?: { files?: string[] }): TaskAnalysis {
        const lowerText = text.toLowerCase()
        
        // Count estimated files
        const fileCount = context?.files?.length || 
            (text.match(/\b(file|files|component|components|module|modules)\b/gi)?.length || 1)
        
        // Estimate lines of code
        const estimatedLines = fileCount * this.estimateLinesPerFile(text)
        
        // Extract keywords
        const keywords = this.extractKeywords(text)
        
        // Check for test mentions
        const hasTests = /\b(test|spec|testing|jest|vitest|cypress)\b/i.test(text)
        
        // Check for documentation mentions
        const hasDocumentation = /\b(document|doc|readme|comment|jsdoc)\b/i.test(text)

        return {
            text: lowerText,
            fileCount,
            estimatedLines,
            keywords,
            hasTests,
            hasDocumentation
        }
    }

    /**
     * Calculate complexity factors
     */
    private calculateFactors(
        analysis: TaskAnalysis,
        _intent: IntentClassification,
        context?: { existingCode?: boolean; hasTests?: boolean }
    ): ComplexityFactors {
        // Scope factor (1-10)
        let scope = Math.min(10, Math.max(1, analysis.fileCount))
        if (analysis.keywords.includes('refactor')) scope += 2
        if (analysis.keywords.includes('architecture')) scope += 3

        // Uncertainty factor (1-10)
        let uncertainty = 5
        if (analysis.keywords.includes('investigate')) uncertainty += 3
        if (analysis.keywords.includes('debug')) uncertainty += 2
        if (analysis.keywords.includes('error')) uncertainty += 2
        if (context?.existingCode === false) uncertainty += 2

        // Dependencies factor (1-10)
        let dependencies = Math.min(10, analysis.keywords.filter(k => 
            ['import', 'dependency', 'api', 'database', 'external'].includes(k)
        ).length * 2 + 3)

        // Risk factor (1-10)
        let risk = 3
        if (analysis.keywords.includes('production')) risk += 4
        if (analysis.keywords.includes('database')) risk += 3
        if (analysis.keywords.includes('security')) risk += 4
        if (!context?.hasTests) risk += 2

        // Novelty factor (1-10)
        let novelty = 3
        if (analysis.keywords.includes('research')) novelty += 4
        if (analysis.keywords.includes('new technology')) novelty += 3
        if (analysis.keywords.includes('algorithm')) novelty += 2

        return {
            scope: Math.min(10, scope),
            uncertainty: Math.min(10, uncertainty),
            dependencies: Math.min(10, dependencies),
            risk: Math.min(10, risk),
            novelty: Math.min(10, novelty)
        }
    }

    /**
     * Calculate aggregate complexity score
     */
    private calculateScore(factors: ComplexityFactors): number {
        // Weighted average of factors
        const weights = {
            scope: 0.25,
            uncertainty: 0.25,
            dependencies: 0.20,
            risk: 0.20,
            novelty: 0.10
        }

        const weightedSum = 
            factors.scope * weights.scope +
            factors.uncertainty * weights.uncertainty +
            factors.dependencies * weights.dependencies +
            factors.risk * weights.risk +
            factors.novelty * weights.novelty

        return Math.round(weightedSum * 10) // Scale to 1-100
    }

    /**
     * Convert score to complexity level
     */
    private scoreToLevel(score: number): ComplexityLevel {
        if (score <= 15) return 'trivial'
        if (score <= 35) return 'simple'
        if (score <= 55) return 'moderate'
        if (score <= 75) return 'complex'
        return 'very_complex'
    }

    /**
     * Estimate required iterations
     */
    private estimateIterations(level: ComplexityLevel, factors: ComplexityFactors): number {
        const baseIterations: Record<ComplexityLevel, number> = {
            trivial: 2,
            simple: 5,
            moderate: 10,
            complex: 20,
            very_complex: 35
        }

        let iterations = baseIterations[level]

        // Adjust based on uncertainty
        if (factors.uncertainty > 7) iterations += 5

        // Adjust based on risk
        if (factors.risk > 7) iterations += 3

        return Math.min(iterations, 50)  // Cap at 50
    }

    /**
     * Estimate duration in minutes
     */
    private estimateDuration(level: ComplexityLevel, factors: ComplexityFactors): number {
        const baseDuration: Record<ComplexityLevel, number> = {
            trivial: 5,
            simple: 15,
            moderate: 45,
            complex: 120,
            very_complex: 300
        }

        let duration = baseDuration[level]

        // Adjust for uncertainty
        duration *= (1 + (factors.uncertainty - 5) * 0.1)

        return Math.round(duration)
    }

    /**
     * Determine recommended approach
     */
    private determineApproach(
        level: ComplexityLevel,
        factors: ComplexityFactors
    ): ComplexityEstimate['recommendedApproach'] {
        if (factors.uncertainty > 7) return 'exploratory'
        if (factors.risk > 7) return 'collaborative'
        if (level === 'simple' || level === 'trivial') return 'direct'
        return 'step_by_step'
    }

    /**
     * Calculate confidence in estimate
     */
    private calculateConfidence(analysis: TaskAnalysis): number {
        let confidence = 0.7  // Base confidence

        // More files = less confidence
        if (analysis.fileCount > 5) confidence -= 0.1
        if (analysis.fileCount > 10) confidence -= 0.1

        // Vague keywords = less confidence
        const vagueKeywords = ['fix', 'improve', 'update', 'clean']
        const hasVague = analysis.keywords.some(k => vagueKeywords.includes(k))
        if (hasVague) confidence -= 0.1

        return Math.max(0.4, Math.min(0.95, confidence))
    }

    /**
     * Estimate lines per file based on task type
     */
    private estimateLinesPerFile(text: string): number {
        if (/\b(create|generate|scaffold)\b/i.test(text)) return 100
        if (/\b(refactor|restructure)\b/i.test(text)) return 50
        if (/\b(fix|bug|debug)\b/i.test(text)) return 20
        return 30
    }

    /**
     * Extract keywords from task text
     */
    private extractKeywords(text: string): string[] {
        const keywords = [
            'refactor', 'create', 'implement', 'fix', 'debug', 'test',
            'document', 'optimize', 'research', 'investigate', 'architecture',
            'database', 'api', 'security', 'performance', 'import', 'dependency',
            'component', 'module', 'function', 'class', 'interface'
        ]

        const lowerText = text.toLowerCase()
        return keywords.filter(k => lowerText.includes(k))
    }

    /**
     * Register complexity patterns
     */
    private registerPatterns(): void {
        this.complexityPatterns.set('trivial', [
            /\b(fix typo|update comment|rename variable)\b/i
        ])
        this.complexityPatterns.set('very_complex', [
            /\b(architect|redesign|migrate|rewrite)\b/i
        ])
    }

    /**
     * Compare two complexity estimates
     */
    compare(a: ComplexityEstimate, b: ComplexityEstimate): {
        harder: ComplexityEstimate
        difference: number
        factor: string
    } {
        const scoreDiff = b.score - a.score
        const harder = scoreDiff > 0 ? b : a
        
        // Find biggest factor difference
        const factorDiffs = {
            scope: Math.abs(b.factors.scope - a.factors.scope),
            uncertainty: Math.abs(b.factors.uncertainty - a.factors.uncertainty),
            dependencies: Math.abs(b.factors.dependencies - a.factors.dependencies),
            risk: Math.abs(b.factors.risk - a.factors.risk),
            novelty: Math.abs(b.factors.novelty - a.factors.novelty)
        }

        const biggestFactor = Object.entries(factorDiffs)
            .sort((a, b) => b[1] - a[1])[0][0]

        return {
            harder,
            difference: Math.abs(scoreDiff),
            factor: biggestFactor
        }
    }
}

export const taskComplexityService = new TaskComplexityService()
