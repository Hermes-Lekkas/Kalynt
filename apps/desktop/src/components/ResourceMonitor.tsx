/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
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
  const { } = useAppStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<RealTimeStats | null>(null)

  // Robust number conversion
  const safeNum = (n: any): number => {
    const num = typeof n === 'number' ? n : parseFloat(n)
    return (isNaN(num) || !isFinite(num)) ? 0 : num
  }

  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [ramHistory, setRamHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [gpuHistory, setGpuHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [vramHistory, setVramHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [ivramHistory, setIvramHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [diskIOHistory, setDiskIOHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))
  const [networkHistory, setNetworkHistory] = useState<number[]>(new Array(GRAPH_POINTS).fill(0))

  // VRAM Toggle state
  const [showIntegrated, setShowIntegrated] = useState(false)

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
      setCpuHistory(prev => [...prev.slice(1), safeNum(newStats.cpuUsage)])

      // Guard against division by zero and invalid inputs
      const totalRAM = safeNum(newStats.ramTotal)
      const usedRAM = safeNum(newStats.ramUsage)
      const ramPercent = totalRAM > 0 ? (usedRAM / totalRAM) * 100 : 0
      setRamHistory(prev => [...prev.slice(1), ramPercent])

      setGpuHistory(prev => [...prev.slice(1), safeNum(newStats.gpuUsage)])

      // Guard against division by zero and invalid inputs
      const totalVRAM = safeNum(newStats.vramTotal)
      const usedVRAM = safeNum(newStats.vramUsage)
      const vramPercent = totalVRAM > 0 ? (usedVRAM / totalVRAM) * 100 : 0
      setVramHistory(prev => [...prev.slice(1), vramPercent])

      const totalIVRAM = safeNum(newStats.ivramTotal)
      const usedIVRAM = safeNum(newStats.ivramUsage)
      const ivramPercent = totalIVRAM > 0 ? (usedIVRAM / totalIVRAM) * 100 : 0
      setIvramHistory(prev => [...prev.slice(1), ivramPercent])

      setDiskIOHistory(prev => {
        // Normalize to 0-100 scale (0-100 MB/s)
        const speed = safeNum(newStats.diskIOSpeed)
        const normalized = Math.min((speed / 100) * 100, 100)
        return [...prev.slice(1), normalized]
      })
      setNetworkHistory(prev => {
        const lat = safeNum(newStats.networkLatency)
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
    vramTotal: 1,
    ivramUsage: 0,
    ivramTotal: 1
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
          <div
            className={`vram-flip-card ${showIntegrated ? 'is-flipped' : ''}`}
            onClick={() => setShowIntegrated(!showIntegrated)}
          >
            <div className="vram-card-inner">
              <div className="vram-flip-shimmer" />
              <div className="vram-card-front">
                <MiniGraph
                  icon={<MemoryStick size={11} />}
                  label="VRAM"
                  value={`${displayStats.vramTotal > 0 ? Math.round((displayStats.vramUsage / displayStats.vramTotal) * 100) : 0}%`}
                  history={vramHistory}
                  color="#FF9500"
                  onClick={() => { }}
                />
              </div>
              <div className="vram-card-back">
                <MiniGraph
                  icon={<MemoryStick size={11} />}
                  label="iVRAM"
                  value={`${displayStats.ivramTotal > 0 ? Math.round((displayStats.ivramUsage / displayStats.ivramTotal) * 100) : 0}%`}
                  history={ivramHistory}
                  color="#FFCC00"
                  onClick={() => { }}
                />
              </div>
            </div>
          </div>
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
          background: var(--color-surface-subtle);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 0.5px solid var(--color-border);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05), 
                      inset 0 1px 0 var(--color-glass);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
          color: var(--color-text);
        }

        .mini-stat-item:hover, .mini-graph-item:hover {
          background: var(--color-glass);
          border-color: var(--color-text-muted);
          transform: translateY(-1px);
        }

        .vram-flip-card {
          width: 165px;
          height: 28px;
          perspective: 1000px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .vram-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }

        .vram-flip-card:active .vram-card-inner {
          transform: scale(0.95);
        }

        .vram-flip-card.is-flipped .vram-card-inner {
          transform: rotateX(180deg);
        }

        /* Cinematic Shimmer Sweep */
        .vram-flip-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            transparent 0%,
            transparent 40%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 200% 200%;
          background-position: -150% -150%;
          opacity: 0;
          z-index: 10;
          pointer-events: none;
          border-radius: 8px;
        }

        .vram-flip-card:active .vram-flip-shimmer {
          animation: shimmer-sweep 0.6s ease-in-out;
        }

        @keyframes shimmer-sweep {
          0% { background-position: -150% -150%; opacity: 0; }
          50% { opacity: 0.5; }
          100% { background-position: 150% 150%; opacity: 0; }
        }

        .vram-card-front, .vram-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          top: 0;
          left: 0;
          background: var(--color-surface); 
          border-radius: 8px;
          overflow: hidden;
          box-shadow: inset 0 0 0 1px var(--color-border);
        }

        .vram-card-front {
          z-index: 2;
          transform: rotateX(0deg);
        }

        .vram-card-back {
          transform: rotateX(180deg);
        }

        /* Ensure the MiniGraph inside doesn't have its own blur during flip */
        .vram-card-inner .mini-graph-item {
          backdrop-filter: none !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        .stat-label, .graph-label {
          font-size: 9px;
          font-weight: 600;
          color: var(--color-text-tertiary);
          letter-spacing: 0.02em;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
        }

        .stat-value, .graph-value {
          font-size: 10px;
          font-weight: 500;
          color: var(--color-text);
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
          background: var(--color-surface-subtle);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 0.5px solid var(--color-border);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05), 
                      inset 0 1px 0 var(--color-glass);
          flex-shrink: 0;
          color: var(--color-text);
        }

        .timer-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-text-muted);
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
          color: var(--color-text);
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
          background: var(--color-surface-elevated);
          border: 0.5px solid var(--color-border);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--color-text-secondary);
        }

        .timer-btn:hover {
          background: var(--color-glass);
          color: var(--color-text);
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
    // Extra safety check for NaN values in history
    const safeVal = (typeof val === 'number' && !isNaN(val)) ? val : 0
    const y = height - (safeVal / 100) * height
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
