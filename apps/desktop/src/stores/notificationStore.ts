/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
    id: string
    type: NotificationType
    message: string
    duration?: number
}

interface NotificationStore {
    notifications: Notification[]
    addNotification: (message: string, type?: NotificationType, duration?: number) => void
    removeNotification: (id: string) => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
    notifications: [],
    addNotification: (message, type = 'info', duration = 5000) => {
        const id = uuidv4()
        set((state) => ({
            notifications: [...state.notifications, { id, type, message, duration }]
        }))

        if (duration > 0) {
            setTimeout(() => {
                set((state) => ({
                    notifications: state.notifications.filter((n) => n.id !== id)
                }))
            }, duration)
        }
    },
    removeNotification: (id) => {
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
        }))
    }
}))
