/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import Editor from './Editor'
import TaskBoard from './TaskBoard'
import VersionPanel from './VersionPanel'
import FilesPanel from './FilesPanel'
import ResourceMonitor from './ResourceMonitor'
import { Users, Shield } from 'lucide-react'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface MainContentProps {
  activeTab: Tab
  onShowCollaboration?: () => void
}

export default function MainContent({ activeTab, onShowCollaboration }: MainContentProps) {
  const { currentSpace } = useAppStore()

  const [resourceVisibility, setResourceVisibility] = useState({
    cpu: true,
    ram: true,
    disk: true,
    network: true
  })

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
    <div className="main-viewport">
      <header className="content-subheader">
        <div className="space-identity">
          <div className="space-status-dot active" />
          <h1 className="space-title">{currentSpace.name}</h1>
          <div className="v-sep" />
          <div className="security-tag">
            <Shield size={10} />
            <span>Encrypted Node</span>
          </div>
        </div>

        <div className="monitor-container">
          <ResourceMonitor
            visible={resourceVisibility}
            onToggle={handleToggleResource}
          />
        </div>

        <div className="header-actions">
          <button
            className="btn-action-circle"
            onClick={() => onShowCollaboration?.()}
            title="Collaboration"
          >
            <Users size={16} />
          </button>
        </div>
      </header>

      <div className="content-area">
        <div className="view-wrapper animate-tab-switch" key={activeTab}>
          {activeTab === 'editor' && <Editor />}
          {activeTab === 'tasks' && <TaskBoard />}
          {activeTab === 'history' && <VersionPanel />}
          {activeTab === 'files' && <FilesPanel />}
        </div>
      </div>

      <style>{`
        .main-viewport {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #000;
          position: relative;
        }

        .animate-tab-switch {
          animation: tabReveal 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }

        @keyframes tabReveal {
          from {
            opacity: 0;
            transform: scale(0.995) translateY(4px);
            filter: blur(4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }

        .content-subheader {
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          background: rgba(255, 255, 255, 0.01);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          z-index: 100;
        }

        .space-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .space-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }

        .space-title {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: white;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .v-sep {
          width: 1px;
          height: 16px;
          background: rgba(255, 255, 255, 0.08);
        }

        .security-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.4);
        }

        .monitor-container {
          flex: 2;
          display: flex;
          justify-content: center;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          justify-content: flex-end;
        }

        .btn-action-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.4);
          transition: all 0.2s;
        }

        .btn-action-circle:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          transform: scale(1.05);
        }

        .content-area {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .view-wrapper {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  )
}
