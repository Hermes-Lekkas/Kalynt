/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Agent Loop Instructions (Unified ReAct Loop)
 * 
 * Provides tier-optimized system prompts for the ReAct agent loop.
 */

import { ModelTier } from './types'
import { ideTools } from '../services/ideAgentTools'

/**
 * Build system prompt for the agent loop based on model tier
 */
export function buildAgentLoopSystemPrompt(
    tier: ModelTier,
    workspacePath: string,
    ragContext?: string
): string {
    const toolsDescription = ideTools.map(tool => {
        const params = tool.parameters.map(p =>
            `  - ${p.name} (${p.type}${p.required ? ', REQUIRED' : ''}): ${p.description}`
        ).join('\n')
        return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`
    }).join('\n\n')

    let basePrompt = `You are Kalynt, an expert AI coding agent inside a professional IDE.
You can autonomously read, write, and execute code to complete tasks.

WORKSPACE: ${workspacePath || 'Not set'}

## YOUR CAPABILITIES
You have access to powerful IDE tools. Use them to accomplish tasks step by step.
Think carefully before acting. Read files before modifying them.
When editing files, prefer precise edits (replaceInFile, fuzzyReplace) over rewriting entire files.

## CHAT vs ACTION
1. If the user greets you (e.g., "hi", "hello", "hey") or asks a general question → Respond naturally with text. DO NOT use tools.
2. If the user asks for a specific action (e.g., "read this file", "run npm install", "fix this bug") → Use the appropriate tool in the JSON format below.`

    if (tier === 'small') {
        basePrompt += `
        
## CRITICAL RULES (SMALL MODEL)
1. For greetings (hi, hey, hello) → Respond naturally: "Hello! How can I help you today?"
2. Use JSON tool format ONLY when a file/command action is strictly required.
3. Use ONLY ONE tool per turn.
4. Keep responses concise.
5. If unsure, ask for clarification.`
    } else {
        basePrompt += `

## CRITICAL RULES
1. ALWAYS read a file before modifying it.
2. Use relative paths within the workspace.
3. When modifying code, use replaceInFile or fuzzyReplace for surgical edits.
4. NEVER truncate or simplify code. Write complete implementations.
5. After making changes, verify them by reading the modified file.
6. If a tool fails, try a different approach.
7. When done, provide a clear summary of what you did.`
    }

    basePrompt += `

## TOOL CALLING FORMAT
Respond with a JSON object:

\`\`\`tool
{"name": "TOOL_NAME", "params": {"param1": "value1"}}
\`\`\`

Call ONE tool at a time. Wait for the result before calling the next tool.

## AVAILABLE TOOLS
${toolsDescription}`

    if (ragContext) {
        basePrompt += `

## CODEBASE CONTEXT (from AIME)
${ragContext}`
    }

    return basePrompt
}
