/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYText, useAwareness } from '../hooks/useYjs'
import { usePermissions } from '../hooks/usePermissions'
import { EDITOR_MODES, EditorMode, getModeConfig } from '../config/editorModes'
import UnifiedAgentPanel from './UnifiedAgentPanel'
import WorkspaceRouter from './workspaces/WorkspaceRouter'
import { versionControlService } from '../services/versionControlService'
import { 
  ChevronDown, Sparkles, 
  Lock, Layers, Info
} from 'lucide-react'

export default function Editor() {
  const { currentSpace, userName } = useAppStore()
  const { doc, provider, synced, peerCount } = useYDoc(currentSpace?.id ?? null)
  const { text, updateText } = useYText(doc, 'editor-content')
  const { setLocalState } = useAwareness(provider)
  const { canEdit, canUseAgent } = usePermissions()

  const editorRef = useRef<HTMLDivElement>(null)
  const isLocalChange = useRef(false)
  const [currentMode, setCurrentMode] = useState<EditorMode>('general')
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [showAgentPanel, setShowAgentPanel] = useState(true)
  const [agentSidebarWidth, setAgentSidebarWidth] = useState(380)
  const [isResizingAgent, setIsResizingAgent] = useState(false)

  const modeConfig = getModeConfig(currentMode)

  // Auto-Save Management
  useEffect(() => {
    if (currentSpace && text && canEdit) {
      versionControlService.scheduleAutoSave(
        currentSpace.id,
        'local-user',
        userName,
        60000 
      )
    }
    return () => {
      if (currentSpace) {
        versionControlService.cancelAutoSave(currentSpace.id)
      }
    }
  }, [text, currentSpace, userName, canEdit])

  const handleResizeAgent = useCallback((e: MouseEvent) => {
    if (!isResizingAgent) return
    const newWidth = window.innerWidth - e.clientX
    if (newWidth > 200 && newWidth < 800) {
      setAgentSidebarWidth(newWidth)
    }
  }, [isResizingAgent])

  const stopResizingAgent = useCallback(() => {
    setIsResizingAgent(false)
  }, [])

  useEffect(() => {
    if (!isResizingAgent) return
    window.addEventListener('mousemove', handleResizeAgent)
    window.addEventListener('mouseup', stopResizingAgent)
    return () => {
      window.removeEventListener('mousemove', handleResizeAgent)
      window.removeEventListener('mouseup', stopResizingAgent)
    }
  }, [isResizingAgent, handleResizeAgent, stopResizingAgent])

  useEffect(() => {
    if (editorRef.current && !isLocalChange.current) {
      if (editorRef.current.innerText !== text) {
        editorRef.current.innerText = text
      }
    }
    isLocalChange.current = false
  }, [text])

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (!canEdit) {
      if (editorRef.current) editorRef.current.innerText = text
      return
    }

    isLocalChange.current = true
    const newText = e.currentTarget.innerText
    updateText(newText)

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      setLocalState('cursor', {
        anchor: range.startOffset, head: range.endOffset
      })
    }
  }, [updateText, setLocalState, canEdit, text])

      const wordCount = text.split(/\s+/).filter(Boolean).length
    if (currentSpace && currentSpace.category) {
    return <WorkspaceRouter space={currentSpace} />
  }

  return (
    <div className="premium-editor-container">
      <div className="editor-stage">
        <div className="editor-toolbar-premium">
          <div className="toolbar-left">
            <div className="mode-pill" onClick={() => setShowModeSelector(!showModeSelector)}>
              <div className="mode-icon-box">{modeConfig.icon}</div>
              <span className="mode-label">{modeConfig.name}</span>
              <ChevronDown size={12} className="opacity-40" />
              
              {showModeSelector && (
                <div className="mode-popover animate-reveal-up">
                  {EDITOR_MODES.map(m => (
                    <button key={m.id} className={`popover-item ${currentMode === m.id ? 'active' : ''}`} onClick={() => setCurrentMode(m.id)}>
                      <span>{m.icon}</span>
                      <div className="item-text">
                        <span className="i-name">{m.name}</span>
                        <span className="i-desc">{m.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divider-v" />
            
            <button className="btn-ghost-sm" onClick={() => updateText(text + '\n' + (modeConfig.template || ''))}>
              <Layers size={14} />
              <span>Blueprint</span>
            </button>
          </div>

          <div className="toolbar-center">
             <div className="sync-badge-premium">
                <div className={`sync-dot ${peerCount > 0 ? 'online' : ''}`} />
                <span>{peerCount > 0 ? `${peerCount} Nodes Active` : synced ? 'Local Safe' : 'Syncing...'}</span>
             </div>
          </div>

          <div className="toolbar-right">
            <button className={`btn-agent-toggle ${showAgentPanel ? 'active' : ''}`} onClick={() => setShowAgentPanel(!showAgentPanel)}>
              <Sparkles size={14} />
              <span>Agentic Intelligence</span>
            </button>
          </div>
        </div>

        <div className="editor-canvas">
          {!canEdit && (
            <div className="read-only-banner">
              <Lock size={12} />
              <span>Write Access Restricted</span>
            </div>
          )}
          <div
            ref={editorRef}
            className={`editor-surface ${!canEdit ? 'locked' : ''}`}
            contentEditable={canEdit}
            suppressContentEditableWarning
            onInput={handleInput}
            data-placeholder="Start composing intelligence..."
          />
        </div>

        <div className="editor-statusbar">
          <div className="status-item"><Info size={12} /> <span>Ln 1, Col 1</span></div>
          <div className="status-item"><span>{wordCount} Words</span></div>
          <div className="status-spacer" />
          <div className="status-item text-blue-400"><span>Encrypted Channel</span></div>
        </div>
      </div>

      {showAgentPanel && currentSpace && canUseAgent && (
        <>
          <div className={`agent-resizer-line ${isResizingAgent ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); setIsResizingAgent(true); }} />
          <div className="agent-dock" style={{ width: `${agentSidebarWidth}px` }}>
            <UnifiedAgentPanel
              workspacePath={null}
              currentFile={null}
              currentFileContent={null}
              editorMode={currentMode}
            />
          </div>
        </>
      )}

      <style>{`
        .premium-editor-container {
          flex: 1;
          display: flex;
          background: #000;
          height: 100%;
        }

        .editor-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          position: relative;
        }

        /* Toolbar */
        .editor-toolbar-premium {
          height: 52px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.01);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 12px; }

        .mode-pill {
          display: flex; align-items: center; gap: 10px;
          padding: 4px 12px 4px 6px; background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 100px;
          cursor: pointer; position: relative;
        }

        .mode-icon-box {
          width: 24px; height: 24px; border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          display: flex; align-items: center; justify-content: center; font-size: 14px;
        }

        .mode-label { font-size: 12px; font-weight: 700; color: white; }

        .mode-popover {
          position: absolute; top: calc(100% + 8px); left: 0;
          width: 260px; background: #0a0a0a; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px; padding: 8px; z-index: 1000;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        }

        .popover-item {
          width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 10px; border-radius: 10px; text-align: left;
          transition: all 0.2s;
        }
        .popover-item:hover { background: rgba(255, 255, 255, 0.05); }
        .popover-item.active { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }

        .i-name { display: block; font-size: 13px; font-weight: 700; }
        .i-desc { font-size: 10px; color: rgba(255, 255, 255, 0.3); }

        .divider-v { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.06); }

        .sync-badge-premium {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 12px; background: rgba(255, 255, 255, 0.02);
          border-radius: 100px; font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.4);
        }

        .sync-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); }
        .sync-dot.online { background: #10b981; box-shadow: 0 0 8px #10b981; }

        .btn-agent-toggle {
          display: flex; align-items: center; gap: 8px;
          padding: 0 16px; height: 32px; background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 100px;
          color: #3b82f6; font-size: 11px; font-weight: 800; text-transform: uppercase;
        }
        .btn-agent-toggle.active { background: #3b82f6; color: white; }

        /* Canvas */
        .editor-canvas {
          flex: 1; padding: 40px; overflow-y: auto; display: flex; flex-direction: column; align-items: center;
        }

        .editor-surface {
          width: 100%; max-width: 800px; min-height: 100%;
          font-size: 16px; line-height: 1.8; color: rgba(255, 255, 255, 0.8);
          outline: none; white-space: pre-wrap;
        }

        .editor-surface:empty::before { content: attr(data-placeholder); color: rgba(255, 255, 255, 0.1); }

        .read-only-banner {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 16px; background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px;
          color: #f59e0b; font-size: 11px; font-weight: 700; margin-bottom: 32px;
        }

        /* Footer */
        .editor-statusbar {
          height: 36px; padding: 0 24px; display: flex; align-items: center; gap: 24px;
          background: rgba(255, 255, 255, 0.01); border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .status-item { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 800; color: rgba(255, 255, 255, 0.3); text-transform: uppercase; }
        .status-spacer { flex: 1; }

        /* Resizer */
        .agent-dock { border-left: 1px solid rgba(255, 255, 255, 0.05); overflow: hidden; }
        .agent-resizer-line { width: 4px; cursor: col-resize; background: transparent; transition: all 0.3s; z-index: 100; margin-left: -2px; }
        .agent-resizer-line:hover, .agent-resizer-line.active { background: #3b82f6; box-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
      `}</style>
    </div>
  )
}
