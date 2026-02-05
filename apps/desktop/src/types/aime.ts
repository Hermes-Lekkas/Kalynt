/*
 * Copyright 2026 Hermes Lekkas.
 * PROPRIETARY & CONFIDENTIAL.
 * 
 * This file is part of the Kalynt "Pro" Edition.
 * Unauthorized copying, distribution, or modification of this file, 
 * via any medium, is strictly prohibited.
 */

export type KVCacheQuantization = 'none' | 'fp16' | 'q8' | 'q4'

export type OffloadingStrategy = 'auto' | 'gpu-only' | 'cpu-only' | 'balanced' | 'custom'

export interface HardwareInfo {
    
    cpuCores: number
    cpuThreads: number
    cpuModel: string

    totalRAM: number        
    availableRAM: number    
    usedRAM: number         

    hasGPU: boolean
    gpuName?: string
    totalVRAM?: number      
    availableVRAM?: number  

    totalDiskSpace: number      
    availableDiskSpace: number  
}

export interface AIMEConfig {
    
    kvCacheQuantization: KVCacheQuantization

    offloadingStrategy: OffloadingStrategy
    gpuLayers: number           

    autoContextCap: boolean     
    maxContextTokens: number    
    useMemoryMapping: boolean   

    batchSize: number           
    threads: number             

    reservedRAM: number         
    emergencyUnload: boolean    
}

export const DEFAULT_AIME_CONFIG: AIMEConfig = {
    kvCacheQuantization: 'q8',
    offloadingStrategy: 'auto',
    gpuLayers: 0,
    autoContextCap: true,
    maxContextTokens: 8192,
    useMemoryMapping: true,
    batchSize: 512,
    threads: 4,
    reservedRAM: 2048,  
    emergencyUnload: true
}

export interface AIMEPreset {
    name: string
    description: string
    config: AIMEConfig
}

export const AIME_PRESETS: AIMEPreset[] = [
    {
        name: 'Maximum Quality',
        description: 'Best quality, highest RAM usage. For systems with 16GB+ RAM.',
        config: {
            kvCacheQuantization: 'none',
            offloadingStrategy: 'gpu-only',
            gpuLayers: 999,
            autoContextCap: false,
            maxContextTokens: 128000,
            useMemoryMapping: false,
            batchSize: 512,
            threads: 8,
            reservedRAM: 2048,
            emergencyUnload: false
        }
    },
    {
        name: 'Balanced',
        description: 'Good balance of quality and efficiency. For systems with 8-12GB RAM.',
        config: {
            kvCacheQuantization: 'q8',
            offloadingStrategy: 'balanced',
            gpuLayers: 16,
            autoContextCap: true,
            maxContextTokens: 16384,
            useMemoryMapping: true,
            batchSize: 512,
            threads: 6,
            reservedRAM: 2048,
            emergencyUnload: true
        }
    },
    {
        name: 'Maximum Efficiency',
        description: 'Lowest RAM usage, good for limited systems. For 4-6GB RAM.',
        config: {
            kvCacheQuantization: 'q4',
            offloadingStrategy: 'cpu-only',
            gpuLayers: 0,
            autoContextCap: true,
            maxContextTokens: 4096,
            useMemoryMapping: true,
            batchSize: 256,
            threads: 4,
            reservedRAM: 1024,
            emergencyUnload: true
        }
    },
    {
        name: 'Small Model Speed',
        description: 'Optimized for fast responses with small models (<7B). Prioritizes speed over context.',
        config: {
            kvCacheQuantization: 'q4',
            offloadingStrategy: 'cpu-only',
            gpuLayers: 0,
            autoContextCap: true,
            maxContextTokens: 2048,    // Small context for fast processing
            useMemoryMapping: true,
            batchSize: 128,            // Smaller batches = faster first token
            threads: 4,                // Optimal for most CPUs
            reservedRAM: 512,
            emergencyUnload: true
        }
    },
    {
        name: 'GPU Accelerated',
        description: 'Maximum speed with GPU acceleration. Requires CUDA/Metal compatible GPU.',
        config: {
            kvCacheQuantization: 'q8',
            offloadingStrategy: 'gpu-only',
            gpuLayers: 999,            // Offload all layers to GPU
            autoContextCap: true,
            maxContextTokens: 8192,
            useMemoryMapping: false,   // Disable mmap for GPU
            batchSize: 512,
            threads: 4,
            reservedRAM: 1024,
            emergencyUnload: true
        }
    }
]

export function calculateAIMERAMUsage(
    modelSizeMB: number,
    contextTokens: number,
    kvQuantization: KVCacheQuantization
): number {
    
    let total = modelSizeMB

    const kvCachePerToken = (modelSizeMB / 8000) * 0.5 / 1000
    let kvCache = contextTokens * kvCachePerToken

    const kvMultipliers: Record<KVCacheQuantization, number> = {
        'none': 1,   
        'fp16': 1,   
        'q8': 0.5,     
        'q4': 0.25     
    }

    kvCache *= kvMultipliers[kvQuantization]
    total += kvCache

    return Math.ceil(total)
}

export function recommendAIMESettings(hardware: HardwareInfo): AIMEConfig {
    const availRAM = hardware.availableRAM
    const hasGPU = hardware.hasGPU
    const cpuThreads = hardware.cpuThreads

    if (availRAM < 6144) {
        return {
            kvCacheQuantization: 'q4',
            offloadingStrategy: 'cpu-only',
            gpuLayers: 0,
            autoContextCap: true,
            maxContextTokens: 2048,
            useMemoryMapping: true,
            batchSize: 256,
            threads: Math.min(4, cpuThreads),
            reservedRAM: 1024,
            emergencyUnload: true
        }
    }

    if (availRAM < 12288) {
        return {
            kvCacheQuantization: 'q8',
            offloadingStrategy: hasGPU ? 'balanced' : 'cpu-only',
            gpuLayers: hasGPU ? 16 : 0,
            autoContextCap: true,
            maxContextTokens: 8192,
            useMemoryMapping: true,
            batchSize: 512,
            threads: Math.min(6, cpuThreads),
            reservedRAM: 2048,
            emergencyUnload: true
        }
    }

    return {
        kvCacheQuantization: 'q8',
        offloadingStrategy: hasGPU ? 'auto' : 'cpu-only',
        gpuLayers: hasGPU ? 32 : 0,
        autoContextCap: false,
        maxContextTokens: 32768,
        useMemoryMapping: true,
        batchSize: 512,
        threads: Math.min(8, cpuThreads),
        reservedRAM: 2048,
        emergencyUnload: false
    }
}

/**
 * Get optimized AIME settings for small models (<7B parameters)
 * Prioritizes speed and responsiveness over context length
 */
export function getSmallModelAIMESettings(hardware: HardwareInfo): AIMEConfig {
    const hasGPU = hardware.hasGPU
    const cpuThreads = hardware.cpuThreads

    // For small models, prioritize speed
    return {
        kvCacheQuantization: 'q4',          // Maximum compression for speed
        offloadingStrategy: hasGPU ? 'gpu-only' : 'cpu-only',
        gpuLayers: hasGPU ? 999 : 0,        // Full GPU offload if available
        autoContextCap: true,
        maxContextTokens: 2048,             // Small context = fast responses
        useMemoryMapping: !hasGPU,          // Mmap only for CPU
        batchSize: 128,                     // Smaller batch = faster first token
        threads: Math.min(4, cpuThreads),   // Don't over-parallelize small models
        reservedRAM: 512,
        emergencyUnload: true
    }
}

/**
 * Model size categories for AIME optimization
 */
export type ModelSizeCategory = 'tiny' | 'small' | 'medium' | 'large'

/**
 * Detect model size category from model ID
 */
export function detectModelSizeCategory(modelId: string): ModelSizeCategory {
    const lower = modelId.toLowerCase()

    // Tiny: <3B parameters
    if (/1\.5b|1b|0\.5b|500m|tiny/.test(lower)) return 'tiny'

    // Small: 3B-7B parameters
    if (/3b|4b|7b/.test(lower)) return 'small'

    // Medium: 8B-24B parameters
    if (/8b|13b|14b|24b/.test(lower)) return 'medium'

    // Large: 32B+ parameters
    return 'large'
}

/**
 * Get AIME settings optimized for specific model size
 */
export function getAIMESettingsForModel(
    modelId: string,
    hardware: HardwareInfo
): AIMEConfig {
    const category = detectModelSizeCategory(modelId)
    const hasGPU = hardware.hasGPU
    const cpuThreads = hardware.cpuThreads

    switch (category) {
        case 'tiny':
            // Tiny models: maximum speed, minimal context
            return {
                kvCacheQuantization: 'q4',
                offloadingStrategy: hasGPU ? 'gpu-only' : 'cpu-only',
                gpuLayers: hasGPU ? 999 : 0,
                autoContextCap: true,
                maxContextTokens: 2048,
                useMemoryMapping: !hasGPU,
                batchSize: 64,              // Very small batches for instant responses
                threads: Math.min(2, cpuThreads),
                reservedRAM: 256,
                emergencyUnload: true
            }

        case 'small':
            // Small models: fast with reasonable context
            return {
                kvCacheQuantization: 'q4',
                offloadingStrategy: hasGPU ? 'gpu-only' : 'cpu-only',
                gpuLayers: hasGPU ? 999 : 0,
                autoContextCap: true,
                maxContextTokens: 4096,
                useMemoryMapping: !hasGPU,
                batchSize: 128,
                threads: Math.min(4, cpuThreads),
                reservedRAM: 512,
                emergencyUnload: true
            }

        case 'medium':
            // Medium models: balanced speed and capability
            return {
                kvCacheQuantization: 'q8',
                offloadingStrategy: hasGPU ? 'balanced' : 'cpu-only',
                gpuLayers: hasGPU ? 24 : 0,
                autoContextCap: true,
                maxContextTokens: 8192,
                useMemoryMapping: true,
                batchSize: 256,
                threads: Math.min(6, cpuThreads),
                reservedRAM: 1024,
                emergencyUnload: true
            }

        case 'large':
        default:
            // Large models: use hardware recommendations
            return recommendAIMESettings(hardware)
    }
}
