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
                    // Windows: Keep existing logic but we could promisify it too if needed
                    for (const port of portsToKill) {
                        try {
                            exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
                                if (stdout) {
                                    const lines = stdout.trim().split('\n')
                                    lines.forEach(line => {
                                        const parts = line.trim().split(/\s+/)
                                        const pid = parts[parts.length - 1]
                                        if (pid && parseInt(pid) > 0) {
                                            try {
                                                process.kill(parseInt(pid), 'SIGKILL')
                                            } catch (_e) { /* ignore */ }
                                        }
                                    })
                                }
                            })
                        } catch (e) {
                            console.error(`Failed to kill port ${port}`, e)
                        }
                    }
                } else {
                    // Unix/Mac behavior: Promisified and awaited
                    await Promise.all(portsToKill.map(async (port) => {
                        try {
                            const { stdout } = await execPromise(`lsof -i :${port} -t`)
                            if (stdout) {
                                const pids = stdout.trim().split('\n')
                                pids.forEach(pidStr => {
                                    const pid = parseInt(pidStr.trim())
                                    if (pid > 0) {
                                        try {
                                            process.kill(pid, 'SIGKILL')
                                            console.log(`[NUKE] Killed PID ${pid} on port ${port}`)
                                        } catch (killErr) {
                                            console.warn(`[NUKE] Failed to kill PID ${pid}:`, killErr)
                                        }
                                    }
                                })
                            }
                        } catch (e) {
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
