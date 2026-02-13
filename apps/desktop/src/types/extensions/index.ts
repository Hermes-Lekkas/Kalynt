/**
 * VS Code Extension System Types for Kalynt
 * Based on VS Code Extension API
 */

// Extension Manifest (package.json)
export interface ExtensionManifest {
  name: string
  displayName?: string
  description?: string
  version: string
  publisher?: string
  engines: {
    vscode: string
    kalynt?: string
  }
  categories?: string[]
  keywords?: string[]
  activationEvents?: string[]
  main?: string
  browser?: string
  contributes?: ExtensionContributes
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  icon?: string
  license?: string
  repository?: {
    type: string
    url: string
  }
  bugs?: {
    url: string
  }
  homepage?: string
}

export interface ExtensionContributes {
  // Commands
  commands?: Array<{
    command: string
    title: string
    category?: string
    icon?: string | { light: string; dark: string }
    enablement?: string
  }>
  
  // Menus
  menus?: Record<string, Array<{
    command: string
    when?: string
    group?: string
    alt?: string
  }>>
  
  // Configuration
  configuration?: {
    title?: string
    properties: Record<string, {
      type: string
      default?: unknown
      description?: string
      enum?: unknown[]
      enumDescriptions?: string[]
    }>
  }
  
  // Keybindings
  keybindings?: Array<{
    command: string
    key: string
    when?: string
    mac?: string
    linux?: string
    win?: string
  }>
  
  // Views
  views?: Record<string, Array<{
    id: string
    name: string
    when?: string
    icon?: string
    contextualTitle?: string
    visibility?: 'visible' | 'collapsed'
  }>>
  
  // Views Containers
  viewsContainers?: Record<string, Array<{
    id: string
    title: string
    icon: string
  }>>
  
  // Themes
  themes?: Array<{
    label: string
    uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
    path: string
  }>
  
  // Icon Themes
  iconThemes?: Array<{
    id: string
    label: string
    path: string
  }>
  
  // Languages
  languages?: Array<{
    id: string
    aliases?: string[]
    extensions?: string[]
    filenames?: string[]
    filenamePatterns?: string[]
    mimetypes?: string[]
    firstLine?: string
    configuration?: string
    icon?: { light: string; dark: string }
  }>
  
  // Grammars
  grammars?: Array<{
    language?: string
    scopeName: string
    path: string
    embeddedLanguages?: Record<string, string>
    tokenTypes?: Record<string, string>
    injectTo?: string[]
  }>
  
  // Snippets
  snippets?: Array<{
    language: string
    path: string
  }>
  
  // Debuggers
  debuggers?: Array<{
    type: string
    label: string
    program?: string
    args?: string[]
    runtime?: string
    runtimeArgs?: string[]
    configurationAttributes?: Record<string, unknown>
    initialConfigurations?: unknown[]
    configurationSnippets?: unknown[]
    variables?: Record<string, string>
  }>
  
  // Task Definitions
  taskDefinitions?: Array<{
    type: string
    required?: string[]
    properties?: Record<string, unknown>
  }>
  
  // Problem Patterns
  problemPatterns?: Array<{
    name: string
    regexp: string
    file?: number
    line?: number
    column?: number
    message?: number
  }>
  
  // Problem Matchers
  problemMatchers?: Array<{
    name: string
    label?: string
    owner?: string
    source?: string
    applyTo?: 'allDocuments' | 'openDocuments' | 'closedDocuments'
    fileLocation?: 'absolute' | 'relative' | ['relative', string]
    pattern: string | string[]
    severity?: 'error' | 'warning' | 'info' | 'hint'
    watching?: {
      activeOnStart?: boolean
      beginsPattern: string
      endsPattern: string
    }
  }>
}

// Extension State
export interface Extension {
  id: string
  manifest: ExtensionManifest
  extensionPath: string
  isActive: boolean
  packageJSON: ExtensionManifest
  exports: unknown
  activate(): Promise<unknown>
}

export interface ExtensionContext {
  subscriptions: Array<{ dispose(): void }>
  workspaceState: Memento
  globalState: Memento & { setKeysForSync(keys: string[]): void }
  secrets: SecretStorage
  extensionUri: URI
  extensionPath: string
  environmentVariableCollection: EnvironmentVariableCollection
  asAbsolutePath(relativePath: string): string
  storageUri: URI | undefined
  globalStorageUri: URI
  logUri: URI
  extensionMode: ExtensionMode
  extension: Extension
}

export interface Memento {
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Promise<void>
  keys(): string[]
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  onDidChange: Event<SecretStorageChangeEvent>
}

export interface SecretStorageChangeEvent {
  key: string
}

export interface EnvironmentVariableCollection {
  persistent: boolean
  replace(variable: string, value: string): void
  append(variable: string, value: string): void
  prepend(variable: string, value: string): void
  get(variable: string): EnvironmentVariableScope | undefined
  forEach(callback: (variable: string, mutator: EnvironmentVariableMutator, collection: EnvironmentVariableCollection) => void, thisArg?: unknown): void
  delete(variable: string): void
  clear(): void
}

export interface EnvironmentVariableMutator {
  type: 'replace' | 'append' | 'prepend'
  value: string
  options: EnvironmentVariableMutatorOptions
}

export interface EnvironmentVariableMutatorOptions {
  applyAtProcessCreation?: boolean
  applyAtShellIntegration?: boolean
}

export interface EnvironmentVariableScope {
  variable: string
  type: 'replace' | 'append' | 'prepend'
  value: string
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

// Event system
export interface Event<T> {
  (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: Array<{ dispose(): void }>): { dispose(): void }
}

export interface URI {
  scheme: string
  authority: string
  path: string
  query: string
  fragment: string
  fsPath: string
  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI
  toString(skipEncoding?: boolean): string
  toJSON(): unknown
}

// Disposable
export interface Disposable {
  dispose(): void
}

// Command
export interface Command {
  title: string
  command: string
  tooltip?: string
  arguments?: unknown[]
}

// Position and Range
export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

// Extension Host Message Types
export type ExtensionHostMessage =
  | { type: 'activate'; extensionId: string; extensionPath: string }
  | { type: 'deactivate'; extensionId: string }
  | { type: 'invoke'; extensionId: string; method: string; args: unknown[] }
  | { type: 'event'; extensionId: string; event: string; data: unknown }
  | { type: 'error'; extensionId: string; error: string }
  | { type: 'ready' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }

export type MainProcessMessage =
  | { type: 'activate-result'; extensionId: string; success: boolean; error?: string }
  | { type: 'deactivate-result'; extensionId: string; success: boolean }
  | { type: 'invoke-result'; extensionId: string; result: unknown; error?: string }
  | { type: 'broadcast'; event: string; data: unknown }
  | { type: 'update-config'; extensionId: string; key: string; value: unknown }

// Extension marketplace types
export interface ExtensionGallery {
  id: string
  name: string
  displayName: string
  shortDescription: string
  publisher: { displayName: string; publisherId: string; publisherName: string }
  versions: ExtensionVersion[]
  categories: string[]
  tags: string[]
  releaseDate: string
  publishedDate: string
  lastUpdated: string
}

export interface ExtensionVersion {
  version: string
  lastUpdated: string
  assetUri: string
  fallbackAssetUri: string
  files: Array<{
    assetType: string
    source: string
  }>
  properties: Array<{
    key: string
    value: string
  }>
}

export interface ExtensionQueryOptions {
  searchText?: string
  categories?: string[]
  sortBy?: 'none' | 'lastUpdated' | 'title' | 'publisherName' | 'installCount' | 'publishedDate' | 'averageRating' | 'weightedRating'
  sortOrder?: 'default' | 'ascending' | 'descending'
  pageSize?: number
  pageNumber?: number
}

// Extension Manager State
export interface ExtensionManagerState {
  installed: Map<string, Extension>
  active: Set<string>
  recommended: ExtensionGallery[]
  popular: ExtensionGallery[]
  searchResults: ExtensionGallery[]
  isLoading: boolean
  error: string | null
}

// Activation Events
export type ActivationEvent =
  | '*'
  | 'onStartupFinished'
  | `onLanguage:${string}`
  | `onCommand:${string}`
  | `onView:${string}`
  | `onUri:${string}`
  | `workspaceContains:${string}`
  | `onFileSystem:${string}`
  | `onDebugResolve:${string}`
  | `onDebugInitialConfigurations`
  | `onDebugAdapterProtocolTracker:${string}`
