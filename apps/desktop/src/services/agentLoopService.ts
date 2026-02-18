/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Agent Loop Service - Core ReAct (Reasoning + Acting) Engine
 *
 * Implements the agentic loop described in the Kalynt architecture:
 *   User Message → Plan → Act (Tool) → Observe → Reason → Loop
 *
 * This service is the brain of the IDE agent. It:
 * 1. Receives a user message
 * 2. Builds context (AIME RAG + workspace info + file context)
 * 3. Sends to LLM (cloud or offline)
 * 4. Parses response for tool calls
 * 5. Executes tools, feeds results back
 * 6. Loops until task is complete or max iterations reached
 * 7. Emits events for real-time UI updates
 */

import { logger } from '../utils/logger'
import { aiService, AIProvider, AIMessage } from './aiService'
import { offlineLLMService, ChatMessage as OfflineChatMessage } from './offlineLLMService'
import { executeTool, getToolCallJsonSchema, getSimplifiedToolSchema, getModelSizeCategory, stopActiveTool, type ToolContext } from './ideAgentTools'
import { aimeService } from './aimeService'
import { shadowWorkspaceService } from './shadowWorkspaceService'
import { useModelStore } from '../stores/modelStore'
import { estimateTokens, truncateToTokens } from '../utils/tokenCounter'
import { detectModelTier } from '../instructions'
import { buildAgentLoopSystemPrompt } from '../instructions/agentLoopInstructions'
import {
    AgentStep,
    AgentPlan,
    AgentLoopConfig,
    AgentLoopState,
    AgentLoopEvent,
    DEFAULT_LOOP_CONFIG
} from '../types/agentTypes'

type EventListener = (event: AgentLoopEvent) => void

/**
 * Parse tool calls from LLM response.
 * Standardized on JSON format within ```tool code blocks.
 */
function parseToolCalls(response: string): Array<{ name: string; params: Record<string, unknown> }> {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = []
    let match: RegExpExecArray | null

    // Strategy 1 (Standard): Markdown code block ```tool (JSON inside)
    const toolBlockPattern = /```tool\s*\n?({[\s\S]*?})\n?```/gi
    while ((match = toolBlockPattern.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            if (parsed.name && parsed.params) {
                calls.push({ name: parsed.name, params: parsed.params })
            }
        } catch { /* skip invalid JSON */ }
    }
    if (calls.length > 0) return calls

    // Strategy 2 (Fallback): XML <tool_code> XML tags
    const toolCodePattern = /<tool_code>([\s\S]*?)<\/tool_code>/gi
    while ((match = toolCodePattern.exec(response)) !== null) {
        try {
            const content = match[1]
            const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(content)
            if (nameMatch) {
                const toolName = nameMatch[1].trim()
                const params: Record<string, unknown> = {}
                const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/gi
                let paramMatch: RegExpExecArray | null
                while ((paramMatch = paramRegex.exec(content)) !== null) {
                    const tagName = paramMatch[1].toLowerCase()
                    if (tagName !== 'name') {
                        const val = paramMatch[2].trim()
                        if (val === 'true') params[paramMatch[1]] = true
                        else if (val === 'false') params[paramMatch[1]] = false
                        else if (/^\d+$/.test(val)) params[paramMatch[1]] = parseInt(val)
                        else params[paramMatch[1]] = val
                    }
                }
                calls.push({ name: toolName, params })
            }
        } catch { /* skip */ }
    }
    if (calls.length > 0) return calls

    // Strategy 3 (Aggressive Fallback): Find any JSON object that looks like a tool call
    const jsonStartPattern = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"params"\s*:/g
    while ((match = jsonStartPattern.exec(response)) !== null) {
        const jsonCandidate = response.substring(match.index)
        let endPos = jsonCandidate.indexOf('}')
        // Try to find the matching closing brace
        let braceCount = 0
        for (let i = 0; i < jsonCandidate.length; i++) {
            if (jsonCandidate[i] === '{') braceCount++
            else if (jsonCandidate[i] === '}') {
                braceCount--
                if (braceCount === 0) {
                    try {
                        const parsed = JSON.parse(jsonCandidate.substring(0, i + 1))
                        if (parsed.name && parsed.params) {
                            calls.push({ name: parsed.name, params: parsed.params })
                            break
                        }
                    } catch { /* try next */ }
                }
            }
        }
    }

    return calls
}

/**
 * Extract clean text content from LLM response, removing tool calls and special tokens.
 */
function extractCleanContent(response: string): string {
    return response
        // Remove thinking tags and their content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        // Remove standardized tool code blocks
        .replace(/```tool[\s\S]*?```/gi, '')
        // Remove loose JSON tool calls ONLY if they are the entire response or at the end
        // This is tricky - we don't want to remove random JSON in text
        // But we want to remove the tool call JSON.
        // If we used grammar, it's mostly in the ```tool block anyway.
        
        // Remove other specific formats if they leak
        .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
        
        // Remove special tokens
        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>/g, '')
        .replace(/<\|end_of_text\|>/g, '')
        .replace(/<\/s>/g, '')
        .replace(/<s>/g, '')
        .replace(/\[INST\]/g, '')
        .replace(/\[\/INST\]/g, '')
        // Remove role markers
        .replace(/\n?(user|assistant|system)\s*$/gi, '')
        // Clean whitespace
        .trim()
}

/**
 * Extract thinking content from response
 */
function extractThinking(response: string): string | null {
    const thinkMatch = /<think>([\s\S]*?)<\/think>/i.exec(response)
        ?? /<thinking>([\s\S]*?)<\/thinking>/i.exec(response)
    return thinkMatch ? thinkMatch[1].trim() : null
}

/**
 * Extract a plan from the LLM response if it generated one
 */
function extractPlan(response: string): AgentPlan | null {
    // Look for plan format: <plan>...</plan> or ```plan...```
    const planMatch = /<plan>([\s\S]*?)<\/plan>/i.exec(response)
        ?? /```plan\s*\n([\s\S]*?)\n```/i.exec(response)

    if (!planMatch) return null

    try {
        const parsed = JSON.parse(planMatch[1])
        if (parsed.title && Array.isArray(parsed.steps)) {
            return {
                id: crypto.randomUUID(),
                title: parsed.title,
                steps: parsed.steps.map((s: any) => ({
                    description: s.description || s,
                    name: s.tool || s.name,
                    status: 'pending' as const
                })),
                status: 'proposed',
                createdAt: Date.now()
            }
        }
    } catch {
        // Try parsing as numbered list
        const lines = planMatch[1].split('\n').filter((l: string) => l.trim())
        if (lines.length > 0) {
            return {
                id: crypto.randomUUID(),
                title: 'Execution Plan',
                steps: lines.map((line: string) => ({
                    description: line.replace(/^\d+[.)]\s*/, '').trim(),
                    status: 'pending' as const
                })),
                status: 'proposed',
                createdAt: Date.now()
            }
        }
    }
    return null
}

class AgentLoopService {
    private config: AgentLoopConfig = { ...DEFAULT_LOOP_CONFIG }
    private state: AgentLoopState | null = null
    private listeners: Set<EventListener> = new Set()
    private abortController: AbortController | null = null
    private workspacePath: string = ''
    private useOfflineAI: boolean = false
    private cloudProvider: AIProvider = 'openai'

    // --- Configuration ---

    setConfig(config: Partial<AgentLoopConfig>) {
        this.config = { ...this.config, ...config }
    }

    getConfig(): AgentLoopConfig {
        return { ...this.config }
    }

    setWorkspacePath(path: string) {
        this.workspacePath = path
    }

    setUseOfflineAI(offline: boolean) {
        this.useOfflineAI = offline
    }

    setCloudProvider(provider: AIProvider) {
        this.cloudProvider = provider
    }

    // --- Event System ---

    on(listener: EventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private emit(event: AgentLoopEvent) {
        for (const listener of this.listeners) {
            try {
                listener(event)
            } catch (err) {
                logger.agent.error('Event listener error', err)
            }
        }
    }

    // --- State ---

    getState(): AgentLoopState | null {
        return this.state ? { ...this.state } : null
    }

    isRunning(): boolean {
        return this.state?.isRunning ?? false
    }

    // --- Core Loop ---

    /**
     * Run the agentic ReAct loop for a user message.
     *
     * @param userMessage - The user's message/instruction
     * @param chatHistory - Previous chat messages for context
     * @param options - Override config for this run
     * @returns The final assistant response text
     */
    async run(
        userMessage: string,
        chatHistory: Array<{ role: string; content: string }> = [],
        options?: Partial<AgentLoopConfig> & { systemPrompt?: string }
    ): Promise<string> {
        if (this.state?.isRunning) {
            throw new Error('Agent loop is already running')
        }

        const runConfig = { ...this.config, ...options }
        const runId = crypto.randomUUID()

        this.abortController = new AbortController()
        const signal = this.abortController.signal

        this.state = {
            runId,
            isRunning: true,
            userMessage,
            steps: [],
            plan: null,
            iteration: 0,
            streamingText: '',
            isGenerating: false,
            thinkingContent: '',
            isThinking: false,
            error: null,
            startedAt: Date.now(),
            modifiedFiles: []
        }

        this.emit({ type: 'started', runId, userMessage })

        try {
            // 1. Gather context from AIME (RAG)
            let ragContext = ''
            if (runConfig.useRAG) {
                try {
                    ragContext = await aimeService.retrieveContext(userMessage)
                    if (ragContext === 'No relevant context found.') ragContext = ''
                } catch {
                    logger.agent.warn('AIME context retrieval failed, continuing without RAG')
                }
            }

            // 2. Build system prompt (or use override)
            const systemPrompt = options?.systemPrompt || this.buildSystemPrompt(ragContext, runConfig)

            // 3. Build conversation history
            const contextWindow = this.useOfflineAI 
                ? offlineLLMService.getContextWindow() 
                : aiService.getContextWindow(this.cloudProvider)
                
            const messages = this.buildMessages(systemPrompt, chatHistory, userMessage, contextWindow)

            // 4. Enter the ReAct loop
            let finalResponse = ''
            let conversationMessages = [...messages]
            const startTime = Date.now()

            for (let iteration = 0; iteration < runConfig.maxIterations; iteration++) {
                if (signal.aborted) {
                    this.emit({ type: 'aborted' })
                    break
                }

                // Check time budget
                if (Date.now() - startTime > runConfig.maxDurationMs) {
                    logger.agent.warn('Agent loop time budget exceeded')
                    this.addStep({
                        type: 'error',
                        content: 'Time budget exceeded. Stopping agent loop.'
                    })
                    break
                }

                this.state.iteration = iteration + 1
                this.emit({ type: 'iteration', iteration: iteration + 1, maxIterations: runConfig.maxIterations })

                // Generate LLM response
                this.state.isGenerating = true
                this.state.streamingText = ''

                let response: string
                try {
                    response = await this.generateResponse(conversationMessages, signal)
                } catch (err) {
                    if (signal.aborted) {
                        this.emit({ type: 'aborted' })
                        break
                    }
                    const errorMsg = err instanceof Error ? err.message : String(err)
                    this.addStep({ type: 'error', content: `Generation failed: ${errorMsg}` })
                    this.emit({ type: 'error', error: errorMsg })
                    break
                }

                this.state.isGenerating = false
                this.state.streamingText = ''

                // Extract thinking
                const thinking = extractThinking(response)
                if (thinking) {
                    this.addStep({ type: 'thinking', content: thinking })
                }

                // Check for plan
                const plan = extractPlan(response)
                if (plan && runConfig.planMode) {
                    this.state.plan = plan
                    this.emit({ type: 'plan-proposed', plan })
                    this.addStep({ type: 'plan', content: plan.steps.map(s => s.description).join('\n') })
                    // In plan mode, we'd wait for approval here
                    // For now, auto-approve and continue
                    plan.status = 'executing'
                }

                // Parse tool calls
                const toolCalls = parseToolCalls(response)
                const cleanText = extractCleanContent(response)

                if (toolCalls.length === 0) {
                    // No tool calls - this is the final answer
                    finalResponse = cleanText
                    if (finalResponse) {
                        this.addStep({ type: 'answer', content: finalResponse })
                    }
                    break
                }

                // If we have tool calls AND text, show the text as thinking/explanation
                if (cleanText) {
                    this.addStep({ type: 'thinking', content: cleanText })
                } else {
                    this.addStep({ type: 'thinking', content: `Executing ${toolCalls.length} tool(s)...` })
                }

                // Execute tool calls sequentially
                for (const toolCall of toolCalls) {
                    if (signal.aborted) break

                    this.addStep({
                        type: 'tool-call',
                        content: `Calling ${toolCall.name}`,
                        name: toolCall.name,
                        params: toolCall.params
                    })
                    this.emit({ type: 'tool-executing', toolName: toolCall.name, params: toolCall.params })

                    const context: ToolContext = { workspacePath: this.workspacePath }
                    const stepStart = Date.now()

                    try {
                        const result = await executeTool(toolCall.name, toolCall.params, context)
                        const duration = Date.now() - stepStart

                        // Track modified files
                        if (result.success && ['writeFile', 'replaceInFile', 'insertAtLine', 'fuzzyReplace', 'createFile'].includes(toolCall.name)) {
                            const filePath = (toolCall.params.path as string) || ''
                            if (filePath && !this.state.modifiedFiles.includes(filePath)) {
                                this.state.modifiedFiles.push(filePath)
                                this.emit({ type: 'file-modified', filePath })
                            }
                        }

                        const resultStr = result.success
                            ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))
                            : `Error: ${result.error}`

                        this.addStep({
                            type: 'tool-result',
                            content: resultStr,
                            name: toolCall.name,
                            data: result.data ?? result.error,
                            duration
                        })

                        this.emit({
                            type: 'tool-result',
                            toolName: toolCall.name,
                            result: result.data ?? result.error,
                            success: result.success
                        })

                        this.emit({
                            type: 'tool-complete',
                            toolName: toolCall.name,
                            result: result.data ?? result.error,
                            success: result.success
                        })

                        // Shadow Workspace: Auto-validate after file modifications
                        let validationFeedback = ''
                        if (result.success && ['writeFile', 'replaceInFile', 'insertAtLine', 'fuzzyReplace', 'createFile'].includes(toolCall.name)) {
                            const modifiedPath = (toolCall.params.path as string) || ''
                            if (modifiedPath && this.workspacePath) {
                                try {
                                    const validation = await shadowWorkspaceService.validateFile(modifiedPath, this.workspacePath)
                                    if (validation && !validation.success) {
                                        validationFeedback = '\n\n' + shadowWorkspaceService.formatErrorsForAgent(validation)
                                        this.addStep({
                                            type: 'error',
                                            content: `Build validation: ${validation.errors.filter(e => e.severity === 'error').length} error(s) detected`,
                                            toolName: 'shadowWorkspace',
                                            duration: validation.duration
                                        })
                                    }
                                } catch {
                                    // Validation is best-effort, don't block the loop
                                }
                            }
                        }

                        // Add tool result to conversation for next iteration
                        conversationMessages = [
                            ...conversationMessages,
                            this.makeAssistantMessage(response),
                            this.makeUserMessage(
                                `Tool "${toolCall.name}" ${result.success ? 'succeeded' : 'failed'}.\nResult:\n${resultStr}${validationFeedback}\n\nContinue with the task. If more tools are needed, call them. If the task is complete, provide a final summary.`
                            )
                        ]
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err)
                        this.addStep({
                            type: 'error',
                            content: `Tool ${toolCall.name} error: ${errorMsg}`,
                            name: toolCall.name,
                            duration: Date.now() - stepStart
                        })
                        this.emit({ type: 'tool-result', toolName: toolCall.name, result: errorMsg, success: false })
                        this.emit({ type: 'tool-complete', toolName: toolCall.name, result: errorMsg, success: false })

                        conversationMessages = [
                            ...conversationMessages,
                            this.makeAssistantMessage(response),
                            this.makeUserMessage(
                                `Tool "${toolCall.name}" threw an error: ${errorMsg}\n\nTry a different approach or tool. If the task cannot be completed, explain why.`
                            )
                        ]
                    }
                }
            }

            // If we exhausted iterations without a final answer
            if (!finalResponse && this.state.steps.length > 0) {
                const lastStep = this.state.steps[this.state.steps.length - 1]
                if (lastStep.type === 'tool-result') {
                    finalResponse = `Completed ${this.state.iteration} steps. Modified files: ${this.state.modifiedFiles.join(', ') || 'none'}.`
                }
            }

            this.emit({ type: 'completed', finalMessage: finalResponse, steps: this.state.steps })
            return finalResponse

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            this.state.error = errorMsg
            this.emit({ type: 'error', error: errorMsg })
            logger.agent.error('Agent loop failed', err)
            return `Error: ${errorMsg}`

        } finally {
            if (this.state) {
                this.state.isRunning = false
                this.state.isGenerating = false
            }
            this.abortController = null
        }
    }

    /**
     * Get the conversation history from the last run.
     * Useful for continuation or background analysis.
     */
    getMissionHistory(): Array<{ role: string; content: string }> {
        return this.state?.steps.map(step => {
            if (step.type === 'thinking') return { role: 'assistant', content: `<think>\n${step.content}\n</think>` }
            if (step.type === 'tool-call') return { role: 'assistant', content: `{"name": "${step.toolName}", "params": ${JSON.stringify(step.toolParams)}}` }
            if (step.type === 'tool-result') return { role: 'user', content: `Tool Result: ${JSON.stringify(step.toolResult)}` }
            if (step.type === 'answer') return { role: 'assistant', content: step.content }
            return { role: 'user', content: step.content }
        }) || []
    }

    /**
     * Abort the currently running loop
     */
    async abort() {
        if (!this.state?.isRunning) return

        this.abortController?.abort()

        // Cancel active tool execution
        await stopActiveTool().catch(() => { })

        // Cancel LLM generation
        if (this.useOfflineAI) {
            await offlineLLMService.cancelGeneration().catch(() => { })
        } else {
            aiService.cancelStream()
        }

        if (this.state) {
            this.state.isRunning = false
            this.state.isGenerating = false
        }

        this.emit({ type: 'aborted' })
    }

    // --- Internal Methods ---

    private addStep(step: Omit<AgentStep, 'id' | 'timestamp'>) {
        const fullStep: AgentStep = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...step
        }
        this.state?.steps.push(fullStep)
        this.emit({ type: 'step-added', step: fullStep })
    }

    private buildSystemPrompt(ragContext: string, config: AgentLoopConfig): string {
        const loadedModelId = this.useOfflineAI
            ? useModelStore.getState().loadedModelId
            : null

        const tier = detectModelTier(
            loadedModelId,
            this.cloudProvider,
            this.useOfflineAI
        )

        let prompt = buildAgentLoopSystemPrompt(tier, this.workspacePath, ragContext)

        // Add plan mode instructions
        if (config.planMode) {
            prompt += `

## PLAN MODE
Before executing any tools, first create a plan:
\`\`\`plan
{
  "title": "Brief description of the task",
  "steps": [
    {"description": "Step 1: What to do", "name": "toolName"},
    {"description": "Step 2: What to do next", "name": "toolName"}
  ]
}
\`\`\`
Then execute the plan step by step.`
        }

        return prompt
    }

    private buildMessages(
        systemPrompt: string,
        chatHistory: Array<{ role: string; content: string }>,
        userMessage: string,
        contextWindow: number
    ): Array<{ role: string; content: string }> {
        const responseBuffer = 4096
        const systemTokens = estimateTokens(systemPrompt)
        const userTokens = estimateTokens(userMessage)
        
        let availableTokens = contextWindow - responseBuffer - systemTokens - userTokens
        
        // Safety buffer
        availableTokens -= 1000 

        if (availableTokens < 0) {
            // Context is extremely tight, just send system + truncated user message
            return [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: truncateToTokens(userMessage, contextWindow - systemTokens - 500) }
            ]
        }

        const selectedHistory: Array<{ role: string; content: string }> = []
        
        // Iterate backwards
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            const msg = chatHistory[i]
            const msgTokens = estimateTokens(msg.content)
            
            if (availableTokens >= msgTokens) {
                selectedHistory.unshift({
                    role: msg.role === 'tool' ? 'assistant' : msg.role,
                    content: msg.content
                })
                availableTokens -= msgTokens
            } else if (availableTokens > 100) {
                // Partial fit (keep at least 100 tokens)
                selectedHistory.unshift({
                    role: msg.role === 'tool' ? 'assistant' : msg.role,
                    content: '...(older content truncated)...\n' + truncateToTokens(msg.content, availableTokens) // We want the END of the message ideally, but truncateToTokens keeps START. For now keeping start is safer for context.
                })
                availableTokens = 0
                break
            } else {
                break
            }
        }

        return [
            { role: 'system', content: systemPrompt },
            ...selectedHistory,
            { role: 'user', content: userMessage }
        ]
    }

    private makeAssistantMessage(content: string): { role: string; content: string } {
        return { role: 'assistant', content }
    }

    private makeUserMessage(content: string): { role: string; content: string } {
        return { role: 'user', content }
    }

    private async generateResponse(
        messages: Array<{ role: string; content: string }>,
        signal: AbortSignal
    ): Promise<string> {
        if (this.useOfflineAI) {
            return this.generateOffline(messages, signal)
        } else {
            return this.generateCloud(messages, signal)
        }
    }

    private async generateOffline(
        messages: Array<{ role: string; content: string }>,
        signal: AbortSignal
    ): Promise<string> {
        const loadedModelId = useModelStore.getState().loadedModelId
        if (!loadedModelId) throw new Error('No offline model loaded')

        const modelSize = getModelSizeCategory(loadedModelId)

        // For offline, keep conversation history within context limits but generous enough for reasoning
        const trimmedMessages: OfflineChatMessage[] = [
            messages[0] as OfflineChatMessage, // system prompt
            ...messages.slice(-10).map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: m.content
            }))
        ]

        // Use grammar-based JSON sampling for tool calls
        const options: any = {
            temperature: 0.2,
            maxTokens: 2048
        }

        // Detect if this might be a tool-using turn or if we should allow natural text
        const lastMsg = messages[messages.length - 1]
        const lastContent = lastMsg?.content?.toLowerCase() || ''
        
        // Conversational triggers - if these are present, DON'T force JSON
        const isConversational = 
            lastContent.length < 15 && 
            (lastContent.includes('hi') || 
             lastContent.includes('hello') || 
             lastContent.includes('hey') || 
             lastContent.includes('how are') ||
             lastContent.includes('who are'))

        const isToolTurn = lastMsg?.content?.includes('Tool ') ||
            lastMsg?.content?.includes('Continue with') ||
            lastMsg?.content?.includes('TOOL_NAME')

        if ((isToolTurn || modelSize === 'small') && !isConversational) {
            options.jsonSchema = modelSize === 'small'
                ? getSimplifiedToolSchema()
                : getToolCallJsonSchema()
        }

        const response = await new Promise<string>((resolve, reject) => {
            const onAbort = () => {
                offlineLLMService.cancelGeneration()
                reject(new Error('Aborted'))
            }
            signal.addEventListener('abort', onAbort, { once: true })

            offlineLLMService.generateStream(
                trimmedMessages,
                (token) => {
                    if (this.state) {
                        this.state.streamingText += token
                        this.emit({ type: 'streaming', text: this.state.streamingText })
                    }
                },
                options
            ).then(resolve).catch(reject).finally(() => {
                signal.removeEventListener('abort', onAbort)
            })
        })

        return response
    }

    private async generateCloud(
        messages: Array<{ role: string; content: string }>,
        signal: AbortSignal
    ): Promise<string> {
        const aiMessages: AIMessage[] = messages.map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
        }))

        // Determine best model for agent tasks
        const options: any = {
            temperature: 0.2,
            maxTokens: 4096,
            thinking: true
        }

        // Auto-select 'Ultra' models for cloud providers to ensure high-quality tool calling
        if (this.cloudProvider === 'openai') options.model = 'gpt-5-preview'
        else if (this.cloudProvider === 'anthropic') options.model = 'claude-4-6-opus-latest'
        else if (this.cloudProvider === 'google') options.model = 'gemini-3-pro-high'

        const response = await new Promise<string>((resolve, reject) => {
            const onAbort = () => {
                aiService.cancelStream()
                reject(new Error('Aborted'))
            }
            signal.addEventListener('abort', onAbort, { once: true })

            aiService.chatStream(
                aiMessages,
                {
                    onToken: (token: string) => {
                        if (this.state) {
                            this.state.streamingText += token
                            this.emit({ type: 'streaming', text: this.state.streamingText })
                        }
                    },
                    onComplete: (fullResponse: string) => {
                        signal.removeEventListener('abort', onAbort)
                        resolve(fullResponse)
                    },
                    onError: (error: string) => {
                        signal.removeEventListener('abort', onAbort)
                        reject(new Error(error))
                    }
                },
                this.cloudProvider,
                options
            )
        })

        return response
    }
}

export const agentLoopService = new AgentLoopService()
