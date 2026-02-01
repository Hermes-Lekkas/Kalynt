/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { exec } from 'child_process'

export class RuntimeManager {
    private activeDownloads = new Map<string, { abort: () => void }>()
    private installedRuntimes = new Map<string, { version: string; path: string }>()
    private runtimesDir: string

    constructor(runtimesDir: string) {
        this.runtimesDir = runtimesDir
    }

    getDownloadUrl(runtimeId: string, platform: NodeJS.Platform): { url: string; filename: string; size: number } | null {
        const downloads: Record<string, Record<string, { url: string; filename: string; size: number }>> = {
            node: {
                win32: {
                    url: 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip',
                    filename: 'node-v20.11.0-win-x64.zip',
                    size: 29000000
                },
                darwin: {
                    url: 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-darwin-x64.tar.gz',
                    filename: 'node-v20.11.0-darwin-x64.tar.gz',
                    size: 42000000
                },
                linux: {
                    url: 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-x64.tar.xz',
                    filename: 'node-v20.11.0-linux-x64.tar.xz',
                    size: 23000000
                }
            },
            python: {
                win32: {
                    url: 'https://www.python.org/ftp/python/3.12.1/python-3.12.1-embed-amd64.zip',
                    filename: 'python-3.12.1-embed-amd64.zip',
                    size: 10000000
                },
                darwin: {
                    url: 'https://www.python.org/ftp/python/3.12.1/python-3.12.1-macos11.pkg',
                    filename: 'python-3.12.1-macos11.pkg',
                    size: 35000000
                },
                linux: {
                    url: 'https://www.python.org/ftp/python/3.12.1/Python-3.12.1.tgz',
                    filename: 'Python-3.12.1.tgz',
                    size: 27000000
                }
            },
            rust: {
                win32: {
                    url: 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe',
                    filename: 'rustup-init.exe',
                    size: 8000000
                }
            },
            go: {
                win32: {
                    url: 'https://go.dev/dl/go1.21.5.windows-amd64.zip',
                    filename: 'go1.21.5.windows-amd64.zip',
                    size: 140000000
                },
                darwin: {
                    url: 'https://go.dev/dl/go1.21.5.darwin-amd64.tar.gz',
                    filename: 'go1.21.5.darwin-amd64.tar.gz',
                    size: 145000000
                },
                linux: {
                    url: 'https://go.dev/dl/go1.21.5.linux-amd64.tar.gz',
                    filename: 'go1.21.5.linux-amd64.tar.gz',
                    size: 140000000
                }
            },
            deno: {
                win32: {
                    url: 'https://github.com/denoland/deno/releases/download/v1.39.0/deno-x86_64-pc-windows-msvc.zip',
                    filename: 'deno-x86_64-pc-windows-msvc.zip',
                    size: 35000000
                },
                darwin: {
                    url: 'https://github.com/denoland/deno/releases/download/v1.39.0/deno-x86_64-apple-darwin.zip',
                    filename: 'deno-x86_64-apple-darwin.zip',
                    size: 40000000
                },
                linux: {
                    url: 'https://github.com/denoland/deno/releases/download/v1.39.0/deno-x86_64-unknown-linux-gnu.zip',
                    filename: 'deno-x86_64-unknown-linux-gnu.zip',
                    size: 38000000
                }
            },
            bun: {
                win32: {
                    url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.0.18/bun-windows-x64.zip',
                    filename: 'bun-windows-x64.zip',
                    size: 40000000
                },
                darwin: {
                    url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.0.18/bun-darwin-x64.zip',
                    filename: 'bun-darwin-x64.zip',
                    size: 42000000
                },
                linux: {
                    url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.0.18/bun-linux-x64.zip',
                    filename: 'bun-linux-x64.zip',
                    size: 40000000
                }
            },
            zig: {
                win32: {
                    url: 'https://ziglang.org/download/0.11.0/zig-windows-x86_64-0.11.0.zip',
                    filename: 'zig-windows-x86_64-0.11.0.zip',
                    size: 90000000
                },
                darwin: {
                    url: 'https://ziglang.org/download/0.11.0/zig-macos-x86_64-0.11.0.tar.xz',
                    filename: 'zig-macos-x86_64-0.11.0.tar.xz',
                    size: 40000000
                },
                linux: {
                    url: 'https://ziglang.org/download/0.11.0/zig-linux-x86_64-0.11.0.tar.xz',
                    filename: 'zig-linux-x86_64-0.11.0.tar.xz',
                    size: 40000000
                }
            }
        }

        return downloads[runtimeId]?.[platform] || null
    }

    async downloadRuntime(
        runtimeId: string,
        onProgress: (progress: { bytesDownloaded: number; totalBytes: number; speed: number }) => void,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; path?: string; error?: string }> {
        const downloadInfo = this.getDownloadUrl(runtimeId, process.platform)
        if (!downloadInfo) {
            const error = `Runtime ${runtimeId} not available for automatic download on ${process.platform}`
            onLog?.(error)
            return { success: false, error }
        }

        const destPath = path.join(this.runtimesDir, downloadInfo.filename)
        onLog?.(`Download URL: ${downloadInfo.url}`)
        onLog?.(`Destination: ${destPath}`)

        // Check if already downloaded
        if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath)
            if (stats.size === downloadInfo.size) {
                onLog?.(`File already exists with correct size, skipping download`)
                return { success: true, path: destPath }
            }
            onLog?.(`Existing file size mismatch, re-downloading...`)
        }

        return new Promise((resolve) => {
            const file = fs.createWriteStream(destPath)
            let downloadedBytes = 0
            let lastProgressUpdate = Date.now()
            let lastBytesRecorded = 0

            const protocol = downloadInfo.url.startsWith('https') ? https : http
            const request = protocol.get(downloadInfo.url, (response) => {
                if (response.statusCode !== 200) {
                    file.close()
                    fs.unlinkSync(destPath)
                    resolve({ success: false, error: `HTTP ${response.statusCode}` })
                    return
                }

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length
                    const now = Date.now()
                    const timeDelta = now - lastProgressUpdate

                    if (timeDelta >= 500) {
                        const bytesDelta = downloadedBytes - lastBytesRecorded
                        const speed = bytesDelta > 0 ? Math.round(bytesDelta / (timeDelta / 1000)) : 0

                        lastProgressUpdate = now
                        lastBytesRecorded = downloadedBytes

                        onProgress({
                            bytesDownloaded: downloadedBytes,
                            totalBytes: downloadInfo.size,
                            speed: speed
                        })
                    }
                })

                response.pipe(file)

                file.on('finish', () => {
                    file.close()
                    this.activeDownloads.delete(runtimeId)
                    resolve({ success: true, path: destPath })
                })
            })

            request.on('error', (error: Error) => {
                file.close()
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
                this.activeDownloads.delete(runtimeId)
                resolve({ success: false, error: error.message })
            })

            this.activeDownloads.set(runtimeId, {
                abort: () => {
                    request.destroy()
                    file.close()
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
                }
            })
        })
    }

    async installRuntime(
        runtimeId: string,
        archivePath: string,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; installPath?: string; error?: string }> {
        const installPath = path.join(this.runtimesDir, runtimeId)

        try {
            // Clean up existing installation directory to avoid conflicts
            if (fs.existsSync(installPath)) {
                onLog?.(`Cleaning up existing directory: ${installPath}`)
                fs.rmSync(installPath, { recursive: true, force: true })
            }

            onLog?.(`Creating installation directory: ${installPath}`)
            // Create install directory
            fs.mkdirSync(installPath, { recursive: true })

            // Extract archive based on extension
            if (archivePath.endsWith('.zip')) {
                onLog?.(`Extracting ZIP archive...`)
                await this.extractZip(archivePath, installPath, onLog)
            } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tar.xz')) {
                onLog?.(`Extracting TAR archive...`)
                await this.extractTar(archivePath, installPath, onLog)
            } else if (archivePath.endsWith('.exe')) {
                onLog?.(`Running installer executable...`)
                await this.runInstaller(archivePath, installPath, onLog)
            } else {
                const error = 'Unsupported archive format'
                onLog?.(error)
                return { success: false, error }
            }

            // Store installation info
            this.installedRuntimes.set(runtimeId, {
                version: '20.11.0', // TODO: Extract from runtime
                path: installPath
            })

            // Add to PATH
            onLog?.(`Adding to system PATH...`)
            await this.addToPath(runtimeId, installPath, onLog)

            onLog?.(`Successfully installed ${runtimeId} to ${installPath}`)
            console.log(`[RuntimeManager] Installed ${runtimeId} to ${installPath}`)
            return { success: true, installPath }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            onLog?.(`Installation error: ${errorMsg}`)
            console.error(`[RuntimeManager] Installation failed for ${runtimeId}:`, error)
            return { success: false, error: errorMsg }
        }
    }

    async extractZip(archivePath: string, destPath: string, onLog?: (message: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            // Use unzipper package if available, otherwise use system commands
            if (process.platform === 'win32') {
                // Windows: Use PowerShell
                const command = `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destPath}' -Force"`
                onLog?.(`Running: ${command}`)
                onLog?.(`This may take a few minutes for large archives...`)

                exec(command, {
                    timeout: 300000, // 5 minutes timeout
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                }, (error, stdout, stderr) => {
                    if (stdout) onLog?.(stdout)
                    if (stderr) onLog?.(stderr)
                    if (error) {
                        if (error.killed) {
                            onLog?.(`Extraction timeout - archive may be too large or extraction stuck`)
                        }
                        onLog?.(`Extraction error: ${error.message}`)
                        reject(error)
                    } else {
                        onLog?.(`Extraction complete`)
                        resolve()
                    }
                })
            } else {
                // macOS/Linux: Use unzip
                const command = `unzip -q "${archivePath}" -d "${destPath}"`
                onLog?.(`Running: ${command}`)
                onLog?.(`This may take a few minutes for large archives...`)

                exec(command, {
                    timeout: 300000, // 5 minutes timeout
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                }, (error, stdout, stderr) => {
                    if (stdout) onLog?.(stdout)
                    if (stderr) onLog?.(stderr)
                    if (error) {
                        if (error.killed) {
                            onLog?.(`Extraction timeout - archive may be too large or extraction stuck`)
                        }
                        onLog?.(`Extraction error: ${error.message}`)
                        reject(error)
                    } else {
                        onLog?.(`Extraction complete`)
                        resolve()
                    }
                })
            }
        })
    }

    async extractTar(archivePath: string, destPath: string, onLog?: (message: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = archivePath.endsWith('.xz')
                ? `tar -xJf "${archivePath}" -C "${destPath}"`
                : `tar -xzf "${archivePath}" -C "${destPath}"`

            onLog?.(`Running: ${command}`)
            onLog?.(`This may take a few minutes for large archives...`)

            exec(command, {
                timeout: 300000, // 5 minutes timeout
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            }, (error, stdout, stderr) => {
                if (stdout) onLog?.(stdout)
                if (stderr) onLog?.(stderr)
                if (error) {
                    if (error.killed) {
                        onLog?.(`Extraction timeout - archive may be too large or extraction stuck`)
                    }
                    onLog?.(`Extraction error: ${error.message}`)
                    reject(error)
                } else {
                    onLog?.(`Extraction complete`)
                    resolve()
                }
            })
        })
    }

    async runInstaller(installerPath: string, destPath: string, onLog?: (message: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            // For .exe installers like rustup-init.exe, run with silent install flags if possible
            const command = process.platform === 'win32'
                ? `"${installerPath}" -y --default-toolchain stable --profile minimal`
                : installerPath

            onLog?.(`Running installer: ${command}`)
            onLog?.(`This may take several minutes...`)

            exec(command, {
                cwd: destPath,
                timeout: 600000, // 10 minutes timeout for installers
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            }, (error, stdout, stderr) => {
                if (stdout) onLog?.(stdout)
                if (stderr) onLog?.(stderr)
                if (error) {
                    if (error.killed) {
                        onLog?.(`Installer timeout - installation may be stuck or requires user interaction`)
                    }
                    onLog?.(`Installer error: ${error.message}`)
                    reject(error)
                } else {
                    onLog?.(`Installation complete`)
                    resolve()
                }
            })
        })
    }

    async addToPath(runtimeId: string, installPath: string, onLog?: (message: string) => void): Promise<void> {
        // Find the bin directory
        let binPath = installPath
        if (fs.existsSync(path.join(installPath, 'bin'))) {
            binPath = path.join(installPath, 'bin')
            onLog?.(`Found bin directory: ${binPath}`)
        } else {
            onLog?.(`Using install directory as bin path: ${binPath}`)
        }

        // On Windows, add to user PATH via registry
        // On macOS/Linux, add to shell profile
        if (process.platform === 'win32') {
            // Windows: Use setx to add to user PATH
            onLog?.(`Adding to Windows PATH...`)
            return new Promise((resolve, _reject) => {
                exec(`setx PATH "%PATH%;${binPath}"`, {
                    timeout: 30000, // 30 seconds timeout
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                }, (error, stdout, stderr) => {
                    if (stdout) onLog?.(stdout)
                    if (stderr) onLog?.(stderr)
                    if (error) {
                        if (error.killed) {
                            onLog?.(`Warning: PATH update timeout`)
                        }
                        onLog?.(`Warning: Failed to add to PATH: ${error.message}`)
                        console.warn('[RuntimeManager] Failed to add to PATH, but continuing:', error)
                        resolve() // Don't fail installation if PATH update fails
                    } else {
                        onLog?.(`Successfully added to PATH`)
                        resolve()
                    }
                })
            })
        } else {
            // Unix: Add to .bashrc / .zshrc
            const shellRc = process.env.SHELL?.includes('zsh') ? '.zshrc' : '.bashrc'
            const rcPath = path.join(process.env.HOME || '', shellRc)
            const exportLine = `\nexport PATH="${binPath}:$PATH"\n`

            onLog?.(`Updating ${shellRc}...`)
            try {
                const content = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, 'utf-8') : ''
                if (!content.includes(binPath)) {
                    fs.appendFileSync(rcPath, exportLine)
                    onLog?.(`Added PATH export to ${shellRc}`)
                } else {
                    onLog?.(`PATH already configured in ${shellRc}`)
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error)
                onLog?.(`Warning: Failed to update shell profile: ${errorMsg}`)
                console.warn('[RuntimeManager] Failed to update shell profile:', error)
            }
        }
    }

    async removeFromPath(runtimeId: string): Promise<void> {
        const installation = this.installedRuntimes.get(runtimeId)
        if (!installation) return

        const binPath = path.join(installation.path, 'bin')

        if (process.platform === 'win32') {
            // Windows: Remove from PATH via registry (complex, skip for now)
            console.log('[RuntimeManager] Windows PATH removal not yet implemented')
        } else {
            // Unix: Remove from shell profile
            const shellRc = process.env.SHELL?.includes('zsh') ? '.zshrc' : '.bashrc'
            const rcPath = path.join(process.env.HOME || '', shellRc)

            try {
                if (fs.existsSync(rcPath)) {
                    const content = fs.readFileSync(rcPath, 'utf-8')
                    const lines = content.split('\n').filter(line => !line.includes(binPath))
                    fs.writeFileSync(rcPath, lines.join('\n'))
                }
            } catch (error) {
                console.warn('[RuntimeManager] Failed to update shell profile:', error)
            }
        }
    }

    async uninstallRuntime(runtimeId: string): Promise<{ success: boolean; error?: string }> {
        const installation = this.installedRuntimes.get(runtimeId)
        if (!installation) {
            return { success: false, error: 'Runtime not installed via Kalynt' }
        }

        try {
            // Remove from PATH
            await this.removeFromPath(runtimeId)

            // Delete installation directory
            if (fs.existsSync(installation.path)) {
                fs.rmSync(installation.path, { recursive: true, force: true })
            }

            // Remove from tracking
            this.installedRuntimes.delete(runtimeId)

            console.log(`[RuntimeManager] Uninstalled ${runtimeId}`)
            return { success: true }
        } catch (error) {
            console.error(`[RuntimeManager] Uninstall failed for ${runtimeId}:`, error)
            return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
    }

    async checkInstallation(runtimeId: string): Promise<{ isInstalled: boolean; version?: string; path?: string; managedByKalynt?: boolean }> {
        // Check if managed by Kalynt
        const managed = this.installedRuntimes.get(runtimeId)
        if (managed) {
            return {
                isInstalled: true,
                version: managed.version,
                path: managed.path,
                managedByKalynt: true
            }
        }

        // Check system installation
        const commands: Record<string, string> = {
            node: 'node --version',
            python: process.platform === 'win32' ? 'python --version' : 'python3 --version',
            rust: 'rustc --version',
            go: 'go version',
            java: 'java -version',
            dotnet: 'dotnet --version',
            ruby: 'ruby --version',
            php: 'php --version',
            gcc: 'gcc --version',
            kotlin: 'kotlin -version',
            swift: 'swift --version',
            scala: 'scala -version',
            perl: 'perl --version',
            lua: 'lua -v',
            haskell: 'ghc --version',
            elixir: 'elixir --version',
            r: 'R --version',
            julia: 'julia --version',
            dart: 'dart --version',
            zig: 'zig version',
            clojure: 'clojure --version',
            deno: 'deno --version',
            bun: 'bun --version',
            nasm: 'nasm -v',
            sass: 'sass --version',
            emscripten: 'emcc --version',
            wabt: 'wasm2wat --version',
            groovy: 'groovy --version',
            ocaml: 'ocaml -version',
            erlang: 'erl -eval "erlang:display(erlang:system_info(otp_release)), halt()." -noshell',
            fsharp: 'dotnet fsi --version',
            v: 'v version',
            nim: 'nim --version',
            csharp: 'dotnet --version',
            c: 'gcc --version',
            cpp: 'g++ --version',
            html: 'echo HTML5'
        }

        const command = commands[runtimeId]
        if (!command) return { isInstalled: false }

        return new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    resolve({ isInstalled: false })
                } else {
                    const output = stdout || stderr
                    const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
                    resolve({
                        isInstalled: true,
                        version: versionMatch ? versionMatch[1] : 'installed',
                        managedByKalynt: false
                    })
                }
            })
        })
    }
}
