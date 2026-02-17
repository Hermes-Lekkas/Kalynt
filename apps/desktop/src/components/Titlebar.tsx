/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { EncryptionBadge } from '../hooks/useEncryption'
import { 
  Search, Puzzle, Home, Activity, Code2, 
  FolderTree, History, Settings, Command,
  Minimize, Square, X, Sparkles, Globe, Users
} from 'lucide-react'
import PluginsPanel from './PluginsPanel'
import UpdateButton from './UpdateButton'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface TitlebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onShowExtensions?: () => void
  onShowCollaboration?: () => void
}

export default function Titlebar({ activeTab, onTabChange, onShowCollaboration }: TitlebarProps) {
  const { connectedPeers, apiKeys, currentSpace, setShowSettings } = useAppStore()
  const [showPlugins, setShowPlugins] = useState(false)

  const configuredProviders = Object.keys(apiKeys).filter(k => (apiKeys as any)[k])

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
      {/* Left Section: Branding & Navigation */}
      <div className="titlebar-left no-drag">
        <div className="app-identity">
          <img src="/Kalynt.png" alt="Kalynt" className="app-icon-top" />
          <span className="app-name">Kalynt</span>
        </div>

        <nav className="tab-nav">
          {!currentSpace ? (
            <button className="tab-item active">
              <Home size={14} />
              <span>Welcome</span>
            </button>
          ) : (
            <div className="nav-group-container">
              <div 
                className="active-highlight" 
                style={{
                  width: 'calc((100% - 6px) / 4)',
                  transform: `translateX(calc(100% * ${
                    activeTab === 'editor' ? 0 : 
                    activeTab === 'tasks' ? 1 : 
                    activeTab === 'history' ? 2 : 3
                  }))`
                }}
              />
              <TabItem 
                active={activeTab === 'editor'} 
                onClick={() => onTabChange('editor')} 
                icon={<Code2 size={14} />} 
                label="Editor" 
              />
              <TabItem 
                active={activeTab === 'tasks'} 
                onClick={() => onTabChange('tasks')} 
                icon={<Activity size={14} />} 
                label="Tasks" 
              />
              <TabItem 
                active={activeTab === 'history'} 
                onClick={() => onTabChange('history')} 
                icon={<History size={14} />} 
                label="History" 
              />
              <TabItem 
                active={activeTab === 'files'} 
                onClick={() => onTabChange('files')} 
                icon={<FolderTree size={14} />} 
                label="Files" 
              />
            </div>
          )}
        </nav>
      </div>

      {/* Center Section: Search/Command Palette trigger */}
      <div className="titlebar-center no-drag">
        <button className="omnibar-trigger" onClick={() => window.dispatchEvent(new Event('kalynt-command-palette'))}>
          <Search size={14} className="opacity-40" />
          <span>Quick search...</span>
          <div className="kbt-shortcut">
            <Command size={10} /> K
          </div>
        </button>
      </div>

      {/* Right Section: Status & Controls */}
      <div className="titlebar-right no-drag">
        <div className="status-badges">
          {currentSpace && <EncryptionBadge showDetails={false} />}
          
          <div className="status-pill" title={`${configuredProviders.length} AI Providers`}>
            <Sparkles size={12} className="text-white" />
            <span>{configuredProviders.length}</span>
          </div>

          <div className="status-pill" title={`${connectedPeers.length + 1} Total Peers`}>
            <Globe size={12} className="text-white" />
            <span>{connectedPeers.length + 1}</span>
          </div>
        </div>

        <div className="action-buttons">
          <button 
            className="header-icon-action" 
            onClick={() => {
              console.log('[Titlebar] Triggering collaboration');
              onShowCollaboration?.();
            }} 
            title="Team & Collaboration"
          >
            <Users size={16} />
          </button>
          <button 
            className="header-icon-action" 
            onClick={() => setShowSettings(true)} 
            title="System Settings"
          >
            <Settings size={16} />
          </button>
          <button 
            className="header-icon-action" 
            onClick={() => setShowPlugins(true)} 
            title="Plugins & Extensions"
          >
            <Puzzle size={16} />
          </button>
          <div className="v-divider" />
          <UpdateButton />
        </div>

        <div className="window-controls-mac">
          <button className="mac-btn close" onClick={handleClose} title="Close"><X size={8} /></button>
          <button className="mac-btn minimize" onClick={handleMinimize} title="Minimize"><Minimize size={8} /></button>
          <button className="mac-btn maximize" onClick={handleMaximize} title="Maximize"><Square size={8} /></button>
        </div>
      </div>

      {showPlugins && <PluginsPanel onClose={() => setShowPlugins(false)} />}

      <style>{`
        .titlebar {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(40px) saturate(150%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          z-index: 10000;
          position: relative;
        }

        /* Branding */
        .titlebar-left {
          display: flex;
          align-items: center;
          gap: 32px;
          flex: 1;
        }

        .app-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .app-icon-top {
          width: 22px;
          height: 22px;
          object-fit: contain;
          filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.3));
        }

        .app-name {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: white;
        }

        /* Navigation */
        .nav-group-container {
          display: flex;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 3px;
          border-radius: 100px;
          position: relative;
        }

        .active-highlight {
          position: absolute;
          top: 3px;
          bottom: 3px;
          left: 3px;
          background: white;
          border-radius: 100px;
          transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          z-index: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .tab-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          border-radius: 100px;
          transition: color 0.3s ease;
          position: relative;
          z-index: 1;
          flex: 1;
          justify-content: center;
        }

        .tab-item:hover {
          color: white;
        }

        .tab-item.active {
          color: black;
        }

        /* Omnibar */
        .titlebar-center {
          flex: 1.5;
          display: flex;
          justify-content: center;
        }

        .omnibar-trigger {
          width: 100%;
          max-width: 320px;
          height: 32px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 10px;
          color: rgba(255, 255, 255, 0.3);
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .omnibar-trigger:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.5);
        }

        .kbt-shortcut {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
        }

        /* Right Side */
        .titlebar-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
        }

        .status-badges {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.5);
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .header-icon-action {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.4);
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .header-icon-action:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .header-icon-action svg {
          stroke: currentColor;
        }

        .v-divider {
          width: 1px;
          height: 16px;
          background: rgba(255, 255, 255, 0.06);
          margin: 0 8px;
        }

        .window-controls-mac {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 8px;
        }

        .mac-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: default;
          transition: all 0.2s;
        }

        .mac-btn svg {
          opacity: 0;
          color: rgba(0, 0, 0, 0.5);
          transition: opacity 0.2s;
        }

        .window-controls-mac:hover .mac-btn svg {
          opacity: 1;
        }

        .mac-btn.close { background: #FF5F56; border: 0.5px solid rgba(0, 0, 0, 0.1); }
        .mac-btn.minimize { background: #FFBD2E; border: 0.5px solid rgba(0, 0, 0, 0.1); }
        .mac-btn.maximize { background: #27C93F; border: 0.5px solid rgba(0, 0, 0, 0.1); }

        .mac-btn.close:active { background: #bf4942; }
        .mac-btn.minimize:active { background: #bf8e22; }
        .mac-btn.maximize:active { background: #1d9730; }
      `}</style>
    </header>
  )
}

function TabItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button className={`tab-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
