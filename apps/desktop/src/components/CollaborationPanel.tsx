/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// CollaborationPanel.tsx
// Unified panel for Team Management, Invites, and Joining Workspaces
import { useState, useEffect } from 'react'
import { Users, Link as LinkIcon, Copy, Check, Shield, Search, X, Eye, EyeOff } from 'lucide-react'
import MemberManagement from './MemberManagement'
import { useAppStore } from '../stores/appStore'
import { p2pService } from '../services/p2pService'

interface Props {
    onClose: () => void
}

export default function CollaborationPanel({ onClose }: Props) {
    const [activeTab, setActiveTab] = useState<'members' | 'invite' | 'join'>('invite')
    const { currentSpace } = useAppStore()

    if (!currentSpace) return null

    return (
        <div className="collaboration-overlay" onClick={onClose}>
            <div className="collaboration-panel" onClick={e => e.stopPropagation()}>
                <div className="panel-header">
                    <div className="header-title">
                        <h2><Users size={20} className="text-blue-400" /> Team & Collaboration</h2>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="panel-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => setActiveTab('members')}
                    >
                        Members
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'invite' ? 'active' : ''}`}
                        onClick={() => setActiveTab('invite')}
                    >
                        Invite
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
                        onClick={() => setActiveTab('join')}
                    >
                        Join Space
                    </button>
                </div>

                <div className="panel-content">
                    {activeTab === 'members' && (
                        <div className="h-full">
                            <MemberManagement spaceId={currentSpace.id} onClose={() => { }} />
                        </div>
                    )}
                    {activeTab === 'invite' && <InviteView spaceId={currentSpace.id} />}
                    {activeTab === 'join' && <JoinView onClose={onClose} />}
                </div>

                <style>{`
                    .collaboration-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.6);
                        backdrop-filter: blur(4px);
                        z-index: 1000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .collaboration-panel {
                        width: 900px;
                        max-width: 95vw;
                        height: 700px;
                        max-height: 90vh;
                        background: rgba(13, 13, 13, 0.9);
                        backdrop-filter: blur(24px) saturate(180%);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.1);
                        border-radius: var(--radius-xl);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        color: var(--color-text);
                    }

                    .panel-header {
                        padding: 20px 24px;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: rgba(255, 255, 255, 0.02);
                    }

                    .header-title h2 {
                        margin: 0;
                        font-size: 18px;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        color: var(--color-text);
                        text-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
                    }

                    .close-btn {
                        width: 32px;
                        height: 32px;
                        color: var(--color-text-muted);
                        background: transparent;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    }

                    .close-btn:hover {
                        color: white;
                        background: rgba(255, 255, 255, 0.05);
                        border-color: rgba(255, 255, 255, 0.2);
                    }

                    .panel-tabs {
                        display: flex;
                        padding: 12px 24px;
                        background: rgba(0, 0, 0, 0.2);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                        gap: 8px;
                    }

                    .tab-btn {
                        padding: 8px 16px;
                        background: transparent;
                        border: none;
                        border-radius: 100px;
                        color: var(--color-text-muted);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .tab-btn:hover {
                        color: var(--color-text);
                        background: rgba(255, 255, 255, 0.04);
                    }

                    .tab-btn.active {
                        color: white;
                        background: rgba(59, 130, 246, 0.1);
                        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3);
                    }

                    .panel-content {
                        flex: 1;
                        overflow: hidden;
                        padding: 24px;
                    }
                `}</style>
            </div>
        </div>
    )
}

// ------------------------------------------------------------------
// Invite View
// ------------------------------------------------------------------
function InviteView({ spaceId }: { spaceId: string }) {
    const [inviteLink, setInviteLink] = useState('')
    const [roomCode, setRoomCode] = useState('')
    const [copied, setCopied] = useState(false)
    const [showRoomCode, setShowRoomCode] = useState(false)

    const generate = async () => {
        // SECURITY #9: Do not embed passwords in URLs
        const link = p2pService.generateRoomLink(spaceId)
        setInviteLink(link)
        setRoomCode(spaceId.toUpperCase())
    }

    useEffect(() => {
        generate()
    }, [spaceId])

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="invite-container">
            <div className="invite-grid">
                {/* Left: Code Card */}
                <div className="col-autocard">
                    <h3>Room Code</h3>
                    <div className="code-card">
                        <div className="code-display-wrapper">
                            <div className="code-display">
                                {showRoomCode ? roomCode : roomCode.replace(/./g, 'â€¢')}
                            </div>
                            <button
                                className="show-code-btn"
                                onClick={() => setShowRoomCode(!showRoomCode)}
                                title={showRoomCode ? "Hide Code" : "Show Code"}
                            >
                                {showRoomCode ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <p className="code-hint">Share this code for quick access</p>
                        <button className="btn btn-secondary w-full mt-4" onClick={() => copyToClipboard(roomCode)}>
                            <Copy size={16} className="mr-2" /> Copy Code
                        </button>
                    </div>
                </div>

                {/* Right: Link & Config */}
                <div className="col-main">
                    <h3>Direct Invite Link</h3>
                    <div className="link-box">
                        <div className="link-input-wrapper">
                            <LinkIcon size={16} className="text-slate-500 ml-3" />
                            <input value={inviteLink} readOnly className="link-input" />
                        </div>
                        <button className="btn btn-primary" onClick={() => copyToClipboard(inviteLink)}>
                            {copied ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
                            {copied ? 'Copied!' : 'Copy Link'}
                        </button>
                    </div>

                    <div className="options-panel">
                        <h4 className="options-title">Security & Protocol</h4>
                        <div className="option-row">
                            <span className="text-xs text-slate-400">
                                Passwords are no longer embedded in links for security.
                                Share your encryption key via a secure second channel.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .invite-container {
                    height: 100%;
                }
                .invite-grid {
                    display: grid;
                    grid-template-columns: 300px 1fr;
                    gap: 32px;
                    height: 100%;
                }
                .col-autocard h3, .col-main h3 {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    margin: 0 0 16px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .code-card {
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(15, 23, 42, 0.4));
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    padding: 32px 24px;
                    border-radius: 16px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 240px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                }
                .code-display-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                    max-width: 100%;
                    width: 100%;
                    justify-content: center;
                }
                .code-display {
                    font-family: var(--font-mono);
                    font-size: 28px;
                    font-weight: 700;
                    color: #60a5fa;
                    letter-spacing: 0.1em;
                    text-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .show-code-btn {
                    background: transparent;
                    border: none;
                    color: var(--color-text-muted);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                }
                .show-code-btn:hover {
                    color: white;
                    background: rgba(255, 255, 255, 0.05);
                }
                .code-hint {
                    font-size: 13px;
                    color: var(--color-text-muted);
                    margin: 0;
                }
                .link-box {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 32px;
                }
                .link-input-wrapper {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    transition: border-color 0.2s;
                }
                .link-input-wrapper:focus-within {
                    border-color: var(--color-accent);
                }
                .link-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    padding: 12px;
                    color: var(--color-text);
                    font-family: var(--font-mono);
                    font-size: 13px;
                    outline: none;
                }
                .options-panel {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    padding: 24px;
                }
                .options-title {
                    margin: 0 0 20px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--color-text);
                }
                .option-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    font-size: 14px;
                    color: var(--color-text-secondary);
                }
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    color: var(--color-text);
                }
                .checkbox-label input {
                    accent-color: var(--color-accent);
                }
                .info-badge {
                    background: rgba(16, 185, 129, 0.1);
                    color: #34d399;
                    font-size: 11px;
                    font-weight: 500;
                    padding: 4px 10px;
                    border-radius: 100px;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                .select-input {
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: var(--color-text);
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                }
                .select-input:focus {
                    border-color: var(--color-accent);
                }
            `}</style>
        </div>
    )
}

// ------------------------------------------------------------------
// Join View
// ------------------------------------------------------------------
function JoinView({ onClose }: { onClose: () => void }) {
    const { createSpace, setCurrentSpace, spaces } = useAppStore()
    const [input, setInput] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [joining, setJoining] = useState(false)
    const [parsedInvite, setParsedInvite] = useState<{ spaceId: string, password?: string } | null>(null)

    // Listen for deep links
    useEffect(() => {
        const handler = (e: CustomEvent<{ url: string }>) => {
            if (e.detail?.url) {
                // BUG #36: Validate URL scheme
                const url = e.detail.url

                // Only allow kalynt:// protocol
                if (!url.startsWith('kalynt://')) {
                    console.warn('[Collaboration] Invalid deep link scheme:', url)
                    return
                }

                setInput(url)
                setTimeout(() => handleParse(url), 100)
            }
        }
        window.addEventListener('kalynt-deep-link', handler as EventListener)
        return () => window.removeEventListener('kalynt-deep-link', handler as EventListener)
    }, [])

    const handleParse = (urlOverride?: string) => {
        setError('')
        const text = (urlOverride || input).trim()

        // BUG #36: Validate deep link schema
        if (text.includes(':') && !text.startsWith('kalynt://')) {
            setError('Untrusted protocol detected')
            return
        }

        // Try parsing as link
        const parsed = p2pService.parseRoomLink(text)

        if (parsed) {
            setParsedInvite({ spaceId: parsed.roomId, password: parsed.password })
            if (parsed.password) setPassword(parsed.password)
        } else if (text.length > 0 && text.length <= 50) {
            // Treat as raw room code
            setParsedInvite({ spaceId: text })
        } else {
            setError('Invalid link or code')
        }
    }

    const handleJoin = async () => {
        if (!parsedInvite || joining) return
        setJoining(true)
        try {
            // Initialize encryption if password present
            const pwdToUse = password || parsedInvite.password

            const existing = spaces.find(s => s.id === parsedInvite.spaceId)
            if (existing) {
                setCurrentSpace(existing)
            } else {
                const newSpace = createSpace('Shared Space', parsedInvite.spaceId)
                setCurrentSpace(newSpace)
            }

            if (pwdToUse) {
                localStorage.setItem(`space-settings-${parsedInvite.spaceId}`, JSON.stringify({ encryptionEnabled: true, roomPassword: pwdToUse }))
            }
            onClose()
        } catch (_e) {
            setError('Failed to join')
        } finally {
            setJoining(false)
        }
    }

    return (
        <div className="join-container h-full flex flex-col items-center justify-center p-8">
            <div className="join-card max-w-md w-full">
                {!parsedInvite ? (
                    <>
                        <div className="text-center mb-8">
                            <div className="inline-flex p-4 bg-blue-500/10 rounded-full text-blue-400 mb-4 ring-1 ring-blue-500/20">
                                <Search size={32} />
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-white">Join a Workspace</h3>
                            <p className="text-slate-400 text-sm">Enter an invite link or room code to connect</p>
                        </div>
                        <div className="join-form">
                            <input
                                className="input text-lg p-4 text-center mb-4 w-full bg-black/20 border border-white/10 rounded-xl focus:border-blue-500/50 outline-none text-white transition-colors"
                                placeholder="Paste Link or Code..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                autoFocus
                            />
                            {error && <div className="text-red-400 text-sm text-center mb-4 bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</div>}
                            <button className="btn btn-primary w-full py-3 text-base font-medium" onClick={() => handleParse()} disabled={!input.trim()}>
                                Continue
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <div className="inline-flex p-4 bg-green-500/10 rounded-full text-green-400 mb-4 ring-1 ring-green-500/20">
                                <Shield size={32} />
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-white">Found Workspace</h3>
                            <p className="text-slate-400 text-sm flex items-center justify-center gap-2">
                                <span className="font-mono text-blue-300">{parsedInvite.spaceId}</span>
                            </p>
                        </div>
                        <div className="join-form">
                            <input
                                type="password"
                                className="input text-lg p-4 text-center mb-4 w-full bg-black/20 border border-white/10 rounded-xl focus:border-blue-500/50 outline-none text-white transition-colors"
                                placeholder="Enter Workspace Password (if required)"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoFocus
                            />
                            <button
                                className="btn btn-primary w-full py-3 text-base font-medium"
                                onClick={async (e) => {
                                    // BUG #37: Prevent double-click
                                    if (joining) return
                                    e.currentTarget.disabled = true  // Immediately disable
                                    try {
                                        await handleJoin()
                                    } finally {
                                        e.currentTarget.disabled = false
                                    }
                                }}
                                disabled={joining}
                            >
                                {joining ? 'Joining...' : 'Confirm & Join'}
                            </button>
                            <button className="btn btn-ghost w-full mt-3 text-slate-400 hover:text-white" onClick={() => setParsedInvite(null)}>
                                Back
                            </button>
                        </div>
                    </>
                )}
            </div>
            <style>{`
                .join-card {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 48px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                }
            `}</style>
        </div>
    )
}
