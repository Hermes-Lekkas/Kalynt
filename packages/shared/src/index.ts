/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// CollabForge Shared Types

// Space Types
export interface Space {
    id: string
    name: string
    emoji: string
    memberCount: number
    unreadCount: number
    createdAt: number
    encryptionKey?: string
}

// Peer Types
export interface Peer {
    id: string
    name: string
    avatar?: string
    status: PeerStatus
    lastSeen?: number
    publicKey?: string
}

export type PeerStatus = 'online' | 'away' | 'offline' | 'busy'

// Task Types
export interface Task {
    id: string
    title: string
    description?: string
    status: TaskStatus
    assignee?: string
    priority: TaskPriority
    dueDate?: string
    createdAt: number
    updatedAt: number
}

export type TaskStatus = 'todo' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

// Message Types
export interface Message {
    id: string
    content: string
    sender: string
    senderId: string
    timestamp: number
    channelId: string
    encrypted: boolean
}

export interface Channel {
    id: string
    name: string
    spaceId: string
    type: 'text' | 'voice'
}

// Document Types (CRDT)
export interface Document {
    id: string
    title: string
    spaceId: string
    createdAt: number
    updatedAt: number
    version: number
}

// Tier Types
export type TierType = 'free' | 'pro' | 'max'

export interface TierLimits {
    maxSpaces: number
    maxStorageGB: number
    hasVersionHistory: boolean
    hasIntegrationAPIs: boolean
    hasCustomSchemas: boolean
    hasAIAssistance: boolean
}

export const TIER_LIMITS: Record<TierType, TierLimits> = {
    free: {
        maxSpaces: 3,
        maxStorageGB: 5,
        hasVersionHistory: false,
        hasIntegrationAPIs: false,
        hasCustomSchemas: false,
        hasAIAssistance: false
    },
    pro: {
        maxSpaces: Infinity,
        maxStorageGB: 50,
        hasVersionHistory: true,
        hasIntegrationAPIs: true,
        hasCustomSchemas: false,
        hasAIAssistance: false
    },
    max: {
        maxSpaces: Infinity,
        maxStorageGB: 200,
        hasVersionHistory: true,
        hasIntegrationAPIs: true,
        hasCustomSchemas: true,
        hasAIAssistance: true
    }
}

// Utility Types
export interface SyncState {
    isSyncing: boolean
    lastSyncedAt?: number
    pendingChanges: number
    connectedPeers: number
}

// Event Types for IPC
export type IPCEvent =
    | { type: 'peer-connected'; peer: Peer }
    | { type: 'peer-disconnected'; peerId: string }
    | { type: 'document-updated'; documentId: string; version: number }
    | { type: 'message-received'; message: Message }
    | { type: 'sync-complete'; spaceId: string }
