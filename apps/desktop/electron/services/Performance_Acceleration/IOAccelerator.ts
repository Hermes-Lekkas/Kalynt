/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as fs from 'fs'
import * as path from 'path'
import { nativeHelperService } from '../native-helper-service'

/**
 * IOAccelerator
 * 
 * Optimizes file system operations, indexing, and watching.
 * Bridges to native helpers for high-performance I/O tasks.
 */
export class IOAccelerator {
    private isNativeSupported: boolean = false
    private indexCache: Map<string, string[]> = new Map()
    private fileMetadataCache: Map<string, fs.Stats> = new Map()

    constructor() {
        this.isNativeSupported = nativeHelperService.isAvailable()
    }

    /**
     * Rapidly scans a directory and its subdirectories.
     * Uses native helper if available, otherwise falls back to an optimized recursive scan.
     */
    public async scanDirectory(dirPath: string): Promise<string[]> {
        if (this.isNativeSupported) {
            try {
                const result = await nativeHelperService.request('fs:scan', { path: dirPath })
                if (result && Array.isArray(result)) {
                    this.indexCache.set(dirPath, result)
                    return result
                }
            } catch (e) {
                console.warn('[IOAccelerator] Native scan failed, falling back:', e)
            }
        }

        // Optimized Node.js fallback
        const files: string[] = []
        await this.recursiveReaddir(dirPath, files)
        this.indexCache.set(dirPath, files)
        return files
    }

    private async recursiveReaddir(dirPath: string, fileList: string[]) {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            
            // Skip common ignored directories to save time
            if (entry.isDirectory()) {
                if (['node_modules', '.git', '.next', 'dist', 'build', 'release'].includes(entry.name)) continue
                await this.recursiveReaddir(fullPath, fileList)
            } else {
                fileList.push(fullPath)
            }
        }
    }

    /**
     * Efficiently searches for a pattern in the workspace.
     * Wraps ripgrep via native helper or optimized shell command.
     */
    public async searchFiles(pattern: string, rootDir: string): Promise<any[]> {
        if (this.isNativeSupported) {
            return nativeHelperService.request('fs:search', { pattern, path: rootDir })
        }
        
        // Implementation for ripgrep search would go here if we were to bundle it
        // For now, we return empty or use a slower JS-based search
        return []
    }

    /**
     * Pre-warms the file metadata cache for a given directory.
     * This makes subsequent 'stat' calls much faster.
     */
    public async prewarmCache(dirPath: string) {
        const files = this.indexCache.get(dirPath) || await this.scanDirectory(dirPath)
        
        // Process in batches to avoid overwhelming the loop
        const batchSize = 100
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize)
            await Promise.all(batch.map(async (file) => {
                try {
                    const stats = await fs.promises.stat(file)
                    this.fileMetadataCache.set(file, stats)
                } catch (e) {
                    // Ignore errors for missing files
                }
            }))
        }
        
        console.log(`[IOAccelerator] Pre-warmed cache for ${files.length} files in ${dirPath}`)
    }

    /**
     * Optimized file watcher setup.
     * On macOS, this uses FSEvents via the native helper.
     */
    public setupWatcher(dirPath: string, callback: (event: string, path: string) => void) {
        if (process.platform === 'darwin' && this.isNativeSupported) {
            nativeHelperService.on('fs:watch-event', (data: any) => {
                if (data.root === dirPath) {
                    callback(data.event, data.path)
                }
            })
            
            nativeHelperService.request('fs:watch', { path: dirPath })
                .catch(e => console.error('[IOAccelerator] Failed to setup native watcher:', e))
        } else {
            // Fallback to Chokidar (which should be handled by the FileSystemHandler)
            console.log('[IOAccelerator] Native watcher not available for this platform.')
        }
    }

    public clearCache() {
        this.indexCache.clear()
        this.fileMetadataCache.clear()
    }
}
