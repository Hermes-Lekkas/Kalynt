/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Command } from 'cmdk'
import Fuse from 'fuse.js'
import {
    Folder, FileText, FileCode, FileJson, FileEdit, Palette, Globe, 
    Sparkles, Search, Command as CommandIcon, Zap, Bot, Save, GitBranch, Settings
} from 'lucide-react'

// Command types
export interface IDECommand {
    id: string
    title: string
    shortcut?: string
    category: 'file' | 'edit' | 'view' | 'terminal' | 'git' | 'ai'
    action: () => void | Promise<void>
    icon?: string | React.ReactNode
}

export interface FileItem {
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
    commands = []
}: CommandPaletteProps) {
    const mode = (propMode === 'files' || propMode === 'commands') ? propMode : 'commands'
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (open) setSearch('')
    }, [open])

    const [fileFuse, setFileFuse] = useState<Fuse<FileItem> | null>(null)
    useEffect(() => {
        const fuseInstance = new Fuse(files, {
            keys: ['name', 'path'],
            threshold: 0.4,
            distance: 100
        })
        setFileFuse(fuseInstance)
        return () => setFileFuse(null)
    }, [files])

    const [commandFuse, setCommandFuse] = useState<Fuse<IDECommand> | null>(null)
    useEffect(() => {
        const fuseInstance = new Fuse(commands, {
            keys: ['title', 'category'],
            threshold: 0.3
        })
        setCommandFuse(fuseInstance)
        return () => setCommandFuse(null)
    }, [commands])

    const filteredFiles = useMemo(() => {
        if (!search) return files.slice(0, 10)
        if (!fileFuse) return []
        return fileFuse.search(search).slice(0, 10).map(r => r.item)
    }, [search, files, fileFuse])

    const filteredCommands = useMemo(() => {
        if (!search) return commands
        if (!commandFuse) return []
        return commandFuse.search(search).map(r => r.item)
    }, [search, commands, commandFuse])

    const groupedCommands = useMemo(() => {
        const groups: Record<string, IDECommand[]> = {}
        filteredCommands.forEach(cmd => {
            const category = cmd.category || 'other'
            if (!groups[category]) groups[category] = []
            groups[category].push(cmd)
        })
        return groups
    }, [filteredCommands])

    const handleSelect = useCallback((value: string) => {
        if (mode === 'files' && onFileSelect) onFileSelect(value)
        onOpenChange(false)
    }, [mode, onFileSelect, onOpenChange])

    const getFileIcon = (name: string, type: 'file' | 'directory') => {
        if (type === 'directory') return <Folder size={16} />
        const ext = name.split('.').pop()?.toLowerCase()
        const icons: Record<string, any> = {
            ts: <FileCode size={16} className="text-blue-400" />,
            tsx: <FileCode size={16} className="text-blue-300" />,
            js: <FileCode size={16} className="text-yellow-400" />,
            json: <FileJson size={16} className="text-red-400" />,
            md: <FileEdit size={16} className="text-gray-400" />,
            css: <Palette size={16} className="text-blue-400" />,
            html: <Globe size={16} className="text-orange-400" />,
        }
        return icons[ext || ''] || <FileText size={16} className="opacity-40" />
    }

    const renderIcon = (icon: string | React.ReactNode) => {
        if (icon && typeof icon !== 'string') return icon
        const iconMap: Record<string, any> = {
            'Zap': <Zap size={16} />,
            'Search': <Search size={16} />,
            'Bot': <Bot size={16} />,
            'Save': <Save size={16} />,
            'GitBranch': <GitBranch size={16} />,
            'Settings': <Settings size={16} />
        }
        return iconMap[icon as string] || <Zap size={16} className="opacity-40" />
    }

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label="Omnibar"
            className="premium-omnibar-overlay"
        >
            <div className="omnibar-container animate-reveal-up">
                <div className="omnibar-input-wrapper">
                    <Search size={18} className="search-icon-main" />
                    <Command.Input
                        value={search}
                        onValueChange={setSearch}
                        placeholder={mode === 'commands' ? 'Search commands...' : 'Quick open file...'}
                        className="omnibar-input"
                    />
                    <div className="mode-indicator">{mode.toUpperCase()}</div>
                </div>

                <Command.List className="omnibar-list">
                    <Command.Empty className="omnibar-empty">
                        <div className="empty-content">
                            <Sparkles size={24} className="opacity-10 mb-2" />
                            <p>No results found for "{search}"</p>
                        </div>
                    </Command.Empty>

                    {mode === 'files' ? (
                        <Command.Group heading="Authorized Files">
                            {filteredFiles.map(file => (
                                <Command.Item key={file.path} value={file.path} onSelect={handleSelect} className="omnibar-item">
                                    <div className="item-left">
                                        <div className="item-icon-box">{getFileIcon(file.name, file.type)}</div>
                                        <div className="item-text">
                                            <span className="item-title">{file.name}</span>
                                            <span className="item-subtitle">{file.path}</span>
                                        </div>
                                    </div>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    ) : (
                        Object.entries(groupedCommands).map(([category, cmds]) => (
                            <Command.Group key={category} heading={category.toUpperCase()}>
                                {cmds.map(cmd => (
                                    <Command.Item key={cmd.id} value={cmd.title} onSelect={() => { cmd.action(); onOpenChange(false); }} className="omnibar-item">
                                        <div className="item-left">
                                            <div className="item-icon-box">{renderIcon(cmd.icon)}</div>
                                            <span className="item-title">{cmd.title}</span>
                                        </div>
                                        {cmd.shortcut && <div className="item-kbd">{cmd.shortcut}</div>}
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        ))
                    )}
                </Command.List>
                
                <div className="omnibar-footer">
                    <div className="footer-tip">
                        <CommandIcon size={10} /> <span><b>Navigate</b> with arrow keys</span>
                    </div>
                    <div className="footer-tip">
                        <span><b>Enter</b> to execute</span>
                    </div>
                </div>
            </div>

            <style>{`
                .premium-omnibar-overlay {
                    position: fixed; inset: 0; z-index: 100000;
                    background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(12px);
                    display: flex; align-items: flex-start; justify-content: center;
                    padding-top: 15vh;
                }

                .omnibar-container {
                    width: 640px; max-width: 90vw;
                    background: #0a0a0a; border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px; overflow: hidden;
                    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
                }

                .omnibar-input-wrapper {
                    display: flex; align-items: center; gap: 16px;
                    padding: 20px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .search-icon-main { color: #3b82f6; }

                .omnibar-input {
                    flex: 1; background: none; border: none; outline: none;
                    color: white; font-size: 18px; font-weight: 500;
                }

                .mode-indicator {
                    font-size: 10px; font-weight: 800; color: rgba(255, 255, 255, 0.2);
                    padding: 4px 10px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px;
                }

                .omnibar-list {
                    max-height: 440px; overflow-y: auto; padding: 12px;
                }

                [cmdk-group-heading] {
                    padding: 12px 12px 8px; font-size: 10px; font-weight: 800;
                    color: rgba(255, 255, 255, 0.2); letter-spacing: 0.1em;
                }

                .omnibar-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 12px; border-radius: 12px; cursor: pointer;
                    transition: all 0.2s;
                }

                .omnibar-item[data-selected="true"] {
                    background: rgba(255, 255, 255, 0.05);
                }

                .item-left { display: flex; align-items: center; gap: 16px; min-width: 0; }

                .item-icon-box {
                    width: 32px; height: 32px; border-radius: 8px;
                    background: rgba(255, 255, 255, 0.03);
                    display: flex; align-items: center; justify-content: center;
                }

                .item-text { display: flex; flex-direction: column; min-width: 0; }
                .item-title { font-size: 14px; font-weight: 600; color: white; }
                .item-subtitle { font-size: 11px; color: rgba(255, 255, 255, 0.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

                .item-kbd {
                    font-size: 10px; font-weight: 800; color: rgba(255, 255, 255, 0.3);
                    padding: 2px 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;
                }

                .omnibar-empty { padding: 40px; text-align: center; color: rgba(255, 255, 255, 0.2); }

                .omnibar-footer {
                    padding: 12px 24px; background: rgba(255, 255, 255, 0.02);
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex; gap: 24px;
                }

                .footer-tip { display: flex; align-items: center; gap: 8px; font-size: 10px; color: rgba(255, 255, 255, 0.2); }
                .footer-tip b { color: rgba(255, 255, 255, 0.4); }

                .animate-reveal-up {
                    animation: reveal-up 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
                }

                @keyframes reveal-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </Command.Dialog>
    )
}
