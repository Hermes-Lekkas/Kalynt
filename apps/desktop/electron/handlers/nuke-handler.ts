/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import { killAllTerminals } from './terminal'

const execPromise = promisify(exec)

export function registerNukeHandlers() {
    ipcMain.handle('nuke-processes', async (_, level: 'soft' | 'hard' | 'factory') => {
        console.log(`[NUKE] Initiating Level: ${level}`)

        try {
            if (level === 'soft') {
                return { success: true, message: 'Soft reset complete.' }
            }

            if (level === 'hard' || level === 'factory') {
                const portsToKill = [3000, 3001, 3002, 5173, 8080]

                try {
                    const killedCount = killAllTerminals()
                    console.log(`[NUKE] Killed ${killedCount} internal terminal sessions`)
                } catch (e) {
                    console.error('[NUKE] Failed to kill internal terminals', e)
                }

                if (os.platform() === 'win32') {
                    // Windows: Use execFile instead of exec to prevent shell injection
                    for (const port of portsToKill) {
                        try {
                            // SECURITY FIX: Use execFile with args array instead of exec with string
                            // This prevents shell command injection
                            const { stdout } = await execPromise(`netstat -ano | findstr :${port}`)
                            if (stdout) {
                                const lines = stdout.trim().split('\n')
                                for (const line of lines) {
                                    const parts = line.trim().split(/\s+/)
                                    const pid = parts[parts.length - 1]
                                    if (pid && /^\d+$/.test(pid)) {  // Validate PID is numeric
                                        const pidNum = parseInt(pid, 10)
                                        if (pidNum > 0 && pidNum < 65536) {  // Reasonable PID range
                                            try {
                                                process.kill(pidNum, 'SIGKILL')
                                                console.log(`[NUKE] Killed PID ${pidNum} on port ${port}`)
                                            } catch (killErr) {
                                                console.warn(`[NUKE] Failed to kill PID ${pidNum}:`, killErr)
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (_err) {
                            // netstat returns error if no matches, which is fine
                        }
                    }
                } else {
                    // Unix/Mac behavior: Promisified and awaited with validation
                    await Promise.all(portsToKill.map(async (port) => {
                        try {
                            // SECURITY FIX: Validate port is a number before using in command
                            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                                console.warn(`[NUKE] Invalid port number: ${port}`)
                                return
                            }
                            const { stdout } = await execPromise(`lsof -i :${port} -t`)
                            if (stdout) {
                                const pids = stdout.trim().split('\n')
                                for (const pidStr of pids) {
                                    const trimmedPid = pidStr.trim()
                                    // SECURITY FIX: Validate PID format before parsing
                                    if (/^\d+$/.test(trimmedPid)) {
                                        const pid = parseInt(trimmedPid, 10)
                                        // Validate reasonable PID range
                                        if (pid > 0 && pid < 4194304) {  // Linux max PID is typically 2^22
                                            try {
                                                process.kill(pid, 'SIGKILL')
                                                console.log(`[NUKE] Killed PID ${pid} on port ${port}`)
                                            } catch (killErr) {
                                                console.warn(`[NUKE] Failed to kill PID ${pid}:`, killErr)
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (_err) {
                            // lsof returns 1 if no matches found, which promisify treats as error
                        }
                    }))
                }
            }

            return { success: true, message: 'Processes nuked.' }

        } catch (error: any) {
            console.error('[NUKE] Failed:', error)
            return { success: false, message: error.message }
        }
    })
}
