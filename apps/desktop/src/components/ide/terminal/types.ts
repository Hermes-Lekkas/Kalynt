/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'

export interface TerminalTab {
    id: string
    title: string
    shell: string
    cwd: string
    processType: 'shell' | 'task' | 'debug'
    pid?: number
}

export interface TerminalProps {
    cwd?: string
}

export interface ContextMenuState {
    visible: boolean
    x: number
    y: number
}

export interface TerminalTheme {
    background: string
    foreground: string
    cursor: string
    selection: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
}

// AMOLED Glassmorphism Theme - True black with vibrant accents
export const DEFAULT_THEME: TerminalTheme = {
    background: '#000000',
    foreground: '#e4e4e7',
    cursor: '#a78bfa',
    selection: 'rgba(139, 92, 246, 0.35)',
    black: '#18181b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#a78bfa',
    cyan: '#22d3ee',
    white: '#a1a1aa',
    brightBlack: '#3f3f46',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fcd34d',
    brightBlue: '#93c5fd',
    brightMagenta: '#c4b5fd',
    brightCyan: '#67e8f9',
    brightWhite: '#f4f4f5'
}

export const LIGHT_THEME: TerminalTheme = {
    background: '#ffffff',
    foreground: '#1a1a1a',
    cursor: '#3b82f6',
    selection: 'rgba(59, 130, 246, 0.2)',
    black: '#000000',
    red: '#e11d48',
    green: '#16a34a',
    yellow: '#d97706',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#e5e5e5',
    brightBlack: '#525252',
    brightRed: '#f43f5e',
    brightGreen: '#22c55e',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff'
}

export interface TerminalState {
    xterm: Terminal | null
    fitAddon: FitAddon | null
    searchAddon: SearchAddon | null
    webLinksAddon: WebLinksAddon | null
    unicode11Addon: Unicode11Addon | null
    element: HTMLDivElement
}
