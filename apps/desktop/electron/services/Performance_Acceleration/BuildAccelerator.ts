/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * BuildAccelerator
 * 
 * Implements a caching layer for build artifacts and dependency analysis
 * to speed up compile, build, and debug cycles.
 */
export class BuildAccelerator {
    private cacheDir: string
    private metadataPath: string
    private metadata: Record<string, { hash: string, timestamp: number }> = {}

    constructor(userDataPath: string) {
        this.cacheDir = path.join(userDataPath, 'build-cache')
        this.metadataPath = path.join(this.cacheDir, 'metadata.json')
        this.ensureCacheDir()
        this.loadMetadata()
    }

    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true })
        }
    }

    private loadMetadata() {
        if (fs.existsSync(this.metadataPath)) {
            try {
                this.metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'))
            } catch (_e) {
                this.metadata = {}
            }
        }
    }

    private saveMetadata() {
        fs.writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2))
    }

    /**
     * Checks if a build artifact is still valid by hashing the source file.
     */
    public async isArtifactValid(sourcePath: string, artifactKey: string): Promise<boolean> {
        if (!fs.existsSync(sourcePath)) return false

        const hash = await this.getFileHash(sourcePath)
        const entry = this.metadata[artifactKey]

        if (entry && entry.hash === hash) {
            return true
        }

        return false
    }

    /**
     * Stores a build artifact in the cache.
     */
    public async cacheArtifact(sourcePath: string, artifactKey: string, artifactPath: string) {
        const hash = await this.getFileHash(sourcePath)
        const cachePath = path.join(this.cacheDir, artifactKey)

        try {
            await fs.promises.copyFile(artifactPath, cachePath)
            this.metadata[artifactKey] = {
                hash,
                timestamp: Date.now()
            }
            this.saveMetadata()
        } catch (e) {
            console.error(`[BuildAccelerator] Failed to cache artifact ${artifactKey}:`, e)
        }
    }

    /**
     * Retrieves a build artifact from the cache.
     */
    public async getCachedArtifact(artifactKey: string, outputPath: string): Promise<boolean> {
        const cachePath = path.join(this.cacheDir, artifactKey)
        if (fs.existsSync(cachePath)) {
            try {
                await fs.promises.copyFile(cachePath, outputPath)
                return true
            } catch (e) {
                console.error(`[BuildAccelerator] Failed to retrieve artifact ${artifactKey}:`, e)
            }
        }
        return false
    }

    private async getFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5')
            const stream = fs.createReadStream(filePath)
            stream.on('data', data => hash.update(data))
            stream.on('end', () => resolve(hash.digest('hex')))
            stream.on('error', err => reject(err))
        })
    }

    /**
     * Optimizes compilation by suggesting parallel worker counts based on CPU cores.
     */
    public getOptimalParallelism(): number {
        const cores = os.cpus().length
        // Leave 1 core for the main process and UI responsiveness
        return Math.max(1, cores - 1)
    }

    public clearCache() {
        if (fs.existsSync(this.cacheDir)) {
            fs.rmSync(this.cacheDir, { recursive: true, force: true })
            this.ensureCacheDir()
            this.metadata = {}
            this.saveMetadata()
        }
    }
}

// Need os import for getOptimalParallelism
import os from 'os'
