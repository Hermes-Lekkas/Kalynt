/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { TerminalTab, TerminalState, DEFAULT_THEME } from './types'

export function useTerminalSession(
    containerRef: React.RefObject<HTMLDivElement>,
    activeTabId: string,
    tabs: TerminalTab[],
    updateTab: (id: string, updates: Partial<TerminalTab>) => void,
    initialCwd?: string
) {
    const terminals = useRef<Map<string, TerminalState>>(new Map())
    const terminalElements = useRef<Map<string, HTMLDivElement>>(new Map()) // Store DOM elements
    const resizeObserver = useRef<ResizeObserver | null>(null)
    const dataListenerSet = useRef(false)

    // Helper to get current terminal instance
    const getCurrentTerminal = useCallback((): TerminalState | null => {
        return terminals.current.get(activeTabId) || null
    }, [activeTabId])

    // Setup global data listener once
    useEffect(() => {
        if (dataListenerSet.current) return
        dataListenerSet.current = true

        // Handle output from backend - routes to correct terminal
        window.electronAPI?.terminal.onData((data: { id: string; data: string; type: string }) => {
            const { id, data: output } = data
            const terminal = terminals.current.get(id)
            if (terminal?.xterm) {
                terminal.xterm.write(output)
            }
        })

        // Handle spawned event
        window.electronAPI?.terminal.onSpawned((data: { id: string; pid: number; title: string; cwd: string; shell: string }) => {
            // Tab spawned notification - can update UI if needed
            console.log('[Terminal] Spawned:', data.id, 'PID:', data.pid)
        })

        // Cleanup on unmount
        return () => {
            window.electronAPI?.terminal.removeListeners()
            dataListenerSet.current = false
        }
    }, [])

    // Create terminal instance
    const createTerminal = useCallback(async (tabId: string) => {
        if (terminals.current.has(tabId)) return terminals.current.get(tabId)

        const term = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            cursorBlink: true,
            theme: DEFAULT_THEME,
            allowProposedApi: true
        })

        const fitAddon = new FitAddon()
        const searchAddon = new SearchAddon()
        const webLinksAddon = new WebLinksAddon()
        const unicode11Addon = new Unicode11Addon()

        term.loadAddon(fitAddon)
        term.loadAddon(searchAddon)
        term.loadAddon(webLinksAddon)
        term.loadAddon(unicode11Addon)
        term.options.allowProposedApi = true
        term.unicode.activeVersion = '11'

        // Create a dedicated element for this terminal
        const terminalElement = document.createElement('div')
        terminalElement.style.width = '100%'
        terminalElement.style.height = '100%'
        terminalElements.current.set(tabId, terminalElement)

        terminals.current.set(tabId, {
            xterm: term,
            fitAddon,
            searchAddon,
            webLinksAddon,
            unicode11Addon,
            element: terminalElement // Store element reference
        })

        // Spawn backend process
        const tab = tabs.find(t => t.id === tabId)
        try {
            const result = await window.electronAPI?.terminal.spawn({
                id: tabId,
                cwd: tab?.cwd || initialCwd,
                shell: tab?.shell,
                cols: term.cols,
                rows: term.rows
            })

            if (result.success && result.pid) {
                updateTab(tabId, { pid: result.pid })
            }

            // Handle resize - send to backend
            term.onResize(({ cols, rows }) => {
                window.electronAPI?.terminal.resize({ id: tabId, cols, rows })
            })

            // Handle input - send to backend
            term.onData(data => {
                window.electronAPI?.terminal.write({ id: tabId, data })
            })

        } catch (error) {
            console.error('Failed to spawn terminal:', error)
            term.write('\r\nFailed to start terminal session.\r\n')
        }

        return terminals.current.get(tabId)
    }, [tabs, initialCwd])

    // Effect to mount/unmount terminal in container
    useEffect(() => {
        const container = containerRef.current
        if (!container || !activeTabId) return

        // Create terminal if not exists
        if (!terminals.current.has(activeTabId)) {
            createTerminal(activeTabId).then(terminal => {
                if (terminal && container) {
                    // Open terminal in its element (only once!)
                    terminal.xterm?.open(terminal.element)

                    // NOTE: Direct DOM manipulation is intentional here
                    // React doesn't manage xterm elements, so manual DOM ops are safe
                    // Clear container and append terminal element
                    while (container.firstChild) {
                        container.removeChild(container.firstChild)
                    }
                    container.appendChild(terminal.element)

                    terminal.fitAddon?.fit()
                    terminal.xterm?.focus()
                }
            })
        } else {
            // Reattach existing terminal by moving its element
            const terminal = terminals.current.get(activeTabId)
            if (terminal && terminal.element) {
                // Clear container (safe - xterm manages its own internals)
                while (container.firstChild) {
                    container.removeChild(container.firstChild)
                }

                // Append existing terminal element
                container.appendChild(terminal.element)
                terminal.fitAddon?.fit()
                terminal.xterm?.focus()
            }
        }

        // SECURITY FIX: Setup/cleanup resize observer properly to prevent memory leaks
        if (!resizeObserver.current) {
            resizeObserver.current = new ResizeObserver(() => {
                const terminal = terminals.current.get(activeTabId)
                terminal?.fitAddon?.fit()
            })
        }
        // Observe the current container
        resizeObserver.current.observe(container)

        return () => {
            // Cleanup: unobserve container when active tab changes
            if (resizeObserver.current && container) {
                resizeObserver.current.unobserve(container)
            }
        }
    }, [activeTabId, createTerminal, containerRef])

    const destroyTerminal = useCallback((id: string) => {
        const terminal = terminals.current.get(id)
        if (terminal) {
            terminal.xterm?.dispose()
            terminals.current.delete(id)

            // Clean up element
            const element = terminalElements.current.get(id)
            element?.remove()
            terminalElements.current.delete(id)

            // SECURITY FIX: Add optional chaining to prevent crash
            window.electronAPI?.terminal?.kill(id).catch(console.error)
        }
    }, [])

    const clearTerminal = useCallback(() => {
        const terminal = terminals.current.get(activeTabId)
        terminal?.xterm?.clear()
    }, [activeTabId])

    return {
        getCurrentTerminal,
        destroyTerminal,
        clearTerminal
    }
}
