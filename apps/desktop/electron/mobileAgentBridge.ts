/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Mobile Agent Bridge
 * 
 * Connects mobile commands to the actual Kalynt agent system.
 * Provides IPC interface between mobile bridge and agent managers.
 */

import { ipcMain, BrowserWindow } from 'electron'

// Command types matching the mobile app
interface AgentCommand {
    agentId: string
    command: string
    params: Record<string, any>
}

interface CommandResult {
    success: boolean
    result?: any
    error?: string
    executionTimeMs: number
}

// Callback registry for active commands
const activeCommands = new Map<string, {
    resolve: (result: any) => void
    reject: (error: any) => void
    timeout: NodeJS.Timeout
}>()

/**
 * Initialize the agent bridge IPC handlers
 */
export function initializeAgentBridge(): void {
    // Handler for executing agent commands from mobile
    ipcMain.handle('mobile:execute-command', async (_, command: AgentCommand) => {
        return executeAgentCommand(command)
    })

    // Handler for getting list of available agents
    ipcMain.handle('mobile:get-agents', async () => {
        return getAvailableAgents()
    })

    // Handler for getting agent status
    ipcMain.handle('mobile:get-agent-status', async (_, agentId: string) => {
        return getAgentStatus(agentId)
    })

    // Handler for command completion (called by renderer when agent finishes)
    ipcMain.on('mobile:command-complete', (_, params: {
        commandId: string
        result: any
        error?: string
    }) => {
        const pending = activeCommands.get(params.commandId)
        if (pending) {
            clearTimeout(pending.timeout)
            activeCommands.delete(params.commandId)
            
            if (params.error) {
                pending.reject(new Error(params.error))
            } else {
                pending.resolve(params.result)
            }
        }
    })

    console.log('[MobileAgentBridge] Initialized')
}

/**
 * Execute a command on an agent
 * This communicates with the renderer process where agents run
 */
async function executeAgentCommand(command: AgentCommand): Promise<CommandResult> {
    const commandId = generateCommandId()
    const startTime = Date.now()

    // Get the main window to communicate with renderer
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
    if (!mainWindow) {
        return {
            success: false,
            error: 'Kalynt desktop not ready',
            executionTimeMs: Date.now() - startTime
        }
    }

    try {
        // Send command to renderer for execution
        const result = await new Promise((resolve, reject) => {
            // Set timeout
            const timeout = setTimeout(() => {
                activeCommands.delete(commandId)
                reject(new Error('Command timeout'))
            }, 300000) // 5 minute timeout for long operations

            // Store pending command
            activeCommands.set(commandId, { resolve, reject, timeout })

            // Send to renderer
            mainWindow.webContents.send('mobile:execute-agent-command', {
                commandId,
                agentId: command.agentId,
                command: command.command,
                params: command.params
            })
        })

        return {
            success: true,
            result,
            executionTimeMs: Date.now() - startTime
        }

    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Command failed',
            executionTimeMs: Date.now() - startTime
        }
    }
}

/**
 * Get list of available agents
 */
async function getAvailableAgents(): Promise<any[]> {
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
    if (!mainWindow) {
        return []
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve([])
        }, 5000)

        // One-time listener for response
        const handler = (_: any, agents: any[]) => {
            clearTimeout(timeout)
            ipcMain.removeListener('mobile:agents-list', handler)
            resolve(agents)
        }

        ipcMain.once('mobile:agents-list', handler)
        mainWindow.webContents.send('mobile:get-agents-request')
    })
}

/**
 * Get status of a specific agent
 */
async function getAgentStatus(agentId: string): Promise<any> {
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
    if (!mainWindow) {
        return { status: 'offline' }
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ status: 'unknown' })
        }, 5000)

        const handler = (_: any, status: any) => {
            clearTimeout(timeout)
            ipcMain.removeListener('mobile:agent-status', handler)
            resolve(status)
        }

        ipcMain.once('mobile:agent-status', handler)
        mainWindow.webContents.send('mobile:get-agent-status-request', agentId)
    })
}

/**
 * Generate unique command ID
 */
function generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Cleanup function for when mobile bridge shuts down
 */
export function cleanupAgentBridge(): void {
    // Reject all pending commands
    for (const [commandId, pending] of activeCommands) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Bridge shutting down'))
    }
    activeCommands.clear()

    // Remove IPC handlers
    ipcMain.removeHandler('mobile:execute-command')
    ipcMain.removeHandler('mobile:get-agents')
    ipcMain.removeHandler('mobile:get-agent-status')

    console.log('[MobileAgentBridge] Cleaned up')
}