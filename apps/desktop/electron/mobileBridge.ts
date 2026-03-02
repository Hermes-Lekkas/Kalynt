/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Mobile Bridge Server
 * 
 * Handles WebSocket connections from the Android companion app.
 * Provides endpoints for pairing, command execution, and GitHub proxy.
 * Runs alongside the y-webrtc signaling server on a different port.
 */

// Use require to avoid ESM/types issues (matching signalingServer.ts pattern)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebSocketServer } = require('ws')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const http = require('http')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const https = require('https')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dialog } = require('electron')

// Mobile message types (must match Android)
interface MobileMessage {
    type: string
    requestId?: string
    [key: string]: any
}

interface MobileClient {
    id: string
    socket: any
    deviceInfo: DeviceInfo
    pairedAt: number
    lastPing: number
}

interface DeviceInfo {
    deviceId: string
    deviceName: string
    osVersion: string
    appVersion: string
}

interface PendingPairing {
    tempToken: string
    desktopPublicKey: string
    desktopPrivateKey: string
    timestamp: number
    ip: string
}

interface AgentCommand {
    agentId: string
    command: string
    params: Record<string, any>
}

// WebSocket ready states
const WS_READY_STATE_OPEN = 1

// Token storage (in-memory, cleared on app restart)
const validTokens = new Set<string>()
const clientSessions = new Map<string, MobileClient>()
const pendingPairings = new Map<string, PendingPairing>()

// Configuration
const PING_TIMEOUT = 30000
const PAIRING_TIMEOUT = 300000 // 5 minutes
const MAX_MESSAGE_SIZE = 1024 * 1024 // 1MB

// GitHub token (set by user in settings)
let githubToken: string | null = null

export interface MobileBridgeHandle {
    port: number
    pairingPort: number
    url: string
    close: () => void
    setGitHubToken: (token: string) => void
    sendNotification: (deviceId: string, notification: any) => boolean
    getConnectedDevices: () => DeviceInfo[]
}

/**
 * Generate a secure random token
 */
function generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url')
}

/**
 * Generate ECDH key pair for pairing
 */
function generateKeyPair(): { publicKey: string; privateKey: string } {
    const ecdh = crypto.createECDH('secp256r1')
    ecdh.generateKeys()
    return {
        publicKey: ecdh.getPublicKey('base64'),
        privateKey: ecdh.getPrivateKey('base64')
    }
}

/**
 * Derive session key from ECDH
 */
function deriveSessionKey(privateKey: string, clientPublicKey: string): Buffer {
    const ecdh = crypto.createECDH('secp256r1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64'))
    return ecdh.computeSecret(clientPublicKey, 'base64')
}

/**
 * Send message to mobile client
 */
function send(socket: any, message: any) {
    if (socket.readyState === WS_READY_STATE_OPEN) {
        socket.send(JSON.stringify(message))
    }
}

/**
 * Send error to mobile client
 */
function sendError(socket: any, message: string, code: string) {
    send(socket, {
        type: 'error',
        code,
        message
    })
}

/**
 * Start the mobile bridge server
 */
export function startMobileBridge(port: number = 8443): Promise<MobileBridgeHandle> {
    return new Promise((resolve, reject) => {
        // HTTP server for pairing endpoint
        const pairingServer = http.createServer(handlePairingRequest)
        const pairingPort = port + 1

        // WebSocket server for mobile connections
        const wss = new WebSocketServer({ noServer: true })
        const server = https.createServer(getTlsOptions())

        // Handle WebSocket connections
        wss.on('connection', (socket: any, req: any) => {
            const clientId = generateToken(16)
            console.log(`[MobileBridge] New connection: ${clientId}`)

            let authenticated = false
            let clientInfo: DeviceInfo | null = null
            let pongReceived = true

            // Set up ping interval
            const pingInterval = setInterval(() => {
                if (!pongReceived) {
                    console.log(`[MobileBridge] Client ${clientId} timed out`)
                    socket.terminate()
                    clearInterval(pingInterval)
                    return
                }
                pongReceived = false
                if (socket.readyState === WS_READY_STATE_OPEN) {
                    socket.ping()
                }
            }, PING_TIMEOUT)

            socket.on('pong', () => {
                pongReceived = true
            })

            socket.on('message', (data: any) => {
                try {
                    // Size limit check
                    if (data.length > MAX_MESSAGE_SIZE) {
                        sendError(socket, 'Message too large', 'MESSAGE_TOO_LARGE')
                        return
                    }

                    const message: MobileMessage = JSON.parse(data.toString())

                    // Authentication required for most messages
                    if (!authenticated && message.type !== 'authenticate') {
                        sendError(socket, 'Authentication required', 'AUTH_REQUIRED')
                        return
                    }

                    handleMobileMessage(socket, message, clientId, (info) => {
                        authenticated = true
                        clientInfo = info
                    })

                } catch (err) {
                    console.error('[MobileBridge] Invalid message:', err)
                    sendError(socket, 'Invalid message format', 'INVALID_MESSAGE')
                }
            })

            socket.on('close', () => {
                clearInterval(pingInterval)
                clientSessions.delete(clientId)
                console.log(`[MobileBridge] Client disconnected: ${clientId}`)
            })

            socket.on('error', (err: Error) => {
                console.error(`[MobileBridge] Socket error for ${clientId}:`, err)
            })
        })

        // Handle upgrade to WebSocket
        server.on('upgrade', (request: any, socket: any, head: any) => {
            const pathname = new URL(request.url || '', `https://localhost:${port}`).pathname

            if (pathname === '/mobile') {
                wss.handleUpgrade(request, socket, head, (ws: any) => {
                    wss.emit('connection', ws, request)
                })
            } else {
                socket.destroy()
            }
        })

        // Start pairing HTTP server
        pairingServer.listen(pairingPort, '0.0.0.0', () => {
            console.log(`[MobileBridge] Pairing endpoint on http://0.0.0.0:${pairingPort}`)
        })

        // Start WebSocket server
        server.listen(port, '0.0.0.0', () => {
            console.log(`[MobileBridge] WebSocket server on wss://0.0.0.0:${port}`)

            resolve({
                port,
                pairingPort,
                url: `wss://localhost:${port}`,
                close: () => {
                    pairingServer.close()
                    server.close()
                    wss.close()
                    clientSessions.clear()
                    pendingPairings.clear()
                },
                setGitHubToken: (token: string) => {
                    githubToken = token
                },
                sendNotification: (deviceId: string, notification: any): boolean => {
                    for (const [, client] of clientSessions) {
                        if (client.deviceInfo.deviceId === deviceId) {
                            if (client.socket.readyState === WS_READY_STATE_OPEN) {
                                client.socket.send(JSON.stringify({
                                    type: 'push_notification',
                                    ...notification
                                }))
                                return true
                            }
                        }
                    }
                    return false
                },
                getConnectedDevices: (): DeviceInfo[] => {
                    return Array.from(clientSessions.values()).map(c => c.deviceInfo)
                }
            })
        })

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[MobileBridge] Port ${port} in use, trying ${port + 10}`)
                startMobileBridge(port + 10).then(resolve).catch(reject)
            } else {
                reject(err)
            }
        })
    })
}

/**
 * Handle pairing HTTP requests
 */
function handlePairingRequest(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
    }

    if (req.method !== 'POST' || req.url !== '/pair') {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Not found' }))
        return
    }

    let body = ''
    req.on('data', (chunk: any) => body += chunk)
    req.on('end', async () => {
        try {
            const request = JSON.parse(body)
            const { tempToken, devicePublicKey, deviceInfo } = request

            // Validate request
            if (!tempToken || !devicePublicKey || !deviceInfo) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: 'Missing required fields' }))
                return
            }

            // Find pending pairing
            const pairing = pendingPairings.get(tempToken)
            if (!pairing) {
                res.writeHead(401)
                res.end(JSON.stringify({ error: 'Invalid or expired pairing token' }))
                return
            }

            // Check timeout
            if (Date.now() - pairing.timestamp > PAIRING_TIMEOUT) {
                pendingPairings.delete(tempToken)
                res.writeHead(401)
                res.end(JSON.stringify({ error: 'Pairing expired' }))
                return
            }

            // Show confirmation dialog to user
            const result = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Approve', 'Reject'],
                defaultId: 0,
                title: 'Mobile Device Pairing',
                message: `Allow "${deviceInfo.deviceName}" to connect?`,
                detail: `Device: ${deviceInfo.deviceId}\nOS: ${deviceInfo.osVersion}\nApp: ${deviceInfo.appVersion}`
            })

            if (result.response !== 0) {
                pendingPairings.delete(tempToken)
                res.writeHead(403)
                res.end(JSON.stringify({ error: 'Pairing rejected by user' }))
                return
            }

            // Generate tokens
            const accessToken = generateToken()
            const refreshToken = generateToken()

            // Derive session key
            const sessionKey = deriveSessionKey(pairing.desktopPrivateKey, devicePublicKey)

            // Store tokens
            validTokens.add(accessToken)
            validTokens.add(refreshToken)

            // Clean up pairing
            pendingPairings.delete(tempToken)

            res.writeHead(200)
            res.end(JSON.stringify({
                success: true,
                accessToken,
                refreshToken,
                sessionKey: sessionKey.toString('base64')
            }))

        } catch (err) {
            console.error('[MobileBridge] Pairing error:', err)
            res.writeHead(500)
            res.end(JSON.stringify({ error: 'Internal server error' }))
        }
    })
}

/**
 * Handle messages from mobile clients
 */
async function handleMobileMessage(
    socket: any,
    message: MobileMessage,
    clientId: string,
    onAuthenticated: (info: DeviceInfo) => void
) {
    switch (message.type) {
        case 'authenticate': {
            const { token } = message
            if (!token || !validTokens.has(token)) {
                sendError(socket, 'Invalid token', 'AUTH_FAILED')
                return
            }

            // Send desktop info
            send(socket, {
                type: 'desktop_info',
                ip: getLocalIp(),
                port: 8443,
                version: '1.0.5',
                deviceName: require('os').hostname()
            })

            break
        }

        case 'device_info': {
            const { deviceInfo } = message
            if (!deviceInfo || !deviceInfo.deviceId) {
                sendError(socket, 'Invalid device info', 'INVALID_DEVICE')
                return
            }

            // Store client session
            clientSessions.set(clientId, {
                id: clientId,
                socket,
                deviceInfo,
                pairedAt: Date.now(),
                lastPing: Date.now()
            })

            onAuthenticated(deviceInfo)

            send(socket, {
                type: 'authenticated',
                message: 'Connected to Kalynt Desktop'
            })

            console.log(`[MobileBridge] Device authenticated: ${deviceInfo.deviceName}`)
            break
        }

        case 'execute_command': {
            const { requestId, agentId, command, params } = message

            try {
                // Forward to agent manager (will be implemented in main process)
                const result = await executeAgentCommand({ agentId, command, params })

                send(socket, {
                    type: 'command_response',
                    requestId,
                    status: 'completed',
                    result
                })
            } catch (err: any) {
                send(socket, {
                    type: 'command_response',
                    requestId,
                    status: 'failed',
                    error: err.message
                })
            }
            break
        }

        case 'github_request': {
            const { requestId, endpoint, method, body } = message

            if (!githubToken) {
                sendError(socket, 'GitHub not authenticated', 'GITHUB_NOT_AUTH')
                return
            }

            try {
                const result = await proxyGitHubRequest(endpoint, method, body)
                send(socket, {
                    type: 'github_response',
                    requestId,
                    statusCode: 200,
                    body: result
                })
            } catch (err: any) {
                send(socket, {
                    type: 'github_response',
                    requestId,
                    statusCode: err.status || 500,
                    error: err.message
                })
            }
            break
        }

        case 'ping': {
            send(socket, { type: 'pong', timestamp: Date.now() })
            break
        }

        default: {
            sendError(socket, `Unknown message type: ${message.type}`, 'UNKNOWN_TYPE')
        }
    }
}

/**
 * Execute agent command (placeholder - connects to actual agent system)
 */
async function executeAgentCommand(command: AgentCommand): Promise<any> {
    // TODO: Connect to actual agent manager in main process
    // This is a placeholder that will be replaced with IPC call
    return new Promise((resolve) => {
        // Simulate command execution
        setTimeout(() => {
            resolve({
                success: true,
                message: `Command "${command.command}" executed on agent "${command.agentId}"`,
                timestamp: Date.now()
            })
        }, 1000)
    })
}

/**
 * Proxy GitHub API request
 */
async function proxyGitHubRequest(
    endpoint: string,
    method: string = 'GET',
    body?: any
): Promise<any> {
    if (!githubToken) {
        throw new Error('GitHub token not configured')
    }

    // Use native https to avoid dependency issues
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `token ${githubToken}`,
                'User-Agent': 'Kalynt-Mobile-Bridge/1.0',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        }

        const req = https.request(options, (res: any) => {
            let data = ''
            res.on('data', (chunk: any) => data += chunk)
            res.on('end', () => {
                try {
                    const json = JSON.parse(data)
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json)
                    } else {
                        reject({ status: res.statusCode, message: json.message || 'GitHub API error' })
                    }
                } catch {
                    resolve(data)
                }
            })
        })

        req.on('error', (err: Error) => {
            reject({ status: 500, message: err.message })
        })

        if (body) {
            req.write(JSON.stringify(body))
        }
        req.end()
    })
}

/**
 * Get TLS options (self-signed cert for development)
 */
function getTlsOptions(): any {
    // In production, use proper certificates
    // For development, generate self-signed cert
    return {
        // Allow unauthorized for development (mobile app will pin cert in Phase 9)
        rejectUnauthorized: false
    }
}

/**
 * Get local IP address
 */
function getLocalIp(): string {
    const interfaces = require('os').networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address
            }
        }
    }
    return 'localhost'
}

/**
 * Generate QR code data for pairing
 */
export function generatePairingQR(ip: string): { qrData: string; cancel: () => void } {
    const tempToken = generateToken(16)
    const keyPair = generateKeyPair()

    const pairing: PendingPairing = {
        tempToken,
        desktopPublicKey: keyPair.publicKey,
        desktopPrivateKey: keyPair.privateKey,
        timestamp: Date.now(),
        ip
    }

    pendingPairings.set(tempToken, pairing)

    const qrData = JSON.stringify({
        desktopIp: ip,
        desktopPort: 8443,
        tempToken,
        desktopPublicKey: keyPair.publicKey,
        timestamp: Date.now()
    })

    return {
        qrData,
        cancel: () => {
            pendingPairings.delete(tempToken)
        }
    }
}