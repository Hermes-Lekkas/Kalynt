/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYArray, useAwareness } from '../hooks/useYjs'
import { usePermissions } from '../hooks/usePermissions'
import { encryptionService, EncryptedPayload } from '../services/encryptionService'
import { aiService, AIProvider, AIMessage } from '../services/aiService'
import { offlineLLMService, ChatMessage as OfflineChatMessage } from '../services/offlineLLMService'
import { useModelStore } from '../stores/modelStore'
import { useAgent } from '../hooks/useAgent'
import { executeTool, getToolsDescription, getToolCallJsonSchema, getToolSystemPrompt, getSimplifiedToolSchema, getModelSizeCategory, toolPermissionManager, type ToolCallRequest } from '../services/ideAgentTools'
import { getModelById } from '../types/offlineModels'
import UnifiedSettingsPanel from './UnifiedSettingsPanel'
import {
    MessageSquare, Zap, Lock, Send, Trash2,
    Paperclip, Cloud, Terminal as TerminalIcon,
    Scroll, Check, X, Lightbulb, Bot, AlertCircle,
    ChevronDown, Monitor, Loader2, Square,
    Brain, Bug, Shield, Info
} from 'lucide-react'

// --- Types ---
type PanelMode = 'collaboration' | 'agent'
type AIMode = 'cloud' | 'offline'

interface TabProps {
    id: PanelMode
    icon: React.ReactNode
    label: string
    active: boolean
    onClick: () => void
    badge?: number
}

interface ChatMessage {
    id: string
    role?: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    sender?: string
    senderId?: string
    timestamp: number
    channelId?: string
    encrypted?: boolean
    toolName?: string
    toolResult?: string
    isError?: boolean
    modelId?: string
    isLoading?: boolean
    issueType?: string
    thinking?: string  // Model's chain-of-thought reasoning
}

// --- Component ---
interface UnifiedAgentPanelProps {
    readonly workspacePath: string | null
    readonly currentFile: string | null
    readonly currentFileContent: string | null
    readonly editorMode?: any
    readonly onRunCommand?: (command: string) => void
}

export default function UnifiedAgentPanel({
    workspacePath,
    currentFile,
    currentFileContent,
    editorMode = 'general',
    onRunCommand
}: UnifiedAgentPanelProps) {
    const { currentSpace, apiKeys } = useAppStore()
    const { doc, provider, synced } = useYDoc(currentSpace?.id ?? null)
    const { items: p2pMessages, push: pushP2P } = useYArray<any>(doc, 'messages')
    useAwareness(provider)
    const { canChat } = usePermissions()
    const { loadedModelId, isLoading: isModelLoading, loadError } = useModelStore()

    // Agent Logic
    const [agentAIMode, setAgentAIMode] = useState<AIMode>('cloud')
    const agent = useAgent(currentSpace?.id ?? null, editorMode, agentAIMode === 'offline', workspacePath || '')

    // UI State
    const [activeMode, setActiveMode] = useState<PanelMode>('agent')
    const [aiMode, setAiMode] = useState<AIMode>('cloud')
    const [input, setInput] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [showModelManager, setShowModelManager] = useState(false)
    const [includeContext, setIncludeContext] = useState(true)
    const [currentProvider, setCurrentProvider] = useState<AIProvider>('openai')
    const [showLog, setShowLog] = useState(false)
    const [showAutonomous, setShowAutonomous] = useState(false)
    const [scanProgress, setScanProgress] = useState<{ current: number; total: number; currentFile: string } | null>(null)

    // Message States (Local storage for AI chats)
    const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
    const [streamingContent, setStreamingContent] = useState('')

    // Thinking UI State
    const [thinkingContent, setThinkingContent] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [showThinking, setShowThinking] = useState(false)

    // Tool Confirmation State
    const [pendingToolRequest, setPendingToolRequest] = useState<ToolCallRequest | null>(null)
    const [toolConfirmationResolver, setToolConfirmationResolver] = useState<{
        resolve: (value: { approved: boolean; alwaysAllow: boolean }) => void
    } | null>(null)

    // Encryption State
    const [encryptionEnabled, setEncryptionEnabled] = useState(false)
    const [decryptedCache, setDecryptedCache] = useState<Map<string, string>>(new Map())
    const [decryptionErrors, setDecryptionErrors] = useState<Set<string>>(new Set())

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const userId = useRef(crypto.randomUUID())

    // --- Initialization & Sync ---

    // Load encryption
    useEffect(() => {
        if (!currentSpace) return
        const settings = localStorage.getItem(`space-settings-${currentSpace.id}`)
        if (settings) {
            try {
                const parsed = JSON.parse(settings)
                if (parsed.encryptionEnabled && parsed.roomPassword) {
                    encryptionService.setRoomKey(currentSpace.id, parsed.roomPassword).then(() => {
                        setEncryptionEnabled(true)
                    })
                }
            } catch (e) { console.error('Failed to load encryption', e) }
        }
    }, [currentSpace])

    // Sync AI Chat history
    useEffect(() => {
        if (currentSpace?.id) {
            const saved = localStorage.getItem(`unified-chat-${currentSpace.id}`)
            if (saved) {
                try { setAiMessages(JSON.parse(saved)) } catch (e) { console.error('Failed to load history', e) }
            } else {
                setAiMessages([])
            }
        }
    }, [currentSpace?.id])

    useEffect(() => {
        if (currentSpace?.id) {
            localStorage.setItem(`unified-chat-${currentSpace.id}`, JSON.stringify(aiMessages))
        }
    }, [aiMessages, currentSpace?.id])

    // Register Tool Confirmation Handler
    useEffect(() => {
        toolPermissionManager.setConfirmationHandler(async (request) => {
            return new Promise((resolve) => {
                setPendingToolRequest(request)
                setToolConfirmationResolver({
                    resolve: (result) => {
                        resolve(result)
                        // Trigger scroll to bottom to show the executing tool
                        setTimeout(scrollToBottom, 100)
                    }
                })
                // Scroll to show the approval card
                setTimeout(scrollToBottom, 100)
            })
        })

        return () => {
            toolPermissionManager.setConfirmationHandler(async () => ({ approved: false, alwaysAllow: false }))
        }
    }, [])


    // Scroll to bottom helper
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Scroll to bottom on changes
    useEffect(() => {
        scrollToBottom()
    }, [p2pMessages, aiMessages, streamingContent, activeMode, agent.activityLog, showLog])

    // Focus input
    useEffect(() => {
        if (inputRef.current) inputRef.current.focus()
    }, [activeMode, aiMode])

    // Set up tool permission handler
    useEffect(() => {
        toolPermissionManager.setConfirmationHandler(async (request: ToolCallRequest) => {
            return new Promise((resolve) => {
                setPendingToolRequest(request)
                setToolConfirmationResolver({ resolve })
            })
        })

        // DISABLE trusted mode to show confirmation dialogs
        // Users should approve destructive operations
        toolPermissionManager.setTrustedMode(false)

        // Auto-allow read-only tools (safe operations)
        toolPermissionManager.setReadOnlyAutoAllow(true)

        return () => {
            toolPermissionManager.setConfirmationHandler(null as any)
            toolPermissionManager.setTrustedMode(false)
            toolPermissionManager.clearSession()
        }
    }, [])

    // --- P2P Encryption Logic ---
    useEffect(() => {
        if (!currentSpace || !encryptionEnabled) return
        const decryptAll = async () => {
            const roomKey = encryptionService.getRoomKey(currentSpace.id)
            if (!roomKey) return
            const newCache = new Map(decryptedCache)
            const newErrors = new Set(decryptionErrors)
            let changed = false
            for (const msg of p2pMessages) {
                if (!msg.encrypted || newCache.has(msg.id) || newErrors.has(msg.id)) continue
                try {
                    const payload: EncryptedPayload = JSON.parse(msg.content)
                    const decrypted = await encryptionService.decryptToString(payload, roomKey)
                    newCache.set(msg.id, decrypted)
                    changed = true
                } catch (_e) {
                    newErrors.add(msg.id)
                    changed = true
                }
            }
            if (changed) {
                setDecryptedCache(newCache)
                setDecryptionErrors(newErrors)
            }
        }
        decryptAll()
    }, [p2pMessages, currentSpace, encryptionEnabled])

    const getP2PContent = (msg: any) => {
        if (!msg.encrypted) return msg.content
        if (decryptedCache.has(msg.id)) return decryptedCache.get(msg.id)
        if (decryptionErrors.has(msg.id)) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lock size={12} /> [Decryption Failed]</span>
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Loader2 size={12} className="animate-spin" /> [Decrypting...]</span>
    }

    // --- AI Logic (Assistant) ---
    const availableCloudProviders = useMemo(() => {
        const providers: AIProvider[] = []
        if (apiKeys.openai) providers.push('openai')
        if (apiKeys.anthropic) providers.push('anthropic')
        if (apiKeys.google) providers.push('google')
        return providers
    }, [apiKeys])

    const currentOfflineModel = loadedModelId ? getModelById(loadedModelId) : null

    const buildContext = (forOffline: boolean = false): string => {
        if (!includeContext) return ''
        let context = `WORKSPACE: ${workspacePath || 'None'}\n`
        if (currentFile && currentFileContent) {
            // For offline models, use much less context to avoid KV slot errors
            const maxContent = forOffline ? 500 : 3000
            context += `CURRENT FILE: ${currentFile}\nCONTENT (Partial):\n${currentFileContent.slice(0, maxContent)}\n`
        }
        // For offline models, use compact tool descriptions
        if (forOffline) {
            context += `TOOLS: readFile, writeFile, listDirectory, createFile, createDirectory, delete, executeCode, runCommand, gitStatus\n`
        } else {
            context += `AVAILABLE TOOLS:\n${getToolsDescription()}\n`
        }
        return context
    }

    const handleStop = async () => {
        if (!isProcessing) return

        try {
            // Cancel backend generation FIRST before resetting UI
            const currentAIMode = showAutonomous ? agentAIMode : aiMode
            if (currentAIMode === 'offline') {
                await offlineLLMService.cancelGeneration()
            } else {
                // Cancel cloud AI streams using AbortController
                aiService.cancelStream()
            }

            // Then reset all generation state
            setIsProcessing(false)
            setStreamingContent('')
            setThinkingContent('')
            setIsThinking(false)
        } catch (error) {
            console.error('Stop generation error:', error)
            // Reset UI even if cancel fails
            setIsProcessing(false)
            setStreamingContent('')
            setThinkingContent('')
            setIsThinking(false)
        }
    }

    const handleSend = async () => {
        const text = input.trim()
        if (!text || isProcessing) return

        if (activeMode === 'collaboration') {
            if (!canChat) return
            let content = text
            let encrypted = false
            if (encryptionEnabled && currentSpace) {
                const key = encryptionService.getRoomKey(currentSpace.id)
                if (key) {
                    const payload = await encryptionService.encrypt(content, key)
                    const msgId = crypto.randomUUID()
                    setDecryptedCache(prev => new Map(prev).set(msgId, content))
                    content = JSON.stringify(payload)
                    encrypted = true
                    pushP2P({ id: msgId, content, sender: 'You', senderId: userId.current, timestamp: Date.now(), encrypted })
                    setInput('')
                    return
                }
            }
            pushP2P({ id: crypto.randomUUID(), content, sender: 'You', senderId: userId.current, timestamp: Date.now(), encrypted: false })
            setInput('')
            return
        }

        if (activeMode === 'agent' && !showAutonomous) {
            if (aiMode === 'cloud' && availableCloudProviders.length === 0) return
            if (aiMode === 'offline' && !loadedModelId) return

            const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() }
            setAiMessages(prev => [...prev, userMsg])
            setInput('')
            setIsProcessing(true)

            if (aiMode === 'offline') {
                setStreamingContent('')
                try {
                    // Detect if this is a thinking model (Qwen3-Thinking)
                    const isThinkingModel = loadedModelId?.includes('thinking')

                    // Detect if user is requesting a tool (for grammar-based generation)
                    const detectToolIntent = (text: string): boolean => {
                        const lower = text.toLowerCase()

                        // Explicit tool keywords (high confidence)
                        const toolKeywords = ['read', 'write', 'list', 'create', 'delete', 'run', 'execute', 'git']
                        if (toolKeywords.some(kw => lower.includes(kw))) return true

                        // Action verbs commonly used for tools
                        const actionVerbs = ['remove', 'fix', 'change', 'update', 'edit', 'rename', 'move', 'copy', 'add', 'check']
                        if (actionVerbs.some(verb => lower.includes(verb))) return true

                        // File/path references
                        if (/\.(ts|js|tsx|jsx|py|json|md|txt|css|html)/i.test(text)) return true
                        if (/(file|folder|directory|path)/i.test(lower)) return true

                        return false
                    }

                    const isToolRequest = detectToolIntent(text)

                    // Determine model size for schema complexity selection
                    const modelSize = loadedModelId ? getModelSizeCategory(loadedModelId) : 'small'
                    const useCompactPrompt = modelSize === 'small'

                    // DEBUG: Log intent detection result
                    console.log('[Agent] Intent detection:', {
                        userInput: text.slice(0, 50),
                        isToolRequest,
                        isThinkingModel,
                        modelSize
                    })

                    // Build system prompt based on request type
                    // KEY FIX: When tools are requested, use dedicated tool prompt that TEACHES the format
                    let sysPrompt: string

                    if (isToolRequest) {
                        // Use tool-specific prompt that explicitly shows JSON format
                        sysPrompt = getToolSystemPrompt(workspacePath || '', useCompactPrompt)
                        console.log('[Agent] Using tool-aware system prompt')
                    } else if (isThinkingModel) {
                        // Thinking model prompt - simplified for conversation
                        sysPrompt = `You are Kalynt, a helpful AI coding assistant.

WORKSPACE: ${workspacePath || 'None'}

You have extended reasoning capabilities. Use <think> tags ONLY for complex problems.

IMPORTANT: For simple greetings and basic questions, respond directly and naturally.
Only use <think> tags for complex problems that require step-by-step reasoning.

Example:
User: "hello"
Assistant: Hello! How can I help you today?

Be helpful, friendly, and conversational.`
                    } else {
                        // Simple conversational prompt for non-tool requests
                        // CRITICAL: Don't include tool examples for small models - they copy them literally!
                        console.log('[Agent] Using simple conversational prompt (no tool examples)')
                        sysPrompt = `You are Kalynt, a helpful AI coding assistant.

WORKSPACE: ${workspacePath || 'None'}

Respond naturally to questions and greetings. Be helpful and conversational.

If the user asks you to perform file operations (read, write, list files, etc.), let them know you can help with that.`
                    }

                    // For offline models, keep only last 2 turns to prevent context overflow
                    const history: OfflineChatMessage[] = [
                        { role: 'system', content: sysPrompt },
                        ...aiMessages.slice(-2).map(m => ({
                            role: m.role === 'tool' ? 'assistant' as const : m.role as any,
                            content: m.role === 'tool' ? `Tool result: ${m.toolResult?.slice(0, 100)}` : m.content.slice(0, 200)
                        })),
                        { role: 'user', content: text }
                    ]

                    // Handle streaming with thinking tag parsing
                    // KEY FIX: Disable thinking mode during tool requests (breaks JSON grammar)
                    let fullResponse = ''
                    let inThinking = false
                    const enableThinkingParsing = isThinkingModel && !isToolRequest  // Disabled during tool calls
                    const thinkOpenTag = isThinkingModel ? '<think>' : '<thinking>'
                    const thinkCloseTag = isThinkingModel ? '</think>' : '</thinking>'

                    // Use grammar-based sampling for tool requests (Cursor-like reliability)
                    const options: any = {}
                    if (isToolRequest) {
                        // Use simplified schema for small models
                        options.jsonSchema = modelSize === 'small'
                            ? getSimplifiedToolSchema()
                            : getToolCallJsonSchema()
                        console.log('[Agent] Using grammar-based tool calling (100% reliable JSON)', { modelSize })
                    }

                    const response = await offlineLLMService.generateStream(history, (token) => {
                        fullResponse += token

                        // Skip thinking tag parsing when doing tool calls (JSON grammar mode)
                        if (!enableThinkingParsing) {
                            // Direct streaming for tool calls - just show the raw JSON being generated
                            setStreamingContent(fullResponse)
                            return
                        }

                        // Check for thinking tag transitions (only for non-tool requests)
                        if (fullResponse.includes(thinkOpenTag) && !fullResponse.includes(thinkCloseTag)) {
                            if (!inThinking) {
                                setIsThinking(true)
                                inThinking = true
                            }
                            // Extract and show thinking content
                            const thinkingStart = fullResponse.indexOf(thinkOpenTag) + thinkOpenTag.length
                            setThinkingContent(fullResponse.slice(thinkingStart))
                        } else if (fullResponse.includes(thinkCloseTag)) {
                            // Thinking complete
                            if (inThinking) {
                                setIsThinking(false)
                                inThinking = false
                            }
                            // Show only content after closing tag
                            const afterThinking = fullResponse.split(thinkCloseTag).pop() ?? ''
                            // Normal streaming (no thinking tags)
                            setStreamingContent(afterThinking.replace(/```tool[\s\S]*?```/g, '').trim())
                        } else if (!inThinking) {
                            // Normal streaming (no thinking tags)
                            setStreamingContent(fullResponse.replace(/```tool[\s\S]*?```/g, '').trim())
                        }
                    }, options)

                    // Extract final thinking content for message storage
                    // Support both <think> and <thinking> tags
                    const thinkingPattern = isThinkingModel
                        ? /<think>([\s\S]*?)<\/think>/
                        : /<thinking>([\s\S]*?)<\/thinking>/
                    const thinkingMatch = thinkingPattern.exec(response)
                    const thinking = thinkingMatch ? thinkingMatch[1].trim() : undefined

                    // Clean main content (no thinking tags, no tool blocks)
                    const mainContent = response
                        .replace(/<think>[\s\S]*?<\/think>/g, '')
                        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
                        .replace(/```tool[\s\S]*?```/g, '')
                        .trim()

                    if (mainContent || thinking) {
                        setAiMessages(prev => [...prev, {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: mainContent,
                            thinking,
                            timestamp: Date.now(),
                            modelId: loadedModelId!
                        }])
                    }

                    // Reset thinking UI state
                    setThinkingContent('')
                    setIsThinking(false)

                    // DEBUG: Log actual LLM response to see what we're working with
                    console.log('[Agent] LLM Response:', response)
                    console.log('[Agent] Looking for tool calls...')

                    // Tool Handling - support multiple tool call formats
                    // Format 1: Markdown code block (existing)
                    let toolMatch = response.match(/```tool\s*\n?({[\s\S]*?})\n?```/i)

                    // Format 2: XML tags (existing)
                    if (!toolMatch) {
                        const toolPattern = /<tool>({[\s\S]*?})<\/tool>/i
                        const toolShortPattern = /<tool>({[\s\S]*?})/i
                        toolMatch = toolPattern.exec(response) ?? toolShortPattern.exec(response)
                    }

                    // Format 3: Qwen-specific <tool_call> format (NEW)
                    if (!toolMatch) {
                        const qwenPattern = /<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/i
                        const qwenMatch = qwenPattern.exec(response)
                        if (qwenMatch) toolMatch = qwenMatch
                    }

                    // Format 4: Hermes function call format (NEW)
                    if (!toolMatch) {
                        const hermesPattern = /<function=(\w+)>([\s\S]*?)<\/function>/i
                        const hermesMatch = hermesPattern.exec(response)
                        if (hermesMatch) {
                            // Convert Hermes format to standard format
                            try {
                                const toolCall = {
                                    name: hermesMatch[1],
                                    params: JSON.parse(hermesMatch[2])
                                }
                                toolMatch = [hermesMatch[0], JSON.stringify(toolCall)]
                            } catch (e) {
                                console.error('[Agent] Failed to parse Hermes function call:', e)
                            }
                        }
                    }

                    // Format 5: Direct JSON without wrapping (NEW - improved)
                    // The regex approach fails with nested braces, so we use JSON.parse instead
                    if (!toolMatch) {
                        // Try to find where JSON might start
                        const jsonStart = response.indexOf('{"name":')
                        if (jsonStart !== -1) {
                            // Extract from start position to end of response
                            const jsonCandidate = response.substring(jsonStart)

                            // Try to parse it - JSON.parse will find the correct end
                            try {
                                // Find the matching closing brace by attempting parse
                                // We'll try progressively longer substrings until parse succeeds
                                for (let endPos = jsonCandidate.length; endPos >= 50; endPos--) {
                                    try {
                                        const potentialJson = jsonCandidate.substring(0, endPos)
                                        const parsed = JSON.parse(potentialJson)
                                        // Verify it has the expected structure
                                        if (parsed.name && parsed.params) {
                                            toolMatch = [potentialJson, potentialJson]
                                            break
                                        }
                                    } catch {
                                        // Keep trying shorter strings
                                        continue
                                    }
                                }
                            } catch (_e) {
                                console.log('[Agent] Failed to extract JSON from response')
                            }
                        }
                    }

                    if (toolMatch) {
                        console.log('[Agent] Tool call detected:', toolMatch[1])
                        try {
                            const toolCall = JSON.parse(toolMatch[1])
                            console.log('[Agent] Executing tool:', toolCall.name, 'with params:', toolCall.params)
                            const result = await executeTool(toolCall.name, toolCall.params, { workspacePath: workspacePath || '' })
                            console.log('[Agent] Tool result:', result)

                            const output = result.success ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)) : `Error: ${result.error}`

                            setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'tool', content: '', toolName: toolCall.name, toolResult: output, timestamp: Date.now() }])

                            if (toolCall.name === 'runCommand' && onRunCommand) {
                                onRunCommand(toolCall.params.command)
                            }

                            // Multi-turn tool loop - continue until no more tools are called
                            const MAX_TOOL_ITERATIONS = 5
                            let iterationCount = 0
                            let currentHistory: OfflineChatMessage[] = [
                                ...history,
                                { role: 'assistant', content: response },
                                {
                                    role: 'user', content: `Tool "${toolCall.name}" executed successfully. Result:
${output}

Now use this result to complete the task. If more tools are needed, call them one at a time. If the task is complete, provide a summary of what was done.` }
                            ]

                            let hasMoreTools = true
                            while (hasMoreTools && iterationCount < MAX_TOOL_ITERATIONS) {
                                iterationCount++
                                setStreamingContent('') // Clear for new response

                                // IMPORTANT: Pass same JSON schema options for consistent tool calling in multi-turn
                                const followUp = await offlineLLMService.generateStream(currentHistory, (token) => setStreamingContent(p => p + token), options)

                                // Check if follow-up contains another tool call
                                let followUpToolMatch = followUp.match(/```tool\s*\n?({[\s\S]*?})\n?```/i)
                                if (!followUpToolMatch) followUpToolMatch = followUp.match(/<tool>({[\s\S]*?})<\/tool>/i)
                                if (!followUpToolMatch) followUpToolMatch = followUp.match(/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/i)
                                if (!followUpToolMatch) {
                                    const hermesMatch = followUp.match(/<function=(\w+)>([\s\S]*?)<\/function>/i)
                                    if (hermesMatch) {
                                        try {
                                            followUpToolMatch = [hermesMatch[0], JSON.stringify({ name: hermesMatch[1], params: JSON.parse(hermesMatch[2]) })]
                                        } catch { /* ignore */ }
                                    }
                                }
                                if (!followUpToolMatch) {
                                    const jsonStart = followUp.indexOf('{"name":')
                                    if (jsonStart !== -1) {
                                        const jsonCandidate = followUp.substring(jsonStart)
                                        for (let endPos = jsonCandidate.length; endPos >= 50; endPos--) {
                                            try {
                                                const potentialJson = jsonCandidate.substring(0, endPos)
                                                const parsed = JSON.parse(potentialJson)
                                                if (parsed.name && parsed.params) {
                                                    followUpToolMatch = [potentialJson, potentialJson]
                                                    break
                                                }
                                            } catch { continue }
                                        }
                                    }
                                }

                                if (followUpToolMatch) {
                                    console.log(`[Agent] Multi-turn iteration ${iterationCount}: Tool call detected`)
                                    try {
                                        const nextToolCall = JSON.parse(followUpToolMatch[1])

                                        // Show the follow-up message (minus tool call)
                                        const followUpClean = followUp
                                            .replace(/<thinking>[\s\S]*?<\/thinking>/, '')
                                            .replace(/<think>[\s\S]*?<\/think>/, '')
                                            .replace(/```tool[\s\S]*?```/, '')
                                            .replace(/<tool>[\s\S]*?<\/tool>/, '')
                                            .replace(/<tool_call>[\s\S]*?<\/tool_call>/, '')
                                            .replace(/<function=\w+>[\s\S]*?<\/function>/, '')
                                            .trim()

                                        if (followUpClean) {
                                            setAiMessages(prev => [...prev, {
                                                id: crypto.randomUUID(),
                                                role: 'assistant',
                                                content: followUpClean,
                                                timestamp: Date.now(),
                                                modelId: loadedModelId!
                                            }])
                                        }

                                        // Execute the next tool
                                        console.log(`[Agent] Executing tool ${iterationCount}:`, nextToolCall.name)
                                        const nextResult = await executeTool(nextToolCall.name, nextToolCall.params, { workspacePath: workspacePath || '' })
                                        const nextOutput = nextResult.success ? (typeof nextResult.data === 'string' ? nextResult.data : JSON.stringify(nextResult.data, null, 2)) : `Error: ${nextResult.error}`

                                        setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'tool', content: '', toolName: nextToolCall.name, toolResult: nextOutput, timestamp: Date.now() }])

                                        if (nextToolCall.name === 'runCommand' && onRunCommand) {
                                            onRunCommand(nextToolCall.params.command)
                                        }

                                        // Update history for next iteration
                                        currentHistory = [
                                            ...currentHistory,
                                            { role: 'assistant', content: followUp },
                                            { role: 'user', content: `Tool "${nextToolCall.name}" executed. Result:\n${nextOutput}\n\nContinue with the task. Call another tool if needed, or summarize what was done.` }
                                        ]
                                    } catch (e) {
                                        console.error(`[Agent] Multi-turn tool error at iteration ${iterationCount}:`, e)
                                        hasMoreTools = false
                                    }
                                } else {
                                    // No more tools - show final response
                                    hasMoreTools = false
                                    const followUpClean = followUp
                                        .replace(/<thinking>[\s\S]*?<\/thinking>/, '')
                                        .replace(/<think>[\s\S]*?<\/think>/, '')
                                        .trim()

                                    if (followUpClean) {
                                        setAiMessages(prev => [...prev, {
                                            id: crypto.randomUUID(),
                                            role: 'assistant',
                                            content: followUpClean,
                                            timestamp: Date.now(),
                                            modelId: loadedModelId!
                                        }])
                                    }
                                    console.log(`[Agent] Multi-turn complete after ${iterationCount} iteration(s)`)
                                }
                            }

                            if (iterationCount >= MAX_TOOL_ITERATIONS) {
                                console.log(`[Agent] Reached max tool iterations (${MAX_TOOL_ITERATIONS})`)
                                setAiMessages(prev => [...prev, {
                                    id: crypto.randomUUID(),
                                    role: 'assistant',
                                    content: '⚠️ Reached maximum tool execution limit. Some tasks may be incomplete.',
                                    timestamp: Date.now(),
                                    isError: true
                                }])
                            }
                        } catch (e) {
                            console.error('[Agent] Tool execute error', e)
                        }
                    } else {
                        console.log('[Agent] No tool call detected in response. Response stored as message.')
                    }
                } catch (e) {
                    setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Offline generation failed'}`, timestamp: Date.now(), isError: true }])
                } finally {
                    setIsProcessing(false)
                    setStreamingContent('')
                }
            } else {
                // Cloud AI (with Agent support)
                try {
                    // Use full tool system prompt for cloud AI too
                    const toolPrompt = getToolSystemPrompt(workspacePath || '', false)
                    const contextInfo = includeContext ? `\n\nCURRENT CONTEXT:\n${buildContext(false)}` : ''
                    const sysPrompt = `${toolPrompt}${contextInfo}

RESPONSE FORMAT FOR CLOUD AI:
When calling tools, wrap your JSON in markdown code blocks:
\`\`\`tool
{"name": "toolName", "params": {...}}
\`\`\``
                    const chatHistory: AIMessage[] = [
                        { role: 'system', content: sysPrompt },
                        ...aiMessages.map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role as any, content: m.role === 'tool' ? `Tool result: ${m.toolResult}` : m.content })),
                        { role: 'user', content: text }
                    ]

                    const response = await aiService.chat(chatHistory, currentProvider)
                    const mainContent = (response.content || '').replace(/```tool[\s\S]*?```/, '').trim()

                    if (mainContent) {
                        setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: mainContent, timestamp: Date.now() }])
                    }

                    // Tool Handling with multi-turn loop
                    const toolMatch = response.content?.match(/```tool\s*\n?({[\s\S]*?})\n?```/i)
                    if (toolMatch) {
                        try {
                            const toolCall = JSON.parse(toolMatch[1])
                            const result = await executeTool(toolCall.name, toolCall.params, { workspacePath: workspacePath || '' })

                            const output = result.success ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)) : `Error: ${result.error}`

                            setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'tool', content: '', toolName: toolCall.name, toolResult: output, timestamp: Date.now() }])

                            if (toolCall.name === 'runCommand' && onRunCommand) {
                                onRunCommand(toolCall.params.command)
                            }

                            // Multi-turn tool loop for cloud AI
                            const MAX_TOOL_ITERATIONS = 5
                            let iterationCount = 0
                            let currentCloudHistory: AIMessage[] = [
                                ...chatHistory,
                                { role: 'assistant', content: response.content || '' },
                                { role: 'user', content: `Tool ${toolCall.name} returned: ${output}. Continue with the task. If more tools are needed, call them. If done, summarize what was done.` }
                            ]

                            let hasMoreTools = true
                            while (hasMoreTools && iterationCount < MAX_TOOL_ITERATIONS) {
                                iterationCount++

                                const followUp = await aiService.chat(currentCloudHistory, currentProvider)
                                const followUpToolMatch = followUp.content?.match(/```tool\s*\n?({[\s\S]*?})\n?```/i)

                                if (followUpToolMatch) {
                                    console.log(`[Agent] Cloud multi-turn iteration ${iterationCount}: Tool call detected`)
                                    try {
                                        const nextToolCall = JSON.parse(followUpToolMatch[1])

                                        // Show the follow-up message (minus tool call)
                                        const followUpClean = (followUp.content || '').replace(/```tool[\s\S]*?```/, '').trim()
                                        if (followUpClean) {
                                            setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: followUpClean, timestamp: Date.now() }])
                                        }

                                        // Execute the next tool
                                        const nextResult = await executeTool(nextToolCall.name, nextToolCall.params, { workspacePath: workspacePath || '' })
                                        const nextOutput = nextResult.success ? (typeof nextResult.data === 'string' ? nextResult.data : JSON.stringify(nextResult.data, null, 2)) : `Error: ${nextResult.error}`

                                        setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'tool', content: '', toolName: nextToolCall.name, toolResult: nextOutput, timestamp: Date.now() }])

                                        if (nextToolCall.name === 'runCommand' && onRunCommand) {
                                            onRunCommand(nextToolCall.params.command)
                                        }

                                        // Update history for next iteration
                                        currentCloudHistory = [
                                            ...currentCloudHistory,
                                            { role: 'assistant', content: followUp.content || '' },
                                            { role: 'user', content: `Tool ${nextToolCall.name} returned: ${nextOutput}. Continue or summarize.` }
                                        ]
                                    } catch (e) {
                                        console.error(`[Agent] Cloud multi-turn tool error at iteration ${iterationCount}:`, e)
                                        hasMoreTools = false
                                    }
                                } else {
                                    // No more tools - show final response
                                    hasMoreTools = false
                                    if (followUp.content) {
                                        setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: followUp.content, timestamp: Date.now() }])
                                    }
                                    console.log(`[Agent] Cloud multi-turn complete after ${iterationCount} iteration(s)`)
                                }
                            }

                            if (iterationCount >= MAX_TOOL_ITERATIONS) {
                                console.log(`[Agent] Cloud reached max tool iterations (${MAX_TOOL_ITERATIONS})`)
                                setAiMessages(prev => [...prev, {
                                    id: crypto.randomUUID(),
                                    role: 'assistant',
                                    content: '⚠️ Reached maximum tool execution limit. Some tasks may be incomplete.',
                                    timestamp: Date.now(),
                                    isError: true
                                }])
                            }
                        } catch (e) { console.error('Tool execute error', e) }
                    }
                } catch (e) {
                    setAiMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Failed'}`, timestamp: Date.now(), isError: true }])
                } finally {
                    setIsProcessing(false)
                }
            }
        }
    }

    // --- Sub-components ---

    // BUG #6: Sanitize AI responses to prevent XSS
    const sanitizeContent = (text: string): string => {
        return text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
    }

    const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
        const isOwn = msg.senderId === userId.current || msg.role === 'user'

        if (msg.role === 'tool') {
            return (
                <div className="tool-message">
                    <div className="tool-header">
                        <TerminalIcon size={12} />
                        <span>{msg.toolName}</span>
                    </div>
                    <pre className="tool-output">{msg.toolResult}</pre>
                </div>
            )
        }

        // Extract thinking blocks from content
        const thinkingMatch = msg.content.match(/<thinking>([\s\S]*?)<\/thinking>/i)
        const thinking = thinkingMatch ? thinkingMatch[1].trim() : null
        const contentWithoutThinking = msg.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()

        return (
            <>
                {thinking && !isOwn && (
                    <div className="thinking-block">
                        <div className="thinking-header">
                            <Loader2 size={12} className="thinking-spinner" />
                            <span>Thinking</span>
                        </div>
                        <div className="thinking-content">{thinking}</div>
                    </div>
                )}
                <div className={`message-bubble ${isOwn ? 'own' : ''} ${msg.isError ? 'error' : ''}`}>
                    <div className="message-info">
                        <span className="sender-name">{msg.sender === 'You' ? '' : (msg.sender || (msg.role === 'assistant' ? (msg.modelId ? getModelById(msg.modelId)?.name : 'Assistant') : ''))}</span>
                        {msg.encrypted && <Lock size={10} className="lock-icon" />}
                    </div>
                    <div
                        className="bubble-content"
                        dangerouslySetInnerHTML={{
                            __html: sanitizeContent(contentWithoutThinking || msg.content)
                                .replace(/\n/g, '<br/>') // Preserve line breaks after sanitization
                        }}
                    />
                    <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            </>
        )
    }

    return (
        <div className="unified-panel">
            {/* Top Tabs */}
            <nav className="panel-tabs">
                <PanelTab icon={<MessageSquare size={16} />} label="Collaboration" active={activeMode === 'collaboration'} onClick={() => setActiveMode('collaboration')} />
                <PanelTab icon={<Zap size={16} />} label="Agent" active={activeMode === 'agent'} onClick={() => setActiveMode('agent')} badge={agent.pendingCount} />
            </nav>

            {/* Content Area */}
            <div className="panel-content">
                {activeMode === 'collaboration' && (
                    <div className="mode-container collaboration">
                        <div className="mode-header">
                            <div className="header-title">Team Chat</div>
                            <div className="header-badges">
                                {encryptionEnabled && <span className="badge success"><Lock size={12} /> Encrypted</span>}
                                <span className={`status-dot ${synced ? 'online' : 'away'}`} />
                            </div>
                        </div>
                        <div className="messages-list">
                            {p2pMessages.length === 0 ? (
                                <div className="empty-state">
                                    <MessageSquare size={48} className="empty-icon" />
                                    <h3>No messages yet.</h3>
                                    <p>Start the conversation!</p>
                                </div>
                            ) : (
                                p2pMessages.map((m: any) => <MessageBubble key={m.id} msg={{ ...m, content: getP2PContent(m) }} />)
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                )}

                {activeMode === 'agent' && (
                    <div className="mode-container agent">
                        <div className="mode-header">
                            <div className="ai-source-toggle">
                                <button className={`src-btn ${!showAutonomous ? 'active' : ''}`} onClick={() => setShowAutonomous(false)}><Bot size={14} /> Chat</button>
                                <button className={`src-btn ${showAutonomous ? 'active' : ''}`} onClick={() => setShowAutonomous(true)}>
                                    <Zap size={14} /> Autonomous {agent.pendingCount > 0 && <span className="mini-badge">{agent.pendingCount}</span>}
                                </button>
                            </div>
                            <div className="header-controls">
                                {!showAutonomous ? (
                                    <>
                                        <div className="ai-mode-toggle">
                                            <button className={`mode-btn ${aiMode === 'cloud' ? 'active' : ''}`} onClick={() => setAiMode('cloud')}><Cloud size={12} /></button>
                                            <button className={`mode-btn ${aiMode === 'offline' ? 'active' : ''}`} onClick={() => setAiMode('offline')}><Monitor size={12} /></button>
                                        </div>
                                        <button className={`tool-btn ${includeContext ? 'active' : ''}`} onClick={() => setIncludeContext(!includeContext)} title="Include workspace context"><Paperclip size={16} /></button>
                                        {aiMode === 'cloud' ? (
                                            <select className="provider-select" value={currentProvider} onChange={e => setCurrentProvider(e.target.value as any)}>
                                                {availableCloudProviders.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                                {availableCloudProviders.length === 0 && <option disabled>No API Keys</option>}
                                            </select>
                                        ) : (
                                            <button className="model-select-btn" onClick={() => setShowModelManager(true)}>
                                                {currentOfflineModel ? currentOfflineModel.name : 'Select Model'} <ChevronDown size={12} />
                                            </button>
                                        )}
                                        <button className="tool-btn" onClick={() => setAiMessages([])} title="Clear history"><Trash2 size={16} /></button>
                                    </>
                                ) : (
                                    <>
                                        <div className="ai-mode-toggle">
                                            <button className={`mode-btn ${agentAIMode === 'cloud' ? 'active' : ''}`} onClick={() => setAgentAIMode('cloud')} title="Cloud AI"><Cloud size={12} /></button>
                                            <button className={`mode-btn ${agentAIMode === 'offline' ? 'active' : ''}`} onClick={() => setAgentAIMode('offline')} title="Local AI"><Monitor size={12} /></button>
                                        </div>
                                        {agentAIMode === 'offline' && (
                                            <button className="model-select-btn" onClick={() => setShowModelManager(true)}>
                                                {currentOfflineModel ? currentOfflineModel.name : 'Select Model'} <ChevronDown size={12} />
                                            </button>
                                        )}
                                        <button className={`toggle-switch ${agent.config.enabled ? 'on' : 'off'}`} onClick={agent.toggleEnabled} title={agent.canRun ? 'Toggle autonomous monitoring' : 'Configure API keys or load model to enable agent'}>
                                            {agent.config.enabled ? 'ACTIVE' : 'IDLE'}
                                        </button>
                                        <button className={`tool-btn ${showLog ? 'active' : ''}`} onClick={() => setShowLog(!showLog)}><Scroll size={16} /></button>
                                    </>
                                )}
                            </div>
                        </div>

                        {!showAutonomous ? (
                            // Chat Mode
                            <>

                                {aiMode === 'offline' && isModelLoading && <div className="status-bar loading"><Loader2 size={14} className="animate-spin mr-1" /> Loading model...</div>}
                                {aiMode === 'offline' && loadError && <div className="status-bar error"><AlertCircle size={14} className="mr-1" /> {loadError}</div>}
                                <div className="status-bar note"><Info size={14} className="inline mr-1" /> Note: small parameter LLMS do not function as well as larger ones</div>

                                <div className="messages-list">
                                    {aiMessages.length === 0 && !streamingContent && (
                                        <div className="empty-state">
                                            <Bot size={48} className="empty-icon" />
                                            <h3>AI Agent Ready</h3>
                                            <p>Ask me anything about your project or request changes with tool access.</p>
                                        </div>
                                    )}
                                    {aiMessages.map(m => <MessageBubble key={m.id} msg={m} />)}

                                    {/* Real-time Thinking Bubble during generation */}
                                    {(isThinking || thinkingContent) && (
                                        <div className={`thinking-bubble ${isThinking ? 'active' : ''}`}>
                                            <button
                                                className="thinking-toggle"
                                                onClick={() => setShowThinking(!showThinking)}
                                            >
                                                <Brain size={14} className={isThinking ? 'pulse' : ''} />
                                                <span>Thinking{isThinking ? '...' : ''}</span>
                                                <ChevronDown size={12} className={showThinking ? 'rotate' : ''} />
                                            </button>
                                            {showThinking && thinkingContent && (
                                                <div className="thinking-content">{thinkingContent}</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Streaming Response (after thinking) */}
                                    {streamingContent && (
                                        <div className="message-bubble assistant streaming">
                                            <div className="bubble-content">{streamingContent}</div>
                                            <div className="typing-indicator"><span></span><span></span><span></span></div>
                                        </div>
                                    )}

                                    {/* Inline Tool Approval Card */}
                                    {pendingToolRequest && (
                                        <div className="inline-tool-approval">
                                            <div className="tool-card-header">
                                                <div className="tool-icon-wrapper execute">
                                                    <TerminalIcon size={16} />
                                                </div>
                                                <span className="tool-name">
                                                    Requesting: <strong>{pendingToolRequest.toolName}</strong>
                                                </span>
                                            </div>

                                            <div className="tool-params">
                                                {Object.entries(pendingToolRequest.params).map(([key, value]) => (
                                                    <div key={key} className="param-row">
                                                        <span className="param-key">{key}:</span>
                                                        <span className="param-value">
                                                            {typeof value === 'string' && value.includes('\n') ? (
                                                                <pre>{value}</pre>
                                                            ) : (
                                                                JSON.stringify(value)
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="tool-actions">
                                                <button
                                                    className="action-btn reject"
                                                    onClick={() => {
                                                        toolConfirmationResolver?.resolve({ approved: false, alwaysAllow: false })
                                                        setPendingToolRequest(null)
                                                    }}
                                                >
                                                    <X size={14} /> Cancel
                                                </button>
                                                <button
                                                    className="action-btn approve"
                                                    onClick={() => {
                                                        toolConfirmationResolver?.resolve({ approved: true, alwaysAllow: false })
                                                        setPendingToolRequest(null)
                                                    }}
                                                >
                                                    <Zap size={14} /> Run Tool
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </>
                        ) : (
                            // Autonomous Mode
                            <div className="agent-body">
                                {/* Workspace Scan Section */}
                                {workspacePath && agent.config.enabled && (
                                    <div className="workspace-scan-section">
                                        {/* Info Banner */}
                                        <div className="scan-info-banner">
                                            <Info size={14} />
                                            <span>
                                                Analyzes up to <strong>500 lines</strong> per file across <strong>25 files</strong>.
                                                Supports TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, and more.
                                                Timeout: 120s per file.
                                            </span>
                                        </div>

                                        <button
                                            className="scan-workspace-btn"
                                            onClick={async () => {
                                                if (!workspacePath) return
                                                setIsProcessing(true)
                                                setScanProgress({ current: 0, total: 0, currentFile: 'Indexing workspace...' })

                                                try {
                                                    // All IDE-supported languages
                                                    const codeExtensions = /\.(ts|tsx|js|jsx|json|md|css|scss|html|py|rs|go|java|c|cpp|h|hpp|yaml|yml|xml|sql|sh|bash|ps1|rb|php|swift|kt|scala|vue|svelte|lua|r|m|mm|zig|nim|ex|exs|clj|hs|fs|dart|toml|ini|cfg|conf)$/i
                                                    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'coverage', '.cache', '.turbo', '.vercel', 'vendor', 'packages', '.idea', '.vscode']

                                                    const allCodeFiles: { name: string; path: string; size?: number }[] = []

                                                    const collectFiles = async (dirPath: string, depth = 0) => {
                                                        if (depth > 5) return

                                                        const result = await globalThis.window.electronAPI?.fs.readDir(dirPath)
                                                        if (!result?.success || !result.items) return

                                                        for (const item of result.items) {
                                                            if (ignoreDirs.includes(item.name) || item.name.startsWith('.')) continue

                                                            const fullPath = `${dirPath}${dirPath.endsWith('/') || dirPath.endsWith('\\') ? '' : '/'}${item.name}`

                                                            if (item.isDirectory) {
                                                                await collectFiles(fullPath, depth + 1)
                                                            } else if (codeExtensions.test(item.name)) {
                                                                allCodeFiles.push({ name: item.name, path: fullPath, size: item.size })
                                                            }
                                                        }
                                                    }

                                                    await collectFiles(workspacePath)

                                                    // Prioritize important files (entry points, configs, core logic)
                                                    const priorityPatterns = [/index\./i, /main\./i, /app\./i, /config/i, /\.config\./i, /service/i, /util/i, /helper/i]
                                                    const sortedFiles = allCodeFiles
                                                        .map(f => ({
                                                            ...f,
                                                            priority: priorityPatterns.some(p => p.test(f.name)) ? 0 : 1
                                                        }))
                                                        .sort((a, b) => a.priority - b.priority || (a.size || 0) - (b.size || 0))

                                                    const filesToAnalyze = sortedFiles.slice(0, 25)
                                                    setScanProgress({ current: 0, total: filesToAnalyze.length, currentFile: 'Starting analysis...' })

                                                    if (filesToAnalyze.length === 0) {
                                                        setAiMessages(prev => [...prev, {
                                                            id: crypto.randomUUID(),
                                                            role: 'assistant',
                                                            content: 'No code files found in the workspace to analyze.',
                                                            timestamp: Date.now()
                                                        }])
                                                        return
                                                    }

                                                    const allIssues: Array<{
                                                        file: string
                                                        path: string
                                                        type: string
                                                        severity: string
                                                        line?: number
                                                        description: string
                                                        suggestion: string
                                                    }> = []

                                                    let skippedFiles = 0
                                                    let timedOutFiles = 0
                                                    let analyzedFiles = 0

                                                    // Smart line extraction: get first 500 lines
                                                    const extractSmartContent = (content: string, maxLines = 500): string => {
                                                        const lines = content.split('\n')
                                                        if (lines.length <= maxLines) return content

                                                        // Take first 500 lines (includes imports, class definitions, main logic)
                                                        return lines.slice(0, maxLines).join('\n')
                                                    }

                                                    // Detect language from extension
                                                    const getLanguage = (fileName: string): string => {
                                                        const ext = fileName.split('.').pop()?.toLowerCase() || ''
                                                        const langMap: Record<string, string> = {
                                                            'ts': 'TypeScript', 'tsx': 'TypeScript/React', 'js': 'JavaScript', 'jsx': 'JavaScript/React',
                                                            'py': 'Python', 'rs': 'Rust', 'go': 'Go', 'java': 'Java', 'c': 'C', 'cpp': 'C++',
                                                            'h': 'C Header', 'hpp': 'C++ Header', 'swift': 'Swift', 'kt': 'Kotlin',
                                                            'rb': 'Ruby', 'php': 'PHP', 'sql': 'SQL', 'sh': 'Shell', 'bash': 'Bash',
                                                            'vue': 'Vue', 'svelte': 'Svelte', 'scala': 'Scala', 'dart': 'Dart', 'lua': 'Lua',
                                                            'r': 'R', 'ex': 'Elixir', 'hs': 'Haskell', 'fs': 'F#', 'clj': 'Clojure', 'zig': 'Zig'
                                                        }
                                                        return langMap[ext] || ext.toUpperCase()
                                                    }

                                                    // Analyze each file with 120s timeout
                                                    for (let i = 0; i < filesToAnalyze.length; i++) {
                                                        const file = filesToAnalyze[i]
                                                        setScanProgress({ current: i + 1, total: filesToAnalyze.length, currentFile: file.name })

                                                        const content = await globalThis.window.electronAPI?.fs.readFile(file.path)
                                                        if (!content?.success || !content.content) {
                                                            skippedFiles++
                                                            continue
                                                        }

                                                        // Skip very small files (< 5 lines)
                                                        const lineCount = content.content.split('\n').length
                                                        if (lineCount < 5) {
                                                            skippedFiles++
                                                            continue
                                                        }

                                                        // Extract fewer lines for offline (faster), more for cloud
                                                        const maxLines = agentAIMode === 'offline' ? 200 : 500
                                                        const fileContent = extractSmartContent(content.content, maxLines)
                                                        const language = getLanguage(file.name)

                                                        // Simpler prompt for offline models (faster generation)
                                                        const offlinePrompt = `Review this ${language} file "${file.name}".

${fileContent}

Return JSON: {"issues":[{"type":"bug"|"security"|"performance"|"improvement","description":"...","suggestion":"..."}]}`

                                                        const cloudPrompt = `Analyze this ${language} code for bugs, security issues, and improvements.

File: ${file.name} (${lineCount} lines total, showing first ${Math.min(lineCount, maxLines)})

\`\`\`${language.toLowerCase()}
${fileContent}
\`\`\`

Find REAL issues only:
- Bugs: null refs, logic errors, type issues
- Security: XSS, injection, hardcoded secrets, unsafe patterns
- Performance: memory leaks, inefficient code, N+1 queries
- Improvements: dead code, missing error handling, bad practices

Output JSON with issues array. If no issues, return {"issues": []}`

                                                        const prompt = agentAIMode === 'offline' ? offlinePrompt : cloudPrompt

                                                        try {
                                                            let response: string

                                                            // 60s timeout for offline (smaller context), 120s for cloud
                                                            const fileTimeoutMs = agentAIMode === 'offline' ? 60000 : 120000
                                                            let timeoutId: number | undefined

                                                            if (agentAIMode === 'offline' && loadedModelId) {
                                                                // Note: Don't use jsonSchema with small offline models - causes them to stall
                                                                // Instead, use prompt-based JSON formatting with lower maxTokens for speed
                                                                const generatePromise = offlineLLMService.generate([
                                                                    { role: 'system', content: `You are a code reviewer. Output ONLY valid JSON.` },
                                                                    { role: 'user', content: prompt }
                                                                ], {
                                                                    temperature: 0.1,
                                                                    maxTokens: 800 // Lower tokens for faster response
                                                                })

                                                                // Create timeout that also cancels the generation
                                                                const timeoutPromise = new Promise<string>((_, reject) => {
                                                                    timeoutId = window.setTimeout(async () => {
                                                                        // Cancel the ongoing generation
                                                                        await offlineLLMService.cancelGeneration()
                                                                        reject(new Error('Analysis timed out'))
                                                                    }, fileTimeoutMs)
                                                                })

                                                                try {
                                                                    response = await Promise.race([generatePromise, timeoutPromise])
                                                                } finally {
                                                                    if (timeoutId) clearTimeout(timeoutId)
                                                                }
                                                            } else {
                                                                // Cloud AI mode with 120s timeout
                                                                const cloudTimeoutPromise = new Promise<any>((_, reject) => {
                                                                    timeoutId = window.setTimeout(() => reject(new Error('Analysis timed out')), fileTimeoutMs)
                                                                })

                                                                const chatPromise = aiService.chat([
                                                                    { role: 'system', content: `You are a senior ${language} code reviewer. Find bugs, security issues, and improvements. Output valid JSON only.` },
                                                                    { role: 'user', content: prompt }
                                                                ], currentProvider, {
                                                                    temperature: 0.1,
                                                                    maxTokens: 1200
                                                                })

                                                                try {
                                                                    const cloudResponse = await Promise.race([chatPromise, cloudTimeoutPromise])
                                                                    if (typeof cloudResponse === 'string') {
                                                                        throw new Error(cloudResponse)
                                                                    }
                                                                    if (cloudResponse.error) {
                                                                        console.error('Cloud AI error:', cloudResponse.error)
                                                                        skippedFiles++
                                                                        continue
                                                                    }
                                                                    response = cloudResponse.content
                                                                } finally {
                                                                    if (timeoutId) clearTimeout(timeoutId)
                                                                }
                                                            }

                                                            analyzedFiles++

                                                            // Parse JSON response
                                                            let jsonStr = response
                                                            const jsonMatch = /```json?\n?([\s\S]*?)\n?```/.exec(response) || /{[\s\S]*}/.exec(response)
                                                            if (jsonMatch) {
                                                                jsonStr = jsonMatch[1] || jsonMatch[0]
                                                            }

                                                            const analysis = JSON.parse(jsonStr)

                                                            if (analysis.issues && Array.isArray(analysis.issues)) {
                                                                for (const issue of analysis.issues) {
                                                                    if (issue.description && issue.suggestion) {
                                                                        allIssues.push({
                                                                            file: file.name,
                                                                            path: file.path,
                                                                            type: issue.type || 'improvement',
                                                                            severity: issue.severity || 'medium',
                                                                            line: issue.line,
                                                                            description: issue.description,
                                                                            suggestion: issue.suggestion
                                                                        })
                                                                    }
                                                                }
                                                            }
                                                        } catch (e) {
                                                            const errorMsg = e instanceof Error ? e.message : 'Unknown error'
                                                            if (errorMsg.includes('timed out')) {
                                                                timedOutFiles++
                                                                console.warn('Analysis timed out for', file.name)
                                                            } else {
                                                                console.error('Failed to analyze', file.name, e)
                                                                skippedFiles++
                                                            }
                                                        }
                                                    }

                                                    // Sort issues by severity
                                                    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
                                                    allIssues.sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] || 3) - (severityOrder[b.severity as keyof typeof severityOrder] || 3))

                                                    // Map severity to confidence
                                                    const severityToConfidence: Record<string, number> = { critical: 0.95, high: 0.85, medium: 0.7, low: 0.5 }

                                                    // Add issues to agent suggestions system
                                                    const agentSuggestions = allIssues.slice(0, 20).map(issue => ({
                                                        action: 'suggest' as const,
                                                        target: 'file-system' as const,
                                                        description: `[${issue.type.toUpperCase()}] ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.description}`,
                                                        reasoning: issue.suggestion,
                                                        confidence: severityToConfidence[issue.severity] || 0.6,
                                                        payload: {
                                                            message: issue.suggestion,
                                                            category: issue.type as 'bug' | 'security' | 'performance' | 'improvement',
                                                            filePath: issue.path,
                                                            lineNumber: issue.line
                                                        }
                                                    }))

                                                    if (agentSuggestions.length > 0) {
                                                        agent.addSuggestions(agentSuggestions)
                                                    }

                                                    // Summary counts
                                                    const bugCount = allIssues.filter(i => i.type === 'bug').length
                                                    const securityCount = allIssues.filter(i => i.type === 'security').length
                                                    const perfCount = allIssues.filter(i => i.type === 'performance').length
                                                    const improvementCount = allIssues.filter(i => i.type === 'improvement').length

                                                    // Build status notes
                                                    const statusNotes: string[] = []
                                                    if (skippedFiles > 0) statusNotes.push(`${skippedFiles} skipped`)
                                                    if (timedOutFiles > 0) statusNotes.push(`${timedOutFiles} timed out`)

                                                    // Add summary message to chat
                                                    setAiMessages(prev => [...prev, {
                                                        id: crypto.randomUUID(),
                                                        role: 'assistant',
                                                        content: `**Workspace Scan Complete**\n\nSuccessfully analyzed **${analyzedFiles}** of ${filesToAnalyze.length} files.${statusNotes.length > 0 ? `\n_(${statusNotes.join(', ')})_` : ''}\n\n` +
                                                            (allIssues.length > 0
                                                                ? `Found **${allIssues.length}** issues:\n` +
                                                                  `- 🐛 Bugs: ${bugCount}\n` +
                                                                  `- 🔒 Security: ${securityCount}\n` +
                                                                  `- ⚡ Performance: ${perfCount}\n` +
                                                                  `- 💡 Improvements: ${improvementCount}\n\n` +
                                                                  `**Review issues in the Pending Tasks section above** to approve or reject suggestions.`
                                                                : '✅ No major issues found! Your code looks good.'),
                                                        timestamp: Date.now()
                                                    }])

                                                } catch (err) {
                                                    setAiMessages(prev => [...prev, {
                                                        id: crypto.randomUUID(),
                                                        role: 'assistant',
                                                        content: `Error scanning workspace: ${err instanceof Error ? err.message : 'Unknown error'}`,
                                                        timestamp: Date.now(),
                                                        isError: true
                                                    }])
                                                } finally {
                                                    setIsProcessing(false)
                                                    setScanProgress(null)
                                                }
                                            }}
                                            disabled={!agent.canRun || isProcessing}
                                        >
                                            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
                                            {isProcessing
                                                ? (scanProgress
                                                    ? `Scanning (${scanProgress.current}/${scanProgress.total})...`
                                                    : 'Scanning...')
                                                : 'Scan Workspace Files'}
                                        </button>
                                        {scanProgress && (
                                            <div className="scan-progress">
                                                <div className="progress-bar">
                                                    <div
                                                        className="progress-fill"
                                                        style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}
                                                    />
                                                </div>
                                                <span className="progress-file">{scanProgress.currentFile}</span>
                                            </div>
                                        )}
                                        <p className="scan-description">
                                            Deep scan of all code files for bugs, security vulnerabilities, performance issues, and improvements.
                                        </p>
                                    </div>
                                )}

                                {agent.suggestions.filter(s => s.status === 'pending').length > 0 && (
                                    <div className="suggestions-section">
                                        <div className="section-title">Pending Tasks ({agent.pendingCount})</div>
                                        <div className="suggestions-list">
                                            {agent.suggestions.filter(s => s.status === 'pending').map(s => {
                                                const category = (s.payload as any)?.category || 'improvement'
                                                const isBug = category === 'bug'
                                                const isPerformance = category === 'performance'
                                                const isSecurity = category === 'security'
                                                const isImprovement = category === 'improvement'
                                                const filePath = (s.payload as any)?.filePath
                                                const lineNumber = (s.payload as any)?.lineNumber

                                                return (
                                                    <div key={s.id} className={`suggestion-card ${isBug ? 'bug' : ''} ${isSecurity ? 'security' : ''}`}>
                                                        <div className="card-header">
                                                            {isBug && <Bug size={14} />}
                                                            {isSecurity && <Shield size={14} />}
                                                            {isPerformance && <Zap size={14} />}
                                                            {isImprovement && <Lightbulb size={14} />}
                                                            {isBug && <span className="category-badge bug">BUG</span>}
                                                            {isSecurity && <span className="category-badge security">SECURITY</span>}
                                                            {isPerformance && <span className="category-badge performance">PERFORMANCE</span>}
                                                            {isImprovement && <span className="category-badge improvement">IMPROVEMENT</span>}
                                                            <span className="confidence-score">{Math.round(s.confidence * 100)}%</span>
                                                        </div>
                                                        {filePath && (
                                                            <div className="card-file-path">
                                                                {filePath.split(/[/\\]/).pop()}{lineNumber ? `:${lineNumber}` : ''}
                                                            </div>
                                                        )}
                                                        <div className="card-body">
                                                            <div className="desc">{s.description}</div>
                                                            <div className="reason">{s.reasoning}</div>
                                                        </div>
                                                        <div className="card-actions">
                                                            <button className="reject-btn" onClick={() => agent.rejectSuggestion(s.id)}><X size={14} /> Dismiss</button>
                                                            <button className="approve-btn" onClick={() => agent.approveSuggestion(s.id)}><Check size={14} /> Apply</button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {showLog && (
                                    <div className="log-section">
                                        <div className="log-header">
                                            <span>Activity Log</span>
                                            <button className="clear-link" onClick={agent.clearActivityLog}>Clear</button>
                                        </div>
                                        <div className="log-entries">
                                            {agent.activityLog.map(entry => (
                                                <div key={entry.id} className="log-entry">
                                                    <span className="entry-icon">{entry.type === 'execution' ? <Zap size={10} /> : <Scroll size={10} />}</span>
                                                    <span className="entry-msg">{entry.message}</span>
                                                    <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!agent.config.enabled && agent.suggestions.filter(s => s.status === 'pending').length === 0 && (
                                    <div className="agent-intro">
                                        <Zap size={48} className="intro-icon" />
                                        <h3>Autonomous Agent</h3>
                                        <p>
                                            {agent.canRun
                                                ? 'Enable the agent to automatically detect bugs, suggest fixes, identify code quality issues, and provide actionable improvements while you work.'
                                                : agentAIMode === 'offline'
                                                    ? 'Load an offline model to enable autonomous bug detection and code analysis.'
                                                    : 'The autonomous agent requires valid API keys for OpenAI, Anthropic, or Google to function.'
                                            }
                                        </p>
                                        {!agent.canRun && (
                                            <div className="setup-hint">
                                                {agentAIMode === 'offline'
                                                    ? 'Click the model selector above to choose and load a model.'
                                                    : 'Configure keys in Settings > API Keys or switch to Local AI mode.'
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Input Section */}
            {(activeMode === 'collaboration' || (activeMode === 'agent' && !showAutonomous)) && (
                <div className="input-section">
                    <div className="input-wrapper">
                        <textarea
                            ref={inputRef}
                            className="panel-textarea"
                            placeholder={activeMode === 'collaboration' ? "Message team..." : "Ask agent..."}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            }}
                            rows={1}
                            disabled={isProcessing || (activeMode === 'collaboration' && !canChat)}
                        />
                        <button
                            className={`send-action ${isProcessing ? 'stop-btn' : ''}`}
                            onClick={isProcessing ? handleStop : handleSend}
                            disabled={!isProcessing && !input.trim()}
                            title={isProcessing ? "Stop generation" : "Send message"}
                        >
                            {isProcessing ? <Square size={18} /> : <Send size={18} />}
                        </button>
                    </div>
                </div>
            )}

            {showModelManager && <UnifiedSettingsPanel onClose={() => setShowModelManager(false)} />}

            <style>{`
                .unified-panel {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--color-bg);
                    border-left: 1px solid var(--color-border-subtle);
                    color: var(--color-text);
                    font-family: var(--font-sans);
                }

                .panel-tabs {
                    display: flex;
                    padding: var(--space-2);
                    background: var(--color-surface);
                    border-bottom: 1px solid var(--color-border-subtle);
                    gap: var(--space-1);
                }

                .tab-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-2);
                    padding: var(--space-2);
                    font-size: var(--text-xs);
                    font-weight: var(--font-medium);
                    color: var(--color-text-tertiary);
                    border-radius: var(--radius-md);
                    transition: all var(--transition-fast);
                    position: relative;
                    border: none;
                    background: transparent;
                }
        
                .tab-btn:hover { color: var(--color-text-secondary); background: var(--color-surface-elevated); }
                .tab-btn.active { color: var(--color-accent); background: rgba(59, 130, 246, 0.1); }
        
                .badge-count {
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    background: var(--color-accent);
                    color: #000;
                    font-size: 9px;
                    font-weight: 700;
                    min-width: 14px;
                    height: 14px;
                    border-radius: 7px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px;
                }
        
                .panel-content {
                    flex: 1;
                    overflow: hidden;
                    position: relative;
                }
        
                .mode-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
        
                .mode-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-3) var(--space-4);
                    border-bottom: 1px solid var(--color-border-subtle);
                    background: var(--color-surface-subtle);
                }
        
                .header-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
        
                .header-badges { display: flex; align-items: center; gap: var(--space-3); }
                .badge { font-size: 10px; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 600; display: flex; align-items: center; gap: 4px; }
                .badge.success { background: rgba(34, 197, 94, 0.1); color: var(--color-success); }
                .status-dot { width: 8px; height: 8px; border-radius: 50%; }
                .status-dot.online { background: var(--color-success); }
                .status-dot.away { background: var(--color-warning); }
        
                .messages-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--space-4);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-3);
                }
        
                .message-bubble {
                    max-width: 90%;
                    padding: var(--space-3);
                    border-radius: var(--radius-lg);
                    font-size: var(--text-sm);
                    line-height: 1.5;
                    align-self: flex-start;
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border-subtle);
                }
        
                .message-bubble.own {
                    align-self: flex-end;
                    background: var(--color-accent);
                    color: #000;
                    border-color: transparent;
                }
        
                .message-bubble.error { border-color: var(--color-error); }
        
                .message-info {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--color-text-muted);
                }

                .bubble-content { white-space: pre-wrap; word-break: break-word; }
                .message-time { font-size: 9px; opacity: 0.6; margin-top: 4px; text-align: right; }

                .tool-message {
                    background: var(--color-bg-darker, #111);
                    border: 1px solid var(--color-accent);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    margin: var(--space-1) 0;
                    max-width: 90%;
                }

                .tool-header {
                    padding: 4px 8px;
                    background: rgba(59, 130, 246, 0.15);
                    color: var(--color-accent);
                    font-size: 11px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .tool-output {
                    padding: 8px;
                    margin: 0;
                    font-family: var(--font-mono);
                    font-size: 11px;
                    overflow-x: auto;
                    color: var(--color-text-secondary);
                    white-space: pre-wrap;
                }

                .thinking-header {
                    padding: 6px 10px;
                    background: rgba(168, 85, 247, 0.1);
                    color: #a855f7;
                    font-size: 11px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .thinking-spinner {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .thinking-content {
                    padding: 10px;
                    font-size: 12px;
                    line-height: 1.6;
                    color: var(--color-text-secondary);
                    white-space: pre-wrap;
                    font-style: italic;
                }

                /* Real-time Thinking Bubble */
                .thinking-bubble {
                    background: rgba(168, 85, 247, 0.08);
                    border: 1px solid rgba(168, 85, 247, 0.25);
                    border-radius: var(--radius-lg);
                    margin: var(--space-2) 0;
                    max-width: 90%;
                    overflow: hidden;
                }

                .thinking-bubble.active {
                    border-color: rgba(168, 85, 247, 0.5);
                    box-shadow: 0 0 12px rgba(168, 85, 247, 0.15);
                }

                .thinking-toggle {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: transparent;
                    border: none;
                    color: #a855f7;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s;
                }

                .thinking-toggle:hover {
                    background: rgba(168, 85, 247, 0.1);
                }

                .thinking-toggle.pulse {
                    animation: pulse 1.5s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.1); }
                }

                .thinking-toggle.rotate {
                    transform: rotate(180deg);
                }

                .thinking-bubble .thinking-content {
                    padding: 0 14px 12px;
                    border-top: 1px solid rgba(168, 85, 247, 0.15);
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .subscription-notice {
                    padding: var(--space-2);
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid var(--color-error);
                    border-radius: var(--radius-md);
                    color: var(--color-error);
                    font-size: 11px;
                    font-weight: 600;
                    text-align: center;
                }

                .input-section {
                    padding: var(--space-3) var(--space-4);
                    border-top: 1px solid var(--color-border-subtle);
                    background: var(--color-surface);
                }

                .input-wrapper {
                    display: flex;
                    align-items: flex-end;
                    gap: var(--space-2);
                    background: var(--color-bg);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    padding: 6px 10px;
                    transition: border-color var(--transition-fast);
                }

                .input-wrapper:focus-within { border-color: var(--color-accent); }

                .panel-textarea {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: var(--color-text);
                    font-size: var(--text-sm);
                    resize: none;
                    padding: 6px 0;
                    max-height: 120px;
                    outline: none;
                    line-height: 1.4;
                }

                .send-action {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-accent);
                    border-radius: var(--radius-md);
                    transition: transform var(--transition-fast);
                    border: none;
                    background: transparent;
                    cursor: pointer;
                }

                .send-action:hover:not(:disabled) { transform: translateY(-1px); color: var(--color-accent-hover); }
                .send-action:disabled { opacity: 0.4; cursor: not-allowed; }
                .send-action.stop-btn { color: var(--color-error); }
                .send-action.stop-btn:hover:not(:disabled) { color: #ff4444; }

                .ai-source-toggle {
                    display: flex;
                    background: var(--color-surface-elevated);
                    padding: 3px;
                    border-radius: var(--radius-md);
                    gap: 4px;
                    border: 1px solid var(--color-border-subtle);
                }

                .src-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 12px;
                    font-size: 11px;
                    font-weight: 500;
                    color: var(--color-text-tertiary);
                    border-radius: var(--radius-sm);
                    transition: all var(--transition-fast);
                    position: relative;
                    border: none;
                }

                .src-btn.active { background: var(--color-surface); color: var(--color-text); box-shadow: var(--shadow-sm); }

                .mini-badge {
                    background: var(--color-error);
                    color: #fff;
                    font-size: 9px;
                    font-weight: 700;
                    padding: 1px 4px;
                    border-radius: 8px;
                    margin-left: 4px;
                }

                .ai-mode-toggle {
                    display: flex;
                    gap: 4px;
                    padding: 3px;
                    background: var(--color-surface-elevated);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--color-border-subtle);
                }

                .mode-btn {
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-text-tertiary);
                    border-radius: var(--radius-sm);
                    transition: all var(--transition-fast);
                    border: none;
                }

                .mode-btn:hover { background: var(--color-surface); }
                .mode-btn.active { background: var(--color-surface); color: var(--color-accent); box-shadow: var(--shadow-sm); }

                .header-controls { display: flex; align-items: center; gap: var(--space-3); }
                .tool-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-text-tertiary);
                    border-radius: var(--radius-sm);
                    transition: all var(--transition-fast);
                    border: none;
                    background: transparent;
                }
                .tool-btn:hover { background: var(--color-surface-elevated); color: var(--color-text); }
                .tool-btn.active { color: var(--color-accent); }

                .provider-select, .model-select-btn {
                    font-size: 10px;
                    font-weight: 600;
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    color: var(--color-text-secondary);
                }

                .model-select-btn { display: flex; align-items: center; gap: 6px; border: none; cursor: pointer; }

                .status-bar { padding: 4px; text-align: center; font-size: 10px; font-weight: 600; }
                .status-bar.loading { background: var(--color-accent); color: #000; }
                .status-bar.error { background: var(--color-error); color: #fff; }
                .status-bar.note { background: var(--color-bg-secondary); color: var(--color-text-secondary); margin-bottom: 8px; font-weight: normal; font-style: italic; }




                .agent-body { flex: 1; overflow-y: auto; padding: var(--space-4); }

                .workspace-scan-section {
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    padding: var(--space-4);
                    margin-bottom: var(--space-4);
                }

                .scan-info-banner {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 10px 12px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: var(--radius-sm);
                    margin-bottom: 12px;
                    font-size: 11px;
                    color: var(--color-text-secondary);
                    line-height: 1.4;
                }

                .scan-info-banner svg {
                    flex-shrink: 0;
                    color: var(--color-accent);
                    margin-top: 1px;
                }

                .scan-info-banner strong {
                    color: var(--color-text);
                    font-weight: 600;
                }

                .scan-workspace-btn {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    background: linear-gradient(135deg, var(--color-accent), #8b5cf6);
                    color: #fff;
                    border: none;
                    border-radius: var(--radius-md);
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    box-shadow: var(--shadow-sm);
                }

                .scan-workspace-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: var(--shadow-md);
                }

                .scan-workspace-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .scan-description {
                    margin-top: 8px;
                    font-size: 11px;
                    color: var(--color-text-muted);
                    text-align: center;
                }

                .scan-progress {
                    margin-top: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .progress-bar {
                    height: 6px;
                    background: var(--color-border);
                    border-radius: 3px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--color-accent), #8b5cf6);
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }

                .progress-file {
                    font-size: 10px;
                    color: var(--color-text-muted);
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }

                .agent-status-indicator { display: flex; align-items: center; gap: 12px; }
                .status-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--color-surface-elevated);
                    border: 2px solid var(--color-border);
                }
                .status-icon.state-executing { border-color: var(--color-accent); color: var(--color-accent); animation: pulse 1s infinite alternate; }
                .status-icon.state-waiting-approval { border-color: var(--color-warning); color: var(--color-warning); }
                .status-icon.state-observing { border-color: var(--color-success); color: var(--color-success); }
                
                .status-text.main-status { font-weight: 700; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.5px; }
                .status-text.sub-status { font-size: 10px; color: var(--color-text-muted); }

                .toggle-switch {
                    font-size: 10px;
                    font-weight: 800;
                    padding: 5px 12px;
                    border-radius: 14px;
                    transition: all var(--transition-fast);
                    border: 1px solid transparent;
                }
                .toggle-switch.on { background: var(--color-success); color: #000; cursor: pointer; box-shadow: var(--shadow-sm); }
                .toggle-switch.off { background: var(--color-surface-elevated); color: var(--color-text-tertiary); cursor: pointer; border-color: var(--color-border); }
                .toggle-switch:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
                .error-text { color: var(--color-error); font-weight: 700; }
                .setup-hint { margin-top: 12px; font-size: 11px; color: var(--color-accent); font-weight: 600; }

                .suggestions-section { margin-top: var(--space-6); }
                .section-title { font-size: 11px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 12px; }
                
                .suggestion-card {
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    padding: var(--space-3);
                    margin-bottom: var(--space-3);
                    transition: all var(--transition-fast);
                }

                .suggestion-card.bug {
                    border-color: var(--color-error);
                    background: rgba(239, 68, 68, 0.05);
                }

                .suggestion-card.security {
                    border-color: #a855f7;
                    background: rgba(168, 85, 247, 0.05);
                }

                .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }

                .card-file-path {
                    font-size: 10px;
                    font-family: var(--font-mono);
                    color: var(--color-accent);
                    margin-bottom: 8px;
                    padding: 4px 8px;
                    background: var(--color-surface-subtle);
                    border-radius: var(--radius-sm);
                    display: inline-block;
                }
                .action-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-text); }

                .category-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                    font-size: 9px;
                    font-weight: 700;
                    line-height: 1;
                }

                .category-badge.bug {
                    background: rgba(239, 68, 68, 0.15);
                    color: var(--color-error);
                }

                .category-badge.security {
                    background: rgba(168, 85, 247, 0.15);
                    color: #a855f7;
                }

                .category-badge.performance {
                    background: rgba(251, 191, 36, 0.15);
                    color: var(--color-warning);
                }

                .category-badge.improvement {
                    background: rgba(34, 197, 94, 0.15);
                    color: var(--color-success);
                }

                .confidence-score { margin-left: auto; font-size: 10px; color: var(--color-accent); font-weight: 700; }

                .card-body { margin-bottom: 8px; }
                .card-body .desc { font-size: 13px; font-weight: 500; margin-bottom: 6px; line-height: 1.4; }
                .card-body .reason { font-size: 11px; color: var(--color-text-muted); line-height: 1.4; padding: 8px; background: var(--color-surface-subtle); border-radius: var(--radius-sm); }

                .card-actions { display: flex; gap: var(--space-2); margin-top: 12px; }
                .card-actions button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; cursor: pointer; border: none; transition: all var(--transition-fast); }
                .reject-btn { background: var(--color-surface); color: var(--color-text-secondary); }
                .reject-btn:hover { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
                .approve-btn { background: var(--color-success); color: #000; }
                .approve-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }

                .log-section { margin-top: var(--space-6); background: var(--color-surface-subtle); border-radius: var(--radius-md); padding: var(--space-3); }
                .log-header { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 8px; }
                .clear-link { color: var(--color-text-muted); text-decoration: underline; font-size: 10px; background: none; border: none; cursor: pointer; }
                .log-entries { display: flex; flex-direction: column; gap: 4px; }
                .log-entry { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--color-text-secondary); }
                .entry-time { margin-left: auto; font-family: var(--font-mono); opacity: 0.6; }

                .empty-state, .agent-intro {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    color: var(--color-text-muted);
                    padding: var(--space-6);
                }
                .empty-icon, .intro-icon { color: var(--color-surface-elevated); margin-bottom: 12px; }
                .empty-state h3, .agent-intro h3 { color: var(--color-text-secondary); margin-bottom: 8px; font-size: var(--text-lg); }
                .empty-state p, .agent-intro p { font-size: var(--text-sm); line-height: 1.5; max-width: 240px; }

                @keyframes pulse {
                    from { opacity: 0.6; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1.05); }
                }

                .typing-indicator { display: flex; gap: 4px; padding: 4px; }
                .typing-indicator span { width: 6px; height: 6px; background: var(--color-accent); border-radius: 50%; animation: typing 1s infinite alternate; }
                .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
                .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

                @keyframes typing { from { transform: translateY(0); opacity: 0.3; } to { transform: translateY(-4px); opacity: 1; } }

                /* Inline Tool Approval Card */
                .inline-tool-approval {
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    margin: var(--space-3) 0;
                    overflow: hidden;
                    animation: slideIn 0.2s ease-out;
                    box-shadow: var(--shadow-md);
                }

                .tool-card-header {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                    padding: var(--space-3);
                    background: var(--color-surface-subtle);
                    border-bottom: 1px solid var(--color-border-subtle);
                }

                .tool-icon-wrapper {
                    width: 32px;
                    height: 32px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .tool-icon-wrapper.execute {
                    background: rgba(168, 85, 247, 0.1);
                    color: #a855f7;
                }

                .tool-name {
                    font-size: var(--text-sm);
                    color: var(--color-text);
                }

                .tool-params {
                    padding: var(--space-3);
                    font-family: var(--font-mono);
                    font-size: var(--text-xs);
                    color: var(--color-text-secondary);
                    max-height: 200px;
                    overflow-y: auto;
                }

                .param-row {
                    margin-bottom: 6px;
                }

                .param-key {
                    color: var(--color-accent);
                    margin-right: 8px;
                    font-weight: 600;
                }

                .tool-actions {
                    display: flex;
                    gap: var(--space-2);
                    padding: var(--space-3);
                    background: var(--color-surface-subtle);
                    border-top: 1px solid var(--color-border-subtle);
                }

                .action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 8px;
                    border-radius: var(--radius-md);
                    font-size: var(--text-xs);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.1s;
                    border: none;
                }

                .action-btn.approve {
                    background: var(--color-success);
                    color: #000;
                    border: 1px solid transparent;
                }
                .action-btn.approve:hover { filter: brightness(1.1); }

                .action-btn.reject {
                    background: var(--color-surface);
                    color: var(--color-text);
                    border: 1px solid var(--color-border);
                }
                .action-btn.reject:hover { background: var(--color-surface-elevated); }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div >
    )
}

function PanelTab({ icon, label, active, onClick, badge }: Omit<TabProps, 'id'>) {
    return (
        <button className={`tab-btn ${active ? 'active' : ''}`} onClick={onClick} title={label}>
            {icon}
            <span>{label}</span>
            {badge !== undefined && badge > 0 && <div className="badge-count">{badge}</div>}
        </button>
    )
}
