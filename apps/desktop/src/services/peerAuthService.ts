/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// SECURITY FIX V-006: Peer Authentication Service
// Provides cryptographic identity verification for P2P peers
// Uses ECDSA (P-256) for efficient signing and verification

export interface PeerIdentity {
    peerId: string
    publicKey: string // Base64 encoded SPKI public key
    displayName?: string
    createdAt: number
    verified: boolean
}

export interface SignedMessage {
    data: string // Base64 encoded data
    signature: string // Base64 encoded signature
    peerId: string
    timestamp: number
}

// Storage key for local identity
const IDENTITY_STORAGE_KEY = 'kalynt-peer-identity'

// Trusted peers cache (verified in current session)
const trustedPeers = new Map<string, PeerIdentity>()

// Room-specific peer registries
const roomPeers = new Map<string, Map<string, PeerIdentity>>()

// Local key pair (generated once, persisted)
let localKeyPair: CryptoKeyPair | null = null
let localPeerId: string | null = null
let localPublicKeyBase64: string | null = null

/**
 * Generate a unique peer ID from public key
 */
async function generatePeerIdFromKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    const hash = await crypto.subtle.digest('SHA-256', exported)
    const bytes = new Uint8Array(hash)
    // Use first 16 bytes as peer ID (128-bit identifier)
    return Array.from(bytes.slice(0, 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Generate ECDSA key pair for peer authentication
 * P-256 (secp256r1) is chosen for:
 * - Good security (128-bit equivalent)
 * - Fast signing/verification
 * - Small key and signature sizes
 * - Wide browser support
 */
async function generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        {
            name: 'ECDSA',
            namedCurve: 'P-256'
        },
        true, // Extractable for export/import
        ['sign', 'verify']
    )
}

/**
 * Export public key to Base64 (SPKI format)
 */
async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    return arrayBufferToBase64(exported)
}

/**
 * Export private key to Base64 (PKCS8 format)
 */
async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('pkcs8', privateKey)
    return arrayBufferToBase64(exported)
}

/**
 * Import public key from Base64
 */
async function importPublicKey(base64Key: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64Key)
    return crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
    )
}

/**
 * Import private key from Base64
 */
async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64Key)
    return crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
    )
}

/**
 * Sign data with local private key
 */
async function signData(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        data as BufferSource
    )
    return new Uint8Array(signature)
}

/**
 * Verify signature with public key
 */
async function verifySignature(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: CryptoKey
): Promise<boolean> {
    try {
        return await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            publicKey,
            signature as BufferSource,
            data as BufferSource
        )
    } catch (e) {
        console.error('[PeerAuth] Signature verification failed:', e)
        return false
    }
}

/**
 * Initialize local peer identity
 * Loads from storage or generates new identity
 */
export async function initializeLocalIdentity(): Promise<PeerIdentity> {
    // Try to load existing identity
    try {
        const stored = localStorage.getItem(IDENTITY_STORAGE_KEY)
        if (stored) {
            const { publicKey, privateKey, peerId } = JSON.parse(stored)
            const pubKey = await importPublicKey(publicKey)
            const privKey = await importPrivateKey(privateKey)
            localKeyPair = { publicKey: pubKey, privateKey: privKey }
            localPeerId = peerId
            localPublicKeyBase64 = publicKey
            console.log('[PeerAuth] Loaded existing identity:', peerId.substring(0, 8) + '...')
            return {
                peerId,
                publicKey,
                createdAt: Date.now(),
                verified: true
            }
        }
    } catch (e) {
        console.warn('[PeerAuth] Failed to load stored identity, generating new one:', e)
    }

    // Generate new identity
    localKeyPair = await generateKeyPair()
    localPeerId = await generatePeerIdFromKey(localKeyPair.publicKey)
    localPublicKeyBase64 = await exportPublicKey(localKeyPair.publicKey)

    // Store for persistence
    const exportedPrivate = await exportPrivateKey(localKeyPair.privateKey)
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({
        publicKey: localPublicKeyBase64,
        privateKey: exportedPrivate,
        peerId: localPeerId
    }))

    console.log('[PeerAuth] Generated new identity:', localPeerId.substring(0, 8) + '...')

    return {
        peerId: localPeerId,
        publicKey: localPublicKeyBase64,
        createdAt: Date.now(),
        verified: true
    }
}

/**
 * Get local peer identity (must call initializeLocalIdentity first)
 */
export function getLocalIdentity(): PeerIdentity | null {
    if (!localPeerId || !localPublicKeyBase64) return null
    return {
        peerId: localPeerId,
        publicKey: localPublicKeyBase64,
        createdAt: Date.now(),
        verified: true
    }
}

/**
 * Get local peer ID
 */
export function getLocalPeerId(): string | null {
    return localPeerId
}

/**
 * Sign a message for broadcast
 */
export async function signMessage(data: Uint8Array): Promise<SignedMessage | null> {
    if (!localKeyPair || !localPeerId) {
        console.error('[PeerAuth] Local identity not initialized')
        return null
    }

    const signature = await signData(data, localKeyPair.privateKey)

    return {
        data: arrayBufferToBase64(data.buffer as ArrayBuffer),
        signature: arrayBufferToBase64(signature.buffer as ArrayBuffer),
        peerId: localPeerId,
        timestamp: Date.now()
    }
}

/**
 * Verify and extract message from signed payload
 */
export async function verifyMessage(
    signedMessage: SignedMessage,
    roomId?: string
): Promise<{ valid: boolean; data: Uint8Array | null; peerId: string }> {
    const { data, signature, peerId, timestamp } = signedMessage

    // Check timestamp freshness (reject messages older than 5 minutes)
    const MAX_AGE_MS = 5 * 60 * 1000
    if (Date.now() - timestamp > MAX_AGE_MS) {
        console.warn('[PeerAuth] Rejecting stale message from:', peerId.substring(0, 8))
        return { valid: false, data: null, peerId }
    }

    // Get peer's public key
    const peerIdentity = roomId
        ? roomPeers.get(roomId)?.get(peerId)
        : trustedPeers.get(peerId)

    if (!peerIdentity) {
        console.warn('[PeerAuth] Unknown peer:', peerId.substring(0, 8))
        return { valid: false, data: null, peerId }
    }

    try {
        const publicKey = await importPublicKey(peerIdentity.publicKey)
        const dataBytes = new Uint8Array(base64ToArrayBuffer(data))
        const signatureBytes = new Uint8Array(base64ToArrayBuffer(signature))

        const valid = await verifySignature(dataBytes, signatureBytes, publicKey)

        if (!valid) {
            console.warn('[PeerAuth] Invalid signature from:', peerId.substring(0, 8))
            return { valid: false, data: null, peerId }
        }

        return { valid: true, data: dataBytes, peerId }
    } catch (e) {
        console.error('[PeerAuth] Verification error:', e)
        return { valid: false, data: null, peerId }
    }
}

/**
 * Register a peer's identity for a room
 */
export async function registerPeer(
    roomId: string,
    peerId: string,
    publicKey: string,
    displayName?: string
): Promise<boolean> {
    // Validate public key format
    try {
        const key = await importPublicKey(publicKey)
        // Verify peer ID matches public key
        const expectedPeerId = await generatePeerIdFromKey(key)
        if (expectedPeerId !== peerId) {
            console.warn('[PeerAuth] Peer ID mismatch - possible spoofing attempt')
            return false
        }
    } catch (e) {
        console.error('[PeerAuth] Invalid public key format:', e)
        return false
    }

    // Add to room registry
    if (!roomPeers.has(roomId)) {
        roomPeers.set(roomId, new Map())
    }

    // Check if peer is already registered to avoid duplicate logs
    const existingPeer = roomPeers.get(roomId)!.get(peerId)
    if (existingPeer) {
        // Peer already registered, skip
        return true
    }

    const identity: PeerIdentity = {
        peerId,
        publicKey,
        displayName,
        createdAt: Date.now(),
        verified: true
    }

    roomPeers.get(roomId)!.set(peerId, identity)
    trustedPeers.set(peerId, identity)

    console.log('[PeerAuth] Registered peer:', peerId.substring(0, 8), 'for room:', roomId.substring(0, 8))
    return true
}

/**
 * Remove a peer from room registry
 */
export function unregisterPeer(roomId: string, peerId: string): void {
    roomPeers.get(roomId)?.delete(peerId)
    // Only remove from global trusted if not in any other room
    let inOtherRoom = false
    for (const [rid, peers] of roomPeers) {
        if (rid !== roomId && peers.has(peerId)) {
            inOtherRoom = true
            break
        }
    }
    if (!inOtherRoom) {
        trustedPeers.delete(peerId)
    }
}

/**
 * Get all peers in a room
 */
export function getRoomPeers(roomId: string): PeerIdentity[] {
    const peers = roomPeers.get(roomId)
    return peers ? Array.from(peers.values()) : []
}

/**
 * Check if a peer is known/trusted in a room
 */
export function isPeerTrusted(roomId: string, peerId: string): boolean {
    return roomPeers.get(roomId)?.has(peerId) || false
}

/**
 * Clean up room peer registry
 */
export function cleanupRoom(roomId: string): void {
    const peers = roomPeers.get(roomId)
    if (peers) {
        for (const peerId of peers.keys()) {
            unregisterPeer(roomId, peerId)
        }
        roomPeers.delete(roomId)
    }
}

/**
 * Create identity announcement message for broadcasting
 */
export function createIdentityAnnouncement(): {
    type: 'identity'
    peerId: string
    publicKey: string
    timestamp: number
} | null {
    if (!localPeerId || !localPublicKeyBase64) return null
    return {
        type: 'identity',
        peerId: localPeerId,
        publicKey: localPublicKeyBase64,
        timestamp: Date.now()
    }
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}
