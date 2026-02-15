/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState } from 'react'
import {
    Bug, Shield, Zap, Info, ChevronRight,
    ChevronDown, FileCode, ArrowRight,
    Copy, Check, Loader2, ExternalLink, Wrench, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { ScanIssue, IssueType, Severity } from '../../services/workspaceScanService'
import { aiService, AIProvider } from '../../services/aiService'
import { offlineLLMService } from '../../services/offlineLLMService'

interface ScanIssueCardProps {
    issue: ScanIssue
    aiMode: 'cloud' | 'offline'
    provider: AIProvider
    loadedModelId: string | null
}

export default function ScanIssueCard({ issue, aiMode, provider, loadedModelId }: ScanIssueCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [applyStatus, setApplyStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [applyError, setApplyError] = useState('')

    const typeIcons: Record<IssueType, React.ReactNode> = {
        bug: <Bug size={14} />,
        security: <Shield size={14} />,
        performance: <Zap size={14} />,
        improvement: <Info size={14} />
    }

    const typeLabels: Record<IssueType, string> = {
        bug: 'Bug',
        security: 'Security',
        performance: 'Performance',
        improvement: 'Improvement'
    }

    const typeColors: Record<IssueType, { bg: string; text: string; border: string }> = {
        bug: { bg: 'rgba(239, 68, 68, 0.08)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.2)' },
        security: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.2)' },
        performance: { bg: 'rgba(59, 130, 246, 0.08)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.2)' },
        improvement: { bg: 'rgba(16, 185, 129, 0.08)', text: '#10b981', border: 'rgba(16, 185, 129, 0.2)' }
    }

    const severityConfig: Record<Severity, { color: string; bg: string }> = {
        critical: { color: '#ff4444', bg: 'rgba(255, 68, 68, 0.15)' },
        high: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
        medium: { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
        low: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' }
    }

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(issue.suggestion)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleOpenFile = (e: React.MouseEvent) => {
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('kalynt-open-file', {
            detail: { path: issue.path, line: issue.line }
        }))
    }

    const handleApplyFix = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsApplying(true)
        setApplyStatus('idle')
        setApplyError('')

        try {
            // Read the file
            const fileResult = await (globalThis as any).window.electronAPI?.fs.readFile(issue.path)
            if (!fileResult?.success || !fileResult.content) {
                throw new Error('Could not read file')
            }

            const lines = fileResult.content.split('\n')

            // Extract relevant code section (±30 lines around issue, or first 80 lines)
            let startLine = 0
            let endLine = Math.min(lines.length, 80)
            if (issue.line && issue.line > 0) {
                startLine = Math.max(0, issue.line - 30)
                endLine = Math.min(lines.length, issue.line + 30)
            }

            const section = lines.slice(startLine, endLine).join('\n')
            const prompt = `Fix this issue in the code.\n\nIssue: ${issue.description}\nFix: ${issue.suggestion}\n\nCode (lines ${startLine + 1}-${endLine}):\n\`\`\`\n${section}\n\`\`\`\n\nReturn ONLY the fixed code for these lines. No explanation, no markdown fences.`

            let fixedCode: string

            if (aiMode === 'offline' && loadedModelId) {
                const timeoutMs = 60000
                let timeoutId: ReturnType<typeof setTimeout> | undefined

                try {
                    const genPromise = offlineLLMService.generate([
                        { role: 'system', content: 'You are a code fixer. Output ONLY the fixed code. No explanation.' },
                        { role: 'user', content: prompt }
                    ], { temperature: 0.1, maxTokens: 1024 })

                    const timeoutPromise = new Promise<string>((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error('Fix generation timed out'))
                            offlineLLMService.cancelGeneration().catch(() => {})
                        }, timeoutMs)
                    })

                    fixedCode = await Promise.race([genPromise, timeoutPromise])
                } finally {
                    if (timeoutId) clearTimeout(timeoutId)
                }
            } else {
                const response = await aiService.chat([
                    { role: 'system', content: 'You are a code fixer. Output ONLY the fixed code. No explanation, no markdown.' },
                    { role: 'user', content: prompt }
                ], provider, { temperature: 0.1, maxTokens: 2048 })

                if (response.error) throw new Error(response.error)
                fixedCode = response.content
            }

            // Clean markdown fences if the model added them
            fixedCode = fixedCode
                .replace(/^```[\w]*\n?/, '')
                .replace(/\n?```\s*$/, '')
                .trim()

            if (!fixedCode || fixedCode.length < 5) {
                throw new Error('AI returned empty or invalid fix')
            }

            // Replace the section in the original file content
            const newLines = [...lines]
            const fixedLines = fixedCode.split('\n')
            newLines.splice(startLine, endLine - startLine, ...fixedLines)
            const fullFixedContent = newLines.join('\n')

            // Open/update the file in editor with the fixed content (marked dirty so user can review & save)
            window.dispatchEvent(new CustomEvent('kalynt-apply-fix', {
                detail: { path: issue.path, content: fullFixedContent, line: issue.line }
            }))

            setApplyStatus('success')
        } catch (err) {
            setApplyStatus('error')
            setApplyError(err instanceof Error ? err.message : 'Failed to apply fix')
        } finally {
            setIsApplying(false)
        }
    }

    const colors = typeColors[issue.type]
    const sev = severityConfig[issue.severity]

    return (
        <div
            className={`group border rounded-2xl transition-all duration-300 overflow-hidden ${isExpanded ? 'shadow-lg' : 'hover:shadow-md'}`}
            style={{
                background: 'var(--color-surface)',
                borderColor: isExpanded ? colors.text + '40' : 'var(--color-border-subtle)',
            }}
        >
            {/* Severity accent bar */}
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${sev.color}, transparent)` }} />

            {/* Header */}
            <div
                className="p-4 cursor-pointer flex items-start gap-3"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Type icon */}
                <div
                    className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                >
                    {typeIcons[issue.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Tags row */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span
                            className="text-[9px] font-black uppercase px-1.5 py-[2px] rounded"
                            style={{ background: sev.bg, color: sev.color }}
                        >
                            {issue.severity}
                        </span>
                        <span
                            className="text-[9px] font-bold uppercase px-1.5 py-[2px] rounded"
                            style={{ background: colors.bg, color: colors.text }}
                        >
                            {typeLabels[issue.type]}
                        </span>
                        <button
                            onClick={handleOpenFile}
                            className="flex items-center gap-1 text-[11px] font-medium hover:underline transition-colors"
                            style={{ color: 'var(--color-text-secondary)' }}
                            title="Open file in editor"
                        >
                            <FileCode size={10} />
                            <span className="truncate max-w-[180px]">{issue.file}</span>
                            {issue.line && <span className="opacity-60">:{issue.line}</span>}
                        </button>
                    </div>

                    {/* Description */}
                    <p
                        className={`font-semibold text-[13px] leading-snug ${isExpanded ? '' : 'line-clamp-2'}`}
                        style={{ color: 'var(--color-text)' }}
                    >
                        {issue.description}
                    </p>
                </div>

                {/* Expand chevron */}
                <div
                    className="mt-1 p-1 rounded-lg transition-all duration-200"
                    style={{
                        color: isExpanded ? colors.text : 'var(--color-text-tertiary)',
                        background: isExpanded ? colors.bg : 'transparent'
                    }}
                >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div
                    className="px-4 pb-4 border-t animate-in slide-in-from-top-2 duration-200"
                    style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                    {/* Suggestion */}
                    <div
                        className="rounded-xl p-4 mt-3 relative"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)' }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h6
                                className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                                style={{ color: colors.text }}
                            >
                                <ArrowRight size={10} /> Suggested Fix
                            </h6>
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                                style={{ color: 'var(--color-text-secondary)' }}
                                title="Copy suggestion"
                            >
                                {copied ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                            </button>
                        </div>
                        <p
                            className="text-[12px] leading-relaxed whitespace-pre-wrap font-mono"
                            style={{ color: 'var(--color-text)', opacity: 0.85 }}
                        >
                            {issue.suggestion}
                        </p>
                    </div>

                    {/* Apply status feedback */}
                    {applyStatus === 'success' && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                            <CheckCircle2 size={14} />
                            Fix applied successfully. File has been updated and opened in editor.
                        </div>
                    )}
                    {applyStatus === 'error' && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                            <AlertTriangle size={14} />
                            {applyError || 'Failed to apply fix'}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-3">
                        <button
                            onClick={handleApplyFix}
                            disabled={isApplying || applyStatus === 'success'}
                            className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: applyStatus === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-accent)',
                                color: applyStatus === 'success' ? '#10b981' : '#fff',
                            }}
                        >
                            {isApplying ? (
                                <><Loader2 size={13} className="animate-spin" /> Applying...</>
                            ) : applyStatus === 'success' ? (
                                <><CheckCircle2 size={13} /> Applied</>
                            ) : (
                                <><Wrench size={13} /> Apply Fix</>
                            )}
                        </button>
                        <button
                            onClick={handleOpenFile}
                            className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-[0.97] border hover:bg-white/5"
                            style={{
                                background: 'transparent',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)'
                            }}
                        >
                            <ExternalLink size={13} /> Open File
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
