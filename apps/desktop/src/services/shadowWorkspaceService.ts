/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Shadow Workspace Service - Auto-Validation & Build Verification
 *
 * Implements the "Shadow Workspace" pattern from the architecture report:
 * After the agent modifies files, this service automatically runs diagnostics
 * (linters, compilers) and feeds errors back to the agent for self-correction.
 *
 * This gives the agent "reflexes" - it can immediately see if its edits broke
 * the build without waiting for the user to complain.
 *
 * Architecture:
 * 1. Agent writes/edits a file via a tool
 * 2. Shadow Workspace detects which language the file is
 * 3. Runs the appropriate diagnostic command (tsc, node --check, py_compile, etc.)
 * 4. If errors found, returns them as structured feedback
 * 5. The agent loop injects this feedback into the conversation
 *
 * Future: Will use LSP bridge (runtime.startLSP) for real-time diagnostics
 * instead of spawning processes.
 */

import { logger } from '../utils/logger'

export interface DiagnosticError {
    file: string
    line?: number
    column?: number
    severity: 'error' | 'warning' | 'info'
    message: string
    code?: string
}

export interface ValidationResult {
    success: boolean
    errors: DiagnosticError[]
    command: string
    duration: number
    rawOutput?: string
}

/**
 * Detect the language/framework of a file based on its extension
 */
function detectLanguage(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'typescript',
        'js': 'javascript',
        'jsx': 'javascript',
        'mjs': 'javascript',
        'py': 'python',
        'rs': 'rust',
        'go': 'go',
        'java': 'java',
        'kt': 'kotlin',
        'cs': 'csharp',
        'cpp': 'cpp',
        'c': 'c',
        'rb': 'ruby',
        'php': 'php',
        'swift': 'swift',
    }
    return ext ? langMap[ext] || null : null
}

/**
 * Parse compiler/linter output into structured diagnostics
 */
function parseDiagnostics(output: string, language: string): DiagnosticError[] {
    const errors: DiagnosticError[] = []

    if (language === 'typescript') {
        // TypeScript: src/file.ts(10,5): error TS2304: Cannot find name 'foo'.
        const tsPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm
        let match: RegExpExecArray | null
        while ((match = tsPattern.exec(output)) !== null) {
            errors.push({
                file: match[1].trim(),
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                severity: match[4] as 'error' | 'warning',
                code: match[5],
                message: match[6].trim()
            })
        }
    } else if (language === 'python') {
        // Python: File "script.py", line 5 / SyntaxError: invalid syntax
        const pyPattern = /File "(.+?)", line (\d+)/g
        let match: RegExpExecArray | null
        while ((match = pyPattern.exec(output)) !== null) {
            const nextLine = output.substring(match.index + match[0].length).split('\n')[1]?.trim()
            errors.push({
                file: match[1],
                line: parseInt(match[2]),
                severity: 'error',
                message: nextLine || 'Syntax error'
            })
        }
    } else if (language === 'javascript') {
        // Node.js syntax check: file.js:10 / SyntaxError: Unexpected token
        const jsPattern = /^(.+?):(\d+)\n([\s\S]*?)(SyntaxError|ReferenceError|TypeError):\s*(.+)$/gm
        let match: RegExpExecArray | null
        while ((match = jsPattern.exec(output)) !== null) {
            errors.push({
                file: match[1].trim(),
                line: parseInt(match[2]),
                severity: 'error',
                message: `${match[4]}: ${match[5].trim()}`
            })
        }
    } else if (language === 'rust') {
        // Rust: error[E0308]: mismatched types --> src/main.rs:10:5
        const rustPattern = /(error|warning)\[([A-Z]\d+)\]:\s*(.+?)\n\s*-->\s*(.+?):(\d+):(\d+)/g
        let match: RegExpExecArray | null
        while ((match = rustPattern.exec(output)) !== null) {
            errors.push({
                file: match[4].trim(),
                line: parseInt(match[5]),
                column: parseInt(match[6]),
                severity: match[1] as 'error' | 'warning',
                code: match[2],
                message: match[3].trim()
            })
        }
    } else if (language === 'go') {
        // Go: ./main.go:10:5: undefined: foo
        const goPattern = /^(.+?):(\d+):(\d+):\s*(.+)$/gm
        let match: RegExpExecArray | null
        while ((match = goPattern.exec(output)) !== null) {
            errors.push({
                file: match[1].trim(),
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                severity: 'error',
                message: match[4].trim()
            })
        }
    }

    return errors
}

/**
 * Get the diagnostic command for a given language and workspace
 */
function getDiagnosticCommand(language: string, filePath: string, _workspacePath: string): string | null {
    const commands: Record<string, string> = {
        'typescript': `npx tsc --noEmit --pretty false 2>&1`,
        'javascript': `node --check "${filePath}" 2>&1`,
        'python': `python -m py_compile "${filePath}" 2>&1`,
        'rust': `cargo check --message-format short 2>&1`,
        'go': `go vet ./... 2>&1`,
    }
    return commands[language] || null
}

class ShadowWorkspaceService {
    private lspSessions: Map<string, string> = new Map() // language -> sessionId
    private validationEnabled = true

    setEnabled(enabled: boolean) {
        this.validationEnabled = enabled
    }

    isEnabled(): boolean {
        return this.validationEnabled
    }

    /**
     * Validate a file after it was modified by the agent.
     * Returns structured diagnostic errors if any.
     */
    async validateFile(filePath: string, workspacePath: string): Promise<ValidationResult | null> {
        if (!this.validationEnabled) return null

        const language = detectLanguage(filePath)
        if (!language) {
            logger.agent.debug('No validator for file type:', filePath)
            return null
        }

        const command = getDiagnosticCommand(language, filePath, workspacePath)
        if (!command) return null

        const startTime = Date.now()

        try {
            // Try LSP first (faster, more accurate)
            const lspResult = await this.validateViaLSP(filePath, language, workspacePath)
            if (lspResult) return lspResult

            // Fall back to running compiler/linter via terminal
            return await this.validateViaCommand(command, language, workspacePath, startTime)
        } catch (err) {
            logger.agent.warn('Shadow validation failed:', err)
            return null
        }
    }

    /**
     * Try to validate via LSP if a language server is running
     */
    private async validateViaLSP(
        filePath: string,
        language: string,
        _workspacePath: string
    ): Promise<ValidationResult | null> {
        const electronAPI = globalThis.window?.electronAPI as any
        if (!electronAPI?.runtime?.sendLSPRequest) return null

        const sessionId = this.lspSessions.get(language)
        if (!sessionId) return null

        try {
            const startTime = Date.now()
            // Request diagnostics from the language server
            const result = await electronAPI.runtime.sendLSPRequest(
                sessionId,
                'textDocument/diagnostic',
                { textDocument: { uri: `file://${filePath}` } }
            )

            if (!result?.success || !result.result?.items) return null

            const errors: DiagnosticError[] = result.result.items
                .filter((d: any) => d.severity <= 2) // 1 = Error, 2 = Warning
                .map((d: any) => ({
                    file: filePath,
                    line: (d.range?.start?.line ?? 0) + 1,
                    column: (d.range?.start?.character ?? 0) + 1,
                    severity: d.severity === 1 ? 'error' as const : 'warning' as const,
                    message: d.message,
                    code: d.code ? String(d.code) : undefined
                }))

            return {
                success: errors.filter(e => e.severity === 'error').length === 0,
                errors,
                command: 'LSP diagnostics',
                duration: Date.now() - startTime
            }
        } catch {
            return null // LSP unavailable, fall back to command
        }
    }

    /**
     * Validate by running a compiler/linter command
     */
    private async validateViaCommand(
        command: string,
        language: string,
        workspacePath: string,
        startTime: number
    ): Promise<ValidationResult> {
        const electronAPI = globalThis.window?.electronAPI as any
        if (!electronAPI?.code?.runCommand) {
            return {
                success: true,
                errors: [],
                command,
                duration: Date.now() - startTime
            }
        }

        try {
            const result = await new Promise<string>((resolve) => {
                let output = ''
                const execId = `shadow-${Date.now()}`

                const outputHandler = (data: any) => {
                    if (data.id === execId || data.executionId === execId) {
                        output += data.data || ''
                    }
                }

                const exitHandler = (data: any) => {
                    if (data.id === execId || data.executionId === execId) {
                        electronAPI.code.removeListeners?.()
                        resolve(output)
                    }
                }

                electronAPI.code.onOutput?.(outputHandler)
                electronAPI.code.onExit?.(exitHandler)

                // Timeout after 15 seconds
                setTimeout(() => resolve(output), 15000)

                electronAPI.code.runCommand(workspacePath, command, execId)
            })

            const errors = parseDiagnostics(result, language)

            return {
                success: errors.filter(e => e.severity === 'error').length === 0,
                errors,
                command,
                duration: Date.now() - startTime,
                rawOutput: result.substring(0, 2000) // Limit output size
            }
        } catch (err) {
            return {
                success: true, // Assume success if we can't run validation
                errors: [],
                command,
                duration: Date.now() - startTime
            }
        }
    }

    /**
     * Register an active LSP session for faster diagnostics
     */
    registerLSPSession(language: string, sessionId: string) {
        this.lspSessions.set(language, sessionId)
        logger.agent.info(`LSP session registered for ${language}: ${sessionId}`)
    }

    /**
     * Unregister an LSP session
     */
    unregisterLSPSession(language: string) {
        this.lspSessions.delete(language)
    }

    /**
     * Format validation errors into a human-readable string for the agent
     */
    formatErrorsForAgent(result: ValidationResult): string {
        if (result.success || result.errors.length === 0) {
            return ''
        }

        const errorLines = result.errors
            .filter(e => e.severity === 'error')
            .slice(0, 10) // Limit to 10 errors to avoid flooding context
            .map(e => {
                const location = e.line ? `:${e.line}${e.column ? ':' + e.column : ''}` : ''
                const code = e.code ? ` [${e.code}]` : ''
                return `  ${e.file}${location}: ${e.message}${code}`
            })
            .join('\n')

        const warningCount = result.errors.filter(e => e.severity === 'warning').length
        const errorCount = result.errors.filter(e => e.severity === 'error').length

        let summary = `BUILD VALIDATION FAILED (${errorCount} error${errorCount !== 1 ? 's' : ''}`
        if (warningCount > 0) summary += `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
        summary += `):\n${errorLines}`

        if (result.errors.length > 10) {
            summary += `\n  ... and ${result.errors.length - 10} more errors`
        }

        summary += '\n\nFix these errors before continuing.'
        return summary
    }
}

export const shadowWorkspaceService = new ShadowWorkspaceService()
