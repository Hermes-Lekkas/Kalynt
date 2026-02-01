/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import os from 'os'

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

export interface RealTimeStats {
    cpuUsage: number // 0-100
    ramUsage: number // Used MB
    ramTotal: number // Total MB
    diskIOSpeed: number // Combined read+write MB/s
    networkConnected: boolean
    networkLatency?: number // ms
    gpuUsage: number // 0-100 (cached/throttled)
    vramUsage: number // Used MB
    vramTotal: number // Total MB
}

// CPU tracking for usage calculation
let previousCpuInfo: os.CpuInfo[] | null = null

/**
 * Get hardware info - uses only Node.js os module for reliability
 */
export async function detectHardwareInfo(): Promise<HardwareInfo> {
    const cpus = os.cpus()
    const cpuModel = cpus[0]?.model || 'Unknown CPU'
    const cpuCores = cpus.length
    const cpuThreads = cpuCores

    const totalRAM = Math.round(os.totalmem() / 1024 / 1024)
    const freeRAM = Math.round(os.freemem() / 1024 / 1024)
    const usedRAM = totalRAM - freeRAM

    return {
        cpuCores,
        cpuThreads,
        cpuModel,
        totalRAM,
        availableRAM: freeRAM,
        usedRAM,
        hasGPU: false,
        gpuName: undefined,
        totalVRAM: undefined,
        availableVRAM: undefined,
        totalDiskSpace: 500000,
        availableDiskSpace: 200000
    }
}

/**
 * Get real-time stats - LIGHTWEIGHT, only Node.js os module
 */
export function getRealTimeStats(): RealTimeStats {
    // CPU Usage Calculation
    const currentCpus = os.cpus()
    let cpuUsage = 0

    if (previousCpuInfo) {
        let totalIdle = 0
        let totalTick = 0

        for (let i = 0; i < currentCpus.length; i++) {
            const current = currentCpus[i]
            const previous = previousCpuInfo[i]

            if (current && previous) {
                const currentTicks = current.times.user + current.times.nice + current.times.sys + current.times.idle + current.times.irq
                const previousTicks = previous.times.user + previous.times.nice + previous.times.sys + previous.times.idle + previous.times.irq

                totalTick += (currentTicks - previousTicks)
                totalIdle += (current.times.idle - previous.times.idle)
            }
        }

        const idle = totalIdle / currentCpus.length
        const total = totalTick / currentCpus.length
        cpuUsage = total > 0 ? Math.round(100 - (100 * idle / total)) : 0
    }

    previousCpuInfo = currentCpus

    // RAM Usage
    const totalRAM = Math.round(os.totalmem() / 1024 / 1024)
    const freeRAM = Math.round(os.freemem() / 1024 / 1024)
    const usedRAM = totalRAM - freeRAM

    return {
        cpuUsage,
        ramUsage: usedRAM,
        ramTotal: totalRAM,
        diskIOSpeed: 0, // TODO: Implement real disk I/O tracking
        networkConnected: true,
        networkLatency: 50,
        gpuUsage: 0, // TODO: Implement cached GPU detection
        vramUsage: 0, // TODO: Implement cached VRAM detection
        vramTotal: 8192 // Fallback: 8GB VRAM
    }
}
