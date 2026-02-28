/**
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { OfflineModel, getModelById } from '../types/offlineModels'
import { useModelStore } from '../stores/modelStore'
import { hardwareService } from './hardwareService'
import { getModelSizeCategory } from './ideAgentTools'

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface InferenceOptions {
    maxTokens?: number
    temperature?: number
    topP?: number
    stopSequences?: string[]
    jsonSchema?: object
    onToken?: (token: string) => void
    timeoutMs?: number
}

const DEFAULT_OPTIONS: InferenceOptions = {
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    stopSequences: []
}

function cleanResponse(text: string): string {
    return text

        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>/g, '')
        .replace(/<\|im_end\|/g, '')
        .replace(/<\|im_start\|/g, '')

        .replace(/<\|end_of_text\|>/g, '')
        .replace(/<\|start_of_role\|>/g, '')

        .replace(/<\/s>/g, '')
        .replace(/<s>/g, '')
        .replace(/\[INST\]/g, '')
        .replace(/\[\/INST\]/g, '')

        .replace(/\n?(user|assistant|system)\s*$/gi, '')
        .trim()
}

function getStopSequences(model: OfflineModel): string[] {
    const template = model.promptTemplate

    if (template.includes('<|im_start|>')) {
        return ['<|im_end|>']
    }

    if (template.includes('[INST]')) {
        return ['</s>']
    }

    if (template.includes('<|start_of_role|>')) {
        return ['<|end_of_text|>']
    }

    return []
}

function formatPrompt(model: OfflineModel, messages: ChatMessage[]): string {
    const template = model.promptTemplate

    const isQwen = template.includes('<|im_start|>')
    const isDevstral = template.includes('[INST]')
    const isGranite = template.includes('<|start_of_role|>')

    const systemMessages = messages.filter(m => m.role === 'system')
    const systemContent = systemMessages.map(m => m.content).join('\n').trim()

    const conversationMessages = messages.filter(m => m.role !== 'system')

    if (isQwen) {
        let formatted = ''
        if (systemContent) {
            formatted += `<|im_start|>system\n${systemContent}<|im_end|>\n`
        }
        for (const msg of conversationMessages) {
            formatted += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`
        }
        formatted += '<|im_start|>assistant\n'
        return formatted
    }

    if (isDevstral) {
        let formatted = '<s>'

        const firstUserMsg = conversationMessages.find(m => m.role === 'user')
        if (firstUserMsg) {
            const systemPrefix = systemContent ? `${systemContent}\n\n` : ''
            formatted += `[INST] ${systemPrefix}${firstUserMsg.content} [/INST]`

            let skipNext = true
            for (let i = 0; i < conversationMessages.length; i++) {
                const msg = conversationMessages[i]
                if (msg.role === 'user' && skipNext) {
                    skipNext = false
                    continue
                }

                if (msg.role === 'assistant') {
                    formatted += ` ${msg.content}</s>`
                } else if (msg.role === 'user') {
                    formatted += ` [INST] ${msg.content} [/INST]`
                }
            }
        } else {

            formatted += `[INST] ${systemContent} [/INST]`
        }

        return formatted
    }

    if (isGranite) {
        let formatted = ''
        if (systemContent) {
            formatted += `<|start_of_role|>system<|end_of_role|>${systemContent}<|end_of_text|>\n`
        }
        for (const msg of conversationMessages) {
            formatted += `<|start_of_role|>${msg.role}<|end_of_role|>${msg.content}<|end_of_text|>\n`
        }
        formatted += '<|start_of_role|>assistant<|end_of_role|>'
        return formatted
    }

    console.warn('[OfflineLLM] Unknown prompt template format, using fallback')
    const lastUser = conversationMessages.filter(m => m.role === 'user').pop()?.content || ''
    return template
        .replace('{system}', systemContent)
        .replace('{user}', lastUser)
}

class OfflineLLMService {
    private isModelLoaded = false
    private currentModelId: string | null = null
    private currentRequestId: string | null = null

    async loadModel(modelId: string): Promise<boolean> {
        const model = getModelById(modelId)
        const store = useModelStore.getState()

        if (!model) {
            const error = `Model configuration not found: ${modelId}`
            console.error('[OfflineLLM]', error)
            store.setLoadError(error)
            return false
        }

        const downloaded = store.getDownloadedModel(modelId)
        if (!downloaded) {
            const error = `Model not downloaded: ${model.name}. Please download it first from the settings panel.`
            console.error('[OfflineLLM]', error)
            store.setLoadError(error)
            return false
        }

        console.log('[OfflineLLM] Attempting to load model:', {
            modelId,
            name: model.name,
            path: downloaded.path,
            size: (downloaded.sizeBytes / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        })

        if (window.electronAPI?.fileExists) {
            const exists = await window.electronAPI.fileExists(downloaded.path)
            if (!exists) {
                const error = `Model file not found at: ${downloaded.path}. Try re-downloading the model.`
                console.error('[OfflineLLM]', error)
                store.setLoadError(error)
                return false
            }
            console.log('[OfflineLLM] Model file verified on disk')
        }

        if (this.currentModelId && this.currentModelId !== modelId) {
            await this.unloadModel()
        }

        if (this.currentModelId === modelId && this.isModelLoaded) {
            console.log('[OfflineLLM] Model already loaded:', modelId)
            return true
        }

        store.setLoading(true)
        console.log('[OfflineLLM] Loading model:', model.name)

        try {

            if (!globalThis.window.electronAPI?.loadModel) {
                const errorMsg = 'Offline AI is not available in this environment. Please run in the desktop app.'
                console.error('[OfflineLLM]', errorMsg)
                store.setLoadError(errorMsg)
                store.setLoading(false)
                return false
            }

            let contextLength = model.contextLength
            try {
                const storedContexts = localStorage.getItem('model-context-settings')
                if (storedContexts) {
                    const contexts = JSON.parse(storedContexts)
                    if (contexts[modelId]) {
                        contextLength = contexts[modelId]
                        console.log('[OfflineLLM] Using custom context length:', contextLength, 'tokens')
                    }
                }
            } catch (e) {
                console.warn('[OfflineLLM] Failed to read custom context settings:', e)
            }

            let aimeConfig: any = undefined
            try {
                const storedAIME = localStorage.getItem('aime-config')
                if (storedAIME) {
                    aimeConfig = JSON.parse(storedAIME)
                    console.log('[OfflineLLM] Using AIME configuration:', aimeConfig)
                }
            } catch (e) {
                console.warn('[OfflineLLM] Failed to read AIME configuration:', e)
            }

            // Hardware Auto-Detection: Recommend GPU layers if not explicitly set
            if (!aimeConfig || aimeConfig.gpuLayers === undefined) {
                try {
                    const recommendedLayers = await hardwareService.getRecommendedGPULayers(model.sizeBytes / 1024 / 1024)
                    if (recommendedLayers > 0) {
                        console.log('[OfflineLLM] Auto-detected hardware: recommending', recommendedLayers, 'GPU layers')
                        aimeConfig = { ...aimeConfig, gpuLayers: recommendedLayers }
                    }
                } catch (e) {
                    console.warn('[OfflineLLM] Hardware auto-detection failed:', e)
                }
            }

            const electronAPI = globalThis.window.electronAPI as any
            const result = await electronAPI.loadModel({
                modelId,
                path: downloaded.path,
                contextLength,
                expectedSizeBytes: model.sizeBytes,
                aimeConfig
            })

            if (!result.success) {
                throw new Error(result.error || 'Failed to load model')
            }

            this.isModelLoaded = true
            this.currentModelId = modelId
            store.setLoadedModel(modelId)
            store.setLoading(false)

            // Automatic Speculative Decoding: Load draft model for large models
            const modelTier = getModelSizeCategory(modelId)
            if (modelTier === 'large' || modelTier === 'medium') {
                const downloadedModels = store.downloadedModels
                const draftCandidate = Object.keys(downloadedModels).find(id =>
                    (id.includes('1.5b') || id.includes('1b') || id.includes('tiny')) && id !== modelId
                )

                if (draftCandidate) {
                    console.log('[OfflineLLM] Auto-speculation: Loading draft model', draftCandidate)
                    void this.loadDraftModel(draftCandidate)
                }
            }

            console.log('[OfflineLLM] Model loaded successfully:', model.name)
            return true
        } catch (error) {
            console.error('[OfflineLLM] Load error:', error)
            store.setLoadError(error instanceof Error ? error.message : 'Load failed')
            store.setLoading(false)
            return false
        }
    }

    async unloadModel(): Promise<void> {
        if (!this.isModelLoaded) return

        console.log('[OfflineLLM] Unloading model:', this.currentModelId)

        if (globalThis.window.electronAPI?.unloadModel) {
            await globalThis.window.electronAPI.unloadModel()
        }

        this.isModelLoaded = false
        this.currentModelId = null
        useModelStore.getState().setLoadedModel(null)
    }

    async generate(
        messages: ChatMessage[],
        options: InferenceOptions = {}
    ): Promise<string> {
        return await this.generateStreamWithRetry(
            messages,
            () => { },
            options
        )
    }

    async generateStream(
        messages: ChatMessage[],
        onToken: (token: string) => void,
        options: InferenceOptions = {}
    ): Promise<string> {
        if (!this.isModelLoaded || !this.currentModelId) {
            throw new Error('No model loaded')
        }

        const model = getModelById(this.currentModelId)
        if (!model) {
            throw new Error('Model configuration not found')
        }

        const opts = { ...DEFAULT_OPTIONS, ...options, onToken }
        const prompt = formatPrompt(model, messages)

        const modelStopSequences = getStopSequences(model)
        const stopSequences = [...modelStopSequences, ...(opts.stopSequences || [])]

        console.log('[OfflineLLM] Starting streaming generation...')
        console.log('[OfflineLLM] Stop sequences:', stopSequences)

        try {
            const streamFn = globalThis.window.electronAPI?.generateCompletionStream
            if (!streamFn) {
                throw new Error('Streaming generation is not supported by the current app version.')
            }

            return await new Promise((resolve, reject) => {
                let fullText = ''
                let completed = false

                // Timeout mechanism
                const timeoutMs = opts.timeoutMs || 60000
                const timeoutId = setTimeout(() => {
                    if (!completed) {
                        completed = true
                        this.currentRequestId = null
                        console.warn('[OfflineLLM] Generation timeout, returning partial result')
                        resolve(cleanResponse(fullText))
                    }
                }, timeoutMs)

                const requestId = streamFn(
                    {
                        prompt,
                        maxTokens: opts.maxTokens!,
                        temperature: opts.temperature!,
                        topP: opts.topP!,
                        stopSequences,
                        jsonSchema: opts.jsonSchema
                    },
                    (token) => {
                        fullText += token
                        onToken(token)
                    },
                    (error) => {
                        clearTimeout(timeoutId)
                        if (completed) return
                        completed = true
                        this.currentRequestId = null

                        if (error) {
                            if (error.includes('Aborted') || error.includes('abort')) {
                                console.log('[OfflineLLM] Generation aborted, returning partial result')
                                resolve(cleanResponse(fullText))
                            } else {
                                reject(new Error(error))
                            }
                        } else {
                            resolve(cleanResponse(fullText))
                        }
                    }
                )

                this.currentRequestId = requestId
            })
        } catch (error) {
            console.error('[OfflineLLM] Streaming error:', error)
            throw error
        }
    }

    isLoaded(): boolean {
        return this.isModelLoaded
    }

    getLoadedModelId(): string | null {
        return this.currentModelId
    }

    async cancelGeneration(): Promise<boolean> {
        if (!this.currentRequestId) {
            return false
        }

        try {
            const cancelFn = globalThis.window.electronAPI?.cancelGeneration
            if (!cancelFn) {
                console.error('[OfflineLLM] Cancel not supported in this environment')
                return false
            }

            const success = await cancelFn(this.currentRequestId)
            if (success) {
                console.log('[OfflineLLM] Generation cancelled:', this.currentRequestId)
                this.currentRequestId = null
                return true
            }
            return false
        } catch (error) {
            console.error('[OfflineLLM] Cancel error:', error)
            return false
        }
    }

    isGenerating(): boolean {
        return this.currentRequestId !== null
    }

    // Health check for loaded model
    async checkModelHealth(): Promise<boolean> {
        if (!this.isModelLoaded) return false
        
        try {
            const result = await this.generate([
                { role: 'user', content: 'Hello' }
            ], { maxTokens: 5, timeoutMs: 5000 })
            return result.length > 0
        } catch (error) {
            console.error('[OfflineLLM] Model health check failed:', error)
            await this.unloadModel()
            return false
        }
    }

    // Load model with fallback mechanism
    async loadModelWithFallback(modelId: string, maxRetries: number = 1): Promise<boolean> {
        let attempt = 0
        
        while (attempt <= maxRetries) {
            try {
                console.log(`[OfflineLLM] Loading model attempt ${attempt + 1}/${maxRetries + 1}: ${modelId}`)
                const success = await this.loadModel(modelId)
                if (success) {
                    const healthCheck = await this.checkModelHealth()
                    if (healthCheck) {
                        console.log('[OfflineLLM] Model loaded and healthy:', modelId)
                        return true
                    } else {
                        console.warn('[OfflineLLM] Model loaded but failed health check:', modelId)
                        await this.unloadModel()
                    }
                }
            } catch (error) {
                console.error(`[OfflineLLM] Load attempt ${attempt + 1} failed for ${modelId}:`, error)
            }
            
            attempt++
            if (attempt <= maxRetries) {
                console.log(`[OfflineLLM] Retrying in ${1000 * Math.pow(2, attempt)}ms...`)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
            }
        }
        
        // Try fallback models
        return await this.tryFallbackModels(modelId)
    }

    private async tryFallbackModels(originalModelId: string): Promise<boolean> {
        const fallbackModels = ['llama2-7b-chat', 'mistral-7b'] // Common small models
        const store = useModelStore.getState()
        
        for (const fallbackId of fallbackModels) {
            if (fallbackId === originalModelId) continue
            
            if (store.downloadedModels[fallbackId]) {
                try {
                    console.log(`[OfflineLLM] Trying fallback model: ${fallbackId}`)
                    const success = await this.loadModel(fallbackId)
                    if (success) {
                        const healthCheck = await this.checkModelHealth()
                        if (healthCheck) {
                            console.log('[OfflineLLM] Fallback model loaded successfully:', fallbackId)
                            return true
                        }
                    }
                } catch (error) {
                    console.error(`[OfflineLLM] Fallback model ${fallbackId} failed:`, error)
                }
            }
        }
        
        return false
    }

    // Generate with retry mechanism
    async generateStreamWithRetry(
        messages: ChatMessage[],
        onToken: (token: string) => void,
        options: InferenceOptions = {},
        maxRetries: number = 2
    ): Promise<string> {
        let lastError: Error | null = null
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Check model health before generation if not first attempt
                if (attempt > 0 && (!this.isModelLoaded || !await this.checkModelHealth())) {
                    console.log(`[OfflineLLM] Model not healthy, reloading for attempt ${attempt + 1}`)
                    if (this.currentModelId) {
                        await this.loadModel(this.currentModelId)
                    }
                }
                
                console.log(`[OfflineLLM] Generation attempt ${attempt + 1}/${maxRetries + 1}`)
                return await this.generateStream(messages, onToken, options)
            } catch (error) {
                lastError = error as Error
                console.warn(`[OfflineLLM] Generation attempt ${attempt + 1} failed:`, lastError.message)
                
                if (attempt < maxRetries) {
                    const delay = 1000 * Math.pow(2, attempt)
                    console.log(`[OfflineLLM] Retrying in ${delay}ms...`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                }
            }
        }
        
        throw lastError || new Error('All generation attempts failed')
    }

    /**
     * Get the context window for the currently loaded model.
     * Takes into account user-defined overrides.
     */
    getContextWindow(): number {
        if (!this.currentModelId) return 4096

        const model = getModelById(this.currentModelId)
        if (!model) return 4096

        let contextLength = model.contextLength
        try {
            const storedContexts = localStorage.getItem('model-context-settings')
            if (storedContexts) {
                const contexts = JSON.parse(storedContexts)
                if (contexts[this.currentModelId]) {
                    contextLength = contexts[this.currentModelId]
                }
            }
        } catch (e) {
            console.warn('[OfflineLLM] Failed to read custom context settings:', e)
        }

        return contextLength
    }

    // --- Speculative Decoding: Draft Model ---

    async loadDraftModel(modelId: string): Promise<boolean> {
        const model = getModelById(modelId)
        if (!model) {
            console.error('[OfflineLLM] Draft model not found:', modelId)
            return false
        }

        const store = useModelStore.getState()
        const downloaded = store.getDownloadedModel(modelId)
        if (!downloaded) {
            console.error('[OfflineLLM] Draft model not downloaded:', modelId)
            return false
        }

        try {
            const electronAPI = globalThis.window.electronAPI as any
            if (!electronAPI?.loadDraftModel) {
                console.warn('[OfflineLLM] Draft model loading not supported in this environment')
                return false
            }

            const result = await electronAPI.loadDraftModel({
                modelId,
                path: downloaded.path
            })

            if (result?.success) {
                console.log('[OfflineLLM] Draft model loaded for speculative decoding:', model.name)
                store.setDraftModelId(modelId)
                return true
            }

            console.error('[OfflineLLM] Failed to load draft model:', result?.error)
            return false
        } catch (error) {
            console.error('[OfflineLLM] Draft model load error:', error)
            return false
        }
    }

    async unloadDraftModel(): Promise<void> {
        try {
            const electronAPI = globalThis.window.electronAPI as any
            if (electronAPI?.unloadDraftModel) {
                await electronAPI.unloadDraftModel()
                useModelStore.getState().setDraftModelId(null)
                console.log('[OfflineLLM] Draft model unloaded')
            }
        } catch (error) {
            console.error('[OfflineLLM] Draft model unload error:', error)
        }
    }

    async getDraftModelStatus(): Promise<{ loaded: boolean; modelId: string | null }> {
        try {
            const electronAPI = globalThis.window.electronAPI as any
            if (electronAPI?.getDraftModelStatus) {
                const result = await electronAPI.getDraftModelStatus()
                return { loaded: result?.loaded ?? false, modelId: result?.modelId ?? null }
            }
        } catch (error) {
            console.error('[OfflineLLM] Draft model status error:', error)
        }
        return { loaded: false, modelId: null }
    }
}

export const offlineLLMService = new OfflineLLMService()
