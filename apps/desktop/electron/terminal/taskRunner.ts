/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// main-process/taskRunner.ts
import { spawn, ChildProcess, ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export interface TaskDefinition {
    id: string
    label: string
    type: 'shell' | 'process' | 'npm' | 'maven' | 'gradle' | 'make' | 'python' | 'dotnet'
    command: string
    args?: string[]
    cwd?: string
    env?: { [key: string]: string }
    group?: 'build' | 'test' | 'run' | 'clean' | 'debug'
    problemMatcher?: string | string[]
    presentation?: {
        echo?: boolean
        reveal?: 'always' | 'silent' | 'never'
        focus?: boolean
        panel?: 'shared' | 'dedicated' | 'new'
        showReuseMessage?: boolean
        clear?: boolean
    }
    options?: {
        shell?: {
            executable?: string
            args?: string[]
        }
    }
}

export interface TaskExecution {
    id: string
    task: TaskDefinition
    process: ChildProcess
    startTime: number
    endTime?: number
    exitCode?: number
    output: string
    status: 'running' | 'succeeded' | 'failed' | 'cancelled'
    terminalId?: string
}

export interface TaskProvider {
    provideTasks(workspacePath: string): Promise<TaskDefinition[]>
    resolveTask(task: TaskDefinition): Promise<TaskDefinition>
}

export class TaskRunnerService extends EventEmitter {
    private readonly executions = new Map<string, TaskExecution>()
    private readonly taskProviders = new Map<string, TaskProvider>()
    private readonly detectedTasks = new Map<string, TaskDefinition[]>()

    constructor() {
        super()
        this.registerDefaultTaskProviders()
    }

    private registerDefaultTaskProviders(): void {
        // NPM/Node.js tasks
        this.registerTaskProvider('npm', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []
                const packageJsonPath = path.join(workspacePath, 'package.json')

                if (fs.existsSync(packageJsonPath)) {
                    try {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

                        if (packageJson.scripts) {
                            Object.entries(packageJson.scripts).forEach(([name, _command]) => {
                                tasks.push({
                                    id: `npm.${name}`,
                                    label: `npm run ${name}`,
                                    type: 'npm',
                                    command: 'npm',
                                    args: ['run', name],
                                    cwd: workspacePath,
                                    group: this.determineTaskGroup(name)
                                })
                            })
                        }
                    } catch (error) {
                        console.error('[TaskRunner] Error reading package.json:', error)
                    }
                }

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })

        // Maven tasks
        this.registerTaskProvider('maven', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []
                const pomPath = path.join(workspacePath, 'pom.xml')

                if (fs.existsSync(pomPath)) {
                    // Common Maven tasks
                    const mavenTasks = [
                        { name: 'compile', label: 'Maven: Compile' },
                        { name: 'test', label: 'Maven: Test' },
                        { name: 'package', label: 'Maven: Package' },
                        { name: 'clean', label: 'Maven: Clean' },
                        { name: 'install', label: 'Maven: Install' }
                    ]

                    mavenTasks.forEach(({ name, label }) => {
                        tasks.push({
                            id: `maven.${name}`,
                            label,
                            type: 'maven',
                            command: 'mvn',
                            args: [name],
                            cwd: workspacePath,
                            group: this.determineTaskGroup(name)
                        })
                    })
                }

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })

        // Python tasks
        this.registerTaskProvider('python', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []

                // Check for requirements.txt
                const requirementsPath = path.join(workspacePath, 'requirements.txt')
                if (fs.existsSync(requirementsPath)) {
                    tasks.push({
                        id: 'python.install',
                        label: 'Python: Install Dependencies',
                        type: 'python',
                        command: 'pip',
                        args: ['install', '-r', 'requirements.txt'],
                        cwd: workspacePath,
                        group: 'build'
                    })
                }

                // Check for setup.py
                const setupPath = path.join(workspacePath, 'setup.py')
                if (fs.existsSync(setupPath)) {
                    tasks.push({
                        id: 'python.setup',
                        label: 'Python: Setup Development',
                        type: 'python',
                        command: 'python',
                        args: ['setup.py', 'develop'],
                        cwd: workspacePath,
                        group: 'build'
                    })
                }

                // Add common Python tasks
                tasks.push(
                    {
                        id: 'python.run',
                        label: 'Python: Run',
                        type: 'python',
                        command: 'python',
                        args: ['.'],
                        cwd: workspacePath,
                        group: 'run'
                    },
                    {
                        id: 'python.test',
                        label: 'Python: Run Tests',
                        type: 'python',
                        command: 'pytest',
                        args: [],
                        cwd: workspacePath,
                        group: 'test'
                    }
                )

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })

        // Make tasks
        this.registerTaskProvider('make', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []
                const makefilePath = path.join(workspacePath, 'Makefile')

                if (fs.existsSync(makefilePath)) {
                    try {
                        // Read Makefile and extract targets
                        const makefileContent = fs.readFileSync(makefilePath, 'utf8')
                        const targetRegex = /^([a-zA-Z0-9_.-]+):/gm
                        let match

                        while ((match = targetRegex.exec(makefileContent)) !== null) {
                            const target = match[1]
                            if (!target.includes('.PHONY') && target !== 'all') {
                                tasks.push({
                                    id: `make.${target}`,
                                    label: `Make: ${target}`,
                                    type: 'make',
                                    command: 'make',
                                    args: [target],
                                    cwd: workspacePath,
                                    group: this.determineTaskGroup(target)
                                })
                            }
                        }
                    } catch (error) {
                        console.error('[TaskRunner] Error reading Makefile:', error)
                    }
                }

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })

        // .NET tasks
        this.registerTaskProvider('dotnet', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []

                // Find .csproj files
                const csprojFiles = this.findFiles(workspacePath, '*.csproj')

                if (csprojFiles.length > 0) {
                    const csprojPath = csprojFiles[0]
                    const projectName = path.basename(csprojPath, '.csproj')

                    tasks.push(
                        {
                            id: 'dotnet.build',
                            label: '.NET: Build',
                            type: 'dotnet',
                            command: 'dotnet',
                            args: ['build'],
                            cwd: workspacePath,
                            group: 'build'
                        },
                        {
                            id: 'dotnet.run',
                            label: `.NET: Run ${projectName}`,
                            type: 'dotnet',
                            command: 'dotnet',
                            args: ['run', '--project', csprojPath],
                            cwd: workspacePath,
                            group: 'run'
                        },
                        {
                            id: 'dotnet.test',
                            label: '.NET: Test',
                            type: 'dotnet',
                            command: 'dotnet',
                            args: ['test'],
                            cwd: workspacePath,
                            group: 'test'
                        },
                        {
                            id: 'dotnet.clean',
                            label: '.NET: Clean',
                            type: 'dotnet',
                            command: 'dotnet',
                            args: ['clean'],
                            cwd: workspacePath,
                            group: 'clean'
                        }
                    )
                }

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })

        // Gradle tasks
        this.registerTaskProvider('gradle', {
            provideTasks: async (workspacePath: string) => {
                const tasks: TaskDefinition[] = []
                const gradleBuildPath = path.join(workspacePath, 'build.gradle')
                const gradleBuildKtsPath = path.join(workspacePath, 'build.gradle.kts')

                if (fs.existsSync(gradleBuildPath) || fs.existsSync(gradleBuildKtsPath)) {
                    tasks.push(
                        {
                            id: 'gradle.build',
                            label: 'Gradle: Build',
                            type: 'gradle',
                            command: './gradlew',
                            args: ['build'],
                            cwd: workspacePath,
                            group: 'build'
                        },
                        {
                            id: 'gradle.test',
                            label: 'Gradle: Test',
                            type: 'gradle',
                            command: './gradlew',
                            args: ['test'],
                            cwd: workspacePath,
                            group: 'test'
                        },
                        {
                            id: 'gradle.clean',
                            label: 'Gradle: Clean',
                            type: 'gradle',
                            command: './gradlew',
                            args: ['clean'],
                            cwd: workspacePath,
                            group: 'clean'
                        },
                        {
                            id: 'gradle.run',
                            label: 'Gradle: Run',
                            type: 'gradle',
                            command: './gradlew',
                            args: ['run'],
                            cwd: workspacePath,
                            group: 'run'
                        }
                    )
                }

                return tasks
            },
            resolveTask: async (task: TaskDefinition) => task
        })
    }

    registerTaskProvider(type: string, provider: TaskProvider): void {
        this.taskProviders.set(type, provider)
    }

    async detectTasks(workspacePath: string): Promise<TaskDefinition[]> {
        const allTasks: TaskDefinition[] = []

        for (const [type, provider] of Array.from(this.taskProviders)) {
            try {
                const tasks = await provider.provideTasks(workspacePath)
                allTasks.push(...tasks)
            } catch (error) {
                console.error(`[TaskRunner] Error detecting ${type} tasks:`, error)
            }
        }

        // Cache detected tasks
        this.detectedTasks.set(workspacePath, allTasks)

        return allTasks
    }

    async executeTask(options: {
        id: string
        task: TaskDefinition
        terminalService: any
        getMainWindow: () => any
    }): Promise<{ success: boolean; executionId?: string; error?: string }> {
        try {
            const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

            // Resolve task if needed
            const resolvedTask = await this.resolveTask(options.task)

            // Create execution record
            const execution: TaskExecution = {
                id: executionId,
                task: resolvedTask,
                process: null as any,
                startTime: Date.now(),
                output: '',
                status: 'running'
            }

            // Determine command and arguments
            let command = resolvedTask.command
            const args = resolvedTask.args || []
            let shell = true
            const currentPlatform = process.platform

            // ENHANCE PATH
            const bundledBinPath = app.isPackaged 
                ? path.join(process.resourcesPath, 'bin')
                : path.join(app.getAppPath(), 'bin')
            
            const pathSeparator = currentPlatform === 'win32' ? ';' : ':'
            let enhancedPath = process.env.PATH || ''
            if (fs.existsSync(bundledBinPath)) {
                enhancedPath = `${bundledBinPath}${pathSeparator}${enhancedPath}`
            }

            // Handle different task types
            switch (resolvedTask.type) {
                case 'shell':
                    // shell is already true
                    break
                case 'process':
                    shell = false
                    break
                case 'npm':
                    command = currentPlatform === 'win32' ? 'npm.cmd' : 'npm'
                    break
                case 'maven':
                    command = currentPlatform === 'win32' ? 'mvn.cmd' : 'mvn'
                    break
                case 'gradle':
                    command = currentPlatform === 'win32' ? 'gradlew.bat' : './gradlew'
                    break
                case 'python':
                    command = currentPlatform === 'win32' ? 'python.exe' : 'python'
                    break
                case 'dotnet':
                    command = currentPlatform === 'win32' ? 'dotnet.exe' : 'dotnet'
                    break
            }

            // Spawn child process
            const childProcess: ChildProcessWithoutNullStreams = spawn(command, args, {
                cwd: resolvedTask.cwd || process.cwd(),
                env: { 
                    ...process.env, 
                    ...resolvedTask.env,
                    PATH: enhancedPath
                },
                shell: shell,
                stdio: ['pipe', 'pipe', 'pipe']
            })

            execution.process = childProcess
            this.executions.set(executionId, execution)

            // Setup output handling
            let output = ''

            const collectOutput = (data: Buffer, type: 'stdout' | 'stderr') => {
                const text = data.toString()
                output += text
                execution.output += text

                // Emit output event
                this.emit('task_output', {
                    executionId,
                    type,
                    data: text
                })

                // Send to renderer
                const mainWindow = options.getMainWindow()
                if (mainWindow) {
                    mainWindow.webContents.send('task:output', {
                        executionId,
                        type,
                        data: text
                    })
                }
            }

            childProcess.stdout?.on('data', (data: Buffer) => collectOutput(data, 'stdout'))
            childProcess.stderr?.on('data', (data: Buffer) => collectOutput(data, 'stderr'))

            // Handle process completion
            childProcess.on('exit', (code: number | null) => {
                execution.endTime = Date.now()
                execution.exitCode = code ?? undefined
                execution.status = code === 0 ? 'succeeded' : 'failed'

                this.emit('task_completed', {
                    executionId,
                    exitCode: code,
                    output,
                    duration: execution.endTime - execution.startTime
                })

                // Send completion to renderer
                const mainWindow = options.getMainWindow()
                if (mainWindow) {
                    mainWindow.webContents.send('task:completed', {
                        executionId,
                        exitCode: code,
                        status: execution.status,
                        duration: execution.endTime - execution.startTime
                    })
                }
            })

            childProcess.on('error', (error: Error) => {
                execution.endTime = Date.now()
                execution.status = 'failed'

                this.emit('task_error', {
                    executionId,
                    error: error.message
                })

                // Send error to renderer
                const mainWindow = options.getMainWindow()
                if (mainWindow) {
                    mainWindow.webContents.send('task:error', {
                        executionId,
                        error: error.message
                    })
                }
            })

            return { success: true, executionId }
        } catch (error) {
            console.error('[TaskRunner] Error executing task:', error)
            return { success: false, error: String(error) }
        }
    }

    async killTaskExecution(executionId: string): Promise<boolean> {
        const execution = this.executions.get(executionId)
        if (!execution) return false

        try {
            execution.process.kill()
            execution.status = 'cancelled'
            execution.endTime = Date.now()

            this.emit('task_cancelled', { executionId })

            return true
        } catch (error) {
            console.error(`[TaskRunner] Error killing execution ${executionId}:`, error)
            return false
        }
    }

    async getTaskExecutions(): Promise<TaskExecution[]> {
        return Array.from(this.executions.values())
    }

    async getTaskExecution(executionId: string): Promise<TaskExecution | undefined> {
        return this.executions.get(executionId)
    }

    private async resolveTask(task: TaskDefinition): Promise<TaskDefinition> {
        const provider = this.taskProviders.get(task.type)
        if (provider) {
            return await provider.resolveTask(task)
        }
        return task
    }

    private determineTaskGroup(taskName: string): 'build' | 'test' | 'run' | 'clean' {
        const lowerName = taskName.toLowerCase()

        if (lowerName.includes('test') || lowerName.includes('spec')) {
            return 'test'
        } else if (lowerName.includes('build') || lowerName.includes('compile')) {
            return 'build'
        } else if (lowerName.includes('run') || lowerName.includes('start')) {
            return 'run'
        } else if (lowerName.includes('clean') || lowerName.includes('purge')) {
            return 'clean'
        }

        return 'build'
    }

    private findFiles(dir: string, pattern: string): string[] {
        const files: string[] = []

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)

                if (entry.isDirectory()) {
                    files.push(...this.findFiles(fullPath, pattern))
                } else if (entry.isFile() && this.globToRegex(pattern).exec(entry.name)) {
                    files.push(fullPath)
                }
            }
        } catch (error) {
            console.error(`[TaskRunner] Error finding files in ${dir}:`, error)
        }

        return files
    }

    private globToRegex(pattern: string): RegExp {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
        return new RegExp(`^${escaped}$`)
    }

    dispose(): void {
        // Kill all running executions
        for (const [executionId, execution] of Array.from(this.executions)) {
            if (execution.status === 'running') {
                try {
                    execution.process.kill()
                } catch (error) {
                    console.error(`[TaskRunner] Error disposing execution ${executionId}:`, error)
                }
            }
        }

        this.executions.clear()
        this.detectedTasks.clear()
        this.taskProviders.clear()
        this.removeAllListeners()
    }
}