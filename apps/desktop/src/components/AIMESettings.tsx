/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { hardwareService } from '../services/hardwareService'
import type { HardwareInfo, AIMEConfig, KVCacheQuantization, OffloadingStrategy } from '../types/aime'
import { DEFAULT_AIME_CONFIG, AIME_PRESETS, calculateAIMERAMUsage, recommendAIMESettings } from '../types/aime'
import {
    Activity,
    Brain,
    Cpu,
    Zap,
    Layers,
    Gauge,
    Save,
    RotateCcw,
    Microchip
} from 'lucide-react'

const GRAPH_POINTS = 60 

interface AIMESettingsProps {
    readonly onSave?: (config: AIMEConfig) => void
}

export default function AIMESettings({ onSave }: AIMESettingsProps) {
    const [config, setConfig] = useState<AIMEConfig>(DEFAULT_AIME_CONFIG)
    const [hardware, setHardware] = useState<HardwareInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [saved, setSaved] = useState(false)

    const [ramHistory, setRamHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [currentRam, setCurrentRam] = useState<{ total: number; used: number; free: number } | null>(null)
    const lastUpdateRef = useRef<number>(Date.now())

    useEffect(() => {
        loadHardwareAndConfig()

        const cleanup = hardwareService.startRAMMonitoring((info) => {
            const now = Date.now()
            setCurrentRam({
                total: info.totalRAM,
                used: info.usedRAM,
                free: info.availableRAM
            })

            setRamHistory(prev => {
                const elapsedSeconds = Math.floor((now - lastUpdateRef.current) / 1000)
                let newData = [...prev]

                if (elapsedSeconds > 1 && elapsedSeconds < GRAPH_POINTS) {
                    for (let i = 0; i < elapsedSeconds - 1; i++) {
                        newData = [...newData.slice(1), 0]
                    }
                } else if (elapsedSeconds >= GRAPH_POINTS) {
                    newData = new Array(GRAPH_POINTS).fill(0)
                }

                newData = [...newData.slice(1), info.usedRAM]
                return newData
            })
            lastUpdateRef.current = now
        })

        return cleanup
    }, [])
    async function loadHardwareAndConfig() {
        try {
            
            const hwPromise = hardwareService.getHardwareInfo()
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Hardware detection timeout')), 5000)
            )

            const hw = await Promise.race([hwPromise, timeoutPromise])
            setHardware(hw)

            const stored = localStorage.getItem('aime-config')
            if (stored) {
                setConfig(JSON.parse(stored))
            } else {
                
                const recommended = recommendAIMESettings(hw)
                setConfig(recommended)
            }
        } catch (error) {
            console.error('[AIME] Failed to load hardware/config:', error)
        } finally {
            setLoading(false)
        }
    }

    function handleSave() {
        localStorage.setItem('aime-config', JSON.stringify(config))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSave?.(config)
    }

    function handlePresetSelect(presetName: string) {
        const preset = AIME_PRESETS.find(p => p.name === presetName)
        if (preset) {
            
            if (preset.name.includes('Maximum Quality') && hardware && hardware.totalRAM < 12288) {
                const confirmed = globalThis.confirm(
                    `Warning: This preset is designed for systems with 16GB+ RAM. ` +
                    `Your system has ~${Math.round(hardware.totalRAM / 1024)}GB. ` +
                    `Performance may be severely degraded. Continue?`
                )
                if (!confirmed) return
            }
            setConfig(preset.config)
        }
    }

    const estimatedRAM = calculateAIMERAMUsage(7700, config.maxContextTokens, config.kvCacheQuantization)

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Initializing AIME Engine...</div>
    }

    return (
        <div className="aime-dashboard">
            {}
            <div className="aime-graph-section">
                <div className="graph-header">
                    <div className="graph-title">
                        <Activity size={18} className="text-blue-500" />
                        <span>System Memory Velocity</span>
                    </div>
                    {currentRam && (
                        <div className="live-badge">
                            <span className="live-dot" />
                            LIVE MONITORING
                        </div>
                    )}
                </div>

                <RAMUsageGraph history={ramHistory} total={hardware?.totalRAM || 16384} />

                <div className="current-stats">
                    <div className="mini-stat">
                        <span className="label">Total System RAM</span>
                        <span className="value">{hardware ? Math.round(hardware.totalRAM / 1024) : '-'} <span className="sub">GB</span></span>
                    </div>
                    <div className="mini-stat">
                        <span className="label">Active Usage</span>
                        <span className="value">{currentRam ? Math.round(currentRam.used / 1024) : '-'} <span className="sub">GB</span></span>
                    </div>
                    <div className="mini-stat">
                        <span className="label">Available for AI</span>
                        <span className="value text-blue-400">{currentRam ? Math.round(currentRam.free / 1024) : '-'} <span className="sub">GB</span></span>
                    </div>
                </div>
            </div>

            {}
            <div className="aime-grid">
                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Cpu size={18} /></div>
                        <div className="bento-title">
                            <h4>Hardware Profile</h4>
                            <p>Detected System Capabilities</p>
                        </div>
                    </div>
                    <div className="hardware-specs">
                        <div className="spec-item">
                            <span className="spec-label">Processor</span>
                            <span className="spec-val truncate" title={hardware?.cpuModel}>{hardware?.cpuModel || 'Unknown'}</span>
                        </div>
                        <div className="spec-item">
                            <span className="spec-label">Cores / Threads</span>
                            <span className="spec-val">{hardware?.cpuCores} / {hardware?.cpuThreads}</span>
                        </div>
                        <div className={`spec-item ${hardware?.hasGPU ? 'gpu-active' : ''}`}>
                            <span className="spec-label">GPU Acceleration</span>
                            <span className="spec-val">{hardware?.hasGPU ? hardware.gpuName : 'Not Detected'}</span>
                        </div>
                        <div className="spec-item">
                            <span className="spec-label">VRAM Capacity</span>
                            <span className="spec-val">{hardware?.totalVRAM ? `${Math.round(hardware.totalVRAM / 1024)} GB` : 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Zap size={18} /></div>
                        <div className="bento-title">
                            <h4>Optimization Presets</h4>
                            <p>One-click configuration</p>
                        </div>
                    </div>
                    <div className="presets-grid">
                        {AIME_PRESETS.map(preset => (
                            <div
                                key={preset.name}
                                className={`preset-btn ${JSON.stringify(config) === JSON.stringify(preset.config) ? 'active' : ''}`}
                                onClick={() => handlePresetSelect(preset.name)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePresetSelect(preset.name) }}
                                tabIndex={0}
                                role="button"
                                title={preset.description}
                            >
                                <Zap size={16} className={`preset-icon ${preset.name.includes('Max') ? 'text-purple-400' : 'text-blue-400'}`} />
                                <span className="preset-label">{preset.name.replace('Maximum', 'Max')}</span>
                            </div>
                        ))}
                        <div className="preset-btn" onClick={() => hardware && setConfig(recommendAIMESettings(hardware))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') if (hardware) setConfig(recommendAIMESettings(hardware)) }} tabIndex={0} role="button">
                            <RotateCcw size={16} className="preset-icon" />
                            <span className="preset-label">Auto</span>
                        </div>
                    </div>
                </div>

                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Microchip size={18} /></div>
                        <div className="bento-title">
                            <h4>Memory Compression</h4>
                            <p>KV Cache Quantization (Quality vs RAM)</p>
                        </div>
                    </div>
                    <div className="setting-group">
                        <div className="quantization-options grid grid-cols-4 gap-2">
                            {(['none', 'fp16', 'q8', 'q4'] as KVCacheQuantization[]).map(level => (
                                <label key={level} className={`quantization-option ${config.kvCacheQuantization === level ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="kvQuantization"
                                        value={level}
                                        checked={config.kvCacheQuantization === level}
                                        onChange={(e) => setConfig({ ...config, kvCacheQuantization: e.target.value as KVCacheQuantization })}
                                    />
                                    <div className="option-content">
                                        <div className="option-name">{level.toUpperCase()}</div>
                                        <div className="option-desc text-[10px]">
                                            {level === 'q4' ? '-75% RAM' : (level === 'q8' ? '-50% RAM' : 'Lossless')}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Layers size={18} /></div>
                        <div className="bento-title">
                            <h4>GPU Offloading</h4>
                            <p>Pipeline Distribution Strategy</p>
                        </div>
                    </div>
                    <div className="setting-group">
                        <div className="offloading-control">
                            <select
                                className="input"
                                value={config.offloadingStrategy}
                                onChange={(e) => setConfig({ ...config, offloadingStrategy: e.target.value as OffloadingStrategy })}
                            >
                                <option value="auto">Auto-Balance (Recommended)</option>
                                <option value="gpu-only" disabled={!hardware?.hasGPU}>GPU Only (Max Speed)</option>
                                <option value="cpu-only">CPU Only (Max Compatibility)</option>
                                <option value="balanced" disabled={!hardware?.hasGPU}>Balanced (Hybrid)</option>
                                <option value="custom">Custom Configuration</option>
                            </select>
                        </div>
                        {config.offloadingStrategy === 'custom' && (
                            <div className="mt-3">
                                <div className="flex justify-between text-xs text-slate-400 mb-1">
                                    <span>CPU Only</span>
                                    <span>{config.gpuLayers} Layers</span>
                                    <span>Max GPU</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="64"
                                    value={config.gpuLayers}
                                    onChange={(e) => setConfig({ ...config, gpuLayers: Number.parseInt(e.target.value, 10) })}
                                    className="slider w-full"
                                    disabled={!hardware?.hasGPU}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Brain size={18} /></div>
                        <div className="bento-title">
                            <h4>Context Window</h4>
                            <p>Conversation Memory Limit</p>
                        </div>
                    </div>
                    <div className="setting-group">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-2xl font-bold text-blue-400">{config.maxContextTokens.toLocaleString()}</span>
                            <span className="text-xs text-slate-500 uppercase">Tokens</span>
                        </div>
                        <input
                            type="range"
                            min="1024"
                            max="131072"
                            step="1024"
                            value={config.maxContextTokens}
                            onChange={(e) => setConfig({ ...config, maxContextTokens: Number.parseInt(e.target.value, 10) })}
                            className="slider mb-3"
                        />
                        <label className="toggle-switch">
                            <span>Auto-Cap Context <span className="text-slate-500 text-xs">(Safety Limit)</span></span>
                            <input
                                type="checkbox"
                                checked={config.autoContextCap}
                                onChange={(e) => setConfig({ ...config, autoContextCap: e.target.checked })}
                            />
                            <div className="toggle-track"><div className="toggle-thumb"></div></div>
                        </label>
                    </div>
                </div>

                {}
                <div className="bento-card">
                    <div className="bento-header">
                        <div className="bento-icon"><Gauge size={18} /></div>
                        <div className="bento-title">
                            <h4>Performance Tuning</h4>
                            <p>Thread & Batch Optimization</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="setting-group">
                            <label>Threads ({config.threads})</label>
                            <input
                                type="range"
                                min="1"
                                max={hardware?.cpuCores || 8}
                                value={config.threads}
                                onChange={(e) => setConfig({ ...config, threads: Number.parseInt(e.target.value, 10) })}
                                className="slider"
                            />
                        </div>
                        <div className="setting-group">
                            <label>Batch Size ({config.batchSize})</label>
                            <input
                                type="range"
                                min="128"
                                max="2048"
                                step="128"
                                value={config.batchSize}
                                onChange={(e) => setConfig({ ...config, batchSize: Number.parseInt(e.target.value, 10) })}
                                className="slider"
                            />
                        </div>
                    </div>
                    <label className="toggle-switch mt-2">
                        <span>Emergency Unload Protection</span>
                        <input
                            type="checkbox"
                            checked={config.emergencyUnload}
                            onChange={(e) => setConfig({ ...config, emergencyUnload: e.target.checked })}
                        />
                        <div className="toggle-track"><div className="toggle-thumb"></div></div>
                    </label>
                </div>

                {}
                <div className="bento-card full-width bg-blue-500/5 border-blue-500/20">
                    <div className="flex justify-between items-center px-2">
                        <div className="flex items-center gap-3">
                            <div className="text-blue-400 font-semibold text-sm">ESTIMATED IMPACT (7B MODEL)</div>
                        </div>
                        <div className="flex gap-8 text-sm">
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-slate-500">RAM Required</span>
                                <span className="font-mono font-bold text-blue-400">{estimatedRAM} MB</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-slate-500">Tokens</span>
                                <span className="font-mono font-bold text-slate-300">{config.maxContextTokens / 1024}K</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-700/50 mt-4">
                <button className="btn btn-primary" onClick={handleSave}>
                    {saved ? <span className="flex items-center gap-2">âœ“ Saved</span> : <span className="flex items-center gap-2"><Save size={16} /> Save Configuration</span>}
                </button>
            </div>
        </div>
    )
}

function RAMUsageGraph({ history, total }: { readonly history: number[]; readonly total: number }) {
    const { theme } = useAppStore()
    if (!history.length) return null

    const width = 100
    const height = 100
    const maxVal = total
    const minVal = 0

    const points = history.map((val, i) => {
        const x = (i / (history.length - 1)) * width
        const y = height - ((val - minVal) / (maxVal - minVal)) * height
        return `${x},${y}`
    }).join(' ')

    const pathD = `M ${points}`
    const areaD = `M 0,${height} ${points} L ${width},${height} Z`

    const gridColor = theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'
    const textColor = theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)'

    return (
        <div className="ram-graph-container">
            <svg className="ram-usage-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                    <linearGradient id="gradient-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {}
                <line x1="0" y1="25" x2="100" y2="25" stroke={gridColor} strokeWidth="1" strokeDasharray="4,4" />
                <line x1="0" y1="50" x2="100" y2="50" stroke={gridColor} strokeWidth="1" strokeDasharray="4,4" />
                <line x1="0" y1="75" x2="100" y2="75" stroke={gridColor} strokeWidth="1" strokeDasharray="4,4" />

                {}
                <path d={areaD} className="graph-fill" />
                <path d={pathD} className="graph-path" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute top-2 right-2 text-xs font-mono" style={{ color: textColor }}>
                {Math.round(total / 1024)}GB MAX
            </div>
        </div>
    )
}
