/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect } from 'react'
import Terminal from './Terminal'
import { OutputTerminal } from './terminal/OutputTerminal'
import { useAppStore } from '../../stores/appStore'

interface IDEBottomTerminalProps {
    showTerminal: boolean
    terminalHeight: number
    setTerminalHeight: (height: number) => void
    workspacePath: string | null
    codeOutput?: string
    buildOutput?: string
    debugOutput?: string
    isRunning?: boolean
    isBuilding?: boolean
    isDebugging?: boolean
    onActiveTerminalChange?: (id: string) => void
    onOutputInput?: (data: string) => void
}

export const IDEBottomTerminal: React.FC<IDEBottomTerminalProps> = ({
    showTerminal,
    terminalHeight,
    setTerminalHeight,
    workspacePath,
    codeOutput = '',
    buildOutput = '',
    debugOutput = '',
    isRunning = false,
    isBuilding = false,
    isDebugging = false,
    onActiveTerminalChange,
    onOutputInput
}) => {
    const { theme } = useAppStore()
    const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'build' | 'debug'>('terminal')

    // Switch to appropriate tab when processes start
    useEffect(() => {
        const switchTab = () => {
            if (isRunning) {
                setActiveTab('output')
            } else if (isBuilding) {
                setActiveTab('build')
            } else if (isDebugging) {
                setActiveTab('debug')
            }
        }
        
        // Defer to avoid synchronous state update in effect body
        const timeout = setTimeout(switchTab, 0)
        return () => clearTimeout(timeout)
    }, [isRunning, isBuilding, isDebugging])

    return (
        <div
            className="terminal-panel"
            style={{
                height: terminalHeight,
                display: showTerminal ? 'flex' : 'none',
                flexDirection: 'column'
            }}
        >
            <div className="panel-resize-handle"
                onMouseDown={(e) => {
                    const startY = e.clientY
                    const startHeight = terminalHeight

                    const onMouseMove = (e: MouseEvent) => {
                        const delta = startY - e.clientY
                        setTerminalHeight(Math.max(100, Math.min(500, startHeight + delta)))
                    }

                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove)
                        document.removeEventListener('mouseup', onMouseUp)
                    }

                    document.addEventListener('mousemove', onMouseMove)
                    document.addEventListener('mouseup', onMouseUp)
                }}
            />

            {/* Tab bar */}
            <div style={{
                display: 'flex',
                background: theme === 'light' ? '#ffffff' : 'var(--panel-header-bg, #1e1e2e)',
                borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : 'var(--border-color, #313244)'}`,
                padding: '0 8px'
            }}>
                <button
                    onClick={() => setActiveTab('terminal')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'terminal' ? (theme === 'light' ? '#ffffff' : 'var(--bg-active, #45475a)') : 'transparent',
                        border: 'none',
                        color: activeTab === 'terminal' ? (theme === 'light' ? '#111827' : 'var(--text-primary, #cdd6f4)') : (theme === 'light' ? '#6b7280' : 'var(--text-secondary, #a6adc8)'),
                        cursor: 'pointer',
                        borderBottom: activeTab === 'terminal' ? `2px solid ${theme === 'light' ? '#3b82f6' : 'var(--accent, #89b4fa)'}` : '2px solid transparent',
                        fontSize: '12px',
                        fontWeight: activeTab === 'terminal' ? 600 : 400
                    }}
                >
                    Terminal
                </button>
                <button
                    onClick={() => setActiveTab('output')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'output' ? (theme === 'light' ? '#ffffff' : 'var(--bg-active, #45475a)') : 'transparent',
                        border: 'none',
                        color: activeTab === 'output' ? (theme === 'light' ? '#111827' : 'var(--text-primary, #cdd6f4)') : (theme === 'light' ? '#6b7280' : 'var(--text-secondary, #a6adc8)'),
                        cursor: 'pointer',
                        borderBottom: activeTab === 'output' ? `2px solid ${theme === 'light' ? '#3b82f6' : 'var(--accent, #89b4fa)'}` : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: activeTab === 'output' ? 600 : 400
                    }}
                >
                    Output
                    {isRunning && <span style={{ color: '#10b981' }}>{"\u25CF"}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('build')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'build' ? (theme === 'light' ? '#ffffff' : 'var(--bg-active, #45475a)') : 'transparent',
                        border: 'none',
                        color: activeTab === 'build' ? (theme === 'light' ? '#111827' : 'var(--text-primary, #cdd6f4)') : (theme === 'light' ? '#6b7280' : 'var(--text-secondary, #a6adc8)'),
                        cursor: 'pointer',
                        borderBottom: activeTab === 'build' ? `2px solid ${theme === 'light' ? '#3b82f6' : 'var(--accent, #89b4fa)'}` : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: activeTab === 'build' ? 600 : 400
                    }}
                >
                    Build
                    {isBuilding && <span style={{ color: '#f59e0b' }}>{"\u25CF"}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('debug')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'debug' ? (theme === 'light' ? '#ffffff' : 'var(--bg-active, #45475a)') : 'transparent',
                        border: 'none',
                        color: activeTab === 'debug' ? (theme === 'light' ? '#111827' : 'var(--text-primary, #cdd6f4)') : (theme === 'light' ? '#6b7280' : 'var(--text-secondary, #a6adc8)'),
                        cursor: 'pointer',
                        borderBottom: activeTab === 'debug' ? `2px solid ${theme === 'light' ? '#3b82f6' : 'var(--accent, #89b4fa)'}` : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: activeTab === 'debug' ? 600 : 400
                    }}
                >
                    Debug
                    {isDebugging && <span style={{ color: '#ef4444' }}>{"\u25CF"}</span>}
                </button>
            </div>

            {/* Terminal tab */}
            <div style={{ flex: 1, display: activeTab === 'terminal' ? 'flex' : 'none' }}>
                <Terminal cwd={workspacePath || undefined} onActiveTabChange={onActiveTerminalChange} />
            </div>

            {/* Output tab */}
            <div 
                tabIndex={0}
                style={{
                    flex: 1,
                    display: activeTab === 'output' ? 'flex' : 'none',
                    flexDirection: 'column',
                    background: theme === 'light' ? '#ffffff' : '#11111b',
                    overflow: 'hidden',
                    outline: 'none'
                }}
            >
                <OutputTerminal 
                    content={codeOutput} 
                    isRunning={isRunning} 
                    onInput={onOutputInput} 
                />
            </div>

            {/* Build tab */}
            <div 
                style={{
                    flex: 1,
                    display: activeTab === 'build' ? 'flex' : 'none',
                    flexDirection: 'column',
                    background: theme === 'light' ? '#ffffff' : '#11111b',
                    overflow: 'hidden'
                }}
            >
                <OutputTerminal 
                    content={buildOutput} 
                    isRunning={isBuilding}
                />
            </div>

            {/* Debug tab */}
            <div 
                style={{
                    flex: 1,
                    display: activeTab === 'debug' ? 'flex' : 'none',
                    flexDirection: 'column',
                    background: theme === 'light' ? '#ffffff' : '#11111b',
                    overflow: 'hidden'
                }}
            >
                <OutputTerminal 
                    content={debugOutput} 
                    isRunning={isDebugging}
                />
            </div>
        </div>
    )
}

