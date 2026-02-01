/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Member Sync Service - P2P synchronization of member data via Yjs
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

// Types for awareness state
interface AwarenessState {
    user?: {
        id: string
        name: string
        role?: WorkspaceRole
    }
    moderation?: ModerationAction
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

    private processAction(spaceId: string, action: ModerationAction) {
        const store = useMemberStore.getState()

        // Execute action via sync service
        let success = false
        switch (action.type) {
            case 'kick':
                success = this.kickMember(spaceId, action.targetUserId)
                break
            case 'ban':
                success = this.banMember(spaceId, action.targetUserId, action.reason)
                break
            case 'unban':
                success = this.unbanMember(spaceId, action.targetUserId)
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
     * Initialize member sync for a space
     */
    initializeSpace(
        spaceId: string,
        doc: Y.Doc,
        awareness: Awareness,
        userId: string,
        displayName: string
    ): void {
        console.log('[MemberSync] Initializing for space:', spaceId)

        this.spaceDocs.set(spaceId, doc)
        this.spaceAwareness.set(spaceId, awareness)

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

        // Set owner if not set (first user becomes owner)
        if (!ownerRef.get('ownerId')) {
            doc.transact(() => {
                ownerRef.set('ownerId', userId)
            })
            console.log('[MemberSync] Set as owner:', userId)
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

        // Subscribe to member changes
        const memberObserver = () => {
            this.syncMembersToStore(spaceId, membersMap, bannedMap, ownerId || userId)
        }
        membersMap.observe(memberObserver)
        bannedMap.observe(memberObserver)

        // Subscribe to awareness for moderation actions
        const awarenessHandler = ({ added, updated }: { added: number[], updated: number[], removed: number[] }) => {
            const states = awareness.getStates() as Map<number, AwarenessState>

            for (const clientId of [...added, ...updated]) {
                const state = states.get(clientId)
                if (state?.moderation) {
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
     */
    kickMember(spaceId: string, targetUserId: string): boolean {
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

        awareness.setLocalStateField('moderation', kickAction)

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
        }, 1000)

        console.log('[MemberSync] Kicked member:', targetUserId)
        return true
    }

    /**
     * Ban a member (broadcast via awareness + persist)
     */
    banMember(spaceId: string, targetUserId: string, reason?: string): boolean {
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

        awareness.setLocalStateField('moderation', banAction)

        // Clear moderation field after broadcast
        setTimeout(() => {
            awareness.setLocalStateField('moderation', null)
        }, 1000)

        console.log('[MemberSync] Banned member:', targetUserId, reason)
        return true
    }

    /**
     * Unban a member
     */
    unbanMember(spaceId: string, targetUserId: string): boolean {
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
            awareness.setLocalStateField('moderation', unbanAction)
            setTimeout(() => {
                awareness.setLocalStateField('moderation', null)
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
     */
    cleanup(spaceId: string): void {
        const unsubscribe = this.unsubscribers.get(spaceId)
        if (unsubscribe) {
            unsubscribe()
            this.unsubscribers.delete(spaceId)
        }

        this.spaceDocs.delete(spaceId)
        this.spaceAwareness.delete(spaceId)

        console.log('[MemberSync] Cleaned up:', spaceId)
    }
}

export const memberSyncService = new MemberSyncService()
