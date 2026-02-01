/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React from 'react'
import { ContextMenuState } from './types'
import { Copy, ClipboardPaste, Trash2 } from 'lucide-react'

interface TerminalContextMenuProps {
    contextMenu: ContextMenuState
    onCopy: () => void
    onPaste: () => void
    onClear: () => void
}

export const TerminalContextMenu: React.FC<TerminalContextMenuProps> = ({
    contextMenu,
    onCopy,
    onPaste,
    onClear
}) => {
    if (!contextMenu.visible) return null

    const menuItemStyle: React.CSSProperties = {
        padding: '10px 14px',
        cursor: 'pointer',
        color: '#e4e4e7',
        fontSize: '13px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderRadius: '6px',
        margin: '2px 4px',
        transition: 'all 0.15s ease'
    }

    return (
        <div style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 100,
            background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.98) 0%, rgba(0, 0, 0, 0.99) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '12px',
            padding: '6px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03)',
            minWidth: '180px'
        }}>
            <div
                onClick={onCopy}
                style={menuItemStyle}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'
                    e.currentTarget.style.color = '#a78bfa'
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#e4e4e7'
                }}
            >
                <Copy size={16} />
                <span>Copy</span>
                <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '11px' }}>Ctrl+C</span>
            </div>
            <div
                onClick={onPaste}
                style={menuItemStyle}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'
                    e.currentTarget.style.color = '#a78bfa'
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#e4e4e7'
                }}
            >
                <ClipboardPaste size={16} />
                <span>Paste</span>
                <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '11px' }}>Ctrl+V</span>
            </div>
            <div style={{
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent)',
                margin: '6px 8px'
            }} />
            <div
                onClick={onClear}
                style={menuItemStyle}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(248, 113, 113, 0.15)'
                    e.currentTarget.style.color = '#f87171'
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#e4e4e7'
                }}
            >
                <Trash2 size={16} />
                <span>Clear Terminal</span>
                <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '11px' }}>Ctrl+K</span>
            </div>
        </div>
    )
}
