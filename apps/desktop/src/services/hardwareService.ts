/**
 * Copyright 2026 Hermes Lekkas (hermeslekkasdev@gmail.com).
 * PROPRIETARY & CONFIDENTIAL.
 * 
 * This file is part of the Kalynt "Pro" Edition.
 * Unauthorized copying, distribution, or modification of this file, 
 * via any medium, is strictly prohibited.
 */

import type { HardwareInfo } from '../types/aime'

export interface RealTimeStats {
    cpuUsage: number
    ramUsage: number
    ramTotal: number
    gpuUsage: number      
    vramUsage: number     
    vramTotal: number     
    ivramUsage: number
    ivramTotal: number
    diskUsage: number
    diskTotal: number
    diskIOSpeed: number   
    networkConnected: boolean
    networkLatency?: number
}

class HardwareService {
    private cachedInfo: HardwareInfo | null = null
    private lastUpdate: number = 0
    private readonly CACHE_DURATION = 30000 

    async getHardwareInfo(forceRefresh: boolean = false): Promise<HardwareInfo> {
        const now = Date.now()

        if (!forceRefresh && this.cachedInfo && (now - this.lastUpdate) < this.CACHE_DURATION) {
            return this.cachedInfo
        }

        const electronAPI = globalThis.window?.electronAPI as any
        if (electronAPI?.getHardwareInfo) {
            try {
                const info = await electronAPI.getHardwareInfo()
                this.cachedInfo = info
                this.lastUpdate = now
                return info
            } catch (error) {
                console.error('[HardwareService] Failed to get hardware info:', error)
            }
        }

        return this.getFallbackHardwareInfo()
    }

    async getRealTimeStats(): Promise<RealTimeStats> {
        const electronAPI = globalThis.window?.electronAPI as any
        if (electronAPI?.getRealTimeStats) {
            try {
                return await electronAPI.getRealTimeStats()
            } catch (error) {
                console.error('[HardwareService] Failed to get real-time stats:', error)
            }
        }

        return {
            cpuUsage: 0,
            ramUsage: 4096,
            ramTotal: 8192,
            gpuUsage: 0,
            vramUsage: 0,
            vramTotal: 4096,
            ivramUsage: 0,
            ivramTotal: 4096,
            diskUsage: 400000,
            diskTotal: 500000,
            diskIOSpeed: 0,
            networkConnected: true
        }
    }

    async getGPUInfo(): Promise<{ hasGPU: boolean; gpuName?: string; totalVRAM?: number; availableVRAM?: number }> {
        const info = await this.getHardwareInfo()
        return {
            hasGPU: info.hasGPU,
            gpuName: info.gpuName,
            totalVRAM: info.totalVRAM,
            availableVRAM: info.availableVRAM
        }
    }

    async getRAMInfo(): Promise<{ totalRAM: number; availableRAM: number; usedRAM: number }> {
        const info = await this.getHardwareInfo()
        return {
            totalRAM: info.totalRAM,
            availableRAM: info.availableRAM,
            usedRAM: info.usedRAM
        }
    }

    async isGPUAvailable(): Promise<boolean> {
        const info = await this.getHardwareInfo()
        return info.hasGPU && (info.totalVRAM ?? 0) > 0
    }

    async getRecommendedGPULayers(modelSizeMB: number): Promise<number> {
        const gpuInfo = await this.getGPUInfo()

        if (!gpuInfo.hasGPU || !gpuInfo.availableVRAM) {
            return 0 
        }

        const vramPerLayer = modelSizeMB / 32
        const safeVRAM = gpuInfo.availableVRAM * 0.8 
        const maxLayers = Math.floor(safeVRAM / vramPerLayer)

        return Math.min(maxLayers, 64)
    }

    startRAMMonitoring(callback: (ramInfo: { totalRAM: number; availableRAM: number; usedRAM: number }) => void): () => void {
        const intervalId = setInterval(async () => {
            const ramInfo = await this.getRAMInfo()
            callback(ramInfo)
        }, 1000)

        return () => clearInterval(intervalId)
    }

    startResourceMonitoring(callback: (stats: RealTimeStats) => void): () => void {
        const intervalId = setInterval(async () => {
            const stats = await this.getRealTimeStats()
            callback(stats)
        }, 1000)

        return () => clearInterval(intervalId)
    }

    private getFallbackHardwareInfo(): HardwareInfo {
        
        const cpuCores = navigator.hardwareConcurrency || 4

        return {
            cpuCores: cpuCores,
            cpuThreads: cpuCores,
            cpuModel: 'Unknown CPU',
            totalRAM: 8192,      
            availableRAM: 4096,  
            usedRAM: 4096,
            hasGPU: false,
            totalDiskSpace: 500000,      
            availableDiskSpace: 100000   
        }
    }

    clearCache(): void {
        this.cachedInfo = null
        this.lastUpdate = 0
    }
}

export const hardwareService = new HardwareService()
