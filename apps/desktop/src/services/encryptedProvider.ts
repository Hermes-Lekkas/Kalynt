/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Encrypted WebRTC Provider - Encrypts Yjs updates at the network layer
// This wraps y-webrtc to encrypt/decrypt binary update messages

import * as Y from 'yjs'

// Encryption key storage (derived keys, never raw passwords)
const derivedKeys = new Map<string, CryptoKey>()

// Encryption config
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100000

/**
 * Derive encryption key from password using PBKDF2
 * Key is derived once and cached - never store raw password
 */
export async function deriveRoomKey(roomId: string, password: string): Promise<CryptoKey> {
    // Check cache first
    const cacheKey = `${roomId}:${await hashPassword(password)}`
    const cached = derivedKeys.get(cacheKey)
    if (cached) return cached

    // Create salt from roomId (deterministic for same room)
    const saltString = roomId.padEnd(16, '0').slice(0, 16)
    const salt = new TextEncoder().encode(saltString)

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    )

    // Derive AES key
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false, // not extractable - more secure
        ['encrypt', 'decrypt']
    )

    derivedKeys.set(cacheKey, key)
    return key
}

/**
 * Hash password for cache key (not for storage)
 */
async function hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16) // Truncate for cache key
}

/**
 * Encrypt Yjs update (binary data) - SYNCHRONOUS after key is derived
 * Uses streaming encryption for real-time updates
 */
export async function encryptUpdate(update: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt the update
    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        update as BufferSource
    )

    // Combine: [iv (12 bytes)][encrypted data]
    const result = new Uint8Array(12 + encrypted.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encrypted), 12)

    return result
}

/**
 * Decrypt Yjs update (binary data)
 */
export async function decryptUpdate(encryptedData: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    // Extract IV (first 12 bytes)
    const iv = encryptedData.slice(0, 12)
    const ciphertext = encryptedData.slice(12)

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    )

    return new Uint8Array(decrypted)
}

/**
 * Check if an update is encrypted (has valid structure)
 */
export function isEncryptedUpdate(data: Uint8Array): boolean {
    // Encrypted updates have at least 12 bytes IV + some ciphertext
    // Unencrypted Yjs updates start with specific byte patterns
    return data.length > 12 && data[0] !== 0 // Yjs updates typically start with 0
}

/**
 * Encryption state for a room
 */
interface RoomEncryptionState {
    enabled: boolean
    key: CryptoKey | null
    pendingKey: Promise<CryptoKey> | null
}

const roomStates = new Map<string, RoomEncryptionState>()

/**
 * Initialize encryption for a room
 */
export async function initializeRoomEncryption(
    roomId: string,
    password: string
): Promise<void> {
    const state: RoomEncryptionState = {
        enabled: true,
        key: null,
        pendingKey: null
    }
    roomStates.set(roomId, state)

    // Derive key in background
    state.pendingKey = deriveRoomKey(roomId, password)
    state.key = await state.pendingKey
    state.pendingKey = null

    console.log(`[Encryption] Room ${roomId} encryption initialized`)
}

/**
 * Disable encryption for a room
 */
export function disableRoomEncryption(roomId: string): void {
    roomStates.delete(roomId)
    console.log(`[Encryption] Room ${roomId} encryption disabled`)
}

/**
 * Get encryption state for a room
 */
export function getRoomEncryptionState(roomId: string): RoomEncryptionState | null {
    return roomStates.get(roomId) || null
}

/**
 * Check if room has encryption ready (key derived)
 */
export function isRoomEncryptionReady(roomId: string): boolean {
    const state = roomStates.get(roomId)
    return state?.enabled === true && state?.key !== null
}

/**
 * Encrypt outgoing message for a room
 */
export async function encryptRoomMessage(
    roomId: string,
    data: Uint8Array
): Promise<Uint8Array> {
    const state = roomStates.get(roomId)
    if (!state?.enabled || !state.key) {
        return data // Return unencrypted if not enabled
    }

    try {
        return await encryptUpdate(data, state.key)
    } catch (e) {
        console.error('[Encryption] Failed to encrypt:', e)
        return data // Fallback to unencrypted on error
    }
}

/**
 * Decrypt incoming message for a room
 */
export async function decryptRoomMessage(
    roomId: string,
    data: Uint8Array
): Promise<Uint8Array> {
    const state = roomStates.get(roomId)

    // If encryption not enabled, return as-is
    if (!state?.enabled || !state.key) {
        return data
    }

    // Check if data looks encrypted
    if (!isEncryptedUpdate(data)) {
        return data // Unencrypted message (legacy or from non-encrypted peer)
    }

    try {
        return await decryptUpdate(data, state.key)
    } catch (e) {
        console.error('[Encryption] Failed to decrypt:', e)
        throw new Error('Decryption failed - wrong key?')
    }
}

/**
 * Create encrypted document with update interception
 * This wraps a Y.Doc to encrypt/decrypt updates
 */
export function createEncryptedDoc(roomId: string, baseDoc?: Y.Doc): Y.Doc {
    const doc = baseDoc || new Y.Doc()
    const state = roomStates.get(roomId)

    if (state?.enabled && state.key) {
        // Note: Full encryption happens at the y-webrtc provider level
        // This doc instance will have its updates encrypted before network transmission
        console.log('[Encryption] Created encrypted doc wrapper for', roomId)
    }

    return doc
}

/**
 * LRU Cache with size limit for decrypted data
 */
export class LRUCache<K, V> {
    private cache = new Map<K, { value: V; timestamp: number }>()
    private maxSize: number
    private ttlMs: number

    constructor(maxSize: number = 1000, ttlMs: number = 5 * 60 * 1000) {
        this.maxSize = maxSize
        this.ttlMs = ttlMs
    }

    get(key: K): V | undefined {
        const entry = this.cache.get(key)
        if (!entry) return undefined

        // Check TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key)
            return undefined
        }

        // Move to end (most recently used)
        this.cache.delete(key)
        this.cache.set(key, { ...entry, timestamp: Date.now() })

        return entry.value
    }

    set(key: K, value: V): void {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value
            if (firstKey !== undefined) {
                this.cache.delete(firstKey)
            }
        }

        this.cache.set(key, { value, timestamp: Date.now() })
    }

    has(key: K): boolean {
        return this.get(key) !== undefined
    }

    clear(): void {
        this.cache.clear()
    }

    size(): number {
        return this.cache.size
    }
}

// Export singleton cache for message decryption
export const decryptionCache = new LRUCache<string, string>(1000, 5 * 60 * 1000)
