/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Language Runtime Installation Service
// Handles downloading and installing programming language runtimes

export interface RuntimeDownloadProgress {
    runtimeId: string
    bytesDownloaded: number
    totalBytes: number
    speed: number
    status: 'downloading' | 'installing' | 'completed' | 'failed'
}

export interface RuntimeInstallation {
    id: string
    name: string
    version: string
    path: string
    isInstalled: boolean
}

class LanguageRuntimeService {
    private installations: Map<string, RuntimeInstallation> = new Map()
    private _progressCallback: ((progress: RuntimeDownloadProgress) => void) | null = null

    setProgressCallback(callback: (progress: RuntimeDownloadProgress) => void) {
        this._progressCallback = callback
    }

    // Notify progress callback if set
    private notifyProgress(progress: RuntimeDownloadProgress) {
        this._progressCallback?.(progress)
    }

    async checkInstallation(runtimeId: string): Promise<RuntimeInstallation | null> {
        try {
            if (!window.electronAPI?.code?.runCommand) {
                return null
            }

            const commands: Record<string, string> = {
                node: 'node --version',
                python: 'python --version',
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
                html: 'echo HTML5'
            }

            const command = commands[runtimeId]
            if (!command) return null

            const result = await window.electronAPI.code.runCommand('.', command)

            if (result.success && result.output) {
                const versionMatch = result.output.match(/(\d+\.\d+\.\d+)/)
                const version = versionMatch ? versionMatch[1] : 'installed'

                const installation: RuntimeInstallation = {
                    id: runtimeId,
                    name: runtimeId,
                    version,
                    path: command.split(' ')[0],
                    isInstalled: true
                }

                this.installations.set(runtimeId, installation)
                return installation
            }

            return null
        } catch (error) {
            console.error(`[RuntimeService] Check failed for ${runtimeId}:`, error)
            return null
        }
    }

    async checkAllInstallations(): Promise<Map<string, RuntimeInstallation>> {
        const runtimeIds = [
            'node', 'python', 'rust', 'go', 'java', 'dotnet', 'ruby', 'php',
            'gcc', 'kotlin', 'swift', 'scala', 'perl', 'lua', 'haskell',
            'elixir', 'r', 'julia', 'dart', 'zig', 'clojure',
            'deno', 'bun', 'nasm', 'sass', 'emscripten', 'wabt',
            'groovy', 'ocaml', 'erlang', 'fsharp', 'v', 'nim', 'html'
        ]

        await Promise.all(
            runtimeIds.map(id => this.checkInstallation(id))
        )

        return this.installations
    }

    async installRuntime(runtimeId: string, platform: NodeJS.Platform): Promise<{ success: boolean; error?: string }> {
        try {
            if (!window.electronAPI?.runtimeMgmt?.downloadAndInstall) {
                // Fallback to browser if runtime API not available
                return this.openBrowserInstall(runtimeId, platform)
            }

            // Setup progress listener
            if (window.electronAPI?.runtimeMgmt?.onDownloadProgress) {
                window.electronAPI.runtimeMgmt.onDownloadProgress((data: {
                    runtimeId: string
                    version?: string
                    bytesDownloaded?: number
                    totalBytes?: number
                    progress?: number
                    speed: number
                }) => {
                    if (data.runtimeId === runtimeId) {
                        this.notifyProgress({
                            runtimeId: data.runtimeId,
                            bytesDownloaded: data.bytesDownloaded ?? 0,
                            totalBytes: data.totalBytes ?? 100,
                            speed: data.speed,
                            status: 'downloading'
                        })
                    }
                })
            }

            // Setup status listener
            if (window.electronAPI?.runtimeMgmt?.onStatus) {
                window.electronAPI.runtimeMgmt.onStatus((data: {
                    runtimeId: string
                    version?: string
                    status: 'downloading' | 'installing' | 'completed' | 'failed'
                    message?: string
                    error?: string
                }) => {
                    if (data.runtimeId === runtimeId) {
                        this.notifyProgress({
                            runtimeId: data.runtimeId,
                            bytesDownloaded: data.status === 'completed' ? 100 : 0,
                            totalBytes: 100,
                            speed: 0,
                            status: data.status
                        })
                    }
                })
            }

            // Start download and installation
            const result = await window.electronAPI.runtimeMgmt.downloadAndInstall(runtimeId)

            // Cleanup listeners
            if (window.electronAPI?.runtimeMgmt?.removeListeners) {
                window.electronAPI.runtimeMgmt.removeListeners()
            }

            if (result.success) {
                // Refresh installation status
                await this.checkInstallation(runtimeId)
                return result
            } else if (result.error?.includes('not available for automatic download')) {
                // Fallback to browser download for languages without direct download support
                console.log(`[RuntimeService] Automatic download not available for ${runtimeId}, opening browser...`)
                return this.openBrowserInstall(runtimeId, platform)
            }

            return result
        } catch (error) {
            console.error(`[RuntimeService] Install failed for ${runtimeId}:`, error)
            this.notifyProgress({
                runtimeId,
                bytesDownloaded: 0,
                totalBytes: 0,
                speed: 0,
                status: 'failed'
            })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Installation failed'
            }
        }
    }

    private async openBrowserInstall(runtimeId: string, platform: NodeJS.Platform): Promise<{ success: boolean; error?: string }> {
        const downloadInfo = this.getDownloadInfo(runtimeId, platform)

        if (!downloadInfo) {
            return { success: false, error: 'No download information available for this platform' }
        }

        this.notifyProgress({
            runtimeId,
            bytesDownloaded: 0,
            totalBytes: 0,
            speed: 0,
            status: 'installing'
        })

        if (window.electronAPI?.shell?.openExternal) {
            await window.electronAPI.shell.openExternal(downloadInfo.url)
            this.notifyProgress({
                runtimeId,
                bytesDownloaded: 100,
                totalBytes: 100,
                speed: 0,
                status: 'completed'
            })
            return { success: true }
        }

        return { success: false, error: 'Cannot open external links' }
    }

    private getDownloadInfo(runtimeId: string, platform: NodeJS.Platform): { url: string; filename: string } | null {
        const downloads: Record<string, Record<string, { url: string; filename: string }>> = {
            node: {
                win32: { url: 'https://nodejs.org/en/download/prebuilt-installer', filename: 'node-installer.msi' },
                darwin: { url: 'https://nodejs.org/en/download/prebuilt-installer', filename: 'node-installer.pkg' },
                linux: { url: 'https://nodejs.org/en/download/package-manager', filename: 'node-install' }
            },
            python: {
                win32: { url: 'https://www.python.org/downloads/windows/', filename: 'python-installer.exe' },
                darwin: { url: 'https://www.python.org/downloads/macos/', filename: 'python-installer.pkg' },
                linux: { url: 'https://www.python.org/downloads/', filename: 'python-install' }
            },
            rust: {
                win32: { url: 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe', filename: 'rustup-init.exe' },
                darwin: { url: 'https://rustup.rs/', filename: 'rustup-init.sh' },
                linux: { url: 'https://rustup.rs/', filename: 'rustup-init.sh' }
            },
            go: {
                win32: { url: 'https://go.dev/dl/', filename: 'go-installer.msi' },
                darwin: { url: 'https://go.dev/dl/', filename: 'go-installer.pkg' },
                linux: { url: 'https://go.dev/dl/', filename: 'go-linux.tar.gz' }
            },
            java: {
                win32: { url: 'https://adoptium.net/temurin/releases/?os=windows&arch=x64&package=jdk', filename: 'temurin-jdk.msi' },
                darwin: { url: 'https://adoptium.net/temurin/releases/?os=mac&package=jdk', filename: 'temurin-jdk.pkg' },
                linux: { url: 'https://adoptium.net/temurin/releases/?os=linux&package=jdk', filename: 'temurin-jdk.tar.gz' }
            },
            dotnet: {
                win32: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-installer.exe' },
                darwin: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-installer.pkg' },
                linux: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-install' }
            },
            ruby: {
                win32: { url: 'https://rubyinstaller.org/downloads/', filename: 'rubyinstaller-devkit.exe' },
                darwin: { url: 'https://www.ruby-lang.org/en/downloads/', filename: 'ruby-install' },
                linux: { url: 'https://www.ruby-lang.org/en/downloads/', filename: 'ruby-install' }
            },
            php: {
                win32: { url: 'https://windows.php.net/download/', filename: 'php-windows.zip' },
                darwin: { url: 'https://www.php.net/downloads', filename: 'php-source.tar.gz' },
                linux: { url: 'https://www.php.net/downloads', filename: 'php-source.tar.gz' }
            },
            gcc: {
                win32: { url: 'https://www.msys2.org/', filename: 'msys2-installer.exe' },
                darwin: { url: 'https://developer.apple.com/xcode/', filename: 'xcode-install' },
                linux: { url: 'https://gcc.gnu.org/install/', filename: 'gcc-build-essential' }
            },
            kotlin: {
                win32: { url: 'https://github.com/JetBrains/kotlin/releases/latest', filename: 'kotlin-compiler.zip' },
                darwin: { url: 'https://github.com/JetBrains/kotlin/releases/latest', filename: 'kotlin-compiler.zip' },
                linux: { url: 'https://github.com/JetBrains/kotlin/releases/latest', filename: 'kotlin-compiler.zip' }
            },
            swift: {
                win32: { url: 'https://www.swift.org/install/windows/', filename: 'swift-installer.exe' },
                darwin: { url: 'https://developer.apple.com/xcode/', filename: 'xcode-install' },
                linux: { url: 'https://www.swift.org/install/linux/', filename: 'swift-linux.tar.gz' }
            },
            scala: {
                win32: { url: 'https://www.scala-lang.org/download/', filename: 'scala-installer.msi' },
                darwin: { url: 'https://www.scala-lang.org/download/', filename: 'scala-install' },
                linux: { url: 'https://www.scala-lang.org/download/', filename: 'scala-install' }
            },
            perl: {
                win32: { url: 'https://strawberryperl.com/', filename: 'strawberry-perl-installer.msi' },
                darwin: { url: 'https://www.perl.org/get.html', filename: 'perl-install' },
                linux: { url: 'https://www.perl.org/get.html', filename: 'perl-install' }
            },
            lua: {
                win32: { url: 'https://github.com/rjpcomputing/luaforwindows/releases', filename: 'lua-for-windows.exe' },
                darwin: { url: 'https://www.lua.org/download.html', filename: 'lua-source.tar.gz' },
                linux: { url: 'https://www.lua.org/download.html', filename: 'lua-source.tar.gz' }
            },
            haskell: {
                win32: { url: 'https://www.haskell.org/ghcup/', filename: 'ghcup-installer.exe' },
                darwin: { url: 'https://www.haskell.org/ghcup/', filename: 'ghcup-install.sh' },
                linux: { url: 'https://www.haskell.org/ghcup/', filename: 'ghcup-install.sh' }
            },
            elixir: {
                win32: { url: 'https://github.com/elixir-lang/elixir-windows-setup/releases', filename: 'elixir-installer.exe' },
                darwin: { url: 'https://elixir-lang.org/install.html', filename: 'elixir-install' },
                linux: { url: 'https://elixir-lang.org/install.html', filename: 'elixir-install' }
            },
            r: {
                win32: { url: 'https://cran.r-project.org/bin/windows/base/', filename: 'R-installer.exe' },
                darwin: { url: 'https://cran.r-project.org/bin/macosx/', filename: 'R-installer.pkg' },
                linux: { url: 'https://cran.r-project.org/', filename: 'r-install' }
            },
            julia: {
                win32: { url: 'https://julialang.org/downloads/', filename: 'julia-installer.exe' },
                darwin: { url: 'https://julialang.org/downloads/', filename: 'julia-installer.dmg' },
                linux: { url: 'https://julialang.org/downloads/', filename: 'julia-linux.tar.gz' }
            },
            dart: {
                win32: { url: 'https://dart.dev/get-dart', filename: 'dart-sdk.zip' },
                darwin: { url: 'https://dart.dev/get-dart', filename: 'dart-sdk.zip' },
                linux: { url: 'https://dart.dev/get-dart', filename: 'dart-sdk.tar.gz' }
            },
            zig: {
                win32: { url: 'https://ziglang.org/download/', filename: 'zig-windows.zip' },
                darwin: { url: 'https://ziglang.org/download/', filename: 'zig-macos.tar.xz' },
                linux: { url: 'https://ziglang.org/download/', filename: 'zig-linux.tar.xz' }
            },
            clojure: {
                win32: { url: 'https://clojure.org/guides/install_clojure', filename: 'clojure-installer.ps1' },
                darwin: { url: 'https://clojure.org/guides/install_clojure', filename: 'clojure-install.sh' },
                linux: { url: 'https://clojure.org/guides/install_clojure', filename: 'clojure-install.sh' }
            },
            deno: {
                win32: { url: 'https://github.com/denoland/deno/releases/latest', filename: 'deno-x86_64-pc-windows-msvc.zip' },
                darwin: { url: 'https://github.com/denoland/deno/releases/latest', filename: 'deno-x86_64-apple-darwin.zip' },
                linux: { url: 'https://github.com/denoland/deno/releases/latest', filename: 'deno-x86_64-unknown-linux-gnu.zip' }
            },
            bun: {
                win32: { url: 'https://bun.sh/docs/installation', filename: 'bun-windows.zip' },
                darwin: { url: 'https://bun.sh/docs/installation', filename: 'bun-install.sh' },
                linux: { url: 'https://bun.sh/docs/installation', filename: 'bun-install.sh' }
            },
            nasm: {
                win32: { url: 'https://www.nasm.us/pub/nasm/releasebuilds/?C=M;O=D', filename: 'nasm-installer.exe' },
                darwin: { url: 'https://www.nasm.us/pub/nasm/releasebuilds/?C=M;O=D', filename: 'nasm-macos' },
                linux: { url: 'https://www.nasm.us/pub/nasm/releasebuilds/?C=M;O=D', filename: 'nasm-linux.tar.gz' }
            },
            sass: {
                win32: { url: 'https://github.com/sass/dart-sass/releases/latest', filename: 'dart-sass-windows.zip' },
                darwin: { url: 'https://github.com/sass/dart-sass/releases/latest', filename: 'dart-sass-macos.tar.gz' },
                linux: { url: 'https://github.com/sass/dart-sass/releases/latest', filename: 'dart-sass-linux.tar.gz' }
            },
            emscripten: {
                win32: { url: 'https://emscripten.org/docs/getting_started/downloads.html', filename: 'emsdk-portable.zip' },
                darwin: { url: 'https://emscripten.org/docs/getting_started/downloads.html', filename: 'emsdk-install' },
                linux: { url: 'https://emscripten.org/docs/getting_started/downloads.html', filename: 'emsdk-install' }
            },
            wabt: {
                win32: { url: 'https://github.com/WebAssembly/wabt/releases/latest', filename: 'wabt-windows.tar.gz' },
                darwin: { url: 'https://github.com/WebAssembly/wabt/releases/latest', filename: 'wabt-macos.tar.gz' },
                linux: { url: 'https://github.com/WebAssembly/wabt/releases/latest', filename: 'wabt-linux.tar.gz' }
            },
            groovy: {
                win32: { url: 'https://groovy.apache.org/download.html', filename: 'apache-groovy-sdk.zip' },
                darwin: { url: 'https://groovy.apache.org/download.html', filename: 'apache-groovy-sdk.zip' },
                linux: { url: 'https://groovy.apache.org/download.html', filename: 'apache-groovy-sdk.zip' }
            },
            ocaml: {
                win32: { url: 'https://ocaml.org/install', filename: 'ocaml-installer.exe' },
                darwin: { url: 'https://ocaml.org/install', filename: 'ocaml-install' },
                linux: { url: 'https://ocaml.org/install', filename: 'ocaml-install' }
            },
            erlang: {
                win32: { url: 'https://www.erlang.org/downloads', filename: 'otp_win64_installer.exe' },
                darwin: { url: 'https://www.erlang.org/downloads', filename: 'erlang-install' },
                linux: { url: 'https://www.erlang.org/downloads', filename: 'erlang-install' }
            },
            fsharp: {
                win32: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-installer.exe' },
                darwin: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-installer.pkg' },
                linux: { url: 'https://dotnet.microsoft.com/en-us/download', filename: 'dotnet-sdk-install' }
            },
            v: {
                win32: { url: 'https://github.com/vlang/v/releases/latest', filename: 'v_windows.zip' },
                darwin: { url: 'https://github.com/vlang/v/releases/latest', filename: 'v-install.sh' },
                linux: { url: 'https://github.com/vlang/v/releases/latest', filename: 'v-install.sh' }
            },
            nim: {
                win32: { url: 'https://nim-lang.org/install_windows.html', filename: 'nim-installer.exe' },
                darwin: { url: 'https://nim-lang.org/install.html', filename: 'nim-install' },
                linux: { url: 'https://nim-lang.org/install.html', filename: 'nim-install' }
            },
            html: {
                win32: { url: 'https://developer.mozilla.org/en-US/docs/Web/HTML', filename: 'html-browser' },
                darwin: { url: 'https://developer.mozilla.org/en-US/docs/Web/HTML', filename: 'html-browser' },
                linux: { url: 'https://developer.mozilla.org/en-US/docs/Web/HTML', filename: 'html-browser' }
            }
        }

        return downloads[runtimeId]?.[platform] || null
    }

    getInstallation(runtimeId: string): RuntimeInstallation | null {
        return this.installations.get(runtimeId) || null
    }

    getAllInstallations(): RuntimeInstallation[] {
        return Array.from(this.installations.values())
    }
}

export const languageRuntimeService = new LanguageRuntimeService()
