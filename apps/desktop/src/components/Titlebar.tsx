/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { EncryptionBadge } from '../hooks/useEncryption'
import { Package, Minimize, Square, X, Puzzle, Home, Activity, Code2, FolderTree, History } from 'lucide-react'
import PluginsPanel from './PluginsPanel'
import UpdateButton from './UpdateButton'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface TitlebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onShowExtensions?: () => void
}

export default function Titlebar({ activeTab, onTabChange, onShowExtensions }: TitlebarProps) {
  const { version, connectedPeers, apiKeys, currentSpace } = useAppStore()
  const [showPlugins, setShowPlugins] = useState(false)

  const configuredProviders = Object.keys(apiKeys).filter(k => apiKeys[k as keyof typeof apiKeys])

  // Parse version info
  const versionDisplay = useMemo(() => {
    const parts = version.split(' ')
    return {
      num: parts[0] || 'v1.0',
      label: parts[1] || 'beta'
    }
  }, [version])

  const handleMinimize = () => {
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
        <div className="app-branding">
           <span className="app-name">Kalynt</span>
           <div className="version-pill">
              <span className="v-num">{versionDisplay.num}</span>
              <span className="v-label">{versionDisplay.label}</span>
           </div>
        </div>
        
        <div className="tabs-divider" />
        
        <nav className="tabs">
          {!currentSpace ? (
            <TabButton active={true} onClick={() => {}} icon={<Home size={14} />}>
              Get Started
            </TabButton>
          ) : (
            <>
              <TabButton active={activeTab === 'editor'} onClick={() => onTabChange('editor')} icon={<Code2 size={14} />}>
                Editor
              </TabButton>
              <TabButton active={activeTab === 'tasks'} onClick={() => onTabChange('tasks')} icon={<Activity size={14} />}>
                Tasks
              </TabButton>
              <TabButton active={activeTab === 'history'} onClick={() => onTabChange('history')} icon={<History size={14} />}>
                History
              </TabButton>
              <TabButton active={activeTab === 'files'} onClick={() => onTabChange('files')} icon={<FolderTree size={14} />}>
                Files
              </TabButton>
            </>
          )}
        </nav>
      </div>

      <div className="titlebar-center" />

      <div className="titlebar-right no-drag">
        <div className="utility-actions">
          <button className="plugins-btn" onClick={() => setShowPlugins(true)} title="Language Plugins">
            <Package size={16} />
          </button>
          <button className="extensions-btn" onClick={onShowExtensions} title="Extensions (Ctrl+Shift+X)">
            <Puzzle size={16} />
          </button>
        </div>
        
        {currentSpace && <EncryptionBadge showDetails={false} />}
        
        <div className="status-group">
           <div className="status-item api-status" title={`${configuredProviders.length} AI Providers`}>
             <span className={`status-dot ${configuredProviders.length > 0 ? 'status-online' : 'status-away'}`} />
             <span>{configuredProviders.length} AI</span>
           </div>
           
           <div className="status-item connection-status" title={`${connectedPeers.length + 1} Total Peers`}>
             <span className={`status-dot ${connectedPeers.length > 0 ? 'status-online' : 'status-offline'}`} />
             <span>{connectedPeers.length + 1} P2P</span>
           </div>
        </div>

        <UpdateButton />

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
          padding: 0 16px;
          background: rgba(10, 10, 12, 0.85);
          backdrop-filter: blur(32px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 10000;
          position: relative;
        }
        
        .titlebar-left {
          display: flex;
          align-items: center;
          height: 100%;
          min-width: 0;
        }

        .app-branding {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .app-name {
          font-size: 15px;
          font-weight: 950;
          color: white;
          letter-spacing: -0.03em;
        }

        .version-pill {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          overflow: hidden;
          font-size: 10px;
          font-weight: 800;
          height: 20px;
        }

        .v-num {
          padding: 0 6px;
          color: rgba(255, 255, 255, 0.6);
        }

        .v-label {
          padding: 0 6px;
          background: var(--color-accent);
          color: white;
          text-transform: uppercase;
          height: 100%;
          display: flex;
          align-items: center;
        }

        .tabs-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 16px;
          flex-shrink: 0;
        }

        .tabs {
          display: flex;
          gap: 6px;
          padding: 3px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          min-width: 0;
        }
        
        .titlebar-center {
          flex: 1;
          height: 100%;
          min-width: 20px;
        }

        .titlebar-right {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }

        .utility-actions {
          display: flex;
          gap: 4px;
        }

        .status-group {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(255, 255, 255, 0.03);
          padding: 3px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.4);
          padding: 4px 10px;
          border-radius: 8px;
          transition: all 0.2s;
          cursor: default;
          white-space: nowrap;
        }

        .status-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }

        .plugins-btn, .extensions-btn {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: rgba(255, 255, 255, 0.4);
          border-radius: 10px;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }

        .plugins-btn:hover, .extensions-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: white;
        }

        .window-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 8px;
        }

        .window-control-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          position: relative;
          cursor: default;
        }

        .window-control-btn svg {
          opacity: 0;
          width: 8px;
          height: 8px;
          color: rgba(0, 0, 0, 0.5);
        }

        .window-controls:hover .window-control-btn svg {
          opacity: 1;
        }

        .close-btn { background: #FF5F56; box-shadow: inset 0 0 2px rgba(0,0,0,0.2); }
        .minimize-btn { background: #FFBD2E; box-shadow: inset 0 0 2px rgba(0,0,0,0.2); }
        .maximize-btn { background: #27C93F; box-shadow: inset 0 0 2px rgba(0,0,0,0.2); }
      `}</style>
    </header>
  )
}

interface TabButtonProps {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}

function TabButton({ children, active, onClick, icon }: TabButtonProps) {
  return (
    <button className={`tab-btn ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{children}</span>
      <style>{`
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.4);
          background: transparent;
          border-radius: 9px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          border: none;
          cursor: pointer;
          line-height: 1;
        }
        
        .tab-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }
        
        .tab-btn.active {
          color: white;
          background: rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </button>
  )
}
