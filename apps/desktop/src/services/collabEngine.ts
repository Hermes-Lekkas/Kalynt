/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Collaborative Editing Engine - Enhanced Yjs wrapper with advanced features
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebrtcProvider } from 'y-webrtc'
import { p2pService } from './p2pService'

export interface CursorPosition {
    clientId: number
    user: { name: string; color: string }
    anchor: number
    head: number
    selection?: { from: number; to: number }
}

export interface EditOperation {
    id: string
    type: 'insert' | 'delete' | 'format' | 'undo' | 'redo'
    position: number
    content?: string
    length?: number
    format?: Record<string, any>
    timestamp: number
    userId: string
}

export interface DocumentSnapshot {
    id: string
    docId: string
    timestamp: number
    userId: string
    label?: string
    state: Uint8Array
}

export interface CollabConfig {
    enableHistory: boolean
    maxHistoryItems: number
    autoSaveInterval: number
    enablePresence: boolean
}

const DEFAULT_CONFIG: CollabConfig = {
    enableHistory: true,
    maxHistoryItems: 50,
    autoSaveInterval: 5000,
    enablePresence: true
}

class CollaborativeEngine {
    private docs: Map<string, Y.Doc> = new Map()
    private persistence: Map<string, IndexeddbPersistence> = new Map()
    private undoManagers: Map<string, Y.UndoManager> = new Map()
    private snapshots: Map<string, DocumentSnapshot[]> = new Map()

    private config: CollabConfig = DEFAULT_CONFIG
    // BUG-078: Creation lock to prevent race conditions
    private creationLocks: Set<string> = new Set()

    // Callbacks
    private onUpdate: ((docId: string, update: Uint8Array) => void) | null = null
    private onCursor: ((docId: string, cursors: CursorPosition[]) => void) | null = null
    private onStats: ((docId: string, stats: any) => void) | null = null

    setConfig(config: Partial<CollabConfig>) {
        this.config = { ...this.config, ...config }
    }

    setCallbacks(
        onUpdate: (docId: string, update: Uint8Array) => void,
        onCursor: (docId: string, cursors: CursorPosition[]) => void,
        onStats?: (docId: string, stats: any) => void
    ) {
        this.onUpdate = onUpdate
        this.onCursor = onCursor
        this.onStats = onStats || null
    }

    // Create or get a document
    getDocument(docId: string): Y.Doc {
        // BUG-079: Validation
        if (!/^[a-zA-Z0-9_\-./]+$/.test(docId)) {
            throw new Error(`Invalid docId format: ${docId}`)
        }

        if (this.docs.has(docId)) {
            return this.docs.get(docId)!
        }

        // BUG-078: Check creation lock
        if (this.creationLocks.has(docId)) {
            // In a sync environment, this shouldn't happen unless called recursively or if init became async.
            // We'll throw to be safe or return existing if we could (but we can't wait synchronously).
            // Given the architecture, if we hit this, something is wrong.
            throw new Error(`Document ${docId} is being initialized`)
        }

        this.creationLocks.add(docId)

        try {
            const doc = new Y.Doc()
            this.docs.set(docId, doc)

            // Set up persistence
            const persistence = new IndexeddbPersistence(docId, doc)
            this.persistence.set(docId, persistence)

            // Set up undo manager for editor content
            const editorText = doc.getText('editor-content')
            const undoManager = new Y.UndoManager(editorText, {
                captureTimeout: 500
            })
            this.undoManagers.set(docId, undoManager)

            // Track updates with error boundary
            doc.on('update', (update: Uint8Array, _origin: unknown) => {
                try {
                    this.onUpdate?.(docId, update)
                    // BUG-057: Trigger stats update on content change
                    this.onStats?.(docId, this.getStats(docId))
                } catch (error) {
                    console.error(`[CollabEngine] Error in update handler for ${docId}:`, error)
                }
            })


            return doc

        } finally {
            this.creationLocks.delete(docId)
        }
    }

    destroyDocument(docId: string) {
        this.disconnectP2P(docId)

        const persistence = this.persistence.get(docId)
        if (persistence) {
            persistence.destroy()
            this.persistence.delete(docId)
        }

        const undoManager = this.undoManagers.get(docId)
        if (undoManager) {
            undoManager.destroy()
            this.undoManagers.delete(docId)
        }

        const doc = this.docs.get(docId)
        if (doc) {
            doc.destroy()
            this.docs.delete(docId)
        }

        this.snapshots.delete(docId)
    }

    // Connect to P2P network with error handling
    connectP2P(docId: string, roomId: string, password?: string): WebrtcProvider | null {
        try {
            const doc = this.getDocument(docId)

            let provider = p2pService.getProvider(roomId)
            if (provider) {
                return provider
            }

            provider = p2pService.connect(roomId, doc, password) as WebrtcProvider

            if (!provider) return null

            // Handle sync events
            provider.on('synced', (event: { synced: boolean }) => {
                console.log(`[CollabEngine] P2P sync for ${docId}:`, event.synced ? 'synced' : 'syncing')
            })

            // Track cursor positions with error boundary
            if (this.config.enablePresence) {
                provider.awareness.on('change', () => {
                    try {
                        const cursors = this.getCursors(docId, roomId)
                        this.onCursor?.(docId, cursors)
                        // BUG-057: Trigger stats update on peer change
                        this.onStats?.(docId, this.getStats(docId, roomId))
                    } catch (error) {
                        console.error(`[CollabEngine] Error in awareness handler for ${docId}:`, error)
                    }
                })
            }

            return provider
        } catch (error) {
            console.error(`[CollabEngine] Failed to connect P2P for ${docId}:`, error)
            return null
        }
    }

    // Disconnect from P2P
    disconnectP2P(roomId: string) {
        p2pService.disconnect(roomId)
    }

    // Get text content
    getText(docId: string, name: string = 'editor-content'): Y.Text {
        const doc = this.getDocument(docId)
        return doc.getText(name)
    }

    // Get array
    getArray<T>(docId: string, name: string): Y.Array<T> {
        const doc = this.getDocument(docId)
        return doc.getArray<T>(name)
    }

    // Get map
    getMap<T>(docId: string, name: string): Y.Map<T> {
        const doc = this.getDocument(docId)
        return doc.getMap<T>(name)
    }

    // Undo
    undo(docId: string): boolean {
        const manager = this.undoManagers.get(docId)
        if (manager && manager.canUndo()) {
            manager.undo()
            return true
        }
        return false
    }

    // Redo
    redo(docId: string): boolean {
        const manager = this.undoManagers.get(docId)
        if (manager && manager.canRedo()) {
            manager.redo()
            return true
        }
        return false
    }

    // Check undo/redo availability
    canUndo(docId: string): boolean {
        return this.undoManagers.get(docId)?.canUndo() || false
    }

    canRedo(docId: string): boolean {
        return this.undoManagers.get(docId)?.canRedo() || false
    }

    // Create snapshot
    createSnapshot(docId: string, userId: string, label?: string): DocumentSnapshot {
        const doc = this.docs.get(docId)
        if (!doc) throw new Error('Document not found')

        const snapshot: DocumentSnapshot = {
            id: crypto.randomUUID(),
            docId,
            timestamp: Date.now(),
            userId,
            label,
            state: Y.encodeStateAsUpdate(doc)
        }

        // Store snapshot
        if (!this.snapshots.has(docId)) {
            this.snapshots.set(docId, [])
        }
        const snaps = this.snapshots.get(docId)!
        snaps.push(snapshot)

        // Limit snapshots (BUG-082)
        const limit = this.config.maxHistoryItems
        if (snaps.length > limit) {
            // Remove all excess items, not just one
            snaps.splice(0, snaps.length - limit)
        }

        return snapshot
    }

    // Get snapshots
    getSnapshots(docId: string): DocumentSnapshot[] {
        return this.snapshots.get(docId) || []
    }

    // Restore from snapshot
    restoreSnapshot(docId: string, snapshotId: string): boolean {
        const snaps = this.snapshots.get(docId)
        const snapshot = snaps?.find(s => s.id === snapshotId)

        if (!snapshot) return false

        const doc = this.docs.get(docId)
        if (!doc) return false

        // Create backup before restore
        this.createSnapshot(docId, 'system', 'Auto-backup before restore')

        // Apply snapshot
        try {
            Y.applyUpdate(doc, snapshot.state)
            return true
        } catch (error) {
            // BUG-080: Improved error handling
            console.error('[Collab] Failed to restore snapshot:', error)
            // Attempt to restore backup if simple apply failed? 
            // For now, at least strictly return false so caller knows.
            return false
        }
    }

    // Get cursors
    getCursors(docId: string, roomId?: string): CursorPosition[] {
        const provider = p2pService.getProvider(roomId || docId)
        // BUG-081: Check connection status to avoid stuck loops
        if (!provider || !provider.connected) return []

        const cursors: CursorPosition[] = []
        provider.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== provider.awareness.clientID && state.cursor) {
                cursors.push({
                    clientId,
                    user: state.user || { name: 'Anonymous', color: '#888' },
                    anchor: state.cursor.anchor,
                    head: state.cursor.head,
                    selection: state.cursor.selection
                })
            }
        })
        return cursors
    }

    // Set local cursor
    setCursor(docId: string, anchor: number, head: number, roomId?: string) {
        const provider = p2pService.getProvider(roomId || docId)
        if (provider) {
            provider.awareness.setLocalStateField('cursor', { anchor, head })
        }
    }

    // Set local user
    setLocalUser(docId: string, name: string, color: string, roomId?: string) {
        const provider = p2pService.getProvider(roomId || docId)
        if (provider) {
            provider.awareness.setLocalStateField('user', { name, color })
        }
    }

    // Merge documents (for conflict resolution)
    mergeDocuments(targetDocId: string, sourceDocId: string): void {
        if (targetDocId === sourceDocId) {
            console.warn('[Collab] Attempted to merge document with itself')
            return
        }

        const target = this.docs.get(targetDocId)
        const source = this.docs.get(sourceDocId)

        if (!target || !source) throw new Error('Documents not found')

        const sourceState = Y.encodeStateAsUpdate(source)
        Y.applyUpdate(target, sourceState)
    }

    // Export document state
    exportState(docId: string): Uint8Array | null {
        const doc = this.docs.get(docId)
        if (!doc) return null
        return Y.encodeStateAsUpdate(doc)
    }

    // Import document state
    importState(docId: string, state: Uint8Array): void {
        const doc = this.getDocument(docId)
        Y.applyUpdate(doc, state)
    }



    // Get stats
    getStats(docId: string, roomId?: string): {
        textLength: number
        taskCount: number
        messageCount: number
        snapshotCount: number
        peerCount: number
    } {
        const doc = this.docs.get(docId)
        const provider = p2pService.getProvider(roomId || docId)

        return {
            textLength: doc?.getText('editor-content').length || 0,
            taskCount: doc?.getArray('tasks').length || 0,
            messageCount: doc?.getArray('messages').length || 0,
            snapshotCount: this.snapshots.get(docId)?.length || 0,
            peerCount: provider ? provider.awareness.getStates().size - 1 : 0
        }
    }
}

// Singleton
export const collabEngine = new CollaborativeEngine()
