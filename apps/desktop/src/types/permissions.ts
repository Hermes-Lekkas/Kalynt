/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Permissions and Role Types for Workspace Access Control

/**
 * Available roles in a workspace
 */
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

/**
 * Permission flags for a member
 */
export interface MemberPermissions {
    canEdit: boolean           // Can edit documents
    canUseAgent: boolean       // Can use AI agent
    canChat: boolean           // Can send chat messages
    canManageTasks: boolean    // Can create/edit/delete tasks
    canManageFiles: boolean    // Can upload/delete files
    restrictedPaths: string[]  // Glob patterns for restricted files/folders
}

/**
 * Default permissions for each role
 */
export const DEFAULT_PERMISSIONS: Record<WorkspaceRole, MemberPermissions> = {
    owner: {
        canEdit: true,
        canUseAgent: true,
        canChat: true,
        canManageTasks: true,
        canManageFiles: true,
        restrictedPaths: []
    },
    admin: {
        canEdit: true,
        canUseAgent: true,
        canChat: true,
        canManageTasks: true,
        canManageFiles: true,
        restrictedPaths: []
    },
    member: {
        canEdit: true,
        canUseAgent: true,
        canChat: true,
        canManageTasks: true,
        canManageFiles: true,
        restrictedPaths: []
    },
    viewer: {
        canEdit: false,
        canUseAgent: false,
        canChat: true,  // Viewers can chat but not edit
        canManageTasks: false,
        canManageFiles: false,
        restrictedPaths: ['**/*']  // All paths restricted for editing
    }
}

/**
 * A member in a workspace
 */
export interface WorkspaceMember {
    userId: string              // Unique user identifier
    displayName: string         // Display name
    role: WorkspaceRole         // Current role
    permissions: MemberPermissions  // Custom permissions (overrides defaults)
    joinedAt: number            // When they joined
    isOnline: boolean           // Current online status
    isBanned: boolean           // Whether they're banned
    bannedAt?: number           // When they were banned
    bannedBy?: string           // Who banned them
    banReason?: string          // Reason for ban
}

/**
 * Role hierarchy for permission checks
 */
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1
}

/**
 * Check if a role can manage another role
 */
export function canManageRole(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
    // Owner can manage everyone
    if (managerRole === 'owner') return true
    // Admin can manage members and viewers, but not other admins or owner
    if (managerRole === 'admin') {
        return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY['admin']
    }
    return false
}

/**
 * Check if user can kick another user
 */
export function canKick(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
    return canManageRole(managerRole, targetRole) && targetRole !== 'owner'
}

/**
 * Check if user can ban another user
 */
export function canBan(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
    return canManageRole(managerRole, targetRole) && targetRole !== 'owner'
}

/**
 * Check if user can change permissions of another user
 */
export function canChangePermissions(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
    return canManageRole(managerRole, targetRole)
}

/**
 * Check if a path is restricted for a member
 */
export function isPathRestricted(path: string, permissions: MemberPermissions): boolean {
    if (permissions.restrictedPaths.length === 0) return false

    // Simple glob matching
    for (const pattern of permissions.restrictedPaths) {
        if (pattern === '**/*') return true  // All paths restricted
        if (pattern === path) return true
        // Basic wildcard support
        if (pattern.endsWith('/*') && path.startsWith(pattern.slice(0, -2))) return true
        if (pattern.startsWith('*.') && path.endsWith(pattern.slice(1))) return true
    }
    return false
}

/**
 * Kick/Ban action types
 */
export interface KickAction {
    type: 'kick'
    targetUserId: string
    initiatorId: string
    timestamp: number
}

export interface BanAction {
    type: 'ban'
    targetUserId: string
    initiatorId: string
    reason?: string
    timestamp: number
}

export interface UnbanAction {
    type: 'unban'
    targetUserId: string
    initiatorId: string
    timestamp: number
}

export type ModerationAction = KickAction | BanAction | UnbanAction
