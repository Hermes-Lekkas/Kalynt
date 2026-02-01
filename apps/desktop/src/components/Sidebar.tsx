/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore, Space } from '../stores/appStore'
import { WorkspaceCategoryId, getCategoryById } from '../types/workspaceCategories'

import { FileText, Plus, User, ChevronLeft, Menu } from 'lucide-react'

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
        {!sidebarCollapsed && <span className="sidebar-title">Workspaces</span>}
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
        <div className="create-form animate-fadeIn">
          <div className="category-badge" style={{ background: getCategoryById(selectedCategory)?.color }}>
            {getCategoryById(selectedCategory)?.icon} {getCategoryById(selectedCategory)?.name}
          </div>
          <input
            type="text"
            className="input"
            placeholder="Workspace name"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSpace()
              if (e.key === 'Escape') handleCancelCreate()
            }}
            autoFocus
          />
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={handleCancelCreate}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSpace}>Create</button>
          </div>
        </div>
      )}

      <nav className="space-list">
        {spaces.length === 0 && !isCreating && (
          <div className="empty-state">
            <p>No workspaces yet</p>
            <button className="btn btn-secondary" onClick={handleCategorySelect}>
              Create workspace
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
          <div className="usage-info">
            <div className="usage-row">
              <span>API Keys</span>
              <span>{configuredKeys > 0 ? `${configuredKeys} configured` : 'None linked'}</span>
            </div>
            <div className="usage-row">
              <span>Spaces</span>
              <span>{spaces.length}</span>
            </div>
          </div>
        )}

        <div className="user-info">
          <div className="avatar">
            <User size={16} />
          </div>
          {!sidebarCollapsed && (
            <div className="user-details">
              {isEditingName ? (
                <input
                  type="text"
                  className="user-name-input"
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
                  title="Click to change name"
                >
                  {userName}
                </span>
              )}
              <span className="user-tier">Free Beta</span>
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
          background: var(--color-bg);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
          transition: width var(--transition-base);
          overflow: hidden;
        }

        .sidebar.collapsed {
          width: 60px;
        }
        
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4);
        }
        
        .sidebar-title {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        
        .header-actions {
          display: flex;
          gap: var(--space-1);
        }
        
        .add-btn {
          width: 28px;
          height: 28px;
        }
        
        .create-form {
          padding: 0 var(--space-3) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        
        .form-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
        }
        
        .form-actions .btn {
          height: 32px;
          font-size: var(--text-xs);
        }
        
        .category-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: white;
          box-shadow: var(--shadow-md);
        }
        
        .space-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 var(--space-2);
        }
        
        .empty-state {
          padding: var(--space-8) var(--space-4);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
        }
        
        .empty-state p {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
        
        .limit-notice {
          padding: var(--space-2) var(--space-3);
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .upgrade-link {
          color: var(--color-accent);
          font-size: var(--text-xs);
        }
        
        .upgrade-modal {
          position: absolute;
          bottom: 100px;
          left: var(--space-2);
          right: var(--space-2);
          background: var(--color-glass);
          backdrop-filter: blur(var(--backdrop-blur));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-xl);
          padding: var(--space-4);
          z-index: 100;
          box-shadow: var(--shadow-lg);
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }
        
        .close-btn {
          font-size: 16px;
          color: var(--color-text-muted);
        }
        
        .tier-option {
          width: 100%;
          display: flex;
          justify-content: space-between;
          padding: var(--space-2);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          margin-bottom: var(--space-1);
          transition: background var(--transition-fast);
        }
        
        .tier-option:hover:not(:disabled) {
          background: var(--color-surface-elevated);
        }
        
        .tier-option.current {
          background: var(--color-surface-elevated);
        }
        
        .tier-option .tier-name {
          color: var(--color-text);
        }
        
        .tier-option .tier-price {
          color: var(--color-text-muted);
        }
        
        .sidebar.collapsed .sidebar-header {
          padding: var(--space-4) 0;
          flex-direction: column;
          gap: var(--space-4);
          align-items: center;
        }

        .sidebar.collapsed .header-actions {
          flex-direction: column;
          align-items: center;
        }

        .mini-space-item {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-lg);
          margin: 4px auto;
          cursor: pointer;
          transition: all var(--transition-base);
          color: var(--color-text-muted);
          font-size: 18px;
        }

        .mini-space-item:hover {
          background: var(--color-glass);
          color: var(--color-text);
        }

        .mini-space-item.active {
          background: var(--color-glass-active);
          color: var(--color-accent-light);
          box-shadow: var(--shadow-sm);
        }

        .sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--color-border-subtle);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          align-items: stretch;
        }

        .sidebar.collapsed .sidebar-footer {
          align-items: center;
          padding: var(--space-4) 0;
        }
        
        .usage-info {
          padding: var(--space-3);
          background: var(--color-glass);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-lg);
        }
        
        .usage-row {
          display: flex;
          justify-content: space-between;
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          padding: 2px 0;
        }
        
        .user-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        
        .avatar {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-full);
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: var(--shadow-glow);
        }
        
        .user-details {
          display: flex;
          flex-direction: column;
        }
        
        .user-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }
        
        .user-name.clickable:hover {
          color: var(--color-accent);
          cursor: pointer;
        }

        .user-name-input {
          background: var(--color-surface-elevated);
          border: 1px solid var(--color-accent);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          padding: 2px 4px;
          width: 100%;
          outline: none;
        }
        
        .user-tier {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
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
        Ã—
      </button>
      <style>{`
        .space-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border-radius: var(--radius-lg);
          transition: all var(--transition-base);
          text-align: left;
          cursor: pointer;
          position: relative;
          margin-bottom: 2px;
        }
        
        .space-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 0;
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          transition: height var(--transition-base);
        }
        
        .space-item:hover {
          background: var(--color-glass);
        }
        
        .space-item.active {
          background: var(--color-glass-active);
        }

        .space-item.active::before {
          height: 60%;
        }
        
        .space-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          overflow: hidden;
        }
        
        .space-icon {
          font-size: 16px;
          flex-shrink: 0;
        }
        
        .space-name {
          font-size: var(--text-sm);
          color: var(--color-text);
          font-weight: var(--font-medium);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .space-item.active .space-name {
          font-weight: var(--font-semibold);
          color: var(--color-accent-light);
        }
        
        .delete-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: var(--color-text-muted);
          opacity: 0;
          border-radius: var(--radius-md);
          transition: all var(--transition-base);
        }
        
        .space-item:hover .delete-btn {
          opacity: 1;
        }
        
        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--color-error);
        }
      `}</style>
    </div>
  )
}
