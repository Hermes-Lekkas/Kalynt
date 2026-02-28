/**
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import type { Llama, LlamaModel, LlamaContext } from 'node-llama-cpp'
import { nativeHelperService } from '../services/native-helper-service'

function validatePath(base: string, target: string): string {
    const resolvedTarget = path.resolve(base, target)
    if (!resolvedTarget.startsWith(path.resolve(base))) {
        throw new Error('Path traversal detected')
    }
    return resolvedTarget
}

// State for active model
let llamaInstance: Llama | null = null
let llamaModel: LlamaModel | null = null
let llamaContext: LlamaContext | null = null
let loadedModelId: string | null = null
let nodeLlamaCpp: typeof import('node-llama-cpp')

// State for speculative decoding
let draftModel: LlamaModel | null = null
let draftContext: LlamaContext | null = null // Persist context to avoid reallocation
let draftModelId: string | null = null

const activeGenerations = new Map<string, AbortController>()

/**
 * ESM FIX: Create a dynamic import that bundlers can't transform to require()
 * The Function constructor creates a new scope where the import() is evaluated at runtime,
 * preventing Rollup/Vite from converting it to require() during bundling.
 * This is necessary because node-llama-cpp is an ESM-only package.
 */
async function dynamicImportESM(modulePath: string): Promise<any> {
    // SECURITY: Validate module path is within expected locations
    // Only allow node-llama-cpp from node_modules, resources, or as bare module name
    const normalizedPath = path.normalize(modulePath).toLowerCase()

    // Allow bare module name 'node-llama-cpp' (used in development mode)
    // Node.js resolves this through standard module resolution to node_modules
    const isBareModuleName = modulePath === 'node-llama-cpp'

    const allowedPatterns = [
        'node_modules/node-llama-cpp',
        'node_modules\\node-llama-cpp',
        'resources/node_modules/node-llama-cpp',
        'resources\\node_modules\\node-llama-cpp'
    ]

    const isAllowedPath = allowedPatterns.some(pattern =>
        normalizedPath.includes(pattern.toLowerCase())
    )

    if (!isBareModuleName && !isAllowedPath) {
        throw new Error(`Unauthorized module path: ${modulePath}`)
    }

    // WINDOWS FIX: Convert file paths to file:// URLs for ESM compatibility
    // On Windows, absolute paths like C:\Users\... cause "Received protocol 'c:'" error
    // pathToFileURL handles both Windows and Unix paths correctly
    const importPath = isBareModuleName ? modulePath : pathToFileURL(modulePath).href

    // SECURITY FIX: Use direct dynamic import instead of new Function()
    // This prevents arbitrary code execution while still supporting ESM
    // The import path is already validated above
    return import(importPath)
}

let useNativeInference = false

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
        
        try {
            const MODELS_DIR = getModelsDir()
            const safePath = validatePath(MODELS_DIR, path.basename(options.path))
            
            // Check if it's a CoreML model on macOS
            const isCoreML = safePath.endsWith('.mlmodel') || safePath.endsWith('.mlmodelc')
            if (isCoreML && process.platform === 'darwin' && nativeHelperService.isAvailable()) {
                console.log('[Main] Loading CoreML model via Swift Helper:', safePath)
                const result = await nativeHelperService.request('llm-load', { path: safePath })
                if (result.success) {
                    useNativeInference = true
                    loadedModelId = options.modelId
                    return { success: true, native: true }
                }
            }

            useNativeInference = false
            // Existing node-llama-cpp loading logic...

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

                        // ESM FIX: Use dynamicImportESM to prevent bundler from converting to require()
                        nodeLlamaCpp = await dynamicImportESM(llamaModulePath)
                    } else {
                        console.log('[Main] Development mode - using standard import')
                        // ESM FIX: Use dynamicImportESM to prevent bundler from converting to require()
                        nodeLlamaCpp = await dynamicImportESM('node-llama-cpp')
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

                // Auto-detect small models and apply speed optimizations
                const isSmallModel = /1\.5b|1b|3b|4b/i.test(options.modelId)
                const isTinyModel = /1\.5b|1b/i.test(options.modelId)

                // Use larger context for small models to prevent truncation of code/logs
                let requestedContext = options.contextLength || 8192
                if (isTinyModel && requestedContext > 8192) {
                    console.log('[Main] Tiny model detected - limiting context to 8192 for speed/RAM')
                    requestedContext = 8192
                } else if (isSmallModel && requestedContext > 16384) {
                    console.log('[Main] Small model detected - limiting context to 16384 for speed/RAM')
                    requestedContext = 16384
                }

                const maxSafeContext = Math.min(requestedContext, llamaModel.trainContextSize || requestedContext)

                // Apply speed-optimized defaults for small models
                const kvQuantization = options.aimeConfig?.kvCacheQuantization || (isSmallModel ? 'q4' : 'q8')
                const batchSize = options.aimeConfig?.batchSize || (isTinyModel ? 64 : isSmallModel ? 128 : 256)
                const threads = options.aimeConfig?.threads || (isTinyModel ? 2 : isSmallModel ? 4 : 4)

                console.log('[Main] Creating context - requested:', requestedContext, 'safe max:', maxSafeContext)
                console.log('[Main] Model category:', isTinyModel ? 'tiny' : isSmallModel ? 'small' : 'standard')
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
        // Also unload draft model when main model is unloaded
        draftModel = null
        draftModelId = null
        return { success: true }
    })

    // Speculative Decoding: Load a small draft model alongside the target
    ipcMain.handle('load-draft-model', async (_event, options: {
        modelId: string
        path: string
    }) => {
        console.log('[Main] Loading draft model for speculative decoding:', options.modelId)
        try {
            if (!llamaInstance) {
                return { success: false, error: 'Main Llama instance not initialized. Load a target model first.' }
            }

            const MODELS_DIR = getModelsDir()
            const safePath = validatePath(MODELS_DIR, path.basename(options.path))

            if (!fs.existsSync(safePath)) {
                return { success: false, error: `Draft model file not found: ${safePath}` }
            }

            // Unload previous draft model with better cleanup
            if (draftModel) {
                console.log('[Main] Unloading previous draft model:', draftModelId)
                if (draftContext) {
                    try { 
                        await draftContext.dispose() 
                        // Force garbage collection hint
                        if (global.gc) global.gc()
                    } catch (e) { console.error('Error disposing draft context:', e) }
                    draftContext = null
                }
                draftModel = null
                draftModelId = null
                // Small delay to ensure memory is freed
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            // Try to load draft model with CPU-only settings to save VRAM
            console.log('[Main] Loading draft model with CPU-only settings...')
            draftModel = await llamaInstance.loadModel({
                modelPath: safePath,
                gpuLayers: 0, // Draft model runs on CPU for minimal VRAM usage
                useMmap: true,
                useMlock: false // Don't lock memory
            })

            // Try to create context with progressive fallback
            console.log('[Main] Creating draft context with memory-safe settings...')
            const contextAttempts = [
                { contextSize: { min: 512, max: 2048 }, batchSize: 256, threads: 2 },
                { contextSize: { min: 512, max: 1024 }, batchSize: 128, threads: 2 },
                { contextSize: { min: 256, max: 512 }, batchSize: 64, threads: 1 }
            ]

            let lastError: Error | null = null
            for (const attempt of contextAttempts) {
                try {
                    draftContext = await draftModel.createContext({
                        ...attempt,
                        failedCreationRemedy: {
                            retries: 2,
                            autoContextSizeShrink: 0.5
                        }
                    })
                    console.log('[Main] Draft context created successfully with:', attempt)
                    break
                } catch (e) {
                    lastError = e as Error
                    console.warn(`[Main] Draft context attempt failed:`, attempt, e)
                    // Wait a bit before retry
                    await new Promise(resolve => setTimeout(resolve, 50))
                }
            }

            if (!draftContext) {
                // Clean up model if context creation failed
                draftModel = null
                throw lastError || new Error('Failed to create draft context after all attempts')
            }

            draftModelId = options.modelId
            console.log('[Main] Draft model & context loaded successfully:', options.modelId)
            return { success: true }
        } catch (err) {
            console.error('[Main] Failed to load draft model:', err)
            // Clean up any partial state
            if (draftContext) {
                try { await draftContext.dispose() } catch { /* ignore */ }
                draftContext = null
            }
            draftModel = null
            draftModelId = null
            const errorMessage = err instanceof Error ? err.message : String(err)
            return { success: false, error: `Failed to load draft model: ${errorMessage}` }
        }
    })

    ipcMain.handle('unload-draft-model', async () => {
        console.log('[Main] Unloading draft model:', draftModelId)
        if (draftContext) {
            try { await draftContext.dispose() } catch (e) { console.error('Error disposing draft context:', e) }
            draftContext = null
        }
        draftModel = null
        draftModelId = null
        return { success: true }
    })

    ipcMain.handle('get-draft-model-status', async () => {
        return {
            success: true,
            loaded: draftModel !== null,
            modelId: draftModelId
        }
    })

    ipcMain.handle('generate-completion', async (_event, options: {
        prompt: string
        maxTokens: number
        temperature: number
        topP: number
        stopSequences: string[]
        jsonSchema?: object
    }) => {
        if (useNativeInference && nativeHelperService.isAvailable()) {
            try {
                const result = await nativeHelperService.request('llm-predict', {
                    prompt: options.prompt,
                    maxTokens: options.maxTokens
                })
                return { success: true, text: result.text }
            } catch (e) {
                console.error('[Main] Native inference failed:', e)
                return { success: false, error: String(e) }
            }
        }

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

            // Capture model reference at start to detect if it gets unloaded during generation
            const currentModel = llamaModel
            let sequence: any = null
            const draftContext: any = null
            let draftSequence: any = null
            try {
                sequence = llamaContext!.getSequence()
                if (!sequence) {
                    throw new Error('Failed to get sequence from context')
                }

                if (!currentModel) {
                    throw new Error('Model was unloaded before generation started')
                }
                const tokens = currentModel.tokenize(options.prompt)

                // Speculative Decoding: Set up draft model sequence for acceleration
                // Speculative Decoding: Set up draft model sequence for acceleration
                if (draftModel && draftContext) {
                    try {
                        // Create a sequence from the existing context
                        draftSequence = draftContext.getSequence()
                        console.log('[Main] Speculative decoding enabled with draft model:', draftModelId)
                    } catch (draftErr) {
                        console.warn('[Main] Failed to get draft sequence for speculation, continuing without:', draftErr)
                        draftSequence = null
                    }
                }

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

                // Attach draft sequence for speculative decoding if available
                if (draftSequence) {
                    evaluateOptions.draftSequence = draftSequence
                }

                for await (const token of sequence.evaluate(tokens, evaluateOptions)) {
                    // Check if model was unloaded during generation
                    if (!llamaModel) {
                        console.log('[Main] Model was unloaded during generation, stopping')
                        break
                    }
                    const text = currentModel.detokenize([token])
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
            } finally {
                // CRITICAL: Dispose sequence to free resources and prevent "No sequences left" error
                if (sequence && typeof sequence.dispose === 'function') {
                    try {
                        sequence.dispose()
                    } catch (disposeErr) {
                        console.warn('[Main] Failed to dispose sequence:', disposeErr)
                    }
                }
                // Clean up draft model resources for this generation
                if (draftSequence && typeof draftSequence.dispose === 'function') {
                    try { draftSequence.dispose() } catch { /* best effort */ }
                }
                // Do NOT dispose draftContext here as it is now persisted across generations
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
                            } catch (_error) { /* ignore */ }
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
            let sequence: any = null
            let streamDraftContext: any = null
            let streamDraftSequence: any = null
            // Capture model reference at start to detect if it gets unloaded during generation
            const currentModel = llamaModel

            try {
                sequence = llamaContext!.getSequence()
                if (!sequence) {
                    throw new Error('Failed to get sequence from context')
                }

                if (!currentModel) {
                    throw new Error('Model was unloaded before generation started')
                }
                const tokens = currentModel.tokenize(options.prompt)

                // Speculative Decoding: Set up draft model sequence for streaming
                if (draftModel) {
                    try {
                        streamDraftContext = await draftModel.createContext({ contextSize: { min: 512, max: 4096 } })
                        streamDraftSequence = streamDraftContext.getSequence()
                        console.log('[Main] Speculative decoding enabled for streaming with draft model:', draftModelId)
                    } catch (draftErr) {
                        console.warn('[Main] Failed to init draft model for streaming, continuing without:', draftErr)
                        streamDraftContext = null
                        streamDraftSequence = null
                    }
                }

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

                // Attach draft sequence for speculative decoding if available
                if (streamDraftSequence) {
                    evaluateOptions.draftSequence = streamDraftSequence
                }

                for await (const token of sequence.evaluate(tokens, evaluateOptions)) {
                    // Check if model was unloaded during generation
                    if (!llamaModel) {
                        console.log('[Main] Model was unloaded during streaming generation, stopping')
                        break
                    }
                    const text = currentModel.detokenize([token])
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
                    // Don't return - let finally block run to dispose sequence
                }

                else if (e.message?.includes('assert') || e.message?.includes('NaN') || e.message?.includes('llsnan')) {
                    console.error('[Main] Model assertion failure (NaN error):', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ Model numerical error. This model has corrupted weights or incompatible quantization. Please try a different model (Qwen2.5-Coder recommended).'
                    })
                    aborted = true
                }

                else if (e.message?.includes('OutOfDeviceMemory') || e.message?.includes('allocateMemory')) {
                    console.error('[Main] GPU memory exhausted:', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ GPU memory exhausted. Try closing other applications or use a smaller context size.'
                    })
                    aborted = true
                }

                else if (e.message?.includes('Eval has failed') || e.message?.includes('llama_decode') || e.message?.includes('No sequences left')) {
                    console.error('[Main] Eval/sequence error:', e.message)
                    safeSend('generate-completion-complete', {
                        requestId,
                        error: '⚠️ Generation failed. Please try again.'
                    })
                    aborted = true
                }
                else {
                    throw err
                }
            } finally {
                // CRITICAL: Always dispose sequence to prevent "No sequences left" error
                if (sequence && typeof sequence.dispose === 'function') {
                    try {
                        sequence.dispose()
                        console.log('[Main] Sequence disposed successfully')
                    } catch (disposeErr) {
                        console.warn('[Main] Failed to dispose sequence:', disposeErr)
                    }
                }
                // Clean up draft model resources for this streaming generation
                if (streamDraftSequence && typeof streamDraftSequence.dispose === 'function') {
                    try { streamDraftSequence.dispose() } catch { /* best effort */ }
                }
                if (streamDraftContext && typeof streamDraftContext.dispose === 'function') {
                    try { streamDraftContext.dispose() } catch { /* best effort */ }
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
                // ignore
            }
        } finally {

            activeGenerations.delete(requestId)

            if (!event.sender.isDestroyed()) {
                // ignore
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
