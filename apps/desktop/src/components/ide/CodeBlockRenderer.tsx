/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, Zap } from 'lucide-react'

interface CodeBlockProps {
    code: string
    language: string
    onApply?: (code: string) => void
    onCopy?: (code: string) => void
}

export default function CodeBlockRenderer({
    code,
    language,
    onApply,
    onCopy
}: CodeBlockProps) {
    const { theme } = useAppStore()
    const [copied, setCopied] = useState(false)
    const [applied, setApplied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            onCopy?.(code)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const handleApply = () => {
        onApply?.(code)
        setApplied(true)
        setTimeout(() => setApplied(false), 2000)
    }

    return (
        <div className="code-block">
            <div className="code-header">
                <span className="code-language">{language || 'code'}</span>
                <div className="code-actions">
                    <button
                        className={`code-action ${copied ? 'success' : ''}`}
                        onClick={handleCopy}
                        title="Copy code"
                    >
                        {copied ? <span className="flex items-center gap-1"><Check size={12} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={12} /> Copy</span>}
                    </button>
                    {onApply && (
                        <button
                            className={`code-action apply ${applied ? 'success' : ''}`}
                            onClick={handleApply}
                            title="Apply to editor"
                        >
                            {applied ? <span className="flex items-center gap-1"><Check size={12} /> Applied</span> : <span className="flex items-center gap-1"><Zap size={12} /> Apply</span>}
                        </button>
                    )}
                </div>
            </div>

            {/* SECURITY FIX: Replace dangerouslySetInnerHTML with react-syntax-highlighter */}
            <SyntaxHighlighter
                language={language || 'typescript'}
                style={theme === 'light' ? prism : vscDarkPlus}
                customStyle={{
                    margin: 0,
                    padding: '12px 16px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    background: theme === 'light' ? '#f8f8f8' : '#1a1a1a',
                    borderRadius: '0 0 8px 8px'
                }}
                codeTagProps={{
                    style: {
                        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace"
                    }
                }}
            >
                {code}
            </SyntaxHighlighter>

            <style>{`
        .code-block {
          margin: 8px 0;
          border-radius: 8px;
          overflow: hidden;
          background: ${theme === 'light' ? '#f8f8f8' : '#1a1a1a'};
          border: 1px solid var(--color-border);
        }

        .code-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          background: var(--color-surface-subtle);
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .code-language {
          font-size: 11px;
          font-weight: 500;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .code-actions {
          display: flex;
          gap: 4px;
        }

        .code-action {
          padding: 3px 8px;
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          color: var(--color-text-tertiary);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
        }

        .code-action:hover {
          background: var(--color-glass);
          color: var(--color-text);
        }

        .code-action.apply {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        .code-action.apply:hover {
          background: var(--color-accent);
          color: var(--color-bg);
        }

        .code-action.success {
          background: #1d6e3f;
          border-color: #1d6e3f;
          color: white;
        }
      `}</style>
        </div>
    )
}

// Helper to parse code blocks from markdown
export function parseCodeBlocks(text: string): Array<{ type: 'text' | 'code', content: string, language?: string }> {
    const parts: Array<{ type: 'text' | 'code', content: string, language?: string }> = []
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g

    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(text)) !== null) {
        // Add text before code block
        if (match.index > lastIndex) {
            const textBefore = text.slice(lastIndex, match.index).trim()
            if (textBefore) {
                parts.push({ type: 'text', content: textBefore })
            }
        }

        // Add code block
        parts.push({
            type: 'code',
            content: match[2].trim(),
            language: match[1] || 'typescript'
        })

        lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex).trim()
        if (remaining) {
            parts.push({ type: 'text', content: remaining })
        }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}
