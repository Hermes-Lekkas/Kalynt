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
import { getModeConfig, EditorMode } from '../config/editorModes'
import { executeTool, ToolContext, getToolsDescription } from './ideAgentTools'
import { logger } from '../utils/logger'
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
    ToolCallPayload
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

    private buildPrompt(context: WorkspaceContext): AIMessage[] {
        const modeConfig = getModeConfig(context.mode)

        const systemPrompt = `You are an autonomous AI assistant integrated into a collaborative workspace.
Your persona: ${modeConfig.systemPrompt}

You are observing a "${modeConfig.name}" workspace. Your job is to proactively help the user by:
1. DETECTING BUGS: Identify syntax errors, logic errors, type mismatches, null reference errors, etc.
2. SUGGESTING FIXES: Provide concrete code fixes or improvements
3. CODE QUALITY: Find code smells, unused variables, missing error handling, potential performance issues
4. BEST PRACTICES: Suggest improvements for readability, maintainability, and security

AVAILABLE TOOLS: You can call these tools using JSON format.

WORKSPACE PATH: ${this.workspacePath || 'Not set'}

Tool Definitions:
${getToolsDescription()}

To use a tool, create a suggestion with action "tool-call" and payload:
<tool_call>
{"tool": "toolName", "params": {"param1": "value1"}}
</tool_call>

Or use the action format: { "action": "tool-call", "payload": { "tool": "toolName", "params": {...} } }

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "suggestions": [
    {
      "action": "edit" | "create-task" | "suggest" | "comment" | "organize" | "tool-call",
      "target": "editor-content" | "tasks" | "messages" | "file-system",
      "description": "Short description of what to do",
      "reasoning": "Why this would help the user",
      "confidence": 0.0-1.0,
      "payload": { ... action-specific data ... }
    }
  ],
  "summary": "Brief summary of workspace state"
}

Action payloads:
- edit: { "content": "text to add/replace", "position": "append" | "prepend" | "replace" }
- create-task: { "title": "task title", "status": "todo", "priority": "high" | "medium" | "low" }
- suggest: { "message": "suggestion text", "category": "bug" | "improvement" | "refactor" | "performance" | "security" }
- comment: { "content": "comment text", "position": 0, "length": 0 }
- organize: { "sections": [{ "title": "...", "content": "..." }] }
- tool-call: { "tool": "toolName", "params": { ... } }

Guidelines:
- PRIORITY: Focus on bugs and errors first
- Suggest 1-3 actions maximum
- Be specific and actionable
- For bugs: Explain the issue clearly and provide the fix
- For improvements: Explain the benefit
- Use tools when you need to read files, check project structure, or analyze dependencies
- If the code is well-written, suggest few or no changes`

        const userPrompt = `Analyze this workspace for bugs, errors, and improvements:

## Current Mode: ${modeConfig.name}
${modeConfig.icon}

## Editor Content (${context.editorWordCount} words):
${context.editorContent || '(empty)'}

## Tasks: ${context.tasks.total} total (${context.tasks.todo} todo, ${context.tasks.inProgress} in progress, ${context.tasks.done} done)
${context.tasks.items.map(t => `- [${t.status}] ${t.title}`).join('\n') || '(no tasks)'}

## User has been idle for ${Math.round(context.idleTime / 1000)} seconds

FOCUS ON:
1. Syntax errors or bugs in the code
2. Logic errors that could cause runtime issues
3. Code quality issues (unused variables, missing error handling)
4. Potential performance or security problems
5. Incomplete or inconsistent task implementations

Provide your suggestions as JSON:`

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
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
                const timeoutPromise = new Promise<any>((_, reject) => {
                    const timeoutId = setTimeout(() => reject(new Error('AI request timed out')), timeoutMs)
                    
                    abortSignal.addEventListener('abort', () => clearTimeout(timeoutId))
                })

                const messages = this.buildPrompt(context)
                let responseContent: string

                if (this.useOfflineAI) {

                    const offlineMessages: OfflineChatMessage[] = messages.map(m => ({
                        role: m.role,
                        content: m.content
                    }))

                    const offlinePromise = offlineLLMService.generate(offlineMessages, {
                        temperature: 0.3,
                        maxTokens: 1000  
                    })

                    responseContent = await Promise.race([offlinePromise, timeoutPromise])
                } else {
                    
                    const chatPromise = aiService.chat(messages, this.provider, {
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
            switch (suggestion.action) {
                case 'edit':
                    this.executeEdit(suggestion.payload as EditPayload)
                    break
                case 'create-task':
                    this.executeCreateTask(suggestion.payload as CreateTaskPayload)
                    break
                case 'suggest':
                    
                    break
                case 'comment':
                    this.executeComment(suggestion.payload)
                    break
                case 'organize':
                    this.executeOrganize(suggestion.payload)
                    break
                case 'tool-call':
                    await this.executeToolCall(suggestion.payload as ToolCallPayload)
                    break
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
            this.setState('idle')
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

    private async executeToolCall(payload: ToolCallPayload) {
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
            } else {
                this.addActivity('error', `Tool failed: ${payload.tool} - ${result.error}`, {
                    tool: payload.tool,
                    error: result.error
                })
                logger.agent.error('Tool call failed', { tool: payload.tool, error: result.error })
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            this.addActivity('error', `Tool exception: ${payload.tool} - ${errorMsg}`)
            logger.agent.error('Tool call exception', { tool: payload.tool, error })
        }
    }

    getState(): AgentState {
        return this.state
    }

    getSuggestions(): AgentSuggestion[] {
        return this.suggestions
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
}

export const agentService = new AgentService()
