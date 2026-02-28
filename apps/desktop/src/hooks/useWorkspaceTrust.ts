/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// useWorkspaceTrust - Workspace Trust System
// Implements VS Code-like workspace trust to protect against malicious repositories

import { useState, useCallback, useEffect } from 'react'

export type TrustLevel = 'trusted' | 'untrusted' | 'prompt'

interface WorkspaceTrustState {
    [workspacePath: string]: TrustLevel
}

// Storage key for workspace trust
const TRUST_STORAGE_KEY = 'kalynt-workspace-trust'

/**
 * Get initial trust state from localStorage
 */
function getInitialTrustState(): WorkspaceTrustState {
    try {
        const stored = localStorage.getItem(TRUST_STORAGE_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (e) {
        console.warn('[WorkspaceTrust] Failed to load trust state:', e)
    }
    return {}
}

/**
 * Save trust state to localStorage
 */
function saveTrustState(state: WorkspaceTrustState): void {
    try {
        localStorage.setItem(TRUST_STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
        console.warn('[WorkspaceTrust] Failed to save trust state:', e)
    }
}

export interface WorkspaceTrustInfo {
    isTrusted: boolean
    trustLevel: TrustLevel
    needsPrompt: boolean
}

/**
 * Hook to manage workspace trust state
 */
export function useWorkspaceTrust() {
    const [trustState, setTrustState] = useState<WorkspaceTrustState>(getInitialTrustState)

    // Persist trust state changes
    useEffect(() => {
        saveTrustState(trustState)
    }, [trustState])

    /**
     * Get trust status for a workspace
     */
    const getTrustStatus = useCallback((workspacePath: string): WorkspaceTrustInfo => {
        const trustLevel = trustState[workspacePath] || 'prompt'
        
        return {
            isTrusted: trustLevel === 'trusted',
            trustLevel,
            needsPrompt: trustLevel === 'prompt'
        }
    }, [trustState])

    /**
     * Mark a workspace as trusted
     */
    const trustWorkspace = useCallback((workspacePath: string): void => {
        setTrustState(prev => ({
            ...prev,
            [workspacePath]: 'trusted'
        }))
    }, [])

    /**
     * Mark a workspace as untrusted (blocks execution)
     */
    const distrustWorkspace = useCallback((workspacePath: string): void => {
        setTrustState(prev => ({
            ...prev,
            [workspacePath]: 'untrusted'
        }))
    }, [])

    /**
     * Reset trust prompt for a workspace (show prompt again)
     */
    const resetWorkspaceTrust = useCallback((workspacePath: string): void => {
        setTrustState(prev => {
            const newState = { ...prev }
            delete newState[workspacePath]
            return newState
        })
    }, [])

    /**
     * Check if execution is allowed for a workspace
     * Returns true if execution is allowed, false otherwise
     */
    const canExecute = useCallback((workspacePath: string): boolean => {
        const trustLevel = trustState[workspacePath]
        // Allow execution if trusted, block if explicitly untrusted
        // If prompt (not set), we'll show a prompt
        return trustLevel !== 'untrusted'
    }, [trustState])

    /**
     * Check if we should show a trust prompt for a workspace
     */
    const shouldShowPrompt = useCallback((workspacePath: string): boolean => {
        const trustLevel = trustState[workspacePath]
        return trustLevel === 'prompt' || !(workspacePath in trustState)
    }, [trustState])

    /**
     * Clear all trust data (for testing/reset)
     */
    const clearAllTrust = useCallback((): void => {
        setTrustState({})
        localStorage.removeItem(TRUST_STORAGE_KEY)
    }, [])

    return {
        getTrustStatus,
        trustWorkspace,
        distrustWorkspace,
        resetWorkspaceTrust,
        canExecute,
        shouldShowPrompt,
        clearAllTrust
    }
}

/**
 * Check if a path looks like a trusted system directory
 * These are always considered trusted
 */
export function isSystemDirectory(path: string): boolean {
    // Get home directory from electron API if available
    const homeDir = typeof window !== 'undefined' && (window as any).electronAPI?.platform !== 'browser'
        ? (window as any).electronAPI?.process?.env?.HOME || (window as any).electronAPI?.process?.env?.USERPROFILE
        : ''
    
    const systemPaths = [
        homeDir,
        '/usr',
        '/bin',
        '/sbin',
        '/etc',
        '/System',
        '/Library',
        'C:\\Windows',
        'C:\\Program Files'
    ].filter(Boolean)
    
    return systemPaths.some(sysPath => 
        path.startsWith(sysPath as string) || path.toLowerCase().startsWith((sysPath as string).toLowerCase())
    )
}
