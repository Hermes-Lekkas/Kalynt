/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useRef, useEffect } from 'react'
import { aiService } from '../../services/aiService'
import { Sparkles, X, ArrowRight, Check } from 'lucide-react'

interface InlineEditWidgetProps {
  visible: boolean
  selectedCode: string
  filePath: string
  language: string
  position: { top: number; left: number }
  onApply: (newCode: string) => void
  onCancel: () => void
}

export default function InlineEditWidget({
  visible,
  selectedCode,
  filePath: _filePath,
  language,
  position,
  onApply,
  onCancel
}: InlineEditWidgetProps) {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [visible])

  // Reset state when widget opens
  useEffect(() => {
    if (visible) {
      setPrompt('')
      setGeneratedCode(null)
      setError(null)
      setShowDiff(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return

    setIsLoading(true)
    setError(null)
    setGeneratedCode(null)

    try {
      const systemPrompt = `You are an expert code editor. When given code and an instruction, you return ONLY the modified code without any explanations.
Rules:
- Return ONLY the code, no markdown fences, no explanations
- Preserve indentation and formatting
- Do not add comments unless explicitly asked
- If the instruction is unclear, make a reasonable interpretation`

      const userMessage = `Here is the code to modify:
\`\`\`${language}
${selectedCode}
\`\`\`

Instruction: ${prompt}

Return ONLY the modified code:`

      const response = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ])

      if (response.content) {
        // Clean the response - remove markdown fences if present
        let code = response.content.trim()
        const fenceMatch = code.match(/^```[\w]*\n?([\s\S]*?)\n?```$/m)
        if (fenceMatch) {
          code = fenceMatch[1].trim()
        }
        setGeneratedCode(code)
        setShowDiff(true)
      } else {
        setError('No response from AI')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showDiff && generatedCode) {
        onApply(generatedCode)
      } else {
        handleSubmit()
      }
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!visible) return null

  return (
    <div
      className="inline-edit-widget"
      style={{ top: position.top, left: position.left }}
    >
      <div className="widget-header">
        <span className="widget-icon"><Sparkles size={14} /></span>
        <span className="widget-title">AI Edit</span>
        <button className="widget-close" onClick={onCancel}><X size={14} /></button>
      </div>

      {!showDiff ? (
        <>
          <div className="widget-input-container">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the change..."
              disabled={isLoading}
              className="widget-input"
            />
            <button
              className="widget-submit"
              onClick={handleSubmit}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? '...' : <ArrowRight size={14} />}
            </button>
          </div>

          <div className="widget-hints">
            <span className="hint">Enter to submit</span>
            <span className="hint">Esc to cancel</span>
          </div>
        </>
      ) : (
        <div className="widget-diff">
          <div className="diff-header">
            <span>Preview Changes</span>
            <div className="diff-actions">
              <button
                className="diff-btn reject"
                onClick={() => {
                  setShowDiff(false)
                  setGeneratedCode(null)
                }}
              >
                <X size={12} /> Reject
              </button>
              <button
                className="diff-btn accept"
                onClick={() => generatedCode && onApply(generatedCode)}
              >
                <Check size={12} /> Accept
              </button>
            </div>
          </div>

          <div className="diff-content">
            <div className="diff-section removed">
              <div className="diff-label">- Original</div>
              <pre className="diff-code">{selectedCode}</pre>
            </div>
            <div className="diff-section added">
              <div className="diff-label">+ Modified</div>
              <pre className="diff-code">{generatedCode}</pre>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="widget-error">{error}</div>
      )}

      <style>{`
        .inline-edit-widget {
          position: fixed;
          z-index: 1000;
          min-width: 400px;
          max-width: 600px;
          background: var(--color-surface, #252526);
          border: 1px solid var(--color-accent, #0e639c);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .widget-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--color-accent, #0e639c);
          color: white;
        }

        .widget-icon {
          font-size: 14px;
          display: flex;
          align-items: center;
        }

        .widget-title {
          flex: 1;
          font-size: 12px;
          font-weight: 600;
        }

        .widget-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          opacity: 0.7;
          font-size: 14px;
          display: flex;
          align-items: center;
        }

        .widget-close:hover {
          opacity: 1;
        }

        .widget-input-container {
          display: flex;
          padding: 12px;
          gap: 8px;
        }

        .widget-input {
          flex: 1;
          padding: 8px 12px;
          background: var(--color-bg, #1e1e1e);
          border: 1px solid var(--color-border, #3c3c3c);
          border-radius: 4px;
          color: var(--color-text, #ccc);
          font-size: 13px;
        }

        .widget-input:focus {
          border-color: var(--color-accent, #0e639c);
          outline: none;
        }

        .widget-input:disabled {
          opacity: 0.6;
        }

        .widget-submit {
          padding: 8px 16px;
          background: var(--color-accent, #0e639c);
          border: none;
          border-radius: 4px;
          color: white;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .widget-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .widget-hints {
          display: flex;
          gap: 12px;
          padding: 0 12px 8px;
        }

        .hint {
          font-size: 11px;
          color: var(--color-text-muted, #888);
        }

        .widget-diff {
          padding: 12px;
        }

        .diff-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text, #ccc);
        }

        .diff-actions {
          display: flex;
          gap: 8px;
        }

        .diff-btn {
          padding: 4px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .diff-btn.reject {
          background: #6e1d1d;
          color: white;
        }

        .diff-btn.accept {
          background: #1d6e3f;
          color: white;
        }

        .diff-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .diff-section {
          border-radius: 4px;
          overflow: hidden;
        }

        .diff-section.removed {
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid rgba(244, 67, 54, 0.3);
        }

        .diff-section.added {
          background: rgba(76, 175, 80, 0.1);
          border: 1px solid rgba(76, 175, 80, 0.3);
        }

        .diff-label {
          padding: 4px 8px;
          font-size: 11px;
          font-family: monospace;
        }

        .diff-section.removed .diff-label {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
        }

        .diff-section.added .diff-label {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }

        .diff-code {
          margin: 0;
          padding: 8px 12px;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--color-text, #ccc);
        }

        .widget-error {
          padding: 8px 12px;
          background: rgba(244, 67, 54, 0.1);
          color: #f44336;
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}
