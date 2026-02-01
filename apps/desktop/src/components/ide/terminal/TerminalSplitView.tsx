/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { GripVertical, GripHorizontal, X, Maximize2 } from 'lucide-react'

interface SplitPaneProps {
    children: React.ReactNode[]
    direction: 'horizontal' | 'vertical'
    initialSizes?: number[] // percentages
    minSize?: number // pixels
    onClose?: (index: number) => void
}

export const TerminalSplitView: React.FC<SplitPaneProps> = ({
    children,
    direction,
    initialSizes,
    minSize = 100,
    onClose
}) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [sizes, setSizes] = useState<number[]>(
        initialSizes || children.map(() => 100 / children.length)
    )
    const [dragging, setDragging] = useState<number | null>(null)
    const [focusedPane, setFocusedPane] = useState(0)

    const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
        e.preventDefault()
        setDragging(index)
    }, [])

    useEffect(() => {
        if (dragging === null) return

        // PERFORMANCE FIX: Throttle resize calculations with requestAnimationFrame
        let rafId: number | null = null

        const handleMouseMove = (e: MouseEvent) => {
            if (rafId !== null) return // Skip if RAF already scheduled

            rafId = requestAnimationFrame(() => {
                rafId = null

                if (!containerRef.current) return

                const rect = containerRef.current.getBoundingClientRect()
                const totalSize = direction === 'horizontal' ? rect.width : rect.height
                const position = direction === 'horizontal'
                    ? e.clientX - rect.left
                    : e.clientY - rect.top

                const newSizes = [...sizes]
                let sumBefore = 0
                for (let i = 0; i < dragging; i++) {
                    sumBefore += (sizes[i] / 100) * totalSize
                }

                const newFirstSize = ((position - sumBefore) / totalSize) * 100
                const newSecondSize = sizes[dragging] + sizes[dragging + 1] - newFirstSize

                // Enforce minimum size
                const minPercent = (minSize / totalSize) * 100
                if (newFirstSize >= minPercent && newSecondSize >= minPercent) {
                    newSizes[dragging] = newFirstSize
                    newSizes[dragging + 1] = newSecondSize
                    setSizes(newSizes)
                }
            })
        }

        const handleMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            setDragging(null)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [dragging, sizes, direction, minSize])

    const isHorizontal = direction === 'horizontal'
    const GripIcon = isHorizontal ? GripVertical : GripHorizontal

    return (
        <div
            ref={containerRef}
            style={{
                display: 'flex',
                flexDirection: isHorizontal ? 'row' : 'column',
                height: '100%',
                width: '100%',
                position: 'relative'
            }}
        >
            {children.map((child, index) => (
                <React.Fragment key={index}>
                    {/* Pane */}
                    <div
                        onClick={() => setFocusedPane(index)}
                        style={{
                            [isHorizontal ? 'width' : 'height']: `${sizes[index]}%`,
                            minWidth: isHorizontal ? minSize : undefined,
                            minHeight: !isHorizontal ? minSize : undefined,
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            border: focusedPane === index
                                ? '1px solid rgba(139, 92, 246, 0.3)'
                                : '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            margin: '2px',
                            transition: 'border-color 0.2s ease',
                            boxShadow: focusedPane === index
                                ? '0 0 20px rgba(139, 92, 246, 0.1)'
                                : 'none'
                        }}
                    >
                        {/* Pane Header */}
                        <div style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            display: 'flex',
                            gap: '2px',
                            zIndex: 10,
                            opacity: 0,
                            transition: 'opacity 0.15s ease'
                        }}
                            className="pane-controls"
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    // Toggle maximize
                                }}
                                style={{
                                    background: 'rgba(24, 24, 27, 0.9)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    cursor: 'pointer',
                                    color: '#71717a',
                                    display: 'flex'
                                }}
                            >
                                <Maximize2 size={10} />
                            </button>
                            {children.length > 1 && onClose && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onClose(index)
                                    }}
                                    style={{
                                        background: 'rgba(24, 24, 27, 0.9)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        padding: '4px',
                                        cursor: 'pointer',
                                        color: '#71717a',
                                        display: 'flex'
                                    }}
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            {child}
                        </div>
                    </div>

                    {/* Divider */}
                    {index < children.length - 1 && (
                        <div
                            onMouseDown={(e) => handleMouseDown(index, e)}
                            style={{
                                [isHorizontal ? 'width' : 'height']: dragging === index ? '4px' : '2px',
                                [isHorizontal ? 'height' : 'width']: '100%',
                                background: dragging === index
                                    ? 'linear-gradient(180deg, #a78bfa, #60a5fa)'
                                    : 'rgba(255, 255, 255, 0.08)',
                                cursor: isHorizontal ? 'col-resize' : 'row-resize',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease',
                                flexShrink: 0,
                                borderRadius: '4px',
                                margin: isHorizontal ? '8px 0' : '0 8px'
                            }}
                            onMouseOver={(e) => {
                                if (dragging === null) {
                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.4)'
                                }
                            }}
                            onMouseOut={(e) => {
                                if (dragging === null) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                                }
                            }}
                        >
                            <GripIcon size={12} style={{ color: '#52525b', opacity: 0.5 }} />
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    )
}

// Inject hover styles
const style = document.createElement('style')
style.textContent = `
.pane-controls {
    opacity: 0;
}
div:hover > .pane-controls {
    opacity: 1;
}
`
if (typeof document !== 'undefined' && !document.getElementById('split-view-styles')) {
    style.id = 'split-view-styles'
    document.head.appendChild(style)
}
