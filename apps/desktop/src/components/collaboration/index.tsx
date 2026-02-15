/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { X, Users, UserPlus, LogIn, Activity, Radio } from 'lucide-react'
import { useCollaboration } from './hooks/useCollaboration'
import MemberList from './MemberList'
import MemberDetail from './MemberDetail'
import InviteSection from './InviteSection'
import JoinSection from './JoinSection'
import ActivityFeed from './ActivityFeed'
import type { CollaborationTab } from './types'

interface CollaborationPanelProps {
  onClose: () => void
  spaceId?: string
}

const TABS: { id: CollaborationTab; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invite', label: 'Invite', icon: UserPlus },
  { id: 'join', label: 'Join', icon: LogIn },
  { id: 'activity', label: 'Activity', icon: Activity }
]

export default function CollaborationPanel({ onClose, spaceId }: CollaborationPanelProps) {
  const {
    // State
    activeTab,
    selectedMemberId,
    searchQuery,
    showOfflineMembers,
    connectionStatus,
    members,
    filteredMembers,
    selectedMember,
    peers,
    activities,
    isJoining,
    joinError,
    myRole,
    isAdmin: _isAdmin,
    currentUserId,
    currentUserName: _currentUserName,
    
    // Actions
    setActiveTab,
    setSelectedMemberId,
    setSearchQuery,
    setShowOfflineMembers,
    clearActivities,
    
    // Member actions
    handleRoleChange,
    handlePermissionChange,
    handleKick,
    handleBan,
    handleUnban,
    
    // Invite
    generateInviteLink,
    
    // Join
    handleJoin,
    
    // Connection
    testConnection: _testConnection,
    reconnect: _reconnect
  } = useCollaboration(spaceId)

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId === selectedMemberId ? null : memberId)
  }

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[1000px] max-w-[95vw] h-[750px] max-h-[90vh] bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-800/50 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <Users size={22} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Team & Collaboration</h2>
              <p className="text-xs text-neutral-500">
                Manage members, invites, and connections
              </p>
            </div>
          </div>
          
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'activity' 
                  ? 'bg-white/10 text-white' 
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Activity size={14} />
              {activities.length} events
            </button>
            
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              connectionStatus.status === 'connected'
                ? 'bg-green-500/10 text-green-400'
                : connectionStatus.status === 'connecting'
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              <Radio size={14} className={connectionStatus.status === 'connecting' ? 'animate-pulse' : ''} />
              {connectionStatus.status === 'connected' 
                ? `${connectionStatus.peerCount} peers`
                : connectionStatus.status}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-64 bg-neutral-800/30 border-r border-white/5 flex flex-col">
            <nav className="p-3 space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSelectedMemberId(null)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="font-medium">{tab.label}</span>
                    {tab.id === 'activity' && activities.length > 0 && (
                      <span className="ml-auto text-[10px] bg-white/10 px-2 py-0.5 rounded-full">
                        {activities.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Connection Quick View */}
            <div className="mt-auto p-4 border-t border-white/5">
              <div className="bg-white/5 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Connection
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Status</span>
                    <span className={`capitalize ${
                      connectionStatus.status === 'connected' 
                        ? 'text-green-400' 
                        : 'text-neutral-400'
                    }`}>
                      {connectionStatus.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Peers</span>
                    <span className="text-neutral-300">{connectionStatus.peerCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Latency</span>
                    <span className={`${
                      connectionStatus.latencyMs < 100 
                        ? 'text-green-400' 
                        : connectionStatus.latencyMs < 300 
                        ? 'text-yellow-400' 
                        : 'text-neutral-400'
                    }`}>
                      {connectionStatus.latencyMs > 0 
                        ? `${connectionStatus.latencyMs}ms` 
                        : '--'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('join')}
                  className="w-full mt-3 py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Details →
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {activeTab === 'members' && (
              <>
                {/* Member List */}
                <div className="w-[380px] border-r border-white/5">
                  <MemberList
                    members={filteredMembers}
                    peers={peers}
                    selectedMemberId={selectedMemberId}
                    currentUserId={currentUserId}
                    searchQuery={searchQuery}
                    showOffline={showOfflineMembers}
                    onSelectMember={handleSelectMember}
                    onSearchChange={setSearchQuery}
                    onToggleOffline={() => setShowOfflineMembers(!showOfflineMembers)}
                  />
                </div>

                {/* Member Detail */}
                <div className="flex-1 bg-neutral-800/20">
                  {selectedMember ? (
                    <MemberDetail
                      member={selectedMember}
                      currentUserRole={myRole}
                      isCurrentUser={selectedMember.userId === currentUserId}
                      onRoleChange={(role) => handleRoleChange(selectedMember.userId, role)}
                      onPermissionChange={(perms) => handlePermissionChange(selectedMember.userId, perms)}
                      onKick={() => handleKick(selectedMember.userId)}
                      onBan={(reason) => handleBan(selectedMember.userId, reason)}
                      onUnban={selectedMember.isBanned ? () => handleUnban(selectedMember.userId) : undefined}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-500">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <Users size={40} className="opacity-20" />
                      </div>
                      <p className="text-sm font-medium text-neutral-400">
                        Select a member to view details
                      </p>
                      <p className="text-xs text-neutral-600 mt-1">
                        Manage roles, permissions, and status
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'invite' && spaceId && (
              <div className="flex-1">
                <InviteSection
                  spaceId={spaceId}
                  onGenerateLink={generateInviteLink}
                />
              </div>
            )}

            {activeTab === 'join' && (
              <div className="flex-1">
                <JoinSection
                  onJoin={handleJoin}
                  isJoining={isJoining}
                  error={joinError}
                />
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="flex-1">
                <ActivityFeed
                  activities={activities}
                  members={members}
                  onClear={clearActivities}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export types and hooks
export { useCollaboration }
export type { CollaborationTab, ActivityItem, ConnectionDiagnostics } from './types'
