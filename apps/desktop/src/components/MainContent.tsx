/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import Editor from './Editor'
import CollaborationPanel from './collaboration'
import TaskBoard from './TaskBoard'
import VersionPanel from './VersionPanel'
import FilesPanel from './FilesPanel'
import ResourceMonitor from './ResourceMonitor'
import { Users, Settings } from 'lucide-react'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface MainContentProps {
  activeTab: Tab
}

export default function MainContent({ activeTab }: MainContentProps) {
  const { currentSpace, setShowSettings } = useAppStore()
  const [showCollaboration, setShowCollaboration] = useState(false)

  // Resource monitor visibility state (with persistence)
  const [resourceVisibility, setResourceVisibility] = useState({
    cpu: true,
    ram: true,
    disk: true,
    network: true
  })

  // Load visibility preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('resource-monitor-visibility')
    if (saved) {
      try {
        setResourceVisibility(JSON.parse(saved))
      } catch (e) {
        console.warn('Failed to parse resource visibility', e)
      }
    }
  }, [])

  const handleToggleResource = (metric: 'cpu' | 'ram' | 'disk' | 'network') => {
    setResourceVisibility(prev => {
      const updated = { ...prev, [metric]: !prev[metric] }
      localStorage.setItem('resource-monitor-visibility', JSON.stringify(updated))
      return updated
    })
  }

  if (!currentSpace) return null

  return (
    <div className="main-content">
      <header className="content-header glass-header">
        <h1 className="space-name">{currentSpace.name}</h1>

        <div className="header-center-scroll-wrapper">
          <div className="header-center">
            <ResourceMonitor
              visible={resourceVisibility}
              onToggle={handleToggleResource}
            />
          </div>
        </div>

        <div className="header-right">
          <button
            className="icon-btn share-btn"
            onClick={() => setShowCollaboration(true)}
            title="Team & Collaboration"
          >
            <Users size={16} />
          </button>

          <button
            className="icon-btn settings-btn"
            onClick={() => setShowSettings(true)}
            title="Space Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="content-body">
        {activeTab === 'editor' && <Editor />}
        {activeTab === 'tasks' && <TaskBoard />}
        {activeTab === 'history' && <VersionPanel />}
        {activeTab === 'files' && <FilesPanel />}
      </div>

      {showCollaboration && <CollaborationPanel onClose={() => setShowCollaboration(false)} spaceId={currentSpace?.id} />}

      <style>{`
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--color-bg);
        }
        
        .content-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          height: 48px;
          background: rgba(10, 10, 12, 0.4);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          z-index: 1000;
          position: relative;
          gap: 12px;
        }

        .space-name {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--color-text);
          margin: 0;
          flex-shrink: 0;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .header-center-scroll-wrapper {
          flex: 1;
          position: relative;
          overflow: hidden;
          margin: 0 8px;
          min-width: 0;
        }

        .header-center-scroll-wrapper::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 40px;
          background: linear-gradient(to right, transparent, rgba(10, 10, 12, 0.8));
          pointer-events: none;
          z-index: 10;
        }

        .header-center {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0; /* Allow shrinking */
          height: 100%;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-shrink: 0;
          z-index: 1001;
          position: relative;
        }

        .icon-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-tertiary);
          border-radius: 8px;
          transition: all 0.2s ease;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--color-text);
        }
        
        .content-body {
          flex: 1;
          overflow: hidden;
          position: relative;
        }
      `}</style>
    </div>
  )
}
