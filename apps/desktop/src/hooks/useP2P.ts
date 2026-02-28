/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// useP2P - React hook for P2P networking
import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { p2pService, PeerInfo } from '../services/p2pService'
import { WebrtcProvider } from 'y-webrtc'

export function useP2P(roomId: string | null, doc: Y.Doc | null) {
    const [provider, setProvider] = useState<WebrtcProvider | null>(null)
    const [synced, setSynced] = useState(false)
    const [peers, setPeers] = useState<PeerInfo[]>([])
    const [peerCount, setPeerCount] = useState(0)
    const [isConnected, setIsConnected] = useState(false)

    const isInitialized = useRef(false)

    // Connect to room
    useEffect(() => {
        if (!roomId || !doc || isInitialized.current) return

        const init = async () => {
            // Set up callbacks
            p2pService.setCallbacks(
                (peerId, connected) => {
                    console.log(`Peer ${peerId} ${connected ? 'connected' : 'disconnected'}`)
                },
                (synced) => {
                    setSynced(synced)
                },
                (peerList) => {
                    setPeers(peerList)
                    setPeerCount(peerList.length)
                }
            )

            // Connect
            const webrtcProvider = p2pService.connect(roomId, doc)
            setProvider(webrtcProvider)
            setIsConnected(true)
            isInitialized.current = true
        }

        init()

        return () => {
            if (isInitialized.current && roomId) {
                p2pService.disconnect(roomId)
                isInitialized.current = false
            }
        }
    }, [roomId, doc])

    // Update peer count when provider changes
    useEffect(() => {
        if (provider) {
            const updatePeers = () => {
                const count = p2pService.getPeerCount(roomId || '')
                setPeerCount(count)
                setPeers(p2pService.getConnectedPeers(roomId || ''))
            }

            provider.awareness.on('change', updatePeers)
            updatePeers()

            return () => {
                provider.awareness.off('change', updatePeers)
            }
        }
    }, [provider, roomId])

    // Set local user info
    const setLocalUser = useCallback((name: string, color: string) => {
        p2pService.setLocalUser(name, color)
    }, [])

    // Disconnect from room
    const disconnect = useCallback(() => {
        if (roomId) {
            p2pService.disconnect(roomId)
            setProvider(null)
            setIsConnected(false)
            setPeers([])
            setPeerCount(0)
            isInitialized.current = false
        }
    }, [roomId])

    // Generate shareable link
    const getShareLink = useCallback((password?: string) => {
        if (!roomId) return ''
        return p2pService.generateRoomLink(roomId, password)
    }, [roomId])

    return {
        provider,
        synced,
        peers,
        peerCount,
        isConnected,
        setLocalUser,
        disconnect,
        getShareLink
    }
}
