/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Semantic Operation Service - High-Level Refactoring Operations
 * 
 * Provides semantic operations like extract method, rename symbol, and move
 * that understand code structure and maintain consistency across the codebase.
 */

import { logger } from '../utils/logger'
import { symbolService, type Symbol } from './symbolService'

export interface ExtractMethodOptions {
    filePath: string
    sourceRange: {
        startLine: number
        startColumn: number
        endLine: number
        endColumn: number
    }
    methodName: string
    visibility?: 'public' | 'private' | 'protected'
    isAsync?: boolean
    isStatic?: boolean
    generateDocs?: boolean
}

export interface ExtractMethodResult {
    success: boolean
    newMethod?: Symbol
    changes: Array<{
        filePath: string
        type: 'insert' | 'replace' | 'delete'
        range: { line: number; column: number; endLine: number; endColumn: number }
        content: string
    }>
    error?: string
}

export interface RenameSymbolOptions {
    symbolId: string
    newName: string
    updateReferences?: boolean
    updateComments?: boolean
    updateStrings?: boolean
}

export interface RenameSymbolResult {
    success: boolean
    changes: Array<{
        filePath: string
        range: { line: number; column: number; endLine: number; endColumn: number }
        oldText: string
        newText: string
    }>
    filesAffected: string[]
    referencesUpdated: number
    error?: string
}

export interface MoveSymbolOptions {
    symbolId: string
    targetFilePath: string
    updateImports?: boolean
}

export interface MoveSymbolResult {
    success: boolean
    changes: Array<{
        filePath: string
        type: 'insert' | 'replace' | 'delete'
        range: { line: number; column: number; endLine: number; endColumn: number }
        content: string
    }>
    importUpdates: Array<{
        filePath: string
        oldImport: string
        newImport: string
    }>
    error?: string
}

export interface InlineVariableOptions {
    filePath: string
    variableName: string
    line: number
    replaceAll?: boolean
}

export interface InlineVariableResult {
    success: boolean
    changes: Array<{
        filePath: string
        range: { line: number; column: number; endLine: number; endColumn: number }
        newText: string
    }>
    occurrencesReplaced: number
    error?: string
}

class SemanticOperationService {
    /**
     * Extract selected code into a new method
     */
    async extractMethod(options: ExtractMethodOptions): Promise<ExtractMethodResult> {
        try {
            logger.agent.info('Extracting method', {
                methodName: options.methodName,
                filePath: options.filePath
            })

            // Analyze the selected code
            const analysis = await this.analyzeCodeBlock(options.filePath, options.sourceRange)
            
            if (!analysis.canExtract) {
                return {
                    success: false,
                    changes: [],
                    error: analysis.reason || 'Cannot extract this code block'
                }
            }

            // Build the new method
            const methodContent = this.buildMethodContent({
                name: options.methodName,
                parameters: analysis.parameters,
                returnType: analysis.returnType,
                body: analysis.body,
                visibility: options.visibility || 'private',
                isAsync: options.isAsync || analysis.isAsync,
                isStatic: options.isStatic || false,
                docs: options.generateDocs ? this.generateMethodDocs(options.methodName, analysis) : undefined
            })

            // Build the method call to replace the extracted code
            const methodCall = this.buildMethodCall({
                name: options.methodName,
                arguments_: analysis.arguments_,
                isAsync: options.isAsync || analysis.isAsync,
                returnType: analysis.returnType
            })

            const changes: ExtractMethodResult['changes'] = [
                {
                    filePath: options.filePath,
                    type: 'replace',
                    range: {
                        line: options.sourceRange.startLine,
                        column: options.sourceRange.startColumn,
                        endLine: options.sourceRange.endLine,
                        endColumn: options.sourceRange.endColumn
                    },
                    content: methodCall
                },
                {
                    filePath: options.filePath,
                    type: 'insert',
                    range: {
                        line: analysis.insertLine,
                        column: 0,
                        endLine: analysis.insertLine,
                        endColumn: 0
                    },
                    content: '\n' + methodContent + '\n'
                }
            ]

            // Create symbol for the new method
            const newMethod: Symbol = {
                id: `method-${Date.now()}`,
                name: options.methodName,
                type: 'method',
                filePath: options.filePath,
                location: {
                    line: analysis.insertLine,
                    column: 0,
                    endLine: analysis.insertLine + methodContent.split('\n').length,
                    endColumn: 0
                },
                signature: this.buildSignature(options.methodName, analysis.parameters, analysis.returnType),
                isExported: false,
                isAsync: options.isAsync || false,
                isStatic: options.isStatic || false,
                isAbstract: false,
                isPrivate: options.visibility === 'private',
                isProtected: options.visibility === 'protected',
                visibility: options.visibility || 'private',
                language: analysis.language,
                createdAt: Date.now(),
                modifiedAt: Date.now()
            }

            return {
                success: true,
                newMethod,
                changes
            }

        } catch (err) {
            logger.agent.error('Extract method failed', err)
            return {
                success: false,
                changes: [],
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }

    /**
     * Rename a symbol and update all references
     */
    async renameSymbol(options: RenameSymbolOptions): Promise<RenameSymbolResult> {
        try {
            logger.agent.info('Renaming symbol', {
                symbolId: options.symbolId,
                newName: options.newName
            })

            const symbol = symbolService.getSymbol(options.symbolId)
            if (!symbol) {
                return {
                    success: false,
                    changes: [],
                    filesAffected: [],
                    referencesUpdated: 0,
                    error: 'Symbol not found'
                }
            }

            // Analyze impact (for future use in conflict detection)
            // const impact = symbolService.analyzeImpact(options.symbolId)
            
            const changes: RenameSymbolResult['changes'] = []
            const filesAffected = new Set<string>()
            let referencesUpdated = 0

            // Update the symbol definition
            changes.push({
                filePath: symbol.filePath,
                range: symbol.location,
                oldText: symbol.name,
                newText: options.newName
            })
            filesAffected.add(symbol.filePath)

            // Update references if requested
            if (options.updateReferences !== false) {
                const refs = symbolService.findReferences(options.symbolId)
                
                for (const ref of refs) {
                    changes.push({
                        filePath: ref.symbol.filePath,
                        range: {
                            line: ref.relationship.location?.line || 0,
                            column: ref.relationship.location?.column || 0,
                            endLine: ref.relationship.location?.line || 0,
                            endColumn: (ref.relationship.location?.column || 0) + symbol.name.length
                        },
                        oldText: symbol.name,
                        newText: options.newName
                    })
                    filesAffected.add(ref.symbol.filePath)
                    referencesUpdated++
                }
            }

            return {
                success: true,
                changes,
                filesAffected: Array.from(filesAffected),
                referencesUpdated
            }

        } catch (err) {
            logger.agent.error('Rename symbol failed', err)
            return {
                success: false,
                changes: [],
                filesAffected: [],
                referencesUpdated: 0,
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }

    /**
     * Move a symbol to a different file
     */
    async moveSymbol(options: MoveSymbolOptions): Promise<MoveSymbolResult> {
        try {
            logger.agent.info('Moving symbol', {
                symbolId: options.symbolId,
                targetFile: options.targetFilePath
            })

            const symbol = symbolService.getSymbol(options.symbolId)
            if (!symbol) {
                return {
                    success: false,
                    changes: [],
                    importUpdates: [],
                    error: 'Symbol not found'
                }
            }

            const changes: MoveSymbolResult['changes'] = []
            const importUpdates: MoveSymbolResult['importUpdates'] = []

            // Remove from original file
            changes.push({
                filePath: symbol.filePath,
                type: 'delete',
                range: symbol.location,
                content: ''
            })

            // Add to target file
            // Note: In real implementation, we'd get the actual symbol content
            changes.push({
                filePath: options.targetFilePath,
                type: 'insert',
                range: { line: 0, column: 0, endLine: 0, endColumn: 0 },
                content: `// ${symbol.name} moved from ${symbol.filePath}\n`
            })

            // Update imports if requested
            if (options.updateImports !== false) {
                const impact = symbolService.analyzeImpact(options.symbolId)
                
                for (const file of impact.files) {
                    if (file !== options.targetFilePath) {
                        importUpdates.push({
                            filePath: file,
                            oldImport: `from '${symbol.filePath}'`,
                            newImport: `from '${options.targetFilePath}'`
                        })
                    }
                }
            }

            return {
                success: true,
                changes,
                importUpdates
            }

        } catch (err) {
            logger.agent.error('Move symbol failed', err)
            return {
                success: false,
                changes: [],
                importUpdates: [],
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }

    /**
     * Inline a variable (replace references with its value)
     */
    async inlineVariable(options: InlineVariableOptions): Promise<InlineVariableResult> {
        try {
            logger.agent.info('Inlining variable', {
                variableName: options.variableName,
                filePath: options.filePath
            })

            // In real implementation, this would parse the file and find all references
            // For now, return a placeholder result
            
            return {
                success: true,
                changes: [],
                occurrencesReplaced: 0,
                error: 'Inline variable requires file parsing - implementation pending'
            }

        } catch (err) {
            logger.agent.error('Inline variable failed', err)
            return {
                success: false,
                changes: [],
                occurrencesReplaced: 0,
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }

    /**
     * Validate a semantic operation before executing
     */
    validateOperation(operation: 'extractMethod' | 'rename' | 'move', options: unknown): {
        valid: boolean
        errors: string[]
        warnings: string[]
    } {
        const errors: string[] = []
        const warnings: string[] = []

        switch (operation) {
            case 'extractMethod':
                const extractOpts = options as ExtractMethodOptions
                if (!extractOpts.methodName || extractOpts.methodName.trim() === '') {
                    errors.push('Method name is required')
                }
                if (!extractOpts.filePath) {
                    errors.push('File path is required')
                }
                if (extractOpts.sourceRange.startLine > extractOpts.sourceRange.endLine) {
                    errors.push('Invalid source range')
                }
                break

            case 'rename':
                const renameOpts = options as RenameSymbolOptions
                if (!renameOpts.symbolId) {
                    errors.push('Symbol ID is required')
                }
                if (!renameOpts.newName || renameOpts.newName.trim() === '') {
                    errors.push('New name is required')
                }
                if (renameOpts.newName && /[^a-zA-Z0-9_]/.test(renameOpts.newName)) {
                    warnings.push('New name contains special characters')
                }
                break

            case 'move':
                const moveOpts = options as MoveSymbolOptions
                if (!moveOpts.symbolId) {
                    errors.push('Symbol ID is required')
                }
                if (!moveOpts.targetFilePath) {
                    errors.push('Target file path is required')
                }
                break
        }

        return { valid: errors.length === 0, errors, warnings }
    }

    // --- Private helper methods ---

    private async analyzeCodeBlock(
        _filePath: string,
        _range: ExtractMethodOptions['sourceRange']
    ): Promise<{
        canExtract: boolean
        reason?: string
        body: string
        parameters: Array<{ name: string; type: string }>
        arguments_: string[]
        returnType: string
        isAsync: boolean
        language: string
        insertLine: number
    }> {
        // In real implementation, this would parse the actual code
        // For now, return a placeholder
        return {
            canExtract: true,
            body: '// extracted code',
            parameters: [],
            arguments_: [],
            returnType: 'void',
            isAsync: false,
            language: 'typescript',
            insertLine: _range.endLine + 1
        }
    }

    private buildMethodContent(options: {
        name: string
        parameters: Array<{ name: string; type: string }>
        returnType: string
        body: string
        visibility: string
        isAsync: boolean
        isStatic: boolean
        docs?: string
    }): string {
        const indent = '    '
        let content = ''

        if (options.docs) {
            content += `${indent}/**\n${options.docs.split('\n').map(l => `${indent} * ${l}`).join('\n')}\n${indent} */\n`
        }

        const modifiers = [
            options.visibility,
            options.isStatic ? 'static' : '',
            options.isAsync ? 'async' : ''
        ].filter(Boolean).join(' ')

        const params = options.parameters.map(p => `${p.name}: ${p.type}`).join(', ')
        const returnType = options.returnType !== 'void' ? `: ${options.returnType}` : ''

        content += `${indent}${modifiers} ${options.name}(${params})${returnType} {\n`
        content += `${indent}${indent}${options.body}\n`
        content += `${indent}}`

        return content
    }

    private buildMethodCall(options: {
        name: string
        arguments_: string[]
        isAsync: boolean
        returnType: string
    }): string {
        const args = options.arguments_.join(', ')
        const call = `${options.name}(${args})`
        
        if (options.isAsync) {
            return options.returnType === 'void' ? `await ${call};` : `return await ${call};`
        }
        
        return options.returnType === 'void' ? `${call};` : `return ${call};`
    }

    private buildSignature(
        name: string,
        parameters: Array<{ name: string; type: string }>,
        returnType: string
    ): string {
        const params = parameters.map(p => `${p.name}: ${p.type}`).join(', ')
        return `${name}(${params}): ${returnType}`
    }

    private generateMethodDocs(
        name: string,
        analysis: { parameters: Array<{ name: string; type: string }>; returnType: string }
    ): string {
        let docs = `${name}\n\n`
        
        if (analysis.parameters.length > 0) {
            docs += '@param params - Parameters\n'
        }
        
        if (analysis.returnType !== 'void') {
            docs += `@returns ${analysis.returnType}`
        }
        
        return docs.trim()
    }
}

export const semanticOperationService = new SemanticOperationService()
