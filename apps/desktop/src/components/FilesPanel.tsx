/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Files Panel - P2P File Sharing with Tiered Transfer
import { useState, useRef, useEffect, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { usePermissions } from '../hooks/usePermissions'
import { fileTransferService, SharedFile, TransferTier } from '../services/fileTransferService'
import { PeerInfo } from '../services/p2pService'
import {
  File,
  Upload,
  Trash2,
  Download,
  Search,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  Package,
  FileCode,
  AlertCircle,
  Users,
  Globe,
  HardDrive,
  Zap,
  Layers,
  Server,
  ChevronDown,
  Loader2
} from 'lucide-react'
import './FilesPanel.css'

export default function FilesPanel() {
  const { currentSpace } = useAppStore()
  const { isBanned, canManageFiles, isAdmin } = usePermissions()
  const [files, setFiles] = useState<SharedFile[]>([])
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier, setSelectedTier] = useState<TransferTier>('small')
  const [showTierMenu, setShowTierMenu] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tierMenuRef = useRef<HTMLDivElement>(null)

  const canModify = canManageFiles && !isBanned

  // Initialize P2P file transfer when space changes
  useEffect(() => {
    if (!currentSpace || isBanned) return

    fileTransferService.init(currentSpace.id, currentSpace.id)
    fileTransferService.setCallbacks(
      (sharedFiles) => setFiles(sharedFiles),
      (connectedPeers) => setPeers(connectedPeers),
      (fileId, progress) => setUploadProgress(prev => ({ ...prev, [fileId]: progress }))
    )

    setFiles(fileTransferService.getFiles())
    setPeers(fileTransferService.getPeers())

    return () => fileTransferService.destroy()
  }, [currentSpace?.id, isBanned])

  // Close tier menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierMenuRef.current && !tierMenuRef.current.contains(e.target as Node)) {
        setShowTierMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    return files.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [files, searchQuery])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  const handleFiles = async (fileList: FileList) => {
    setIsUploading(true)

    for (const file of Array.from(fileList)) {
      const result = await fileTransferService.shareFile(file, 'You', selectedTier)

      if (!result.success) {
        alert(`Failed to share ${file.name}: ${result.error}`)
      } else if (result.actualTier !== selectedTier) {
        // Show fallback notification
        const tierInfo = fileTransferService.getTierInfo(result.actualTier!)
        console.log(`[FileTransfer] Auto-upgraded to ${tierInfo.label} tier for ${file.name}`)
      }
    }

    setIsUploading(false)
    setFiles(fileTransferService.getFiles())

    // Clear file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = (fileId: string) => {
    // Linked to system Role System: isAdmin is true for 'owner' and 'admin' roles
    if (!globalThis.window.confirm('Remove this shared file?')) return

    if (fileTransferService.removeFile(fileId, isAdmin)) {
      setFiles(fileTransferService.getFiles())
    } else {
      alert('You can only delete files you shared.')
    }
  }

  const handleClearAll = () => {
    if (!globalThis.window.confirm('Are you sure you want to clear ALL shared files? This cannot be undone.')) return
    if (fileTransferService.clearAllFiles()) {
      setFiles([])
    }
  }

  const handleDownload = async (file: SharedFile) => {
    await fileTransferService.downloadFile(file)
  }

  const formatSize = (bytes: number): string => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return '0 B'
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getFileIcon = (type: string | undefined) => {
    if (!type) return <File size={20} />
    const lowerType = type.toLowerCase()
    if (lowerType.startsWith('image/')) return <ImageIcon size={20} />
    if (lowerType.startsWith('video/')) return <Video size={20} />
    if (lowerType.startsWith('audio/')) return <Music size={20} />
    if (lowerType.includes('pdf')) return <FileText size={20} />
    if (lowerType.includes('zip') || lowerType.includes('rar')) return <Package size={20} />
    if (lowerType.includes('json') || lowerType.includes('javascript')) return <FileCode size={20} />
    return <File size={20} />
  }

  const getTierIcon = (tier: TransferTier) => {
    switch (tier) {
      case 'small': return <Zap size={14} />
      case 'medium': return <Layers size={14} />
      case 'large': return <Server size={14} />
    }
  }

  const tierOptions: TransferTier[] = ['small', 'medium', 'large']

  if (!currentSpace) {
    return (
      <div className="files-panel empty">
        <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <p>Select a space to share files</p>
      </div>
    )
  }

  if (isBanned) {
    return (
      <div className="files-panel empty banned">
        <AlertCircle size={48} className="banned-icon" color="#ef4444" />
        <h3>Access Denied</h3>
        <p>You have been banned from this space.</p>
      </div>
    )
  }

  return (
    <div className="files-panel">
      <div className="files-header">
        <div className="header-left">
          <h2><Globe size={18} /> P2P Files</h2>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="search-icon-overlay">
              <Search size={14} />
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="peers-indicator" title={peers.length > 0 ? peers.map(p => p.name).join(', ') : 'No peers connected'}>
            <Users size={14} />
            <span>{peers.length} online</span>
          </div>

          {canModify && (
            <div className="upload-controls" ref={tierMenuRef}>
              {/* Clear All for Admins Only (Owner/Admin roles) */}
              {isAdmin && files.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleClearAll}
                  style={{ marginRight: '8px', color: '#ef4444' }}
                  title="Clear All Files"
                >
                  <Trash2 size={14} /> Clear All
                </button>
              )}

              {/* Tier Selector Dropdown */}
              <button
                className="tier-selector"
                onClick={() => setShowTierMenu(!showTierMenu)}
                title="Select transfer mode"
              >
                {getTierIcon(selectedTier)}
                <span>{fileTransferService.getTierInfo(selectedTier).label}</span>
                <ChevronDown size={12} />
              </button>

              {showTierMenu && (
                <div className="tier-menu">
                  {tierOptions.map(tier => {
                    const info = fileTransferService.getTierInfo(tier)
                    return (
                      <button
                        key={tier}
                        className={`tier-option ${selectedTier === tier ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedTier(tier)
                          setShowTierMenu(false)
                        }}
                      >
                        {getTierIcon(tier)}
                        <div className="tier-option-info">
                          <span className="tier-option-label">{info.label}</span>
                          <span className="tier-option-desc">{info.description}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Upload Button */}
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Share File"
              >
                {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                Share
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="version-info-banner">
        <Globe size={14} />
        <span>Files sync directly between peers. <b>No server.</b> Auto-fallback if file exceeds selected tier.</span>
      </div>

      <div className="files-content">
        {canModify && (
          <div
            className={`drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} className="drop-zone-icon" />
            <div style={{ textAlign: 'center' }}>
              <div className="drop-text">Click to share or drag and drop</div>
              <div className="drop-subtext">
                {selectedTier === 'small' && 'â‰¤5MB instant sync'}
                {selectedTier === 'medium' && 'â‰¤50MB chunked transfer'}
                {selectedTier === 'large' && 'â‰¤200MB streaming'}
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInput}
              style={{ display: 'none' }}
              multiple
            />
          </div>
        )}

        <div className="files-list-container">
          {filteredFiles.length === 0 ? (
            <div className="empty-files">
              <Globe size={48} style={{ opacity: 0.2 }} />
              <p>No shared files yet</p>
              {canModify && <span className="drop-subtext">Share a file to send it to connected peers</span>}
            </div>
          ) : (
            <div className="files-grid">
              {filteredFiles.map(file => (
                <div key={file.id} className={`file-card ${file.isLocal ? 'local' : 'remote'}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="file-icon-wrapper">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="file-actions">
                      <button
                        className="action-btn"
                        title="Download"
                        onClick={() => handleDownload(file)}
                      >
                        <Download size={14} />
                      </button>
                      {/* Show delete if it's your file OR you are an Admin */}
                      {(file.isLocal || isAdmin) && (
                        <button
                          className="action-btn delete"
                          title="Remove"
                          onClick={() => handleDelete(file.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for uploads */}
                  {uploadProgress[file.id] !== undefined && uploadProgress[file.id] < 100 && (
                    <div className="upload-progress">
                      <div className="progress-bar" style={{ width: `${uploadProgress[file.id]}%` }} />
                    </div>
                  )}

                  <div className="file-info">
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <span className="file-meta">
                      {formatSize(file.size)} â€¢ {formatTime(file.uploadedAt)}
                    </span>
                    <span className="file-source">
                      {file.isLocal ? (
                        <><HardDrive size={10} /> You</>
                      ) : (
                        <><Globe size={10} /> {file.uploadedBy}</>
                      )}
                      <span className="tier-badge">{getTierIcon(file.tier)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
