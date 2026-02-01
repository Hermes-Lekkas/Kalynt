/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Version History Panel - Shows document versions and allows restoring
import { useState, useEffect, useMemo } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import { versionControlService, Version } from '../services/versionControlService'
import { Search, GitBranch, History, ChevronRight, X, Trash2, Download, Info } from 'lucide-react'
import './VersionPanel.css'

const electron = window.electronAPI

interface VersionItem {
  id: string
  label: string
  description: string
  author: string
  timestamp: number
  branch: string
}

export default function VersionPanel() {
  const { currentSpace } = useAppStore()
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [currentBranch, setCurrentBranch] = useState('main')
  const [branches, setBranches] = useState<string[]>(['main'])
  const [showCreateVersion, setShowCreateVersion] = useState(false)
  const [versionLabel, setVersionLabel] = useState('')
  const [versionDesc, setVersionDesc] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [showBranchInput, setShowBranchInput] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)

  // Diff View State
  const [showDiff, setShowDiff] = useState(false)
  const [diffData, setDiffData] = useState<{
    original: string,
    modified: string,
    vLabel: string,
    parentLabel: string
  } | null>(null)

  const userId = 'local-user'
  const userName = 'You'

  useEffect(() => {
    if (currentSpace) {
      loadVersions()
      loadBranches()
    }
  }, [currentSpace])

  const loadBranches = () => {
    if (!currentSpace) return
    setBranches(versionControlService.getBranches(currentSpace.id))
    setCurrentBranch(versionControlService.getCurrentBranch(currentSpace.id))
  }

  const loadVersions = () => {
    if (!currentSpace) return
    const timeline = versionControlService.getTimeline(currentSpace.id)
    setVersions(timeline)
  }

  const filteredVersions = useMemo(() => {
    if (!filterQuery) return versions
    const lower = filterQuery.toLowerCase()
    return versions.filter(v =>
      v.label.toLowerCase().includes(lower) ||
      v.description.toLowerCase().includes(lower) ||
      v.author.toLowerCase().includes(lower)
    )
  }, [versions, filterQuery])

  const handleCreateVersion = () => {
    if (!currentSpace || !versionLabel.trim()) return

    versionControlService.createVersion(
      currentSpace.id,
      versionLabel.trim(),
      versionDesc.trim(),
      userId,
      userName
    )

    setVersionLabel('')
    setVersionDesc('')
    setShowCreateVersion(false)
    loadVersions()
  }

  const handleRestore = (versionId: string) => {
    if (!currentSpace) return
    if (confirm('Restore the editor to this version? This will replace the current document content.')) {
      const success = versionControlService.restoreVersion(currentSpace.id, versionId)
      if (success) {
        loadVersions()
      }
    }
  }

  const handleDeleteVersion = (versionId: string) => {
    if (!currentSpace) return
    if (confirm('Delete this version? This cannot be undone.')) {
      versionControlService.deleteVersion(currentSpace.id, versionId)
      loadVersions()
      loadBranches()
    }
  }

  const handleCompare = (versionId: string) => {
    if (!currentSpace) return

    const currentVersion = versionControlService.getVersion(currentSpace.id, versionId)
    if (!currentVersion) return

    let prevVersion: Version | undefined
    const currentIndex = versions.findIndex(v => v.id === versionId)
    if (currentIndex < versions.length - 1) {
      const prevId = versions[currentIndex + 1].id
      prevVersion = versionControlService.getVersion(currentSpace.id, prevId)
    }

    const comparison = versionControlService.compareVersions(
      currentSpace.id,
      prevVersion?.id || versionId,
      versionId
    )

    if (comparison) {
      setDiffData({
        original: comparison.aContent,
        modified: comparison.bContent,
        vLabel: currentVersion.label,
        parentLabel: prevVersion?.label || 'Previous'
      })
      setShowDiff(true)
    }
  }

  const handleCreateBranch = () => {
    if (!currentSpace || !newBranchName.trim()) return

    const name = newBranchName.trim()
    const success = versionControlService.createBranch(currentSpace.id, name)

    if (success) {
      setBranches(versionControlService.getBranches(currentSpace.id))
      setNewBranchName('')
      setShowBranchInput(false)
      // Auto switch to new branch
      handleSwitchBranch(name)
    } else {
      alert('Branch already exists')
    }
  }

  const handleSwitchBranch = (branch: string) => {
    if (!currentSpace) return
    versionControlService.switchBranch(currentSpace.id, branch)
    setCurrentBranch(branch)
    loadVersions()
  }

  const handleBackup = async () => {
    if (isBackingUp) return
    setIsBackingUp(true)
    try {
      const result = await (electron as any).fs.backupWorkspace()
      if (result.success) {
        alert(`Backup created successfully!`)
      } else {
        alert(`Backup failed: ${result.error}`)
      }
    } catch (err) {
      alert(`Backup failed: ${err}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - ts

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const closeDiff = () => {
    // Close modal first, then clear data to ensure proper cleanup
    setShowDiff(false)
    setTimeout(() => setDiffData(null), 100)
  }

  if (!currentSpace) {
    return (
      <div className="version-panel empty">
        <History size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
        <p>Select a space to view version history</p>
      </div>
    )
  }

  return (
    <div className="version-panel">
      <div className="version-header">
        <div className="header-left">
          <h2><History size={18} /> History</h2>

          <div className="search-input-wrapper">
            <Search size={14} className="search-icon-overlay" />
            <input
              className="search-input"
              placeholder="Filter..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
            />
          </div>

          <div className="branch-controls">
            {showBranchInput ? (
              <div className="glass-input-group">
                <input
                  autoFocus
                  className="search-input"
                  style={{ width: 120 }}
                  placeholder="Branch name..."
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
                />
                <button className="btn-icon small" onClick={handleCreateBranch}><GitBranch size={14} /></button>
                <button className="btn-icon small" onClick={() => setShowBranchInput(false)}><X size={14} /></button>
              </div>
            ) : (
              <>
                <select
                  className="branch-select"
                  value={currentBranch}
                  onChange={(e) => handleSwitchBranch(e.target.value)}
                >
                  {branches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button className="btn-icon" onClick={() => setShowBranchInput(true)} title="New branch">
                  <GitBranch size={16} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn btn-secondary"
            onClick={handleBackup}
            disabled={isBackingUp}
          >
            <Download size={16} /> {isBackingUp ? 'Backing up...' : 'Full Backup'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateVersion(true)}
          >
            Save Version
          </button>
        </div>
      </div>

      {showCreateVersion && (
        <div className="create-version-overlay" onClick={() => setShowCreateVersion(false)}>
          <div className="create-version-form" onClick={e => e.stopPropagation()}>
            <div className="form-title">Save Version</div>
            <input
              type="text"
              className="search-input"
              placeholder="Version name (e.g., v1.0, Stable)"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              autoFocus
            />
            <textarea
              className="search-input"
              style={{ height: 80, resize: 'none' }}
              placeholder="What changed? (optional description)"
              value={versionDesc}
              onChange={(e) => setVersionDesc(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreateVersion(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateVersion}
                disabled={!versionLabel.trim()}
              >
                Create Version
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="version-info-banner">
        <Info size={14} />
        <span>Tracks document content only. Use <b>Full Backup</b> for all files.</span>
      </div>

      <div className="version-list">
        {filteredVersions.length === 0 ? (
          <div className="empty-versions">
            <History size={32} style={{ opacity: 0.3 }} />
            <p>{filterQuery ? 'No matching versions found' : 'No versions yet'}</p>
            {!filterQuery && <span className="hint">Save a version to track document history</span>}
          </div>
        ) : (
          filteredVersions.map((v, i) => (
            <div key={v.id} className={`version-item ${i === 0 ? 'latest' : ''}`}>
              <div className="version-timeline">
                <span className="timeline-dot" />
                {i < filteredVersions.length - 1 && <span className="timeline-line" />}
              </div>

              <div className="version-card">
                <div className="version-header-row">
                  <div className="version-info">
                    <span className="version-label">{v.label}</span>
                    <div className="version-meta">
                      <span className="version-author">{v.author}</span>
                      <span>â€¢</span>
                      <span className="version-time">{formatTime(v.timestamp)}</span>
                    </div>
                  </div>
                  <div className="card-header-actions">
                    {v.branch !== 'main' && (
                      <span className="version-badge branch">{v.branch}</span>
                    )}
                    <button
                      className="delete-button-pill"
                      onClick={() => handleDeleteVersion(v.id)}
                      title="Delete version"
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {v.description && (
                  <p className="version-desc">{v.description}</p>
                )}

                <div className="card-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => handleCompare(v.id)}
                    title="Compare with previous version"
                  >
                    Compare
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => handleRestore(v.id)}
                    title="Restore this version"
                  >
                    Restore
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showDiff && diffData && (
        <div className="diff-modal-overlay" onClick={closeDiff}>
          <div className="diff-modal" onClick={e => e.stopPropagation()}>
            <div className="diff-header">
              <div className="diff-title">
                <span>Comparing changes</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="diff-tag">{diffData.parentLabel}</span>
                  <ChevronRight size={14} color="#666" />
                  <span className="diff-tag" style={{ border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
                    {diffData.vLabel}
                  </span>
                </div>
              </div>
              <button className="btn-icon" onClick={closeDiff}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
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
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  automaticLayout: true
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
