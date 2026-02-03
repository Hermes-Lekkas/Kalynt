/**
 * Copyright 2026 Hermes Lekkas.
 * PROPRIETARY & CONFIDENTIAL.
 * 
 * This file is part of the Kalynt "Pro" Edition.
 * Unauthorized copying, distribution, or modification of this file, 
 * via any medium, is strictly prohibited.
 */

import path from 'path'
import fs from 'fs'
import type { Llama, LlamaModel, LlamaContext } from 'node-llama-cpp'

function validatePath(base: string, target: string): string {
    const resolvedTarget = path.resolve(base, target)
    if (!resolvedTarget.startsWith(path.resolve(base))) {
        throw new Error('Path traversal detected')
    }
    return resolvedTarget
}

let loadedModelId: string | null = null
let llamaModel: LlamaModel | null = null
let llamaContext: LlamaContext | null = null
let nodeLlamaCpp: typeof import('node-llama-cpp')
let llamaInstance: Llama | null = null

const activeGenerations = new Map<string, AbortController>()

export function registerLLMInferenceHandlers(
    ipcMain: Electron.IpcMain,
    getModelsDir: () => string
) {

    ipcMain.handle('load-model', async (_event, options: {
        modelId: string
        path: string
        contextLength: number
        expectedSizeBytes?: number
        aimeConfig?: {
            kvCacheQuantization?: 'none' | 'fp16' | 'q8' | 'q4'
            gpuLayers?: number
            useMemoryMapping?: boolean
            batchSize?: number
            threads?: number
        }
    }) => {
        console.log('[Main] Loading model:', options.modelId)
        console.log('[Main] Model path:', options.path)
        console.log('[Main] Context length:', options.contextLength)
        console.log('[Main] AIME Config:', options.aimeConfig || 'None (using defaults)')

        try {
            const MODELS_DIR = getModelsDir()

            const safePath = validatePath(MODELS_DIR, path.basename(options.path))
            console.log('[Main] Safe path resolved:', safePath)

            if (!fs.existsSync(safePath)) {
                const errorMsg = `Model file not found at: ${safePath}`
                console.error('[Main]', errorMsg)
                return { success: false, error: errorMsg }
            }

            const stats = fs.statSync(safePath)
            const fileSizeMB = stats.size / 1024 / 1024
            console.log('[Main] Model file size:', fileSizeMB.toFixed(2), 'MB')

            if (stats.size < 1024 * 1024) {
                return { success: false, error: 'Model file appears to be corrupted (too small). Please re-download.' }
            }

            if (options.expectedSizeBytes && options.expectedSizeBytes > 0) {
                const minExpectedSize = options.expectedSizeBytes * 0.90
                if (stats.size < minExpectedSize) {
                    const expectedMB = (options.expectedSizeBytes / 1024 / 1024).toFixed(2)
                    return {
                        success: false,
                        error: `Model file is incomplete (${fileSizeMB.toFixed(2)} MB of expected ${expectedMB} MB). Please delete the file and re-download the model from settings.`
                    }
                }
            }

            if (llamaModel) {
                console.log('[Main] Unloading previous model')
                llamaContext = null
                llamaModel = null
            }

            if (!nodeLlamaCpp) {
                console.log('[Main] Importing node-llama-cpp via dynamic import...')
                try {
                    // In production, node-llama-cpp is placed in resources/node_modules/ via extraResources
                    // We must import from there, not from app.asar
                    const isProduction = process.env.NODE_ENV === 'production' || !process.defaultApp

                    if (isProduction && process.resourcesPath) {
                        const llamaModulePath = path.join(process.resourcesPath, 'node_modules', 'node-llama-cpp')
                        console.log('[Main] Production mode - loading from:', llamaModulePath)

                        // Verify the module exists at the expected location
                        if (!fs.existsSync(llamaModulePath)) {
                            console.error('[Main] node-llama-cpp not found at:', llamaModulePath)
                            return { success: false, error: 'AI engine files are missing. Please reinstall the application.' }
                        }

                        // Use require for production since dynamic import with path may not work
                        nodeLlamaCpp = require(llamaModulePath)
                    } else {
                        console.log('[Main] Development mode - using standard import')
                        nodeLlamaCpp = await import('node-llama-cpp')
                    }

                    console.log('[Main] node-llama-cpp v3 loaded successfully')
                    console.log('[Main] Available exports:', Object.keys(nodeLlamaCpp).slice(0, 10).join(', '))
                } catch (e) {
                    console.error('[Main] Failed to import node-llama-cpp:', e)
                    const errMsg = e instanceof Error ? e.message : String(e)
                    return { success: false, error: `Failed to load AI engine: ${errMsg}. The library may not be properly installed.` }
                }
            }

            const { getLlama } = nodeLlamaCpp as any
            if (!getLlama) {
                console.error('[Main] getLlama not found in node-llama-cpp')
                console.error('[Main] Available exports:', Object.keys(nodeLlamaCpp).join(', '))
                return { success: false, error: 'AI engine is incompatible. Please reinstall the application.' }
            }

            console.log('[Main] Loading model using v3 API...')
            console.log('[Main] Model path:', safePath)
            console.log('[Main] Model exists:', fs.existsSync(safePath))
            console.log('[Main] Model size:', stats.size, 'bytes')

            try {

                if (!llamaInstance) {
                    console.log('[Main] Initializing Llama instance...')
                    llamaInstance = await getLlama()
                    console.log('[Main] Llama instance created')
                }

                const gpuLayers = options.aimeConfig?.gpuLayers ?? 0
                const useMemoryMapping = options.aimeConfig?.useMemoryMapping ?? true

                console.log('[Main] Loading model file...')
                console.log('[Main] AIME - GPU Layers:', gpuLayers)
                console.log('[Main] AIME - Memory Mapping:', useMemoryMapping)

                if (!llamaInstance) {
                    return { success: false, error: 'Failed to initialize Llama instance' }
                }
                llamaModel = await llamaInstance.loadModel({
                    modelPath: safePath,
                    gpuLayers: gpuLayers,
                    useMmap: useMemoryMapping
                })

                if (!llamaModel) {
                    return { success: false, error: 'Failed to load model. The model file may be corrupted.' }
                }
                console.log('[Main] Model loaded successfully')
                console.log('[Main] Model trained context size:', llamaModel.trainContextSize)

                const requestedContext = options.contextLength || 4096
                const maxSafeContext = Math.min(requestedContext, llamaModel.trainContextSize || requestedContext)

                const kvQuantization = options.aimeConfig?.kvCacheQuantization || 'q8'
                const batchSize = options.aimeConfig?.batchSize || 512
                const threads = options.aimeConfig?.threads || 4

                console.log('[Main] Creating context - requested:', requestedContext, 'safe max:', maxSafeContext)
                console.log('[Main] AIME - KV Cache Quantization:', kvQuantization)
                console.log('[Main] AIME - Batch Size:', batchSize)
                console.log('[Main] AIME - CPU Threads:', threads)

                const contextOptions: any = {
                    contextSize: {
                        min: 512,
                        max: maxSafeContext
                    },
                    failedCreationRemedy: {
                        retries: 3,
                        autoContextSizeShrink: 0.75
                    },
                    batchSize: batchSize,
                    threads: threads
                }

                if (kvQuantization === 'q8') {
                    contextOptions.flashAttention = true
                } else if (kvQuantization === 'q4') {
                    contextOptions.flashAttention = true

                }

                llamaContext = await llamaModel.createContext(contextOptions)
                console.log('[Main] Context created successfully with size:', llamaContext.contextSize)
                console.log('[Main] AIME optimizations applied')

            } catch (e) {
                console.error('[Main] Failed to load model:', e)
                const errMsg = e instanceof Error ? e.message : String(e)
                const errStack = e instanceof Error ? e.stack : 'No stack trace'
                console.error('[Main] Error stack:', errStack)

                console.error('[Main] Context creation details:', {
                    requestedSize: options.contextLength,
                    modelTrainSize: llamaModel?.trainContextSize,
                    modelPath: safePath
                })

                if (errMsg.includes('AVX') || errMsg.includes('CPU') || errMsg.includes('instruction')) {
                    return { success: false, error: 'Your CPU does not support the required instructions (AVX2). Try using a different model or system.' }
                } else if (errMsg.includes('memory') || errMsg.includes('RAM') || errMsg.includes('allocation') || errMsg.includes('context')) {
                    return { success: false, error: `Not enough RAM to create context for this model. Try closing other applications, use a smaller model, or reduce context size in settings.` }
                } else if (errMsg.includes('gguf') || errMsg.includes('format') || errMsg.includes('magic')) {
                    return { success: false, error: `Invalid or corrupted model file. Please re-download the model. Details: ${errMsg}` }
                } else {
                    return { success: false, error: `Failed to load model: ${errMsg}` }
                }
            }

            loadedModelId = options.modelId
            console.log('[Main] Model ready:', options.modelId)
            return { success: true }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            console.error('[Main] Model load error:', errorMessage)
            console.error('[Main] Error stack:', err instanceof Error ? err.stack : 'No stack trace')

            let userFriendlyError = errorMessage
            if (errorMessage.includes('Cannot find module')) {
                userFriendlyError = 'AI engine not properly installed. Please reinstall the application.'
            } else if (errorMessage.includes('invalid model file')) {
                userFriendlyError = 'Model file is corrupted or invalid. Please re-download the model.'
            } else if (errorMessage.includes('out of memory') || errorMessage.includes('OOM')) {
                userFriendlyError = 'Not enough RAM to load this model. Try closing other applications or use a smaller model.'
            }

            return { success: false, error: userFriendlyError }
        }
    })

    ipcMain.handle('unload-model', async () => {
        console.log('[Main] Unloading model:', loadedModelId)
        llamaContext = null
        llamaModel = null
        loadedModelId = null
        return { success: true }
    })

    ipcMain.handle('generate-completion', async (_event, options: {
        prompt: string
        maxTokens: number
        temperature: number
        topP: number
        stopSequences: string[]
        jsonSchema?: object
    }) => {
        if (!llamaContext || !llamaModel) {
            return { success: false, error: 'No model loaded' }
        }
        console.log('[Main] Generating completion for model:', loadedModelId)
        try {

            if (!nodeLlamaCpp) {
                return { success: false, error: 'AI engine not loaded' }
            }

            const { LlamaChat } = nodeLlamaCpp as any

            if (!LlamaChat) {

                console.log('[Main] LlamaChat not available, using direct sequence evaluation')
            }

            console.log('[Main] Prompt options:', {
                maxTokens: options.maxTokens,
                temperature: options.temperature,
                topP: options.topP,
                stopSequences: options.stopSequences
            })

            const abortController = new AbortController()
            let accumulatedText = ''
            const stopSequences = options.stopSequences || []

            const shouldStop = (text: string): string | null => {
                for (const stopSeq of stopSequences) {
                    if (text.includes(stopSeq)) {
                        return stopSeq
                    }
                }
                return null
            }

            try {

                const sequence = llamaContext!.getSequence()
                if (!sequence) {
                    throw new Error('Failed to get sequence from context')
                }

                const tokens = llamaModel.tokenize(options.prompt)

                let grammar: any = undefined
                if (options.jsonSchema && nodeLlamaCpp) {
                    try {
                        const { LlamaJsonSchemaGrammar } = nodeLlamaCpp as any
                        if (LlamaJsonSchemaGrammar) {
                            grammar = new LlamaJsonSchemaGrammar(llamaInstance, options.jsonSchema)
                            console.log('[Main] Using JSON schema grammar for constrained generation')
                        }
                    } catch (grammarErr) {
                        console.warn('[Main] Failed to create grammar, falling back to unconstrained:', grammarErr)
                    }
                }

                const evaluateOptions: any = {
                    temperature: options.temperature,
                    topP: options.topP,
                    signal: abortController.signal
                }

                if (grammar) {
                    evaluateOptions.grammar = grammar
                }

                for await (const token of sequence.evaluate(tokens, evaluateOptions)) {
                    const text = llamaModel.detokenize([token])
                    accumulatedText += text

                    if (accumulatedText.length > options.maxTokens * 4) break

                    const foundStop = shouldStop(accumulatedText)
                    if (foundStop) {
                        console.log('[Main] Stop sequence detected:', foundStop)
                        break
                    }
                }
            } catch (e: unknown) {

                const err = e as Error
                if (err.name !== 'AbortError' && !err.message?.includes('abort')) {
                    throw e
                }
            }

            let finalResponse = accumulatedText
            for (const stopSeq of stopSequences) {
                const idx = finalResponse.indexOf(stopSeq)
                if (idx !== -1) {
                    finalResponse = finalResponse.substring(0, idx)
                }
            }

            return { success: true, text: finalResponse.trim() }
        } catch (err) {
            console.error('[Main] Generation error:', err)
            const errorMessage = err instanceof Error ? err.message : String(err)
            return { success: false, error: errorMessage }
        }
    })

    ipcMain.on('generate-completion-stream', async (event, options: {
        prompt: string
        maxTokens: number
        temperature: number
        topP: number
        stopSequences: string[]
        jsonSchema?: object
        requestId: string
    }) => {
        const { requestId } = options
        if (!llamaContext || !llamaModel) {
            event.sender.send('generate-completion-complete', { requestId, error: 'No model loaded' })
            return
        }
        try {

            if (!nodeLlamaCpp) {
                throw new Error('node-llama-cpp not loaded')
            }

            const safeSend = (channel: string, data: unknown) => {
                try {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send(channel, data)
                    }
                } catch (_error) {

                }
            }

            const abortController = new AbortController()
            activeGenerations.set(requestId, abortController)
            let accumulatedText = ''
            const stopSequences = options.stopSequences || []

            const shouldStop = (text: string): boolean => {
                for (const stopSeq of stopSequences) {
                    if (text.includes(stopSeq)) {
                        console.log('[Main] Stop sequence detected:', stopSeq)
                        return true
                    }
                }
                return false
            }

            let aborted = false

            try {

                const sequence = llamaContext!.getSequence()
                if (!sequence) {
                    throw new Error('Failed to get sequence from context')
                }

                const tokens = llamaModel.tokenize(options.prompt)

                let grammar: any = undefined
                if (options.jsonSchema && nodeLlamaCpp) {
                    try {
                        const { LlamaJsonSchemaGrammar } = nodeLlamaCpp as any
                        if (LlamaJsonSchemaGrammar) {
                            grammar = new LlamaJsonSchemaGrammar(llamaInstance, options.jsonSchema)
                            console.log('[Main] Using JSON schema grammar for constrained generation')
                        }
                    } catch (grammarErr) {
                        console.warn('[Main] Failed to create grammar, falling back to unconstrained:', grammarErr)
                    }
                }

                const evaluateOptions: any = {
                    temperature: options.temperature,
                    topP: options.topP,
                    signal: abortController.signal
                }

                if (grammar) {
                    evaluateOptions.grammar = grammar
                }

                for await (const token of sequence.evaluate(tokens, evaluateOptions)) {
                    const text = llamaModel.detokenize([token])
                    accumulatedText += text

                    if (shouldStop(accumulatedText)) {
                        break
                    }

                    if (accumulatedText.length > options.maxTokens * 4) break

                    safeSend('generate-completion-token', { requestId, token: text })
                }
            } catch (err: unknown) {
                const e = err as Error

                if (e.name === 'AbortError' || e.message?.includes('abort')) {
                    console.log('[Main] Generation aborted by user')
                    aborted = true

                    safeSend('generate-completion-complete', {
                        requestId,
                        error: 'Aborted by user'
                    })
                    return
                }

                else if (e.message?.includes('assert') || e.message?.includes('NaN') || e.message?.includes('llsnan')) {
                    console.error('[Main] Model assertion failure (NaN error):', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ Model numerical error. This model has corrupted weights or incompatible quantization. Please try a different model (Qwen2.5-Coder recommended).'
                    })
                    return
                }

                else if (e.message?.includes('OutOfDeviceMemory') || e.message?.includes('allocateMemory')) {
                    console.error('[Main] GPU memory exhausted:', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ GPU memory exhausted. Try closing other applications or use a smaller context size.'
                    })
                    return
                }

                else if (e.message?.includes('Eval has failed') || e.message?.includes('llama_decode') || e.message?.includes('No sequences left')) {
                    console.error('[Main] Eval/sequence error:', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ Generation failed. Please try again.'
                    })
                    return
                }
                else {
                    throw err
                }
            }

            if (!aborted) {
                safeSend('generate-completion-complete', { requestId })
            }
        } catch (err) {
            console.error('[Main] Streaming generation error:', err)
            const errorMessage = err instanceof Error ? err.message : String(err)
            try {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('generate-completion-complete', { requestId, error: errorMessage })
                }
            } catch (_error) {

            }
        } finally {

            activeGenerations.delete(requestId)

            if (!event.sender.isDestroyed()) {

            }
        }
    })

    ipcMain.handle('cancel-generation', async (_event, requestId: string) => {
        try {
            const controller = activeGenerations.get(requestId)
            if (controller) {
                controller.abort()
                activeGenerations.delete(requestId)
                console.log('[Main] Cancelled generation:', requestId)
                return { success: true }
            }
            return { success: false, error: 'Generation not found' }
        } catch (err) {
            console.error('[Main] Cancel generation error:', err)
            return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
    })
}
