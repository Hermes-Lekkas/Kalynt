/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Built-in y-webrtc Signaling Server
 *
 * This is an inline TypeScript port of the y-webrtc signaling server
 * (node_modules/y-webrtc/bin/server.js). Running it inline avoids
 * ESM/fork issues with Electron's CommonJS main process.
 *
 * Listens on ws://localhost:4444 (127.0.0.1 only — localhost only for security).
 * The Electron renderer connects to this as its primary signaling endpoint,
 * enabling P2P collaboration without any external infrastructure.
 */

// Use require to avoid ESM/types issues with the ws package
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebSocketServer } = require('ws')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const http = require('http')

const PING_TIMEOUT = 30000
const WS_READY_STATE_CONNECTING = 0
const WS_READY_STATE_OPEN = 1

export interface SignalingServerHandle {
    port: number
    url: string
    lanUrl?: string // CROSS-NETWORK FIX: Exposed when binding to 0.0.0.0 for LAN access
    close: () => void
}

/**
 * Start the built-in y-webrtc signaling server on localhost.
 * Returns a promise that resolves with the server handle when ready.
 */
export function startSignalingServer(port: number = 4444): Promise<SignalingServerHandle> {
    return new Promise((resolve, reject) => {
        // Map from topic name to set of subscribed WebSocket clients
        const topics = new Map<string, Set<any>>()

        const send = (conn: any, message: object) => {
            if (
                conn.readyState !== WS_READY_STATE_CONNECTING &&
                conn.readyState !== WS_READY_STATE_OPEN
            ) {
                conn.close()
                return
            }
            try {
                conn.send(JSON.stringify(message))
            } catch {
                conn.close()
            }
        }

        const wss = new WebSocketServer({ noServer: true })
        const server = http.createServer((_req: any, res: any) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('Kalynt Signaling Server OK')
        })

        wss.on('connection', (conn: any) => {
            const subscribedTopics = new Set<string>()
            let closed = false
            let pongReceived = true

            const pingInterval = setInterval(() => {
                if (!pongReceived) {
                    conn.close()
                    clearInterval(pingInterval)
                    return
                }
                pongReceived = false
                try {
                    conn.ping()
                } catch {
                    conn.close()
                }
            }, PING_TIMEOUT)

            conn.on('pong', () => {
                pongReceived = true
            })

            conn.on('close', () => {
                subscribedTopics.forEach((topicName: string) => {
                    const subs = topics.get(topicName)
                    if (subs) {
                        subs.delete(conn)
                        if (subs.size === 0) {
                            topics.delete(topicName)
                        }
                    }
                })
                subscribedTopics.clear()
                closed = true
                clearInterval(pingInterval)
            })

            conn.on('message', (rawMessage: any) => {
                let message: any
                try {
                    message = typeof rawMessage === 'string'
                        ? JSON.parse(rawMessage)
                        : JSON.parse(rawMessage.toString())
                } catch {
                    return
                }

                if (!message || !message.type || closed) return

                switch (message.type) {
                    case 'subscribe': {
                        const subscribeTopics: string[] = message.topics || []
                        subscribeTopics.forEach((topicName: string) => {
                            if (typeof topicName !== 'string') return
                            if (!topics.has(topicName)) {
                                topics.set(topicName, new Set())
                            }
                            topics.get(topicName)!.add(conn)
                            subscribedTopics.add(topicName)
                        })
                        break
                    }

                    case 'unsubscribe': {
                        const unsubscribeTopics: string[] = message.topics || []
                        unsubscribeTopics.forEach((topicName: string) => {
                            const subs = topics.get(topicName)
                            if (subs) {
                                subs.delete(conn)
                                if (subs.size === 0) {
                                    topics.delete(topicName)
                                }
                            }
                        })
                        break
                    }

                    case 'publish': {
                        if (message.topic) {
                            const receivers = topics.get(message.topic)
                            if (receivers) {
                                message.clients = receivers.size
                                receivers.forEach((receiver: any) => send(receiver, message))
                            }
                        }
                        break
                    }

                    case 'ping':
                        send(conn, { type: 'pong' })
                        break
                }
            })
        })

        server.on('upgrade', (request: any, socket: any, head: any) => {
            wss.handleUpgrade(request, socket, head, (ws: any) => {
                wss.emit('connection', ws, request)
            })
        })

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                // Port already in use — another instance of the app may already be running the server
                console.warn(`[Signaling] Port ${port} already in use — assuming another instance is running`)
                resolve({
                    port,
                    url: `ws://localhost:${port}`,
                    close: () => { /* already running elsewhere */ }
                })
            } else {
                reject(err)
            }
        })

        // CRITICAL FIX: Allow LAN connections when explicitly enabled via env var
        // Default remains 127.0.0.1 for security (loopback only)
        // Set KALYNT_SIGNALING_BIND=0.0.0.0 to enable LAN accessibility
        const bindHost = process.env.KALYNT_SIGNALING_BIND === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
        const displayUrl = bindHost === '0.0.0.0'
            ? `ws://0.0.0.0:${port} (LAN accessible - ${require('os').hostname() || 'this-machine'})`
            : `ws://localhost:${port} (localhost only)`

        server.listen(port, bindHost, () => {
            const addr = server.address()
            const actualPort: number = (addr && typeof addr === 'object') ? addr.port : port
            console.log(`[Signaling] Built-in signaling server started on ${displayUrl}`)

            resolve({
                port: actualPort,
                url: `ws://localhost:${actualPort}`,
                // FIXED: Also expose LAN URL when binding to 0.0.0.0
                lanUrl: bindHost === '0.0.0.0' ? `ws://${require('os').hostname()}:${actualPort}` : undefined,
                close: () => {
                    server.close()
                    wss.close()
                    console.log('[Signaling] Built-in signaling server stopped')
                }
            })
        })
    })
}
