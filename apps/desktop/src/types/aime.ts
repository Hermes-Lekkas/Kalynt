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
