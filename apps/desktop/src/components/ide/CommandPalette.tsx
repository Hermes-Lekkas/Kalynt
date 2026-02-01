/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Command } from 'cmdk'
import Fuse from 'fuse.js'
import {
    Folder,
    FileText,
    FileCode,
    FileJson,
    FileEdit,
    Palette,
    Globe,
    Lock,
    Shield,
    Terminal,
    GitBranch,
    Bot,
    Pencil,
    Eye,
    Zap,
    Save,
    Play,
    Bug,
    Hammer,
    Sparkles,
    MoveVertical,
    Search,
    CheckCircle2,
    ArrowUp,
    ArrowDown,
    X,
    MessageSquare,
    Lightbulb,
    Wrench,
    FilePlus
} from 'lucide-react'

// Command types
interface IDECommand {
    id: string
    title: string
    shortcut?: string
    category: 'file' | 'edit' | 'view' | 'terminal' | 'git' | 'ai'
    action: () => void | Promise<void>
    icon?: string | React.ReactNode
}

interface FileItem {
    path: string
    name: string
    type: 'file' | 'directory'
}

interface CommandPaletteProps {
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
    readonly mode: 'commands' | 'files'
    readonly files: FileItem[]
    readonly onFileSelect?: (path: string) => void
    readonly commands?: IDECommand[]
    readonly workspacePath?: string
}

export default function CommandPalette({
    open,
    onOpenChange,
    mode: propMode,
    files,
    onFileSelect,
    commands = [],
    workspacePath
}: CommandPaletteProps) {
    // BUG-074: Mode validation
    const mode = (propMode === 'files' || propMode === 'commands') ? propMode : 'commands'

    const [search, setSearch] = useState('')

    // Reset search when modal opens
    useEffect(() => {
        if (open) setSearch('')
    }, [open])

    // File search with Fuse.js
    // File search with Fuse.js
    const [fileFuse, setFileFuse] = useState<Fuse<FileItem> | null>(null)

    // BUG-077: Add useEffect cleanup that destroys Fuse instances
    useEffect(() => {
        const fuseInstance = new Fuse(files, {
            keys: ['name', 'path'],
            threshold: 0.4,
            distance: 100
        })
        setFileFuse(fuseInstance)

        return () => {
            setFileFuse(null) // Explicit cleanup
        }
    }, [files])

    // Command search with Fuse.js
    // Command search with Fuse.js
    const [commandFuse, setCommandFuse] = useState<Fuse<IDECommand> | null>(null)

    // BUG-077: Add useEffect cleanup that destroys Fuse instances
    useEffect(() => {
        const fuseInstance = new Fuse(commands, {
            keys: ['title', 'category'],
            threshold: 0.3
        })
        setCommandFuse(fuseInstance)

        return () => {
            setCommandFuse(null) // Explicit cleanup
        }
    }, [commands])

    // Get filtered results
    const filteredFiles = useMemo(() => {
        try {
            if (!search) return files.slice(0, 20)
            if (!fileFuse) return []
            return fileFuse.search(search).slice(0, 20).map(r => r.item)
        } catch (error) {
            console.error('File search error:', error)
            return []
        }
    }, [search, files, fileFuse])

    const filteredCommands = useMemo(() => {
        try {
            if (!search) return commands
            if (!commandFuse) return []
            return commandFuse.search(search).map(r => r.item)
        } catch (error) {
            console.error('Command search error:', error)
            return []
        }
    }, [search, commands, commandFuse])

    // Group commands by category
    const groupedCommands = useMemo(() => {
        const groups: Record<string, IDECommand[]> = {}
        // Initialize known categories to ensure order
        const categories = ['file', 'edit', 'view', 'terminal', 'git', 'ai']
        categories.forEach(c => groups[c] = [])

        filteredCommands.forEach(cmd => {
            // Validate category
            const category = cmd.category || 'other'
            if (!groups[category]) groups[category] = []
            groups[category].push(cmd)
        })

        // Remove empty groups
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) delete groups[key]
        })

        return groups
    }, [filteredCommands])

    const handleSelect = useCallback((value: string) => {
        if (mode === 'files' && onFileSelect) {
            onFileSelect(value)
        }
        onOpenChange(false)
    }, [mode, onFileSelect, onOpenChange])

    // Get file icon based on extension
    const getFileIcon = (name: string, type: 'file' | 'directory') => {
        if (type === 'directory') return <Folder size={16} />
        if (!name) return <FileText size={16} />

        const ext = name.split('.').pop()?.toLowerCase()
        const icons: Record<string, React.ReactNode> = {
            ts: <FileCode size={16} color="#60a5fa" />,
            tsx: <FileCode size={16} color="#818cf8" />,
            js: <FileCode size={16} color="#facc15" />,
            jsx: <FileCode size={16} color="#818cf8" />,
            json: <FileJson size={16} color="#f87171" />,
            md: <FileEdit size={16} color="#94a3b8" />,
            css: <Palette size={16} color="#38bdf8" />,
            html: <Globe size={16} color="#fb923c" />,
            py: <FileCode size={16} color="#3776ab" />,
            rs: <FileCode size={16} color="#dea584" />,
            go: <FileCode size={16} color="#00add8" />,
            java: <FileCode size={16} color="#b07219" />,
            gitignore: <Lock size={16} color="#94a3b8" />,
            env: <Shield size={16} color="#fbbf24" />
        }

        if (!ext || ext === name.toLowerCase()) return <FileText size={16} />
        return icons[ext] || <FileText size={16} />
    }

    const getCategoryIcon = (category: string) => {
        const icons: Record<string, React.ReactNode> = {
            file: <Folder size={16} />,
            edit: <Pencil size={16} />,
            view: <Eye size={16} />,
            terminal: <Terminal size={16} />,
            git: <GitBranch size={16} />,
            ai: <Bot size={16} />
        }
        return icons[category] || <Zap size={16} />
    }

    // Helper to render command icon which could be an emoji string from old code or a name
    const renderIcon = (icon: string | React.ReactNode, category: string) => {
        if (!icon) return getCategoryIcon(category)
        if (typeof icon !== 'string') return icon

        // Map names to Lucide components
        const iconMap: Record<string, React.ReactNode> = {
            'FilePlus': <FilePlus size={16} />,
            'Save': <Save size={16} />,
            'X': <X size={16} />,
            'Folder': <Folder size={16} />,
            'Terminal': <Terminal size={16} />,
            'FolderOpen': <Folder size={16} />,
            'GitBranch': <GitBranch size={16} />,
            'Bot': <Bot size={16} />,
            'Play': <Play size={16} />,
            'Bug': <Bug size={16} />,
            'Hammer': <Hammer size={16} />,
            'Sparkles': <Sparkles size={16} />,
            'MoveVertical': <MoveVertical size={16} />,
            'Search': <Search size={16} />,
            'CheckCircle2': <CheckCircle2 size={16} />,
            'ArrowUp': <ArrowUp size={16} />,
            'ArrowDown': <ArrowDown size={16} />,
            'MessageSquare': <MessageSquare size={16} />,
            'Lightbulb': <Lightbulb size={16} />,
            'Wrench': <Wrench size={16} />
        }

        return iconMap[icon] || <span>{icon}</span>
    }

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label={mode === 'commands' ? 'Command Palette' : 'Quick Open'}
            className="command-palette"
        >
            <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={mode === 'commands' ? 'Type a command...' : 'Search files...'}
                className="command-input"
            />

            <Command.List className="command-list">
                <Command.Empty className="command-empty">
                    {mode === 'commands' ? 'No commands found.' : 'No files found.'}
                </Command.Empty>

                {mode === 'files' ? (
                    <Command.Group heading="Files" className="command-group">
                        {filteredFiles.map(file => (
                            <Command.Item
                                key={file.path}
                                value={file.path}
                                onSelect={handleSelect}
                                className="command-item"
                            >
                                <span className="item-icon">{getFileIcon(file.name, file.type)}</span>
                                <span className="item-name">{file.name}</span>
                                <span className="item-path">
                                    {file.path.replace(workspacePath || '', '').replace(/^[/\\]/, '')}
                                </span>
                            </Command.Item>
                        ))}
                    </Command.Group>
                ) : (
                    Object.entries(groupedCommands).map(([category, cmds]) => (
                        <Command.Group
                            key={category}
                            heading={category.charAt(0).toUpperCase() + category.slice(1)}
                            className="command-group"
                        >
                            {cmds.map(cmd => (
                                <Command.Item
                                    key={cmd.id}
                                    value={cmd.title}
                                    onSelect={() => {
                                        cmd.action()
                                        onOpenChange(false)
                                    }}
                                    className="command-item"
                                >
                                    <span className="item-icon">{renderIcon(cmd.icon, cmd.category)}</span>
                                    <span className="item-name">{cmd.title}</span>
                                    {cmd.shortcut && (
                                        <span className="item-shortcut">{cmd.shortcut}</span>
                                    )}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    ))
                )}
            </Command.List>

            <style>{`
        .command-palette {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 20vh;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
        }

        .command-palette [cmdk-root] {
          width: 560px;
          max-width: 90vw;
          background: var(--color-surface, #1e1e1e);
          border: 1px solid var(--color-border, #3c3c3c);
          border-radius: 12px;
          box-shadow: 0 16px 70px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }

        .command-input {
          width: 100%;
          padding: 16px 20px;
          font-size: 16px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--color-border, #3c3c3c);
          color: var(--color-text, #e0e0e0);
          outline: none;
        }

        .command-input::placeholder {
          color: var(--color-text-muted, #666);
        }

        .command-list {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px;
        }

        .command-empty {
          padding: 32px;
          text-align: center;
          color: var(--color-text-muted, #666);
          font-size: 14px;
        }

        .command-group {
          margin-bottom: 8px;
        }

        .command-group [cmdk-group-heading] {
          padding: 8px 12px 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--color-text-muted, #666);
        }

        .command-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--color-text, #e0e0e0);
          font-size: 14px;
        }

        .command-item[data-selected="true"],
        .command-item:hover {
          background: var(--color-accent, #0066cc);
          color: white;
        }

        .command-item[data-selected="true"] .item-path,
        .command-item:hover .item-path {
          color: rgba(255, 255, 255, 0.7);
        }

        .item-icon {
          font-size: 16px;
          width: 20px;
          text-align: center;
          flex-shrink: 0;
        }

        .item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-path {
          font-size: 12px;
          color: var(--color-text-muted, #666);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
        }

        .item-shortcut {
          font-size: 11px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
          color: var(--color-text-muted, #999);
        }

        .command-item[data-selected="true"] .item-shortcut {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
      `}</style>
        </Command.Dialog>
    )
}

// Export command type for use in other components
export type { IDECommand, FileItem }
