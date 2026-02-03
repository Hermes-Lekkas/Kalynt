/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// SECURITY FIX V-007: Update Integrity Service
// Provides HMAC verification for Yjs updates to prevent tampering
// Uses HMAC-SHA256 for integrity verification

import { getLocalPeerId } from './peerAuthService'

// HMAC key derived from room encryption key
const roomHmacKeys = new Map<string, CryptoKey>()

// Update history for replay attack detection
const updateHistory = new Map<string, Set<string>>() // roomId -> Set<updateHash>

// Max history entries per room (to prevent memory bloat)
const MAX_HISTORY_SIZE = 10000

// Update source tracking for audit
export interface UpdateSource {
    peerId: string
    timestamp: number
    updateHash: string
    verified: boolean
}

const recentUpdates = new Map<string, UpdateSource[]>() // roomId -> sources

/**
 * Derive HMAC key from room encryption key
 * This ensures only peers with the correct room key can create valid HMACs
 */
export async function deriveHmacKey(
    roomId: string,
    encryptionKey: CryptoKey
): Promise<CryptoKey> {
    // Export encryption key to derive HMAC key
    const keyMaterial = await crypto.subtle.exportKey('raw', encryptionKey)

    // Derive HMAC key using HKDF
    const hmacKeyMaterial = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        'HKDF',
        false,
        ['deriveKey']
    )

    const hmacKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: new TextEncoder().encode(`kalynt-hmac-${roomId}`),
            info: new TextEncoder().encode('update-integrity'),
            hash: 'SHA-256'
        },
        hmacKeyMaterial,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    )

    roomHmacKeys.set(roomId, hmacKey)
    console.log('[Integrity] HMAC key derived for room:', roomId.substring(0, 8))
    return hmacKey
}

/**
 * Set HMAC key directly (when key is already available)
 */
export function setHmacKey(roomId: string, key: CryptoKey): void {
    roomHmacKeys.set(roomId, key)
}

/**
 * Initialize HMAC from password (standalone, without existing encryption key)
 */
export async function initializeFromPassword(
    roomId: string,
    password: string
): Promise<CryptoKey> {
    // Derive key material from password
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    )

    // Create unique salt for HMAC derivation
    const salt = new TextEncoder().encode(`kalynt-integrity-${roomId}`)

    // Derive HMAC key
    const hmacKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    )

    roomHmacKeys.set(roomId, hmacKey)
    updateHistory.set(roomId, new Set())
    recentUpdates.set(roomId, [])

    console.log('[Integrity] Initialized for room:', roomId.substring(0, 8))
    return hmacKey
}

/**
 * Create signed update with HMAC
 * Format: [timestamp (8 bytes)][peerId length (1 byte)][peerId][HMAC (32 bytes)][original update]
 */
export async function signUpdate(
    roomId: string,
    update: Uint8Array
): Promise<Uint8Array> {
    const hmacKey = roomHmacKeys.get(roomId)
    if (!hmacKey) {
        // No HMAC key - return unsigned update
        return update
    }

    const peerId = getLocalPeerId() || 'unknown'
    const peerIdBytes = new TextEncoder().encode(peerId)
    const timestamp = Date.now()

    // Create data to sign: timestamp + peerId + update
    const timestampBytes = new Uint8Array(8)
    const view = new DataView(timestampBytes.buffer)
    view.setBigUint64(0, BigInt(timestamp), false) // Big-endian

    const dataToSign = new Uint8Array(
        timestampBytes.length + peerIdBytes.length + update.length
    )
    dataToSign.set(timestampBytes, 0)
    dataToSign.set(peerIdBytes, timestampBytes.length)
    dataToSign.set(update, timestampBytes.length + peerIdBytes.length)

    // Generate HMAC
    const signature = await crypto.subtle.sign('HMAC', hmacKey, dataToSign)
    const hmacBytes = new Uint8Array(signature)

    // Build signed update
    // Format: [timestamp (8)][peerIdLength (1)][peerId (variable)][hmac (32)][update (variable)]
    const signedUpdate = new Uint8Array(
        8 + 1 + peerIdBytes.length + 32 + update.length
    )

    let offset = 0
    signedUpdate.set(timestampBytes, offset)
    offset += 8

    signedUpdate[offset] = peerIdBytes.length
    offset += 1

    signedUpdate.set(peerIdBytes, offset)
    offset += peerIdBytes.length

    signedUpdate.set(hmacBytes, offset)
    offset += 32

    signedUpdate.set(update, offset)

    return signedUpdate
}

/**
 * Verify and extract update from signed payload
 * Returns null if verification fails
 */
export async function verifyUpdate(
    roomId: string,
    signedUpdate: Uint8Array
): Promise<{
    update: Uint8Array
    peerId: string
    timestamp: number
    verified: boolean
} | null> {
    const hmacKey = roomHmacKeys.get(roomId)

    // Check minimum size (8 + 1 + 1 + 32 + 1 = 43 bytes minimum)
    if (signedUpdate.length < 43) {
        // Too small to be signed - treat as legacy unsigned update
        return {
            update: signedUpdate,
            peerId: 'unknown',
            timestamp: Date.now(),
            verified: false
        }
    }

    // Parse header
    let offset = 0

    // Timestamp (8 bytes)
    const timestampBytes = signedUpdate.slice(offset, offset + 8)
    const view = new DataView(timestampBytes.buffer)
    const timestamp = Number(view.getBigUint64(0, false))
    offset += 8

    // Peer ID length (1 byte)
    const peerIdLength = signedUpdate[offset]
    offset += 1

    // Validate peer ID length
    if (peerIdLength === 0 || peerIdLength > 64 || offset + peerIdLength + 32 > signedUpdate.length) {
        // Invalid format - treat as legacy unsigned
        return {
            update: signedUpdate,
            peerId: 'unknown',
            timestamp: Date.now(),
            verified: false
        }
    }

    // Peer ID
    const peerIdBytes = signedUpdate.slice(offset, offset + peerIdLength)
    const peerId = new TextDecoder().decode(peerIdBytes)
    offset += peerIdLength

    // HMAC (32 bytes)
    const receivedHmac = signedUpdate.slice(offset, offset + 32)
    offset += 32

    // Original update
    const update = signedUpdate.slice(offset)

    // If no HMAC key, return unverified
    if (!hmacKey) {
        console.warn('[Integrity] No HMAC key for room - accepting unverified update')
        return { update, peerId, timestamp, verified: false }
    }

    // Verify timestamp freshness (reject updates older than 5 minutes)
    const MAX_AGE_MS = 5 * 60 * 1000
    if (Date.now() - timestamp > MAX_AGE_MS) {
        console.warn('[Integrity] Rejecting stale update from:', peerId.substring(0, 8))
        return null
    }

    // Reconstruct signed data
    const dataToVerify = new Uint8Array(
        timestampBytes.length + peerIdBytes.length + update.length
    )
    dataToVerify.set(timestampBytes, 0)
    dataToVerify.set(peerIdBytes, timestampBytes.length)
    dataToVerify.set(update, timestampBytes.length + peerIdBytes.length)

    // Verify HMAC
    try {
        const valid = await crypto.subtle.verify(
            'HMAC',
            hmacKey,
            receivedHmac,
            dataToVerify
        )

        if (!valid) {
            console.warn('[Integrity] HMAC verification failed for update from:', peerId.substring(0, 8))
            return null
        }
    } catch (e) {
        console.error('[Integrity] HMAC verification error:', e)
        return null
    }

    // Check for replay attack
    const updateHash = await hashUpdate(update)
    const history = updateHistory.get(roomId)
    if (history) {
        if (history.has(updateHash)) {
            console.warn('[Integrity] Replay attack detected - duplicate update from:', peerId.substring(0, 8))
            return null
        }

        // Add to history (with size limit)
        if (history.size >= MAX_HISTORY_SIZE) {
            // Remove oldest entries (first 10%)
            const toRemove = Math.floor(MAX_HISTORY_SIZE * 0.1)
            const entries = Array.from(history)
            for (let i = 0; i < toRemove; i++) {
                history.delete(entries[i])
            }
        }
        history.add(updateHash)
    }

    // Log update source for audit
    logUpdateSource(roomId, {
        peerId,
        timestamp,
        updateHash,
        verified: true
    })

    return { update, peerId, timestamp, verified: true }
}

/**
 * Check if update has valid integrity format (without full verification)
 */
export function hasIntegrityHeader(data: Uint8Array): boolean {
    if (data.length < 43) return false

    // Check peer ID length is reasonable
    const peerIdLength = data[8]
    return peerIdLength > 0 && peerIdLength <= 64
}

/**
 * Hash update for replay detection
 */
async function hashUpdate(update: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', update as BufferSource)
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 32) // Truncate for memory efficiency
}

/**
 * Log update source for audit trail
 */
function logUpdateSource(roomId: string, source: UpdateSource): void {
    const sources = recentUpdates.get(roomId) || []

    // Keep last 100 updates
    if (sources.length >= 100) {
        sources.shift()
    }

    sources.push(source)
    recentUpdates.set(roomId, sources)
}

/**
 * Get recent update sources for audit
 */
export function getRecentUpdates(roomId: string): UpdateSource[] {
    return recentUpdates.get(roomId) || []
}

/**
 * Clean up room integrity state
 */
export function cleanupRoom(roomId: string): void {
    roomHmacKeys.delete(roomId)
    updateHistory.delete(roomId)
    recentUpdates.delete(roomId)
    console.log('[Integrity] Cleaned up room:', roomId.substring(0, 8))
}

/**
 * Check if integrity verification is enabled for a room
 */
export function isIntegrityEnabled(roomId: string): boolean {
    return roomHmacKeys.has(roomId)
}
