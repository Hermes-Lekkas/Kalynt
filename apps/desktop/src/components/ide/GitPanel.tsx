/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
    GitBranch, RefreshCw, Check, X, FileText, AlertCircle, Folder,
    ChevronDown, Plus, ArrowUp, ArrowDown, RotateCcw, History,
    GitCommit
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
                setError(result?.error || 'Push failed')
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
                setError(result?.error || 'Pull failed')
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
            modified: { icon: 'M', color: '#d29922' },
            added: { icon: 'A', color: '#3fb950' },
            deleted: { icon: 'D', color: '#f85149' },
            renamed: { icon: 'R', color: '#a371f7' },
            untracked: { icon: 'U', color: '#8b949e' }
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
            <div className="git-panel empty">
                <Folder size={32} className="empty-icon" />
                <p>Open a folder to view Git status</p>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    if (!isRepo) {
        return (
            <div className="git-panel empty">
                <GitBranch size={32} className="empty-icon" />
                <p>Not a Git repository</p>
                <button
                    className="init-btn"
                    onClick={initRepository}
                    disabled={initializing}
                >
                    {initializing ? 'Initializing...' : 'Initialize Repository'}
                </button>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    return (
        <div className="git-panel">
            {/* Header with branch selector */}
            <div className="git-header">
                <div className="branch-selector" ref={dropdownRef}>
                    <button
                        className="branch-btn"
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    >
                        <GitBranch size={14} />
                        <span>{branch}</span>
                        <ChevronDown size={12} />
                    </button>

                    {showBranchDropdown && (
                        <div className="branch-dropdown">
                            <div className="dropdown-header">
                                <span>Switch branch</span>
                                <button onClick={() => { setShowNewBranchInput(true); setShowBranchDropdown(false) }}>
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
                    {ahead > 0 && (
                        <button
                            className="action-btn push"
                            onClick={push}
                            disabled={pushing}
                            title={`Push ${ahead} commit${ahead > 1 ? 's' : ''}`}
                        >
                            <ArrowUp size={14} />
                            <span>{ahead}</span>
                        </button>
                    )}
                    {behind > 0 && (
                        <button
                            className="action-btn pull"
                            onClick={pull}
                            disabled={pulling}
                            title={`Pull ${behind} commit${behind > 1 ? 's' : ''}`}
                        >
                            <ArrowDown size={14} />
                            <span>{behind}</span>
                        </button>
                    )}
                    {ahead === 0 && behind === 0 && (
                        <>
                            <button className="action-btn" onClick={push} disabled={pushing} title="Push">
                                <ArrowUp size={14} />
                            </button>
                            <button className="action-btn" onClick={pull} disabled={pulling} title="Pull">
                                <ArrowDown size={14} />
                            </button>
                        </>
                    )}
                    <button className="action-btn" onClick={fetchStatus} title="Refresh">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* New branch input */}
            {showNewBranchInput && (
                <div className="new-branch-input">
                    <input
                        type="text"
                        placeholder="New branch name..."
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createBranch()}
                        autoFocus
                    />
                    <button onClick={createBranch}><Check size={14} /></button>
                    <button onClick={() => { setShowNewBranchInput(false); setNewBranchName('') }}><X size={14} /></button>
                </div>
            )}

            {error && <div className="git-error">{error}</div>}

            {/* Tabs */}
            <div className="git-tabs">
                <button
                    className={`tab ${activeTab === 'changes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('changes')}
                >
                    Changes {files.length > 0 && <span className="badge">{files.length}</span>}
                </button>
                <button
                    className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <History size={12} /> History
                </button>
            </div>

            {activeTab === 'changes' ? (
                <>
                    {/* Staged Changes */}
                    <div className="git-section">
                        <div className="section-header">
                            <span>Staged Changes ({stagedFiles.length})</span>
                        </div>
                        {stagedFiles.length === 0 ? (
                            <div className="empty-section">No staged changes</div>
                        ) : (
                            <div className="file-list">
                                {stagedFiles.map(file => {
                                    const badge = getStatusBadge(file.status)
                                    return (
                                        <button key={file.path} className="file-item" onClick={() => viewDiff(file.path)}>
                                            <span className="status-badge" style={{ color: badge.color }}>{badge.icon}</span>
                                            <span className="file-path">{file.path}</span>
                                            <button className="file-action" onClick={(e) => { e.stopPropagation(); unstageFile(file.path) }} title="Unstage">−</button>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Unstaged Changes */}
                    <div className="git-section">
                        <div className="section-header">
                            <span>Changes ({unstagedFiles.length})</span>
                            {unstagedFiles.length > 0 && (
                                <button className="section-action" onClick={stageAll} title="Stage all">+</button>
                            )}
                        </div>
                        {unstagedFiles.length === 0 ? (
                            <div className="empty-section">No changes</div>
                        ) : (
                            <div className="file-list">
                                {unstagedFiles.map(file => {
                                    const badge = getStatusBadge(file.status)
                                    return (
                                        <button key={file.path} className="file-item" onClick={() => viewDiff(file.path)}>
                                            <span className="status-badge" style={{ color: badge.color }}>{badge.icon}</span>
                                            <span className="file-path">{file.path}</span>
                                            <div className="file-actions">
                                                {file.status !== 'untracked' && (
                                                    <button className="file-action discard" onClick={(e) => { e.stopPropagation(); discardChanges(file.path) }} title="Discard">
                                                        <RotateCcw size={12} />
                                                    </button>
                                                )}
                                                <button className="file-action" onClick={(e) => { e.stopPropagation(); stageFile(file.path) }} title="Stage">+</button>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Commit Box */}
                    {stagedFiles.length > 0 && (
                        <div className="commit-box">
                            <textarea
                                placeholder="Commit message..."
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                rows={3}
                            />
                            <button
                                className="commit-btn"
                                onClick={commit}
                                disabled={!commitMessage.trim()}
                            >
                                <Check size={14} />
                                Commit ({stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''})
                            </button>
                        </div>
                    )}
                </>
            ) : (
                /* History Tab */
                <div className="history-list">
                    {commits.length === 0 ? (
                        <div className="empty-section">No commits yet</div>
                    ) : (
                        commits.map(c => (
                            <div key={c.hash} className="commit-item">
                                <div className="commit-icon"><GitCommit size={14} /></div>
                                <div className="commit-info">
                                    <div className="commit-message">{c.message}</div>
                                    <div className="commit-meta">
                                        <span className="commit-hash">{c.hash}</span>
                                        <span className="commit-author">{c.author_name}</span>
                                        <span className="commit-time">{formatTime(c.date)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Diff View */}
            {diff && selectedFile && (
                <div className="diff-panel">
                    <div className="diff-header">
                        <FileText size={14} />
                        <span className="file-path-title">{selectedFile}</span>
                        <button className="close-diff" onClick={() => { setDiff(null); setSelectedFile(null) }}>
                            <X size={16} />
                        </button>
                    </div>
                    <div className="diff-body">
                        {diff === 'BINARY_FILE' ? (
                            <div className="binary-notice">
                                <AlertCircle size={32} />
                                <p>Binary file</p>
                                <p className="sub">Diff preview is not available for binary files.</p>
                            </div>
                        ) : (
                            <pre className="diff-content">{renderDiff(diff)}</pre>
                        )}
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
        background: var(--color-surface);
        font-size: 13px;
    }

    .git-panel.empty {
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        text-align: center;
        padding: 24px;
        gap: 12px;
    }

    .empty-icon {
        opacity: 0.5;
    }

    .init-btn {
        margin-top: 8px;
        padding: 10px 20px;
        background: linear-gradient(135deg, #238636, #2ea043);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .init-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(35, 134, 54, 0.3);
    }

    .init-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    .git-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--color-border-subtle);
        gap: 8px;
    }

    .branch-selector {
        position: relative;
    }

    .branch-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: var(--color-surface-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: 6px;
        color: var(--color-text);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
    }

    .branch-btn:hover {
        background: var(--color-bg);
        border-color: var(--color-accent);
    }

    .branch-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 200px;
        background: var(--color-surface-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 100;
        overflow: hidden;
    }

    .dropdown-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--color-border-subtle);
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
    }

    .dropdown-header button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--color-accent);
        border: none;
        border-radius: 4px;
        color: white;
        font-size: 11px;
        cursor: pointer;
    }

    .branch-list {
        max-height: 200px;
        overflow-y: auto;
    }

    .branch-option {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        color: var(--color-text);
        font-size: 12px;
        text-align: left;
        cursor: pointer;
    }

    .branch-option:hover {
        background: var(--color-surface);
    }

    .branch-option.active {
        color: var(--color-accent);
        font-weight: 500;
    }

    .header-actions {
        display: flex;
        gap: 4px;
    }

    .action-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all 0.15s;
    }

    .action-btn:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .action-btn.push span,
    .action-btn.pull span {
        font-size: 11px;
        font-weight: 600;
    }

    .action-btn.push {
        color: #3fb950;
    }

    .action-btn.pull {
        color: #58a6ff;
    }

    .new-branch-input {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .new-branch-input input {
        flex: 1;
        padding: 6px 10px;
        background: var(--color-bg);
        border: 1px solid var(--color-accent);
        border-radius: 4px;
        color: var(--color-text);
        font-size: 12px;
        outline: none;
    }

    .new-branch-input button {
        padding: 6px;
        background: var(--color-surface-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: 4px;
        color: var(--color-text-secondary);
        cursor: pointer;
    }

    .new-branch-input button:hover {
        background: var(--color-accent);
        color: white;
    }

    .git-error {
        padding: 8px 12px;
        background: rgba(248, 81, 73, 0.1);
        color: #f85149;
        font-size: 12px;
    }

    .git-tabs {
        display: flex;
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .tab {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        padding: 10px 16px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--color-text-muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
    }

    .tab:hover {
        color: var(--color-text);
        background: var(--color-surface-elevated);
    }

    .tab.active {
        color: var(--color-accent);
        border-bottom-color: var(--color-accent);
    }

    .tab .badge {
        padding: 2px 6px;
        background: var(--color-accent);
        border-radius: 10px;
        color: white;
        font-size: 10px;
    }

    .git-section {
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: var(--color-bg);
    }

    .section-action {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: bold;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: var(--color-text-secondary);
    }

    .section-action:hover {
        background: var(--color-accent);
        color: white;
    }

    .empty-section {
        padding: 16px;
        color: var(--color-text-muted);
        font-size: 12px;
        text-align: center;
    }

    .file-list {
        max-height: 180px;
        overflow-y: auto;
    }

    .file-item {
        display: flex;
        align-items: center;
        width: 100%;
        border: none;
        background: transparent;
        color: inherit;
        text-align: left;
        gap: 8px;
        padding: 6px 12px;
        cursor: pointer;
    }

    .file-item:hover {
        background: var(--color-surface-elevated);
    }

    .status-badge {
        font-size: 11px;
        font-weight: bold;
        font-family: 'SF Mono', monospace;
        min-width: 14px;
    }

    .file-path {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-text-secondary);
        font-size: 12px;
    }

    .file-actions {
        display: flex;
        gap: 2px;
        opacity: 0;
    }

    .file-item:hover .file-actions,
    .file-item:hover .file-action {
        opacity: 1;
    }

    .file-action {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: var(--color-text-muted);
        opacity: 0;
    }

    .file-action:hover {
        background: var(--color-accent);
        color: white;
    }

    .file-action.discard:hover {
        background: #f85149;
    }

    .commit-box {
        padding: 12px;
        border-top: 1px solid var(--color-border-subtle);
    }

    .commit-box textarea {
        width: 100%;
        padding: 10px;
        background: var(--color-bg);
        border: 1px solid var(--color-border-subtle);
        border-radius: 6px;
        color: var(--color-text);
        font-size: 13px;
        font-family: inherit;
        resize: none;
        outline: none;
    }

    .commit-box textarea:focus {
        border-color: var(--color-accent);
    }

    .commit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        margin-top: 8px;
        padding: 10px 16px;
        background: linear-gradient(135deg, #238636, #2ea043);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .commit-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(35, 134, 54, 0.3);
    }

    .commit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .history-list {
        flex: 1;
        overflow-y: auto;
    }

    .commit-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .commit-item:hover {
        background: var(--color-surface-elevated);
    }

    .commit-icon {
        color: var(--color-text-muted);
        padding-top: 2px;
    }

    .commit-info {
        flex: 1;
        min-width: 0;
    }

    .commit-message {
        color: var(--color-text);
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .commit-meta {
        display: flex;
        gap: 8px;
        margin-top: 4px;
        font-size: 11px;
        color: var(--color-text-muted);
    }

    .commit-hash {
        font-family: 'SF Mono', monospace;
        color: var(--color-accent);
    }

    .diff-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-top: 1px solid var(--color-border-subtle);
        min-height: 200px;
    }

    .diff-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--color-bg);
        font-size: 12px;
        color: var(--color-text-secondary);
    }

    .file-path-title {
        flex: 1;
    }

    .close-diff {
        padding: 4px;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: var(--color-text-muted);
        cursor: pointer;
    }

    .close-diff:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .diff-body {
        flex: 1;
        overflow: auto;
    }

    .diff-content {
        margin: 0;
        padding: 0;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        line-height: 1.6;
    }

    .diff-line {
        padding: 0 12px;
        white-space: pre;
    }

    .diff-add {
        background: rgba(63, 185, 80, 0.15);
        color: #3fb950;
    }

    .diff-remove {
        background: rgba(248, 81, 73, 0.15);
        color: #f85149;
    }

    .diff-hunk {
        background: rgba(88, 166, 255, 0.1);
        color: #58a6ff;
        padding: 4px 12px;
        margin: 4px 0;
    }

    .binary-notice {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--color-text-muted);
        text-align: center;
        gap: 12px;
    }

    .binary-notice p {
        margin: 0;
        font-weight: 500;
    }

    .binary-notice .sub {
        font-size: 11px;
        opacity: 0.7;
    }

    .animate-spin {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`
