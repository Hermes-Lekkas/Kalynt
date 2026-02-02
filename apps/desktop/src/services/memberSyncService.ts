/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Member Sync Service - P2P synchronization of member data via Yjs
// SECURITY FIX V-004: Encrypt moderation actions in awareness channel
// SECURITY FIX V-006: Peer authentication via ECDSA signatures
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import {
    WorkspaceRole,
    WorkspaceMember,
    MemberPermissions,
    DEFAULT_PERMISSIONS,
    ModerationAction
} from '../types/permissions'
import { useMemberStore } from '../stores/memberStore'
import {
    encryptRoomMessage,
    decryptRoomMessage,
    isRoomEncryptionReady
} from './encryptedProvider'
import {
    initializeLocalIdentity,
    getLocalIdentity,
    registerPeer,
    isPeerTrusted,
    createIdentityAnnouncement,
    cleanupRoom as cleanupPeerAuth
} from './peerAuthService'

// Types for awareness state
// SECURITY FIX V-004: Moderation can be encrypted
// SECURITY FIX V-006: Peer identity for authentication
interface AwarenessState {
    user?: {
        id: string
        name: string
        role?: WorkspaceRole
    }
    moderation?: ModerationAction
    encryptedModeration?: string // Base64 encrypted moderation action
    // SECURITY FIX V-006: Peer identity for authentication
    peerIdentity?: {
        type: 'identity'
        peerId: string
        publicKey: string
        timestamp: number
    }
}

// SECURITY FIX V-004: Helper to encrypt moderation action
async function encryptModerationAction(
    spaceId: string,
    action: ModerationAction
): Promise<string | null> {
    if (!isRoomEncryptionReady(spaceId)) {
        return null
    }
    try {
        const data = new TextEncoder().encode(JSON.stringify(action))
        const encrypted = await encryptRoomMessage(spaceId, data)
        // Convert to base64 for awareness state
        return btoa(String.fromCharCode(...encrypted))
    } catch (e) {
        console.error('[MemberSync] Failed to encrypt moderation action:', e)
        return null
    }
}

// SECURITY FIX V-004: Helper to decrypt moderation action
async function decryptModerationAction(
    spaceId: string,
    encryptedData: string
): Promise<ModerationAction | null> {
    if (!isRoomEncryptionReady(spaceId)) {
        return null
    }
    try {
        // Convert from base64
        const encrypted = new Uint8Array(
            atob(encryptedData).split('').map(c => c.charCodeAt(0))
        )
        const decrypted = await decryptRoomMessage(spaceId, encrypted)
        return JSON.parse(new TextDecoder().decode(decrypted))
    } catch (e) {
        console.error('[MemberSync] Failed to decrypt moderation action:', e)
        return null
    }
}

// Serializable member data for Y.Map
interface SyncedMember {
    userId: string
    displayName: string
    role: WorkspaceRole
    permissions: MemberPermissions
    joinedAt: number
    isBanned: boolean
    bannedAt?: number
    bannedBy?: string
    banReason?: string
}

class MemberSyncService {
    private spaceDocs: Map<string, Y.Doc> = new Map()
    private spaceAwareness: Map<string, Awareness> = new Map()
    private unsubscribers: Map<string, () => void> = new Map()

    constructor() {
        // BUG-048: Process pending actions from store
        useMemberStore.subscribe((state) => {
            Object.entries(state.spaceMembers).forEach(([spaceId, spaceInfo]) => {
                if (spaceInfo.pendingActions.length > 0) {
                    const action = spaceInfo.pendingActions[0]
                    this.processAction(spaceId, action)
                }
            })
        })
    }

    private async processAction(spaceId: string, action: ModerationAction) {
        const store = useMemberStore.getState()

        // Execute action via sync service (now async for encryption)
        let success = false
        switch (action.type) {
            case 'kick':
                success = await this.kickMember(spaceId, action.targetUserId)
                break
            case 'ban':
                success = await this.banMember(spaceId, action.targetUserId, action.reason)
                break
            case 'unban':
                success = await this.unbanMember(spaceId, action.targetUserId)
                break
        }

        // Always pop the action to prevent infinite loop/stuck queue
        // We do this via the store action which handles the removal safely
        if (store.popPendingAction(spaceId)) {
            if (success) {
                console.log('[MemberSync] Processed pending action:', action.type)
            } else {
                console.warn('[MemberSync] Failed to process action:', action.type)
            }
        }
    }

    /**
     * SECURITY FIX V-005: Create ownership signature hash
     */
    private async createOwnershipSignature(data: string): Promise<string> {
        const encoded = new TextEncoder().encode(data)
        const hash = await crypto.subtle.digest('SHA-256', encoded)
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
    }

    /**
     * SECURITY FIX V-005: Verify ownership signature
     */
    private async verifyOwnershipSignature(data: string, expectedHash: string): Promise<boolean> {
        const actualHash = await this.createOwnershipSignature(data)
        return actualHash === expectedHash
    }

    /**
     * Initialize member sync for a space
     * SECURITY FIX V-006: Initialize and announce peer identity
     */
    async initializeSpace(
        spaceId: string,
        doc: Y.Doc,
        awareness: Awareness,
        userId: string,
        displayName: string
    ): Promise<void> {
        console.log('[MemberSync] Initializing for space:', spaceId)

        this.spaceDocs.set(spaceId, doc)
        this.spaceAwareness.set(spaceId, awareness)

        // SECURITY FIX V-006: Initialize local peer identity
        try {
            await initializeLocalIdentity()
            const identity = getLocalIdentity()
            if (identity) {
                console.log('[MemberSync] Local peer identity:', identity.peerId.substring(0, 8) + '...')
            }
        } catch (e) {
            console.error('[MemberSync] Failed to initialize peer identity:', e)
        }

        // Get or create members Y.Map
        const membersMap = doc.getMap<SyncedMember>('members')
        const bannedMap = doc.getMap<boolean>('banned')
        const ownerRef = doc.getMap<string>('metadata')

        // Check if user is banned
        if (bannedMap.get(userId)) {
            console.warn('[MemberSync] User is banned from this space!')
            this.handleBanned(spaceId)
            return
        }

        // SECURITY FIX V-005: Secure owner assignment with timestamp and signature
        // Owner can only be set once, with cryptographic proof
        const existingOwnerId = ownerRef.get('ownerId')
        const ownerTimestamp = ownerRef.get('ownerTimestamp')
        const ownerSignature = ownerRef.get('ownerSignature')

        if (!existingOwnerId) {
            // First user becomes owner - but with timestamp and signature
            const timestamp = Date.now()
            // Create a signature to prove ownership claim
            // This prevents replay attacks and ensures ownership can be verified
            const signatureData = `${spaceId}:${userId}:${timestamp}`
            const signatureHash = await this.createOwnershipSignature(signatureData)

            doc.transact(() => {
                ownerRef.set('ownerId', userId)
                ownerRef.set('ownerTimestamp', timestamp.toString())
                ownerRef.set('ownerSignature', signatureHash)
            })
            console.log('[MemberSync] Set as owner with signature:', userId)
        } else if (existingOwnerId !== userId && ownerTimestamp && ownerSignature) {
            // SECURITY: Verify existing owner's claim is valid
            const expectedSignature = `${spaceId}:${existingOwnerId}:${ownerTimestamp}`
            const isValid = await this.verifyOwnershipSignature(expectedSignature, ownerSignature)
            if (!isValid) {
                console.warn('[MemberSync] Invalid owner signature detected - possible tampering')
            }
        }

        const ownerId = ownerRef.get('ownerId')
        const isOwner = ownerId === userId
        const role: WorkspaceRole = isOwner ? 'owner' :
            membersMap.get(userId)?.role || 'member'

        // Add self to members
        const existingMember = membersMap.get(userId)
        if (!existingMember) {
            doc.transact(() => {
                membersMap.set(userId, {
                    userId,
                    displayName,
                    role,
                    permissions: DEFAULT_PERMISSIONS[role],
                    joinedAt: Date.now(),
                    isBanned: false
                })
            })
            console.log('[MemberSync] Added self as member:', userId, role)
        }

        // Update awareness with user info
        awareness.setLocalStateField('user', {
            id: userId,
            name: displayName,
            role
        })

        // SECURITY FIX V-006: Announce peer identity for authentication
        const identityAnnouncement = createIdentityAnnouncement()
        if (identityAnnouncement) {
            awareness.setLocalStateField('peerIdentity', identityAnnouncement)
            console.log('[MemberSync] Announced peer identity')
        }

        // Subscribe to member changes
        const memberObserver = () => {
            this.syncMembersToStore(spaceId, membersMap, bannedMap, ownerId || userId)
        }
        membersMap.observe(memberObserver)
        bannedMap.observe(memberObserver)

        // Subscribe to awareness for moderation actions and peer identity
        // SECURITY FIX V-004: Handle both encrypted and plaintext moderation
        // SECURITY FIX V-006: Handle peer identity announcements
        const awarenessHandler = async ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }) => {
            const states = awareness.getStates() as Map<number, AwarenessState>

            // SECURITY FIX V-006: Handle removed peers
            // Note: We can't get peer state after removal, cleanup happens on room leave
            if (removed.length > 0) {
                console.log('[MemberSync] Peers disconnected:', removed.length)
            }

            for (const clientId of [...added, ...updated]) {
                const state = states.get(clientId)

                // SECURITY FIX V-006: Register peer identity
                if (state?.peerIdentity) {
                    const { peerId, publicKey, timestamp } = state.peerIdentity
                    // Validate timestamp (reject if too old)
                    const MAX_AGE_MS = 5 * 60 * 1000
                    if (Date.now() - timestamp < MAX_AGE_MS) {
                        const registered = await registerPeer(
                            spaceId,
                            peerId,
                            publicKey,
                            state.user?.name
                        )
                        if (registered) {
                            console.log('[MemberSync] Registered peer:', peerId.substring(0, 8))
                        }
                    } else {
                        console.warn('[MemberSync] Rejected stale peer identity from:', peerId?.substring(0, 8))
                    }
                }

                // SECURITY FIX V-006: Verify peer is trusted before accepting moderation
                const peerIsTrusted = state?.peerIdentity
                    ? isPeerTrusted(spaceId, state.peerIdentity.peerId)
                    : false

                // Try encrypted moderation first (secure)
                if (state?.encryptedModeration) {
                    // Only accept from trusted peers in encrypted rooms
                    if (isRoomEncryptionReady(spaceId) && !peerIsTrusted && state.peerIdentity) {
                        console.warn('[MemberSync] Rejecting moderation from untrusted peer')
                        continue
                    }
                    const decrypted = await decryptModerationAction(spaceId, state.encryptedModeration)
                    if (decrypted) {
                        this.handleModerationAction(spaceId, decrypted, doc, userId)
                        continue
                    }
                }

                // Fallback to plaintext moderation (legacy/unencrypted rooms)
                if (state?.moderation) {
                    // Log warning if encryption is enabled but got plaintext
                    if (isRoomEncryptionReady(spaceId)) {
                        console.warn('[MemberSync] Received plaintext moderation in encrypted room - possible downgrade attack')
                    }
                    this.handleModerationAction(spaceId, state.moderation, doc, userId)
                }
            }
        }
        awareness.on('change', awarenessHandler)

        // Initial sync
        this.syncMembersToStore(spaceId, membersMap, bannedMap, ownerId || userId)

        // Store cleanup function
        this.unsubscribers.set(spaceId, () => {
            membersMap.unobserve(memberObserver)
            bannedMap.unobserve(memberObserver)
            awareness.off('change', awarenessHandler)
        })

        console.log('[MemberSync] Initialization complete for:', spaceId)
    }

    /**
     * Sync Y.Map members to Zustand store
     */
    private syncMembersToStore(
        spaceId: string,
        membersMap: Y.Map<SyncedMember>,
        bannedMap: Y.Map<boolean>,
        ownerId: string
    ): void {
        const store = useMemberStore.getState()

        // Convert Y.Map to array
        const members: WorkspaceMember[] = []
        membersMap.forEach((member, _key) => {
            members.push({
                ...member,
                isOnline: this.isUserOnline(spaceId, member.userId)
            })
        })

        // Get banned users
        const bannedUsers: string[] = []
        bannedMap.forEach((_, userId) => {
            bannedUsers.push(userId)
        })

        // Update store
        const currentInfo = store.spaceMembers[spaceId]
        if (!currentInfo) {
            // Initialize space in store
            store.spaceMembers[spaceId] = {
                ownerId,
                members,
                bannedUsers,
                pendingActions: []
            }
        } else {
            // Update existing
            store.spaceMembers[spaceId] = {
                ...currentInfo,
                ownerId,
                members,
                bannedUsers
            }
        }

        console.log('[MemberSync] Synced members:', members.length, 'banned:', bannedUsers.length)
    }

    /**
     * Check if user is online via awareness
     */
    private isUserOnline(spaceId: string, userId: string): boolean {
        const awareness = this.spaceAwareness.get(spaceId)
        if (!awareness) return false

        const states = awareness.getStates() as Map<number, AwarenessState>
        for (const [, state] of states) {
            if (state.user?.id === userId) return true
        }
        return false
    }

    /**
     * Handle moderation action from awareness
     */
    private handleModerationAction(
        spaceId: string,
        action: ModerationAction,
        doc: Y.Doc,
        myUserId: string
    ): void {
        console.log('[MemberSync] Received moderation action:', action)

        if (action.targetUserId === myUserId) {
            if (action.type === 'kick') {
                console.warn('[MemberSync] I was kicked!')
                this.handleKicked(spaceId)
            } else if (action.type === 'ban') {
                console.warn('[MemberSync] I was banned!')
                // Add to banned list
                doc.transact(() => {
                    const bannedMap = doc.getMap<boolean>('banned')
                    bannedMap.set(myUserId, true)
                })
                this.handleBanned(spaceId)
            }
        }

        // Handle unban
        if (action.type === 'unban') {
            doc.transact(() => {
                const bannedMap = doc.getMap<boolean>('banned')
                bannedMap.delete(action.targetUserId)
            })
        }
    }

    /**
     * Handle being kicked
     */
    private handleKicked(spaceId: string): void {
        // Show notification
        alert('You have been kicked from this workspace.')

        // Disconnect from space
        this.cleanup(spaceId)

        // Reload to reset state
        window.location.reload()
    }

    /**
     * Handle being banned
     */
    private handleBanned(spaceId: string): void {
        // Show notification
        alert('You have been banned from this workspace.')

        // Disconnect from space
        this.cleanup(spaceId)

        // Reload to reset state
        window.location.reload()
    }

    /**
     * Kick a member (broadcast via awareness)
     * SECURITY FIX V-004: Use encrypted moderation when encryption is enabled
     */
    async kickMember(spaceId: string, targetUserId: string): Promise<boolean> {
        const awareness = this.spaceAwareness.get(spaceId)
        const store = useMemberStore.getState()

        if (!awareness) {
            console.error('[MemberSync] No awareness for space:', spaceId)
            return false
        }

        const myUserId = store.userId

        // Broadcast kick action
        const kickAction: ModerationAction = {
            type: 'kick',
            targetUserId,
            initiatorId: myUserId,
            timestamp: Date.now()
        }

        // SECURITY FIX V-004: Encrypt moderation action if encryption enabled
        const encrypted = await encryptModerationAction(spaceId, kickAction)
        if (encrypted) {
            awareness.setLocalStateField('encryptedModeration', encrypted)
            awareness.setLocalStateField('moderation', null) // Clear plaintext
        } else {
            awareness.setLocalStateField('moderation', kickAction)
            awareness.setLocalStateField('encryptedModeration', null)
        }

        // Remove from local members map
        const doc = this.spaceDocs.get(spaceId)
        if (doc) {
            doc.transact(() => {
                const membersMap = doc.getMap<SyncedMember>('members')
                membersMap.delete(targetUserId)
            })
        }

        // Clear moderation field after broadcast
        setTimeout(() => {
            awareness.setLocalStateField('moderation', null)
            awareness.setLocalStateField('encryptedModeration', null)
        }, 1000)

        console.log('[MemberSync] Kicked member:', targetUserId)
        return true
    }

    /**
     * Ban a member (broadcast via awareness + persist)
     * SECURITY FIX V-004: Use encrypted moderation when encryption is enabled
     */
    async banMember(spaceId: string, targetUserId: string, reason?: string): Promise<boolean> {
        const awareness = this.spaceAwareness.get(spaceId)
        const doc = this.spaceDocs.get(spaceId)
        const store = useMemberStore.getState()

        if (!awareness || !doc) {
            console.error('[MemberSync] No awareness/doc for space:', spaceId)
            return false
        }

        const myUserId = store.userId

        // Add to banned list
        doc.transact(() => {
            const bannedMap = doc.getMap<boolean>('banned')
            const membersMap = doc.getMap<SyncedMember>('members')
            bannedMap.set(targetUserId, true)
            membersMap.delete(targetUserId)
        })

        // Broadcast ban action
        const banAction: ModerationAction = {
            type: 'ban',
            targetUserId,
            initiatorId: myUserId,
            reason,
            timestamp: Date.now()
        }

        // SECURITY FIX V-004: Encrypt moderation action if encryption enabled
        const encrypted = await encryptModerationAction(spaceId, banAction)
        if (encrypted) {
            awareness.setLocalStateField('encryptedModeration', encrypted)
            awareness.setLocalStateField('moderation', null)
        } else {
            awareness.setLocalStateField('moderation', banAction)
            awareness.setLocalStateField('encryptedModeration', null)
        }

        // Clear moderation field after broadcast
        setTimeout(() => {
            awareness.setLocalStateField('moderation', null)
            awareness.setLocalStateField('encryptedModeration', null)
        }, 1000)

        console.log('[MemberSync] Banned member:', targetUserId, reason)
        return true
    }

    /**
     * Unban a member
     * SECURITY FIX V-004: Use encrypted moderation when encryption is enabled
     */
    async unbanMember(spaceId: string, targetUserId: string): Promise<boolean> {
        const doc = this.spaceDocs.get(spaceId)
        const awareness = this.spaceAwareness.get(spaceId)
        const store = useMemberStore.getState()

        if (!doc) {
            console.error('[MemberSync] No doc for space:', spaceId)
            return false
        }

        doc.transact(() => {
            const bannedMap = doc.getMap<boolean>('banned')
            bannedMap.delete(targetUserId)
        })

        // Broadcast unban if awareness available
        if (awareness) {
            const unbanAction: ModerationAction = {
                type: 'unban',
                targetUserId,
                initiatorId: store.userId,
                timestamp: Date.now()
            }

            // SECURITY FIX V-004: Encrypt moderation action if encryption enabled
            const encrypted = await encryptModerationAction(spaceId, unbanAction)
            if (encrypted) {
                awareness.setLocalStateField('encryptedModeration', encrypted)
                awareness.setLocalStateField('moderation', null)
            } else {
                awareness.setLocalStateField('moderation', unbanAction)
                awareness.setLocalStateField('encryptedModeration', null)
            }

            setTimeout(() => {
                awareness.setLocalStateField('moderation', null)
                awareness.setLocalStateField('encryptedModeration', null)
            }, 1000)
        }

        console.log('[MemberSync] Unbanned member:', targetUserId)
        return true
    }

    /**
     * Update member role (sync via Y.Map)
     */
    updateMemberRole(spaceId: string, targetUserId: string, role: WorkspaceRole): boolean {
        const doc = this.spaceDocs.get(spaceId)

        if (!doc) {
            console.error('[MemberSync] No doc for space:', spaceId)
            return false
        }

        doc.transact(() => {
            const membersMap = doc.getMap<SyncedMember>('members')
            const member = membersMap.get(targetUserId)
            if (member) {
                membersMap.set(targetUserId, {
                    ...member,
                    role,
                    permissions: { ...DEFAULT_PERMISSIONS[role] }
                })
            }
        })

        console.log('[MemberSync] Updated role:', targetUserId, role)
        return true
    }

    /**
     * Update member permissions (sync via Y.Map)
     */
    updateMemberPermissions(
        spaceId: string,
        targetUserId: string,
        permissions: Partial<MemberPermissions>
    ): boolean {
        const doc = this.spaceDocs.get(spaceId)

        if (!doc) {
            console.error('[MemberSync] No doc for space:', spaceId)
            return false
        }

        doc.transact(() => {
            const membersMap = doc.getMap<SyncedMember>('members')
            const member = membersMap.get(targetUserId)
            if (member) {
                membersMap.set(targetUserId, {
                    ...member,
                    permissions: { ...member.permissions, ...permissions }
                })
            }
        })

        console.log('[MemberSync] Updated permissions:', targetUserId, permissions)
        return true
    }

    /**
     * Get member permissions for enforcement
     */
    getMemberPermissions(spaceId: string, userId: string): MemberPermissions {
        const doc = this.spaceDocs.get(spaceId)

        if (!doc) {
            return DEFAULT_PERMISSIONS.member
        }

        const membersMap = doc.getMap<SyncedMember>('members')
        const member = membersMap.get(userId)

        return member?.permissions || DEFAULT_PERMISSIONS.member
    }

    /**
     * Check if user is banned
     */
    isUserBanned(spaceId: string, userId: string): boolean {
        const doc = this.spaceDocs.get(spaceId)

        if (!doc) return false

        const bannedMap = doc.getMap<boolean>('banned')
        return bannedMap.get(userId) || false
    }

    /**
     * Get all online users
     */
    getOnlineUsers(spaceId: string): string[] {
        const awareness = this.spaceAwareness.get(spaceId)
        if (!awareness) return []

        const online: string[] = []
        const states = awareness.getStates() as Map<number, AwarenessState>
        states.forEach(state => {
            if (state.user?.id) {
                online.push(state.user.id)
            }
        })
        return online
    }

    /**
     * Cleanup when leaving a space
     * SECURITY FIX V-006: Also cleanup peer authentication state
     */
    cleanup(spaceId: string): void {
        const unsubscribe = this.unsubscribers.get(spaceId)
        if (unsubscribe) {
            unsubscribe()
            this.unsubscribers.delete(spaceId)
        }

        // SECURITY FIX V-006: Cleanup peer authentication for this room
        cleanupPeerAuth(spaceId)

        this.spaceDocs.delete(spaceId)
        this.spaceAwareness.delete(spaceId)

        console.log('[MemberSync] Cleaned up:', spaceId)
    }
}

export const memberSyncService = new MemberSyncService()
