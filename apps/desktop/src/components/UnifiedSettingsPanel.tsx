/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useMemberStore } from '../stores/memberStore'
import { useModelStore } from '../stores/modelStore'
import { encryptionService } from '../services/encryptionService'
import { p2pService } from '../services/p2pService'
import { offlineLLMService } from '../services/offlineLLMService'
import {
  downloadModel,
  cancelDownload,
  pauseDownload,
  resumeDownload,
  deleteModel
} from '../services/modelDownloadService'
import {
  OFFLINE_MODELS,
  OfflineModel,
  formatBytes,
  formatETA
} from '../types/offlineModels'
import MemberManagement from './MemberManagement'
import AIMESettings from './AIMESettings'
import './UnifiedSettingsPanel.css'
import {
  X,
  Eye,
  EyeOff,
  Save,
  Play,
  Square,
  Loader2 as LoadingIcon,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bot,
  Brain,
  Lock,
  Users,
  Radiation,
  Settings as SettingsIcon,
  Shield,
  Award,
  HelpCircle,
  Mail,
  FileText,
  ExternalLink,
  Github,
  Code,
  Sparkles,
  Wifi,
  Radio,
  RefreshCw,
  Server,
  Globe,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'

type TabId = 'general' | 'security' | 'members' | 'advanced' | 'credits' | 'support'

interface SpaceSettings {
  encryptionEnabled: boolean
  roomPassword: string
  githubConnected: boolean
  slackWebhook: string
}

export default function UnifiedSettingsPanel({ onClose }: { readonly onClose: () => void }) {
  const { currentSpace, apiKeys, setAPIKey, removeAPIKey } = useAppStore()
  const { getMyRole, getMembers } = useMemberStore()

  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [settings, setSettings] = useState<SpaceSettings>({
    encryptionEnabled: false,
    roomPassword: '',
    githubConnected: false,
    slackWebhook: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showAIME, setShowAIME] = useState(false)

  // Nuke Button State
  const [nukeCoverOpen, setNukeCoverOpen] = useState(false)
  const [nukeStatus, setNukeStatus] = useState<'idle' | 'arming' | 'ready' | 'detonating' | 'done'>('idle')
  const [nukeMessage, setNukeMessage] = useState('')

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', handleEsc)
    return () => globalThis.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const myRole = currentSpace ? getMyRole(currentSpace.id) : 'member'
  const isAdmin = myRole === 'owner' || myRole === 'admin'
  const memberCount = currentSpace ? getMembers(currentSpace.id).length : 0

  useEffect(() => {
    if (currentSpace) {
      const stored = localStorage.getItem(`space-settings-${currentSpace.id}`)
      if (stored) {
        try {
          setSettings(JSON.parse(stored))
        } catch {
          console.error('Failed to load settings')
        }
      }
    }
  }, [currentSpace])

  const handleSave = async () => {
    if (!currentSpace) return

    if (settings.encryptionEnabled && settings.roomPassword) {
      await encryptionService.setRoomKey(currentSpace.id, settings.roomPassword)
    }

    localStorage.setItem(`space-settings-${currentSpace.id}`, JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (settings.encryptionEnabled && settings.roomPassword) {
        globalThis.window.location.reload()
      }
    }, 1000)
  }

  const handleNuke = async () => {
    if (nukeStatus !== 'ready') return

    setNukeStatus('detonating')
    try {
      await window.electronAPI.nukeProcesses('hard')
      setNukeStatus('done')
      setNukeMessage('System Nuked Successfully')

      setTimeout(() => {
        setNukeStatus('idle')
        setNukeCoverOpen(false)
        setNukeMessage('')
      }, 3000)
    } catch (_error) {
      setNukeStatus('idle')
      setNukeMessage('Failed to nuke')
    }
  }

  const toggleCover = () => {
    if (nukeCoverOpen) {
      setNukeCoverOpen(false)
      setNukeStatus('idle')
    } else {
      setNukeCoverOpen(true)
      setNukeStatus('arming')
      setTimeout(() => setNukeStatus('ready'), 300)
    }
  }

  if (!currentSpace) return null

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'security', label: 'Security', icon: <Lock size={16} /> },
    { id: 'members', label: 'Members', icon: <Users size={16} /> },
    { id: 'advanced', label: 'Advanced', icon: <Brain size={16} /> },
    { id: 'credits', label: 'Credits', icon: <Award size={16} /> },
    { id: 'support', label: 'Support', icon: <HelpCircle size={16} /> }
  ]

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        {/* Header */}
        <div className="settings-header">
          <div className="header-content">
            <h2>Settings</h2>
            <p className="space-name">{currentSpace.name}</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body">
          {/* Sidebar Navigation */}
          <div className="settings-sidebar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="settings-content">
            {activeTab === 'general' && (
              <GeneralTab apiKeys={apiKeys} setAPIKey={setAPIKey} removeAPIKey={removeAPIKey} />
            )}

            {activeTab === 'security' && (
              <SecurityTab
                settings={settings}
                setSettings={setSettings}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
              />
            )}

            {activeTab === 'members' && (
              <MembersTab
                memberCount={memberCount}
                myRole={myRole}
                isAdmin={isAdmin}
                showMembers={showMembers}
                setShowMembers={setShowMembers}
                spaceId={currentSpace?.id}
              />
            )}

            {activeTab === 'advanced' && (
              <AdvancedTab
                showAIME={showAIME}
                setShowAIME={setShowAIME}
                nukeCoverOpen={nukeCoverOpen}
                nukeStatus={nukeStatus}
                nukeMessage={nukeMessage}
                toggleCover={toggleCover}
                handleNuke={handleNuke}
              />
            )}

            {activeTab === 'credits' && <CreditsTab />}

            {activeTab === 'support' && <SupportTab />}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {saved ? (
              <>
                <Check size={16} />
                Saved
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  )
}

// General Tab Component
function GeneralTab({ apiKeys, setAPIKey, removeAPIKey }: any) {
  const [showOfflineModels, setShowOfflineModels] = useState(false)
  const { downloadedModels, activeDownloads, loadedModelId, isLoading, getTotalDownloadedSize } = useModelStore()
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

  const handleLoadModel = async (modelId: string) => {
    await offlineLLMService.loadModel(modelId)
  }

  const handleUnloadModel = async () => {
    await offlineLLMService.unloadModel()
  }

  const getQualityStars = (quality: number) => {
    return '★'.repeat(quality) + '☆'.repeat(5 - quality)
  }

  return (
    <div className="tab-content">
      {/* BYOK Section */}
      <h3 className="section-title">
        <Bot size={20} />
        Bring Your Own Keys (BYOK)
      </h3>
      <p className="section-description">
        Connect your cloud AI providers for agent and assistant features. Keys are encrypted using your system's
        secure storage and never leave your device.
      </p>

      <div className="info-banner">
        <Sparkles size={16} />
        <span>
          <strong>Free Beta:</strong> All providers work as AI agents with tool calling and multi-turn conversations.
        </span>
      </div>

      <div className="api-keys-grid">
        <ApiKeyInput
          provider="openai"
          label="OpenAI"
          placeholder="sk-..."
          apiKeys={apiKeys}
          setAPIKey={setAPIKey}
          removeAPIKey={removeAPIKey}
        />
        <ApiKeyInput
          provider="anthropic"
          label="Anthropic"
          placeholder="sk-ant-..."
          apiKeys={apiKeys}
          setAPIKey={setAPIKey}
          removeAPIKey={removeAPIKey}
        />
        <ApiKeyInput
          provider="google"
          label="Google Gemini"
          placeholder="AIza..."
          apiKeys={apiKeys}
          setAPIKey={setAPIKey}
          removeAPIKey={removeAPIKey}
        />
      </div>

      {/* Offline Models Section */}
      <div className="collapsible-section" style={{ marginTop: '32px' }}>
        <button className="collapsible-header" onClick={() => setShowOfflineModels(!showOfflineModels)}>
          <div className="header-left">
            <Brain size={20} />
            <div>
              <h3>Offline AI Models</h3>
              <p>Download and run AI models locally - no internet required</p>
            </div>
          </div>
          <div className="header-right">
            <span className="storage-badge">
              💾 {formatBytes(getTotalDownloadedSize())} used
            </span>
            {showOfflineModels ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {showOfflineModels && (
          <div className="collapsible-content">
            <div className="offline-models-info">
              <span className="tier-badge">Free Beta</span>
              <span>All {OFFLINE_MODELS.length} models available for download</span>
            </div>

            <div className="offline-model-list">
              {OFFLINE_MODELS.map((model) => {
                const downloaded = downloadedModels[model.id]
                const download = activeDownloads[model.id]
                const isDownloading = download?.status === 'downloading'
                const isPaused = download?.status === 'paused'
                const hasError = download?.status === 'error'

                return (
                  <div
                    key={model.id}
                    className={`offline-model-card ${downloaded ? 'downloaded' : ''} ${loadedModelId === model.id ? 'active' : ''}`}
                  >
                    <div className="model-main">
                      <div className="model-icon">
                        {model.tierIndex <= 2 ? '🟢' : model.tierIndex <= 4 ? '🟡' : '🔵'}
                      </div>
                      <div className="model-info">
                        <div className="model-header-row">
                          <strong>{model.name}</strong>
                          {loadedModelId === model.id && <span className="badge badge-active">✓ Active</span>}
                          {downloaded && loadedModelId !== model.id && <span className="badge badge-downloaded">✓ Ready</span>}
                          {isDownloading && <span className="badge badge-progress">{Math.round((download.bytesDownloaded / download.totalBytes) * 100)}%</span>}
                          {isPaused && <span className="badge badge-paused">⏸ Paused</span>}
                          {hasError && <span className="badge badge-error">⚠ Error</span>}
                        </div>
                        <p className="model-desc">{model.description}</p>
                        <div className="model-stats">
                          <span>📦 {model.size}</span>
                          <span>💻 {model.ramRequired} RAM</span>
                          <span className="quality">{getQualityStars(model.quality)}</span>
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
                          <span>{formatBytes(download.bytesDownloaded)} / {formatBytes(download.totalBytes)}</span>
                          {isDownloading && <span>{formatBytes(download.speed)}/s • {formatETA(download.eta)}</span>}
                        </div>
                      </div>
                    )}

                    {/* Error Message */}
                    {hasError && download?.error && (
                      <div className="error-message">⚠️ {download.error}</div>
                    )}

                    {/* Actions */}
                    <div className="model-actions">
                      {downloaded ? (
                        <>
                          {/* Load/Unload button */}
                          {loadedModelId === model.id ? (
                            <button
                              className="btn btn-secondary"
                              onClick={handleUnloadModel}
                              disabled={isLoading}
                            >
                              <Square size={14} /> Unload
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary"
                              onClick={() => handleLoadModel(model.id)}
                              disabled={isLoading}
                            >
                              {isLoading ? <LoadingIcon size={14} className="animate-spin" /> : <Play size={14} />}
                              {isLoading ? 'Loading...' : 'Load Model'}
                            </button>
                          )}
                          {/* Delete button */}
                          {confirmDelete === model.id ? (
                            <>
                              <button className="btn btn-danger" onClick={() => handleDelete(model.id)}>
                                Confirm Delete
                              </button>
                              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-ghost"
                              onClick={() => setConfirmDelete(model.id)}
                              disabled={loadedModelId === model.id}
                              title={loadedModelId === model.id ? 'Unload model before deleting' : 'Delete model'}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          )}
                        </>
                      ) : isDownloading ? (
                        <>
                          <button className="btn btn-secondary" onClick={() => pauseDownload(model.id)}>
                            ⏸ Pause
                          </button>
                          <button className="btn btn-ghost" onClick={() => cancelDownload(model.id)}>
                            Cancel
                          </button>
                        </>
                      ) : isPaused ? (
                        <>
                          <button className="btn btn-primary" onClick={() => resumeDownload(model.id)}>
                            ▶ Resume
                          </button>
                          <button className="btn btn-ghost" onClick={() => cancelDownload(model.id)}>
                            Cancel
                          </button>
                        </>
                      ) : hasError ? (
                        <>
                          <button className="btn btn-primary" onClick={() => handleDownload(model)}>
                            ↻ Retry
                          </button>
                          <button className="btn btn-ghost" onClick={() => cancelDownload(model.id)}>
                            Dismiss
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-primary" onClick={() => handleDownload(model)}>
                          ⬇ Download
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Speculative Decoding (Draft Models) */}
      <div className="collapsible-section" style={{ marginTop: '16px' }}>
        <button className="collapsible-header" onClick={() => setShowOfflineModels(true)}>
          <div className="header-left">
            <Sparkles size={20} />
            <div>
              <h3>Speculative Decoding</h3>
              <p>Accelerate agent coding by 3-4x using a Draft Model</p>
            </div>
          </div>
        </button>

        <div className="collapsible-content">
          <div className="setting-card">
            <div className="setting-row">
              <div className="setting-info">
                <label>Draft Model</label>
                <p>Select a small model (e.g., 0.5B or 1.5B) to act as a "sketch artist" for the main model.</p>
              </div>
              <div className="select-wrapper">
                <select
                  value={useModelStore.getState().draftModelId || ''}
                  onChange={async (e) => {
                    const id = e.target.value
                    if (id) await offlineLLMService.loadDraftModel(id)
                    else await offlineLLMService.unloadDraftModel()
                  }}
                  disabled={!loadedModelId || isLoading}
                  className="model-select"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '8px'
                  }}
                >
                  <option value="">Disabled</option>
                  {OFFLINE_MODELS.filter(m => m.tierIndex <= 1 || m.sizeBytes < 3 * 1024 * 1024 * 1024).map(m => (
                    <option key={m.id} value={m.id} disabled={!downloadedModels[m.id]}>
                      {m.name} ({m.size}) {downloadedModels[m.id] ? '✓' : '(Not Downloaded)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!loadedModelId && <p className="hint warning" style={{ color: '#ff453a', marginTop: '8px' }}>Load a main model first to enable speculative decoding.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Security Tab Component
function SecurityTab({ settings, setSettings, showPassword, setShowPassword }: any) {
  const [githubToken, setGithubToken] = useState('')
  const [showGithubToken, setShowGithubToken] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)

  useEffect(() => {
    // Load existing GitHub token from safe storage
    const loadToken = async () => {
      try {
        const result = await window.electronAPI?.safeStorage?.get('github-update-token')
        if (result?.success && result.value) {
          setGithubToken(result.value)
        }
      } catch (error) {
        console.error('Failed to load GitHub token:', error)
      }
    }
    loadToken()
  }, [])

  const handleSaveGithubToken = async () => {
    setTokenLoading(true)
    try {
      if (githubToken && githubToken.trim() !== '') {
        // Save token to secure storage
        const result = await window.electronAPI?.safeStorage?.set({
          key: 'github-update-token',
          value: githubToken
        })
        if (result?.success) {
          // Configure update system with new token
          await window.electronAPI?.update?.configureToken(githubToken)
          setTokenSaved(true)
          setTimeout(() => setTokenSaved(false), 3000)
        }
      }
    } catch (error) {
      console.error('Failed to save GitHub token:', error)
    } finally {
      setTokenLoading(false)
    }
  }

  const handleDeleteGithubToken = async () => {
    setTokenLoading(true)
    try {
      await window.electronAPI?.safeStorage?.delete('github-update-token')
      await window.electronAPI?.update?.configureToken('')
      setGithubToken('')
      setTokenSaved(false)
    } catch (error) {
      console.error('Failed to delete GitHub token:', error)
    } finally {
      setTokenLoading(false)
    }
  }

  return (
    <div className="tab-content">
      <h3 className="section-title">
        <Shield size={20} />
        Encryption
      </h3>
      <p className="section-description">
        End-to-end encryption is always enabled for P2P sync. All data is encrypted using AES-256-GCM.
      </p>

      <div className="setting-card">
        <div className="setting-row">
          <div className="setting-info">
            <label>Status</label>
            <p style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={14} /> Encryption is always active
            </p>
          </div>
        </div>

        <div className="password-input-group">
          <label>Room Password</label>
          <div className="input-with-icon">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter shared password for this workspace"
              value={settings.roomPassword}
              onChange={(e) => setSettings({ ...settings, roomPassword: e.target.value, encryptionEnabled: true })}
            />
            <button className="icon-button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="hint">Share this password with all workspace collaborators to enable P2P sync</p>
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: '32px' }}>
        <Github size={20} />
        Auto-Update Configuration
      </h3>
      <p className="section-description">
        Configure GitHub access for automatic updates. For private repositories, provide a GitHub Personal Access Token.
      </p>

      <div className="setting-card">
        <div className="password-input-group">
          <label>GitHub Personal Access Token (Optional)</label>
          <div className="input-with-icon">
            <input
              type={showGithubToken ? 'text' : 'password'}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <button className="icon-button" onClick={() => setShowGithubToken(!showGithubToken)}>
              {showGithubToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="hint">
            Required only for private repositories. Token is encrypted using OS-level security.
            {' '}
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
            >
              Create token â†’
            </a>
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              className="action-button primary"
              onClick={handleSaveGithubToken}
              disabled={tokenLoading || !githubToken}
            >
              {tokenSaved ? <Check size={16} /> : <Save size={16} />}
              {tokenSaved ? 'Saved!' : 'Save Token'}
            </button>
            {githubToken && (
              <button
                className="action-button danger"
                onClick={handleDeleteGithubToken}
                disabled={tokenLoading}
              >
                <Trash2 size={16} />
                Delete Token
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Members Tab Component
function MembersTab({ memberCount, myRole, isAdmin, showMembers, setShowMembers, spaceId }: any) {
  const [connectivityTest, setConnectivityTest] = useState<{
    testing: boolean
    result: { stun: boolean; turn: boolean; candidates: any[]; error?: string } | null
  }>({ testing: false, result: null })
  const [connectionInfo, setConnectionInfo] = useState<{
    connected: boolean
    peerCount: number
    signalingState: string
    iceServers: number
    turnEnabled: boolean
  } | null>(null)

  // Load connection info on mount
  useEffect(() => {
    if (spaceId) {
      const info = p2pService.getConnectionInfo(`kalynt-${spaceId}`)
      setConnectionInfo(info)
    }
  }, [spaceId])

  const getRoleColor = (role: string) => {
    if (role === 'owner') return '#ff9500'
    if (role === 'admin') return '#0a84ff'
    return 'rgba(255,255,255,0.5)'
  }

  const runConnectivityTest = async () => {
    setConnectivityTest({ testing: true, result: null })
    try {
      const result = await p2pService.testConnectivity()
      setConnectivityTest({ testing: false, result })
    } catch (error) {
      setConnectivityTest({
        testing: false,
        result: { stun: false, turn: false, candidates: [], error: String(error) }
      })
    }
  }

  // When showMembers is true, show MemberManagement inline
  if (showMembers && spaceId) {
    return (
      <div className="tab-content member-management-container">
        <MemberManagement spaceId={spaceId} onClose={() => setShowMembers(false)} />
      </div>
    )
  }

  return (
    <div className="tab-content">
      <h3 className="section-title">
        <Users size={20} />
        Team Members
      </h3>
      <p className="section-description">Manage workspace members and permissions.</p>

      <div className="setting-card">
        <div className="members-summary">
          <div className="member-stat">
            <span className="stat-value">{memberCount}</span>
            <span className="stat-label">{memberCount === 1 ? 'Member' : 'Members'}</span>
          </div>
          <div className="role-badge" style={{ color: getRoleColor(myRole) }}>
            Your Role: {myRole}
          </div>
        </div>

        {isAdmin && (
          <button className="btn-secondary full-width" onClick={() => setShowMembers(true)}>
            <Users size={16} />
            Manage Team
          </button>
        )}
      </div>

      {/* P2P Connectivity Section */}
      <h3 className="section-title" style={{ marginTop: '24px' }}>
        <Globe size={20} />
        P2P Connectivity
      </h3>
      <p className="section-description">
        Network status and connection diagnostics for peer-to-peer collaboration.
      </p>

      <div className="setting-card">
        {/* Connection Status */}
        <div className="connectivity-status">
          <div className="status-row">
            <div className="status-item">
              <Server size={16} />
              <span className="status-label">ICE Servers:</span>
              <span className="status-value">{connectionInfo?.iceServers ?? 11}</span>
            </div>
            <div className="status-item">
              <Radio size={16} />
              <span className="status-label">TURN Enabled:</span>
              {connectionInfo?.turnEnabled !== false ? (
                <span className="status-value success"><CheckCircle size={14} /> Yes</span>
              ) : (
                <span className="status-value error"><XCircle size={14} /> No</span>
              )}
            </div>
          </div>
          <div className="status-row">
            <div className="status-item">
              <Wifi size={16} />
              <span className="status-label">Connected Peers:</span>
              <span className="status-value">{connectionInfo?.peerCount ?? 0}</span>
            </div>
            <div className="status-item">
              <AlertCircle size={16} />
              <span className="status-label">Status:</span>
              <span className={`status-value ${connectionInfo?.connected ? 'success' : ''}`}>
                {connectionInfo?.connected ? 'Connected' : 'Not in room'}
              </span>
            </div>
          </div>
        </div>

        {/* Connectivity Test */}
        <div className="connectivity-test">
          <div className="test-header">
            <strong>Network Diagnostics</strong>
            <p className="test-description">
              Test your network's ability to establish peer connections.
            </p>
          </div>

          <button
            className="btn-secondary full-width"
            onClick={runConnectivityTest}
            disabled={connectivityTest.testing}
          >
            {connectivityTest.testing ? (
              <>
                <Loader2 size={16} className="spinning" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Run Connectivity Test
              </>
            )}
          </button>

          {connectivityTest.result && (
            <div className="test-results">
              <div className="result-row">
                <span>STUN (NAT Discovery):</span>
                {connectivityTest.result.stun ? (
                  <span className="result-success"><CheckCircle size={14} /> Working</span>
                ) : (
                  <span className="result-error"><XCircle size={14} /> Failed</span>
                )}
              </div>
              <div className="result-row">
                <span>TURN (Relay Fallback):</span>
                {connectivityTest.result.turn ? (
                  <span className="result-success"><CheckCircle size={14} /> Working</span>
                ) : (
                  <span className="result-warning"><AlertCircle size={14} /> Not tested</span>
                )}
              </div>
              <div className="result-row">
                <span>ICE Candidates Found:</span>
                <span className="result-value">{connectivityTest.result.candidates.length}</span>
              </div>
              {connectivityTest.result.error && (
                <div className="result-error-message">
                  Error: {connectivityTest.result.error}
                </div>
              )}
              {connectivityTest.result.stun && connectivityTest.result.turn && (
                <div className="result-success-message">
                  <CheckCircle size={14} />
                  Your network supports full P2P connectivity!
                </div>
              )}
              {connectivityTest.result.stun && !connectivityTest.result.turn && (
                <div className="result-info-message">
                  <AlertCircle size={14} />
                  Direct connections work. TURN relay available as fallback for restrictive networks.
                </div>
              )}
              {!connectivityTest.result.stun && !connectivityTest.result.turn && !connectivityTest.result.error && (
                <div className="result-error-message">
                  <XCircle size={14} />
                  Connection issues detected. P2P may not work on your network.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Network Info */}
      <div className="setting-card info-card">
        <div className="info-content">
          <strong>How P2P Works</strong>
          <ul className="info-list">
            <li><strong>STUN</strong> discovers your public IP for direct peer connections</li>
            <li><strong>TURN</strong> relays traffic when direct connections fail (firewalls, corporate networks)</li>
            <li>All data is <strong>end-to-end encrypted</strong> regardless of connection type</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// Advanced Tab Component
function AdvancedTab({
  showAIME,
  setShowAIME,
  nukeCoverOpen,
  nukeStatus,
  nukeMessage,
  toggleCover,
  handleNuke
}: any) {
  return (
    <div className="tab-content">
      {/* AIME Section */}
      <div className="collapsible-section">
        <button className="collapsible-header" onClick={() => setShowAIME(!showAIME)}>
          <div className="header-left">
            <Brain size={20} />
            <div>
              <h3>AIME (AI Memory Engine)</h3>
              <p>Hardware optimization for local AI models</p>
            </div>
          </div>
          {showAIME ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {showAIME && (
          <div className="collapsible-content">
            <AIMESettings />
          </div>
        )}
      </div>

      {/* Shadow Workspace (Safety Net) */}
      <div className="collapsible-section" style={{ marginTop: '16px' }}>
        <button className="collapsible-header" onClick={() => { /* always open */ }}>
          <div className="header-left">
            <Shield size={20} />
            <div>
              <h3>Safety & Validation</h3>
              <p>Configure agent safety nets and auto-validation</p>
            </div>
          </div>
        </button>

        <div className="collapsible-content">
          <div className="setting-card">
            <div className="setting-row">
              <div className="setting-info">
                <label>Shadow Workspace Impact Analysis</label>
                <p>Automatically validate agent edits using compilers/linters before applying.</p>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  defaultChecked={true}
                  onChange={(e) => {
                    const { shadowWorkspaceService } = require('../services/shadowWorkspaceService')
                    shadowWorkspaceService.setEnabled(e.target.checked)
                  }}
                />
                <span className="toggle-slider"></span>
              </div>
            </div>
            <p className="hint">
              Detects build errors (typescript, python, rust, go) immediately after agent writes code.
            </p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="danger-zone">
        <h3 className="section-title danger">
          <Radiation size={20} />
          Danger Zone
        </h3>
        <p className="section-description">Critical system operations - use with caution</p>

        <div className="setting-card danger-card">
          <div className="nuke-section">
            <div className="nuke-info">
              <strong>Nuke Process Tree</strong>
              <p>Force kill all child processes and free ports (3000, 8080)</p>
            </div>

            <div className={`nuke-switch ${nukeCoverOpen ? 'open' : ''}`}>
              <div className="safety-cover" onClick={toggleCover}>
                <span>SAFETY</span>
              </div>
              <button
                className={`nuke-button ${nukeStatus}`}
                onClick={handleNuke}
                disabled={!nukeCoverOpen || nukeStatus === 'detonating' || nukeStatus === 'done'}
              >
                {nukeStatus === 'detonating' ? '...' : nukeStatus === 'done' ? <Check size={16} /> : <Radiation size={32} />}
              </button>
            </div>
          </div>

          {nukeMessage && <div className="nuke-feedback">{nukeMessage}</div>}
        </div>

        <div className="setting-card danger-card">
          <div className="delete-space-section">
            <div>
              <strong>Delete Workspace</strong>
              <p>Permanently delete this workspace and all its data</p>
            </div>
            <button className="btn-danger">
              <Trash2 size={16} />
              Delete Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Credits Tab Component
function CreditsTab() {
  const categories = [
    {
      title: 'Open Source Core',
      icon: <Code size={18} />,
      items: [
        { name: 'React', description: 'UI Framework', url: 'https://react.dev' },
        { name: 'Electron', description: 'Desktop App Platform', url: 'https://electronjs.org' },
        { name: 'TypeScript', description: 'Typed JavaScript at Any Scale', url: 'https://www.typescriptlang.org/' },
        { name: 'Vite', description: 'Next Generation Frontend Tooling', url: 'https://vitejs.dev/' },
        { name: 'Tailwind CSS', description: 'Utility-First CSS Framework', url: 'https://tailwindcss.com/' }
      ]
    },
    {
      title: 'Editor & UI',
      icon: <FileText size={18} />,
      items: [
        { name: 'Monaco Editor', description: 'Code Editor', url: 'https://microsoft.github.io/monaco-editor/' },
        { name: 'xterm.js', description: 'Terminal Component', url: 'https://xtermjs.org/' },
        { name: 'Lucide', description: 'Beautiful Icons', url: 'https://lucide.dev' },
        { name: 'CMDK', description: 'Command Menu Component', url: 'https://cmdk.paco.me/' }
      ]
    },
    {
      title: 'Data & Networking',
      icon: <Server size={18} />,
      items: [
        { name: 'Yjs', description: 'CRDT for Real-time Collaboration', url: 'https://yjs.dev' },
        { name: 'better-sqlite3', description: 'Fast SQLite3 Database Driver', url: 'https://github.com/WiseLibs/better-sqlite3' },
        { name: 'Zustand', description: 'Small, Fast State Management', url: 'https://github.com/pmndrs/zustand' },
        { name: 'Simple Peer', description: 'WebRTC P2P Networking', url: 'https://github.com/feross/simple-peer' }
      ]
    },
    {
      title: 'AI & Intelligence',
      icon: <Brain size={18} />,
      items: [
        { name: 'Google Gemini', description: 'Multimodal AI Model', url: 'https://deepmind.google/technologies/gemini/' },
        { name: 'Claude', description: 'Advanced AI by Anthropic', url: 'https://www.anthropic.com/claude' },
        { name: 'Google Antigravity', description: 'Advanced Agentic Coding', url: 'https://deepmind.google/' },
        { name: 'node-llama-cpp', description: 'Local LLM Inference', url: 'https://github.com/withcatai/node-llama-cpp' }
      ]
    },
    {
      title: 'Development & Security',
      icon: <Shield size={18} />,
      items: [
        { name: 'VS Code', description: 'Code Editing Foundation', url: 'https://code.visualstudio.com/' },
        { name: 'GitHub', description: 'The Complete Developer Platform', url: 'https://github.com/' },
        { name: 'ESLint', description: 'Pluggable Linting Utility', url: 'https://eslint.org' },
        { name: 'Snyk', description: 'Developer Security Platform', url: 'https://snyk.io' },
        { name: 'SonarQube', description: 'Code Quality & Security', url: 'https://www.sonarsource.com/products/sonarqube/' }
      ]
    }
  ]

  return (
    <div className="tab-content">
      <h3 className="section-title">
        <Award size={20} />
        Credits & Attribution
      </h3>
      <p className="section-description">
        Built with amazing open-source tools and libraries
      </p>

      <div className="credits-section">
        {categories.map((category) => (
          <div key={category.title} className="credits-category">
            <h4 className="subsection-title" style={{ marginTop: '24px' }}>
              {category.icon}
              {category.title}
            </h4>
            <div className="libraries-grid">
              {category.items.map((lib) => (
                <a
                  key={lib.name}
                  href={lib.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="library-card"
                >
                  <div className="library-info">
                    <strong>{lib.name}</strong>
                    <p>{lib.description}</p>
                  </div>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          </div>
        ))}

        <div className="made-with-love">
          <Sparkles size={16} />
          <span>Made with passion for developers and creators</span>
          <Sparkles size={16} />
        </div>
      </div>
    </div>
  )
}

// Support Tab Component
function SupportTab() {
  return (
    <div className="tab-content">
      <h3 className="section-title">
        <HelpCircle size={20} />
        Support & Help
      </h3>
      <p className="section-description">
        Get help, report issues, and provide feedback
      </p>

      <div className="support-section">
        <div className="setting-card">
          <div className="support-item">
            <Mail size={20} />
            <div>
              <strong>Contact Support</strong>
              <p>hermeslekkasdev@gmail.com</p>
            </div>
          </div>
        </div>

        <div className="setting-card">
          <div className="support-item">
            <Github size={20} />
            <div>
              <strong>Report a Bug</strong>
              <p>Found an issue? Let us know on GitHub</p>
            </div>
            <button className="btn-secondary">
              <ExternalLink size={16} />
              GitHub Issues
            </button>
          </div>
        </div>

        <div className="setting-card">
          <div className="support-item">
            <FileText size={20} />
            <div>
              <strong>Documentation</strong>
              <p>Learn how to get the most out of Kalynt</p>
            </div>
            <button className="btn-secondary">
              <ExternalLink size={16} />
              Docs
            </button>
          </div>
        </div>

        <div className="version-info">
          <p>Kalynt Desktop v1.0 beta</p>
          <p>© 2026 Hermes Lekkas. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

// API Key Input Component
function ApiKeyInput({ provider, label, placeholder, apiKeys, setAPIKey, removeAPIKey }: any) {
  const [tempValue, setTempValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const currentKey = apiKeys[provider as keyof typeof apiKeys]
  const hasKey = !!currentKey

  const handleSave = async () => {
    if (tempValue.trim()) {
      await setAPIKey(provider, tempValue.trim())
      setIsEditing(false)
      setTempValue('')
    }
  }

  const handleClear = async () => {
    await removeAPIKey(provider)
    setIsEditing(false)
    setTempValue('')
  }

  return (
    <div className="api-key-card">
      <div className="api-key-header">
        <span className="provider-name">{label}</span>
        {hasKey && <span className="status-badge">Connected</span>}
      </div>

      {!isEditing && hasKey ? (
        <div className="key-display">
          <span className="key-masked">••••••••••••••••</span>
          <div className="key-actions">
            <button className="icon-button" onClick={() => setIsEditing(true)}>
              Edit
            </button>
            <button className="icon-button danger" onClick={handleClear}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="key-input">
          <input
            type="password"
            placeholder={placeholder}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <div className="key-actions">
            <button className="icon-button" onClick={handleSave} disabled={!tempValue}>
              <Check size={14} />
            </button>
            {hasKey && (
              <button className="icon-button" onClick={() => setIsEditing(false)}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = `
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .settings-modal {
    width: 90%;
    max-width: 920px;
    height: 85vh;
    max-height: 720px;
    background: #0a0a0a;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Header */
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.1) 0%, rgba(10, 10, 10, 0.95) 100%);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-content h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  }

  .header-content .space-name {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
  }

  .close-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  /* Body */
  .settings-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .settings-sidebar {
    width: 200px;
    background: rgba(255, 255, 255, 0.02);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  .tab-button:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
  }

  .tab-button.active {
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.15), rgba(10, 132, 255, 0.05));
    color: #0a84ff;
    border: 1px solid rgba(10, 132, 255, 0.3);
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tab-label {
    flex: 1;
    text-align: left;
  }

  /* Content */
  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .tab-content {
    animation: contentFadeIn 0.3s ease-out;
  }

  .tab-content.member-management-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 500px;
  }

  .tab-content.member-management-container .member-management {
    flex: 1;
    min-height: 0;
  }

  @keyframes contentFadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin: 0 0 8px 0;
  }

  .section-title.danger {
    color: #ff453a;
  }

  .section-description {
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    margin: 0 0 20px 0;
  }

  /* Setting Cards */
  .setting-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    backdrop-filter: blur(20px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .setting-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .setting-info label {
    display: block;
    font-size: 15px;
    font-weight: 500;
    color: #fff;
    margin-bottom: 4px;
  }

  .setting-info p {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 52px;
    height: 32px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: rgba(255, 255, 255, 0.1);
    transition: 0.3s;
    border-radius: 32px;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 24px;
    width: 24px;
    left: 3px;
    bottom: 3px;
    background: white;
    transition: 0.3s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch input:checked + .toggle-slider {
    background: #0a84ff;
    border-color: #0a84ff;
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }

  /* Inputs */
  .password-input-group {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .password-input-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 8px;
  }

  .input-with-icon {
    display: flex;
    gap: 8px;
  }

  .input-with-icon input {
    flex: 1;
    background: rgba(0, 0, 0, 0.4);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px 14px;
    color: #fff;
    font-size: 14px;
    transition: all 0.2s;
  }

  .input-with-icon input:focus {
    outline: none;
    border-color: #0a84ff;
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .icon-button.danger:hover {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
    border-color: rgba(255, 69, 58, 0.3);
  }

  .icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 6px;
  }

  /* API Keys Grid */
  .api-keys-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .api-key-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s;
  }

  .api-key-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
  }

  .api-key-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .provider-name {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .status-badge {
    font-size: 11px;
    padding: 3px 8px;
    background: rgba(52, 199, 89, 0.15);
    color: #34c759;
    border-radius: 6px;
    font-weight: 600;
    border: 1px solid rgba(52, 199, 89, 0.3);
  }

  .key-display,
  .key-input {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .key-masked {
    flex: 1;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .key-input input {
    flex: 1;
    background: rgba(0, 0, 0, 0.4);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    color: #fff;
    font-size: 13px;
    font-family: monospace;
  }

  .key-input input:focus {
    outline: none;
    border-color: #0a84ff;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
  }

  .key-actions {
    display: flex;
    gap: 6px;
  }

  /* Members */
  .members-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .member-stat {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #0a84ff;
  }

  .stat-label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  .role-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  }

  /* P2P Connectivity */
  .connectivity-status {
    margin-bottom: 20px;
  }

  .status-row {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }

  .status-row:last-child {
    margin-bottom: 0;
  }

  .status-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    font-size: 13px;
  }

  .status-item svg {
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }

  .status-label {
    color: rgba(255, 255, 255, 0.6);
  }

  .status-value {
    margin-left: auto;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status-value.success {
    color: #30d158;
  }

  .status-value.error {
    color: #ff453a;
  }

  .connectivity-test {
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .test-header {
    margin-bottom: 12px;
  }

  .test-header strong {
    font-size: 14px;
    color: #fff;
  }

  .test-description {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 4px 0 0 0;
  }

  .test-results {
    margin-top: 16px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    font-size: 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .result-row:last-of-type {
    border-bottom: none;
  }

  .result-success {
    color: #30d158;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .result-error {
    color: #ff453a;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .result-warning {
    color: #ff9f0a;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .result-value {
    color: #0a84ff;
    font-weight: 600;
  }

  .result-error-message,
  .result-success-message,
  .result-info-message {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .result-error-message {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
  }

  .result-success-message {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
  }

  .result-info-message {
    background: rgba(10, 132, 255, 0.15);
    color: #0a84ff;
  }

  .info-card {
    background: rgba(10, 132, 255, 0.08) !important;
    border-color: rgba(10, 132, 255, 0.2) !important;
  }

  .info-content strong {
    font-size: 14px;
    color: #0a84ff;
    display: block;
    margin-bottom: 8px;
  }

  .info-list {
    margin: 0;
    padding-left: 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }

  .info-list li {
    margin-bottom: 4px;
  }

  .info-list li:last-child {
    margin-bottom: 0;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Collapsible Section */
  .collapsible-section {
    margin-bottom: 20px;
  }

  .collapsible-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .collapsible-header:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .collapsible-header .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .collapsible-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .collapsible-header p {
    margin: 2px 0 0 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  .collapsible-content {
    margin-top: 12px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
  }

  /* Danger Zone */
  .danger-zone {
    margin-top: 32px;
  }

  .danger-card {
    border-color: rgba(255, 69, 58, 0.2);
    background: rgba(255, 69, 58, 0.03);
  }

  .nuke-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .nuke-info strong {
    display: block;
    font-size: 15px;
    color: #ff453a;
    margin-bottom: 4px;
  }

  .nuke-info p {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .nuke-switch {
    position: relative;
    width: 70px;
    height: 70px;
    perspective: 800px;
  }

  .safety-cover {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(45deg, #e8be33, #e8be33 8px, #1a1a1a 8px, #1a1a1a 16px);
    border: 2px solid #52420a;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top center;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  .safety-cover span {
    background: #1a1a1a;
    color: #e8be33;
    font-size: 9px;
    font-weight: 900;
    padding: 1px 4px;
    border: 1px solid #e8be33;
  }

  .nuke-switch.open .safety-cover {
    transform: rotateX(110deg);
  }

  .nuke-button {
    position: absolute;
    inset: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ff453a, #dc2626);
    color: #fff;
    font-weight: 900;
    font-size: 10px;
    border: none;
    cursor: pointer;
    box-shadow: 0 5px 0 #991b1b, 0 8px 8px rgba(0, 0, 0, 0.5);
    transition: all 0.15s;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nuke-button:active {
    transform: translateY(3px);
    box-shadow: 0 1px 0 #8c1c1c;
  }

  .nuke-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nuke-button.done {
    background: #34c759;
    box-shadow: 0 4px 0 #248a3d;
  }

  .nuke-feedback {
    margin-top: 12px;
    padding: 12px;
    background: rgba(52, 199, 89, 0.15);
    border: 1px solid rgba(52, 199, 89, 0.3);
    border-radius: 8px;
    color: #34c759;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
  }

  .delete-space-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .delete-space-section strong {
    display: block;
    font-size: 15px;
    color: #ff453a;
    margin-bottom: 4px;
  }

  .delete-space-section p {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  /* Credits Tab */
  .credits-section {
    max-width: 700px;
  }

  .subsection-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin: 24px 0 16px 0;
  }

  .libraries-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 32px;
  }

  .library-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    text-decoration: none;
    transition: all 0.2s;
  }

  .library-card:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(10, 132, 255, 0.3);
    transform: translateY(-2px);
  }

  .library-info strong {
    display: block;
    font-size: 14px;
    color: #fff;
    margin-bottom: 2px;
  }

  .library-info p {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .library-card svg {
    color: rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
  }

  .made-with-love {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.1), rgba(147, 51, 234, 0.1));
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
  }

  .made-with-love svg {
    color: #fbbf24;
  }

  /* Support Tab */
  .support-section {
    max-width: 600px;
  }

  .support-item {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .support-item > svg {
    color: #0a84ff;
    flex-shrink: 0;
  }

  .support-item > div {
    flex: 1;
  }

  .support-item strong {
    display: block;
    font-size: 15px;
    color: #fff;
    margin-bottom: 4px;
  }

  .support-item p {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .version-info {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    text-align: center;
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
  }

  .version-info p {
    margin: 4px 0;
  }

  /* Footer */
  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* Buttons */
  .btn-primary,
  .btn-secondary,
  .btn-danger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: none;
  }

  .btn-primary {
    background: #0a84ff;
    color: #fff;
  }

  .btn-primary:hover {
    background: #0077ed;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .btn-danger {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
    border: 1px solid rgba(255, 69, 58, 0.3);
  }

  .btn-danger:hover {
    background: rgba(255, 69, 58, 0.25);
    border-color: rgba(255, 69, 58, 0.5);
  }

  .full-width {
    width: 100%;
  }

  /* Scrollbar */
  .settings-content::-webkit-scrollbar {
    width: 8px;
  }

  .settings-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
  }

  .settings-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .settings-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* Info Banner */
  .info-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
    border: 1px solid rgba(10, 132, 255, 0.2);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    margin-bottom: 20px;
  }

  .info-banner svg {
    color: #0a84ff;
    flex-shrink: 0;
  }

  /* Offline Models Section */
  .collapsible-header .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .storage-badge {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.05);
    padding: 4px 10px;
    border-radius: 6px;
  }

  .offline-models-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }

  .tier-badge {
    padding: 4px 10px;
    background: linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%);
    color: white;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .offline-model-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 400px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .offline-model-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s ease;
  }

  .offline-model-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.04);
  }

  .offline-model-card.downloaded {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.05);
  }

  .offline-model-card.active {
    border-color: rgba(10, 132, 255, 0.4);
    background: rgba(10, 132, 255, 0.08);
  }

  .model-main {
    display: flex;
    gap: 12px;
  }

  .model-icon {
    font-size: 20px;
  }

  .model-info {
    flex: 1;
  }

  .model-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }

  .model-header-row strong {
    font-size: 14px;
    color: #fff;
  }

  .model-desc {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0 0 8px 0;
  }

  .model-stats {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .model-stats .quality {
    color: #fbbf24;
  }

  /* Badges */
  .badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .badge-active {
    background: #0a84ff;
    color: white;
  }

  .badge-downloaded {
    background: #22c55e;
    color: white;
  }

  .badge-progress {
    background: #eab308;
    color: #000;
  }

  .badge-paused {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .badge-error {
    background: #ef4444;
    color: white;
  }

  /* Download Progress */
  .download-progress {
    margin-top: 12px;
  }

  .progress-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0a84ff, #5e5ce6);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  .error-message {
    margin-top: 8px;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
    font-size: 12px;
    color: #ef4444;
  }

  /* Model Actions */
  .model-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    background: transparent;
  }

  .btn-primary {
    background: #0a84ff;
    color: white;
  }

  .btn-primary:hover {
    background: #0077ed;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .btn-ghost {
    color: rgba(255, 255, 255, 0.6);
  }

  .btn-ghost:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .offline-model-list::-webkit-scrollbar {
    width: 6px;
  }

  .offline-model-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .offline-model-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  /* Loading spinner animation */
  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
