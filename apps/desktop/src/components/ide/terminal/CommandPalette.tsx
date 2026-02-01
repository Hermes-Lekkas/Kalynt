/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
    Search,
    Clock,
    Star,
    Sparkles,
    ArrowUp,
    ArrowDown,
    CornerDownLeft,
    Command,
    Bookmark
} from 'lucide-react'

interface CommandHistoryItem {
    command: string
    timestamp: number
    exitCode?: number
    frequency: number
    isBookmarked?: boolean
}

interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
    onSelectCommand: (command: string) => void
    history: CommandHistoryItem[]
    bookmarks: string[]
    onBookmark: (command: string) => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onSelectCommand,
    history,
    bookmarks: _bookmarks,
    onBookmark
}) => {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [activeTab, setActiveTab] = useState<'all' | 'bookmarks' | 'ai'>('all')
    const inputRef = useRef<HTMLInputElement>(null)

    // Filter commands based on query
    const filteredCommands = history.filter(item =>
        item.command.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => {
        // Bookmarked first, then by frequency, then by recency
        if (a.isBookmarked && !b.isBookmarked) return -1
        if (!a.isBookmarked && b.isBookmarked) return 1
        if (a.frequency !== b.frequency) return b.frequency - a.frequency
        return b.timestamp - a.timestamp
    })

    const bookmarkedCommands = filteredCommands.filter(c => c.isBookmarked)

    const displayCommands = activeTab === 'bookmarks'
        ? bookmarkedCommands
        : filteredCommands

    // AI suggestions placeholder
    const aiSuggestions = [
        'git status',
        'npm run build',
        'docker ps -a',
        'kubectl get pods'
    ].filter(s => s.toLowerCase().includes(query.toLowerCase()))

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus()
            setQuery('')
            setSelectedIndex(0)
        }
    }, [isOpen])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const maxIndex = activeTab === 'ai'
            ? aiSuggestions.length - 1
            : displayCommands.length - 1

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setSelectedIndex(prev => Math.min(prev + 1, maxIndex))
                break
            case 'ArrowUp':
                e.preventDefault()
                setSelectedIndex(prev => Math.max(prev - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (activeTab === 'ai') {
                    if (aiSuggestions[selectedIndex]) {
                        onSelectCommand(aiSuggestions[selectedIndex])
                        onClose()
                    }
                } else {
                    if (displayCommands[selectedIndex]) {
                        onSelectCommand(displayCommands[selectedIndex].command)
                        onClose()
                    }
                }
                break
            case 'Escape':
                onClose()
                break
            case 'Tab': {
                e.preventDefault()
                const tabs: Array<'all' | 'bookmarks' | 'ai'> = ['all', 'bookmarks', 'ai']
                const currentIndex = tabs.indexOf(activeTab)
                setActiveTab(tabs[(currentIndex + 1) % tabs.length])
                setSelectedIndex(0)
                break
            }
        }
    }, [activeTab, displayCommands, aiSuggestions, selectedIndex, onSelectCommand, onClose])

    if (!isOpen) return null

    const formatTime = (timestamp: number) => {
        const diff = Date.now() - timestamp
        const mins = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (mins > 0) return `${mins}m ago`
        return 'just now'
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '100px',
            zIndex: 1000
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '600px',
                    maxHeight: '500px',
                    background: 'linear-gradient(180deg, rgba(24, 24, 27, 0.98) 0%, rgba(9, 9, 11, 0.99) 100%)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '16px',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Search Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    gap: '12px'
                }}>
                    <Search size={18} style={{ color: '#71717a' }} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value)
                            setSelectedIndex(0)
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search commands..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#e4e4e7',
                            fontSize: '15px',
                            fontFamily: "'JetBrains Mono', monospace"
                        }}
                    />
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#71717a'
                    }}>
                        <Command size={10} />
                        <span>P</span>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    padding: '8px 16px',
                    gap: '8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                }}>
                    {[
                        { id: 'all', label: 'All', icon: Clock, count: filteredCommands.length },
                        { id: 'bookmarks', label: 'Bookmarks', icon: Star, count: bookmarkedCommands.length },
                        { id: 'ai', label: 'AI Suggest', icon: Sparkles, count: aiSuggestions.length }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id as any)
                                setSelectedIndex(0)
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                background: activeTab === tab.id
                                    ? 'rgba(139, 92, 246, 0.15)'
                                    : 'transparent',
                                border: activeTab === tab.id
                                    ? '1px solid rgba(139, 92, 246, 0.3)'
                                    : '1px solid transparent',
                                borderRadius: '8px',
                                color: activeTab === tab.id ? '#a78bfa' : '#71717a',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <tab.icon size={12} />
                            {tab.label}
                            <span style={{
                                padding: '1px 5px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '8px',
                                fontSize: '10px'
                            }}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Command List */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px'
                }}>
                    {activeTab === 'ai' ? (
                        // AI Suggestions
                        aiSuggestions.map((suggestion, index) => (
                            <div
                                key={suggestion}
                                onClick={() => {
                                    onSelectCommand(suggestion)
                                    onClose()
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: selectedIndex === index
                                        ? 'rgba(139, 92, 246, 0.15)'
                                        : 'transparent',
                                    gap: '10px',
                                    transition: 'background 0.1s ease'
                                }}
                            >
                                <Sparkles size={14} style={{ color: '#a78bfa' }} />
                                <span style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '13px',
                                    color: '#e4e4e7'
                                }}>
                                    {suggestion}
                                </span>
                            </div>
                        ))
                    ) : (
                        // History/Bookmarks
                        displayCommands.slice(0, 20).map((item, index) => (
                            <div
                                key={item.command + item.timestamp}
                                onClick={() => {
                                    onSelectCommand(item.command)
                                    onClose()
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: selectedIndex === index
                                        ? 'rgba(139, 92, 246, 0.15)'
                                        : 'transparent',
                                    gap: '10px',
                                    transition: 'background 0.1s ease'
                                }}
                            >
                                <span style={{ color: '#a78bfa' }}>$</span>
                                <span style={{
                                    flex: 1,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '13px',
                                    color: '#e4e4e7',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {item.command}
                                </span>
                                {item.isBookmarked && (
                                    <Star size={12} style={{ color: '#fbbf24', fill: '#fbbf24' }} />
                                )}
                                <span style={{
                                    fontSize: '10px',
                                    color: '#52525b',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {formatTime(item.timestamp)}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onBookmark(item.command)
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '4px',
                                        cursor: 'pointer',
                                        color: item.isBookmarked ? '#fbbf24' : '#52525b',
                                        display: 'flex'
                                    }}
                                >
                                    <Bookmark size={12} />
                                </button>
                            </div>
                        ))
                    )}

                    {displayCommands.length === 0 && activeTab !== 'ai' && (
                        <div style={{
                            padding: '24px',
                            textAlign: 'center',
                            color: '#52525b',
                            fontSize: '13px'
                        }}>
                            No commands found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    fontSize: '11px',
                    color: '#52525b'
                }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ArrowUp size={10} />
                            <ArrowDown size={10} />
                            navigate
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CornerDownLeft size={10} />
                            select
                        </span>
                        <span>Tab switch</span>
                    </div>
                    <span>esc to close</span>
                </div>
            </div>
        </div>
    )
}
