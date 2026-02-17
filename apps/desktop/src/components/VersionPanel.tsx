/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Version History Panel - Unified Document & Git History
import { useState, useEffect, useMemo, useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import { versionControlService, Version } from '../services/versionControlService'
import { 
  Search, GitBranch, History, ChevronRight, X, Trash2, Download, 
  GitCommit, Layers,
  Clock, Tag, CheckSquare, Square,
  MoreVertical, Merge, ArrowUpRight,
  Shield, CheckCircle2, ExternalLink, Flag, Plus, Check, Zap
} from 'lucide-react'
import { useNotificationStore } from '../stores/notificationStore'
import './VersionPanel.css'

const electron = window.electronAPI

interface HistoryItem {
  id: string
  type: 'document' | 'git' | 'auto' | 'merge' | 'manual'
  label: string
  description: string
  author: string
  timestamp: number
  branch: string
  hash?: string
  tags?: string[]
}

export default function VersionPanel() {
  const { currentSpace, userName } = useAppStore()
  const { addNotification } = useNotificationStore()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [currentBranch, setCurrentBranch] = useState('main')
  const [branches, setBranches] = useState<string[]>(['main'])
  const [showCreateVersion, setShowCreateVersion] = useState(false)
  const [versionLabel, setVersionLabel] = useState('')
  const [versionDesc, setVersionDesc] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [showBranchInput, setShowBranchInput] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [historyType, setHistoryType] = useState<'all' | 'document' | 'git' | 'auto'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)

  // Diff View State
  const [showDiff, setShowDiff] = useState(false)
  const [diffData, setDiffData] = useState<{
    original: string,
    modified: string,
    vLabel: string,
    parentLabel: string,
    type: string
  } | null>(null)

  const loadHistory = useCallback(async () => {
    if (!currentSpace) return

    // 1. Load Document Versions
    const docTimeline = versionControlService.getTimeline(currentSpace.id).map(v => ({
      id: v.id,
      type: v.type as any,
      label: v.label,
      description: v.description,
      author: v.author,
      timestamp: v.timestamp,
      branch: v.branch,
      tags: v.tags
    }))

    // 2. Load Git History
    let gitTimeline: HistoryItem[] = []
    if (window.electronAPI?.git) {
      try {
        const result = await window.electronAPI.git.log({ 
          repoPath: currentSpace.id, 
          maxCount: 30 
        })
        if (result?.success && result.log?.all) {
          gitTimeline = result.log.all.map((c: any) => ({
            id: c.hash,
            type: 'git' as const,
            label: c.message,
            description: `Commit by ${c.author_name}`,
            author: c.author_name,
            timestamp: new Date(c.date).getTime(),
            branch: currentBranch,
            hash: c.hash
          }))
        }
      } catch (e) {
        console.debug('Git history not available')
      }
    }

    // Merge and Sort
    const combined = [...docTimeline, ...gitTimeline].sort((a, b) => b.timestamp - a.timestamp)
    setItems(combined)
    
    // Load Branches
    setBranches(versionControlService.getBranches(currentSpace.id))
    setCurrentBranch(versionControlService.getCurrentBranch(currentSpace.id))
  }, [currentSpace, currentBranch])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredItems = useMemo(() => {
    let result = items
    if (historyType !== 'all') {
      result = result.filter(item => {
        if (historyType === 'document') return item.type === 'document' || item.type === 'manual'
        return item.type === historyType
      })
    }
    if (!filterQuery) return result
    const lower = filterQuery.toLowerCase()
    return result.filter(v =>
      v.label.toLowerCase().includes(lower) ||
      v.description.toLowerCase().includes(lower) ||
      v.author.toLowerCase().includes(lower) ||
      v.hash?.toLowerCase().includes(lower) ||
      v.tags?.some(t => t.toLowerCase().includes(lower))
    )
  }, [items, filterQuery, historyType])

  // Group items by date
  const groupedItems = useMemo(() => {
    const groups: { [date: string]: HistoryItem[] } = {}
    filteredItems.forEach(item => {
      const date = new Date(item.timestamp).toLocaleDateString(undefined, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    })
    return groups
  }, [filteredItems])

  const handleCreateVersion = () => {
    if (!currentSpace || !versionLabel.trim()) return

    versionControlService.createVersion(
      currentSpace.id,
      versionLabel.trim(),
      versionDesc.trim(),
      'local-user',
      userName
    )

    setVersionLabel('')
    setVersionDesc('')
    setShowCreateVersion(false)
    loadHistory()
    addNotification('Document save point created', 'success')
  }

  const handleRestore = (versionId: string) => {
    if (!currentSpace) return
    if (confirm('Restore the editor to this version? This will replace the current document content.')) {
      const success = versionControlService.restoreVersion(currentSpace.id, versionId)
      if (success) {
        loadHistory()
        addNotification('Document state restored', 'info')
      }
    }
  }

  const handleBulkDelete = () => {
    if (!currentSpace || selectedIds.size === 0) return
    if (confirm(`Delete ${selectedIds.size} versions? This cannot be undone.`)) {
      selectedIds.forEach(id => {
        versionControlService.deleteVersion(currentSpace.id, id)
      })
      setSelectedIds(new Set())
      setIsSelectionMode(false)
      loadHistory()
      addNotification(`Deleted ${selectedIds.size} versions`, 'success')
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const handleCompare = async (item: HistoryItem) => {
    if (!currentSpace) return

    if (item.type !== 'git') {
      const currentVersion = versionControlService.getVersion(currentSpace.id, item.id)
      if (!currentVersion) return

      let prevVersion: Version | undefined
      const docItems = items.filter(i => i.type !== 'git')
      const currentIndex = docItems.findIndex(v => v.id === item.id)
      if (currentIndex < docItems.length - 1) {
        const prevId = docItems[currentIndex + 1].id
        prevVersion = versionControlService.getVersion(currentSpace.id, prevId)
      }

      const comparison = versionControlService.compareVersions(
        currentSpace.id,
        prevVersion?.id || item.id,
        item.id
      )

      if (comparison) {
        setDiffData({
          original: comparison.aContent,
          modified: comparison.bContent,
          vLabel: currentVersion.label,
          parentLabel: prevVersion?.label || 'Empty',
          type: item.type
        })
        setShowDiff(true)
      }
    }
  }

  const handlePromoteToGit = async (item: HistoryItem) => {
    if (!currentSpace || isPromoting || item.type === 'git') return
    
    setIsPromoting(true)
    try {
      const version = versionControlService.getVersion(currentSpace.id, item.id)
      if (!version) throw new Error('Version not found')

      // 1. Restore the document content to the editor
      versionControlService.restoreVersion(currentSpace.id, item.id)
      
      // 2. Commit to Git
      const message = `[Promoted] ${item.label}: ${item.description || 'Synced from document history'}`
      const result = await window.electronAPI?.git.commit({
        repoPath: currentSpace.id,
        message
      })

      if (result?.success) {
        addNotification('Successfully promoted to Git commit', 'success')
        loadHistory()
      } else {
        addNotification(`Promotion failed: ${result?.error || 'Unknown error'}`, 'error')
      }
    } catch (e) {
      addNotification(`Error: ${String(e)}`, 'error')
    } finally {
      setIsPromoting(false)
    }
  }

  const handleCreateBranch = () => {
    if (!currentSpace || !newBranchName.trim()) return
    const success = versionControlService.createBranch(currentSpace.id, newBranchName.trim())
    if (success) {
      setBranches(versionControlService.getBranches(currentSpace.id))
      setNewBranchName('')
      setShowBranchInput(false)
      handleSwitchBranch(newBranchName.trim())
      addNotification(`Branched to ${newBranchName.trim()}`, 'success')
    } else alert('Branch already exists')
  }

  const handleSwitchBranch = (branch: string) => {
    if (!currentSpace) return
    versionControlService.switchBranch(currentSpace.id, branch)
    setCurrentBranch(branch)
    loadHistory()
  }

  const handleBackup = async () => {
    if (isBackingUp) return
    setIsBackingUp(true)
    try {
      const result = await (electron as any).fs.backupWorkspace()
      if (result.success) addNotification('Workspace backup successful', 'success')
    } finally { setIsBackingUp(false) }
  }

  const getAuthorColor = (name: string) => {
    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899']
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const closeDiff = () => {
    setShowDiff(false)
    setTimeout(() => setDiffData(null), 100)
  }

  if (!currentSpace) {
    return (
      <div className="version-panel empty-state">
        <div className="empty-content">
          <History size={64} className="pulse-icon opacity-10" />
          <h3>No Workspace Selected</h3>
          <p>Open a space to access local snapshots and Git history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="version-panel">
      {/* Premium Header */}
      <div className="version-header">
        <div className="header-top">
          <div className="header-title">
            <div className="tab-icon"><History size={20} className="text-blue-500" /></div>
            <div>
              <h2>History</h2>
              <span className="subtitle">Secure Audit Trail</span>
            </div>
          </div>

          <div className="header-toolbar">
            <div className="search-group">
              <div className="premium-search">
                <Search size={14} className="search-icon" />
                <input 
                  placeholder="Search timeline..." 
                  value={filterQuery}
                  onChange={e => setFilterQuery(e.target.value)}
                />
              </div>
              <div className="type-pills">
                {(['all', 'document', 'git', 'auto'] as const).map(t => (
                  <button 
                    key={t}
                    className={historyType === t ? 'active' : ''} 
                    onClick={() => setHistoryType(t)}
                  >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className="toolbar-actions">
              <button className="btn-icon-glass" onClick={handleBackup} title="System Backup"><Download size={16} /></button>
              <button className={`btn-icon-glass ${isSelectionMode ? 'active' : ''}`} onClick={() => setIsSelectionMode(!isSelectionMode)} title="Batch Actions">
                {isSelectionMode ? <X size={16} /> : <CheckSquare size={16} />}
              </button>
              <button className="btn-primary-gradient" onClick={() => setShowCreateVersion(true)}>
                <Zap size={14} />
                <span>Checkpoint</span>
              </button>
            </div>
          </div>
        </div>

        <div className="header-sub">
          <div className="branch-chip">
            <GitBranch size={14} className="text-blue-400" />
            <select value={currentBranch} onChange={e => handleSwitchBranch(e.target.value)}>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button className="add-branch-btn" onClick={() => setShowBranchInput(true)}><Plus size={12} /></button>
          </div>

          <div className="integrity-badge">
            <Shield size={12} />
            <span>Encrypted History</span>
          </div>

          {isSelectionMode && selectedIds.size > 0 && (
            <div className="selection-bar animate-reveal-up">
              <span>{selectedIds.size} selected</span>
              <button className="btn-danger-compact" onClick={handleBulkDelete}><Trash2 size={12} /> Purge</button>
            </div>
          )}
        </div>
      </div>

      {showBranchInput && (
        <div className="inline-input-row animate-reveal-up">
          <div className="input-with-icon">
            <GitBranch size={14} className="opacity-30" />
            <input 
              autoFocus 
              placeholder="New branch name..." 
              value={newBranchName} 
              onChange={e => setNewBranchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
            />
          </div>
          <div className="input-actions">
            <button className="confirm" onClick={handleCreateBranch}><Check size={14} /></button>
            <button className="cancel" onClick={() => setShowBranchInput(false)}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="history-scroller">
        {Object.keys(groupedItems).length === 0 ? (
          <div className="empty-results">
            <Layers size={48} className="opacity-10 mb-4" />
            <p>No matches found in your history.</p>
          </div>
        ) : (
          <div className="history-timeline">
            {Object.entries(groupedItems).map(([date, dayItems]) => (
              <div key={date} className="timeline-group">
                <div className="date-header">
                  <span className="date-text">{date}</span>
                  <div className="date-line" />
                </div>

                {dayItems.map((item) => (
                  <div 
                    key={item.id} 
                    className={`timeline-item ${item.type} ${isSelectionMode ? 'selectable' : ''} ${selectedIds.has(item.id) ? 'selected' : ''}`}
                    onClick={() => isSelectionMode && toggleSelection(item.id)}
                  >
                    <div className="item-marker">
                      <div className={`marker-dot ${item.type}`}>
                        {item.type === 'git' ? <GitCommit size={10} /> : item.type === 'manual' || item.type === 'document' ? <Flag size={10} /> : <Clock size={10} />}
                      </div>
                      <div className="marker-line" />
                    </div>

                    <div className="item-content">
                      <div className="item-card">
                        <div className="card-body">
                          <div className="card-left">
                            {isSelectionMode && (
                              <div className="checkbox-col">
                                {selectedIds.has(item.id) ? <CheckCircle2 size={16} className="text-blue-500" /> : <Square size={16} className="opacity-10" />}
                              </div>
                            )}
                            <div className="author-avatar" style={{ backgroundColor: getAuthorColor(item.author) }}>
                              {item.author[0].toUpperCase()}
                            </div>
                            <div className="item-info">
                              <div className="label-line">
                                <span className="item-label">{item.label}</span>
                                {item.hash && <span className="git-hash">{item.hash.substring(0, 7)}</span>}
                                {item.type === 'auto' && <span className="type-badge auto">Snapshot</span>}
                                {item.type === 'merge' && <span className="type-badge merge"><Merge size={8} /> Merge</span>}
                              </div>
                              <div className="meta-line">
                                <span className="author-name">{item.author}</span>
                                <span>â€¢</span>
                                <span className="item-time">{formatTime(item.timestamp)}</span>
                                {item.tags?.map(t => <span key={t} className="tag-pill"><Tag size={8} /> {t}</span>)}
                              </div>
                            </div>
                          </div>

                          <div className="card-actions">
                            <button className="btn-card-action" onClick={(e) => { e.stopPropagation(); handleCompare(item); }}>Diff</button>
                            {item.type !== 'git' ? (
                              <>
                                <button className="btn-card-action primary" onClick={(e) => { e.stopPropagation(); handleRestore(item.id); }}>Restore</button>
                                <button 
                                  className="btn-card-action highlight" 
                                  onClick={(e) => { e.stopPropagation(); handlePromoteToGit(item); }}
                                  title="Commit this version to Git"
                                  disabled={isPromoting}
                                >
                                  <ArrowUpRight size={14} />
                                </button>
                              </>
                            ) : (
                              <button className="btn-card-action disabled" disabled><ExternalLink size={12} /></button>
                            )}
                            <div className="more-menu">
                              <button className="btn-icon-subtle"><MoreVertical size={14} /></button>
                            </div>
                          </div>
                        </div>
                        {item.description && <div className="card-footer-desc">{item.description}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateVersion && (
        <div className="modern-modal-overlay" onClick={() => setShowCreateVersion(false)}>
          <div className="modern-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <Zap size={18} className="text-blue-500" />
                <h3>Manual Save Point</h3>
              </div>
              <button className="close-btn" onClick={() => setShowCreateVersion(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Checkpoint Label</label>
                <input 
                  autoFocus 
                  placeholder="e.g. Completed API integration" 
                  value={versionLabel}
                  onChange={e => setVersionLabel(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Activity Notes</label>
                <textarea 
                  rows={3}
                  placeholder="Document your changes for the team..." 
                  value={versionDesc}
                  onChange={e => setVersionDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowCreateVersion(false)}>Cancel</button>
              <button className="btn-premium" onClick={handleCreateVersion} disabled={!versionLabel.trim()}>Create Checkpoint</button>
            </div>
          </div>
        </div>
      )}

      {showDiff && diffData && (
        <div className="fullscreen-diff-overlay">
          <div className="diff-window animate-reveal-up">
            <div className="diff-top">
              <div className="diff-context">
                <Layers size={18} className="text-blue-500" />
                <div className="diff-path">
                  <span className="p-orig">{diffData.parentLabel}</span>
                  <ChevronRight size={14} className="opacity-30" />
                  <span className="p-mod">{diffData.vLabel}</span>
                </div>
              </div>
              <button className="close-diff" onClick={closeDiff}><X size={20} /></button>
            </div>
            <div className="diff-viewer">
              <DiffEditor
                height="100%"
                original={diffData.original}
                modified={diffData.modified}
                language="markdown"
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                  padding: { top: 20 }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
