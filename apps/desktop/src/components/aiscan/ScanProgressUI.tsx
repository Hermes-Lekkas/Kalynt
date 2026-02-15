/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import { Loader2, Search, CheckCircle2, Square, Code2 } from 'lucide-react'
import { ScanProgress } from '../../services/workspaceScanService'

interface ScanProgressUIProps {
    progress: ScanProgress
    onStop: () => void
}

export default function ScanProgressUI({ progress, onStop }: ScanProgressUIProps) {
    const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

    return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[400px] animate-in fade-in duration-700">
            <div 
                className="relative p-12 rounded-[2rem] border backdrop-blur-2xl flex flex-col items-center max-w-md w-full transition-all duration-500"
                style={{ 
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                    borderColor: 'rgba(255,255,255,0.05)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                }}
            >
                {/* Progress Circle Container */}
                <div className="relative mb-10">
                    {/* Glowing background blob */}
                    <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
                    
                    <div className="relative w-48 h-48 flex items-center justify-center">
                        {/* Background Track */}
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle
                                cx="96"
                                cy="96"
                                r="88"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-gray-800/50"
                            />
                            {/* Progress Line */}
                            <circle
                                cx="96"
                                cy="96"
                                r="88"
                                fill="none"
                                stroke="url(#gradient)"
                                strokeWidth="4"
                                strokeDasharray={553}
                                strokeDashoffset={553 - (553 * percentage) / 100}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-out"
                            />
                            <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#3b82f6" />
                                    <stop offset="100%" stopColor="#8b5cf6" />
                                </linearGradient>
                            </defs>
                        </svg>

                        {/* Center Content */}
                        <div className="flex flex-col items-center justify-center z-10">
                            <span className="text-5xl font-light tracking-tighter tabular-nums" style={{ color: 'var(--color-text)' }}>
                                {percentage}
                                <span className="text-2xl opacity-50 ml-1">%</span>
                            </span>
                            <span className="text-xs font-medium uppercase tracking-widest mt-2 opacity-50" style={{ color: 'var(--color-text-secondary)' }}>
                                {progress.status}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status Text */}
                <h3 className="text-lg font-medium mb-2 tracking-tight" style={{ color: 'var(--color-text)' }}>
                    {progress.status === 'indexing' ? 'Indexing Workspace' : 'Analyzing Codebase'}
                </h3>
                
                {/* Current File Indicator */}
                <div 
                    className="flex items-center gap-3 px-4 py-2.5 rounded-full border mb-8 max-w-full w-full overflow-hidden backdrop-blur-md"
                    style={{ 
                        background: 'rgba(0,0,0,0.2)',
                        borderColor: 'rgba(255,255,255,0.05)'
                    }}
                >
                    <Code2 size={14} className="text-blue-500 shrink-0 animate-pulse" />
                    <span className="text-xs font-mono text-gray-400 truncate w-full text-center">
                        {progress.currentFile || 'Initializing...'}
                    </span>
                </div>

                {/* Steps */}
                <div className="w-full flex justify-between px-2 mb-8">
                    <Step 
                        icon={<CheckCircle2 size={14} />} 
                        label="Indexing" 
                        active={progress.current > 0} 
                        completed={progress.current > 0}
                    />
                    <div className="h-px w-8 bg-gray-800 self-center" />
                    <Step 
                        icon={<Loader2 size={14} className={progress.status === 'analyzing' ? 'animate-spin' : ''} />} 
                        label="Analysis" 
                        active={progress.status === 'analyzing'} 
                        completed={false}
                    />
                    <div className="h-px w-8 bg-gray-800 self-center" />
                    <Step 
                        icon={<Search size={14} />} 
                        label="Report" 
                        active={false} 
                        completed={false}
                    />
                </div>

                {/* Stop Button */}
                <button
                    onClick={onStop}
                    className="group flex items-center gap-2 px-6 py-2 rounded-full text-xs font-medium transition-all hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20"
                    style={{ color: 'var(--color-text-tertiary)' }}
                >
                    <Square size={10} className="fill-current" />
                    <span>Cancel Scan</span>
                </button>
            </div>
        </div>
    )
}

function Step({ icon, label, active, completed }: { icon: React.ReactNode, label: string, active: boolean, completed: boolean }) {
    return (
        <div className={`flex flex-col items-center gap-2 transition-colors duration-300 ${active || completed ? 'text-blue-400' : 'text-gray-600'}`}>
            <div className={`p-2 rounded-full ${active ? 'bg-blue-500/10 ring-1 ring-blue-500/50' : 'bg-gray-800/50'}`}>
                {React.cloneElement(icon as React.ReactElement, { size: 14 })}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </div>
    )
}
