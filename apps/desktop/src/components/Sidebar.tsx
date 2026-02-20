/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { 
  Plus, User, ChevronLeft, X, Search, Trash2, 
  MoreVertical, LayoutGrid, Monitor, ArrowRight, ShieldCheck, 
  Globe, Clock, Hash, Loader2, Settings
} from 'lucide-react'
import { useNotificationStore } from '../stores/notificationStore'

export default function Sidebar() {
  const {
    spaces, currentSpace, setCurrentSpace, createSpace, deleteSpace,
    userName, setUserName,
    sidebarCollapsed, toggleSidebarCollapsed
  } = useAppStore()
  const { addNotification } = useNotificationStore()

  // Creation State
  const [isCreating, setIsCreating] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  
  // User Profile State
  const [isEditingName, setIsEditingName] = useState(false)
  const [userNameInput, setUserNameInput] = useState(userName)
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSpaces = useMemo(() => {
    if (!searchQuery.trim()) return spaces
    return spaces.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [spaces, searchQuery])

  const handleCreateSpace = () => {
    if (!newSpaceName.trim()) return
    try {
      const space = createSpace(newSpaceName.trim())
      setCurrentSpace(space)
      setNewSpaceName('')
      setIsCreating(false)
      addNotification('Workspace Created', 'success')
    } catch (error) {
      addNotification('Failed to create workspace', 'error')
    }
  }

  const handleDeleteSpace = (e: React.MouseEvent, spaceId: string) => {
    e.stopPropagation()
    if (confirm('Permanently delete this project? This action is irreversible.')) {
      deleteSpace(spaceId)
      addNotification('Workspace Purged', 'info')
    }
  }

  const handleSaveName = () => {
    if (userNameInput.trim() && userNameInput.trim() !== userName) {
      setUserName(userNameInput.trim())
      addNotification('Identity Updated', 'success')
    }
    setIsEditingName(false)
  }

  return (
    <aside className={`sidebar-v3 ${sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* 1. Global Navigation / Search */}
      <div className="sidebar-top-hub">
        <div className="system-actions">
          <button 
            className={`nav-btn ${!currentSpace ? 'active' : ''}`}
            onClick={() => setCurrentSpace(null)}
            title="Project Dashboard"
          >
            <div className="btn-inner">
              <LayoutGrid size={18} />
              {!sidebarCollapsed && <span>Dashboard</span>}
            </div>
          </button>
          
          <button 
            className="nav-btn create-trigger"
            onClick={() => setIsCreating(true)}
            title="New Workspace"
          >
            <div className="btn-inner">
              <Plus size={18} />
              {!sidebarCollapsed && <span>New Workspace</span>}
            </div>
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="search-module animate-reveal-up">
            <Search size={14} className="search-icon" />
            <input 
              placeholder="Search assets..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* 2. Workspace List */}
      <div className="sidebar-main-scroll">
        {!sidebarCollapsed && <div className="list-label">Authorized Workspaces</div>}
        
        <div className="space-scroller">
          {isCreating && !sidebarCollapsed && (
            <div className="creation-card-premium animate-reveal-up">
              <div className="creation-header">
                <Loader2 size={14} className="text-blue-400 animate-spin" />
                <span>Initializing...</span>
                <button className="close-btn" onClick={() => setIsCreating(false)}><X size={12} /></button>
              </div>
              <input
                autoFocus
                placeholder="Workspace name"
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateSpace()}
              />
              <button className="btn-confirm-creation" onClick={handleCreateSpace}>
                Create <ArrowRight size={12} />
              </button>
            </div>
          )}

          {filteredSpaces.map((space, idx) => (
            <ProjectTile 
              key={space.id}
              space={space}
              isActive={currentSpace?.id === space.id}
              isCollapsed={sidebarCollapsed}
              index={idx}
              onClick={() => setCurrentSpace(space)}
              onDelete={(e: React.MouseEvent) => handleDeleteSpace(e, space.id)}
            />
          ))}

          {filteredSpaces.length === 0 && !isCreating && (
            <div className="empty-hint">
              {!sidebarCollapsed ? 'No active projects found.' : <Plus size={16} className="opacity-20" />}
            </div>
          )}
        </div>
      </div>

      {/* 3. Footer / Identity */}
      <div className="sidebar-bottom-hub">
        {!sidebarCollapsed && (
          <div className="system-health">
            <div className="health-row">
              <ShieldCheck size={12} className="text-green-500" />
              <span>Security Verified</span>
            </div>
            <div className="health-row">
              <Globe size={12} className="text-blue-400" />
              <span>Nodes Active</span>
            </div>
          </div>
        )}

        <div className="user-pod">
          <div className="avatar-wrapper">
            <div className="avatar-glow" />
            <div className="avatar-core">
              <User size={16} />
            </div>
            <div className="status-dot" />
          </div>
          {!sidebarCollapsed && (
            <>
              <div className="user-meta">
                {isEditingName ? (
                  <input 
                    autoFocus
                    className="name-edit-field"
                    value={userNameInput}
                    onChange={e => setUserNameInput(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  />
                ) : (
                  <span className="user-name clickable" onClick={() => setIsEditingName(true)}>
                    {userName}
                  </span>
                )}
                <span className="user-role">Lead Developer</span>
              </div>
              <button className="btn-action-footer" onClick={() => useAppStore.getState().setShowSettings(true)} title="Settings">
                <Settings size={14} />
              </button>
            </>
          )}
        </div>
        
        <button className="btn-toggle-sidebar" onClick={toggleSidebarCollapsed}>
          {sidebarCollapsed ? <ChevronLeft size={14} className="rotate-180" /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <style>{`
        .sidebar-v3 {
          width: var(--sidebar-width);
          height: 100%;
          background: var(--color-bg);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          position: relative;
          transition: width 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          z-index: 100;
        }

        .sidebar-v3.collapsed { width: 72px; }

        /* Top Hub */
        .sidebar-top-hub { padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; }
        
        .system-actions { display: flex; flex-direction: column; gap: 4px; }

        .nav-btn {
          width: 100%; height: 44px; border-radius: 12px;
          background: transparent; border: none; cursor: pointer;
          color: var(--color-text-secondary); transition: all 0.2s;
        }

        .nav-btn .btn-inner { display: flex; align-items: center; gap: 12px; padding: 0 12px; }
        .nav-btn span { font-size: 13px; font-weight: 700; }

        .nav-btn:hover { background: var(--color-glass-hover); color: var(--color-text); }
        .nav-btn.active { background: var(--color-glass-active); color: var(--color-text); }
        
        .nav-btn.create-trigger { color: var(--color-accent); }
        .nav-btn.create-trigger:hover { background: var(--color-glass); }

        .search-module {
          height: 36px; background: var(--color-surface-subtle);
          border: 1px solid var(--color-border); border-radius: 10px;
          display: flex; align-items: center; padding: 0 12px; gap: 10px;
        }

        .search-module input {
          background: none; border: none; outline: none; color: var(--color-text);
          font-size: 12px; font-weight: 500; width: 100%;
        }
        .search-icon { color: var(--color-text-muted); }

        /* Main List */
        .sidebar-main-scroll { flex: 1; overflow-y: auto; padding: 0 12px; display: flex; flex-direction: column; }
        
        .list-label {
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          color: var(--color-text-tertiary); letter-spacing: 0.1em;
          padding: 12px 12px 8px;
        }

        .space-scroller { display: flex; flex-direction: column; gap: 4px; }

        .creation-card-premium {
          background: var(--color-glass); border: 1px solid var(--color-accent-hover);
          border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
          margin-bottom: 12px;
        }

        .creation-header { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 800; color: var(--color-text-tertiary); text-transform: uppercase; }
        .creation-header .close-btn { margin-left: auto; color: var(--color-text-muted); background: none; border: none; cursor: pointer; }

        .creation-card-premium input {
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 8px 12px; color: var(--color-text); font-size: 13px; outline: none;
        }

        .btn-confirm-creation {
          background: var(--color-accent); color: white; border-radius: 8px; border: none;
          padding: 6px; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px;
          cursor: pointer;
        }

        .empty-hint { padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 12px; font-weight: 600; }

        /* Bottom Hub */
        .sidebar-bottom-hub { padding: 16px; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 12px; }

        .system-health { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
        .health-row { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; color: var(--color-text-tertiary); text-transform: uppercase; }

        .user-pod {
          display: flex; align-items: center; gap: 12px; background: var(--color-surface-subtle);
          border: 1px solid var(--color-border); border-radius: 16px; padding: 10px 14px;
          position: relative; width: 100%;
        }

        .avatar-wrapper { position: relative; width: 32px; height: 32px; flex-shrink: 0; }
        .avatar-core { width: 100%; height: 100%; background: var(--color-surface-elevated); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-text); position: relative; z-index: 2; border: 1px solid var(--color-border); }
        .avatar-glow { position: absolute; inset: -2px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 50%; opacity: 0.3; filter: blur(4px); }
        .status-dot { position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; background: #10b981; border: 2px solid var(--color-bg); border-radius: 50%; z-index: 3; }

        .user-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .user-name { font-size: 13px; font-weight: 700; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-name.clickable:hover { color: var(--color-accent); cursor: pointer; }
        
        .btn-action-footer {
          width: 28px; height: 28px; border-radius: 8px; display: flex;
          align-items: center; justify-content: center; color: var(--color-text-tertiary);
          background: transparent; border: none; cursor: pointer; transition: all 0.2s;
        }
        .btn-action-footer:hover { color: var(--color-text); background: var(--color-glass); }

        .name-edit-field {
          background: var(--color-surface); border: 1px solid var(--color-accent); border-radius: 4px;
          color: var(--color-text); font-size: 12px; font-weight: 700; padding: 2px 6px;
          width: 100%; outline: none;
        }

        .user-role { font-size: 10px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; }

        .btn-toggle-sidebar {
          width: 24px; height: 24px; background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          color: var(--color-text-tertiary); cursor: pointer; transition: all 0.2s;
          align-self: center; margin-top: 4px;
        }
        .btn-toggle-sidebar:hover { color: var(--color-text); border-color: var(--color-text-muted); }

        /* Collapsed logic */
        .sidebar-v3.collapsed .sidebar-top-hub, .sidebar-v3.collapsed .sidebar-bottom-hub { align-items: center; }
        .sidebar-v3.collapsed .nav-btn .btn-inner { padding: 0; justify-content: center; }
        .sidebar-v3.collapsed .user-pod { border: none; background: none; padding: 0; justify-content: center; }
        .sidebar-v3.collapsed .btn-toggle-sidebar { margin-top: 8px; }

        .animate-reveal-up { animation: reveal-up 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        @keyframes reveal-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </aside>
  )
}

function ProjectTile({ space, isActive, isCollapsed, index, onClick, onDelete }: any) {
  if (isCollapsed) {
    return (
      <div 
        className={`mini-tile ${isActive ? 'active' : ''}`}
        onClick={onClick}
        title={space.name}
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <div className="tile-glow" />
        <Monitor size={18} />
        <style>{`
          .mini-tile {
            width: 48px; height: 48px; margin: 0 auto; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            background: var(--color-surface-subtle); border: 1px solid var(--color-border);
            cursor: pointer; position: relative; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
            animation: reveal-up 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0;
            color: var(--color-text-tertiary);
          }
          .mini-tile:hover { background: var(--color-glass-hover); color: var(--color-text); transform: scale(1.05); }
          .mini-tile.active { background: var(--color-glass-active); color: var(--color-accent); border-color: var(--color-accent-hover); box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
          .mini-tile.active .tile-glow { position: absolute; inset: 0; background: var(--color-accent); opacity: 0.1; filter: blur(10px); }
        `}</style>
      </div>
    )
  }

  return (
    <div 
      className={`project-tile ${isActive ? 'active' : ''} animate-reveal-up`}
      onClick={onClick}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="tile-main">
        <div className="tile-icon-box">
          <Hash size={14} className="opacity-40" />
        </div>
        <div className="tile-info">
          <span className="tile-name">{space.name}</span>
          <div className="tile-stats">
            <Clock size={10} /> <span>Recently Active</span>
          </div>
        </div>
      </div>

      <div className="tile-actions">
        <button className="tile-btn"><MoreVertical size={14} /></button>
        <button className="tile-btn danger" onClick={onDelete}><Trash2 size={14} /></button>
      </div>

      <style>{`
        .project-tile {
          width: 100%; padding: 12px; border-radius: 14px;
          background: var(--color-surface-subtle); border: 1px solid var(--color-border);
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
          position: relative; opacity: 0;
          color: var(--color-text);
        }

        .project-tile:hover {
          background: var(--color-glass-hover); border-color: var(--color-text-muted);
          transform: translateX(4px);
        }

        .project-tile.active {
          background: var(--color-glass-active); border-color: var(--color-accent);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .project-tile.active::before {
          content: ''; position: absolute; left: -12px; top: 50%; transform: translateY(-50%);
          width: 4px; height: 20px; background: var(--color-accent); border-radius: 0 4px 4px 0;
          box-shadow: 0 0 10px var(--color-accent);
        }

        .tile-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .tile-icon-box { width: 32px; height: 32px; background: var(--color-surface-elevated); border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--color-border-subtle); }

        .tile-info { display: flex; flex-direction: column; min-width: 0; }
        .tile-name { font-size: 13px; font-weight: 700; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tile-stats { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: var(--color-text-tertiary); text-transform: uppercase; }

        .tile-actions { display: flex; gap: 4px; opacity: 0; transform: translateX(10px); transition: all 0.2s; }
        .project-tile:hover .tile-actions { opacity: 1; transform: translateX(0); }

        .tile-btn {
          width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          color: var(--color-text-muted); transition: all 0.2s; background: none; border: none; cursor: pointer;
        }
        .tile-btn:hover { background: var(--color-glass-hover); color: var(--color-text); }
        .tile-btn.danger:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
      `}</style>
    </div>
  )
}
