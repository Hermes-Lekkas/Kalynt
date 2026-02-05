/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path'
import fs from 'node:fs'
import { spawn, ChildProcess, execFileSync } from 'node:child_process'
import { shell } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import treeKill from 'tree-kill'

// Stateful map for running processes
const runningProcesses = new Map<string, ChildProcess>()

// Binary path cache for faster subsequent executions
// Maps binary name -> resolved path (or null if not found)
const binaryPathCache = new Map<string, string | null>()

// SECURITY FIX: Whitelist of safe environment variables to pass to child processes
// This prevents leaking sensitive credentials like API keys to user-executed code
const SAFE_ENV_VARS = new Set([
    // System paths
    'PATH', 'PATHEXT', 'COMSPEC', 'SHELL',
    // User/system info (non-sensitive)
    'HOME', 'USERPROFILE', 'USERNAME', 'USER', 'LOGNAME',
    'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
    // Localization
    'LANG', 'LC_ALL', 'LC_CTYPE', 'LANGUAGE', 'TZ',
    // Development tools
    'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH',
    'RUSTUP_HOME', 'CARGO_HOME', 'GOPATH', 'GOROOT',
    'JAVA_HOME', 'PYTHONPATH', 'PYTHONHOME',
    'GEM_HOME', 'GEM_PATH', 'BUNDLE_PATH',
    // Program locations
    'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData',
    'APPDATA', 'LOCALAPPDATA', 'CommonProgramFiles',
    'SystemRoot', 'SystemDrive', 'windir',
    // Terminal
    'TERM', 'COLORTERM', 'TERM_PROGRAM', 'FORCE_COLOR',
    // Editor/IDE
    'EDITOR', 'VISUAL', 'GIT_EDITOR',
])

/**
 * Create a safe environment object for child processes
 * SECURITY: Only includes whitelisted environment variables
 * Prevents leaking sensitive data like API keys to user code
 */
function getSafeEnv(): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {}
    Array.from(SAFE_ENV_VARS).forEach(key => {
        if (process.env[key] !== undefined) {
            safeEnv[key] = process.env[key]
        }
    })
    // Always include enhanced PATH
    safeEnv.PATH = getEnhancedPATH()
    return safeEnv
}

// Path validation helper - prevents path traversal attacks
function validatePath(base: string, target: string): string {
    const resolvedTarget = path.resolve(base, target)
    if (!resolvedTarget.startsWith(path.resolve(base))) {
        throw new Error('Path traversal detected')
    }
    return resolvedTarget
}

/**
 * Get enhanced PATH with common development tool locations
 * Ensures tools like cargo, rustc, etc. are found even if not in system PATH
 */
function getEnhancedPATH(): string {
    const currentPath = process.env.PATH || ''

    if (process.platform !== 'win32') {
        return currentPath
    }

    const userProfile = process.env.USERPROFILE || String.raw`C:\Users\Default`
    const programFiles = process.env['ProgramFiles'] || String.raw`C:\Program Files`
    const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming')
    const _localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local')

    const additionalPaths = [
        // Python
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python313'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python312'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python311'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts'),

        // Rust/Cargo
        path.join(userProfile, '.cargo', 'bin'),

        // Node.js / npm
        path.join(programFiles, 'nodejs'),
        `${appData}\\npm`,

        // Java
        path.join(programFiles, 'Java', 'jdk-21', 'bin'),
        path.join(programFiles, 'Eclipse Adoptium', 'jdk-21', 'bin'),

        // Go
        path.join(userProfile, 'go', 'bin'),
        path.join(programFiles, 'Go', 'bin'),

        // Git
        path.join(programFiles, 'Git', 'cmd'),
        path.join(programFiles, 'Git', 'bin'),
    ]

    let enhancedPath = currentPath
    for (const p of additionalPaths) {
        if (fs.existsSync(p) && !enhancedPath.toLowerCase().includes(p.toLowerCase())) {
            enhancedPath = `${p};${enhancedPath}`
        }
    }

    return enhancedPath
}

/**
 * Find a binary in the system PATH or common locations.
 * Uses caching to avoid repeated filesystem lookups.
 * @param name Binary name (e.g., 'tsx', 'node', 'python')
 * @param workspacePath Optional workspace path to check local node_modules/.bin
 * @returns Resolved path or null if not found
 */
async function findBinary(name: string, workspacePath?: string | null): Promise<string | null> {
    // Check cache first
    const cacheKey = workspacePath ? `${name}:${workspacePath}` : name
    if (binaryPathCache.has(cacheKey)) {
        return binaryPathCache.get(cacheKey)!
    }

    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.cmd' : ''

    // Priority 1: Check workspace-local node_modules/.bin (fastest for project tools)
    if (workspacePath) {
        const localBin = path.join(workspacePath, 'node_modules', '.bin', name + ext)
        try {
            await fs.promises.access(localBin, fs.constants.X_OK)
            console.log(`[CodeExec] Found local binary: ${localBin}`)
            binaryPathCache.set(cacheKey, localBin)
            return localBin
        } catch {
            // Not found locally, continue
        }
    }

    // Priority 2: Try to find in PATH using where/which
    try {
        // SECURITY FIX: Validate binary name to prevent command injection
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
            console.error(`[CodeExec] Invalid binary name: ${name}`)
            return null
        }

        const cmd = isWindows ? 'where' : 'which'
        const result = execFileSync(cmd, [name + ext], {
            encoding: 'utf8',
            timeout: 2000,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim()

        if (result) {
            // 'where' on Windows can return multiple lines, take the first
            const firstPath = result.split('\n')[0].trim()
            if (firstPath) {
                console.log(`[CodeExec] Found in PATH: ${firstPath}`)
                binaryPathCache.set(cacheKey, firstPath)
                return firstPath
            }
        }
    } catch {
        // Not found in PATH
    }

    // Priority 3: Check common global npm/node locations AND language-specific paths
    const userProfile = process.env.USERPROFILE || String.raw`C:\Users\Default`
    const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local')
    const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming')
    const programFiles = process.env.ProgramFiles || String.raw`C:\Program Files`

    const commonPaths = isWindows
        ? [
            // npm paths
            path.join(appData, 'npm', name + ext),
            path.join(localAppData, 'npm', name + ext),

            // Python paths (check both python and py)
            ...(name === 'python' || name === 'python3' ? [
                path.join(localAppData, 'Programs', 'Python', 'Python314', 'python.exe'),
                path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
                path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
                path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
                path.join(programFiles, 'Python314', 'python.exe'),
                path.join(programFiles, 'Python312', 'python.exe'),
                path.join(programFiles, 'Python311', 'python.exe'),
                String.raw`C:\Python314\python.exe`,
                String.raw`C:\Python312\python.exe`,
                String.raw`C:\Python311\python.exe`,
            ] : []),

            // Rust / Cargo
            ...(name === 'rustc' || name === 'cargo' ? [
                path.join(userProfile, '.cargo', 'bin', name + '.exe'),
            ] : []),

            // Java
            ...(name === 'java' || name === 'javac' ? [
                path.join(programFiles, 'Java', 'jdk-21', 'bin', name + '.exe'),
                path.join(programFiles, 'Eclipse Adoptium', 'jdk-21', 'bin', name + '.exe'),
                path.join(programFiles, 'Microsoft', 'jdk-17', 'bin', name + '.exe'),
            ] : []),

            // Go
            ...(name === 'go' ? [
                path.join(programFiles, 'Go', 'bin', 'go.exe'),
                path.join(userProfile, 'go', 'bin', 'go.exe'),
            ] : []),

            // Node.js
            ...(name === 'node' || name === 'npm' || name === 'npx' ? [
                path.join(programFiles, 'nodejs', name + '.exe'),
                path.join(programFiles, 'nodejs', name + '.cmd'),
            ] : []),
        ]
        : [
            `/usr/local/bin/${name}`,
            `/usr/bin/${name}`,
            path.join(process.env.HOME || '', '.npm-global', 'bin', name),
            path.join(process.env.HOME || '', '.nvm', 'current', 'bin', name),
            // Python on Unix
            ...(name === 'python' || name === 'python3' ? [
                '/usr/bin/python3',
                '/usr/local/bin/python3',
                path.join(process.env.HOME || '', '.pyenv', 'shims', 'python'),
            ] : []),
            // Rust on Unix
            ...(name === 'rustc' || name === 'cargo' ? [
                path.join(process.env.HOME || '', '.cargo', 'bin', name),
            ] : []),
        ]

    for (const binPath of commonPaths) {
        try {
            await fs.promises.access(binPath, fs.constants.X_OK)
            console.log(`[CodeExec] Found at common path: ${binPath}`)
            binaryPathCache.set(cacheKey, binPath)
            return binPath
        } catch {
            // Continue checking
        }
    }

    // Not found anywhere
    console.log(`[CodeExec] Binary not found: ${name}`)
    binaryPathCache.set(cacheKey, null)
    return null
}

/**
 * Wrap command for Windows .cmd/.bat files
 * On Windows with shell:false, .cmd files must be run through cmd.exe
 */
function wrapWindowsCommand(command: string, args: string[]): { command: string; args: string[] } {
    if (process.platform === 'win32' && (command.endsWith('.cmd') || command.endsWith('.bat'))) {
        return {
            command: process.env.COMSPEC || 'cmd.exe',
            args: ['/d', '/s', '/c', command, ...args]
        }
    }
    return { command, args }
}

/**
 * Get the best TypeScript runner available.
 * Priority: tsx (fastest) -> ts-node with --transpile-only -> ts-node -> npx ts-node (slowest)
 */
async function getTypeScriptRunner(workspacePath?: string | null): Promise<{ command: string; args: string[]; usesNpx: boolean }> {
    // Try tsx first (5-10x faster than ts-node, uses esbuild)
    const tsxPath = await findBinary('tsx', workspacePath)
    if (tsxPath) {
        const wrapped = wrapWindowsCommand(tsxPath, [])
        return { command: wrapped.command, args: wrapped.args, usesNpx: false }
    }

    // Try ts-node with --transpile-only (skips type checking, faster)
    const tsNodePath = await findBinary('ts-node', workspacePath)
    if (tsNodePath) {
        const wrapped = wrapWindowsCommand(tsNodePath, ['--transpile-only'])
        return { command: wrapped.command, args: wrapped.args, usesNpx: false }
    }

    // Fallback to npx (slowest but always available if npm is installed)
    console.log('[CodeExec] Warning: Using npx ts-node fallback (slower). Consider installing tsx globally: npm install -g tsx')
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const wrapped = wrapWindowsCommand(npx, ['--yes', 'tsx'])
    return { command: wrapped.command, args: wrapped.args, usesNpx: true }
}

// Helper to kill process tree (including children)
function killProcessTree(proc: ChildProcess): Promise<void> {
    if (!proc.pid) return Promise.resolve()

    return new Promise<void>((resolve) => {
        treeKill(proc.pid!, 'SIGKILL', (err) => {
            if (err) {
                console.error('[Main] tree-kill failed, using fallback:', err)
                // Fallback to platform-specific methods
                try {
                    if (process.platform === 'win32') {
                        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'])
                    } else {
                        process.kill(-proc.pid!, 'SIGKILL')
                    }
                } catch (error_) {
                    console.error('[Main] Fallback kill also failed:', error_)
                    proc.kill('SIGKILL')
                }
            }
            resolve()
        })
    })
}

/**
 * Get the optimal command and args for a given language.
 * Uses binary caching and smart fallbacks for performance.
 */
async function getLanguageCommand(
    normalizedLang: string,
    tempFile: string,
    tempDir: string,
    workspacePath?: string | null
): Promise<{ command: string; args: string[]; postCompileRun?: string; postCompileArgs?: string[] } | null> {
    const isWindows = process.platform === 'win32'

    switch (normalizedLang) {
        case 'javascript':
        case 'node': {
            const nodePath = await findBinary('node', workspacePath) || 'node'
            return { command: nodePath, args: [tempFile] }
        }

        case 'typescript': {
            const tsRunner = await getTypeScriptRunner(workspacePath)
            return {
                command: tsRunner.command,
                args: [...tsRunner.args, tempFile]
            }
        }

        case 'python': {
            // Try python3 first (more explicit), then python
            const python3 = await findBinary('python3', workspacePath)
            const python = await findBinary('python', workspacePath)
            const pythonCmd = python3 || python || (isWindows ? 'python' : 'python3')
            return { command: pythonCmd, args: [tempFile] }
        }

        case 'deno': {
            const denoPath = await findBinary('deno', workspacePath) || 'deno'
            // Security: Use minimal permissions instead of --allow-all
            return {
                command: denoPath,
                args: [
                    'run',
                    '--allow-read',  // Allow reading files (for imports)
                    '--allow-write', // Allow writing to stdout/stderr
                    tempFile
                ]
            }
        }

        case 'bun': {
            const bunPath = await findBinary('bun', workspacePath) || 'bun'
            return { command: bunPath, args: ['run', tempFile] }
        }

        case 'rust': {
            const rustcPath = await findBinary('rustc', workspacePath) || 'rustc'
            const rustBinary = path.join(tempDir, `kalynt_run${isWindows ? '.exe' : ''}`)

            // BUG #2: Use array args instead of shell string to prevent injection
            return {
                command: rustcPath,
                args: [tempFile, '-o', rustBinary],
                postCompileRun: rustBinary
            }
        }

        case 'go': {
            const goPath = await findBinary('go', workspacePath) || 'go'
            return { command: goPath, args: ['run', tempFile] }
        }

        case 'java': {
            const javacPath = await findBinary('javac', workspacePath) || 'javac'
            return {
                command: javacPath,
                args: [tempFile],
                postCompileRun: 'java',
                postCompileArgs: ['-cp', tempDir, 'Main']
            }
        }

        case 'dotnet':
        case 'csharp': {
            const dotnetPath = await findBinary('dotnet', workspacePath) || 'dotnet'
            return { command: dotnetPath, args: ['script', tempFile] }
        }

        case 'fsharp': {
            const dotnetPath = await findBinary('dotnet', workspacePath) || 'dotnet'
            return { command: dotnetPath, args: ['fsi', tempFile] }
        }

        case 'ruby': {
            const rubyPath = await findBinary('ruby', workspacePath) || 'ruby'
            return { command: rubyPath, args: [tempFile] }
        }

        case 'php': {
            const phpPath = await findBinary('php', workspacePath) || 'php'
            return { command: phpPath, args: [tempFile] }
        }

        case 'c':
        case 'gcc': {
            const gccPath = await findBinary('gcc', workspacePath) || 'gcc'
            const binaryPath = path.join(tempDir, `kalynt_run${isWindows ? '.exe' : ''}`)
            return {
                command: gccPath,
                args: [tempFile, '-o', binaryPath],
                postCompileRun: binaryPath
            }
        }

        case 'cpp': {
            const gppPath = await findBinary('g++', workspacePath) || 'g++'
            const binaryPath = path.join(tempDir, `kalynt_run${isWindows ? '.exe' : ''}`)
            return {
                command: gppPath,
                args: [tempFile, '-o', binaryPath],
                postCompileRun: binaryPath
            }
        }

        case 'kotlin': {
            const kotlinPath = await findBinary('kotlin', workspacePath) || 'kotlin'
            return { command: kotlinPath, args: [tempFile] }
        }

        case 'swift': {
            const swiftPath = await findBinary('swift', workspacePath) || 'swift'
            return { command: swiftPath, args: [tempFile] }
        }

        case 'scala': {
            const scalaPath = await findBinary('scala', workspacePath) || 'scala'
            return { command: scalaPath, args: [tempFile] }
        }

        case 'perl': {
            const perlPath = await findBinary('perl', workspacePath) || 'perl'
            return { command: perlPath, args: [tempFile] }
        }

        case 'lua': {
            const luaPath = await findBinary('lua', workspacePath) || 'lua'
            return { command: luaPath, args: [tempFile] }
        }

        case 'haskell': {
            const runghcPath = await findBinary('runghc', workspacePath) || 'runghc'
            return { command: runghcPath, args: [tempFile] }
        }

        case 'elixir': {
            const elixirPath = await findBinary('elixir', workspacePath) || 'elixir'
            return { command: elixirPath, args: [tempFile] }
        }

        case 'r': {
            const rscriptPath = await findBinary('Rscript', workspacePath) || 'Rscript'
            return { command: rscriptPath, args: [tempFile] }
        }

        case 'julia': {
            const juliaPath = await findBinary('julia', workspacePath) || 'julia'
            return { command: juliaPath, args: [tempFile] }
        }

        case 'dart': {
            const dartPath = await findBinary('dart', workspacePath) || 'dart'
            return { command: dartPath, args: ['run', tempFile] }
        }

        case 'zig': {
            const zigPath = await findBinary('zig', workspacePath) || 'zig'
            return { command: zigPath, args: ['run', tempFile] }
        }

        case 'clojure': {
            const clojurePath = await findBinary('clojure', workspacePath) || 'clojure'
            return { command: clojurePath, args: [tempFile] }
        }

        case 'groovy': {
            const groovyPath = await findBinary('groovy', workspacePath) || 'groovy'
            return { command: groovyPath, args: [tempFile] }
        }

        case 'ocaml': {
            const ocamlPath = await findBinary('ocaml', workspacePath) || 'ocaml'
            return { command: ocamlPath, args: [tempFile] }
        }

        case 'erlang': {
            const escriptPath = await findBinary('escript', workspacePath) || 'escript'
            return { command: escriptPath, args: [tempFile] }
        }

        case 'v': {
            const vPath = await findBinary('v', workspacePath) || 'v'
            return { command: vPath, args: ['run', tempFile] }
        }

        case 'nim': {
            const nimPath = await findBinary('nim', workspacePath) || 'nim'
            return { command: nimPath, args: ['compile', '--run', '--hints:off', tempFile] }
        }

        case 'html':
            // HTML is handled separately (opens in browser)
            return null

        default:
            return null
    }
}

/**
 * Get the file extension for a given language
 */
function getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
        javascript: '.js',
        node: '.js',
        typescript: '.ts',
        python: '.py',
        deno: '.ts',
        bun: '.js',
        rust: '.rs',
        go: '.go',
        java: '.java',
        dotnet: '.cs',
        csharp: '.cs',
        fsharp: '.fsx',
        ruby: '.rb',
        php: '.php',
        c: '.c',
        gcc: '.c',
        cpp: '.cpp',
        kotlin: '.kt',
        swift: '.swift',
        scala: '.scala',
        perl: '.pl',
        lua: '.lua',
        haskell: '.hs',
        elixir: '.exs',
        r: '.r',
        julia: '.jl',
        dart: '.dart',
        zig: '.zig',
        clojure: '.clj',
        groovy: '.groovy',
        ocaml: '.ml',
        erlang: '.erl',
        v: '.v',
        nim: '.nim',
        html: '.html'
    }
    return extensions[language] || '.txt'
}

export function registerCodeExecutionHandlers(
    ipcMain: Electron.IpcMain,
    app: Electron.App,
    getMainWindow: () => BrowserWindowType | null,
    getCurrentWorkspacePath: () => string | null
) {
    // Execute code in a temporary file
    ipcMain.handle('code:execute', async (_event, options: {
        id: string
        code: string
        language: string
        cwd?: string
    }) => {
        const startTime = Date.now()
        try {
            const { id, code, language, cwd } = options
            const tempDir = app.getPath('temp')
            const normalizedLang = language.toLowerCase()
            const currentWorkspacePath = getCurrentWorkspacePath()

            // Handle HTML specially (open in browser)
            if (normalizedLang === 'html') {
                const tempFile = path.join(tempDir, `kalynt_${id}.html`)
                await fs.promises.writeFile(tempFile, code)
                try {
                    await shell.openExternal(`file://${tempFile}`)
                    return {
                        success: true,
                        stdout: `HTML file opened in browser: ${tempFile}`,
                        stderr: '',
                        exitCode: 0
                    }
                } catch (err) {
                    return {
                        success: false,
                        error: `Failed to open HTML file: ${err instanceof Error ? err.message : String(err)}`
                    }
                }
            }

            // Get file extension and create temp file
            const ext = getFileExtension(normalizedLang)
            // Java requires specific filename
            const tempFile = normalizedLang === 'java'
                ? path.join(tempDir, 'Main.java')
                : path.join(tempDir, `kalynt_${id}${ext}`)

            // Write code to temp file
            await fs.promises.writeFile(tempFile, code)

            // Get the optimal command for this language
            const langCommand = await getLanguageCommand(normalizedLang, tempFile, tempDir, currentWorkspacePath) as any

            if (!langCommand) {
                return { success: false, error: `Unsupported language: ${language}` }
            }

            const setupTime = Date.now() - startTime
            console.log(`[CodeExec] Setup completed in ${setupTime}ms for ${language}`)

            const mainWindow = getMainWindow()

            // BUG #2: Handle compilation + execution separately
            if (langCommand.postCompileRun) {
                return new Promise((resolve) => {
                    let _compileOutput = ''
                    // Wrap Windows .cmd files for compilation
                    const wrappedCompile = wrapWindowsCommand(langCommand.command, langCommand.args)
                    const compileProc = spawn(wrappedCompile.command, wrappedCompile.args, {
                        cwd: tempDir,
                        shell: false,
                        env: getSafeEnv()
                    })

                    // BUG #8: Add to running processes
                    runningProcesses.set(`${id}_compile`, compileProc)

                    compileProc.stdout?.on('data', (data) => {
                        const output = data.toString()
                        _compileOutput += output
                        mainWindow?.webContents.send('code:output', { id, type: 'stdout', data: output })
                    })

                    compileProc.stderr?.on('data', (data) => {
                        const output = data.toString()
                        _compileOutput += output
                        mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: output })
                    })

                    compileProc.on('error', (err) => {
                        runningProcesses.delete(`${id}_compile`)
                        resolve({ success: false, error: `Compilation error: ${err.message}` })
                    })

                    compileProc.on('close', async (code) => {
                        runningProcesses.delete(`${id}_compile`)
                        if (code !== 0) {
                            resolve({ success: false, error: 'Compilation failed', exitCode: code })
                            return
                        }

                        // Now run the compiled binary
                        const runCommand = langCommand.postCompileRun
                        const runArgs = langCommand.postCompileArgs || []
                        // Wrap Windows .cmd files for execution
                        const wrappedRun = wrapWindowsCommand(runCommand, runArgs)
                        const proc = spawn(wrappedRun.command, wrappedRun.args, {
                            cwd: tempDir,
                            shell: false,
                            env: getSafeEnv()
                        })

                        runningProcesses.set(id, proc)

                        let stdout = ''
                        let stderr = ''

                        // BUG FIX: Add 5-minute timeout for the runner (was missing!)
                        const RUN_TIMEOUT = 300000 // 5 minutes
                        const runTimer = setTimeout(async () => {
                            if (runningProcesses.has(id)) {
                                await killProcessTree(proc)
                                runningProcesses.delete(id)
                                mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: '\nProcess timed out (5 min)\n' })
                                mainWindow?.webContents.send('code:exit', { id, exitCode: 1 })
                                try { fs.unlinkSync(tempFile) } catch { /* ignore */ }
                                resolve({ success: false, error: 'Execution timed out (5 min)' })
                            }
                        }, RUN_TIMEOUT)

                        proc.stdout?.on('data', (data) => {
                            const output = data.toString()
                            stdout += output
                            mainWindow?.webContents.send('code:output', { id, type: 'stdout', data: output })
                        })

                        proc.stderr?.on('data', (data) => {
                            const output = data.toString()
                            stderr += output
                            mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: output })
                        })

                        proc.on('close', async (exitCode) => {
                            clearTimeout(runTimer) // Clear timeout on normal completion
                            runningProcesses.delete(id)
                            try { await fs.promises.unlink(tempFile) } catch { /* ignore */ }
                            mainWindow?.webContents.send('code:exit', { id, exitCode })
                            resolve({ success: true, stdout, stderr, exitCode })
                        })

                        proc.on('error', (error) => {
                            clearTimeout(runTimer) // Clear timeout on error
                            runningProcesses.delete(id)
                            const errorMsg = `Error spawning compiled binary: ${error.message}\n`
                            mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: errorMsg })
                            mainWindow?.webContents.send('code:exit', { id, exitCode: 1 })
                            resolve({ success: false, error: error.message })
                        })
                    })

                    // 30 second timeout for COMPILATION only
                    // (Runner has its own 5-minute timeout defined above)
                    setTimeout(() => {
                        if (runningProcesses.has(`${id}_compile`)) {
                            compileProc.kill('SIGKILL')
                            runningProcesses.delete(`${id}_compile`)
                            mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: '\nCompilation timed out (30s)\n' })
                            mainWindow?.webContents.send('code:exit', { id, exitCode: 1 })
                            resolve({ success: false, error: 'Compilation timed out (30s)' })
                        }
                    }, 30000)
                })
            }

            // Direct execution (no compilation)
            return new Promise((resolve) => {
                let stdout = ''
                let stderr = ''
                let safeCwd = cwd || tempDir
                const { command, args } = langCommand

                if (cwd && currentWorkspacePath) {
                    try {
                        safeCwd = validatePath(currentWorkspacePath, cwd)
                    } catch (error_) {
                        console.error('[Main] Invalid CWD for code execution, falling back to temp:', error_)
                        safeCwd = tempDir
                    }
                }

                // Wrap Windows .cmd files
                const wrapped = wrapWindowsCommand(command, args)

                const proc = spawn(wrapped.command, wrapped.args, {
                    cwd: safeCwd,
                    shell: false,
                    env: {
                        ...getSafeEnv(),
                        NODE_NO_WARNINGS: '1',
                        NO_UPDATE_NOTIFIER: '1'
                    }
                })

                runningProcesses.set(id, proc)

                proc.stdout?.on('data', (data) => {
                    const output = data.toString()
                    stdout += output
                    mainWindow?.webContents.send('code:output', { id, type: 'stdout', data: output })
                })

                proc.stderr?.on('data', (data) => {
                    const output = data.toString()
                    stderr += output
                    mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: output })
                })

                proc.on('close', async (exitCode) => {
                    // BUG #8: Clean up process map
                    runningProcesses.delete(id)
                    try { await fs.promises.unlink(tempFile) } catch { /* ignore */ }
                    mainWindow?.webContents.send('code:exit', { id, exitCode })
                    resolve({ success: true, stdout, stderr, exitCode })
                })

                proc.on('error', (error) => {
                    // BUG #8: Clean up process map
                    runningProcesses.delete(id)
                    const errorMsg = `Error spawning ${language}: ${error.message}\n`
                    mainWindow?.webContents.send('code:output', { id, type: 'stderr', data: errorMsg })
                    mainWindow?.webContents.send('code:exit', { id, exitCode: 1 })
                    resolve({ success: false, error: error.message })
                })

                // 5 minute timeout (can be killed manually before this)
                setTimeout(() => {
                    if (runningProcesses.has(id)) {
                        proc.kill('SIGKILL')
                        runningProcesses.delete(id)
                        try { fs.unlinkSync(tempFile) } catch { /* ignore */ }
                        resolve({ success: false, error: 'Execution timed out (5 min)' })
                    }
                }, 300000)
            })
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Run a shell command (with allowlist)
    ipcMain.handle('code:runCommand', async (_event, cwd: string, commandString: string, id?: string) => {
        try {
            const ALLOWED = [
                'npm', 'git', 'node', 'python', 'ls', 'dir', 'echo', 'cat', 'type',
                'pip', 'python3', 'yarn', 'pnpm', 'npx', 'tsc', 'vite', 'tsx', 'bun'
            ]
            const [cmd, ...args] = commandString.trim().split(/\s+/)
            if (!ALLOWED.includes(cmd)) {
                return { success: false, error: `Command '${cmd}' is not in the allowlist.` }
            }

            let safeCwd = cwd
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (currentWorkspacePath) {
                try {
                    safeCwd = validatePath(currentWorkspacePath, cwd)
                } catch (error_) {
                    return { success: false, error: 'Invalid Working Directory' }
                }
            }

            // Try to find the optimal binary path
            const binaryPath = await findBinary(cmd, currentWorkspacePath)
            let executable = binaryPath || cmd

            // Windows: add .cmd extension for npm packages
            if (process.platform === 'win32' && !binaryPath) {
                if (['npm', 'npx', 'yarn', 'pnpm', 'tsc', 'vite', 'tsx'].includes(cmd)) {
                    executable = cmd + '.cmd'
                }
            }

            return new Promise((resolve) => {
                const proc = spawn(executable, args, {
                    cwd: safeCwd,
                    shell: false,
                    env: {
                        ...getSafeEnv(),
                        NO_UPDATE_NOTIFIER: '1'
                    }
                })

                if (id) {
                    runningProcesses.set(id, proc)
                }

                let output = ''
                proc.stdout?.on('data', (data) => output += data.toString())
                proc.stderr?.on('data', (data) => output += data.toString())
                proc.on('close', (code) => {
                    if (id) {
                        runningProcesses.delete(id)
                    }
                    resolve({ success: code === 0, output })
                })
                proc.on('error', (err) => {
                    if (id) {
                        runningProcesses.delete(id)
                    }
                    resolve({ success: false, error: err.message })
                })
                // 30 second timeout
                setTimeout(async () => {
                    await killProcessTree(proc)
                    resolve({ success: false, error: 'Command timed out' })
                }, 30000)
            })
        } catch (error_) {
            return { success: false, error: String(error_) }
        }
    })

    // Kill a running process
    ipcMain.handle('code:kill', async (_event, id: string) => {
        const proc = runningProcesses.get(id)
        if (proc) {
            await killProcessTree(proc)
            runningProcesses.delete(id)
            return { success: true }
        }
        return { success: false, error: 'Process not found' }
    })

    // Clear binary cache (useful if user installs new tools)
    ipcMain.handle('code:clearBinaryCache', async () => {
        binaryPathCache.clear()
        console.log('[CodeExec] Binary path cache cleared')
        return { success: true }
    })

    // BUG #10: Clear both caches
    ipcMain.handle('code:clearCache', async () => {
        binaryPathCache.clear()
        console.log('[CodeExec] Code execution cache cleared')
        return { success: true }
    })
}
