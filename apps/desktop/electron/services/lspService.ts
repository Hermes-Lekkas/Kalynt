/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * LSP Service - Language Server Protocol Bridge
 * 
 * Manages LSP language servers for real-time diagnostics,
 * code completion, and refactoring support.
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as net from 'net'

export interface LSPSession {
    id: string
    language: string
    process: ChildProcess
    socket?: net.Socket
    initialized: boolean
    workspacePath: string
    capabilities: any
    lastActivity: number
}

export interface LSPRequest {
    jsonrpc: '2.0'
    id: number
    method: string
    params?: any
}

export interface LSPResponse {
    jsonrpc: '2.0'
    id: number
    result?: any
    error?: {
        code: number
        message: string
        data?: any
    }
}

export interface LSPDiagnostic {
    range: {
        start: { line: number; character: number }
        end: { line: number; character: number }
    }
    severity: 1 | 2 | 3 | 4  // Error, Warning, Information, Hint
    code?: string | number
    source?: string
    message: string
}

class LSPService {
    private sessions = new Map<string, LSPSession>()
    private requestId = 0
    private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>()
    private messageBuffers = new Map<string, string>()

    // Language server command mappings
    private readonly languageServers: Record<string, { command: string; args: string[]; initOptions?: any }> = {
        typescript: {
            command: 'typescript-language-server',
            args: ['--stdio'],
            initOptions: { hostInfo: 'kalynt-ide' }
        },
        javascript: {
            command: 'typescript-language-server',
            args: ['--stdio'],
            initOptions: { hostInfo: 'kalynt-ide' }
        },
        python: {
            command: 'pylsp',
            args: []
        },
        rust: {
            command: 'rust-analyzer',
            args: []
        },
        go: {
            command: 'gopls',
            args: []
        },
        java: {
            command: 'java',
            args: ['-jar', 'jdt-language-server.jar']
        },
        csharp: {
            command: 'omnisharp',
            args: ['--languageserver']
        }
    }

    /**
     * Start an LSP session for a language
     */
    async startSession(
        sessionId: string,
        language: string,
        workspacePath: string
    ): Promise<{ success: boolean; error?: string }> {
        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            return { success: false, error: 'Session already exists' }
        }

        const serverConfig = this.languageServers[language]
        if (!serverConfig) {
            return { success: false, error: `No LSP server configured for ${language}` }
        }

        try {
            // Spawn the language server
            const proc = spawn(serverConfig.command, serverConfig.args, {
                cwd: workspacePath,
                stdio: ['pipe', 'pipe', 'pipe']
            })

            const session: LSPSession = {
                id: sessionId,
                language,
                process: proc,
                initialized: false,
                workspacePath,
                capabilities: {},
                lastActivity: Date.now()
            }

            // Set up message handling
            this.setupMessageHandling(session)

            // Store session
            this.sessions.set(sessionId, session)

            // Send initialize request
            const initResult = await this.sendRequest(sessionId, 'initialize', {
                processId: process.pid,
                rootUri: `file://${workspacePath}`,
                capabilities: {
                    textDocumentSync: {
                        openClose: true,
                        change: 2  // Incremental
                    },
                    completionProvider: {
                        resolveProvider: false,
                        triggerCharacters: ['.', ':', '>']
                    },
                    hoverProvider: true,
                    definitionProvider: true,
                    diagnosticsProvider: {
                        identifier: 'kalynt-lsp',
                        interFileDependencies: true,
                        workspaceDiagnostics: true
                    }
                },
                workspaceFolders: [{
                    uri: `file://${workspacePath}`,
                    name: path.basename(workspacePath)
                }],
                initializationOptions: serverConfig.initOptions
            })

            session.capabilities = initResult?.capabilities || {}
            session.initialized = true
            session.lastActivity = Date.now()

            // Send initialized notification
            this.sendNotification(sessionId, 'initialized', {})

            console.log(`[LSP] Session ${sessionId} started for ${language}`)
            return { success: true }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.error(`[LSP] Failed to start session ${sessionId}:`, errorMsg)
            return { success: false, error: errorMsg }
        }
    }

    /**
     * Send a request to the language server
     */
    async sendRequest(sessionId: string, method: string, params?: any): Promise<any> {
        const session = this.sessions.get(sessionId)
        if (!session) {
            throw new Error(`Session ${sessionId} not found`)
        }

        if (!session.initialized && method !== 'initialize') {
            throw new Error('Session not initialized')
        }

        const id = ++this.requestId
        const request: LSPRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject })

            // Set timeout
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id)
                    reject(new Error('LSP request timeout'))
                }
            }, 30000) // 30 second timeout

            // Send the request
            this.sendMessage(session, request)
            session.lastActivity = Date.now()
        })
    }

    /**
     * Send a notification (no response expected)
     */
    sendNotification(sessionId: string, method: string, params?: any): void {
        const session = this.sessions.get(sessionId)
        if (!session) return

        const notification = {
            jsonrpc: '2.0',
            method,
            params
        }

        this.sendMessage(session, notification)
        session.lastActivity = Date.now()
    }

    /**
     * Open a document in the language server
     */
    openDocument(sessionId: string, uri: string, languageId: string, content: string): void {
        this.sendNotification(sessionId, 'textDocument/didOpen', {
            textDocument: {
                uri,
                languageId,
                version: 1,
                text: content
            }
        })
    }

    /**
     * Update document content
     */
    updateDocument(sessionId: string, uri: string, changes: Array<{
        range?: { start: { line: number; character: number }; end: { line: number; character: number } }
        text: string
    }>): void {
        this.sendNotification(sessionId, 'textDocument/didChange', {
            textDocument: { uri, version: Date.now() },
            contentChanges: changes
        })
    }

    /**
     * Request diagnostics for a document
     */
    async getDiagnostics(sessionId: string, uri: string): Promise<LSPDiagnostic[]> {
        // Trigger document validation
        this.sendNotification(sessionId, 'textDocument/didSave', {
            textDocument: { uri }
        })

        // Some servers send diagnostics via notification, not request
        // For now, return empty and rely on published diagnostics
        return []
    }

    /**
     * Close a document
     */
    closeDocument(sessionId: string, uri: string): void {
        this.sendNotification(sessionId, 'textDocument/didClose', {
            textDocument: { uri }
        })
    }

    /**
     * Stop a session
     */
    async stopSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId)
        if (!session) return

        try {
            // Send shutdown request
            await this.sendRequest(sessionId, 'shutdown', {})
            
            // Send exit notification
            this.sendNotification(sessionId, 'exit', {})

            // Kill process
            session.process.kill('SIGTERM')
            
            // Wait for process to exit
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            if (!session.process.killed) {
                session.process.kill('SIGKILL')
            }
        } catch (error) {
            console.error(`[LSP] Error stopping session ${sessionId}:`, error)
        } finally {
            this.sessions.delete(sessionId)
            this.messageBuffers.delete(sessionId)
        }
    }

    /**
     * Stop all sessions
     */
    async stopAllSessions(): Promise<void> {
        const promises = Array.from(this.sessions.keys()).map(id => this.stopSession(id))
        await Promise.all(promises)
    }

    /**
     * Get active sessions
     */
    getActiveSessions(): Array<{ id: string; language: string; workspacePath: string }> {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            language: s.language,
            workspacePath: s.workspacePath
        }))
    }

    /**
     * Check if a session is active
     */
    isSessionActive(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        return session?.initialized ?? false
    }

    /**
     * Set up message handling for a session
     */
    private setupMessageHandling(session: LSPSession): void {
        this.messageBuffers.set(session.id, '')

        session.process.stdout?.on('data', (data: Buffer) => {
            const buffer = this.messageBuffers.get(session.id) || ''
            this.messageBuffers.set(session.id, buffer + data.toString())
            this.processMessageBuffer(session)
        })

        session.process.stderr?.on('data', (data: Buffer) => {
            console.error(`[LSP:${session.id}]`, data.toString())
        })

        session.process.on('exit', (code) => {
            console.log(`[LSP] Session ${session.id} exited with code ${code}`)
            this.sessions.delete(session.id)
        })
    }

    /**
     * Process message buffer for complete LSP messages
     */
    private processMessageBuffer(session: LSPSession): void {
        let buffer = this.messageBuffers.get(session.id) || ''

        while (true) {
            // LSP messages start with Content-Length header
            const headerMatch = buffer.match(/Content-Length: (\d+)\r\n\r\n/)
            if (!headerMatch) break

            const contentLength = parseInt(headerMatch[1])
            const headerEnd = headerMatch.index! + headerMatch[0].length
            const messageEnd = headerEnd + contentLength

            if (buffer.length < messageEnd) break // Wait for more data

            // Extract and parse the message
            const messageJson = buffer.substring(headerEnd, messageEnd)
            buffer = buffer.substring(messageEnd)

            try {
                const message = JSON.parse(messageJson)
                this.handleMessage(session, message)
            } catch (error) {
                console.error('[LSP] Failed to parse message:', error)
            }
        }

        this.messageBuffers.set(session.id, buffer)
    }

    /**
     * Handle incoming LSP messages
     */
    private handleMessage(session: LSPSession, message: any): void {
        if (message.id !== undefined) {
            // This is a response
            const pending = this.pendingRequests.get(message.id)
            if (pending) {
                this.pendingRequests.delete(message.id)
                if (message.error) {
                    pending.reject(message.error)
                } else {
                    pending.resolve(message.result)
                }
            }
        } else {
            // This is a notification
            this.handleNotification(session, message)
        }
    }

    /**
     * Handle LSP notifications
     */
    private handleNotification(session: LSPSession, message: any): void {
        switch (message.method) {
            case 'textDocument/publishDiagnostics':
                // Store or forward diagnostics
                console.log(`[LSP:${session.id}] Diagnostics for ${message.params.uri}:`, 
                    message.params.diagnostics?.length || 0, 'items')
                break
            case 'window/showMessage':
                console.log(`[LSP:${session.id}] Message:`, message.params.message)
                break
            case 'window/logMessage':
                console.log(`[LSP:${session.id}] Log:`, message.params.message)
                break
        }
    }

    /**
     * Send a message to the language server
     */
    private sendMessage(session: LSPSession, message: any): void {
        const json = JSON.stringify(message)
        const data = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`
        
        session.process.stdin?.write(data)
    }

    /**
     * Clean up inactive sessions
     */
    cleanupInactiveSessions(maxInactiveMs: number = 300000): void { // 5 minutes
        const cutoff = Date.now() - maxInactiveMs
        for (const [id, session] of this.sessions) {
            if (session.lastActivity < cutoff) {
                console.log(`[LSP] Cleaning up inactive session ${id}`)
                this.stopSession(id)
            }
        }
    }
}

export const lspService = new LSPService()
