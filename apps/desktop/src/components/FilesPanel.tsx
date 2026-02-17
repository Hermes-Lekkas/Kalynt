/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Files Panel - P2P File Sharing with Tiered Transfer
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { usePermissions } from '../hooks/usePermissions'
import { fileTransferService, SharedFile, TransferTier } from '../services/fileTransferService'
import { PeerInfo } from '../services/p2pService'
import {
  File, Upload, Trash2, Download, Search, FolderOpen,
  Image as ImageIcon, FileText, Video, Package,
  FileCode, Globe, Zap,
  Layers, Server, Loader2, 
  Calendar, ArrowUpDown,
  Share2, Grid, List
} from 'lucide-react'
import { useNotificationStore } from '../stores/notificationStore'
import './FilesPanel.css'

type FileCategory = 'all' | 'images' | 'documents' | 'media' | 'archives' | 'code'

export default function FilesPanel() {
  const { currentSpace, userName } = useAppStore()
  const { addNotification } = useNotificationStore()
  const { isBanned, canManageFiles, isAdmin } = usePermissions()
  const [files, setFiles] = useState<SharedFile[]>([])
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier] = useState<TransferTier>('small')
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all')
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tierMenuRef = useRef<HTMLDivElement>(null)

  const canModify = canManageFiles && !isBanned

  // Initialize P2P file transfer
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierMenuRef.current && !tierMenuRef.current.contains(e.target as Node)) {
        // setShowTierMenu was removed
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const categorizeFile = (type: string): FileCategory => {
    const t = type.toLowerCase()
    if (t.startsWith('image/')) return 'images'
    if (t.includes('pdf') || t.includes('word') || t.includes('text') || t.includes('excel')) return 'documents'
    if (t.startsWith('video/') || t.startsWith('audio/')) return 'media'
    if (t.includes('zip') || t.includes('rar') || t.includes('tar') || t.includes('7z')) return 'archives'
    if (t.includes('json') || t.includes('javascript') || t.includes('python') || t.includes('code')) return 'code'
    return 'all'
  }

  const filteredAndSortedFiles = useMemo(() => {
    let result = files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = activeCategory === 'all' || categorizeFile(file.type) === activeCategory
      return matchesSearch && matchesCategory
    })

    result.sort((a, b) => {
      if (sortBy === 'date') return b.uploadedAt - a.uploadedAt
      if (sortBy === 'size') return b.size - a.size
      return a.name.localeCompare(b.name)
    })

    return result
  }, [files, searchQuery, activeCategory, sortBy])

  // Grouping by Date
  const groupedFiles = useMemo(() => {
    const groups: Record<string, SharedFile[]> = {}
    filteredAndSortedFiles.forEach(file => {
      const date = new Date(file.uploadedAt).toLocaleDateString(undefined, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(file)
    })
    return groups
  }, [filteredAndSortedFiles])

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    setIsUploading(true)
    let successCount = 0

    for (const file of Array.from(fileList)) {
      const result = await fileTransferService.shareFile(file as File, userName, selectedTier)
      if (result.success) {
        successCount++
      } else {
        addNotification(`Failed to share ${file.name}: ${result.error}`, 'error')
      }
    }

    if (successCount > 0) {
      addNotification(`Shared ${successCount} file${successCount > 1 ? 's' : ''} with peers`, 'success')
    }

    setIsUploading(false)
    setFiles(fileTransferService.getFiles())
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [userName, selectedTier, addNotification])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  const handleDelete = (fileId: string) => {
    if (!globalThis.window.confirm('Remove this shared file?')) return
    if (fileTransferService.removeFile(fileId, isAdmin)) {
      setFiles(fileTransferService.getFiles())
      addNotification('File removed', 'info')
    }
  }

  const handleClearAll = () => {
    if (!globalThis.window.confirm('Clear ALL shared files in this space?')) return
    if (fileTransferService.clearAllFiles()) {
      setFiles([])
      addNotification('Storage cleared', 'success')
    }
  }

  const handleDownload = async (file: SharedFile) => {
    addNotification(`Downloading ${file.name}...`, 'info')
    const success = await fileTransferService.downloadFile(file)
    if (success) {
      addNotification(`Downloaded ${file.name}`, 'success')
    } else {
      addNotification(`Failed to download ${file.name}`, 'error')
    }
  }

  const formatSize = (bytes: number): string => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getFileIcon = (type: string | undefined) => {
    const cat = categorizeFile(type || '')
    switch (cat) {
      case 'images': return <ImageIcon size={20} className="text-pink-400" />
      case 'documents': return <FileText size={20} className="text-blue-400" />
      case 'media': return <Video size={20} className="text-purple-400" />
      case 'archives': return <Package size={20} className="text-orange-400" />
      case 'code': return <FileCode size={20} className="text-green-400" />
      default: return <File size={20} className="text-gray-400" />
    }
  }

  const getAuthorColor = (name: string) => {
    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899']
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  if (!currentSpace) {
    return (
      <div className="files-panel empty-state">
        <div className="empty-content">
          <FolderOpen size={64} className="pulse-icon opacity-10" />
          <h3>No Workspace Selected</h3>
          <p>Open a space to start peer-to-peer file sharing.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="files-panel">
      {/* Premium Header */}
      <div className="files-header">
        <div className="header-top-row">
          <div className="title-section">
            <div className="tab-icon">
              <Share2 size={20} className="text-blue-500" />
            </div>
            <div className="title-content">
              <h2>Shared Assets</h2>
              <span className="subtitle">Secure Peer-to-Peer Storage</span>
            </div>
          </div>

          <div className="action-strip">
            <div className="search-group">
              <div className="premium-search">
                <Search size={14} className="search-icon" />
                <input
                  placeholder="Search shared files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="peers-pill">
                <div className="pulse-dot" />
                <span>{peers.length} Peers Connected</span>
              </div>
            </div>

            <div className="divider-v" />

            <div className="utility-actions">
              <button 
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
              ><Grid size={16} /></button>
              <button 
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              ><List size={16} /></button>
              
              {isAdmin && files.length > 0 && (
                <button className="btn-action danger" onClick={handleClearAll} title="Purge Storage">
                  <Trash2 size={16} />
                </button>
              )}
              
              <button
                className="btn-premium-compact"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                <span>Share File</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category & Sort Sub-header */}
        <div className="header-sub-row">
          <div className="category-tabs">
            {(['all', 'images', 'documents', 'media', 'archives', 'code'] as FileCategory[]).map(cat => (
              <button
                key={cat}
                className={`cat-tab ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          <div className="sort-controls">
            <ArrowUpDown size={12} className="opacity-40" />
            <select className="clean-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="date">Newest First</option>
              <option value="size">Largest First</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sharing Banner */}
      <div className="sharing-info-banner">
        <Globe size={14} />
        <span>End-to-End Encrypted P2P Transfer. <b>No Cloud.</b> Secure direct delivery.</span>
      </div>

      <div className="files-scroller">
        {canModify && (
          <div
            className={`premium-drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-content">
              <div className="icon-stack">
                <Upload size={32} className="main-icon" />
                <div className="tier-badge-floating">
                  {selectedTier === 'small' ? <Zap size={12} /> : selectedTier === 'medium' ? <Layers size={12} /> : <Server size={12} />}
                </div>
              </div>
              <div className="drop-text-group">
                <span className="primary-text">Drop files to broadcast</span>
                <span className="secondary-text">Current Tier: {fileTransferService.getTierInfo(selectedTier).label} ({fileTransferService.getTierInfo(selectedTier).maxSize} limit)</span>
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileInput} style={{ display: 'none' }} multiple />
          </div>
        )}

        {filteredAndSortedFiles.length === 0 ? (
          <div className="empty-results">
            <Search size={48} className="opacity-10 mb-4" />
            <p>No matches found in this category.</p>
          </div>
        ) : (
          <div className="chronological-storage">
            {Object.entries(groupedFiles).map(([date, dayFiles]) => (
              <div key={date} className="date-group">
                <div className="group-header">
                  <Calendar size={14} />
                  <span>{date}</span>
                  <div className="group-line" />
                </div>

                <div className={`files-display ${viewMode}`}>
                  {dayFiles.map(file => (
                    <div key={file.id} className={`file-premium-card ${file.isLocal ? 'local' : 'remote'}`}>
                      <div className="card-top">
                        <div className="file-avatar">
                          {getFileIcon(file.type)}
                        </div>
                        <div className="card-actions">
                          <button className="action-pill" onClick={(e) => { e.stopPropagation(); handleDownload(file); }}>
                            <Download size={14} />
                          </button>
                          {(file.isLocal || isAdmin) && (
                            <button className="action-pill danger" onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="card-middle">
                        <span className="file-display-name" title={file.name}>{file.name}</span>
                        <div className="file-meta-row">
                          <span className="size-badge">{formatSize(file.size)}</span>
                          <span className="dot">â€¢</span>
                          <span className="type-text">{file.type.split('/')[1]?.toUpperCase() || 'DATA'}</span>
                        </div>
                      </div>

                      {uploadProgress[file.id] !== undefined && uploadProgress[file.id] < 100 && (
                        <div className="card-progress">
                          <div className="progress-fill" style={{ width: `${uploadProgress[file.id]}%` }} />
                        </div>
                      )}

                      <div className="card-bottom">
                        <div className="uploader-info">
                          <div className="uploader-avatar" style={{ backgroundColor: getAuthorColor(file.uploadedBy) }}>
                            {file.uploadedBy[0].toUpperCase()}
                          </div>
                          <span className="uploader-name">{file.isLocal ? 'You' : file.uploadedBy}</span>
                        </div>
                        <div className="tier-tag">
                          {file.tier === 'small' ? <Zap size={10} /> : file.tier === 'medium' ? <Layers size={10} /> : <Server size={10} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
