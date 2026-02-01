/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { Peer, PeerStatus } from '@collabforge/shared'

// P2P Connection Manager
// Manages WebRTC connections between peers

export interface ConnectionOptions {
    signaling?: string[]
    password?: string
    maxConns?: number
}

const DEFAULT_SIGNALING = [
    'wss://signaling.yjs.dev',
    'wss://y-webrtc-signaling-eu.herokuapp.com',
    'wss://y-webrtc-signaling-us.herokuapp.com'
]

// Helper interface for cleanup
interface AugmentedProvider extends WebrtcProvider {
    _changeHandler?: () => void
}

export class P2PManager {
    private providers: Map<string, WebrtcProvider> = new Map()
    private peerCallbacks: Set<(peers: Peer[]) => void> = new Set()

    /**
     * Connect a Yjs document to a P2P room
     */
    connect(
        roomId: string,
        doc: Y.Doc,
        options: ConnectionOptions = {}
    ): WebrtcProvider {
        // Disconnect existing provider if any
        this.disconnect(roomId)

        const provider = new WebrtcProvider(
            roomId,
            doc,
            {
                signaling: options.signaling || DEFAULT_SIGNALING,
                password: options.password,
                maxConns: options.maxConns || 20
            }
        )

        // Set up awareness for presence
        const awareness = provider.awareness

        // Set local user info
        awareness.setLocalStateField('user', {
            name: 'Local User',
            color: this.generateColor()
        })

        // Listen for awareness changes
        const changeHandler = () => {
            this.notifyPeerChange(awareness)
        }
        awareness.on('change', changeHandler)

            // Store for cleanup
            ; (provider as unknown as AugmentedProvider)._changeHandler = changeHandler

        this.providers.set(roomId, provider)
        return provider
    }

    /**
     * Disconnect from a room
     */
    disconnect(roomId: string): void {
        const provider = this.providers.get(roomId)
        if (provider) {
            // Clean up event listener
            const handler = (provider as unknown as AugmentedProvider)._changeHandler
            if (handler) {
                provider.awareness.off('change', handler)
            }
            provider.destroy()
            this.providers.delete(roomId)
        }
    }

    /**
     * Disconnect all rooms
     */
    disconnectAll(): void {
        for (const roomId of this.providers.keys()) {
            this.disconnect(roomId)
        }
    }

    /**
     * Get provider for a room
     */
    getProvider(roomId: string): WebrtcProvider | undefined {
        return this.providers.get(roomId)
    }

    /**
     * Get connected peer count for a room
     */
    getPeerCount(roomId: string): number {
        const provider = this.providers.get(roomId)
        if (!provider) return 0

        const states = Array.from(provider.awareness.getStates().values())
        return states.length - 1 // Exclude self
    }

    /**
     * Get all connected peers for a room
     */
    getConnectedPeers(roomId: string): Peer[] {
        const provider = this.providers.get(roomId)
        if (!provider) return []

        const peers: Peer[] = []
        const localClientId = provider.awareness.clientID

        provider.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== localClientId && state.user) {
                peers.push({
                    id: clientId.toString(),
                    name: state.user.name || 'Anonymous',
                    status: 'online' as PeerStatus,
                    lastSeen: Date.now()
                })
            }
        })

        return peers
    }

    /**
     * Subscribe to peer changes
     */
    onPeersChange(callback: (peers: Peer[]) => void): () => void {
        this.peerCallbacks.add(callback)
        // Warning: If callbacks exceed 100, potential memory leak
        // Consider implementing callback cleanup in consuming code
        return () => this.peerCallbacks.delete(callback)
    }

    private notifyPeerChange(awareness: any): void { // Keeping any for awareness as it wraps y-protocols
        const peers: Peer[] = []
        const localClientId = awareness.clientID

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        awareness.getStates().forEach((state: any, clientId: number) => {
            if (clientId !== localClientId && state.user) {
                peers.push({
                    id: clientId.toString(),
                    name: state.user.name || 'Anonymous',
                    status: 'online' as PeerStatus,
                    lastSeen: Date.now()
                })
            }
        })

        this.peerCallbacks.forEach(cb => cb(peers))
    }

    private generateColor(): string {
        const colors = [
            '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
            '#ef4444', '#f59e0b', '#22c55e', '#14b8a6'
        ]
        return colors[Math.floor(Math.random() * colors.length)]
    }
}

// Singleton instance
export const p2pManager = new P2PManager()

// Re-export types
export { WebrtcProvider } from 'y-webrtc'
