/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useState, useCallback } from 'react'
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Check,
    Play,
    Clock,
    CheckCircle2,
    XCircle,
    Terminal as TerminalIcon
} from 'lucide-react'

export interface CommandBlockData {
    id: string
    command: string
    output: string[]
    startTime: number
    endTime?: number
    exitCode?: number
    cwd?: string
    isRunning: boolean
}

interface CommandBlockProps {
    block: CommandBlockData
    onRerun?: (command: string) => void
    isCollapsed?: boolean
    onToggleCollapse?: () => void
}

export const CommandBlock: React.FC<CommandBlockProps> = ({
    block,
    onRerun,
    isCollapsed = false,
    onToggleCollapse
}) => {
    const [copied, setCopied] = useState<'command' | 'output' | null>(null)

    const duration = block.endTime
        ? ((block.endTime - block.startTime) / 1000).toFixed(2)
        : null

    const handleCopy = useCallback(async (type: 'command' | 'output') => {
        const text = type === 'command'
            ? block.command
            : block.output.join('\n')

        await navigator.clipboard.writeText(text)
        setCopied(type)
        setTimeout(() => setCopied(null), 2000)
    }, [block])

    const getStatusIcon = () => {
        if (block.isRunning) {
            return (
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                    animation: 'pulse 1.5s ease-in-out infinite'
                }} />
            )
        }
        if (block.exitCode === 0) {
            return <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
        }
        if (block.exitCode !== undefined) {
            return <XCircle size={14} style={{ color: '#f87171' }} />
        }
        return null
    }

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.6) 0%, rgba(9, 9, 11, 0.8) 100%)',
            backdropFilter: 'blur(8px)',
            borderRadius: '12px',
            border: block.isRunning
                ? '1px solid rgba(139, 92, 246, 0.4)'
                : block.exitCode === 0
                    ? '1px solid rgba(74, 222, 128, 0.2)'
                    : block.exitCode !== undefined
                        ? '1px solid rgba(248, 113, 113, 0.2)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: '8px',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            boxShadow: block.isRunning
                ? '0 0 20px rgba(139, 92, 246, 0.15)'
                : '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}>
            {/* Command Header */}
            <div
                onClick={onToggleCollapse}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderBottom: isCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.04)',
                    gap: '10px',
                    userSelect: 'none'
                }}
            >
                {/* Collapse Toggle */}
                <div style={{
                    color: '#71717a',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'transform 0.15s ease'
                }}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </div>

                {/* Status Icon */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {getStatusIcon()}
                </div>

                {/* Command Text */}
                <div style={{
                    flex: 1,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: '13px',
                    color: '#e4e4e7',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    <span style={{ color: '#a78bfa', marginRight: '8px' }}>$</span>
                    {block.command}
                </div>

                {/* Duration Badge */}
                {duration && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '10px',
                        fontSize: '11px',
                        color: '#71717a'
                    }}>
                        <Clock size={10} />
                        {duration}s
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => handleCopy('command')}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 6px',
                            cursor: 'pointer',
                            color: copied === 'command' ? '#4ade80' : '#71717a',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.15s ease'
                        }}
                        title="Copy command"
                    >
                        {copied === 'command' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    {onRerun && !block.isRunning && (
                        <button
                            onClick={() => onRerun(block.command)}
                            style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px 6px',
                                cursor: 'pointer',
                                color: '#a78bfa',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'all 0.15s ease'
                            }}
                            title="Re-run command"
                        >
                            <Play size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Output Section */}
            {!isCollapsed && block.output.length > 0 && (
                <div style={{
                    padding: '12px 14px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    position: 'relative'
                }}>
                    <pre style={{
                        margin: 0,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: '12px',
                        lineHeight: 1.5,
                        color: '#a1a1aa',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                    }}>
                        {block.output.join('')}
                    </pre>

                    {/* Copy Output Button */}
                    <button
                        onClick={() => handleCopy('output')}
                        style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(24, 24, 27, 0.9)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            color: copied === 'output' ? '#4ade80' : '#71717a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {copied === 'output' ? <Check size={10} /> : <Copy size={10} />}
                        {copied === 'output' ? 'Copied' : 'Copy'}
                    </button>
                </div>
            )}

            {/* CWD Footer */}
            {block.cwd && !isCollapsed && (
                <div style={{
                    padding: '6px 14px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    fontSize: '10px',
                    color: '#52525b',
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    <TerminalIcon size={10} />
                    {block.cwd}
                </div>
            )}
        </div>
    )
}

// CSS Animation (inject into document)
const style = document.createElement('style')
style.textContent = `
@keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.9); }
}
`
if (typeof document !== 'undefined' && !document.getElementById('command-block-styles')) {
    style.id = 'command-block-styles'
    document.head.appendChild(style)
}
