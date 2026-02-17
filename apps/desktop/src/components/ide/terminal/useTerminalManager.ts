/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { TerminalTab } from './types'
import { v4 as uuidv4 } from 'uuid'

const STORAGE_KEY = 'kalynt-terminal-tabs'
const ACTIVE_TAB_KEY = 'kalynt-terminal-active-tab'

export function useTerminalManager(workspacePath?: string | null) {
    const [tabs, setTabs] = useState<TerminalTab[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            return saved ? JSON.parse(saved) : []
        } catch (e) {
            console.error('Failed to load terminal tabs:', e)
            return []
        }
    })
    const [activeTabId, setActiveTabId] = useState<string>(() => {
        try {
            return localStorage.getItem(ACTIVE_TAB_KEY) || ''
        } catch (e) {
            return ''
        }
    })
    const initialized = useRef(false)
    const [defaultShell, setDefaultShell] = useState(window.electronAPI?.platform === 'win32' ? 'powershell.exe' : 'bash')

    // Fetch default shell from backend
    useEffect(() => {
        window.electronAPI?.terminal.getDefaultShell().then(result => {
            if (result.success && result.shell) {
                setDefaultShell(result.shell)
            }
        })
    }, [])

    // Persist tabs
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    }, [tabs])

    // Persist active tab
    useEffect(() => {
        localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
    }, [activeTabId])

    // Auto-create initial tab on first mount if none exist
    useEffect(() => {
        if (!initialized.current && tabs.length === 0) {
            initialized.current = true
            const id = uuidv4()
            const newTab: TerminalTab = {
                id,
                title: 'Terminal',
                shell: defaultShell,
                cwd: workspacePath || '',
                processType: 'shell'
            }
            setTabs([newTab])
            setActiveTabId(id)
        }
    }, [tabs.length, defaultShell, workspacePath])

    const addTab = useCallback((options?: Partial<TerminalTab>) => {
        const id = uuidv4()
        const newTab: TerminalTab = {
            id,
            title: options?.title || 'Terminal',
            shell: options?.shell || defaultShell,
            cwd: options?.cwd || workspacePath || '',
            processType: options?.processType || 'shell'
        }

        setTabs(prev => [...prev, newTab])
        setActiveTabId(id)
        return id
    }, [defaultShell, workspacePath])

    const closeTab = useCallback((id: string) => {
        setTabs(prev => {
            const newTabs = prev.filter(t => t.id !== id)
            if (activeTabId === id && newTabs.length > 0) {
                setActiveTabId(newTabs[newTabs.length - 1].id)
            } else if (newTabs.length === 0) {
                setActiveTabId('')
            }
            return newTabs
        })
    }, [activeTabId])

    const switchTab = useCallback((id: string) => {
        setActiveTabId(id)
    }, [])

    const renameTab = useCallback((id: string, title: string) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t))
    }, [])

    const updateTab = useCallback((id: string, updates: Partial<TerminalTab>) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    }, [])

    return {
        tabs,
        activeTabId,
        addTab,
        closeTab,
        switchTab,
        renameTab,
        updateTab
    }
}
