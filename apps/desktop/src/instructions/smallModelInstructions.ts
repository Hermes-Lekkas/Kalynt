/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Small Model Instructions (<24B parameters)
 * 
 * Optimized for models with limited reasoning capability:
 * - Qwen2.5-Coder 1.5B (1.7GB)
 * - Qwen3-4B-Thinking (2.9GB)
 * - Qwen2.5-Coder 7B Q4_K_M (4.68GB)
 * - Qwen2.5-Coder 7B Q8 (7.7GB)
 * 
 * Key principles:
 * 1. Extreme explicitness with step-by-step instructions
 * 2. Minimal tool set (4 essential tools only)
 * 3. Abundant examples in prompts
 * 4. Focused context with clear delimiters
 * 5. Strict JSON formatting requirements
 */

import { InstructionConfig, InstructionResult, ToolDefinition } from './types'

/**
 * Essential tools for small models - READ-ONLY operations only
 * Small models (<7B parameters) are limited to reading and exploring
 * They cannot reliably handle write operations or code execution
 */
const SMALL_MODEL_TOOLS: ToolDefinition[] = [
    {
        name: 'readFile',
        description: 'Read the contents of a file',
        parameters: [
            { name: 'path', type: 'string', description: 'File path to read', required: true }
        ],
        examples: [
            '{"tool": "readFile", "params": {"path": "src/index.ts"}}',
            '{"tool": "readFile", "params": {"path": "package.json"}}'
        ]
    },
    {
        name: 'listDirectory',
        description: 'List files and folders in a directory',
        parameters: [
            { name: 'path', type: 'string', description: 'Directory path', required: true }
        ],
        examples: [
            '{"tool": "listDirectory", "params": {"path": "src"}}',
            '{"tool": "listDirectory", "params": {"path": "."}}'
        ]
    }
]

/**
 * Format tool definitions for small models
 * Uses very explicit format with examples
 */
function formatToolsForSmallModel(): string {
    return SMALL_MODEL_TOOLS.map(tool => {
        const params = tool.parameters.map(p =>
            `  - ${p.name} (${p.type}${p.required ? ', REQUIRED' : ''}): ${p.description}`
        ).join('\n')

        const examples = tool.examples?.map(e => `  Example: ${e}`).join('\n') || ''

        return `TOOL: ${tool.name}
Description: ${tool.description}
Parameters:
${params}
${examples}`
    }).join('\n\n')
}

/**
 * Build system prompt for small models
 * Very explicit with exact format requirements
 */
function buildSystemPrompt(config: InstructionConfig): string {
    const toolsSection = config.useTools ? formatToolsForSmallModel() : ''

    return `You are Kalynt, a helpful AI coding assistant.

IMPORTANT - YOUR CAPABILITIES:
✓ You CAN: Chat, answer questions, explain code, read files, list directories
✗ You CANNOT: Write files, edit files, execute code, run commands

When users ask you to edit or write files, politely explain that you can only READ files and suggest what changes they should make manually.

${config.useTools ? `TOOLS (READ-ONLY):
${toolsSection}

HOW TO USE TOOLS:
When you need to read a file or list a directory, respond with ONLY JSON:
{"tool": "readFile", "params": {"path": "filename.ts"}}
{"tool": "listDirectory", "params": {"path": "src"}}

After you use a tool, you will receive the result. Then explain what you found to the user.
` : ''}
RESPONSE RULES:
1. For greetings (hi, hey, hello) → Respond naturally: "Hello! How can I help you today?"
2. For questions about code → Explain clearly and helpfully
3. For "read this file" requests → Use the readFile tool
4. For "list files" requests → Use the listDirectory tool
5. For "edit/write/modify" requests → Explain you cannot edit, but suggest what to change

EXAMPLES:

User: "hey"
You: Hello! How can I help you with your code today?

User: "what files are in src?"
You: {"tool": "listDirectory", "params": {"path": "src"}}

User: "read package.json"
You: {"tool": "readFile", "params": {"path": "package.json"}}

User: "show me the main.ts file"
You: {"tool": "readFile", "params": {"path": "main.ts"}}

User: "can you edit this file?"
You: I can only read files, not edit them. However, I can suggest what changes you should make. What would you like to modify?

User: "write a new function"
You: I cannot write to files directly. However, I can help you write the code! Here's what you could add: [code suggestion]. You'll need to paste this into your file manually.

WORKSPACE: ${config.workspacePath || 'Not set'}

Remember: Chat naturally for conversations. Use JSON tool format ONLY when reading files or listing directories.`
}

/**
 * Build user prompt for small models
 * Simplified context for chat-focused interaction
 */
function buildUserPrompt(config: InstructionConfig): string {
    const { context } = config

    // Truncate content more aggressively for small models (faster processing)
    const maxContentLength = 2000
    const content = context.editorContent.slice(0, maxContentLength)
    const truncated = context.editorContent.length > maxContentLength

    // Simple context for small models
    if (!content.trim()) {
        return `The user is in the workspace. Help them with their questions about coding or their project.`
    }

    return `Current file content:
\`\`\`
${content}${truncated ? '\n... (file truncated for performance)' : ''}
\`\`\`

Help the user understand or discuss this code. If they ask you to read other files, use the readFile tool.`
}

/**
 * Build complete instruction set for small models
 */
export function buildSmallModelInstructions(config: InstructionConfig): InstructionResult {
    const systemPrompt = buildSystemPrompt(config)
    const userPrompt = buildUserPrompt(config)

    return {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        maxSuggestions: 1,  // Limit to 1 for reliability
        enabledActions: ['suggest', 'tool-call'],  // NO edit - small models are chat-only
        temperature: 0.3,   // Slightly higher for more natural conversation
        maxTokens: 512      // Smaller output limit for faster responses
    }
}

/**
 * Get available tools for small models
 */
export function getSmallModelTools(): ToolDefinition[] {
    return SMALL_MODEL_TOOLS
}

/**
 * Check if a model ID is a small model
 */
export function isSmallModel(modelId: string): boolean {
    const smallModelIds = [
        'qwen2.5-coder-1.5b',
        'qwen3-4b-thinking',
        'qwen2.5-coder-7b-q4',
        'qwen2.5-coder-7b'
    ]
    return smallModelIds.includes(modelId)
}
