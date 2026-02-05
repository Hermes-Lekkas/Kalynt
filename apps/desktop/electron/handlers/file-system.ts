/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path'
import fs from 'node:fs'
import * as chokidar from 'chokidar'
import type { BrowserWindow as BrowserWindowType } from 'electron'

// Stateful maps for file watchers
const watchers = new Map<string, chokidar.FSWatcher>()

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

    // Watch directory for changes
    ipcMain.handle('fs:watchDir', async (_event, options: { id: string, dirPath: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            const mainWindow = getMainWindow()
            if (!currentWorkspacePath) {
                return { success: false, error: 'No workspace open' }
            }
            const safePath = validatePath(currentWorkspacePath, options.dirPath)
            const existingWatcher = watchers.get(options.id)
            if (existingWatcher) {
                await existingWatcher.close()
            }
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
            return { success: true }
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
        return { success: true }
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
}
