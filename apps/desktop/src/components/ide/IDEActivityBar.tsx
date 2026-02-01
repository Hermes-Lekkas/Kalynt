/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import { Files, Search, GitBranch, MessageSquare } from 'lucide-react'

interface IDEActivityBarProps {
    activePanel: string
    onPanelChange: (panel: 'files' | 'search' | 'git' | 'collaboration') => void
}

export const IDEActivityBar: React.FC<IDEActivityBarProps> = ({ activePanel, onPanelChange }) => {
    return (
        <div className="activity-bar">
            <button
                className={`activity-btn ${activePanel === 'files' ? 'active' : ''}`}
                onClick={() => onPanelChange('files')}
                title="Explorer"
            >
                <Files size={20} />
            </button>
            <button
                className={`activity-btn ${activePanel === 'search' ? 'active' : ''}`}
                onClick={() => onPanelChange('search')}
                title="Search"
            >
                <Search size={20} />
            </button>
            <button
                className={`activity-btn ${activePanel === 'git' ? 'active' : ''}`}
                onClick={() => onPanelChange('git')}
                title="Source Control"
            >
                <GitBranch size={20} />
            </button>
            <button
                className={`activity-btn ${activePanel === 'collaboration' ? 'active' : ''}`}
                onClick={() => onPanelChange('collaboration')}
                title="Team Collaboration"
            >
                <MessageSquare size={20} />
            </button>
        </div>
    )
}
