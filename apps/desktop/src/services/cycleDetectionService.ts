/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Cycle Detection Service - Prevents infinite loops in agent reasoning
 * 
 * Detects when the agent is stuck in repetitive patterns:
 * - Same tool sequence repeated
 * - Oscillating between states
 * - Repeated identical responses
 * 
 * Provides strategies to break cycles and get the agent unstuck.
 */

import { logger } from '../utils/logger'

export interface StateFingerprint {
    toolCalls: string[]  // Sequence of tool names
    fileOperations: string[]  // Files being operated on
    responseHash: string  // Hash of LLM response
    iteration: number
}

export interface DetectedCycle {
    type: 'repetition' | 'oscillation' | 'stagnation'
    iterations: number[]  // Iteration numbers involved
    fingerprint: StateFingerprint
    severity: 'low' | 'medium' | 'high'
    suggestedAction: CycleBreakStrategy
}

export type CycleBreakStrategy = 
    | { type: 'alternative_tool'; currentTool: string; suggestedTool: string }
    | { type: 'increase_temperature'; current: number; suggested: number }
    | { type: 'simplify_request'; reason: string }
    | { type: 'ask_clarification'; question: string }
    | { type: 'reset_context'; preserveFiles: string[] }
    | { type: 'escalate_to_user'; explanation: string }

interface CycleHistory {
    fingerprints: Map<string, number[]>  // hash -> iteration numbers
    recentToolSequences: string[][]
    maxHistory: number
}

class CycleDetectionService {
    private history: CycleHistory = {
        fingerprints: new Map(),
        recentToolSequences: [],
        maxHistory: 50
    }

    private currentRunId: string | null = null
    private iteration = 0
    private detectedCycles: DetectedCycle[] = []

    /**
     * Start a new detection session
     */
    startRun(runId: string): void {
        this.currentRunId = runId
        this.iteration = 0
        this.detectedCycles = []
        this.history.fingerprints.clear()
        this.history.recentToolSequences = []
        logger.agent.debug('Cycle detection started', { runId })
    }

    /**
     * End the current detection session
     */
    endRun(): DetectedCycle[] {
        const cycles = [...this.detectedCycles]
        this.currentRunId = null
        this.iteration = 0
        this.detectedCycles = []
        return cycles
    }

    /**
     * Record a state fingerprint for the current iteration
     */
    recordState(
        toolCalls: string[],
        fileOperations: string[],
        responseContent: string
    ): DetectedCycle | null {
        if (!this.currentRunId) return null

        this.iteration++

        // Create fingerprint
        const fingerprint: StateFingerprint = {
            toolCalls: [...toolCalls],
            fileOperations: [...fileOperations],
            responseHash: this.hashString(responseContent),
            iteration: this.iteration
        }

        // Check for cycles
        const cycle = this.detectCycle(fingerprint)
        if (cycle) {
            this.detectedCycles.push(cycle)
            logger.agent.warn('Cycle detected', { 
                type: cycle.type, 
                iterations: cycle.iterations,
                severity: cycle.severity 
            })
            return cycle
        }

        // Store fingerprint
        this.storeFingerprint(fingerprint)

        // Store tool sequence for pattern analysis
        this.history.recentToolSequences.push([...toolCalls])
        if (this.history.recentToolSequences.length > this.history.maxHistory) {
            this.history.recentToolSequences.shift()
        }

        return null
    }

    /**
     * Detect if current fingerprint indicates a cycle
     */
    private detectCycle(fingerprint: StateFingerprint): DetectedCycle | null {
        // Check for exact repetition
        const hash = this.hashFingerprint(fingerprint)
        const existingIterations = this.history.fingerprints.get(hash)
        
        if (existingIterations && existingIterations.length >= 2) {
            // This exact state has occurred before
            const cycle: DetectedCycle = {
                type: 'repetition',
                iterations: [...existingIterations, this.iteration],
                fingerprint,
                severity: this.calculateSeverity(existingIterations.length + 1),
                suggestedAction: this.suggestBreakStrategy(fingerprint, 'repetition')
            }
            return cycle
        }

        // Check for oscillation (A-B-A-B pattern)
        const oscillation = this.detectOscillation(fingerprint)
        if (oscillation) {
            return oscillation
        }

        // Check for stagnation (same tool called repeatedly on same file)
        const stagnation = this.detectStagnation(fingerprint)
        if (stagnation) {
            return stagnation
        }

        return null
    }

    /**
     * Detect oscillation patterns (A-B-A-B)
     */
    private detectOscillation(fingerprint: StateFingerprint): DetectedCycle | null {
        const sequences = this.history.recentToolSequences
        if (sequences.length < 4) return null

        // Look for A-B-A-B pattern in recent sequences
        const recentTools = fingerprint.toolCalls.join(',')
        
        for (let i = 2; i <= 4; i++) { // Check for 2, 3, and 4-state oscillations
            if (sequences.length < i * 2) continue

            const pattern: string[] = []
            for (let j = 0; j < i; j++) {
                const idx = sequences.length - 1 - j
                if (idx >= 0) {
                    pattern.unshift(sequences[idx].join(','))
                }
            }

            // Check if pattern repeats
            const fullPattern = pattern.join('|')
            const prevPattern = sequences
                .slice(Math.max(0, sequences.length - i * 2), sequences.length - i)
                .map(s => s.join(','))
                .join('|')

            if (fullPattern === prevPattern && pattern.includes(recentTools)) {
                const iterations: number[] = []
                for (let j = 0; j < i * 2; j++) {
                    iterations.push(this.iteration - j)
                }

                return {
                    type: 'oscillation',
                    iterations: iterations.reverse(),
                    fingerprint,
                    severity: 'high',
                    suggestedAction: this.suggestBreakStrategy(fingerprint, 'oscillation')
                }
            }
        }

        return null
    }

    /**
     * Detect stagnation (repeated operations without progress)
     */
    private detectStagnation(fingerprint: StateFingerprint): DetectedCycle | null {
        if (fingerprint.toolCalls.length === 0) return null

        const sequences = this.history.recentToolSequences
        if (sequences.length < 3) return null

        const lastTool = fingerprint.toolCalls[fingerprint.toolCalls.length - 1]
        const lastFile = fingerprint.fileOperations[fingerprint.fileOperations.length - 1]

        // Check if same tool+file combination repeated
        let repeatCount = 0
        for (let i = sequences.length - 1; i >= Math.max(0, sequences.length - 5); i--) {
            const seq = sequences[i]
            const prevFileOps = this.getFileOperationsForIteration(i + 1)
            
            if (seq.includes(lastTool) && prevFileOps.includes(lastFile)) {
                repeatCount++
            } else {
                break
            }
        }

        if (repeatCount >= 3) {
            return {
                type: 'stagnation',
                iterations: Array.from({ length: repeatCount + 1 }, (_, i) => this.iteration - i).reverse(),
                fingerprint,
                severity: 'medium',
                suggestedAction: this.suggestBreakStrategy(fingerprint, 'stagnation')
            }
        }

        return null
    }

    /**
     * Suggest a strategy to break out of the cycle
     */
    private suggestBreakStrategy(
        fingerprint: StateFingerprint,
        cycleType: DetectedCycle['type']
    ): CycleBreakStrategy {
        const lastTool = fingerprint.toolCalls[fingerprint.toolCalls.length - 1]

        switch (cycleType) {
            case 'repetition':
                // Try an alternative tool
                const alternative = this.getAlternativeTool(lastTool)
                if (alternative) {
                    return {
                        type: 'alternative_tool',
                        currentTool: lastTool,
                        suggestedTool: alternative
                    }
                }
                return {
                    type: 'increase_temperature',
                    current: 0.3,
                    suggested: 0.7
                }

            case 'oscillation':
                // Reset context but preserve file knowledge
                return {
                    type: 'reset_context',
                    preserveFiles: fingerprint.fileOperations
                }

            case 'stagnation':
                // Ask for clarification or escalate
                if (fingerprint.fileOperations.length > 0) {
                    return {
                        type: 'ask_clarification',
                        question: `I've tried ${lastTool} on ${fingerprint.fileOperations[0]} multiple times. What specific change are you looking for?`
                    }
                }
                return {
                    type: 'escalate_to_user',
                    explanation: 'The agent seems stuck in a loop. Please provide more specific guidance.'
                }

            default:
                return {
                    type: 'escalate_to_user',
                    explanation: 'An unexpected pattern was detected. Please review the agent\'s progress.'
                }
        }
    }

    /**
     * Get an alternative tool suggestion
     */
    private getAlternativeTool(currentTool: string): string | null {
        const alternatives: Record<string, string[]> = {
            'readFile': ['searchFiles', 'listDirectory'],
            'writeFile': ['replaceInFile', 'fuzzyReplace'],
            'replaceInFile': ['fuzzyReplace', 'writeFile'],
            'fuzzyReplace': ['replaceInFile', 'writeFile'],
            'searchFiles': ['searchRelevantContext', 'getFileTree'],
            'executeCode': ['runCommand'],
            'runCommand': ['executeCode']
        }

        const options = alternatives[currentTool]
        return options ? options[Math.floor(Math.random() * options.length)] : null
    }

    /**
     * Calculate cycle severity based on repetition count
     */
    private calculateSeverity(repetitionCount: number): DetectedCycle['severity'] {
        if (repetitionCount >= 4) return 'high'
        if (repetitionCount >= 3) return 'medium'
        return 'low'
    }

    /**
     * Store fingerprint in history
     */
    private storeFingerprint(fingerprint: StateFingerprint): void {
        const hash = this.hashFingerprint(fingerprint)
        const iterations = this.history.fingerprints.get(hash) || []
        iterations.push(this.iteration)
        this.history.fingerprints.set(hash, iterations)
    }

    /**
     * Get file operations for a specific iteration
     */
    private getFileOperationsForIteration(_iteration: number): string[] {
        // This would need to be tracked separately in a real implementation
        return []
    }

    /**
     * Create a hash of a fingerprint
     */
    private hashFingerprint(fingerprint: StateFingerprint): string {
        const data = JSON.stringify({
            tools: fingerprint.toolCalls,
            files: fingerprint.fileOperations,
            response: fingerprint.responseHash
        })
        return this.hashString(data)
    }

    /**
     * Simple string hash function
     */
    private hashString(str: string): string {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32bit integer
        }
        return hash.toString(16)
    }

    /**
     * Get all detected cycles for current run
     */
    getDetectedCycles(): DetectedCycle[] {
        return [...this.detectedCycles]
    }

    /**
     * Check if currently in a cycle
     */
    isInCycle(): boolean {
        return this.detectedCycles.length > 0
    }

    /**
     * Get the most recent cycle
     */
    getMostRecentCycle(): DetectedCycle | null {
        return this.detectedCycles[this.detectedCycles.length - 1] || null
    }

    /**
     * Get cycle statistics
     */
    getStatistics(): {
        totalCycles: number
        byType: Record<DetectedCycle['type'], number>
        averageSeverity: number
    } {
        const byType = {
            repetition: 0,
            oscillation: 0,
            stagnation: 0
        }

        let severitySum = 0
        for (const cycle of this.detectedCycles) {
            byType[cycle.type]++
            severitySum += cycle.severity === 'high' ? 3 : cycle.severity === 'medium' ? 2 : 1
        }

        return {
            totalCycles: this.detectedCycles.length,
            byType,
            averageSeverity: this.detectedCycles.length > 0 ? severitySum / this.detectedCycles.length : 0
        }
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.history.fingerprints.clear()
        this.history.recentToolSequences = []
        this.detectedCycles = []
        logger.agent.debug('Cycle detection history cleared')
    }
}

export const cycleDetectionService = new CycleDetectionService()
