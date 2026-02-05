/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Flagship Model Instructions (Online API Models)
 * 
 * Optimized for maximum capability cloud models:
 * - OpenAI: GPT-4o-mini, GPT-4o
 * - Anthropic: Claude 4.5 Haiku, Claude 4.5 Sonnet
 * - Google: Gemini 3 Flash, Gemini 3 Pro
 * 
 * Key principles:
 * 1. Maximum capability utilization
 * 2. Advanced reasoning and planning
 * 3. Multi-step orchestration
 * 4. Full context window usage
 * 5. Thinking mode support for compatible models
 */

import { AIProvider } from '../services/aiService'
import { getModeConfig } from '../config/editorModes'
import { getToolsDescription } from '../services/ideAgentTools'
import { InstructionConfig, InstructionResult } from './types'

/**
 * Provider-specific capabilities
 */
interface ProviderCapabilities {
  supportsThinking: boolean
  maxContextTokens: number
  bestForCodeAnalysis: boolean
  supportsFunctionCalling: boolean
}

const PROVIDER_CAPABILITIES: Record<AIProvider, ProviderCapabilities> = {
  openai: {
    supportsThinking: true,  // o1, o3 models
    maxContextTokens: 128000,
    bestForCodeAnalysis: true,
    supportsFunctionCalling: true
  },
  anthropic: {
    supportsThinking: true,  // Extended thinking mode
    maxContextTokens: 200000,
    bestForCodeAnalysis: true,
    supportsFunctionCalling: true
  },
  google: {
    supportsThinking: false,
    maxContextTokens: 1000000,  // Gemini 1.5 Pro
    bestForCodeAnalysis: true,
    supportsFunctionCalling: true
  }
}

/**
 * Build system prompt for flagship models
 * Advanced prompting with orchestrator patterns
 */
function buildSystemPrompt(config: InstructionConfig, provider: AIProvider): string {
  const modeConfig = getModeConfig(config.mode)
  const toolsDescription = config.useTools ? getToolsDescription() : ''
  const capabilities = PROVIDER_CAPABILITIES[provider]

  return `You are a premier AI coding agent powered by ${getProviderName(provider)}, integrated into the Kalynt IDE—a next-generation collaborative development environment.

## Your Identity

Persona: ${modeConfig.systemPrompt}
Workspace Mode: ${modeConfig.name}
Workspace Path: ${config.workspacePath || 'Not specified'}

## Core Mission

You are the user's expert pair programmer. Your role is to:
- **Detect issues** before they become production bugs
- **Suggest improvements** that enhance code quality, security, and performance
- **Guide architecture** decisions with industry best practices
- **Accelerate development** by providing precise, actionable suggestions

## Analysis Framework

When analyzing code, systematically evaluate:

### 1. Correctness
- Logic errors and edge cases
- Type mismatches and null safety
- API contract violations
- Race conditions and async issues

### 2. Security
- Input validation and sanitization
- Authentication/authorization gaps
- SQL injection, XSS, CSRF vulnerabilities
- Secrets and sensitive data exposure
- Dependency vulnerabilities

### 3. Performance
- Algorithm complexity (Big O)
- Memory leaks and resource management
- Unnecessary re-renders (React/Vue)
- Database query optimization
- Caching opportunities

### 4. Maintainability
- Code duplication (DRY violations)
- Naming clarity and conventions
- Documentation quality
- Test coverage gaps
- Technical debt indicators

### 5. Architecture
- Separation of concerns
- Dependency management
- Scalability considerations
- Integration patterns

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
You have full access to IDE tools for deeper analysis:

${toolsDescription}

Use tools strategically when:
- **Starting a task**: Use \`getFileTree\` to understand the project structure.
- **Lost/Unsure**: Use \`searchRelevantContext\` to find where a feature is implemented.
- **Deep Dive**: Use \`readFile\` to examine implementation details.

Tool Usage Example:
{
  "action": "tool-call",
  "target": "file-system",
  "description": "Searching for authentication logic",
  "reasoning": "Need to find the auth middleware before suggesting security fixes",
  "confidence": 0.9,
  "payload": {
    "tool": "searchRelevantContext",
    "params": {"query": "auth middleware"}
  }
}
` : ''}

## Response Format

Provide your analysis as valid JSON:

{
  "suggestions": [
    {
      "action": "edit" | "create-task" | "suggest" | "comment" | "organize" | "tool-call",
      "target": "editor-content" | "tasks" | "messages" | "file-system",
      "description": "Concise description of the suggestion",
      "reasoning": "Detailed explanation of why this matters and how it helps",
      "confidence": 0.0-1.0,
      "payload": { /* action-specific payload */ }
    }
  ],
  "summary": "Executive summary of code analysis findings"
}

## Payload Specifications

**suggest** (informational advice):
{
  "message": "Detailed explanation of the issue and recommended solution",
  "category": "bug" | "security" | "performance" | "refactor" | "improvement",
  "filePath": "optional/path/to/file.ts",
  "lineNumber": 42
}

**edit** (code modification):
{
  "content": "The actual code to insert",
  "position": "append" | "prepend" | "replace" | "insert",
  "insertAt": 123  // line number for "insert"
}

**create-task** (task management):
{
  "title": "Descriptive task title",
  "status": "todo",
  "priority": "low" | "medium" | "high"
}

**tool-call** (IDE interaction):
{
  "tool": "toolName",
  "params": { /* tool-specific parameters */ }
}

## Quality Standards

${capabilities.supportsThinking ? `
### Thinking Mode Active
Take your time to reason through complex issues. For non-trivial analysis:
1. First, understand the code's intent and context
2. Identify potential issues systematically
3. Prioritize by severity and impact
4. Formulate precise, actionable solutions
` : ''}

### Suggestion Guidelines
- **Prioritize by impact**: Critical bugs > Security > Performance > Style
- **Be specific**: Include exact line numbers, code snippets, and fixes
- **Explain trade-offs**: Help users understand the "why" not just the "what"
- **Be pragmatic**: Consider time constraints and incremental improvements
- **Acknowledge good code**: If the code is well-written, say so

### When NOT to Suggest
- Minor style preferences that don't affect quality
- Changes that would only marginally improve already-good code
- Suggestions without clear benefit or justification

## Professional Conduct

- Base suggestions on evidence, not assumptions
- Acknowledge uncertainty when appropriate
- Respect existing code patterns unless they're problematic
- Focus on teaching, not just fixing`
}

/**
 * Build user prompt for flagship models
 * Rich context with comprehensive instructions
 */
function buildUserPrompt(config: InstructionConfig): string {
  const { context } = config
  const modeConfig = getModeConfig(config.mode)

  // Flagship models can handle more context
  const maxContentLength = 12000
  const content = context.editorContent.slice(0, maxContentLength)
  const truncated = context.editorContent.length > maxContentLength

  const tasksList = context.tasks.items.length > 0
    ? context.tasks.items.map(t => `- [${t.status}] ${t.title}`).join('\n')
    : 'No active tasks'

  return `# Code Analysis Request

## Context
- **Mode**: ${modeConfig.name}
- **Editor Content**: ${context.editorWordCount} words
- **Tasks**: ${context.tasks.total} (${context.tasks.todo} todo, ${context.tasks.inProgress} in-progress, ${context.tasks.done} done)
- **User Idle**: ${Math.round(context.idleTime / 1000)}s

## Active Tasks
${tasksList}

## Code Under Review

\`\`\`
${content}${truncated ? '\n\n// ... additional content truncated' : ''}
\`\`\`

## Analysis Request

Please analyze the code above and provide actionable suggestions. Focus on:

1. **Critical Issues**: Any bugs, security vulnerabilities, or logic errors that could cause failures
2. **Code Quality**: Improvements for maintainability, readability, and testability
3. **Best Practices**: Alignment with ${modeConfig.name} conventions and patterns
4. **Optimization**: Performance improvements if applicable

Provide up to 3 prioritized suggestions. For each, explain both the problem and the solution clearly.

Respond with JSON only.`
}

/**
 * Get human-readable provider name
 */
function getProviderName(provider: AIProvider): string {
  const names: Record<AIProvider, string> = {
    openai: 'OpenAI (GPT-4)',
    anthropic: 'Anthropic (Claude)',
    google: 'Google (Gemini)'
  }
  return names[provider] || provider
}

/**
 * Build complete instruction set for flagship models
 */
export function buildFlagshipModelInstructions(
  config: InstructionConfig,
  provider: AIProvider = 'openai'
): InstructionResult {
  const systemPrompt = buildSystemPrompt(config, provider)
  const userPrompt = buildUserPrompt(config)
  const capabilities = PROVIDER_CAPABILITIES[provider]

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    maxSuggestions: 3,
    enabledActions: ['edit', 'create-task', 'suggest', 'comment', 'organize', 'tool-call'],
    temperature: capabilities.supportsThinking ? 0.3 : 0.4,
    maxTokens: 2000  // More room for detailed analysis
  }
}

/**
 * Get provider capabilities for dynamic behavior
 */
export function getProviderCapabilities(provider: AIProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider]
}

/**
 * Check if using an online provider
 */
export function isOnlineProvider(provider: string): boolean {
  return ['openai', 'anthropic', 'google'].includes(provider)
}

/**
 * Get recommended settings for flagship models
 */
export function getFlagshipModelSettings(provider: AIProvider) {
  const capabilities = PROVIDER_CAPABILITIES[provider]
  return {
    maxContextChars: Math.min(capabilities.maxContextTokens * 3, 12000),
    maxSuggestions: 3,
    temperature: capabilities.supportsThinking ? 0.3 : 0.4,
    maxTokens: 2000,
    analysisInterval: 25000,  // Can analyze faster
    minIdleTime: 10000,
    enableThinking: capabilities.supportsThinking
  }
}
