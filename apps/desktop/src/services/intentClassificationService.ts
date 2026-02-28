/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Intent Classification Service - Task Type Recognition
 * 
 * Classifies user requests into task categories for optimized handling.
 * Enables routing to specialized handlers and appropriate tool selection.
 */

import { logger } from '../utils/logger'

export type TaskCategory = 
    | 'code_generation'
    | 'code_modification'
    | 'code_review'
    | 'debugging'
    | 'refactoring'
    | 'testing'
    | 'documentation'
    | 'exploration'
    | 'question'
    | 'configuration'
    | 'git_operation'
    | 'file_operation'
    | 'search'
    | 'complex_task'

export interface IntentClassification {
    category: TaskCategory
    confidence: number  // 0-1
    subCategory?: string
    complexity: 'simple' | 'medium' | 'complex'
    estimatedIterations: number
    preferredTools: string[]
    requiresUserConfirmation: boolean
    keywords: string[]
}

export interface ClassificationRule {
    category: TaskCategory
    patterns: RegExp[]
    keywords: string[]
    weight: number
    complexity: 'simple' | 'medium' | 'complex'
    preferredTools: string[]
    requiresConfirmation: boolean
}

class IntentClassificationService {
    private rules: ClassificationRule[] = []
    private classificationHistory: Array<{ input: string; classification: IntentClassification }> = []

    constructor() {
        this.registerDefaultRules()
    }

    /**
     * Classify a user request
     */
    classify(input: string): IntentClassification {
        const lowerInput = input.toLowerCase()
        const scores = new Map<TaskCategory, { score: number; matchedRules: ClassificationRule[] }>()

        // Score each category based on matching rules
        for (const rule of this.rules) {
            let matchScore = 0
            let matched = false

            // Check regex patterns
            for (const pattern of rule.patterns) {
                if (pattern.test(lowerInput)) {
                    matchScore += rule.weight * 2  // Patterns are stronger signals
                    matched = true
                }
            }

            // Check keywords
            for (const keyword of rule.keywords) {
                if (lowerInput.includes(keyword.toLowerCase())) {
                    matchScore += rule.weight
                    matched = true
                }
            }

            if (matched) {
                const existing = scores.get(rule.category)
                if (existing) {
                    existing.score += matchScore
                    existing.matchedRules.push(rule)
                } else {
                    scores.set(rule.category, { score: matchScore, matchedRules: [rule] })
                }
            }
        }

        // Find highest scoring category
        let bestCategory: TaskCategory = 'complex_task'
        let bestScore = 0
        let matchedRules: ClassificationRule[] = []

        for (const [category, data] of scores) {
            if (data.score > bestScore) {
                bestScore = data.score
                bestCategory = category
                matchedRules = data.matchedRules
            }
        }

        // Calculate confidence
        const totalScore = Array.from(scores.values()).reduce((sum, s) => sum + s.score, 0)
        const confidence = totalScore > 0 ? bestScore / totalScore : 0.5

        // Determine complexity
        const complexity = this.determineComplexity(lowerInput, bestCategory, matchedRules)

        // Estimate iterations
        const estimatedIterations = this.estimateIterations(complexity, bestCategory)

        // Collect preferred tools
        const preferredTools = [...new Set(matchedRules.flatMap(r => r.preferredTools))]

        // Check if user confirmation required
        const requiresUserConfirmation = matchedRules.some(r => r.requiresConfirmation) ||
            complexity === 'complex'

        // Extract keywords
        const keywords = this.extractKeywords(lowerInput)

        const classification: IntentClassification = {
            category: bestCategory,
            confidence: Math.min(confidence, 0.95),
            complexity,
            estimatedIterations,
            preferredTools: preferredTools.length > 0 ? preferredTools : this.getDefaultTools(bestCategory),
            requiresUserConfirmation,
            keywords
        }

        // Store in history
        this.classificationHistory.push({ input, classification })
        if (this.classificationHistory.length > 100) {
            this.classificationHistory.shift()
        }

        logger.agent.debug('Intent classified', { 
            category: classification.category, 
            confidence: classification.confidence,
            complexity: classification.complexity 
        })

        return classification
    }

    /**
     * Get classification history
     */
    getHistory(): Array<{ input: string; classification: IntentClassification }> {
        return [...this.classificationHistory]
    }

    /**
     * Get category statistics
     */
    getCategoryStats(): Record<TaskCategory, number> {
        const stats: Partial<Record<TaskCategory, number>> = {}
        
        for (const { classification } of this.classificationHistory) {
            stats[classification.category] = (stats[classification.category] || 0) + 1
        }

        return stats as Record<TaskCategory, number>
    }

    /**
     * Register a custom classification rule
     */
    registerRule(rule: ClassificationRule): void {
        this.rules.push(rule)
    }

    /**
     * Batch classify multiple inputs
     */
    classifyBatch(inputs: string[]): IntentClassification[] {
        return inputs.map(input => this.classify(input))
    }

    // --- Private methods ---

    private registerDefaultRules(): void {
        // Code Generation
        this.rules.push({
            category: 'code_generation',
            patterns: [
                /\b(create|generate|implement|write|build)\b.*\b(function|class|component|module|api)\b/i,
                /\badd\b.*\b(new|method|feature)\b/i,
                /\bscaffold\b/i
            ],
            keywords: ['create', 'generate', 'implement', 'write', 'build', 'add', 'new', 'function', 'class'],
            weight: 1.0,
            complexity: 'medium',
            preferredTools: ['writeFile', 'createFile', 'executeCode', 'getDiagnostics'],
            requiresConfirmation: false
        })

        // Code Modification
        this.rules.push({
            category: 'code_modification',
            patterns: [
                /\b(modify|update|change|edit|fix)\b.*\b(code|file|function|line)\b/i,
                /\breplace\b.*\b(with|in)\b/i,
                /\binsert\b.*\b(at|into)\b/i
            ],
            keywords: ['modify', 'update', 'change', 'edit', 'fix', 'replace', 'insert', 'move'],
            weight: 1.0,
            complexity: 'medium',
            preferredTools: ['readFile', 'replaceInFile', 'fuzzyReplace', 'writeFile', 'getDiagnostics'],
            requiresConfirmation: true
        })

        // Code Review
        this.rules.push({
            category: 'code_review',
            patterns: [
                /\b(review|check|analyze|examine|inspect)\b.*\b(code|file|quality)\b/i,
                /\b(find|identify)\b.*\b(issues|problems|bugs|smells)\b/i,
                /\bcode\s+review\b/i
            ],
            keywords: ['review', 'check', 'analyze', 'examine', 'inspect', 'find', 'issues', 'quality'],
            weight: 0.9,
            complexity: 'medium',
            preferredTools: ['readFile', 'searchFiles', 'getDiagnostics', 'searchRelevantContext'],
            requiresConfirmation: false
        })

        // Debugging
        this.rules.push({
            category: 'debugging',
            patterns: [
                /\b(debug|trace|investigate|figure\s+out)\b.*\b(error|issue|bug|problem)\b/i,
                /\bwhy\s+(is|does)\b/i,
                /\bwhat.*\b(wrong|error|broken)\b/i
            ],
            keywords: ['debug', 'trace', 'investigate', 'error', 'bug', 'issue', 'problem', 'fix'],
            weight: 1.1,
            complexity: 'complex',
            preferredTools: ['readFile', 'searchFiles', 'executeCode', 'runCommand', 'getDiagnostics'],
            requiresConfirmation: false
        })

        // Refactoring
        this.rules.push({
            category: 'refactoring',
            patterns: [
                /\b(refactor|restructure|reorganize|clean\s+up)\b/i,
                /\bextract\b.*\b(method|function|class|component)\b/i,
                /\brename\b.*\b(variable|function|class)\b/i,
                /\bmove\b.*\b(to|from)\b/i
            ],
            keywords: ['refactor', 'restructure', 'reorganize', 'cleanup', 'extract', 'rename', 'move'],
            weight: 1.0,
            complexity: 'complex',
            preferredTools: ['readFile', 'replaceInFile', 'fuzzyReplace', 'searchFiles', 'writeFile'],
            requiresConfirmation: true
        })

        // Testing
        this.rules.push({
            category: 'testing',
            patterns: [
                /\b(test|spec|unit\s+test|integration\s+test)\b/i,
                /\bwrite\b.*\btest/i,
                /\badd\b.*\b(test|coverage)\b/i
            ],
            keywords: ['test', 'spec', 'unit', 'integration', 'coverage', 'mock', 'assert'],
            weight: 0.9,
            complexity: 'medium',
            preferredTools: ['readFile', 'writeFile', 'executeCode', 'runCommand'],
            requiresConfirmation: false
        })

        // Documentation
        this.rules.push({
            category: 'documentation',
            patterns: [
                /\b(document|doc|comment|readme|changelog)\b/i,
                /\badd\b.*\b(comment|docstring|jsdoc)\b/i,
                /\bupdate\b.*\b(readme|docs)\b/i
            ],
            keywords: ['document', 'doc', 'comment', 'readme', 'changelog', 'jsdoc', 'docstring'],
            weight: 0.8,
            complexity: 'simple',
            preferredTools: ['readFile', 'writeFile', 'replaceInFile'],
            requiresConfirmation: false
        })

        // Exploration
        this.rules.push({
            category: 'exploration',
            patterns: [
                /\b(explore|browse|look\s+at|see|show)\b.*\b(code|file|structure)\b/i,
                /\bwhat.*\b(in|inside)\b/i,
                /\bhow\s+is\b.*\b(organized|structured)\b/i
            ],
            keywords: ['explore', 'browse', 'look', 'show', 'see', 'structure', 'organization'],
            weight: 0.7,
            complexity: 'simple',
            preferredTools: ['listDirectory', 'getFileTree', 'readFile', 'searchFiles'],
            requiresConfirmation: false
        })

        // Question
        this.rules.push({
            category: 'question',
            patterns: [
                /^(what|how|why|when|where|who|can|could|would|will|is|are|does|do)\b/i,
                /\?$/  // Ends with question mark
            ],
            keywords: ['what', 'how', 'why', 'when', 'where', 'explain', 'clarify'],
            weight: 0.8,
            complexity: 'simple',
            preferredTools: ['searchRelevantContext', 'readFile', 'searchFiles'],
            requiresConfirmation: false
        })

        // Configuration
        this.rules.push({
            category: 'configuration',
            patterns: [
                /\b(configure|setup|setting|config|environment|env)\b/i,
                /\bupdate\b.*\b(config|setting|json|yaml|toml)\b/i,
                /\bchange\b.*\b(port|host|url|endpoint)\b/i
            ],
            keywords: ['configure', 'setup', 'setting', 'config', 'environment', 'port', 'host'],
            weight: 0.9,
            complexity: 'simple',
            preferredTools: ['readFile', 'writeFile', 'replaceInFile'],
            requiresConfirmation: true
        })

        // Git Operations
        this.rules.push({
            category: 'git_operation',
            patterns: [
                /\b(git|commit|push|pull|branch|merge|rebase|stash)\b/i,
                /\bstage\b.*\b(file|change)\b/i,
                /\bcheckout\b.*\b(branch)\b/i
            ],
            keywords: ['git', 'commit', 'push', 'pull', 'branch', 'merge', 'stage', 'checkout'],
            weight: 0.9,
            complexity: 'simple',
            preferredTools: ['gitStatus', 'gitDiff', 'gitAdd', 'gitCommit', 'gitLog'],
            requiresConfirmation: true
        })

        // File Operations
        this.rules.push({
            category: 'file_operation',
            patterns: [
                /\b(create|delete|move|rename|copy)\b.*\b(file|folder|directory)\b/i,
                /\bnew\s+(file|folder)\b/i,
                /\bremove\b.*\b(file|directory)\b/i
            ],
            keywords: ['create', 'delete', 'move', 'rename', 'copy', 'file', 'folder', 'directory'],
            weight: 0.8,
            complexity: 'simple',
            preferredTools: ['createFile', 'createDirectory', 'delete', 'listDirectory'],
            requiresConfirmation: true
        })

        // Search
        this.rules.push({
            category: 'search',
            patterns: [
                /\b(find|search|locate|look\s+for)\b/i,
                /\bwhere\s+is\b/i,
                /\b(find|search)\b.*\b(all|every)\b/i
            ],
            keywords: ['find', 'search', 'locate', 'look for', 'grep'],
            weight: 0.8,
            complexity: 'simple',
            preferredTools: ['searchFiles', 'searchRelevantContext', 'getFileTree'],
            requiresConfirmation: false
        })

        // Complex Task (default fallback)
        this.rules.push({
            category: 'complex_task',
            patterns: [
                /\b(and|then|after|before|while)\b.*\b(and|then|after|before|while)\b/i,  // Multiple operations
                /\b(implement|create|build)\b.*\b(and|with)\b.*\b(test|doc|config)\b/i  // Multi-faceted
            ],
            keywords: ['implement', 'build', 'create', 'full', 'complete', 'end-to-end'],
            weight: 0.6,
            complexity: 'complex',
            preferredTools: ['readFile', 'writeFile', 'replaceInFile', 'executeCode', 'getDiagnostics'],
            requiresConfirmation: true
        })
    }

    private determineComplexity(
        input: string,
        category: TaskCategory,
        matchedRules: ClassificationRule[]
    ): 'simple' | 'medium' | 'complex' {
        // Check for complexity indicators
        const indicators = {
            complex: ['multiple', 'many', 'all', 'entire', 'refactor', 'redesign', 'architecture', 'migrate'],
            simple: ['typo', 'comment', 'rename', 'single', 'one', 'quick', 'simple']
        }

        const lowerInput = input.toLowerCase()

        if (indicators.complex.some(word => lowerInput.includes(word))) {
            return 'complex'
        }

        if (indicators.simple.some(word => lowerInput.includes(word))) {
            return 'simple'
        }

        // Use rule complexity
        if (matchedRules.length > 0) {
            const complexities = matchedRules.map(r => r.complexity)
            if (complexities.includes('complex')) return 'complex'
            if (complexities.includes('simple')) return 'simple'
        }

        // Default based on category
        const categoryComplexity: Record<TaskCategory, 'simple' | 'medium' | 'complex'> = {
            code_generation: 'medium',
            code_modification: 'medium',
            code_review: 'medium',
            debugging: 'complex',
            refactoring: 'complex',
            testing: 'medium',
            documentation: 'simple',
            exploration: 'simple',
            question: 'simple',
            configuration: 'simple',
            git_operation: 'simple',
            file_operation: 'simple',
            search: 'simple',
            complex_task: 'complex'
        }

        return categoryComplexity[category] || 'medium'
    }

    private estimateIterations(
        complexity: 'simple' | 'medium' | 'complex',
        category: TaskCategory
    ): number {
        const baseIterations = {
            simple: 3,
            medium: 8,
            complex: 15
        }

        // Adjust based on category
        const categoryMultiplier: Record<TaskCategory, number> = {
            code_generation: 1.0,
            code_modification: 1.2,
            code_review: 0.8,
            debugging: 1.5,
            refactoring: 1.3,
            testing: 1.0,
            documentation: 0.6,
            exploration: 0.7,
            question: 0.5,
            configuration: 0.8,
            git_operation: 0.6,
            file_operation: 0.5,
            search: 0.7,
            complex_task: 1.5
        }

        const base = baseIterations[complexity]
        const multiplier = categoryMultiplier[category] || 1.0

        return Math.round(base * multiplier)
    }

    private getDefaultTools(category: TaskCategory): string[] {
        const defaults: Record<TaskCategory, string[]> = {
            code_generation: ['writeFile', 'createFile', 'executeCode'],
            code_modification: ['readFile', 'replaceInFile', 'writeFile'],
            code_review: ['readFile', 'searchFiles'],
            debugging: ['readFile', 'executeCode', 'searchFiles'],
            refactoring: ['readFile', 'replaceInFile', 'searchFiles'],
            testing: ['executeCode', 'runCommand'],
            documentation: ['readFile', 'writeFile'],
            exploration: ['listDirectory', 'readFile'],
            question: ['searchRelevantContext', 'readFile'],
            configuration: ['readFile', 'writeFile'],
            git_operation: ['gitStatus', 'gitDiff'],
            file_operation: ['listDirectory', 'createFile'],
            search: ['searchFiles', 'getFileTree'],
            complex_task: ['readFile', 'writeFile', 'executeCode']
        }

        return defaults[category] || ['readFile', 'writeFile']
    }

    private extractKeywords(input: string): string[] {
        const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those'])

        return input
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && !commonWords.has(word))
            .slice(0, 10)  // Top 10 keywords
    }
}

export const intentClassificationService = new IntentClassificationService()
