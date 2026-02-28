/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { nativeHelperService } from '../native-helper-service'
import { PerformanceMode } from './MemoryAccelerator'

/**
 * ComputeAccelerator
 * 
 * Optimizes CPU/GPU intensive tasks, specifically LLM inference 
 * and heavy process management.
 */
export class ComputeAccelerator {
    private mode: PerformanceMode = PerformanceMode.BALANCED
    private isNativeSupported: boolean = false

    constructor() {
        this.isNativeSupported = nativeHelperService.isAvailable()
    }

    public setPerformanceMode(mode: PerformanceMode) {
        this.mode = mode
        this.applyProcessPriorities()
    }

    /**
     * Adjusts the OS-level priority of the current process and its children.
     * Uses 'renice' on Unix or 'SetPriorityClass' on Windows (via native helper).
     */
    private async applyProcessPriorities() {
        const priority = this.mode === PerformanceMode.HIGH_PERFORMANCE ? 'high' : 'normal'
        
        if (this.isNativeSupported) {
            try {
                await nativeHelperService.request('process:set-priority', { priority })
            } catch (_e) {
                // Ignore failure
            }
        }
    }

    /**
     * Optimizes LLM inference configuration based on performance mode and hardware.
     */
    public getInferenceOptimization(hardware: any) {
        const config: any = {
            useSpeculativeDecoding: false,
            kvCacheQuantization: 'f16',
            maxBatchSize: 1
        }

        if (this.mode === PerformanceMode.HIGH_PERFORMANCE) {
            config.useSpeculativeDecoding = hardware.hasGPU
            config.kvCacheQuantization = 'q4' // Better speed, less RAM
            config.maxBatchSize = 4
        } else if (this.mode === PerformanceMode.POWER_SAVER) {
            config.kvCacheQuantization = 'q8' // Better quality, more compute but maybe less RAM overall?
            // Actually for power saver we want to minimize compute
            config.maxBatchSize = 1
        }

        return config
    }

    /**
     * Offloads heavy computation to the native helper if possible.
     */
    public async runNativeTask(taskName: string, params: any) {
        if (this.isNativeSupported) {
            return nativeHelperService.request(`compute:${taskName}`, params)
        }
        throw new Error('Native compute acceleration not available')
    }

    /**
     * Optimizes IPC communication by determining if updates should be throttled.
     */
    public shouldThrottleUpdate(lastUpdate: number, type: string): boolean {
        const now = Date.now()
        const elapsed = now - lastUpdate

        if (this.mode === PerformanceMode.POWER_SAVER) {
            return elapsed < 200 // Max 5 FPS for UI updates
        }

        if (type === 'terminal' || type === 'monitor') {
            return elapsed < 50 // 20 FPS
        }

        return false
    }
}
