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

// ============================================================
// ReAct Agentic Loop Types
// ============================================================

/**
 * A single step in the agent's ReAct loop.
 * Each step represents one turn of: Reason → Act → Observe.
 */
export interface AgentStep {
    id: string
    type: 'thinking' | 'tool-call' | 'tool-result' | 'answer' | 'plan' | 'error'
    content: string
    toolName?: string
    toolParams?: Record<string, unknown>
    toolResult?: unknown
    timestamp: number
    /** Duration of this step in ms */
    duration?: number
}

/**
 * An agent plan: a structured list of steps the agent intends to take
 * before executing. Shown to the user for approval in plan mode.
 */
export interface AgentPlan {
    id: string
    title: string
    steps: AgentPlanStep[]
    status: 'proposed' | 'approved' | 'rejected' | 'executing' | 'completed'
    createdAt: number
}

export interface AgentPlanStep {
    description: string
    tool?: string
    status: 'pending' | 'in-progress' | 'completed' | 'skipped' | 'failed'
}

/**
 * Configuration for the ReAct agentic loop
 */
export interface AgentLoopConfig {
    /** Maximum tool execution iterations per user message */
    maxIterations: number
    /** Maximum time budget in ms for a single loop run */
    maxDurationMs: number
    /** Whether to show plan before executing (plan mode) */
    planMode: boolean
    /** Whether read-only tools are auto-approved */
    autoApproveReadOnly: boolean
    /** Whether all tools are auto-approved (trusted mode) */
    trustedMode: boolean
    /** Whether to use AIME context retrieval */
    useRAG: boolean
    /** Maximum context chars from AIME */
    maxRAGContext: number
    /** Optional model override */
    model?: string
}

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
    maxIterations: 25,
    maxDurationMs: 300000, // 5 minutes
    planMode: false,
    autoApproveReadOnly: true,
    trustedMode: false,
    useRAG: true,
    maxRAGContext: 4000
}

/**
 * State of a running agentic loop
 */
export interface AgentLoopState {
    /** Unique run ID */
    runId: string
    /** Whether the loop is currently running */
    isRunning: boolean
    /** The original user message */
    userMessage: string
    /** All steps taken so far */
    steps: AgentStep[]
    /** Current plan (if in plan mode) */
    plan: AgentPlan | null
    /** Current iteration number */
    iteration: number
    /** Current streaming text from LLM */
    streamingText: string
    /** Whether the LLM is currently generating */
    isGenerating: boolean
    /** Thinking content (for thinking models) */
    thinkingContent: string
    /** Whether currently in thinking phase */
    isThinking: boolean
    /** Error if any */
    error: string | null
    /** When the loop started */
    startedAt: number
    /** Files modified during this run */
    modifiedFiles: string[]
}

/**
 * Events emitted by the agent loop for UI updates
 */
export type AgentLoopEvent =
    | { type: 'started'; runId: string; userMessage: string }
    | { type: 'thinking'; content: string }
    | { type: 'streaming'; text: string }
    | { type: 'step-added'; step: AgentStep }
    | { type: 'step-updated'; stepId: string; updates: Partial<AgentStep> }
    | { type: 'plan-proposed'; plan: AgentPlan }
    | { type: 'tool-executing'; toolName: string; params: Record<string, unknown> }
    | { type: 'tool-complete'; toolName: string; result: unknown; success: boolean }
    | { type: 'iteration'; iteration: number; maxIterations: number }
    | { type: 'completed'; finalMessage: string; steps: AgentStep[] }
    | { type: 'error'; error: string }
    | { type: 'aborted' }
    | { type: 'file-modified'; filePath: string }
