/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ModelManager - UI for browsing and downloading offline AI models
import { useState, useEffect } from 'react'
import { useModelStore } from '../stores/modelStore'
import {
    OFFLINE_MODELS,
    OfflineModel,
    formatBytes,
    formatETA
} from '../types/offlineModels'
import {
    downloadModel,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    deleteModel
} from '../services/modelDownloadService'
import {
    Star, Check, Pause, AlertTriangle, Bot, X,
    HardDrive, Package, Cpu, Download, RotateCw, Trash2, Play,
    Circle
} from 'lucide-react'

interface Props {
    onClose: () => void
    onSelectModel?: (modelId: string) => void
}

export default function ModelManager({ onClose, onSelectModel }: Props) {
    const {
        downloadedModels,
        activeDownloads,
        loadedModelId,
        getTotalDownloadedSize
    } = useModelStore()

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    useEffect(() => {
        useModelStore.getState().setupListeners()
    }, [])

    const handleDownload = async (model: OfflineModel) => {
        await downloadModel(model.id)
    }

    const handleDelete = async (modelId: string) => {
        await deleteModel(modelId)
        setConfirmDelete(null)
    }

    const handleSelect = (modelId: string) => {
        if (onSelectModel) {
            onSelectModel(modelId)
        }
    }

    const getQualityStars = (quality: number) => {
        return (
            <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                    <Star
                        key={i}
                        size={12}
                        className={i < quality ? "fill-yellow-500 text-yellow-500" : "text-gray-600"}
                    />
                ))}
            </div>
        )
    }

    const getStatusBadge = (model: OfflineModel) => {
        const downloaded = downloadedModels[model.id]
        const download = activeDownloads[model.id]

        if (loadedModelId === model.id) {
            return <span className="badge badge-active flex items-center gap-1"><Check size={10} /> Active</span>
        }
        if (downloaded) {
            return <span className="badge badge-downloaded flex items-center gap-1"><Check size={10} /> Downloaded</span>
        }
        if (download?.status === 'downloading') {
            const pct = Math.round((download.bytesDownloaded / download.totalBytes) * 100)
            return <span className="badge badge-progress">{pct}%</span>
        }
        if (download?.status === 'paused') {
            return <span className="badge badge-paused flex items-center gap-1"><Pause size={10} /> Paused</span>
        }
        if (download?.status === 'error') {
            return <span className="badge badge-error flex items-center gap-1"><AlertTriangle size={10} /> Error</span>
        }
        return null
    }

    const getTierIcon = (tierIndex: number) => {
        if (tierIndex <= 2) return <Circle size={16} className="fill-green-500 text-green-500" />
        if (tierIndex <= 4) return <Circle size={16} className="fill-yellow-500 text-yellow-500" />
        return <Circle size={16} className="fill-blue-500 text-blue-500" />
    }

    return (
        <div className="model-manager-overlay" onClick={onClose}>
            <div className="model-manager" onClick={(e) => e.stopPropagation()}>
                <div className="manager-header">
                    <h2 className="flex items-center gap-2"><Bot size={20} /> Offline AI Models</h2>
                    <button className="close-btn flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="manager-info">
                    <div className="tier-info">
                        <span className="tier-badge">Free Beta</span>
                        <span>
                            All {OFFLINE_MODELS.length} models available
                        </span>
                    </div>
                    <div className="storage-info flex items-center gap-2">
                        <HardDrive size={14} /> {formatBytes(getTotalDownloadedSize())} used
                    </div>
                </div>

                <div className="model-list">
                    {OFFLINE_MODELS.map((model) => {
                        const downloaded = downloadedModels[model.id]
                        const download = activeDownloads[model.id]
                        const isDownloading = download?.status === 'downloading'
                        const isPaused = download?.status === 'paused'
                        const hasError = download?.status === 'error'

                        return (
                            <div
                                key={model.id}
                                className={`model-card ${downloaded ? 'downloaded' : ''}`}
                            >
                                <div className="model-main">
                                    <div className="model-icon pt-1">
                                        {getTierIcon(model.tierIndex)}
                                    </div>
                                    <div className="model-info">
                                        <div className="model-header-row">
                                            <h3>{model.name}</h3>
                                            {getStatusBadge(model)}
                                        </div>
                                        <p className="model-desc">{model.description}</p>
                                        <div className="model-stats">
                                            <span className="stat flex items-center gap-1"><Package size={12} /> {model.size}</span>
                                            <span className="stat flex items-center gap-1"><Cpu size={12} /> {model.ramRequired} RAM</span>
                                            <span className="stat quality">{getQualityStars(model.quality)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Download Progress */}
                                {(isDownloading || isPaused) && download && (
                                    <div className="download-progress">
                                        <div className="progress-bar">
                                            <div
                                                className="progress-fill"
                                                style={{ width: `${(download.bytesDownloaded / download.totalBytes) * 100}%` }}
                                            />
                                        </div>
                                        <div className="progress-info">
                                            <span>
                                                {formatBytes(download.bytesDownloaded)} / {formatBytes(download.totalBytes)}
                                            </span>
                                            {isDownloading && (
                                                <span>
                                                    {formatBytes(download.speed)}/s • {formatETA(download.eta)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Error Message */}
                                {hasError && download?.error && (
                                    <div className="error-message flex items-center gap-2">
                                        <AlertTriangle size={14} /> {download.error}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="model-actions">
                                    {downloaded ? (
                                        <>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => handleSelect(model.id)}
                                            >
                                                {loadedModelId === model.id ? (
                                                    <span className="flex items-center gap-2"><Check size={14} /> Selected</span>
                                                ) : 'Use Model'}
                                            </button>
                                            {confirmDelete === model.id ? (
                                                <>
                                                    <button
                                                        className="btn btn-danger"
                                                        onClick={() => handleDelete(model.id)}
                                                    >
                                                        Confirm Delete
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => setConfirmDelete(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    className="btn btn-ghost flex items-center gap-2"
                                                    onClick={() => setConfirmDelete(model.id)}
                                                >
                                                    <Trash2 size={14} /> Delete
                                                </button>
                                            )}
                                        </>
                                    ) : isDownloading ? (
                                        <>
                                            <button
                                                className="btn btn-secondary flex items-center gap-2"
                                                onClick={() => pauseDownload(model.id)}
                                            >
                                                <Pause size={14} /> Pause
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => cancelDownload(model.id)}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : isPaused ? (
                                        <>
                                            <button
                                                className="btn btn-primary flex items-center gap-2"
                                                onClick={() => resumeDownload(model.id)}
                                            >
                                                <Play size={14} /> Resume
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => cancelDownload(model.id)}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : hasError ? (
                                        <>
                                            <button
                                                className="btn btn-primary flex items-center gap-2"
                                                onClick={() => handleDownload(model)}
                                            >
                                                <RotateCw size={14} /> Retry
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => cancelDownload(model.id)}
                                            >
                                                Dismiss
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className="btn btn-primary flex items-center gap-2"
                                            onClick={() => handleDownload(model)}
                                        >
                                            <Download size={14} /> Download
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <style>{`
                    .model-manager-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.8);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                    }

                    .model-manager {
                        width: 700px;
                        max-height: 85vh;
                        background: var(--color-surface);
                        border: 1px solid var(--color-border);
                        border-radius: var(--radius-xl);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    .manager-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: var(--space-4);
                        border-bottom: 1px solid var(--color-border);
                    }

                    .manager-header h2 {
                        font-size: var(--text-lg);
                        font-weight: var(--font-semibold);
                        margin: 0;
                    }

                    .close-btn {
                        width: 32px;
                        height: 32px;
                        color: var(--color-text-muted);
                    }

                    .manager-info {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: var(--space-3) var(--space-4);
                        background: var(--color-surface-elevated);
                        border-bottom: 1px solid var(--color-border);
                        font-size: var(--text-sm);
                    }

                    .tier-info {
                        display: flex;
                        align-items: center;
                        gap: var(--space-2);
                    }

                    .tier-badge {
                        padding: 2px 8px;
                        background: var(--color-accent);
                        color: white;
                        border-radius: var(--radius-sm);
                        font-size: var(--text-xs);
                        font-weight: var(--font-medium);
                        text-transform: uppercase;
                    }

                    .storage-info {
                        color: var(--color-text-muted);
                    }

                    .model-list {
                        flex: 1;
                        overflow-y: auto;
                        padding: var(--space-4);
                        display: flex;
                        flex-direction: column;
                        gap: var(--space-3);
                    }

                    .model-card {
                        background: var(--color-bg);
                        border: 1px solid var(--color-border);
                        border-radius: var(--radius-lg);
                        padding: var(--space-4);
                        transition: all var(--transition-fast);
                    }

                    .model-card.locked {
                        opacity: 0.6;
                    }

                    .model-card.downloaded {
                        border-color: var(--color-success);
                        background: rgba(34, 197, 94, 0.05);
                    }

                    .model-main {
                        display: flex;
                        gap: var(--space-3);
                    }

                    .model-icon {
                        flex-shrink: 0;
                    }

                    .model-info {
                        flex: 1;
                        min-width: 0;
                    }

                    .model-header-row {
                        display: flex;
                        align-items: center;
                        gap: var(--space-2);
                        margin-bottom: var(--space-1);
                    }

                    .model-header-row h3 {
                        font-size: var(--text-base);
                        font-weight: var(--font-medium);
                        margin: 0;
                    }

                    .badge {
                        font-size: var(--text-xs);
                        padding: 2px 6px;
                        border-radius: var(--radius-sm);
                        font-weight: var(--font-medium);
                    }

                    .badge-locked {
                        background: var(--color-text-muted);
                        color: white;
                    }

                    .badge-downloaded {
                        background: var(--color-success);
                        color: white;
                    }

                    .badge-active {
                        background: var(--color-accent);
                        color: white;
                    }

                    .badge-progress {
                        background: var(--color-warning);
                        color: var(--color-bg);
                    }

                    .badge-paused {
                        background: var(--color-text-muted);
                        color: white;
                    }

                    .badge-error {
                        background: var(--color-error);
                        color: white;
                    }

                    .model-desc {
                        font-size: var(--text-sm);
                        color: var(--color-text-secondary);
                        margin: 0 0 var(--space-2) 0;
                    }

                    .model-stats {
                        display: flex;
                        gap: var(--space-3);
                        font-size: var(--text-xs);
                        color: var(--color-text-muted);
                    }

                    .stat.quality {
                        color: var(--color-warning);
                    }

                    .download-progress {
                        margin-top: var(--space-3);
                    }

                    .progress-bar {
                        height: 6px;
                        background: var(--color-border);
                        border-radius: 3px;
                        overflow: hidden;
                    }

                    .progress-fill {
                        height: 100%;
                        background: var(--color-accent);
                        transition: width 0.2s ease;
                    }

                    .progress-info {
                        display: flex;
                        justify-content: space-between;
                        margin-top: var(--space-1);
                        font-size: var(--text-xs);
                        color: var(--color-text-muted);
                    }

                    .error-message {
                        margin-top: var(--space-2);
                        padding: var(--space-2);
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: var(--radius-sm);
                        font-size: var(--text-xs);
                        color: var(--color-error);
                    }

                    .model-actions {
                        display: flex;
                        gap: var(--space-2);
                        margin-top: var(--space-3);
                        padding-top: var(--space-3);
                        border-top: 1px solid var(--color-border);
                    }

                    .btn-danger {
                        background: var(--color-error);
                        color: white;
                    }

                    .btn-danger:hover {
                        background: #dc2626;
                    }
                `}</style>
            </div>
        </div>
    )
}
