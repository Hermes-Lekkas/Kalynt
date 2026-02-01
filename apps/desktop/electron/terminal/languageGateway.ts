/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// main-process/languageGateway.ts
// Rewritten to use vscode-jsonrpc directly (works in Electron without vscode dependency)
import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
    createMessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
    MessageConnection,
    InitializeRequest,
    InitializeParams,
    InitializedNotification,
    ShutdownRequest,
    ExitNotification
} from 'vscode-languageserver-protocol/node'
import net from 'node:net'
import path from 'node:path'

export interface LanguageServerConfig {
    command: string
    args?: string[]
    runtime?: string
    env?: { [key: string]: string }
    initializationOptions?: object
}

export interface DebugAdapterConfig {
    type: string
    command: string
    args?: string[]
    runtime?: string
    env?: { [key: string]: string }
    configuration?: object
    transport: 'stdio' | 'socket'
}

export interface LanguageSession {
    id: string
    languageId: string
    connection: MessageConnection
    process: ChildProcess
    workspacePath: string
    capabilities?: unknown
    status: 'starting' | 'running' | 'stopped' | 'error'
}

export interface DebugSession {
    id: string
    languageId: string
    process: ChildProcess
    port?: number
    socket?: net.Socket
    configuration: object
    status: 'starting' | 'running' | 'stopped' | 'error'
}

export class LanguageRuntimeGateway extends EventEmitter {
    private readonly languageServers = new Map<string, LanguageSession>()
    private readonly debugSessions = new Map<string, DebugSession>()
    private readonly languageConfigs: Map<string, LanguageServerConfig>
    private readonly debugConfigs: Map<string, DebugAdapterConfig>

    // Configuration for 40+ languages
    // Note: Language servers are expected to be installed globally/in PATH
    private readonly languageServerConfigurations: Record<string, LanguageServerConfig> = {
        python: {
            command: 'python',
            args: ['-m', 'pylsp']
            // NOTE: Removed PYTHONPATH clearing - it breaks virtualenvs
        },
        javascript: {
            command: 'typescript-language-server',
            args: ['--stdio']
        },
        typescript: {
            command: 'typescript-language-server',
            args: ['--stdio']
        },
        rust: {
            command: 'rust-analyzer',
            args: []
        },
        go: {
            command: 'gopls',
            args: ['serve']
        },
        java: {
            command: 'jdtls',
            args: []
            // NOTE: jdtls may require --data and --configuration args
            // User should configure via configureLanguageServer() if needed
        },
        cpp: {
            command: 'clangd',
            args: ['--background-index']
        },
        csharp: {
            command: 'OmniSharp',
            args: ['--languageserver']
        },
        php: {
            command: 'intelephense',
            args: ['--stdio']
        },
        ruby: {
            command: 'solargraph',
            args: ['stdio']
        },
        kotlin: {
            command: 'kotlin-language-server',
            args: []
        },
        swift: {
            command: 'sourcekit-lsp',
            args: []
        },
        haskell: {
            command: 'haskell-language-server-wrapper',
            args: ['--lsp']
        },
        scala: {
            command: 'metals',
            args: []
        },
        dart: {
            command: 'dart',
            args: ['language-server']
        },
        elixir: {
            command: 'elixir-ls',
            args: []
        },
        clojure: {
            command: 'clojure-lsp',
            args: []
        },
        lua: {
            command: 'lua-language-server',
            args: []
        }
    }

    // Debug adapter configurations with transport type
    private readonly debugAdapterConfigurations: Record<string, DebugAdapterConfig> = {
        // NOTE: Node.js debug config needs a proper DAP adapter
        // 'node' with --inspect-brk uses Chrome Inspector Protocol, NOT DAP
        // Use 'js-debug' or similar DAP adapter binary instead
        node: {
            type: 'node',
            command: 'js-debug',  // Placeholder - needs actual DAP adapter
            args: ['${program}'],
            transport: 'stdio'
        },
        python: {
            type: 'python',
            command: 'python',
            args: ['-m', 'debugpy', '--listen', '${port}', '--wait-for-client', '${program}'],
            transport: 'socket'
        },
        go: {
            type: 'go',
            command: 'dlv',
            args: ['dap', '--listen', '127.0.0.1:${port}'],
            transport: 'socket'
        },
        // NOTE: Java debug config needs a proper DAP adapter
        // 'java' with -agentlib:jdwp uses JDWP protocol, NOT DAP
        // Use 'java-debug-adapter' or similar DAP adapter binary instead
        java: {
            type: 'java',
            command: 'java-debug',  // Placeholder - needs actual DAP adapter
            args: ['--server', '--port', '${port}'],
            transport: 'socket'
        },
        cpp: {
            type: 'cppdbg',
            command: 'lldb-vscode',
            args: [],
            transport: 'stdio'
        },
        rust: {
            type: 'lldb',
            command: 'lldb-vscode',
            args: [],
            transport: 'stdio'
        },
        php: {
            type: 'php',
            command: 'php',
            args: ['-dxdebug.start_with_request=yes', '-S', 'localhost:0'],
            transport: 'socket'
        }
    }

    constructor() {
        super()
        this.languageConfigs = new Map(Object.entries(this.languageServerConfigurations))
        this.debugConfigs = new Map(Object.entries(this.debugAdapterConfigurations))
    }

    /**
     * Start a language server using direct JSON-RPC communication
     * Works in Electron without requiring the vscode module
     */
    async loadLanguageServer(options: {
        languageId: string
        workspacePath: string
        rootUri?: string
        initializationOptions?: object
    }): Promise<{ success: boolean; sessionId?: string; error?: string }> {
        try {
            const config = this.languageConfigs.get(options.languageId)
            if (!config) {
                return { success: false, error: `No language server configuration found for ${options.languageId}` }
            }

            const sessionId = `lsp_${options.languageId}_${Date.now()}`

            // Check if we already have a session for this language in this workspace
            for (const [existingId, existingSession] of Array.from(this.languageServers)) {
                if (existingSession.languageId === options.languageId &&
                    existingSession.workspacePath === options.workspacePath &&
                    existingSession.status === 'running') {
                    return { success: true, sessionId: existingId }
                }
            }

            // Spawn the language server process
            const serverProcess = spawn(config.command, config.args || [], {
                cwd: options.workspacePath,
                env: { ...process.env, ...config.env },
                stdio: ['pipe', 'pipe', 'pipe']
            })

            // Create JSON-RPC connection over stdio
            const connection = createMessageConnection(
                new StreamMessageReader(serverProcess.stdout!),
                new StreamMessageWriter(serverProcess.stdin!)
            )

            const session: LanguageSession = {
                id: sessionId,
                languageId: options.languageId,
                connection,
                process: serverProcess,
                workspacePath: options.workspacePath,
                status: 'starting'
            }

            // Handle process errors
            serverProcess.on('error', (error) => {
                console.error(`[LanguageGateway] Process error for ${options.languageId}:`, error)
                session.status = 'error'
                this.emit('language_server_error', { sessionId, error: String(error) })
            })

            serverProcess.on('exit', (code) => {
                session.status = 'stopped'
                this.languageServers.delete(sessionId)
                this.emit('language_server_stopped', { sessionId, exitCode: code })
            })

            serverProcess.stderr?.on('data', (data: Buffer) => {
                console.error(`[LSP ${options.languageId}]`, data.toString())
            })

            // Start listening on the connection
            connection.listen()

            // Send initialize request
            const rootUri = options.rootUri || `file:///${options.workspacePath.replace(/\\/g, '/')}`
            const initParams: InitializeParams = {
                processId: process.pid,
                capabilities: {
                    textDocument: {
                        synchronization: { dynamicRegistration: true, didSave: true },
                        completion: { dynamicRegistration: true, completionItem: { snippetSupport: true } },
                        hover: { dynamicRegistration: true },
                        definition: { dynamicRegistration: true },
                        references: { dynamicRegistration: true },
                        documentSymbol: { dynamicRegistration: true },
                        codeAction: { dynamicRegistration: true },
                        formatting: { dynamicRegistration: true },
                        rangeFormatting: { dynamicRegistration: true },
                        rename: { dynamicRegistration: true },
                        publishDiagnostics: { relatedInformation: true }
                    },
                    workspace: {
                        workspaceFolders: true,
                        applyEdit: true,
                        didChangeConfiguration: { dynamicRegistration: true }
                    }
                },
                rootUri,
                workspaceFolders: [{
                    uri: rootUri,
                    name: path.basename(options.workspacePath)
                }],
                initializationOptions: options.initializationOptions || config.initializationOptions
            }

            const initResult = await connection.sendRequest(InitializeRequest.type, initParams)
            session.capabilities = initResult.capabilities

            // Send initialized notification
            connection.sendNotification(InitializedNotification.type, {})

            // Store session after successful initialization
            this.languageServers.set(sessionId, session)
            session.status = 'running'

            this.emit('language_server_started', {
                sessionId,
                languageId: options.languageId,
                capabilities: initResult.capabilities
            })

            return { success: true, sessionId }
        } catch (error) {
            console.error(`[LanguageGateway] Failed to start language server for ${options.languageId}:`, error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Start a debug session with proper retry logic for socket connections
     */
    async startDebugSession(options: {
        sessionId: string
        languageId: string
        program: string
        args?: string[]
        cwd?: string
        stopOnEntry?: boolean
        port?: number
    }): Promise<{ success: boolean; port?: number; error?: string }> {
        try {
            const config = this.debugConfigs.get(options.languageId)
            if (!config) {
                return { success: false, error: `No debug adapter configuration found for ${options.languageId}` }
            }

            // Warn about placeholder configurations
            if (options.languageId === 'node' || options.languageId === 'java') {
                console.warn(`[LanguageGateway] WARNING: ${options.languageId} debug adapter uses a placeholder configuration.`)
                console.warn(`  The command '${config.command}' may not be installed.`)
                if (options.languageId === 'node') {
                    console.warn(`  Node.js debugging requires 'vscode-js-debug' or similar DAP adapter.`)
                    console.warn(`  Configure via: gateway.configureDebugAdapter('node', { ... })`)
                } else {
                    console.warn(`  Java debugging requires 'com.microsoft.java.debug.plugin' or similar.`)
                    console.warn(`  Configure via: gateway.configureDebugAdapter('java', { ... })`)
                }
                this.emit('debug_warning', {
                    languageId: options.languageId,
                    message: `${options.languageId} debugger requires additional configuration`
                })
            }

            const port = config.transport === 'socket'
                ? (options.port || await this.findAvailablePort())
                : undefined
            const sessionId = options.sessionId || `debug_${options.languageId}_${Date.now()}`

            // Replace variables in command arguments
            // Handle ${args} specially to preserve array structure
            const processedArgs = (config.args || []).flatMap(arg => {
                if (arg === '${args}') {
                    return options.args || []
                }
                if (arg.includes('${args}')) {
                    // If ${args} is part of a larger string, join with spaces
                    // This is risky with paths containing spaces but sometimes needed
                    return arg
                        .replace(/\$\{port\}/g, String(port || 0))
                        .replace(/\$\{program\}/g, options.program)
                        .replace(/\$\{args\}/g, (options.args || []).join(' '))
                }
                return arg
                    .replace(/\$\{port\}/g, String(port || 0))
                    .replace(/\$\{program\}/g, options.program)
            })

            // Spawn debug adapter process
            const debugProcess = spawn(config.command, processedArgs, {
                cwd: options.cwd || process.cwd(),
                env: { ...process.env, ...config.env },
                stdio: config.transport === 'stdio' ? ['pipe', 'pipe', 'pipe'] : 'pipe'
            })

            const session: DebugSession = {
                id: sessionId,
                languageId: options.languageId,
                process: debugProcess,
                port,
                configuration: {
                    type: config.type,
                    request: 'launch',
                    name: `Debug ${path.basename(options.program)}`,
                    program: options.program,
                    args: options.args,
                    cwd: options.cwd,
                    stopOnEntry: options.stopOnEntry,
                    port
                },
                status: 'starting'
            }

            this.debugSessions.set(sessionId, session)

            // Handle process exit
            debugProcess.on('exit', (code: number | null) => {
                session.status = 'stopped'
                if (session.socket) {
                    session.socket.destroy()
                }
                this.debugSessions.delete(sessionId)
                this.emit('debug_session_stopped', { sessionId, exitCode: code })
            })

            debugProcess.stderr?.on('data', (data: Buffer) => {
                console.error(`[DebugAdapter ${options.languageId}]`, data.toString())
            })

            // Handle based on transport type
            if (config.transport === 'stdio') {
                // Stdio transport - ready immediately
                session.status = 'running'
                this.emit('debug_session_started', {
                    sessionId,
                    languageId: options.languageId,
                    configuration: session.configuration,
                    transport: 'stdio'
                })
            } else {
                // Socket transport - need to connect with retry
                await this.connectWithRetry(port!, session, sessionId, options, debugProcess)
            }

            return { success: true, port }
        } catch (error) {
            console.error(`[LanguageGateway] Failed to start debug session for ${options.languageId}:`, error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Connect to debug adapter with retry logic
     * Handles the race condition where adapter needs time to start
     */
    private connectWithRetry(
        port: number,
        session: DebugSession,
        sessionId: string,
        options: { languageId: string },
        debugProcess: ChildProcess,
        maxRetries = 15,
        retryDelayMs = 200
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let retries = 0

            const attemptConnect = (): void => {
                const socket = net.createConnection({ port })
                    .on('connect', () => {
                        session.status = 'running'
                        session.socket = socket
                        this.emit('debug_session_started', {
                            sessionId,
                            languageId: options.languageId,
                            port,
                            configuration: session.configuration,
                            transport: 'socket'
                        })
                        resolve()
                    })
                    .on('error', (error) => {
                        socket.destroy()

                        if (retries < maxRetries) {
                            retries++
                            console.log(`[Debug] Connection retry ${retries}/${maxRetries} for port ${port}`)
                            setTimeout(attemptConnect, retryDelayMs)
                        } else {
                            console.error(`[DebugAdapter] Failed to connect after ${maxRetries} retries:`, error)
                            session.status = 'error'
                            debugProcess.kill()
                            this.emit('debug_session_error', {
                                sessionId,
                                error: `Failed to connect to debug adapter: ${error.message}`
                            })
                            reject(error)
                        }
                    })
            }

            // Start connection attempts
            attemptConnect()
        })
    }

    /**
     * Send LSP request through the message connection
     */
    async sendLSPRequest(sessionId: string, method: string, params: unknown): Promise<unknown> {
        const session = this.languageServers.get(sessionId)
        if (!session) {
            throw new Error(`Language session ${sessionId} not found`)
        }

        if (session.status !== 'running') {
            throw new Error(`Language session ${sessionId} is not running (status: ${session.status})`)
        }

        return session.connection.sendRequest(method, params as object)
    }

    /**
     * Send debug adapter request
     * 
     * TODO: CRITICAL - This is a placeholder!
     * Currently, this does NOT implement the Debug Adapter Protocol (DAP).
     * 
     * What works:
     * - Spawning debug processes
     * - Socket connections with retry logic
     * - Process cleanup
     * 
     * What is missing:
     * - DAP message protocol (Content-Length headers + JSON-RPC body)
     * - Reading from socket/stdio streams
     * - Writing commands (setBreakpoints, continue, stepOver, etc.)
     * - Parsing DAP responses
     * 
     * To implement:
     * 1. Install vscode-debugprotocol package
     * 2. Create DAP message reader/writer for socket/stdio
     * 3. Implement request/response handling
     * 
     * Example implementation:
     * ```typescript
     * if (session.socket) {
     *     // For socket transport
     *     const message = JSON.stringify({ seq: 1, type: 'request', command: method, arguments: params })
     *     session.socket.write(`Content-Length: ${message.length}\r\n\r\n${message}`)
     * } else {
     *     // For stdio transport  
     *     session.process.stdin.write(...)
     * }
     * ```
     */
    async sendDebugRequest(sessionId: string, method: string, params: unknown): Promise<unknown> {
        const session = this.debugSessions.get(sessionId)
        if (!session) {
            throw new Error(`Debug session ${sessionId} not found`)
        }

        // TODO: Implement actual DAP protocol communication
        // For socket transport, send through session.socket
        // For stdio, send through session.process.stdin
        // This would need full DAP protocol implementation
        return new Promise((resolve, _reject) => {
            // Placeholder - full DAP implementation would go here
            console.warn('[LanguageGateway] sendDebugRequest not implemented - placeholder only')
            resolve({ success: true, method, params })
        })
    }

    async getLanguageServers(): Promise<Array<{ languageId: string; sessionId: string; status: string }>> {
        return Array.from(this.languageServers.values()).map(session => ({
            languageId: session.languageId,
            sessionId: session.id,
            status: session.status
        }))
    }

    async getDebugSessions(): Promise<Array<{ languageId: string; sessionId: string; port?: number; status: string }>> {
        return Array.from(this.debugSessions.values()).map(session => ({
            languageId: session.languageId,
            sessionId: session.id,
            port: session.port,
            status: session.status
        }))
    }

    async stopLanguageServer(sessionId: string): Promise<boolean> {
        const session = this.languageServers.get(sessionId)
        if (!session) return false

        try {
            // Send shutdown request followed by exit notification (LSP protocol)
            await session.connection.sendRequest(ShutdownRequest.type)
            session.connection.sendNotification(ExitNotification.type)
            session.connection.dispose()
            session.process.kill()
            this.languageServers.delete(sessionId)
            return true
        } catch (error) {
            console.error(`[LanguageGateway] Error stopping language server ${sessionId}:`, error)
            // Force kill if graceful shutdown fails
            session.process.kill('SIGKILL')
            this.languageServers.delete(sessionId)
            return false
        }
    }

    async stopDebugSession(sessionId: string): Promise<boolean> {
        const session = this.debugSessions.get(sessionId)
        if (!session) return false

        try {
            if (session.socket) {
                session.socket.destroy()
            }
            session.process.kill()
            this.debugSessions.delete(sessionId)
            return true
        } catch (error) {
            console.error(`[LanguageGateway] Error stopping debug session ${sessionId}:`, error)
            return false
        }
    }

    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve) => {
            const server = net.createServer()
            server.listen(0, () => {
                const port = (server.address() as net.AddressInfo).port
                server.close(() => resolve(port))
            })
        })
    }

    configureLanguageServer(languageId: string, config: LanguageServerConfig): void {
        this.languageConfigs.set(languageId, config)
    }

    configureDebugAdapter(languageId: string, config: DebugAdapterConfig): void {
        this.debugConfigs.set(languageId, config)
    }

    getSupportedLanguages(): string[] {
        return Array.from(this.languageConfigs.keys())
    }

    async dispose(): Promise<void> {
        // Stop all language servers gracefully
        const stopPromises: Promise<void>[] = []

        for (const [sessionId, session] of Array.from(this.languageServers)) {
            stopPromises.push(
                (async () => {
                    try {
                        await session.connection.sendRequest(ShutdownRequest.type)
                        session.connection.sendNotification(ExitNotification.type)
                        session.connection.dispose()
                        session.process.kill()
                    } catch (error) {
                        console.error(`[LanguageGateway] Error disposing language server ${sessionId}:`, error)
                        session.process.kill('SIGKILL')
                    }
                })()
            )
        }

        // Stop all debug sessions
        for (const [sessionId, session] of Array.from(this.debugSessions)) {
            try {
                if (session.socket) {
                    session.socket.destroy()
                }
                session.process.kill()
            } catch (error) {
                console.error(`[LanguageGateway] Error disposing debug session ${sessionId}:`, error)
            }
        }

        await Promise.all(stopPromises)

        this.languageServers.clear()
        this.debugSessions.clear()
        this.removeAllListeners()
    }
}
