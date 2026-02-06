/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { aiService, AIMessage, AIProvider, AIResponse } from '../services/aiService'
import { useAppStore } from '../stores/appStore'
import { generateUUID } from '../utils/uuid'

export interface ChatMessage extends AIMessage {
    id: string
    timestamp: number
    provider?: AIProvider
    isLoading?: boolean
    error?: string
}

export function useAI() {
    const { apiKeys, canUseProvider } = useAppStore()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [currentProvider, setCurrentProvider] = useState<AIProvider>('openai')

    // Track messages in ref to avoid stale closures in callbacks
    const messagesRef = useRef<ChatMessage[]>([])
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    // Sync API keys with service
    useEffect(() => {
        Object.entries(apiKeys).forEach(([provider, key]) => {
            if (key) aiService.setAPIKey(provider as AIProvider, key)
        })
    }, [apiKeys])

    const getAvailableProviders = useCallback((): AIProvider[] => {
        const providers: AIProvider[] = []
        if (apiKeys.openai && canUseProvider('openai')) providers.push('openai')
        if (apiKeys.anthropic && canUseProvider('anthropic')) providers.push('anthropic')
        if (apiKeys.google && canUseProvider('google')) providers.push('google')
        return providers
    }, [apiKeys, canUseProvider])

    const sendMessage = useCallback(async (content: string, provider?: AIProvider): Promise<AIResponse> => {
        const useProvider = provider || currentProvider

        // Add user message
        const userMessage: ChatMessage = {
            id: generateUUID(),
            role: 'user',
            content,
            timestamp: Date.now()
        }

        setMessages(prev => [...prev, userMessage])
        setIsLoading(true)

        // Add placeholder for assistant
        const assistantId = generateUUID()
        setMessages(prev => [...prev, {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            provider: useProvider,
            isLoading: true
        }])

        try {
            const response = await aiService.chat(
                messagesRef.current.concat(userMessage).map(m => ({
                    role: m.role,
                    content: m.content
                })),
                useProvider
            )

            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: response.content, isLoading: false, error: response.error }
                    : m
            ))

            return response
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: '', isLoading: false, error: errorMsg }
                    : m
            ))
            return { content: '', provider: useProvider, model: '', error: errorMsg }
        } finally {
            setIsLoading(false)
        }
    }, [currentProvider])

    const clearMessages = useCallback(() => {
        setMessages([])
    }, [])

    const summarize = useCallback(async (text: string): Promise<string> => {
        return aiService.summarize(text, currentProvider)
    }, [currentProvider])

    const fixGrammar = useCallback(async (text: string): Promise<string> => {
        return aiService.fixGrammar(text, currentProvider)
    }, [currentProvider])

    const generateCode = useCallback(async (prompt: string, language: string): Promise<string> => {
        return aiService.generateCode(prompt, language, currentProvider)
    }, [currentProvider])

    const expandText = useCallback(async (text: string): Promise<string> => {
        return aiService.expandText(text, currentProvider)
    }, [currentProvider])

    const generateImage = useCallback(async (prompt: string): Promise<{ url?: string; error?: string }> => {
        if (!apiKeys.openai) {
            return { error: 'OpenAI API key required for image generation' }
        }
        return aiService.generateImage(prompt)
    }, [apiKeys.openai])

    return {
        messages,
        isLoading,
        currentProvider,
        setCurrentProvider,
        getAvailableProviders,
        sendMessage,
        clearMessages,
        summarize,
        fixGrammar,
        generateCode,
        expandText,
        generateImage
    }
}
