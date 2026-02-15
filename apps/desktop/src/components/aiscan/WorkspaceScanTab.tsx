/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useState, useMemo } from 'react'
import {
    Brain, Shield, Bug, Zap, Info, Play, RefreshCw,
    AlertTriangle, Clock, FileSearch, CheckCircle2,
    ChevronDown, ChevronRight, XCircle
} from 'lucide-react'
import { workspaceScanService, ScanIssue, ScanProgress, ScanError, ScanResult, IssueType } from '../../services/workspaceScanService'
import { AIProvider } from '../../services/aiService'
import { useModelStore } from '../../stores/modelStore'
import ScanIssueCard from './ScanIssueCard'
import ScanProgressUI from './ScanProgressUI'

interface WorkspaceScanTabProps {
    workspacePath: string | null
    aiMode: 'cloud' | 'offline'
    provider: AIProvider
    cloudModel?: string
    availableProviders: AIProvider[]
    onAiModeChange: (mode: 'cloud' | 'offline') => void
    onProviderChange: (provider: AIProvider) => void
    onShowModelManager: () => void
}

export default function WorkspaceScanTab({
    workspacePath,
    aiMode,
    provider,
    cloudModel,
    availableProviders,
}: WorkspaceScanTabProps) {
    const { loadedModelId } = useModelStore()

    const [isScanning, setIsScanning] = useState(false)
    const [progress, setProgress] = useState<ScanProgress | null>(null)
    const [issues, setIssues] = useState<ScanIssue[]>([])
    const [scanErrors, setScanErrors] = useState<ScanError[]>([])
    const [scanStats, setScanStats] = useState<ScanResult['stats'] | null>(null)
    const [filter, setFilter] = useState<IssueType | 'all'>('all')
    const [errorsExpanded, setErrorsExpanded] = useState(false)

    const canScan = !!workspacePath && (aiMode === 'offline' ? !!loadedModelId : availableProviders.length > 0)

    const filteredIssues = useMemo(() => {
        if (filter === 'all') return issues
        return issues.filter(i => i.type === filter)
    }, [issues, filter])

    const stats = useMemo(() => ({
        total: issues.length,
        bugs: issues.filter(i => i.type === 'bug').length,
        security: issues.filter(i => i.type === 'security').length,
        performance: issues.filter(i => i.type === 'performance').length,
        improvement: issues.filter(i => i.type === 'improvement').length,
    }), [issues])

    const handleStartScan = async () => {
        if (!workspacePath) return
        setIsScanning(true)
        setIssues([])
        setScanErrors([])
        setScanStats(null)
        setFilter('all')

        try {
            const result = await workspaceScanService.scanWorkspace(workspacePath, {
                aiMode,
                provider,
                cloudModel,
                loadedModelId,
                onProgress: setProgress
            })
            setIssues(result.issues)
            setScanErrors(result.errors)
            setScanStats(result.stats)
        } catch (err) {
            console.error('Scan failed:', err)
        } finally {
            setIsScanning(false)
            setProgress(null)
        }
    }

    const handleStopScan = () => {
        workspaceScanService.stopScan()
        setIsScanning(false)
        setProgress(null)
    }

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`
        const seconds = Math.round(ms / 1000)
        if (seconds < 60) return `${seconds}s`
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}m ${secs}s`
    }

    const hasResults = issues.length > 0 || scanErrors.length > 0

    return (
        <div
            className="flex flex-col h-full overflow-hidden relative"
            style={{ background: 'var(--color-bg)' }}
        >
            <div className="flex-1 overflow-y-auto scrollbar-hide h-full">
                {isScanning && progress ? (
                    <div className="p-6 h-full">
                        <ScanProgressUI progress={progress} onStop={handleStopScan} />
                    </div>
                ) : !hasResults ? (
                    /* =============== EMPTY STATE =============== */
                    <div className="flex flex-col items-center justify-center h-full text-center p-12 animate-in fade-in zoom-in-95 duration-500">
                        <div
                            className="w-32 h-32 rounded-[2rem] flex items-center justify-center mb-8 relative group cursor-pointer transition-transform duration-500 hover:scale-105"
                            onClick={canScan ? handleStartScan : undefined}
                            style={{
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                boxShadow: '0 0 40px -10px rgba(59, 130, 246, 0.2)'
                            }}
                        >
                            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-tr from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
                            <Brain
                                className="w-16 h-16 relative z-10 transition-all duration-500 group-hover:text-blue-400"
                                style={{ color: 'var(--color-text-secondary)' }}
                            />
                            <div className="absolute top-0 right-0 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                            <div className="absolute bottom-4 left-4 w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse delay-300" />
                        </div>

                        <h3 className="text-3xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 animate-gradient-x">
                            Workspace Intelligence
                        </h3>
                        <p className="max-w-md text-sm mb-12 leading-relaxed opacity-60 font-medium">
                            Autonomous AI analysis for bugs, security vulnerabilities, <br />
                            and performance optimizations.
                        </p>

                        <button
                            onClick={handleStartScan}
                            disabled={!canScan}
                            className="group relative flex items-center gap-3 px-10 py-4 rounded-full text-sm font-bold transition-all shadow-xl hover:shadow-2xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
                                color: '#ffffff',
                                boxShadow: '0 0 30px -5px var(--color-accent-light)'
                            }}
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            <Play size={18} fill="currentColor" />
                            <span>START ANALYSIS</span>
                        </button>

                        {!canScan && (
                            <div className="mt-8 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-full border border-red-500/20 bg-red-500/5 text-red-400">
                                <Info size={12} />
                                {aiMode === 'offline' ? 'Local Model Required' : 'API Keys Required'}
                            </div>
                        )}
                    </div>
                ) : (
                    /* =============== RESULTS VIEW =============== */
                    <div className="animate-in fade-in duration-500">
                        {/* Scan Summary Header */}
                        <div
                            className="sticky top-0 z-20 px-6 py-4 border-b backdrop-blur-xl"
                            style={{
                                background: 'var(--color-bg)',
                                borderColor: 'var(--color-border-subtle)',
                            }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                                        style={{
                                            background: issues.length > 0
                                                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))'
                                                : 'rgba(16, 185, 129, 0.15)'
                                        }}
                                    >
                                        {issues.length > 0 ? (
                                            <FileSearch size={16} style={{ color: '#818cf8' }} />
                                        ) : (
                                            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                                            {issues.length > 0 ? `${issues.length} Issue${issues.length !== 1 ? 's' : ''} Found` : 'No Issues Found'}
                                        </h3>
                                        {scanStats && (
                                            <div className="flex items-center gap-3 text-[10px] font-medium mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                                                <span className="flex items-center gap-1">
                                                    <FileSearch size={9} />
                                                    {scanStats.analyzedFiles} / {scanStats.totalFiles} files
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={9} />
                                                    {formatDuration(scanStats.duration)}
                                                </span>
                                                {scanErrors.length > 0 && (
                                                    <span className="flex items-center gap-1 text-amber-400">
                                                        <AlertTriangle size={9} />
                                                        {scanErrors.length} failed
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={handleStartScan}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95 border hover:bg-white/5"
                                    style={{
                                        color: 'var(--color-text-secondary)',
                                        borderColor: 'var(--color-border)',
                                        background: 'var(--color-surface)'
                                    }}
                                >
                                    <RefreshCw size={10} /> Rescan
                                </button>
                            </div>

                            {/* Filter chips */}
                            {issues.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                                    <FilterChip
                                        label="All"
                                        count={stats.total}
                                        active={filter === 'all'}
                                        color="#818cf8"
                                        onClick={() => setFilter('all')}
                                    />
                                    <FilterChip
                                        icon={<Bug size={11} />}
                                        label="Bugs"
                                        count={stats.bugs}
                                        active={filter === 'bug'}
                                        color="#ef4444"
                                        onClick={() => setFilter(filter === 'bug' ? 'all' : 'bug')}
                                    />
                                    <FilterChip
                                        icon={<Shield size={11} />}
                                        label="Security"
                                        count={stats.security}
                                        active={filter === 'security'}
                                        color="#f59e0b"
                                        onClick={() => setFilter(filter === 'security' ? 'all' : 'security')}
                                    />
                                    <FilterChip
                                        icon={<Zap size={11} />}
                                        label="Perf"
                                        count={stats.performance}
                                        active={filter === 'performance'}
                                        color="#3b82f6"
                                        onClick={() => setFilter(filter === 'performance' ? 'all' : 'performance')}
                                    />
                                    <FilterChip
                                        icon={<Info size={11} />}
                                        label="Improve"
                                        count={stats.improvement}
                                        active={filter === 'improvement'}
                                        color="#10b981"
                                        onClick={() => setFilter(filter === 'improvement' ? 'all' : 'improvement')}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Issues List */}
                        <div className="p-6 space-y-3">
                            {filteredIssues.length > 0 ? (
                                filteredIssues.map((issue, idx) => (
                                    <ScanIssueCard
                                        key={`${issue.path}-${issue.line}-${idx}`}
                                        issue={issue}
                                        aiMode={aiMode}
                                        provider={provider}
                                        loadedModelId={loadedModelId}
                                    />
                                ))
                            ) : issues.length > 0 ? (
                                <div
                                    className="p-12 text-center rounded-2xl border border-dashed flex flex-col items-center gap-3 opacity-50"
                                    style={{ borderColor: 'var(--color-border)' }}
                                >
                                    <Info size={20} />
                                    <p className="text-xs font-medium">No issues match this filter.</p>
                                </div>
                            ) : null}

                            {/* Scan Errors Section */}
                            {scanErrors.length > 0 && (
                                <div className="mt-6">
                                    <button
                                        onClick={() => setErrorsExpanded(!errorsExpanded)}
                                        className="flex items-center gap-2 w-full text-left px-1 py-2 group"
                                    >
                                        {errorsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <AlertTriangle size={13} className="text-amber-400" />
                                        <span
                                            className="text-[11px] font-bold uppercase tracking-wider"
                                            style={{ color: 'var(--color-text-secondary)' }}
                                        >
                                            {scanErrors.length} File{scanErrors.length !== 1 ? 's' : ''} Failed to Analyze
                                        </span>
                                    </button>

                                    {errorsExpanded && (
                                        <div className="space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                                            {scanErrors.map((err, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-start gap-3 px-4 py-3 rounded-xl border"
                                                    style={{
                                                        background: 'rgba(245, 158, 11, 0.03)',
                                                        borderColor: 'rgba(245, 158, 11, 0.1)'
                                                    }}
                                                >
                                                    <XCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                                                            {err.file}
                                                        </p>
                                                        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                                                            {err.reason}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Bottom padding */}
                            <div className="h-8" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function FilterChip({ icon, label, count, active, color, onClick }: {
    icon?: React.ReactNode
    label: string
    count: number
    active: boolean
    color: string
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 shrink-0 border"
            style={{
                background: active ? `${color}15` : 'transparent',
                borderColor: active ? `${color}30` : 'var(--color-border-subtle)',
                color: active ? color : 'var(--color-text-tertiary)',
            }}
        >
            {icon}
            <span>{label}</span>
            <span
                className="ml-0.5 px-1.5 py-[1px] rounded-md text-[9px] font-black"
                style={{
                    background: active ? `${color}20` : 'var(--color-surface)',
                    color: active ? color : 'var(--color-text-tertiary)'
                }}
            >
                {count}
            </span>
        </button>
    )
}
