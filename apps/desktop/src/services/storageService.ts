/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// SQLite Service - Offline persistence layer for Electron
// Uses better-sqlite3 in main process, IPC bridge for renderer

export interface StorageSpace {
    id: string
    name: string
    icon: string
    createdAt: number
    lastModified: number
    ydocData?: Uint8Array // Serialized Y.Doc
}

export interface StorageTask {
    id: string
    spaceId: string
    title: string
    status: string
    priority: string
    createdAt: number
    createdBy: string
}

export interface StorageMessage {
    id: string
    spaceId: string
    channelId: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
}

export interface StorageSettings {
    key: string
    value: string
}

export type StorageItem = StorageSpace | StorageTask | StorageMessage | Uint8Array | string

// In-memory fallback storage (used in renderer when SQLite not available)
class MemoryStorage {
    private readonly data: Map<string, Map<string, StorageItem>> = new Map()

    constructor() {
        // Initialize tables
        this.data.set('spaces', new Map())
        this.data.set('tasks', new Map())
        this.data.set('messages', new Map())
        this.data.set('settings', new Map())
        this.data.set('ydocs', new Map())
    }

    // Spaces
    saveSpace(space: StorageSpace): void {
        this.data.get('spaces')!.set(space.id, space)
        this.persist()
    }

    getSpace(id: string): StorageSpace | null {
        return (this.data.get('spaces')!.get(id) as StorageSpace) || null
    }

    getAllSpaces(): StorageSpace[] {
        return Array.from(this.data.get('spaces')!.values()) as StorageSpace[]
    }

    deleteSpace(id: string): void {
        this.data.get('spaces')!.delete(id)
        // Also delete related data
        this.data.get('tasks')!.forEach((task, taskId) => {
            if ((task as StorageTask).spaceId === id) this.data.get('tasks')!.delete(taskId)
        })
        this.data.get('messages')!.forEach((msg, msgId) => {
            if ((msg as StorageMessage).spaceId === id) this.data.get('messages')!.delete(msgId)
        })
        this.data.get('ydocs')!.delete(id)
        this.persist()
    }

    // Y.Doc persistence
    saveYDoc(spaceId: string, data: Uint8Array): void {
        this.data.get('ydocs')!.set(spaceId, data)
        this.persist()
    }

    getYDoc(spaceId: string): Uint8Array | null {
        return (this.data.get('ydocs')!.get(spaceId) as Uint8Array) || null
    }

    // Tasks
    saveTask(task: StorageTask): void {
        this.data.get('tasks')!.set(task.id, task)
        this.persist()
    }

    getTasksForSpace(spaceId: string): StorageTask[] {
        return Array.from(this.data.get('tasks')!.values())
            .map(t => t as StorageTask)
            .filter(t => t.spaceId === spaceId)
    }

    deleteTask(id: string): void {
        this.data.get('tasks')!.delete(id)
        this.persist()
    }

    // Messages
    saveMessage(message: StorageMessage): void {
        this.data.get('messages')!.set(message.id, message)
        this.persist()
    }

    getMessagesForChannel(spaceId: string, channelId: string): StorageMessage[] {
        return Array.from(this.data.get('messages')!.values())
            .map(m => m as StorageMessage)
            .filter(m => m.spaceId === spaceId && m.channelId === channelId)
            .sort((a, b) => a.timestamp - b.timestamp)
    }

    // Settings
    setSetting(key: string, value: string): void {
        this.data.get('settings')!.set(key, value)
        this.persist()
    }

    getSetting(key: string): string | null {
        return (this.data.get('settings')!.get(key) as string) || null
    }

    // Persist to localStorage
    private persist(): void {
        try {
            const serializable: Record<string, [string, StorageItem | null][]> = {}
            this.data.forEach((map, table) => {
                if (table === 'ydocs') {
                    // Convert Uint8Array to base64
                    serializable[table] = Array.from(map.entries()).map(([k, v]) => [
                        k,
                        v ? btoa(String.fromCodePoint(...(v as Uint8Array))) : null
                    ])
                } else {
                    serializable[table] = Array.from(map.entries())
                }
            })
            localStorage.setItem('kalynt_db', JSON.stringify(serializable))
        } catch (e) {
            console.error('Failed to persist storage:', e)
        }
    }

    // Load from localStorage
    load(): void {
        try {
            const raw = localStorage.getItem('kalynt_db')
            if (raw) {
                const parsed = JSON.parse(raw)
                Object.entries(parsed).forEach(([table, entries]) => {
                    const map = new Map<string, StorageItem>()
                        ; (entries as [string, any][]).forEach(([k, v]) => {
                            if (table === 'ydocs' && v) {
                                // Convert base64 back to Uint8Array
                                const binary = atob(v as string)
                                const bytes = new Uint8Array(binary.length)
                                for (let i = 0; i < binary.length; i++) {
                                    bytes[i] = binary.codePointAt(i) || 0
                                }
                                map.set(k, bytes)
                            } else {
                                map.set(k, v)
                            }
                        })
                    this.data.set(table, map)
                })
            }
        } catch (e) {
            console.error('Failed to load storage:', e)
        }
    }

    // Clear all data
    clear(): void {
        this.data.forEach(map => map.clear())
        localStorage.removeItem('kalynt_db')
    }

    // Export all data
    export(): string {
        const data: Record<string, StorageItem[]> = {}
        this.data.forEach((map, table) => {
            if (table !== 'ydocs') {
                data[table] = Array.from(map.values())
            }
        })
        return JSON.stringify(data, null, 2)
    }

    // Import data
    import(json: string): void {
        try {
            const data = JSON.parse(json)
            Object.entries(data).forEach(([table, items]) => {
                const map = this.data.get(table)
                if (map) {
                    (items as any[]).forEach(item => {
                        if (item.id) {
                            map.set(item.id, item)
                        }
                    })
                }
            })
            this.persist()
        } catch (e) {
            console.error('Failed to import data:', e)
        }
    }
}

// SQLite wrapper for Electron main process
// This would be used via IPC in the actual Electron app
class SQLiteStorage {
    private readonly isElectron: boolean = false

    constructor() {
        // Check if running in Electron
        this.isElectron = globalThis.window !== undefined &&
            !!globalThis.window.electronAPI
    }

    async init(dbPath: string): Promise<void> {
        if (this.isElectron) {
            // Would call Electron main process to init SQLite
            await globalThis.window.electronAPI?.initDB?.(dbPath)
        }
    }

    // These methods would delegate to IPC calls in real Electron app
    async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
        if (this.isElectron) {
            return globalThis.window.electronAPI?.dbQuery?.(sql, params) || []
        }
        return []
    }

    async run(sql: string, params: unknown[] = []): Promise<void> {
        if (this.isElectron) {
            await globalThis.window.electronAPI?.dbRun?.(sql, params)
        }
    }
}

// Storage service that uses SQLite in Electron, memory in browser
class StorageService {
    private readonly memory: MemoryStorage
    private readonly sqlite: SQLiteStorage
    private initialized: boolean = false

    constructor() {
        this.memory = new MemoryStorage()
        this.sqlite = new SQLiteStorage()
    }

    async init(): Promise<void> {
        if (this.initialized) return

        // Load from localStorage
        this.memory.load()

        // Try to init SQLite if in Electron
        try {
            await this.sqlite.init('kalynt.db')
        } catch (e) {
            console.error('[Storage] SQLite initialization failed, falling back to memory:', e)
        }

        this.initialized = true
    }

    // Spaces
    saveSpace(space: StorageSpace): void {
        this.memory.saveSpace(space)
    }

    getSpace(id: string): StorageSpace | null {
        return this.memory.getSpace(id)
    }

    getAllSpaces(): StorageSpace[] {
        return this.memory.getAllSpaces()
    }

    deleteSpace(id: string): void {
        this.memory.deleteSpace(id)
    }

    // Y.Doc
    saveYDoc(spaceId: string, data: Uint8Array): void {
        this.memory.saveYDoc(spaceId, data)
    }

    getYDoc(spaceId: string): Uint8Array | null {
        return this.memory.getYDoc(spaceId)
    }

    // Tasks
    saveTask(task: StorageTask): void {
        this.memory.saveTask(task)
    }

    getTasksForSpace(spaceId: string): StorageTask[] {
        return this.memory.getTasksForSpace(spaceId)
    }

    deleteTask(id: string): void {
        this.memory.deleteTask(id)
    }

    // Messages
    saveMessage(message: StorageMessage): void {
        this.memory.saveMessage(message)
    }

    getMessagesForChannel(spaceId: string, channelId: string): StorageMessage[] {
        return this.memory.getMessagesForChannel(spaceId, channelId)
    }

    // Settings
    setSetting(key: string, value: string): void {
        this.memory.setSetting(key, value)
    }

    getSetting(key: string): string | null {
        return this.memory.getSetting(key)
    }

    // Utility
    clear(): void {
        this.memory.clear()
    }

    export(): string {
        return this.memory.export()
    }

    import(json: string): void {
        this.memory.import(json)
    }
}

// Singleton
export const storageService = new StorageService()

// Initialize on load
storageService.init()
