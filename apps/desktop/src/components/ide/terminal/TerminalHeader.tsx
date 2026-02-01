/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React from 'react'
import { TerminalTab } from './types'
import {
    Plus,
    X,
    Search,
    Trash2,
    Terminal as TerminalIcon,
    SplitSquareHorizontal,
    SplitSquareVertical,
    Command
} from 'lucide-react'

interface TerminalHeaderProps {
    tabs: TerminalTab[]
    activeTabId: string
    onSwitchTab: (id: string) => void
    onCloseTab: (id: string) => void
    onAddTab: () => void
    onToggleSearch: () => void
    onClearTerminal: () => void
    searchVisible: boolean
    onSplitHorizontal?: () => void
    onSplitVertical?: () => void
    onOpenPalette?: () => void
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
    tabs,
    activeTabId,
    onSwitchTab,
    onCloseTab,
    onAddTab,
    onToggleSearch,
    onClearTerminal,
    searchVisible,
    onSplitHorizontal,
    onSplitVertical,
    onOpenPalette
}) => {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'linear-gradient(180deg, rgba(24, 24, 27, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
            padding: '0 12px',
            height: '44px',
            userSelect: 'none',
            gap: '8px'
        }}>
            {/* Tabs Section */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                gap: '6px',
                alignItems: 'center'
            }}>
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        onClick={() => onSwitchTab(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 14px',
                            cursor: 'pointer',
                            background: activeTabId === tab.id
                                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%)'
                                : 'rgba(255, 255, 255, 0.03)',
                            color: activeTabId === tab.id ? '#e4e4e7' : '#71717a',
                            borderRadius: '10px',
                            border: activeTabId === tab.id
                                ? '1px solid rgba(139, 92, 246, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.05)',
                            fontSize: '12px',
                            fontWeight: 500,
                            minWidth: '100px',
                            maxWidth: '180px',
                            transition: 'all 0.2s ease',
                            gap: '8px',
                            boxShadow: activeTabId === tab.id
                                ? '0 2px 8px rgba(139, 92, 246, 0.15)'
                                : 'none'
                        }}
                    >
                        <TerminalIcon size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
                        <span style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {tab.title}
                        </span>
                        <X
                            size={12}
                            style={{
                                opacity: 0.4,
                                borderRadius: '4px',
                                padding: '2px',
                                transition: 'all 0.15s ease',
                                flexShrink: 0
                            }}
                            onClick={(e) => {
                                e.stopPropagation()
                                onCloseTab(tab.id)
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.opacity = '1'
                                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.2)'
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.opacity = '0.4'
                                e.currentTarget.style.background = 'transparent'
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Divider */}
            <div style={{
                width: '1px',
                height: '20px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '1px'
            }} />

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* New Terminal */}
                <button
                    onClick={onAddTab}
                    style={{
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: '#a78bfa',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                    }}
                    title="New Terminal (Ctrl+Shift+T)"
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%)'}
                >
                    <Plus size={14} />
                </button>

                {/* Split Horizontal */}
                {onSplitHorizontal && (
                    <button
                        onClick={onSplitHorizontal}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#71717a',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                        }}
                        title="Split Right"
                        onMouseOver={(e) => e.currentTarget.style.color = '#60a5fa'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#71717a'}
                    >
                        <SplitSquareHorizontal size={16} />
                    </button>
                )}

                {/* Split Vertical */}
                {onSplitVertical && (
                    <button
                        onClick={onSplitVertical}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#71717a',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                        }}
                        title="Split Down"
                        onMouseOver={(e) => e.currentTarget.style.color = '#60a5fa'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#71717a'}
                    >
                        <SplitSquareVertical size={16} />
                    </button>
                )}

                {/* Command Palette */}
                {onOpenPalette && (
                    <button
                        onClick={onOpenPalette}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#71717a',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                        }}
                        title="Command Palette (Ctrl+Shift+P)"
                        onMouseOver={(e) => e.currentTarget.style.color = '#a78bfa'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#71717a'}
                    >
                        <Command size={16} />
                    </button>
                )}

                {/* Search */}
                <button
                    onClick={onToggleSearch}
                    style={{
                        background: searchVisible ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: searchVisible ? '#60a5fa' : '#71717a',
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    title="Search (Ctrl+Shift+F)"
                    onMouseOver={(e) => e.currentTarget.style.color = '#60a5fa'}
                    onMouseOut={(e) => e.currentTarget.style.color = searchVisible ? '#60a5fa' : '#71717a'}
                >
                    <Search size={16} />
                </button>

                {/* Clear */}
                <button
                    onClick={onClearTerminal}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#71717a',
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    title="Clear Terminal (Ctrl+K)"
                    onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#71717a'}
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    )
}
