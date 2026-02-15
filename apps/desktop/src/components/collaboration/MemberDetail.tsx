/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import {
  User,
  Crown,
  Shield,
  Eye,
  LogOut,
  Ban,
  MessageSquare,
  Edit3,
  Bot,
  FileText,
  AlertTriangle,
  Unlock
} from 'lucide-react'
import type { WorkspaceMember, WorkspaceRole, MemberPermissions } from '../../types/permissions'
import { canKick, canBan, canManageRole } from '../../types/permissions'

interface MemberDetailProps {
  member: WorkspaceMember
  currentUserRole: WorkspaceRole
  isCurrentUser: boolean
  onRoleChange: (role: WorkspaceRole) => void
  onPermissionChange: (permissions: Partial<MemberPermissions>) => void
  onKick: () => void
  onBan: (reason?: string) => void
  onUnban?: () => void
  onMessage?: () => void
}

const ROLE_ICONS: Record<WorkspaceRole, typeof User> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye
}

const ROLE_INFO: Record<WorkspaceRole, { label: string; description: string; color: string }> = {
  owner: { 
    label: 'Owner', 
    description: 'Full control over workspace',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  },
  admin: { 
    label: 'Admin', 
    description: 'Can manage members and settings',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
  },
  member: { 
    label: 'Member', 
    description: 'Can edit and collaborate',
    color: 'text-neutral-300 bg-neutral-700/50 border-white/5'
  },
  viewer: { 
    label: 'Viewer', 
    description: 'Read-only access',
    color: 'text-neutral-400 bg-neutral-800/50 border-white/5'
  }
}

export default function MemberDetail({
  member,
  currentUserRole,
  isCurrentUser,
  onRoleChange,
  onPermissionChange,
  onKick,
  onBan,
  onUnban,
  onMessage
}: MemberDetailProps) {
  const [showKickConfirm, setShowKickConfirm] = useState(false)
  const [showBanConfirm, setShowBanConfirm] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [activeSection, setActiveSection] = useState<'overview' | 'permissions'>('overview')

  const canManage = canManageRole(currentUserRole, member.role) && !isCurrentUser
  const canKickUser = canKick(currentUserRole, member.role) && !isCurrentUser
  const canBanUser = canBan(currentUserRole, member.role) && !isCurrentUser
  const RoleIcon = ROLE_ICONS[member.role]
  const roleInfo = ROLE_INFO[member.role]

  const handleRoleChange = (newRole: WorkspaceRole) => {
    if (newRole !== member.role) {
      onRoleChange(newRole)
    }
  }

  const handleBan = () => {
    onBan(banReason.trim() || undefined)
    setShowBanConfirm(false)
    setBanReason('')
  }

  if (member.isBanned) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <Ban size={32} className="text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Banned User</h3>
        <p className="text-sm text-neutral-400 mb-6">
          This user has been banned from the workspace.
        </p>
        {onUnban && canBanUser && (
          <button
            onClick={onUnban}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            <Unlock size={16} />
            Unban User
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border-2 border-white/10">
            <User size={28} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-white mb-1 truncate">
              {member.displayName}
            </h3>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleInfo.color}`}>
              <RoleIcon size={12} />
              {roleInfo.label}
            </span>
          </div>
        </div>

        {/* Join date */}
        <div className="mt-4 text-xs text-neutral-500">
          Joined {new Date(member.joinedAt).toLocaleDateString()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveSection('overview')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeSection === 'overview'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveSection('permissions')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeSection === 'permissions'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Permissions
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'overview' ? (
          <div className="space-y-6">
            {/* Role Selection (admin only) */}
            {canManage && (
              <div>
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                  Role
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(['admin', 'member', 'viewer'] as WorkspaceRole[]).map((role) => {
                    const info = ROLE_INFO[role]
                    const isActive = member.role === role
                    return (
                      <button
                        key={role}
                        onClick={() => handleRoleChange(role)}
                        disabled={!canManage}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isActive
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className={`text-sm font-medium mb-1 ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                          {info.label}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {info.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Actions
              </h4>
              <div className="flex flex-wrap gap-2">
                {onMessage && !isCurrentUser && (
                  <button
                    onClick={onMessage}
                    className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors text-sm"
                  >
                    <MessageSquare size={14} />
                    Message
                  </button>
                )}
                
                {canKickUser && (
                  <button
                    onClick={() => setShowKickConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg transition-colors text-sm"
                  >
                    <LogOut size={14} />
                    Remove
                  </button>
                )}
                
                {canBanUser && (
                  <button
                    onClick={() => setShowBanConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-sm"
                  >
                    <Ban size={14} />
                    Ban
                  </button>
                )}
              </div>
            </div>

            {/* Kick Confirmation */}
            {showKickConfirm && (
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white mb-3">
                      Remove <strong>{member.displayName}</strong> from this workspace?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowKickConfirm(false)}
                        className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { onKick(); setShowKickConfirm(false); }}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ban Confirmation */}
            {showBanConfirm && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Ban size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white mb-3">
                      Ban <strong>{member.displayName}</strong> from this workspace?
                    </p>
                    <input
                      type="text"
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full bg-black/20 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 mb-3 focus:outline-none focus:border-red-500/50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowBanConfirm(false); setBanReason(''); }}
                        className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBan}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition-colors"
                      >
                        Ban User
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Permission Toggles */}
            <PermissionToggle
              icon={<Edit3 size={16} />}
              label="Edit Documents"
              description="Create and modify files"
              active={member.permissions.canEdit}
              disabled={!canManage}
              onChange={(v) => onPermissionChange({ canEdit: v })}
            />
            <PermissionToggle
              icon={<Bot size={16} />}
              label="Use AI Agent"
              description="Access AI assistance"
              active={member.permissions.canUseAgent}
              disabled={!canManage}
              onChange={(v) => onPermissionChange({ canUseAgent: v })}
            />
            <PermissionToggle
              icon={<MessageSquare size={16} />}
              label="Send Messages"
              description="Chat with team members"
              active={member.permissions.canChat}
              disabled={!canManage}
              onChange={(v) => onPermissionChange({ canChat: v })}
            />
            <PermissionToggle
              icon={<FileText size={16} />}
              label="Manage Files"
              description="Upload and delete files"
              active={member.permissions.canManageFiles}
              disabled={!canManage}
              onChange={(v) => onPermissionChange({ canManageFiles: v })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Permission Toggle Component
function PermissionToggle({
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
  onChange: (value: boolean) => void
}) {
  return (
    <div
      className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
        disabled ? 'opacity-50' : 'hover:bg-white/5 cursor-pointer'
      }`}
      onClick={() => !disabled && onChange(!active)}
    >
      <div className={`p-2 rounded-lg ${
        active ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-neutral-500'
      }`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
      <div className={`w-11 h-6 rounded-full relative transition-colors ${
        active ? 'bg-green-500' : 'bg-neutral-600'
      }`}>
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </div>
    </div>
  )
}
