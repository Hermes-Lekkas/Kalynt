/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, lazy, Suspense } from 'react'
import { useAppStore } from '../stores/appStore'
import ResourceMonitor from './ResourceMonitor'

// RAM Optimization: Lazy-load tab panels — only the active tab's component is loaded.
// This defers Editor (~Monaco), TaskBoard, VersionPanel (~DiffEditor), FilesPanel trees.
const Editor = lazy(() => import('./Editor'))
const TaskBoard = lazy(() => import('./TaskBoard'))
const VersionPanel = lazy(() => import('./VersionPanel'))
const FilesPanel = lazy(() => import('./FilesPanel'))

type Tab = 'editor' | 'tasks' | 'files' | 'history'

interface ResourceVisibility {
  cpu: boolean
  ram: boolean
  disk: boolean
  network: boolean
}

interface MainContentProps {
  activeTab: Tab
  onShowCollaboration?: () => void
}

export default function MainContent({ activeTab }: MainContentProps) {
  const { currentSpace } = useAppStore()

  const [resourceVisibility, setResourceVisibility] = useState<ResourceVisibility>(() => {
    const saved = localStorage.getItem('resource-monitor-visibility')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (_e) {
        console.warn('Failed to parse resource visibility', _e)
      }
    }
    return {
      cpu: true,
      ram: true,
      disk: true,
      network: true
    }
  })

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
        </div>

        <div className="monitor-container">
          <ResourceMonitor
            visible={resourceVisibility}
            onToggle={handleToggleResource}
          />
        </div>
      </header>

      <div className="content-area">
        <div className="view-wrapper animate-tab-switch" key={activeTab}>
          <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>Loading...</div>}>
            {activeTab === 'editor' && <Editor />}
            {activeTab === 'tasks' && <TaskBoard />}
            {activeTab === 'history' && <VersionPanel />}
            {activeTab === 'files' && <FilesPanel />}
          </Suspense>
        </div>
      </div>

      <style>{`
        .main-viewport {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--color-bg);
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
          background: var(--color-bg);
          border-bottom: 1px solid var(--color-border);
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
          color: var(--color-text);
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .monitor-container {
          flex: 2;
          display: flex;
          justify-content: center;
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
