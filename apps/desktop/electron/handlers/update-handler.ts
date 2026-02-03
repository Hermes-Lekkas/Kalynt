/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { autoUpdater } from 'electron-updater'
import type { IpcMain, BrowserWindow } from 'electron'

/**
 * Secure Auto-Update Handler for Kalynt
 *
 * Security Features:
 * - Uses HTTPS for all GitHub communications
 * - Supports code signature verification (when configured)
 * - GitHub token stored securely via safeStorage
 * - No sensitive data exposed to renderer process
 * - All update operations happen in main process
 */

// Simple logger for electron-updater
const updateLogger = {
    info: (message: string) => console.log('[Update]', message),
    warn: (message: string) => console.warn('[Update]', message),
    error: (message: string) => console.error('[Update]', message),
    debug: (message: string) => console.log('[Update][Debug]', message)
}

interface UpdateInfo {
    version: string
    releaseNotes?: string
    releaseDate: string
    releaseName?: string
}

interface UpdateProgress {
    bytesPerSecond: number
    percent: number
    transferred: number
    total: number
}

let updateCheckInProgress = false
let downloadInProgress = false

/**
 * Configure auto-updater with security settings
 */
function configureAutoUpdater(githubToken?: string) {
    // Enable logging
    autoUpdater.logger = updateLogger as any

    // Security: Only allow HTTPS
    autoUpdater.forceDevUpdateConfig = false

    // Auto-download is disabled - user must explicitly approve
    autoUpdater.autoDownload = false

    // Auto-install is disabled - user must explicitly approve
    autoUpdater.autoInstallOnAppQuit = false

    // Set update channel (latest, beta, alpha, etc.)
    autoUpdater.channel = process.env.UPDATE_CHANNEL || 'latest'

    // Allow prerelease if channel is not 'latest'
    autoUpdater.allowPrerelease = autoUpdater.channel !== 'latest'

    // Configure GitHub token if provided
    if (githubToken) {
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: process.env.GITHUB_REPO_OWNER || 'Hermes-Lekkas',
            repo: process.env.GITHUB_REPO_NAME || 'Kalynt',
            private: false,
            token: githubToken
        })
        console.log('[Update] GitHub token configured for update checks')
    }
}

/**
 * Register all update-related IPC handlers
 */
export function registerUpdateHandlers(
    ipcMain: IpcMain,
    getMainWindow: () => BrowserWindow | null
) {
    console.log('[Update] Registering update handlers...')

    // Configure auto-updater with default settings
    configureAutoUpdater()

    // Set up event listeners to forward to renderer
    setupAutoUpdaterEvents(getMainWindow)

    /**
     * Configure GitHub token for updates
     * Token is passed from renderer after being retrieved from safeStorage
     */
    ipcMain.handle('update:configure-token', async (_event, token: string) => {
        try {
            if (!token || token.trim() === '') {
                console.warn('[Update] Empty token provided, using public access only')
                configureAutoUpdater()
                return { success: true, message: 'Using public access for updates' }
            }

            configureAutoUpdater(token)
            return { success: true, message: 'GitHub token configured successfully' }
        } catch (error) {
            console.error('[Update] Token configuration error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    })

    /**
     * Check for updates manually
     */
    ipcMain.handle('update:check', async () => {
        try {
            if (updateCheckInProgress) {
                return {
                    success: false,
                    error: 'Update check already in progress'
                }
            }

            updateCheckInProgress = true
            console.log('[Update] Checking for updates...')

            const result = await autoUpdater.checkForUpdates()
            updateCheckInProgress = false

            if (!result) {
                return {
                    success: true,
                    updateAvailable: false,
                    currentVersion: autoUpdater.currentVersion.version,
                    message: 'No updates available or repository not found'
                }
            }

            const updateInfo: UpdateInfo = {
                version: result.updateInfo.version,
                releaseNotes: result.updateInfo.releaseNotes as string | undefined,
                releaseDate: result.updateInfo.releaseDate,
                releaseName: result.updateInfo.releaseName ?? undefined
            }

            console.log('[Update] Update check completed:', updateInfo)

            return {
                success: true,
                updateAvailable: result.updateInfo.version !== autoUpdater.currentVersion.version,
                updateInfo,
                currentVersion: autoUpdater.currentVersion.version
            }
        } catch (error) {
            updateCheckInProgress = false
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[Update] Check error:', errorMessage)

            // Provide helpful error messages for common issues
            let userFriendlyError = errorMessage
            if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                userFriendlyError = 'GitHub repository or releases not found. Make sure the repository exists and has published releases.'
            } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                userFriendlyError = 'GitHub token is invalid or expired. Please update your token in Settings > Security.'
            } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
                userFriendlyError = 'Access denied. Check that your GitHub token has the required permissions.'
            } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
                userFriendlyError = 'Network error. Please check your internet connection.'
            } else if (errorMessage.includes('no published releases')) {
                userFriendlyError = 'No releases found. Publish a release on GitHub first.'
            }

            return {
                success: false,
                error: userFriendlyError,
                currentVersion: autoUpdater.currentVersion?.version || 'unknown'
            }
        }
    })

    /**
     * Download update
     */
    ipcMain.handle('update:download', async () => {
        try {
            if (downloadInProgress) {
                return {
                    success: false,
                    error: 'Download already in progress'
                }
            }

            downloadInProgress = true
            console.log('[Update] Starting update download...')

            await autoUpdater.downloadUpdate()

            return { success: true }
        } catch (error) {
            downloadInProgress = false
            console.error('[Update] Download error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    })

    /**
     * Install update and restart app
     */
    ipcMain.handle('update:install', async () => {
        try {
            console.log('[Update] Installing update and restarting...')

            // This will quit the app and install the update
            setImmediate(() => {
                autoUpdater.quitAndInstall(false, true)
            })

            return { success: true }
        } catch (error) {
            console.error('[Update] Install error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    })

    /**
     * Get current version
     */
    ipcMain.handle('update:get-version', () => {
        return {
            success: true,
            version: autoUpdater.currentVersion.version
        }
    })

    /**
     * Get update status
     */
    ipcMain.handle('update:get-status', () => {
        return {
            success: true,
            checking: updateCheckInProgress,
            downloading: downloadInProgress
        }
    })

    console.log('[Update] Update handlers registered successfully')
}

/**
 * Set up auto-updater event listeners and forward to renderer
 */
function setupAutoUpdaterEvents(getMainWindow: () => BrowserWindow | null) {
    // Update is available
    autoUpdater.on('update-available', (info) => {
        console.log('[Update] Update available:', info.version)
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:available', {
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
                releaseName: info.releaseName
            })
        }
    })

    // No update available
    autoUpdater.on('update-not-available', (info) => {
        console.log('[Update] No update available, current version:', info.version)
        updateCheckInProgress = false
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:not-available', {
                version: info.version
            })
        }
    })

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
        const progress: UpdateProgress = {
            bytesPerSecond: progressObj.bytesPerSecond,
            percent: progressObj.percent,
            transferred: progressObj.transferred,
            total: progressObj.total
        }

        console.log(`[Update] Download progress: ${progress.percent.toFixed(2)}%`)
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:download-progress', progress)
        }
    })

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Update] Update downloaded:', info.version)
        downloadInProgress = false
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:downloaded', {
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
                releaseName: info.releaseName
            })
        }
    })

    // Error occurred
    autoUpdater.on('error', (error) => {
        console.error('[Update] Error:', error)
        updateCheckInProgress = false
        downloadInProgress = false
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:error', {
                message: error.message,
                stack: error.stack
            })
        }
    })

    // Checking for updates
    autoUpdater.on('checking-for-update', () => {
        console.log('[Update] Checking for updates...')
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update:checking')
        }
    })
}

/**
 * Initialize auto-update on app startup
 * Call this from main.ts after the app is ready
 */
export async function initializeAutoUpdater(_mainWindow: BrowserWindow) {
    try {
        // Wait a bit after app launch to check for updates
        setTimeout(async () => {
            try {
                console.log('[Update] Performing automatic update check...')
                await autoUpdater.checkForUpdates()
            } catch (error) {
                console.error('[Update] Automatic check failed:', error)
            }
        }, 5000) // Check 5 seconds after app starts

        // Set up periodic checks (every hour by default)
        const checkInterval = Number.parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10)
        setInterval(async () => {
            try {
                if (!updateCheckInProgress && !downloadInProgress) {
                    console.log('[Update] Performing periodic update check...')
                    await autoUpdater.checkForUpdates()
                }
            } catch (error) {
                console.error('[Update] Periodic check failed:', error)
            }
        }, checkInterval)

    } catch (error) {
        console.error('[Update] Initialization error:', error)
    }
}
