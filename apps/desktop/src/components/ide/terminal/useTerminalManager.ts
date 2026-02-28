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
            const parsed = saved ? JSON.parse(saved) : []
            
            // If we have tabs, use them
            if (parsed.length > 0) return parsed
            
            // Otherwise create an initial tab if we're not in a test/headless env
            // We'll use a placeholder and update it in an effect if needed
            const id = uuidv4()
            return [{
                id,
                title: 'Terminal',
                shell: window.electronAPI?.platform === 'win32' ? 'powershell.exe' : 'bash',
                cwd: workspacePath || '',
                processType: 'shell'
            }]
        } catch (e) {
            console.error('Failed to load terminal tabs:', e)
            return []
        }
    })
    const [activeTabId, setActiveTabId] = useState<string>(() => {
        try {
            const saved = localStorage.getItem(ACTIVE_TAB_KEY)
            if (saved) return saved
            return tabs[0]?.id || ''
        } catch (_e) {
            return ''
        }
    })
    const [defaultShell, setDefaultShell] = useState(window.electronAPI?.platform === 'win32' ? 'powershell.exe' : 'bash')
    const shellInitialized = useRef(false)

    const updateTab = useCallback((id: string, updates: Partial<TerminalTab>) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    }, [])

    // Fetch default shell from backend - only run once on mount
    useEffect(() => {
        if (shellInitialized.current) return
        
        window.electronAPI?.terminal.getDefaultShell().then(result => {
            if (result.success && result.shell) {
                setDefaultShell(result.shell)
                // Also update the first tab if it was created with a guess and shell is different
                if (tabs.length === 1 && tabs[0]?.title === 'Terminal' && tabs[0]?.shell !== result.shell) {
                    updateTab(tabs[0].id, { shell: result.shell })
                }
                shellInitialized.current = true
            }
        })
    }, []) // Empty dependency array - only run once on mount

    // Persist tabs
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    }, [tabs])

    // Persist active tab
    useEffect(() => {
        localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
    }, [activeTabId])

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
