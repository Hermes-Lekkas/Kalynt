/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { EncryptionBadge } from '../hooks/useEncryption'
import { Package, Minimize, Square, X, Puzzle } from 'lucide-react'
import PluginsPanel from './PluginsPanel'
import UpdateButton from './UpdateButton'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface TitlebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onShowExtensions?: () => void
}

export default function Titlebar({ activeTab, onTabChange, onShowExtensions }: TitlebarProps) {
  const { version, connectedPeers, apiKeys } = useAppStore()
  const [showPlugins, setShowPlugins] = useState(false)

  const configuredProviders = Object.keys(apiKeys).filter(k => apiKeys[k as keyof typeof apiKeys])

  const handleMinimize = () => {
    // Trigger the animation in App.tsx
    window.dispatchEvent(new Event('kalynt-minimize'))
  }

  const handleMaximize = () => {
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow()
    }
  }

  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow()
    }
  }

  return (
    <header className="titlebar drag-region">
      <div className="titlebar-left no-drag">
        <span className="app-name">Kalynt</span>
        <span className="version">{version}</span>
        <div className="tabs-divider" />
        <nav className="tabs">
          <TabButton active={activeTab === 'editor'} onClick={() => onTabChange('editor')}>
            Editor
          </TabButton>
          <TabButton active={activeTab === 'tasks'} onClick={() => onTabChange('tasks')}>
            Tasks
          </TabButton>
          <TabButton active={activeTab === 'history'} onClick={() => onTabChange('history')}>
            History
          </TabButton>
          <TabButton active={activeTab === 'files'} onClick={() => onTabChange('files')}>
            Files
          </TabButton>
        </nav>
      </div>

      <div className="titlebar-center" />

      <div className="titlebar-right no-drag">
        <button className="plugins-btn" onClick={() => setShowPlugins(true)} title="Language Plugins">
          <Package size={16} />
        </button>
        <button className="extensions-btn" onClick={onShowExtensions} title="Extensions (Ctrl+Shift+X)">
          <Puzzle size={16} />
        </button>
        <EncryptionBadge showDetails={false} />
        <div className="api-status">
          <span className={`status-dot ${configuredProviders.length > 0 ? 'status-online' : 'status-away'}`} />
          <span>{configuredProviders.length > 0 ? `${configuredProviders.length} API key${configuredProviders.length > 1 ? 's' : ''}` : 'No API keys'}</span>
        </div>
        <UpdateButton />
        <div className="connection-status">
          <span className={`status-dot ${connectedPeers.length > 0 ? 'status-online' : 'status-offline'}`} />
          <span>{connectedPeers.length + 1} connected</span>
        </div>

        <div className="window-controls">
          <button className="window-control-btn close-btn" onClick={handleClose} title="Close">
            <X size={14} />
          </button>
          <button className="window-control-btn minimize-btn" onClick={handleMinimize} title="Minimize">
            <Minimize size={14} />
          </button>
          <button className="window-control-btn maximize-btn" onClick={handleMaximize} title="Maximize">
            <Square size={14} />
          </button>
        </div>
      </div>

      {showPlugins && <PluginsPanel onClose={() => setShowPlugins(false)} />}

      <style>{`
        .titlebar {
          height: var(--header-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          background: var(--color-glass);
          backdrop-filter: blur(var(--backdrop-blur));
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .drag-region {
          -webkit-app-region: drag;
        }

        .no-drag {
          -webkit-app-region: no-drag;
        }
        
        .titlebar-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        
        .app-name {
          font-size: var(--text-sm);
          font-weight: var(--font-bold);
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-middle));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.03em;
        }
        
        .version {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          padding: 2px 8px;
          background: var(--color-surface);
          border-radius: var(--radius-pill);
        }

        .tabs-divider {
          width: 1px;
          height: 18px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 var(--space-1);
        }

        .tabs {
          display: flex;
          gap: 4px;
        }
        
        .titlebar-center {
          flex: 1;
        }
        
        .titlebar-right {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .plugins-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-glass);
          color: var(--color-text-secondary);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--transition-base);
        }

        .plugins-btn:hover {
          background: var(--color-glass-hover);
          color: var(--color-accent);
          border-color: var(--color-accent);
          transform: translateY(-1px);
          box-shadow: var(--shadow-glow);
        }

        .api-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          padding: 4px 10px;
          background: var(--color-glass);
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .tier-badge {
          padding: 4px 12px;
          border-radius: var(--radius-pill);
          background: var(--color-glass);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all var(--transition-base);
        }

        .tier-badge:hover {
          border-color: var(--color-accent);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
        }
        
        .tier-name {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
        }
        
        .tier-name.beta { 
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-middle));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          padding: 4px 10px;
          background: var(--color-glass);
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all var(--transition-base);
        }

        .connection-status:hover {
          border-color: var(--color-accent);
        }

        /* macOS Traffic Lights */
        .window-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 10px;
          padding-right: 12px;
          -webkit-app-region: no-drag;
        }

        .window-control-btn {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          color: transparent;
          transition: all 0.1s ease;
          position: relative;
          overflow: hidden;
        }

        .window-control-btn svg {
          opacity: 0;
          width: 10px;
          height: 10px;
          transition: opacity 0.1s ease;
          color: rgba(0, 0, 0, 0.5);
        }

        /* Show icons on hover of the container */
        .window-controls:hover .window-control-btn svg {
          opacity: 1;
        }

        /* Traffic Light Colors */
        .close-btn {
          background-color: #FF5F56;
          border: 1px solid #E0443E;
        }
        
        .close-btn:active {
          background-color: #BF4C45;
        }

        .minimize-btn {
          background-color: #FFBD2E;
          border: 1px solid #DEA123;
        }

        .minimize-btn:active {
          background-color: #BF8E22;
        }

        .maximize-btn {
          background-color: #27C93F;
          border: 1px solid #1AAB29;
        }

        .maximize-btn:active {
          background-color: #1D9730;
        }
      `}</style>
    </header>
  )
}

interface TabButtonProps {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}

function TabButton({ children, active, onClick }: TabButtonProps) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
      <style>{`
        .tab {
          padding: 4px 12px;
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: transparent;
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          font-weight: var(--font-medium);
        }
        
        .tab:hover {
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.05);
        }
        
        .tab.active {
          color: var(--color-text);
          background: var(--color-surface);
        }
      `}</style>
    </button>
  )
}
