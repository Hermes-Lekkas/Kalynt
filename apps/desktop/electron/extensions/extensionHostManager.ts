/**
 * Extension Host Manager
 * Manages the extension host process and communication
 * Runs in the Electron main process
 */

import { fork, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { ipcMain, app, BrowserWindow } from 'electron'

// Extension metadata
export interface ExtensionMetadata {
  id: string
  name: string
  displayName: string
  version: string
  description: string
  publisher: string
  main?: string
  contributes: unknown
  activationEvents: string[]
  extensionPath: string
  isBuiltin: boolean
  isActive: boolean
}

// Extension contribution
export interface ExtensionContribution {
  commands?: Array<{
    command: string
    title: string
    category?: string
  }>
  menus?: Record<string, Array<{
    command: string
    when?: string
    group?: string
  }>>
  keybindings?: Array<{
    command: string
    key: string
    when?: string
  }>
  views?: Record<string, Array<{
    id: string
    name: string
    when?: string
  }>>
  configuration?: Record<string, unknown>
  themes?: Array<{
    label: string
    uiTheme: string
    path: string
  }>
}

interface ExtensionHostMessage {
  type: string
  payload?: unknown
  error?: string
}

interface ActiveExtension {
  metadata: ExtensionMetadata
  exports: unknown
  subscriptions: Array<{ dispose(): void }>
}

class ExtensionHostManager {
  private extensionHostProcess: ChildProcess | null = null
  private extensionsDir: string = ''
  private extensions: Map<string, ExtensionMetadata> = new Map()
  private activeExtensions: Map<string, ActiveExtension> = new Map()
  private loadedExtensions: Set<string> = new Set()
  private registeredCommands: Map<string, { extensionId: string; callback: (...args: unknown[]) => unknown }> = new Map()
  private isReady = false
  private messageQueue: Array<{ type: string; payload?: unknown; resolve?: (value: unknown) => void; reject?: (error: Error) => void }> = []
  private messageId = 0
  private pendingMessages: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map()

  constructor() {
    this.setupIPCHandlers()
  }

  private initExtensionsDir(): void {
    if (!this.extensionsDir) {
      this.extensionsDir = path.join(app.getPath('userData'), 'extensions')
      if (!fs.existsSync(this.extensionsDir)) {
        fs.mkdirSync(this.extensionsDir, { recursive: true })
      }
    }
  }

  async start(): Promise<void> {
    this.initExtensionsDir()
    if (this.extensionHostProcess) {
      return
    }

    return new Promise((resolve, reject) => {
      const hostScriptPath = path.join(__dirname, 'extensionHostProcess.js')
      
      if (!fs.existsSync(hostScriptPath)) {
        reject(new Error(`Extension host script not found: ${hostScriptPath}`))
        return
      }

      this.extensionHostProcess = fork(hostScriptPath, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
          KALYNT_EXTENSION_HOST: 'true'
        }
      })

      this.extensionHostProcess.on('message', (message: ExtensionHostMessage) => {
        this.handleHostMessage(message)
      })

      this.extensionHostProcess.on('error', (error) => {
        console.error('[ExtensionHost] Process error:', error)
        reject(error)
      })

      this.extensionHostProcess.on('exit', (code) => {
        console.log(`[ExtensionHost] Process exited with code ${code}`)
        this.extensionHostProcess = null
        this.isReady = false
      })

      // Wait for ready signal
      const checkReady = setInterval(() => {
        if (this.isReady) {
          clearInterval(checkReady)
          resolve()
        }
      }, 100)

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkReady)
        if (!this.isReady) {
          reject(new Error('Extension host failed to start within 10 seconds'))
        }
      }, 10000)
    })
  }

  async stop(): Promise<void> {
    if (!this.extensionHostProcess) {
      return
    }

    const activeIds = Array.from(this.activeExtensions.keys())
    for (const id of activeIds) {
      await this.deactivateExtension(id)
    }

    // Dispose the extension host
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.extensionHostProcess) {
          this.extensionHostProcess.kill('SIGTERM')
        }
        resolve()
      }, 5000)

      this.sendMessage({ type: 'dispose' })

      this.extensionHostProcess?.on('exit', () => {
        clearTimeout(timeout)
        this.extensionHostProcess = null
        this.isReady = false
        resolve()
      })
    })
  }

  private handleHostMessage(message: ExtensionHostMessage): void {
    switch (message.type) {
      case 'ready':
        this.isReady = true
        this.flushMessageQueue()
        break

      case 'extension-loaded':
        this.handleExtensionLoaded(message.payload as { id: string; manifest: unknown })
        break

      case 'extension-activated':
        this.handleExtensionActivated(message.payload as { id: string; exports: unknown })
        break

      case 'extension-deactivated':
        this.handleExtensionDeactivated(message.payload as { id: string })
        break

      case 'register-command':
        this.handleRegisterCommand(message.payload as { extensionId: string; command: string })
        break

      case 'execute-command': {
        const execPayload = message.payload as { command: string; args: unknown[]; messageId?: number }
        this.handleExecuteCommand(execPayload)
        break
      }

      case 'show-message':
        this.handleShowMessage(message.payload as { type: string; message: string; extensionId: string })
        break

      case 'error':
        console.error('[ExtensionHost] Error:', message.error)
        break

      default:
        console.warn('[ExtensionHost] Unknown message type:', message.type)
    }
  }

  private handleExtensionLoaded(payload: { id: string; manifest: unknown }): void {
    const extension = this.extensions.get(payload.id)
    if (extension) {
      console.log(`[ExtensionHost] Extension loaded: ${payload.id}`)
    }
  }

  private handleExtensionActivated(payload: { id: string; exports: unknown }): void {
    const metadata = this.extensions.get(payload.id)
    if (metadata) {
      metadata.isActive = true
      this.activeExtensions.set(payload.id, {
        metadata,
        exports: payload.exports,
        subscriptions: []
      })
      
      // Notify renderer
      this.notifyRenderer('activated', { id: payload.id })
    }
  }

  private handleExtensionDeactivated(payload: { id: string }): void {
    const metadata = this.extensions.get(payload.id)
    if (metadata) {
      metadata.isActive = false
      this.activeExtensions.delete(payload.id)
      
      const commandEntries = Array.from(this.registeredCommands.entries())
      for (const [command, info] of commandEntries) {
        if (info.extensionId === payload.id) {
          this.registeredCommands.delete(command)
        }
      }
      
      // Notify renderer
      this.notifyRenderer('deactivated', { id: payload.id })
    }
  }

  private handleRegisterCommand(payload: { extensionId: string; command: string }): void {
    this.registeredCommands.set(payload.command, {
      extensionId: payload.extensionId,
      callback: async (...args: unknown[]) => {
        // Forward command execution to extension host
        this.sendMessage({
          type: 'invoke-command',
          payload: { extensionId: payload.extensionId, command: payload.command, args }
        })
      }
    })
  }

  private handleExecuteCommand(payload: { command: string; args: unknown[]; messageId?: number }): void {
    const commandInfo = this.registeredCommands.get(payload.command)
    let result: unknown = undefined
    if (commandInfo) {
      result = commandInfo.callback(...payload.args)
    } else {
      result = this.executeMainCommand(payload.command, payload.args)
    }

    if (payload.messageId !== undefined) {
      Promise.resolve(result).then((resolvedResult) => {
        this.sendMessage({
          type: 'command-result',
          payload: { messageId: payload.messageId, result: resolvedResult }
        })
      })
    }
  }

  private executeMainCommand(command: string, _args: unknown[]): unknown {
    switch (command) {
      case 'workbench.action.reloadWindow':
        BrowserWindow.getAllWindows().forEach(win => win.reload())
        return true
      default:
        console.warn(`[ExtensionHost] Unknown command: ${command}`)
        return undefined
    }
  }

  private handleShowMessage(payload: { type: string; message: string; extensionId: string }): void {
    // Forward to renderer process
    this.notifyRenderer('show-message', payload)
  }

  private notifyRenderer(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send(`extension:${channel}`, data)
    })
  }

  private sendMessage(message: { type: string; payload?: unknown }): void {
    if (this.extensionHostProcess?.connected) {
      this.extensionHostProcess.send(message)
    } else {
      this.messageQueue.push(message)
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      if (message) {
        this.extensionHostProcess?.send(message)
      }
    }
  }

  // Public API

  async scanExtensions(): Promise<ExtensionMetadata[]> {
    const extensions: ExtensionMetadata[] = []

    try {
      const entries = fs.readdirSync(this.extensionsDir)
      
      for (const entry of entries) {
        const extensionPath = path.join(this.extensionsDir, entry)
        const stat = fs.statSync(extensionPath)

        if (!stat.isDirectory()) continue

        const packageJsonPath = path.join(extensionPath, 'package.json')
        if (!fs.existsSync(packageJsonPath)) continue

        try {
          const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
          
          if (!manifest.engines?.vscode) continue

          const metadata: ExtensionMetadata = {
            id: `${manifest.publisher}.${manifest.name}`,
            name: manifest.name,
            displayName: manifest.displayName || manifest.name,
            version: manifest.version,
            description: manifest.description || '',
            publisher: manifest.publisher || 'unknown',
            main: manifest.main || 'index.js',
            contributes: manifest.contributes || {},
            activationEvents: manifest.activationEvents || [],
            extensionPath,
            isBuiltin: false,
            isActive: false
          }

          this.extensions.set(metadata.id, metadata)
          extensions.push(metadata)
        } catch (error) {
          console.error(`[ExtensionHost] Failed to load extension ${entry}:`, error)
        }
      }
    } catch (error) {
      console.error('[ExtensionHost] Failed to scan extensions:', error)
    }

    return extensions
  }

  async loadExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id)
    if (!extension) {
      throw new Error(`Extension not found: ${id}`)
    }

    if (this.loadedExtensions.has(id)) {
      return // Already loaded
    }

    this.sendMessage({
      type: 'load-extension',
      payload: { id, path: extension.extensionPath }
    })

    this.loadedExtensions.add(id)
  }

  async activateExtension(id: string): Promise<unknown> {
    const extension = this.extensions.get(id)
    if (!extension) {
      throw new Error(`Extension not found: ${id}`)
    }

    if (extension.isActive) {
      return this.activeExtensions.get(id)?.exports
    }

    // Ensure extension is loaded first
    if (!this.loadedExtensions.has(id)) {
      console.log(`[ExtensionHost] Loading extension before activation: ${id}`)
      await this.loadExtension(id)
      // Wait a bit for the extension to be loaded
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Extension activation timeout: ${id}`))
      }, 30000)

      const checkActivated = setInterval(() => {
        if (extension.isActive) {
          clearInterval(checkActivated)
          clearTimeout(timeout)
          resolve(this.activeExtensions.get(id)?.exports)
        }
      }, 100)

      this.sendMessage({
        type: 'activate-extension',
        payload: { id }
      })
    })
  }

  async deactivateExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id)
    if (!extension || !extension.isActive) {
      return
    }

    this.sendMessage({
      type: 'deactivate-extension',
      payload: { id }
    })

    // Update local state
    extension.isActive = false
    this.activeExtensions.delete(id)
  }

  async installExtension(vsixPath: string): Promise<ExtensionMetadata> {
    // Check if file exists
    if (!fs.existsSync(vsixPath)) {
      throw new Error(`VSIX file not found: ${vsixPath}`)
    }

    // Check file size
    const stats = fs.statSync(vsixPath)
    if (stats.size < 100) {
      throw new Error(`VSIX file is too small (${stats.size} bytes). The file may be corrupted or the download failed.`)
    }

    console.log(`[ExtensionHost] Installing extension from ${vsixPath} (${stats.size} bytes)`)

    // Extract VSIX file
    let extract
    try {
      extract = await import('extract-zip')
    } catch (e) {
      throw new Error(`Failed to load extract-zip module: ${e}`)
    }

    // Use a temporary directory for extraction
    const tempDir = path.join(os.tmpdir(), `kalynt-ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
    fs.mkdirSync(tempDir, { recursive: true })

    let extensionId: string

    try {
      await extract.default(vsixPath, { dir: tempDir })

      // The extension files are inside 'extension' folder in VSIX
      const sourceExtensionDir = path.join(tempDir, 'extension')
      if (!fs.existsSync(sourceExtensionDir)) {
        throw new Error('Invalid VSIX: missing "extension" folder')
      }

      // Read package.json to get the correct ID
      const packageJsonPath = path.join(sourceExtensionDir, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('Invalid VSIX: missing package.json')
      }

      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (!manifest.name || !manifest.publisher) {
        throw new Error('Invalid VSIX: manifest missing name or publisher')
      }

      extensionId = `${manifest.publisher}.${manifest.name}`
      const targetDir = path.join(this.extensionsDir, extensionId)

      // Remove existing extension if it exists
      if (fs.existsSync(targetDir)) {
        console.log(`[ExtensionHost] Removing existing extension at ${targetDir}`)
        // Deactivate first if active
        if (this.extensions.has(extensionId) && this.extensions.get(extensionId)?.isActive) {
          await this.deactivateExtension(extensionId)
        }
        fs.rmSync(targetDir, { recursive: true, force: true })
      }

      // Move files from temp/extension to targetDir
      // We use fs.cpSync and fs.rmSync because renameSync fails across different drives/partitions
      fs.cpSync(sourceExtensionDir, targetDir, { recursive: true })
      
    } catch (e: any) {
      throw new Error(`Failed to install extension: ${e.message}`)
    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (cleanupError) {
          console.warn('[ExtensionHost] Failed to clean up temp dir:', cleanupError)
        }
      }
    }

    // Reload extension list
    await this.scanExtensions()
    
    // Find the installed extension by ID
    const extension = this.extensions.get(extensionId)
    if (!extension) {
      throw new Error(`Failed to verify installation of extension ${extensionId}`)
    }

    return extension
  }

  async uninstallExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id)
    if (!extension) {
      throw new Error(`Extension not found: ${id}`)
    }

    // Deactivate if active
    if (extension.isActive) {
      await this.deactivateExtension(id)
    }

    // Remove extension directory
    if (fs.existsSync(extension.extensionPath)) {
      fs.rmSync(extension.extensionPath, { recursive: true, force: true })
    }

    this.extensions.delete(id)
    this.loadedExtensions.delete(id)
    this.activeExtensions.delete(id)
  }

  getExtensions(): ExtensionMetadata[] {
    return Array.from(this.extensions.values())
  }

  getActiveExtensions(): ExtensionMetadata[] {
    return Array.from(this.activeExtensions.values()).map(e => e.metadata)
  }

  getExtension(id: string): ExtensionMetadata | undefined {
    return this.extensions.get(id)
  }

  getContributions(): ExtensionContribution {
    const contributions: ExtensionContribution = {
      commands: [],
      menus: {},
      keybindings: [],
      views: {},
      configuration: {},
      themes: []
    }

    const allExtensions = Array.from(this.extensions.values())
    for (const extension of allExtensions) {
      const contributes = extension.contributes as ExtensionContribution | undefined
      if (!contributes) continue

      if (contributes.commands) {
        contributions.commands!.push(...contributes.commands.map(cmd => ({
          ...cmd,
          extensionId: extension.id
        })))
      }

      if (contributes.menus) {
        for (const [menu, items] of Object.entries(contributes.menus)) {
          if (!contributions.menus![menu]) {
            contributions.menus![menu] = []
          }
          contributions.menus![menu].push(...items)
        }
      }

      if (contributes.keybindings) {
        contributions.keybindings!.push(...contributes.keybindings)
      }

      if (contributes.views) {
        for (const [container, views] of Object.entries(contributes.views)) {
          if (!contributions.views![container]) {
            contributions.views![container] = []
          }
          contributions.views![container].push(...views)
        }
      }

      // Collect themes
      if (contributes.themes) {
        contributions.themes!.push(...contributes.themes.map(theme => ({
          ...theme,
          extensionId: extension.id,
          extensionPath: extension.extensionPath
        })))
      }
    }

    return contributions
  }

  // Download extension from URL (bypasses CORS by downloading in main process)
  async downloadFromUrl(url: string, targetPath: string): Promise<void> {
    console.log(`[ExtensionHost] Starting download from ${url}`)
    
    return new Promise((resolve, reject) => {
      const https = require('https')
      const http = require('http')
      
      const download = (downloadUrl: string, redirectCount: number = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'))
          return
        }
        
        console.log(`[ExtensionHost] Downloading from: ${downloadUrl}`)
        const protocol = downloadUrl.startsWith('https:') ? https : http
        
        const request = protocol.get(downloadUrl, (response: any) => {
          console.log(`[ExtensionHost] Response status: ${response.statusCode}`)
          
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log('[ExtensionHost] Following redirect to:', response.headers.location)
            
            // Check if redirect is to /error (extension not found)
            if (response.headers.location === '/error' || response.headers.location.includes('/error')) {
              reject(new Error('Extension not found on Open VSX. The extension may not exist or may have been removed.'))
              return
            }
            
            // Handle relative redirects
            let redirectUrl = response.headers.location
            if (redirectUrl.startsWith('/')) {
              const urlObj = new URL(downloadUrl)
              redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`
            }
            
            download(redirectUrl, redirectCount + 1)
            return
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`))
            return
          }
          
          // Ensure directory exists
          const dir = path.dirname(targetPath)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          
          const fileStream = fs.createWriteStream(targetPath)
          let downloadedBytes = 0
          
          response.pipe(fileStream)
          
          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
          })
          
          fileStream.on('finish', () => {
            fileStream.close()
            console.log(`[ExtensionHost] Downloaded ${downloadedBytes} bytes to ${targetPath}`)
            resolve()
          })
          
          fileStream.on('error', (err: Error) => {
            fs.unlinkSync(targetPath)
            reject(err)
          })
        })
        
        request.on('error', (err: Error) => {
          reject(err)
        })
        
        request.setTimeout(30000, () => {
          request.destroy()
          reject(new Error('Download timeout'))
        })
      }
      
      download(url)
    })
  }

  // IPC Handlers
  private setupIPCHandlers(): void {
    ipcMain.handle('extensions:scan', async () => {
      return this.scanExtensions()
    })

    ipcMain.handle('extensions:activate', async (_, id: string) => {
      return this.activateExtension(id)
    })

    ipcMain.handle('extensions:deactivate', async (_, id: string) => {
      await this.deactivateExtension(id)
    })

    ipcMain.handle('extensions:install', async (_, vsixPath: string) => {
      return this.installExtension(vsixPath)
    })

    ipcMain.handle('extensions:uninstall', async (_, id: string) => {
      await this.uninstallExtension(id)
    })

    ipcMain.handle('extensions:list', async () => {
      return this.getExtensions()
    })

    ipcMain.handle('extensions:active', async () => {
      return this.getActiveExtensions()
    })

    ipcMain.handle('extensions:contributions', async () => {
      return this.getContributions()
    })

    ipcMain.handle('extensions:start-host', async () => {
      await this.start()
    })

    ipcMain.handle('extensions:stop-host', async () => {
      await this.stop()
    })

    ipcMain.handle('extensions:download', async (_, url: string, targetPath: string) => {
      await this.downloadFromUrl(url, targetPath)
    })
  }
}

// Singleton instance
export const extensionHostManager = new ExtensionHostManager()
export default extensionHostManager
