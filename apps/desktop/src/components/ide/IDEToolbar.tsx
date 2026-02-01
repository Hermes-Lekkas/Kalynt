/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useRef, useEffect } from 'react'
import {
    Play,
    Square,
    Bug,
    Hammer,
    TerminalSquare,
    Bot,
    MoreVertical,
    ChevronDown,
    Check,
    Columns2,
    Command,
    Trash2,
    RefreshCw,
    Type,
    Map as MapIcon,
    ArrowDownWideNarrow,
    Info,
    StepForward,
    ArrowDownToLine,
    ArrowUpFromLine,
    Pause
} from 'lucide-react'

interface IDEToolbarProps {
    activeFileObj: { language: string } | null
    onRunCode: () => void
    onStopCode: () => void
    isRunning: boolean
    onDebugCode: () => void
    onStopDebug: () => void
    isDebugging: boolean
    onBuildCode: () => void
    onStopBuild: () => void
    isBuilding: boolean
    toggleAIPanel: () => void
    isAIAppOpen: boolean
    onToggleTerminal: () => void
    // Editor Settings
    wordWrap: 'on' | 'off'
    onToggleWordWrap: () => void
    minimapEnabled: boolean
    onToggleMinimap: () => void
    stickyScrollEnabled: boolean
    onToggleStickyScroll: () => void
    // Utility Actions
    onClearCache: () => void
    onReloadWindow: () => void
    onSplitEditor: () => void
    splitEditorEnabled: boolean
    onOpenCommandPalette: () => void
    onAboutKalynt: () => void
    // Debug Controls
    onDebugContinue?: () => void
    onDebugStepOver?: () => void
    onDebugStepInto?: () => void
    onDebugStepOut?: () => void
    onDebugPause?: () => void
}

export const IDEToolbar: React.FC<IDEToolbarProps> = ({
    activeFileObj,
    onRunCode,
    onStopCode,
    isRunning,
    onDebugCode,
    onStopDebug,
    isDebugging,
    onBuildCode,
    onStopBuild,
    isBuilding,
    toggleAIPanel,
    isAIAppOpen,
    onToggleTerminal,
    // Editor Settings
    wordWrap,
    onToggleWordWrap,
    minimapEnabled,
    onToggleMinimap,
    stickyScrollEnabled,
    onToggleStickyScroll,
    // Utility Actions
    onClearCache,
    onReloadWindow,
    onSplitEditor,
    onOpenCommandPalette,
    onAboutKalynt,
    // Debug Controls
    onDebugContinue,
    onDebugStepOver,
    onDebugStepInto,
    onDebugStepOut,
    onDebugPause
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Handle click outside to close menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isMenuOpen])

    return (
        <div className="editor-toolbar glass">
            {/* Left: Context / Breadcrumbs Placeholder */}
            <div className="toolbar-section left">
                {activeFileObj && (
                    <div className="file-context badge-glass">
                        <span className="file-lang-dot" style={{ backgroundColor: getLangColor(activeFileObj.language) }} />
                        <span className="file-language">{activeFileObj.language}</span>
                    </div>
                )}
            </div>

            {/* Center: Command Cluster */}
            <div className="toolbar-section center">
                <div className="command-cluster glass-panel">
                    <button
                        className={`toolbar-btn action-btn run-btn ${isRunning ? 'running' : ''}`}
                        onClick={isRunning ? onStopCode : onRunCode}
                        title={isRunning ? "Stop Execution" : "Run Code (F5)"}
                        disabled={!activeFileObj && !isRunning}
                    >
                        {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                        <span>{isRunning ? 'Stop' : 'Run'}</span>
                    </button>

                    <div className="divider-vertical" />

                    <button
                        className={`toolbar-btn action-btn debug-btn ${isDebugging ? 'debugging' : ''}`}
                        onClick={isDebugging ? onStopDebug : onDebugCode}
                        title={isDebugging ? "Stop Debugging" : "Debug (F9)"}
                        disabled={!activeFileObj && !isDebugging}
                    >
                        <Bug size={16} />
                    </button>

                    <button
                        className={`toolbar-btn action-btn build-btn ${isBuilding ? 'building' : ''}`}
                        onClick={isBuilding ? onStopBuild : onBuildCode}
                        title={isBuilding ? "Stop Build" : "Build Project (Ctrl+Shift+B)"}
                        disabled={isBuilding}
                    >
                        <Hammer size={16} />
                    </button>

                    <button className="toolbar-btn icon-only-btn dropdown-trigger">
                        <ChevronDown size={14} />
                    </button>
                </div>

                {/* Debug Toolbar - Only visible when debugging */}
                {isDebugging && (
                    <div className="debug-toolbar">
                        <button
                            className="debug-toolbar-btn continue"
                            onClick={onDebugContinue}
                            title="Continue (F5)"
                        >
                            <Play size={14} fill="currentColor" />
                        </button>
                        <button
                            className="debug-toolbar-btn"
                            onClick={onDebugStepOver}
                            title="Step Over (F10)"
                        >
                            <StepForward size={14} />
                        </button>
                        <button
                            className="debug-toolbar-btn"
                            onClick={onDebugStepInto}
                            title="Step Into (F11)"
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                        <button
                            className="debug-toolbar-btn"
                            onClick={onDebugStepOut}
                            title="Step Out (Shift+F11)"
                        >
                            <ArrowUpFromLine size={14} />
                        </button>
                        <button
                            className="debug-toolbar-btn"
                            onClick={onDebugPause}
                            title="Pause (F6)"
                        >
                            <Pause size={14} />
                        </button>
                        <div className="divider-vertical" />
                        <button
                            className="debug-toolbar-btn stop"
                            onClick={onStopDebug}
                            title="Stop Debugging (Shift+F5)"
                        >
                            <Square size={14} fill="currentColor" />
                        </button>
                    </div>
                )}
            </div>

            {/* Right: Tools & Toggles */}
            <div className="toolbar-section right">
                <button
                    className="toolbar-btn tool-btn icon-only-btn"
                    onClick={onToggleTerminal}
                    title="Toggle Terminal (Ctrl+`)"
                >
                    <TerminalSquare size={22} />
                </button>

                <button
                    className={`toolbar-btn tool-btn icon-only-btn ${isAIAppOpen ? 'active' : ''}`}
                    onClick={toggleAIPanel}
                    title="Toggle AI Assistant"
                >
                    <Bot size={22} />
                </button>

                <div className="dropdown-container" ref={menuRef}>
                    <button
                        className={`toolbar-btn icon-only-btn tool-btn ${isMenuOpen ? 'active' : ''}`}
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        title="More Actions"
                    >
                        <MoreVertical size={20} />
                    </button>

                    {isMenuOpen && (
                        <div className="toolbar-dropdown">
                            <div className="dropdown-section">
                                <button className="dropdown-item" onClick={() => { onToggleWordWrap(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix">
                                        {wordWrap === 'on' && <Check size={14} className="active-glow" />}
                                    </div>
                                    <div className="item-icon"><Type size={16} /></div>
                                    <span className="item-label">Toggle Word Wrap</span>
                                    <span className="item-shortcut">Alt+Z</span>
                                </button>

                                <button className="dropdown-item" onClick={() => { onToggleMinimap(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix">
                                        {minimapEnabled && <Check size={14} className="active-glow" />}
                                    </div>
                                    <div className="item-icon"><MapIcon size={16} /></div>
                                    <span className="item-label">Toggle Minimap</span>
                                </button>

                                <button className="dropdown-item" onClick={() => { onToggleStickyScroll(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix">
                                        {stickyScrollEnabled && <Check size={14} className="active-glow" />}
                                    </div>
                                    <div className="item-icon"><ArrowDownWideNarrow size={16} /></div>
                                    <span className="item-label">Toggle Sticky Scroll</span>
                                </button>
                            </div>

                            <div className="dropdown-divider" />

                            <div className="dropdown-section">
                                <button className="dropdown-item" onClick={() => { onSplitEditor(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix" />
                                    <div className="item-icon"><Columns2 size={16} /></div>
                                    <span className="item-label">Split Editor Right</span>
                                </button>

                                <button className="dropdown-item" onClick={() => { onOpenCommandPalette(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix" />
                                    <div className="item-icon"><Command size={16} /></div>
                                    <span className="item-label">Command Palette</span>
                                    <span className="item-shortcut">Ctrl+Shift+P</span>
                                </button>
                            </div>

                            <div className="dropdown-divider" />

                            <div className="dropdown-section">
                                <button className="dropdown-item" onClick={() => { onClearCache(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix" />
                                    <div className="item-icon"><Trash2 size={16} /></div>
                                    <span className="item-label">Clear Execution Cache</span>
                                </button>

                                <button className="dropdown-item" onClick={() => { onReloadWindow(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix" />
                                    <div className="item-icon"><RefreshCw size={16} /></div>
                                    <span className="item-label">Reload Window</span>
                                </button>

                                <button className="dropdown-item" onClick={() => { onAboutKalynt(); setIsMenuOpen(false); }}>
                                    <div className="item-prefix" />
                                    <div className="item-icon"><Info size={16} /></div>
                                    <span className="item-label">About Kalynt</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// PERFORMANCE FIX: Helper for language colors (moved outside component to avoid recreation)
const getLangColor = (lang: string) => {
    const colors: Record<string, string> = {
        typescript: '#3178c6',
        javascript: '#f7df1e',
        python: '#3776ab',
        rust: '#dea584',
        html: '#e34c26',
        css: '#563d7c',
        json: '#292929'
    }
    return colors[lang.toLowerCase()] || '#858585'
}

