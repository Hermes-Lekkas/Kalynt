/**
 * Copyright 2026 Hermes Lekkas.
 * PROPRIETARY & CONFIDENTIAL.
 * 
 * This file is part of the Kalynt "Pro" Edition.
 * Unauthorized copying, distribution, or modification of this file, 
 * via any medium, is strictly prohibited.
 */

import * as Y from 'yjs'
import { aiService, AIProvider, AIMessage } from './aiService'
import { offlineLLMService, ChatMessage as OfflineChatMessage } from './offlineLLMService'
import { EditorMode } from '../config/editorModes'
import { executeTool, ToolContext, stopActiveTool } from './ideAgentTools'
import { logger } from '../utils/logger'
import { getInstructionsForModel, detectModelTier, InstructionConfig } from '../instructions'
import { useModelStore } from '../stores/modelStore'
import { aimeService } from './aimeService'
import { agentLoopService } from './agentLoopService'
import {
    AgentState,
    AgentSuggestion,
    AgentAIResponse,
    AgentConfig,
    DEFAULT_AGENT_CONFIG,
    ActivityLogEntry,
    WorkspaceContext,
    CreateTaskPayload,
    EditPayload,
    ToolCallPayload,
    SuggestPayload  // FEAT-001: Added for suggest action
} from '../types/agentTypes'

type StateCallback = (state: AgentState) => void
type SuggestionsCallback = (suggestions: AgentSuggestion[]) => void
type ActivityCallback = (entry: ActivityLogEntry) => void

class AgentService {
    private doc: Y.Doc | null = null
    private config: AgentConfig = DEFAULT_AGENT_CONFIG
    private state: AgentState = 'disabled'
    private lastEditTime: number = 0
    private analysisTimer: ReturnType<typeof setTimeout> | null = null
    private idleTimer: ReturnType<typeof setTimeout> | null = null
    private suggestions: AgentSuggestion[] = []
    private activityLog: ActivityLogEntry[] = []
    private currentMode: EditorMode = 'general'
    private provider: AIProvider = 'openai'
    private useOfflineAI: boolean = false
    private workspacePath: string = ''
    private missionHistory: AIMessage[] = []

    private onStateChange: StateCallback | null = null
    private onSuggestions: SuggestionsCallback | null = null
    private onActivity: ActivityCallback | null = null

    private editorObserver: ((event: Y.YTextEvent) => void) | null = null
    private tasksObserver: ((event: Y.YArrayEvent<any>) => void) | null = null

    private abortController: AbortController | null = null

    setCallbacks(
        onStateChange: StateCallback,
        onSuggestions: SuggestionsCallback,
        onActivity: ActivityCallback
    ) {
        this.onStateChange = onStateChange
        this.onSuggestions = onSuggestions
        this.onActivity = onActivity

        // FIX BUG-009: Immediately notify with current state and suggestions
        // This ensures UI is synced even if callbacks are set after start()
        if (this.state !== 'idle') {
            onStateChange(this.state)
        }
        if (this.suggestions.length > 0) {
            onSuggestions(this.suggestions)
        }
    }

    /**
     * FIX BUG-009: Get current state for manual sync
     */
    getState(): AgentState {
        return this.state
    }

    /**
     * FIX BUG-009: Get current suggestions for manual sync
     */
    getSuggestions(): AgentSuggestion[] {
        return [...this.suggestions]
    }

    setConfig(config: Partial<AgentConfig>) {
        this.config = { ...this.config, ...config }
    }

    setProvider(provider: AIProvider) {
        this.provider = provider
    }

    setMode(mode: EditorMode) {
        this.currentMode = mode
    }

    setUseOfflineAI(useOffline: boolean) {
        this.useOfflineAI = useOffline
    }

    setWorkspacePath(path: string) {
        this.workspacePath = path
        // Trigger background indexing
        void aimeService.indexWorkspace(path)
    }

    private setState(state: AgentState) {
        this.state = state
        this.onStateChange?.(state)
    }

    private addActivity(type: ActivityLogEntry['type'], message: string, details?: Record<string, any>) {
        const entry: ActivityLogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type,
            message,
            details
        }
        this.activityLog.unshift(entry)

        if (this.activityLog.length > 50) {
            this.activityLog = this.activityLog.slice(0, 50)
        }
        this.onActivity?.(entry)
    }

    start(doc: Y.Doc) {
        if (!this.config.enabled) return

        this.doc = doc
        this.setState('observing')
        this.addActivity('analysis', 'Agent started observing workspace')

        const editorText = doc.getText('editor-content')
        this.editorObserver = () => {
            this.handleEdit()
        }
        editorText.observe(this.editorObserver)

        const tasksArray = doc.getArray('tasks')
        this.tasksObserver = () => {

            this.handleEdit()
        }
        tasksArray.observe(this.tasksObserver)

        this.loadSuggestions()

        this.startAnalysisTimer()
    }

    private async loadSuggestions() {
        try {
            const db = await this.openDB()
            const transaction = db.transaction(['suggestions'], 'readonly')
            const store = transaction.objectStore('suggestions')
            const request = store.getAll()

            request.onsuccess = () => {
                if (Array.isArray(request.result)) {
                    this.suggestions = request.result
                    this.onSuggestions?.(this.suggestions)
                }
            }
        } catch (e) {
            logger.agent.warn('Failed to load agent suggestions from IndexedDB', e)

        }
    }

    private async saveSuggestions() {
        try {
            const db = await this.openDB()
            const transaction = db.transaction(['suggestions'], 'readwrite')
            const store = transaction.objectStore('suggestions')

            await new Promise((resolve, reject) => {
                const clearRequest = store.clear()
                clearRequest.onsuccess = () => resolve(true)
                clearRequest.onerror = () => reject(new Error('IndexedDB clear failed'))
            })

            for (const suggestion of this.suggestions) {
                store.add(suggestion)
            }
        } catch (e) {
            logger.agent.warn('Failed to save agent suggestions to IndexedDB', e)
        }
    }

    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('kalynt-agent-db', 1)

            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains('suggestions')) {
                    db.createObjectStore('suggestions', { keyPath: 'id' })
                }
            }

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(new Error(request.error?.message || 'IndexedDB failed to open'))
        })
    }

    stop() {
        if (!this.doc) return

        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
        }

        if (this.editorObserver) {
            this.doc.getText('editor-content').unobserve(this.editorObserver)
            this.editorObserver = null
        }
        if (this.tasksObserver) {
            this.doc.getArray('tasks').unobserve(this.tasksObserver)
            this.tasksObserver = null
        }

        this.clearTimers()
        void stopActiveTool() // Also stop any executing tools
        this.doc = null
        this.setState('disabled')
        this.addActivity('analysis', 'Agent stopped')
    }

    private clearTimers() {
        if (this.analysisTimer) {
            clearTimeout(this.analysisTimer)
            this.analysisTimer = null
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer)
            this.idleTimer = null
        }
    }

    private startAnalysisTimer() {
        this.clearTimers()
        if (this.state === 'disabled') return

        if (this.analysisTimer) return

        this.analysisTimer = setTimeout(() => {
            this.analysisTimer = null
            this.checkIdleAndAnalyze()
        }, this.config.analysisInterval)
    }

    private handleEdit() {
        this.lastEditTime = Date.now()

        if (this.idleTimer) {
            clearTimeout(this.idleTimer)
        }

        this.idleTimer = setTimeout(() => {
            this.checkIdleAndAnalyze()
        }, this.config.minIdleTime)
    }

    private async checkIdleAndAnalyze() {

        if (!this.doc || this.state === 'disabled') return

        if (this.state === 'thinking') return

        const idleTime = Date.now() - this.lastEditTime

        if (idleTime < this.config.minIdleTime) {
            this.startAnalysisTimer()
            return
        }

        if (this.suggestions.some(s => s.status === 'pending')) {
            this.startAnalysisTimer()
            return
        }

        await this.analyze()

        this.startAnalysisTimer()
    }

    private buildContext(): WorkspaceContext | null {
        if (!this.doc) return null

        const editorContent = this.doc.getText('editor-content').toJSON()
        const tasksArray = this.doc.getArray('tasks').toArray() as any[]

        const tasks = {
            total: tasksArray.length,
            todo: tasksArray.filter(t => t.status === 'todo').length,
            inProgress: tasksArray.filter(t => t.status === 'in-progress').length,
            done: tasksArray.filter(t => t.status === 'done').length,
            items: tasksArray.slice(0, 10).map(t => ({ title: t.title, status: t.status }))
        }

        return {
            mode: this.currentMode,
            editorContent: editorContent.slice(0, this.config.maxContextChars),
            editorWordCount: editorContent.split(/\s+/).filter(Boolean).length,
            tasks,
            recentActivity: this.activityLog.slice(0, 5).map(a => a.message),
            lastEditTime: this.lastEditTime,
            idleTime: Date.now() - this.lastEditTime
        }
    }

    /**
     * Build prompt using tier-specific instruction controllers
     * Uses getInstructionsForModel() to get optimized prompts based on:
     * - Small models (<24B): Explicit, minimal tools, strict formatting
     * - Large models (24B+): Chain-of-thought, full tools
     * - Flagship (online): Maximum capability, thinking mode
     */
    private buildPrompt(context: WorkspaceContext): AIMessage[] {
        // Get current loaded model ID for tier detection
        const loadedModelId = this.useOfflineAI
            ? useModelStore.getState().loadedModelId
            : null

        // Detect model tier for instruction selection
        const tier = detectModelTier(
            loadedModelId,
            this.provider,
            this.useOfflineAI
        )

        logger.agent.debug('Building prompt for model tier:', {
            tier,
            modelId: loadedModelId,
            provider: this.provider,
            useOfflineAI: this.useOfflineAI
        })

        // Build instruction config
        const instructionConfig: InstructionConfig = {
            mode: context.mode,
            workspacePath: this.workspacePath,
            context,
            useTools: this.config.enabledActions.includes('tool-call')
        }

        // Get tier-optimized instructions
        const instructions = getInstructionsForModel(
            instructionConfig,
            loadedModelId,
            this.provider,
            this.useOfflineAI
        )

        // Update config based on tier recommendations
        // This allows dynamic adjustment of maxSuggestions, etc.
        this.config = {
            ...this.config,
            maxSuggestions: instructions.maxSuggestions,
            enabledActions: instructions.enabledActions as any
        }

        return instructions.messages
    }

    private async analyze() {
        const context = this.buildContext()
        if (!context) return

        if (context.editorWordCount < 5 && context.tasks.total === 0) {
            return
        }

        this.setState('thinking')
        this.addActivity('analysis', 'Analyzing workspace...')

        this.abortController = new AbortController()
        const abortSignal = this.abortController.signal

        const MAX_RETRIES = 3
        let lastError: Error | null = null

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {

                if (attempt > 0) {
                    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
                    this.addActivity('analysis', `Retrying analysis (attempt ${attempt + 1}/${MAX_RETRIES})...`)
                    await new Promise(resolve => setTimeout(resolve, backoffMs))
                }

                const timeoutMs = this.useOfflineAI ? 90000 : 60000
                // PROMISE FIX: Properly handle abort and cleanup the event listener
                let timeoutId: ReturnType<typeof setTimeout> | null = null
                let abortHandler: (() => void) | null = null
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('AI request timed out')), timeoutMs)
                    abortHandler = () => {
                        if (timeoutId) clearTimeout(timeoutId)
                        reject(new Error('Analysis aborted'))
                    }
                    abortSignal.addEventListener('abort', abortHandler)
                }).finally(() => {
                    // Clean up resources
                    if (timeoutId) clearTimeout(timeoutId)
                    if (abortHandler) abortSignal.removeEventListener('abort', abortHandler)
                })

                const messages = this.buildPrompt(context)

                // If we have a mission history, append it to the prompt
                const fullMessages = this.missionHistory.length > 0
                    ? [...messages, ...this.missionHistory]
                    : messages

                let responseContent: string

                if (this.useOfflineAI) {

                    const offlineMessages: OfflineChatMessage[] = fullMessages.map(m => ({
                        role: m.role,
                        content: m.content
                    }))

                    const offlinePromise = offlineLLMService.generate(offlineMessages, {
                        temperature: 0.3,
                        maxTokens: 1000
                    })

                    responseContent = await Promise.race([offlinePromise, timeoutPromise])
                } else {

                    const chatPromise = aiService.chat(fullMessages, this.provider, {
                        temperature: 0.3,
                        maxTokens: 1500,
                        thinking: true
                    })

                    const response = await Promise.race([chatPromise, timeoutPromise])

                    if (response.error) {
                        throw new Error(response.error)
                    }
                    responseContent = response.content
                }

                if (responseContent.includes('"action": "tool-call"') || responseContent.includes('"name":')) {
                    this.missionHistory.push({
                        role: 'assistant',
                        content: responseContent
                    })
                }

                const parsed = this.parseResponse(responseContent)

                if (parsed.suggestions.length === 0) {
                    this.setState('idle')
                    return
                }

                const newSuggestions: AgentSuggestion[] = parsed.suggestions
                    .slice(0, this.config.maxSuggestions)
                    .filter(s => this.config.enabledActions.includes(s.action))
                    .map(s => ({
                        id: crypto.randomUUID(),
                        action: s.action,
                        target: s.target,
                        description: s.description,
                        reasoning: s.reasoning,
                        confidence: Math.min(1, Math.max(0, s.confidence)),
                        payload: s.payload,
                        timestamp: Date.now(),
                        status: 'pending' as const
                    }))

                if (newSuggestions.length > 0) {
                    this.suggestions = [...newSuggestions, ...this.suggestions.filter(s => s.status !== 'pending')]

                    if (this.suggestions.length > 100) {
                        this.suggestions = this.suggestions.slice(0, 100)
                    }

                    this.saveSuggestions()
                    this.onSuggestions?.(this.suggestions)
                    this.setState('waiting-approval')
                    this.addActivity('suggestion', `Generated ${newSuggestions.length} suggestion(s)`)
                } else {
                    this.setState('idle')
                }

                return

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                logger.agent.warn(`Agent analysis attempt ${attempt + 1} failed`, error)

                if (abortSignal.aborted ||
                    lastError.message.includes('API key') ||
                    lastError.message.includes('unauthorized') ||
                    lastError.message.includes('No model loaded')) {
                    break
                }
            }
        }

        logger.agent.error('Agent analysis failed after retries', lastError)
        this.setState('error')
        this.addActivity('error', `Analysis failed: ${lastError?.message || 'Unknown error'}`)
    }

    private parseResponse(response: string): AgentAIResponse {
        try {

            const cleanedResponse = response
                .replaceAll(/<think>[\s\S]*?<\/think>/gi, '')
                .replaceAll(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .replaceAll(/<thought>[\s\S]*?<\/thought>/gi, '')
                .trim()

            const jsonMatch = /```json\n([\s\S]*?)\n```/.exec(cleanedResponse) ||
                /```\n([\s\S]*?)\n```/.exec(cleanedResponse) ||
                /{[\s\S]*}/.exec(cleanedResponse)

            const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : cleanedResponse

            const parsed = JSON.parse(jsonStr)

            if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
                return { suggestions: [], summary: 'Failed to parse response structure' }
            }

            return parsed
        } catch (error) {
            logger.agent.error('Failed to parse AI response', error)
            return {
                suggestions: [],
                summary: 'Start working to generate suggestions.'
            }
        }
    }

    approveSuggestion(id: string) {
        const suggestion = this.suggestions.find(s => s.id === id)
        if (suggestion?.status !== 'pending') return

        suggestion.status = 'approved'
        this.saveSuggestions()
        this.onSuggestions?.(this.suggestions)
        this.addActivity('approval', `Approved: ${suggestion.description}`, { suggestionId: id })

        this.executeSuggestion(suggestion)
    }

    rejectSuggestion(id: string) {
        const suggestion = this.suggestions.find(s => s.id === id)
        if (suggestion?.status !== 'pending') return

        suggestion.status = 'rejected'
        this.saveSuggestions()
        this.onSuggestions?.(this.suggestions)
        this.addActivity('rejection', `Rejected: ${suggestion.description}`, { suggestionId: id })

        if (!this.suggestions.some(s => s.status === 'pending')) {
            this.setState('idle')
        }
    }

    rejectAll() {
        this.suggestions.forEach(s => {
            if (s.status === 'pending') {
                s.status = 'rejected'
            }
        })
        this.saveSuggestions()
        this.onSuggestions?.(this.suggestions)
        this.addActivity('rejection', 'Rejected all pending suggestions')
        this.setState('idle')
    }

    private async executeSuggestion(suggestion: AgentSuggestion) {
        if (!this.doc) return

        this.setState('executing')

        try {
            if (suggestion.action === 'tool-call') {
                const result = await this.executeToolCall(suggestion.payload as ToolCallPayload)

                // Autonomous follow-up: If tool was successful, feed result back into the loop
                if (result.success && this.config.enabled) {
                    this.missionHistory.push({
                        role: 'user',
                        content: `Tool Result (${(suggestion.payload as ToolCallPayload).tool}):\n${JSON.stringify(result.data, null, 2)}`
                    })
                    // Trigger next turn
                    setTimeout(() => this.analyze(), 500)
                }
            } else {
                switch (suggestion.action) {
                    case 'edit':
                        this.executeEdit(suggestion.payload as EditPayload)
                        break
                    case 'create-task':
                        this.executeCreateTask(suggestion.payload as CreateTaskPayload)
                        break
                    case 'suggest':
                        this.executeSuggestAction(suggestion)
                        break
                    case 'comment':
                        this.executeComment(suggestion.payload)
                        break
                    case 'organize':
                        this.executeOrganize(suggestion.payload)
                        break
                }
            }

            suggestion.status = 'executed'
            this.saveSuggestions()
            this.onSuggestions?.(this.suggestions)
            this.addActivity('execution', `Executed: ${suggestion.description}`, { suggestionId: suggestion.id })

        } catch (error) {
            logger.agent.error('Failed to execute suggestion', error)
            this.addActivity('error', `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        if (!this.suggestions.some(s => s.status === 'pending')) {
            // If we are in a mission, we stay in thinking/analyzing state until completion
            if (this.missionHistory.length === 0) {
                this.setState('idle')
            }
        }
    }

    private executeEdit(payload: EditPayload) {
        if (!this.doc) return

        const editorText = this.doc.getText('editor-content')
        const currentContent = editorText.toJSON()

        switch (payload.position) {
            case 'append':
                editorText.insert(currentContent.length, '\n\n' + payload.content)
                break
            case 'prepend':
                editorText.insert(0, payload.content + '\n\n')
                break
            case 'replace':
                editorText.delete(0, currentContent.length)
                editorText.insert(0, payload.content)
                break
            case 'insert':
                if (payload.insertAt !== undefined) {
                    editorText.insert(payload.insertAt, payload.content)
                }
                break
            default:
                editorText.insert(currentContent.length, '\n\n' + payload.content)
        }
    }

    private executeComment(payload: any) {
        if (!this.doc) return
        const editorText = this.doc.getText('editor-content')
        const comment = `\n// ${payload.content}`

        const pos = typeof payload.position === 'number' ? payload.position : editorText.length
        editorText.insert(Math.min(pos, editorText.length), comment)
    }

    /**
     * FEAT-001: Execute suggest action
     * Suggestions are informational - they don't modify code but provide insights
     * The suggestion is logged and displayed to the user via the activity feed
     */
    private executeSuggestAction(suggestion: AgentSuggestion) {
        const payload = suggestion.payload as SuggestPayload

        // Build a detailed message for the activity log
        const categoryPrefix = payload.category ? `[${payload.category.toUpperCase()}] ` : ''
        const locationInfo = payload.filePath
            ? ` (${payload.filePath}${payload.lineNumber ? `:${payload.lineNumber}` : ''})`
            : ''

        const message = `${categoryPrefix}${payload.message}${locationInfo}`

        // Log the suggestion as an activity entry so it appears in the UI
        this.addActivity('suggestion', message, {
            suggestionId: suggestion.id,
            category: payload.category,
            filePath: payload.filePath,
            lineNumber: payload.lineNumber,
            reasoning: suggestion.reasoning,
            confidence: suggestion.confidence
        })

        logger.agent.info('Suggestion executed:', {
            category: payload.category,
            message: payload.message.substring(0, 100)
        })
    }

    private executeOrganize(payload: any) {
        if (!this.doc) return
        const editorText = this.doc.getText('editor-content')

        if (payload.sections && Array.isArray(payload.sections)) {
            const newContent = payload.sections
                .map((s: any) => `// MARK: ${s.title}\n${s.content}`)
                .join('\n\n')

            if (newContent) {
                editorText.delete(0, editorText.length)
                editorText.insert(0, newContent)
            }
        }
    }

    private executeCreateTask(payload: CreateTaskPayload) {
        if (!this.doc) return

        const tasksArray = this.doc.getArray('tasks')
        tasksArray.push([{
            id: crypto.randomUUID(),
            title: payload.title,
            status: payload.status || 'todo',
            priority: payload.priority || 'medium',
            createdAt: Date.now(),
            createdBy: 'AI Agent'
        }])
    }

    private async executeToolCall(payload: ToolCallPayload): Promise<{ success: boolean, data?: any, error?: string }> {
        logger.agent.info('Executing tool call', { tool: payload.tool, params: payload.params })

        const context: ToolContext = {
            workspacePath: this.workspacePath || ''
        }

        try {
            const result = await executeTool(payload.tool, payload.params, context)

            if (result.success) {
                this.addActivity('execution', `Tool executed: ${payload.tool}`, {
                    tool: payload.tool,
                    result: result.data
                })
                logger.agent.info('Tool call succeeded', { tool: payload.tool, data: result.data })
                return { success: true, data: result.data }
            } else {
                this.addActivity('error', `Tool failed: ${payload.tool} - ${result.error}`, {
                    tool: payload.tool,
                    error: result.error
                })
                logger.agent.error('Tool call failed', { tool: payload.tool, error: result.error })
                return { success: false, error: result.error }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            this.addActivity('error', `Tool exception: ${payload.tool} - ${errorMsg}`)
            logger.agent.error('Tool call exception', { tool: payload.tool, error })
            return { success: false, error: errorMsg }
        }
    }

    getActivityLog(): ActivityLogEntry[] {
        return this.activityLog
    }

    clearActivityLog() {
        this.activityLog = []
    }

    addExternalSuggestions(suggestions: Omit<AgentSuggestion, 'id' | 'timestamp' | 'status'>[]) {
        const newSuggestions: AgentSuggestion[] = suggestions.map(s => ({
            ...s,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            status: 'pending' as const
        }))

        if (newSuggestions.length > 0) {
            this.suggestions = [...newSuggestions, ...this.suggestions]

            if (this.suggestions.length > 100) {
                this.suggestions = this.suggestions.slice(0, 100)
            }

            this.saveSuggestions()
            this.onSuggestions?.(this.suggestions)
            this.setState('waiting-approval')
            this.addActivity('suggestion', `Added ${newSuggestions.length} suggestion(s) from workspace scan`)
        }
    }

    async triggerAnalysis() {
        if (this.state === 'thinking' || this.state === 'disabled') {
            return
        }
        await this.analyze()
    }

    clearSuggestions() {
        this.suggestions = []
        this.saveSuggestions()
        this.onSuggestions?.(this.suggestions)
        this.setState('idle')
        this.addActivity('analysis', 'Cleared all suggestions')
    }

    /**
     * Execute an autonomous task using the ReAct agent loop.
     * This bridges the autonomous monitoring system with the
     * full agentic loop engine for multi-step task execution.
     *
     * @param task - Natural language description of the task
     * @returns The final response from the agent
     */
    async executeAutonomousTask(task: string): Promise<string> {
        if (this.state === 'disabled') {
            return 'Agent is disabled'
        }

        this.setState('executing')
        this.addActivity('execution', `Starting autonomous task: ${task.slice(0, 100)}`)

        // Configure the loop service with current settings
        agentLoopService.setWorkspacePath(this.workspacePath)
        agentLoopService.setUseOfflineAI(this.useOfflineAI)

        if (!this.useOfflineAI) {
            agentLoopService.setCloudProvider(this.provider)
        }

        try {
            const result = await agentLoopService.run(task, [], {
                maxIterations: 15,
                trustedMode: true, // Autonomous mode auto-approves tools
                useRAG: true,
                autoApproveReadOnly: true
            })

            this.addActivity('execution', `Task completed: ${result.slice(0, 200)}`)
            this.setState('idle')
            return result
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            this.addActivity('error', `Autonomous task failed: ${errorMsg}`)
            this.setState('error')
            return `Error: ${errorMsg}`
        }
    }
}

export const agentService = new AgentService()
