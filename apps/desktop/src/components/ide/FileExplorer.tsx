/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback } from 'react'
import {
    Folder, FileText, ChevronRight, ChevronDown,
    FolderPlus, FilePlus,
    FolderOpen, AlertTriangle, X, XCircle,
    Search, RefreshCw, ChevronUp, Trash2, Edit2,
    FileJson, FileCode, FileImage, Code2, Database, Terminal as TerminalIcon, Languages
} from 'lucide-react'
import './FileExplorer.css'
import type { FileSystemItem } from '../../vite-env'

interface FileNode extends FileSystemItem {
    children?: FileNode[]
    expanded?: boolean
    level: number
}

interface OpenFile {
    path: string
    name: string
    isDirty?: boolean
}

interface FileExplorerProps {
    workspacePath: string | null
    onOpenFolder: () => void
    onCloseWorkspace?: () => void
    onSelectFile: (filePath: string) => void
    onCloseFile?: (filePath: string) => void
    selectedFile: string | null
    openFiles?: OpenFile[]
    onFileCreate?: (dirPath: string, fileName: string) => void
    onFileDelete?: (filePath: string) => void
    onFileRename?: (oldPath: string, newPath: string) => void
    requestedExpansion?: string | null
    onExpansionComplete?: () => void
}

export default function FileExplorer({
    workspacePath,
    onOpenFolder,
    onCloseWorkspace,
    onSelectFile,
    onCloseFile,
    selectedFile,
    openFiles = [],
    onFileCreate,
    onFileDelete,
    onFileRename,
    requestedExpansion,
    onExpansionComplete
}: FileExplorerProps) {
    const [openEditorsExpanded, setOpenEditorsExpanded] = useState(true)
    const [files, setFiles] = useState<FileNode[]>([])
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState<boolean>(false)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)
    const [newItemInput, setNewItemInput] = useState<{ path: string; type: 'file' | 'folder' } | null>(null)
    const [newItemName, setNewItemName] = useState<string>('')
    const [renameInput, setRenameInput] = useState<{ path: string; name: string } | null>(null)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [focusedIndex, setFocusedIndex] = useState<number>(-1)
    const [error, setError] = useState<string | null>(null)
    const [dragOverPath, setDragOverPath] = useState<string | null>(null)
    
    // Virtualization: Track expanded file limits per directory
    const [dirFileLimits, setDirFileLimits] = useState<Map<string, number>>(new Map())
    const MAX_FILES_PER_DIR = 100 // Initial files to show
    const FILES_PER_PAGE = 50 // Additional files per "Show more" click



    // Load directory contents
    const loadDirectory = useCallback(async (dirPath: string, level: number = 0): Promise<FileNode[]> => {
        const result = await window.electronAPI?.fs.readDir(dirPath)
        if (!result?.success || !result.items) return []

        const nodes: FileNode[] = result.items
            .sort((a: FileSystemItem, b: FileSystemItem) => {
                // Directories first, then files
                if (a.isDirectory && !b.isDirectory) return -1
                if (!a.isDirectory && b.isDirectory) return 1
                return a.name.localeCompare(b.name)
            })
            .map((item: FileSystemItem) => ({
                ...item,
                level,
                expanded: false,
                children: item.isDirectory ? [] : undefined
            }))

        return nodes
    }, [])

    // Handle requested expansion from outside (e.g. Breadcrumbs)
    useEffect(() => {
        if (!requestedExpansion || !workspacePath) return

        const expandPath = async () => {
            // Get relative path parts
            const relative = requestedExpansion.replace(workspacePath, '').replace(/^[/\\]+/, '')
            const parts = relative.split(/[/\\]/).filter(Boolean)

            let currentPath = workspacePath
            const newExpanded = new Set(expandedDirs)
            newExpanded.add(workspacePath)

            for (const part of parts) {
                currentPath = `${currentPath}/${part}`
                newExpanded.add(currentPath)
            }

            setExpandedDirs(newExpanded)
            onExpansionComplete?.()
        }

        expandPath()
    }, [requestedExpansion, workspacePath, onExpansionComplete, expandedDirs])

    // Load root directory
    useEffect(() => {
        if (!workspacePath) {
            setFiles([])
            return
        }

        setLoading(true)
        loadDirectory(workspacePath).then(nodes => {
            setFiles(nodes)
            setLoading(false)
            // Auto-expand root
            setExpandedDirs(new Set([workspacePath]))
        }).catch(err => {
            console.error('[FileExplorer] Failed to load directory:', err)
            setError('Failed to load directory')
            setLoading(false)
        })

        // Watch for file changes with unique ID per workspace
        const watchId = `file-explorer-${workspacePath.replace(/[^a-zA-Z0-9]/g, '-')}`

        // Create specific handler for this workspace
        // Create specific handler for this workspace
        const changeHandler = (event: { id: string; event: string; path: string }) => {
            if (event.id === watchId) {
                // Refresh on changes using functional update to avoid stale state
                loadDirectory(workspacePath).then(nodes => {
                    setFiles(nodes)
                }).catch(err => {
                    console.error('[FileExplorer] Failed to refresh:', err)
                })
            }
        }

        window.electronAPI?.fs.watchDir({ id: watchId, dirPath: workspacePath })
        // Use the returned unsubscribe function
        const unsubscribe = window.electronAPI?.fs.onChange(changeHandler)

        return () => {
            window.electronAPI?.fs.unwatchDir(watchId)
            unsubscribe?.()
        }
    }, [workspacePath, loadDirectory])

    // Toggle directory expansion
    const toggleDir = useCallback(async (dirPath: string) => {
        const newExpanded = new Set(expandedDirs)

        if (newExpanded.has(dirPath)) {
            newExpanded.delete(dirPath)
            setExpandedDirs(newExpanded)
        } else {
            newExpanded.add(dirPath)
            setExpandedDirs(newExpanded) // Optimistic update

            // Load children safely
            try {
                // Recursive helper (synchronous logic wrapper)
                const updateChildren = async (nodes: FileNode[]): Promise<FileNode[]> => {
                    const updatedNodes = await Promise.all(nodes.map(async (node) => {
                        if (node.path === dirPath && node.isDirectory) {
                            const children = await loadDirectory(dirPath, node.level + 1)
                            return { ...node, children, expanded: true }
                        }
                        if (node.children) {
                            return { ...node, children: await updateChildren(node.children) }
                        }
                        return node
                    }))
                    return updatedNodes
                }

                // Wait for update then set state (simpler than functional update for deep trees)
                const updatedFiles = await updateChildren(files)
                setFiles(updatedFiles)
            } catch (err) {
                console.error('[FileExplorer] Failed to expand directory:', err)
                setError('Failed to load folder contents')
                // Revert expansion on error
                newExpanded.delete(dirPath)
                setExpandedDirs(new Set(newExpanded))
            }
        }
    }, [expandedDirs, loadDirectory, files])

    const refreshTree = async () => {
        if (!workspacePath) return
        setLoading(true)
        try {
            const nodes = await loadDirectory(workspacePath)
            setFiles(nodes)
            setError(null)
        } catch (_err) {
            setError('Failed to refresh')
        } finally {
            setLoading(false)
        }
    }

    const collapseAll = () => {
        setExpandedDirs(new Set(workspacePath ? [workspacePath] : []))
    }

    const copyPath = (path: string) => {
        navigator.clipboard.writeText(path)
        closeContextMenu()
    }

    const copyRelativePath = (path: string) => {
        if (!workspacePath) return
        const relative = path.replace(workspacePath, '').replace(/^[/\\]+/, '')
        navigator.clipboard.writeText(relative)
        closeContextMenu()
    }

    const revealInExplorer = (path: string) => {
        window.electronAPI?.shell.showItemInFolder?.(path)
        closeContextMenu()
    }

    // Flattened list for keyboard navigation and filtering
    const getFlattenedFiles = (nodes: FileNode[], result: FileNode[] = []): FileNode[] => {
        nodes.forEach(node => {
            const matchesSearch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase())
            if (matchesSearch) {
                result.push(node)
            }
            if (node.children && expandedDirs.has(node.path)) {
                getFlattenedFiles(node.children, result)
            }
        })
        return result
    }

    const flattenedFiles = getFlattenedFiles(files)

    // BUG #33: Reset focus when search changes
    useEffect(() => {
        setFocusedIndex(-1)
    }, [searchQuery])

    // BUG #34: Close context menu on scroll
    useEffect(() => {
        const treeElement = document.querySelector('.file-tree')
        if (!treeElement) return

        const handleScroll = () => {
            if (contextMenu) setContextMenu(null)
        }

        treeElement.addEventListener('scroll', handleScroll)
        return () => treeElement.removeEventListener('scroll', handleScroll)
    }, [contextMenu])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (newItemInput || renameInput) return

            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setFocusedIndex(prev => Math.min(prev + 1, flattenedFiles.length - 1))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setFocusedIndex(prev => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter') {
                if (focusedIndex >= 0) {
                    const node = flattenedFiles[focusedIndex]
                    if (node.isDirectory) toggleDir(node.path)
                    else onSelectFile(node.path)
                }
            } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                document.getElementById('explorer-search-input')?.focus()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [flattenedFiles, focusedIndex, newItemInput, renameInput, onSelectFile, toggleDir])

    // Handle context menu
    const handleContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, path, isDir })
    }

    // Close context menu
    const closeContextMenu = () => setContextMenu(null)

    // Create new file/folder
    const handleCreate = async (type: 'file' | 'folder') => {
        let dirPath: string | null = null

        if (contextMenu) {
            dirPath = contextMenu.isDir ? contextMenu.path : contextMenu.path.split(/[/\\]/).slice(0, -1).join('/')
            closeContextMenu()
        } else if (selectedFile) {
            // If we have a selection, try to determine if it is a dir or file (we might not know easily if it's a dir from just the path string here without stats, but commonly users select files)
            // Ideally we'd know if selectedFile is a dir. The `files` tree has this info, but traversing it to find `selectedFile` is complex.
            // Simplified strategy: assume it's a file and use parent, UNLESS we can easily check.
            // Actually, for header actions, using the root workspace path is often the safest default if no context is clear, OR we just always use workspacePath if nothing is selected.
            // Let's rely on workspacePath if contextMenu is null, or maybe implement a 'selectedDir' state?
            // For now, let's default to workspacePath if contextMenu is null, or the parent of active file if that's better?
            // "Explorer" usually implies creation in the *root* if nothing specific is right-clicked, or maybe expected behavior is "relative to selection".
            // Let's go with: if context menu, use that. If not, use workspace root. This is standard behavior for "New File" buttons in many IDEs unless a specific folder is focused.
            dirPath = workspacePath
        } else {
            dirPath = workspacePath
        }

        if (!dirPath) return
        setNewItemInput({ path: dirPath, type })
    }

    const validateFileName = (name: string): boolean => {
        if (!name || name.trim().length === 0) return false
        // OS invalid chars: / \ : * ? " < > |
        const invalidChars = /[\\/:*?"<>|]/
        if (invalidChars.test(name)) {
            setError('Filename contains invalid characters')
            return false
        }
        // SECURITY FIX: Prevent path traversal attempts
        if (name === '..' || name === '.' || name.includes('..') || name.includes('/') || name.includes('\\')) {
            setError('Invalid filename - path traversal not allowed')
            return false
        }
        return true
    }

    const submitNewItem = async () => {
        if (!newItemInput || !newItemName.trim()) return

        // BUG #35: Validate filename
        if (!validateFileName(newItemName)) return

        const fullPath = `${newItemInput.path}/${newItemName.trim()}`

        try {
            if (newItemInput.type === 'file') {
                const result = await window.electronAPI?.fs.createFile(fullPath)
                if (!result?.success) {
                    setError(result?.error || 'Failed to create file')
                    return
                }
                onFileCreate?.(newItemInput.path, newItemName.trim())
            } else {
                const result = await window.electronAPI?.fs.createDir(fullPath)
                if (!result?.success) {
                    setError(result?.error || 'Failed to create folder')
                    return
                }
            }

            setNewItemInput(null)
            setNewItemName('')
            setError(null)

            // Refresh
            if (workspacePath) {
                const nodes = await loadDirectory(workspacePath)
                setFiles(nodes)
            }
        } catch (err) {
            console.error('[FileExplorer] Create failed:', err)
            setError(err instanceof Error ? err.message : 'Failed to create item')
        }
    }

    // Delete file/folder
    const handleDelete = async () => {
        if (!contextMenu) return

        const confirmed = window.confirm(`Delete "${contextMenu.path.split(/[/\\]/).pop()}"?`)
        if (!confirmed) return

        try {
            const result = await window.electronAPI?.fs.delete(contextMenu.path)
            if (!result?.success) {
                setError(result?.error || 'Failed to delete')
                closeContextMenu()
                return
            }
            onFileDelete?.(contextMenu.path)
            closeContextMenu()
            setError(null)

            // Refresh
            if (workspacePath) {
                const nodes = await loadDirectory(workspacePath)
                setFiles(nodes)
            }
        } catch (err) {
            console.error('[FileExplorer] Delete failed:', err)
            setError(err instanceof Error ? err.message : 'Failed to delete')
            closeContextMenu()
        }
    }

    // Rename file/folder
    const handleRename = () => {
        if (!contextMenu) return
        const name = contextMenu.path.split(/[/\\]/).pop() || ''
        setRenameInput({ path: contextMenu.path, name })
        closeContextMenu()
    }

    const submitRename = async () => {
        if (!renameInput) return

        // BUG #35: Validate filename
        if (!validateFileName(renameInput.name)) return

        const dir = renameInput.path.split(/[/\\]/).slice(0, -1).join('/')
        const newPath = `${dir}/${renameInput.name}`

        try {
            const result = await window.electronAPI?.fs.rename({ oldPath: renameInput.path, newPath })
            if (!result?.success) {
                setError(result?.error || 'Failed to rename')
                setRenameInput(null)
                return
            }
            onFileRename?.(renameInput.path, newPath)
            setRenameInput(null)
            setError(null)

            // Refresh
            if (workspacePath) {
                const nodes = await loadDirectory(workspacePath)
                setFiles(nodes)
            }
        } catch (err) {
            console.error('[FileExplorer] Rename failed:', err)
            setError(err instanceof Error ? err.message : 'Failed to rename')
            setRenameInput(null)
        }
    }

    // Get icon based on file extension
    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase() || ''

        const iconProps = { size: 16 }

        switch (ext) {
            case 'json':
                return <FileJson {...iconProps} className="text-yellow-400" />
            case 'js':
            case 'cjs':
            case 'mjs':
                return <FileCode {...iconProps} className="text-yellow-300" />
            case 'ts':
                return <FileCode {...iconProps} className="text-blue-400" />
            case 'tsx':
            case 'jsx':
                return <Code2 {...iconProps} className="text-cyan-400" />
            case 'py':
                return <FileCode {...iconProps} className="text-blue-500" />
            case 'rs':
                return <FileCode {...iconProps} className="text-orange-600" />
            case 'go':
                return <FileCode {...iconProps} className="text-cyan-500" />
            case 'java':
                return <FileCode {...iconProps} className="text-red-500" />
            case 'c':
            case 'cpp':
            case 'h':
            case 'hpp':
                return <FileCode {...iconProps} className="text-blue-600" />
            case 'css':
            case 'scss':
            case 'less':
                return <FileCode {...iconProps} className="text-blue-300" />
            case 'html':
                return <Languages {...iconProps} className="text-orange-500" />
            case 'md':
                return <FileText {...iconProps} className="text-blue-200" />
            case 'yaml':
            case 'yml':
                return <FileCode {...iconProps} className="text-purple-400" />
            case 'sql':
                return <Database {...iconProps} className="text-pink-400" />
            case 'sh':
            case 'bash':
            case 'zsh':
                return <TerminalIcon {...iconProps} className="text-green-400" />
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'svg':
            case 'webp':
                return <FileImage {...iconProps} className="text-purple-300" />
            default:
                return <FileText {...iconProps} className="text-gray-400" />
        }
    }

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, node: FileNode) => {
        e.dataTransfer.setData('text/plain', node.path)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, node: FileNode) => {
        e.preventDefault()
        // Only allow dropping on directories
        if (node.isDirectory) {
            setDragOverPath(node.path)
            e.dataTransfer.dropEffect = 'move'
        } else {
            setDragOverPath(null)
            e.dataTransfer.dropEffect = 'none'
        }
    }

    const handleDragLeave = () => {
        setDragOverPath(null)
    }

    const handleDrop = async (e: React.DragEvent, targetNode: FileNode) => {
        e.preventDefault()
        setDragOverPath(null)

        const sourcePath = e.dataTransfer.getData('text/plain')
        if (!sourcePath || !targetNode.isDirectory) return

        // Prevent dropping on self or direct parent (simplified check)
        // Also prevent dropping if source is same as target
        if (sourcePath === targetNode.path) return

        // BUG #31: Prevent recursive move (dropping folder into its own subfolder)
        if (targetNode.path.startsWith(sourcePath + '/') || targetNode.path.startsWith(sourcePath + '\\')) {
            setError('Cannot move a folder into its own subfolder')
            return
        }

        const fileName = sourcePath.split(/[/\\]/).pop()
        const newPath = `${targetNode.path}/${fileName}`

        if (sourcePath === newPath) return // Same location

        // Confirmation dialog
        const confirmed = window.confirm(`Move "${fileName}" to "${targetNode.name}"?`)
        if (!confirmed) return

        try {
            const result = await window.electronAPI?.fs.rename({ oldPath: sourcePath, newPath })
            if (!result?.success) {
                setError(result?.error || 'Failed to move file')
                return
            }
            onFileRename?.(sourcePath, newPath)

            // Refresh Explorer
            if (workspacePath) {
                const nodes = await loadDirectory(workspacePath)
                setFiles(nodes)
            }
        } catch (err) {
            console.error('[FileExplorer] Move failed:', err)
            setError('Failed to move file')
        }
    }

    // Root Drop Handler
    const handleRootDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        const sourcePath = e.dataTransfer.getData('text/plain')
        if (!sourcePath || !workspacePath) return

        // If source is already in root, do nothing
        const parentDir = sourcePath.split(/[/\\]/).slice(0, -1).join('/')
        // Normalized comparison
        if (parentDir.replace(/\\/g, '/') === workspacePath.replace(/\\/g, '/')) return

        const fileName = sourcePath.split(/[/\\]/).pop()
        const newPath = `${workspacePath}/${fileName}`

        const confirmed = window.confirm(`Move "${fileName}" to workspace root?`)
        if (!confirmed) return

        try {
            const result = await window.electronAPI?.fs.rename({ oldPath: sourcePath, newPath })
            if (!result?.success) {
                setError(result?.error || 'Failed to move to root')
                return
            }
            onFileRename?.(sourcePath, newPath)

            // Refresh Explorer
            const nodes = await loadDirectory(workspacePath)
            setFiles(nodes)
        } catch (err) {
            console.error('[FileExplorer] Root move failed:', err)
            setError('Failed to move file to root')
        }
    }

    // Render file tree
    const renderNode = (node: FileNode): JSX.Element | null => {
        const isExpanded = expandedDirs.has(node.path)
        const isSelected = selectedFile === node.path
        const isFocused = focusedIndex >= 0 && flattenedFiles[focusedIndex]?.path === node.path
        const isRenaming = renameInput?.path === node.path

        // Check search filter - if child matches but parent doesn't, parent should still show
        const matchesSearch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase())
        const hasMatchingChildren = node.children && node.children.some(child =>
            child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (child.children && child.children.length > 0)
        )

        if (searchQuery && !matchesSearch && !hasMatchingChildren) return null

        // BUG-065: Visual indicator for ignored/hidden files
        const isIgnored = node.name.startsWith('.') || ['node_modules', 'dist', 'build', 'out'].includes(node.name)
        const isDragOver = dragOverPath === node.path

        return (
            <div key={node.path}>
                <div
                    className={`file-item ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${isIgnored ? 'ignored' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    style={{ paddingLeft: 12 + node.level * 16 }}
                    onClick={() => node.isDirectory ? toggleDir(node.path) : onSelectFile(node.path)}
                    onContextMenu={(e) => handleContextMenu(e, node.path, node.isDirectory)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node)}
                    onDragOver={(e) => handleDragOver(e, node)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node)}
                >
                    {node.isDirectory ? (
                        <span className="expand-icon">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                    ) : (
                        <span className="expand-icon" style={{ width: '14px' }}></span> // Placeholder
                    )}
                    {node.isDirectory ? (
                        <Folder size={16} className="text-blue-400" />
                    ) : (
                        getFileIcon(node.name)
                    )}
                    {isRenaming ? (
                        <input
                            className="rename-input"
                            value={renameInput.name}
                            onChange={(e) => setRenameInput({ ...renameInput, name: e.target.value })}
                            onBlur={submitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename()
                                if (e.key === 'Escape') setRenameInput(null)
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="file-name">{node.name}</span>
                    )}
                </div>

                {node.isDirectory && isExpanded && node.children && (
                    <div className="children">
                        {/* Guide line for nested items */}
                        <div className="guide-line" style={{ left: 19 + node.level * 16 }}></div>
                        
                        {/* Pagination for large directories */}
                        {(() => {
                            const limit = dirFileLimits.get(node.path) || MAX_FILES_PER_DIR
                            const visibleChildren = node.children.slice(0, limit)
                            const hasMore = node.children.length > limit
                            
                            return (
                                <>
                                    {visibleChildren.map((child) => renderNode(child))}
                                    {hasMore && (
                                        <div 
                                            className="file-item show-more"
                                            style={{ paddingLeft: 12 + (node.level + 1) * 16 }}
                                            onClick={() => {
                                                setDirFileLimits(prev => new Map(prev.set(node.path, limit + FILES_PER_PAGE)))
                                            }}
                                        >
                                            <span className="expand-icon" style={{ width: '14px' }}></span>
                                            <span className="file-name text-muted">
                                                Show {Math.min(FILES_PER_PAGE, node.children.length - limit)} more... ({node.children.length - limit} remaining)
                                            </span>
                                        </div>
                                    )}
                                </>
                            )
                        })()}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="file-explorer" onClick={closeContextMenu}>
            <div className="explorer-header">
                <span className="explorer-title">Explorer</span>
                <div className="explorer-actions">
                    <button onClick={() => handleCreate('file')} title="New File" disabled={!workspacePath}>
                        <FilePlus size={14} />
                    </button>
                    <button onClick={() => handleCreate('folder')} title="New Folder" disabled={!workspacePath}>
                        <FolderPlus size={14} />
                    </button>
                    <button onClick={refreshTree} title="Refresh Explorer" disabled={!workspacePath}>
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={collapseAll} title="Collapse All Folders" disabled={!workspacePath}>
                        <ChevronUp size={14} />
                    </button>
                    <button onClick={onOpenFolder} title="Open Folder">
                        <FolderOpen size={14} />
                    </button>
                    {workspacePath && onCloseWorkspace && (
                        <button onClick={onCloseWorkspace} title="Close Workspace" className="close-workspace-btn">
                            <XCircle size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Open Editors Section */}
            {openFiles.length > 0 && !searchQuery && (
                <div className="open-editors-section">
                    <div
                        className="section-header"
                        onClick={() => setOpenEditorsExpanded(!openEditorsExpanded)}
                    >
                        <span className="expand-icon">
                            {openEditorsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="section-title">Open Editors</span>
                        <span className="file-count">{openFiles.length}</span>
                    </div>
                    {openEditorsExpanded && (
                        <div className="open-editors-list">
                            {openFiles.map(file => (
                                <div
                                    key={file.path}
                                    className={`open-editor-item ${selectedFile === file.path ? 'selected' : ''}`}
                                    onClick={() => onSelectFile(file.path)}
                                >
                                    <FileText size={14} />
                                    <span className="file-name">
                                        {file.isDirty && <span className="dirty-dot">â—</span>}
                                        {file.name}
                                    </span>
                                    {onCloseFile && (
                                        <button
                                            className="close-file-btn"
                                            onClick={(e) => { e.stopPropagation(); onCloseFile(file.path); }}
                                            title="Close"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!workspacePath ? (
                <div className="no-folder">
                    <p>No folder opened</p>
                    <button className="open-folder-btn" onClick={onOpenFolder}>
                        Open Folder
                    </button>
                </div>
            ) : (
                <>
                    {/* Search Bar */}
                    <div className="explorer-search">
                        <div className="search-input-wrapper">
                            <Search size={12} className="text-gray-500 absolute left-2" />
                            <input
                                style={{ paddingLeft: 24 }}
                                placeholder="Filter files (e.g. ts, css)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="clear-search" onClick={() => setSearchQuery('')}>
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading">Loading...</div>
                    ) : (
                        <div
                            className="file-tree"
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                            onDrop={handleRootDrop}
                        >
                            {error && (
                                <div className="error-banner" onClick={() => setError(null)}>
                                    <AlertTriangle size={14} className="mr-1" />
                                    <span>{error}</span>
                                </div>
                            )}
                            {files.map((node) => renderNode(node))}
                            {/* Empty space filler to catch drops */}
                            <div style={{ flex: 1, minHeight: '50px' }}></div>
                        </div>
                    )}
                </>
            )}

            {/* New item input */}
            {newItemInput && (
                <div className="new-item-input" style={{ paddingLeft: 24 }}>
                    <span className="mr-1">
                        {newItemInput.type === 'file' ? <FileText size={14} /> : <Folder size={14} />}
                    </span>
                    <input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onBlur={submitNewItem}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitNewItem()
                            if (e.key === 'Escape') setNewItemInput(null)
                        }}
                        placeholder={newItemInput.type === 'file' ? 'filename.ts' : 'folder name'}
                        autoFocus
                    />
                </div>
            )}

            {/* Context menu */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button onClick={() => handleCreate('file')}>
                        <span className="flex items-center gap-2"><FilePlus size={12} /> New File</span>
                    </button>
                    <button onClick={() => handleCreate('folder')}>
                        <span className="flex items-center gap-2"><FolderPlus size={12} /> New Folder</span>
                    </button>
                    <div className="divider" />
                    <button onClick={() => copyPath(contextMenu.path)}>
                        <span>Copy Path</span>
                        <span className="shortcut">Shift+Alt+C</span>
                    </button>
                    <button onClick={() => copyRelativePath(contextMenu.path)}>
                        <span>Copy Relative Path</span>
                        <span className="shortcut">Ctrl+K Ctrl+Alt+C</span>
                    </button>
                    <button onClick={() => revealInExplorer(contextMenu.path)}>
                        <span>Reveal in File Explorer</span>
                    </button>
                    <div className="divider" />
                    <button onClick={handleRename}>
                        <span className="flex items-center gap-2"><Edit2 size={12} /> Rename</span>
                        <span className="shortcut">Enter</span>
                    </button>
                    <button className="delete" onClick={handleDelete}>
                        <span className="flex items-center gap-2"><Trash2 size={12} /> Delete</span>
                        <span className="shortcut">Del</span>
                    </button>
                </div>
            )}
        </div>
    )
}

