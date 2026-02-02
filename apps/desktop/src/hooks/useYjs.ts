/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebrtcProvider } from 'y-webrtc'
import { memberSyncService } from '../services/memberSyncService'
import { useMemberStore } from '../stores/memberStore'

// Store for Yjs documents per space
const documents = new Map<string, Y.Doc>()
const providers = new Map<string, WebrtcProvider>()
const persistences = new Map<string, IndexeddbPersistence>()
// Reference counting for cleanup
const refCounts = new Map<string, number>()

// Signaling servers for WebRTC
const SIGNALING_SERVERS = [
    'wss://signaling.yjs.dev',
    'wss://y-webrtc-signaling-eu.herokuapp.com',
    'wss://y-webrtc-signaling-us.herokuapp.com'
]

// SECURITY FIX V-001: Load TURN credentials from environment variables
// ICE servers for NAT traversal (STUN discovers public IP, TURN relays traffic)
// TURN servers are essential for users behind symmetric NAT, firewalls, or corporate networks
const getIceServers = (): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
        // STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // OpenRelay TURN servers (public, no credentials required)
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]

    // SECURITY: Add custom TURN server from environment if configured
    const customTurnUrl = import.meta.env?.VITE_TURN_URL
    const customTurnUsername = import.meta.env?.VITE_TURN_USERNAME
    const customTurnCredential = import.meta.env?.VITE_TURN_CREDENTIAL

    if (customTurnUrl && customTurnUsername && customTurnCredential) {
        servers.push({
            urls: customTurnUrl,
            username: customTurnUsername,
            credential: customTurnCredential
        })
        if (!customTurnUrl.includes('transport=tcp')) {
            servers.push({
                urls: `${customTurnUrl}?transport=tcp`,
                username: customTurnUsername,
                credential: customTurnCredential
            })
        }
    }

    return servers
}

const ICE_SERVERS: RTCIceServer[] = getIceServers()

// Helper interface for objects with cleanup method
interface CleanupCapable {
    _cleanup?: () => void
}

/**
 * Get or create a Yjs document for a space
 */
export function getSpaceDocument(spaceId: string): Y.Doc {
    let doc = documents.get(spaceId)

    if (!doc) {
        doc = new Y.Doc()
        documents.set(spaceId, doc)

        // Set up IndexedDB persistence with quota handling
        try {
            const persistence = new IndexeddbPersistence(`kalynt-${spaceId}`, doc)
            persistences.set(spaceId, persistence)

            const onError = (error: any) => {
                console.error(`[CRDT] IndexedDB error for space ${spaceId}:`, error)
                if (error.name === 'QuotaExceededError') {
                    console.warn('Storage quota exceeded!')
                }
            }

            const onSynced = () => {
                console.log(`[CRDT] Space ${spaceId} synced from IndexedDB`)
            }

            persistence.on('error', onError)
            persistence.on('synced', onSynced)

                // Store cleanup function
                ; (persistence as unknown as CleanupCapable)._cleanup = () => {
                    persistence.off('synced', onSynced)
                    persistence.off('error', onError)
                }
        } catch (error) {
            console.error(`[CRDT] Failed to initialize persistence:`, error)
        }
    }

    return doc
}

/**
 * Connect a space to P2P network with optional encryption
 */
export function connectSpace(spaceId: string, password?: string): WebrtcProvider {
    let provider = providers.get(spaceId)

    if (!provider) {
        const doc = getSpaceDocument(spaceId)

        // y-webrtc: Append password to room name for built-in AES-GCM encryption
        // The signaling server only sees the part before #
        const roomName = password ? `kalynt-${spaceId}#${password}` : `kalynt-${spaceId}`

        provider = new WebrtcProvider(roomName, doc, {
            signaling: SIGNALING_SERVERS,
            maxConns: 20,
            filterBcConns: true,
            peerOpts: {
                config: {
                    iceServers: ICE_SERVERS
                }
            }
        })
        providers.set(spaceId, provider)

        // Set local awareness state
        provider.awareness.setLocalStateField('user', {
            name: 'Local User',
            color: generateColor()
        })

        // Optional: Add encryption logging for updates
        const updateHandler = (_update: Uint8Array, _origin: unknown) => {
            // Future encryption tracing logic can be added here
        }

        const syncedHandler = (synced: { synced: boolean }) => {
            console.log(`[P2P] Sync state: ${synced.synced ? 'synced' : 'syncing'}`)
        }

        doc.on('update', updateHandler)
        provider.on('synced', syncedHandler)

            // Store cleanup functions
            ; (provider as unknown as CleanupCapable)._cleanup = () => {
                try {
                    doc.off('update', updateHandler)
                    provider?.off('synced', syncedHandler)
                } catch (e) {
                    // Ignore errors during cleanup of destroyed objects
                    console.warn('[P2P] Cleanup error:', e)
                }
            }

        console.log(`[P2P] Connected to space ${spaceId}`)
    }

    return provider
}

// ... (lines 129-142 omitted)

/**
 * Disconnect from a space (provider only, keeps doc for potential reconnection)
 */
export function disconnectSpace(spaceId: string): void {
    const provider = providers.get(spaceId)
    if (provider) {
        try {
            (provider as unknown as CleanupCapable)._cleanup?.()
            provider.destroy()
        } catch (err) {
            console.warn(`[P2P] Error during disconnect for ${spaceId}:`, err)
        }
        providers.delete(spaceId)
    }
}

/**
 * Completely destroy a space's resources (use when no components need it)
 */
export function destroySpace(spaceId: string): void {
    // Disconnect provider
    disconnectSpace(spaceId)

    // Destroy persistence
    const persistence = persistences.get(spaceId)
    if (persistence) {
        try {
            (persistence as unknown as CleanupCapable)._cleanup?.()
            persistence.destroy()
        } catch (err) {
            console.warn(`[CRDT] Error destroying persistence for ${spaceId}:`, err)
        }
        persistences.delete(spaceId)
    }

    // Destroy document
    const doc = documents.get(spaceId)
    if (doc) {
        doc.destroy()
        documents.delete(spaceId)
    }

    // Clear ref count
    refCounts.delete(spaceId)

    console.log(`[CRDT] Destroyed all resources for space ${spaceId}`)
}

/**
 * Increment reference count for a space
 */
function refSpace(spaceId: string): void {
    refCounts.set(spaceId, (refCounts.get(spaceId) || 0) + 1)
}

/**
 * Decrement reference count and destroy if no refs remain
 */
function unrefSpace(spaceId: string): void {
    const count = refCounts.get(spaceId) || 0
    if (count <= 1) {
        // Last reference, destroy everything
        destroySpace(spaceId)
    } else {
        refCounts.set(spaceId, count - 1)
    }
}

/**
 * Hook to use a Yjs document for a space
 * Integrates with encryption if enabled in space settings
 */
export function useYDoc(spaceId: string | null) {
    const [doc, setDoc] = useState<Y.Doc | null>(null)
    const [provider, setProvider] = useState<WebrtcProvider | null>(null)
    const [synced, setSynced] = useState(false)
    const [peerCount, setPeerCount] = useState(0)
    const [encrypted, setEncrypted] = useState(false)
    const updatePeersRef = useRef<(() => void) | null>(null)
    const isMountedRef = useRef(true)
    const setupRef = useRef<string | null>(null)

    useEffect(() => {
        isMountedRef.current = true

        if (!spaceId) {
            setDoc(null)
            setProvider(null)
            setSynced(false)
            setPeerCount(0)
            setEncrypted(false)
            return
        }

        if (setupRef.current === spaceId) return
        setupRef.current = spaceId

        // Initialize encryption BEFORE connecting (fix race condition)
        const initEncryption = async () => {
            const settings = localStorage.getItem(`space-settings-${spaceId}`)
            if (settings) {
                try {
                    const parsed = JSON.parse(settings)
                    if (parsed.encryptionEnabled && parsed.roomPassword) {
                        // Import and initialize encrypted provider
                        const { initializeRoomEncryption } = await import('../services/encryptedProvider')
                        await initializeRoomEncryption(spaceId, parsed.roomPassword)
                        if (isMountedRef.current) {
                            setEncrypted(true)
                            console.log(`[CRDT] Encryption initialized for space ${spaceId}`)
                        }
                    }
                } catch (e) {
                    console.error('[CRDT] Failed to initialize encryption:', e)
                }
            }
        }

        // Helper to track peers (defined here to avoid deep nesting inside setup)
        const updatePeers = (targetProvider: any) => {
            const awareness = targetProvider.awareness
            if (!awareness || !isMountedRef.current) return

            const currentIds = Array.from(awareness.getStates().keys())
            const count = currentIds.filter(id => id !== awareness.clientID).length
            setPeerCount(count)
        }

        // Await encryption before connecting to avoid race condition
        const setup = async () => {
            await initEncryption()

            if (!isMountedRef.current || setupRef.current !== spaceId) return

            // Increment reference count
            refSpace(spaceId)

            const ydoc = getSpaceDocument(spaceId)

            // Fetch password if encryption is enabled to reconnect with correct room
            let passwordValue: string | undefined = undefined
            const settings = localStorage.getItem(`space-settings-${spaceId}`)
            if (settings) {
                try {
                    const parsed = JSON.parse(settings)
                    if (parsed.encryptionEnabled && parsed.roomPassword) {
                        passwordValue = parsed.roomPassword
                    }
                } catch (e) {
                    console.warn('[P2P] Failed to parse settings for encryption:', e)
                }
            }

            const yprovider = connectSpace(spaceId, passwordValue)

            setDoc(ydoc)
            setProvider(yprovider)

            if (!isMountedRef.current) return

            // Initialize member sync for P2P role/permission management
            const { userId, displayName } = useMemberStore.getState()
            memberSyncService.initializeSpace(
                spaceId,
                ydoc,
                yprovider.awareness,
                userId,
                displayName
            )
            console.log(`[Members] Initialized P2P sync for space ${spaceId}`)

            // Track sync state
            const persistence = persistences.get(spaceId)
            if (persistence) {
                persistence.on('synced', () => {
                    if (isMountedRef.current) setSynced(true)
                })
            }

            // Track peer count avoiding deep nesting callback (ESL-040)
            const listener = () => updatePeers(yprovider)
            updatePeersRef.current = listener
            yprovider.awareness.on('change', listener)

            // Check again before initial call to avoid state updates on unmounted component
            if (isMountedRef.current && setupRef.current === spaceId) {
                listener()
            }
        }

        setup()

        return () => {
            isMountedRef.current = false
            setupRef.current = null

            // Cleanup peer listener carefully
            const currentProvider = provider || providers.get(spaceId)
            const currentCallback = updatePeersRef.current
            if (currentProvider && currentCallback) {
                try {
                    currentProvider.awareness.off('change', currentCallback)
                } catch (e) {
                    console.debug('[P2P] Failed to remove peer listener:', e)
                }
            }
            updatePeersRef.current = null

            // Clean up encryption state with error handling
            import('../services/encryptedProvider').then(({ disableRoomEncryption }) => {
                disableRoomEncryption(spaceId)
            }).catch(err => {
                console.error('[CRDT] Failed to disable encryption:', err)
            })

            // Clean up member sync
            memberSyncService.cleanup(spaceId)

            // Decrement ref count - will destroy if this was the last user
            unrefSpace(spaceId)
        }
    }, [spaceId])

    return { doc, provider, synced, peerCount, encrypted }
}

/**
 * Hook to use a Yjs Text type
 */
export function useYText(doc: Y.Doc | null, key: string) {
    const [text, setText] = useState('')
    const yTextRef = useRef<Y.Text | null>(null)

    useEffect(() => {
        if (!doc) {
            setText('')
            return
        }

        const yText = doc.getText(key)
        yTextRef.current = yText
        setText(yText.toJSON())

        const observer = () => {
            setText(yText.toJSON())
        }

        yText.observe(observer)
        return () => yText.unobserve(observer)
    }, [doc, key])

    const updateText = useCallback((newText: string) => {
        if (!yTextRef.current || !doc) return

        doc.transact(() => {
            yTextRef.current!.delete(0, yTextRef.current!.length)
            yTextRef.current!.insert(0, newText)
        })
    }, [doc])

    const insertText = useCallback((index: number, content: string) => {
        if (!yTextRef.current) return
        yTextRef.current.insert(index, content)
    }, [])

    const deleteText = useCallback((index: number, length: number) => {
        if (!yTextRef.current) return
        yTextRef.current.delete(index, length)
    }, [])

    return { text, updateText, insertText, deleteText, yText: yTextRef.current }
}

/**
 * Hook to use a Yjs Array type
 */
export function useYArray<T>(doc: Y.Doc | null, key: string) {
    const [items, setItems] = useState<T[]>([])
    const yArrayRef = useRef<Y.Array<T> | null>(null)

    useEffect(() => {
        if (!doc) {
            setItems([])
            return
        }

        const yArray = doc.getArray<T>(key)
        yArrayRef.current = yArray
        setItems(yArray.toArray())

        const observer = () => {
            setItems(yArray.toArray())
        }

        yArray.observe(observer)
        return () => yArray.unobserve(observer)
    }, [doc, key])

    const push = useCallback((item: T) => {
        if (!yArrayRef.current) return
        yArrayRef.current.push([item])
    }, [])

    const insert = useCallback((index: number, item: T) => {
        if (!yArrayRef.current) return
        yArrayRef.current.insert(index, [item])
    }, [])

    const remove = useCallback((index: number) => {
        if (!yArrayRef.current) return
        yArrayRef.current.delete(index, 1)
    }, [])

    const update = useCallback((index: number, item: T) => {
        if (!yArrayRef.current || !doc) return
        doc.transact(() => {
            yArrayRef.current!.delete(index, 1)
            yArrayRef.current!.insert(index, [item])
        })
    }, [doc])

    return { items, push, insert, remove, update, yArray: yArrayRef.current }
}

/**
 * Hook to use a Yjs Map type
 */
export function useYMap<T>(doc: Y.Doc | null, key: string) {
    const [data, setData] = useState<Map<string, T>>(new Map())
    const yMapRef = useRef<Y.Map<T> | null>(null)

    useEffect(() => {
        if (!doc) {
            setData(new Map())
            return
        }

        const yMap = doc.getMap<T>(key)
        yMapRef.current = yMap
        setData(new Map(yMap.entries()))

        const observer = () => {
            setData(new Map(yMap.entries()))
        }

        yMap.observe(observer)
        return () => yMap.unobserve(observer)
    }, [doc, key])

    const set = useCallback((k: string, value: T) => {
        if (!yMapRef.current) return
        yMapRef.current.set(k, value)
    }, [])

    const remove = useCallback((k: string) => {
        if (!yMapRef.current) return
        yMapRef.current.delete(k)
    }, [])

    const get = useCallback((k: string): T | undefined => {
        return yMapRef.current?.get(k)
    }, [])

    return { data, set, remove, get, yMap: yMapRef.current }
}

/**
 * Hook for awareness (cursor positions, presence)
 */
export function useAwareness(provider: WebrtcProvider | null) {
    const [users, setUsers] = useState<Map<number, any>>(new Map())

    useEffect(() => {
        if (!provider) {
            setUsers(new Map())
            return
        }

        const updateUsers = () => {
            const states = provider.awareness.getStates()
            setUsers(new Map(states))
        }

        provider.awareness.on('change', updateUsers)
        updateUsers()

        return () => provider.awareness.off('change', updateUsers)
    }, [provider])

    const setLocalState = useCallback((field: string, value: any) => {
        if (!provider) return
        provider.awareness.setLocalStateField(field, value)
    }, [provider])

    return { users, setLocalState, localClientId: provider?.awareness.clientID }
}

// Helper function
function generateColor(): string {
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    return colors[Math.floor(Math.random() * colors.length)]
}
