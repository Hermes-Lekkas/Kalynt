/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import { useAppStore } from '../stores/appStore'
import { useNotificationStore, Notification } from '../stores/notificationStore'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'

export const NotificationSystem: React.FC = () => {
    const { } = useAppStore()
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
                    z-index: 10001; /* Higher than header/modals */
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                }

                .notification-item {
                    pointer-events: auto;
                    min-width: 320px;
                    max-width: 450px;
                    background: var(--color-surface);
                    backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid var(--color-border);
                    border-radius: 16px;
                    padding: 16px;
                    display: flex;
                    align-items: flex-start;
                    gap: 14px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1), inset 0 0 0 1px var(--color-glass);
                    animation: slideInNotification 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    position: relative;
                    overflow: hidden;
                }

                .notification-item::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 3px;
                    background: currentColor;
                    opacity: 0.3;
                    width: 100%;
                    transform-origin: left;
                    animation: notificationProgress 5s linear forwards;
                }

                @keyframes notificationProgress {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }

                @keyframes slideInNotification {
                    from { transform: translateX(40px) scale(0.9); opacity: 0; }
                    to { transform: translateX(0) scale(1); opacity: 1; }
                }

                .notification-icon {
                    margin-top: 2px;
                    flex-shrink: 0;
                    padding: 8px;
                    background: var(--color-surface-subtle);
                    border-radius: 10px;
                }

                .notification-content {
                    flex: 1;
                    font-size: 13px;
                    font-weight: 500;
                    line-height: 1.5;
                    color: var(--color-text);
                    padding-top: 4px;
                }

                .notification-close {
                    background: transparent;
                    border: none;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    margin-top: 2px;
                }

                .notification-close:hover {
                    background: var(--color-glass);
                    color: var(--color-text);
                }

                /* Type-specific styles */
                .notification-item.info .notification-icon { color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
                .notification-item.success .notification-icon { color: #10b981; background: rgba(16, 185, 129, 0.1); }
                .notification-item.warning .notification-icon { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
                .notification-item.error .notification-icon { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
                
                .notification-item.info { border-left: 4px solid #3b82f6; }
                .notification-item.success { border-left: 4px solid #10b981; }
                .notification-item.warning { border-left: 4px solid #f59e0b; }
                .notification-item.error { border-left: 4px solid #ef4444; }
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
