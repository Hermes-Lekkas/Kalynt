/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { EventEmitter } from 'events'

interface JSONRPCRequest {
    jsonrpc: string
    id: number | null
    method: string
    params?: any
}

interface JSONRPCMessage {
    jsonrpc: string
    id?: number
    method?: string
    result?: any
    params?: any
    error?: { code: number; message: string }
}

class NativeHelperService extends EventEmitter {
    private process: ChildProcess | null = null
    private requestId = 0
    private pendingRequests = new Map<number, { resolve: (res: any) => void, reject: (err: Error) => void }>()
    private buffer = ''

    constructor() {
        super()
        if (process.platform === 'darwin') {
            this.init()
        }
    }

    private init() {
        // Path to the Swift binary
        // During development: packages/native-macos/.build/debug/KalyntHelper
        // In production: Contents/Resources/bin/KalyntHelper
        const devPath = path.join(app.getAppPath(), '..', '..', 'packages', 'native-macos', '.build', 'debug', 'KalyntHelper')
        const prodPath = path.join(process.resourcesPath, 'bin', 'KalyntHelper')
        
        const helperPath = fs.existsSync(devPath) ? devPath : prodPath

        if (!fs.existsSync(helperPath)) {
            console.warn('[NativeHelper] Swift binary not found. Native features disabled.')
            return
        }

        try {
            this.process = spawn(helperPath)
            
            this.process.stdout?.on('data', (data) => {
                this.buffer += data.toString()
                this.processBuffer()
            })

            this.process.stderr?.on('data', (data) => {
                console.error('[NativeHelper] Error:', data.toString())
            })

            this.process.on('close', (code) => {
                console.log(`[NativeHelper] Closed with code ${code}`)
                this.process = null
            })
        } catch (error) {
            console.error('[NativeHelper] Failed to spawn:', error)
        }
    }

    private processBuffer() {
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.trim()) continue
            try {
                const message = JSON.parse(line) as JSONRPCMessage
                
                if (message.id !== undefined && message.id !== null) {
                    // It's a response
                    const pending = this.pendingRequests.get(message.id)
                    if (pending) {
                        if (message.error) {
                            pending.reject(new Error(message.error.message))
                        } else {
                            pending.resolve(message.result)
                        }
                        this.pendingRequests.delete(message.id)
                    }
                } else if (message.method) {
                    // It's a notification/event
                    this.emit(message.method, message.params)
                }
            } catch (error) {
                console.error('[NativeHelper] Parse error:', error, line)
            }
        }
    }

    async request(method: string, params?: any): Promise<any> {
        if (!this.process) {
            throw new Error('Native helper not running')
        }

        const id = ++this.requestId
        const req: JSONRPCRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject })
            this.process?.stdin?.write(JSON.stringify(req) + '\n')
        })
    }

    isAvailable(): boolean {
        return this.process !== null
    }

    dispose() {
        if (this.process) {
            this.process.kill()
            this.process = null
        }
    }
}

export const nativeHelperService = new NativeHelperService()
