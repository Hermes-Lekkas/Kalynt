/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import * as chokidar from 'chokidar'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import { nativeHelperService } from '../services/native-helper-service'
import { binaryManager } from '../services/binary-manager'

// JavaScript search result type
interface JSSearchResult {
    file: string
    line: number
    content: string
}

// JavaScript fallback search function - used when ripgrep is unavailable or fails
async function performJSSearch(
    searchPath: string,
    pattern: string,
    filePattern: string | undefined,
    maxResults: number
): Promise<JSSearchResult[]> {
    const results: JSSearchResult[] = []
    const searchRegex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    
    const shouldSearchFile = (filename: string): boolean => {
        if (filePattern) {
            const fp = filePattern.replace(/\*/g, '.*')
            return new RegExp(fp, 'i').test(filename)
        }
        return true
    }
    
    const binaryExts = new Set([
        '.exe', '.dll', '.so', '.dylib', '.bin', '.png', '.jpg', '.jpeg', '.gif',
        '.bmp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z', '.mp3',
        '.mp4', '.avi', '.mov', '.woff', '.woff2', '.ttf', '.otf'
    ])
    
    const searchDirectory = async (dirPath: string, relativePath: string): Promise<void> => {
        if (results.length >= maxResults) return
        
        // Yield to event loop to keep UI responsive
        await new Promise(resolve => setImmediate(resolve))
        
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
        
        for (const entry of entries) {
            if (results.length >= maxResults) break
            
            const entryName = entry.name
            const entryRelativePath = path.join(relativePath, entryName)
            const entryFullPath = path.join(dirPath, entryName)
            
            // Skip hidden dirs, node_modules, etc.
            if (entry.isDirectory()) {
                if (entryName.startsWith('.') || entryName === 'node_modules' || entryName === 'dist' || entryName === 'build') {
                    continue
                }
                await searchDirectory(entryFullPath, entryRelativePath)
            } else if (entry.isFile() && shouldSearchFile(entryName)) {
                // Skip binary files and very large files
                const ext = path.extname(entryName).toLowerCase()
                
                if (binaryExts.has(ext)) continue
                
                try {
                    const stats = await fs.promises.stat(entryFullPath)
                    if (stats.size > 5 * 1024 * 1024) continue // Skip files > 5MB
                    
                    const content = await fs.promises.readFile(entryFullPath, 'utf-8')
                    const lines = content.split('\n')
                    
                    lines.forEach((line, index) => {
                        if (results.length >= maxResults) return
                        if (searchRegex.test(line)) {
                            results.push({
                                file: entryRelativePath,
                                line: index + 1,
                                content: line.trim().substring(0, 200) // Limit line length
                            })
                        }
                    })
                } catch {
                    // Skip files that can't be read
                }
            }
        }
    }
    
    await searchDirectory(searchPath, '')
    return results
}

// Stateful maps for file watchers
const watchers = new Map<string, chokidar.FSWatcher>()
const nativeWatchers = new Set<string>() // Track IDs using native watcher

// Set up native event forwarding
nativeHelperService.on('file-changed', (params: { path: string, flags: number, watcherId?: string }) => {
    // SECURITY: Validate that the watcherId exists and is being tracked
    if (params.watcherId && nativeWatchers.has(params.watcherId)) {
        // Broadcast specifically to the mapped watcher ID
        const mainWindow = nativeHelperService.getMainWindow()
        if (mainWindow) {
            let event: 'add' | 'unlink' | 'change' | 'unlinkDir' = 'change'
            // kFSEventStreamEventFlagItemCreated = 0x00000100
            // kFSEventStreamEventFlagItemRemoved = 0x00000200
            if (params.flags & 0x00000100) event = 'add'
            if (params.flags & 0x00000200) event = 'unlink'

            mainWindow.webContents.send('fs:change', {
                id: params.watcherId,
                event,
                path: params.path
            })
        }
    }
})

// Path validation helper - prevents path traversal attacks
// SECURITY FIX: Use fs.realpathSync to resolve symlinks and prevent symlink-based escapes
function validatePath(base: string, target: string): string {
    const resolvedTarget = path.resolve(base, target)
    const resolvedBase = path.resolve(base)

    // First check: resolved path must be within base (catches ../../../ attacks)
    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
        throw new Error('Path traversal detected')
    }

    // If target exists, also verify its real path (catches symlink attacks)
    // Note: We only check if the file exists to avoid errors on new file creation
    if (fs.existsSync(resolvedTarget)) {
        try {
            const realTarget = fs.realpathSync(resolvedTarget)
            const realBase = fs.realpathSync(resolvedBase)
            if (!realTarget.startsWith(realBase + path.sep) && realTarget !== realBase) {
                throw new Error('Path traversal via symlink detected')
            }
        } catch (e) {
            // If realpath fails (broken symlink, permission denied), reject to be safe
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error('Path validation failed: ' + (e as Error).message)
            }
        }
    }

    return resolvedTarget
}

export function registerFileSystemHandlers(
    ipcMain: Electron.IpcMain,
    dialog: Electron.Dialog,
    getMainWindow: () => BrowserWindowType | null,
    getCurrentWorkspacePath: () => string | null,
    setCurrentWorkspacePath: (path: string) => void,
    getModelsDir: () => string
) {
    // Set workspace and clear all watchers
    ipcMain.handle('fs:setWorkspace', async (_event, workspacePath: string) => {
        setCurrentWorkspacePath(workspacePath)
        const closePromises: Promise<void>[] = []
        watchers.forEach((watcher) => {
            closePromises.push(watcher.close())
        })
        await Promise.all(closePromises)
        watchers.clear()
        console.log('[Main] Workspace set to:', workspacePath)
        return { success: true }
    })

    // Open folder dialog
    ipcMain.handle('fs:openFolder', async () => {
        const mainWindow = getMainWindow()
        if (!mainWindow) return { success: false, error: 'No main window' }
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true }
        }
        setCurrentWorkspacePath(result.filePaths[0])
        console.log('[Main] Workspace opened:', result.filePaths[0])
        return { success: true, path: result.filePaths[0] }
    })

    // Check if file exists
    ipcMain.handle('file-exists', async (_event, filePath: string) => {
        try {
            // Try models directory first (essential for absolute paths from model store)
            const MODELS_DIR = getModelsDir()
            try {
                const filename = path.basename(filePath)
                const safeModelPath = validatePath(MODELS_DIR, filename)
                if (fs.existsSync(safeModelPath)) {
                    return true
                }
            } catch {
                // Ignore validation errors for models and fall through
            }

            // Try current workspace
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (currentWorkspacePath) {
                const safePath = validatePath(currentWorkspacePath, filePath)
                return fs.existsSync(safePath)
            }

            return false
        } catch {
            return false
        }
    })

    // Delete model file (restricted to models directory)
    ipcMain.handle('delete-model', async (_event, filePath: string) => {
        try {
            const MODELS_DIR = getModelsDir()
            const safePath = validatePath(MODELS_DIR, filePath)
            if (!safePath.startsWith(MODELS_DIR)) {
                return { success: false, error: 'Access denied: Invalid model path' }
            }
            if (fs.existsSync(safePath)) {
                fs.unlinkSync(safePath)
            }
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Read directory contents
    ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, dirPath)
            const entries = await fs.promises.readdir(safePath, { withFileTypes: true })
            const items = await Promise.all(entries
                .filter(entry => {
                    const name = entry.name
                    if (name === '.env' || name === '.git' || name === 'node_modules') return false
                    if (name.endsWith('.key') || name.endsWith('.pem')) return false
                    return true
                })
                .map(async entry => {
                    const entryPath = path.join(dirPath, entry.name)
                    let stats = { size: 0, mtimeMs: Date.now() }
                    try {
                        if (entry.isFile()) {
                            const fullPath = path.join(safePath, entry.name)
                            stats = await fs.promises.stat(fullPath)
                        }
                    } catch (error_) {
                        console.error('[Main] Failed to stat file during readDir:', error_)
                    }
                    return {
                        name: entry.name,
                        path: entryPath,
                        isDirectory: entry.isDirectory(),
                        isFile: entry.isFile(),
                        size: stats.size,
                        lastModified: stats.mtimeMs
                    }
                }))
            return { success: true, items }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Read file contents
    ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, filePath)
            const content = await fs.promises.readFile(safePath, 'utf-8')
            return { success: true, content }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Read binary file contents (returns Uint8Array)
    ipcMain.handle('fs:readBinaryFile', async (_event, filePath: string) => {
        try {
            // Note: We might need to access node_modules which could be outside current workspace
            // but for now we assume it's within or we'll adjust validation.
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, filePath)
            const content = await fs.promises.readFile(safePath)
            return { success: true, content: new Uint8Array(content) }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Get file stats
    ipcMain.handle('fs:stat', async (_event, filePath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, filePath)
            const stats = await fs.promises.stat(safePath)
            return {
                success: true,
                size: stats.size,
                mtimeMs: stats.mtimeMs,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile()
            }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Write file contents
    ipcMain.handle('fs:writeFile', async (_event, options: { path: string, content: string, encoding?: BufferEncoding }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, options.path)
            await fs.promises.mkdir(path.dirname(safePath), { recursive: true })
            await fs.promises.writeFile(safePath, options.content, options.encoding || 'utf-8')
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Create empty file
    ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, filePath)
            await fs.promises.writeFile(safePath, '', 'utf-8')
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Create directory
    ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, dirPath)
            await fs.promises.mkdir(safePath, { recursive: true })
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Delete file or directory
    ipcMain.handle('fs:delete', async (_event, itemPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, itemPath)
            const stat = await fs.promises.stat(safePath)
            if (stat.isDirectory()) {
                await fs.promises.rm(safePath, { recursive: true })
            } else {
                await fs.promises.unlink(safePath)
            }
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Rename file or directory
    ipcMain.handle('fs:rename', async (_event, options: { oldPath: string, newPath: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safeOld = validatePath(currentWorkspacePath, options.oldPath)
            const safeNew = validatePath(currentWorkspacePath, options.newPath)
            await fs.promises.rename(safeOld, safeNew)
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // NEW: Native file change forwarding
    nativeHelperService.on('file-changed', (params: { path: string, flags: number }) => {
        const mainWindow = getMainWindow()
        if (!mainWindow) return

        // Broadcast to all active native watchers
        // FSEvents flags mapping (simplified)
        // kFSEventStreamEventFlagItemCreated = 0x00000100
        // kFSEventStreamEventFlagItemRemoved = 0x00000200
        // kFSEventStreamEventFlagItemModified = 0x00001000
        // kFSEventStreamEventFlagItemRenamed = 0x00000800

        let event: 'add' | 'unlink' | 'change' | 'unlinkDir' = 'change'
        if (params.flags & 0x00000100) event = 'add'
        if (params.flags & 0x00000200) event = 'unlink'

        nativeWatchers.forEach(id => {
            mainWindow.webContents.send('fs:change', {
                id: id,
                event,
                path: params.path
            })
        })
    })

    // Watch directory for changes
    ipcMain.handle('fs:watchDir', async (_event, options: { id: string, dirPath: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            const mainWindow = getMainWindow()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, options.dirPath)

            // Close existing
            const existingWatcher = watchers.get(options.id)
            if (existingWatcher) {
                await existingWatcher.close()
                watchers.delete(options.id)
            }
            if (nativeWatchers.has(options.id)) {
                if (nativeHelperService.isAvailable()) {
                    await nativeHelperService.request('watch-stop', { watcherId: options.id })
                }
                nativeWatchers.delete(options.id)
            }

            // Prefer Native FSEvents on macOS
            if (process.platform === 'darwin' && nativeHelperService.isAvailable()) {
                try {
                    await nativeHelperService.request('watch-start', { 
                        path: safePath,
                        watcherId: options.id 
                    })
                    nativeWatchers.add(options.id)
                    console.log(`[FS] Using native FSEvents for ${options.id}`)
                    return { success: true, native: true }
                } catch (e) {
                    console.warn('[FS] Native watch failed, falling back to Chokidar:', e)
                }
            }

            // Fallback to Chokidar
            const watcher = chokidar.watch(safePath, {
                ignored: /(^|[\\/])\../,
                persistent: true,
                ignoreInitial: true
            })
            watcher.on('all', (event, filePath) => {
                mainWindow?.webContents.send('fs:change', {
                    id: options.id,
                    event,
                    path: filePath
                })
            })
            watchers.set(options.id, watcher)
            return { success: true, native: false }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Unwatch directory
    ipcMain.handle('fs:unwatchDir', async (_event, id: string) => {
        const watcher = watchers.get(id)
        if (watcher) {
            await watcher.close()
            watchers.delete(id)
        }

        if (nativeWatchers.has(id)) {
            if (nativeHelperService.isAvailable()) {
                await nativeHelperService.request('watch-stop', { watcherId: id }).catch((error) => {
                    console.warn(`[FS] Failed to stop native watcher ${id}:`, error)
                })
            }
            nativeWatchers.delete(id)
        }
        return { success: true }
    })

    // NEW: Search files (cross-platform grep-like functionality)
    ipcMain.handle('fs:search', async (_event, options: { 
        searchPath: string
        pattern: string
        filePattern?: string
        maxResults?: number
    }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            
            const safePath = validatePath(currentWorkspacePath, options.searchPath)
            const maxResults = options.maxResults || 100

            // PRIORITY: Use Bundled Ripgrep (rg)
            const rgPath = binaryManager.getRipgrepPath()
            if (rgPath) {
                return new Promise((resolve) => {
                    const args = [
                        '--json',
                        '--max-count', maxResults.toString(),
                        '--ignore-case',
                        '--fixed-strings',
                        options.pattern,
                        safePath
                    ]

                    const rg = spawn(rgPath, args)
                    const results: any[] = []
                    let buffer = ''

                    rg.stdout.on('data', (data) => {
                        buffer += data.toString()
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || ''

                        for (const line of lines) {
                            try {
                                const entry = JSON.parse(line)
                                if (entry.type === 'match') {
                                    results.push({
                                        file: path.relative(safePath, entry.data.path.text),
                                        line: entry.data.line_number,
                                        content: entry.data.lines.text.trim().substring(0, 200)
                                    })
                                }
                            } catch (_e) {
                                // Ignore malformed lines
                            }
                        }
                    })

                    rg.on('close', () => {
                        resolve({ success: true, results, truncated: results.length >= maxResults })
                    })

                    rg.on('error', async (err) => {
                        console.error('[FS] Ripgrep error:', err)
                        // FALLBACK: Use JS search when ripgrep fails
                        console.log('[FS] Falling back to JavaScript search')
                        try {
                            const jsResults = await performJSSearch(safePath, options.pattern, options.filePattern, maxResults)
                            resolve({ success: true, results: jsResults, truncated: jsResults.length >= maxResults })
                        } catch (jsError) {
                            console.error('[FS] JavaScript search also failed:', jsError)
                            resolve({ success: false, error: `Search failed: ripgrep error (${err.message}), JS fallback also failed (${String(jsError)})` })
                        }
                    })
                })
            }
            
            // Use JavaScript fallback search when ripgrep is not available
            const results = await performJSSearch(safePath, options.pattern, options.filePattern, maxResults)
            
            return {
                success: true,
                results,
                truncated: results.length >= maxResults
            }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // NEW: Backup workspace
    ipcMain.handle('fs:backup', async () => {
        try {
            const currentWorkspace = getCurrentWorkspacePath()
            const mainWindow = getMainWindow()
            if (!currentWorkspace || !mainWindow) return { success: false, error: 'No workspace or window' }

            const { canceled, filePath: destPath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Select Backup Destination',
                defaultPath: `backup-${path.basename(currentWorkspace)}-${Date.now()}`,
                buttonLabel: 'Restore'
            })

            if (canceled || !destPath) return { success: false, canceled: true }

            await fs.promises.mkdir(destPath, { recursive: true })

            const copyRecursive = async (src: string, dest: string) => {
                // Yield to event loop
                await new Promise(resolve => setImmediate(resolve))
                
                const entries = await fs.promises.readdir(src, { withFileTypes: true })
                for (const entry of entries) {
                    const srcPath = path.join(src, entry.name)
                    const destPath = path.join(dest, entry.name)

                    if (entry.name === 'node_modules' || entry.name === '.git') continue

                    if (entry.isDirectory()) {
                        await fs.promises.mkdir(destPath, { recursive: true })
                        await copyRecursive(srcPath, destPath)
                    } else {
                        await fs.promises.copyFile(srcPath, destPath)
                    }
                }
            }

            await copyRecursive(currentWorkspace, destPath)
            return { success: true, path: destPath }
        } catch (error) {
            console.error('[Main] Backup failed:', error)
            return { success: false, error: String(error) }
        }
    })

    // Write file (with optional base64 encoding for binary data)
    // ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: string, options?: { encoding?: 'utf-8' | 'base64' }) => {
    //     try {
    //         // Ensure directory exists
    //         const dir = path.dirname(filePath)
    //         await fs.promises.mkdir(dir, { recursive: true })

    //         // Write file
    //         if (options?.encoding === 'base64') {
    //             const buffer = Buffer.from(data, 'base64')
    //             await fs.promises.writeFile(filePath, buffer)
    //         } else {
    //             await fs.promises.writeFile(filePath, data, 'utf-8')
    //         }

    //         return { success: true }
    //     } catch (error) {
    //         console.error('[Main] Write file failed:', error)
    //         return { success: false, error: String(error) }
    //     }
    // })
}
