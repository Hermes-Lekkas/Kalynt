/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import {
  UserPlus,
  UserMinus,
  MessageSquare,
  FileEdit,
  CheckSquare,
  Shield,
  Ban,
  LogOut,
  Trash2,
  Clock,
  Filter
} from 'lucide-react'
import type { ActivityItem } from './types'
import type { WorkspaceMember } from '../../types/permissions'

interface ActivityFeedProps {
  activities: ActivityItem[]
  members: WorkspaceMember[]
  maxItems?: number
  onClear: () => void
}

type ActivityType = ActivityItem['type']

const ACTIVITY_ICONS: Record<ActivityType, typeof UserPlus> = {
  join: UserPlus,
  leave: UserMinus,
  chat: MessageSquare,
  edit: FileEdit,
  file: FileEdit,
  task: CheckSquare,
  permission: Shield,
  ban: Ban,
  kick: LogOut
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  join: 'text-green-400 bg-green-500/10',
  leave: 'text-neutral-400 bg-neutral-500/10',
  chat: 'text-blue-400 bg-blue-500/10',
  edit: 'text-yellow-400 bg-yellow-500/10',
  file: 'text-purple-400 bg-purple-500/10',
  task: 'text-cyan-400 bg-cyan-500/10',
  permission: 'text-amber-400 bg-amber-500/10',
  ban: 'text-red-400 bg-red-500/10',
  kick: 'text-orange-400 bg-orange-500/10'
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  join: 'Joined',
  leave: 'Left',
  chat: 'Message',
  edit: 'Edited',
  file: 'File',
  task: 'Task',
  permission: 'Permission',
  ban: 'Banned',
  kick: 'Removed'
}

export default function ActivityFeed({
  activities,
  members,
  maxItems = 50,
  onClear
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const filteredActivities = activities
    .filter(a => filter === 'all' || a.type === filter)
    .slice(0, maxItems)

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    // Less than a minute
    if (diff < 60000) {
      return 'Just now'
    }
    
    // Less than an hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000)
      return `${mins}m ago`
    }
    
    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `${hours}h ago`
    }
    
    // Default to date
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const getUserDisplayName = (userId: string, userName?: string) => {
    if (userName) return userName
    const member = members.find(m => m.userId === userId)
    return member?.displayName || userId.slice(0, 8) + '...'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-neutral-400" />
          <span className="text-sm font-medium text-neutral-300">Activity</span>
          <span className="text-xs text-neutral-500">({filteredActivities.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg transition-colors ${
              showFilters ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title="Filter activities"
          >
            <Filter size={14} />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg transition-colors"
            title="Clear activity feed"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-white/5 bg-white/5">
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
            />
            <FilterButton
              active={filter === 'join'}
              onClick={() => setFilter('join')}
              label="Joins"
              color="green"
            />
            <FilterButton
              active={filter === 'edit'}
              onClick={() => setFilter('edit')}
              label="Edits"
              color="yellow"
            />
            <FilterButton
              active={filter === 'permission'}
              onClick={() => setFilter('permission')}
              label="Roles"
              color="amber"
            />
            <FilterButton
              active={filter === 'ban'}
              onClick={() => setFilter('ban')}
              label="Bans"
              color="red"
            />
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto py-2">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-500">
            <Clock size={32} className="opacity-20 mb-2" />
            <p className="text-xs">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {filteredActivities.map((activity) => {
              const Icon = ACTIVITY_ICONS[activity.type]
              const colors = ACTIVITY_COLORS[activity.type]
              const label = ACTIVITY_LABELS[activity.type]

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  {/* Icon */}
                  <div className={`p-2 rounded-lg flex-shrink-0 ${colors}`}>
                    <Icon size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-neutral-300">
                        {getUserDisplayName(activity.userId, activity.userName)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors}`}>
                        {label}
                      </span>
                    </div>
                    
                    {activity.details && (
                      <p className="text-sm text-neutral-400 mt-0.5">
                        {activity.details}
                      </p>
                    )}
                    
                    <span className="text-[10px] text-neutral-600 mt-1">
                      {formatTime(activity.timestamp)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Filter Button Component
function FilterButton({
  active,
  onClick,
  label,
  color = 'neutral'
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: 'neutral' | 'green' | 'yellow' | 'amber' | 'red' | 'blue'
}) {
  const colorClasses = {
    neutral: 'bg-white/10 text-white',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400',
    blue: 'bg-blue-500/20 text-blue-400'
  }

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? colorClasses[color]
          : 'bg-white/5 text-neutral-400 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}
