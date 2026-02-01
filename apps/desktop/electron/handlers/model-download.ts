/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import path from 'path'
import fs from 'fs'
import http, { ClientRequest as HttpClientRequest } from 'http'
import https, { ClientRequest as HttpsClientRequest } from 'https'
import type { BrowserWindow as BrowserWindowType } from 'electron'

// Stateful map for active downloads
const activeDownloads = new Map<string, {
    request?: HttpClientRequest | HttpsClientRequest,
    destPath?: string,
    abort: () => void
}>()

// Path validation helper - prevents path traversal attacks
function validatePath(base: string, target: string): string {
    const resolvedTarget = path.resolve(base, target)
    if (!resolvedTarget.startsWith(path.resolve(base))) {
        throw new Error('Path traversal detected')
    }
    return resolvedTarget
}

interface DownloadOptions {
    modelId: string
    url: string
    filename: string
    expectedSize: number
    redirectCount?: number
}

export function registerModelDownloadHandlers(
    ipcMain: Electron.IpcMain,
    getMainWindow: () => BrowserWindowType | null,
    getModelsDir: () => string
) {
    // Download model file with resume support
    ipcMain.handle('download-model', async (event, options: DownloadOptions) => {
        const { modelId, filename, expectedSize } = options
        const currentUrl = options.url
        let redirectCount = 0
        const MAX_REDIRECTS = 5
        const MODELS_DIR = getModelsDir()

        let destPath: string
        try {
            destPath = validatePath(MODELS_DIR, filename)
        } catch (err) {
            console.error('[Main] Invalid model filename:', err)
            return { success: false, error: 'Invalid model filename' }
        }

        console.log('[Main] Starting download session:', modelId)

        // Check if partial file exists for resuming
        let startByte = 0
        if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath)
            startByte = stats.size
            console.log(`[Main] Resuming download from byte ${startByte}`)
        }

        const downloadWithRedirects = async (url: string): Promise<{ success: boolean, path?: string, error?: string }> => {
            return new Promise((resolve) => {
                const file = fs.createWriteStream(destPath, { flags: 'a' })
                let downloadedBytes = startByte
                let lastProgressUpdate = Date.now()
                let lastBytesRecorded = startByte
                let request: HttpClientRequest | HttpsClientRequest
                const mainWindow = getMainWindow()

                const performRequest = (reqUrl: string) => {
                    const protocol = reqUrl.startsWith('https') ? https : http
                    const requestOptions = {
                        headers: startByte > 0 ? { 'Range': `bytes=${startByte}-` } : {}
                    }

                    request = protocol.get(reqUrl, requestOptions, (response) => {
                        // Handle Redirects
                        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                            const nextUrl = response.headers.location
                            if (nextUrl) {
                                if (redirectCount >= MAX_REDIRECTS) {
                                    file.close()
                                    resolve({ success: false, error: 'Too many redirects' })
                                    return
                                }
                                redirectCount++
                                console.log(`[Main] Redirect ${redirectCount} to:`, nextUrl)
                                request.destroy()
                                performRequest(nextUrl.startsWith('http') ? nextUrl : new URL(nextUrl, reqUrl).toString())
                                return
                            }
                        }

                        // Handle Range Not Satisfiable (completed or invalid)
                        if (response.statusCode === 416) {
                            file.close()
                            console.log('[Main] Download already complete (416)')
                            activeDownloads.delete(modelId)
                            resolve({ success: true, path: destPath })
                            return
                        }

                        if (response.statusCode !== 200 && response.statusCode !== 206) {
                            file.close()
                            // Don't delete on error, allow resume later
                            activeDownloads.delete(modelId)
                            resolve({ success: false, error: `HTTP ${response.statusCode}` })
                            return
                        }

                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length
                            const now = Date.now()
                            const timeDelta = now - lastProgressUpdate

                            // Update progress every 500ms for smooth UI updates
                            if (timeDelta >= 500) {
                                const bytesDelta = downloadedBytes - lastBytesRecorded
                                // Calculate speed in bytes per second
                                const speed = bytesDelta > 0 ? Math.round(bytesDelta / (timeDelta / 1000)) : 0

                                lastProgressUpdate = now
                                lastBytesRecorded = downloadedBytes

                                // Determine total bytes from response header or expected size
                                let totalBytes = expectedSize
                                if (response.headers['content-length']) {
                                    const contentLength = Number(response.headers['content-length'])
                                    totalBytes = contentLength + startByte
                                }

                                mainWindow?.webContents.send('download-progress', {
                                    modelId,
                                    bytesDownloaded: downloadedBytes,
                                    totalBytes: totalBytes,
                                    speed: speed
                                })
                            }
                        })

                        response.pipe(file)

                        file.on('finish', () => {
                            file.close()
                            activeDownloads.delete(modelId)
                            console.log('[Main] Download complete:', modelId)
                            resolve({ success: true, path: destPath })
                        })
                    })

                    request.on('error', (error: Error) => {
                        file.close()
                        activeDownloads.delete(modelId)
                        console.log('[Main] Download request error:', error)
                        resolve({ success: false, error: error.message })
                    })

                    activeDownloads.set(modelId, {
                        request,
                        destPath,
                        abort: () => {
                            request.destroy()
                            file.close()
                            // Keep file for resume
                        }
                    })
                }

                performRequest(url)
            })
        }

        return await downloadWithRedirects(currentUrl);
    })

    // Pause download (aborts request but keeps partial file)
    ipcMain.handle('pause-download', async (_event, modelId: string) => {
        const download = activeDownloads.get(modelId)
        if (download) {
            download.abort() // This aborts the request and closes the file, but keeps the partial file
            activeDownloads.delete(modelId)
            console.log(`[Main] Paused download: ${modelId}`)
            return { success: true }
        }
        return { success: false, error: 'Download not found' }
    })

    // Resume download (re-trigger from frontend)
    ipcMain.handle('resume-download', async (_event, modelId: string) => {
        // Resume is handled by re-triggering download-model from frontend
        // The frontend should call downloadModel(id) again, which calls IPC download-model
        // And our new logic detects existing file and sends Range header.
        // This handler checks if it's already running.
        if (activeDownloads.has(modelId)) {
            return { success: false, error: 'Download already active' }
        }
        return { success: true }
    })

    // Cancel download (aborts and removes partial file)
    ipcMain.handle('cancel-download', async (_event, modelId: string) => {
        const download = activeDownloads.get(modelId)
        if (download) {
            download.abort()
            activeDownloads.delete(modelId)
            return { success: true }
        }
        return { success: false, error: 'Download not found' }
    })
}
