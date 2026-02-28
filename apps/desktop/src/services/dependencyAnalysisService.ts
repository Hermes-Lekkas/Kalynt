/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Dependency Analysis Service - Tool Call Dependency Analysis
 * 
 * Analyzes dependencies between tool calls to determine which can be executed
 * in parallel and which must be sequential. Enables parallel execution for
 * independent operations.
 */

import { logger } from '../utils/logger'

export interface ToolCall {
    id: string
    toolName: string
    params: Record<string, unknown>
    estimatedDuration?: number
    priority?: number
}

export interface Dependency {
    from: string  // Tool call ID
    to: string    // Tool call ID
    type: 'data' | 'file' | 'order' | 'resource'
    reason: string
}

export interface DependencyGraph {
    nodes: Map<string, ToolCall>
    edges: Map<string, Dependency[]>
    incomingEdges: Map<string, Dependency[]>
}

export interface ExecutionPlan {
    sequential: ToolCall[][]  // Each inner array can be executed in parallel
    criticalPath: string[]     // IDs of tools on critical path
    estimatedTotalTime: number
    parallelizableCount: number
}

export interface ResourceConflict {
    resource: string
    toolIds: string[]
    conflictType: 'read_write' | 'write_write' | 'exclusive'
}

class DependencyAnalysisService {
    private dependencyRules = new Map<string, DependencyRule[]>()

    constructor() {
        this.registerDefaultRules()
    }

    /**
     * Build a dependency graph from a list of tool calls
     */
    buildDependencyGraph(toolCalls: ToolCall[]): DependencyGraph {
        const graph: DependencyGraph = {
            nodes: new Map(),
            edges: new Map(),
            incomingEdges: new Map()
        }

        // Add nodes
        for (const call of toolCalls) {
            graph.nodes.set(call.id, call)
            graph.edges.set(call.id, [])
            graph.incomingEdges.set(call.id, [])
        }

        // Analyze dependencies
        for (let i = 0; i < toolCalls.length; i++) {
            for (let j = i + 1; j < toolCalls.length; j++) {
                const call1 = toolCalls[i]
                const call2 = toolCalls[j]

                const dependency = this.analyzeDependency(call1, call2)
                if (dependency) {
                    // call2 depends on call1
                    graph.edges.get(call1.id)!.push({
                        from: call1.id,
                        to: call2.id,
                        type: dependency.type,
                        reason: dependency.reason
                    })
                    graph.incomingEdges.get(call2.id)!.push({
                        from: call1.id,
                        to: call2.id,
                        type: dependency.type,
                        reason: dependency.reason
                    })
                }
            }
        }

        logger.agent.debug('Dependency graph built', {
            nodes: graph.nodes.size,
            edges: Array.from(graph.edges.values()).reduce((sum, deps) => sum + deps.length, 0)
        })

        return graph
    }

    /**
     * Create an execution plan from a dependency graph
     */
    createExecutionPlan(graph: DependencyGraph): ExecutionPlan {
        const plan: ExecutionPlan = {
            sequential: [],
            criticalPath: [],
            estimatedTotalTime: 0,
            parallelizableCount: 0
        }

        // Copy of incoming edges for algorithm
        const inDegree = new Map<string, number>()
        for (const [id, deps] of graph.incomingEdges) {
            inDegree.set(id, deps.length)
        }

        // Topological sort with level grouping
        let currentLevel: ToolCall[] = []
        const processed = new Set<string>()

        // Find initial nodes (no dependencies)
        for (const [id, call] of graph.nodes) {
            if (inDegree.get(id) === 0) {
                currentLevel.push(call)
                processed.add(id)
            }
        }

        while (currentLevel.length > 0) {
            plan.sequential.push(currentLevel)
            plan.parallelizableCount += currentLevel.length > 1 ? currentLevel.length : 0

            const nextLevel: ToolCall[] = []

            for (const call of currentLevel) {
                const outgoing = graph.edges.get(call.id) || []
                
                for (const dep of outgoing) {
                    const newDegree = (inDegree.get(dep.to) || 0) - 1
                    inDegree.set(dep.to, newDegree)

                    if (newDegree === 0 && !processed.has(dep.to)) {
                        const nextCall = graph.nodes.get(dep.to)
                        if (nextCall) {
                            nextLevel.push(nextCall)
                            processed.add(dep.to)
                        }
                    }
                }
            }

            currentLevel = nextLevel
        }

        // Calculate critical path
        plan.criticalPath = this.findCriticalPath(graph)

        // Estimate total time (assuming perfect parallelization)
        let totalTime = 0
        for (const level of plan.sequential) {
            const maxDuration = Math.max(...level.map(c => c.estimatedDuration || 1000))
            totalTime += maxDuration
        }
        plan.estimatedTotalTime = totalTime

        logger.agent.debug('Execution plan created', {
            levels: plan.sequential.length,
            parallelizable: plan.parallelizableCount,
            criticalPathLength: plan.criticalPath.length
        })

        return plan
    }

    /**
     * Find resource conflicts between tool calls
     */
    findResourceConflicts(toolCalls: ToolCall[]): ResourceConflict[] {
        const conflicts: ResourceConflict[] = []
        const resourceUsage = new Map<string, Array<{ toolId: string; mode: 'read' | 'write' }>>()

        // Collect resource usage
        for (const call of toolCalls) {
            const resources = this.extractResources(call)
            
            for (const res of resources) {
                if (!resourceUsage.has(res.path)) {
                    resourceUsage.set(res.path, [])
                }
                resourceUsage.get(res.path)!.push({
                    toolId: call.id,
                    mode: res.mode
                })
            }
        }

        // Find conflicts
        for (const [resource, usages] of resourceUsage) {
            const writers = usages.filter(u => u.mode === 'write')
            const readers = usages.filter(u => u.mode === 'read')

            // Write-write conflict
            if (writers.length > 1) {
                conflicts.push({
                    resource,
                    toolIds: writers.map(u => u.toolId),
                    conflictType: 'write_write'
                })
            }

            // Read-write conflict
            if (writers.length > 0 && readers.length > 0) {
                conflicts.push({
                    resource,
                    toolIds: [...writers.map(u => u.toolId), ...readers.map(u => u.toolId)],
                    conflictType: 'read_write'
                })
            }
        }

        return conflicts
    }

    /**
     * Check if a set of tool calls can be executed in parallel
     */
    canExecuteInParallel(toolCalls: ToolCall[]): {
        canParallelize: boolean
        conflicts: ResourceConflict[]
        dependencies: Dependency[]
    } {
        const graph = this.buildDependencyGraph(toolCalls)
        const conflicts = this.findResourceConflicts(toolCalls)

        // Collect all dependencies
        const allDependencies: Dependency[] = []
        for (const deps of graph.edges.values()) {
            allDependencies.push(...deps)
        }

        // Can parallelize if no conflicts and no dependencies
        const canParallelize = conflicts.length === 0 && allDependencies.length === 0

        return { canParallelize, conflicts, dependencies: allDependencies }
    }

    /**
     * Optimize tool call order for maximum parallelization
     */
    optimizeOrder(toolCalls: ToolCall[]): ToolCall[] {
        const graph = this.buildDependencyGraph(toolCalls)
        const plan = this.createExecutionPlan(graph)

        // Flatten sequential levels into optimized order
        const optimized: ToolCall[] = []
        for (const level of plan.sequential) {
            // Sort by priority within level
            const sorted = level.sort((a, b) => (b.priority || 0) - (a.priority || 0))
            optimized.push(...sorted)
        }

        return optimized
    }

    /**
     * Get execution groups for parallel execution
     */
    getParallelGroups(toolCalls: ToolCall[]): ToolCall[][] {
        const graph = this.buildDependencyGraph(toolCalls)
        const plan = this.createExecutionPlan(graph)
        return plan.sequential
    }

    /**
     * Register a custom dependency rule
     */
    registerDependencyRule(toolName: string, rule: DependencyRule): void {
        if (!this.dependencyRules.has(toolName)) {
            this.dependencyRules.set(toolName, [])
        }
        this.dependencyRules.get(toolName)!.push(rule)
    }

    // --- Private methods ---

    private analyzeDependency(
        call1: ToolCall,
        call2: ToolCall
    ): { type: Dependency['type']; reason: string } | null {
        // Check for file dependencies
        const file1 = call1.params.filePath as string
        const file2 = call2.params.filePath as string

        if (file1 && file2 && file1 === file2) {
            // Same file operations typically need ordering
            if (this.isWriteOperation(call1) && this.isReadOperation(call2)) {
                return { type: 'data', reason: `Write to ${file1} must complete before read` }
            }
            if (this.isWriteOperation(call1) && this.isWriteOperation(call2)) {
                return { type: 'file', reason: `Sequential writes to ${file1}` }
            }
        }

        // Check custom rules
        const rules = this.dependencyRules.get(call2.toolName) || []
        for (const rule of rules) {
            if (rule.check(call1, call2)) {
                return { type: rule.type, reason: rule.reason }
            }
        }

        // Check for explicit dependencies in params
        const dependsOn = call2.params.dependsOn as string[]
        if (dependsOn && dependsOn.includes(call1.id)) {
            return { type: 'order', reason: `Explicit dependency from ${call2.id} to ${call1.id}` }
        }

        return null
    }

    private isWriteOperation(call: ToolCall): boolean {
        const writeTools = ['writeFile', 'replaceInFile', 'fuzzyReplace', 'deleteFile', 'createFile']
        return writeTools.includes(call.toolName)
    }

    private isReadOperation(call: ToolCall): boolean {
        const readTools = ['readFile', 'getFileTree', 'listDirectory', 'searchFiles']
        return readTools.includes(call.toolName)
    }

    private extractResources(call: ToolCall): Array<{ path: string; mode: 'read' | 'write' }> {
        const resources: Array<{ path: string; mode: 'read' | 'write' }> = []
        const filePath = call.params.filePath as string

        if (filePath) {
            resources.push({
                path: filePath,
                mode: this.isWriteOperation(call) ? 'write' : 'read'
            })
        }

        return resources
    }

    private findCriticalPath(graph: DependencyGraph): string[] {
        // Simple critical path - longest chain of dependencies
        const path: string[] = []
        const visited = new Set<string>()

        const dfs = (nodeId: string, currentPath: string[]): string[] => {
            if (visited.has(nodeId)) return currentPath

            visited.add(nodeId)
            currentPath.push(nodeId)

            const outgoing = graph.edges.get(nodeId) || []
            let longestPath = [...currentPath]

            for (const dep of outgoing) {
                const newPath = dfs(dep.to, [...currentPath])
                if (newPath.length > longestPath.length) {
                    longestPath = newPath
                }
            }

            return longestPath
        }

        // Find longest path from each starting node
        for (const [id, _] of graph.nodes) {
            const incoming = graph.incomingEdges.get(id) || []
            if (incoming.length === 0) {
                // Starting node
                const currentPath = dfs(id, [])
                if (currentPath.length > path.length) {
                    path.length = 0
                    path.push(...currentPath)
                }
            }
        }

        return path
    }

    private registerDefaultRules(): void {
        // readFile before writeFile on same path
        this.registerDependencyRule('writeFile', {
            check: (call1, call2) => {
                return call1.toolName === 'readFile' &&
                       call1.params.filePath === call2.params.filePath
            },
            type: 'data',
            reason: 'Read file before writing to it'
        })

        // File must exist before replacing
        this.registerDependencyRule('replaceInFile', {
            check: (call1, call2) => {
                return (call1.toolName === 'createFile' || call1.toolName === 'writeFile') &&
                       call1.params.filePath === call2.params.filePath
            },
            type: 'file',
            reason: 'File must be created before replacing content'
        })
    }
}

interface DependencyRule {
    check: (call1: ToolCall, call2: ToolCall) => boolean
    type: Dependency['type']
    reason: string
}

export const dependencyAnalysisService = new DependencyAnalysisService()
