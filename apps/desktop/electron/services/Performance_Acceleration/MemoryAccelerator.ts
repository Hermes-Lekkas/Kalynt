/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { app, BrowserWindow, PowerMonitor } from 'electron'
import os from 'os'

export enum PerformanceMode {
    BALANCED = 'balanced',
    HIGH_PERFORMANCE = 'high_performance',
    POWER_SAVER = 'power_saver'
}

/**
 * MemoryAccelerator
 * 
 * Optimizes RAM usage across the main and renderer processes.
 * Implements aggressive garbage collection hints and memory pressure handling.
 */
export class MemoryAccelerator {
    private mode: PerformanceMode = PerformanceMode.BALANCED
    private gcTimer: NodeJS.Timeout | null = null
    private checkInterval: number = 60000 // 1 minute default
    private memoryThreshold: number = 0.8 // 80% RAM usage threshold

    constructor() {
        this.init()
    }

    private init() {
        // Listen for memory pressure events on macOS
        if (process.platform === 'darwin') {
            app.on('memory-pressure', (level) => {
                console.warn(`[MemoryAccelerator] Memory pressure detected: ${level}`)
                this.handleMemoryPressure(level)
            })
        }

        // Monitor system resources and adjust mode
        this.startMonitoring()
    }

    private startMonitoring() {
        if (this.gcTimer) clearInterval(this.gcTimer)
        
        this.gcTimer = setInterval(() => {
            this.checkMemoryUsage()
        }, this.checkInterval)
    }

    /**
     * Checks current memory usage and triggers GC if necessary.
     */
    private checkMemoryUsage() {
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedPercent = (totalMem - freeMem) / totalMem

        if (usedPercent > this.memoryThreshold) {
            this.requestGarbageCollection()
        }

        // If in Power Saver mode, be more aggressive
        if (this.mode === PerformanceMode.POWER_SAVER && usedPercent > 0.6) {
            this.requestGarbageCollection()
        }
    }

    /**
     * Attempts to trigger garbage collection in the main process and all windows.
     */
    public requestGarbageCollection() {
        // Main process GC (requires --expose-gc flag)
        if (typeof global.gc === 'function') {
            try {
                global.gc()
                console.log('[MemoryAccelerator] Main process GC triggered.')
            } catch (e) {
                console.error('[MemoryAccelerator] Failed to trigger main GC:', e)
            }
        }

        // Trigger GC and worker disposal in all renderer processes via IPC
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
            if (!win.isDestroyed()) {
                win.webContents.send('performance:request-gc')
                win.webContents.send('performance:dispose-workers')
            }
        }
    }

    /**
     * Handles memory pressure events from the OS.
     */
    private handleMemoryPressure(level: 'critical' | 'normal' | 'warning') {
        if (level === 'critical' || level === 'warning') {
            this.requestGarbageCollection()
            
            // In critical situations, we might want to kill background workers
            if (level === 'critical') {
                this.suspendBackgroundTasks()
            }
        }
    }

    private suspendBackgroundTasks() {
        // Logic to notify services to pause non-essential background tasks
        // (e.g., file indexing, heavy AI pre-loading)
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
            if (!win.isDestroyed()) {
                win.webContents.send('performance:suspend-background-tasks')
            }
        }
    }

    /**
     * Sets the performance mode of the application.
     */
    public setPerformanceMode(mode: PerformanceMode) {
        this.mode = mode
        console.log(`[MemoryAccelerator] Performance mode set to: ${mode}`)

        switch (mode) {
            case PerformanceMode.HIGH_PERFORMANCE:
                this.checkInterval = 120000 // Less frequent checks, prioritize compute
                this.memoryThreshold = 0.9
                break
            case PerformanceMode.BALANCED:
                this.checkInterval = 60000
                this.memoryThreshold = 0.8
                break
            case PerformanceMode.POWER_SAVER:
                this.checkInterval = 30000 // More frequent checks
                this.memoryThreshold = 0.5
                this.requestGarbageCollection()
                break
        }
        
        this.startMonitoring()
    }

    /**
     * Optimizes Monaco Editor settings by sending a configuration update to renderers.
     */
    public optimizeMonaco(win: BrowserWindow) {
        win.webContents.send('performance:optimize-monaco', {
            maxTokenizationLineLength: 10000,
            stopRenderingLineAfter: 5000,
            folding: this.mode !== PerformanceMode.POWER_SAVER,
            minimap: { enabled: this.mode !== PerformanceMode.POWER_SAVER },
            scrollbar: {
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            }
        })
    }

    public getStatus() {
        const processMem = process.memoryUsage()
        return {
            mode: this.mode,
            rss: Math.round(processMem.rss / 1024 / 1024),
            heapTotal: Math.round(processMem.heapTotal / 1024 / 1024),
            heapUsed: Math.round(processMem.heapUsed / 1024 / 1024),
            external: Math.round(processMem.external / 1024 / 1024)
        }
    }

    public dispose() {
        if (this.gcTimer) clearInterval(this.gcTimer)
    }
}
