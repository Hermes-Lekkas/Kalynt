/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect } from 'react'
import Terminal from './Terminal'
import { OutputTerminal } from './terminal/OutputTerminal'

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
    const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'build' | 'debug'>('terminal')

    // Switch to output tab when code starts running
    useEffect(() => {
        if (isRunning) {
            setActiveTab('output')
        }
    }, [isRunning])

    // Switch to build tab when build starts
    useEffect(() => {
        if (isBuilding) {
            setActiveTab('build')
        }
    }, [isBuilding])

    // Switch to debug tab when debug starts
    useEffect(() => {
        if (isDebugging) {
            setActiveTab('debug')
        }
    }, [isDebugging])

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
                background: 'var(--panel-header-bg, #1e1e2e)',
                borderBottom: '1px solid var(--border-color, #313244)',
                padding: '0 8px'
            }}>
                <button
                    onClick={() => setActiveTab('terminal')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'terminal' ? 'var(--bg-active, #45475a)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'terminal' ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'terminal' ? '2px solid var(--accent, #89b4fa)' : '2px solid transparent',
                        fontSize: '12px'
                    }}
                >
                    Terminal
                </button>
                <button
                    onClick={() => setActiveTab('output')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'output' ? 'var(--bg-active, #45475a)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'output' ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'output' ? '2px solid var(--accent, #89b4fa)' : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    Output
                    {isRunning && <span style={{ color: 'var(--success, #a6e3a1)' }}>{"\u25CF"}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('build')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'build' ? 'var(--bg-active, #45475a)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'build' ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'build' ? '2px solid var(--accent, #89b4fa)' : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    Build
                    {isBuilding && <span style={{ color: 'var(--warning, #f9e2af)' }}>{"\u25CF"}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('debug')}
                    style={{
                        padding: '6px 12px',
                        background: activeTab === 'debug' ? 'var(--bg-active, #45475a)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'debug' ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'debug' ? '2px solid var(--accent, #89b4fa)' : '2px solid transparent',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    Debug
                    {isDebugging && <span style={{ color: 'var(--error, #f38ba8)' }}>{"\u25CF"}</span>}
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
                    background: 'var(--terminal-bg, #11111b)',
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
                    background: 'var(--terminal-bg, #11111b)',
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
                    background: 'var(--terminal-bg, #11111b)',
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

