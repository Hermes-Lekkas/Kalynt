/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { TerminalTab } from './types'
import { v4 as uuidv4 } from 'uuid'

export function useTerminalManager() {
    const [tabs, setTabs] = useState<TerminalTab[]>([])
    const [activeTabId, setActiveTabId] = useState<string>('')
    const initialized = useRef(false)

    // Auto-create initial tab on first mount
    useEffect(() => {
        if (!initialized.current && tabs.length === 0) {
            initialized.current = true
            const id = uuidv4()
            const defaultShell = window.electronAPI?.platform === 'win32' ? 'powershell.exe' : 'bash'
            const newTab: TerminalTab = {
                id,
                title: 'Terminal',
                shell: defaultShell,
                cwd: '',
                processType: 'shell'
            }
            setTabs([newTab])
            setActiveTabId(id)
        }
    }, [tabs.length])
    const addTab = useCallback((options?: Partial<TerminalTab>) => {
        const id = uuidv4()
        const defaultShell = window.electronAPI.platform === 'win32' ? 'powershell.exe' : 'bash'
        const newTab: TerminalTab = {
            id,
            title: options?.title || 'Terminal',
            shell: options?.shell || defaultShell,
            cwd: options?.cwd || '',
            processType: options?.processType || 'shell'
        }

        setTabs(prev => [...prev, newTab])
        setActiveTabId(id)
        return id
    }, [])

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
        renameTab
    }
}
