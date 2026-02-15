/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { User, Crown, Shield, Eye, Search, Users, Wifi, WifiOff, ChevronRight, Filter } from 'lucide-react'
import type { WorkspaceMember, WorkspaceRole } from '../../types/permissions'
import type { Peer } from '../../stores/appStore'

interface MemberListProps {
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

const ROLE_ICONS: Record<WorkspaceRole, typeof User> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  owner: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  admin: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  member: 'text-neutral-300 bg-neutral-700/50 border-white/5',
  viewer: 'text-neutral-400 bg-neutral-800/50 border-white/5'
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer'
}

export default function MemberList({
  members,
  peers: _peers,
  selectedMemberId,
  currentUserId,
  searchQuery,
  showOffline,
  onSelectMember,
  onSearchChange,
  onToggleOffline
}: MemberListProps) {
  const onlineCount = members.filter(m => m.isOnline).length
  
  return (
    <div className="flex flex-col h-full">
      {/* Header Stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-neutral-400" />
          <span className="text-sm text-neutral-300">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-neutral-500">
            ({onlineCount} online)
          </span>
        </div>
        <button
          onClick={onToggleOffline}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
            showOffline 
              ? 'bg-white/10 text-neutral-300' 
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
          title={showOffline ? 'Hide offline members' : 'Show offline members'}
        >
          <Filter size={12} />
          {showOffline ? 'Showing all' : 'Online only'}
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-white/5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search members..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Member List */}
      <div className="flex-1 overflow-y-auto py-2">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-500">
            <Users size={32} className="opacity-20 mb-2" />
            <p className="text-xs">No members found</p>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {members.map((member) => {
              const isSelected = selectedMemberId === member.userId
              const isCurrentUser = member.userId === currentUserId
              const isOnline = member.isOnline
              const RoleIcon = ROLE_ICONS[member.role]

              return (
                <button
                  key={member.userId}
                  onClick={() => onSelectMember(member.userId)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'border border-transparent hover:bg-white/5'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center border border-white/10">
                      <User size={18} className="text-neutral-400" />
                    </div>
                    {/* Online indicator */}
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${
                      isOnline ? 'bg-green-500' : 'bg-neutral-600'
                    }`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${
                        isSelected ? 'text-white' : 'text-neutral-200'
                      }`}>
                        {member.displayName}
                      </span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                          You
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Role Badge */}
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${ROLE_COLORS[member.role]}`}>
                        <RoleIcon size={10} />
                        {ROLE_LABELS[member.role]}
                      </span>
                      
                      {/* Online status */}
                      <span className={`text-[10px] flex items-center gap-1 ${
                        isOnline ? 'text-green-400' : 'text-neutral-500'
                      }`}>
                        {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight size={16} className={`text-neutral-600 transition-transform ${
                    isSelected ? 'translate-x-0.5 text-blue-400' : ''
                  }`} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
