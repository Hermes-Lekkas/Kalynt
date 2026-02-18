/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
    GitBranch, RefreshCw, Check, X, Folder,
    ChevronDown, Plus, ArrowUp, ArrowDown, RotateCcw,
    AlertCircle, FileText, Layers, Clock
} from 'lucide-react'
import { useNotificationStore } from '../../stores/notificationStore'

interface GitFile {
    path: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
    staged: boolean
}

interface CommitInfo {
    hash: string
    date: string
    message: string
    author_name: string
}

interface GitPanelProps {
    readonly workspacePath: string | null
    readonly isVisible?: boolean
}

export default function GitPanel({ workspacePath, isVisible = true }: GitPanelProps) {
    const [branch, setBranch] = useState<string>('main')
    const [branches, setBranches] = useState<string[]>([])
    const [files, setFiles] = useState<GitFile[]>([])
    const [commitMessage, setCommitMessage] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [diff, setDiff] = useState<string | null>(null)
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [isRepo, setIsRepo] = useState<boolean>(false)
    const [showBranchDropdown, setShowBranchDropdown] = useState<boolean>(false)
    const [showNewBranchInput, setShowNewBranchInput] = useState<boolean>(false)
    const [newBranchName, setNewBranchName] = useState<string>('')
    const [ahead, setAhead] = useState<number>(0)
    const [behind, setBehind] = useState<number>(0)
    const [commits, setCommits] = useState<CommitInfo[]>([])
    const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes')
    const [pushing, setPushing] = useState<boolean>(false)
    const [pulling, setPulling] = useState<boolean>(false)
    const [initializing, setInitializing] = useState<boolean>(false)
    const { addNotification } = useNotificationStore()
    const lastRefreshRef = useRef<number>(0)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowBranchDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Fetch git status
    const fetchStatus = useCallback(async () => {
        if (!workspacePath) return

        setLoading(true)
        setError(null)

        try {
            // Get branch info
            const branchResult = await globalThis.window.electronAPI?.git.branch(workspacePath)
            if (branchResult?.success && branchResult.branches) {
                setBranch(branchResult.branches.current)
                setBranches(branchResult.branches.all || [])
                setIsRepo(true)
            } else {
                setIsRepo(false)
                setLoading(false)
                return
            }

            // Get remote status (ahead/behind)
            const remoteResult = await globalThis.window.electronAPI?.git.remote(workspacePath)
            if (remoteResult?.success) {
                setAhead(remoteResult.ahead || 0)
                setBehind(remoteResult.behind || 0)
            }

            // Get status
            const statusResult = await globalThis.window.electronAPI?.git.status(workspacePath)
            if (statusResult?.success && statusResult.status) {
                const gitFiles: GitFile[] = []

                // Modified files
                statusResult.status.modified?.forEach((path: string) => {
                    gitFiles.push({ path, status: 'modified', staged: false })
                })

                // Staged files
                statusResult.status.staged?.forEach((path: string) => {
                    const existing = gitFiles.find(f => f.path === path)
                    if (existing) {
                        existing.staged = true
                    } else {
                        gitFiles.push({ path, status: 'modified', staged: true })
                    }
                })

                // New files
                statusResult.status.not_added?.forEach((path: string) => {
                    gitFiles.push({ path, status: 'untracked', staged: false })
                })

                // Created (staged new files)
                statusResult.status.created?.forEach((path: string) => {
                    gitFiles.push({ path, status: 'added', staged: true })
                })

                // Deleted
                statusResult.status.deleted?.forEach((path: string) => {
                    gitFiles.push({ path, status: 'deleted', staged: false })
                })

                setFiles(gitFiles)
            }

            // Get recent commits
            const logResult = await globalThis.window.electronAPI?.git.log({ repoPath: workspacePath, maxCount: 10 })
            if (logResult?.success && logResult.log?.all) {
                setCommits(logResult.log.all.map((c: any) => ({
                    hash: c.hash?.substring(0, 7) || '',
                    date: c.date || '',
                    message: c.message || '',
                    author_name: c.author_name || ''
                })))
            }
        } catch (err) {
            addNotification(`Failed to refresh Git: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
            setError(String(err))
        }

        setLoading(false)
    }, [workspacePath, addNotification])

    // Watch for file changes
    useEffect(() => {
        if (!workspacePath || !isVisible) return

        let timeout: ReturnType<typeof setTimeout>
        const debouncedRefresh = () => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                const now = Date.now()
                if (now - lastRefreshRef.current > 1000) {
                    fetchStatus()
                    lastRefreshRef.current = now
                }
            }, 500)
        }

        fetchStatus()

        const watchId = `git-panel-${workspacePath.replace(/[^a-zA-Z0-9]/g, '-')}`
        window.electronAPI?.fs.watchDir({ id: watchId, dirPath: workspacePath })

        const unsubscribe = window.electronAPI?.fs.onChange((event: { id: string }) => {
            if (event.id === watchId) {
                debouncedRefresh()
            }
        })

        return () => {
            clearTimeout(timeout)
            unsubscribe?.()
            window.electronAPI?.fs.unwatchDir(watchId)
        }
    }, [workspacePath, isVisible, fetchStatus])

    // Initialize repository
    const initRepository = async () => {
        if (!workspacePath) return
        setInitializing(true)
        try {
            const result = await globalThis.window.electronAPI?.git.init(workspacePath)
            if (result?.success) {
                addNotification('Repository initialized successfully', 'success')
                await fetchStatus()
            } else {
                setError(result?.error || 'Failed to initialize repository')
            }
        } catch (err) {
            setError('Failed to initialize repository')
        }
        setInitializing(false)
    }

    // Stage file
    const stageFile = async (path: string) => {
        if (!workspacePath) return
        try {
            await globalThis.window.electronAPI?.git.add({ repoPath: workspacePath, files: [path] })
            await fetchStatus()
        } catch (err) {
            setError('Failed to stage file')
        }
    }

    // Stage all files
    const stageAll = async () => {
        if (!workspacePath) return
        const unstaged = files.filter(f => !f.staged).map(f => f.path)
        if (unstaged.length > 0) {
            try {
                await globalThis.window.electronAPI?.git.add({ repoPath: workspacePath, files: unstaged })
                await fetchStatus()
            } catch (err) {
                setError('Failed to stage all files')
            }
        }
    }

    // Unstage file
    const unstageFile = async (path: string) => {
        if (!workspacePath) return
        try {
            const result = await globalThis.window.electronAPI?.git.reset({ repoPath: workspacePath, files: [path] })
            if (result?.success) {
                await fetchStatus()
            } else {
                setError(result?.error || 'Failed to unstage file')
            }
        } catch (err) {
            setError('Failed to unstage file')
        }
    }

    // Discard changes
    const discardChanges = async (path: string) => {
        if (!workspacePath) return
        if (!confirm(`Discard changes to ${path}? This cannot be undone.`)) return
        try {
            const result = await globalThis.window.electronAPI?.git.discard({ repoPath: workspacePath, files: [path] })
            if (result?.success) {
                await fetchStatus()
                addNotification('Changes discarded', 'success')
            } else {
                setError(result?.error || 'Failed to discard changes')
            }
        } catch (err) {
            setError('Failed to discard changes')
        }
    }

    // Commit staged changes
    const commit = async () => {
        if (!workspacePath || !commitMessage.trim()) return
        try {
            const result = await globalThis.window.electronAPI?.git.commit({
                repoPath: workspacePath,
                message: commitMessage.trim()
            })
            if (result?.success) {
                setCommitMessage('')
                await fetchStatus()
                addNotification('Changes committed successfully', 'success')
            } else {
                setError(result?.error || 'Commit failed')
            }
        } catch (err) {
            setError('Failed to commit changes')
        }
    }

    // Push changes
    const push = async () => {
        if (!workspacePath) return
        setPushing(true)
        try {
            const result = await globalThis.window.electronAPI?.git.push(workspacePath)
            if (result?.success) {
                addNotification('Pushed successfully', 'success')
                await fetchStatus()
            } else {
                const errorMsg = result?.error || 'Push failed'
                if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('authentication failed')) {
                    addNotification('GitHub Authentication Failed. Please check your token in Settings > Security.', 'error')
                } else {
                    setError(errorMsg)
                }
            }
        } catch (err) {
            setError('Failed to push')
        }
        setPushing(false)
    }

    // Pull changes
    const pull = async () => {
        if (!workspacePath) return
        setPulling(true)
        try {
            const result = await globalThis.window.electronAPI?.git.pull(workspacePath)
            if (result?.success) {
                addNotification('Pulled successfully', 'success')
                await fetchStatus()
            } else {
                const errorMsg = result?.error || 'Pull failed'
                if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('authentication failed')) {
                    addNotification('GitHub Authentication Failed. Please check your token in Settings > Security.', 'error')
                } else {
                    setError(errorMsg)
                }
            }
        } catch (err) {
            setError('Failed to pull')
        }
        setPulling(false)
    }

    // Switch branch
    const switchBranch = async (branchName: string) => {
        if (!workspacePath || branchName === branch) return
        setShowBranchDropdown(false)
        try {
            const result = await globalThis.window.electronAPI?.git.checkout({ repoPath: workspacePath, branch: branchName })
            if (result?.success) {
                addNotification(`Switched to ${branchName}`, 'success')
                await fetchStatus()
            } else {
                setError(result?.error || 'Failed to switch branch')
            }
        } catch (err) {
            setError('Failed to switch branch')
        }
    }

    // Create new branch
    const createBranch = async () => {
        if (!workspacePath || !newBranchName.trim()) return
        try {
            const result = await globalThis.window.electronAPI?.git.createBranch({
                repoPath: workspacePath,
                branchName: newBranchName.trim(),
                checkout: true
            })
            if (result?.success) {
                addNotification(`Created and switched to ${newBranchName}`, 'success')
                setNewBranchName('')
                setShowNewBranchInput(false)
                await fetchStatus()
            } else {
                setError(result?.error || 'Failed to create branch')
            }
        } catch (err) {
            setError('Failed to create branch')
        }
    }

    // View diff
    const viewDiff = async (path: string) => {
        if (!workspacePath) return
        try {
            setSelectedFile(path)
            const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.exe', '.dll', '.so', '.dylib', '.bin', '.pyc', '.wasm']
            if (binaryExts.some(ext => path.toLowerCase().endsWith(ext))) {
                setDiff('BINARY_FILE')
                return
            }
            const result = await globalThis.window.electronAPI?.git.diff({ repoPath: workspacePath, file: path })
            if (result?.success) {
                setDiff(result.diff || 'No changes')
            } else {
                setError(result?.error || 'Failed to load diff')
            }
        } catch (err) {
            setError('Failed to load diff')
        }
    }

    // Get status icon and color
    const getStatusBadge = (status: GitFile['status']) => {
        const badges: Record<string, { icon: string; color: string }> = {
            modified: { icon: 'M', color: '#3b82f6' },
            added: { icon: 'A', color: '#10b981' },
            deleted: { icon: 'D', color: '#ef4444' },
            renamed: { icon: 'R', color: '#8b5cf6' },
            untracked: { icon: 'U', color: '#6b7280' }
        }
        return badges[status] || badges.modified
    }

    const stagedFiles = files.filter(f => f.staged)
    const unstagedFiles = files.filter(f => !f.staged)

    // Format relative time
    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 60) return `${mins}m ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        return `${days}d ago`
    }

    // Render diff with syntax highlighting
    const renderDiff = (diffText: string) => {
        return diffText.split('\n').map((line, i) => {
            let className = 'diff-line'
            if (line.startsWith('+') && !line.startsWith('+++')) className += ' diff-add'
            else if (line.startsWith('-') && !line.startsWith('---')) className += ' diff-remove'
            else if (line.startsWith('@@')) className += ' diff-hunk'
            return <div key={i} className={className}>{line}</div>
        })
    }

    if (!workspacePath) {
        return (
            <div className="git-panel empty-state">
                <Folder size={40} className="pulse-icon opacity-20" />
                <p>Select a workspace to activate source control.</p>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    if (!isRepo) {
        return (
            <div className="git-panel empty-state">
                <div className="empty-icon-wrapper">
                    <GitBranch size={48} className="text-blue-500" />
                </div>
                <h3>Repository Inactive</h3>
                <p>This workspace is not currently tracked by Git.</p>
                <button
                    className="btn-premium mt-6"
                    onClick={initRepository}
                    disabled={initializing}
                >
                    {initializing ? 'Initializing...' : 'Initialize Source Control'}
                </button>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    return (
        <div className="git-panel">
            {/* Premium Header */}
            <div className="git-header">
                <div className="branch-selector" ref={dropdownRef}>
                    <button
                        className="branch-btn"
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    >
                        <GitBranch size={14} className="text-blue-400" />
                        <span className="branch-name">{branch}</span>
                        <ChevronDown size={12} className="opacity-40" />
                    </button>

                    {showBranchDropdown && (
                        <div className="branch-dropdown animate-reveal-up">
                            <div className="dropdown-header">
                                <span>Switch Branch</span>
                                <button className="new-btn" onClick={() => { setShowNewBranchInput(true); setShowBranchDropdown(false) }}>
                                    <Plus size={14} /> New
                                </button>
                            </div>
                            <div className="branch-list">
                                {branches.map(b => (
                                    <button
                                        key={b}
                                        className={`branch-option ${b === branch ? 'active' : ''}`}
                                        onClick={() => switchBranch(b)}
                                    >
                                        {b === branch && <Check size={12} />}
                                        <span>{b.replace('remotes/origin/', '')}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="header-actions">
                    <div className="sync-badges">
                        {ahead > 0 && (
                            <div className="sync-badge ahead" title={`${ahead} commits to push`}>
                                <ArrowUp size={12} />
                                <span>{ahead}</span>
                            </div>
                        )}
                        {behind > 0 && (
                            <div className="sync-badge behind" title={`${behind} commits to pull`}>
                                <ArrowDown size={12} />
                                <span>{behind}</span>
                            </div>
                        )}
                    </div>
                    
                    <button className="action-btn" onClick={pull} disabled={pulling} title="Pull Changes">
                        <ArrowDown size={16} />
                    </button>
                    <button className="action-btn" onClick={push} disabled={pushing} title="Push Changes">
                        <ArrowUp size={16} />
                    </button>
                    <button className="action-btn" onClick={fetchStatus} title="Refresh Status">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* New branch input */}
            {showNewBranchInput && (
                <div className="new-branch-input-row animate-reveal-up">
                    <input
                        type="text"
                        placeholder="Feature name..."
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createBranch()}
                        autoFocus
                    />
                    <div className="input-actions">
                        <button className="confirm" onClick={createBranch}><Check size={14} /></button>
                        <button className="cancel" onClick={() => { setShowNewBranchInput(false); setNewBranchName('') }}><X size={14} /></button>
                    </div>
                </div>
            )}

            {error && <div className="git-error-banner">{error}</div>}

            {/* Premium Tabs */}
            <div className="git-tabs-strip">
                <button
                    className={`git-tab ${activeTab === 'changes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('changes')}
                >
                    Changes {files.length > 0 && <span className="tab-badge">{files.length}</span>}
                </button>
                <button
                    className={`git-tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    Log
                </button>
            </div>

            <div className="git-content-area">
                {activeTab === 'changes' ? (
                    <div className="changes-view">
                        {/* Staged Changes */}
                        <div className="change-section">
                            <div className="section-title">
                                <Layers size={12} />
                                <span>Staged Area ({stagedFiles.length})</span>
                            </div>
                            <div className="file-list">
                                {stagedFiles.map(file => (
                                    <div key={file.path} className="file-row staged" onClick={() => viewDiff(file.path)}>
                                        <div className="file-info">
                                            <span className="file-badge" style={{ backgroundColor: getStatusBadge(file.status).color }}>{getStatusBadge(file.status).icon}</span>
                                            <span className="file-name">{file.path}</span>
                                        </div>
                                        <button className="file-control unstage" onClick={(e) => { e.stopPropagation(); unstageFile(file.path) }}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {stagedFiles.length === 0 && <div className="empty-hint">No files staged for commit.</div>}
                            </div>
                        </div>

                        {/* Working Directory */}
                        <div className="change-section">
                            <div className="section-title">
                                <Clock size={12} />
                                <span>Working Directory ({unstagedFiles.length})</span>
                                {unstagedFiles.length > 0 && (
                                    <button className="stage-all-btn" onClick={stageAll}>Stage All</button>
                                )}
                            </div>
                            <div className="file-list">
                                {unstagedFiles.map(file => (
                                    <div key={file.path} className="file-row" onClick={() => viewDiff(file.path)}>
                                        <div className="file-info">
                                            <span className="file-badge" style={{ color: getStatusBadge(file.status).color }}>{getStatusBadge(file.status).icon}</span>
                                            <span className="file-name">{file.path}</span>
                                        </div>
                                        <div className="file-row-actions">
                                            {file.status !== 'untracked' && (
                                                <button className="file-control discard" onClick={(e) => { e.stopPropagation(); discardChanges(file.path) }}>
                                                    <RotateCcw size={14} />
                                                </button>
                                            )}
                                            <button className="file-control stage" onClick={(e) => { e.stopPropagation(); stageFile(file.path) }}>
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {unstagedFiles.length === 0 && <div className="empty-hint">Working directory clean.</div>}
                            </div>
                        </div>

                        {/* Commit Section */}
                        {stagedFiles.length > 0 && (
                            <div className="commit-footer animate-reveal-up">
                                <div className="commit-input-wrapper">
                                    <textarea
                                        placeholder="Summarize changes..."
                                        value={commitMessage}
                                        onChange={(e) => setCommitMessage(e.target.value)}
                                        rows={3}
                                    />
                                    <button
                                        className="btn-premium w-full mt-3"
                                        onClick={commit}
                                        disabled={!commitMessage.trim()}
                                    >
                                        <Check size={16} />
                                        <span>Commit {stagedFiles.length} File{stagedFiles.length > 1 ? 's' : ''}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* History Tab */
                    <div className="history-view">
                        {commits.map(c => (
                            <div key={c.hash} className="log-item">
                                <div className="log-marker"><div className="log-dot" /></div>
                                <div className="log-body">
                                    <div className="log-message">{c.message}</div>
                                    <div className="log-meta">
                                        <span className="log-hash">{c.hash}</span>
                                        <span className="log-author">{c.author_name}</span>
                                        <span className="log-time">{formatTime(c.date)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {commits.length === 0 && <div className="empty-state-subtle">No commit history found.</div>}
                    </div>
                )}
            </div>

            {/* Floating Diff Panel */}
            {diff && selectedFile && (
                <div className="floating-diff-overlay" onClick={() => { setDiff(null); setSelectedFile(null) }}>
                    <div className="floating-diff-content animate-reveal-up" onClick={e => e.stopPropagation()}>
                        <div className="diff-header-bar">
                            <div className="diff-title-group">
                                <FileText size={16} className="text-blue-400" />
                                <span className="diff-file-name">{selectedFile}</span>
                            </div>
                            <button className="close-diff-btn" onClick={() => { setDiff(null); setSelectedFile(null) }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="diff-viewer-body">
                            {diff === 'BINARY_FILE' ? (
                                <div className="binary-preview">
                                    <AlertCircle size={40} className="opacity-20 mb-4" />
                                    <p>Binary File Detected</p>
                                    <span>Diff preview is unavailable for this asset type.</span>
                                </div>
                            ) : (
                                <div className="diff-code-wrapper">
                                    {renderDiff(diff)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{gitPanelStyles}</style>
        </div>
    )
}

const gitPanelStyles = `
    .git-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #000000;
        color: white;
        font-family: var(--font-sans);
        position: relative;
        overflow: hidden;
    }

    .empty-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px;
        gap: 12px;
    }

    .empty-state h3 {
        font-size: 18px;
        font-weight: 700;
        margin: 16px 0 8px;
    }

    .empty-state p {
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        max-width: 200px;
    }

    .git-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: rgba(255, 255, 255, 0.02);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .branch-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        color: white;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s;
    }

    .branch-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(59, 130, 246, 0.4);
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .sync-badges {
        display: flex;
        gap: 4px;
        margin-right: 8px;
    }

    .sync-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 100px;
        font-size: 10px;
        font-weight: 800;
    }

    .sync-badge.ahead { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .sync-badge.behind { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }

    .action-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.4);
        transition: all 0.2s;
    }

    .action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.05);
        color: white;
    }

    .git-tabs-strip {
        display: flex;
        padding: 0 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .git-tab {
        padding: 12px 16px;
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.3);
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .git-tab.active {
        color: white;
        border-bottom-color: #3b82f6;
    }

    .tab-badge {
        padding: 1px 6px;
        background: #3b82f6;
        color: white;
        font-size: 10px;
        border-radius: 100px;
    }

    .git-content-area {
        flex: 1;
        overflow-y: auto;
    }

    .change-section {
        margin-bottom: 24px;
    }

    .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(255, 255, 255, 0.2);
    }

    .stage-all-btn {
        margin-left: auto;
        color: #3b82f6;
        font-size: 10px;
        font-weight: 800;
        background: none;
        border: none;
        cursor: pointer;
    }

    .file-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 20px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .file-row:hover {
        background: rgba(255, 255, 255, 0.03);
    }

    .file-info {
        display: flex;
        align-items: center;
        gap: 12px;
        overflow: hidden;
    }

    .file-badge {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 900;
        font-family: monospace;
    }

    .file-name {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .file-row-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
    }

    .file-row:hover .file-row-actions {
        opacity: 1;
    }

    .file-control {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.4);
        border: none;
        cursor: pointer;
    }

    .file-control:hover {
        background: white;
        color: black;
    }

    .file-control.discard:hover {
        background: #ef4444;
        color: white;
    }

    .commit-footer {
        position: sticky;
        bottom: 0;
        padding: 20px;
        background: linear-gradient(to top, #000000 80%, transparent);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .commit-input-wrapper textarea {
        width: 100%;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 12px;
        color: white;
        font-size: 13px;
        outline: none;
        resize: none;
    }

    .btn-premium {
        background: white;
        color: black;
        font-weight: 700;
        font-size: 13px;
        padding: 10px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
        border: none;
        cursor: pointer;
    }

    .btn-premium:hover {
        transform: scale(0.98);
        background: rgba(255, 255, 255, 0.9);
    }

    .history-view {
        padding: 20px;
    }

    .log-item {
        display: flex;
        gap: 16px;
        padding-bottom: 24px;
        position: relative;
    }

    .log-marker {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 6px;
    }

    .log-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #3b82f6;
        box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
    }

    .log-item:not(:last-child)::after {
        content: '';
        position: absolute;
        left: 3px;
        top: 14px;
        bottom: 0;
        width: 2px;
        background: rgba(255, 255, 255, 0.05);
    }

    .log-message {
        font-size: 14px;
        font-weight: 600;
        color: white;
        margin-bottom: 4px;
    }

    .log-meta {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.3);
        font-weight: 700;
    }

    .log-hash {
        font-family: monospace;
        color: #3b82f6;
    }

    .floating-diff-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(12px);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
    }

    .floating-diff-content {
        width: 100%;
        height: 100%;
        max-width: 1200px;
        background: #050505;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 50px 100px rgba(0, 0, 0, 0.8);
    }

    .diff-header-bar {
        padding: 20px 32px;
        background: rgba(255, 255, 255, 0.02);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .diff-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .diff-file-name {
        font-size: 15px;
        font-weight: 700;
    }

    .diff-viewer-body {
        flex: 1;
        overflow: auto;
        padding: 32px;
    }

    .diff-code-wrapper {
        font-family: 'SF Mono', monospace;
        font-size: 12px;
        line-height: 1.6;
    }

    .diff-line { padding: 0 16px; white-space: pre; }
    .diff-add { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .diff-remove { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .diff-hunk { color: #3b82f6; opacity: 0.6; padding: 8px 16px; }

    .binary-preview {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
    }

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes reveal-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .animate-reveal-up { animation: reveal-up 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
`
