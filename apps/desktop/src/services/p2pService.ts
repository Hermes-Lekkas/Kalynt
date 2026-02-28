/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// P2P Service - WebRTC peer-to-peer networking with signaling
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { logger } from '../utils/logger'
import { p2pLog, securityLog } from './auditLogService'

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
    // CROSS-NETWORK FIX: Enable broadcast discovery for LAN connections
    // When true, allows peers on same network to discover each other without signaling
    enableBroadcast?: boolean
    // CROSS-NETWORK FIX: Connection retry settings for flaky networks
    maxRetries?: number
    retryDelayMs?: number
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

// ICE / STUN / TURN server configuration
// SECURITY: Credentials are obfuscated to prevent casual extraction
// For production, use a server-side credential proxy or password-based encryption
const getIceServers = (): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
        // Google STUN servers for NAT traversal (discovers public IP)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Cloudflare STUN — privacy-focused alternative (no logging policy)
        { urls: 'stun:stun.cloudflare.com:3478' },
        // OpenRelay STUN - public STUN server
        { urls: 'stun:openrelay.metered.ca:80' }
    ]

    // SECURITY: TURN server support via Bring Your Own Key (BYOK) from Settings or Environment
    let turnSettings = { url: '', username: '', credential: '' }
    try {
        const stored = localStorage.getItem('kalynt-turn-settings')
        if (stored) {
            turnSettings = JSON.parse(stored)
        }
    } catch (e) {
        console.warn('Failed to parse TURN settings', e)
    }

    const customTurnUrl = turnSettings.url || import.meta.env?.VITE_TURN_URL
    const customTurnUsername = turnSettings.username || import.meta.env?.VITE_TURN_USERNAME
    const customTurnCredential = turnSettings.credential || import.meta.env?.VITE_TURN_CREDENTIAL

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
        // Primary: Built-in signaling server started by Electron main process
        // This runs locally on the same machine — zero external infrastructure
        'ws://localhost:4444',
        // Fallback: Free public signaling server bundled with y-webrtc
        // This enables cross-internet P2P without any external servers
        'wss://y-webrtc-eu.fly.dev',
        // Additional: Can be configured via VITE_SIGNALING_URL env var
        // See apps/desktop/.env.example for deployment options (free fly.io / render.com)
        ...(import.meta.env?.VITE_SIGNALING_URL ? [import.meta.env.VITE_SIGNALING_URL as string] : [])
    ],
    iceServers: getIceServers(),
    maxPeers: 15,
    // CROSS-NETWORK FIX: Enable broadcast discovery when no signaling available
    // This allows LAN peers to discover each other without signaling server
    enableBroadcast: true,
    // CROSS-NETWORK FIX: Connection retry configuration
    maxRetries: 3,
    retryDelayMs: 2000
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

    // MEDIUM-001 FIX: Track if service is destroyed to prevent race conditions
    private isDestroyed = false

    // Stats tracking for each room
    private roomStats: Map<string, {
        bytesReceived: number
        bytesSent: number
        lastPingTime: number
        latencies: number[] // Ring buffer of last N ping times
    }> = new Map()

    // CROSS-NETWORK FIX: Track retry attempts per room
    private retryAttempts: Map<string, number> = new Map()

    constructor() {
        // FIX BUG-012: Start periodic cleanup every 30 seconds
        this.cleanupIntervalId = setInterval(() => {
            // MEDIUM-001 FIX: Check if service is destroyed before running cleanup
            if (this.isDestroyed) {
                return
            }
            this.rateLimiter.cleanup()
        }, 30000)
    }

    /**
     * Clean up resources (call before destroying service)
     */
    destroy(): void {
        // MEDIUM-001 FIX: Set destroyed flag first to prevent race conditions
        this.isDestroyed = true
        
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

    connect(roomId: string, doc: Y.Doc, password?: string): WebrtcProvider | null {
        // Check if already connected
        if (this.providers.has(roomId)) {
            return this.providers.get(roomId)!
        }

        try {
            // Use kalynt- prefix for consistency with other parts of the app
            const roomName = `kalynt-${roomId}`
            const connectionPassword = password || this.config.password

            // CROSS-NETWORK FIX: Make broadcast discovery configurable
            // When enableBroadcast is true, LAN peers can discover without signaling
            // When false (default for security), only signaling-based connections allowed
            const enableBroadcast = this.config.enableBroadcast ?? false

            // CROSS-NETWORK FIX: Smart signaling server selection
            // For cross-network connections, prioritize public signaling servers
            // This helps when localhost:4444 is not accessible but public servers are
            const currentAttempt = this.retryAttempts.get(roomId) || 0
            const isLikelyRemote = currentAttempt > 0
            const signalingServers = isLikelyRemote
                ? [
                    // Prioritize public servers for remote connections
                    'wss://y-webrtc-eu.fly.dev',
                    // Then try local (in case we're on same network)
                    'ws://localhost:4444',
                    ...(import.meta.env?.VITE_SIGNALING_URL ? [import.meta.env.VITE_SIGNALING_URL as string] : [])
                ]
                : this.config.signalingServers

            // Create WebRTC provider with error handling
            const provider = new WebrtcProvider(roomName, doc, {
                signaling: signalingServers,
                password: connectionPassword,
                maxConns: this.config.maxPeers,
                // filterBcConns: false enables broadcast discovery for LAN connections
                // filterBcConns: true restricts to signaling-only (more secure)
                filterBcConns: !enableBroadcast,
                peerOpts: {
                    config: {
                        iceServers: getIceServers()
                    }
                }
            })

            // Set local user info
            provider.awareness.setLocalStateField('user', this.localUser)

            const callbacks = this.getCallbacks(roomId)

            // Handle sync events
            provider.on('synced', ({ synced }: { synced: boolean }) => {
                callbacks.onSync?.(synced)
                if (synced) {
                    p2pLog.connected(roomId, this.getPeerCount(roomId))
                }
            })

            // Handle peer connections with rate limiting
            // SECURITY FIX V-009: Apply rate limiting to peer connections
            provider.on('peers', ({ added, removed }: { added: string[]; removed: string[] }) => {
                added.forEach(id => {
                    // Check connection rate limit
                    if (!this.rateLimiter.checkConnectionRate(id)) {
                        logger.p2p.warn('Peer connection rate limited:', { peerId: id })
                        securityLog.rateLimitTriggered(id, 'connection')
                        return // Skip banned/rate-limited peer
                    }
                    p2pLog.peerJoined(id, roomId)
                    callbacks.onConnection?.(id, true)
                })
                removed.forEach(id => {
                    p2pLog.peerLeft(id, roomId)
                    callbacks.onConnection?.(id, false)
                })
                this.updatePeerList(provider, roomId)
            })

            // Track provider
            this.providers.set(roomId, provider)

            // Initialize stats tracking for this room
            this.roomStats.set(roomId, {
                bytesReceived: 0,
                bytesSent: 0,
                lastPingTime: Date.now(),
                latencies: []
            })

            // Set up stats tracking via awareness ping/pong
            this.setupStatsTracking(provider, roomId)

            // CROSS-NETWORK FIX: Set up connection timeout and retry
            const maxRetries = this.config.maxRetries ?? 3
            const retryDelay = this.config.retryDelayMs ?? 2000

            if (maxRetries > 0) {
                const checkConnection = setTimeout(() => {
                    // If no peers connected after timeout and we haven't exceeded retries
                    const peerCount = this.getPeerCount(roomId)
                    const currentAttempt = this.retryAttempts.get(roomId) || 0

                    if (peerCount === 0 && currentAttempt < maxRetries) {
                        this.retryAttempts.set(roomId, currentAttempt + 1)
                        console.log(`[P2P] No peers connected, retrying... (${currentAttempt + 1}/${maxRetries})`)

                        // Disconnect and retry with remote-optimized settings
                        this.disconnect(roomId)
                        setTimeout(() => {
                            this.connect(roomId, doc, password)
                        }, retryDelay)
                    }
                }, 15000) // Check after 15 seconds

                // Clean up retry tracking when connected
                provider.on('peers', ({ added }: { added: string[]; removed: string[] }) => {
                    if (added.length > 0) {
                        clearTimeout(checkConnection)
                        this.retryAttempts.delete(roomId)
                    }
                })
            }

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
            this.roomStats.delete(roomId) // Clean up stats
            p2pLog.disconnected(roomId)
        }
        // Clean up retry tracking
        this.retryAttempts.delete(roomId)
    }

    disconnectAll() {
        this.providers.forEach((provider, _roomId) => {
            provider.destroy()
        })
        this.providers.clear()
        this.roomCallbacks.clear()
        this.roomStats.clear() // Clean up all stats
        this.retryAttempts.clear() // Clean up retry tracking
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

    // Set up stats tracking via awareness protocol
    private setupStatsTracking(provider: WebrtcProvider, roomId: string) {
        const stats = this.roomStats.get(roomId)
        if (!stats) return

        // Send periodic ping via awareness
        const pingInterval = setInterval(() => {
            if (!this.providers.has(roomId)) {
                clearInterval(pingInterval)
                return
            }
            
            const pingTime = Date.now()
            provider.awareness.setLocalStateField('ping', pingTime)
            stats.lastPingTime = pingTime
        }, 5000) // Ping every 5 seconds

        // Listen for pings from other peers
        provider.awareness.on('change', () => {
            const states = provider.awareness.getStates()
            const localClientId = provider.awareness.clientID
            
            states.forEach((state, clientId) => {
                if (clientId !== localClientId && state.ping) {
                    const pongTime = Date.now()
                    const latency = pongTime - state.ping
                    
                    // Store latency (keep last 10 measurements)
                    if (stats.latencies.length >= 10) {
                        stats.latencies.shift()
                    }
                    stats.latencies.push(latency)
                }
            })
        })

        // Track approximate data transfer via Yjs updates
        // Note: This is approximate since WebRTC encrypts and adds overhead
        const doc = provider.doc
        doc.on('update', (update: Uint8Array) => {
            stats.bytesSent += update.length
        })
    }

    // Get stats for a room
    getStats(roomId: string): P2PStats {
        const stats = this.roomStats.get(roomId)
        const avgLatency = stats && stats.latencies.length > 0
            ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
            : 0

        return {
            connectedPeers: this.getPeerCount(roomId),
            totalBytesReceived: stats?.bytesReceived || 0,
            totalBytesSent: stats?.bytesSent || 0,
            averageLatency: avgLatency
        }
    }

    // CROSS-NETWORK FIX: Refresh TURN settings from localStorage
    // Call this after user updates TURN settings in UI
    refreshTurnSettings(): void {
        // The next getIceServers() call will read from localStorage
        console.log('[P2P] TURN settings refreshed from localStorage')

        // Reconnect all active providers to apply new ICE settings
        const connectedRooms = Array.from(this.providers.entries())
        connectedRooms.forEach(([roomId, provider]) => {
            console.log(`[P2P] Reconnecting ${roomId} with updated TURN settings`)
            const doc = provider.doc
            const password = this.config.password
            this.disconnect(roomId)
            // Small delay to ensure cleanup
            setTimeout(() => {
                this.connect(roomId, doc, password)
            }, 100)
        })
    }

    // Get current TURN settings for UI display
    getTurnSettings(): { url: string; username: string; credential: string; isConfigured: boolean } {
        let turnSettings = { url: '', username: '', credential: '' }
        try {
            const stored = localStorage.getItem('kalynt-turn-settings')
            if (stored) {
                turnSettings = JSON.parse(stored)
            }
        } catch (e) {
            console.warn('Failed to parse TURN settings', e)
        }

        const isConfigured = !!(turnSettings.url && turnSettings.username && turnSettings.credential)
        return { ...turnSettings, isConfigured }
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
            const pc = new RTCPeerConnection({ iceServers: getIceServers() })

            // Create a data channel to trigger ICE gathering
            pc.createDataChannel('test')

            const gatheringComplete = new Promise<void>((resolve) => {
                // CROSS-NETWORK FIX: Increased timeout for high-latency networks
                // 30 seconds allows time for TURN allocation and multiple STUN tries
                const timeout = setTimeout(() => resolve(), 30000) // 30s timeout

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
        const iceServers = getIceServers()
        const hasTurn = iceServers.some(server =>
            (typeof server.urls === 'string' ? server.urls : server.urls?.[0])?.startsWith('turn:')
        )

        return {
            connected: !!provider,
            peerCount: provider ? this.getPeerCount(roomId) : 0,
            signalingState: provider ? 'connected' : 'disconnected',
            iceServers: iceServers.length,
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
}

// Singleton instance
export const p2pService = new P2PService()
export default p2pService
