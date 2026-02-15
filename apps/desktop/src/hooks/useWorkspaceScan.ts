import { useState, useRef, useEffect } from 'react'
import { offlineLLMService } from '../services/offlineLLMService'
import { aiService, AIProvider } from '../services/aiService'

// Custom error class
class AnalysisTimeoutError extends Error {
    constructor(message: string = 'Analysis timed out') {
        super(message)
        this.name = 'AnalysisTimeoutError'
    }
}

export function useWorkspaceScan(
    workspacePath: string | null,
    agent: any,
    agentAIMode: 'cloud' | 'offline',
    loadedModelId: string | null,
    currentProvider: AIProvider
) {
    const [isScanning, setIsScanning] = useState(false)
    const [scanProgress, setScanProgress] = useState<{ current: number; total: number; currentFile: string } | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const scanWorkspace = async () => {
        if (!workspacePath) return
        setIsScanning(true)
        setScanProgress({ current: 0, total: 0, currentFile: 'Indexing workspace...' })

        try {
            // All IDE-supported languages
            const codeExtensions = /\.(ts|tsx|js|jsx|json|md|css|scss|html|py|rs|go|java|c|cpp|h|hpp|yaml|yml|xml|sql|sh|bash|ps1|rb|php|swift|kt|scala|vue|svelte|lua|r|m|mm|zig|nim|ex|exs|clj|hs|fs|dart|toml|ini|cfg|conf)$/i
            const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'coverage', '.cache', '.turbo', '.vercel', 'vendor', 'packages', '.idea', '.vscode']

            const allCodeFiles: { name: string; path: string; size?: number }[] = []

            const collectFiles = async (dirPath: string, depth = 0) => {
                if (depth > 5) return

                const result = await (globalThis as any).window.electronAPI?.fs.readDir(dirPath)
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
                // No files found
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
                if (!isMountedRef.current) {
                    console.log('[Scan] Component unmounted, stopping scan')
                    break
                }

                const file = filesToAnalyze[i]
                setScanProgress({ current: i + 1, total: filesToAnalyze.length, currentFile: file.name })

                const content = await (globalThis as any).window.electronAPI?.fs.readFile(file.path)
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
                const offlinePrompt = `Review this ${language} file "${file.name}".\n\n${fileContent}\n\nReturn JSON: {"issues":[{"type":"bug"|"security"|"performance"|"improvement","description":"...","suggestion":"..."}]}`

                const cloudPrompt = `Analyze this ${language} code for bugs, security issues, and improvements.\n\nFile: ${file.name} (${lineCount} lines total, showing first ${Math.min(lineCount, maxLines)})\n\n\`\`\`${language.toLowerCase()}\n${fileContent}\n\`\`\`\n\nFind REAL issues only. Output JSON with issues array. If no issues, return {"issues": []}`

                const prompt = agentAIMode === 'offline' ? offlinePrompt : cloudPrompt

                try {
                    let response: string = ''

                    // 300s timeout for both offline and cloud (5m)
                    const fileTimeoutMs = 300000
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

                        const timeoutPromise = new Promise<string>((_, reject) => {
                            timeoutId = window.setTimeout(async () => {
                                await offlineLLMService.cancelGeneration()
                                reject(new AnalysisTimeoutError())
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
                            timeoutId = window.setTimeout(() => reject(new AnalysisTimeoutError()), fileTimeoutMs)
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
                            response = cloudResponse.content || ''
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
                    if (e instanceof AnalysisTimeoutError) {
                        timedOutFiles++
                        console.warn('Analysis timed out for', file.name)
                    } else {
                        const errorMsg = e instanceof Error ? e.message : 'Unknown error'
                        console.error('Failed to analyze', file.name, ':', errorMsg)
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

        } catch (err) {
            console.error('Error scanning workspace:', err)
        } finally {
            setIsScanning(false)
            setScanProgress(null)
        }
    }

    return {
        scanWorkspace,
        isScanning,
        scanProgress
    }
}
