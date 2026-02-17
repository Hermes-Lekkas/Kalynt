/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { TerminalProps, ContextMenuState } from './terminal/types'
import { useTerminalManager } from './terminal/useTerminalManager'
import { useTerminalSession } from './terminal/useTerminalSession'
import { useTerminalIO } from './terminal/useTerminalIO'
import { TerminalHeader } from './terminal/TerminalHeader'
import { TerminalSearch } from './terminal/TerminalSearch'
import { TerminalContextMenu } from './terminal/TerminalContextMenu'
import { TerminalStatusBar } from './terminal/TerminalStatusBar'
import { CommandPalette } from './terminal/CommandPalette'
import '@xterm/xterm/css/xterm.css'

// Command history item type
interface CommandHistoryItem {
    command: string
    timestamp: number
    exitCode?: number
    frequency: number
    isBookmarked?: boolean
}

export default function Terminal({ cwd, onActiveTabChange }: Readonly<TerminalProps & { onActiveTabChange?: (id: string) => void }>) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [searchVisible, setSearchVisible] = useState(false)
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0
    })

    // Terminal state
    const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])
    const [bookmarks, setBookmarks] = useState<string[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const [commandCount, setCommandCount] = useState(0)
    const [lastExitCode] = useState<number | undefined>()
    const [isRunning] = useState(false)

    // Terminal tab management
    const {
        tabs,
        activeTabId,
        addTab,
        closeTab,
        switchTab,
        renameTab,
        updateTab
    } = useTerminalManager(cwd)

    // Notify parent of active tab change and fetch history
    useEffect(() => {
        if (activeTabId) {
            onActiveTabChange?.(activeTabId)
            
            // Sync history from backend
            window.electronAPI?.terminal.getCommandHistory(activeTabId).then(result => {
                if (result.success && result.history) {
                    const formattedHistory = result.history.map((h: any) => ({
                        command: h.command,
                        timestamp: h.timestamp,
                        exitCode: h.exitCode,
                        frequency: 1
                    }))
                    setCommandHistory(formattedHistory)
                }
            })
        }
    }, [activeTabId, onActiveTabChange])

    // Terminal session management (xterm instances)
    const {
        getCurrentTerminal,
        destroyTerminal,
        clearTerminal
    } = useTerminalSession(containerRef, activeTabId, tabs, updateTab, cwd)

    // Terminal I/O handling
    useTerminalIO(getCurrentTerminal, activeTabId)

    // Track connection status based on active tab
    useEffect(() => {
        if (activeTabId && tabs.length > 0) {
            setIsConnected(true)
        } else {
            setIsConnected(false)
        }
    }, [activeTabId, tabs.length])

    // Handle context menu
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
            setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY
            })
        }

        const handleClick = () => {
            if (contextMenu.visible) {
                setContextMenu({ visible: false, x: 0, y: 0 })
            }
        }

        container.addEventListener('contextmenu', handleContextMenu)
        document.addEventListener('click', handleClick)

        return () => {
            container.removeEventListener('contextmenu', handleContextMenu)
            document.removeEventListener('click', handleClick)
        }
    }, [contextMenu.visible])

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Shift+F - Toggle search
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault()
                setSearchVisible(prev => !prev)
            }
            // Ctrl+K - Clear terminal
            if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
                e.preventDefault()
                handleClearTerminal()
            }
            // Ctrl+Shift+P - Command palette
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
                e.preventDefault()
                setCommandPaletteOpen(prev => !prev)
            }
            // Ctrl+Shift+T - New terminal
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault()
                addTab()
            }
            // Escape - Close modals
            if (e.key === 'Escape') {
                if (searchVisible) setSearchVisible(false)
                if (commandPaletteOpen) setCommandPaletteOpen(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [searchVisible, commandPaletteOpen, addTab])

    // Context menu handlers
    const handleCopy = useCallback(async () => {
        const instance = getCurrentTerminal()
        const selection = instance?.xterm?.getSelection()
        if (selection) {
            await navigator.clipboard.writeText(selection)
        }
        setContextMenu({ visible: false, x: 0, y: 0 })
    }, [getCurrentTerminal])

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            window.electronAPI?.terminal.write({ id: activeTabId, data: text })
        } catch (err) {
            console.error('Failed to paste:', err)
        }
        setContextMenu({ visible: false, x: 0, y: 0 })
    }, [activeTabId])

    const handleClearTerminal = useCallback(() => {
        clearTerminal()
        setContextMenu({ visible: false, x: 0, y: 0 })
    }, [clearTerminal])

    const handleCloseTab = useCallback((id: string) => {
        destroyTerminal(id)
        closeTab(id)
    }, [closeTab, destroyTerminal])

    // Command palette handlers
    const handleSelectCommand = useCallback((command: string) => {
        window.electronAPI?.terminal.write({ id: activeTabId, data: command + '\n' })
        setCommandCount(prev => prev + 1)
    }, [activeTabId])

    const handleBookmark = useCallback((command: string) => {
        setBookmarks(prev => {
            if (prev.includes(command)) {
                return prev.filter(c => c !== command)
            }
            return [...prev, command]
        })
        setCommandHistory(prev => prev.map(item =>
            item.command === command
                ? { ...item, isBookmarked: !item.isBookmarked }
                : item
        ))
    }, [])

    // Listen for command finished events
    useEffect(() => {
        if (window.electronAPI?.terminal.onCommandFinished) {
            window.electronAPI.terminal.onCommandFinished((data: { terminalId: string; command: any }) => {
                if (data.terminalId === activeTabId) {
                    setCommandHistory(prev => [
                        {
                            command: data.command.command,
                            timestamp: data.command.endTime,
                            exitCode: data.command.exitCode,
                            frequency: 1
                        },
                        ...prev.slice(0, 99) // Keep last 100
                    ])
                    setCommandCount(prev => prev + 1)
                }
            })
        }
    }, [activeTabId])

    const currentTab = tabs.find(t => t.id === activeTabId)

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            flex: 1,
            background: 'linear-gradient(180deg, #09090b 0%, #000000 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(139, 92, 246, 0.1)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}>
            {/* Header with tabs and actions */}
            <TerminalHeader
                tabs={tabs}
                activeTabId={activeTabId}
                onSwitchTab={switchTab}
                onCloseTab={handleCloseTab}
                onAddTab={addTab}
                onToggleSearch={() => setSearchVisible(!searchVisible)}
                onClearTerminal={handleClearTerminal}
                onRenameTab={renameTab}
                searchVisible={searchVisible}
            />

            {/* Search bar */}
            {searchVisible && (
                <TerminalSearch
                    searchAddon={getCurrentTerminal()?.searchAddon || null}
                    onClose={() => setSearchVisible(false)}
                />
            )}

            {/* Terminal container */}
            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    padding: '8px',
                    overflow: 'hidden',
                    position: 'relative'
                }}
            />

            {/* Status bar */}
            <TerminalStatusBar
                pid={currentTab?.pid}
                shell={currentTab?.shell}
                cwd={cwd}
                isRunning={isRunning}
                lastExitCode={lastExitCode}
                commandCount={commandCount}
                isConnected={isConnected}
            />

            {/* Context menu */}
            <TerminalContextMenu
                contextMenu={contextMenu}
                onCopy={handleCopy}
                onPaste={handlePaste}
                onClear={handleClearTerminal}
            />

            {/* Command palette */}
            <CommandPalette
                isOpen={commandPaletteOpen}
                onClose={() => setCommandPaletteOpen(false)}
                onSelectCommand={handleSelectCommand}
                history={commandHistory}
                bookmarks={bookmarks}
                onBookmark={handleBookmark}
            />
        </div>
    )
}
