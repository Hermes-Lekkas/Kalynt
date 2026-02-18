/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// main-process/terminal.ts
import * as pty from 'node-pty'
import { BrowserWindow, app } from 'electron'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { ShellIntegrationService } from './shellIntegration'
import { LanguageRuntimeGateway } from './languageGateway'
import { TaskRunnerService } from './taskRunner'
import { TerminalSessionManager } from './terminalManager'

// Enhanced terminal interface
export interface KalyntTerminal extends pty.IPty {
    id: string
    title: string
    shell: string
    cwd: string
    env: { [key: string]: string }
    status: 'running' | 'stopped' | 'error'
    lastExitCode?: number
    processType?: 'shell' | 'task' | 'debug'
    metadata?: {
        languageId?: string
        taskId?: string
        debugSessionId?: string
        projectType?: string
    }
}

export class TerminalService extends EventEmitter {
    private readonly terminals = new Map<string, KalyntTerminal>()
    public shellIntegration: ShellIntegrationService
    public languageGateway: LanguageRuntimeGateway
    private readonly taskRunner: TaskRunnerService
    private readonly sessionManager: TerminalSessionManager
    private readonly terminalHistory = new Map<string, string[]>()
    private readonly maxHistorySize = 1000

    constructor(
        private readonly getMainWindow: () => BrowserWindow | null,
        private readonly getWorkspacePath: () => string | null
    ) {
        super()
        this.shellIntegration = new ShellIntegrationService()
        this.languageGateway = new LanguageRuntimeGateway()
        this.taskRunner = new TaskRunnerService()
        this.sessionManager = new TerminalSessionManager()

        this.setupLanguageServers()
    }

    private setupLanguageServers() {
        // Configure 40+ language servers
        const _languageConfigs = {
            python: {
                lsp: 'pylsp',
                debug: 'debugpy',
                run: 'python',
                extensions: ['.py', '.pyw'],
                test: 'pytest'
            },
            javascript: {
                lsp: 'typescript-language-server',
                debug: 'node',
                run: 'node',
                extensions: ['.js', '.jsx', '.ts', '.tsx'],
                test: 'jest'
            },
            rust: {
                lsp: 'rust-analyzer',
                debug: 'lldb',
                run: 'cargo run',
                extensions: ['.rs'],
                test: 'cargo test'
            },
            go: {
                lsp: 'gopls',
                debug: 'dlv',
                run: 'go run',
                extensions: ['.go'],
                test: 'go test'
            },
            java: {
                lsp: 'jdtls',
                debug: 'java-debug',
                run: 'mvn exec:java',
                extensions: ['.java'],
                test: 'mvn test'
            },
            cpp: {
                lsp: 'clangd',
                debug: 'lldb',
                run: 'make run',
                extensions: ['.cpp', '.hpp', '.c', '.h'],
                test: 'make test'
            },
            // Add 35+ more languages...
            ruby: { lsp: 'solargraph', debug: 'rdbg', run: 'ruby' },
            php: { lsp: 'intelephense', debug: 'xdebug', run: 'php' },
            csharp: { lsp: 'omnisharp', debug: 'netcoredbg', run: 'dotnet run' },
            kotlin: { lsp: 'kotlin-language-server', debug: 'kotlin-debug-adapter' },
            swift: { lsp: 'sourcekit-lsp', debug: 'lldb' },
            haskell: { lsp: 'haskell-language-server', debug: 'haskell-debug-adapter' },
            scala: { lsp: 'metals', debug: 'scala-debug-adapter' },
            dart: { lsp: 'dart', debug: 'dart-debug-adapter' },
            elixir: { lsp: 'elixir-ls', debug: 'elixir-debugger' },
            clojure: { lsp: 'clojure-lsp', debug: 'clojure-debug-adapter' },
            // ... continue for 40+ languages
        }

        // Note: Language gateway has internal configurations
        // Additional language configs can be added here if needed
    }

    async spawnTerminal(options: {
        id: string
        shell?: string
        cwd?: string
        cols?: number
        rows?: number
        env?: { [key: string]: string }
        title?: string
        processType?: 'shell' | 'task' | 'debug'
        metadata?: any
    }): Promise<{ success: boolean; pid?: number; error?: string }> {
        try {
            const mainWindow = this.getMainWindow()

            // Check if terminal already exists
            if (this.terminals.has(options.id)) {
                const terminal = this.terminals.get(options.id)!
                mainWindow?.webContents.send('terminal:restored', {
                    id: options.id,
                    pid: terminal.pid,
                    title: terminal.title
                })
                return { success: true, pid: terminal.pid }
            }

            // Determine shell with proper validation
            let shell = options.shell?.trim() || ''
            if (!shell) {
                shell = this.getDefaultShell()
            }

            // Final validation - ensure we have a shell
            if (!shell) {
                shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
            }

            console.log(`[Terminal] Using shell: ${shell}`)

            // Determine working directory
            const cwd = options.cwd || this.getWorkspacePath() ||
                process.env.HOME || process.env.USERPROFILE ||
                process.cwd()

            console.log(`[Terminal] Working directory: ${cwd}`)

            // Merge environment variables
            // On Windows, Electron may not inherit user PATH fully when launched from shortcuts
            // We need to explicitly add common install paths
            let enhancedPath = process.env.PATH || ''

            // PRIORITY: Add bundled bin directory
            const bundledBinPath = app.isPackaged 
                ? path.join(process.resourcesPath, 'bin')
                : path.join(app.getAppPath(), 'bin')
            
            const pathSeparator = process.platform === 'win32' ? ';' : ':'
            if (fs.existsSync(bundledBinPath)) {
                enhancedPath = `${bundledBinPath}${pathSeparator}${enhancedPath}`
            }

            if (process.platform === 'win32') {
                const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default'
                const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
                const _programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
                const localAppData = process.env.LOCALAPPDATA || `${userProfile}\\AppData\\Local`
                const appData = process.env.APPDATA || `${userProfile}\\AppData\\Roaming`

                // Common paths for user-installed development tools
                const additionalPaths = [
                    // Python
                    `${localAppData}\\Programs\\Python\\Python312`,
                    `${localAppData}\\Programs\\Python\\Python312\\Scripts`,
                    `${localAppData}\\Programs\\Python\\Python311`,
                    `${localAppData}\\Programs\\Python\\Python311\\Scripts`,
                    `${localAppData}\\Programs\\Python\\Python310`,
                    `${localAppData}\\Programs\\Python\\Python310\\Scripts`,
                    `${appData}\\Python\\Python312\\Scripts`,
                    `${programFiles}\\Python312`,
                    `${programFiles}\\Python311`,
                    `${programFiles}\\Python310`,

                    // Rust / Cargo
                    `${userProfile}\\.cargo\\bin`,

                    // Node.js / npm
                    `${programFiles}\\nodejs`,
                    `${appData}\\npm`,
                    `${localAppData}\\fnm_multishells`,

                    // Java
                    `${programFiles}\\Java\\jdk-21\\bin`,
                    `${programFiles}\\Eclipse Adoptium\\jdk-21\\bin`,
                    `${programFiles}\\Microsoft\\jdk-17\\bin`,

                    // Go
                    `${userProfile}\\go\\bin`,
                    `${programFiles}\\Go\\bin`,

                    // Ruby
                    `${programFiles}\\Ruby32-x64\\bin`,
                    `${programFiles}\\Ruby31-x64\\bin`,

                    // .NET
                    `${programFiles}\\dotnet`,
                    `${userProfile}\\.dotnet\\tools`,

                    // Scoop
                    `${userProfile}\\scoop\\shims`,

                    // Chocolatey
                    `${programFiles}\\chocolatey\\bin`,

                    // Git
                    `${programFiles}\\Git\\cmd`,
                    `${programFiles}\\Git\\bin`,

                    // Visual Studio Code
                    `${localAppData}\\Programs\\Microsoft VS Code\\bin`,

                    // Common local bin directories
                    `${userProfile}\\.local\\bin`,
                    `${userProfile}\\bin`
                ]

                // Add paths that exist
                const _cargoPath = `${userProfile}\\.cargo\\bin`
                console.log(`[Terminal] Checking Rust/Cargo path: ${_cargoPath}`)
                console.log(`[Terminal] Cargo path exists: ${fs.existsSync(_cargoPath)}`)

                for (const p of additionalPaths) {
                    if (fs.existsSync(p) && !enhancedPath.toLowerCase().includes(p.toLowerCase())) {
                        console.log(`[Terminal] Adding to PATH: ${p}`)
                        enhancedPath = `${p};${enhancedPath}`
                    }
                }
                console.log(`[Terminal] Final enhanced PATH length: ${enhancedPath.length} chars`)
            } else if (process.platform === 'darwin') {
                // macOS: Ensure Homebrew and common dev paths are included
                const homeDir = process.env.HOME || `/Users/${process.env.USER}`
                const macPaths = [
                    '/opt/homebrew/bin',
                    '/opt/homebrew/sbin',
                    '/usr/local/bin',
                    '/usr/local/sbin',
                    `${homeDir}/.cargo/bin`,
                    `${homeDir}/.local/bin`,
                    `${homeDir}/go/bin`,
                    '/Library/Apple/usr/bin'
                ]

                for (const p of macPaths) {
                    if (fs.existsSync(p) && !enhancedPath.includes(p)) {
                        enhancedPath = `${p}:${enhancedPath}`
                    }
                }
            }

            const env = {
                ...process.env,
                ...options.env,
                PATH: enhancedPath,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                KALYNT_TERMINAL: '1',
                KALYNT_TERMINAL_ID: options.id,
                LANG: process.platform === 'win32' ? 'en_US.UTF-8' : process.env.LANG || 'en_US.UTF-8'
            }
            console.log(`[Terminal] Environment PATH includes .cargo: ${env.PATH.includes('.cargo\\bin')}`)

            // Spawn PTY process
            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: options.cols || 80,
                rows: options.rows || 24,
                cwd: cwd,
                env: env,
                encoding: 'utf8',
                handleFlowControl: true,
                useConpty: process.platform === 'win32'
            }) as KalyntTerminal

            // Enhance with metadata
            ptyProcess.id = options.id
            ptyProcess.title = options.title || `Terminal ${options.id}`
            ptyProcess.shell = shell
            ptyProcess.cwd = cwd
            ptyProcess.env = env
            ptyProcess.status = 'running'
            ptyProcess.processType = options.processType || 'shell'
            ptyProcess.metadata = options.metadata || {}

            // Store terminal
            this.terminals.set(options.id, ptyProcess)
            this.terminalHistory.set(options.id, [])

            // Setup shell integration
            this.shellIntegration.attachToTerminal(options.id, ptyProcess, shell)

            // Setup event handlers
            this.setupTerminalEvents(options.id, ptyProcess)

            // Notify renderer
            mainWindow?.webContents.send('terminal:spawned', {
                id: options.id,
                pid: ptyProcess.pid,
                title: ptyProcess.title,
                cwd: cwd,
                shell: shell
            })

            console.log(`[Terminal] Spawned ${shell} with PID ${ptyProcess.pid} in ${cwd}`)
            return { success: true, pid: ptyProcess.pid }
        } catch (error) {
            console.error('[Terminal] Spawn error:', error)
            return { success: false, error: String(error) }
        }
    }

    private setupTerminalEvents(id: string, terminal: KalyntTerminal) {
        terminal.onData((data) => {
            this.handleTerminalData(id, data)
        })

        terminal.onExit(({ exitCode, signal }) => {
            this.handleTerminalExit(id, exitCode, signal)
        })
    }

    private handleTerminalData(id: string, data: string) {
        const mainWindow = this.getMainWindow()

        // Store in history
        const history = this.terminalHistory.get(id) || []
        history.push(data)
        if (history.length > this.maxHistorySize) {
            history.splice(0, history.length - this.maxHistorySize)
        }
        this.terminalHistory.set(id, history)

        // Send to renderer
        mainWindow?.webContents.send('terminal:data', {
            id,
            data,
            type: 'output'
        })

        // Process shell integration sequences
        this.shellIntegration.processData(id, data)
    }

    private handleTerminalExit(id: string, exitCode: number, signal?: number) {
        const terminal = this.terminals.get(id)
        if (!terminal) return

        terminal.status = 'stopped'
        terminal.lastExitCode = exitCode

        const mainWindow = this.getMainWindow()
        mainWindow?.webContents.send('terminal:exit', {
            id,
            exitCode,
            signal,
            title: terminal.title
        })

        // Clean up after delay
        setTimeout(() => {
            this.terminals.delete(id)
            this.terminalHistory.delete(id)
        }, 30000) // Keep metadata for 30 seconds
    }

    async executeTask(options: {
        id: string
        command: string
        cwd?: string
        shell?: string
        env?: { [key: string]: string }
        languageId?: string
        taskType?: 'build' | 'test' | 'run' | 'debug'
    }): Promise<{ success: boolean; pid?: number; error?: string }> {
        // Create a task definition from the options
        const task = {
            id: options.id,
            label: options.command,
            type: 'shell' as const,
            command: options.command,
            cwd: options.cwd,
            env: options.env,
            group: options.taskType
        }

        return this.taskRunner.executeTask({
            id: options.id,
            task,
            terminalService: this,
            getMainWindow: this.getMainWindow
        })
    }

    async startDebugSession(options: {
        sessionId: string
        languageId: string
        program: string
        args?: string[]
        cwd?: string
        stopOnEntry?: boolean
    }): Promise<{ success: boolean; port?: number; error?: string }> {
        return this.languageGateway.startDebugSession(options)
    }

    async loadLanguageServer(options: {
        languageId: string
        workspacePath: string
        rootUri?: string
    }): Promise<{ success: boolean; sessionId?: string; error?: string }> {
        return this.languageGateway.loadLanguageServer(options)
    }

    // Getters and utility methods
    getTerminal(id: string): KalyntTerminal | undefined {
        return this.terminals.get(id)
    }

    getAllTerminals(): KalyntTerminal[] {
        return Array.from(this.terminals.values())
    }

    getTerminalHistory(id: string): string[] {
        return this.terminalHistory.get(id) || []
    }

    async writeToTerminal(id: string, data: string): Promise<boolean> {
        const terminal = this.terminals.get(id)
        if (!terminal) return false

        terminal.write(data)
        return true
    }

    async resizeTerminal(id: string, cols: number, rows: number): Promise<boolean> {
        const terminal = this.terminals.get(id)
        if (!terminal) return false

        try {
            terminal.resize(cols, rows)
            return true
        } catch (error) {
            console.error(`[Terminal] Resize error for ${id}:`, error)
            return false
        }
    }

    async killTerminal(id: string, signal?: string): Promise<boolean> {
        const terminal = this.terminals.get(id)
        if (!terminal) return false

        try {
            terminal.kill(signal as any)
            this.terminals.delete(id)
            this.terminalHistory.delete(id)
            return true
        } catch (error) {
            console.error(`[Terminal] Kill error for ${id}:`, error)
            return false
        }
    }

    async sendSignal(id: string, signal: string): Promise<boolean> {
        const terminal = this.terminals.get(id)
        if (!terminal) return false

        try {
            // On Unix systems, send signals
            if (process.platform !== 'win32') {
                process.kill(terminal.pid, signal as any)
            } else {
                // Windows doesn't support signals well, use kill
                terminal.kill()
            }
            return true
        } catch (error) {
            console.error(`[Terminal] Signal error for ${id}:`, error)
            return false
        }
    }

    async getTerminalInfo(id: string) {
        const terminal = this.terminals.get(id)
        if (!terminal) return null

        return {
            id: terminal.id,
            pid: terminal.pid,
            title: terminal.title,
            shell: terminal.shell,
            cwd: terminal.cwd,
            status: terminal.status,
            lastExitCode: terminal.lastExitCode,
            processType: terminal.processType,
            metadata: terminal.metadata ? JSON.parse(JSON.stringify(terminal.metadata)) : {},
            cols: (terminal as any)._cols,
            rows: (terminal as any)._rows
        }
    }

    async clearTerminalHistory(id: string): Promise<boolean> {
        if (!this.terminalHistory.has(id)) return false

        this.terminalHistory.set(id, [])
        return true
    }

    async forkTerminal(sourceId: string, newId: string): Promise<boolean> {
        const source = this.terminals.get(sourceId)
        if (!source) return false

        // Create a new terminal with same configuration
        return (await this.spawnTerminal({
            id: newId,
            shell: source.shell,
            cwd: source.cwd,
            env: source.env,
            title: `Fork of ${source.title}`,
            processType: source.processType,
            metadata: { ...source.metadata, forkedFrom: sourceId }
        })).success
    }

    async sendTerminalSequence(id: string, sequence: string): Promise<boolean> {
        const terminal = this.terminals.get(id)
        if (!terminal) return false

        // Handle special sequences
        switch (sequence) {
            case 'break':
                terminal.write('\x03') // Ctrl+C
                break
            case 'suspend':
                terminal.write('\x1a') // Ctrl+Z
                break
            case 'clear':
                terminal.write('\x1b[H\x1b[2J') // Clear screen
                break
            case 'reset':
                terminal.write('\x1bc') // Reset terminal
                break
            default:
                terminal.write(sequence)
        }

        return true
    }

    async broadcastToTerminals(data: string, filter?: (term: KalyntTerminal) => boolean): Promise<number> {
        let count = 0
        for (const [_id, terminal] of Array.from(this.terminals)) {
            if (!filter || filter(terminal)) {
                terminal.write(data)
                count++
            }
        }
        return count
    }

    // Advanced terminal operations
    async saveTerminalState(id: string): Promise<{ success: boolean; state?: any; error?: string }> {
        const terminal = this.terminals.get(id)
        if (!terminal) {
            return { success: false, error: 'Terminal not found' }
        }

        const state = {
            id: terminal.id,
            pid: terminal.pid,
            title: terminal.title,
            shell: terminal.shell,
            cwd: terminal.cwd,
            env: terminal.env,
            status: terminal.status,
            processType: terminal.processType,
            metadata: terminal.metadata,
            history: this.terminalHistory.get(id),
            timestamp: Date.now()
        }

        // Store in session manager
        this.sessionManager.saveSession(state.id)

        return { success: true, state }
    }

    async restoreTerminalState(state: any): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            // Create new terminal with saved state
            const result = await this.spawnTerminal({
                id: state.id || `restored-${Date.now()}`,
                shell: state.shell,
                cwd: state.cwd,
                env: state.env,
                title: state.title,
                processType: state.processType,
                metadata: state.metadata
            })

            if (result.success && state.history) {
                // Restore history
                this.terminalHistory.set(state.id, state.history)

                // Send history to renderer
                const mainWindow = this.getMainWindow()
                mainWindow?.webContents.send('terminal:history', {
                    id: state.id,
                    history: state.history
                })
            }

            return result
        } catch (error) {
            return { success: false, error: String(error) }
        }
    }

    public getDefaultShell(): string {
        const platform = process.platform

        // Windows shell detection
        if (platform === 'win32') {
            const windowsShells = [
                process.env.COMSPEC, // Usually C:\Windows\System32\cmd.exe
                'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
                'C:\\Windows\\System32\\cmd.exe',
                'C:\\Program Files\\PowerShell\\7\\pwsh.exe', // PowerShell 7
                'pwsh.exe', // PowerShell Core (if in PATH)
                'powershell.exe', // Windows PowerShell (if in PATH)
                'cmd.exe' // Fallback
            ]

            for (const shell of windowsShells) {
                if (!shell) continue

                // Check if it's a full path that exists
                if (shell.includes('\\') && fs.existsSync(shell)) {
                    return shell
                }

                // If it's just a name (like 'powershell.exe'), return it
                // node-pty will search in PATH
                if (!shell.includes('\\')) {
                    return shell
                }
            }

            return 'cmd.exe' // Ultimate fallback for Windows
        }

        // Unix/Linux/macOS shell detection
        const shells = [
            process.env.SHELL,
            '/bin/zsh',
            '/bin/bash',
            '/usr/bin/zsh',
            '/usr/bin/bash',
            '/usr/local/bin/zsh',
            '/usr/local/bin/bash',
            '/bin/sh'
        ]

        for (const shell of shells) {
            if (shell && fs.existsSync(shell)) {
                return shell
            }
        }

        return '/bin/sh'
    }

    // Cleanup all terminals
    dispose() {
        for (const [id, terminal] of Array.from(this.terminals)) {
            try {
                terminal.kill()
            } catch (error) {
                console.error(`[Terminal] Error killing terminal ${id}:`, error)
            }
        }

        this.terminals.clear()
        this.terminalHistory.clear()
        this.languageGateway.dispose()
        this.taskRunner.dispose()

        this.removeAllListeners()
    }
}

// Export factory function for easy initialization
export function createTerminalService(
    getMainWindow: () => BrowserWindow | null,
    getWorkspacePath: () => string | null
): TerminalService {
    return new TerminalService(getMainWindow, getWorkspacePath)
}