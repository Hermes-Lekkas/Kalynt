/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// P2P File Transfer Service - Tiered transfer with chunking
import * as Y from 'yjs'
import { collabEngine } from './collabEngine'
import { p2pService, PeerInfo } from './p2pService'

export type TransferTier = 'small' | 'medium' | 'large'

export interface SharedFile {
    id: string
    name: string
    size: number
    type: string
    uploadedAt: number
    uploadedBy: string
    ownerId: string
    tier: TransferTier
    // For small files: full content. For medium/large: chunk references
    content?: string
    chunkCount?: number
    isLocal: boolean
}

export interface FileChunk {
    fileId: string
    index: number
    data: string // Base64
}

export type FileTransferCallback = (files: SharedFile[]) => void
export type PeersCallback = (peers: PeerInfo[]) => void
export type ProgressCallback = (fileId: string, progress: number) => void

// Tier size limits
const TIER_LIMITS = {
    small: 5 * 1024 * 1024,      // 5MB
    medium: 50 * 1024 * 1024,    // 50MB
    large: 200 * 1024 * 1024     // 200MB
}

const CHUNK_SIZE = 256 * 1024 // 256KB chunks

class FileTransferService {
    private docId: string | null = null
    private roomId: string | null = null
    private localUserId: string = crypto.randomUUID()
    private onFilesChange: FileTransferCallback | null = null
    private onPeersChange: PeersCallback | null = null
    private onProgress: ProgressCallback | null = null
    private initialized: boolean = false
    // RACE CONDITION FIX: Track initialization sequence to prevent stale callbacks
    private initSequence: number = 0

    init(roomId: string, docId: string) {
        // Prevent double init or stale observer issues
        if (this.initialized && this.roomId === roomId) return

        // RACE CONDITION FIX: Increment sequence to invalidate any pending callbacks
        const currentSequence = ++this.initSequence

        // Set state FIRST before any async operations
        this.roomId = roomId
        this.docId = docId
        this.initialized = true

        const provider = collabEngine.connectP2P(docId, roomId)
        if (!provider) {
            console.error('[FileTransfer] Failed to connect P2P, file sharing may not work')
        }

        // Defer observer setup to next tick to avoid race conditions
        // with Yjs triggering observers immediately from persisted IndexedDB data
        setTimeout(() => {
            // RACE CONDITION FIX: Check sequence to ensure this callback is still valid
            if (!this.initialized || this.docId !== docId || this.initSequence !== currentSequence) {
                console.log('[FileTransfer] Skipping stale observer setup')
                return
            }

            const filesMap = this.getFilesMap()
            if (filesMap) {
                filesMap.observe(() => {
                    if (this.initialized && this.docId) this.notifyFilesChange()
                })
            }

            const chunksMap = this.getChunksMap()
            if (chunksMap) {
                chunksMap.observe(() => {
                    if (this.initialized && this.docId) this.notifyFilesChange()
                })
            }

            // Trigger initial load
            this.notifyFilesChange()
        }, 0)

        p2pService.setRoomCallbacks(roomId, {
            onPeers: (peers) => this.onPeersChange?.(peers)
        })

        console.log('[FileTransfer] Initialized for room:', roomId)
    }

    destroy() {
        this.initialized = false
        if (this.docId) collabEngine.disconnectP2P(this.docId)
        this.docId = null
        this.roomId = null
    }

    setCallbacks(onFiles: FileTransferCallback, onPeers: PeersCallback, onProgress?: ProgressCallback) {
        this.onFilesChange = onFiles
        this.onPeersChange = onPeers
        this.onProgress = onProgress || null
    }

    private getFilesMap(): Y.Map<SharedFile> | null {
        if (!this.docId || !this.initialized) return null
        return collabEngine.getMap<SharedFile>(this.docId, 'shared-files')
    }

    private getChunksMap(): Y.Map<FileChunk> | null {
        if (!this.docId || !this.initialized) return null
        return collabEngine.getMap<FileChunk>(this.docId, 'file-chunks')
    }

    private notifyFilesChange() {
        if (!this.onFilesChange || !this.initialized) return

        const filesMap = this.getFilesMap()
        if (!filesMap) return

        const files: SharedFile[] = []

        filesMap.forEach((file) => {
            files.push({
                ...file,
                isLocal: file.ownerId === this.localUserId
            })
        })

        files.sort((a, b) => b.uploadedAt - a.uploadedAt)
        this.onFilesChange(files)
    }

    // Determine the actual tier based on file size (with fallback)
    determineTier(fileSize: number, requestedTier: TransferTier): TransferTier {
        if (fileSize <= TIER_LIMITS.small) return 'small'
        if (fileSize <= TIER_LIMITS.medium) return requestedTier === 'small' ? 'medium' : requestedTier
        if (fileSize <= TIER_LIMITS.large) return 'large'

        // File too large
        throw new Error(`File size ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds maximum of 200MB`)
    }

    // Get tier info for UI
    getTierInfo(tier: TransferTier): { label: string; maxSize: string; description: string } {
        switch (tier) {
            case 'small':
                return { label: 'Quick', maxSize: '5MB', description: 'Instant sync (â‰¤5MB)' }
            case 'medium':
                return { label: 'Standard', maxSize: '50MB', description: 'Chunked transfer (â‰¤50MB)' }
            case 'large':
                return { label: 'Large', maxSize: '200MB', description: 'Streaming (â‰¤200MB)' }
        }
    }

    async shareFile(file: File, uploaderName: string, requestedTier: TransferTier = 'small'): Promise<{ success: boolean; actualTier?: TransferTier; error?: string }> {
        if (!this.docId) return { success: false, error: 'Not initialized' }

        // Validate file
        if (!file) return { success: false, error: 'No file provided' }
        if (file.size < 0) return { success: false, error: 'Invalid file size' }
        if (file.size === 0) return { success: false, error: 'Cannot upload empty file' }
        
        // Check maximum size (200MB)
        const MAX_FILE_SIZE = 200 * 1024 * 1024
        if (file.size > MAX_FILE_SIZE) {
            return { 
                success: false, 
                error: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum of 200MB` 
            }
        }

        // Check available storage (IndexedDB has ~50-100MB limit in some browsers)
        const estimatedStorage = file.size * 1.4 // Base64 overhead
        if (estimatedStorage > 50 * 1024 * 1024) {
            console.warn('[FileTransfer] Large file may exceed browser storage limits')
        }

        try {
            const actualTier = this.determineTier(file.size, requestedTier)
            const fileId = crypto.randomUUID()

            if (actualTier === 'small') {
                // Direct inline transfer
                const content = await this.fileToBase64(file)
                const sharedFile: SharedFile = {
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    uploadedAt: Date.now(),
                    uploadedBy: uploaderName,
                    ownerId: this.localUserId,
                    tier: actualTier,
                    content,
                    isLocal: true
                }

                const filesMap = this.getFilesMap()
                if (!filesMap) return { success: false, error: 'Not initialized' }
                filesMap.set(fileId, sharedFile)
            } else {
                // Chunked transfer for medium/large
                const chunks = await this.splitFileIntoChunks(file, fileId)

                // Store file metadata first
                const sharedFile: SharedFile = {
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    uploadedAt: Date.now(),
                    uploadedBy: uploaderName,
                    ownerId: this.localUserId,
                    tier: actualTier,
                    chunkCount: chunks.length,
                    isLocal: true
                }

                const filesMap = this.getFilesMap()
                if (!filesMap) return { success: false, error: 'Not initialized' }
                filesMap.set(fileId, sharedFile)

                // Upload chunks with progress
                const chunksMap = this.getChunksMap()
                if (chunksMap) {
                    for (let i = 0; i < chunks.length; i++) {
                        chunksMap.set(`${fileId}-${i}`, chunks[i])
                        this.onProgress?.(fileId, ((i + 1) / chunks.length) * 100)

                        // Small delay to prevent overwhelming the sync
                        if (actualTier === 'large' && i % 10 === 0) {
                            await new Promise(r => setTimeout(r, 50))
                        }
                    }
                }
            }

            console.log(`[FileTransfer] Shared file (${actualTier}):`, file.name)
            return { success: true, actualTier }
        } catch (err) {
            console.error('[FileTransfer] Failed to share file:', err)
            return { success: false, error: String(err) }
        }
    }

    private async splitFileIntoChunks(file: File, fileId: string): Promise<FileChunk[]> {
        const chunks: FileChunk[] = []
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

        // Limit maximum chunks to prevent memory issues
        const MAX_CHUNKS = 1000
        if (totalChunks > MAX_CHUNKS) {
            throw new Error(`File would create ${totalChunks} chunks, maximum is ${MAX_CHUNKS}. Try a smaller file.`)
        }

        for (let i = 0; i < totalChunks; i++) {
            try {
                const start = i * CHUNK_SIZE
                const end = Math.min(start + CHUNK_SIZE, file.size)
                const blob = file.slice(start, end)
                const data = await this.blobToBase64(blob)

                // Validate chunk data
                if (!data || data.length === 0) {
                    throw new Error(`Failed to encode chunk ${i}: empty data`)
                }

                chunks.push({
                    fileId,
                    index: i,
                    data
                })

                // Yield to event loop every 10 chunks to prevent blocking
                if (i % 10 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            } catch (error) {
                throw new Error(`Failed to process chunk ${i}: ${error}`)
            }
        }

        return chunks
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            const timeout = setTimeout(() => {
                reader.abort()
                reject(new Error('Blob read timeout (10s)'))
            }, 10000)

            reader.readAsDataURL(blob)
            reader.onload = () => {
                clearTimeout(timeout)
                try {
                    const result = reader.result as string
                    if (!result || !result.includes(',')) {
                        reject(new Error('Invalid blob data'))
                        return
                    }
                    resolve(result.split(',')[1])
                } catch (error) {
                    reject(new Error(`Failed to process blob: ${error}`))
                }
            }
            reader.onerror = () => {
                clearTimeout(timeout)
                reject(new Error(`BlobReader error: ${reader.error?.message || 'unknown'}`))
            }
            reader.onabort = () => {
                clearTimeout(timeout)
                reject(new Error('Blob read aborted'))
            }
        })
    }

    removeFile(fileId: string, isAdmin: boolean = false): boolean {
        if (!this.docId || !this.initialized) return false

        const filesMap = this.getFilesMap()
        if (!filesMap) return false
        const file = filesMap.get(fileId)

        // Only the owner or an admin can remove a file
        if (file && (file.ownerId === this.localUserId || isAdmin)) {
            // Remove chunks if it's a chunked file
            if (file.chunkCount) {
                const chunksMap = this.getChunksMap()
                if (chunksMap) {
                    for (let i = 0; i < file.chunkCount; i++) {
                        chunksMap.delete(`${fileId}-${i}`)
                    }
                }
            }

            filesMap.delete(fileId)
            console.log(`[FileTransfer] Removed file (${isAdmin ? 'Admin' : 'Owner'}):`, fileId)
            return true
        }

        return false
    }

    // Clear all files in the space (admin only)
    clearAllFiles(): boolean {
        if (!this.docId || !this.initialized) return false

        const filesMap = this.getFilesMap()
        const chunksMap = this.getChunksMap()
        if (!filesMap) return false

        // Clear all chunks first
        if (chunksMap) {
            chunksMap.clear()
        }

        // Clear files index
        filesMap.clear()
        console.log('[FileTransfer] Cleared all files')
        return true
    }

    async downloadFile(file: SharedFile): Promise<boolean> {
        try {
            let fullContent: string

            if (file.tier === 'small' && file.content) {
                fullContent = file.content
            } else if (file.chunkCount) {
                // Reassemble from chunks
                const chunksMap = this.getChunksMap()
                if (!chunksMap) {
                    alert('File transfer not initialized')
                    return false
                }
                const chunks: string[] = []

                for (let i = 0; i < file.chunkCount; i++) {
                    const chunk = chunksMap.get(`${file.id}-${i}`)
                    if (!chunk) {
                        alert(`Missing chunk ${i + 1}/${file.chunkCount}. Transfer may be incomplete.`)
                        return false
                    }
                    chunks.push(chunk.data)
                    this.onProgress?.(file.id, ((i + 1) / file.chunkCount) * 100)
                }

                fullContent = chunks.join('')
            } else {
                alert('File content not available')
                return false
            }

            // Decode and download
            const byteCharacters = atob(fullContent)
            const byteNumbers = new Uint8Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const blob = new Blob([byteNumbers], { type: file.type })

            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)

            return true
        } catch (err) {
            console.error('[FileTransfer] Download failed:', err)
            return false
        }
    }

    getFiles(): SharedFile[] {
        if (!this.docId || !this.initialized) return []

        const filesMap = this.getFilesMap()
        if (!filesMap) return []
        const files: SharedFile[] = []

        filesMap.forEach((file) => {
            files.push({
                ...file,
                isLocal: file.ownerId === this.localUserId
            })
        })

        return files.sort((a, b) => b.uploadedAt - a.uploadedAt)
    }

    getPeers(): PeerInfo[] {
        if (!this.roomId) return []
        return p2pService.getConnectedPeers(this.roomId)
    }

    private fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            const timeout = setTimeout(() => {
                reader.abort()
                reject(new Error('File read timeout (30s)'))
            }, 30000)

            reader.readAsDataURL(file)
            reader.onload = () => {
                clearTimeout(timeout)
                try {
                    const result = reader.result as string
                    if (!result || !result.includes(',')) {
                        reject(new Error('Invalid FileReader result'))
                        return
                    }
                    resolve(result.split(',')[1])
                } catch (error) {
                    reject(new Error(`Failed to process file data: ${error}`))
                }
            }
            reader.onerror = () => {
                clearTimeout(timeout)
                reject(new Error(`FileReader error: ${reader.error?.message || 'unknown error'}`))
            }
            reader.onabort = () => {
                clearTimeout(timeout)
                reject(new Error('File read aborted'))
            }
        })
    }

    getLocalUserId(): string {
        return this.localUserId
    }
}

export const fileTransferService = new FileTransferService()
