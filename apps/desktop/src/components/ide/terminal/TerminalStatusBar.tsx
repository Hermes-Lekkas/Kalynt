/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React from 'react'
import { useAppStore } from '../../../stores/appStore'
import {
    Terminal as TerminalIcon,
    Cpu,
    CheckCircle2,
    XCircle,
    Loader2,
    Zap,
    Circle,
    Folder
} from 'lucide-react'

interface TerminalStatusBarProps {
    pid?: number
    shell?: string
    cwd?: string
    isRunning?: boolean
    lastExitCode?: number
    commandCount?: number
    isConnected?: boolean
}

export const TerminalStatusBar: React.FC<TerminalStatusBarProps> = ({
    pid,
    shell,
    cwd,
    isRunning,
    lastExitCode,
    commandCount = 0,
    isConnected = false
}) => {
    const { theme } = useAppStore()
    const getStatusColor = () => {
        if (isRunning) return '#60a5fa'
        if (lastExitCode === 0) return '#4ade80'
        if (lastExitCode !== undefined && lastExitCode !== 0) return '#f87171'
        return '#71717a'
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            background: theme === 'light' ? '#f0f0f0' : 'linear-gradient(90deg, rgba(9, 9, 11, 0.95) 0%, rgba(24, 24, 27, 0.9) 100%)',
            backdropFilter: 'blur(8px)',
            borderTop: `1px solid ${theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'}`,
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: theme === 'light' ? '#666666' : '#71717a',
            gap: '16px',
            userSelect: 'none'
        }}>
            {/* Left Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Shell */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 8px',
                    background: theme === 'light' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                    borderRadius: '10px',
                    color: theme === 'light' ? '#3b82f6' : '#a78bfa'
                }}>
                    <TerminalIcon size={10} />
                    <span>{shell || 'shell'}</span>
                </div>

                {/* PID */}
                {pid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu size={10} />
                        <span>PID: {pid}</span>
                    </div>
                )}

                {/* Status Indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: getStatusColor()
                }}>
                    {isRunning ? (
                        <>
                            <Loader2 size={10} className="terminal-spinner" />
                            <span>Running</span>
                        </>
                    ) : lastExitCode === 0 ? (
                        <>
                            <CheckCircle2 size={10} />
                            <span>Success</span>
                        </>
                    ) : lastExitCode !== undefined ? (
                        <>
                            <XCircle size={10} />
                            <span>Exit: {lastExitCode}</span>
                        </>
                    ) : (
                        <>
                            <Zap size={10} />
                            <span>Ready</span>
                        </>
                    )}
                </div>
            </div>

            <div style={{
                flex: 1,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
            }}>
                <Folder size={12} style={{ opacity: 0.6 }} />
                {cwd}
            </div>

            {/* Right Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Command Count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: theme === 'light' ? '#3b82f6' : '#a78bfa' }}>{commandCount}</span>
                    <span>commands</span>
                </div>

                {/* Connection Status Light */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 8px',
                    background: isConnected ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                    borderRadius: '10px'
                }}>
                    <Circle
                        size={6}
                        style={{
                            fill: isConnected ? '#4ade80' : '#f87171',
                            color: isConnected ? '#4ade80' : '#f87171',
                            filter: isConnected ? 'drop-shadow(0 0 2px #4ade80)' : 'none'
                        }}
                    />
                    <span style={{ color: isConnected ? '#4ade80' : '#f87171' }}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>

            {/* FIXED: Scoped style injection - moved to inline style tag */}
            <style>{`
                .terminal-spinner {
                    animation: terminal-spin 1s linear infinite;
                }
                @keyframes terminal-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

