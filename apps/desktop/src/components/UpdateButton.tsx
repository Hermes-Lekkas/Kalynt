/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useUpdateStore } from '../stores/updateStore'
import { Download, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

/**
 * UpdateButton Component
 * Replaces the "Free Beta" badge in the titlebar with a professional update button
 * Shows update status and allows users to check for and install updates
 */

export default function UpdateButton() {
    const {
        status,
        updateInfo,
        downloadProgress,
        error,
        checkForUpdates,
        setShowUpdateModal
    } = useUpdateStore()

    // Get the display content based on status
    const getButtonContent = () => {
        switch (status) {
            case 'checking':
                return {
                    icon: <Loader2 size={12} className="animate-spin" />,
                    text: 'Checking...',
                    className: 'status-checking'
                }

            case 'available':
                return {
                    icon: <Download size={12} />,
                    text: `Update ${updateInfo?.version}`,
                    className: 'status-available',
                    pulse: true
                }

            case 'downloading':
                return {
                    icon: <Loader2 size={12} className="animate-spin" />,
                    text: `${downloadProgress?.percent.toFixed(0) || 0}%`,
                    className: 'status-downloading'
                }

            case 'downloaded':
                return {
                    icon: <Check size={12} />,
                    text: 'Ready to Install',
                    className: 'status-downloaded',
                    pulse: true
                }

            case 'error':
                return {
                    icon: <AlertCircle size={12} />,
                    text: 'Update Error',
                    className: 'status-error'
                }

            case 'not-available':
                return {
                    icon: <Check size={12} />,
                    text: 'Up to date',
                    className: 'status-up-to-date'
                }

            default:
                return {
                    icon: <RefreshCw size={12} />,
                    text: 'Check for Updates',
                    className: 'status-idle'
                }
        }
    }

    const handleClick = () => {
        if (status === 'available' || status === 'downloaded') {
            // Open update modal
            setShowUpdateModal(true)
        } else if (status === 'idle' || status === 'not-available' || status === 'error') {
            // Check for updates
            checkForUpdates()
        }
    }

    const content = getButtonContent()
    const isClickable = ['idle', 'not-available', 'available', 'downloaded', 'error'].includes(status)

    return (
        <button
            className={`update-button ${content.className} ${content.pulse ? 'pulse' : ''}`}
            onClick={handleClick}
            disabled={!isClickable}
            title={error || `Current version: ${useUpdateStore.getState().currentVersion}`}
        >
            <span className="update-icon">{content.icon}</span>
            <span className="update-text">{content.text}</span>

            <style>{`
                .update-button {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    font-size: var(--text-xs);
                    font-weight: var(--font-semibold);
                    background: var(--color-glass);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-pill);
                    cursor: pointer;
                    transition: all var(--transition-base);
                    position: relative;
                    overflow: hidden;
                }

                .update-button:disabled {
                    cursor: default;
                    opacity: 0.8;
                }

                .update-button:not(:disabled):hover {
                    background: var(--color-glass-hover);
                    border-color: var(--color-accent);
                    transform: translateY(-1px);
                    box-shadow: 0 0 15px var(--color-glass);
                }

                .update-button:not(:disabled):active {
                    transform: translateY(0);
                }

                .update-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .update-text {
                    white-space: nowrap;
                }

                /* Status-specific styles */
                .status-idle .update-text,
                .status-checking .update-text {
                    color: var(--color-text-secondary);
                }

                .status-available {
                    border-color: #22c55e;
                }

                .status-available .update-text {
                    color: #22c55e;
                }

                .status-downloading {
                    border-color: var(--color-accent);
                }

                .status-downloading .update-text {
                    color: var(--color-accent);
                }

                .status-downloaded {
                    border-color: #10b981;
                }

                .status-downloaded .update-text {
                    color: #10b981;
                }

                .status-error {
                    border-color: #ef4444;
                }

                .status-error .update-text {
                    color: #ef4444;
                }

                .status-up-to-date .update-text {
                    color: var(--color-text-tertiary);
                }

                /* Pulse animation for important states */
                .update-button.pulse {
                    animation: pulse-border 2s ease-in-out infinite;
                }

                @keyframes pulse-border {
                    0%, 100% {
                        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
                    }
                    50% {
                        box-shadow: 0 0 0 4px rgba(34, 197, 94, 0);
                    }
                }

                /* Shimmer effect for downloading */
                .status-downloading::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(
                        90deg,
                        transparent,
                        rgba(59, 130, 246, 0.2),
                        transparent
                    );
                    animation: shimmer 2s infinite;
                }

                @keyframes shimmer {
                    0% {
                        left: -100%;
                    }
                    100% {
                        left: 100%;
                    }
                }

                /* Loading spinner animation */
                .animate-spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </button>
    )
}
