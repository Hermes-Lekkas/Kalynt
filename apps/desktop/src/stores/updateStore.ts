/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Update Store
 * Manages application auto-update state and interactions
 */

export interface UpdateInfo {
    version: string
    releaseNotes?: string
    releaseDate: string
    releaseName?: string
}

export interface DownloadProgress {
    bytesPerSecond: number
    percent: number
    transferred: number
    total: number
}

export type UpdateStatus =
    | 'idle'              // No update operation in progress
    | 'checking'          // Checking for updates
    | 'available'         // Update is available
    | 'not-available'     // No update available
    | 'downloading'       // Downloading update
    | 'downloaded'        // Update downloaded, ready to install
    | 'error'             // Error occurred

interface UpdateState {
    // State
    status: UpdateStatus
    currentVersion: string
    updateInfo: UpdateInfo | null
    downloadProgress: DownloadProgress | null
    error: string | null
    lastChecked: number | null
    showUpdateModal: boolean
    isConfigured: boolean

    // Actions
    setStatus: (status: UpdateStatus) => void
    setUpdateInfo: (info: UpdateInfo | null) => void
    setDownloadProgress: (progress: DownloadProgress | null) => void
    setError: (error: string | null) => void
    setLastChecked: (timestamp: number) => void
    setShowUpdateModal: (show: boolean) => void
    setIsConfigured: (configured: boolean) => void
    setCurrentVersion: (version: string) => void

    // Actions - Update operations
    checkForUpdates: () => Promise<void>
    downloadUpdate: () => Promise<void>
    installUpdate: () => Promise<void>
    dismissUpdate: () => void

    // Initialization
    initialize: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>()(
    persist(
        (set) => ({
            // Initial state
            status: 'idle',
            currentVersion: 'v1.0 beta',
            updateInfo: null,
            downloadProgress: null,
            error: null,
            lastChecked: null,
            showUpdateModal: false,
            isConfigured: false,

            // Setters
            setStatus: (status) => set({ status }),
            setUpdateInfo: (updateInfo) => set({ updateInfo }),
            setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
            setError: (error) => set({ error }),
            setLastChecked: (lastChecked) => set({ lastChecked }),
            setShowUpdateModal: (showUpdateModal) => set({ showUpdateModal }),
            setIsConfigured: (isConfigured) => set({ isConfigured }),
            setCurrentVersion: (currentVersion) => set({ currentVersion }),

            // Check for updates
            checkForUpdates: async () => {
                try {
                    set({ status: 'checking', error: null })

                    const result = await window.electronAPI?.update?.checkForUpdates()

                    if (!result?.success) {
                        throw new Error(result?.error || 'Failed to check for updates')
                    }

                    set({ lastChecked: Date.now() })

                    if (result.updateAvailable && result.updateInfo) {
                        set({
                            status: 'available',
                            updateInfo: result.updateInfo,
                            showUpdateModal: true
                        })
                        console.log('[UpdateStore] Update available:', result.updateInfo.version)
                    } else {
                        set({
                            status: 'not-available',
                            updateInfo: null
                        })
                        console.log('[UpdateStore] No update available')
                    }
                } catch (error) {
                    console.error('[UpdateStore] Check error:', error)
                    set({
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    })
                }
            },

            // Download update
            downloadUpdate: async () => {
                try {
                    set({ status: 'downloading', error: null, downloadProgress: null })

                    const result = await window.electronAPI?.update?.downloadUpdate()

                    if (!result?.success) {
                        throw new Error(result?.error || 'Failed to download update')
                    }

                    console.log('[UpdateStore] Download started')
                } catch (error) {
                    console.error('[UpdateStore] Download error:', error)
                    set({
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error),
                        downloadProgress: null
                    })
                }
            },

            // Install update
            installUpdate: async () => {
                try {
                    console.log('[UpdateStore] Installing update and restarting...')

                    const result = await window.electronAPI?.update?.installUpdate()

                    if (!result?.success) {
                        throw new Error(result?.error || 'Failed to install update')
                    }

                    // App will restart automatically
                } catch (error) {
                    console.error('[UpdateStore] Install error:', error)
                    set({
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    })
                }
            },

            // Dismiss update notification
            dismissUpdate: () => {
                set({
                    showUpdateModal: false,
                    status: 'idle',
                    updateInfo: null,
                    downloadProgress: null,
                    error: null
                })
            },

            // Initialize update system
            initialize: async () => {
                try {
                    // Get current version
                    const versionResult = await window.electronAPI?.update?.getVersion()
                    if (versionResult?.success && versionResult.version) {
                        set({ currentVersion: versionResult.version })
                    }

                    // Configure GitHub token from safe storage
                    const tokenResult = await window.electronAPI?.safeStorage?.get('github-update-token')
                    if (tokenResult?.success && tokenResult.value) {
                        const configResult = await window.electronAPI?.update?.configureToken(tokenResult.value)
                        if (configResult?.success) {
                            set({ isConfigured: true })
                            console.log('[UpdateStore] GitHub token configured')
                        }
                    } else {
                        console.log('[UpdateStore] No GitHub token found, using public access')
                        // Configure with empty token for public access
                        await window.electronAPI?.update?.configureToken('')
                    }

                    // Set up event listeners
                    window.electronAPI?.update?.onUpdateChecking(() => {
                        console.log('[UpdateStore] Checking for updates...')
                        set({ status: 'checking', error: null })
                    })

                    window.electronAPI?.update?.onUpdateAvailable((info) => {
                        console.log('[UpdateStore] Update available:', info)
                        set({
                            status: 'available',
                            updateInfo: info,
                            showUpdateModal: true,
                            lastChecked: Date.now()
                        })
                    })

                    window.electronAPI?.update?.onUpdateNotAvailable((info) => {
                        console.log('[UpdateStore] No update available:', info)
                        set({
                            status: 'not-available',
                            updateInfo: null,
                            lastChecked: Date.now()
                        })
                    })

                    window.electronAPI?.update?.onDownloadProgress((progress) => {
                        console.log(`[UpdateStore] Download progress: ${progress.percent.toFixed(2)}%`)
                        set({
                            status: 'downloading',
                            downloadProgress: progress
                        })
                    })

                    window.electronAPI?.update?.onUpdateDownloaded((info) => {
                        console.log('[UpdateStore] Update downloaded:', info)
                        set({
                            status: 'downloaded',
                            updateInfo: info,
                            downloadProgress: null,
                            showUpdateModal: true
                        })
                    })

                    window.electronAPI?.update?.onUpdateError((error) => {
                        console.error('[UpdateStore] Update error:', error)
                        set({
                            status: 'error',
                            error: error.message,
                            downloadProgress: null
                        })
                    })

                    console.log('[UpdateStore] Initialized successfully')
                } catch (error) {
                    console.error('[UpdateStore] Initialization error:', error)
                    set({
                        error: error instanceof Error ? error.message : String(error)
                    })
                }
            }
        }),
        {
            name: 'kalynt-update-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                // Only persist these fields
                lastChecked: state.lastChecked,
                isConfigured: state.isConfigured,
                currentVersion: state.currentVersion
            })
        }
    )
)
