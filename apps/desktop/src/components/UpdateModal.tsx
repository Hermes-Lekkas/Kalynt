/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useUpdateStore } from '../stores/updateStore'
import { Download, CheckCircle, X, AlertTriangle, Zap } from 'lucide-react'

/**
 * UpdateModal Component
 * Shows update information and allows users to download/install updates
 */

export default function UpdateModal() {
    const {
        showUpdateModal,
        status,
        updateInfo,
        downloadProgress,
        error,
        currentVersion,
        downloadUpdate,
        installUpdate,
        dismissUpdate,
        setShowUpdateModal
    } = useUpdateStore()

    if (!showUpdateModal) return null

    const handleClose = () => {
        setShowUpdateModal(false)
    }

    const handleDownload = () => {
        downloadUpdate()
    }

    const handleInstall = () => {
        installUpdate()
    }

    const handleDismiss = () => {
        dismissUpdate()
    }

    // Format bytes to readable size
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }

    // Format date
    const formatDate = (dateString: string): string => {
        try {
            const date = new Date(dateString)
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        } catch {
            return dateString
        }
    }

    return (
        <div className="update-modal-overlay" onClick={handleClose}>
            <div className="update-modal" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={handleClose} title="Close">
                    <X size={18} />
                </button>

                <div className="modal-header">
                    <div className="modal-icon">
                        {status === 'downloaded' ? (
                            <CheckCircle size={32} className="icon-success" />
                        ) : error ? (
                            <AlertTriangle size={32} className="icon-error" />
                        ) : (
                            <Zap size={32} className="icon-update" />
                        )}
                    </div>
                    <h2 className="modal-title">
                        {status === 'downloaded'
                            ? 'Update Ready to Install'
                            : error
                            ? 'Update Error'
                            : 'Update Available'}
                    </h2>
                </div>

                <div className="modal-body">
                    {error ? (
                        <div className="error-message">
                            <p>{error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="version-info">
                                <div className="version-row">
                                    <span className="version-label">Current Version:</span>
                                    <span className="version-value current">{currentVersion}</span>
                                </div>
                                {updateInfo && (
                                    <div className="version-row">
                                        <span className="version-label">New Version:</span>
                                        <span className="version-value new">{updateInfo.version}</span>
                                    </div>
                                )}
                            </div>

                            {updateInfo?.releaseDate && (
                                <div className="release-date">
                                    Released: {formatDate(updateInfo.releaseDate)}
                                </div>
                            )}

                            {updateInfo?.releaseNotes && (
                                <div className="release-notes">
                                    <h3>Release Notes</h3>
                                    <div className="release-notes-content">
                                        {updateInfo.releaseNotes}
                                    </div>
                                </div>
                            )}

                            {status === 'downloading' && downloadProgress && (
                                <div className="download-progress">
                                    <div className="progress-header">
                                        <span>Downloading update...</span>
                                        <span>{downloadProgress.percent.toFixed(1)}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${downloadProgress.percent}%` }}
                                        />
                                    </div>
                                    <div className="progress-details">
                                        <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                                        <span>{formatBytes(downloadProgress.bytesPerSecond)}/s</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    {error ? (
                        <button className="btn btn-secondary" onClick={handleDismiss}>
                            Close
                        </button>
                    ) : status === 'downloaded' ? (
                        <>
                            <button className="btn btn-secondary" onClick={handleDismiss}>
                                Install Later
                            </button>
                            <button className="btn btn-primary" onClick={handleInstall}>
                                <Download size={16} />
                                Install & Restart
                            </button>
                        </>
                    ) : status === 'downloading' ? (
                        <button className="btn btn-secondary" disabled>
                            Downloading...
                        </button>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={handleDismiss}>
                                Skip This Version
                            </button>
                            <button className="btn btn-primary" onClick={handleDownload}>
                                <Download size={16} />
                                Download Update
                            </button>
                        </>
                    )}
                </div>

                <style>{`
                    .update-modal-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.7);
                        backdrop-filter: blur(8px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                        animation: fadeIn 0.2s ease-out;
                    }

                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                        }
                        to {
                            opacity: 1;
                        }
                    }

                    .update-modal {
                        background: var(--color-surface);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: var(--radius-lg);
                        width: 90%;
                        max-width: 550px;
                        max-height: 90vh;
                        overflow: hidden;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                        animation: slideUp 0.3s ease-out;
                        position: relative;
                    }

                    @keyframes slideUp {
                        from {
                            transform: translateY(20px);
                            opacity: 0;
                        }
                        to {
                            transform: translateY(0);
                            opacity: 1;
                        }
                    }

                    .modal-close {
                        position: absolute;
                        top: 16px;
                        right: 16px;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: var(--radius-md);
                        color: var(--color-text-tertiary);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                        z-index: 1;
                    }

                    .modal-close:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: var(--color-text);
                        border-color: rgba(255, 255, 255, 0.2);
                    }

                    .modal-header {
                        padding: 32px 32px 24px;
                        text-align: center;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    }

                    .modal-icon {
                        margin-bottom: 16px;
                        display: flex;
                        justify-content: center;
                    }

                    .icon-success {
                        color: #22c55e;
                    }

                    .icon-error {
                        color: #ef4444;
                    }

                    .icon-update {
                        color: var(--color-accent);
                        animation: pulse 2s ease-in-out infinite;
                    }

                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                        }
                        50% {
                            opacity: 0.5;
                        }
                    }

                    .modal-title {
                        font-size: var(--text-xl);
                        font-weight: var(--font-bold);
                        color: var(--color-text);
                        margin: 0;
                    }

                    .modal-body {
                        padding: 24px 32px;
                        max-height: 400px;
                        overflow-y: auto;
                    }

                    .version-info {
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        border-radius: var(--radius-md);
                        padding: 16px;
                        margin-bottom: 16px;
                    }

                    .version-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 0;
                    }

                    .version-row:not(:last-child) {
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    }

                    .version-label {
                        font-size: var(--text-sm);
                        color: var(--color-text-secondary);
                    }

                    .version-value {
                        font-family: var(--font-mono);
                        font-size: var(--text-sm);
                        font-weight: var(--font-semibold);
                        padding: 4px 12px;
                        border-radius: var(--radius-pill);
                    }

                    .version-value.current {
                        background: rgba(255, 255, 255, 0.05);
                        color: var(--color-text-tertiary);
                    }

                    .version-value.new {
                        background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2));
                        color: #22c55e;
                        border: 1px solid rgba(34, 197, 94, 0.3);
                    }

                    .release-date {
                        font-size: var(--text-sm);
                        color: var(--color-text-tertiary);
                        margin-bottom: 16px;
                        text-align: center;
                    }

                    .release-notes {
                        margin-bottom: 16px;
                    }

                    .release-notes h3 {
                        font-size: var(--text-base);
                        font-weight: var(--font-semibold);
                        color: var(--color-text);
                        margin: 0 0 12px 0;
                    }

                    .release-notes-content {
                        background: rgba(0, 0, 0, 0.2);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        border-radius: var(--radius-md);
                        padding: 16px;
                        font-size: var(--text-sm);
                        line-height: 1.6;
                        color: var(--color-text-secondary);
                        white-space: pre-wrap;
                        max-height: 200px;
                        overflow-y: auto;
                    }

                    .download-progress {
                        margin-top: 16px;
                    }

                    .progress-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                        font-size: var(--text-sm);
                        color: var(--color-text-secondary);
                    }

                    .progress-bar {
                        height: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: var(--radius-pill);
                        overflow: hidden;
                        margin-bottom: 8px;
                    }

                    .progress-fill {
                        height: 100%;
                        background: linear-gradient(90deg, var(--color-gradient-start), var(--color-gradient-middle));
                        border-radius: var(--radius-pill);
                        transition: width 0.3s ease;
                    }

                    .progress-details {
                        display: flex;
                        justify-content: space-between;
                        font-size: var(--text-xs);
                        color: var(--color-text-tertiary);
                    }

                    .error-message {
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: var(--radius-md);
                        padding: 16px;
                        color: #ef4444;
                        font-size: var(--text-sm);
                    }

                    .modal-footer {
                        padding: 20px 32px;
                        border-top: 1px solid rgba(255, 255, 255, 0.05);
                        display: flex;
                        gap: 12px;
                        justify-content: flex-end;
                    }

                    .btn {
                        padding: 10px 20px;
                        font-size: var(--text-sm);
                        font-weight: var(--font-medium);
                        border-radius: var(--radius-md);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        border: none;
                    }

                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .btn-primary {
                        background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-middle));
                        color: white;
                        box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
                    }

                    .btn-primary:hover:not(:disabled) {
                        transform: translateY(-1px);
                        box-shadow: 0 0 30px rgba(59, 130, 246, 0.5);
                    }

                    .btn-primary:active:not(:disabled) {
                        transform: translateY(0);
                    }

                    .btn-secondary {
                        background: rgba(255, 255, 255, 0.05);
                        color: var(--color-text-secondary);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }

                    .btn-secondary:hover:not(:disabled) {
                        background: rgba(255, 255, 255, 0.1);
                        color: var(--color-text);
                    }
                `}</style>
            </div>
        </div>
    )
}
