/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Import services
import { RuntimeManager } from './services/runtime-manager'

// Import handlers
import { registerAppInfoHandlers } from './handlers/app-info'
import { registerRuntimeHandlers } from './handlers/runtime'
import { registerTerminalHandlers } from './handlers/terminal'
import { registerGitHandlers } from './handlers/git'
import { registerFileSystemHandlers } from './handlers/file-system'
import { registerCodeExecutionHandlers } from './handlers/code-execution'
import { registerModelDownloadHandlers } from './handlers/model-download'
import { registerLLMInferenceHandlers } from './handlers/llm-inference'
import { registerSafeStorageHandlers } from './handlers/safeStorage'
import { registerNukeHandlers } from './handlers/nuke-handler'
import { registerDependencyHandlers } from './handlers/dependency'
import { setupBuildHandlers } from './handlers/build'
import { setupDebugHandlers } from './handlers/debug'
import { registerUpdateHandlers, initializeAutoUpdater } from './handlers/update-handler'

// Window and workspace state
let mainWindow: BrowserWindowType | null = null
let currentWorkspacePath: string | null = null

// Environment
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Directory constants (initialized after app is ready)
let MODELS_DIR: string
let RUNTIMES_DIR: string

// Initialize services (will be set after app is ready)
let runtimeManager: RuntimeManager

// Ensure models directory exists
function ensureModelsDir() {
    try {
        fs.mkdirSync(MODELS_DIR, { recursive: true })
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
            console.error('[Main] Failed to ensure models dir:', err)
        }
    }
}

// Ensure runtimes directory exists
function ensureRuntimesDir() {
    try {
        fs.mkdirSync(RUNTIMES_DIR, { recursive: true })
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
            console.error('[Main] Failed to ensure runtimes dir:', err)
        }
    }
}

// Window management
function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        ...(process.platform === 'darwin' && { trafficLightPosition: { x: 16, y: 16 } }),
        icon: path.join(__dirname, VITE_DEV_SERVER_URL ? '../public/Kalynt_256x256.ico' : '../dist/Kalynt_256x256.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        transparent: true,
        backgroundColor: '#00000000',
        show: false
    })

    mainWindow = win

    win.once('ready-to-show', () => {
        win.show()
    })

    if (VITE_DEV_SERVER_URL) {
        void win.loadURL(VITE_DEV_SERVER_URL)
        win.webContents.openDevTools()
    } else {
        void win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    win.on('closed', () => {
        mainWindow = null
    })
}

// Register all IPC handlers
function registerAllHandlers() {
    // App info and hardware
    registerAppInfoHandlers(ipcMain, app, MODELS_DIR)

    // Runtime management
    registerRuntimeHandlers(ipcMain, runtimeManager)

    // Terminal operations
    registerTerminalHandlers(
        ipcMain,
        () => mainWindow,
        () => currentWorkspacePath
    )

    // Git operations
    registerGitHandlers(ipcMain, () => currentWorkspacePath)

    // File system operations
    registerFileSystemHandlers(
        ipcMain,
        dialog,
        () => mainWindow,
        () => currentWorkspacePath,
        (path) => currentWorkspacePath = path,
        () => MODELS_DIR
    )

    // Code execution
    registerCodeExecutionHandlers(
        ipcMain,
        app,
        () => mainWindow,
        () => currentWorkspacePath
    )

    // Model downloads
    registerModelDownloadHandlers(
        ipcMain,
        () => mainWindow,
        () => MODELS_DIR
    )

    // LLM inference
    registerLLMInferenceHandlers(ipcMain, () => MODELS_DIR)

    // Secure storage for API keys
    registerSafeStorageHandlers(ipcMain, () => app.getPath('userData'))

    // Nuke Button (Emergency Process Cleanup)
    registerNukeHandlers()

    // Dependency management (npm, pip, cargo, etc.)
    registerDependencyHandlers(() => mainWindow)

    // Build/Task system
    setupBuildHandlers(ipcMain, () => mainWindow, () => currentWorkspacePath)

    // Debug system
    setupDebugHandlers(ipcMain, () => mainWindow, () => currentWorkspacePath)

    // Auto-update system
    registerUpdateHandlers(ipcMain, () => mainWindow)

    // Window controls
    ipcMain.handle('minimize-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize()
        }
    })

    ipcMain.handle('maximize-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }
    })

    ipcMain.handle('close-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close()
        }
    })
}

// App lifecycle
// Register protocol client
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('kalynt', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('kalynt')
}

// Force Single Instance Application
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()

            // Handle deep link on Windows/Linux
            const deepLink = commandLine.find((arg) => arg.startsWith('kalynt://'))
            if (deepLink) {
                mainWindow.webContents.send('deep-link', deepLink)
            }
        }
    })

    app.whenReady().then(() => {
        // Initialize directory paths
        MODELS_DIR = path.join(app.getPath('userData'), 'models')
        RUNTIMES_DIR = path.join(app.getPath('userData'), 'runtimes')

        // Initialize services
        runtimeManager = new RuntimeManager(RUNTIMES_DIR)

        ensureModelsDir()
        ensureRuntimesDir()
        createWindow()
        registerAllHandlers()

        // Initialize auto-updater (after window is created)
        if (mainWindow) {
            initializeAutoUpdater(mainWindow).catch(err => {
                console.error('[Main] Failed to initialize auto-updater:', err)
            })
        }
    })
}

// Handle deep link on macOS
app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        mainWindow.webContents.send('deep-link', url)
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
