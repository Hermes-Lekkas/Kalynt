/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// IDE Commands Registry
// Central registry for all IDE commands accessible via Command Palette

import type { IDECommand } from '../components/ide/CommandPalette'

type CommandHandler = () => void | Promise<void>

interface CommandRegistry {
    commands: Map<string, IDECommand>
    register: (command: IDECommand) => void
    unregister: (id: string) => void
    getAll: () => IDECommand[]
    execute: (id: string) => boolean
}

// Create a singleton command registry
class IDECommandRegistry implements CommandRegistry {
    commands: Map<string, IDECommand> = new Map()

    register(command: IDECommand) {
        // BUG-091: Add key shortcut validation
        if (command.shortcut) {
            for (const existing of this.commands.values()) {
                if (existing.shortcut === command.shortcut && existing.id !== command.id) {
                    console.warn(`[CommandRegistry] Shortcut conflict: ${command.shortcut} is already used by ${existing.id}`)
                    // We could throw here, but for now just warn to avoid crashing app startup if config is messy
                    // throw new Error(...) 
                }
            }
        }
        this.commands.set(command.id, command)
    }

    unregister(id: string) {
        this.commands.delete(id)
    }

    getAll(): IDECommand[] {
        return Array.from(this.commands.values())
    }

    execute(id: string): boolean {
        const command = this.commands.get(id)
        if (command) {
            command.action()
            return true
        }
        return false
    }
}

export const commandRegistry = new IDECommandRegistry()

// Default IDE commands factory - creates commands with provided handlers
export function createDefaultCommands(handlers: {
    newFile?: CommandHandler
    saveFile?: CommandHandler
    closeFile?: CommandHandler
    closeAllFiles?: CommandHandler
    openFolder?: CommandHandler
    toggleTerminal?: CommandHandler
    toggleSidebar?: CommandHandler
    toggleGitPanel?: CommandHandler
    toggleAIPanel?: CommandHandler
    runCode?: CommandHandler
    debugCode?: CommandHandler
    buildCode?: CommandHandler
    formatDocument?: CommandHandler
    goToLine?: CommandHandler
    findInFiles?: CommandHandler
    gitCommit?: CommandHandler
    gitPush?: CommandHandler
    gitPull?: CommandHandler
    aiChat?: CommandHandler
    aiExplain?: CommandHandler
    aiRefactor?: CommandHandler
}): IDECommand[] {
    const configs: Array<{
        key: keyof typeof handlers
        id: string
        title: string
        category: string
        icon: string
        shortcut?: string
    }> = [
            { key: 'newFile', id: 'file.new', title: 'New File', shortcut: 'Ctrl+N', category: 'file', icon: 'FilePlus' },
            { key: 'saveFile', id: 'file.save', title: 'Save File', shortcut: 'Ctrl+S', category: 'file', icon: 'Save' },
            { key: 'closeFile', id: 'file.close', title: 'Close File', shortcut: 'Ctrl+W', category: 'file', icon: 'X' },
            { key: 'closeAllFiles', id: 'file.closeAll', title: 'Close All Files', shortcut: 'Ctrl+Shift+W', category: 'file', icon: 'X' },
            { key: 'openFolder', id: 'file.openFolder', title: 'Open Folder', shortcut: 'Ctrl+K Ctrl+O', category: 'file', icon: 'Folder' },
            { key: 'toggleTerminal', id: 'view.terminal', title: 'Toggle Terminal', shortcut: 'Ctrl+`', category: 'view', icon: 'Terminal' },
            { key: 'toggleSidebar', id: 'view.sidebar', title: 'Toggle Sidebar', shortcut: 'Ctrl+B', category: 'view', icon: 'FolderOpen' },
            { key: 'toggleGitPanel', id: 'view.git', title: 'Toggle Git Panel', shortcut: 'Ctrl+Shift+G', category: 'view', icon: 'GitBranch' },
            { key: 'toggleAIPanel', id: 'view.ai', title: 'Toggle AI Assistant', shortcut: 'Ctrl+Shift+A', category: 'view', icon: 'Bot' },
            { key: 'runCode', id: 'terminal.run', title: 'Run Current File', shortcut: 'F5', category: 'terminal', icon: 'Play' },
            { key: 'debugCode', id: 'terminal.debug', title: 'Debug Current File', shortcut: 'F9', category: 'terminal', icon: 'Bug' },
            { key: 'buildCode', id: 'terminal.build', title: 'Build Project', shortcut: 'Ctrl+Shift+B', category: 'terminal', icon: 'Hammer' },
            { key: 'formatDocument', id: 'edit.format', title: 'Format Document', shortcut: 'Shift+Alt+F', category: 'edit', icon: 'Sparkles' },
            { key: 'goToLine', id: 'edit.goToLine', title: 'Go to Line', shortcut: 'Ctrl+G', category: 'edit', icon: 'MoveVertical' },
            { key: 'findInFiles', id: 'edit.findInFiles', title: 'Find in Files', shortcut: 'Ctrl+Shift+F', category: 'edit', icon: 'Search' },
            { key: 'gitCommit', id: 'git.commit', title: 'Git: Commit', category: 'git', icon: 'CheckCircle2' },
            { key: 'gitPush', id: 'git.push', title: 'Git: Push', category: 'git', icon: 'ArrowUp' },
            { key: 'gitPull', id: 'git.pull', title: 'Git: Pull', category: 'git', icon: 'ArrowDown' },
            { key: 'aiChat', id: 'ai.chat', title: 'AI: Open Chat', shortcut: 'Ctrl+L', category: 'ai', icon: 'MessageSquare' },
            { key: 'aiExplain', id: 'ai.explain', title: 'AI: Explain Selection', category: 'ai', icon: 'Lightbulb' },
            { key: 'aiRefactor', id: 'ai.refactor', title: 'AI: Refactor Selection', shortcut: 'Ctrl+K', category: 'ai', icon: 'Wrench' }
        ]

    return configs
        .filter(cfg => handlers[cfg.key])
        .map(cfg => ({
            id: cfg.id,
            title: cfg.title,
            shortcut: cfg.shortcut,
            category: cfg.category as any,
            icon: cfg.icon,
            action: handlers[cfg.key]!
        }))
}

export type { CommandHandler }
