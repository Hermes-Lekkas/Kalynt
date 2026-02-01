/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useRef } from 'react'
import { hardwareService, type RealTimeStats } from '../services/hardwareService'
import { Cpu, HardDrive, Wifi, WifiOff, MemoryStick, Gpu, Play, Pause, RotateCcw } from 'lucide-react'

const GRAPH_POINTS = 60

interface ResourceMonitorProps {
    visible?: {
        cpu?: boolean
        ram?: boolean
        disk?: boolean
        network?: boolean
    }
    onToggle?: (metric: 'cpu' | 'ram' | 'disk' | 'network') => void
}

export default function ResourceMonitor({ onToggle }: ResourceMonitorProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [stats, setStats] = useState<RealTimeStats | null>(null)
    const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [ramHistory, setRamHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [gpuHistory, setGpuHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [vramHistory, setVramHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [diskIOHistory, setDiskIOHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
    const [networkHistory, setNetworkHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))

    // Session timer state
    const [timerSeconds, setTimerSeconds] = useState(0)
    const [timerRunning, setTimerRunning] = useState(false)

    // ALWAYS show all metrics for now
    const showCpu = true
    const showRam = true
    const showDiskIO = true
    const showNetwork = true
    const showGpu = true
    const showVram = true
    const showTimer = true

    // Load initial state
    useEffect(() => {
        const savedTime = localStorage.getItem('session-timer-seconds')
        const savedRunning = localStorage.getItem('session-timer-running')
        if (savedTime) setTimerSeconds(parseInt(savedTime, 10))
        if (savedRunning === 'true') setTimerRunning(true)
    }, [])

    // Timer persistence
    useEffect(() => {
        localStorage.setItem('session-timer-seconds', timerSeconds.toString())
    }, [timerSeconds])

    useEffect(() => {
        localStorage.setItem('session-timer-running', timerRunning.toString())
    }, [timerRunning])

    // Timer tick
    useEffect(() => {
        if (!timerRunning) return
        const interval = setInterval(() => {
            setTimerSeconds(prev => prev + 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [timerRunning])

    // Resource monitoring
    useEffect(() => {
        const cleanup = hardwareService.startResourceMonitoring((newStats) => {
            setStats(newStats)
            setCpuHistory(prev => [...prev.slice(1), newStats.cpuUsage])
            setRamHistory(prev => [...prev.slice(1), (newStats.ramUsage / newStats.ramTotal) * 100])
            setGpuHistory(prev => [...prev.slice(1), newStats.gpuUsage])
            setVramHistory(prev => [...prev.slice(1), (newStats.vramUsage / newStats.vramTotal) * 100])
            setDiskIOHistory(prev => {
                // Normalize to 0-100 scale (0-100 MB/s)
                const normalized = Math.min((newStats.diskIOSpeed / 100) * 100, 100)
                return [...prev.slice(1), normalized]
            })
            setNetworkHistory(prev => {
                const lat = newStats.networkLatency || 0
                const latPercent = Math.min((lat / 500) * 100, 100)
                return [...prev.slice(1), newStats.networkConnected ? latPercent : 0]
            })
        })
        return cleanup
    }, [])

    // Mouse wheel horizontal scroll
    useEffect(() => {
        const element = scrollRef.current
        if (!element) return

        const handleWheel = (e: WheelEvent) => {
            // Check if horizontal scroll is already happening or if it's primary vertical
            if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
                e.preventDefault()
                element.scrollLeft += e.deltaY
            }
        }

        element.addEventListener('wheel', handleWheel, { passive: false })
        return () => element.removeEventListener('wheel', handleWheel)
    }, [])

    const displayStats = stats || {
        cpuUsage: 0,
        ramUsage: 0,
        ramTotal: 1,
        diskIOSpeed: 0,
        networkConnected: true,
        networkLatency: 0,
        gpuUsage: 0,
        vramUsage: 0,
        vramTotal: 1
    }

    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        return {
            h: [Math.floor(hours / 10), hours % 10],
            m: [Math.floor(mins / 10), mins % 10],
            s: [Math.floor(secs / 10), secs % 10]
        }
    }

    const { h, m, s } = formatTime(timerSeconds)

    return (
        <div className="resource-monitor-compact" ref={scrollRef}>
            <div className="metrics-scroll-content">
                {showCpu && (
                    <MiniGraph
                        icon={<Cpu size={11} />}
                        label="CPU"
                        value={`${displayStats.cpuUsage}%`}
                        history={cpuHistory}
                        color="#007AFF"
                        onClick={() => onToggle?.('cpu')}
                    />
                )}

                {showRam && (
                    <MiniGraph
                        icon={<MemoryStick size={11} />}
                        label="RAM"
                        value={`${Math.round((displayStats.ramUsage / displayStats.ramTotal) * 100)}%`}
                        history={ramHistory}
                        color="#34C759"
                        onClick={() => onToggle?.('ram')}
                    />
                )}

                {showGpu && (
                    <MiniGraph
                        icon={<Gpu size={11} />}
                        label="GPU"
                        value={`${displayStats.gpuUsage}%`}
                        history={gpuHistory}
                        color="#AF52DE"
                        onClick={() => { }}
                    />
                )}

                {showVram && (
                    <MiniGraph
                        icon={<MemoryStick size={11} />}
                        label="VRAM"
                        value={`${Math.round((displayStats.vramUsage / displayStats.vramTotal) * 100)}%`}
                        history={vramHistory}
                        color="#FF9500"
                        onClick={() => { }}
                    />
                )}

                {showDiskIO && (
                    <MiniGraph
                        icon={<HardDrive size={11} />}
                        label="I/O"
                        value={`${displayStats.diskIOSpeed.toFixed(1)}MB/s`}
                        history={diskIOHistory}
                        color="#FF2D55"
                        onClick={() => onToggle?.('disk')}
                    />
                )}

                {showNetwork && (
                    <MiniGraph
                        icon={displayStats.networkConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                        label="NET"
                        value={displayStats.networkConnected ? `${displayStats.networkLatency || 0}ms` : 'OFF'}
                        history={networkHistory}
                        color={displayStats.networkConnected ? "#5AC8FA" : "#FF3B30"}
                        onClick={() => onToggle?.('network')}
                    />
                )}

                {showTimer && (
                    <div className="timer-item">
                        <div className={`timer-status-dot ${timerRunning ? 'active' : ''}`} />
                        <div className="animated-timer">
                            <Digit value={h[0]} />
                            <Digit value={h[1]} />
                            <span className="timer-colon">:</span>
                            <Digit value={m[0]} />
                            <Digit value={m[1]} />
                            <span className="timer-colon">:</span>
                            <Digit value={s[0]} />
                            <Digit value={s[1]} />
                        </div>
                        <div className="timer-controls">
                            <button className="timer-btn" onClick={() => setTimerRunning(!timerRunning)} title={timerRunning ? "Pause" : "Start"}>
                                {timerRunning ? <Pause size={10} /> : <Play size={10} />}
                            </button>
                            <button className="timer-btn" onClick={() => { setTimerSeconds(0); setTimerRunning(false); }} title="Reset">
                                <RotateCcw size={10} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
        .resource-monitor-compact {
          display: flex;
          align-items: center;
          height: 38px;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-behavior: smooth;
        }
        
        .resource-monitor-compact::-webkit-scrollbar {
          display: none;
        }

        .metrics-scroll-content {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          flex-shrink: 0;
        }

        .mini-stat-item, .mini-graph-item {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
        }

        .mini-stat-item:hover, .mini-graph-item:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }

        .stat-label, .graph-label {
          font-size: 9px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          letter-spacing: 0.02em;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
        }

        .stat-value, .graph-value {
          font-size: 10px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.95);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Menlo', monospace;
          min-width: 32px;
          text-align: right;
        }

        .mini-sparkline {
          width: 70px;
          height: 18px;
          margin-left: 4px;
          opacity: 0.95;
        }

        .timer-item {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 28px;
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }

        .timer-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
        }

        .timer-status-dot.active {
          background: #34C759;
          box-shadow: 0 0 8px #34C759;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; transform: scale(0.8); }
          100% { opacity: 1; }
        }

        .animated-timer {
          display: flex;
          align-items: center;
          gap: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Menlo', monospace;
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.95);
        }

        .timer-colon {
          margin: 0 1px;
          opacity: 0.4;
          font-weight: 400;
        }

        .digit-container {
          height: 14px;
          width: 7px;
          overflow: hidden;
          position: relative;
        }

        .digit-reel {
          display: flex;
          flex-direction: column;
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .digit-num {
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .timer-controls {
          display: flex;
          gap: 4px;
          margin-left: 4px;
        }

        .timer-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.07);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: rgba(255, 255, 255, 0.8);
        }

        .timer-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 1);
        }

        .timer-btn:active {
          transform: scale(0.9);
        }
      `}</style>
        </div>
    )
}

function Digit({ value }: { value: number }) {
    return (
        <div className="digit-container">
            <div className="digit-reel" style={{ transform: `translateY(-${value * 10}%)` }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <div key={n} className="digit-num">{n}</div>
                ))}
            </div>
        </div>
    )
}

function MiniGraph({ icon, label, value, history, color, onClick }: any) {
    const width = 70
    const height = 18

    const points = history.map((val: number, i: number) => {
        const x = (i / (history.length - 1)) * width
        const y = height - (val / 100) * height
        return `${x},${y}`
    }).join(' ')

    const pathD = `M ${points}`
    const areaD = `M 0,${height} ${points} L ${width},${height} Z`

    return (
        <div className="mini-graph-item" onClick={onClick}>
            {icon}
            <span className="graph-label">{label}</span>
            <span className="graph-value">{value}</span>
            <div className="mini-sparkline">
                <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <defs>
                        <linearGradient id={`grad-${label}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
                        </linearGradient>
                    </defs>
                    <path d={areaD} fill={`url(#grad-${label})`} />
                    <path
                        d={pathD}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
            </div>
        </div>
    )
}
