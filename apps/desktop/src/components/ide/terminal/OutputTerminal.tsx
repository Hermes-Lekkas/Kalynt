/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useAppStore } from '../../../stores/appStore'
import '@xterm/xterm/css/xterm.css'

interface OutputTerminalProps {
    readonly content: string
    readonly isRunning: boolean
    readonly onInput?: (data: string) => void
}

export const OutputTerminal: React.FC<OutputTerminalProps> = ({
    content,
    isRunning,
    onInput
}) => {
    const { theme } = useAppStore()
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const lastContentRef = useRef<string>('')

    useEffect(() => {
        if (!containerRef.current) return

        const term = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            theme: {
                background: theme === 'light' ? '#ffffff' : '#11111b',
                foreground: theme === 'light' ? '#1a1a1a' : '#cdd6f4'
            },
            cursorBlink: true,
            convertEol: true
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(containerRef.current)
        fitAddon.fit()

        term.onData((data) => {
            if (isRunning && onInput) {
                // Local echo: xterm.js doesn't echo automatically.
                // For scripts (which aren't full PTYs), we usually want to see what we type.
                // Map \r (Enter) to \r\n for display, but keep \r for the backend.
                term.write(data === '\r' ? '\r\n' : data)
                onInput(data)
            }
        })

        terminalRef.current = term
        fitAddonRef.current = fitAddon

        // Focus the terminal immediately
        term.focus()

        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
        })
        resizeObserver.observe(containerRef.current)

        return () => {
            resizeObserver.disconnect()
            term.dispose()
        }
    }, [onInput, isRunning, theme])

    // Update terminal theme when global theme changes
    useEffect(() => {
        const term = terminalRef.current
        if (term) {
            term.options.theme = {
                background: theme === 'light' ? '#ffffff' : '#11111b',
                foreground: theme === 'light' ? '#1a1a1a' : '#cdd6f4'
            }
        }
    }, [theme])

    // Ensure focus when running state changes or content updates
    useEffect(() => {
        if (isRunning) {
            terminalRef.current?.focus()
        }
    }, [isRunning])

    // Update terminal content
    useEffect(() => {
        const term = terminalRef.current
        if (!term) return

        // We only want to write the *new* part of the content
        if (content.startsWith(lastContentRef.current)) {
            const newContent = content.substring(lastContentRef.current.length)
            if (newContent) {
                term.write(newContent)
            }
        } else {
            // If content was reset or changed significantly, clear and rewrite
            term.clear()
            term.write(content)
        }
        lastContentRef.current = content
    }, [content])

    return (
        <div 
            ref={containerRef} 
            style={{ 
                width: '100%', 
                height: '100%', 
                background: theme === 'light' ? '#ffffff' : '#11111b',
                padding: '4px'
            }} 
        />
    )
}
