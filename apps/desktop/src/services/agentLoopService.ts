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
import { executeTool, getToolCallJsonSchema, getSimplifiedToolSchema, getModelSizeCategory, stopActiveTool, type ToolContext, ideTools } from './ideAgentTools'
import { aimeService } from './aimeService'
import { useModelStore } from '../stores/modelStore'
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
 * Supports multiple formats: JSON, markdown, XML, Qwen, Hermes.
 */
function parseToolCalls(response: string): Array<{ name: string; params: Record<string, unknown> }> {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = []

    // Strategy 1: Markdown code block ```tool
    const toolBlockPattern = /```tool\s*\n?({[\s\S]*?})\n?```/gi
    let match: RegExpExecArray | null
    while ((match = toolBlockPattern.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            if (parsed.name && parsed.params) calls.push(parsed)
        } catch { /* skip invalid JSON */ }
    }
    if (calls.length > 0) return calls

    // Strategy 2: XML <tool> tags
    const xmlPattern = /<tool>\s*({[\s\S]*?})\s*<\/tool>/gi
    while ((match = xmlPattern.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            if (parsed.name && parsed.params) calls.push(parsed)
        } catch { /* skip */ }
    }
    if (calls.length > 0) return calls

    // Strategy 3: JSON code block ```json
    const jsonBlockPattern = /```json\s*\n?({[\s\S]*?"name"\s*:[\s\S]*?"params"\s*:[\s\S]*?})\n?```/gi
    while ((match = jsonBlockPattern.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            if (parsed.name && parsed.params) calls.push(parsed)
        } catch { /* skip */ }
    }
    if (calls.length > 0) return calls

    // Strategy 4: Qwen <tool_call> format
    const qwenPattern = /<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/gi
    while ((match = qwenPattern.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1])
            if (parsed.name && parsed.params) calls.push(parsed)
        } catch { /* skip */ }
    }
    if (calls.length > 0) return calls

    // Strategy 5: Hermes <function=name> format
    const hermesPattern = /<function=(\w+)>([\s\S]*?)<\/function>/gi
    while ((match = hermesPattern.exec(response)) !== null) {
        try {
            calls.push({ name: match[1], params: JSON.parse(match[2]) })
        } catch { /* skip */ }
    }
    if (calls.length > 0) return calls

    // Strategy 6: Direct JSON { "name": "...", "params": {...} }
    const jsonStartPattern = /\{\s*"name"\s*:/g
    while ((match = jsonStartPattern.exec(response)) !== null) {
        const jsonCandidate = response.substring(match.index)
        let endPos = jsonCandidate.lastIndexOf('}')
        while (endPos > 10) {
            try {
                const parsed = JSON.parse(jsonCandidate.substring(0, endPos + 1))
                if (parsed.name && parsed.params) {
                    calls.push(parsed)
                    break
                }
            } catch { /* try next */ }
            endPos = jsonCandidate.lastIndexOf('}', endPos - 1)
        }
    }

    return calls
}

/**
 * Extract clean text content from LLM response, removing tool calls and special tokens.
 */
function extractCleanContent(response: string): string {
    return response
        // Remove thinking tags
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        // Remove tool blocks
        .replace(/```tool[\s\S]*?```/gi, '')
        .replace(/```json\s*\n?\{[\s\S]*?"name"[\s\S]*?\}\n?```/gi, '')
        .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<function=\w+>[\s\S]*?<\/function>/gi, '')
        // Remove direct JSON tool calls
        .replace(/\{\s*"name"\s*:\s*"(?:readFile|writeFile|listDirectory|createFile|createDirectory|delete|executeCode|runFile|runCommand|gitStatus|searchFiles|searchRelevantContext|getFileTree|replaceInFile|insertAtLine|fileStats|fuzzyReplace|gitDiff|gitLog|gitCommit|gitAdd|getDiagnostics)"[\s\S]*?\}/g, '')
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
        .replace(/\n{3,}/g, '\n\n')
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
                    tool: s.tool,
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
                    description: line.replace(/^\d+[\.\)]\s*/, '').trim(),
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
        options?: Partial<AgentLoopConfig>
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

            // 2. Build system prompt
            const systemPrompt = this.buildSystemPrompt(ragContext, runConfig)

            // 3. Build conversation history
            const messages = this.buildMessages(systemPrompt, chatHistory, userMessage)

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

                if (toolCalls.length === 0) {
                    // No tool calls - this is the final answer
                    finalResponse = extractCleanContent(response)
                    if (finalResponse) {
                        this.addStep({ type: 'answer', content: finalResponse })
                    }
                    break
                }

                // Add thinking step for the reasoning part of the response
                const cleanText = extractCleanContent(response)
                if (cleanText) {
                    this.addStep({ type: 'thinking', content: cleanText })
                }

                // Execute tool calls sequentially
                for (const toolCall of toolCalls) {
                    if (signal.aborted) break

                    this.addStep({
                        type: 'tool-call',
                        content: `Calling ${toolCall.name}`,
                        toolName: toolCall.name,
                        toolParams: toolCall.params
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
                            toolName: toolCall.name,
                            toolResult: result.data ?? result.error,
                            duration
                        })

                        this.emit({
                            type: 'tool-complete',
                            toolName: toolCall.name,
                            result: result.data ?? result.error,
                            success: result.success
                        })

                        // Add tool result to conversation for next iteration
                        conversationMessages = [
                            ...conversationMessages,
                            this.makeAssistantMessage(response),
                            this.makeUserMessage(
                                `Tool "${toolCall.name}" ${result.success ? 'succeeded' : 'failed'}.\nResult:\n${resultStr}\n\nContinue with the task. If more tools are needed, call them. If the task is complete, provide a final summary.`
                            )
                        ]
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err)
                        this.addStep({
                            type: 'error',
                            content: `Tool ${toolCall.name} error: ${errorMsg}`,
                            toolName: toolCall.name,
                            duration: Date.now() - stepStart
                        })
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

        const modelSizeCategory = loadedModelId
            ? getModelSizeCategory(loadedModelId)
            : 'large'

        // Base agent identity + capabilities
        let prompt = `You are Kalynt, an expert AI coding agent inside a professional IDE.
You can autonomously read, write, and execute code to complete tasks.

WORKSPACE: ${this.workspacePath || 'Not set'}

## YOUR CAPABILITIES
You have access to powerful IDE tools. Use them to accomplish tasks step by step.
Think carefully before acting. Read files before modifying them.
When editing files, prefer precise edits (replaceInFile, fuzzyReplace) over rewriting entire files.

## CRITICAL RULES
1. ALWAYS read a file before modifying it.
2. Use relative paths within the workspace.
3. When modifying code, use replaceInFile or fuzzyReplace for surgical edits.
4. NEVER truncate or simplify code. Write complete implementations.
5. After making changes, verify them by reading the modified file.
6. If a tool fails, try a different approach.
7. When done, provide a clear summary of what you did.${modelSizeCategory === 'small' ? '\n8. Keep responses concise. Use only one tool per turn.' : ''}

## TOOL CALLING FORMAT
When you need to perform an action, respond with a JSON object:

\`\`\`tool
{"name": "TOOL_NAME", "params": {"param1": "value1"}}
\`\`\`

Call ONE tool at a time. Wait for the result before calling the next tool.

## AVAILABLE TOOLS
${ideTools.map(tool => {
            const params = tool.parameters.map(p =>
                `  - ${p.name} (${p.type}${p.required ? ', REQUIRED' : ''}): ${p.description}`
            ).join('\n')
            return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`
        }).join('\n\n')}`

        // Add plan mode instructions
        if (config.planMode) {
            prompt += `

## PLAN MODE
Before executing any tools, first create a plan:
\`\`\`plan
{
  "title": "Brief description of the task",
  "steps": [
    {"description": "Step 1: What to do", "tool": "toolName"},
    {"description": "Step 2: What to do next", "tool": "toolName"}
  ]
}
\`\`\`
Then execute the plan step by step.`
        }

        // Add RAG context
        if (ragContext) {
            prompt += `

## CODEBASE CONTEXT (from AIME indexing)
${ragContext.slice(0, config.maxRAGContext)}`
        }

        return prompt
    }

    private buildMessages(
        systemPrompt: string,
        chatHistory: Array<{ role: string; content: string }>,
        userMessage: string
    ): Array<{ role: string; content: string }> {
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt }
        ]

        // Add relevant chat history (keep it concise for context efficiency)
        const recentHistory = chatHistory.slice(-10)
        for (const msg of recentHistory) {
            messages.push({
                role: msg.role === 'tool' ? 'assistant' : msg.role,
                content: msg.content.slice(0, 2000)
            })
        }

        messages.push({ role: 'user', content: userMessage })
        return messages
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

        // For offline, keep conversation short to fit in context
        const trimmedMessages: OfflineChatMessage[] = [
            messages[0] as OfflineChatMessage, // system prompt
            ...messages.slice(-4).map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: m.content
            }))
        ]

        // Use grammar-based JSON sampling for tool calls
        const options: any = {
            temperature: 0.2,
            maxTokens: 2048
        }

        // Detect if this might be a tool-using turn
        const lastMsg = messages[messages.length - 1]
        const isToolTurn = lastMsg?.content?.includes('Tool ') ||
            lastMsg?.content?.includes('Continue with') ||
            lastMsg?.content?.includes('TOOL_NAME')

        if (isToolTurn || modelSize === 'small') {
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
                {
                    temperature: 0.2,
                    maxTokens: 4096,
                    thinking: true
                }
            )
        })

        return response
    }
}

export const agentLoopService = new AgentLoopService()
