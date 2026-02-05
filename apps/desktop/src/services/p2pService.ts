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

// SECURITY FIX V-001: Load TURN credentials from environment variables
// Never hardcode credentials - use VITE_TURN_* env vars for custom TURN servers
const getIceServers = (): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
        // STUN servers for NAT traversal (discovers public IP)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // OpenRelay TURN servers (public, no credentials required)
        // Essential for cross-network connectivity (symmetric NAT, firewalls)
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
    // These should be set via VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
    const customTurnUrl = import.meta.env?.VITE_TURN_URL
    const customTurnUsername = import.meta.env?.VITE_TURN_USERNAME
    const customTurnCredential = import.meta.env?.VITE_TURN_CREDENTIAL

    if (customTurnUrl && customTurnUsername && customTurnCredential) {
        servers.push({
            urls: customTurnUrl,
            username: customTurnUsername,
            credential: customTurnCredential
        })
        // Also add TCP transport variant if not already TCP
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

const DEFAULT_CONFIG: P2PConfig = {
    signalingServers: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com'
    ],
    iceServers: getIceServers(),
    maxPeers: 15
}

// SECURITY FIX V-009: Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    maxMessagesPerSecond: 50,      // Max messages per second per peer
    maxConnectionsPerMinute: 10,   // Max new connections per minute
    burstAllowance: 20,            // Allow short bursts
    banDurationMs: 60 * 1000       // Ban duration for violators (1 minute)
}

// SECURITY FIX V-009: Rate limiter for peers
class PeerRateLimiter {
    private messageCounters: Map<string, { count: number; resetTime: number }> = new Map()
    private connectionCounters: Map<string, { count: number; resetTime: number }> = new Map()
    private bannedPeers: Map<string, number> = new Map() // peerId -> banExpiry

    /**
     * Check if peer is currently banned
     */
    isBanned(peerId: string): boolean {
        const banExpiry = this.bannedPeers.get(peerId)
        if (!banExpiry) return false

        if (Date.now() > banExpiry) {
            this.bannedPeers.delete(peerId)
            return false
        }
        return true
    }

    /**
     * Track and check message rate for a peer
     * Returns true if message is allowed, false if rate limited
     */
    checkMessageRate(peerId: string): boolean {
        if (this.isBanned(peerId)) return false

        const now = Date.now()
        const counter = this.messageCounters.get(peerId)

        if (!counter || now > counter.resetTime) {
            // Reset counter for new time window
            this.messageCounters.set(peerId, {
                count: 1,
                resetTime: now + 1000 // 1 second window
            })
            return true
        }

        counter.count++

        // Check if exceeds rate limit (with burst allowance)
        if (counter.count > RATE_LIMIT_CONFIG.maxMessagesPerSecond + RATE_LIMIT_CONFIG.burstAllowance) {
            console.warn(`[P2P] Rate limiting peer ${peerId}: ${counter.count} messages/sec`)
            this.banPeer(peerId)
            return false
        }

        return true
    }

    /**
     * Track connection attempts
     */
    checkConnectionRate(peerId: string): boolean {
        if (this.isBanned(peerId)) return false

        const now = Date.now()
        const counter = this.connectionCounters.get(peerId)

        if (!counter || now > counter.resetTime) {
            this.connectionCounters.set(peerId, {
                count: 1,
                resetTime: now + 60000 // 1 minute window
            })
            return true
        }

        counter.count++

        if (counter.count > RATE_LIMIT_CONFIG.maxConnectionsPerMinute) {
            console.warn(`[P2P] Connection rate limiting peer ${peerId}`)
            this.banPeer(peerId)
            return false
        }

        return true
    }

    /**
     * Ban a peer temporarily
     */
    private banPeer(peerId: string): void {
        this.bannedPeers.set(peerId, Date.now() + RATE_LIMIT_CONFIG.banDurationMs)
        console.warn(`[P2P] Peer ${peerId} banned for ${RATE_LIMIT_CONFIG.banDurationMs / 1000}s`)
    }

    /**
     * Clear all rate limit data
     */
    clear(): void {
        this.messageCounters.clear()
        this.connectionCounters.clear()
        this.bannedPeers.clear()
    }

    /**
     * FIX BUG-012: Proactively clean up expired bans and stale counters
     * Prevents unbounded memory growth in long-running sessions
     */
    cleanup(): void {
        const now = Date.now()

        // Clean expired bans
        for (const [peerId, banExpiry] of this.bannedPeers) {
            if (now > banExpiry) {
                this.bannedPeers.delete(peerId)
            }
        }

        // Clean expired message counters (older than 5 seconds)
        for (const [peerId, counter] of this.messageCounters) {
            if (now > counter.resetTime + 5000) {
                this.messageCounters.delete(peerId)
            }
        }

        // Clean expired connection counters (older than 2 minutes)
        for (const [peerId, counter] of this.connectionCounters) {
            if (now > counter.resetTime + 60000) {
                this.connectionCounters.delete(peerId)
            }
        }
    }
}

// Singleton rate limiter
const peerRateLimiter = new PeerRateLimiter()

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

    // SECURITY FIX V-009: Rate limiter reference
    private rateLimiter = peerRateLimiter

    // FIX BUG-012: Periodic cleanup interval
    private cleanupIntervalId: ReturnType<typeof setInterval> | null = null

    constructor() {
        // FIX BUG-012: Start periodic cleanup every 30 seconds
        this.cleanupIntervalId = setInterval(() => {
            this.rateLimiter.cleanup()
        }, 30000)
    }

    /**
     * Clean up resources (call before destroying service)
     */
    destroy(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId)
            this.cleanupIntervalId = null
        }
        this.disconnectAll()
        this.rateLimiter.clear()
    }

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

            // Handle peer connections with rate limiting
            // SECURITY FIX V-009: Apply rate limiting to peer connections
            provider.on('peers', ({ added, removed }: { added: string[]; removed: string[] }) => {
                added.forEach(id => {
                    // Check connection rate limit
                    if (!this.rateLimiter.checkConnectionRate(id)) {
                        logger.p2p.warn('Peer connection rate limited:', { peerId: id })
                        return // Skip banned/rate-limited peer
                    }
                    callbacks.onConnection?.(id, true)
                })
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
        // FIX BUG-011: Use getConnectedPeers for consistency
        // This ensures getPeerCount and getConnectedPeers always return consistent values
        return this.getConnectedPeers(roomId).length
    }

    isConnected(roomId: string): boolean {
        return this.providers.has(roomId)
    }

    getProvider(roomId: string): WebrtcProvider | undefined {
        return this.providers.get(roomId)
    }

    // SECURITY FIX V-002: Use URL fragment (#) instead of query string (?)
    // Fragment is NOT sent in HTTP Referer headers, not logged by servers
    generateRoomLink(roomId: string, password?: string, spaceName?: string): string {
        const base = `kalynt://join/${roomId}`

        // Build fragment params (client-side only, never sent to servers)
        const params: string[] = []
        if (password) {
            params.push(`p=${encodeURIComponent(password)}`)
        }
        if (spaceName) {
            // Include workspace name so joiners see the correct name
            params.push(`n=${encodeURIComponent(spaceName)}`)
        }

        if (params.length > 0) {
            return `${base}#${params.join('&')}`
        }
        return base
    }

    // Parse a room link (supports both kalynt and legacy collabforge)
    // SECURITY FIX V-002: Parse password from URL fragment for security
    parseRoomLink(link: string): { roomId: string; password?: string; spaceName?: string } | null {
        try {
            const url = new URL(link)
            const roomId = url.pathname.split('/').pop()

            // SECURITY: First check fragment (secure), then query string (legacy/insecure)
            let password: string | undefined
            let spaceName: string | undefined

            // Check URL fragment first (secure method)
            if (url.hash) {
                const hashParams = new URLSearchParams(url.hash.slice(1))
                password = hashParams.get('p') || undefined
                spaceName = hashParams.get('n') || undefined
            }

            // Fallback to query string for backward compatibility (legacy/insecure)
            if (!password) {
                password = url.searchParams.get('p') || undefined
                if (password) {
                    logger.p2p.warn('Room link uses insecure query string for password - please regenerate link')
                }
            }

            if (roomId) {
                return { roomId, password, spaceName }
            }
        } catch (error) {
            // URL parsing failed, try simple regex format for both kalynt and legacy collabforge
            logger.p2p.debug('Failed to parse room link as URL, trying regex', { link, error })
            const roomMatch = /(?:kalynt|collabforge):\/\/join\/([^?#]+)/.exec(link)
            if (roomMatch) {
                // Check fragment first (secure), then query string (legacy)
                const fragmentMatch = /#p=([^&]+)/.exec(link)
                const queryMatch = /[?&]p=([^&#]+)/.exec(link)
                const nameMatch = /[#&]n=([^&]+)/.exec(link)

                let password: string | undefined
                let spaceName: string | undefined

                if (fragmentMatch) {
                    password = decodeURIComponent(fragmentMatch[1])
                } else if (queryMatch) {
                    password = decodeURIComponent(queryMatch[1])
                    logger.p2p.warn('Room link uses insecure query string for password')
                }

                if (nameMatch) {
                    spaceName = decodeURIComponent(nameMatch[1])
                }

                return {
                    roomId: roomMatch[1],
                    password,
                    spaceName
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

    // SECURITY FIX V-009: Check if peer is rate limited or banned
    isPeerAllowed(peerId: string): boolean {
        return !this.rateLimiter.isBanned(peerId)
    }

    // SECURITY FIX V-009: Check message rate for a peer
    checkPeerMessageRate(peerId: string): boolean {
        return this.rateLimiter.checkMessageRate(peerId)
    }

    // SECURITY FIX V-009: Clear rate limiting data (for testing or reset)
    clearRateLimits(): void {
        this.rateLimiter.clear()
    }
}

// Singleton
export const p2pService = new P2PService()
