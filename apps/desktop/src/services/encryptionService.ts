/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Encryption Service - E2E encryption for P2P communication
// Uses Web Crypto API for browser-native encryption

export interface EncryptedPayload {
    iv: string // Base64 initialization vector
    data: string // Base64 encrypted data
    // Note: For AES-GCM, the authentication tag is embedded in the ciphertext
    // returned by crypto.subtle.encrypt, so we don't need a separate tag field
}

export interface KeyPair {
    publicKey: CryptoKey
    privateKey: CryptoKey
}

export interface EncryptionConfig {
    algorithm: 'AES-GCM' | 'AES-CBC'
    keyLength: 128 | 256
    pbkdf2Iterations: number
}

const DEFAULT_CONFIG: EncryptionConfig = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    pbkdf2Iterations: 100000
}

// Maximum number of room keys to keep in memory (LRU eviction)
const MAX_ROOM_KEYS = 50
// SECURITY FIX V-008: Key expiration timeout (10 minutes of inactivity)
const KEY_EXPIRATION_MS = 10 * 60 * 1000

class EncryptionService {
    private config: EncryptionConfig = DEFAULT_CONFIG
    private roomKeys: Map<string, CryptoKey> = new Map()
    private keyAccessOrder: string[] = [] // Track access order for LRU eviction
    // SECURITY FIX V-008: Track last access time for expiration
    private keyAccessTimes: Map<string, number> = new Map()
    private cleanupInterval: ReturnType<typeof setInterval> | null = null

    constructor() {
        // SECURITY FIX V-008: Start background key expiration check
        this.startKeyExpirationCheck()
    }

    /**
     * SECURITY FIX V-008: Background check for expired keys
     */
    private startKeyExpirationCheck(): void {
        if (this.cleanupInterval) return

        this.cleanupInterval = setInterval(() => {
            this.clearExpiredKeys()
        }, 60 * 1000) // Check every minute
    }

    /**
     * SECURITY FIX V-008: Clear keys that haven't been accessed recently
     */
    clearExpiredKeys(): number {
        const now = Date.now()
        let expiredCount = 0

        for (const [roomId, lastAccess] of this.keyAccessTimes) {
            if (now - lastAccess > KEY_EXPIRATION_MS) {
                this.roomKeys.delete(roomId)
                this.roomSalts.delete(roomId)
                this.keyAccessTimes.delete(roomId)
                this.keyAccessOrder = this.keyAccessOrder.filter(id => id !== roomId)
                expiredCount++
                console.log(`[Encryption] Expired key for room ${roomId} (inactive)`)
            }
        }

        return expiredCount
    }

    setConfig(config: Partial<EncryptionConfig>) {
        this.config = { ...this.config, ...config }
    }

    // Generate a random encryption key
    // Note: extractable is set to false for security - keys cannot be exported from JS context
    async generateKey(): Promise<CryptoKey> {
        return crypto.subtle.generateKey(
            {
                name: this.config.algorithm,
                length: this.config.keyLength
            },
            false, // NOT extractable - keys stay in CryptoKey form only
            ['encrypt', 'decrypt']
        )
    }

    // Derive key from password (for room passwords)
    async deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array }> {
        const useSalt = salt || crypto.getRandomValues(new Uint8Array(16))

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        )

        // Derive actual key
        // Note: extractable is false for security - derived keys cannot be exported
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: useSalt as BufferSource,
                iterations: this.config.pbkdf2Iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: this.config.algorithm, length: this.config.keyLength } as AesDerivedKeyParams,
            false, // NOT extractable for better security
            ['encrypt', 'decrypt'] as KeyUsage[]
        )

        return { key, salt: useSalt }
    }

    // Generate RSA key pair for peer-to-peer key exchange
    async generateKeyPair(): Promise<KeyPair> {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        )

        return {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey
        }
    }

    // Export public key for sharing
    async exportPublicKey(publicKey: CryptoKey): Promise<string> {
        const exported = await crypto.subtle.exportKey('spki', publicKey)
        return this.arrayBufferToBase64(exported)
    }

    // Import public key from peer
    async importPublicKey(base64Key: string): Promise<CryptoKey> {
        const keyData = this.base64ToArrayBuffer(base64Key)
        return crypto.subtle.importKey(
            'spki',
            keyData,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt']
        )
    }

    // Encrypt session key with peer's public key
    async encryptSessionKey(sessionKey: CryptoKey, peerPublicKey: CryptoKey): Promise<string> {
        const rawKey = await crypto.subtle.exportKey('raw', sessionKey)
        const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            peerPublicKey,
            rawKey
        )
        return this.arrayBufferToBase64(encrypted)
    }

    // Decrypt session key with our private key
    async decryptSessionKey(encryptedKey: string, privateKey: CryptoKey): Promise<CryptoKey> {
        const keyData = this.base64ToArrayBuffer(encryptedKey)
        const rawKey = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            privateKey,
            keyData
        )
        return crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: this.config.algorithm, length: this.config.keyLength },
            true,
            ['encrypt', 'decrypt']
        )
    }

    // Encrypt data
    async encrypt(data: string | Uint8Array, key: CryptoKey): Promise<EncryptedPayload> {
        const iv = crypto.getRandomValues(new Uint8Array(12)) // GCM uses 12 bytes
        const encodedData = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data

        const encrypted = await crypto.subtle.encrypt(
            { name: this.config.algorithm, iv: iv as BufferSource },
            key,
            encodedData as BufferSource
        )

        return {
            iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
            data: this.arrayBufferToBase64(encrypted)
        }
    }

    // Decrypt data
    async decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<Uint8Array> {
        const iv = this.base64ToArrayBuffer(payload.iv)
        const data = this.base64ToArrayBuffer(payload.data)

        const decrypted = await crypto.subtle.decrypt(
            { name: this.config.algorithm, iv: new Uint8Array(iv) },
            key,
            data
        )

        return new Uint8Array(decrypted)
    }

    // Decrypt to string
    async decryptToString(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
        const decrypted = await this.decrypt(payload, key)
        return new TextDecoder().decode(decrypted)
    }

    // SECURITY FIX V-003: Store salts for proper key derivation
    private roomSalts: Map<string, Uint8Array> = new Map()

    // Room key management with LRU eviction
    // SECURITY FIX V-003: Use random salt combined with roomId hash for proper entropy
    async setRoomKey(roomId: string, password: string, existingSalt?: Uint8Array): Promise<Uint8Array> {
        // Evict oldest keys if at capacity
        while (this.roomKeys.size >= MAX_ROOM_KEYS && this.keyAccessOrder.length > 0) {
            const oldestRoomId = this.keyAccessOrder.shift()
            if (oldestRoomId) {
                this.roomKeys.delete(oldestRoomId)
                this.roomSalts.delete(oldestRoomId)
                console.log(`[Encryption] Evicted key for room ${oldestRoomId} (LRU)`)
            }
        }

        // SECURITY FIX V-003: Generate random salt or use existing
        // Salt = random bytes XOR'd with roomId hash for uniqueness
        let salt: Uint8Array
        if (existingSalt && existingSalt.length === 16) {
            salt = existingSalt
        } else {
            // Generate random 16-byte salt
            const randomSalt = crypto.getRandomValues(new Uint8Array(16))
            // Hash roomId to add deterministic component
            const roomIdHash = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(roomId)
            )
            const roomIdBytes = new Uint8Array(roomIdHash).slice(0, 16)
            // XOR random salt with roomId hash for final salt
            salt = new Uint8Array(16)
            for (let i = 0; i < 16; i++) {
                salt[i] = randomSalt[i] ^ roomIdBytes[i]
            }
        }

        const { key } = await this.deriveKeyFromPassword(password, salt)
        this.roomKeys.set(roomId, key)
        this.roomSalts.set(roomId, salt)

        // Update access order (most recently accessed at end)
        this.keyAccessOrder = this.keyAccessOrder.filter(id => id !== roomId)
        this.keyAccessOrder.push(roomId)
        // SECURITY FIX V-008: Track access time for expiration
        this.keyAccessTimes.set(roomId, Date.now())

        // Return salt so it can be stored/shared with room metadata
        return salt
    }

    // Get salt for a room (needed for sharing with peers)
    getRoomSalt(roomId: string): Uint8Array | undefined {
        return this.roomSalts.get(roomId)
    }

    // Set room key with known salt (when joining existing room)
    async setRoomKeyWithSalt(roomId: string, password: string, salt: Uint8Array): Promise<void> {
        await this.setRoomKey(roomId, password, salt)
    }

    getRoomKey(roomId: string): CryptoKey | undefined {
        // Update access order on read
        if (this.roomKeys.has(roomId)) {
            this.keyAccessOrder = this.keyAccessOrder.filter(id => id !== roomId)
            this.keyAccessOrder.push(roomId)
            // SECURITY FIX V-008: Update last access time
            this.keyAccessTimes.set(roomId, Date.now())
        }
        return this.roomKeys.get(roomId)
    }

    // Check if room key exists (useful for UI to decide whether to prompt password)
    hasRoomKey(roomId: string): boolean {
        return this.roomKeys.has(roomId)
    }

    removeRoomKey(roomId: string): void {
        this.roomKeys.delete(roomId)
        this.roomSalts.delete(roomId)
        this.keyAccessTimes.delete(roomId)
        this.keyAccessOrder = this.keyAccessOrder.filter(id => id !== roomId)
    }

    // Clear all room keys (for security, e.g., on logout or after inactivity)
    clearAllRoomKeys(): void {
        this.roomKeys.clear()
        this.roomSalts.clear()
        this.keyAccessTimes.clear()
        this.keyAccessOrder = []
    }

    // SECURITY FIX V-008: Stop background cleanup (call on app shutdown)
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
        this.clearAllRoomKeys()
    }

    // Encrypt for room
    async encryptForRoom(roomId: string, data: string): Promise<EncryptedPayload | null> {
        const key = this.roomKeys.get(roomId)
        if (!key) return null
        return this.encrypt(data, key)
    }

    // Decrypt from room
    async decryptFromRoom(roomId: string, payload: EncryptedPayload): Promise<string | null> {
        const key = this.roomKeys.get(roomId)
        if (!key) return null
        try {
            return await this.decryptToString(payload, key)
        } catch (e) {
            console.error('Decryption failed:', e)
            return null
        }
    }

    // Generate secure random ID
    generateSecureId(length: number = 32): string {
        const bytes = crypto.getRandomValues(new Uint8Array(length))
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    }

    // Hash data (for integrity verification)
    async hash(data: string | Uint8Array): Promise<string> {
        const encodedData = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data
        const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData as BufferSource)
        return this.arrayBufferToBase64(hashBuffer)
    }

    // Verify integrity
    async verifyHash(data: string | Uint8Array, expectedHash: string): Promise<boolean> {
        const actualHash = await this.hash(data)
        return actualHash === expectedHash
    }

    // Utility: ArrayBuffer to Base64
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    // Utility: Base64 to ArrayBuffer
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes.buffer
    }
}

// Singleton
export const encryptionService = new EncryptionService()
