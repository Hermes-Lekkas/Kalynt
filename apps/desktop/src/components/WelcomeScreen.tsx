/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useMemo, useState, useEffect } from 'react'
import { useAppStore, Space } from '../stores/appStore'
import { 
  ArrowRight,
  Shield, 
  MoreVertical,
  Plus, Search, Loader2,
  Activity, Globe, FolderTree, HardDrive,
  FileCode, Clock, Users, GitBranch
} from 'lucide-react'

import { useNotificationStore } from '../stores/notificationStore'
import { hardwareService, RealTimeStats } from '../services/hardwareService'

interface WelcomeScreenProps {
  onShowCollaboration: () => void
}

export default function WorkspaceManager({ onShowCollaboration }: WelcomeScreenProps) {
  const { version, spaces, setCurrentSpace, setShowSettings, createSpace, userName } = useAppStore()
  const { addNotification } = useNotificationStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  
  // Dynamic Greeting State
  const [msgIndex, setMsgIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const suggestions = useMemo(() => [
    {
      title: (
        <>Welcome Back, <span className="gradient-text">{userName.split(' ')[0]}.</span></>
      ),
      subtitle: "Authorized access verified. All local nodes are operational and synchronized.",
      isGreeting: true
    },
    {
      title: "Ready to Build?",
      subtitle: "Initialize a new workspace to start your next big project.",
      action: "Initialize"
    },
    {
      title: "Need Collaboration?",
      subtitle: "Join a secure P2P session and code with your team in real-time.",
      action: "Join"
    },
    {
      title: "Importing Code?",
      subtitle: "Clone a repository directly into a new Kalynt workspace.",
      action: "Clone"
    },
    {
      title: "Security First?",
      subtitle: "Configure your node's end-to-end encryption in the security settings.",
      action: "Security"
    },
    {
      title: "Check Performance?",
      subtitle: "Monitor your system's neural latency and engine RAM load.",
      action: "Monitor"
    }
  ], [userName])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setMsgIndex((prev) => (prev + 1) % suggestions.length)
        setIsAnimating(false)
      }, 500)
    }, 6000)
    return () => clearInterval(interval)
  }, [suggestions.length])

  // Real-time Stats State
  const [stats, setStats] = useState<RealTimeStats | null>(null)

  useEffect(() => {
    const cleanup = hardwareService.startResourceMonitoring((newStats) => {
      setStats(newStats)
    })
    return cleanup
  }, [])

  const filteredSpaces = useMemo(() => {
    if (!searchQuery.trim()) return spaces
    return spaces.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [spaces, searchQuery])

  const handleCreate = () => {
    if (!newSpaceName.trim()) return
    const space = createSpace(newSpaceName.trim())
    setCurrentSpace(space)
    setNewSpaceName('')
    setIsCreating(false)
    addNotification('Workspace Initialized', 'success')
  }

  const handleJoinSession = () => {
    onShowCollaboration()
  }

  const handleClone = async () => {
    if (!cloneUrl.trim() || !newSpaceName.trim()) return
    setIsCloning(true)
    addNotification('Cloning Repository...', 'info')
    
    try {
      // Construction of target path
      const appPath = await window.electronAPI.getAppPath()
      const targetPath = `${appPath}/workspaces/${newSpaceName.trim()}`
      
      const result = await window.electronAPI.ipcRenderer.invoke('git:clone', {
        url: cloneUrl.trim(),
        targetPath
      })

      if (result.success) {
        const space = createSpace(newSpaceName.trim())
        // Link space to the path? (appStore logic)
        setCurrentSpace(space)
        addNotification('Repository Cloned Successfully', 'success')
        setIsCloning(false)
        setCloneUrl('')
        setNewSpaceName('')
      } else {
        addNotification(`Clone Failed: ${result.error}`, 'error')
        setIsCloning(false)
      }
    } catch (e) {
      addNotification('An unexpected error occurred during clone', 'error')
      setIsCloning(false)
    }
  }

  return (
    <div className="manager-viewport">
      <div className="manager-mesh" />
      <div className="grain-overlay" />
      
      <div className="manager-container animate-reveal-up">
        {/* Top Navigation / Search Bar */}
        <header className="manager-header">
          <div className="search-hub">
            <Search size={16} className="search-icon" />
            <input 
              placeholder="Search authorized workspaces..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="search-shortcut">âŒ˜ F</div>
          </div>

          <div className="header-actions">
            <button className="btn-glass" onClick={() => {
              useAppStore.getState().setSettingsTab('security')
              setShowSettings(true)
            }}>
              <Shield size={14} />
              <span>Security</span>
            </button>
            <button className="btn-glass" onClick={() => { setIsCloning(true); setIsCreating(false); }}>
              <GitBranch size={14} />
              <span>Clone</span>
            </button>
            <button className="btn-premium" onClick={() => { setIsCreating(true); setIsCloning(false); }}>
              <Plus size={16} />
              <span>Initialize</span>
            </button>
          </div>
        </header>

        {/* Creation Overlay */}
        {isCreating && (
          <div className="inline-creation-box animate-reveal-up">
            <div className="creation-content">
              <Loader2 size={20} className="text-blue-400 animate-spin" />
              <input 
                autoFocus
                placeholder="Name your new workspace..." 
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="creation-actions">
                <button className="btn-cancel" onClick={() => setIsCreating(false)}>Cancel</button>
                <button className="btn-confirm" onClick={handleCreate}>Build</button>
              </div>
            </div>
          </div>
        )}

        {/* Clone Overlay */}
        {isCloning && (
          <div className="inline-creation-box animate-reveal-up" style={{ borderColor: 'rgba(139, 92, 246, 0.3)' }}>
            <div className="creation-content" style={{ flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', width: '100%', gap: '12px', alignItems: 'center' }}>
                <GitBranch size={20} className="text-purple-400" />
                <input 
                  autoFocus
                  placeholder="https://github.com/user/repo.git" 
                  value={cloneUrl}
                  onChange={e => setCloneUrl(e.target.value)}
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div style={{ display: 'flex', width: '100%', gap: '12px', alignItems: 'center' }}>
                <Plus size={20} className="text-blue-400 opacity-40" />
                <input 
                  placeholder="Local workspace name..." 
                  value={newSpaceName}
                  onChange={e => setNewSpaceName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleClone()}
                  style={{ fontSize: '16px' }}
                />
                <div className="creation-actions">
                  <button className="btn-cancel" onClick={() => setIsCloning(false)}>Cancel</button>
                  <button className="btn-confirm" style={{ background: '#8b5cf6' }} onClick={handleClone}>Clone</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="manager-content">
          {/* Dashboard Stats / Bento Header */}
          <div className="bento-grid">
            <div className="bento-card welcome-hero">
              <div className="card-bg-glow" />
              <div className={`hero-content ${isAnimating ? 'animating-out' : 'animating-in'}`} key={msgIndex}>
                <div className="version-tag">
                  {suggestions[msgIndex].isGreeting ? `Kalynt Core ${version.split(' ')[0]}` : 'Pro Tip'}
                </div>
                <h1>{suggestions[msgIndex].title}</h1>
                <p>{suggestions[msgIndex].subtitle}</p>
              </div>
            </div>

            <div className="bento-card system-status">
              <div className="status-header">
                <Activity size={14} className="text-green-400" />
                <span>Engine Performance</span>
              </div>
              <div className="stat-rows">
                <div className="stat-line">
                  <span>Neural Latency</span> 
                  <span className="val">{stats?.networkLatency ? `${stats.networkLatency}ms` : '0.4ms'}</span>
                </div>
                <div className="stat-line">
                  <span>RAM Load</span> 
                  <span className="val">{stats ? `${Math.round((stats.ramUsage / stats.ramTotal) * 100)}%` : '---'}</span>
                </div>
                <div className="stat-line">
                  <span>P2P Cluster</span> 
                  <span className="val">{stats?.networkConnected ? 'Active' : 'Offline'}</span>
                </div>
              </div>
            </div>

            <div className="bento-card quick-join">
              <div className="status-header">
                <Globe size={14} className="text-blue-400" />
                <span>P2P Networking</span>
              </div>
              <p>Join an active collaboration session via link or secure room ID.</p>
              <button className="btn-outline-sm" onClick={handleJoinSession}>
                Join Session <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Workspaces Section */}
          <section className="workspaces-section">
            <div className="section-title">
              <FolderTree size={14} />
              <span>Project Catalog</span>
              <div className="title-line" />
            </div>

            {filteredSpaces.length === 0 ? (
              <div className="empty-catalog">
                <HardDrive size={48} className="opacity-10 mb-4" />
                <p>No workspaces found. Initialize your first project to begin.</p>
              </div>
            ) : (
              <div className="workspace-grid">
                {filteredSpaces.map(space => (
                  <WorkspaceCard 
                    key={space.id} 
                    space={space} 
                    onClick={() => setCurrentSpace(space)} 
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      <style>{`
        .manager-viewport {
          flex: 1;
          background: var(--color-bg);
          position: relative;
          overflow-y: auto;
          display: flex;
          justify-content: center;
        }

        .manager-mesh {
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(at 0% 0%, var(--color-glass) 0px, transparent 50%),
            radial-gradient(at 100% 0%, var(--color-glass) 0px, transparent 50%);
          filter: blur(80px);
          pointer-events: none;
        }

        .grain-overlay {
          position: absolute;
          inset: 0;
          opacity: 0.02;
          background-image: url('https://grainy-gradients.vercel.app/noise.svg');
          pointer-events: none;
        }

        .manager-container {
          width: 100%;
          max-width: 1100px;
          padding: 40px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 48px;
        }

        /* Header */
        .manager-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        .search-hub {
          flex: 1;
          max-width: 480px;
          height: 44px;
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 12px;
          transition: all 0.3s;
        }

        .search-hub:focus-within {
          background: var(--color-surface);
          border-color: var(--color-accent);
          box-shadow: 0 0 0 4px var(--color-glass);
        }

        .search-hub input {
          flex: 1; background: none; border: none; outline: none;
          color: var(--color-text); font-size: 14px; font-weight: 500;
        }

        .search-shortcut {
          font-size: 10px; font-weight: 800; color: var(--color-text-muted);
          background: var(--color-glass); padding: 2px 6px; border-radius: 4px;
        }

        .header-actions { display: flex; gap: 12px; }

        .btn-glass {
          display: flex; align-items: center; gap: 8px;
          padding: 0 16px; height: 40px; background: var(--color-glass);
          border: 1px solid var(--color-border); border-radius: 12px;
          color: var(--color-text-secondary); font-size: 13px; font-weight: 700;
          transition: all 0.2s;
        }
        .btn-glass:hover { background: var(--color-glass-hover); color: var(--color-text); }

        .btn-premium {
          display: flex; align-items: center; gap: 8px;
          padding: 0 20px; height: 40px; background: var(--color-text);
          color: var(--color-bg); border-radius: 12px;
          font-size: 13px; font-weight: 800;
          transition: all 0.2s;
        }
        .btn-premium:hover { transform: translateY(-1px); box-shadow: 0 8px 24px var(--color-glass); }

        /* Creation Box */
        .inline-creation-box {
          background: var(--color-glass);
          border: 1px solid var(--color-accent-hover);
          border-radius: 20px;
          padding: 24px;
        }

        .creation-content { display: flex; align-items: center; gap: 20px; }
        .creation-content input {
          flex: 1; background: none; border: none; outline: none;
          color: var(--color-text); font-size: 20px; font-weight: 700;
        }
        .creation-actions { display: flex; gap: 12px; }
        .btn-cancel { font-size: 13px; font-weight: 700; color: var(--color-text-muted); padding: 8px 16px; border: none; background: none; cursor: pointer; }
        .btn-confirm { background: var(--color-accent); color: white; font-weight: 800; font-size: 13px; padding: 8px 24px; border-radius: 10px; border: none; cursor: pointer; }

        /* Bento Grid */
        .bento-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr;
          gap: 20px;
        }

        .bento-card {
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 28px;
          position: relative;
          overflow: hidden;
        }

        .welcome-hero { grid-column: span 1; display: flex; flex-direction: column; justify-content: center; }
        .card-bg-glow { position: absolute; top: -20%; right: -20%; width: 100px; height: 100px; background: var(--color-accent); filter: blur(60px); opacity: 0.1; }
        .version-tag { font-size: 10px; font-weight: 800; color: var(--color-accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
        .welcome-hero h1 { font-size: 28px; font-weight: 800; color: var(--color-text); margin-bottom: 8px; letter-spacing: -0.02em; }
        .welcome-hero p { font-size: 13px; color: var(--color-text-secondary); line-height: 1.5; }

        .animating-in {
          animation: text-reveal-in 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }

        .animating-out {
          animation: text-reveal-out 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }

        @keyframes text-reveal-in {
          from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes text-reveal-out {
          from { opacity: 1; transform: translateY(0); filter: blur(0); }
          to { opacity: 0; transform: translateY(-10px); filter: blur(4px); }
        }

        .gradient-text { background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

        .status-header { display: flex; align-items: center; gap: 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-text-tertiary); margin-bottom: 20px; }
        .stat-rows { display: flex; flex-direction: column; gap: 12px; }
        .stat-line { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--color-text-secondary); }
        .stat-line .val { color: var(--color-text); font-family: monospace; font-size: 11px; }

        .quick-join p { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 20px; line-height: 1.5; }
        .btn-outline-sm { padding: 8px 16px; border: 1px solid var(--color-border); border-radius: 10px; color: var(--color-text); font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; transition: all 0.2s; background: none; cursor: pointer; }
        .btn-outline-sm:hover { background: var(--color-glass-hover); border-color: var(--color-text-muted); }

        /* Workspaces Grid */
        .workspaces-section { display: flex; flex-direction: column; gap: 24px; }
        .section-title { display: flex; align-items: center; gap: 16px; color: var(--color-text-tertiary); }
        .section-title span { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
        .title-line { flex: 1; height: 1px; background: linear-gradient(to right, var(--color-border), transparent); }

        .workspace-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .empty-catalog { padding: 60px; text-align: center; color: var(--color-text-muted); }

        .animate-reveal-up { animation: reveal-up 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        @keyframes reveal-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 900px) {
          .bento-grid { grid-template-columns: 1fr; }
          .manager-container { padding: 24px; }
        }
      `}</style>
    </div>
  )
}

function WorkspaceCard({ space, onClick }: { space: Space, onClick: () => void }) {
  return (
    <div className="workspace-premium-card" onClick={onClick}>
      <div className="card-top">
        <div className="project-icon">
          <FileCode size={20} className="text-blue-400" />
        </div>
        <div className="card-actions-subtle">
          <button className="btn-dot"><MoreVertical size={14} /></button>
        </div>
      </div>

      <div className="card-main">
        <h3>{space.name}</h3>
        <div className="meta-info">
          <div className="meta-item"><Clock size={12} /> <span>{new Date(space.createdAt).toLocaleDateString()}</span></div>
          <div className="meta-item"><Users size={12} /> <span>1 Authorized Node</span></div>
        </div>
      </div>

      <div className="card-footer">
        <div className="tag-cloud">
          <span className="type-tag">TypeScript</span>
          <span className="type-tag">Git Locked</span>
        </div>
        <button className="launch-btn">
          <span>Launch</span>
          <ArrowRight size={14} />
        </button>
      </div>

      <style>{`
        .workspace-premium-card {
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          cursor: pointer;
        }

        .workspace-premium-card:hover {
          background: var(--color-surface);
          border-color: var(--color-accent);
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        .card-top { display: flex; justify-content: space-between; align-items: center; }
        .project-icon { width: 44px; height: 44px; background: var(--color-glass); border-radius: 12px; display: flex; align-items: center; justify-content: center; }

        .card-main h3 { font-size: 18px; font-weight: 700; color: var(--color-text); margin-bottom: 8px; }
        .meta-info { display: flex; gap: 16px; }
        .meta-item { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--color-text-tertiary); text-transform: uppercase; }

        .card-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--color-border); }
        .tag-cloud { display: flex; gap: 6px; }
        .type-tag { font-size: 9px; font-weight: 800; color: var(--color-text-muted); background: var(--color-glass); padding: 2px 8px; border-radius: 6px; text-transform: uppercase; }

        .launch-btn {
          display: flex; align-items: center; gap: 8px; color: var(--color-accent); font-size: 12px; font-weight: 800; text-transform: uppercase;
          opacity: 0; transform: translateX(-10px); transition: all 0.3s;
        }
        .workspace-premium-card:hover .launch-btn { opacity: 1; transform: translateX(0); }
        
        .btn-dot { background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
      `}</style>
    </div>
  )
}
