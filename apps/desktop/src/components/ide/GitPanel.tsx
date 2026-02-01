/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { GitBranch, RefreshCw, Check, X, FileText, AlertCircle, Folder } from 'lucide-react'
import { useNotificationStore } from '../../stores/notificationStore'

interface GitFile {
    path: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
    staged: boolean
}

interface GitPanelProps {
    readonly workspacePath: string | null
    readonly isVisible?: boolean  // Only poll when visible to save CPU
}

export default function GitPanel({ workspacePath, isVisible = true }: GitPanelProps) {
    const [branch, setBranch] = useState<string>('main')
    const [files, setFiles] = useState<GitFile[]>([])
    const [commitMessage, setCommitMessage] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [diff, setDiff] = useState<string | null>(null)
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [isRepo, setIsRepo] = useState<boolean>(false)
    const { addNotification } = useNotificationStore()
    const lastRefreshRef = useRef<number>(0)

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
                setIsRepo(true)
            } else {
                setIsRepo(false)
                setLoading(false)
                return
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
        } catch (err) {
            addNotification(`Failed to refresh Git: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
            setError(String(err))
        }

        setLoading(false)
    }, [workspacePath, addNotification])

    // Watch for file changes to trigger git refresh
    useEffect(() => {
        if (!workspacePath || !isVisible) return

        let timeout: any
        const debouncedRefresh = () => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                const now = Date.now()
                if (now - lastRefreshRef.current > 1000) { // Throttle to 1s
                    fetchStatus()
                    lastRefreshRef.current = now
                }
            }, 500)
        }

        // Initial fetch
        fetchStatus()

        // Watch .git changes if possible, or just the workspace
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

    // Stage file
    const stageFile = async (path: string) => {
        if (!workspacePath) return

        try {
            await globalThis.window.electronAPI?.git.add({ repoPath: workspacePath, files: [path] })
            await fetchStatus()
        } catch (err) {
            console.error('[Git] Stage file error:', err)
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
                console.error('[Git] Stage all error:', err)
                setError('Failed to stage all files')
            }
        }
    }

    // Unstage file (reset)
    const unstageFile = async (path: string) => {
        if (!workspacePath) return

        try {
            const result = await globalThis.window.electronAPI?.git.reset({
                repoPath: workspacePath,
                files: [path]
            })
            if (result?.success) {
                await fetchStatus()
            } else {
                setError(result?.error || 'Failed to unstage file')
            }
        } catch (err) {
            console.error('[Git] Unstage file error:', err)
            setError('Failed to unstage file')
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
            } else {
                setError(result?.error || 'Commit failed')
            }
        } catch (err) {
            console.error('[Git] Commit error:', err)
            setError('Failed to commit changes')
        }
    }

    // View diff for a file
    const viewDiff = async (path: string) => {
        if (!workspacePath) return

        try {
            setSelectedFile(path)

            const binaryExts = [
                '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz',
                '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.exe', '.dll', '.so', '.dylib',
                '.bin', '.pyc', '.wasm', '.o', '.a', '.lib'
            ]
            if (binaryExts.some(ext => path.toLowerCase().endsWith(ext))) {
                setDiff('BINARY_FILE')
                return
            }

            const result = await globalThis.window.electronAPI?.git.diff({
                repoPath: workspacePath,
                file: path
            })

            if (result?.success) {
                setDiff(result.diff || 'No changes')
            } else {
                setError(result?.error || 'Failed to load diff')
            }
        } catch (err) {
            console.error('[Git] Diff error:', err)
            setError('Failed to load diff')
        }
    }

    // Get status icon
    const getStatusIcon = (status: GitFile['status']) => {
        switch (status) {
            case 'modified': return 'M'
            case 'added': return 'A'
            case 'deleted': return 'D'
            case 'renamed': return 'R'
            case 'untracked': return 'U'
        }
    }

    // Get status color
    const getStatusColor = (status: GitFile['status']) => {
        switch (status) {
            case 'modified': return '#d29922'
            case 'added': return '#3fb950'
            case 'deleted': return '#f85149'
            case 'renamed': return '#a371f7'
            case 'untracked': return '#8b949e'
        }
    }

    const stagedFiles = files.filter(f => f.staged)
    const unstagedFiles = files.filter(f => !f.staged)

    if (!workspacePath) {
        return (
            <div className="git-panel empty">
                <p>Open a folder to view Git status</p>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    if (!isRepo) {
        return (
            <div className="git-panel empty">
                <p style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <Folder size={16} /> Not a Git repository
                </p>
                <p className="hint">Initialize a repository to track changes</p>
                <style>{gitPanelStyles}</style>
            </div>
        )
    }

    return (
        <div className="git-panel">
            {/* Header */}
            <div className="git-header">
                <GitBranch size={16} className="text-accent" />
                <span className="branch-name">{branch}</span>
                <button className="refresh-btn" onClick={fetchStatus} title="Refresh Status">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="git-error">{error}</div>
            )}

            {loading && files.length === 0 ? (
                <div className="loading">Loading...</div>
            ) : (
                <>
                    {/* Staged Changes */}
                    <div className="git-section">
                        <div className="section-header">
                            <span>Staged Changes ({stagedFiles.length})</span>
                            {stagedFiles.length > 0 && (
                                <button className="section-action" title="Unstage all">âˆ’</button>
                            )}
                        </div>
                        {stagedFiles.length === 0 ? (
                            <div className="empty-section">No staged changes</div>
                        ) : (
                            <div className="file-list">
                                {stagedFiles.map(file => (
                                    <button
                                        key={file.path}
                                        className="file-item"
                                        onClick={() => viewDiff(file.path)}
                                        aria-label={`View changes for ${file.path}`}
                                    >
                                        <span
                                            className="status-badge"
                                            style={{ color: getStatusColor(file.status) }}
                                        >
                                            {getStatusIcon(file.status)}
                                        </span>
                                        <span className="file-path">{file.path}</span>
                                        <button
                                            type="button"
                                            className="file-action"
                                            onClick={(e) => { e.stopPropagation(); unstageFile(file.path) }}
                                            title="Unstage"
                                        >
                                            âˆ’
                                        </button>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Changes */}
                    <div className="git-section">
                        <div className="section-header">
                            <span>Changes ({unstagedFiles.length})</span>
                            {unstagedFiles.length > 0 && (
                                <button
                                    type="button"
                                    className="section-action"
                                    onClick={stageAll}
                                    title="Stage all"
                                >
                                    +
                                </button>
                            )}
                        </div>
                        {unstagedFiles.length === 0 ? (
                            <div className="empty-section">No changes</div>
                        ) : (
                            <div className="file-list">
                                {unstagedFiles.map(file => (
                                    <button
                                        key={file.path}
                                        className="file-item"
                                        onClick={() => viewDiff(file.path)}
                                        aria-label={`View changes for ${file.path}`}
                                    >
                                        <span
                                            className="status-badge"
                                            style={{ color: getStatusColor(file.status) }}
                                        >
                                            {getStatusIcon(file.status)}
                                        </span>
                                        <span className="file-path">{file.path}</span>
                                        <button
                                            type="button"
                                            className="file-action"
                                            onClick={(e) => { e.stopPropagation(); stageFile(file.path) }}
                                            title="Stage"
                                        >
                                            +
                                        </button>
                                    </button>
                                ))}
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
                                type="button"
                                className="commit-btn"
                                onClick={commit}
                                disabled={!commitMessage.trim()}
                            >
                                <Check size={14} className="mr-1" />
                                Commit ({stagedFiles.length})
                            </button>
                        </div>
                    )}

                    {/* Diff View */}
                    {diff && selectedFile && (
                        <div className="diff-panel">
                            <div className="diff-header">
                                <FileText size={14} className="mr-1" />
                                <span className="file-path-title">{selectedFile}</span>
                                <button type="button" className="close-diff" onClick={() => { setDiff(null); setSelectedFile(null) }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="diff-body">
                                {diff === 'BINARY_FILE' ? (
                                    <div className="binary-notice">
                                        <AlertCircle size={32} />
                                        <p>Binary file changes detected</p>
                                        <p className="sub">Diff preview is not available for this file type.</p>
                                    </div>
                                ) : (
                                    <pre className="diff-content">{diff}</pre>
                                )}
                            </div>
                        </div>
                    )}
                </>
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
    }

    .git-panel.empty .hint {
        font-size: 11px;
        margin-top: 4px;
    }

    .git-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .branch-icon {
        font-size: 14px;
    }

    .branch-name {
        font-weight: 600;
        color: var(--color-text);
    }

    .refresh-btn {
        margin-left: auto;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: var(--color-text-secondary);
    }

    .refresh-btn:hover {
        background: var(--color-surface-elevated);
    }

    .git-error {
        padding: 8px 12px;
        background: rgba(248, 81, 73, 0.1);
        color: #f85149;
        font-size: 12px;
    }

    .loading {
        padding: 24px;
        text-align: center;
        color: var(--color-text-muted);
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
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .empty-section {
        padding: 12px;
        color: var(--color-text-muted);
        font-size: 12px;
        font-style: italic;
    }

    .file-list {
        max-height: 200px;
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
        font-family: monospace;
        min-width: 14px;
    }

    .file-path {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-text-secondary);
    }

    .file-action {
        width: 18px;
        height: 18px;
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

    .file-item:hover .file-action {
        opacity: 1;
    }

    .file-action:hover {
        background: var(--color-accent);
        color: white;
    }

    .commit-box {
        padding: 12px;
        border-top: 1px solid var(--color-border-subtle);
    }

    .commit-box textarea {
        width: 100%;
        padding: 8px;
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
        width: 100%;
        margin-top: 8px;
        padding: 8px 16px;
        background: #238636;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
    }

    .commit-btn:hover {
        background: #2ea043;
    }

    .commit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--color-bg);
        font-size: 12px;
        color: var(--color-text-secondary);
    }

    .diff-header button {
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 16px;
    }

    .diff-content {
        flex: 1;
        overflow-x: auto;
        padding: 12px;
        margin: 0;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-secondary);
        white-space: pre;
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
        font-weight: 500;
        margin: 0;
    }

    .binary-notice .sub {
        font-size: 11px;
        opacity: 0.7;
    }

    .close-diff {
        padding: 4px;
        border-radius: 4px;
        color: var(--color-text-muted);
    }
    
    .close-diff:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .animate-spin {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`
