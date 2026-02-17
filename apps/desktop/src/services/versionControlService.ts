/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Version Control Service - Document history and conflict resolution
import * as Y from 'yjs'
import { collabEngine } from './collabEngine'

export type VersionType = 'manual' | 'auto' | 'merge' | 'checkpoint'

export interface Version {
    id: string
    docId: string
    number: number
    label: string
    description: string
    author: string
    authorName: string
    timestamp: number
    state: Uint8Array
    parentId?: string
    isBranch: boolean
    branchName?: string
    type: VersionType
    tags: string[]
}

export interface Diff {
    type: 'insert' | 'delete' | 'retain'
    position: number
    content?: string
    length?: number
}

export interface Conflict {
    id: string
    docId: string
    type: 'concurrent-edit' | 'merge-conflict' | 'diverged'
    description: string
    localState: Uint8Array
    remoteState: Uint8Array
    resolvedState?: Uint8Array
    status: 'pending' | 'resolved' | 'dismissed'
    timestamp: number
}

export interface MergeResult {
    success: boolean
    conflicts: Conflict[]
    mergedState?: Uint8Array
}

class VersionControlService {
    private versions: Map<string, Version[]> = new Map()
    private branches: Map<string, Map<string, string | undefined>> = new Map() // docId -> branchName -> headVersionId
    private conflicts: Map<string, Conflict[]> = new Map()
    private currentBranch: Map<string, string> = new Map() // docId -> branchName

    constructor() {
        this.loadFromStorage()
    }

    private persist(): void {
        try {
            const data = {
                versions: Array.from(this.versions.entries()),
                branches: Array.from(this.branches.entries()).map(([docId, branchMap]) => [
                    docId,
                    Array.from(branchMap.entries())
                ]),
                currentBranch: Array.from(this.currentBranch.entries())
            }
            
            const serializableData = JSON.parse(JSON.stringify(data, (_, value) => {
                if (value instanceof Uint8Array) {
                    return btoa(String.fromCharCode(...value))
                }
                return value
            }))
            
            localStorage.setItem('kalynt_versions', JSON.stringify(serializableData))
        } catch (e) {
            console.error('[VersionControl] Failed to persist:', e)
        }
    }

    private loadFromStorage(): void {
        try {
            const raw = localStorage.getItem('kalynt_versions')
            if (!raw) return

            const parsed = JSON.parse(raw, (key, value) => {
                if ((key === 'state' || key === 'localState' || key === 'remoteState') && typeof value === 'string') {
                    const binary = atob(value)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i)
                    }
                    return bytes
                }
                return value
            })

            if (parsed.versions) {
                this.versions = new Map(parsed.versions)
            }
            
            if (parsed.branches) {
                this.branches = new Map(parsed.branches.map(([docId, branchEntries]: [string, any]) => [
                    docId,
                    new Map(branchEntries)
                ]))
            }

            if (parsed.currentBranch) {
                this.currentBranch = new Map(parsed.currentBranch)
            }
        } catch (e) {
            console.warn('[VersionControl] Failed to load from storage:', e)
        }
    }

    // Create a new version (commit)
    createVersion(
        docId: string,
        label: string,
        description: string,
        author: string,
        authorName: string,
        type: VersionType = 'manual',
        tags: string[] = []
    ): Version {
        const doc = collabEngine.getDocument(docId)
        if (!doc) throw new Error('Document not found')

        const versions = this.versions.get(docId) || []
        const branchName = this.currentBranch.get(docId) || 'main'

        // Get parent version
        const branchHeads = this.branches.get(docId) || new Map()
        const parentId = branchHeads.get(branchName)

        const version: Version = {
            id: crypto.randomUUID(),
            docId,
            number: versions.length + 1,
            label,
            description,
            author,
            authorName,
            timestamp: Date.now(),
            state: Y.encodeStateAsUpdate(doc),
            parentId,
            isBranch: false,
            branchName,
            type,
            tags
        }

        versions.push(version)
        this.versions.set(docId, versions)

        // Update branch head
        branchHeads.set(branchName, version.id)
        this.branches.set(docId, branchHeads)

        this.persist()
        return version
    }

    // Add tag to version
    addTag(docId: string, versionId: string, tag: string): boolean {
        const versions = this.versions.get(docId)
        if (!versions) return false
        const version = versions.find(v => v.id === versionId)
        if (!version) return false
        if (!version.tags.includes(tag)) {
            version.tags.push(tag)
            this.persist()
            return true
        }
        return false
    }

    // Get all versions for a document
    getVersions(docId: string): Version[] {
        return this.versions.get(docId) || []
    }

    // Get version by ID
    getVersion(docId: string, versionId: string): Version | undefined {
        return this.versions.get(docId)?.find(v => v.id === versionId)
    }

    // Get latest version
    getLatestVersion(docId: string, branchName: string = 'main'): Version | undefined {
        const versions = this.versions.get(docId) || []
        return versions
            .filter(v => v.branchName === branchName)
            .sort((a, b) => b.timestamp - a.timestamp)[0]
    }

    // Restore to a specific version
    restoreVersion(docId: string, versionId: string): boolean {
        const version = this.getVersion(docId, versionId)
        if (!version) return false

        const doc = collabEngine.getDocument(docId)
        if (!doc) return false

        // Apply the version state (restores editor content only)
        Y.applyUpdate(doc, version.state)
        return true
    }

    // Create a branch
    createBranch(docId: string, branchName: string, fromVersionId?: string): boolean {
        const branchHeads = this.branches.get(docId) || new Map<string, string | undefined>()

        if (branchHeads.has(branchName)) {
            return false // Branch already exists
        }

        const sourceBranch = this.currentBranch.get(docId) || 'main'
        const sourceVersionId = fromVersionId || branchHeads.get(sourceBranch)

        // Initialize branch with source version ID, or undefined if no versions exist
        branchHeads.set(branchName, sourceVersionId)

        // Ensure current branch map is initialized
        if (!this.currentBranch.has(docId)) {
            this.currentBranch.set(docId, 'main')
        }

        this.branches.set(docId, branchHeads)
        this.persist()
        return true
    }

    // Delete a version
    deleteVersion(docId: string, versionId: string): boolean {
        const versions = this.versions.get(docId)
        if (!versions) return false

        const index = versions.findIndex(v => v.id === versionId)
        if (index === -1) return false

        versions.splice(index, 1)
        this.versions.set(docId, versions)

        // Update branch heads if this version was a head
        const branchHeads = this.branches.get(docId)
        if (branchHeads) {
            for (const [branch, headId] of branchHeads.entries()) {
                if (headId === versionId) {
                    // Find new head (most recent version in that branch)
                    const newHead = this.getLatestVersion(docId, branch)
                    if (newHead) {
                        branchHeads.set(branch, newHead.id)
                    } else {
                        branchHeads.delete(branch)
                        // If it's main, we might want to keep it empty
                        if (branch === 'main') {
                            branchHeads.set('main', undefined)
                        }
                    }
                }
            }
        }

        this.persist()
        return true
    }

    // Switch branch
    switchBranch(docId: string, branchName: string): boolean {
        const branchHeads = this.branches.get(docId)
        if (!branchHeads?.has(branchName)) return false

        this.currentBranch.set(docId, branchName)

        // Restore to branch head
        const headVersionId = branchHeads.get(branchName)
        if (headVersionId) {
            this.restoreVersion(docId, headVersionId)
        }

        this.persist()
        return true
    }

    // Get branches
    getBranches(docId: string): string[] {
        const branchHeads = this.branches.get(docId)
        if (!branchHeads) return ['main']
        return Array.from(branchHeads.keys())
    }

    // Get current branch
    getCurrentBranch(docId: string): string {
        return this.currentBranch.get(docId) || 'main'
    }

    // Merge branches
    mergeBranches(docId: string, sourceBranch: string, targetBranch: string): MergeResult {
        const branchHeads = this.branches.get(docId)
        if (!branchHeads) {
            return { success: false, conflicts: [] }
        }

        const sourceHeadId = branchHeads.get(sourceBranch)
        const targetHeadId = branchHeads.get(targetBranch)

        if (!sourceHeadId || !targetHeadId) {
            return { success: false, conflicts: [] }
        }

        const sourceVersion = this.getVersion(docId, sourceHeadId)
        const targetVersion = this.getVersion(docId, targetHeadId)

        if (!sourceVersion || !targetVersion) {
            return { success: false, conflicts: [] }
        }

        return this.applyMerge(docId, sourceVersion, targetVersion, sourceBranch, targetBranch)
    }

    private applyMerge(docId: string, sourceVersion: Version, targetVersion: Version, sourceBranch: string, targetBranch: string): MergeResult {
        // Create a new document for merging
        const mergeDoc = new Y.Doc()

        // Apply target state first
        Y.applyUpdate(mergeDoc, targetVersion.state)

        // Try to apply source state (Yjs handles CRDT merge automatically)
        try {
            Y.applyUpdate(mergeDoc, sourceVersion.state)

            const mergedState = Y.encodeStateAsUpdate(mergeDoc)

            // Update the document
            const doc = collabEngine.getDocument(docId)
            if (doc) {
                Y.applyUpdate(doc, mergedState)
            }

            // Create merge version
            this.createVersion(
                docId,
                `Merge ${sourceBranch} into ${targetBranch}`,
                `Merged branch ${sourceBranch} into ${targetBranch}`,
                'system',
                'System',
                'merge'
            )

            return { success: true, conflicts: [], mergedState }
        } catch (e) {
            console.warn('[VersionControl] Auto-merge failed, creating conflict:', e)
            // If merge fails, create conflict
            const conflict: Conflict = {
                id: crypto.randomUUID(),
                docId,
                type: 'merge-conflict',
                description: `Conflict merging ${sourceBranch} into ${targetBranch}`,
                localState: targetVersion.state,
                remoteState: sourceVersion.state,
                status: 'pending',
                timestamp: Date.now()
            }

            const conflicts = this.conflicts.get(docId) || []
            conflicts.push(conflict)
            this.conflicts.set(docId, conflicts)

            return { success: false, conflicts: [conflict] }
        }
    }

    // Get conflicts
    getConflicts(docId: string): Conflict[] {
        return this.conflicts.get(docId)?.filter(c => c.status === 'pending') || []
    }

    // Resolve conflict
    resolveConflict(docId: string, conflictId: string, resolution: 'local' | 'remote' | 'manual', manualState?: Uint8Array): boolean {
        const conflicts = this.conflicts.get(docId) || []
        const conflict = conflicts.find(c => c.id === conflictId)

        if (!conflict) return false

        const doc = collabEngine.getDocument(docId)
        if (!doc) return false

        let resolvedState: Uint8Array

        switch (resolution) {
            case 'local':
                resolvedState = conflict.localState
                break
            case 'remote':
                resolvedState = conflict.remoteState
                break
            case 'manual':
                if (!manualState) return false
                resolvedState = manualState
                break
        }

        // Apply resolved state
        Y.applyUpdate(doc, resolvedState)

        conflict.resolvedState = resolvedState
        conflict.status = 'resolved'

        this.persist()
        return true
    }

    // Dismiss conflict
    dismissConflict(docId: string, conflictId: string): boolean {
        const conflicts = this.conflicts.get(docId) || []
        const conflict = conflicts.find(c => c.id === conflictId)

        if (!conflict) return false

        conflict.status = 'dismissed'
        this.persist()
        return true
    }

    // Compare two versions
    compareVersions(docId: string, versionAId: string, versionBId: string): {
        aContent: string
        bContent: string
        additions: number
        deletions: number
    } | null {
        const versionA = this.getVersion(docId, versionAId)
        const versionB = this.getVersion(docId, versionBId)

        if (!versionA || !versionB) return null

        // Create temp docs to extract content
        const docA = new Y.Doc()
        const docB = new Y.Doc()

        Y.applyUpdate(docA, versionA.state)
        Y.applyUpdate(docB, versionB.state)

        const aContent = docA.getText('editor-content').toJSON()
        const bContent = docB.getText('editor-content').toJSON()

        // Simple diff counts
        const additions = Math.max(0, bContent.length - aContent.length)
        const deletions = Math.max(0, aContent.length - bContent.length)

        docA.destroy()
        docB.destroy()

        return { aContent, bContent, additions, deletions }
    }

    // Get version history for timeline
    getTimeline(docId: string): Array<{
        id: string
        label: string
        description: string
        author: string
        timestamp: number
        branch: string
        type: VersionType
        tags: string[]
    }> {
        const versions = this.versions.get(docId) || []
        return [...versions]
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(v => ({
                id: v.id,
                label: v.label,
                description: v.description,
                author: v.authorName,
                timestamp: v.timestamp,
                branch: v.branchName || 'main',
                type: v.type,
                tags: v.tags
            }))
    }

    // Auto-save as version (debounced)
    private readonly autoSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

    scheduleAutoSave(docId: string, author: string, authorName: string, delay: number = 30000): void {
        // Clear existing timer
        const existing = this.autoSaveTimers.get(docId)
        if (existing) clearTimeout(existing)

        // Set new timer
        const timer = setTimeout(() => {
            this.createVersion(docId, 'Auto-save', 'Automatic save point', author, authorName, 'auto')
            this.autoSaveTimers.delete(docId)
        }, delay)

        this.autoSaveTimers.set(docId, timer)
    }

    cancelAutoSave(docId: string): void {
        const timer = this.autoSaveTimers.get(docId)
        if (timer) {
            clearTimeout(timer)
            this.autoSaveTimers.delete(docId)
        }
    }
}

// Singleton
export const versionControlService = new VersionControlService()
