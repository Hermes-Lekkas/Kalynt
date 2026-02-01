/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, X } from 'lucide-react'

interface TerminalSearchProps {
    searchAddon: any // SearchAddon
    onClose: () => void
}

export const TerminalSearch: React.FC<TerminalSearchProps> = ({ searchAddon, onClose }) => {
    const [term, setTerm] = useState('')

    useEffect(() => {
        if (!searchAddon) return
        if (term) {
            searchAddon.findNext(term)
        }
    }, [term, searchAddon])

    const findNext = () => searchAddon?.findNext(term)
    const findPrevious = () => searchAddon?.findPrevious(term)

    return (
        <div style={{
            position: 'absolute',
            top: '48px',
            right: '16px',
            zIndex: 10,
            background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%)',
            backdropFilter: 'blur(16px)',
            padding: '8px',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: '1px solid rgba(139, 92, 246, 0.2)'
        }}>
            <input
                autoFocus
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Find..."
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        if (e.shiftKey) {
                            findPrevious()
                        } else {
                            findNext()
                        }
                    }
                    if (e.key === 'Escape') onClose()
                }}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: '#e4e4e7',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    outline: 'none',
                    fontSize: '13px',
                    width: '180px',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease'
                }}
            />
            <button
                onClick={findPrevious}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#a1a1aa',
                    padding: '6px',
                    display: 'flex',
                    transition: 'all 0.15s ease'
                }}
                title="Previous (Shift+Enter)"
                onMouseOver={(e) => e.currentTarget.style.color = '#a78bfa'}
                onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
            >
                <ArrowUp size={16} />
            </button>
            <button
                onClick={findNext}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#a1a1aa',
                    padding: '6px',
                    display: 'flex',
                    transition: 'all 0.15s ease'
                }}
                title="Next (Enter)"
                onMouseOver={(e) => e.currentTarget.style.color = '#a78bfa'}
                onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
            >
                <ArrowDown size={16} />
            </button>
            <button
                onClick={onClose}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#a1a1aa',
                    padding: '6px',
                    display: 'flex',
                    transition: 'all 0.15s ease'
                }}
                title="Close (Escape)"
                onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                onMouseOut={(e) => e.currentTarget.style.color = '#a1a1aa'}
            >
                <X size={16} />
            </button>
        </div>
    )
}
