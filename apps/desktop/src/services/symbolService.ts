/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Symbol Service - Code Symbol Relationship Tracking
 * 
 * Tracks symbols (classes, functions, variables, etc.) across the codebase
 * and maintains relationships between them. Enables intelligent refactoring
 * and impact analysis.
 */

import { logger } from '../utils/logger'

export type SymbolType = 
    | 'class' 
    | 'interface' 
    | 'function' 
    | 'method' 
    | 'variable' 
    | 'const' 
    | 'enum' 
    | 'type' 
    | 'property' 
    | 'parameter'
    | 'import'
    | 'export'

export type RelationshipType =
    | 'extends'
    | 'implements'
    | 'calls'
    | 'called_by'
    | 'references'
    | 'referenced_by'
    | 'contains'
    | 'contained_in'
    | 'imports'
    | 'exported_from'
    | 'overrides'
    | 'overridden_by'
    | 'type_of'
    | 'returns'

export interface Symbol {
    id: string
    name: string
    type: SymbolType
    filePath: string
    location: {
        line: number
        column: number
        endLine: number
        endColumn: number
    }
    signature?: string
    documentation?: string
    isExported: boolean
    isAsync: boolean
    isStatic: boolean
    isAbstract: boolean
    isPrivate: boolean
    isProtected: boolean
    visibility: 'public' | 'private' | 'protected'
    language: string
    createdAt: number
    modifiedAt: number
}

export interface SymbolRelationship {
    id: string
    sourceId: string
    targetId: string
    type: RelationshipType
    filePath: string
    location?: {
        line: number
        column: number
    }
    metadata?: Record<string, unknown>
}

export interface SymbolGraph {
    symbols: Map<string, Symbol>
    relationships: Map<string, SymbolRelationship>
    byFile: Map<string, Set<string>>  // filePath -> symbolIds
    byName: Map<string, Set<string>>   // name -> symbolIds
}

export interface ImpactAnalysis {
    direct: Symbol[]
    indirect: Symbol[]
    files: string[]
    relationshipTypes: RelationshipType[]
}

export interface RefactorOperation {
    type: 'rename' | 'move' | 'extract' | 'inline' | 'delete'
    symbolId: string
    changes: Array<{
        filePath: string
        oldRange: { line: number; column: number; endLine: number; endColumn: number }
        newText: string
    }>
}

class SymbolService {
    private graph: SymbolGraph = {
        symbols: new Map(),
        relationships: new Map(),
        byFile: new Map(),
        byName: new Map()
    }
    private indexVersion = 0

    /**
     * Index a file's symbols
     */
    indexFile(filePath: string, symbols: Symbol[], relationships: SymbolRelationship[]): void {
        // Remove existing symbols for this file
        this.removeFile(filePath)

        // Add new symbols
        for (const symbol of symbols) {
            this.addSymbol(symbol)
        }

        // Add relationships
        for (const rel of relationships) {
            this.addRelationship(rel)
        }

        this.indexVersion++

        logger.agent.debug('File indexed', {
            filePath,
            symbolCount: symbols.length,
            relationshipCount: relationships.length
        })
    }

    /**
     * Add a symbol to the graph
     */
    addSymbol(symbol: Symbol): void {
        this.graph.symbols.set(symbol.id, symbol)

        // Index by file
        if (!this.graph.byFile.has(symbol.filePath)) {
            this.graph.byFile.set(symbol.filePath, new Set())
        }
        this.graph.byFile.get(symbol.filePath)!.add(symbol.id)

        // Index by name
        if (!this.graph.byName.has(symbol.name)) {
            this.graph.byName.set(symbol.name, new Set())
        }
        this.graph.byName.get(symbol.name)!.add(symbol.id)
    }

    /**
     * Add a relationship
     */
    addRelationship(rel: SymbolRelationship): void {
        // Only add if both symbols exist
        if (!this.graph.symbols.has(rel.sourceId) || !this.graph.symbols.has(rel.targetId)) {
            return
        }

        this.graph.relationships.set(rel.id, rel)
    }

    /**
     * Get a symbol by ID
     */
    getSymbol(id: string): Symbol | undefined {
        return this.graph.symbols.get(id)
    }

    /**
     * Find symbols by name
     */
    findByName(name: string): Symbol[] {
        const ids = this.graph.byName.get(name)
        if (!ids) return []
        
        return Array.from(ids)
            .map(id => this.graph.symbols.get(id))
            .filter((s): s is Symbol => s !== undefined)
    }

    /**
     * Find symbols by type
     */
    findByType(type: SymbolType): Symbol[] {
        return Array.from(this.graph.symbols.values())
            .filter(s => s.type === type)
    }

    /**
     * Get all symbols in a file
     */
    getFileSymbols(filePath: string): Symbol[] {
        const ids = this.graph.byFile.get(filePath)
        if (!ids) return []
        
        return Array.from(ids)
            .map(id => this.graph.symbols.get(id))
            .filter((s): s is Symbol => s !== undefined)
    }

    /**
     * Get relationships for a symbol
     */
    getRelationships(symbolId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): SymbolRelationship[] {
        const rels: SymbolRelationship[] = []
        
        for (const rel of this.graph.relationships.values()) {
            if (direction === 'outgoing' && rel.sourceId === symbolId) {
                rels.push(rel)
            } else if (direction === 'incoming' && rel.targetId === symbolId) {
                rels.push(rel)
            } else if (direction === 'both' && (rel.sourceId === symbolId || rel.targetId === symbolId)) {
                rels.push(rel)
            }
        }
        
        return rels
    }

    /**
     * Get symbols related to a given symbol
     */
    getRelatedSymbols(symbolId: string, relationshipType?: RelationshipType): Symbol[] {
        const rels = this.getRelationships(symbolId)
        const relatedIds = new Set<string>()
        
        for (const rel of rels) {
            if (relationshipType && rel.type !== relationshipType) continue
            
            if (rel.sourceId === symbolId) {
                relatedIds.add(rel.targetId)
            } else {
                relatedIds.add(rel.sourceId)
            }
        }
        
        return Array.from(relatedIds)
            .map(id => this.graph.symbols.get(id))
            .filter((s): s is Symbol => s !== undefined)
    }

    /**
     * Analyze impact of changing a symbol
     */
    analyzeImpact(symbolId: string): ImpactAnalysis {
        const direct = new Set<Symbol>()
        const indirect = new Set<Symbol>()
        const files = new Set<string>()
        const relTypes = new Set<RelationshipType>()

        const symbol = this.graph.symbols.get(symbolId)
        if (!symbol) {
            return { direct: [], indirect: [], files: [], relationshipTypes: [] }
        }

        files.add(symbol.filePath)

        // Get direct relationships
        const rels = this.getRelationships(symbolId)
        for (const rel of rels) {
            relTypes.add(rel.type)
            
            const relatedId = rel.sourceId === symbolId ? rel.targetId : rel.sourceId
            const related = this.graph.symbols.get(relatedId)
            
            if (related) {
                direct.add(related)
                files.add(related.filePath)

                // Get indirect relationships (one level deeper)
                const indirectRels = this.getRelationships(relatedId)
                for (const indirectRel of indirectRels) {
                    const indirectId = indirectRel.sourceId === relatedId ? 
                        indirectRel.targetId : indirectRel.sourceId
                    
                    if (indirectId !== symbolId) {
                        const indirectSym = this.graph.symbols.get(indirectId)
                        if (indirectSym) {
                            indirect.add(indirectSym)
                            files.add(indirectSym.filePath)
                        }
                    }
                }
            }
        }

        // Remove direct from indirect
        for (const s of direct) {
            indirect.delete(s)
        }

        return {
            direct: Array.from(direct),
            indirect: Array.from(indirect),
            files: Array.from(files),
            relationshipTypes: Array.from(relTypes)
        }
    }

    /**
     * Find all references to a symbol
     */
    findReferences(symbolId: string): Array<{
        symbol: Symbol
        relationship: SymbolRelationship
    }> {
        const refs: Array<{ symbol: Symbol; relationship: SymbolRelationship }> = []
        const rels = this.getRelationships(symbolId, 'incoming')
        
        for (const rel of rels) {
            if (rel.type === 'references' || rel.type === 'calls') {
                const sym = this.graph.symbols.get(rel.sourceId)
                if (sym) {
                    refs.push({ symbol: sym, relationship: rel })
                }
            }
        }
        
        return refs
    }

    /**
     * Get inheritance hierarchy
     */
    getInheritanceHierarchy(symbolId: string): {
        extends: Symbol[]
        implements: Symbol[]
        extendedBy: Symbol[]
        implementedBy: Symbol[]
    } {
        const result = {
            extends: [] as Symbol[],
            implements: [] as Symbol[],
            extendedBy: [] as Symbol[],
            implementedBy: [] as Symbol[]
        }

        const rels = this.getRelationships(symbolId)
        
        for (const rel of rels) {
            const related = this.graph.symbols.get(
                rel.sourceId === symbolId ? rel.targetId : rel.sourceId
            )
            if (!related) continue

            if (rel.type === 'extends') {
                if (rel.sourceId === symbolId) {
                    result.extends.push(related)
                } else {
                    result.extendedBy.push(related)
                }
            } else if (rel.type === 'implements') {
                if (rel.sourceId === symbolId) {
                    result.implements.push(related)
                } else {
                    result.implementedBy.push(related)
                }
            }
        }

        return result
    }

    /**
     * Remove a file and all its symbols
     */
    removeFile(filePath: string): void {
        const symbolIds = this.graph.byFile.get(filePath)
        if (!symbolIds) return

        for (const id of symbolIds) {
            this.removeSymbol(id)
        }

        this.graph.byFile.delete(filePath)
        this.indexVersion++

        logger.agent.debug('File removed from index', { filePath })
    }

    /**
     * Remove a symbol and its relationships
     */
    removeSymbol(symbolId: string): void {
        const symbol = this.graph.symbols.get(symbolId)
        if (!symbol) return

        // Remove from indices
        this.graph.byFile.get(symbol.filePath)?.delete(symbolId)
        this.graph.byName.get(symbol.name)?.delete(symbolId)

        // Remove relationships
        for (const [id, rel] of this.graph.relationships) {
            if (rel.sourceId === symbolId || rel.targetId === symbolId) {
                this.graph.relationships.delete(id)
            }
        }

        // Remove symbol
        this.graph.symbols.delete(symbolId)
    }

    /**
     * Get statistics
     */
    getStats(): {
        symbolCount: number
        relationshipCount: number
        fileCount: number
        indexVersion: number
    } {
        return {
            symbolCount: this.graph.symbols.size,
            relationshipCount: this.graph.relationships.size,
            fileCount: this.graph.byFile.size,
            indexVersion: this.indexVersion
        }
    }

    /**
     * Export the symbol graph
     */
    exportGraph(): {
        symbols: Symbol[]
        relationships: SymbolRelationship[]
    } {
        return {
            symbols: Array.from(this.graph.symbols.values()),
            relationships: Array.from(this.graph.relationships.values())
        }
    }

    /**
     * Import a symbol graph
     */
    importGraph(data: { symbols: Symbol[]; relationships: SymbolRelationship[] }): void {
        // Clear existing
        this.graph.symbols.clear()
        this.graph.relationships.clear()
        this.graph.byFile.clear()
        this.graph.byName.clear()

        // Import symbols
        for (const symbol of data.symbols) {
            this.addSymbol(symbol)
        }

        // Import relationships
        for (const rel of data.relationships) {
            this.addRelationship(rel)
        }

        this.indexVersion++

        logger.agent.info('Symbol graph imported', {
            symbolCount: data.symbols.length,
            relationshipCount: data.relationships.length
        })
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.graph.symbols.clear()
        this.graph.relationships.clear()
        this.graph.byFile.clear()
        this.graph.byName.clear()
        this.indexVersion = 0
        logger.agent.info('Symbol index cleared')
    }
}

export const symbolService = new SymbolService()
