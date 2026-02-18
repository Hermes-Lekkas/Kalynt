/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useEffect } from 'react'
import { logger } from '../utils/logger'

/**
 * usePerformanceAcceleration
 * 
 * Hook to handle performance acceleration events from the main process.
 */
export function usePerformanceAcceleration() {
    useEffect(() => {
        if (!window.electronAPI?.on) return

        // Handle Garbage Collection Request
        const removeGcListener = window.electronAPI.on('performance:request-gc', () => {
            logger.general.info('[Performance] GC requested by main process')
            // In a browser/electron environment, we can't force GC directly 
            // without flags, but we can clear caches or trigger minor cleanup.
            // If --expose-gc is used, we could call window.gc()
            if (typeof (window as any).gc === 'function') {
                try {
                    (window as any).gc()
                } catch (e) {
                    console.error('GC failed', e)
                }
            }
        })

        // Handle Suspend Background Tasks
        const removeSuspendListener = window.electronAPI.on('performance:suspend-background-tasks', () => {
            logger.general.warn('[Performance] Suspending background tasks due to memory pressure')
            // Dispatch a global event for components to react
            window.dispatchEvent(new CustomEvent('kalynt-suspend-background'))
        })

        // Handle Monaco Optimization
        const removeMonacoListener = window.electronAPI.on('performance:optimize-monaco', (options: any) => {
            logger.general.info('[Performance] Applying Monaco optimizations', options)
            // Store these options globally so Editor component can pick them up
            localStorage.setItem('kalynt-monaco-optimization', JSON.stringify(options))
            window.dispatchEvent(new CustomEvent('kalynt-monaco-optimize', { detail: options }))
        })

        // Handle Worker Disposal
        const removeWorkerListener = window.electronAPI.on('performance:dispose-workers', () => {
            logger.general.info('[Performance] Disposing idle workers and hibernating services')
            window.dispatchEvent(new CustomEvent('kalynt-dispose-workers'))
            // Trigger hibernation for heavy services via orchestrator
            import('../services/ServiceOrchestrator').then(({ serviceOrchestrator }) => {
                serviceOrchestrator.hibernateAll()
            })
        })

        return () => {
            removeGcListener()
            removeSuspendListener()
            removeMonacoListener()
            removeWorkerListener()
        }
    }, [])

    const setPerformanceMode = async (mode: 'balanced' | 'high_performance' | 'power_saver') => {
        if (window.electronAPI?.ipcRenderer?.invoke) {
            return await window.electronAPI.ipcRenderer.invoke('performance:set-mode', mode)
        }
    }

    const getPerformanceStatus = async () => {
        if (window.electronAPI?.ipcRenderer?.invoke) {
            return await window.electronAPI.ipcRenderer.invoke('performance:get-status')
        }
    }

    return { setPerformanceMode, getPerformanceStatus }
}
