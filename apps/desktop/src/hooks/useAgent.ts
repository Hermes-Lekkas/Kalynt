/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// useAgent - React hook for autonomous AI agent
import { useState, useEffect, useCallback, useRef } from 'react'
import { agentService } from '../services/agentService'
import { useAppStore } from '../stores/appStore'
import { useYDoc } from './useYjs'
import {
    AgentState,
    AgentSuggestion,
    ActivityLogEntry,
    AgentConfig,
    DEFAULT_AGENT_CONFIG
} from '../types/agentTypes'
import { EditorMode } from '../config/editorModes'
import { AIProvider } from '../services/aiService'

export function useAgent(spaceId: string | null, mode: EditorMode = 'general', useOfflineAI: boolean = false, workspacePath: string = '') {
    const { apiKeys } = useAppStore()
    const { doc } = useYDoc(spaceId)

    const [state, setState] = useState<AgentState>('disabled')
    const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([])
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
    const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)

    const isInitialized = useRef(false)

    // Get available provider
    const getProvider = useCallback((): AIProvider | null => {
        if (apiKeys.openai) return 'openai'
        if (apiKeys.anthropic) return 'anthropic'
        if (apiKeys.google) return 'google'
        return null
    }, [apiKeys])

    // Initialize agent when doc is ready
    // Initialize agent and handle config updates
    useEffect(() => {
        if (!doc || !spaceId) return

        // Always update config, even if already initialized
        agentService.setConfig(config)
        agentService.setUseOfflineAI(useOfflineAI)
        agentService.setWorkspacePath(workspacePath)

        if (isInitialized.current) return

        const provider = getProvider()
        if (!provider && !useOfflineAI) {
            setState('disabled')
            return
        }

        // Set up callbacks
        agentService.setCallbacks(
            (newState) => setState(newState),
            (newSuggestions) => setSuggestions([...newSuggestions]),
            (entry) => setActivityLog(prev => [entry, ...prev].slice(0, 50))
        )

        if (provider) {
            agentService.setProvider(provider)
        }
        agentService.setMode(mode)

        if (config.enabled) {
            agentService.start(doc)
            isInitialized.current = true
        }

        return () => {
            if (isInitialized.current) {
                agentService.stop()
                isInitialized.current = false
            }
        }
    }, [doc, spaceId, config, getProvider, mode, useOfflineAI, workspacePath])

    // Update mode when it changes
    useEffect(() => {
        agentService.setMode(mode)
    }, [mode])

    // Update provider when keys change
    useEffect(() => {
        const provider = getProvider()
        if (provider) {
            agentService.setProvider(provider)
        }
    }, [getProvider])

    // Toggle agent enabled state
    const toggleEnabled = useCallback(() => {
        const newConfig = { ...config, enabled: !config.enabled }
        setConfig(newConfig)
        agentService.setConfig(newConfig)

        if (newConfig.enabled && doc) {
            agentService.start(doc)
            isInitialized.current = true
        } else {
            agentService.stop()
            isInitialized.current = false
        }
    }, [config, doc])

    // Approve a suggestion
    const approveSuggestion = (id: string) => {
        agentService.approveSuggestion(id)
    }

    // Reject a suggestion
    const rejectSuggestion = useCallback((id: string) => {
        agentService.rejectSuggestion(id)
    }, [])

    // Reject all pending suggestions
    const rejectAll = useCallback(() => {
        agentService.rejectAll()
    }, [])

    // Clear activity log
    const clearActivityLog = useCallback(() => {
        agentService.clearActivityLog()
        setActivityLog([])
    }, [])

    // Trigger manual analysis
    const triggerAnalysis = useCallback(async () => {
        await agentService.triggerAnalysis()
    }, [])

    // Add external suggestions
    const addSuggestions = useCallback((suggestions: Omit<AgentSuggestion, 'id' | 'timestamp' | 'status'>[]) => {
        agentService.addExternalSuggestions(suggestions)
    }, [])

    // Clear all suggestions
    const clearSuggestions = useCallback(() => {
        agentService.clearSuggestions()
        setSuggestions([])
    }, [])

    // Get pending suggestions count
    const pendingCount = suggestions.filter(s => s.status === 'pending').length

    // Check if agent can run (has API keys or offline AI with loaded model)
    const canRun = useOfflineAI || !!getProvider()

    return {
        // State
        state,
        suggestions,
        activityLog,
        config,
        pendingCount,
        canRun,

        // Actions
        toggleEnabled,
        approveSuggestion,
        rejectSuggestion,
        rejectAll,
        clearActivityLog,
        triggerAnalysis,
        addSuggestions,
        clearSuggestions,
        setConfig: (newConfig: Partial<AgentConfig>) => {
            const updated = { ...config, ...newConfig }
            setConfig(updated)
            agentService.setConfig(updated)
        }
    }
}
