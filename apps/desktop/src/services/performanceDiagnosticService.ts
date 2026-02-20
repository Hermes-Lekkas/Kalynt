/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface DiagnosticResult {
    bootTime: number // ms
    ipcLatency: number // ms
    diskReadSpeed: number // MB/s
    diskWriteSpeed: number // MB/s
    cpuScore: number // relative score
    timestamp: number
}

class PerformanceDiagnosticService {
    /**
     * Measures IPC round-trip latency
     */
    public async measureIPCLatency(): Promise<number> {
        const start = performance.now()
        await window.electronAPI.ipcRenderer.invoke('performance:get-status')
        return performance.now() - start
    }

    /**
     * Measures Disk I/O speed using temporary files
     */
    public async measureDiskSpeed(): Promise<{ read: number, write: number }> {
        try {
            const result = await window.electronAPI.ipcRenderer.invoke('performance:test-disk-speed')
            return result
        } catch (e) {
            console.error('[PerformanceDiagnostic] Disk test failed:', e)
            return { read: 0, write: 0 }
        }
    }

    /**
     * Simple CPU benchmark (calculating primes)
     */
    public async runCPUBenchmark(): Promise<number> {
        const start = performance.now()
        const iterations = 500000 // Reduced iterations for UI responsiveness
        let _count = 0
        for (let i = 2; i < iterations; i++) {
            let isPrime = true
            for (let j = 2; j <= Math.sqrt(i); j++) {
                if (i % j === 0) {
                    isPrime = false
                    break
                }
            }
            if (isPrime) _count++
        }
        const duration = performance.now() - start
        // Score is inverse of duration
        return Math.round(100000 / duration)
    }

    /**
     * Runs all diagnostics
     */
    public async runFullDiagnostic(): Promise<DiagnosticResult> {
        const cpu = await this.runCPUBenchmark()
        const ipc = await this.measureIPCLatency()
        const disk = await this.measureDiskSpeed()

        // Boot time from main process
        const bootTime = await window.electronAPI.ipcRenderer.invoke('performance:get-boot-time')

        return {
            bootTime: bootTime || 0,
            ipcLatency: Math.round(ipc * 100) / 100,
            diskReadSpeed: Math.round(disk.read * 10) / 10,
            diskWriteSpeed: Math.round(disk.write * 10) / 10,
            cpuScore: cpu,
            timestamp: Date.now()
        }
    }
}

export const performanceDiagnosticService = new PerformanceDiagnosticService()
