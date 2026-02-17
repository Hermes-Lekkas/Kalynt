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
          background: #000000;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
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
          color: rgba(255, 255, 255, 0.4); transition: all 0.2s;
        }

        .nav-btn .btn-inner { display: flex; align-items: center; gap: 12px; padding: 0 12px; }
        .nav-btn span { font-size: 13px; font-weight: 700; }

        .nav-btn:hover { background: rgba(255, 255, 255, 0.03); color: white; }
        .nav-btn.active { background: rgba(255, 255, 255, 0.05); color: white; }
        
        .nav-btn.create-trigger { color: #3b82f6; }
        .nav-btn.create-trigger:hover { background: rgba(59, 130, 246, 0.1); }

        .search-module {
          height: 36px; background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px;
          display: flex; align-items: center; padding: 0 12px; gap: 10px;
        }

        .search-module input {
          background: none; border: none; outline: none; color: white;
          font-size: 12px; font-weight: 500; width: 100%;
        }
        .search-icon { color: rgba(255, 255, 255, 0.2); }

        /* Main List */
        .sidebar-main-scroll { flex: 1; overflow-y: auto; padding: 0 12px; display: flex; flex-direction: column; }
        
        .list-label {
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          color: rgba(255, 255, 255, 0.2); letter-spacing: 0.1em;
          padding: 12px 12px 8px;
        }

        .space-scroller { display: flex; flex-direction: column; gap: 4px; }

        .creation-card-premium {
          background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
          margin-bottom: 12px;
        }

        .creation-header { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 800; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; }
        .creation-header .close-btn { margin-left: auto; color: rgba(255, 255, 255, 0.2); background: none; border: none; cursor: pointer; }

        .creation-card-premium input {
          background: #000; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px; padding: 8px 12px; color: white; font-size: 13px; outline: none;
        }

        .btn-confirm-creation {
          background: #3b82f6; color: white; border-radius: 8px; border: none;
          padding: 6px; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px;
          cursor: pointer;
        }

        .empty-hint { padding: 24px; text-align: center; color: rgba(255, 255, 255, 0.1); font-size: 12px; font-weight: 600; }

        /* Bottom Hub */
        .sidebar-bottom-hub { padding: 16px; border-top: 1px solid rgba(255, 255, 255, 0.05); display: flex; flex-direction: column; gap: 12px; }

        .system-health { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
        .health-row { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.3); text-transform: uppercase; }

        .user-pod {
          display: flex; align-items: center; gap: 12px; background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 10px 14px;
          position: relative; width: 100%;
        }

        .avatar-wrapper { position: relative; width: 32px; height: 32px; flex-shrink: 0; }
        .avatar-core { width: 100%; height: 100%; background: #111; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; position: relative; z-index: 2; border: 1px solid rgba(255, 255, 255, 0.1); }
        .avatar-glow { position: absolute; inset: -2px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 50%; opacity: 0.3; filter: blur(4px); }
        .status-dot { position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; background: #10b981; border: 2px solid #000; border-radius: 50%; z-index: 3; }

        .user-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .user-name { font-size: 13px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-name.clickable:hover { color: #3b82f6; cursor: pointer; }
        
        .btn-action-footer {
          width: 28px; height: 28px; border-radius: 8px; display: flex;
          align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.3);
          background: transparent; border: none; cursor: pointer; transition: all 0.2s;
        }
        .btn-action-footer:hover { color: white; background: rgba(255, 255, 255, 0.05); }

        .name-edit-field {
          background: #000; border: 1px solid #3b82f6; border-radius: 4px;
          color: white; font-size: 12px; font-weight: 700; padding: 2px 6px;
          width: 100%; outline: none;
        }

        .user-role { font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; }

        .btn-toggle-sidebar {
          width: 24px; height: 24px; background: #000; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          color: rgba(255, 255, 255, 0.4); cursor: pointer; transition: all 0.2s;
          align-self: center; margin-top: 4px;
        }
        .btn-toggle-sidebar:hover { color: white; border-color: rgba(255, 255, 255, 0.3); }

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
            background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05);
            cursor: pointer; position: relative; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
            animation: reveal-up 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0;
            color: rgba(255, 255, 255, 0.2);
          }
          .mini-tile:hover { background: rgba(255, 255, 255, 0.05); color: white; transform: scale(1.05); }
          .mini-tile.active { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-color: rgba(59, 130, 246, 0.3); box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
          .mini-tile.active .tile-glow { position: absolute; inset: 0; background: #3b82f6; opacity: 0.1; filter: blur(10px); }
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
          background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05);
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
          position: relative; opacity: 0;
        }

        .project-tile:hover {
          background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
        }

        .project-tile.active {
          background: rgba(59, 130, 246, 0.06); border-color: rgba(59, 130, 246, 0.2);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }

        .project-tile.active::before {
          content: ''; position: absolute; left: -12px; top: 50%; transform: translateY(-50%);
          width: 4px; height: 20px; background: #3b82f6; border-radius: 0 4px 4px 0;
          box-shadow: 0 0 10px #3b82f6;
        }

        .tile-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .tile-icon-box { width: 32px; height: 32px; background: rgba(255, 255, 255, 0.03); border-radius: 10px; display: flex; align-items: center; justify-content: center; }

        .tile-info { display: flex; flex-direction: column; min-width: 0; }
        .tile-name { font-size: 13px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tile-stats { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; }

        .tile-actions { display: flex; gap: 4px; opacity: 0; transform: translateX(10px); transition: all 0.2s; }
        .project-tile:hover .tile-actions { opacity: 1; transform: translateX(0); }

        .tile-btn {
          width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          color: rgba(255, 255, 255, 0.2); transition: all 0.2s; background: none; border: none; cursor: pointer;
        }
        .tile-btn:hover { background: rgba(255, 255, 255, 0.05); color: white; }
        .tile-btn.danger:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
      `}</style>
    </div>
  )
}
