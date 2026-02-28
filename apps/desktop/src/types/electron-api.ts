/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Strict TypeScript interfaces for Electron API
 * Replaces all `any` types in vite-env.d.ts with proper type definitions
 */

// File System Types
export interface FileSystemItem {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size?: number
  lastModified?: number
}

export interface FileStat {
  size: number
  mtimeMs: number
  isDirectory: boolean
  isFile: boolean
}

export interface FileSearchResult {
  path: string
  line: number
  column: number
  match: string
}

export interface FileSystemAPI {
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
  readBinaryFile: (path: string) => Promise<{ success: boolean; content?: Uint8Array; error?: string }>
  writeFile: (options: { path: string; content: string; encoding?: 'utf8' | 'utf-8' | 'ascii' | 'base64' | 'binary' | 'hex' | 'latin1' }) => Promise<{ success: boolean; error?: string }>
  stat: (path: string) => Promise<{ success: boolean; stats?: FileStat; error?: string }>
  readDir: (path: string) => Promise<{ success: boolean; items?: FileSystemItem[]; error?: string }>
  createFile: (path: string) => Promise<{ success: boolean; error?: string }>
  createDir: (path: string) => Promise<{ success: boolean; error?: string }>
  delete: (path: string) => Promise<{ success: boolean; error?: string }>
  rename: (options: { oldPath: string; newPath: string }) => Promise<{ success: boolean; error?: string }>
  copy: (options: { source: string; dest: string }) => Promise<{ success: boolean; error?: string }>
  move: (options: { source: string; dest: string }) => Promise<{ success: boolean; error?: string }>
  search: (options: { query: string; path: string; maxResults?: number }) => Promise<{ success: boolean; results?: FileSearchResult[]; truncated?: boolean; error?: string }>
  watch: (path: string) => Promise<{ success: boolean; watcherId?: string; error?: string }>
  unwatch: (watcherId: string) => Promise<{ success: boolean; error?: string }>
  onChange: (callback: (data: { id: string; event: 'add' | 'change' | 'unlink' | 'unlinkDir'; path: string }) => void) => () => void
  removeListeners: () => void
}

// Code Execution Types
export interface CodeExecutionResult {
  success: boolean
  output?: string
  error?: string
  exitCode?: number
  executionTime?: number
}

export interface CodeExecutionOptions {
  language: string
  code: string
  cwd?: string
  timeout?: number
  env?: Record<string, string>
}

export interface CodeAPI {
  run: (options: CodeExecutionOptions) => Promise<CodeExecutionResult>
  runCommand: (options: { command: string; args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<CodeExecutionResult>
  onOutput: (callback: (data: { type: 'stdout' | 'stderr'; data: string }) => void) => () => void
  removeListeners: () => void
}

// Git Types
export interface GitStatus {
  files: Array<{
    path: string
    index: string
    working_dir: string
  }>
}

export interface GitCommit {
  hash: string
  message: string
  author_name: string
  author_email: string
  date: string
}

export interface GitBranch {
  current: string
  local: string[]
  remote: string[]
}

export interface GitAPI {
  status: () => Promise<{ success: boolean; status?: GitStatus; error?: string }>
  log: (options?: { maxCount?: number }) => Promise<{ success: boolean; log?: { latest?: GitCommit; total: number }; error?: string }>
  branch: () => Promise<{ success: boolean; branches?: GitBranch; error?: string }>
  add: (files: string[]) => Promise<{ success: boolean; error?: string }>
  commit: (message: string) => Promise<{ success: boolean; error?: string }>
  push: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>
  pull: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>
  clone: (url: string, path: string) => Promise<{ success: boolean; error?: string }>
}

// Shell Types
export interface ShellAPI {
  openExternal: (url: string) => Promise<boolean>
  showItemInFolder: (path: string) => void
}

// Build Types
export interface BuildTask {
  id: string
  label: string
  type: 'shell' | 'process'
  command?: string
  args?: string[]
  group?: 'build' | 'test' | 'run' | 'debug'
}

export interface BuildExecution {
  id: string
  taskId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  exitCode?: number
}

export interface BuildProblem {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  code?: string
}

export interface BuildAPI {
  getTasks: (workspacePath: string) => Promise<{ success: boolean; tasks?: BuildTask[]; error?: string }>
  executeTask: (task: BuildTask, workspacePath: string) => Promise<{ success: boolean; executionId?: string; error?: string }>
  killTask: (executionId: string) => Promise<{ success: boolean; error?: string }>
  onOutput: (callback: (data: { executionId: string; type: 'stdout' | 'stderr'; data: string }) => void) => () => void
  onEnd: (callback: (data: { executionId: string; exitCode: number; status: string }) => void) => () => void
  onProblems: (callback: (data: { executionId: string; problems: BuildProblem[] }) => void) => () => void
  removeListeners: () => void
}

// Debug Types
export interface DebugConfiguration {
  type: string
  request: 'launch' | 'attach'
  name: string
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  stopOnEntry?: boolean
}

export interface DebugBreakpoint {
  id: number
  line: number
  column?: number
  verified: boolean
}

export interface DebugStackFrame {
  id: number
  name: string
  line: number
  column: number
  source?: { path: string }
}

export interface DebugVariable {
  name: string
  value: string
  type?: string
  variablesReference: number
}

export interface DebugAPI {
  getConfigurations: (workspacePath: string) => Promise<{ success: boolean; configurations?: DebugConfiguration[]; error?: string }>
  start: (configuration: DebugConfiguration, workspacePath: string, activeFile?: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>
  stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  setBreakpoints: (sessionId: string, file: string, breakpoints: Array<{ line: number; column?: number }>) => Promise<{ success: boolean; breakpoints?: DebugBreakpoint[]; error?: string }>
  continue: (sessionId: string, threadId?: number) => Promise<{ success: boolean; error?: string }>
  stepOver: (sessionId: string, threadId?: number) => Promise<{ success: boolean; error?: string }>
  stepInto: (sessionId: string, threadId?: number) => Promise<{ success: boolean; error?: string }>
  stepOut: (sessionId: string, threadId?: number) => Promise<{ success: boolean; error?: string }>
  pause: (sessionId: string, threadId?: number) => Promise<{ success: boolean; error?: string }>
  getCallStack: (sessionId: string, threadId?: number) => Promise<{ success: boolean; frames?: DebugStackFrame[]; error?: string }>
  getVariables: (sessionId: string, variablesReference: number) => Promise<{ success: boolean; variables?: DebugVariable[]; error?: string }>
  evaluate: (sessionId: string, expression: string, frameId?: number) => Promise<{ success: boolean; result?: string; error?: string }>
  onStarted: (callback: (data: { sessionId: string; configuration: DebugConfiguration }) => void) => () => void
  onStopped: (callback: (data: { sessionId: string; reason: string; threadId?: number }) => void) => () => void
  onContinued: (callback: (data: { sessionId: string; threadId?: number }) => void) => () => void
  onTerminated: (callback: (data: { sessionId: string }) => void) => () => void
  onOutput: (callback: (data: { sessionId: string; output: string; category?: string }) => void) => () => void
  onBreakpoint: (callback: (data: { sessionId: string; breakpoint: DebugBreakpoint }) => void) => () => void
  removeListeners: () => void
}

// SafeStorage Types
export interface SafeStorageAPI {
  isAvailable: () => boolean
  encrypt: (value: string) => Promise<{ success: boolean; encrypted?: string; error?: string }>
  decrypt: (encrypted: string) => Promise<{ success: boolean; value?: string; error?: string }>
  get: (key: string) => Promise<{ success: boolean; value?: string; error?: string }>
  set: (options: { key: string; value: string }) => Promise<{ success: boolean; error?: string }>
  delete: (key: string) => Promise<{ success: boolean; error?: string }>
}

// Runtime Management Types
export interface RuntimeInfo {
  id: string
  name: string
  version: string
  installed: boolean
  path?: string
}

export interface RuntimeDownloadProgress {
  runtimeId: string
  version?: string
  bytesDownloaded: number
  totalBytes: number
  progress: number
  speed: number
}

export interface RuntimeMgmtAPI {
  check: (runtimeId: string) => Promise<{ success: boolean; installed?: boolean; version?: string; error?: string }>
  downloadAndInstall: (runtimeId: string, version?: string) => Promise<{ success: boolean; error?: string }>
  uninstall: (runtimeId: string) => Promise<{ success: boolean; error?: string }>
  listInstalled: () => Promise<{ success: boolean; runtimes?: RuntimeInfo[]; error?: string }>
  onDownloadProgress: (callback: (progress: RuntimeDownloadProgress) => void) => () => void
  onStatus: (callback: (data: { runtimeId: string; status: 'downloading' | 'installing' | 'completed' | 'failed'; message?: string }) => void) => () => void
  removeListeners: () => void
}

// Extension Types
export interface ExtensionMetadata {
  id: string
  name: string
  displayName: string
  version: string
  description: string
  publisher: string
  isActive: boolean
  isBuiltin: boolean
}

export interface ExtensionAPI {
  scan: () => Promise<{ success: boolean; extensions?: ExtensionMetadata[]; error?: string }>
  activate: (id: string) => Promise<{ success: boolean; error?: string }>
  deactivate: (id: string) => Promise<{ success: boolean; error?: string }>
  install: (vsixPath: string) => Promise<{ success: boolean; extension?: ExtensionMetadata; error?: string }>
  uninstall: (id: string) => Promise<{ success: boolean; error?: string }>
  list: () => Promise<{ success: boolean; extensions?: ExtensionMetadata[]; error?: string }>
  active: () => Promise<{ success: boolean; extensions?: ExtensionMetadata[]; error?: string }>
  startHost: () => Promise<{ success: boolean; error?: string }>
  stopHost: () => Promise<void>
  download: (url: string, targetPath: string) => Promise<{ success: boolean; error?: string }>
  onExtensionActivated: (callback: (data: { id: string }) => void) => () => void
  onExtensionDeactivated: (callback: (data: { id: string }) => void) => () => void
  onShowMessage: (callback: (data: { type: string; message: string }) => void) => () => void
  removeListeners: () => void
}

// Dialog Types
export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>
}

export interface DialogAPI {
  showOpenDialog: (options: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>
}

// App Types
export type AppPathName = 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'

export interface AppAPI {
  getPath: (name: AppPathName) => Promise<string>
}

// IPC Renderer Types
export type IpcChannel = 
  | 'fs:readFile' | 'fs:writeFile' | 'fs:stat' | 'fs:readDir'
  | 'code:execute' | 'git:status' | 'git:log' | 'git:branch'
  | 'terminal:spawn' | 'terminal:write' | 'terminal:kill'
  | 'build:execute' | 'debug:start' | 'debug:stop'
  | 'safeStorage:get' | 'safeStorage:set'
  | string

export interface IpcRendererAPI {
  invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]) => Promise<T>
  on: (channel: string, callback: (event: unknown, ...args: unknown[]) => void) => void
  removeAllListeners: (channel: string) => void
}

// Hardware Info Types
export interface HardwareInfo {
  platform: string
  arch: string
  cpus: number
  totalMemory: number
  freeMemory: number
  gpus?: Array<{
    model: string
    vendor: string
    vram?: number
  }>
}

export interface RealTimeStats {
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  gpuUsage?: number
}

// Download Types
export interface DownloadProgress {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  speed: number
}

// Model Management Types
export interface ModelLoadOptions {
  modelId: string
  path: string
  contextLength: number
  expectedSizeBytes?: number
  aimeConfig?: {
    kvCacheQuantization?: 'none' | 'fp16' | 'q8' | 'q4'
    gpuLayers?: number
    useMemoryMapping?: boolean
    batchSize?: number
    threads?: number
  }
}

export interface CompletionOptions {
  prompt: string
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}

export interface CompletionResult {
  text: string
  tokensGenerated: number
  finishReason: 'stop' | 'length' | 'error'
}

// Terminal Metadata Type
export interface TerminalMetadata {
  languageId?: string
  taskId?: string
  debugSessionId?: string
  projectType?: string
}

// Terminal Info Type
export interface TerminalInfo {
  id: string
  pid: number
  title: string
  cwd: string
  shell: string
  status: 'running' | 'stopped' | 'error'
  lastExitCode?: number
  processType?: 'shell' | 'task' | 'debug'
  metadata?: TerminalMetadata
}
