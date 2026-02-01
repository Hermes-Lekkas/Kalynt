/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// usePermissions - Hook for checking and enforcing member permissions
import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { useMemberStore } from '../stores/memberStore'
import { MemberPermissions, DEFAULT_PERMISSIONS, isPathRestricted } from '../types/permissions'

interface PermissionState {
    // Permission flags
    canEdit: boolean
    canUseAgent: boolean
    canChat: boolean
    canManageTasks: boolean
    canManageFiles: boolean

    // Role info
    isOwner: boolean
    isAdmin: boolean
    isViewer: boolean

    // Utilities
    isPathAllowed: (path: string) => boolean
    isBanned: boolean
}

/**
 * Hook to get current user's permissions for a space
 * Automatically updates when permissions change via P2P sync
 */
export function usePermissions(): PermissionState {
    const { currentSpace } = useAppStore()
    const { getMyRole, getMyPermissions, userId, isUserBanned } = useMemberStore()

    const [permissions, setPermissions] = useState<MemberPermissions>(DEFAULT_PERMISSIONS.member)

    const spaceId = currentSpace?.id
    const myRole = spaceId ? getMyRole(spaceId) : 'member'

    const permissionsRef = useRef(permissions)
    useEffect(() => {
        permissionsRef.current = permissions
    }, [permissions])

    useEffect(() => {
        if (!spaceId) {
            setPermissions(DEFAULT_PERMISSIONS.member)
            return
        }

        const perms = getMyPermissions(spaceId)
        setPermissions(perms)

        // Subscribe to permission changes from store
        const unsubscribe = useMemberStore.subscribe((state) => {
            const updated = state.getMyPermissions(spaceId)
            // Use ref to compare to avoid stale closure in subscription
            if (JSON.stringify(updated) !== JSON.stringify(permissionsRef.current)) {
                setPermissions(updated)
            }
        })

        return unsubscribe
    }, [spaceId, getMyPermissions])

    const isPathAllowed = (path: string): boolean => {
        if (!permissions.canEdit) return false
        return !isPathRestricted(path, permissions)
    }

    return {
        canEdit: permissions.canEdit,
        canUseAgent: permissions.canUseAgent,
        canChat: permissions.canChat,
        canManageTasks: permissions.canManageTasks,
        canManageFiles: permissions.canManageFiles,

        isOwner: myRole === 'owner',
        isAdmin: myRole === 'owner' || myRole === 'admin',
        isViewer: myRole === 'viewer',

        isPathAllowed,
        isBanned: spaceId ? isUserBanned(spaceId, userId) : false
    }
}

/**
 * Hook to check if user can perform a specific action
 * Shows toast/alert if action is blocked
 */
export function usePermissionCheck() {
    const permissions = usePermissions()

    const checkEdit = (): boolean => {
        if (!permissions.canEdit) {
            console.warn('[Permissions] Edit blocked - user lacks permission')
            return false
        }
        return true
    }

    const checkAgent = (): boolean => {
        if (!permissions.canUseAgent) {
            console.warn('[Permissions] Agent blocked - user lacks permission')
            return false
        }
        return true
    }

    const checkChat = (): boolean => {
        if (!permissions.canChat) {
            console.warn('[Permissions] Chat blocked - user lacks permission')
            return false
        }
        return true
    }

    const checkTasks = (): boolean => {
        if (!permissions.canManageTasks) {
            console.warn('[Permissions] Tasks blocked - user lacks permission')
            return false
        }
        return true
    }

    const checkFiles = (): boolean => {
        if (!permissions.canManageFiles) {
            console.warn('[Permissions] Files blocked - user lacks permission')
            return false
        }
        return true
    }

    const checkPath = (path: string): boolean => {
        if (!permissions.isPathAllowed(path)) {
            console.warn('[Permissions] Path restricted:', path)
            return false
        }
        return true
    }

    return {
        checkEdit,
        checkAgent,
        checkChat,
        checkTasks,
        checkFiles,
        checkPath,
        permissions
    }
}
