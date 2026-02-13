/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect, useRef } from 'react'
import Terminal from './Terminal'

interface IDEBottomTerminalProps {
    showTerminal: boolean
    terminalHeight: number
    setTerminalHeight: (height: number) => void
    workspacePath: string | null
    codeOutput?: string
    isRunning?: boolean
}

export const IDEBottomTerminal: React.FC<IDEBottomTerminalProps> = ({
    showTerminal,
    terminalHeight,
    setTerminalHeight,
    workspacePath,
    codeOutput = '',
    isRunning = false
}) => {
    const [activeTab, setActiveTab] = useState<'terminal' | 'output'>('terminal')
    const outputRef = useRef<HTMLPreElement>(null)

    // Switch to output tab when code starts running
    useEffect(() => {
        if (isRunning || codeOutput) {
            setActiveTab('output')
        }
    }, [isRunning, codeOutput])

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [codeOutput])

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
            </div>

            {/* Terminal tab */}
            <div style={{ flex: 1, display: activeTab === 'terminal' ? 'flex' : 'none' }}>
                <Terminal cwd={workspacePath || undefined} />
            </div>

            {/* Output tab */}
            <div style={{
                flex: 1,
                display: activeTab === 'output' ? 'flex' : 'none',
                flexDirection: 'column',
                background: 'var(--terminal-bg, #11111b)',
                overflow: 'hidden'
            }}>
                <pre
                    ref={outputRef}
                    style={{
                        margin: 0,
                        padding: '12px',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: '13px',
                        color: 'var(--text-primary, #cdd6f4)',
                        overflow: 'auto',
                        height: '100%',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}
                >
                    {codeOutput || 'No output yet. Run a file to see output here.'}
                </pre>
            </div>
        </div>
    )
}
