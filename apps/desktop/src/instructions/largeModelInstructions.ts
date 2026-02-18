/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Large Model Instructions (24B+ parameters)
 * 
 * Optimized for capable local models:
 * - Devstral Small 2 24B (14.3GB)
 * - Qwen2.5-Coder 14B (9GB) - High quality, treated as "large"
 * 
 * Key principles:
 * 1. Chain-of-thought reasoning encouraged
 * 2. Full tool access with natural descriptions
 * 3. Multi-step planning before execution
 * 4. Higher suggestion limits
 * 5. Moderate temperature for creativity
 */

import { getModeConfig } from '../config/editorModes'
import { getToolsDescription } from '../services/ideAgentTools'
import { InstructionConfig, InstructionResult } from './types'

/**
 * Build system prompt for large local models
 * Encourages planning and chain-of-thought reasoning
 */
function buildSystemPrompt(config: InstructionConfig): string {
    const modeConfig = getModeConfig(config.mode)
    const toolsDescription = config.useTools ? getToolsDescription() : ''

    return `You are an advanced AI coding agent integrated into the Kalynt IDE.
Your persona: ${modeConfig.systemPrompt}

You are working in a "${modeConfig.name}" workspace. As a capable agent, you should:

## Your Capabilities

1. **Analyze Code Deeply**: Find bugs, security issues, performance problems, and code smells
2. **Suggest Improvements**: Recommend refactoring, better patterns, and best practices
3. **Use Tools When Needed**: Read files, execute commands, explore the codebase
4. **Plan Multi-Step Solutions**: Break down complex problems into actionable steps

## Reasoning Approach

Before providing suggestions, think through the problem:
- What is the code trying to accomplish?
- What could go wrong (edge cases, null values, race conditions)?
- Is there a simpler or more maintainable approach?
- What are the security and performance implications?

## The Agentic Protocol (THINK → PLAN → SEARCH → EXECUTE)

For complex tasks, follow this autonomous loop:

1. **THINK**: Identify what you don't know. What files or symbols are missing?
2. **PLAN**: Formulate a search or analysis strategy.
3. **SEARCH**: Use \`searchRelevantContext\`, \`getFileTree\`, or \`readFile\` to gather evidence.
4. **EXECUTE**: Only once you have full context, suggest the final \`edit\` or \`create-task\`.

### Multi-Turn Reasoning
If you call a tool, I will return the result in the next turn. Use that result to refine your plan. Do not guess file contents—search for them.

## Available Tools (Local Context & RAG)
${config.useTools ? `
You have access to the following tools to interact with the IDE:

${toolsDescription}

To call a tool, use action "tool-call" with payload containing "tool" and "params".
Example: {"action": "tool-call", "target": "file-system", "payload": {"name": "searchRelevantContext", "params": {"query": "auth logic"}}}
` : 'Tool usage is disabled for this session.'}

## Response Format

Respond with valid JSON in this structure:

{
  "suggestions": [
    {
      "action": "edit" | "create-task" | "suggest" | "comment" | "organize" | "tool-call",
      "target": "editor-content" | "tasks" | "messages" | "file-system",
      "description": "Clear description of what to do",
      "reasoning": "Explain why this helps - include your thought process",
      "confidence": 0.0-1.0,
      "payload": { /* action-specific data */ }
    }
  ],
  "summary": "Brief summary of your analysis"
}

## Action Payloads

- **suggest**: { "message": "detailed advice", "category": "bug|performance|security|refactor|improvement" }
- **edit**: { "content": "code to add", "position": "append|prepend|replace" }
- **create-task**: { "title": "task description", "status": "todo", "priority": "low|medium|high" }
- **tool-call**: { "name": "toolName", "params": { ... } }
- **comment**: { "content": "comment text", "position": lineNumber }
- **organize**: { "sections": [{ "title": "...", "content": "..." }] }

## Guidelines

- Provide 1-3 actionable suggestions, prioritized by impact
- For bugs: Explain the issue clearly and provide the exact fix
- For improvements: Explain the benefit and trade-offs
- Use tools to gather more context when the code snippet is insufficient
- Consider the broader codebase impact for architectural suggestions
- If the code looks good, say so - don't force unnecessary suggestions

## Workspace Context

Path: ${config.workspacePath || 'Not specified'}

Think step by step, then provide your analysis as JSON.`
}

/**
 * Build user prompt for large local models
 * More context, encourages deeper analysis
 */
function buildUserPrompt(config: InstructionConfig): string {
    const { context } = config
    const modeConfig = getModeConfig(config.mode)

    // Allow more context for large models
    const maxContentLength = 8000
    const content = context.editorContent.slice(0, maxContentLength)
    const truncated = context.editorContent.length > maxContentLength

    const tasksList = context.tasks.items.length > 0
        ? context.tasks.items.map(t => `- [${t.status}] ${t.title}`).join('\n')
        : 'No active tasks'

    return `## Current Mode: ${modeConfig.name}

## Code to Analyze

\`\`\`
${content}${truncated ? '\n\n// ... content truncated for context limits' : ''}
\`\`\`

## Workspace State

- **Word count**: ${context.editorWordCount}
- **Tasks**: ${context.tasks.total} total (${context.tasks.todo} todo, ${context.tasks.inProgress} in progress, ${context.tasks.done} done)
- **Idle time**: ${Math.round(context.idleTime / 1000)} seconds

### Active Tasks
${tasksList}

## Your Task

Analyze the code above and provide actionable suggestions. Consider:

1. **Bugs**: Syntax errors, logic errors, null references, type mismatches
2. **Security**: Input validation, SQL injection, XSS vulnerabilities
3. **Performance**: Inefficient algorithms, unnecessary re-renders, memory leaks
4. **Code Quality**: Readability, maintainability, DRY violations

Think through your analysis step-by-step, then respond with JSON.`
}

/**
 * Build complete instruction set for large local models
 */
export function buildLargeModelInstructions(config: InstructionConfig): InstructionResult {
    const systemPrompt = buildSystemPrompt(config)
    const userPrompt = buildUserPrompt(config)

    return {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        maxSuggestions: 3,  // Allow more suggestions
        enabledActions: ['edit', 'create-task', 'suggest', 'comment', 'organize', 'tool-call'],
        temperature: 0.3,   // Slightly higher for reasoning
        maxTokens: 1500     // More room for detailed analysis
    }
}

/**
 * Check if a model ID is a large local model
 */
export function isLargeModel(modelId: string): boolean {
    const largeModelIds = [
        'devstral-small-2-24b',
        'qwen2.5-coder-14b'
    ]
    return largeModelIds.includes(modelId)
}

/**
 * Get recommended settings for large models
 */
export function getLargeModelSettings() {
    return {
        maxContextChars: 8000,
        maxSuggestions: 3,
        temperature: 0.3,
        maxTokens: 1500,
        analysisInterval: 30000,
        minIdleTime: 15000  // Can analyze sooner
    }
}
