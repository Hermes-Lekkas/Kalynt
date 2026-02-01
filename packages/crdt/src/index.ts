/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

// CRDT Document Manager
// Wraps Yjs for easy document management

export class DocumentManager {
    private documents: Map<string, Y.Doc> = new Map()
    private persistences: Map<string, IndexeddbPersistence> = new Map()

    /**
     * Get or create a Yjs document
     */
    getDocument(documentId: string): Y.Doc {
        let doc = this.documents.get(documentId)

        if (!doc) {
            doc = new Y.Doc()
            this.documents.set(documentId, doc)

            // Set up IndexedDB persistence
            try {
                const persistence = new IndexeddbPersistence(`kalynt-${documentId}`, doc)
                this.persistences.set(documentId, persistence)

                persistence.on('synced', () => {
                    // Debug log removed - will be silent in production
                })

                persistence.on('error', (err: unknown) => {
                    console.error(`[DocumentManager] Persistence error for ${documentId}:`, err)
                })
            } catch (e) {
                console.error(`[DocumentManager] Failed to init persistence for ${documentId}:`, e)
            }
        }

        return doc
    }

    /**
     * Get the text content of a document
     */
    getText(documentId: string, key: string = 'content'): Y.Text {
        const doc = this.getDocument(documentId)
        return doc.getText(key)
    }

    /**
     * Get a shared map from a document
     */
    getMap<T>(documentId: string, key: string): Y.Map<T> {
        const doc = this.getDocument(documentId)
        return doc.getMap(key)
    }

    /**
     * Get a shared array from a document
     */
    getArray<T>(documentId: string, key: string): Y.Array<T> {
        const doc = this.getDocument(documentId)
        return doc.getArray(key)
    }

    /**
     * Destroy a document and its persistence
     */
    destroyDocument(documentId: string): void {
        const persistence = this.persistences.get(documentId)
        if (persistence) {
            persistence.destroy()
            this.persistences.delete(documentId)
        }

        const doc = this.documents.get(documentId)
        if (doc) {
            doc.destroy()
            this.documents.delete(documentId)
        }
    }

    /**
     * Get update state vector for syncing
     */
    getStateVector(documentId: string): Uint8Array {
        const doc = this.getDocument(documentId)
        return Y.encodeStateVector(doc)
    }

    /**
     * Get encoded document state for full sync
     */
    getEncodedState(documentId: string): Uint8Array {
        const doc = this.getDocument(documentId)
        return Y.encodeStateAsUpdate(doc)
    }

    /**
     * Apply update from another peer
     */
    applyUpdate(documentId: string, update: Uint8Array): void {
        const doc = this.getDocument(documentId)
        try {
            Y.applyUpdate(doc, update)
        } catch (e) {
            console.error(`[DocumentManager] Failed to apply update to ${documentId}:`, e)
        }
    }

    /**
     * Subscribe to document updates
     */
    onUpdate(documentId: string, callback: (update: Uint8Array, origin: unknown) => void): () => void {
        const doc = this.getDocument(documentId)
        doc.on('update', callback)
        return () => {
            // Check if doc still exists before removing listener
            if (this.documents.has(documentId)) {
                doc.off('update', callback)
            }
        }
    }
}

// Singleton instance
export const documentManager = new DocumentManager()

// Re-export Yjs types for convenience
export { Y }
export type { IndexeddbPersistence }
