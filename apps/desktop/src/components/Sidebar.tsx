/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore, Space } from '../stores/appStore'
import { WorkspaceCategoryId, getCategoryById } from '../types/workspaceCategories'
import { FileText, Plus, User, ChevronLeft, Menu, X, FolderTree, Sparkles } from 'lucide-react'

export default function Sidebar() {
  const [isCreating, setIsCreating] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [userNameInput, setUserNameInput] = useState('')
  const {
    spaces, currentSpace, setCurrentSpace, createSpace, deleteSpace,
    apiKeys, userName, setUserName,
    sidebarCollapsed, toggleSidebarCollapsed
  } = useAppStore()

  const [selectedCategory, setSelectedCategory] = useState<WorkspaceCategoryId | null>(null)

  const handleCreateSpace = () => {
    if (!newSpaceName.trim() || !selectedCategory) return

    try {
      const space = createSpace(newSpaceName.trim(), undefined, selectedCategory)
      setCurrentSpace(space)
      setNewSpaceName('')
      setIsCreating(false)
      setSelectedCategory(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create space')
    }
  }

  const handleCategorySelect = () => {
    setSelectedCategory('programming')
    setIsCreating(true)
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setSelectedCategory(null)
    setNewSpaceName('')
  }

  const handleDeleteSpace = (e: React.MouseEvent, spaceId: string) => {
    e.stopPropagation()
    if (confirm('Delete this workspace? All data will be lost.')) {
      deleteSpace(spaceId)
    }
  }

  const handleSaveName = () => {
    if (userNameInput.trim()) {
      setUserName(userNameInput.trim())
    }
    setIsEditingName(false)
  }

  const configuredKeys = Object.keys(apiKeys).filter(k => apiKeys[k as keyof typeof apiKeys]).length

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && <div className="sidebar-title-group">
           <FolderTree size={14} className="text-blue-400" />
           <span className="sidebar-title">Workspaces</span>
        </div>}
        <div className="header-actions">
          {!sidebarCollapsed && (
            <button
              className="btn btn-ghost btn-icon add-btn"
              onClick={handleCategorySelect}
              title="New Workspace"
            >
              <Plus size={16} />
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon toggle-btn"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {isCreating && selectedCategory && (
        <div className="create-form animate-reveal-up">
          <div className="category-badge" style={{ background: getCategoryById(selectedCategory)?.color }}>
            {getCategoryById(selectedCategory)?.icon} <span>{getCategoryById(selectedCategory)?.name}</span>
          </div>
          <input
            type="text"
            className="sidebar-input"
            placeholder="Workspace name..."
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSpace()
              if (e.key === 'Escape') handleCancelCreate()
            }}
            autoFocus
          />
          <div className="form-actions">
            <button className="btn-small btn-ghost" onClick={handleCancelCreate}>Cancel</button>
            <button className="btn-small btn-primary" onClick={handleCreateSpace}>Create</button>
          </div>
        </div>
      )}

      <nav className="space-list">
        {spaces.length === 0 && !isCreating && (
          <div className="empty-state">
            <div className="empty-icon-box">
               <Sparkles size={20} className="text-blue-400" />
            </div>
            <p>No active projects</p>
            <button className="btn-create-tiny" onClick={handleCategorySelect}>
              Initialize Space
            </button>
          </div>
        )}

        {!sidebarCollapsed && spaces.map((space) => (
          <SpaceItem
            key={space.id}
            space={space}
            isActive={currentSpace?.id === space.id}
            onClick={() => setCurrentSpace(space)}
            onDelete={(e) => handleDeleteSpace(e, space.id)}
          />
        ))}

        {sidebarCollapsed && spaces.map((space) => (
          <div
            key={space.id}
            className={`mini-space-item ${currentSpace?.id === space.id ? 'active' : ''}`}
            onClick={() => setCurrentSpace(space)}
            title={space.name}
          >
            {getCategoryById(space.category)?.icon || <FileText size={14} />}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!sidebarCollapsed && (
          <div className="usage-card">
            <div className="usage-row">
              <span className="label">AI Sync</span>
              <span className="value">{configuredKeys > 0 ? 'Active' : 'Offline'}</span>
            </div>
            <div className="usage-row">
              <span className="label">Nodes</span>
              <span className="value">Local Only</span>
            </div>
          </div>
        )}

        <div className="user-profile">
          <div className="avatar-glow">
            <div className="avatar">
              <User size={16} />
            </div>
          </div>
          {!sidebarCollapsed && (
            <div className="user-details">
              {isEditingName ? (
                <input
                  type="text"
                  className="user-name-edit"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') setIsEditingName(false)
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className="user-name clickable"
                  onClick={() => {
                    setUserNameInput(userName);
                    setIsEditingName(true);
                  }}
                >
                  {userName}
                </span>
              )}
              <span className="user-status">Verified Beta Member</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #050505;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
          transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          z-index: 100;
        }

        .sidebar.collapsed {
          width: 64px;
        }
        
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 16px;
        }

        .sidebar-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .sidebar-title {
          font-size: 11px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        
        .header-actions {
          display: flex;
          gap: 4px;
        }
        
        .create-form {
          padding: 0 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sidebar-input {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }

        .sidebar-input:focus {
          border-color: var(--color-accent);
          background: rgba(255, 255, 255, 0.05);
        }
        
        .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .btn-small {
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 6px;
        }
        
        .category-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          color: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .space-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 8px;
        }
        
        .empty-state {
          padding: 40px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .empty-icon-box {
          width: 44px;
          height: 44px;
          background: rgba(59, 130, 246, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        
        .empty-state p {
          color: rgba(255, 255, 255, 0.3);
          font-size: 12px;
          font-weight: 500;
        }

        .btn-create-tiny {
          font-size: 11px;
          font-weight: 700;
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          padding: 6px 14px;
          border-radius: 99px;
          transition: all 0.2s;
        }

        .btn-create-tiny:hover {
          background: #3b82f6;
          color: white;
        }
        
        .sidebar.collapsed .sidebar-header {
          padding: 20px 0;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }

        .sidebar.collapsed .header-actions {
          flex-direction: column;
          align-items: center;
        }

        .mini-space-item {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          margin: 4px auto;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
        }

        .mini-space-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          transform: scale(1.05);
        }

        .mini-space-item.active {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border-color: rgba(59, 130, 246, 0.3);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .sidebar.collapsed .sidebar-footer {
          align-items: center;
          padding: 20px 0;
        }
        
        .usage-card {
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .usage-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .usage-row .label { color: rgba(255, 255, 255, 0.2); }
        .usage-row .value { color: rgba(255, 255, 255, 0.5); }
        
        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatar-glow {
          padding: 2px;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
        }
        
        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        
        .user-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        
        .user-name {
          font-size: 13px;
          font-weight: 700;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .user-name.clickable:hover {
          color: #3b82f6;
          cursor: pointer;
        }

        .user-name-edit {
          background: #000;
          border: 1px solid #3b82f6;
          border-radius: 4px;
          color: white;
          font-size: 12px;
          font-weight: 700;
          padding: 2px 6px;
          width: 100%;
          outline: none;
        }
        
        .user-status {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </aside>
  )
}

interface SpaceItemProps {
  space: Space
  isActive: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}

function SpaceItem({ space, isActive, onClick, onDelete }: SpaceItemProps) {
  const category = getCategoryById(space.category)

  return (
    <div
      className={`space-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="space-info">
        <span className="space-icon" style={{ color: category?.color }}>{category?.icon || <FileText size={14} />}</span>
        <span className="space-name">{space.name}</span>
      </div>
      <button
        className="delete-btn"
        onClick={(e) => { e.stopPropagation(); onDelete(e); }}
        aria-label="Delete space"
      >
        <X size={14} />
      </button>
      <style>{`
        .space-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: transparent;
          border-radius: 12px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          cursor: pointer;
          position: relative;
          margin-bottom: 2px;
          border: 1px solid transparent;
        }
        
        .space-item:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.05);
        }
        
        .space-item.active {
          background: rgba(59, 130, 246, 0.08);
          border-color: rgba(59, 130, 246, 0.2);
        }

        .space-item.active::after {
          content: '';
          position: absolute;
          left: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 20px;
          background: #3b82f6;
          border-radius: 0 4px 4px 0;
          box-shadow: 0 0 10px #3b82f6;
        }
        
        .space-info {
          display: flex;
          align-items: center;
          gap: 12px;
          overflow: hidden;
        }
        
        .space-icon {
          font-size: 16px;
          flex-shrink: 0;
          opacity: 0.8;
        }
        
        .space-name {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .space-item.active .space-name {
          color: white;
        }
        
        .delete-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.2);
          opacity: 0;
          border-radius: 6px;
          transition: all 0.2s;
        }
        
        .space-item:hover .delete-btn {
          opacity: 1;
        }
        
        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
      `}</style>
    </div>
  )
}
