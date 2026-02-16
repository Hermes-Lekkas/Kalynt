/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// main-process/terminalManager.ts
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface TerminalSession {
    id: string
    title: string
    shell: string
    cwd: string
    env: { [key: string]: string }
    cols: number
    rows: number
    status: 'running' | 'stopped' | 'paused'
    processType: 'shell' | 'task' | 'debug'
    metadata: any
    createdAt: number
    lastActive: number
    history: string[]
    commandHistory: Array<{
        command: string
        timestamp: number
        exitCode?: number
    }>
}

export interface SessionGroup {
    id: string
    name: string
    sessionIds: string[]
    layout?: 'horizontal' | 'vertical' | 'grid'
    createdAt: number
}

export class TerminalSessionManager extends EventEmitter {
    private sessions = new Map<string, TerminalSession>()
    private groups = new Map<string, SessionGroup>()
    private sessionStoragePath: string

    constructor(storagePath?: string) {
        super()
        // Use app.getPath('userData') instead of process.cwd() to avoid permission issues on Linux
        const defaultPath = path.join(app.getPath('userData'), 'terminal-sessions')
        this.sessionStoragePath = storagePath || defaultPath

        // Ensure storage directory exists
        if (!fs.existsSync(this.sessionStoragePath)) {
            try {
                fs.mkdirSync(this.sessionStoragePath, { recursive: true })
            } catch (err) {
                console.error('[SessionManager] Failed to create sessions dir:', err)
            }
        }

        // Load saved sessions
        this.loadSessions()
    }

    createSession(options: {
        id?: string
        title?: string
        shell: string
        cwd: string
        env?: { [key: string]: string }
        cols?: number
        rows?: number
        processType?: 'shell' | 'task' | 'debug'
        metadata?: any
    }): TerminalSession {
        const sessionId = options.id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const now = Date.now()

        const session: TerminalSession = {
            id: sessionId,
            title: options.title || `Terminal ${sessionId}`,
            shell: options.shell,
            cwd: options.cwd,
            env: options.env || {},
            cols: options.cols || 80,
            rows: options.rows || 24,
            status: 'running',
            processType: options.processType || 'shell',
            metadata: options.metadata || {},
            createdAt: now,
            lastActive: now,
            history: [],
            commandHistory: []
        }

        this.sessions.set(sessionId, session)
        this.emit('session_created', session)

        // Auto-save session
        this.saveSession(sessionId)

        return session
    }

    getSession(sessionId: string): TerminalSession | undefined {
        return this.sessions.get(sessionId)
    }

    updateSession(sessionId: string, updates: Partial<TerminalSession>): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        Object.assign(session, updates)
        session.lastActive = Date.now()

        this.emit('session_updated', { sessionId, updates })
        this.saveSession(sessionId)

        return true
    }

    addToSessionHistory(sessionId: string, data: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        session.history.push(data)
        session.lastActive = Date.now()

        // Limit history size
        if (session.history.length > 10000) {
            session.history = session.history.slice(-10000)
        }

        return true
    }

    addToCommandHistory(sessionId: string, command: string, exitCode?: number): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        session.commandHistory.push({
            command,
            timestamp: Date.now(),
            exitCode
        })

        // Limit command history size
        if (session.commandHistory.length > 1000) {
            session.commandHistory = session.commandHistory.slice(-1000)
        }

        this.saveSession(sessionId)
        return true
    }

    pauseSession(sessionId: string): boolean {
        return this.updateSession(sessionId, { status: 'paused' })
    }

    resumeSession(sessionId: string): boolean {
        return this.updateSession(sessionId, { status: 'running' })
    }

    stopSession(sessionId: string): boolean {
        return this.updateSession(sessionId, { status: 'stopped' })
    }

    deleteSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        this.sessions.delete(sessionId)
        this.emit('session_deleted', sessionId)

        // Delete session file
        const sessionFile = path.join(this.sessionStoragePath, `${sessionId}.json`)
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile)
        }

        return true
    }

    getAllSessions(): TerminalSession[] {
        return Array.from(this.sessions.values())
    }

    getActiveSessions(): TerminalSession[] {
        return this.getAllSessions().filter(s => s.status === 'running')
    }

    createGroup(name: string, sessionIds: string[], layout?: 'horizontal' | 'vertical' | 'grid'): SessionGroup {
        const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        const group: SessionGroup = {
            id: groupId,
            name,
            sessionIds,
            layout,
            createdAt: Date.now()
        }

        this.groups.set(groupId, group)
        this.emit('group_created', group)

        return group
    }

    addToGroup(groupId: string, sessionId: string): boolean {
        const group = this.groups.get(groupId)
        if (!group) return false

        if (!group.sessionIds.includes(sessionId)) {
            group.sessionIds.push(sessionId)
            this.emit('group_updated', { groupId, sessionId, action: 'added' })
            return true
        }

        return false
    }

    removeFromGroup(groupId: string, sessionId: string): boolean {
        const group = this.groups.get(groupId)
        if (!group) return false

        const index = group.sessionIds.indexOf(sessionId)
        if (index !== -1) {
            group.sessionIds.splice(index, 1)
            this.emit('group_updated', { groupId, sessionId, action: 'removed' })
            return true
        }

        return false
    }

    getGroup(groupId: string): SessionGroup | undefined {
        return this.groups.get(groupId)
    }

    getAllGroups(): SessionGroup[] {
        return Array.from(this.groups.values())
    }

    deleteGroup(groupId: string): boolean {
        const group = this.groups.get(groupId)
        if (!group) return false

        this.groups.delete(groupId)
        this.emit('group_deleted', groupId)

        return true
    }

    saveSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        try {
            const sessionFile = path.join(this.sessionStoragePath, `${sessionId}.json`)
            const sessionData = {
                ...session,
                // Don't save full history to disk to avoid large files
                history: [],
                commandHistory: session.commandHistory.slice(-100) // Keep last 100 commands
            }

            fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2))
            return true
        } catch (error) {
            console.error(`[SessionManager] Error saving session ${sessionId}:`, error)
            return false
        }
    }

    loadSession(sessionId: string): TerminalSession | null {
        try {
            const sessionFile = path.join(this.sessionStoragePath, `${sessionId}.json`)
            if (!fs.existsSync(sessionFile)) return null

            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
            const session: TerminalSession = {
                ...sessionData,
                status: 'stopped', // Sessions are stopped when loaded from disk
                history: [],
                lastActive: Date.now()
            }

            this.sessions.set(sessionId, session)
            return session
        } catch (error) {
            console.error(`[SessionManager] Error loading session ${sessionId}:`, error)
            return null
        }
    }

    private loadSessions(): void {
        try {
            const files = fs.readdirSync(this.sessionStoragePath)

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const sessionId = path.basename(file, '.json')
                    this.loadSession(sessionId)
                }
            }
        } catch (error) {
            console.error('[SessionManager] Error loading sessions:', error)
        }
    }

    exportSession(sessionId: string, exportPath: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        try {
            const exportData = {
                session,
                exportDate: new Date().toISOString(),
                version: '1.0.0',
                app: 'Kalynt Terminal'
            }

            fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2))
            return true
        } catch (error) {
            console.error(`[SessionManager] Error exporting session ${sessionId}:`, error)
            return false
        }
    }

    importSession(importPath: string): string | null {
        try {
            if (!fs.existsSync(importPath)) return null

            const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'))

            if (importData.app !== 'Kalynt Terminal') {
                throw new Error('Invalid session file format')
            }

            const session = importData.session as TerminalSession
            const newSessionId = `imported_${Date.now()}_${session.id}`

            session.id = newSessionId
            session.status = 'stopped'
            session.lastActive = Date.now()

            this.sessions.set(newSessionId, session)
            this.saveSession(newSessionId)

            return newSessionId
        } catch (error) {
            console.error('[SessionManager] Error importing session:', error)
            return null
        }
    }

    clearOldSessions(maxAgeHours: number = 24): number {
        const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000)
        let count = 0

        for (const [sessionId, session] of this.sessions) {
            if (session.lastActive < cutoff && session.status === 'stopped') {
                this.deleteSession(sessionId)
                count++
            }
        }

        return count
    }

    getSessionStats() {
        const sessions = this.getAllSessions()

        return {
            total: sessions.length,
            running: sessions.filter(s => s.status === 'running').length,
            stopped: sessions.filter(s => s.status === 'stopped').length,
            paused: sessions.filter(s => s.status === 'paused').length,
            byShell: sessions.reduce((acc, session) => {
                acc[session.shell] = (acc[session.shell] || 0) + 1
                return acc
            }, {} as Record<string, number>),
            byType: sessions.reduce((acc, session) => {
                acc[session.processType] = (acc[session.processType] || 0) + 1
                return acc
            }, {} as Record<string, number>)
        }
    }

    dispose(): void {
        // Save all sessions before disposing
        for (const sessionId of this.sessions.keys()) {
            this.saveSession(sessionId)
        }

        this.sessions.clear()
        this.groups.clear()
        this.removeAllListeners()
    }
}