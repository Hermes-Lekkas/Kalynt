/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Agent Instruction Types
 * Shared types for model-tier-specific instruction controllers
 */

import { AIMessage } from '../services/aiService'
import { EditorMode } from '../config/editorModes'
import { WorkspaceContext } from '../types/agentTypes'

/**
 * Model capability tiers
 */
export type ModelTier = 'small' | 'large' | 'flagship'

/**
 * Configuration for building agent prompts
 */
export interface InstructionConfig {
    mode: EditorMode
    workspacePath: string
    context: WorkspaceContext
    useTools: boolean
}

/**
 * Result from instruction builder
 */
export interface InstructionResult {
    messages: AIMessage[]
    maxSuggestions: number
    enabledActions: string[]
    temperature: number
    maxTokens: number
}

/**
 * Tool definition for agent instructions
 */
export interface ToolDefinition {
    name: string
    description: string
    parameters: {
        name: string
        type: string
        description: string
        required: boolean
    }[]
    examples?: string[]
}
