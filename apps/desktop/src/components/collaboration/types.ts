/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Collaboration Panel Types

import type { WorkspaceMember, WorkspaceRole, MemberPermissions } from '../../types/permissions'
import type { Peer } from '../../stores/appStore'
import type { P2PStats, PeerInfo } from '../../services/p2pService'

export type CollaborationTab = 'members' | 'invite' | 'join' | 'activity'

export interface ConnectionDiagnostics {
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
  peerCount: number
  signalingState: string
  iceServers: number
  turnEnabled: boolean
  latencyMs: number
  bytesReceived: number
  bytesSent: number
}

export interface ActivityItem {
  id: string
  type: 'join' | 'leave' | 'edit' | 'chat' | 'file' | 'task' | 'permission' | 'kick' | 'ban'
  userId: string
  userName: string
  timestamp: number
  details?: string
  metadata?: Record<string, unknown>
}

export interface InviteLink {
  url: string
  code: string
  expiresAt?: number
  maxUses?: number
  useCount: number
}

export interface CollaborationState {
  // UI State
  activeTab: CollaborationTab
  selectedMemberId: string | null
  searchQuery: string
  showOfflineMembers: boolean
  
  // Connection State
  connectionStatus: ConnectionDiagnostics
  p2pStats: P2PStats | null
  
  // Data
  members: WorkspaceMember[]
  peers: PeerInfo[]
  activity: ActivityItem[]
  inviteLinks: InviteLink[]
  
  // Actions
  setActiveTab: (tab: CollaborationTab) => void
  selectMember: (memberId: string | null) => void
  setSearchQuery: (query: string) => void
  setShowOfflineMembers: (show: boolean) => void
  addActivity: (activity: ActivityItem) => void
  updateConnectionStatus: (status: Partial<ConnectionDiagnostics>) => void
}

export interface MemberListProps {
  members: WorkspaceMember[]
  peers: Peer[]
  selectedMemberId: string | null
  currentUserId: string
  searchQuery: string
  showOffline: boolean
  onSelectMember: (memberId: string) => void
  onSearchChange: (query: string) => void
  onToggleOffline: () => void
}

export interface MemberDetailProps {
  member: WorkspaceMember
  currentUserRole: WorkspaceRole
  isCurrentUser: boolean
  onRoleChange: (role: WorkspaceRole) => void
  onPermissionChange: (permissions: Partial<MemberPermissions>) => void
  onKick: () => void
  onBan: (reason?: string) => void
  onMessage?: () => void
}

export interface InviteSectionProps {
  spaceId: string
  spaceName?: string
  inviteLinks: InviteLink[]
  onGenerateLink: (options?: { expiresIn?: number; maxUses?: number }) => void
  onRevokeLink: (linkId: string) => void
  onCopyLink: (url: string) => void
}

export interface JoinSectionProps {
  onJoin: (input: string, password?: string) => Promise<void>
  isJoining: boolean
  error: string | null
}

export interface ConnectionStatusProps {
  status: ConnectionDiagnostics
  onTestConnection: () => Promise<void>
  onReconnect: () => void
}

export interface ActivityFeedProps {
  activities: ActivityItem[]
  members: WorkspaceMember[]
  maxItems?: number
  onClear: () => void
}
