/**
 * Copyright 2026 Hermes Lekkas.
 * PROPRIETARY & CONFIDENTIAL.
 * 
 * This file is part of the Kalynt "Pro" Edition.
 * Unauthorized copying, distribution, or modification of this file, 
 * via any medium, is strictly prohibited.
 */

import { logger } from '../utils/logger'

export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AIMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export interface AIResponse {
    content: string
    provider: AIProvider
    model: string
    error?: string
    usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
}

export interface ImageGenerationResponse {
    url?: string
    base64?: string
    error?: string
}

export interface StreamCallbacks {
    onToken: (token: string) => void
    onComplete: (content: string) => void
    onError: (error: string) => void
}

const PROVIDER_CONFIG = {
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        models: {
            chat: 'gpt-4o-mini',
            chatPro: 'gpt-4o',
            image: 'dall-e-3'
        }
    },
    anthropic: {
        baseUrl: 'https://api.anthropic.com/v1',
        models: {
            chat: 'claude-3-haiku-20240307',
            chatPro: 'claude-3-5-sonnet-20241022'
        }
    },
    google: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: {
            chat: 'gemini-1.5-flash',
            chatPro: 'gemini-1.5-pro'
        }
    }
}

class AIService {
    private apiKeys: Record<string, string> = {}
    private readonly abortControllers: Map<string, AbortController> = new Map()

    setAPIKey(provider: AIProvider, key: string) {
        this.apiKeys[provider] = key
    }

    removeAPIKey(provider: AIProvider) {
        delete this.apiKeys[provider]
    }

    hasKey(provider: AIProvider): boolean {
        return !!this.apiKeys[provider]
    }

    getAvailableProviders(): AIProvider[] {
        return Object.keys(this.apiKeys).filter(k => this.apiKeys[k]) as AIProvider[]
    }

    async chat(
        messages: AIMessage[],
        provider: AIProvider = 'openai',
        options?: { model?: string; maxTokens?: number; temperature?: number; thinking?: boolean }
    ): Promise<AIResponse> {
        const key = this.apiKeys[provider]
        if (!key) {
            return { content: '', provider, model: '', error: `No API key for ${provider}` }
        }

        try {
            if (provider === 'openai') return await this.chatOpenAI(messages, key, options)
            if (provider === 'anthropic') return await this.chatAnthropic(messages, key, options)
            if (provider === 'google') return await this.chatGoogle(messages, key, options)
            return { content: '', provider, model: '', error: 'Unknown provider' }
        } catch (error) {
            return {
                content: '',
                provider,
                model: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    async chatStream(
        messages: AIMessage[],
        callbacks: StreamCallbacks,
        provider: AIProvider = 'openai',
        options?: { model?: string; maxTokens?: number; temperature?: number; thinking?: boolean }
    ): Promise<string> {
        const key = this.apiKeys[provider]
        if (!key) {
            callbacks.onError(`No API key for ${provider}`)
            return ''
        }

        const requestId = crypto.randomUUID()
        const abortController = new AbortController()
        this.abortControllers.set(requestId, abortController)

        try {
            let fullContent = ''

            if (provider === 'openai') {
                fullContent = await this.streamOpenAI(messages, key, callbacks, abortController.signal, options)
            } else if (provider === 'anthropic') {
                fullContent = await this.streamAnthropic(messages, key, callbacks, abortController.signal, options)
            } else if (provider === 'google') {
                fullContent = await this.streamGoogle(messages, key, callbacks, abortController.signal, options)
            } else {
                callbacks.onError('Unknown provider')
            }

            callbacks.onComplete(fullContent)
            return fullContent
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return ''
            }
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            callbacks.onError(errorMsg)
            return ''
        } finally {
            this.abortControllers.delete(requestId)
        }
    }

    cancelStream(requestId?: string) {
        if (requestId) {
            this.abortControllers.get(requestId)?.abort()
        } else {
            
            this.abortControllers.forEach(controller => controller.abort())
            this.abortControllers.clear()
        }
    }

    private async streamOpenAI(
        messages: AIMessage[],
        apiKey: string,
        callbacks: StreamCallbacks,
        signal: AbortSignal,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<string> {
        const model = options?.model || PROVIDER_CONFIG.openai.models.chat

        const response = await fetch(`${PROVIDER_CONFIG.openai.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                max_tokens: options?.maxTokens || 2048,
                temperature: options?.temperature ?? 0.7,
                stream: true
            }),
            signal
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let fullContent = ''
        let iterations = 0

        while (iterations++ < 1000000) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            fullContent += this.processOpenAILines(chunk, callbacks)
        }

        if (iterations >= 1000000) throw new Error('Streaming timeout')
        return fullContent
    }

    private processOpenAILines(chunk: string, callbacks: StreamCallbacks): string {
        let content = ''
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))
        for (const line of lines) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
                const json = JSON.parse(data)
                const token = json.choices[0]?.delta?.content || ''
                if (token) {
                    content += token
                    callbacks.onToken(token)
                }
            } catch (e) {
                console.debug('[AI] Malformed JSON in stream:', e)
            }
        }
        return content
    }

    private async streamAnthropic(
        messages: AIMessage[],
        apiKey: string,
        callbacks: StreamCallbacks,
        signal: AbortSignal,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<string> {
        const model = options?.model || PROVIDER_CONFIG.anthropic.models.chat
        const systemMsg = messages.find(m => m.role === 'system')
        const chatMessages = messages.filter(m => m.role !== 'system')

        const response = await fetch(`${PROVIDER_CONFIG.anthropic.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model,
                max_tokens: options?.maxTokens || 2048,
                system: systemMsg?.content || 'You are a helpful AI assistant.',
                messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
                stream: true
            }),
            signal
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `Anthropic API error: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let fullContent = ''
        let iterations = 0

        while (iterations++ < 1000000) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            fullContent += this.processAnthropicLines(chunk, callbacks)
        }

        if (iterations >= 1000000) throw new Error('Streaming timeout')
        return fullContent
    }

    private processAnthropicLines(chunk: string, callbacks: StreamCallbacks): string {
        let content = ''
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))
        for (const line of lines) {
            try {
                const json = JSON.parse(line.slice(6))
                if (json.type === 'content_block_delta') {
                    const token = json.delta?.text || ''
                    if (token) {
                        content += token
                        callbacks.onToken(token)
                    }
                }
            } catch (error) {
                logger.ai.debug('Failed to parse Anthropic stream chunk', { line, error })
            }
        }
        return content
    }

    private async streamGoogle(
        messages: AIMessage[],
        apiKey: string,
        callbacks: StreamCallbacks,
        signal: AbortSignal,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<string> {
        const model = options?.model || PROVIDER_CONFIG.google.models.chat

        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))

        const systemInstruction = messages.find(m => m.role === 'system')

        const response = await fetch(
            `${PROVIDER_CONFIG.google.baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
                    generationConfig: {
                        maxOutputTokens: options?.maxTokens || 2048,
                        temperature: options?.temperature ?? 0.7
                    }
                }),
                signal
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `Google AI error: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''

        if (!reader) throw new Error('No response body')

        let maxIterations = 1000000
        while (maxIterations-- > 0) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '))

            for (const line of lines) {
                try {
                    const json = JSON.parse(line.slice(6))
                    const token = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                    if (token) {
                        fullContent += token
                        callbacks.onToken(token)
                    }
                } catch (error) {
                    logger.ai.debug('Failed to parse Google stream chunk', { line, error })
                }
            }
        }
        if (maxIterations <= 0) {
            throw new Error('Streaming timeout: Max iterations reached')
        }

        return fullContent
    }

    private async chatOpenAI(
        messages: AIMessage[],
        apiKey: string,
        options?: { model?: string; maxTokens?: number; temperature?: number; thinking?: boolean }
    ): Promise<AIResponse> {
        const model = options?.model || PROVIDER_CONFIG.openai.models.chat

        const requestBody: any = {
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: options?.maxTokens || 2048,
            temperature: options?.temperature ?? 0.7
        }

        if (options?.thinking && (model.includes('o1') || model.includes('o3'))) {
            requestBody.reasoning_effort = 'high'
        }

        const response = await fetch(`${PROVIDER_CONFIG.openai.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
        }

        const data = await response.json()
        return {
            content: data.choices[0]?.message?.content || '',
            provider: 'openai',
            model,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        }
    }

    private async chatAnthropic(
        messages: AIMessage[],
        apiKey: string,
        options?: { model?: string; maxTokens?: number; temperature?: number; thinking?: boolean }
    ): Promise<AIResponse> {
        const model = options?.model || PROVIDER_CONFIG.anthropic.models.chat
        const systemMsg = messages.find(m => m.role === 'system')
        const chatMessages = messages.filter(m => m.role !== 'system')

        const requestBody: any = {
            model,
            max_tokens: options?.maxTokens || 2048,
            system: systemMsg?.content || 'You are a helpful AI assistant.',
            messages: chatMessages.map(m => ({ role: m.role, content: m.content }))
        }

        if (options?.thinking) {
            requestBody.thinking = {
                type: 'enabled',
                budget_tokens: 1024
            }
        }

        const response = await fetch(`${PROVIDER_CONFIG.anthropic.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `Anthropic API error: ${response.status}`)
        }

        const data = await response.json()
        return {
            content: data.content[0]?.text || '',
            provider: 'anthropic',
            model,
            usage: data.usage ? {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            } : undefined
        }
    }

    private async chatGoogle(
        messages: AIMessage[],
        apiKey: string,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<AIResponse> {
        const model = options?.model || PROVIDER_CONFIG.google.models.chat

        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))

        const systemInstruction = messages.find(m => m.role === 'system')

        const response = await fetch(
            `${PROVIDER_CONFIG.google.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
                    generationConfig: {
                        maxOutputTokens: options?.maxTokens || 2048,
                        temperature: options?.temperature ?? 0.7
                    }
                })
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || `Google AI error: ${response.status}`)
        }

        const data = await response.json()
        return {
            content: data.candidates[0]?.content?.parts[0]?.text || '',
            provider: 'google',
            model,
            usage: data.usageMetadata ? {
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0
            } : undefined
        }
    }

    async generateImage(
        prompt: string,
        options?: { size?: string; quality?: string }
    ): Promise<ImageGenerationResponse> {
        const key = this.apiKeys.openai
        if (!key) {
            return { error: 'OpenAI API key required for image generation' }
        }

        try {
            const response = await fetch(`${PROVIDER_CONFIG.openai.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt,
                    n: 1,
                    size: options?.size || '1024x1024',
                    quality: options?.quality || 'standard',
                    response_format: 'url'
                })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.error?.message || `DALL-E error: ${response.status}`)
            }

            const data = await response.json()
            return { url: data.data[0]?.url }
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'Image generation failed' }
        }
    }

    async summarize(text: string, provider: AIProvider = 'openai'): Promise<string> {
        const response = await this.chat([
            { role: 'system', content: 'Summarize the following text concisely.' },
            { role: 'user', content: text }
        ], provider)
        return response.content || response.error || ''
    }

    async fixGrammar(text: string, provider: AIProvider = 'openai'): Promise<string> {
        const response = await this.chat([
            { role: 'system', content: 'Fix any grammar and spelling errors in this text. Return only the corrected text.' },
            { role: 'user', content: text }
        ], provider)
        return response.content || response.error || ''
    }

    async generateCode(prompt: string, language: string, provider: AIProvider = 'openai'): Promise<string> {
        const response = await this.chat([
            { role: 'system', content: `You are a helpful coding assistant. Generate ${language} code based on the user's request. Return only code, no explanations.` },
            { role: 'user', content: prompt }
        ], provider)
        return response.content || response.error || ''
    }

    async expandText(text: string, provider: AIProvider = 'openai'): Promise<string> {
        const response = await this.chat([
            { role: 'system', content: 'Expand and elaborate on the following text while maintaining its tone and style.' },
            { role: 'user', content: text }
        ], provider)
        return response.content || response.error || ''
    }
}

export const aiService = new AIService()
