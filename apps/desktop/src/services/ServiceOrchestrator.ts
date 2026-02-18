/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { logger } from '../utils/logger'

/**
 * ServiceOrchestrator
 * 
 * Manages the lazy loading and lifecycle of heavy services to minimize RAM usage.
 * Services are only initialized when first requested.
 */
class ServiceOrchestrator {
    private instances: Map<string, any> = new Map()
    private loaders: Map<string, () => Promise<any>> = new Map()

    constructor() {
        this.registerLoaders()
    }

    private registerLoaders() {
        // AI Services
        this.loaders.set('aiService', async () => {
            const { aiService } = await import('./aiService')
            return aiService
        })

        // Collaboration
        this.loaders.set('collabEngine', async () => {
            const { collabEngine } = await import('./collabEngine')
            return collabEngine
        })

        // Extension Services
        this.loaders.set('integrationService', async () => {
            const { integrationService } = await import('./integrationService')
            return integrationService
        })

        // Version Control
        this.loaders.set('versionControlService', async () => {
            const { versionControlService } = await import('./versionControlService')
            return versionControlService
        })
    }

    /**
     * Gets a service instance, loading it if necessary.
     */
    public async getService<T>(name: string): Promise<T> {
        if (this.instances.has(name)) {
            return this.instances.get(name)
        }

        const loader = this.loaders.get(name)
        if (!loader) {
            throw new Error(`[ServiceOrchestrator] No loader registered for service: ${name}`)
        }

        logger.general.info(`[ServiceOrchestrator] Loading service on-demand: ${name}`)
        const instance = await loader()
        this.instances.set(name, instance)
        return instance
    }

    /**
     * Attempts to unload a service to free up memory.
     * Note: This only works if the service supports a 'dispose' or 'hibernate' method
     * and if no other part of the app holds a strong reference to it.
     */
    public async hibernateService(name: string) {
        if (!this.instances.has(name)) return

        const instance = this.instances.get(name)
        if (instance && typeof instance.dispose === 'function') {
            logger.general.info(`[ServiceOrchestrator] Hibernating service: ${name}`)
            await instance.dispose()
            this.instances.delete(name)
        }
    }

    /**
     * Global cleanup of non-essential services.
     */
    public async hibernateAll() {
        const nonEssential = ['collabEngine', 'aiService']
        for (const name of nonEssential) {
            await this.hibernateService(name)
        }
    }
}

export const serviceOrchestrator = new ServiceOrchestrator()
