/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
    Download, CheckCircle, XCircle, Loader2, Package,
    Hexagon, Terminal, Box, Zap, Coffee, Hash, Database,
    Code, Braces, FileCode, Cpu, Sparkles, Palette, Globe,
    Wrench, Music, Layers, Radio, Rocket, Triangle, Crown, FileText,
    X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface LanguagePlugin {
    id: string
    name: string
    description: string
    icon: LucideIcon
    downloadUrl: string
    installInstructions: string
    isInstalled: boolean
    version?: string
    supportsExecution: boolean
    managedByKalynt?: boolean
    supportsAutoInstall?: boolean
}

interface DownloadProgress {
    runtimeId: string
    version?: string
    bytesDownloaded?: number
    totalBytes?: number
    progress?: number
    speed: number
}

interface RuntimeStatus {
    runtimeId: string
    version?: string
    status: 'downloading' | 'installing' | 'completed' | 'failed'
    message?: string
    error?: string
}

const AVAILABLE_PLUGINS: LanguagePlugin[] = [
    {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript & TypeScript runtime environment',
        icon: Hexagon,
        downloadUrl: 'https://nodejs.org/en/download/',
        installInstructions: 'Automatically downloads and sets up Node.js with PATH configuration. Supports both chat and autonomous agent modes for JavaScript/TypeScript execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'python',
        name: 'Python',
        description: 'Python 3 runtime for scripting and data science',
        icon: Terminal,
        downloadUrl: 'https://www.python.org/downloads/',
        installInstructions: 'Automatically downloads and installs Python with PATH configuration. Supports both chat and autonomous agent modes for Python script execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'rust',
        name: 'Rust',
        description: 'Systems programming language with cargo toolchain',
        icon: Box,
        downloadUrl: 'https://www.rust-lang.org/tools/install',
        installInstructions: 'Automatically downloads and installs Rust with cargo toolchain. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'go',
        name: 'Go',
        description: 'Fast, statically typed compiled language',
        icon: Braces,
        downloadUrl: 'https://go.dev/dl/',
        installInstructions: 'Automatically downloads and installs Go toolchain with PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'java',
        name: 'Java (JDK)',
        description: 'Java Development Kit for Java applications',
        icon: Coffee,
        downloadUrl: 'https://www.oracle.com/java/technologies/downloads/',
        installInstructions: 'Automatically downloads and installs JDK with JAVA_HOME and PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'dotnet',
        name: '.NET SDK',
        description: 'C# and F# development platform',
        icon: Hash,
        downloadUrl: 'https://dotnet.microsoft.com/download',
        installInstructions: 'Automatically downloads and installs .NET SDK with PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'ruby',
        name: 'Ruby',
        description: 'Dynamic, object-oriented scripting language',
        icon: Database,
        downloadUrl: 'https://www.ruby-lang.org/en/downloads/',
        installInstructions: 'Automatically downloads and installs Ruby with PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'php',
        name: 'PHP',
        description: 'Server-side scripting language',
        icon: Code,
        downloadUrl: 'https://www.php.net/downloads',
        installInstructions: 'Automatically downloads and installs PHP with PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'gcc',
        name: 'C/C++ (GCC)',
        description: 'C and C++ compiler toolchain',
        icon: Cpu,
        downloadUrl: 'https://gcc.gnu.org/install/',
        installInstructions: 'Automatically installs GCC toolchain with PATH configuration. Windows: MinGW-w64. Mac: Xcode tools. Linux: system gcc/g++. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'kotlin',
        name: 'Kotlin',
        description: 'Modern JVM language for Android and more',
        icon: Triangle,
        downloadUrl: 'https://kotlinlang.org/docs/command-line.html',
        installInstructions: 'Automatically downloads and installs Kotlin compiler with PATH configuration. Requires Java JDK. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'swift',
        name: 'Swift',
        description: 'Apple\'s powerful programming language',
        icon: Zap,
        downloadUrl: 'https://www.swift.org/download/',
        installInstructions: 'Automatically installs Swift toolchain with PATH configuration. Mac: Xcode tools. Windows/Linux: Swift binaries. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'scala',
        name: 'Scala',
        description: 'Functional programming on the JVM',
        icon: Layers,
        downloadUrl: 'https://www.scala-lang.org/download/',
        installInstructions: 'Automatically downloads and installs Scala with PATH configuration. Requires Java JDK. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'perl',
        name: 'Perl',
        description: 'Highly capable text processing language',
        icon: FileCode,
        downloadUrl: 'https://www.perl.org/get.html',
        installInstructions: 'Automatically installs Perl with PATH configuration. Windows: Strawberry Perl. Mac/Linux: system perl. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'lua',
        name: 'Lua',
        description: 'Lightweight scripting language',
        icon: Sparkles,
        downloadUrl: 'https://www.lua.org/download.html',
        installInstructions: 'Automatically downloads and installs Lua with PATH configuration. Popular for game scripting and embedded systems. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'haskell',
        name: 'Haskell',
        description: 'Pure functional programming language',
        icon: Braces,
        downloadUrl: 'https://www.haskell.org/downloads/',
        installInstructions: 'Automatically installs GHCup and Haskell toolchain with PATH configuration. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'elixir',
        name: 'Elixir',
        description: 'Functional language for scalable applications',
        icon: Sparkles,
        downloadUrl: 'https://elixir-lang.org/install.html',
        installInstructions: 'Automatically installs Elixir and Erlang/OTP with PATH configuration. Great for concurrent systems. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'r',
        name: 'R',
        description: 'Statistical computing and graphics',
        icon: Database,
        downloadUrl: 'https://cran.r-project.org/',
        installInstructions: 'Automatically downloads and installs R with PATH configuration. Popular for data science and statistical analysis. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'julia',
        name: 'Julia',
        description: 'High-performance scientific computing',
        icon: Cpu,
        downloadUrl: 'https://julialang.org/downloads/',
        installInstructions: 'Automatically downloads and installs Julia with PATH configuration. Designed for numerical and scientific computing. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'dart',
        name: 'Dart',
        description: 'Language for Flutter and web apps',
        icon: Rocket,
        downloadUrl: 'https://dart.dev/get-dart',
        installInstructions: 'Automatically downloads and installs Dart SDK with PATH configuration. Used for Flutter mobile development and web apps. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'zig',
        name: 'Zig',
        description: 'Modern systems programming language',
        icon: Zap,
        downloadUrl: 'https://ziglang.org/download/',
        installInstructions: 'Automatically downloads and installs Zig with PATH configuration. A general-purpose language focused on robustness and performance. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'clojure',
        name: 'Clojure',
        description: 'Lisp dialect for the JVM',
        icon: Layers,
        downloadUrl: 'https://clojure.org/guides/install_clojure',
        installInstructions: 'Automatically installs Clojure CLI tools with PATH configuration. Requires Java JDK. Functional programming on the JVM. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'deno',
        name: 'Deno',
        description: 'Secure TypeScript/JavaScript runtime',
        icon: Terminal,
        downloadUrl: 'https://deno.land/manual/getting_started/installation',
        installInstructions: 'Automatically downloads and installs Deno with PATH configuration. Modern, secure runtime for JavaScript and TypeScript with built-in tooling. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'bun',
        name: 'Bun',
        description: 'Fast all-in-one JavaScript runtime',
        icon: Zap,
        downloadUrl: 'https://bun.sh/docs/installation',
        installInstructions: 'Automatically downloads and installs Bun with PATH configuration. Extremely fast JavaScript runtime with npm-compatible package manager. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'nasm',
        name: 'NASM',
        description: 'Netwide Assembler for x86/x64',
        icon: Cpu,
        downloadUrl: 'https://www.nasm.us/pub/nasm/releasebuilds/',
        installInstructions: 'Automatically downloads and installs NASM assembler with PATH configuration. For low-level x86/x64 assembly programming. Assembly code can be assembled and linked via terminal.',
        isInstalled: false,
        supportsExecution: false,
        supportsAutoInstall: true
    },
    {
        id: 'sass',
        name: 'Sass',
        description: 'CSS preprocessor with superpowers',
        icon: Palette,
        downloadUrl: 'https://sass-lang.com/install',
        installInstructions: 'Automatically installs Sass globally via npm with PATH configuration. Compiles Sass/SCSS to CSS. Can be run via terminal.',
        isInstalled: false,
        supportsExecution: false,
        supportsAutoInstall: true
    },
    {
        id: 'emscripten',
        name: 'Emscripten',
        description: 'C/C++ to WebAssembly compiler',
        icon: Globe,
        downloadUrl: 'https://emscripten.org/docs/getting_started/downloads.html',
        installInstructions: 'Automatically installs Emscripten SDK with PATH configuration. Compiles C/C++ to WebAssembly for web browsers. Includes Python dependencies.',
        isInstalled: false,
        supportsExecution: false,
        supportsAutoInstall: true
    },
    {
        id: 'wabt',
        name: 'WebAssembly Tools',
        description: 'WebAssembly Binary Toolkit',
        icon: Wrench,
        downloadUrl: 'https://github.com/WebAssembly/wabt/releases',
        installInstructions: 'Automatically downloads and installs WABT with PATH configuration. Tools for converting between WebAssembly text and binary formats (wat2wasm, wasm2wat, etc).',
        isInstalled: false,
        supportsExecution: false,
        supportsAutoInstall: true
    },
    {
        id: 'groovy',
        name: 'Groovy',
        description: 'Dynamic language for the JVM',
        icon: Music,
        downloadUrl: 'https://groovy.apache.org/download.html',
        installInstructions: 'Automatically downloads and installs Groovy with PATH configuration. Requires Java JDK. Dynamic scripting language for the JVM platform. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'ocaml',
        name: 'OCaml',
        description: 'Functional programming with strong types',
        icon: FileCode,
        downloadUrl: 'https://ocaml.org/install',
        installInstructions: 'Automatically installs OCaml with PATH configuration. Industrial-strength functional programming language. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'erlang',
        name: 'Erlang',
        description: 'Concurrent and fault-tolerant systems',
        icon: Radio,
        downloadUrl: 'https://www.erlang.org/downloads',
        installInstructions: 'Automatically downloads and installs Erlang/OTP with PATH configuration. Built for massively concurrent, distributed systems. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'fsharp',
        name: 'F#',
        description: 'Functional-first .NET language',
        icon: Hash,
        downloadUrl: 'https://fsharp.org/use/windows/',
        installInstructions: 'Automatically installs .NET SDK with F# support and PATH configuration. Functional programming on .NET platform. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'v',
        name: 'V',
        description: 'Simple, fast, safe compiled language',
        icon: Triangle,
        downloadUrl: 'https://github.com/vlang/v#installing-v-from-source',
        installInstructions: 'Automatically installs V language with PATH configuration. Simple language similar to Go. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'nim',
        name: 'Nim',
        description: 'Efficient, expressive, elegant language',
        icon: Crown,
        downloadUrl: 'https://nim-lang.org/install.html',
        installInstructions: 'Automatically downloads and installs Nim with PATH configuration. Compiles to C/C++ for high performance. Supports IDE code execution.',
        isInstalled: false,
        supportsExecution: true,
        supportsAutoInstall: true
    },
    {
        id: 'html',
        name: 'HTML',
        description: 'HyperText Markup Language for web pages',
        icon: FileText,
        downloadUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
        installInstructions: 'HTML is natively supported in all web browsers. No installation required. Create and preview HTML files directly in the IDE.',
        isInstalled: true,
        supportsExecution: true,
        supportsAutoInstall: true,
        managedByKalynt: false
    }
]

export default function PluginsPanel({ onClose }: { onClose: () => void }) {
    const [plugins, setPlugins] = useState<LanguagePlugin[]>(AVAILABLE_PLUGINS)
    const [checkingInstallations, setCheckingInstallations] = useState(false)
    const [installingId, setInstallingId] = useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map())
    const [runtimeStatus, setRuntimeStatus] = useState<Map<string, RuntimeStatus>>(new Map())
    const [installLogs, setInstallLogs] = useState<Map<string, string[]>>(new Map())

    // Check installation states
    const checkInstallations = useCallback(async () => {
        setCheckingInstallations(true)

        const updatedPlugins = await Promise.all(
            AVAILABLE_PLUGINS.map(async (plugin) => {
                try {
                    if (globalThis.window.electronAPI?.runtimeMgmt?.check) {
                        const result = await globalThis.window.electronAPI.runtimeMgmt.check(plugin.id)

                        if (result.success && result.isInstalled) {
                            return {
                                ...plugin,
                                isInstalled: true,
                                version: result.version,
                                managedByKalynt: result.managedByKalynt
                            }
                        }
                    }
                } catch (error) {
                    console.log(`${plugin.name} not found:`, error)
                }

                return { ...plugin, isInstalled: false, managedByKalynt: false }
            })
        )

        setPlugins(updatedPlugins)
        setCheckingInstallations(false)
    }, [])

    // Check installations on mount and set up listeners
    useEffect(() => {
        const init = async () => {
            await checkInstallations()
        }
        init()

        // Set up progress listeners
        if (window.electronAPI?.runtimeMgmt) {
            window.electronAPI.runtimeMgmt.onDownloadProgress((progress: { runtimeId: string; version?: string; bytesDownloaded?: number; totalBytes?: number; progress?: number; speed: number }) => {
                setDownloadProgress(prev => new Map(prev).set(progress.runtimeId, progress))
            })

            window.electronAPI.runtimeMgmt.onStatus((status: { runtimeId: string; version?: string; status: 'downloading' | 'installing' | 'completed' | 'failed'; message?: string; error?: string }) => {
                setRuntimeStatus(prev => new Map(prev).set(status.runtimeId, status))

                // Recheck installations when complete
                if (status.status === 'completed') {
                    setTimeout(() => checkInstallations(), 1000)
                    setInstallingId(null)
                } else if (status.status === 'failed') {
                    setInstallingId(null)
                }
            })

            window.electronAPI.runtimeMgmt.onLog((log: { runtimeId: string; version?: string; level: string; message: string }) => {
                setInstallLogs(prev => {
                    const logs = prev.get(log.runtimeId) || []
                    return new Map(prev).set(log.runtimeId, [...logs, log.message])
                })
            })
        }

        return () => {
            window.electronAPI?.runtimeMgmt?.removeListeners()
        }
    }, [checkInstallations])

    // REMOVED: duplicate checkInstallations definition was here, now moved above useEffect

    const installRuntime = async (plugin: LanguagePlugin) => {
        setInstallingId(plugin.id)
        // Clear previous logs
        setInstallLogs(prev => new Map(prev).set(plugin.id, []))

        try {
            // If auto-install is supported, use the new runtime manager
            if (plugin.supportsAutoInstall && globalThis.window.electronAPI?.runtimeMgmt?.downloadAndInstall) {
                const result = await globalThis.window.electronAPI.runtimeMgmt.downloadAndInstall(plugin.id)

                if (!result.success) {
                    console.error(`Installation failed for ${plugin.name}:`, result.error)
                    alert(`Failed to install ${plugin.name}: ${result.error}`)
                }
            } else {
                // Otherwise, open download page in external browser
                if (globalThis.window.electronAPI?.shell?.openExternal) {
                    await globalThis.window.electronAPI.shell.openExternal(plugin.downloadUrl)
                }
                setInstallingId(null)
            }
        } catch (error) {
            console.error('Failed to install runtime:', error)
            alert(`Failed to install ${plugin.name}`)
            setInstallingId(null)
        }
    }

    const uninstallRuntime = async (plugin: LanguagePlugin) => {
        if (!plugin.managedByKalynt) {
            alert(`${plugin.name} was not installed by Kalynt and cannot be automatically uninstalled.`)
            return
        }

        if (!confirm(`Are you sure you want to uninstall ${plugin.name}? This will remove it from your system and PATH.`)) {
            return
        }

        try {
            if (globalThis.window.electronAPI?.runtimeMgmt?.uninstall) {
                const result = await globalThis.window.electronAPI.runtimeMgmt.uninstall(plugin.id)

                if (result.success) {
                    await checkInstallations()
                } else {
                    alert(`Failed to uninstall ${plugin.name}: ${result.error}`)
                }
            }
        } catch (error) {
            console.error('Failed to uninstall runtime:', error)
            alert(`Failed to uninstall ${plugin.name}`)
        }
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
    }

    const formatSpeed = (bytesPerSecond: number): string => {
        return `${formatBytes(bytesPerSecond)}/s`
    }

    return createPortal(
        <div className="plugins-overlay" onClick={onClose}>
            <div className="plugins-panel" onClick={e => e.stopPropagation()}>
                <div className="plugins-header">
                    <div className="header-content">
                        <Package size={24} className="header-icon" />
                        <div>
                            <h2>Language Plugins</h2>
                            <p>Install programming language runtimes to execute code in the IDE</p>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="plugins-actions">
                    <button
                        className="btn-check-installations"
                        onClick={checkInstallations}
                        disabled={checkingInstallations}
                    >
                        {checkingInstallations ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Checking...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={16} />
                                Check Installations
                            </>
                        )}
                    </button>
                </div>

                <div className="plugins-list">
                    {plugins.map(plugin => {
                        const progress = downloadProgress.get(plugin.id)
                        const status = runtimeStatus.get(plugin.id)
                        const isInstalling = installingId === plugin.id

                        const IconComponent = plugin.icon

                        return (
                            <div key={plugin.id} className="plugin-card">
                                <div className="plugin-icon">
                                    <IconComponent size={40} strokeWidth={1.5} />
                                </div>
                                <div className="plugin-info">
                                    <div className="plugin-header-row">
                                        <h3>{plugin.name}</h3>
                                        {plugin.isInstalled ? (
                                            <div className="badge-group">
                                                <span className="badge-installed">
                                                    <CheckCircle size={14} />
                                                    {plugin.version || 'Installed'}
                                                </span>
                                                {plugin.managedByKalynt && (
                                                    <span className="badge-managed">Kalynt Managed</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="badge-not-installed">
                                                <XCircle size={14} />
                                                Not Installed
                                            </span>
                                        )}
                                    </div>
                                    <p className="plugin-description">{plugin.description}</p>
                                    <p className="plugin-instructions">{plugin.installInstructions}</p>
                                    {plugin.supportsExecution && (
                                        <span className="execution-badge">
                                            <Zap size={12} />
                                            Supports IDE Execution
                                        </span>
                                    )}

                                    {/* Download Progress */}
                                    {isInstalling && progress && (
                                        <div className="progress-container">
                                            <div className="progress-bar">
                                                <div
                                                    className="progress-fill"
                                                    style={{
                                                        width: progress.bytesDownloaded && progress.totalBytes
                                                            ? `${(progress.bytesDownloaded / progress.totalBytes) * 100}%`
                                                            : progress.progress ? `${progress.progress}%` : '0%'
                                                    }}
                                                />
                                            </div>
                                            <div className="progress-text">
                                                <span>
                                                    {progress.bytesDownloaded && progress.totalBytes
                                                        ? `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.totalBytes)}`
                                                        : progress.progress ? `${progress.progress.toFixed(1)}%` : 'Downloading...'}
                                                </span>
                                                <span>{formatSpeed(progress.speed)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Installation Status */}
                                    {isInstalling && status && (
                                        <div className="status-message">
                                            {status.status === 'downloading' && (
                                                <><Download size={14} /> Downloading...</>
                                            )}
                                            {status.status === 'installing' && (
                                                <><Package size={14} /> Installing...</>
                                            )}
                                            {status.status === 'completed' && (
                                                <><CheckCircle size={14} /> Installation complete!</>
                                            )}
                                            {status.status === 'failed' && (
                                                <><XCircle size={14} /> Failed: {status.error}</>
                                            )}
                                        </div>
                                    )}

                                    {/* Installation Logs */}
                                    {isInstalling && installLogs.get(plugin.id) && installLogs.get(plugin.id)!.length > 0 && (
                                        <div className="install-logs">
                                            {installLogs.get(plugin.id)!.map((log, index) => (
                                                <div key={index} className="log-line">
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="plugin-actions">
                                    {plugin.isInstalled && plugin.managedByKalynt ? (
                                        <button
                                            className="btn-uninstall"
                                            onClick={() => uninstallRuntime(plugin)}
                                            title="Uninstall"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    ) : (
                                        <button
                                            className={`btn-download ${plugin.isInstalled ? 'installed' : ''}`}
                                            onClick={() => installRuntime(plugin)}
                                            disabled={isInstalling || plugin.isInstalled}
                                            title={plugin.isInstalled ? "Already installed" : "Install"}
                                        >
                                            {isInstalling && <Loader2 size={16} className="animate-spin" />}
                                            {!isInstalling && plugin.isInstalled && <CheckCircle size={16} />}
                                            {!isInstalling && !plugin.isInstalled && <Download size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <style>{`
                    .plugins-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.7);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                        backdrop-filter: blur(4px);
                    }

                    .plugins-panel {
                        background: var(--color-surface);
                        border-radius: var(--radius-lg);
                        border: 1px solid var(--color-border);
                        box-shadow: var(--shadow-xl);
                        width: 90%;
                        max-width: 900px;
                        max-height: 85vh;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    .plugins-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: var(--space-5);
                        border-bottom: 1px solid var(--color-border-subtle);
                        background: var(--color-surface-subtle);
                    }

                    .header-content {
                        display: flex;
                        align-items: center;
                        gap: var(--space-3);
                    }

                    .header-icon {
                        color: var(--color-accent);
                    }

                    .plugins-header h2 {
                        margin: 0;
                        font-size: var(--text-lg);
                        font-weight: 700;
                        color: var(--color-text);
                    }

                    .plugins-header p {
                        margin: 4px 0 0 0;
                        font-size: var(--text-sm);
                        color: var(--color-text-secondary);
                    }

                    .close-btn {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                        color: var(--color-text-tertiary);
                        border-radius: var(--radius-md);
                        transition: all var(--transition-fast);
                        border: none;
                        background: transparent;
                        cursor: pointer;
                    }

                    .close-btn:hover {
                        background: var(--color-surface-elevated);
                        color: var(--color-text);
                    }

                    .plugins-actions {
                        padding: var(--space-4);
                        border-bottom: 1px solid var(--color-border-subtle);
                        display: flex;
                        justify-content: flex-end;
                    }

                    .btn-check-installations {
                        display: flex;
                        align-items: center;
                        gap: var(--space-2);
                        padding: 8px 16px;
                        background: var(--color-accent);
                        color: #000;
                        border: none;
                        border-radius: var(--radius-md);
                        font-size: var(--text-sm);
                        font-weight: 600;
                        cursor: pointer;
                        transition: all var(--transition-fast);
                    }

                    .btn-check-installations:hover:not(:disabled) {
                        filter: brightness(1.1);
                        transform: translateY(-1px);
                    }

                    .btn-check-installations:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }

                    .animate-spin {
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }

                    .plugins-list {
                        flex: 1;
                        overflow-y: auto;
                        padding: var(--space-4);
                        display: flex;
                        flex-direction: column;
                        gap: var(--space-3);
                    }

                    .plugin-card {
                        display: flex;
                        align-items: flex-start;
                        gap: var(--space-4);
                        padding: var(--space-4);
                        background: var(--color-surface-elevated);
                        border: 1px solid var(--color-border);
                        border-radius: var(--radius-lg);
                        transition: all var(--transition-fast);
                    }

                    .plugin-card:hover {
                        border-color: var(--color-accent);
                        box-shadow: var(--shadow-md);
                    }

                    .plugin-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 56px;
                        height: 56px;
                        flex-shrink: 0;
                        color: var(--color-accent);
                    }

                    .plugin-info {
                        flex: 1;
                        min-width: 0;
                    }

                    .plugin-header-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: var(--space-2);
                        gap: var(--space-2);
                    }

                    .plugin-info h3 {
                        margin: 0;
                        font-size: var(--text-md);
                        font-weight: 700;
                        color: var(--color-text);
                    }

                    .badge-group {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        flex-wrap: wrap;
                    }

                    .badge-installed {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 10px;
                        background: rgba(34, 197, 94, 0.1);
                        color: var(--color-success);
                        border-radius: var(--radius-sm);
                        font-size: 11px;
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    .badge-managed {
                        padding: 4px 8px;
                        background: rgba(59, 130, 246, 0.1);
                        color: var(--color-accent);
                        border-radius: var(--radius-sm);
                        font-size: 10px;
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    .badge-not-installed {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 10px;
                        background: rgba(239, 68, 68, 0.1);
                        color: var(--color-error);
                        border-radius: var(--radius-sm);
                        font-size: 11px;
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    .plugin-description {
                        margin: 0 0 var(--space-2) 0;
                        font-size: var(--text-sm);
                        color: var(--color-text-secondary);
                        line-height: 1.5;
                    }

                    .plugin-instructions {
                        margin: 0 0 var(--space-2) 0;
                        font-size: var(--text-xs);
                        color: var(--color-text-tertiary);
                        line-height: 1.5;
                        font-style: italic;
                    }

                    .execution-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 3px 8px;
                        background: rgba(59, 130, 246, 0.1);
                        color: var(--color-accent);
                        border-radius: var(--radius-sm);
                        font-size: 10px;
                        font-weight: 600;
                    }

                    .progress-container {
                        margin-top: var(--space-3);
                    }

                    .progress-bar {
                        width: 100%;
                        height: 6px;
                        background: var(--color-surface);
                        border-radius: var(--radius-sm);
                        overflow: hidden;
                        margin-bottom: var(--space-2);
                    }

                    .progress-fill {
                        height: 100%;
                        background: linear-gradient(90deg, var(--color-accent), var(--color-success));
                        transition: width 0.3s ease;
                    }

                    .progress-text {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        color: var(--color-text-secondary);
                    }

                    .status-message {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: var(--space-2);
                        padding: 8px 12px;
                        background: var(--color-surface);
                        border-radius: var(--radius-md);
                        font-size: 12px;
                        color: var(--color-text-secondary);
                        font-weight: 500;
                    }

                    .install-logs {
                        margin-top: var(--space-3);
                        padding: 12px;
                        background: #0a0a0a;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: var(--radius-md);
                        max-height: 200px;
                        overflow-y: auto;
                        font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
                    }

                    .log-line {
                        font-size: 11px;
                        color: #00ff00;
                        line-height: 1.6;
                        margin-bottom: 2px;
                        word-break: break-all;
                        white-space: pre-wrap;
                    }

                    .install-logs::-webkit-scrollbar {
                        width: 6px;
                    }

                    .install-logs::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 3px;
                    }

                    .install-logs::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 3px;
                    }

                    .install-logs::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.3);
                    }

                    .plugin-actions {
                        display: flex;
                        gap: var(--space-2);
                        flex-shrink: 0;
                    }

                    .btn-download {
                        position: relative;
                        width: 40px;
                        height: 40px;
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: var(--color-accent);
                        color: #000;
                        border: none;
                        border-radius: var(--radius-md);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                    }

                    .btn-download:hover:not(:disabled) {
                        filter: brightness(1.1);
                        transform: translateY(-2px);
                        box-shadow: var(--shadow-md);
                    }

                    .btn-download:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .btn-download.installed {
                        background: var(--color-success);
                    }

                    .btn-uninstall {
                        position: relative;
                        width: 40px;
                        height: 40px;
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(239, 68, 68, 0.1);
                        color: var(--color-error);
                        border: 1px solid rgba(239, 68, 68, 0.2);
                        border-radius: var(--radius-md);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                    }

                    .btn-uninstall:hover {
                        background: rgba(239, 68, 68, 0.2);
                        border-color: rgba(239, 68, 68, 0.4);
                        transform: translateY(-2px);
                        box-shadow: var(--shadow-md);
                    }
                `}</style>
            </div>
        </div>,
        document.body
    )
}
