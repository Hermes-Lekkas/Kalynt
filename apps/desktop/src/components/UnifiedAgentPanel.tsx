/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYArray, useAwareness } from '../hooks/useYjs'
import { usePermissions } from '../hooks/usePermissions'
import { encryptionService, EncryptedPayload } from '../services/encryptionService'
import { aiService, AIProvider, PROVIDER_MODELS } from '../services/aiService'
import { offlineLLMService } from '../services/offlineLLMService'
import { useModelStore } from '../stores/modelStore'
import { useAgent } from '../hooks/useAgent'
import { toolPermissionManager, stopActiveTool, type ToolCallRequest } from '../services/ideAgentTools'
import { agentLoopService } from '../services/agentLoopService'
import type { AgentStep, AgentLoopEvent } from '../types/agentTypes'
import { getModelById } from '../types/offlineModels'
import UnifiedSettingsPanel from './UnifiedSettingsPanel'
import WorkspaceScanTab from './aiscan/WorkspaceScanTab'
import CollaborationPanel from './collaboration'
import { workspaceScanService } from '../services/workspaceScanService'
import { fileTransferService } from '../services/fileTransferService'
import { useNotificationStore } from '../stores/notificationStore'
import {
    MessageSquare, Zap, Lock, Send, Trash2,
    Cloud, Terminal as TerminalIcon,
    Scroll, X, Bot, AlertCircle,
    ChevronDown, Monitor, Loader2, Square,
    Brain, Info, Wrench, CheckCircle2,
    Play, FileCode, Users, CornerUpLeft, User, File, Globe,
    Settings, History, Plus
} from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

// --- Types ---
type PanelMode = 'collaboration' | 'agent'
type AIMode = 'cloud' | 'offline'

/**
 * Clean model output by removing special tokens, raw JSON tool calls, and formatting artifacts
 * This ensures users see clean, readable messages
 */
function cleanModelOutput(text: string): string {
    if (!text) return ''

    return text
        // Remove special tokens (Qwen/ChatML format)
        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>/g, '')
        .replace(/<\|im_end\|/g, '')
        .replace(/<\|im_start\|/g, '')
        .replace(/<\|end_of_text\|>/g, '')
        .replace(/<\|start_of_role\|>/g, '')
        .replace(/<\|end_of_role\|>/g, '')
        // Remove special tokens (Llama/Mistral format)
        .replace(/<\/s>/g, '')
        .replace(/<s>/g, '')
        .replace(/\[INST\]/g, '')
        .replace(/\[\/INST\]/g, '')
        // Remove tool call formats (don't show raw JSON to users)
        .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<function=\w+>[\s\S]*?<\/function>/gi, '')
        // Remove raw JSON tool calls ({"name": "...", "params": ...})
        .replace(/\{"name"\s*:\s*"(readFile|listDirectory|writeFile|runCommand|executeCode|createFile|delete)"[\s\S]*?\}/g, '')
        // Remove standalone tool JSON (simpler pattern)
        .replace(/\{"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[^}]*\}\s*\}/g, '')
        // Remove role markers that might leak through
        .replace(/\n?(user|assistant|system)\s*$/gi, '')
        // Clean up excessive whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

interface TabProps {
    id: PanelMode
    icon: React.ReactNode
    label: string
    active: boolean
    onClick: () => void
    badge?: number
}

export interface ChatMessage {
    id: string
    role?: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    sender?: string
    senderId?: string
    timestamp: number
    channelId?: string
    encrypted?: boolean
    name?: string
    data?: string
    isError?: boolean
    modelId?: string
    isLoading?: boolean
    issueType?: string
    thinking?: string  // Model's chain-of-thought reasoning
    replyToId?: string // [NEW] ID of the message being replied to
    replyToContent?: string // [NEW] Snippet of original message
    replyToSender?: string // [NEW] Sender of original message
}

// --- Component ---
interface UnifiedAgentPanelProps {
    readonly workspacePath: string | null
    /** @deprecated These props are not used internally but kept for API compatibility */
    readonly currentFile?: string | null
    /** @deprecated These props are not used internally but kept for API compatibility */
    readonly currentFileContent?: string | null
    readonly editorMode?: any
    /** @deprecated These props are not used internally but kept for API compatibility */
    readonly onRunCommand?: (command: string) => void
}

export default function UnifiedAgentPanel({
    workspacePath,
    editorMode = 'general'
}: UnifiedAgentPanelProps) {
    // --- State & Refs (Top-level) ---
    const [encryptionEnabled, setEncryptionEnabled] = useState(false)
    const [decryptedCache, setDecryptedCache] = useState<Map<string, string>>(new Map())
    const [decryptionErrors, setDecryptionErrors] = useState<Set<string>>(new Set())

    const [activeMode, setActiveMode] = useState<PanelMode>('agent')
    const [aiMode, setAiMode] = useState<AIMode>('cloud')
    const [input, setInput] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [showModelManager, setShowModelManager] = useState(false)
    const [currentProvider, setCurrentProvider] = useState<AIProvider>('openai')
    const [cloudModel, setCloudModel] = useState<string>('')
    const [showLog, setShowLog] = useState(false)
    const [showAutonomous, setShowAutonomous] = useState(false)
    const [showTeamPanel, setShowTeamPanel] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')

    const { sessions, currentSessionId, createSession, deleteSession, setCurrentSession, addMessageToSession, renameSession } = useChatStore()

    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
    const [localFiles, setLocalFiles] = useState<Array<{ name: string, path: string }>>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [suggestionType, setSuggestionType] = useState<'user' | 'file'>('user')
    const [suggestionFilter, setSuggestionFilter] = useState('')
    const [suggestionIndex, setSuggestionIndex] = useState(0)

    const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
    const [streamingContent, setStreamingContent] = useState('')
    const [thinkingContent, setThinkingContent] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [showThinking, setShowThinking] = useState(false)

    const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
    const [agentLoopRunning, setAgentLoopRunning] = useState(false)
    const [agentIteration, setAgentIteration] = useState<{ current: number; max: number } | null>(null)
    const [useAgentLoop, setUseAgentLoop] = useState(true)
    const [agentAIMode, setAgentAIMode] = useState<AIMode>('cloud')

    const [pendingToolRequest, setPendingToolRequest] = useState<ToolCallRequest | null>(null)
    const [toolConfirmationResolver, setToolConfirmationResolver] = useState<{
        resolve: (value: { approved: boolean; alwaysAllow: boolean }) => void
    } | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isMountedRef = useRef(true)
    const processedMessagesRef = useRef<Set<string>>(new Set())
    const initializedRef = useRef(false)
    const userId = useRef((function () {
        const key = 'unified-user-id'
        const saved = localStorage.getItem(key)
        if (saved) return saved
        const newId = crypto.randomUUID()
        localStorage.setItem(key, newId)
        return newId
    })())

    // --- Custom Hooks ---
    const { currentSpace, apiKeys, userName, setShowSettings, setSettingsTab } = useAppStore()
    const { addNotification } = useNotificationStore()
    const { doc, provider, synced } = useYDoc(currentSpace?.id ?? null)
    const { items: p2pMessages, push: pushP2P } = useYArray<any>(doc, 'messages')
    const { users, setLocalState, localClientId } = useAwareness(provider)
    const { canChat } = usePermissions()
    const { loadedModelId, isLoading: isModelLoading, loadError } = useModelStore()
    const agent = useAgent(currentSpace?.id ?? null, editorMode, agentAIMode === 'offline', workspacePath || '')

    // --- Sync Chat History ---
    useEffect(() => {
        if (currentSessionId) {
            const session = sessions.find(s => s.id === currentSessionId)
            if (session) {
                setAiMessages(session.messages)
            }
        } else if (sessions.length === 0) {
            // Create first session if none exist - only when sessions array is empty
            createSession('First Chat')
        }
        // Note: setCurrentSession is not used here, removed from deps
    }, [currentSessionId, sessions, createSession])

    // --- Mention Notifications ---
    useEffect(() => {
        if (!p2pMessages.length || !userName) return

        // Initialize processed set with current messages to avoid notifications for history
        if (!initializedRef.current) {
            p2pMessages.forEach(m => processedMessagesRef.current.add(m.id))
            initializedRef.current = true
            return
        }

        // We only care about the last message added
        const lastMsg = p2pMessages[p2pMessages.length - 1]

        // Skip if already processed, or if it's from us
        if (processedMessagesRef.current.has(lastMsg.id) || lastMsg.senderId === userId.current) {
            return
        }

        // Check for mention in content
        // Need to wait for decryption if it's encrypted
        let content = lastMsg.content
        if (lastMsg.encrypted) {
            if (decryptedCache.has(lastMsg.id)) {
                content = decryptedCache.get(lastMsg.id)
            } else {
                // Not decrypted yet, useEffect will re-run when decryptedCache changes
                return
            }
        }

        // Basic mention check: @UserName
        const mentionRegex = new RegExp(`@${userName}\\b`, 'i')
        const isMentioned = mentionRegex.test(content)
        const isReplyToUs = lastMsg.replyToSender === userName

        if (isMentioned || isReplyToUs) {
            const message = isMentioned
                ? `You were mentioned by ${lastMsg.sender || 'someone'} in Team Chat`
                : `${lastMsg.sender || 'Someone'} replied to your message`

            addNotification(message, 'info')
            processedMessagesRef.current.add(lastMsg.id)
        } else {
            // Even if no mention, mark as processed so we don't check again
            processedMessagesRef.current.add(lastMsg.id)
        }
    }, [p2pMessages, decryptedCache, userName, addNotification])


    // Index local files for tagging
    useEffect(() => {
        if (!workspacePath) {
            setLocalFiles([])
            return
        }

        const indexLocalFiles = async () => {
            try {
                const results: Array<{ name: string, path: string }> = []
                const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'target']

                const scan = async (dir: string) => {
                    const res = await window.electronAPI?.fs.readDir(dir)
                    if (res?.success && res.items) {
                        for (const item of res.items) {
                            if (ignoreDirs.includes(item.name) || item.name.startsWith('.')) continue

                            if (item.isDirectory) {
                                await scan(item.path)
                            } else {
                                results.push({ name: item.name, path: item.path })
                            }
                        }
                    }
                }

                await scan(workspacePath)
                setLocalFiles(results)
            } catch (e) {
                console.warn('[UnifiedAgentPanel] Failed to index local files:', e)
            }
        }

        indexLocalFiles()
    }, [workspacePath])

    // --- Tagging & Autocomplete Logic ---
    const allFilesSuggestions = useMemo(() => {
        const p2p = fileTransferService.getFiles().map(f => ({ name: f.name, path: f.id, type: 'p2p' }))
        const local = localFiles.map(f => ({ name: f.name, path: f.path, type: 'local' }))
        return [...p2p, ...local]
    }, [localFiles])

    const filteredSuggestions = useMemo(() => {
        if (!showSuggestions) return []

        if (suggestionType === 'user') {
            const usersList = Array.from(users.values())
                .map(u => ({ name: u.user?.name || 'Anonymous', id: u.user?.id }))
                .filter(u => u.name.toLowerCase().includes(suggestionFilter.toLowerCase()))

            // Unique by name for simple tagging
            const unique = new Map()
            usersList.forEach(u => unique.set(u.name, u))
            return Array.from(unique.values())
        } else {
            return allFilesSuggestions
                .filter(f => f.name.toLowerCase().includes(suggestionFilter.toLowerCase()))
                .slice(0, 10) // Limit suggestions
        }
    }, [showSuggestions, suggestionType, suggestionFilter, users, allFilesSuggestions])

    // Handle tag clicks
    useEffect(() => {
        const handleTagClick = (e: Event) => {
            const detail = (e as CustomEvent<{ type: string, path: string }>).detail
            if (detail.type === 'local') {
                window.dispatchEvent(new CustomEvent('kalynt-open-file', { detail: { path: detail.path } }))
            } else if (detail.type === 'p2p') {
                // Future: Navigate to files panel and highlight
                window.dispatchEvent(new CustomEvent('kalynt-open-p2p-file', { detail: { id: detail.path } }))
            }
        }

        window.addEventListener('kalynt-tag-click', handleTagClick)
        return () => window.removeEventListener('kalynt-tag-click', handleTagClick)
    }, [])

    // --- Typing Indicator Logic ---
    const handleTyping = (text: string) => {
        setInput(text)

        // Detect @ mention trigger
        const cursorPosition = inputRef.current?.selectionStart || 0
        const textBeforeCursor = text.slice(0, cursorPosition)
        const match = textBeforeCursor.match(/@([\w.-]*)$/)

        if (match) {
            setShowSuggestions(true)
            const filter = match[1]
            setSuggestionFilter(filter)
            setSuggestionIndex(0)

            // Smart switch: if filter contains a dot, likely a file
            if (filter.includes('.')) {
                setSuggestionType('file')
            } else if (suggestionType !== 'file') {
                setSuggestionType('user')
            }
        } else {
            setShowSuggestions(false)
        }

        if (activeMode === 'collaboration') {
            setLocalState('isTyping', true)

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

            typingTimeoutRef.current = setTimeout(() => {
                setLocalState('isTyping', false)
            }, 2000)
        }
    }

    const applySuggestion = (suggestion: any) => {
        const cursorPosition = inputRef.current?.selectionStart || 0
        const textBeforeCursor = input.slice(0, cursorPosition)
        const textAfterCursor = input.slice(cursorPosition)

        // For files, we might want to store the path. 
        // We'll use a special format: @[name](path) that our parser will handle
        const replacement = suggestionType === 'file'
            ? `@[${suggestion.name}](${suggestion.type}://${suggestion.path})`
            : `@${suggestion.name}`

        const newTextBefore = textBeforeCursor.replace(/@[\w.-]*$/, `${replacement} `)
        setInput(newTextBefore + textAfterCursor)
        setShowSuggestions(false)

        // Refocus and set cursor
        setTimeout(() => {
            if (inputRef.current) {
                const newPos = newTextBefore.length
                inputRef.current.focus()
                inputRef.current.setSelectionRange(newPos, newPos)
            }
        }, 0)
    }

    const typingUsers = Array.from(users.entries())
        .filter(([id, state]) => id !== localClientId && state.isTyping)
        .map(([_, state]) => state.user?.name || 'Someone')

    // --- Initialization & Sync ---

    // Sync API keys to aiService
    useEffect(() => {
        if (apiKeys.openai) aiService.setAPIKey('openai', apiKeys.openai)
        else aiService.removeAPIKey('openai')

        if (apiKeys.anthropic) aiService.setAPIKey('anthropic', apiKeys.anthropic)
        else aiService.removeAPIKey('anthropic')

        if (apiKeys.google) aiService.setAPIKey('google', apiKeys.google)
        else aiService.removeAPIKey('google')
    }, [apiKeys])

    // FIX BUG-008: Set mounted state on component lifecycle
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            // Clear typing timeout to prevent state updates on unmounted component
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }
            // Clear scroll timeout
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current)
            }
        }
    }, [])

    // Load encryption
    // FIX BUG-007: Add proper error handling for encryption initialization
    useEffect(() => {
        if (!currentSpace) return
        const settings = localStorage.getItem(`space-settings-${currentSpace.id}`)
        if (settings) {
            try {
                const parsed = JSON.parse(settings)
                if (parsed.encryptionEnabled && parsed.roomPassword) {
                    encryptionService.setRoomKey(currentSpace.id, parsed.roomPassword)
                        .then(() => {
                            setEncryptionEnabled(true)
                        })
                        .catch((e) => {
                            console.error('Failed to initialize encryption:', e)
                            // Don't set encryptionEnabled to true if initialization failed
                            setEncryptionEnabled(false)
                        })
                }
            } catch (e) { console.error('Failed to load encryption settings:', e) }
        }
    }, [currentSpace])

    // Wire up Agent Loop Service events
    useEffect(() => {
        // Configure the loop service with current settings
        agentLoopService.setWorkspacePath(workspacePath || '')
        agentLoopService.setUseOfflineAI(aiMode === 'offline')
        agentLoopService.setCloudProvider(currentProvider)
    }, [workspacePath, aiMode, currentProvider])

    useEffect(() => {
        const unsubscribe = agentLoopService.on((event: AgentLoopEvent) => {
            if (!isMountedRef.current) return

            switch (event.type) {
                case 'started':
                    setAgentSteps([])
                    setAgentLoopRunning(true)
                    setAgentIteration(null)
                    break
                case 'step-added':
                    setAgentSteps(prev => [...prev, event.step])
                    setTimeout(scrollToBottom, 50)
                    break
                case 'streaming':
                    setStreamingContent(cleanModelOutput(event.text))
                    break
                case 'thinking':
                    setThinkingContent(event.content)
                    setIsThinking(true)
                    break
                case 'iteration':
                    setAgentIteration({ current: event.iteration, max: event.maxIterations })
                    break
                case 'tool-executing':
                    // Just show progress in steps, no chat message yet
                    break
                case 'tool-result':
                    if (currentSessionId) {
                        const toolMsg: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: 'tool',
                            name: event.toolName,
                            data: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
                            content: `Executed ${event.toolName}`,
                            timestamp: Date.now()
                        }
                        setAiMessages(prev => [...prev, toolMsg])
                        addMessageToSession(currentSessionId, toolMsg)
                    }
                    break
                case 'completed':
                    setAgentLoopRunning(false)
                    setIsProcessing(false)
                    setStreamingContent('')
                    setIsThinking(false)
                    setThinkingContent('')
                    if (event.finalMessage && currentSessionId) {
                        const assistantMsg: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: event.finalMessage,
                            timestamp: Date.now(),
                            modelId: loadedModelId || undefined
                        }
                        setAiMessages(prev => [...prev, assistantMsg])
                        addMessageToSession(currentSessionId, assistantMsg)
                    }
                    break
                case 'error':
                    setAgentLoopRunning(false)
                    setIsProcessing(false)
                    setStreamingContent('')
                    if (currentSessionId) {
                        const errorMsg: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: `Error: ${event.error}`,
                            timestamp: Date.now(),
                            isError: true
                        }
                        setAiMessages(prev => [...prev, errorMsg])
                        addMessageToSession(currentSessionId, errorMsg)
                    }
                    break
                case 'aborted':
                    setAgentLoopRunning(false)
                    setIsProcessing(false)
                    setStreamingContent('')
                    setIsThinking(false)
                    setThinkingContent('')
                    break
            }
        })

        return unsubscribe
    }, [loadedModelId, currentSessionId, addMessageToSession])

    // Register Tool Confirmation Handler
    useEffect(() => {
        const handler = async (request: ToolCallRequest) => {
            return new Promise<{ approved: boolean; alwaysAllow: boolean }>((resolve) => {
                setPendingToolRequest(request)
                setToolConfirmationResolver({
                    resolve: (result) => {
                        resolve(result)
                        setPendingToolRequest(null)
                        setToolConfirmationResolver(null)
                        setTimeout(scrollToBottom, 100)
                    }
                })
                setTimeout(scrollToBottom, 100)
            })
        }

        toolPermissionManager.setConfirmationHandler(handler)
        toolPermissionManager.setTrustedMode(false)
        toolPermissionManager.setReadOnlyAutoAllow(true)

        return () => {
            // FIX: Reject any pending confirmation before cleanup to unblock agent loop
            if (toolConfirmationResolver) {
                toolConfirmationResolver.resolve({ approved: false, alwaysAllow: false })
                setToolConfirmationResolver(null)
            }
            toolPermissionManager.setConfirmationHandler(null as any)
            toolPermissionManager.setTrustedMode(false)
            toolPermissionManager.clearSession()
        }
    }, [toolConfirmationResolver])


    // Scroll to bottom helper with debounce
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    
    const scrollToBottom = useCallback(() => {
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }, [])

    // Scroll to bottom on message changes only (not on activity log changes)
    useEffect(() => {
        scrollToBottom()
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current)
            }
        }
    }, [p2pMessages.length, aiMessages.length, streamingContent, activeMode, showLog, scrollToBottom])

    // Focus input
    useEffect(() => {
        if (inputRef.current) inputRef.current.focus()
    }, [activeMode, aiMode])


    // --- P2P Encryption Logic ---
    useEffect(() => {
        if (!currentSpace || !encryptionEnabled) return
        
        const decryptAll = async () => {
            const roomKey = encryptionService.getRoomKey(currentSpace.id)
            if (!roomKey) return
            
            // Use functional updates to avoid dependency on state
            const processedIds = new Set<string>()
            
            // Process each message
            for (const msg of p2pMessages) {
                if (!msg.encrypted || processedIds.has(msg.id)) continue
                processedIds.add(msg.id)
                
                // Skip already processed messages using functional state check
                let shouldSkip = false
                setDecryptedCache(prev => {
                    if (prev.has(msg.id)) shouldSkip = true
                    return prev
                })
                setDecryptionErrors(prev => {
                    if (prev.has(msg.id)) shouldSkip = true
                    return prev
                })
                
                if (shouldSkip) continue
                
                try {
                    const payload: EncryptedPayload = JSON.parse(msg.content)
                    const decrypted = await encryptionService.decryptToString(payload, roomKey)

                    // Handle structured message format
                    let content: string
                    try {
                        const parsed = JSON.parse(decrypted)
                        content = parsed.text || decrypted
                    } catch {
                        content = decrypted
                    }

                    setDecryptedCache(prev => new Map(prev).set(msg.id, content))
                } catch (_e) {
                    setDecryptionErrors(prev => new Set(prev).add(msg.id))
                }
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

    // Get available models for current provider
    const availableCloudModels = useMemo(() => {
        return PROVIDER_MODELS[currentProvider] || []
    }, [currentProvider])

    // FIX BUG-011: Auto-select available provider if current is invalid
    useEffect(() => {
        if (availableCloudProviders.length > 0 && !availableCloudProviders.includes(currentProvider)) {
            setCurrentProvider(availableCloudProviders[0])
        }
    }, [availableCloudProviders, currentProvider])

    // Default cloud model when provider changes
    useEffect(() => {
        if (availableCloudModels.length > 0) {
            // Pick a reasonable default (prefer Ultra/Pro models if available)
            const defaultModel = availableCloudModels.find(m => m.includes('pro') || m.includes('ultra') || m.includes('sonnet') || m.includes('preview'))
                || availableCloudModels[0]
            setCloudModel(defaultModel)
        }
    }, [currentProvider, availableCloudModels])

    const handleStop = async () => {
        if (!isProcessing && !agentLoopRunning) return

        try {
            // 1. Abort agent loop if running
            if (agentLoopRunning) {
                await agentLoopService.abort()
            }

            // Cancel backend generation FIRST before resetting UI
            const currentAIMode = showAutonomous ? agentAIMode : aiMode

            // 2. Cancel LLM generation
            if (currentAIMode === 'offline') {
                await offlineLLMService.cancelGeneration()
            } else {
                aiService.cancelStream()
            }

            // 3. Cancel any executing tools
            await stopActiveTool()

            // 4. If in autonomous mode, stop the agent
            if (showAutonomous) {
                await workspaceScanService.stopScan()
                agent.toggleEnabled()
            }

            // Reset all generation state
            setIsProcessing(false)
            setAgentLoopRunning(false)
            setStreamingContent('')
            setThinkingContent('')
            setIsThinking(false)
            setAgentIteration(null)
        } catch (error) {
            console.error('Stop generation error:', error)
            setIsProcessing(false)
            setAgentLoopRunning(false)
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

            const replyInfo = replyTo ? {
                replyToId: replyTo.id,
                replyToContent: replyTo.content.slice(0, 100),
                replyToSender: replyTo.sender === 'You' ? useAppStore.getState().userName : (replyTo.sender || 'Assistant')
            } : {}

            if (encryptionEnabled && currentSpace) {
                const key = encryptionService.getRoomKey(currentSpace.id)
                if (key) {
                    const payload = await encryptionService.encrypt(JSON.stringify({ text, ...replyInfo }), key)
                    const msgId = crypto.randomUUID()
                    setDecryptedCache(prev => new Map(prev).set(msgId, text))
                    content = JSON.stringify(payload)
                    encrypted = true
                    pushP2P({ id: msgId, content, sender: 'You', senderId: userId.current, timestamp: Date.now(), encrypted, ...replyInfo })
                    setInput('')
                    setReplyTo(null)
                    return
                }
            }
            pushP2P({ id: crypto.randomUUID(), content, sender: 'You', senderId: userId.current, timestamp: Date.now(), encrypted: false, ...replyInfo })
            setInput('')
            setReplyTo(null)
            return
        }

        if (activeMode === 'agent' && !showAutonomous) {
            if (aiMode === 'cloud' && availableCloudProviders.length === 0) return
            if (aiMode === 'offline' && !loadedModelId) return

            if (!currentSessionId) {
                const id = createSession('New Chat')
                // Wait for state update is tricky, but createSession returns the ID
                const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() }
                setAiMessages([userMsg])
                addMessageToSession(id, userMsg)
                setInput('')
                setIsProcessing(true)
                triggerAgentLoop(text, [userMsg], id)
                return
            }

            const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() }
            setAiMessages(prev => [...prev, userMsg])
            addMessageToSession(currentSessionId, userMsg)
            setInput('')
            setIsProcessing(true)

            triggerAgentLoop(text, [...aiMessages, userMsg], currentSessionId)
        }
    }

    const triggerAgentLoop = async (text: string, messages: ChatMessage[], sessionId: string) => {
        // ---- Agent Loop Service (ReAct engine) ----
        setAgentSteps([])
        setAgentLoopRunning(true)
        agentLoopService.setUseOfflineAI(aiMode === 'offline')
        agentLoopService.setCloudProvider(currentProvider)
        agentLoopService.setWorkspacePath(workspacePath || '')

        // Build chat history for context
        const chatHistory = messages.map(m => ({
            role: m.role === 'tool' ? 'assistant' : (m.role || 'user'),
            content: m.role === 'tool' ? `Tool ${m.name} result: ${m.data?.slice(0, 500) || m.content}` : m.content
        }))

        try {
            await agentLoopService.run(text, chatHistory, {
                trustedMode: toolPermissionManager.isTrustedMode(),
                autoApproveReadOnly: true,
                model: aiMode === 'cloud' ? cloudModel : loadedModelId || undefined
            })
        } catch (err) {
            if (isMountedRef.current) {
                const errorMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `Error: ${err instanceof Error ? err.message : 'Agent loop failed'}`,
                    timestamp: Date.now(),
                    isError: true
                }
                setAiMessages(prev => [...prev, errorMsg])
                addMessageToSession(sessionId, errorMsg)
            }
        } finally {
            if (isMountedRef.current) {
                setIsProcessing(false)
                setAgentLoopRunning(false)
                setStreamingContent('')
            }
        }
    }

    // --- Sub-components ---

    // BUG #6: Sanitize AI responses to prevent XSS
    // SECURITY: Encodes all OWASP-recommended characters for HTML context
    const sanitizeContent = (text: string): string => {
        return text
            .replace(/&/g, '&amp;')   // Must be first to avoid double-encoding
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
        // Removing forward slash sanitization as it breaks markdown parsing and is generally safe in text content
    }

    const parseMarkdown = (text: string): string => {
        return text
            // Bold (**text**)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic (*text* or _text_)
            .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
            // Inline Code (`text`)
            .replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')
            // Strikethrough (~text~)
            .replace(/~(.*?)~/g, '<del>$1</del>')
            // File Mentions (@[name](type://path)) - MUST COME BEFORE User Mentions
            .replace(/@\[([^\]]+)\]\(([\w]+):\/\/([^)]+)\)/g, (_match, name, type, path) => {
                return `<span class="mention file ${type}" data-type="${type}" data-path="${path.replace(/"/g, '&quot;')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;margin-right:2px;vertical-align:middle;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>${name}</span>`
            })
            // User Mentions (@user)
            .replace(/@([a-zA-Z0-9_-]+)/g, '<span class="mention user">@$1</span>')
    }

    const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
        const isOwn = msg.senderId === userId.current || msg.role === 'user'

        const handleBubbleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement
            const mention = target.closest('.mention.file') as HTMLElement
            if (mention) {
                const type = mention.getAttribute('data-type')
                const path = mention.getAttribute('data-path')
                if (type && path) {
                    window.dispatchEvent(new CustomEvent('kalynt-tag-click', {
                        detail: { type, path }
                    }))
                }
            }
        }

        if (msg.role === 'tool') {
            const output = msg.data || ''
            let isJson = false
            let jsonResult: any = null

            // Try to parse JSON output (e.g. from executeCode)
            try {
                // Ensure output is a valid string before trimming
                if (output && typeof output === 'string' && output.trim().startsWith('{')) {
                    jsonResult = JSON.parse(output)
                    isJson = true
                }
            } catch { /* ignore */ }

            return (
                <div id={msg.id} className="tool-message">
                    <div className="tool-header">
                        <TerminalIcon size={12} />
                        <span>{msg.name}</span>
                    </div>
                    <div className="tool-output">
                        {isJson && (jsonResult.stdout !== undefined || jsonResult.stderr !== undefined) ? (
                            <div className="code-execution-result">
                                {jsonResult.stdout && (
                                    <div className="std-out">
                                        <div className="std-header">Output</div>
                                        <pre>{jsonResult.stdout}</pre>
                                    </div>
                                )}
                                {jsonResult.stderr && (
                                    <div className="std-err">
                                        <div className="std-header">Error</div>
                                        <pre className="error-text">{jsonResult.stderr}</pre>
                                    </div>
                                )}
                                {jsonResult.exitCode !== undefined && (
                                    <div className="exit-code">Exit Code: {jsonResult.exitCode}</div>
                                )}
                                {jsonResult.error && (
                                    <div className="exec-error">{jsonResult.error}</div>
                                )}
                            </div>
                        ) : (
                            <pre>{output}</pre>
                        )}
                    </div>
                </div>
            )
        }

        // Extract thinking blocks from content
        const thinkingMatch = msg.content.match(/<thinking>([\s\S]*?)<\/thinking>/i)
        const thinking = thinkingMatch ? thinkingMatch[1].trim() : null
        const contentWithoutThinking = msg.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()

        // Process content: Sanitize -> Markdown -> Line Breaks
        const processedContent = parseMarkdown(sanitizeContent(contentWithoutThinking || msg.content))
            .replace(/\n/g, '<br/>')

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
                <div id={msg.id} className={`message-bubble ${isOwn ? 'own' : ''} ${msg.isError ? 'error' : ''} ${msg.replyToId ? 'has-reply' : ''}`}>
                    {msg.replyToId && (
                        <div className="reply-quote" onClick={() => {
                            const target = document.getElementById(msg.replyToId!);
                            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}>
                            <span className="reply-sender">{msg.replyToSender}</span>
                            <div className="reply-text">{msg.replyToContent}</div>
                        </div>
                    )}
                    <div className="message-info">
                        <span className="sender-name">{msg.sender === 'You' ? '' : (msg.sender || (msg.role === 'assistant' ? (msg.modelId ? getModelById(msg.modelId)?.name : 'Assistant') : ''))}</span>
                        {msg.encrypted && <Lock size={10} className="lock-icon" />}
                    </div>
                    <div
                        className="bubble-content"
                        onClick={handleBubbleClick}
                        dangerouslySetInnerHTML={{
                            __html: processedContent
                        }}
                    />
                    <div className="bubble-footer">
                        <button className="reply-action-btn" onClick={() => setReplyTo(msg)} title="Reply to message">
                            <CornerUpLeft size={12} />
                        </button>
                        <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
            </>
        )
    }

    return (
        <div className="unified-panel">
            {/* Top Tabs */}
            <nav className="panel-tabs">
                <PanelTab icon={<MessageSquare size={16} />} label="Collaboration" active={activeMode === 'collaboration'} onClick={() => setActiveMode('collaboration')} />
                <PanelTab icon={<Zap size={16} />} label="Agent" active={activeMode === 'agent'} onClick={() => setActiveMode('agent')} />
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
                                <button
                                    className="badge"
                                    onClick={() => setShowTeamPanel(true)}
                                    title="Manage team members & collaboration"
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Users size={12} /> Manage
                                </button>
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
                            <div className="unified-header-left">
                                <div className="source-switcher">
                                    <button
                                        className={`src-tab ${!showAutonomous ? 'active' : ''}`}
                                        onClick={() => setShowAutonomous(false)}
                                    >
                                        <Bot size={14} /> <span>Chat</span>
                                    </button>
                                    <button
                                        className={`src-tab ${showAutonomous ? 'active' : ''}`}
                                        onClick={() => setShowAutonomous(true)}
                                    >
                                        <Zap size={14} /> <span>AI Scan</span>
                                    </button>
                                </div>
                                <div className="divider-v" />
                                <div className="ai-source-group">
                                    <button
                                        className={`mode-pill ${(!showAutonomous ? aiMode === 'cloud' : agentAIMode === 'cloud') ? 'active' : ''}`}
                                        onClick={() => !showAutonomous ? setAiMode('cloud') : setAgentAIMode('cloud')}
                                    >
                                        <Cloud size={12} /> Cloud
                                    </button>
                                    <button
                                        className={`mode-pill ${(!showAutonomous ? aiMode === 'offline' : agentAIMode === 'offline') ? 'active' : ''}`}
                                        onClick={() => !showAutonomous ? setAiMode('offline') : setAgentAIMode('offline')}
                                    >
                                        <Monitor size={12} /> Local
                                    </button>
                                </div>
                                <button
                                    className="header-settings-btn"
                                    onClick={() => { setSettingsTab('agents'); setShowSettings(true); }}
                                    title="Configure AI Providers & Models"
                                >
                                    <Settings size={14} />
                                </button>
                            </div>

                            <div className="divider-v" />

                            <div className="unified-header-right">
                                <div className="action-group">
                                    {!showAutonomous ? (
                                        <>
                                            <button
                                                className={`action-icon-btn ${useAgentLoop ? 'active' : ''}`}
                                                onClick={() => setUseAgentLoop(!useAgentLoop)}
                                                title={useAgentLoop ? 'Multi-step Agent Mode' : 'Direct Chat Mode'}
                                            >
                                                <Play size={14} />
                                            </button>
                                            <button
                                                className={`action-icon-btn ${showHistory ? 'active' : ''}`}
                                                onClick={() => setShowHistory(!showHistory)}
                                                title="Previous Chats"
                                            >
                                                <History size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className={`status-toggle-btn ${agent.config.enabled ? 'active' : ''}`}
                                                onClick={agent.toggleEnabled}
                                                title={agent.canRun ? 'Toggle Autonomous Monitoring' : 'Configure AI to enable agent'}
                                            >
                                                <div className="status-indicator" />
                                                <span>{agent.config.enabled ? 'RUNNING' : 'STANDBY'}</span>
                                            </button>
                                            <button
                                                className={`action-icon-btn ${showLog ? 'active' : ''}`}
                                                onClick={() => setShowLog(!showLog)}
                                                title="Show Agent Logs"
                                            >
                                                <Scroll size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
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

                                    {/* Agent Loop Steps (ReAct engine progress) */}
                                    {agentSteps.length > 0 && (
                                        <div className="agent-steps-container">
                                            {agentIteration && (
                                                <div className="agent-iteration-badge">
                                                    Step {agentIteration.current}/{agentIteration.max}
                                                </div>
                                            )}
                                            {agentSteps.map(step => (
                                                <div key={step.id} className={`agent-step step-${step.type}`}>
                                                    <div className="step-icon">
                                                        {step.type === 'thinking' && <Brain size={14} />}
                                                        {step.type === 'tool-call' && <Wrench size={14} />}
                                                        {step.type === 'tool-result' && <CheckCircle2 size={14} />}
                                                        {step.type === 'answer' && <Bot size={14} />}
                                                        {step.type === 'plan' && <FileCode size={14} />}
                                                        {step.type === 'error' && <AlertCircle size={14} />}
                                                    </div>
                                                    <div className="step-content">
                                                        {step.type === 'tool-call' && (
                                                            <div className="step-tool-header">
                                                                <span className="tool-badge">{step.name}</span>
                                                                {step.params && (
                                                                    <span className="tool-params-summary">
                                                                        {Object.entries(step.params)
                                                                            .filter(([, v]) => typeof v === 'string' && (v as string).length < 60)
                                                                            .map(([k, v]) => `${k}: ${v}`)
                                                                            .join(', ')
                                                                            .slice(0, 120)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {step.type === 'tool-result' && (
                                                            <div className="step-tool-result">
                                                                <span className="tool-badge result">{step.name}</span>
                                                                <pre className="tool-result-pre">{
                                                                    typeof step.data === 'string'
                                                                        ? step.data.slice(0, 500)
                                                                        : JSON.stringify(step.data).slice(0, 500)
                                                                }</pre>
                                                                {step.duration && <span className="step-duration">{step.duration}ms</span>}
                                                            </div>
                                                        )}
                                                        {step.type === 'thinking' && (
                                                            <div className="step-thinking">{step.content.slice(0, 300)}{step.content.length > 300 ? '...' : ''}</div>
                                                        )}
                                                        {step.type === 'error' && (
                                                            <div className="step-error">{step.content}</div>
                                                        )}
                                                        {step.type === 'plan' && (
                                                            <div className="step-plan">
                                                                {step.content.split('\n').map((line, i) => (
                                                                    <div key={i} className="plan-line">{line}</div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {agentLoopRunning && (
                                                <div className="agent-step step-active">
                                                    <div className="step-icon"><Loader2 size={14} className="animate-spin" /></div>
                                                    <div className="step-content">
                                                        <span className="step-active-text">Agent is working...</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Real-time Thinking Bubble during generation */}
                                    {(isThinking || thinkingContent) && (
                                        <div className={`thinking-bubble-v2 ${isThinking ? 'active' : ''}`}>
                                            <div className="thinking-header-v2" onClick={() => setShowThinking(!showThinking)}>
                                                <div className="header-main">
                                                    <div className="brain-icon-wrapper">
                                                        <Brain size={14} className={isThinking ? 'animate-pulse' : ''} />
                                                    </div>
                                                    <span className="thinking-status">
                                                        {isThinking ? 'Agent is thinking...' : 'Thought Process'}
                                                    </span>
                                                </div>
                                                <div className="header-actions">
                                                    <ChevronDown size={14} className={`transform transition-transform duration-200 ${showThinking ? 'rotate-180' : ''}`} />
                                                </div>
                                            </div>
                                            {showThinking && thinkingContent && (
                                                <div className="thinking-body-v2">
                                                    <div className="thinking-scroll-area">
                                                        {thinkingContent}
                                                    </div>
                                                </div>
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

                                    <div ref={messagesEndRef} />
                                </div>
                            </>
                        ) : (
                            // Autonomous Mode
                            <WorkspaceScanTab
                                workspacePath={workspacePath}
                                aiMode={agentAIMode}
                                provider={currentProvider}
                                cloudModel={cloudModel}
                                availableProviders={availableCloudProviders}
                                onAiModeChange={(mode) => setAgentAIMode(mode)}
                                onProviderChange={(p) => setCurrentProvider(p)}
                                onShowModelManager={() => setShowModelManager(true)}
                            />
                        )}
                    </div>
                )}

                {/* Shared Inline Tool Approval Card */}
                {pendingToolRequest && (
                    <div className="shared-tool-approval">
                        <div className="tool-card-header">
                            <div className="tool-icon-wrapper execute">
                                <TerminalIcon size={16} />
                            </div>
                            <span className="tool-name">
                                <strong>{pendingToolRequest.toolName.toUpperCase()}</strong> permission requested
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
                                <X size={14} /> Deny
                            </button>
                            <button
                                className="action-btn approve"
                                onClick={() => {
                                    toolConfirmationResolver?.resolve({ approved: true, alwaysAllow: false })
                                    setPendingToolRequest(null)
                                }}
                            >
                                <Zap size={14} /> Approve & Run
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Section */}
            {(activeMode === 'collaboration' || (activeMode === 'agent' && !showAutonomous)) && (
                <div className="input-section">
                    {activeMode === 'collaboration' && typingUsers.length > 0 && (
                        <div className="typing-indicator-text">
                            <span className="typing-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </span>
                            {typingUsers.length > 2
                                ? 'Several people are typing'
                                : `${typingUsers.join(' and ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing`}
                        </div>
                    )}

                    {/* [NEW] Reply Preview */}
                    {replyTo && (
                        <div className="reply-preview animate-slideUp">
                            <div className="reply-preview-content">
                                <span className="reply-to-label">Replying to {replyTo.sender === 'You' ? 'yourself' : replyTo.sender}</span>
                                <div className="reply-to-text">{replyTo.content}</div>
                            </div>
                            <button className="cancel-reply" onClick={() => setReplyTo(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* [NEW] Suggestion List */}
                    {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="suggestion-list animate-slideUp">
                            <div className="suggestion-header">
                                {suggestionType === 'user' ? <Users size={12} /> : <FileCode size={12} />}
                                <span>Tag {suggestionType}s</span>
                                <button className="toggle-suggestion-type" onClick={() => setSuggestionType(suggestionType === 'user' ? 'file' : 'user')}>
                                    Switch to {suggestionType === 'user' ? 'Files' : 'Users'}
                                </button>
                            </div>
                            {filteredSuggestions.map((suggestion, idx) => (
                                <button
                                    key={suggestionType === 'user' ? suggestion.name : suggestion.path}
                                    className={`suggestion-item ${idx === suggestionIndex ? 'active' : ''}`}
                                    onClick={() => applySuggestion(suggestion)}
                                >
                                    {suggestionType === 'user' ? (
                                        <User size={14} />
                                    ) : (
                                        suggestion.type === 'p2p' ? <Globe size={14} className="text-blue-400" /> : <File size={14} className="text-emerald-400" />
                                    )}
                                    <div className="suggestion-info">
                                        <span className="suggestion-name">{suggestion.name}</span>
                                        {suggestion.type === 'local' && <span className="suggestion-meta">Local Project</span>}
                                        {suggestion.type === 'p2p' && <span className="suggestion-meta">Shared P2P</span>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="input-wrapper">
                        <textarea
                            ref={inputRef}
                            className="panel-textarea"
                            placeholder={activeMode === 'collaboration' ? "Message team..." : "Ask agent..."}
                            value={input}
                            onChange={e => handleTyping(e.target.value)}
                            onKeyDown={e => {
                                if (showSuggestions && filteredSuggestions.length > 0) {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault()
                                        setSuggestionIndex((suggestionIndex + 1) % filteredSuggestions.length)
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault()
                                        setSuggestionIndex((suggestionIndex - 1 + filteredSuggestions.length) % filteredSuggestions.length)
                                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                                        e.preventDefault()
                                        applySuggestion(filteredSuggestions[suggestionIndex])
                                    } else if (e.key === 'Escape') {
                                        setShowSuggestions(false)
                                    }
                                } else if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
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
            {showTeamPanel && <CollaborationPanel onClose={() => setShowTeamPanel(false)} spaceId={currentSpace?.id} />}

            {/* Previous Chats Overlay */}
            {showHistory && (
                <div className="history-overlay" onClick={() => setShowHistory(false)}>
                    <div className="history-panel" onClick={e => e.stopPropagation()}>
                        <div className="history-header">
                            <h3><History size={16} /> Previous Chats</h3>
                            <button className="new-chat-btn" onClick={() => {
                                createSession();
                                setAiMessages([]);
                                setAgentSteps([]);
                                setShowHistory(false);
                            }}>
                                <Plus size={14} /> New Chat
                            </button>
                        </div>
                        <div className="history-list">
                            {sessions.length === 0 ? (
                                <div className="history-empty">No previous chats</div>
                            ) : (
                                sessions.map(session => (
                                    <div
                                        key={session.id}
                                        className={`history-item ${currentSessionId === session.id ? 'active' : ''}`}
                                        onClick={() => {
                                            setCurrentSession(session.id);
                                            setAgentSteps([]);
                                            setShowHistory(false);
                                        }}
                                    >
                                        <div className="history-item-main">
                                            {editingSessionId === session.id ? (
                                                <input
                                                    className="history-rename-input"
                                                    autoFocus
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    onBlur={() => { renameSession(session.id, editTitle); setEditingSessionId(null); }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { renameSession(session.id, editTitle); setEditingSessionId(null); }
                                                        if (e.key === 'Escape') setEditingSessionId(null);
                                                    }}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span className="history-title">{session.title}</span>
                                            )}
                                            <span className="history-date">
                                                {new Date(session.lastModified).toLocaleDateString()} {new Date(session.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="history-actions">
                                            <button
                                                className="hist-action-btn"
                                                title="Rename"
                                                onClick={(e) => { e.stopPropagation(); setEditingSessionId(session.id); setEditTitle(session.title); }}
                                            >
                                                <CornerUpLeft size={12} style={{ transform: 'rotate(90deg)' }} />
                                            </button>
                                            <button
                                                className="hist-action-btn danger"
                                                title="Delete"
                                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .history-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(4px);
                    z-index: 100;
                    display: flex;
                    justify-content: flex-end;
                }

                .history-panel {
                    width: 280px;
                    height: 100%;
                    background: var(--color-surface);
                    border-left: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                    box-shadow: -10px 0 30px rgba(0,0,0,0.3);
                    animation: slideRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                @keyframes slideRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }

                .history-header {
                    padding: 16px;
                    border-bottom: 1px solid var(--color-border-subtle);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .history-header h3 {
                    font-size: 14px;
                    font-weight: 600;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .new-chat-btn {
                    padding: 4px 8px;
                    background: var(--color-accent);
                    color: var(--color-bg);
                    border: none;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .history-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px;
                }

                .history-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-bottom: 4px;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }

                .history-item:hover {
                    background: var(--color-glass-hover);
                }

                .history-item.active {
                    background: var(--color-glass-active);
                    border-color: var(--color-accent-hover);
                }

                .history-item-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .history-title {
                    font-size: 13px;
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: var(--color-text);
                }

                .history-date {
                    font-size: 10px;
                    color: var(--color-text-tertiary);
                    margin-top: 2px;
                }

                .history-actions {
                    display: flex;
                    gap: 4px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .history-item:hover .history-actions {
                    opacity: 1;
                }

                .hist-action-btn {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                }

                .hist-action-btn:hover {
                    background: var(--color-glass);
                    color: var(--color-text);
                }

                .hist-action-btn.danger:hover {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--color-error);
                }

                .history-rename-input {
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-accent);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 12px;
                    color: var(--color-text);
                    width: 100%;
                    outline: none;
                }

                .history-empty {
                    text-align: center;
                    padding: 40px 20px;
                    color: var(--color-text-tertiary);
                    font-size: 12px;
                }

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
                .tab-btn.active { color: var(--color-accent); background: var(--color-glass); }
        
                .badge-count {
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    background: var(--color-accent);
                    color: var(--color-bg);
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
                    justify-content: flex-start;
                    align-items: center;
                    gap: 16px;
                    padding: 12px 16px;
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
                    color: var(--color-bg);
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
                
                .bubble-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 4px;
                }

                .reply-action-btn {
                    opacity: 0;
                    padding: 2px;
                    color: var(--color-text-tertiary);
                    border-radius: 4px;
                    transition: all 0.2s;
                }

                .message-bubble:hover .reply-action-btn {
                    opacity: 1;
                }

                .reply-action-btn:hover {
                    background: var(--color-glass);
                    color: var(--color-text-secondary);
                }

                .message-bubble.own .reply-action-btn {
                    color: var(--color-bg);
                    opacity: 0.5;
                }

                .message-bubble.own .reply-action-btn:hover {
                    background: rgba(0, 0, 0, 0.1);
                    opacity: 1;
                }

                .message-time { font-size: 9px; opacity: 0.6; }

                .mention {
                    background: var(--color-glass);
                    color: var(--color-accent);
                    padding: 0 4px;
                    border-radius: 4px;
                    font-weight: 600;
                }

                .mention.user { color: var(--color-accent-hover); }
                .mention.file { 
                    color: var(--color-success); 
                    background: rgba(34, 197, 94, 0.1);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                }
                .mention.file:hover { background: rgba(34, 197, 94, 0.2); text-decoration: underline; }
                .mention.file.p2p { color: var(--color-accent); background: var(--color-glass); }

                .suggestion-info {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }

                .suggestion-name {
                    font-weight: 600;
                }

                .suggestion-meta {
                    font-size: 9px;
                    opacity: 0.5;
                }

                .reply-quote {
                    background: var(--color-glass);
                    border-left: 2px solid var(--color-accent);
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    font-size: 11px;
                    cursor: pointer;
                }

                .message-bubble.own .reply-quote {
                    background: rgba(255, 255, 255, 0.15);
                    border-left-color: rgba(0, 0, 0, 0.3);
                }

                .reply-sender {
                    font-weight: 700;
                    display: block;
                    margin-bottom: 2px;
                    opacity: 0.8;
                }

                .reply-text {
                    opacity: 0.6;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .reply-preview {
                    background: var(--color-surface-elevated);
                    border-left: 3px solid var(--color-accent);
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid var(--color-border-subtle);
                }

                .reply-preview-content {
                    flex: 1;
                    min-width: 0;
                }

                .reply-to-label {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--color-accent);
                    display: block;
                }

                .reply-to-text {
                    font-size: 11px;
                    color: var(--color-text-secondary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .cancel-reply {
                    padding: 4px;
                    color: var(--color-text-muted);
                    border-radius: 50%;
                }

                .cancel-reply:hover {
                    background: var(--color-surface-subtle);
                    color: var(--color-text-secondary);
                }

                .suggestion-list {
                    position: absolute;
                    bottom: 100%;
                    left: 12px;
                    right: 12px;
                    background: var(--color-surface-elevated);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3);
                    margin-bottom: 8px;
                    overflow: hidden;
                    z-index: 100;
                }

                .suggestion-header {
                    padding: 6px 12px;
                    background: var(--color-surface-subtle);
                    border-bottom: 1px solid var(--color-border-subtle);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 10px;
                    color: var(--color-text-muted);
                    font-weight: 600;
                }

                .toggle-suggestion-type {
                    margin-left: auto;
                    color: var(--color-accent);
                    font-size: 9px;
                }

                .suggestion-item {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    font-size: 12px;
                    text-align: left;
                    border: none;
                    background: transparent;
                    color: var(--color-text-secondary);
                    transition: all 0.15s;
                }

                .suggestion-item:hover, .suggestion-item.active {
                    background: var(--color-glass);
                    color: var(--color-text);
                }

                .suggestion-item.active {
                    background: rgba(59, 130, 246, 0.1);
                    color: var(--color-accent);
                }

                .inline-code {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 1px 4px;
                    border-radius: 4px;
                    font-family: var(--font-mono);
                    font-size: 0.9em;
                }

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
                    background: var(--color-glass-active);
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

                /* Premium Thinking Bubble v2 */
                .thinking-bubble-v2 {
                    margin: 12px 0;
                    border-radius: 12px;
                    border: 1px solid rgba(168, 85, 247, 0.2);
                    background: rgba(168, 85, 247, 0.03);
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    max-width: 95%;
                }

                .thinking-bubble-v2.active {
                    border-color: rgba(168, 85, 247, 0.4);
                    box-shadow: 0 4px 20px rgba(168, 85, 247, 0.1);
                }

                .thinking-header-v2 {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    cursor: pointer;
                    user-select: none;
                    background: rgba(168, 85, 247, 0.05);
                }

                .thinking-header-v2:hover {
                    background: rgba(168, 85, 247, 0.08);
                }

                .header-main {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .brain-icon-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 24px;
                    height: 24px;
                    background: rgba(168, 85, 247, 0.15);
                    color: #a855f7;
                    border-radius: 6px;
                }

                .thinking-status {
                    font-size: 12px;
                    font-weight: 600;
                    color: #a855f7;
                    letter-spacing: 0.01em;
                }

                .thinking-body-v2 {
                    border-top: 1px solid rgba(168, 85, 247, 0.1);
                    background: rgba(0, 0, 0, 0.1);
                }

                .thinking-scroll-area {
                    padding: 12px 16px;
                    font-size: 13px;
                    line-height: 1.6;
                    color: var(--color-text-secondary);
                    max-height: 300px;
                    overflow-y: auto;
                    font-family: var(--font-mono);
                    white-space: pre-wrap;
                }

                .thinking-scroll-area::-webkit-scrollbar {
                    width: 4px;
                }

                .thinking-scroll-area::-webkit-scrollbar-thumb {
                    background: rgba(168, 85, 247, 0.2);
                    border-radius: 2px;
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
                    position: relative;
                }

                .typing-indicator-text {
                    position: absolute;
                    top: -24px;
                    left: 20px;
                    font-size: 10px;
                    color: var(--color-text-muted);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    animation: fadeIn 0.3s ease;
                }

                .typing-dots span {
                    animation: blink 1.4s infinite both;
                    font-size: 14px;
                    line-height: 10px;
                }

                .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
                .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

                @keyframes blink {
                    0% { opacity: 0.2; }
                    20% { opacity: 1; }
                    100% { opacity: 0.2; }
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

                .unified-header-left { display: flex; align-items: center; gap: 12px; }
                .unified-header-right { display: flex; align-items: center; gap: 12px; }

                .source-switcher {
                    display: flex;
                    background: var(--color-surface-subtle);
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    padding: 2px;
                }

                .src-tab {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 3px 8px;
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--color-text-tertiary);
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .src-tab:hover { color: var(--color-text-secondary); }
                .src-tab.active { 
                    background: var(--color-surface-elevated); 
                    color: var(--color-text); 
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .ai-source-group {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .header-settings-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                    background: var(--color-surface-subtle);
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .header-settings-btn:hover {
                    background: var(--color-glass);
                    color: var(--color-text);
                    border-color: var(--color-text-muted);
                }

                .mode-pill {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    font-size: 9px;
                    font-weight: 600;
                    color: var(--color-text-tertiary);
                    letter-spacing: 0.01em;
                    border-radius: 4px;
                    border: 1px solid transparent;
                    background: transparent;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .mode-pill.active {
                    color: var(--color-accent);
                    background: var(--color-glass);
                    border-color: var(--color-accent-hover);
                }

                .divider-v {
                    width: 1px;
                    height: 28px;
                    background: var(--color-border);
                }

                .cloud-config {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .minimal-select {
                    background: var(--color-surface-subtle);
                    border: 1px solid var(--color-border);
                    border-radius: 6px;
                    color: var(--color-text-secondary);
                    font-size: 10px;
                    font-weight: 600;
                    padding: 3px 6px;
                    outline: none;
                    cursor: pointer;
                    appearance: none;
                }

                .minimal-select:hover { border-color: var(--color-text-muted); }
                .minimal-select.model-sel { padding: 4px 10px; }

                .model-selector-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 5px 10px;
                    background: var(--color-glass);
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    color: var(--color-accent);
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    max-width: 160px;
                }

                .model-selector-btn span {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .model-selector-btn:hover {
                    background: var(--color-glass-hover);
                    border-color: var(--color-accent);
                    transform: translateY(-1px);
                }

                .action-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .action-icon-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .action-icon-btn:hover {
                    background: var(--color-glass);
                    color: var(--color-text);
                }

                .action-icon-btn.active {
                    color: var(--color-accent);
                    background: var(--color-glass);
                    border-color: var(--color-accent-hover);
                }

                .status-toggle-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 10px;
                    background: var(--color-surface-subtle);
                    border: 1px solid var(--color-border);
                    border-radius: 20px;
                    color: var(--color-text-tertiary);
                    font-size: 9px;
                    font-weight: 800;
                    letter-spacing: 0.05em;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .status-toggle-btn.active {
                    background: rgba(16, 185, 129, 0.08);
                    border-color: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                }

                .status-indicator {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--color-text-muted);
                    transition: all 0.3s ease;
                }

                .status-toggle-btn.active .status-indicator {
                    background: #10b981;
                    box-shadow: 0 0 8px #10b981;
                }

                .mini-badge {
                    background: var(--color-error);
                    color: white;
                    font-size: 9px;
                    font-weight: 700;
                    padding: 1px 4px;
                    border-radius: 8px;
                    margin-left: 4px;
                }

                .status-bar { padding: 4px; text-align: center; font-size: 10px; font-weight: 600; }
                .status-bar.loading { background: var(--color-accent); color: var(--color-bg); }
                .status-bar.error { background: var(--color-error); color: white; }
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

                .agent-status-bar {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: var(--space-4);
                    background: rgba(255, 255, 255, 0.02);
                    border-bottom: 1px solid var(--color-border-subtle);
                    margin-bottom: var(--space-4);
                }
                .status-icon {
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--color-surface-elevated);
                    border: 2px solid var(--color-border);
                    flex-shrink: 0;
                }
                .status-icon.state-executing { border-color: var(--color-accent); color: var(--color-accent); animation: pulse 1s infinite alternate; }
                .status-icon.state-waiting-approval { border-color: var(--color-warning); color: var(--color-warning); }
                .status-icon.state-observing { border-color: var(--color-success); color: var(--color-success); }       
                .status-icon.state-thinking { border-color: #a855f7; color: #a855f7; animation: spin 2s linear infinite; }

                .status-info { display: flex; flex-direction: column; gap: 2px; }
                .status-text.main-status { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-text); }
                .status-text.sub-status { font-size: 11px; color: var(--color-text-muted); }

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

                .log-section { margin-top: var(--space-6); background: rgba(255, 255, 255, 0.03); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: var(--space-4); backdrop-filter: blur(8px); }
                .log-header { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
                .clear-link { color: var(--color-accent); text-decoration: none; font-size: 10px; background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; }
                .clear-link:hover { opacity: 1; }
                .log-entries { display: flex; flex-direction: column; gap: 8px; }
                .log-entry { display: flex; align-items: flex-start; gap: 10px; font-size: 11px; color: var(--color-text-secondary); line-height: 1.4; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
                .log-entry:last-child { border-bottom: none; }
                .entry-icon { flex-shrink: 0; margin-top: 2px; }
                .entry-icon.analysis { color: #a855f7; }
                .entry-icon.execution { color: var(--color-accent); }
                .entry-icon.suggestion { color: var(--color-success); }
                .entry-icon.error { color: var(--color-error); }
                .entry-msg { flex: 1; }
                .entry-time { flex-shrink: 0; font-family: var(--font-mono); opacity: 0.4; font-size: 9px; margin-top: 2px; }

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

                /* Shared Inline Tool Approval Card */
                .shared-tool-approval {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: var(--color-surface-elevated);
                    border-top: 2px solid var(--color-accent);
                    z-index: 1000;
                    animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
                }

                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
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

                /* ============================================ */
                /* Agent Loop Steps (ReAct engine UI)           */
                /* ============================================ */

                .agent-steps-container {
                    padding: var(--space-2) var(--space-3);
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .agent-iteration-badge {
                    font-size: 10px;
                    color: var(--color-text-tertiary);
                    text-align: center;
                    padding: 2px 8px;
                    margin-bottom: 4px;
                    opacity: 0.7;
                }

                .agent-step {
                    display: flex;
                    gap: 8px;
                    padding: 6px 10px;
                    border-radius: var(--radius-md);
                    animation: stepFadeIn 0.2s ease-out;
                    font-size: var(--text-xs);
                    line-height: 1.4;
                }

                .agent-step .step-icon {
                    flex-shrink: 0;
                    margin-top: 1px;
                    color: var(--color-text-tertiary);
                }

                .agent-step .step-content {
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                }

                .step-thinking {
                    color: var(--color-text-tertiary);
                    font-style: italic;
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .step-tool-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                .tool-badge {
                    display: inline-block;
                    font-size: 10px;
                    font-weight: 600;
                    padding: 1px 6px;
                    border-radius: var(--radius-sm);
                    background: rgba(59, 130, 246, 0.15);
                    color: var(--color-accent);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .tool-badge.result {
                    background: rgba(34, 197, 94, 0.15);
                    color: var(--color-success);
                }

                .tool-params-summary {
                    color: var(--color-text-tertiary);
                    font-size: 10px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .step-tool-result {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .tool-result-pre {
                    font-family: var(--font-mono, monospace);
                    font-size: 10px;
                    background: var(--color-surface);
                    border: 1px solid var(--color-border-subtle);
                    border-radius: var(--radius-sm);
                    padding: 6px 8px;
                    max-height: 120px;
                    overflow: auto;
                    white-space: pre-wrap;
                    word-break: break-all;
                    color: var(--color-text-secondary);
                    margin: 0;
                }

                .step-duration {
                    font-size: 9px;
                    color: var(--color-text-tertiary);
                    align-self: flex-end;
                }

                .step-error {
                    color: var(--color-error, #ef4444);
                    font-weight: 500;
                }

                .step-plan {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .plan-line {
                    padding: 2px 0;
                    color: var(--color-text-secondary);
                }

                .step-active-text {
                    color: var(--color-accent);
                    font-weight: 500;
                }

                .step-tool-call { background: rgba(59, 130, 246, 0.04); }
                .step-tool-result { background: rgba(34, 197, 94, 0.04); }
                .step-error { background: rgba(239, 68, 68, 0.06); }
                .step-thinking { background: rgba(168, 85, 247, 0.04); }
                .step-active { background: rgba(59, 130, 246, 0.06); }

                @keyframes stepFadeIn {
                    from { opacity: 0; transform: translateX(-8px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                .scanner-mode { padding: 0; display: flex; flex-direction: column; background: var(--color-bg); height: 100%; }
                .scanner-header { padding: 20px; background: var(--color-surface); border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; }
                .scanner-title { display: flex; align-items: center; gap: 12px; }
                .scanner-icon-box { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, var(--color-accent), #8b5cf6); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
                .scanner-title-text h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--color-text); }      
                .scanner-title-text span { font-size: 11px; color: var(--color-text-muted); }

                .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 20px; }
                .stat-card { background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
                .stat-card:hover { transform: translateY(-2px); border-color: var(--color-accent); }
                .stat-card.active { background: var(--color-surface-hover); border-color: var(--color-accent); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .stat-value { font-size: 20px; font-weight: 800; color: var(--color-text); }
                .stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--color-text-tertiary); }
                .stat-card.bug .stat-value { color: var(--color-error); }
                .stat-card.security .stat-value { color: #a855f7; }
                .stat-card.performance .stat-value { color: var(--color-warning); }
                .stat-card.improvement .stat-value { color: var(--color-success); }

                .filter-bar { display: flex; gap: 8px; padding: 0 20px 12px; border-bottom: 1px solid var(--color-border-subtle); overflow-x: auto; }
                .filter-chip { padding: 4px 12px; border-radius: 16px; font-size: 11px; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; white-space: nowrap; }
                .filter-chip.active { background: var(--color-accent); color: #000; border-color: transparent; }        

                .issues-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                .issue-item { background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; transition: all 0.2s; position: relative; }
                .issue-item:hover { border-color: var(--color-border-hover); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }  
                .issue-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
                .issue-type { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; }
                .issue-type.bug { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
                .issue-type.security { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
                .issue-type.performance { background: rgba(251, 191, 36, 0.1); color: var(--color-warning); }
                .issue-type.improvement { background: rgba(34, 197, 94, 0.1); color: var(--color-success); }
                .issue-file { font-family: var(--font-mono); font-size: 10px; color: var(--color-text-tertiary); display: flex; align-items: center; gap: 4px; }
                .issue-desc { font-size: 13px; font-weight: 500; color: var(--color-text); margin-bottom: 8px; line-height: 1.4; }
                .issue-suggestion { font-size: 12px; color: var(--color-text-secondary); background: var(--color-bg); padding: 10px; border-radius: 8px; border-left: 3px solid var(--color-accent); }
                .issue-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
                .issue-btn { padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; border: none; }
                .issue-btn.apply { background: var(--color-accent); color: #000; }
                .issue-btn.dismiss { background: transparent; color: var(--color-text-tertiary); border: 1px solid var(--color-border); }
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
