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
import { aiService } from '../services/aiService'
import {
  downloadModel,
  cancelDownload
} from '../services/modelDownloadService'
import {
  OFFLINE_MODELS,
  formatBytes
} from '../types/offlineModels'
import { useCollaboration } from './collaboration/hooks/useCollaboration'
import MemberList from './collaboration/MemberList'
import MemberDetail from './collaboration/MemberDetail'
import AIMESettings from './AIMESettings'
import './UnifiedSettingsPanel.css'
import {
  X,
  Eye,
  EyeOff,
  Save,
  Play,
  Square,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bot,
  Brain,
  Lock,
  Users,
  Radiation,
  Shield,
  Award,
  HelpCircle,
  Github,
  RefreshCw,
  Globe,
  Loader2,
  HardDrive,
  Download,
  Zap,
  Monitor,
  Cpu,
  Cloud,
  Code,
  Box,
  Layout,
  Layers,
  Palette,
  Wind
} from 'lucide-react'

type TabId = 'agents' | 'security' | 'members' | 'advanced' | 'credits' | 'support'

interface SpaceSettings {
  encryptionEnabled: boolean
  roomPassword: string
  githubConnected: boolean
  slackWebhook: string
}

export default function UnifiedSettingsPanel({ onClose }: { readonly onClose: () => void }) {
  const { currentSpace, apiKeys, setAPIKey, removeAPIKey, settingsTab, setSettingsTab } = useAppStore()
  const { getMyRole, getMembers } = useMemberStore()

  const [activeTab, setActiveTab] = useState<TabId>('agents')

  useEffect(() => {
    if (settingsTab) {
      setActiveTab(settingsTab as TabId)
    }
  }, [settingsTab])

  const handleClose = () => {
    setSettingsTab(null)
    onClose()
  }
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
      if (e.key === 'Escape') handleClose()
    }
    globalThis.addEventListener('keydown', handleEsc)
    return () => globalThis.removeEventListener('keydown', handleEsc)
  }, [handleClose])

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
    setTimeout(() => setSaved(false), 1000)
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

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'agents', label: 'Agents', icon: <Zap size={16} /> },
    ...(currentSpace ? [
      { id: 'security', label: 'Security', icon: <Lock size={16} /> },
      { id: 'members', label: 'Members', icon: <Users size={16} /> }
    ] : []) as Array<{ id: TabId; label: string; icon: React.ReactNode }>,
    { id: 'advanced', label: 'Advanced', icon: <Brain size={16} /> },
    { id: 'credits', label: 'Credits', icon: <Award size={16} /> },
    { id: 'support', label: 'Support', icon: <HelpCircle size={16} /> }
  ]

  return (
    <div className="settings-container">
      <div className="settings-overlay" onClick={handleClose} />
      <div className="settings-panel">
        {/* Header */}
        <div className="settings-header">
          <div className="header-title-group">
            <h2>{currentSpace ? 'Workspace Settings' : 'Global Settings'}</h2>
            {currentSpace && <span className="space-id-label">{currentSpace.name}</span>}
          </div>
          <button className="close-btn" onClick={handleClose}>
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
                onClick={() => {
                  setActiveTab(tab.id)
                  setShowMembers(false)
                }}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="settings-content">
            {activeTab === 'agents' && (
              <AgentsTab apiKeys={apiKeys} setAPIKey={setAPIKey} removeAPIKey={removeAPIKey} />
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
          <p className="footer-note">Settings are encrypted and synced across your devices.</p>
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" onClick={handleSave}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Agents Tab Component
function AgentsTab({ apiKeys, setAPIKey, removeAPIKey }: any) {
  const [showOfflineModels, setShowOfflineModels] = useState(false)
  const { downloadedModels, activeDownloads, loadedModelId, isLoading, getTotalDownloadedSize } = useModelStore()
  
  useEffect(() => {
    useModelStore.getState().setupListeners()
  }, [])

  return (
    <div className="tab-content agents-tab animate-fadeIn">
      <div className="tab-header-hero">
         <div className="hero-icon-box">
            <Zap size={24} className="text-blue-400" />
         </div>
         <div className="hero-text">
            <h3>AI Intelligence Layer</h3>
            <p>Configure the brains behind your agentic IDE. Connect cloud providers or run high-performance models locally.</p>
         </div>
      </div>

      <div className="agents-grid">
        <section className="intelligence-section">
          <div className="section-header-compact">
             <Cloud size={14} />
             <span>Cloud Intelligence (BYOK)</span>
          </div>
          
          <div className="key-registration-list">
            <ModernApiKeyInput
              provider="openai"
              name="OpenAI"
              description="GPT-4o, GPT-5, Codex"
              placeholder="sk-..."
              apiKeys={apiKeys}
              setAPIKey={setAPIKey}
              removeAPIKey={removeAPIKey}
            />
            <ModernApiKeyInput
              provider="anthropic"
              name="Anthropic"
              description="Claude 3.5, 4.5 Opus"
              placeholder="sk-ant-..."
              apiKeys={apiKeys}
              setAPIKey={setAPIKey}
              removeAPIKey={removeAPIKey}
            />
            <ModernApiKeyInput
              provider="google"
              name="Google"
              description="Gemini 1.5, 3 Pro"
              placeholder="AIza..."
              apiKeys={apiKeys}
              setAPIKey={setAPIKey}
              removeAPIKey={removeAPIKey}
            />
          </div>
        </section>

        <section className="intelligence-section">
          <div className="section-header-compact">
             <Monitor size={14} />
             <span>Local Intelligence (Privacy First)</span>
          </div>

          <div className="local-model-manager glass-panel-dark">
             <div className="manager-header">
                <div className="storage-info">
                   <HardDrive size={14} className="text-gray-500" />
                   <span>{formatBytes(getTotalDownloadedSize())} indexed</span>
                </div>
                <button className="btn-toggle-models" onClick={() => setShowOfflineModels(!showOfflineModels)}>
                   {showOfflineModels ? 'Hide Catalog' : 'Browse Catalog'}
                   <ChevronDown size={14} className={showOfflineModels ? 'rotate-180' : ''} />
                </button>
             </div>

             {showOfflineModels && (
                <div className="models-catalog">
                   {OFFLINE_MODELS.map(model => {
                      const downloaded = downloadedModels[model.id]
                      const download = activeDownloads[model.id]
                      const isLoaded = loadedModelId === model.id
                      
                      const getModelIcon = (id: string) => {
                        if (id.includes('nano') || id.includes('0.5b') || id.includes('1.5b')) return <Zap size={18} />
                        if (id.includes('balanced') || id.includes('7b-q4')) return <Cpu size={18} />
                        if (id.includes('thinking') || id.includes('reasoning')) return <Brain size={18} />
                        if (id.includes('agent') || id.includes('7b')) return <Bot size={18} />
                        return <Layers size={18} />
                      }
                      
                      return (
                         <div key={model.id} className={`model-entry ${isLoaded ? 'loaded' : ''}`}>
                            <div className="entry-main">
                               <div className="model-id-badge">
                                  {getModelIcon(model.id)}
                               </div>
                               <div className="model-details">
                                  <div className="name-row">
                                     <span className="model-name">{model.name}</span>
                                     {isLoaded && <span className="active-glow-tag">ACTIVE</span>}
                                  </div>
                                  <div className="meta-row">
                                     <span>{model.size}</span>
                                     <span className="dot"></span>
                                     <span>{model.ramRequired} RAM</span>
                                  </div>
                               </div>
                               <div className="model-actions-minimal">
                                  {downloaded ? (
                                     isLoaded ? (
                                        <button className="btn-action-icon stop" onClick={() => offlineLLMService.unloadModel()} title="Unload"><Square size={14} fill="currentColor" /></button>
                                     ) : (
                                        <button className="btn-action-icon play" onClick={() => offlineLLMService.loadModel(model.id)} disabled={isLoading} title="Load Model">
                                           {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                                        </button>
                                     )
                                  ) : download?.status === 'downloading' ? (
                                     <div className="download-mini-progress">
                                        <span>{Math.round((download.bytesDownloaded / download.totalBytes) * 100)}%</span>
                                        <button className="btn-action-icon stop-mini" onClick={() => cancelDownload(model.id)} title="Cancel Download">
                                           <Square size={10} fill="currentColor" />
                                        </button>
                                     </div>
                                  ) : (
                                     <button className="btn-action-icon download" onClick={() => downloadModel(model.id)} title="Download"><Download size={14} /></button>
                                  )}
                               </div>
                            </div>
                         </div>
                      )
                   })}
                </div>
             )}

             {!showOfflineModels && loadedModelId && (
                <div className="active-model-card animate-reveal-up">
                   <div className="active-indicator">
                      <div className="pulse-dot"></div>
                      <span>Loaded & Ready</span>
                   </div>
                   <h4>{OFFLINE_MODELS.find(m => m.id === loadedModelId)?.name}</h4>
                   <p>{OFFLINE_MODELS.find(m => m.id === loadedModelId)?.description.slice(0, 100)}...</p>
                   <button className="btn-unload-global" onClick={() => offlineLLMService.unloadModel()}>
                      <X size={14} /> <span>Unload Agent Brain</span>
                   </button>
                </div>
             )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ModernApiKeyInput({ provider, name, description, placeholder, apiKeys, setAPIKey, removeAPIKey }: any) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentKey = apiKeys[provider]
  const hasKey = !!currentKey

  const handleSave = async () => {
    if (value.trim()) {
      setVerifying(true)
      setError(null)
      try {
        const isValid = await aiService.verifyKey(provider, value.trim())
        if (isValid) {
          await setAPIKey(provider, value.trim())
          setIsEditing(false)
          setValue('')
        } else {
          setError('Invalid API Key')
        }
      } catch (err) {
        setError('Verification Failed')
      } finally {
        setVerifying(false)
      }
    }
  }

  return (
    <div className={`modern-key-card ${hasKey ? 'active' : ''} ${error ? 'error' : ''}`}>
      <div className="provider-branding">
         <div className={`provider-logo-box ${provider}`}>
            {provider === 'openai' && <Bot size={18} />}
            {provider === 'anthropic' && <Brain size={18} />}
            {provider === 'google' && <Zap size={18} />}
         </div>
         <div className="provider-info">
            <span className="name">{name}</span>
            <span className="desc">{description}</span>
         </div>
         {hasKey && !isEditing && (
            <div className="status-pill-success">
               <Check size={10} />
               <span>ENCRYPTED</span>
            </div>
         )}
      </div>

      <div className="key-input-area">
         {isEditing ? (
            <div className="input-group-modern">
               <input
                  type="password"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                  disabled={verifying}
               />
               <div className="input-actions">
                  <button onClick={() => setIsEditing(false)} className="btn-cancel" disabled={verifying}>Cancel</button>
                  <button onClick={handleSave} className="btn-save" disabled={!value.trim() || verifying}>
                     {verifying ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                  </button>
               </div>
               {error && <span className="error-msg-mini">{error}</span>}
            </div>
         ) : hasKey ? (
            <div className="key-management-row">
               <span className="key-obfuscated">••••••••••••••••••••••••</span>
               <div className="management-btns">
                  <button className="btn-minor" onClick={() => setIsEditing(true)}>Change</button>
                  <button className="btn-minor danger" onClick={() => removeAPIKey(provider)}>Disconnect</button>
               </div>
            </div>
         ) : (
            <button className="btn-connect-modern" onClick={() => setIsEditing(true)}>
               Connect {name} Agent
            </button>
         )}
      </div>
    </div>
  )
}

function SecurityTab({ settings, setSettings, showPassword, setShowPassword }: any) {
  const [githubToken, setGithubToken] = useState('')
  const [showGithubToken, setShowGithubToken] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)

  useEffect(() => {
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
      if (githubToken?.trim()) {
        const result = await window.electronAPI?.safeStorage?.set({
          key: 'github-update-token',
          value: githubToken
        })
        if (result?.success) {
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
    <div className="tab-content animate-fadeIn">
      <div className="settings-section">
        <h3><Shield size={16} /> Encryption</h3>
        <p className="section-desc">
          End-to-end encryption is always enabled for P2P sync. All data is encrypted using AES-256-GCM.
        </p>
        
        <div className="setting-row">
          <span>Status</span>
          <div className="badge badge-active">Active</div>
        </div>

        <div className="password-field">
          <label>Room Password</label>
          <div className="password-input-row">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter shared password for this workspace"
              value={settings.roomPassword}
              onChange={(e) => setSettings({ ...settings, roomPassword: e.target.value, encryptionEnabled: true })}
            />
            <button className="icon-btn-ghost" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="hint">Share this password with collaborators to enable P2P sync</p>
        </div>
      </div>

      <div className="settings-section">
        <h3><Github size={16} /> Auto-Update Configuration</h3>
        <p className="section-desc">
          Configure GitHub access for automatic updates. For private repositories, provide a Personal Access Token.
        </p>

        <div className="password-field">
          <label>GitHub Personal Access Token (Optional)</label>
          <div className="password-input-row">
            <input
              className="input"
              type={showGithubToken ? 'text' : 'password'}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <button className="icon-btn-ghost" onClick={() => setShowGithubToken(!showGithubToken)}>
              {showGithubToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSaveGithubToken}
              disabled={tokenLoading || !githubToken}
            >
              {tokenSaved ? <Check size={14} /> : <Save size={14} />}
              {tokenSaved ? 'Saved!' : 'Save Token'}
            </button>
            {githubToken && (
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDeleteGithubToken}
                disabled={tokenLoading}
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MembersTab({ memberCount, myRole: userRole, isAdmin: userIsAdmin, showMembers, setShowMembers, spaceId }: any) {
  const [connectivityTest, setConnectivityTest] = useState<{
    testing: boolean
    result: { stun: boolean; turn: boolean; candidates: any[]; error?: string } | null
  }>({ testing: false, result: null })

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

  const {
    filteredMembers,
    selectedMemberId,
    selectedMember,
    myRole,
    currentUserId,
    searchQuery,
    showOfflineMembers,
    setSearchQuery,
    setShowOfflineMembers,
    setSelectedMemberId,
    handleRoleChange,
    handlePermissionChange,
    handleKick,
    handleBan
  } = useCollaboration(spaceId)

  if (showMembers && spaceId) {
    return (
      <div className="tab-content member-management-container animate-fadeIn">
        <div className="member-management-header">
          <h3>Manage Team Members</h3>
          <button className="close-btn" onClick={() => setShowMembers(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="member-management-content">
          <div className="member-list-section">
            <MemberList
              members={filteredMembers}
              peers={[]}
              selectedMemberId={selectedMemberId}
              currentUserId={currentUserId}
              searchQuery={searchQuery}
              showOffline={showOfflineMembers}
              onSelectMember={(id) => setSelectedMemberId(id === selectedMemberId ? null : id)}
              onSearchChange={setSearchQuery}
              onToggleOffline={() => setShowOfflineMembers(!showOfflineMembers)}
            />
          </div>
          <div className="member-detail-section">
            {selectedMember ? (
              <MemberDetail
                member={selectedMember}
                currentUserRole={myRole}
                isCurrentUser={selectedMember.userId === currentUserId}
                onRoleChange={(role) => handleRoleChange(selectedMember.userId, role)}
                onPermissionChange={(perms) => handlePermissionChange(selectedMember.userId, perms)}
                onKick={() => handleKick(selectedMember.userId)}
                onBan={(reason) => handleBan(selectedMember.userId, reason)}
              />
            ) : (
              <div className="empty-state">
                <Users size={48} className="empty-icon" />
                <p>Select a member to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content animate-fadeIn">
      <div className="settings-section">
        <h3><Users size={16} /> Team Members</h3>
        <p className="section-desc">Manage workspace members and permissions.</p>

        <div className="setting-row">
          <span>Members</span>
          <div className="badge badge-active">{memberCount} Total</div>
        </div>
        <div className="setting-row">
          <span>Your Role</span>
          <div className="badge badge-custom">{userRole}</div>
        </div>

        {userIsAdmin && (
          <button className="btn btn-secondary w-full mt-4" onClick={() => setShowMembers(true)}>
            <Users size={14} />
            Manage Team
          </button>
        )}
      </div>

      <div className="settings-section">
        <h3><Globe size={16} /> P2P Diagnostics</h3>
        <p className="section-desc">Network status and connection diagnostics for serverless collaboration.</p>

        <div className="setting-row">
          <span>STUN Capability</span>
          {connectivityTest.result?.stun ? (
             <div className="badge badge-active">Available</div>
          ) : (
             <div className="badge badge-paused">Untested</div>
          )}
        </div>

        <button
            className="btn btn-secondary w-full mt-4"
            onClick={runConnectivityTest}
            disabled={connectivityTest.testing}
          >
            {connectivityTest.testing ? (
              <><Loader2 size={14} className="animate-spin" /> Testing...</>
            ) : (
              <><RefreshCw size={14} /> Run Diagnostics</>
            )}
          </button>
      </div>
    </div>
  )
}

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
    <div className="tab-content animate-fadeIn">
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

      <div className="danger-zone">
        <h3 className="section-title danger">
          <Radiation size={20} /> Danger Zone
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
      </div>
    </div>
  )
}

function CreditsTab() {
  const contributors = [
    { name: 'Electron', role: 'Runtime Shell', icon: <Box size={14} /> },
    { name: 'React', role: 'UI Framework', icon: <Layout size={14} /> },
    { name: 'Monaco Editor', role: 'Core Editor', icon: <Code size={14} /> },
    { name: 'Yjs', role: 'CRDT Sync', icon: <RefreshCw size={14} /> },
    { name: 'node-llama-cpp', role: 'Local Inference', icon: <Brain size={14} /> },
    { name: 'Vite', role: 'Build System', icon: <Zap size={14} /> },
    { name: 'Zustand', role: 'State Management', icon: <Layers size={14} /> },
    { name: 'Tailwind CSS', role: 'Styling Engine', icon: <Palette size={14} /> },
    { name: 'Lucide React', role: 'Iconography', icon: <Wind size={14} /> },
    { name: 'Simple-Peer', role: 'P2P Networking', icon: <Globe size={14} /> },
    { name: 'FastAPI', role: 'Backend API', icon: <Zap size={14} /> }
  ]

  return (
    <div className="tab-content animate-fadeIn">
      <div className="settings-section">
        <h3><Award size={16} /> Engineering Credits</h3>
        <p className="section-desc">The architectural foundations of Kalynt are built upon world-class open-source technologies.</p>
        
        <div className="contributor-grid mt-6">
          {contributors.map(c => (
            <div key={c.name} className="contributor-card">
              <div className="c-icon">{c.icon}</div>
              <div className="c-info">
                <span className="c-name">{c.name}</span>
                <span className="c-role">{c.role}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="made-with-love mt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
          <span style={{ opacity: 0.6 }}>Architected & Developed with passion for the global developer community.</span>
        </div>
      </div>
    </div>
  )
}

function SupportTab() {
  return (
    <div className="tab-content animate-fadeIn">
      <div className="settings-section">
        <h3><HelpCircle size={16} /> Support & Help</h3>
        <p className="section-desc">Get help, report issues, and provide feedback.</p>

        <div className="setting-row">
          <span>Email Support</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>hermeslekkasdev@gmail.com</span>
        </div>
        
        <div className="version-info mt-4" style={{ textAlign: 'center', opacity: 0.5, fontSize: '11px' }}>
          <p>Kalynt Desktop v1.0.4 beta</p>
          <p>&copy; 2026 Hermes Lekkas. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
