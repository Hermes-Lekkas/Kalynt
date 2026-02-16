/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYText, useAwareness } from '../hooks/useYjs'
import { usePermissions } from '../hooks/usePermissions'
import { EDITOR_MODES, EditorMode, getModeConfig } from '../config/editorModes'
import UnifiedAgentPanel from './UnifiedAgentPanel'
import { EncryptionBadge } from '../hooks/useEncryption'
import WorkspaceRouter from './workspaces/WorkspaceRouter'

export default function Editor() {
  const { currentSpace } = useAppStore()
  const { doc, provider, synced, peerCount } = useYDoc(currentSpace?.id ?? null)
  const { text, updateText } = useYText(doc, 'editor-content')
  const { users, setLocalState, localClientId } = useAwareness(provider)
  const { canEdit, canUseAgent } = usePermissions()

  const editorRef = useRef<HTMLDivElement>(null)
  const isLocalChange = useRef(false)
  const [currentMode, setCurrentMode] = useState<EditorMode>('general')
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [showAgentPanel, setShowAgentPanel] = useState(true)
  const [agentSidebarWidth, setAgentSidebarWidth] = useState(360)
  const [isResizingAgent, setIsResizingAgent] = useState(false)

  const modeConfig = getModeConfig(currentMode)

  const handleResizeAgent = useCallback((e: MouseEvent) => {
    if (!isResizingAgent) return
    const newWidth = window.innerWidth - e.clientX
    if (newWidth > 200 && newWidth < 600) {
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

  // Sync content from Yjs to editor
  useEffect(() => {
    if (editorRef.current && !isLocalChange.current) {
      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null

      if (editorRef.current.innerText !== text) {
        editorRef.current.innerText = text
      }

      if (range && selection) {
        try {
          selection.addRange(range)
        } catch (e) {
          console.debug('[Editor] Failed to restore selection:', e)
        }
      }
    }
    isLocalChange.current = false
  }, [text])

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    // Block edits if user doesn't have permission
    if (!canEdit) {
      // Revert the change
      if (editorRef.current) {
        editorRef.current.innerText = text
      }
      console.warn('[Editor] Edit blocked - no permission')
      return
    }

    isLocalChange.current = true
    const newText = e.currentTarget.innerText
    updateText(newText)

    // Update cursor position in awareness
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      setLocalState('cursor', {
        anchor: range.startOffset,
        head: range.endOffset
      })
    }
  }, [updateText, setLocalState, canEdit, text])

  const applyTemplate = () => {
    if (modeConfig.template && !text.trim()) {
      updateText(modeConfig.template)
    } else if (modeConfig.template) {
      if (confirm('Apply template? This will append to your current content.')) {
        updateText(text + '\n\n' + modeConfig.template)
      }
    }
  }

  const getCursorInfo = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const textBefore = text.substring(0, selection.getRangeAt(0).startOffset)
      const linesBefore = textBefore.split('\n')
      return {
        line: linesBefore.length,
        col: (linesBefore[linesBefore.length - 1]?.length || 0) + 1
      }
    }
    return { line: 1, col: 1 }
  }

  const cursorInfo = getCursorInfo()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  const remoteUsers = Array.from(users.entries())
    .filter(([id]) => id !== localClientId)
    .map(([id, state]) => ({
      id,
      name: state?.user?.name || 'Anonymous',
      color: state?.user?.color || '#888'
    }))

  if (currentSpace && currentSpace.category) {
    return <WorkspaceRouter space={currentSpace} />
  }

  return (
    <div className="editor-container">
      <div className="editor">
        <div className="editor-toolbar">
          {/* Mode Selector */}
          <div className="mode-selector-container">
            <button
              className="mode-selector-btn"
              onClick={() => setShowModeSelector(!showModeSelector)}
            >
              <span className="mode-icon">{modeConfig.icon}</span>
              <span className="mode-name">{modeConfig.name}</span>
              <span className="dropdown-arrow">â–¾</span>
            </button>

            {showModeSelector && (
              <div className="mode-dropdown">
                {EDITOR_MODES.map(mode => (
                  <button
                    key={mode.id}
                    className={`mode-option ${currentMode === mode.id ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentMode(mode.id)
                      setShowModeSelector(false)
                    }}
                  >
                    <span className="mode-icon">{mode.icon}</span>
                    <div className="mode-info">
                      <span className="mode-name">{mode.name}</span>
                      <span className="mode-desc">{mode.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="toolbar-btn template-btn"
            onClick={applyTemplate}
            title="Apply mode template"
            disabled={!modeConfig.template}
          >
            ðŸ“‹ Template
          </button>

          <div className="toolbar-divider" />

          <button
            className={`toolbar-btn agent-toggle ${showAgentPanel ? 'active' : ''}`}
            onClick={() => setShowAgentPanel(!showAgentPanel)}
            title="Toggle AI Agent panel"
          >
            ðŸ¤– Agent
          </button>

          <div className="toolbar-spacer" />

          <EncryptionBadge showDetails={false} />

          <div className="sync-status">
            <span className={`status-dot ${peerCount > 0 ? 'status-online' : 'status-offline'}`} />
            <span>
              {peerCount > 0 ? `${peerCount} peer${peerCount > 1 ? 's' : ''}` : synced ? 'Saved' : 'Syncing...'}
            </span>
          </div>

          {remoteUsers.length > 0 && (
            <div className="remote-users">
              {remoteUsers.map(user => (
                <div key={user.id} className="user-badge" style={{ background: user.color }}>
                  {user.name[0]}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="editor-body">
          {!canEdit && (
            <div className="permission-notice">
              ðŸ”’ View Only - You don&apos;t have permission to edit
            </div>
          )}

          {/* Generic Text Editor Fallback */}
          <div
            ref={editorRef}
            className={`editor-content ${!canEdit ? 'read-only' : ''}`}
            contentEditable={canEdit}
            suppressContentEditableWarning
            onInput={handleInput}
            data-placeholder={modeConfig.placeholder}
          />

        </div>

        <div className="editor-footer">
          <span className="mode-badge">{modeConfig.icon} {modeConfig.name}</span>
          {!canEdit && <span className="permission-badge">ðŸ‘ï¸ Read Only</span>}
          <span>Ln {cursorInfo.line}, Col {cursorInfo.col}</span>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
        </div>
      </div>

      {showAgentPanel && currentSpace && canUseAgent && (
        <>
          <div
            className={`agent-resizer ${isResizingAgent ? 'resizing' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingAgent(true)
            }}
          />
          <div className="agent-sidebar" style={{ width: `${agentSidebarWidth}px` }}>
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
        .editor-container {
          height: 100%;
          display: flex;
          gap: var(--space-3);
        }
        
        .editor {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--color-bg);
          min-width: 0;
        }
        
        .agent-sidebar {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--color-border-subtle);
          overflow: hidden;
        }
        
        .agent-resizer {
          width: 4px;
          background: transparent;
          cursor: col-resize;
          transition: background 0.2s;
          z-index: 10;
          flex-shrink: 0;
          margin-left: -4px;
        }

        .agent-resizer:hover,
        .agent-resizer.resizing {
          background: var(--color-accent);
          box-shadow: 0 0 8px var(--color-accent);
        }
        
        .agent-mode-toggle {
          display: flex;
          padding: var(--space-2);
          gap: var(--space-1);
          border-bottom: 1px solid var(--color-border-subtle);
          background: var(--color-surface);
        }
        
        .mode-tab {
          flex: 1;
          padding: var(--space-2);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
          background: transparent;
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }
        
        .mode-tab:hover {
          color: var(--color-text);
          background: var(--color-surface-elevated);
        }
        
        .mode-tab.active {
          color: var(--color-text);
          background: var(--color-surface-elevated);
        }
        
        .editor-toolbar {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border-bottom: 1px solid var(--color-border-subtle);
        }
        
        .mode-selector-container {
          position: relative;
        }
        
        .mode-selector-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-text);
          transition: all var(--transition-fast);
        }
        
        .mode-selector-btn:hover {
          border-color: var(--color-border-hover);
        }
        
        .dropdown-arrow {
          font-size: 10px;
          color: var(--color-text-muted);
        }
        
        .mode-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: var(--space-1);
          width: 240px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-2);
          z-index: 100;
          box-shadow: var(--shadow-lg);
        }
        
        .mode-option {
          width: 100%;
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          border-radius: var(--radius-md);
          transition: background var(--transition-fast);
        }
        
        .mode-option:hover {
          background: var(--color-surface-elevated);
        }
        
        .mode-option.active {
          background: var(--color-surface-elevated);
        }
        
        .mode-option .mode-icon {
          font-size: 18px;
        }
        
        .mode-option .mode-info {
          display: flex;
          flex-direction: column;
          text-align: left;
        }
        
        .mode-option .mode-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }
        
        .mode-option .mode-desc {
          font-size: 10px;
          color: var(--color-text-muted);
        }
        
        .toolbar-btn {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }
        
        .toolbar-btn:hover:not(:disabled) {
          background: var(--color-surface);
        }
        
        .toolbar-btn:disabled {
          opacity: 0.5;
        }
        
        .toolbar-btn.active {
          background: var(--color-surface);
          color: var(--color-accent);
        }
        
        .toolbar-divider {
          width: 1px;
          height: 24px;
          background: var(--color-border-subtle);
          margin: 0 var(--space-1);
        }
        
        .toolbar-spacer {
          flex: 1;
        }
        
        .sync-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }
        
        .remote-users {
          display: flex;
          gap: 4px;
          margin-left: var(--space-2);
        }
        
        .user-badge {
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: var(--font-semibold);
          color: white;
        }
        
        .editor-body {
          flex: 1;
          overflow: auto;
          padding: var(--space-6);
        }
        
        .editor-content {
          max-width: 720px;
          margin: 0 auto;
          min-height: 100%;
          font-size: var(--text-base);
          line-height: 1.75;
          color: var(--color-text);
          outline: none;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        
        .editor-content:empty::before {
          content: attr(data-placeholder);
          color: var(--color-text-muted);
          pointer-events: none;
        }
        
        .editor-footer {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-2) var(--space-4);
          border-top: 1px solid var(--color-border-subtle);
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--color-text-muted);
        }
        
        .mode-badge {
          padding: 2px 8px;
          background: var(--color-surface);
          border-radius: var(--radius-sm);
          font-family: var(--font-sans);
        }
        
        .permission-notice {
          padding: var(--space-2) var(--space-4);
          background: var(--color-warning);
          color: var(--color-bg);
          font-size: var(--text-sm);
          text-align: center;
          border-radius: var(--radius-md);
          margin-bottom: var(--space-3);
        }
        
        .editor-content.read-only {
          opacity: 0.7;
          cursor: not-allowed;
          user-select: text;
        }
        
        .permission-badge {
          padding: 2px 8px;
          background: var(--color-warning);
          color: var(--color-bg);
          border-radius: var(--radius-sm);
          font-family: var(--font-sans);
          font-weight: var(--font-medium);
        }
      `}</style>
    </div>
  )
}
