/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Agent Instructions Module
 * 
 * Provides model-tier-specific instruction controllers for optimal
 * agent behavior based on LLM capability.
 * 
 * Tiers:
 * - small: <24B parameter models (explicit, minimal tools)
 * - large: 24B+ local models (chain-of-thought, full tools)
 * - flagship: Online API models (maximum capability)
 */

// Types
export type {
    ModelTier,
    InstructionConfig,
    InstructionResult,
    ToolDefinition
} from './types'

// Small model instructions (<24B)
export {
    buildSmallModelInstructions,
    getSmallModelTools,
    isSmallModel
} from './smallModelInstructions'

// Large model instructions (24B+)
export {
    buildLargeModelInstructions,
    isLargeModel,
    getLargeModelSettings
} from './largeModelInstructions'

// Flagship model instructions (Online APIs)
export {
    buildFlagshipModelInstructions,
    getProviderCapabilities,
    isOnlineProvider,
    getFlagshipModelSettings
} from './flagshipModelInstructions'

import { AIProvider } from '../services/aiService'
import { InstructionConfig, InstructionResult, ModelTier } from './types'
import { buildSmallModelInstructions, isSmallModel } from './smallModelInstructions'
import { buildLargeModelInstructions, isLargeModel } from './largeModelInstructions'
import { buildFlagshipModelInstructions, isOnlineProvider } from './flagshipModelInstructions'

/**
 * Detect model tier based on model ID or provider
 * 
 * @param modelId - The offline model ID (e.g., 'qwen2.5-coder-7b')
 * @param provider - The online provider (e.g., 'openai')
 * @param useOfflineAI - Whether using offline AI
 */
export function detectModelTier(
    modelId: string | null,
    provider: AIProvider | null,
    useOfflineAI: boolean
): ModelTier {
    // Online providers are always flagship
    if (!useOfflineAI && provider && isOnlineProvider(provider)) {
        return 'flagship'
    }

    // Check offline model tiers
    if (modelId) {
        if (isLargeModel(modelId)) {
            return 'large'
        }
        if (isSmallModel(modelId)) {
            return 'small'
        }
    }

    // Default to small for unknown models (safer)
    return 'small'
}

/**
 * Get appropriate instructions for the current model configuration
 * 
 * This is the main entry point for the instruction system.
 * Call this from agentService.buildPrompt() to get tier-optimized prompts.
 * 
 * @param config - The instruction configuration
 * @param modelId - The offline model ID (if using offline AI)
 * @param provider - The online provider (if using online AI)
 * @param useOfflineAI - Whether using offline AI
 */
export function getInstructionsForModel(
    config: InstructionConfig,
    modelId: string | null,
    provider: AIProvider | null,
    useOfflineAI: boolean
): InstructionResult {
    const tier = detectModelTier(modelId, provider, useOfflineAI)

    switch (tier) {
        case 'flagship':
            return buildFlagshipModelInstructions(config, provider || 'openai')

        case 'large':
            return buildLargeModelInstructions(config)

        case 'small':
        default:
            return buildSmallModelInstructions(config)
    }
}

/**
 * Get model tier display name for UI
 */
export function getModelTierDisplayName(tier: ModelTier): string {
    const names: Record<ModelTier, string> = {
        small: 'Standard',
        large: 'Advanced',
        flagship: 'Flagship'
    }
    return names[tier]
}

/**
 * Get model tier description for UI
 */
export function getModelTierDescription(tier: ModelTier): string {
    const descriptions: Record<ModelTier, string> = {
        small: 'Optimized for fast, focused suggestions with essential tools',
        large: 'Full-featured analysis with chain-of-thought reasoning',
        flagship: 'Maximum capability with advanced planning and orchestration'
    }
    return descriptions[tier]
}
