/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Offline LLM Model Types and Configurations
// New Apache 2.0 Licensed Models for IDE Development (2026)

import { TierType } from '../stores/appStore'

/**
 * Offline model quality rating
 */
export type ModelQuality = 1 | 2 | 3 | 4 | 5

/**
 * Download status for a model
 */
export type DownloadStatus = 'not_downloaded' | 'downloading' | 'paused' | 'downloaded' | 'error'

/**
 * Configuration for an offline LLM model
 */
export interface OfflineModel {
    id: string
    name: string
    description: string
    size: string              // Human readable, e.g., "2.1 GB"
    sizeBytes: number         // Actual size in bytes
    ramRequired: string       // Human readable, e.g., "4 GB"
    ramRequiredMB: number     // RAM in MB
    quality: ModelQuality     // 1-5 star rating
    downloadUrl: string       // Hugging Face URL
    filename: string          // Local filename
    minTier: TierType         // Minimum tier required
    tierIndex: number         // 1-5, for tier counting
    contextLength: number     // Max context in tokens
    promptTemplate: string    // Chat prompt format
    role?: string             // Role in IDE (e.g., "The Flagship Agent")
}

/**
 * State of a downloaded model
 */
export interface DownloadedModel {
    id: string
    path: string              // Full path to file
    downloadedAt: number      // Timestamp
    sizeBytes: number         // Verified size
    verified: boolean         // Hash verified
}

/**
 * Download progress state
 */
export interface DownloadProgress {
    modelId: string
    status: DownloadStatus
    bytesDownloaded: number
    totalBytes: number
    speed: number             // bytes/second
    eta: number               // seconds remaining
    error?: string
}

// ============================================
// Prompt Templates for New Model Families
// ============================================

// Qwen2.5-Coder uses ChatML format
const QWEN_TEMPLATE = '<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n'

// Devstral uses Mistral instruction format
const DEVSTRAL_TEMPLATE = '<s>[INST] {system}\n\n{user} [/INST]'

/**
 * Available offline models - Top 5 Coding Agent Models (2026)
 * Ordered by tier/complexity: smallest to largest
 *
 * Model Lineup:
 * 1. Qwen2.5-Coder 1.5B Q8 - Fast autocomplete (1.7GB, 4GB RAM)
 * 2. Qwen2.5-Coder 7B Q4_K_M - Balanced performance (4.68GB, 8GB RAM)
 * 3. Qwen3-4B-Thinking-2507 Q5_K_XL - Extended reasoning (2.9GB, 6GB RAM) [NEW]
 * 4. Qwen2.5-Coder 7B Q8 - High quality agent (7.7GB, 12GB RAM)
 * 5. Devstral Small 2 24B - Repo architect (14.3GB, 20GB RAM)
 * 6. Qwen2.5-Coder 14B - Flagship model (9GB, 16GB RAM)
 */
export const OFFLINE_MODELS: OfflineModel[] = [
    // 1. The Autocomplete - Qwen2.5-Coder-1.5B (Ghost-Text Engine)
    {
        id: 'qwen2.5-coder-1.5b',
        name: 'Qwen2.5-Coder 1.5B',
        description: 'Fast autocomplete engine. Trained on 5.5T tokens for code generation, reasoning and fixing. Small enough for real-time suggestions. Note: Limited tool-calling ability compared to 7B+ models. Best for code completion, not complex tool orchestration.',
        size: '1.7 GB',
        sizeBytes: 1_700_000_000,
        ramRequired: '4 GB',
        ramRequiredMB: 4096,
        quality: 3,
        downloadUrl: 'https://huggingface.co/ggml-org/Qwen2.5-Coder-1.5B-Instruct-Q8_0-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q8_0.gguf',
        filename: 'qwen2.5-coder-1.5b-instruct-q8_0.gguf',
        minTier: 'starter',
        tierIndex: 1,
        contextLength: 32768,
        promptTemplate: QWEN_TEMPLATE,
        role: 'The Autocomplete'
    },
    // 2. The Balanced Model - Qwen2.5-Coder-7B Q4_K_M (RAM-Efficient)
    {
        id: 'qwen2.5-coder-7b-q4',
        name: 'Qwen2.5-Coder 7B Q4_K_M',
        description: 'RAM-efficient version of Qwen 7B with Q4_K_M quantization. Perfect balance of performance and memory usage. Same capabilities as Q8 version but uses 40% less RAM. Recommended for systems with 8-10GB RAM.',
        size: '4.68 GB',
        sizeBytes: 4_680_000_000,
        ramRequired: '8 GB',
        ramRequiredMB: 8192,
        quality: 4,
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        filename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        minTier: 'starter',
        tierIndex: 2,
        contextLength: 128000,
        promptTemplate: QWEN_TEMPLATE,
        role: 'The Balanced Model'
    },
    // 3. The Reasoning Model - Qwen3-4B-Thinking-2507 (Extended Reasoning Specialist)
    {
        id: 'qwen3-4b-thinking',
        name: 'Qwen3-4B-Thinking-2507 Q5_K_XL',
        description: 'Extended reasoning specialist with 256K context. Designed for complex problem-solving with step-by-step thinking. Native thinking mode for mathematical proofs, code analysis, and logical reasoning. Lightweight at 2.9GB but powerful reasoning. Recommended context: 131K+ for best results.',
        size: '2.9 GB',
        sizeBytes: 2_900_000_000,
        ramRequired: '6 GB',
        ramRequiredMB: 6144,
        quality: 4,
        downloadUrl: 'https://huggingface.co/unsloth/Qwen3-4B-Thinking-2507-GGUF/resolve/main/Qwen3-4B-Thinking-2507-UD-Q5_K_XL.gguf',
        filename: 'Qwen3-4B-Thinking-2507-UD-Q5_K_XL.gguf',
        minTier: 'starter',
        tierIndex: 3,
        contextLength: 262144,  // 256K native context with YaRN extension
        promptTemplate: QWEN_TEMPLATE,
        role: 'The Reasoning Model'
    },
    // 4. The Agent - Qwen2.5-Coder-7B Q8 (Tool-Calling Specialist)
    {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen2.5-Coder 7B Q8',
        description: 'Excellent tool-calling model trained for agentic coding. 128K context with strong reasoning and function calling abilities. Higher quality Q8 quantization for best results. (SWE-bench Verified: Up to 47%)',
        size: '7.7 GB',
        sizeBytes: 7_700_000_000,
        ramRequired: '12 GB',
        ramRequiredMB: 12288,
        quality: 5,
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q8_0.gguf',
        filename: 'qwen2.5-coder-7b-instruct-q8_0.gguf',
        minTier: 'starter',
        tierIndex: 4,
        contextLength: 128000,
        promptTemplate: QWEN_TEMPLATE,
        role: 'The Agent'
    },
    // 5. The Repo Architect - Devstral Small 2 24B (Agentic Coding Specialist)
    {
        id: 'devstral-small-2-24b',
        name: 'Devstral Small 2 24B',
        description: 'Agentic coding specialist from Mistral AI. 256K context, vision capabilities, optimized for software engineering agents. (SWE-bench Verified: 68.0%)',
        size: '14.3 GB',
        sizeBytes: 14_330_000_000,
        ramRequired: '20 GB',
        ramRequiredMB: 20480,
        quality: 4,
        downloadUrl: 'https://huggingface.co/bartowski/mistralai_Devstral-Small-2-24B-Instruct-2512-GGUF/resolve/main/mistralai_Devstral-Small-2-24B-Instruct-2512-Q4_K_M.gguf',
        filename: 'devstral-small-2-24b-instruct.Q4_K_M.gguf',
        minTier: 'starter',
        tierIndex: 5,
        contextLength: 131072,  // 128K practical limit (model supports 256K)
        promptTemplate: DEVSTRAL_TEMPLATE,
        role: 'The Repo Architect'
    },
    // 6. The Flagship Agent - Qwen2.5-Coder-14B (The Brain)
    {
        id: 'qwen2.5-coder-14b',
        name: 'Qwen2.5-Coder-14B',
        description: 'Flagship agentic model. Best for tool-use with 128K context to index entire projects. (SWE-bench Verified: Up to 47%)',
        size: '9.0 GB',
        sizeBytes: 9_000_000_000,
        ramRequired: '16 GB',
        ramRequiredMB: 16384,
        quality: 5,
        downloadUrl: 'https://huggingface.co/lmstudio-community/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf',
        minTier: 'starter',
        tierIndex: 6,
        contextLength: 128000,
        promptTemplate: QWEN_TEMPLATE,
        role: 'The Flagship Agent'
    }
]

/**
 * Get model by ID
 */
export function getModelById(id: string): OfflineModel | undefined {
    return OFFLINE_MODELS.find(m => m.id === id)
}

/**
 * Get models available for a tier
 * BETA v1: All models are free and available to all tiers
 */
export function getModelsForTier(_tier: TierType): OfflineModel[] {
    // Beta v1: Return all models for all tiers (tier parameter unused)
    return OFFLINE_MODELS
}

/**
 * Check if a model is available for a tier
 */
export function isModelAvailableForTier(modelId: string, tier: TierType): boolean {
    const model = getModelById(modelId)
    if (!model) return false

    const availableModels = getModelsForTier(tier)
    return availableModels.some(m => m.id === modelId)
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Format ETA to human readable string
 */
export function formatETA(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
}
