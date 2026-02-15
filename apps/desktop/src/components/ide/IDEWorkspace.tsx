/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import UnifiedAgentPanel from '../UnifiedAgentPanel'

import InlineEditWidget from './InlineEditWidget'
import Breadcrumbs from './Breadcrumbs'
import CommandPalette, { FileItem, IDECommand } from './CommandPalette'
import { createDefaultCommands } from '../../services/ideCommands'
import type { FileSystemItem } from '../../vite-env'
import {
    FolderOpen, Wand2, Puzzle
} from 'lucide-react'
import { ExtensionManager } from '../extensions'
import { useNotificationStore } from '../../stores/notificationStore'
import { logger } from '../../utils/logger'
import { validatePath } from '../../utils/path-validator'

// Modular Components
import { IDEActivityBar } from './IDEActivityBar'
import { IDETabList } from './IDETabList'
import { IDEPanelContainer } from './IDEPanelContainer'
import { IDEToolbar } from './IDEToolbar'
import { IDEBottomTerminal } from './IDEBottomTerminal'

import './IDEWorkspace.css'

interface ICodeEditor {
    getSelection(): any
    getModel(): any
    getAction(id: string): any
    revealLineInCenter(lineNumber: number): void
    setPosition(position: { lineNumber: number; column: number }): void
    focus(): void
    executeEdits(source: string, edits: any[]): boolean
}

interface OpenFile {
    path: string
    name: string
    content: string
    language: string
    isDirty: boolean
}



// Storage keys for persistence
const STORAGE_KEYS = {
    WORKSPACE_PATH: 'kalynt-workspace-path',
    OPEN_FILES: 'kalynt-open-files',
    ACTIVE_FILE: 'kalynt-active-file',
    SIDEBAR_OPEN: 'kalynt-sidebar-open',
    TERMINAL_VISIBLE: 'kalynt-terminal-visible',
    TERMINAL_HEIGHT: 'kalynt-terminal-height',
    SIDEBAR_WIDTH: 'kalynt-sidebar-width',
    WORD_WRAP: 'kalynt-word-wrap',
    MINIMAP_ENABLED: 'kalynt-minimap-enabled',
    STICKY_SCROLL_ENABLED: 'kalynt-sticky-scroll-enabled',
    SPLIT_EDITOR_ENABLED: 'kalynt-split-editor-enabled',
    SPLIT_EDITOR_RATIO: 'kalynt-split-editor-ratio',
    SECONDARY_ACTIVE_FILE: 'kalynt-secondary-active-file',
    RIGHT_PANEL_WIDTH: 'kalynt-right-panel-width'
}

export default function IDEWorkspace() {
    // Workspace state with persistence
    const [workspacePath, setWorkspacePath] = useState<string | null>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.WORKSPACE_PATH)
        } catch (error) {
            logger.ide.warn('Failed to load workspace path from localStorage', error)
            return null
        }
    })
    const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
    const [activeFile, setActiveFile] = useState<string | null>(null)
    const [pendingLine, setPendingLine] = useState<number | null>(null)
    const { addNotification } = useNotificationStore()
    const [showTerminal, setShowTerminal] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.TERMINAL_VISIBLE)
            return saved !== null ? saved === 'true' : true
        } catch (error) {
            logger.ide.warn('Failed to load terminal visibility from localStorage', error)
            return true
        }
    })
    const [terminalHeight, setTerminalHeight] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.TERMINAL_HEIGHT)
            return saved ? parseInt(saved, 10) : 200
        } catch (error) {
            logger.ide.warn('Failed to load terminal height from localStorage', error)
            return 200
        }
    })
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)
            return saved !== null ? saved === 'true' : true
        } catch (error) {
            logger.ide.warn('Failed to load sidebar state from localStorage', error)
            return true
        }
    })
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            // Clear any corrupted value and always start fresh
            localStorage.removeItem(STORAGE_KEYS.SIDEBAR_WIDTH)
            return 260
        } catch (error) {
            logger.ide.warn('Failed to load sidebar width from localStorage', error)
            return 260
        }
    })
    const [isResizingSidebar, setIsResizingSidebar] = useState(false)
    const [rightPanelWidth, setRightPanelWidth] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.RIGHT_PANEL_WIDTH)
            return saved ? parseInt(saved, 10) : 400
        } catch (_error) {
            return 400
        }
    })
    const [isResizingRightPanel, setIsResizingRightPanel] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const executionIdRef = useRef<string | null>(null)
    // SECURITY FIX: Store cleanup functions to prevent event listener leaks
    const codeListenersCleanupRef = useRef<(() => void)[]>([])
    const [codeOutput, setCodeOutput] = useState<string>('') // For code execution output display
    const [isDebugging, setIsDebugging] = useState(false)
    const debugSessionIdRef = useRef<string | null>(null)
    const [isBuilding, setIsBuilding] = useState(false)
    const buildTaskIdRef = useRef<string | null>(null)

    // BUG #22: Dispose editors on unmount
    useEffect(() => {
        return () => {
            if (editorRef.current) {
                try {
                    (editorRef.current as any).dispose?.()
                } catch (e) {
                    console.warn('[IDE] Failed to dispose editor on unmount:', e)
                }
            }
            if (secondaryEditorRef.current) {
                try {
                    (secondaryEditorRef.current as any).dispose?.()
                } catch (e) {
                    console.warn('[IDE] Failed to dispose secondary editor on unmount:', e)
                }
            }
        }
    }, [])

    const [activePanel, setActivePanel] = useState<'files' | 'search' | 'git' | 'collaboration'>('files')
    const [requestedExpansion, setRequestedExpansion] = useState<string | null>(null)

    // Split Editor state
    const [splitEditorEnabled, setSplitEditorEnabled] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SPLIT_EDITOR_ENABLED)
            return saved === 'true'
        } catch (_error) {
            return false
        }
    })
    const [secondaryActiveFile, setSecondaryActiveFile] = useState<string | null>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.SECONDARY_ACTIVE_FILE)
        } catch (_error) {
            return null
        }
    })
    const [editorSplitRatio, setEditorSplitRatio] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SPLIT_EDITOR_RATIO)
            return saved ? parseFloat(saved) : 0.5
        } catch (_error) {
            return 0.5
        }
    })
    const [isResizingSplit, setIsResizingSplit] = useState(false)

    // AI Agent state
    const [agentOpen, setAgentOpen] = useState(true)

    // Command Palette state
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [paletteMode, setPaletteMode] = useState<'commands' | 'files'>('commands')
    
    // Extension Manager state
    const [showExtensions, setShowExtensions] = useState(false)
    const [unsavedDialog, setUnsavedDialog] = useState<{ isOpen: boolean, filePath: string | null }>({ isOpen: false, filePath: null })
    const [deletedFileDialog, setDeletedFileDialog] = useState<{ isOpen: boolean, filePath: string | null }>({ isOpen: false, filePath: null })
    const [workspaceFiles, setWorkspaceFiles] = useState<FileItem[]>([])

    // Inline AI Edit state
    const [inlineEditVisible, setInlineEditVisible] = useState(false)
    const [inlineEditSelection] = useState('')
    const [inlineEditPosition] = useState({ top: 100, left: 100 })

    // Editor Settings state
    const [wordWrap, setWordWrap] = useState<'on' | 'off'>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.WORD_WRAP)
            return saved === 'on' || saved === 'off' ? saved : 'on'
        } catch (_error) {
            return 'on'
        }
    })
    const [minimapEnabled, setMinimapEnabled] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.MINIMAP_ENABLED)
            return saved !== null ? saved === 'true' : true
        } catch (_error) {
            return true
        }
    })
    const [stickyScrollEnabled, setStickyScrollEnabled] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.STICKY_SCROLL_ENABLED)
            return saved !== null ? saved === 'true' : true
        } catch (_error) {
            return true
        }
    })

    const editorRef = useRef<ICodeEditor | null>(null)
    const secondaryEditorRef = useRef<ICodeEditor | null>(null)
    const monacoRef = useRef<any>(null)

    // Breakpoints state: Map of file path -> array of line numbers
    const [breakpoints, setBreakpoints] = useState<Map<string, number[]>>(new Map())
    const breakpointDecorationsRef = useRef<string[]>([])

    // Get active file object
    const activeFileObj = openFiles.find(f => f.path === activeFile)
    const secondaryFileObj = openFiles.find(f => f.path === secondaryActiveFile)

    // Persist workspace path
    useEffect(() => {
        try {
            if (workspacePath) {
                localStorage.setItem(STORAGE_KEYS.WORKSPACE_PATH, workspacePath)
            } else {
                localStorage.removeItem(STORAGE_KEYS.WORKSPACE_PATH)
            }
        } catch (error) {
            logger.ide.warn('Failed to persist workspace path to localStorage', error)
        }
    }, [workspacePath])

    // Persist editor settings
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.WORD_WRAP, wordWrap)
        } catch (error) {
            logger.ide.warn('Failed to persist word wrap state', error)
        }
    }, [wordWrap])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.MINIMAP_ENABLED, String(minimapEnabled))
        } catch (error) {
            logger.ide.warn('Failed to persist minimap state', error)
        }
    }, [minimapEnabled])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.STICKY_SCROLL_ENABLED, String(stickyScrollEnabled))
        } catch (error) {
            logger.ide.warn('Failed to persist sticky scroll state', error)
        }
    }, [stickyScrollEnabled])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.SPLIT_EDITOR_ENABLED, String(splitEditorEnabled))
        } catch (error) {
            logger.ide.warn('Failed to persist split editor state', error)
        }
    }, [splitEditorEnabled])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.SPLIT_EDITOR_RATIO, String(editorSplitRatio))
        } catch (error) {
            logger.ide.warn('Failed to persist split ratio', error)
        }
    }, [editorSplitRatio])

    useEffect(() => {
        try {
            if (secondaryActiveFile) {
                localStorage.setItem(STORAGE_KEYS.SECONDARY_ACTIVE_FILE, secondaryActiveFile)
            } else {
                localStorage.removeItem(STORAGE_KEYS.SECONDARY_ACTIVE_FILE)
            }
        } catch (error) {
            logger.ide.warn('Failed to persist secondary active file', error)
        }
    }, [secondaryActiveFile])

    const handleClearCache = useCallback(async () => {
        await globalThis.window.electronAPI?.code.clearCache()
        addNotification('Execution cache cleared', 'success')
    }, [addNotification])

    const handleReloadWindow = () => {
        window.location.reload()
    }

    const handleOpenCommandPalette = useCallback(() => {
        setPaletteOpen(true)
        setPaletteMode('commands')
    }, [])


    const handleAboutKalynt = useCallback(() => {
        addNotification('Kalynt IDE v1.0 beta - AI-Powered Development Environment', 'info')
    }, [addNotification])

    const handleToggleSplitEditor = useCallback(() => {
        if (!splitEditorEnabled && openFiles.length < 2) {
            addNotification('Open at least 2 files to use split editor', 'warning')
            return
        }

        const newSplitState = !splitEditorEnabled
        setSplitEditorEnabled(newSplitState)

        // If enabling split and no secondary file is set, use the next file
        if (newSplitState && !secondaryActiveFile && openFiles.length >= 2) {
            const currentIndex = openFiles.findIndex(f => f.path === activeFile)
            const nextFile = openFiles[(currentIndex + 1) % openFiles.length]
            setSecondaryActiveFile(nextFile.path)
        }

        // If disabling, keep secondary file for next time
    }, [splitEditorEnabled, openFiles, activeFile, secondaryActiveFile, addNotification])

    const handleSecondaryEditorChange = useCallback((value: string | undefined) => {
        if (!value || !secondaryActiveFile) return
        setOpenFiles(prev => prev.map(f =>
            f.path === secondaryActiveFile ? { ...f, content: value, isDirty: true } : f
        ))
    }, [secondaryActiveFile])

    const handleSecondaryEditorDidMount = (editor: ICodeEditor) => {
        // BUG #22: Dispose old secondary editor
        if (secondaryEditorRef.current) {
            try {
                (secondaryEditorRef.current as any).dispose?.()
            } catch (e) {
                console.warn('[IDE] Failed to dispose secondary editor:', e)
            }
        }
        secondaryEditorRef.current = editor
    }

    // Persist UI state
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.SIDEBAR_OPEN, String(sidebarOpen))
            localStorage.setItem(STORAGE_KEYS.TERMINAL_VISIBLE, String(showTerminal))
            localStorage.setItem(STORAGE_KEYS.TERMINAL_HEIGHT, String(terminalHeight))
            localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth))
            localStorage.setItem(STORAGE_KEYS.RIGHT_PANEL_WIDTH, String(rightPanelWidth))
        } catch (error) {
            logger.ide.warn('Failed to persist UI state to localStorage', error)
        }
    }, [sidebarOpen, showTerminal, terminalHeight, sidebarWidth, rightPanelWidth])

    // Restore workspace on mount
    useEffect(() => {
        const restoreWorkspace = async () => {
            if (workspacePath) {
                try {
                    await globalThis.window.electronAPI?.fs.setWorkspace(workspacePath)
                } catch (err) {
                    console.error('[IDE] Failed to restore workspace:', err)
                    setWorkspacePath(null)
                }
            }
        }
        restoreWorkspace()
    }, [])

    // Close workspace handler
    const handleCloseWorkspace = useCallback(() => {
        // Close all open files first
        const hasUnsaved = openFiles.some(f => f.isDirty)
        if (hasUnsaved) {
            const confirmed = globalThis.window.confirm('You have unsaved changes. Close workspace anyway?')
            if (!confirmed) return
        }

        setWorkspacePath(null)
        setOpenFiles([])
        setActiveFile(null)
        addNotification('Workspace closed', 'info')
    }, [openFiles, addNotification])


    // Open folder dialog
    const handleOpenFolder = async () => {
        const result = await globalThis.window.electronAPI?.fs.openFolder()
        if (result?.success && result.path) {
            setWorkspacePath(result.path)
            await globalThis.window.electronAPI?.fs.setWorkspace(result.path)
            setOpenFiles([])
            setActiveFile(null)
        }
    }

    // Open file in editor
    const handleOpenFile = async (filePath: string, line?: number) => {
        // SECURITY FIX: Validate path to prevent traversal attacks
        const validation = validatePath(filePath, workspacePath)
        if (!validation.valid) {
            addNotification(validation.error || 'Invalid file path', 'error')
            logger.ide.warn('Path validation failed for file open', { filePath, error: validation.error })
            return
        }

        const validatedPath = validation.normalizedPath!

        if (line) setPendingLine(line)
        const existing = openFiles.find(f => f.path === validatedPath)
        if (existing) {
            setActiveFile(validatedPath)
            return
        }

        const result = await globalThis.window.electronAPI?.fs.readFile(validatedPath)
        if (!result?.success) {
            try {
                const dirResult = await globalThis.window.electronAPI?.fs.readDir(validatedPath)
                if (dirResult?.success) {
                    setActivePanel('files')
                    setRequestedExpansion(validatedPath)
                    return
                }
            } catch (error) {
                logger.ide.debug('Path is not a directory, treating as file error', { filePath: validatedPath, error })
            }

            addNotification(`Failed to read file: ${result?.error || 'Unknown error'}`, 'error')
            return
        }

        const fileName = validatedPath.split(/[/\\]/).pop() || 'untitled'
        const language = getLanguageFromFileName(fileName)

        const newFile: OpenFile = {
            path: validatedPath,
            name: fileName,
            content: result.content || '',
            language,
            isDirty: false
        }

        setOpenFiles([...openFiles, newFile])
        setActiveFile(validatedPath)
    }

    const getLanguageFromFileName = (fileName: string): string => {
        const ext = fileName.split('.').pop()?.toLowerCase()
        const langMap: Record<string, string> = {
            'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
            'json': 'json', 'md': 'markdown', 'css': 'css', 'scss': 'scss', 'html': 'html',
            'py': 'python', 'rs': 'rust', 'go': 'go', 'java': 'java', 'c': 'c', 'cpp': 'cpp',
            'h': 'c', 'hpp': 'cpp', 'yaml': 'yaml', 'yml': 'yaml', 'xml': 'xml', 'sql': 'sql',
            'sh': 'shell', 'bash': 'shell', 'ps1': 'powershell'
        }
        return langMap[ext || ''] || 'plaintext'
    }

    const handleEditorDidMount = (editor: unknown, monaco: unknown) => {
        // BUG #22: Dispose old editor before replacing
        if (editorRef.current) {
            try {
                (editorRef.current as any).dispose?.()
            } catch (e) {
                console.warn('[IDE] Failed to dispose editor:', e)
            }
        }
        editorRef.current = editor as ICodeEditor
        monacoRef.current = monaco

        // Add breakpoint gutter click handler
        const monacoEditor = editor as any
        monacoEditor.onMouseDown((e: any) => {
            // Check if click is on the gutter (line number margin)
            if (e.target.type === 2 || e.target.type === 3) { // GUTTER_GLYPH_MARGIN or GUTTER_LINE_NUMBERS
                const lineNumber = e.target.position?.lineNumber
                if (lineNumber && activeFile) {
                    toggleBreakpoint(activeFile, lineNumber)
                }
            }
        })
    }

    // Toggle breakpoint at a specific line
    const toggleBreakpoint = useCallback((filePath: string, lineNumber: number) => {
        setBreakpoints(prev => {
            const newMap = new Map(prev)
            const fileBreakpoints = newMap.get(filePath) || []

            if (fileBreakpoints.includes(lineNumber)) {
                // Remove breakpoint
                newMap.set(filePath, fileBreakpoints.filter(l => l !== lineNumber))
            } else {
                // Add breakpoint
                newMap.set(filePath, [...fileBreakpoints, lineNumber].sort((a, b) => a - b))
            }

            return newMap
        })
    }, [])

    // Update breakpoint decorations when breakpoints or active file changes
    useEffect(() => {
        if (!editorRef.current || !monacoRef.current || !activeFile) return

        const monaco = monacoRef.current
        const editor = editorRef.current as any
        const fileBreakpoints = breakpoints.get(activeFile) || []

        // Clear old decorations
        breakpointDecorationsRef.current = editor.deltaDecorations(
            breakpointDecorationsRef.current,
            fileBreakpoints.map((lineNumber: number) => ({
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    isWholeLine: true,
                    glyphMarginClassName: 'breakpoint-glyph',
                    glyphMarginHoverMessage: { value: 'Breakpoint' },
                    linesDecorationsClassName: 'breakpoint-line-decoration',
                }
            }))
        )
    }, [breakpoints, activeFile])

    // Sync breakpoints to debug session when debugging
    useEffect(() => {
        if (!isDebugging || !debugSessionIdRef.current) return

        // Send all breakpoints to the debug session
        const syncBreakpoints = async () => {
            for (const [filePath, lines] of breakpoints.entries()) {
                if (lines.length > 0) {
                    try {
                        await window.electronAPI?.debug.setBreakpoints(
                            debugSessionIdRef.current!,
                            filePath,
                            lines.map(line => ({ line, verified: false }))
                        )
                    } catch (error) {
                        console.error('Failed to sync breakpoints for', filePath, error)
                    }
                }
            }
        }

        syncBreakpoints()
    }, [isDebugging, breakpoints])

    const handleEditorChange = (value: string | undefined) => {
        if (!activeFile || value === undefined) return
        setOpenFiles(openFiles.map(f =>
            f.path === activeFile ? { ...f, content: value, isDirty: true } : f
        ))
    }

    const handleSaveFile = useCallback(async () => {
        if (!activeFile || !activeFileObj) return

        // SECURITY FIX: Validate path to prevent traversal attacks
        const validation = validatePath(activeFile, workspacePath)
        if (!validation.valid) {
            addNotification(validation.error || 'Invalid file path', 'error')
            logger.ide.warn('Path validation failed for file save', { filePath: activeFile, error: validation.error })
            return
        }

        const validatedPath = validation.normalizedPath!

        const exists = await globalThis.window.electronAPI?.fileExists(validatedPath)
        if (!exists) {
            setDeletedFileDialog({ isOpen: true, filePath: validatedPath })
            return
        }

        const result = await globalThis.window.electronAPI?.fs.writeFile({
            path: validatedPath,
            content: activeFileObj.content
        })

        if (result?.success) {
            setOpenFiles(prev => prev.map(f =>
                f.path === activeFile ? { ...f, isDirty: false } : f
            ))
        }
    }, [activeFile, activeFileObj, workspacePath, addNotification])

    const forceCloseFile = useCallback((filePath: string) => {
        setOpenFiles(prev => {
            const remaining = prev.filter(f => f.path !== filePath)
            if (activeFile === filePath) {
                setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
            }
            return remaining
        })
    }, [activeFile])

    const handleCloseFile = useCallback((filePath: string, e?: React.MouseEvent) => {
        e?.stopPropagation()
        const file = openFiles.find(f => f.path === filePath)
        if (file?.isDirty) {
            setUnsavedDialog({ isOpen: true, filePath })
            return
        }
        forceCloseFile(filePath)
    }, [openFiles, forceCloseFile])

    const handleRunCode = useCallback(async () => {
        if (!activeFileObj) return
        const lang = activeFileObj.language

        // All languages supported by the code execution backend
        const supportedLanguages = [
            'javascript', 'typescript', 'python', 'node', 'deno', 'bun',
            'rust', 'go', 'java', 'dotnet', 'csharp', 'fsharp', 'ruby', 'php',
            'c', 'cpp', 'gcc', 'kotlin', 'swift', 'scala', 'perl', 'lua',
            'haskell', 'elixir', 'r', 'julia', 'dart', 'zig', 'clojure',
            'groovy', 'ocaml', 'erlang', 'v', 'nim', 'html'
        ]

        if (!supportedLanguages.includes(lang)) {
            addNotification(`Running ${lang} is not supported.`, 'warning')
            return
        }

        await handleSaveFile()
        const execId = `exec-${Date.now()}`
        executionIdRef.current = execId
        setIsRunning(true)
        setCodeOutput(`▶ Running ${activeFileObj.name}...\n`)

        // Show terminal for output
        setShowTerminal(true)

        // SECURITY FIX: Cleanup previous listeners before registering new ones
        codeListenersCleanupRef.current.forEach(cleanup => cleanup())
        codeListenersCleanupRef.current = []

        // Listen for code output and accumulate in state
        const outputHandler = (data: { id: string; type: string; data: string }) => {
            console.log('[CodeExec] Output received:', data.id, data.type, data.data?.substring(0, 50))
            if (data.id === execId && data.data) {
                setCodeOutput(prev => prev + data.data)
            }
        }
        const removeOutput = window.electronAPI?.code.onOutput(outputHandler)
        if (removeOutput) codeListenersCleanupRef.current.push(removeOutput)

        // Listen for execution completion
        const exitHandler = (data: { id: string; exitCode: number }) => {
            console.log('[CodeExec] Exit received:', data.id, data.exitCode)
            if (data.id === execId) {
                setIsRunning(false)
                executionIdRef.current = null
                const exitMsg = data.exitCode === 0
                    ? `\n✓ Process exited with code ${data.exitCode}`
                    : `\n✗ Process exited with code ${data.exitCode}`
                setCodeOutput(prev => prev + exitMsg)

                // Cleanup listeners after execution completes
                codeListenersCleanupRef.current.forEach(cleanup => cleanup())
                codeListenersCleanupRef.current = []
            }
        }
        const removeExit = window.electronAPI?.code.onExit(exitHandler)
        if (removeExit) codeListenersCleanupRef.current.push(removeExit)

        console.log('[CodeExec] Starting execution:', execId, lang)

        // Execute code
        const result = await window.electronAPI?.code.execute({
            id: execId,
            code: activeFileObj.content,
            language: lang,
            cwd: workspacePath || undefined
        })

        console.log('[CodeExec] Execute result:', result)

        if (!result?.success) {
            setCodeOutput(prev => prev + `\n✗ Execution failed: ${result?.error || 'Unknown error'}`)
            setIsRunning(false)
            executionIdRef.current = null
            // Cleanup on error
            codeListenersCleanupRef.current.forEach(cleanup => cleanup())
            codeListenersCleanupRef.current = []
        }
    }, [activeFileObj, handleSaveFile, workspacePath, addNotification])

    const handleStopCode = () => {
        if (executionIdRef.current) {
            window.electronAPI?.code.kill(executionIdRef.current)
            globalThis.window.electronAPI?.terminal.writeOutput({
                id: 'term-1',
                data: `\r\n\x1b[33m⚠ Execution stopped by user\x1b[0m\r\n`
            })
            setIsRunning(false)
            executionIdRef.current = null
        }
    }

    const handleDebugCode = useCallback(async () => {
        if (!activeFileObj || !workspacePath || !activeFile) return

        // Save file first
        await handleSaveFile()

        // Show terminal
        if (!showTerminal) {
            setShowTerminal(true)
        }

        try {
            // Get debug configurations
            const configsResult = await window.electronAPI?.debug.getConfigurations(workspacePath)

            if (!configsResult?.success || !configsResult.configurations || configsResult.configurations.length === 0) {
                addNotification('No debug configurations found. Creating auto-detected configuration...', 'info')

                // Use auto-detected configuration
                const autoConfig = {
                    type: 'node' as const,
                    request: 'launch' as const,
                    name: 'Auto Debug',
                    program: activeFile,
                    skipFiles: ['<node_internals>/**'],
                }

                const result = await window.electronAPI?.debug.start(autoConfig, workspacePath, activeFile)

                if (result?.success && result.sessionId) {
                    debugSessionIdRef.current = result.sessionId
                    setIsDebugging(true)

                    globalThis.window.electronAPI?.terminal.writeOutput({
                        id: 'term-1',
                        data: `\r\n\x1b[1m\x1b[36m▶ Starting debug session...\x1b[0m\r\n`
                    })
                } else {
                    addNotification(result?.error || 'Failed to start debug session', 'error')
                }
            } else {
                // Use first available configuration
                const config = configsResult.configurations[0]
                const result = await window.electronAPI?.debug.start(config, workspacePath, activeFile)

                if (result?.success && result.sessionId) {
                    debugSessionIdRef.current = result.sessionId
                    setIsDebugging(true)

                    globalThis.window.electronAPI?.terminal.writeOutput({
                        id: 'term-1',
                        data: `\r\n\x1b[1m\x1b[36m▶ Starting debug session: ${config.name}\x1b[0m\r\n`
                    })
                } else {
                    addNotification(result?.error || 'Failed to start debug session', 'error')
                }
            }
        } catch (error: any) {
            addNotification(`Debug error: ${error.message}`, 'error')
        }
    }, [activeFileObj, activeFile, handleSaveFile, workspacePath, showTerminal, addNotification])

    const handleStopDebug = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.stop(debugSessionIdRef.current)

                globalThis.window.electronAPI?.terminal.writeOutput({
                    id: 'term-1',
                    data: `\r\n\x1b[33m⚠ Debug session stopped by user\x1b[0m\r\n`
                })

                setIsDebugging(false)
                debugSessionIdRef.current = null
            } catch (error: any) {
                addNotification(`Failed to stop debug session: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    // Debug control handlers
    const handleDebugContinue = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.continue(debugSessionIdRef.current)
            } catch (error: any) {
                addNotification(`Debug continue failed: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const handleDebugStepOver = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.stepOver(debugSessionIdRef.current)
            } catch (error: any) {
                addNotification(`Debug step over failed: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const handleDebugStepInto = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.stepInto(debugSessionIdRef.current)
            } catch (error: any) {
                addNotification(`Debug step into failed: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const handleDebugStepOut = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.stepOut(debugSessionIdRef.current)
            } catch (error: any) {
                addNotification(`Debug step out failed: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const handleDebugPause = useCallback(async () => {
        if (debugSessionIdRef.current) {
            try {
                await window.electronAPI?.debug.pause(debugSessionIdRef.current)
            } catch (error: any) {
                addNotification(`Debug pause failed: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const handleBuildCode = useCallback(async () => {
        if (!workspacePath) return

        // Show terminal
        if (!showTerminal) {
            setShowTerminal(true)
        }

        try {
            // Get available tasks
            const tasksResult = await window.electronAPI?.build.getTasks(workspacePath)

            if (!tasksResult?.success || !tasksResult.tasks || tasksResult.tasks.length === 0) {
                addNotification('No build tasks found. Make sure you have a tasks.json file or package.json', 'warning')

                globalThis.window.electronAPI?.terminal.writeOutput({
                    id: 'term-1',
                    data: `\r\n\x1b[33m⚠ No build tasks found in workspace\x1b[0m\r\n`
                })
                return
            }

            // Find default build task or use first task
            const buildTask = tasksResult.tasks.find((task: any) => {
                const group = task.group
                if (typeof group === 'object' && group.kind === 'build' && group.isDefault) {
                    return true
                }
                return group === 'build'
            }) || tasksResult.tasks[0]

            const result = await window.electronAPI?.build.executeTask(buildTask, workspacePath)

            if (result?.success && result.taskId) {
                buildTaskIdRef.current = result.taskId
                setIsBuilding(true)
            } else {
                addNotification(result?.error || 'Failed to start build task', 'error')
            }
        } catch (error: any) {
            addNotification(`Build error: ${error.message}`, 'error')
        }
    }, [workspacePath, showTerminal, addNotification])

    const handleStopBuild = useCallback(async () => {
        if (buildTaskIdRef.current) {
            try {
                await window.electronAPI?.build.killTask(buildTaskIdRef.current)

                globalThis.window.electronAPI?.terminal.writeOutput({
                    id: 'term-1',
                    data: `\r\n\x1b[33m⚠ Build task stopped by user\x1b[0m\r\n`
                })

                setIsBuilding(false)
                buildTaskIdRef.current = null
            } catch (error: any) {
                addNotification(`Failed to stop build task: ${error.message}`, 'error')
            }
        }
    }, [addNotification])

    const indexFiles = useCallback(async () => {
        if (!workspacePath) { setWorkspaceFiles([]); return }
        try {
            // Workspace path is already validated when set, but double-check
            const workspaceValidation = validatePath(workspacePath, workspacePath)
            if (!workspaceValidation.valid) {
                logger.ide.warn('Invalid workspace path in indexFiles', { workspacePath })
                return
            }

            const result = await window.electronAPI?.fs.readDir(workspacePath)
            if (result?.success && result.items) {
                const files: FileItem[] = []
                const processEntries = async (items: FileSystemItem[], basePath: string) => {
                    for (const item of items) {
                        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(item.name)) continue
                        const fullPath = `${basePath}${basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/'}${item.name}`

                        // SECURITY FIX: Validate each constructed path
                        const pathValidation = validatePath(fullPath, workspacePath)
                        if (!pathValidation.valid) {
                            logger.ide.debug('Skipping invalid path during indexing', { fullPath })
                            continue
                        }

                        if (item.isDirectory) {
                            const subResult = await globalThis.window.electronAPI?.fs.readDir(pathValidation.normalizedPath!)
                            if (subResult?.success && subResult.items) {
                                files.push({ path: pathValidation.normalizedPath!, name: item.name, type: 'directory' })
                                await processEntries(subResult.items, pathValidation.normalizedPath!)
                            }
                        } else {
                            files.push({ path: pathValidation.normalizedPath!, name: item.name, type: 'file' })
                        }
                    }
                }
                await processEntries(result.items, workspacePath)
                setWorkspaceFiles(files)
            }
        } catch (err) { console.error('[IDE] Failed to index:', err) }
    }, [workspacePath])

    useEffect(() => { indexFiles() }, [workspacePath, indexFiles])

    // PERFORMANCE FIX: File watcher should only depend on workspacePath
    // Removed activeFile and indexFiles from dependencies to prevent over-firing
    useEffect(() => {
        if (!workspacePath) return
        const watchId = 'workspace-root'
        window.electronAPI?.fs.watchDir({ id: watchId, dirPath: workspacePath })
        const removeListener = window.electronAPI?.fs.onChange((data: { id: string; event: string; path: string }) => {
            if (data.id === watchId && (data.event === 'unlink' || data.event === 'unlinkDir')) {
                const normalizedDeletedPath = data.path.replace(/\\/g, '/')
                setOpenFiles(prev => prev.filter(f => f.path.replace(/\\/g, '/') !== normalizedDeletedPath))
                setActiveFile(prev => prev && prev.replace(/\\/g, '/') === normalizedDeletedPath ? null : prev)
                // Trigger re-index when files change
                indexFiles()
            }
        })
        return () => { removeListener?.(); window.electronAPI?.fs.unwatchDir(watchId) }
    }, [workspacePath]) // ONLY depend on workspacePath

    // Build event listeners
    useEffect(() => {
        const removeOutputListener = window.electronAPI?.build.onOutput((data: { type: string }) => {
            // Output is automatically routed to terminal
            if (data.type === 'end') {
                setIsBuilding(false)
                buildTaskIdRef.current = null
            }
        })

        const removeEndListener = window.electronAPI?.build.onEnd((data: { problems?: any[]; exitCode: number }) => {
            setIsBuilding(false)
            buildTaskIdRef.current = null

            if (data.problems && data.problems.length > 0) {
                addNotification(`Build completed with ${data.problems.length} problem(s)`, 'warning')
            } else if (data.exitCode === 0) {
                addNotification('Build completed successfully', 'success')
            } else {
                addNotification(`Build failed with exit code ${data.exitCode}`, 'error')
            }
        })

        return () => {
            removeOutputListener?.()
            removeEndListener?.()
        }
    }, [addNotification])

    // Debug event listeners
    useEffect(() => {
        const removeStartedListener = window.electronAPI?.debug.onStarted((data: { configuration: { name: string } }) => {
            addNotification(`Debug session started: ${data.configuration.name}`, 'success')
        })

        const removeStoppedListener = window.electronAPI?.debug.onStopped(() => {
            globalThis.window.electronAPI?.terminal.writeOutput({
                id: 'term-1',
                data: `\r\n\x1b[33m⏸ Debugger paused\x1b[0m\r\n`
            })
        })

        const removeTerminatedListener = window.electronAPI?.debug.onTerminated(() => {
            setIsDebugging(false)
            debugSessionIdRef.current = null

            globalThis.window.electronAPI?.terminal.writeOutput({
                id: 'term-1',
                data: `\r\n\x1b[36m✓ Debug session terminated\x1b[0m\r\n`
            })
            addNotification('Debug session ended', 'info')
        })

        const removeOutputListener = window.electronAPI?.debug.onOutput((data: { data?: string }) => {
            if (data.data) {
                globalThis.window.electronAPI?.terminal.writeOutput({
                    id: 'term-1',
                    data: data.data
                })
            }
        })

        const removeErrorListener = window.electronAPI?.debug.onError((data: { error: string }) => {
            addNotification(`Debug error: ${data.error}`, 'error')
            setIsDebugging(false)
            debugSessionIdRef.current = null
        })

        return () => {
            removeStartedListener?.()
            removeStoppedListener?.()
            removeTerminatedListener?.()
            removeOutputListener?.()
            removeErrorListener?.()
        }
    }, [addNotification])

    const handleNewFile = async () => {
        if (!workspacePath) return
        const fileName = window.prompt('Enter file name:')
        if (!fileName) return

        const fullPath = `${workspacePath}/${fileName}`

        // SECURITY FIX: Validate path to prevent directory traversal
        const validation = validatePath(fullPath, workspacePath)
        if (!validation.valid) {
            addNotification(validation.error || 'Invalid file path', 'error')
            logger.ide.warn('Path validation failed for new file', { fullPath, error: validation.error })
            return
        }

        const result = await window.electronAPI?.fs.writeFile({ path: validation.normalizedPath!, content: '' })
        if (result?.success) {
            handleOpenFile(validation.normalizedPath!)
            indexFiles()
            addNotification(`File created: ${fileName}`, 'success')
        } else {
            addNotification(`Failed to create: ${result?.error}`, 'error')
        }
    }

    // Add extension command
    const handleShowExtensions = useCallback(() => {
        setShowExtensions(true)
    }, [])
    
    const ideCommands = useMemo<IDECommand[]>(() => {
        const baseCommands = createDefaultCommands({
            newFile: handleNewFile,
            saveFile: handleSaveFile,
            closeFile: () => { if (activeFile) handleCloseFile(activeFile) },
            closeAllFiles: () => { setOpenFiles([]); setActiveFile(null) },
            openFolder: handleOpenFolder,
            toggleTerminal: () => setShowTerminal(prev => !prev),
            toggleSidebar: () => setSidebarOpen(prev => !prev),
            toggleGitPanel: () => setActivePanel('git'),
            toggleAIPanel: () => setAgentOpen(!agentOpen),
            runCode: handleRunCode,
            debugCode: handleDebugCode,
            buildCode: handleBuildCode,
            formatDocument: () => editorRef.current?.getAction('editor.action.formatDocument')?.run(),
            goToLine: () => editorRef.current?.getAction('editor.action.gotoLine')?.run(),
            findInFiles: () => setActivePanel('search'),
            gitCommit: () => setActivePanel('git'),
            gitPush: async () => { if (workspacePath) await globalThis.window.electronAPI?.git.push(workspacePath) },
            gitPull: async () => { if (workspacePath) await globalThis.window.electronAPI?.git.pull(workspacePath) },
            aiChat: () => setAgentOpen(true),
            aiExplain: () => setAgentOpen(true),
            aiRefactor: () => { } // Handled via Inline AI tool
        })
        
        // Add extension command
        const extensionCommand: IDECommand = {
            id: 'view.extensions',
            title: 'Extensions: Show Extension Manager',
            shortcut: 'Ctrl+Shift+X',
            category: 'view',
            icon: <Puzzle size={16} />,
            action: handleShowExtensions
        }
        
        return [...baseCommands, extensionCommand]
    }, [activeFile, workspacePath, handleNewFile, handleSaveFile, handleCloseFile, handleRunCode, handleDebugCode, handleBuildCode, agentOpen, handleShowExtensions])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveFile() }
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (activeFile) handleCloseFile(activeFile) }
            if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) { e.preventDefault(); setPaletteMode('files'); setPaletteOpen(true) }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') { e.preventDefault(); setPaletteMode('commands'); setPaletteOpen(true) }
            if (e.key === 'F1') { e.preventDefault(); setPaletteMode('commands'); setPaletteOpen(true) }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); setActivePanel('search') }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); setShowExtensions(true) }
            if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); setShowTerminal(prev => !prev) }
            // Run/Debug/Build shortcuts
            if (e.key === 'F5' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                if (isDebugging) handleDebugContinue()
                else if (isRunning) handleStopCode()
                else handleRunCode()
            }
            if (e.shiftKey && e.key === 'F5') { e.preventDefault(); handleStopDebug() }
            if (e.key === 'F9') { e.preventDefault(); if (isDebugging) handleStopDebug(); else handleDebugCode() }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') { e.preventDefault(); if (isBuilding) handleStopBuild(); else handleBuildCode() }
            // Debug step shortcuts (only when debugging)
            if (isDebugging) {
                if (e.key === 'F10' && !e.shiftKey) { e.preventDefault(); handleDebugStepOver() }
                if (e.key === 'F11' && !e.shiftKey) { e.preventDefault(); handleDebugStepInto() }
                if (e.shiftKey && e.key === 'F11') { e.preventDefault(); handleDebugStepOut() }
                if (e.key === 'F6') { e.preventDefault(); handleDebugPause() }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [activeFile, openFiles, handleSaveFile, handleCloseFile, handleRunCode, handleStopCode, isRunning, handleDebugCode, handleStopDebug, isDebugging, handleBuildCode, handleStopBuild, isBuilding, handleDebugContinue, handleDebugStepOver, handleDebugStepInto, handleDebugStepOut, handleDebugPause])

    useEffect(() => {
        if (activeFile && pendingLine && editorRef.current) {
            setTimeout(() => {
                editorRef.current?.revealLineInCenter(pendingLine)
                editorRef.current?.setPosition({ lineNumber: pendingLine, column: 1 })
                editorRef.current?.focus()
                setPendingLine(null)
            }, 100)
        }
    }, [activeFile, pendingLine])

    // Listen for file open requests from other components (e.g. AI scan cards)
    useEffect(() => {
        const handleOpen = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; line?: number }>).detail
            if (detail?.path) handleOpenFile(detail.path, detail.line)
        }

        // Listen for apply-fix requests: opens/updates file content without writing to disk
        const handleApplyFix = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; content: string; line?: number }>).detail
            if (!detail?.path || detail?.content == null) return

            const validation = validatePath(detail.path, workspacePath)
            if (!validation.valid) return
            const vPath = validation.normalizedPath!

            if (detail.line) setPendingLine(detail.line)

            const existing = openFiles.find(f => f.path === vPath)
            if (existing) {
                // Update existing tab content and mark dirty
                setOpenFiles(prev => prev.map(f =>
                    f.path === vPath ? { ...f, content: detail.content, isDirty: true } : f
                ))
                setActiveFile(vPath)
            } else {
                // Open new tab with the provided content
                const fileName = vPath.split(/[/\\]/).pop() || 'untitled'
                const language = getLanguageFromFileName(fileName)
                setOpenFiles(prev => [...prev, { path: vPath, name: fileName, content: detail.content, language, isDirty: true }])
                setActiveFile(vPath)
            }
        }

        window.addEventListener('kalynt-open-file', handleOpen)
        window.addEventListener('kalynt-apply-fix', handleApplyFix)
        return () => {
            window.removeEventListener('kalynt-open-file', handleOpen)
            window.removeEventListener('kalynt-apply-fix', handleApplyFix)
        }
    })

    const handleResizeSidebar = useCallback((e: MouseEvent) => {
        if (!isResizingSidebar) return
        const newWidth = e.clientX - 48 // Subtract activity bar width
        if (newWidth > 200 && newWidth < 600) {
            setSidebarWidth(newWidth)
        }
    }, [isResizingSidebar])

    const stopResizingSidebar = useCallback(() => {
        setIsResizingSidebar(false)
    }, [])

    const handleResizeRightPanel = useCallback((e: MouseEvent) => {
        if (!isResizingRightPanel) return
        const newWidth = window.innerWidth - e.clientX
        if (newWidth > 250 && newWidth < 800) {
            setRightPanelWidth(newWidth)
        }
    }, [isResizingRightPanel])

    const stopResizingRightPanel = useCallback(() => {
        setIsResizingRightPanel(false)
    }, [])

    const handleResizeSplit = useCallback((e: MouseEvent) => {
        if (!isResizingSplit) return
        const container = document.querySelector('.split-editor-container')
        if (!container) return

        const rect = container.getBoundingClientRect()
        const newRatio = (e.clientX - rect.left) / rect.width

        // Clamp between 30% and 70%
        if (newRatio >= 0.3 && newRatio <= 0.7) {
            setEditorSplitRatio(newRatio)
        }
    }, [isResizingSplit])

    const stopResizingSplit = useCallback(() => {
        setIsResizingSplit(false)
    }, [])

    // FIX: Simplified listener management to prevent accumulation
    // Only add listeners when resizing, cleanup removes them
    useEffect(() => {
        if (!isResizingSplit) return

        window.addEventListener('mousemove', handleResizeSplit)
        window.addEventListener('mouseup', stopResizingSplit)

        return () => {
            window.removeEventListener('mousemove', handleResizeSplit)
            window.removeEventListener('mouseup', stopResizingSplit)
        }
    }, [isResizingSplit, handleResizeSplit, stopResizingSplit])

    useEffect(() => {
        if (!isResizingSidebar) return

        window.addEventListener('mousemove', handleResizeSidebar)
        window.addEventListener('mouseup', stopResizingSidebar)

        return () => {
            window.removeEventListener('mousemove', handleResizeSidebar)
            window.removeEventListener('mouseup', stopResizingSidebar)
        }
    }, [isResizingSidebar, handleResizeSidebar, stopResizingSidebar])

    useEffect(() => {
        if (!isResizingRightPanel) return

        window.addEventListener('mousemove', handleResizeRightPanel)
        window.addEventListener('mouseup', stopResizingRightPanel)

        return () => {
            window.removeEventListener('mousemove', handleResizeRightPanel)
            window.removeEventListener('mouseup', stopResizingRightPanel)
        }
    }, [isResizingRightPanel, handleResizeRightPanel, stopResizingRightPanel])

    return (
        <div className={`ide-workspace ${isResizingSidebar ? 'resizing-active' : ''}`}>
            {isResizingSidebar && <div className="resize-overlay" />}

            <IDEActivityBar activePanel={activePanel} onPanelChange={setActivePanel} />

            <IDEPanelContainer
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                activePanel={activePanel}
                workspacePath={workspacePath}
                onOpenFolder={handleOpenFolder}
                onCloseWorkspace={handleCloseWorkspace}
                onSelectFile={handleOpenFile}
                onCloseFile={handleCloseFile}
                selectedFile={activeFile}
                openFiles={openFiles.map(f => ({ path: f.path, name: f.name, isDirty: f.isDirty }))}
                onFileCreate={() => indexFiles()}
                onFileDelete={(path) => {
                    setOpenFiles(prev => prev.filter(f => f.path !== path))
                    if (activeFile === path) setActiveFile(null)
                    indexFiles()
                }}
                onFileRename={(oldP, newP) => {
                    setOpenFiles(prev => prev.map(f => f.path === oldP ? { ...f, path: newP, name: newP.split(/[/\\]/).pop() || f.name } : f))
                    if (activeFile === oldP) setActiveFile(newP)
                    indexFiles()
                }}
                requestedExpansion={requestedExpansion}
                onExpansionComplete={() => setRequestedExpansion(null)}
            />

            {sidebarOpen && (
                <div
                    className={`sidebar-resizer ${isResizingSidebar ? 'resizing' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        setIsResizingSidebar(true)
                    }}
                />
            )}

            <main className="ide-main">
                <IDEToolbar
                    activeFileObj={activeFileObj || null}
                    onRunCode={handleRunCode}
                    onStopCode={handleStopCode}
                    isRunning={isRunning}
                    onDebugCode={handleDebugCode}
                    onStopDebug={handleStopDebug}
                    isDebugging={isDebugging}
                    onBuildCode={handleBuildCode}
                    onStopBuild={handleStopBuild}
                    isBuilding={isBuilding}
                    toggleAIPanel={() => setAgentOpen(prev => !prev)}
                    isAIAppOpen={agentOpen}
                    onToggleTerminal={() => setShowTerminal(prev => !prev)}
                    // Editor Settings
                    wordWrap={wordWrap as 'on' | 'off'}
                    onToggleWordWrap={() => setWordWrap(prev => prev === 'on' ? 'off' : 'on')}
                    minimapEnabled={minimapEnabled}
                    onToggleMinimap={() => setMinimapEnabled(prev => !prev)}
                    stickyScrollEnabled={stickyScrollEnabled}
                    onToggleStickyScroll={() => setStickyScrollEnabled(prev => !prev)}
                    // Utility Actions
                    onClearCache={handleClearCache}
                    onReloadWindow={handleReloadWindow}
                    onSplitEditor={handleToggleSplitEditor}
                    splitEditorEnabled={splitEditorEnabled}
                    onOpenCommandPalette={handleOpenCommandPalette}
                    onAboutKalynt={handleAboutKalynt}
                    // Debug Controls
                    onDebugContinue={handleDebugContinue}
                    onDebugStepOver={handleDebugStepOver}
                    onDebugStepInto={handleDebugStepInto}
                    onDebugStepOut={handleDebugStepOut}
                    onDebugPause={handleDebugPause}
                />

                <IDETabList
                    openFiles={openFiles}
                    activeFile={activeFile}
                    onSelectFile={setActiveFile}
                    onCloseFile={handleCloseFile}
                />

                {activeFile && (
                    <Breadcrumbs
                        filePath={activeFile}
                        workspacePath={workspacePath}
                        onNavigate={handleOpenFile}
                    />
                )}

                <div className={`editor-container ${splitEditorEnabled ? 'split-mode' : ''}`}>
                    {activeFileObj ? (
                        <div className="split-editor-container">
                            {/* Primary Editor Pane */}
                            <div
                                className="editor-pane primary"
                                style={{
                                    width: splitEditorEnabled ? `${editorSplitRatio * 100}%` : '100%'
                                }}
                            >
                                <div className="split-editor-header" style={{ opacity: splitEditorEnabled ? 1 : 0 }}>
                                    <span className="split-file-name">{activeFileObj.name}</span>
                                </div>
                                <div style={{ height: splitEditorEnabled ? 'calc(100% - 24px)' : '100%' }}>
                                    <Editor
                                        height="100%"
                                        language={activeFileObj.language}
                                        value={activeFileObj.content}
                                        onChange={handleEditorChange}
                                        theme="vs-dark"
                                        onMount={handleEditorDidMount}
                                        options={{
                                            fontSize: 14,
                                            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                                            minimap: { enabled: minimapEnabled, scale: 1 },
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            tabSize: 2,
                                            wordWrap: wordWrap as 'on' | 'off',
                                            stickyScroll: { enabled: stickyScrollEnabled },
                                            lineNumbers: 'on',
                                            renderLineHighlight: 'all',
                                            bracketPairColorization: { enabled: true },
                                            cursorBlinking: 'smooth',
                                            smoothScrolling: true,
                                            inlineSuggest: { enabled: true },
                                            quickSuggestions: true,
                                            suggestOnTriggerCharacters: true
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Draggable Divider */}
                            <div
                                className={`editor-divider ${isResizingSplit ? 'resizing' : ''}`}
                                style={{
                                    width: splitEditorEnabled ? '4px' : '0px',
                                    opacity: splitEditorEnabled ? 1 : 0,
                                    pointerEvents: splitEditorEnabled ? 'auto' : 'none'
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    setIsResizingSplit(true)
                                }}
                            />

                            {/* Secondary Editor Pane */}
                            <div
                                className="editor-pane secondary"
                                style={{
                                    width: splitEditorEnabled && secondaryFileObj ? `${(1 - editorSplitRatio) * 100}%` : '0%',
                                    opacity: splitEditorEnabled ? 1 : 0
                                }}
                            >
                                {secondaryFileObj && (
                                    <>
                                        <div className="split-editor-header">
                                            <span className="split-file-name">{secondaryFileObj.name}</span>
                                        </div>
                                        <div style={{ height: 'calc(100% - 24px)' }}>
                                            <Editor
                                                height="100%"
                                                language={secondaryFileObj.language}
                                                value={secondaryFileObj.content}
                                                onChange={handleSecondaryEditorChange}
                                                theme="vs-dark"
                                                onMount={handleSecondaryEditorDidMount}
                                                options={{
                                                    fontSize: 14,
                                                    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                                                    minimap: { enabled: minimapEnabled, scale: 1 },
                                                    scrollBeyondLastLine: false,
                                                    automaticLayout: true,
                                                    tabSize: 2,
                                                    wordWrap: wordWrap as 'on' | 'off',
                                                    stickyScroll: { enabled: stickyScrollEnabled },
                                                    lineNumbers: 'on',
                                                    renderLineHighlight: 'all',
                                                    bracketPairColorization: { enabled: true },
                                                    cursorBlinking: 'smooth',
                                                    smoothScrolling: true,
                                                    inlineSuggest: { enabled: true },
                                                    quickSuggestions: true,
                                                    suggestOnTriggerCharacters: true
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="welcome-screen">
                            <Wand2 size={64} className="welcome-icon" />
                            <h2>Welcome to Kalynt IDE</h2>
                            <p>Open a folder to get started</p>
                            <button className="welcome-btn" onClick={handleOpenFolder}>
                                <FolderOpen size={18} />
                                <span>Open Folder</span>
                            </button>
                            <div className="shortcuts">
                                <p><kbd>Ctrl+S</kbd> Save file</p>
                                <p><kbd>Ctrl+W</kbd> Close tab</p>
                                <p><kbd>Ctrl+`</kbd> Toggle terminal</p>
                            </div>
                        </div>
                    )}
                </div>



                <IDEBottomTerminal
                    showTerminal={showTerminal}
                    terminalHeight={terminalHeight}
                    setTerminalHeight={setTerminalHeight}
                    workspacePath={workspacePath}
                    codeOutput={codeOutput}
                    isRunning={isRunning}
                />
            </main>

            {agentOpen && (
                <div
                    className={`sidebar-resizer right ${isResizingRightPanel ? 'resizing' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        setIsResizingRightPanel(true)
                    }}
                />
            )}

            <div className={`ide-right-panel ${agentOpen ? 'open' : ''}`} style={{ width: agentOpen ? `${rightPanelWidth}px` : 0 }}>
                <UnifiedAgentPanel
                    workspacePath={workspacePath}
                    currentFile={activeFile}
                    currentFileContent={activeFileObj?.content || null}
                />
            </div>

            <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                mode={paletteMode}
                files={workspaceFiles}
                onFileSelect={handleOpenFile}
                commands={ideCommands}
                workspacePath={workspacePath || undefined}
            />

            {showExtensions && <ExtensionManager onClose={() => setShowExtensions(false)} />}

            <InlineEditWidget
                visible={inlineEditVisible}
                selectedCode={inlineEditSelection}
                filePath={activeFile || ''}
                language={activeFileObj?.language || 'typescript'}
                position={inlineEditPosition}
                onApply={(newCode) => {
                    if (editorRef.current) {
                        const editor = editorRef.current
                        const selection = editor.getSelection()
                        if (selection) {
                            editor.executeEdits('inline-ai-edit', [{
                                range: selection,
                                text: newCode,
                                forceMoveMarkers: true
                            }])
                        }
                    }
                    setInlineEditVisible(false)
                }}
                onCancel={() => setInlineEditVisible(false)}
            />

            {unsavedDialog.isOpen && (
                <div className="dialog-overlay">
                    <div className="dialog">
                        <h3>Unsaved Changes</h3>
                        <p>Do you want to save changes to <strong>{openFiles.find(f => f.path === unsavedDialog.filePath)?.name}</strong>?</p>
                        <div className="dialog-actions">
                            <button className="btn-secondary" onClick={() => {
                                if (unsavedDialog.filePath) forceCloseFile(unsavedDialog.filePath)
                                setUnsavedDialog({ isOpen: false, filePath: null })
                            }}>Don't Save</button>
                            <button className="btn-secondary" onClick={() => setUnsavedDialog({ isOpen: false, filePath: null })}>Cancel</button>
                            <button className="btn-primary" onClick={async () => {
                                if (unsavedDialog.filePath) {
                                    const file = openFiles.find(f => f.path === unsavedDialog.filePath)
                                    if (file) await globalThis.window.electronAPI?.fs.writeFile({ path: file.path, content: file.content })
                                    forceCloseFile(unsavedDialog.filePath)
                                }
                                setUnsavedDialog({ isOpen: false, filePath: null })
                            }}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {deletedFileDialog.isOpen && (
                <div className="dialog-overlay">
                    <div className="dialog alert">
                        <h3>File Deleted</h3>
                        <p>The file <strong>{deletedFileDialog.filePath?.split(/[/\\]/).pop()}</strong> no longer exists. Close the tab?</p>
                        <div className="dialog-actions">
                            <button className="btn-secondary" onClick={() => setDeletedFileDialog({ isOpen: false, filePath: null })}>Keep Open</button>
                            <button className="btn-primary" onClick={() => {
                                if (deletedFileDialog.filePath) forceCloseFile(deletedFileDialog.filePath)
                                setDeletedFileDialog({ isOpen: false, filePath: null })
                            }}>Close Tab</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
