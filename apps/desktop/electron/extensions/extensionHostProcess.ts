/**
 * Extension Host Process
 * Runs in a separate Node.js process to isolate extensions from the main application
 * Based on VS Code's Extension Host architecture
 */

import * as path from 'path'
import * as fs from 'fs'
import { fork, ChildProcess } from 'child_process'

// Message types for communication with main process
interface HostMessage {
  type: string
  payload?: unknown
  error?: string
}

interface ExtensionModule {
  activate?: (context: ExtensionContext) => Promise<unknown> | unknown
  deactivate?: () => Promise<void> | void
}

interface ExtensionContext {
  subscriptions: Array<{ dispose(): void }>
  extensionPath: string
  asAbsolutePath: (relativePath: string) => string
  storagePath: string
  globalStoragePath: string
  logPath: string
}

class ExtensionHost {
  private extensions: Map<string, {
    module: ExtensionModule
    context: ExtensionContext
    manifest: unknown
    exports: unknown
  }> = new Map()

  private extensionPaths: Map<string, string> = new Map()

  constructor() {
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    process.on('message', async (message: HostMessage) => {
      try {
        switch (message.type) {
          case 'load-extension':
            await this.handleLoadExtension(message.payload as { id: string; path: string })
            break
          case 'activate-extension':
            await this.handleActivateExtension(message.payload as { id: string })
            break
          
          case 'deactivate-extension':
            await this.handleDeactivateExtension(message.payload as { id: string })
            break
          case 'invoke-api':
            await this.handleInvokeAPI(message.payload as { extensionId: string; api: string; args: unknown[] })
            break
          case 'dispose':
            await this.dispose()
            break
          default:
            this.sendError('unknown-message-type', `Unknown message type: ${message.type}`)
        }
      } catch (error) {
        this.sendError('handler-error', error instanceof Error ? error.message : String(error))
      }
    })

    // Signal ready to main process
    this.sendMessage({ type: 'ready' })
  }

  private async handleLoadExtension(payload: { id: string; path: string }): Promise<void> {
    const { id, path: extensionPath } = payload

    try {
      // Validate extension path
      if (!fs.existsSync(extensionPath)) {
        throw new Error(`Extension path does not exist: ${extensionPath}`)
      }

      // Read package.json
      const packageJsonPath = path.join(extensionPath, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`Extension missing package.json: ${extensionPath}`)
      }

      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // Validate it's a VS Code compatible extension
      if (!manifest.engines?.vscode) {
        throw new Error(`Extension ${id} is not VS Code compatible (missing engines.vscode)`)
      }

      // Store extension path
      this.extensionPaths.set(id, extensionPath)

      this.sendMessage({
        type: 'extension-loaded',
        payload: { id, manifest }
      })
    } catch (error) {
      this.sendError('load-extension-failed', `Failed to load extension ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async handleActivateExtension(payload: { id: string }): Promise<void> {
    const { id } = payload
    const extensionPath = this.extensionPaths.get(id)

    if (!extensionPath) {
      this.sendError('activate-failed', `Extension ${id} not loaded`)
      return
    }

    try {
      // Check if already activated
      if (this.extensions.has(id)) {
        this.sendMessage({
          type: 'extension-activated',
          payload: { id, exports: this.extensions.get(id)?.exports }
        })
        return
      }

      // Read manifest to find main entry point
      const packageJsonPath = path.join(extensionPath, 'package.json')
      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const mainFile = manifest.main || 'index.js'
      const mainPath = path.join(extensionPath, mainFile)

      if (!fs.existsSync(mainPath)) {
        throw new Error(`Extension main file not found: ${mainPath}`)
      }

      // Create extension context
      const context: ExtensionContext = {
        subscriptions: [],
        extensionPath,
        asAbsolutePath: (relativePath: string) => path.join(extensionPath, relativePath),
        storagePath: path.join(extensionPath, '.kalynt', 'workspace-storage'),
        globalStoragePath: path.join(extensionPath, '.kalynt', 'global-storage'),
        logPath: path.join(extensionPath, '.kalynt', 'logs')
      }

      // Create a minimal vscode API
      const vscode = this.createVSCodeAPI(id, context)

      // Clear require cache to allow reload
      delete require.cache[require.resolve(mainPath)]

      // Load the extension module
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const extensionModule: ExtensionModule = require(mainPath)

      // Call activate if it exists
      let exports: unknown
      if (typeof extensionModule.activate === 'function') {
        exports = await Promise.resolve(extensionModule.activate(context))
      }

      // Store extension
      this.extensions.set(id, {
        module: extensionModule,
        context,
        manifest,
        exports
      })

      this.sendMessage({
        type: 'extension-activated',
        payload: { id, exports }
      })
    } catch (error) {
      this.sendError('activate-failed', `Failed to activate extension ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async handleDeactivateExtension(payload: { id: string }): Promise<void> {
    const { id } = payload
    const extension = this.extensions.get(id)

    if (!extension) {
      this.sendError('deactivate-failed', `Extension ${id} not activated`)
      return
    }

    try {
      // Call deactivate if it exists
      if (typeof extension.module.deactivate === 'function') {
        await Promise.resolve(extension.module.deactivate())
      }

      // Dispose all subscriptions
      for (const subscription of extension.context.subscriptions) {
        try {
          subscription.dispose()
        } catch (error) {
          console.error(`Error disposing subscription for ${id}:`, error)
        }
      }

      // Remove extension
      this.extensions.delete(id)

      this.sendMessage({
        type: 'extension-deactivated',
        payload: { id }
      })
    } catch (error) {
      this.sendError('deactivate-failed', `Failed to deactivate extension ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async handleInvokeAPI(payload: { extensionId: string; api: string; args: unknown[] }): Promise<void> {
    const { extensionId, api, args } = payload
    const extension = this.extensions.get(extensionId)

    if (!extension) {
      this.sendError('invoke-failed', `Extension ${extensionId} not activated`)
      return
    }

    // API invocation would go here for specific extension APIs
    this.sendMessage({
      type: 'api-result',
      payload: { extensionId, api, result: null }
    })
  }

  private createVSCodeAPI(extensionId: string, context: ExtensionContext): unknown {
    // Create a minimal vscode API compatible with VS Code extensions
    // This is a simplified version - full implementation would be much larger
    return {
      version: '1.85.0',
      
      // Extension context
      extension: {
        id: extensionId,
        extensionPath: context.extensionPath,
        extensionUri: { fsPath: context.extensionPath },
        packageJSON: {}
      },

      // Commands
      commands: {
        registerCommand: (command: string, callback: (...args: unknown[]) => unknown) => {
          this.sendMessage({
            type: 'register-command',
            payload: { extensionId, command }
          })
          
          const disposable = {
            dispose: () => {
              this.sendMessage({
                type: 'unregister-command',
                payload: { extensionId, command }
              })
            }
          }
          
          context.subscriptions.push(disposable)
          return disposable
        },
        executeCommand: (command: string, ...args: unknown[]) => {
          return new Promise((resolve) => {
            this.sendMessage({
              type: 'execute-command',
              payload: { command, args },
              callback: (result: unknown) => resolve(result)
            })
          })
        }
      },

      // Window
      window: {
        showInformationMessage: (message: string) => {
          this.sendMessage({
            type: 'show-message',
            payload: { type: 'info', message, extensionId }
          })
        },
        showWarningMessage: (message: string) => {
          this.sendMessage({
            type: 'show-message',
            payload: { type: 'warning', message, extensionId }
          })
        },
        showErrorMessage: (message: string) => {
          this.sendMessage({
            type: 'show-message',
            payload: { type: 'error', message, extensionId }
          })
        }
      },

      // Workspace
      workspace: {
        getConfiguration: (section?: string) => ({
          get: (key: string, defaultValue?: unknown) => defaultValue,
          update: async () => {}
        }),
        onDidChangeConfiguration: {
          event: () => ({ dispose: () => {} })
        }
      },

      // Languages
      languages: {
        registerCompletionItemProvider: () => {
          const disposable = { dispose: () => {} }
          context.subscriptions.push(disposable)
          return disposable
        }
      },

      // Debug
      debug: {
        registerDebugConfigurationProvider: () => {
          const disposable = { dispose: () => {} }
          context.subscriptions.push(disposable)
          return disposable
        }
      },

      // Environment
      env: {
        appName: 'Kalynt',
        appRoot: context.extensionPath,
        language: 'en',
        machineId: 'unknown',
        sessionId: 'unknown',
        shell: process.platform === 'win32' ? 'powershell' : 'bash'
      },

      // URI
      Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
        parse: (uri: string) => ({ fsPath: uri, scheme: 'file' })
      },

      // Disposable
      Disposable: {
        from: (...disposables: Array<{ dispose(): void }>) => ({
          dispose: () => disposables.forEach(d => d.dispose())
        })
      },

      // Event
      EventEmitter: class<T> {
        private listeners: Array<(e: T) => void> = []
        
        get event() {
          return (listener: (e: T) => void) => {
            this.listeners.push(listener)
            return {
              dispose: () => {
                const index = this.listeners.indexOf(listener)
                if (index > -1) this.listeners.splice(index, 1)
              }
            }
          }
        }
        
        fire(data: T): void {
          this.listeners.forEach(listener => listener(data))
        }
        
        dispose(): void {
          this.listeners = []
        }
      }
    }
  }

  private async dispose(): Promise<void> {
    // Deactivate all extensions
    for (const [id] of this.extensions) {
      await this.handleDeactivateExtension({ id })
    }

    this.extensions.clear()
    this.extensionPaths.clear()

    this.sendMessage({ type: 'disposed' })
    process.exit(0)
  }

  private sendMessage(message: HostMessage): void {
    if (process.send) {
      process.send(message)
    }
  }

  private sendError(code: string, message: string): void {
    this.sendMessage({
      type: 'error',
      error: `${code}: ${message}`
    })
  }
}

// Start the extension host
new ExtensionHost()
