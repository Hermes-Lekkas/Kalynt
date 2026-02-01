/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Agent Types - Type definitions for autonomous AI agent

import { EditorMode } from '../config/editorModes'

// Agent states
export type AgentState =
    | 'disabled'
    | 'idle'
    | 'observing'
    | 'thinking'
    | 'waiting-approval'
    | 'executing'
    | 'error'

// Action types the agent can perform
export type AgentActionType =
    | 'edit'
    | 'create-task'
    | 'suggest'
    | 'comment'
    | 'organize'
    | 'tool-call'

// Target Yjs documents
export type AgentTarget =
    | 'editor-content'
    | 'tasks'
    | 'messages'
    | 'file-system'

// Task status for created tasks
export type TaskStatus = 'todo' | 'in-progress' | 'done'

// Payload types for different actions
export interface EditPayload {
    content: string
    position?: 'append' | 'prepend' | 'replace' | 'insert'
    insertAt?: number
}

export interface CreateTaskPayload {
    title: string
    status: TaskStatus
    priority?: 'low' | 'medium' | 'high'
}

export interface SuggestPayload {
    message: string
    category?: 'improvement' | 'warning' | 'info' | 'tip' | 'bug' | 'security' | 'performance' | 'refactor'
    filePath?: string
    lineNumber?: number
}

export interface CommentPayload {
    content: string
    position: number
    length: number
}

export interface OrganizePayload {
    sections: { title: string; content: string }[]
}

export interface ToolCallPayload {
    tool: string
    params: Record<string, unknown>
}

export type AgentPayload =
    | EditPayload
    | CreateTaskPayload
    | SuggestPayload
    | CommentPayload
    | OrganizePayload
    | ToolCallPayload

// Agent suggestion with confidence
export interface AgentSuggestion {
    id: string
    action: AgentActionType
    target: AgentTarget
    description: string
    reasoning: string
    confidence: number // 0-1
    payload: AgentPayload
    timestamp: number
    status: 'pending' | 'approved' | 'rejected' | 'executed'
}

// Activity log entry
export interface ActivityLogEntry {
    id: string
    timestamp: number
    type: 'suggestion' | 'approval' | 'rejection' | 'execution' | 'error' | 'analysis'
    message: string
    suggestionId?: string
    details?: Record<string, any>
}

// Workspace context sent to AI
export interface WorkspaceContext {
    mode: EditorMode
    editorContent: string
    editorWordCount: number
    tasks: {
        total: number
        todo: number
        inProgress: number
        done: number
        items: { title: string; status: string }[]
    }
    recentActivity: string[]
    lastEditTime: number
    idleTime: number
}

// AI response format for agent
export interface AgentAIResponse {
    suggestions: {
        action: AgentActionType
        target: AgentTarget
        description: string
        reasoning: string
        confidence: number
        payload: AgentPayload
    }[]
    summary?: string
}

// Agent configuration
export interface AgentConfig {
    enabled: boolean
    analysisInterval: number // ms, default 30000
    minIdleTime: number // ms, default 30000
    maxSuggestions: number // default 3
    autoApproveThreshold?: number // confidence threshold for auto-approve (disabled by default)
    enabledActions: AgentActionType[]
    maxContextChars: number // BUG-054: Limit context length sent to AI
}

// Default agent config
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
    enabled: true,
    analysisInterval: 30000,
    minIdleTime: 30000,
    maxSuggestions: 3,
    autoApproveThreshold: undefined,
    enabledActions: ['edit', 'create-task', 'suggest', 'comment', 'organize', 'tool-call'],
    maxContextChars: 8000 // BUG-054: Larger default limit
}

// Agent store state
export interface AgentStoreState {
    state: AgentState
    config: AgentConfig
    suggestions: AgentSuggestion[]
    activityLog: ActivityLogEntry[]
    lastAnalysisTime: number | null
    currentSpaceId: string | null
    error: string | null
}
