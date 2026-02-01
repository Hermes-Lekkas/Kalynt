/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { safeStorage } from 'electron'
import type { IpcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Store encrypted keys in a JSON file in userData
let keysFilePath: string = ''

interface EncryptedKeys {
    [key: string]: string // Base64 encoded encrypted values
}

function getKeysFilePath(userDataPath: string): string {
    if (!keysFilePath) {
        keysFilePath = path.join(userDataPath, 'secure-keys.json')
    }
    return keysFilePath
}

function loadKeys(userDataPath: string): EncryptedKeys {
    try {
        const filePath = getKeysFilePath(userDataPath)
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8')
            return JSON.parse(data)
        }
    } catch (error) {
        console.error('[SafeStorage] Failed to load keys:', error)
    }
    return {}
}

function saveKeys(userDataPath: string, keys: EncryptedKeys): void {
    try {
        const filePath = getKeysFilePath(userDataPath)
        fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), 'utf-8')
    } catch (error) {
        console.error('[SafeStorage] Failed to save keys:', error)
    }
}

export function registerSafeStorageHandlers(
    ipcMain: IpcMain,
    getUserDataPath: () => string
) {
    // Check if safeStorage is available
    ipcMain.handle('safeStorage:isAvailable', () => {
        return safeStorage.isEncryptionAvailable()
    })

    // Store an encrypted value
    ipcMain.handle('safeStorage:set', async (_event, options: { key: string; value: string }) => {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[SafeStorage] Encryption not available, storing in plain text')
                // Fallback: store base64 encoded (not secure, but works)
                const keys = loadKeys(getUserDataPath())
                keys[options.key] = Buffer.from(options.value).toString('base64')
                saveKeys(getUserDataPath(), keys)
                return { success: true, encrypted: false }
            }

            const encrypted = safeStorage.encryptString(options.value)
            const keys = loadKeys(getUserDataPath())
            keys[options.key] = encrypted.toString('base64')
            saveKeys(getUserDataPath(), keys)

            console.log(`[SafeStorage] Stored encrypted key: ${options.key}`)
            return { success: true, encrypted: true }
        } catch (error) {
            console.error('[SafeStorage] Set error:', error)
            return { success: false, error: String(error) }
        }
    })

    // Retrieve and decrypt a value
    ipcMain.handle('safeStorage:get', async (_event, key: string) => {
        try {
            const keys = loadKeys(getUserDataPath())
            const encryptedBase64 = keys[key]

            if (!encryptedBase64) {
                return { success: true, value: null }
            }

            if (!safeStorage.isEncryptionAvailable()) {
                // Fallback: decode base64
                const value = Buffer.from(encryptedBase64, 'base64').toString('utf-8')
                return { success: true, value, encrypted: false }
            }

            const encrypted = Buffer.from(encryptedBase64, 'base64')
            const decrypted = safeStorage.decryptString(encrypted)

            return { success: true, value: decrypted, encrypted: true }
        } catch (error) {
            console.error('[SafeStorage] Get error:', error)
            return { success: false, error: String(error) }
        }
    })

    // Delete a stored key
    ipcMain.handle('safeStorage:delete', async (_event, key: string) => {
        try {
            const keys = loadKeys(getUserDataPath())
            delete keys[key]
            saveKeys(getUserDataPath(), keys)

            console.log(`[SafeStorage] Deleted key: ${key}`)
            return { success: true }
        } catch (error) {
            console.error('[SafeStorage] Delete error:', error)
            return { success: false, error: String(error) }
        }
    })

    // Get all stored key names (not values)
    ipcMain.handle('safeStorage:listKeys', async () => {
        try {
            const keys = loadKeys(getUserDataPath())
            return { success: true, keys: Object.keys(keys) }
        } catch (error) {
            console.error('[SafeStorage] ListKeys error:', error)
            return { success: false, error: String(error) }
        }
    })
}
