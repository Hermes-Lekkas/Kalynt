/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// MemberManagement - UI for managing workspace members (Embedded)
import { useState } from 'react'
import { useMemberStore } from '../stores/memberStore'
import { useAppStore } from '../stores/appStore'
import { memberSyncService } from '../services/memberSyncService'
import { WorkspaceRole, WorkspaceMember, canKick, canBan } from '../types/permissions'
import {
    User,
    Shield,
    Crown,
    Ban,
    LogOut,
    Check,
    Edit2,
    Bot,
    MessageSquare,
    FileText,
    Users,
    Search,
    Copy,
    Share2,
    Unlock,
    Eye,
    ChevronRight,
    ChevronLeft,
    UserPlus,
    Settings,
    AlertTriangle,
    CheckCircle,
    XCircle,
    ShieldCheck
} from 'lucide-react'
import './MemberManagement.css'

interface Props {
    spaceId: string
    onClose: () => void
}

export default function MemberManagement({ spaceId, onClose }: Props) {
    const { getMembers, getMyRole, unbanMember } = useMemberStore()
    const { connectedPeers, currentSpace } = useAppStore()

    const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null)
    const [confirmAction, setConfirmAction] = useState<'kick' | 'ban' | 'unban' | null>(null)
    const [banReason, setBanReason] = useState('')
    const [viewMode, setViewMode] = useState<'active' | 'banned'>('active')
    const [searchQuery, setSearchQuery] = useState('')
    const [copied, setCopied] = useState(false)

    const members = getMembers(spaceId)
    const myRole = getMyRole(spaceId)
    const isAdmin = myRole === 'owner' || myRole === 'admin'

    // Filter members
    const filteredMembers = members.filter(m => {
        const matchesSearch = m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    })

    // Get banned users
    const bannedUserIds = useMemberStore(state => state.spaceMembers[spaceId]?.bannedUsers || [])

    const handleKick = (member: WorkspaceMember) => {
        if (memberSyncService.kickMember(spaceId, member.userId)) {
            setConfirmAction(null)
            setSelectedMember(null)
        }
    }

    const handleBan = (member: WorkspaceMember) => {
        if (memberSyncService.banMember(spaceId, member.userId, banReason)) {
            setConfirmAction(null)
            setSelectedMember(null)
            setBanReason('')
        }
    }

    const handleUnban = (userId: string) => {
        if (unbanMember(spaceId, userId)) {
            setConfirmAction(null)
            setSelectedMember(null)
        }
    }

    const handleRoleChange = (userId: string, role: WorkspaceRole) => {
        memberSyncService.updateMemberRole(spaceId, userId, role)
    }

    const handlePermissionToggle = (userId: string, permission: string, value: boolean) => {
        memberSyncService.updateMemberPermissions(spaceId, userId, { [permission]: value })
    }

    const copySpaceId = () => {
        if (currentSpace) {
            navigator.clipboard.writeText(currentSpace.id)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'owner': return <Crown size={14} />
            case 'admin': return <Shield size={14} />
            case 'member': return <User size={14} />
            case 'viewer': return <Eye size={14} />
            default: return <User size={14} />
        }
    }

    const getRoleDescription = (role: string) => {
        switch (role) {
            case 'owner': return 'Full control over workspace'
            case 'admin': return 'Can manage members & settings'
            case 'member': return 'Can edit and collaborate'
            case 'viewer': return 'Read-only access'
            default: return ''
        }
    }

    const onlinePeers = connectedPeers.length

    return (
        <div className="member-management">
            {/* Header with Back Button */}
            <div className="mm-header">
                <div className="mm-header-top">
                    <button className="mm-back-btn" onClick={onClose}>
                        <ChevronLeft size={18} />
                        Back
                    </button>
                    <h3 className="mm-title">Team Management</h3>
                </div>
                <div className="mm-stats-row">
                    <div className="mm-stat">
                        <div className="mm-stat-icon">
                            <Users size={18} />
                        </div>
                        <div className="mm-stat-info">
                            <span className="mm-stat-value">{members.length}</span>
                            <span className="mm-stat-label">Total Members</span>
                        </div>
                    </div>
                    <div className="mm-stat">
                        <div className="mm-stat-icon online">
                            <div className="online-pulse" />
                        </div>
                        <div className="mm-stat-info">
                            <span className="mm-stat-value">{onlinePeers + 1}</span>
                            <span className="mm-stat-label">Online Now</span>
                        </div>
                    </div>
                    {isAdmin && bannedUserIds.length > 0 && (
                        <div className="mm-stat">
                            <div className="mm-stat-icon banned">
                                <Ban size={18} />
                            </div>
                            <div className="mm-stat-info">
                                <span className="mm-stat-value">{bannedUserIds.length}</span>
                                <span className="mm-stat-label">Banned</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="mm-content">
                {/* LEFT: Member List */}
                <div className="mm-list-panel">
                    {/* Tabs */}
                    <div className="mm-tabs">
                        <button
                            className={`mm-tab ${viewMode === 'active' ? 'active' : ''}`}
                            onClick={() => setViewMode('active')}
                        >
                            <Users size={14} />
                            Members
                        </button>
                        {isAdmin && (
                            <button
                                className={`mm-tab ${viewMode === 'banned' ? 'active' : ''}`}
                                onClick={() => setViewMode('banned')}
                            >
                                <Ban size={14} />
                                Banned
                                {bannedUserIds.length > 0 && (
                                    <span className="mm-tab-badge">{bannedUserIds.length}</span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Search */}
                    <div className="mm-search">
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Search members..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Member List */}
                    <div className="mm-member-list">
                        {viewMode === 'active' ? (
                            filteredMembers.length === 0 ? (
                                <div className="mm-empty">
                                    <Users size={40} />
                                    <p>No members found</p>
                                </div>
                            ) : (
                                filteredMembers.map(member => {
                                    const isOnline = connectedPeers.some(p => p.id === member.userId)
                                    const isSelected = selectedMember?.userId === member.userId
                                    const isMe = member.userId === useMemberStore.getState().userId

                                    return (
                                        <div
                                            key={member.userId}
                                            className={`mm-member-item ${isSelected ? 'selected' : ''} ${isMe ? 'is-me' : ''}`}
                                            onClick={() => setSelectedMember(member)}
                                        >
                                            <div className="mm-member-avatar">
                                                <User size={18} />
                                                <span className={`mm-status-dot ${isOnline ? 'online' : 'offline'}`} />
                                            </div>
                                            <div className="mm-member-info">
                                                <span className="mm-member-name">
                                                    {member.displayName}
                                                    {isMe && <span className="mm-you-badge">You</span>}
                                                </span>
                                                <span className={`mm-member-role role-${member.role}`}>
                                                    {getRoleIcon(member.role)}
                                                    {member.role}
                                                </span>
                                            </div>
                                            <ChevronRight size={16} className="mm-chevron" />
                                        </div>
                                    )
                                })
                            )
                        ) : (
                            // Banned List
                            bannedUserIds.length === 0 ? (
                                <div className="mm-empty">
                                    <CheckCircle size={40} />
                                    <p>No banned users</p>
                                    <span>All clear!</span>
                                </div>
                            ) : (
                                bannedUserIds.map(userId => (
                                    <div key={userId} className="mm-member-item banned-item">
                                        <div className="mm-member-avatar banned">
                                            <Ban size={18} />
                                        </div>
                                        <div className="mm-member-info">
                                            <span className="mm-member-name banned">
                                                {userId.slice(0, 12)}...
                                            </span>
                                            <span className="mm-member-role role-banned">
                                                <XCircle size={12} />
                                                Banned
                                            </span>
                                        </div>
                                        <button
                                            className="mm-unban-btn"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setConfirmAction('unban')
                                                setSelectedMember({
                                                    userId,
                                                    displayName: 'Banned User',
                                                    role: 'member',
                                                    permissions: {} as any,
                                                    joinedAt: 0,
                                                    isOnline: false,
                                                    isBanned: true
                                                })
                                            }}
                                        >
                                            <Unlock size={14} />
                                            Unban
                                        </button>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                </div>

                {/* RIGHT: Details Panel */}
                <div className="mm-detail-panel">
                    {selectedMember && viewMode === 'active' ? (
                        <div className="mm-detail-content">
                            {/* Member Header */}
                            <div className="mm-detail-header">
                                <div className="mm-detail-avatar">
                                    <User size={28} />
                                </div>
                                <div className="mm-detail-info">
                                    <h3>{selectedMember.displayName}</h3>
                                    <span className={`mm-detail-role role-${selectedMember.role}`}>
                                        {getRoleIcon(selectedMember.role)}
                                        {selectedMember.role}
                                    </span>
                                </div>
                                {isAdmin && canKick(myRole, selectedMember.role) && selectedMember.userId !== useMemberStore.getState().userId && (
                                    <div className="mm-detail-actions">
                                        <button
                                            className="mm-action-btn kick"
                                            onClick={() => setConfirmAction('kick')}
                                            title="Remove from workspace"
                                        >
                                            <LogOut size={16} />
                                        </button>
                                        {canBan(myRole, selectedMember.role) && (
                                            <button
                                                className="mm-action-btn ban"
                                                onClick={() => setConfirmAction('ban')}
                                                title="Ban user"
                                            >
                                                <Ban size={16} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Confirmation Dialog */}
                            {confirmAction && (
                                <div className="mm-confirm-dialog">
                                    <div className="mm-confirm-icon">
                                        {confirmAction === 'kick' ? <LogOut size={24} /> : <Ban size={24} />}
                                    </div>
                                    <h4>{confirmAction === 'kick' ? 'Remove Member?' : 'Ban Member?'}</h4>
                                    <p>
                                        {confirmAction === 'kick'
                                            ? `${selectedMember.displayName} will be removed from this workspace.`
                                            : `${selectedMember.displayName} will be permanently banned.`}
                                    </p>
                                    {confirmAction === 'ban' && (
                                        <input
                                            type="text"
                                            className="mm-ban-reason"
                                            placeholder="Reason for ban (optional)"
                                            value={banReason}
                                            onChange={e => setBanReason(e.target.value)}
                                            autoFocus
                                        />
                                    )}
                                    <div className="mm-confirm-actions">
                                        <button className="mm-btn secondary" onClick={() => setConfirmAction(null)}>
                                            Cancel
                                        </button>
                                        <button
                                            className="mm-btn danger"
                                            onClick={() => confirmAction === 'kick' ? handleKick(selectedMember) : handleBan(selectedMember)}
                                        >
                                            {confirmAction === 'kick' ? 'Remove' : 'Ban'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!confirmAction && (
                                <>
                                    {/* Role Selection */}
                                    <div className="mm-section">
                                        <div className="mm-section-header">
                                            <ShieldCheck size={16} />
                                            <h4>Access Level</h4>
                                        </div>
                                        <div className="mm-role-grid">
                                            {(['admin', 'member', 'viewer'] as WorkspaceRole[]).map(role => {
                                                const canChange = isAdmin && canKick(myRole, selectedMember.role) && selectedMember.role !== 'owner'
                                                const isActive = selectedMember.role === role

                                                return (
                                                    <button
                                                        key={role}
                                                        className={`mm-role-card ${isActive ? 'active' : ''} ${!canChange ? 'disabled' : ''}`}
                                                        onClick={() => canChange && handleRoleChange(selectedMember.userId, role)}
                                                        disabled={!canChange}
                                                    >
                                                        <div className="mm-role-icon">
                                                            {getRoleIcon(role)}
                                                        </div>
                                                        <span className="mm-role-name">{role}</span>
                                                        <span className="mm-role-desc">{getRoleDescription(role)}</span>
                                                        {isActive && <CheckCircle size={14} className="mm-role-check" />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Permissions */}
                                    <div className="mm-section">
                                        <div className="mm-section-header">
                                            <Settings size={16} />
                                            <h4>Permissions</h4>
                                        </div>
                                        <div className="mm-permissions">
                                            <PermissionRow
                                                icon={<Edit2 size={16} />}
                                                label="Edit Documents"
                                                description="Create and modify files"
                                                active={selectedMember.permissions.canEdit}
                                                disabled={!isAdmin || !canKick(myRole, selectedMember.role)}
                                                onChange={(v) => handlePermissionToggle(selectedMember.userId, 'canEdit', v)}
                                            />
                                            <PermissionRow
                                                icon={<Bot size={16} />}
                                                label="Use AI Agent"
                                                description="Access AI assistance"
                                                active={selectedMember.permissions.canUseAgent}
                                                disabled={!isAdmin || !canKick(myRole, selectedMember.role)}
                                                onChange={(v) => handlePermissionToggle(selectedMember.userId, 'canUseAgent', v)}
                                            />
                                            <PermissionRow
                                                icon={<MessageSquare size={16} />}
                                                label="Send Messages"
                                                description="Chat with team members"
                                                active={selectedMember.permissions.canChat}
                                                disabled={!isAdmin || !canKick(myRole, selectedMember.role)}
                                                onChange={(v) => handlePermissionToggle(selectedMember.userId, 'canChat', v)}
                                            />
                                            <PermissionRow
                                                icon={<FileText size={16} />}
                                                label="Manage Files"
                                                description="Upload and delete files"
                                                active={selectedMember.permissions.canManageFiles}
                                                disabled={!isAdmin || !canKick(myRole, selectedMember.role)}
                                                onChange={(v) => handlePermissionToggle(selectedMember.userId, 'canManageFiles', v)}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : viewMode === 'banned' && confirmAction === 'unban' && selectedMember ? (
                        <div className="mm-detail-content">
                            <div className="mm-confirm-dialog unban">
                                <div className="mm-confirm-icon success">
                                    <Unlock size={24} />
                                </div>
                                <h4>Unban User?</h4>
                                <p>This user will be able to join the workspace again.</p>
                                <div className="mm-confirm-actions">
                                    <button className="mm-btn secondary" onClick={() => setConfirmAction(null)}>
                                        Cancel
                                    </button>
                                    <button
                                        className="mm-btn primary"
                                        onClick={() => handleUnban(selectedMember.userId)}
                                    >
                                        <Unlock size={14} />
                                        Unban User
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Invite Section
                        <div className="mm-invite-panel">
                            <div className="mm-invite-header">
                                <div className="mm-invite-icon">
                                    <UserPlus size={32} />
                                </div>
                                <h3>Invite Collaborators</h3>
                                <p>Share this Space ID with people you want to invite. They can join through P2P connection.</p>
                            </div>

                            <div className="mm-invite-code">
                                <span className="mm-invite-label">Space ID</span>
                                <div className="mm-invite-value" onClick={copySpaceId}>
                                    <code>{spaceId}</code>
                                    <button className={`mm-copy-btn ${copied ? 'copied' : ''}`}>
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button className="mm-btn primary full" onClick={copySpaceId}>
                                {copied ? (
                                    <>
                                        <Check size={16} />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Share2 size={16} />
                                        Copy Invite Link
                                    </>
                                )}
                            </button>

                            <div className="mm-invite-info">
                                <AlertTriangle size={14} />
                                <span>Members join via P2P - ensure they're on a compatible network or have TURN servers configured.</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function PermissionRow({
    icon,
    label,
    description,
    active,
    disabled,
    onChange
}: {
    icon: React.ReactNode
    label: string
    description: string
    active: boolean
    disabled: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div
            className={`mm-permission-row ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onChange(!active)}
        >
            <div className="mm-permission-icon">{icon}</div>
            <div className="mm-permission-info">
                <span className="mm-permission-label">{label}</span>
                <span className="mm-permission-desc">{description}</span>
            </div>
            <div className={`mm-permission-toggle ${active ? 'on' : 'off'}`}>
                <div className="mm-toggle-thumb" />
            </div>
        </div>
    )
}
