const noopAsync = (..._args: any[]) => Promise.resolve({ success: false, error: 'Not available in web mode' })
const noop = (..._args: any[]) => {}
const noopReturn = (..._args: any[]) => () => {}

const createEventAPI = () => ({
    removeListeners: noop,
})

const terminalShim = {
    spawn: noopAsync,
    write: noopAsync,
    writeOutput: noopAsync,
    resize: noopAsync,
    kill: noopAsync,
    sendSignal: noopAsync,
    getInfo: noopAsync,
    getAll: noopAsync,
    fork: noopAsync,
    sendSequence: noopAsync,
    clearHistory: noopAsync,
    saveState: noopAsync,
    restoreState: noopAsync,
    broadcast: noopAsync,
    getCommandHistory: noopAsync,
    getCurrentCommand: noopAsync,
    onData: noop,
    onExit: noop,
    onSpawned: noop,
    onRestored: noop,
    onCommandFinished: noop,
    onDecorationsAvailable: noop,
    ...createEventAPI(),
}

const runtimeShim = {
    startLSP: noopAsync,
    stopLSP: noopAsync,
    sendLSPRequest: noopAsync,
    getLanguageServers: noopAsync,
    startDebug: noopAsync,
    stopDebug: noopAsync,
    sendDebugRequest: noopAsync,
    getDebugSessions: noopAsync,
    onLanguageServerStarted: noop,
    onLanguageServerStopped: noop,
    onDebugSessionStarted: noop,
    onDebugSessionStopped: noop,
    onDebugSessionError: noop,
    ...createEventAPI(),
}

const tasksShim = {
    detectTasks: noopAsync,
    executeTask: noopAsync,
    killTask: noopAsync,
    getExecutions: noopAsync,
    getExecution: noopAsync,
    onTaskOutput: noop,
    onTaskCompleted: noop,
    onTaskError: noop,
    onTaskCancelled: noop,
    ...createEventAPI(),
}

const sessionsShim = {
    createSession: noopAsync,
    getSession: noopAsync,
    updateSession: noopAsync,
    deleteSession: noopAsync,
    getAllSessions: noopAsync,
    getActiveSessions: noopAsync,
    saveSession: noopAsync,
    loadSession: noopAsync,
    exportSession: noopAsync,
    importSession: noopAsync,
    getStats: noopAsync,
    clearOldSessions: noopAsync,
    onSessionCreated: noop,
    onSessionUpdated: noop,
    onSessionDeleted: noop,
    ...createEventAPI(),
}

const fsShim = {
    openFolder: noopAsync,
    setWorkspace: noopAsync,
    readDir: noopAsync,
    stat: noopAsync,
    readFile: noopAsync,
    readBinaryFile: noopAsync,
    writeFile: noopAsync,
    createFile: noopAsync,
    createDir: noopAsync,
    delete: noopAsync,
    rename: noopAsync,
    watchDir: noopAsync,
    unwatchDir: noopAsync,
    onChange: noopReturn,
    removeListeners: noop,
    backupWorkspace: noopAsync,
    search: noopAsync,
}

const codeShim = {
    execute: noopAsync,
    kill: noopAsync,
    runCommand: noopAsync,
    onOutput: noop,
    onExit: noop,
    removeListeners: noop,
    clearCache: noopAsync,
}

const shellShim = {
    openExternal: noopAsync,
    showItemInFolder: noopAsync,
}

const runtimeMgmtShim = {
    check: noopAsync,
    downloadAndInstall: noopAsync,
    uninstall: noopAsync,
    onDownloadProgress: noop,
    onStatus: noop,
    onLog: noop,
    removeListeners: noop,
}

const safeStorageShim = {
    get: noopAsync,
    set: noopAsync,
    delete: noopAsync,
}

const updateShim = {
    configureToken: noopAsync,
    checkForUpdates: () => Promise.resolve({ success: true, updateAvailable: false }),
    downloadUpdate: noopAsync,
    installUpdate: noopAsync,
    getVersion: () => Promise.resolve({ success: true, version: '1.0.3-beta-web' }),
    onUpdateChecking: noop,
    onUpdateAvailable: noop,
    onUpdateNotAvailable: noop,
    onUpdateDownloaded: noop,
    onDownloadProgress: noop,
    onUpdateError: noop,
    onError: noop,
    removeListeners: noop,
}

const gitShim = {
    clone: noopAsync,
    status: noopAsync,
    add: noopAsync,
    commit: noopAsync,
    push: noopAsync,
    pull: noopAsync,
    log: noopAsync,
    diff: noopAsync,
    branch: noopAsync,
    checkout: noopAsync,
    getRemotes: noopAsync,
    addRemote: noopAsync,
    init: noopAsync,
    stash: noopAsync,
    stashPop: noopAsync,
    onProgress: noop,
    removeListeners: noop,
}

const depsShim = {
    detect: noopAsync,
    getForLanguage: noopAsync,
    install: noopAsync,
    installAll: noopAsync,
    uninstall: noopAsync,
    update: noopAsync,
    list: noopAsync,
    init: noopAsync,
    onOutput: noop,
    onComplete: noop,
    removeListeners: noop,
}

export const electronAPIShim = {
    platform: 'browser' as const,
    getAppPath: () => Promise.resolve('/'),
    getVersion: () => Promise.resolve('1.0.3-beta-web'),
    getAppVersion: () => Promise.resolve({ success: true, version: '1.0.3-beta-web' }),
    getModelsDirectory: () => Promise.resolve('/models'),
    getHardwareInfo: () => Promise.resolve({ cpu: 'Web Browser', ram: 0, gpu: 'N/A' }),
    getRealTimeStats: () => Promise.resolve({ cpuUsage: 0, memUsage: 0 }),
    fileExists: () => Promise.resolve(false),
    deleteModel: noopAsync,
    downloadModel: noopAsync,
    cancelDownload: noopAsync,
    pauseDownload: noopAsync,
    resumeDownload: noopAsync,
    onDownloadProgress: noopReturn,
    loadModel: noopAsync,
    unloadModel: noopAsync,
    generateCompletion: noopAsync,
    generateCompletionStream: noopAsync,
    cancelGeneration: noopAsync,
    loadDraftModel: noopAsync,
    unloadDraftModel: noopAsync,
    getDraftModelStatus: noopAsync,
    nukeProcesses: noopAsync,

    minimizeWindow: noop,
    maximizeWindow: noop,
    closeWindow: noop,

    on: noop,
    ipcRenderer: {
        invoke: noopAsync,
        on: noop,
        removeAllListeners: noop,
    },

    terminal: terminalShim,
    runtime: runtimeShim,
    tasks: tasksShim,
    sessions: sessionsShim,
    fs: fsShim,
    code: codeShim,
    shell: shellShim,
    runtimeMgmt: runtimeMgmtShim,
    safeStorage: safeStorageShim,
    update: updateShim,
    git: gitShim,
    deps: depsShim,
}

if (typeof window !== 'undefined' && !(window as any).electronAPI) {
    (window as any).electronAPI = electronAPIShim
}
if (typeof globalThis !== 'undefined' && !(globalThis as any).electronAPI) {
    (globalThis as any).electronAPI = electronAPIShim
}
