/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// preload/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Enhanced terminal interface
interface TerminalAPI {
    spawn: (options: {
        id: string
        shell?: string
        cwd?: string
        cols?: number
        rows?: number
        env?: { [key: string]: string }
        title?: string
        processType?: 'shell' | 'task' | 'debug'
        metadata?: any
    }) => Promise<{ success: boolean; pid?: number; error?: string }>

    write: (options: { id: string; data: string }) => Promise<{ success: boolean; error?: string }>

    writeOutput: (options: { id: string; data: string }) => Promise<{ success: boolean; error?: string }>

    resize: (options: { id: string; cols: number; rows: number }) => Promise<{ success: boolean; error?: string }>

    kill: (id: string, signal?: string) => Promise<{ success: boolean; error?: string }>

    sendSignal: (id: string, signal: string) => Promise<{ success: boolean; error?: string }>

    getInfo: (id: string) => Promise<{ success: boolean; info?: any; error?: string }>

    getAll: () => Promise<{ success: boolean; terminals?: any[]; error?: string }>

    fork: (sourceId: string, newId: string) => Promise<{ success: boolean; error?: string }>

    sendSequence: (id: string, sequence: string) => Promise<{ success: boolean; error?: string }>

    clearHistory: (id: string) => Promise<{ success: boolean; error?: string }>

    saveState: (id: string) => Promise<{ success: boolean; state?: any; error?: string }>

    restoreState: (state: any) => Promise<{ success: boolean; id?: string; error?: string }>

    broadcast: (data: string, filter?: string) => Promise<{ success: boolean; count?: number; error?: string }>

    // Shell integration
    getCommandHistory: (terminalId: string) => Promise<{ success: boolean; history?: any[]; error?: string }>

    getCurrentCommand: (terminalId: string) => Promise<{ success: boolean; command?: any; error?: string }>

    // Events
    onData: (callback: (data: { id: string; data: string; type: string }) => void) => void

    onExit: (callback: (data: { id: string; exitCode: number; signal?: number; title: string }) => void) => void

    onSpawned: (callback: (data: { id: string; pid: number; title: string; cwd: string; shell: string }) => void) => void

    onRestored: (callback: (data: { id: string; pid: number; title: string }) => void) => void

    onCommandFinished: (callback: (data: { terminalId: string; command: any }) => void) => void

    onDecorationsAvailable: (callback: (data: { terminalId: string; commandId: string; decorations: any[] }) => void) => void

    removeListeners: () => void
}

// Language runtime interface
interface RuntimeAPI {
    // Language servers
    startLSP: (sessionId: string, languageId: string, workspacePath: string, options?: any) => Promise<{ success: boolean; error?: string }>

    stopLSP: (sessionId: string) => Promise<{ success: boolean; error?: string }>

    sendLSPRequest: (sessionId: string, method: string, params: any) => Promise<{ success: boolean; result?: any; error?: string }>

    getLanguageServers: () => Promise<{ success: boolean; servers?: any[]; error?: string }>

    // Debug sessions
    startDebug: (sessionId: string, languageId: string, program: string, options?: any) => Promise<{ success: boolean; port?: number; error?: string }>

    stopDebug: (sessionId: string) => Promise<{ success: boolean; error?: string }>

    sendDebugRequest: (sessionId: string, method: string, params: any) => Promise<{ success: boolean; result?: any; error?: string }>

    getDebugSessions: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>

    // Events
    onLanguageServerStarted: (callback: (data: { sessionId: string; languageId: string; capabilities: any }) => void) => void

    onLanguageServerStopped: (callback: (data: { sessionId: string; exitCode: number }) => void) => void

    onDebugSessionStarted: (callback: (data: { sessionId: string; languageId: string; port: number; configuration: any }) => void) => void

    onDebugSessionStopped: (callback: (data: { sessionId: string; exitCode: number }) => void) => void

    onDebugSessionError: (callback: (data: { sessionId: string; error: string }) => void) => void

    removeListeners: () => void
}

// Task runner interface
interface TasksAPI {
    detectTasks: (workspacePath: string) => Promise<{ success: boolean; tasks?: any[]; error?: string }>

    executeTask: (taskId: string, task: any) => Promise<{ success: boolean; executionId?: string; error?: string }>

    killTask: (executionId: string) => Promise<{ success: boolean; error?: string }>

    getExecutions: () => Promise<{ success: boolean; executions?: any[]; error?: string }>

    getExecution: (executionId: string) => Promise<{ success: boolean; execution?: any; error?: string }>

    // Events
    onTaskOutput: (callback: (data: { executionId: string; type: 'stdout' | 'stderr'; data: string }) => void) => void

    onTaskCompleted: (callback: (data: { executionId: string; exitCode: number; status: string; duration: number }) => void) => void

    onTaskError: (callback: (data: { executionId: string; error: string }) => void) => void

    onTaskCancelled: (callback: (data: { executionId: string }) => void) => void

    removeListeners: () => void
}

// Session management interface
interface SessionsAPI {
    createSession: (options: any) => Promise<{ success: boolean; session?: any; error?: string }>

    getSession: (sessionId: string) => Promise<{ success: boolean; session?: any; error?: string }>

    updateSession: (sessionId: string, updates: any) => Promise<{ success: boolean; error?: string }>

    deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>

    getAllSessions: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>

    getActiveSessions: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>

    saveSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>

    loadSession: (sessionId: string) => Promise<{ success: boolean; session?: any; error?: string }>

    exportSession: (sessionId: string, exportPath: string) => Promise<{ success: boolean; error?: string }>

    importSession: (importPath: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>

    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>

    clearOldSessions: (maxAgeHours?: number) => Promise<{ success: boolean; count?: number; error?: string }>

    // Events
    onSessionCreated: (callback: (data: { session: any }) => void) => void

    onSessionUpdated: (callback: (data: { sessionId: string; updates: any }) => void) => void

    onSessionDeleted: (callback: (data: { sessionId: string }) => void) => void

    removeListeners: () => void
}

// Enhanced Electron API with all terminal capabilities
contextBridge.exposeInMainWorld('electronAPI', {
    // Platform info
    platform: process.platform,

    // App info
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getModelsDirectory: () => ipcRenderer.invoke('get-models-directory'),

    // Hardware info
    getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),
    getRealTimeStats: () => ipcRenderer.invoke('get-realtime-stats'),

    // File operations
    fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),
    deleteModel: (path: string) => ipcRenderer.invoke('delete-model', path),

    // Model download
    downloadModel: (options: any) => ipcRenderer.invoke('download-model', options),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('cancel-download', modelId),
    pauseDownload: (modelId: string) => ipcRenderer.invoke('pause-download', modelId),
    resumeDownload: (modelId: string) => ipcRenderer.invoke('resume-download', modelId),
    onDownloadProgress: (callback: (progress: { modelId: string; bytesDownloaded: number; totalBytes: number; speed: number }) => void) => {
        const listener = (_event: IpcRendererEvent, data: { modelId: string; bytesDownloaded: number; totalBytes: number; speed: number }) => {
            callback(data)
        }
        ipcRenderer.on('download-progress', listener)
        // Return cleanup function
        return () => {
            ipcRenderer.removeListener('download-progress', listener)
        }
    },

    // LLM Inference
    loadModel: (options: any) => ipcRenderer.invoke('load-model', options),
    unloadModel: () => ipcRenderer.invoke('unload-model'),
    generateCompletion: (options: any) => ipcRenderer.invoke('generate-completion', options),
    generateCompletionStream: (options: any, onToken: (token: string) => void, onComplete: (error?: string) => void) => {
        const requestId = Math.random().toString(36).substring(7)
        const tokenListener = (_event: IpcRendererEvent, data: { requestId: string; token: string }) => {
            if (data.requestId === requestId) onToken(data.token)
        }
        const completeListener = (_event: IpcRendererEvent, data: { requestId: string; error?: string }) => {
            if (data.requestId === requestId) {
                ipcRenderer.removeListener('generate-completion-token', tokenListener)
                ipcRenderer.removeListener('generate-completion-complete', completeListener)
                onComplete(data.error)
            }
        }
        ipcRenderer.on('generate-completion-token', tokenListener)
        ipcRenderer.on('generate-completion-complete', completeListener)
        ipcRenderer.send('generate-completion-stream', { ...options, requestId })
        return requestId
    },
    cancelGeneration: (requestId: string) => ipcRenderer.invoke('cancel-generation', requestId),

    // ==========================================
    // Enhanced Terminal API
    // ==========================================
    terminal: {
        spawn: (options: any) => ipcRenderer.invoke('terminal:spawn', options),
        write: (options: { id: string; data: string }) => ipcRenderer.invoke('terminal:write', options),
        writeOutput: (options: { id: string; data: string }) => ipcRenderer.invoke('terminal:writeOutput', options),
        resize: (options: { id: string; cols: number; rows: number }) => ipcRenderer.invoke('terminal:resize', options),
        kill: (id: string, signal?: string) => ipcRenderer.invoke('terminal:kill', { id, signal }),
        sendSignal: (id: string, signal: string) => ipcRenderer.invoke('terminal:sendSignal', { id, signal }),
        getInfo: (id: string) => ipcRenderer.invoke('terminal:getInfo', id),
        getAll: () => ipcRenderer.invoke('terminal:getAll'),
        fork: (sourceId: string, newId: string) => ipcRenderer.invoke('terminal:fork', { sourceId, newId }),
        sendSequence: (id: string, sequence: string) => ipcRenderer.invoke('terminal:sendSequence', { id, sequence }),
        clearHistory: (id: string) => ipcRenderer.invoke('terminal:clearHistory', id),
        saveState: (id: string) => ipcRenderer.invoke('terminal:saveState', id),
        restoreState: (state: any) => ipcRenderer.invoke('terminal:restoreState', state),
        broadcast: (data: string, filter?: string) => ipcRenderer.invoke('terminal:broadcast', { data, filter }),
        getCommandHistory: (terminalId: string) => ipcRenderer.invoke('terminal:getCommandHistory', terminalId),
        getCurrentCommand: (terminalId: string) => ipcRenderer.invoke('terminal:getCurrentCommand', terminalId),

        // Events
        onData: (callback: (data: { id: string; data: string; type: string }) => void) => {
            ipcRenderer.on('terminal:data', (_event, data) => callback(data))
        },
        onExit: (callback: (data: { id: string; exitCode: number; signal?: number; title: string }) => void) => {
            ipcRenderer.on('terminal:exit', (_event, data) => callback(data))
        },
        onSpawned: (callback: (data: { id: string; pid: number; title: string; cwd: string; shell: string }) => void) => {
            ipcRenderer.on('terminal:spawned', (_event, data) => callback(data))
        },
        onRestored: (callback: (data: { id: string; pid: number; title: string }) => void) => {
            ipcRenderer.on('terminal:restored', (_event, data) => callback(data))
        },
        onCommandFinished: (callback: (data: { terminalId: string; command: any }) => void) => {
            ipcRenderer.on('terminal:commandFinished', (_event, data) => callback(data))
        },
        onDecorationsAvailable: (callback: (data: { terminalId: string; commandId: string; decorations: any[] }) => void) => {
            ipcRenderer.on('terminal:decorationsAvailable', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('terminal:data')
            ipcRenderer.removeAllListeners('terminal:exit')
            ipcRenderer.removeAllListeners('terminal:spawned')
            ipcRenderer.removeAllListeners('terminal:restored')
            ipcRenderer.removeAllListeners('terminal:commandFinished')
            ipcRenderer.removeAllListeners('terminal:decorationsAvailable')
        }
    } as TerminalAPI,

    // ==========================================
    // Language Runtime API
    // ==========================================
    runtime: {
        startLSP: (sessionId: string, languageId: string, workspacePath: string, options?: any) =>
            ipcRenderer.invoke('runtime:startLSP', { sessionId, languageId, workspacePath, options }),
        stopLSP: (sessionId: string) => ipcRenderer.invoke('runtime:stopLSP', sessionId),
        sendLSPRequest: (sessionId: string, method: string, params: any) =>
            ipcRenderer.invoke('runtime:sendLSPRequest', { sessionId, method, params }),
        getLanguageServers: () => ipcRenderer.invoke('runtime:getLanguageServers'),
        startDebug: (sessionId: string, languageId: string, program: string, options?: any) =>
            ipcRenderer.invoke('runtime:startDebug', { sessionId, languageId, program, options }),
        stopDebug: (sessionId: string) => ipcRenderer.invoke('runtime:stopDebug', sessionId),
        sendDebugRequest: (sessionId: string, method: string, params: any) =>
            ipcRenderer.invoke('runtime:sendDebugRequest', { sessionId, method, params }),
        getDebugSessions: () => ipcRenderer.invoke('runtime:getDebugSessions'),

        // Events
        onLanguageServerStarted: (callback: (data: { sessionId: string; languageId: string; capabilities: any }) => void) => {
            ipcRenderer.on('runtime:languageServerStarted', (_event, data) => callback(data))
        },
        onLanguageServerStopped: (callback: (data: { sessionId: string; exitCode: number }) => void) => {
            ipcRenderer.on('runtime:languageServerStopped', (_event, data) => callback(data))
        },
        onDebugSessionStarted: (callback: (data: { sessionId: string; languageId: string; port: number; configuration: any }) => void) => {
            ipcRenderer.on('runtime:debugSessionStarted', (_event, data) => callback(data))
        },
        onDebugSessionStopped: (callback: (data: { sessionId: string; exitCode: number }) => void) => {
            ipcRenderer.on('runtime:debugSessionStopped', (_event, data) => callback(data))
        },
        onDebugSessionError: (callback: (data: { sessionId: string; error: string }) => void) => {
            ipcRenderer.on('runtime:debugSessionError', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('runtime:languageServerStarted')
            ipcRenderer.removeAllListeners('runtime:languageServerStopped')
            ipcRenderer.removeAllListeners('runtime:debugSessionStarted')
            ipcRenderer.removeAllListeners('runtime:debugSessionStopped')
            ipcRenderer.removeAllListeners('runtime:debugSessionError')
        }
    } as RuntimeAPI,

    // ==========================================
    // Task Runner API
    // ==========================================
    tasks: {
        detectTasks: (workspacePath: string) => ipcRenderer.invoke('tasks:detectTasks', workspacePath),
        executeTask: (taskId: string, task: any) => ipcRenderer.invoke('tasks:executeTask', { taskId, task }),
        killTask: (executionId: string) => ipcRenderer.invoke('tasks:killTask', executionId),
        getExecutions: () => ipcRenderer.invoke('tasks:getExecutions'),
        getExecution: (executionId: string) => ipcRenderer.invoke('tasks:getExecution', executionId),

        // Events
        onTaskOutput: (callback: (data: { executionId: string; type: 'stdout' | 'stderr'; data: string }) => void) => {
            ipcRenderer.on('tasks:output', (_event, data) => callback(data))
        },
        onTaskCompleted: (callback: (data: { executionId: string; exitCode: number; status: string; duration: number }) => void) => {
            ipcRenderer.on('tasks:completed', (_event, data) => callback(data))
        },
        onTaskError: (callback: (data: { executionId: string; error: string }) => void) => {
            ipcRenderer.on('tasks:error', (_event, data) => callback(data))
        },
        onTaskCancelled: (callback: (data: { executionId: string }) => void) => {
            ipcRenderer.on('tasks:cancelled', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('tasks:output')
            ipcRenderer.removeAllListeners('tasks:completed')
            ipcRenderer.removeAllListeners('tasks:error')
            ipcRenderer.removeAllListeners('tasks:cancelled')
        }
    } as TasksAPI,

    // ==========================================
    // Session Management API
    // ==========================================
    sessions: {
        createSession: (options: any) => ipcRenderer.invoke('sessions:createSession', options),
        getSession: (sessionId: string) => ipcRenderer.invoke('sessions:getSession', sessionId),
        updateSession: (sessionId: string, updates: any) => ipcRenderer.invoke('sessions:updateSession', { sessionId, updates }),
        deleteSession: (sessionId: string) => ipcRenderer.invoke('sessions:deleteSession', sessionId),
        getAllSessions: () => ipcRenderer.invoke('sessions:getAllSessions'),
        getActiveSessions: () => ipcRenderer.invoke('sessions:getActiveSessions'),
        saveSession: (sessionId: string) => ipcRenderer.invoke('sessions:saveSession', sessionId),
        loadSession: (sessionId: string) => ipcRenderer.invoke('sessions:loadSession', sessionId),
        exportSession: (sessionId: string, exportPath: string) => ipcRenderer.invoke('sessions:exportSession', { sessionId, exportPath }),
        importSession: (importPath: string) => ipcRenderer.invoke('sessions:importSession', importPath),
        getStats: () => ipcRenderer.invoke('sessions:getStats'),
        clearOldSessions: (maxAgeHours?: number) => ipcRenderer.invoke('sessions:clearOldSessions', maxAgeHours),

        // Events
        onSessionCreated: (callback: (data: { session: any }) => void) => {
            ipcRenderer.on('sessions:created', (_event, data) => callback(data))
        },
        onSessionUpdated: (callback: (data: { sessionId: string; updates: any }) => void) => {
            ipcRenderer.on('sessions:updated', (_event, data) => callback(data))
        },
        onSessionDeleted: (callback: (data: { sessionId: string }) => void) => {
            ipcRenderer.on('sessions:deleted', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('sessions:created')
            ipcRenderer.removeAllListeners('sessions:updated')
            ipcRenderer.removeAllListeners('sessions:deleted')
        }
    } as SessionsAPI,

    // ==========================================
    // File System APIs (Enhanced)
    // ==========================================
    fs: {
        openFolder: () => ipcRenderer.invoke('fs:openFolder'),
        setWorkspace: (workspacePath: string) => ipcRenderer.invoke('fs:setWorkspace', workspacePath),
        readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
        stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
        readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
        readBinaryFile: (filePath: string) => ipcRenderer.invoke('fs:readBinaryFile', filePath),
        writeFile: (options: any) => ipcRenderer.invoke('fs:writeFile', options),
        createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
        createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
        delete: (itemPath: string) => ipcRenderer.invoke('fs:delete', itemPath),
        rename: (options: any) => ipcRenderer.invoke('fs:rename', options),
        watchDir: (options: any) => ipcRenderer.invoke('fs:watchDir', options),
        unwatchDir: (id: string) => ipcRenderer.invoke('fs:unwatchDir', id),
        onChange: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('fs:change', subscription)
            return () => {
                ipcRenderer.removeListener('fs:change', subscription)
            }
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('fs:change')
        },
        backupWorkspace: () => ipcRenderer.invoke('fs:backup')
    },

    // ==========================================
    // Code Execution APIs (Enhanced)
    // ==========================================
    code: {
        execute: (options: any) => ipcRenderer.invoke('code:execute', options),
        kill: (id: string) => ipcRenderer.invoke('code:kill', id),
        runCommand: (cwd: string, command: string, id?: string) => ipcRenderer.invoke('code:runCommand', cwd, command, id),
        onOutput: (callback: (data: any) => void) => {
            ipcRenderer.on('code:output', (_event, data) => callback(data))
        },
        onExit: (callback: (data: any) => void) => {
            ipcRenderer.on('code:exit', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('code:output')
            ipcRenderer.removeAllListeners('code:exit')
        },
        clearCache: () => ipcRenderer.invoke('code:clearCache')
    },

    // ==========================================
    // Dependency Management APIs
    // ==========================================
    deps: {
        detect: (workspacePath: string) => ipcRenderer.invoke('deps:detect', workspacePath),
        getForLanguage: (languageId: string) => ipcRenderer.invoke('deps:getForLanguage', languageId),
        install: (packageName: string, options: { workspacePath: string; global?: boolean; dev?: boolean; version?: string }) =>
            ipcRenderer.invoke('deps:install', packageName, options),
        installAll: (workspacePath: string) => ipcRenderer.invoke('deps:installAll', workspacePath),
        uninstall: (packageName: string, workspacePath: string) => ipcRenderer.invoke('deps:uninstall', packageName, workspacePath),
        update: (packageName: string | null, workspacePath: string) => ipcRenderer.invoke('deps:update', packageName, workspacePath),
        list: (workspacePath: string) => ipcRenderer.invoke('deps:list', workspacePath),
        init: (managerName: string, workspacePath: string) => ipcRenderer.invoke('deps:init', managerName, workspacePath),
        getSupportedManagers: () => ipcRenderer.invoke('deps:getSupportedManagers'),
        kill: (operationId: string) => ipcRenderer.invoke('deps:kill', operationId),
        onOutput: (callback: (data: { operationId: string; type: string; data: string }) => void) => {
            ipcRenderer.on('deps:output', (_event, data) => callback(data))
        },
        onComplete: (callback: (data: { operationId: string; success: boolean; exitCode?: number; error?: string }) => void) => {
            ipcRenderer.on('deps:complete', (_event, data) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('deps:output')
            ipcRenderer.removeAllListeners('deps:complete')
        }
    },

    // ==========================================
    // Git APIs
    // ==========================================
    git: {
        status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
        log: (options: any) => ipcRenderer.invoke('git:log', options),
        diff: (options: any) => ipcRenderer.invoke('git:diff', options),
        add: (options: any) => ipcRenderer.invoke('git:add', options),
        commit: (options: any) => ipcRenderer.invoke('git:commit', options),
        branch: (repoPath: string) => ipcRenderer.invoke('git:branch', repoPath),
        checkout: (options: any) => ipcRenderer.invoke('git:checkout', options),
        reset: (options: any) => ipcRenderer.invoke('git:reset', options),
        push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
        pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
        init: (repoPath: string) => ipcRenderer.invoke('git:init', repoPath),
        discard: (options: any) => ipcRenderer.invoke('git:discard', options),
        createBranch: (options: any) => ipcRenderer.invoke('git:createBranch', options),
        fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
        remote: (repoPath: string) => ipcRenderer.invoke('git:remote', repoPath)
    },


    // ==========================================
    // Shell Integration
    // ==========================================
    shell: {
        openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
        showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path)
    },

    // ==========================================
    // Window Controls
    // ==========================================
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),

    // ==========================================
    // Emergency Controls
    // ==========================================
    nukeProcesses: (level: any) => ipcRenderer.invoke('nuke-processes', level),

    // ==========================================
    // Build/Task APIs (Enhanced)
    // ==========================================
    build: {
        getTasks: (workspacePath: string) => ipcRenderer.invoke('build:getTasks', workspacePath),
        executeTask: (task: any, workspacePath: string) => ipcRenderer.invoke('build:executeTask', task, workspacePath),
        killTask: (taskId: string) => ipcRenderer.invoke('build:killTask', taskId),
        onOutput: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('build:output', subscription)
            return () => {
                ipcRenderer.removeListener('build:output', subscription)
            }
        },
        onEnd: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('build:end', subscription)
            return () => {
                ipcRenderer.removeListener('build:end', subscription)
            }
        },
        onProblems: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('build:problems', subscription)
            return () => {
                ipcRenderer.removeListener('build:problems', subscription)
            }
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('build:output')
            ipcRenderer.removeAllListeners('build:end')
            ipcRenderer.removeAllListeners('build:problems')
        }
    },

    // ==========================================
    // Debug APIs (Enhanced)
    // ==========================================
    debug: {
        getConfigurations: (workspacePath: string) => ipcRenderer.invoke('debug:getConfigurations', workspacePath),
        start: (configuration: any, workspacePath: string, activeFile?: string) => ipcRenderer.invoke('debug:start', configuration, workspacePath, activeFile),
        stop: (sessionId: string) => ipcRenderer.invoke('debug:stop', sessionId),
        setBreakpoints: (sessionId: string, file: string, breakpoints: any) => ipcRenderer.invoke('debug:setBreakpoints', sessionId, file, breakpoints),
        continue: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:continue', sessionId, threadId),
        stepOver: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:stepOver', sessionId, threadId),
        stepInto: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:stepInto', sessionId, threadId),
        stepOut: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:stepOut', sessionId, threadId),
        pause: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:pause', sessionId, threadId),
        getCallStack: (sessionId: string, threadId?: number) => ipcRenderer.invoke('debug:getCallStack', sessionId, threadId),
        getVariables: (sessionId: string, variablesReference: number) => ipcRenderer.invoke('debug:getVariables', sessionId, variablesReference),
        evaluate: (sessionId: string, expression: string, frameId?: number) => ipcRenderer.invoke('debug:evaluate', sessionId, expression, frameId),
        onStarted: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:started', subscription)
            return () => {
                ipcRenderer.removeListener('debug:started', subscription)
            }
        },
        onStopped: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:stopped', subscription)
            return () => {
                ipcRenderer.removeListener('debug:stopped', subscription)
            }
        },
        onContinued: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:continued', subscription)
            return () => {
                ipcRenderer.removeListener('debug:continued', subscription)
            }
        },
        onTerminated: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:terminated', subscription)
            return () => {
                ipcRenderer.removeListener('debug:terminated', subscription)
            }
        },
        onOutput: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:output', subscription)
            return () => {
                ipcRenderer.removeListener('debug:output', subscription)
            }
        },
        onBreakpoint: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:breakpoint', subscription)
            return () => {
                ipcRenderer.removeListener('debug:breakpoint', subscription)
            }
        },
        onEvent: (callback: (event: any) => void) => {
            const subscription = (_event: IpcRendererEvent, event: any) => callback(event)
            ipcRenderer.on('debug:event', subscription)
            return () => {
                ipcRenderer.removeListener('debug:event', subscription)
            }
        },
        onResponse: (callback: (response: any) => void) => {
            const subscription = (_event: IpcRendererEvent, response: any) => callback(response)
            ipcRenderer.on('debug:response', subscription)
            return () => {
                ipcRenderer.removeListener('debug:response', subscription)
            }
        },
        onError: (callback: (data: any) => void) => {
            const subscription = (_event: IpcRendererEvent, data: any) => callback(data)
            ipcRenderer.on('debug:error', subscription)
            return () => {
                ipcRenderer.removeListener('debug:error', subscription)
            }
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('debug:started')
            ipcRenderer.removeAllListeners('debug:stopped')
            ipcRenderer.removeAllListeners('debug:continued')
            ipcRenderer.removeAllListeners('debug:terminated')
            ipcRenderer.removeAllListeners('debug:output')
            ipcRenderer.removeAllListeners('debug:breakpoint')
            ipcRenderer.removeAllListeners('debug:event')
            ipcRenderer.removeAllListeners('debug:response')
            ipcRenderer.removeAllListeners('debug:error')
        }
    },

    // ==========================================
    // Secure Storage APIs
    // ==========================================
    safeStorage: {
        isAvailable: () => ipcRenderer.invoke('safeStorage:isAvailable'),
        set: (options: any) => ipcRenderer.invoke('safeStorage:set', options),
        get: (key: string) => ipcRenderer.invoke('safeStorage:get', key),
        delete: (key: string) => ipcRenderer.invoke('safeStorage:delete', key),
        listKeys: () => ipcRenderer.invoke('safeStorage:listKeys')
    },

    // ==========================================
    // Runtime Management APIs
    // ==========================================
    runtimeMgmt: {
        check: (runtimeId: any) => ipcRenderer.invoke('runtime:check', runtimeId),
        download: (runtimeId: any) => ipcRenderer.invoke('runtime:download', runtimeId),
        install: (options: any) => ipcRenderer.invoke('runtime:install', options),
        uninstall: (runtimeId: any) => ipcRenderer.invoke('runtime:uninstall', runtimeId),
        downloadAndInstall: (runtimeId: any) => ipcRenderer.invoke('runtime:downloadAndInstall', runtimeId),
        onDownloadProgress: (callback: (data: any) => void) => {
            ipcRenderer.on('runtime:download-progress', (_event: IpcRendererEvent, data: any) => callback(data))
        },
        onStatus: (callback: (data: any) => void) => {
            ipcRenderer.on('runtime:status', (_event: IpcRendererEvent, data: any) => callback(data))
        },
        onLog: (callback: (data: any) => void) => {
            ipcRenderer.on('runtime:log', (_event: IpcRendererEvent, data: any) => callback(data))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('runtime:download-progress')
            ipcRenderer.removeAllListeners('runtime:status')
            ipcRenderer.removeAllListeners('runtime:log')
        }
    },

    // ==========================================
    // Auto-Update APIs
    // ==========================================
    update: {
        configureToken: (token: string) => ipcRenderer.invoke('update:configure-token', token),
        checkForUpdates: () => ipcRenderer.invoke('update:check'),
        downloadUpdate: () => ipcRenderer.invoke('update:download'),
        installUpdate: () => ipcRenderer.invoke('update:install'),
        getVersion: () => ipcRenderer.invoke('update:get-version'),
        getStatus: () => ipcRenderer.invoke('update:get-status'),

        // Events
        onUpdateChecking: (callback: () => void) => {
            ipcRenderer.on('update:checking', () => callback())
        },
        onUpdateAvailable: (callback: (info: any) => void) => {
            ipcRenderer.on('update:available', (_event: IpcRendererEvent, info: any) => callback(info))
        },
        onUpdateNotAvailable: (callback: (info: any) => void) => {
            ipcRenderer.on('update:not-available', (_event: IpcRendererEvent, info: any) => callback(info))
        },
        onDownloadProgress: (callback: (progress: any) => void) => {
            ipcRenderer.on('update:download-progress', (_event: IpcRendererEvent, progress: any) => callback(progress))
        },
        onUpdateDownloaded: (callback: (info: any) => void) => {
            ipcRenderer.on('update:downloaded', (_event: IpcRendererEvent, info: any) => callback(info))
        },
        onUpdateError: (callback: (error: any) => void) => {
            ipcRenderer.on('update:error', (_event: IpcRendererEvent, error: any) => callback(error))
        },
        removeListeners: () => {
            ipcRenderer.removeAllListeners('update:checking')
            ipcRenderer.removeAllListeners('update:available')
            ipcRenderer.removeAllListeners('update:not-available')
            ipcRenderer.removeAllListeners('update:download-progress')
            ipcRenderer.removeAllListeners('update:downloaded')
            ipcRenderer.removeAllListeners('update:error')
        }
    },

    // ==========================================
    // Generic IPC listener for deep links
    // ==========================================
    on: (channel: string, callback: (...args: any[]) => void) => {
        const validChannels = ['deep-link']
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_event, ...args) => callback(...args))
        }
    }
})