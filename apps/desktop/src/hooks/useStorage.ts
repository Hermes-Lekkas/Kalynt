/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// useStorage - React hook for offline persistence
import { useState, useEffect, useCallback } from 'react'
import {
    storageService,
    StorageSpace,
    StorageTask,
    StorageMessage
} from '../services/storageService'

export function useStorage() {
    const [isReady, setIsReady] = useState(false)

    // Initialize storage on mount
    useEffect(() => {
        storageService.init().then(() => setIsReady(true))
    }, [])

    // Space operations
    const saveSpace = useCallback((space: StorageSpace) => {
        storageService.saveSpace(space)
    }, [])

    const getSpace = useCallback((id: string): StorageSpace | null => {
        return storageService.getSpace(id)
    }, [])

    const getAllSpaces = useCallback((): StorageSpace[] => {
        return storageService.getAllSpaces()
    }, [])

    const deleteSpace = useCallback((id: string) => {
        storageService.deleteSpace(id)
    }, [])

    // Y.Doc operations
    const saveYDoc = useCallback((spaceId: string, data: Uint8Array) => {
        storageService.saveYDoc(spaceId, data)
    }, [])

    const getYDoc = useCallback((spaceId: string): Uint8Array | null => {
        return storageService.getYDoc(spaceId)
    }, [])

    // Task operations
    const saveTask = useCallback((task: StorageTask) => {
        storageService.saveTask(task)
    }, [])

    const getTasksForSpace = useCallback((spaceId: string): StorageTask[] => {
        return storageService.getTasksForSpace(spaceId)
    }, [])

    const deleteTask = useCallback((id: string) => {
        storageService.deleteTask(id)
    }, [])

    // Message operations
    const saveMessage = useCallback((message: StorageMessage) => {
        storageService.saveMessage(message)
    }, [])

    const getMessagesForChannel = useCallback((spaceId: string, channelId: string): StorageMessage[] => {
        return storageService.getMessagesForChannel(spaceId, channelId)
    }, [])

    // Settings
    const setSetting = useCallback((key: string, value: string) => {
        storageService.setSetting(key, value)
    }, [])

    const getSetting = useCallback((key: string): string | null => {
        return storageService.getSetting(key)
    }, [])

    // Import/Export
    const exportData = useCallback((): string => {
        return storageService.export()
    }, [])

    const importData = useCallback((json: string) => {
        storageService.import(json)
    }, [])

    const clearAll = useCallback(() => {
        storageService.clear()
    }, [])

    return {
        isReady,
        // Spaces
        saveSpace,
        getSpace,
        getAllSpaces,
        deleteSpace,
        // Y.Doc
        saveYDoc,
        getYDoc,
        // Tasks
        saveTask,
        getTasksForSpace,
        deleteTask,
        // Messages
        saveMessage,
        getMessagesForChannel,
        // Settings
        setSetting,
        getSetting,
        // Utility
        exportData,
        importData,
        clearAll
    }
}
