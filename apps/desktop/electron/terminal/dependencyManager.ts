/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * DependencyManager - Unified package manager integration for all supported languages
 * 
 * Handles dependency installation, removal, listing, and detection for:
 * - JavaScript/TypeScript: npm, yarn, pnpm, bun
 * - Python: pip, pip3
 * - Rust: cargo
 * - Go: go mod
 * - Ruby: gem, bundler
 * - PHP: composer
 * - Java: maven, gradle
 * - .NET: dotnet
 * - Dart/Flutter: pub
 */

import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'

// Package manager configuration
export interface PackageManagerConfig {
    name: string                    // Display name (npm, pip, cargo, etc.)
    command: string                 // Binary command
    installArgs: string[]           // Args for install (e.g., ['install'])
    installDevArgs?: string[]       // Args for dev dependency install
    uninstallArgs: string[]         // Args for uninstall
    updateArgs: string[]            // Args for update
    listArgs: string[]              // Args for listing installed packages
    manifestFile: string            // Config file (package.json, requirements.txt, etc.)
    lockFile?: string               // Lock file if applicable
    languageId: string              // Associated language ID
    globalFlag?: string             // Flag for global install (-g, --user, etc.)
    devFlag?: string                // Flag for dev dependencies (--save-dev, --dev)
    initCommand?: string[]          // Command to initialize new project
}

// Install options
export interface InstallOptions {
    global?: boolean
    dev?: boolean
    version?: string
    workspacePath: string
}

// Package info
export interface PackageInfo {
    name: string
    version: string
    isDev?: boolean
    description?: string
}

// Operation result
export interface DependencyResult {
    success: boolean
    output?: string
    error?: string
    exitCode?: number
}

// Supported package managers
const PACKAGE_MANAGERS: Record<string, PackageManagerConfig> = {
    // JavaScript/TypeScript
    npm: {
        name: 'npm',
        command: 'npm',
        installArgs: ['install'],
        installDevArgs: ['install', '--save-dev'],
        uninstallArgs: ['uninstall'],
        updateArgs: ['update'],
        listArgs: ['list', '--json', '--depth=0'],
        manifestFile: 'package.json',
        lockFile: 'package-lock.json',
        languageId: 'javascript',
        globalFlag: '-g',
        devFlag: '--save-dev',
        initCommand: ['init', '-y']
    },
    yarn: {
        name: 'yarn',
        command: 'yarn',
        installArgs: ['add'],
        installDevArgs: ['add', '--dev'],
        uninstallArgs: ['remove'],
        updateArgs: ['upgrade'],
        listArgs: ['list', '--json', '--depth=0'],
        manifestFile: 'package.json',
        lockFile: 'yarn.lock',
        languageId: 'javascript',
        globalFlag: 'global',
        devFlag: '--dev',
        initCommand: ['init', '-y']
    },
    pnpm: {
        name: 'pnpm',
        command: 'pnpm',
        installArgs: ['add'],
        installDevArgs: ['add', '--save-dev'],
        uninstallArgs: ['remove'],
        updateArgs: ['update'],
        listArgs: ['list', '--json', '--depth=0'],
        manifestFile: 'package.json',
        lockFile: 'pnpm-lock.yaml',
        languageId: 'javascript',
        globalFlag: '-g',
        devFlag: '--save-dev',
        initCommand: ['init']
    },
    bun: {
        name: 'bun',
        command: 'bun',
        installArgs: ['add'],
        installDevArgs: ['add', '--dev'],
        uninstallArgs: ['remove'],
        updateArgs: ['update'],
        listArgs: ['pm', 'ls'],
        manifestFile: 'package.json',
        lockFile: 'bun.lockb',
        languageId: 'javascript',
        globalFlag: '-g',
        devFlag: '--dev',
        initCommand: ['init', '-y']
    },

    // Python
    pip: {
        name: 'pip',
        command: 'pip',
        installArgs: ['install'],
        uninstallArgs: ['uninstall', '-y'],
        updateArgs: ['install', '--upgrade'],
        listArgs: ['list', '--format=json'],
        manifestFile: 'requirements.txt',
        languageId: 'python',
        globalFlag: '--user'
    },
    pip3: {
        name: 'pip3',
        command: 'pip3',
        installArgs: ['install'],
        uninstallArgs: ['uninstall', '-y'],
        updateArgs: ['install', '--upgrade'],
        listArgs: ['list', '--format=json'],
        manifestFile: 'requirements.txt',
        languageId: 'python',
        globalFlag: '--user'
    },

    // Rust
    cargo: {
        name: 'cargo',
        command: 'cargo',
        installArgs: ['add'],
        uninstallArgs: ['remove'],
        updateArgs: ['update'],
        listArgs: ['metadata', '--format-version=1', '--no-deps'],
        manifestFile: 'Cargo.toml',
        lockFile: 'Cargo.lock',
        languageId: 'rust',
        initCommand: ['init']
    },

    // Go
    go: {
        name: 'go',
        command: 'go',
        installArgs: ['get'],
        uninstallArgs: ['mod', 'edit', '-droprequire'],
        updateArgs: ['get', '-u'],
        listArgs: ['list', '-m', '-json', 'all'],
        manifestFile: 'go.mod',
        lockFile: 'go.sum',
        languageId: 'go',
        initCommand: ['mod', 'init']
    },

    // Ruby
    gem: {
        name: 'gem',
        command: 'gem',
        installArgs: ['install'],
        uninstallArgs: ['uninstall'],
        updateArgs: ['update'],
        listArgs: ['list', '--local'],
        manifestFile: 'Gemfile',
        languageId: 'ruby'
    },
    bundler: {
        name: 'bundler',
        command: 'bundle',
        installArgs: ['add'],
        uninstallArgs: ['remove'],
        updateArgs: ['update'],
        listArgs: ['list'],
        manifestFile: 'Gemfile',
        lockFile: 'Gemfile.lock',
        languageId: 'ruby',
        initCommand: ['init']
    },

    // PHP
    composer: {
        name: 'composer',
        command: 'composer',
        installArgs: ['require'],
        installDevArgs: ['require', '--dev'],
        uninstallArgs: ['remove'],
        updateArgs: ['update'],
        listArgs: ['show', '--format=json'],
        manifestFile: 'composer.json',
        lockFile: 'composer.lock',
        languageId: 'php',
        devFlag: '--dev',
        initCommand: ['init', '--no-interaction']
    },

    // Java
    maven: {
        name: 'maven',
        command: 'mvn',
        installArgs: ['dependency:resolve'],
        uninstallArgs: ['dependency:purge-local-repository'],
        updateArgs: ['versions:use-latest-versions'],
        listArgs: ['dependency:list'],
        manifestFile: 'pom.xml',
        languageId: 'java',
        initCommand: ['archetype:generate', '-DgroupId=com.example', '-DartifactId=app', '-DarchetypeArtifactId=maven-archetype-quickstart']
    },
    gradle: {
        name: 'gradle',
        command: 'gradle',
        installArgs: ['dependencies'],
        uninstallArgs: [],
        updateArgs: ['dependencies', '--refresh-dependencies'],
        listArgs: ['dependencies', '--console=plain'],
        manifestFile: 'build.gradle',
        languageId: 'java'
    },

    // .NET
    dotnet: {
        name: 'dotnet',
        command: 'dotnet',
        installArgs: ['add', 'package'],
        uninstallArgs: ['remove', 'package'],
        updateArgs: ['add', 'package'],
        listArgs: ['list', 'package'],
        manifestFile: '*.csproj',
        languageId: 'csharp',
        initCommand: ['new', 'console']
    },

    // Dart/Flutter
    pub: {
        name: 'pub',
        command: 'dart',
        installArgs: ['pub', 'add'],
        installDevArgs: ['pub', 'add', '--dev'],
        uninstallArgs: ['pub', 'remove'],
        updateArgs: ['pub', 'upgrade'],
        listArgs: ['pub', 'deps', '--json'],
        manifestFile: 'pubspec.yaml',
        lockFile: 'pubspec.lock',
        languageId: 'dart',
        devFlag: '--dev',
        initCommand: ['create', '.']
    }
}

// Map language to preferred package manager
const LANGUAGE_TO_MANAGER: Record<string, string> = {
    javascript: 'npm',
    typescript: 'npm',
    python: 'pip',
    rust: 'cargo',
    go: 'go',
    ruby: 'bundler',
    php: 'composer',
    java: 'maven',
    kotlin: 'gradle',
    csharp: 'dotnet',
    fsharp: 'dotnet',
    dart: 'pub'
}

/**
 * Get enhanced PATH with common development tool locations
 */
function getEnhancedPATH(): string {
    const currentPath = process.env.PATH || ''

    if (process.platform !== 'win32') {
        return currentPath
    }

    const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default'
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const appData = process.env.APPDATA || `${userProfile}\\AppData\\Roaming`

    const additionalPaths = [
        // Python
        `${userProfile}\\AppData\\Local\\Programs\\Python\\Python313`,
        `${userProfile}\\AppData\\Local\\Programs\\Python\\Python313\\Scripts`,
        `${userProfile}\\AppData\\Local\\Programs\\Python\\Python312`,
        `${userProfile}\\AppData\\Local\\Programs\\Python\\Python312\\Scripts`,
        // Rust/Cargo
        `${userProfile}\\.cargo\\bin`,
        // Node.js / npm
        `${programFiles}\\nodejs`,
        `${appData}\\npm`,
        // Go
        `${userProfile}\\go\\bin`,
        `${programFiles}\\Go\\bin`,
        // Ruby
        `${programFiles}\\Ruby32-x64\\bin`,
        // .NET
        `${programFiles}\\dotnet`,
        `${userProfile}\\.dotnet\\tools`,
        // Git
        `${programFiles}\\Git\\cmd`,
    ]

    let enhancedPath = currentPath
    for (const p of additionalPaths) {
        if (fs.existsSync(p) && !enhancedPath.toLowerCase().includes(p.toLowerCase())) {
            enhancedPath = `${p};${enhancedPath}`
        }
    }

    return enhancedPath
}

export class DependencyManager extends EventEmitter {
    private mainWindow: BrowserWindow | null = null
    private runningProcesses = new Map<string, ChildProcess>()

    constructor() {
        super()
    }

    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window
    }

    /**
     * Check if a binary is available in PATH
     */
    private async isBinaryAvailable(command: string): Promise<boolean> {
        try {
            await new Promise((resolve, reject) => {
                spawn(command, ['--version'], { shell: true, env: { ...process.env, PATH: getEnhancedPATH() } })
                    .on('close', (code) => code === 0 ? resolve(true) : reject())
                    .on('error', reject)
            })
            return true
        } catch {
            return false
        }
    }

    /**
     * Get Python command, preferring virtual environment if available
     */
    private getPythonCommand(cwd: string): string {
        const venvPaths = [
            path.join(cwd, 'venv', 'Scripts', 'pip.exe'),    // Windows
            path.join(cwd, 'venv', 'bin', 'pip'),             // Unix
            path.join(cwd, '.venv', 'Scripts', 'pip.exe'),
            path.join(cwd, '.venv', 'bin', 'pip'),
            path.join(cwd, 'env', 'Scripts', 'pip.exe'),      // Alternative names
            path.join(cwd, 'env', 'bin', 'pip')
        ]

        for (const p of venvPaths) {
            if (fs.existsSync(p)) {
                console.log(`[DependencyManager] Found virtual environment at: ${p}`)
                return p
            }
        }

        return 'pip' // fallback to system pip
    }

    /**
     * Get installation instructions for a package manager
     */
    private getInstallInstructions(command: string): string {
        const instructions: Record<string, string> = {
            npm: 'Download Node.js from https://nodejs.org',
            yarn: 'Install via npm: npm install -g yarn',
            pnpm: 'Install via npm: npm install -g pnpm',
            bun: 'Download from https://bun.sh',
            pip: 'Download Python from https://python.org',
            pip3: 'Download Python 3 from https://python.org',
            cargo: 'Install Rust from https://rustup.rs',
            go: 'Download Go from https://go.dev/dl',
            gem: 'Download Ruby from https://www.ruby-lang.org',
            bundle: 'Install via gem: gem install bundler',
            composer: 'Download from https://getcomposer.org',
            mvn: 'Download Maven from https://maven.apache.org',
            gradle: 'Download Gradle from https://gradle.org',
            dotnet: 'Download .NET SDK from https://dot.net',
            dart: 'Download Dart SDK from https://dart.dev'
        }
        return instructions[command] || `Please install ${command} to continue`
    }

    /**
     * Detect which package manager to use based on workspace files
     */
    async detectPackageManager(workspacePath: string): Promise<PackageManagerConfig | null> {
        try {
            const files = await fs.promises.readdir(workspacePath)

            // Check package.json for packageManager field (Corepack standard)
            if (files.includes('package.json')) {
                try {
                    const packageJsonPath = path.join(workspacePath, 'package.json')
                    const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8')
                    const packageJson = JSON.parse(packageJsonContent)

                    if (packageJson.packageManager) {
                        const managerName = packageJson.packageManager.split('@')[0]
                        console.log(`[DependencyManager] Detected package manager from package.json: ${managerName}`)

                        if (managerName === 'yarn' && PACKAGE_MANAGERS.yarn) return PACKAGE_MANAGERS.yarn
                        if (managerName === 'pnpm' && PACKAGE_MANAGERS.pnpm) return PACKAGE_MANAGERS.pnpm
                        if (managerName === 'npm' && PACKAGE_MANAGERS.npm) return PACKAGE_MANAGERS.npm
                        if (managerName === 'bun' && PACKAGE_MANAGERS.bun) return PACKAGE_MANAGERS.bun
                    }
                } catch (error) {
                    // If package.json can't be parsed, continue with lock file detection
                    console.log('[DependencyManager] Could not read packageManager field from package.json:', error)
                }
            }

            // Check for lock files (more specific than just manifest files)
            if (files.includes('yarn.lock')) return PACKAGE_MANAGERS.yarn
            if (files.includes('pnpm-lock.yaml')) return PACKAGE_MANAGERS.pnpm
            if (files.includes('bun.lockb')) return PACKAGE_MANAGERS.bun
            if (files.includes('package-lock.json')) return PACKAGE_MANAGERS.npm
            if (files.includes('Cargo.lock')) return PACKAGE_MANAGERS.cargo
            if (files.includes('Gemfile.lock')) return PACKAGE_MANAGERS.bundler
            if (files.includes('composer.lock')) return PACKAGE_MANAGERS.composer
            if (files.includes('pubspec.lock')) return PACKAGE_MANAGERS.pub
            if (files.includes('go.sum')) return PACKAGE_MANAGERS.go

            // Check for manifest files
            if (files.includes('package.json')) return PACKAGE_MANAGERS.npm
            if (files.includes('Cargo.toml')) return PACKAGE_MANAGERS.cargo
            if (files.includes('requirements.txt')) return PACKAGE_MANAGERS.pip
            if (files.includes('pyproject.toml')) return PACKAGE_MANAGERS.pip
            if (files.includes('Gemfile')) return PACKAGE_MANAGERS.bundler
            if (files.includes('composer.json')) return PACKAGE_MANAGERS.composer
            if (files.includes('go.mod')) return PACKAGE_MANAGERS.go
            if (files.includes('pom.xml')) return PACKAGE_MANAGERS.maven
            if (files.includes('build.gradle')) return PACKAGE_MANAGERS.gradle
            if (files.includes('pubspec.yaml')) return PACKAGE_MANAGERS.pub
            if (files.some(f => f.endsWith('.csproj'))) return PACKAGE_MANAGERS.dotnet

            return null
        } catch (error) {
            console.error('[DependencyManager] Error detecting package manager:', error)
            return null
        }
    }

    /**
     * Get package manager for a specific language
     */
    getPackageManagerForLanguage(languageId: string): PackageManagerConfig | null {
        const managerName = LANGUAGE_TO_MANAGER[languageId]
        return managerName ? PACKAGE_MANAGERS[managerName] : null
    }

    /**
     * Install a package
     */
    async installPackage(
        packageName: string,
        options: InstallOptions
    ): Promise<DependencyResult> {
        const manager = await this.detectPackageManager(options.workspacePath)
        if (!manager) {
            return { success: false, error: 'No package manager detected in workspace' }
        }

        // For Python, use virtual environment if available
        let commandToUse = manager.command
        if (manager.name === 'pip' || manager.name === 'pip3') {
            const venvCommand = this.getPythonCommand(options.workspacePath)
            if (venvCommand !== 'pip') {
                commandToUse = venvCommand
                console.log(`[DependencyManager] Using virtual environment: ${venvCommand}`)
            }
        }

        // Check if binary exists
        if (!(await this.isBinaryAvailable(manager.command))) {
            return {
                success: false,
                error: `${manager.name} is not installed.\n\nInstall instructions:\n${this.getInstallInstructions(manager.command)}`
            }
        }

        const args = [...(options.dev && manager.installDevArgs ? manager.installDevArgs : manager.installArgs)]

        // Add global flag if requested
        if (options.global && manager.globalFlag) {
            args.push(manager.globalFlag)
        }

        // Add package name with optional version
        const pkgSpec = options.version ? `${packageName}@${options.version}` : packageName
        args.push(pkgSpec)

        return this.runCommand(commandToUse, args, options.workspacePath)
    }

    /**
     * Install all dependencies from manifest file
     */
    async installAllDependencies(workspacePath: string): Promise<DependencyResult> {
        const manager = await this.detectPackageManager(workspacePath)
        if (!manager) {
            return { success: false, error: 'No package manager detected. Create a package.json, Cargo.toml, or requirements.txt first.' }
        }

        // For Python, use virtual environment if available
        let commandToUse = manager.command
        if (manager.name === 'pip' || manager.name === 'pip3') {
            const venvCommand = this.getPythonCommand(workspacePath)
            if (venvCommand !== 'pip') {
                commandToUse = venvCommand
                console.log(`[DependencyManager] Using virtual environment: ${venvCommand}`)
            }
        }

        // Check if binary exists
        if (!(await this.isBinaryAvailable(manager.command))) {
            return {
                success: false,
                error: `${manager.name} is not installed.\n\nInstall instructions:\n${this.getInstallInstructions(manager.command)}`
            }
        }

        // Special handling - most managers use 'install' with no package for all deps
        let args: string[]
        switch (manager.name) {
            case 'npm':
            case 'yarn':
            case 'pnpm':
            case 'bun':
                args = ['install']
                break
            case 'pip':
            case 'pip3':
                args = ['install', '-r', 'requirements.txt']
                break
            case 'cargo':
                args = ['build']
                break
            case 'go':
                args = ['mod', 'download']
                break
            case 'bundler':
                args = ['install']
                break
            case 'composer':
                args = ['install']
                break
            case 'maven':
                args = ['install', '-DskipTests']
                break
            case 'gradle':
                args = ['build', '-x', 'test']
                break
            case 'dotnet':
                args = ['restore']
                break
            case 'pub':
                args = ['pub', 'get']
                break
            default:
                args = manager.installArgs
        }

        return this.runCommand(commandToUse, args, workspacePath)
    }

    /**
     * Uninstall a package
     */
    async uninstallPackage(packageName: string, workspacePath: string): Promise<DependencyResult> {
        const manager = await this.detectPackageManager(workspacePath)
        if (!manager) {
            return { success: false, error: 'No package manager detected in workspace' }
        }

        const args = [...manager.uninstallArgs, packageName]
        return this.runCommand(manager.command, args, workspacePath)
    }

    /**
     * Update a package (or all packages if no name specified)
     */
    async updatePackage(packageName: string | null, workspacePath: string): Promise<DependencyResult> {
        const manager = await this.detectPackageManager(workspacePath)
        if (!manager) {
            return { success: false, error: 'No package manager detected in workspace' }
        }

        const args = [...manager.updateArgs]
        if (packageName) {
            args.push(packageName)
        }
        return this.runCommand(manager.command, args, workspacePath)
    }

    /**
     * List installed packages
     */
    async listPackages(workspacePath: string): Promise<{ success: boolean; packages?: PackageInfo[]; error?: string }> {
        const manager = await this.detectPackageManager(workspacePath)
        if (!manager) {
            return { success: false, error: 'No package manager detected in workspace' }
        }

        const result = await this.runCommand(manager.command, manager.listArgs, workspacePath, true)

        if (!result.success) {
            return { success: false, error: result.error }
        }

        // Parse output based on manager
        try {
            const packages = this.parsePackageList(manager.name, result.output || '')
            return { success: true, packages }
        } catch (error) {
            return { success: false, error: `Failed to parse package list: ${error}` }
        }
    }

    /**
     * Initialize a new project with the specified package manager
     */
    async initProject(managerName: string, workspacePath: string): Promise<DependencyResult> {
        const manager = PACKAGE_MANAGERS[managerName]
        if (!manager || !manager.initCommand) {
            return { success: false, error: `Cannot initialize project with ${managerName}` }
        }

        return this.runCommand(manager.command, manager.initCommand, workspacePath)
    }

    /**
     * Get all supported package managers
     */
    getSupportedManagers(): PackageManagerConfig[] {
        return Object.values(PACKAGE_MANAGERS)
    }

    /**
     * Kill a running operation
     */
    killOperation(operationId: string): boolean {
        const proc = this.runningProcesses.get(operationId)
        if (proc) {
            proc.kill('SIGTERM')
            this.runningProcesses.delete(operationId)
            return true
        }
        return false
    }

    /**
     * Run a package manager command
     */
    private runCommand(
        command: string,
        args: string[],
        cwd: string,
        silent = false
    ): Promise<DependencyResult> {
        return new Promise((resolve) => {
            const operationId = `deps_${Date.now()}`
            let stdout = ''
            let stderr = ''

            console.log(`[DependencyManager] Running: ${command} ${args.join(' ')} in ${cwd}`)

            const proc = spawn(command, args, {
                cwd,
                shell: true,
                env: {
                    ...process.env,
                    PATH: getEnhancedPATH()
                }
            })

            this.runningProcesses.set(operationId, proc)

            proc.stdout?.on('data', (data: Buffer) => {
                const output = data.toString()
                stdout += output
                if (!silent) {
                    this.mainWindow?.webContents.send('deps:output', {
                        operationId,
                        type: 'stdout',
                        data: output
                    })
                }
            })

            proc.stderr?.on('data', (data: Buffer) => {
                const output = data.toString()
                stderr += output
                if (!silent) {
                    this.mainWindow?.webContents.send('deps:output', {
                        operationId,
                        type: 'stderr',
                        data: output
                    })
                }
            })

            proc.on('close', (exitCode: number | null) => {
                this.runningProcesses.delete(operationId)
                const success = exitCode === 0

                this.mainWindow?.webContents.send('deps:complete', {
                    operationId,
                    success,
                    exitCode
                })

                resolve({
                    success,
                    output: stdout,
                    error: success ? undefined : stderr || `Process exited with code ${exitCode}`,
                    exitCode: exitCode ?? undefined
                })
            })

            proc.on('error', (error: Error) => {
                this.runningProcesses.delete(operationId)

                this.mainWindow?.webContents.send('deps:complete', {
                    operationId,
                    success: false,
                    error: error.message
                })

                resolve({
                    success: false,
                    error: error.message
                })
            })
        })
    }

    /**
     * Parse package list output based on manager
     */
    private parsePackageList(managerName: string, output: string): PackageInfo[] {
        try {
            switch (managerName) {
                case 'npm':
                case 'yarn':
                case 'pnpm': {
                    const data = JSON.parse(output)
                    const deps = data.dependencies || {}
                    return Object.entries(deps).map(([name, info]: [string, any]) => ({
                        name,
                        version: info.version || info
                    }))
                }
                case 'pip':
                case 'pip3': {
                    const packages = JSON.parse(output)
                    return packages.map((pkg: any) => ({
                        name: pkg.name,
                        version: pkg.version
                    }))
                }
                case 'cargo': {
                    const data = JSON.parse(output)
                    return (data.packages || []).map((pkg: any) => ({
                        name: pkg.name,
                        version: pkg.version
                    }))
                }
                default:
                    // For managers without JSON output, return empty
                    return []
            }
        } catch {
            return []
        }
    }
}

// Singleton instance
let dependencyManagerInstance: DependencyManager | null = null

export function getDependencyManager(): DependencyManager {
    if (!dependencyManagerInstance) {
        dependencyManagerInstance = new DependencyManager()
    }
    return dependencyManagerInstance
}
