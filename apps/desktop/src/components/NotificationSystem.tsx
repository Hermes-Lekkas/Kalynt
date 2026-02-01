/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import { useNotificationStore, Notification } from '../stores/notificationStore'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'

export const NotificationSystem: React.FC = () => {
    const { notifications, removeNotification } = useNotificationStore()

    if (notifications.length === 0) return null

    return (
        <div className="notification-container">
            {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onClose={() => removeNotification(n.id)} />
            ))}
            <style>{`
                .notification-container {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                }

                .notification-item {
                    pointer-events: auto;
                    min-width: 300px;
                    max-width: 450px;
                    background: var(--color-surface-elevated, #2d2d2d);
                    border: 1px solid var(--color-border, #3c3c3c);
                    border-radius: 8px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                    animation: slideIn 0.3s ease-out;
                }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                .notification-icon {
                    margin-top: 2px;
                    flex-shrink: 0;
                }

                .notification-content {
                    flex: 1;
                    font-size: 13px;
                    line-height: 1.5;
                    color: var(--color-text, #ccc);
                }

                .notification-close {
                    background: transparent;
                    border: none;
                    color: var(--color-text-muted, #777);
                    cursor: pointer;
                    padding: 2px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .notification-close:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--color-text, #ccc);
                }

                /* Type-specific styles */
                .notification-item.info .notification-icon { color: #3b82f6; }
                .notification-item.success .notification-icon { color: #22c55e; }
                .notification-item.warning .notification-icon { color: #eab308; }
                .notification-item.error .notification-icon { color: #ef4444; }
                .notification-item.error { border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); }
            `}</style>
        </div>
    )
}

const NotificationItem: React.FC<{ notification: Notification; onClose: () => void }> = ({ notification, onClose }) => {
    const getIcon = () => {
        switch (notification.type) {
            case 'success': return <CheckCircle size={18} />
            case 'warning': return <AlertTriangle size={18} />
            case 'error': return <AlertCircle size={18} />
            default: return <Info size={18} />
        }
    }

    return (
        <div className={`notification-item ${notification.type}`}>
            <div className="notification-icon">{getIcon()}</div>
            <div className="notification-content">{notification.message}</div>
            <button className="notification-close" onClick={onClose} aria-label="Close notification">
                <X size={16} />
            </button>
        </div>
    )
}
