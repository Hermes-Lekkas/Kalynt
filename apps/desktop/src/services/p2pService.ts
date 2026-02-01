/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// P2P Service - WebRTC peer-to-peer networking with signaling
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { logger } from '../utils/logger'

export interface PeerInfo {
    id: string
    name: string
    color: string
    lastSeen: number
    isOnline: boolean
}

export interface P2PConfig {
    signalingServers: string[]
    iceServers: RTCIceServer[]
    maxPeers: number
    password?: string
}

export interface P2PStats {
    connectedPeers: number
    totalBytesReceived: number
    totalBytesSent: number
    averageLatency: number
}

type ConnectionCallback = (peerId: string, connected: boolean) => void
type SyncCallback = (synced: boolean) => void
type PeersCallback = (peers: PeerInfo[]) => void

const DEFAULT_CONFIG: P2PConfig = {
    signalingServers: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com'
    ],
    iceServers: [
        // STUN servers for NAT traversal (discovers public IP)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // OpenRelay TURN servers (free, for when STUN fails - symmetric NAT, firewalls)
        // These are essential for cross-network connectivity
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
        },
        // Metered.ca free TURN (backup)
        {
            urls: 'turn:a.relay.metered.ca:80',
            username: 'e8dd65b92f62d5eedb7e1b12',
            credential: 'uWdWNmkhvyqTmFfm'
        },
        {
            urls: 'turn:a.relay.metered.ca:443',
            username: 'e8dd65b92f62d5eedb7e1b12',
            credential: 'uWdWNmkhvyqTmFfm'
        },
        {
            urls: 'turn:a.relay.metered.ca:443?transport=tcp',
            username: 'e8dd65b92f62d5eedb7e1b12',
            credential: 'uWdWNmkhvyqTmFfm'
        }
    ],
    maxPeers: 15
}

class P2PService {
    private providers: Map<string, WebrtcProvider> = new Map()
    private config: P2PConfig = DEFAULT_CONFIG
    private localUser: { name: string; color: string } = { name: 'Anonymous', color: '#3b82f6' }

    // Per-room callbacks for better isolation when managing multiple rooms
    private roomCallbacks: Map<string, {
        onConnection?: ConnectionCallback
        onSync?: SyncCallback
        onPeers?: PeersCallback
    }> = new Map()

    setConfig(config: Partial<P2PConfig>) {
        this.config = { ...this.config, ...config }
    }

    setLocalUser(name: string, color: string) {
        this.localUser = { name, color }
        // Update awareness for all active providers
        this.providers.forEach(provider => {
            provider.awareness.setLocalStateField('user', this.localUser)
        })
    }

    // Set callbacks for a specific room
    setRoomCallbacks(
        roomId: string,
        callbacks: {
            onConnection?: ConnectionCallback
            onSync?: SyncCallback
            onPeers?: PeersCallback
        }
    ) {
        this.roomCallbacks.set(roomId, callbacks)
    }

    // Legacy: set global callbacks (applies to all rooms without specific callbacks)
    setCallbacks(
        onConnection: ConnectionCallback,
        onSync: SyncCallback,
        onPeers: PeersCallback
    ) {
        // Store as default callbacks
        this.roomCallbacks.set('__default__', { onConnection, onSync, onPeers })
    }

    private getCallbacks(roomId: string) {
        return this.roomCallbacks.get(roomId) || this.roomCallbacks.get('__default__') || {}
    }

    connect(roomId: string, doc: Y.Doc): WebrtcProvider | null {
        // Check if already connected
        if (this.providers.has(roomId)) {
            return this.providers.get(roomId)!
        }

        try {
            // Create WebRTC provider with error handling
            const provider = new WebrtcProvider(roomId, doc, {
                signaling: this.config.signalingServers,
                password: this.config.password,
                maxConns: this.config.maxPeers,
                // filterBcConns: true filters broadcast connections to only allow
                // connections established via signaling, providing better control
                // over peer discovery and preventing unwanted broadcast joins
                filterBcConns: true,
                peerOpts: {
                    config: {
                        iceServers: this.config.iceServers
                    }
                }
            })

            // Set local user info
            provider.awareness.setLocalStateField('user', this.localUser)

            const callbacks = this.getCallbacks(roomId)

            // Handle sync events
            provider.on('synced', ({ synced }: { synced: boolean }) => {
                callbacks.onSync?.(synced)
            })

            // Handle peer connections
            provider.on('peers', ({ added, removed }: { added: string[]; removed: string[] }) => {
                added.forEach(id => callbacks.onConnection?.(id, true))
                removed.forEach(id => callbacks.onConnection?.(id, false))
                this.updatePeerList(provider, roomId)
            })

            // Track provider
            this.providers.set(roomId, provider)

            return provider
        } catch (err) {
            console.error(`[P2P] Failed to create provider for room ${roomId}:`, err)
            return null
        }
    }

    disconnect(roomId: string) {
        const provider = this.providers.get(roomId)
        if (provider) {
            provider.destroy()
            this.providers.delete(roomId)
            this.roomCallbacks.delete(roomId)
        }
    }

    disconnectAll() {
        this.providers.forEach((provider, _roomId) => {
            provider.destroy()
        })
        this.providers.clear()
        this.roomCallbacks.clear()
    }

    private updatePeerList(provider: WebrtcProvider, roomId: string) {
        const peers: PeerInfo[] = []
        const now = Date.now()

        provider.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== provider.awareness.clientID) {
                const user = state.user as { name?: string; color?: string } | undefined
                peers.push({
                    id: String(clientId),
                    name: user?.name || 'Anonymous',
                    color: user?.color || '#888',
                    lastSeen: now,
                    isOnline: true
                })
            }
        })

        this.getCallbacks(roomId).onPeers?.(peers)
    }

    getConnectedPeers(roomId: string): PeerInfo[] {
        const provider = this.providers.get(roomId)
        if (!provider) return []

        const peers: PeerInfo[] = []
        const now = Date.now()

        provider.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== provider.awareness.clientID) {
                const user = state.user as { name?: string; color?: string } | undefined
                peers.push({
                    id: String(clientId),
                    name: user?.name || 'Anonymous',
                    color: user?.color || '#888',
                    lastSeen: now,
                    isOnline: true
                })
            }
        })

        return peers
    }

    getPeerCount(roomId: string): number {
        const provider = this.providers.get(roomId)
        if (!provider) return 0
        return provider.awareness.getStates().size - 1 // Exclude self
    }

    isConnected(roomId: string): boolean {
        return this.providers.has(roomId)
    }

    getProvider(roomId: string): WebrtcProvider | undefined {
        return this.providers.get(roomId)
    }

    // Generate a shareable room link (updated branding to kalynt)
    generateRoomLink(roomId: string, password?: string): string {
        const base = `kalynt://join/${roomId}`
        if (password) {
            return `${base}?p=${encodeURIComponent(password)}`
        }
        return base
    }

    // Parse a room link (supports both kalynt and legacy collabforge)
    parseRoomLink(link: string): { roomId: string; password?: string } | null {
        try {
            const url = new URL(link)
            const roomId = url.pathname.split('/').pop()
            const password = url.searchParams.get('p') || undefined
            if (roomId) {
                return { roomId, password }
            }
        } catch (error) {
            // URL parsing failed, try simple regex format for both kalynt and legacy collabforge
            logger.p2p.debug('Failed to parse room link as URL, trying regex', { link, error })
            const match = link.match(/(?:kalynt|collabforge):\/\/join\/([^?]+)/)
            if (match) {
                const passwordMatch = link.match(/[?&]p=([^&]+)/)
                return {
                    roomId: match[1],
                    password: passwordMatch ? decodeURIComponent(passwordMatch[1]) : undefined
                }
            }
        }
        return null
    }

    // Get stats for a room
    getStats(roomId: string): P2PStats {
        return {
            connectedPeers: this.getPeerCount(roomId),
            totalBytesReceived: 0, // Would need custom tracking
            totalBytesSent: 0,
            averageLatency: 0
        }
    }

    // Test ICE connectivity to diagnose P2P issues
    async testConnectivity(): Promise<{
        stun: boolean
        turn: boolean
        candidates: { type: string; protocol: string; address?: string }[]
        error?: string
    }> {
        const result = {
            stun: false,
            turn: false,
            candidates: [] as { type: string; protocol: string; address?: string }[]
        }

        try {
            const pc = new RTCPeerConnection({ iceServers: this.config.iceServers })

            // Create a data channel to trigger ICE gathering
            pc.createDataChannel('test')

            const gatheringComplete = new Promise<void>((resolve) => {
                const timeout = setTimeout(() => resolve(), 10000) // 10s timeout

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidate = event.candidate
                        const candidateInfo = {
                            type: candidate.type || 'unknown',
                            protocol: candidate.protocol || 'unknown',
                            address: candidate.address || undefined
                        }
                        result.candidates.push(candidateInfo)

                        // Check candidate types
                        if (candidate.type === 'srflx') {
                            result.stun = true // Server reflexive = STUN working
                        } else if (candidate.type === 'relay') {
                            result.turn = true // Relay = TURN working
                        }
                    } else {
                        // Gathering complete
                        clearTimeout(timeout)
                        resolve()
                    }
                }

                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout)
                        resolve()
                    }
                }
            })

            // Create offer to start ICE gathering
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            // Wait for gathering to complete
            await gatheringComplete

            pc.close()

            logger.p2p.info('ICE connectivity test complete', result)
            return result
        } catch (error) {
            logger.p2p.error('ICE connectivity test failed', { error })
            return { ...result, error: String(error) }
        }
    }

    // Get detailed connection info for a room
    getConnectionInfo(roomId: string): {
        connected: boolean
        peerCount: number
        signalingState: string
        iceServers: number
        turnEnabled: boolean
    } {
        const provider = this.providers.get(roomId)
        const hasTurn = this.config.iceServers.some(server =>
            (typeof server.urls === 'string' ? server.urls : server.urls?.[0])?.startsWith('turn:')
        )

        return {
            connected: !!provider,
            peerCount: provider ? this.getPeerCount(roomId) : 0,
            signalingState: provider ? 'connected' : 'disconnected',
            iceServers: this.config.iceServers.length,
            turnEnabled: hasTurn
        }
    }
}

// Singleton
export const p2pService = new P2PService()
