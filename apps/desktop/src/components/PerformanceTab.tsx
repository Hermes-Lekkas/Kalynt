/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect } from 'react'
import { performanceDiagnosticService, DiagnosticResult } from '../services/performanceDiagnosticService'
import { Zap, Cpu, HardDrive, RefreshCw, Check, Activity, Timer, Gauge, Layers } from 'lucide-react'

export default function PerformanceTab() {
  const [isTesting, setIsTesting] = useState(false)
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [progress, setProgress] = useState(0)

  // RAM Graph State
  const [ramHistory, setRamHistory] = useState<number[]>(new Array(30).fill(0))
  const [currentRSS, setCurrentRSS] = useState(0)

  useEffect(() => {
    const updateRAM = async () => {
      try {
        const status = await window.electronAPI.ipcRenderer.invoke('performance:get-status')
        if (status?.memory) {
          const rss = status.memory.rss
          setCurrentRSS(rss)
          setRamHistory(prev => [...prev.slice(1), rss])
        }
      } catch (e) {
        console.error('Failed to poll RAM', e)
      }
    }

    const interval = setInterval(updateRAM, 2000)
    updateRAM()
    return () => clearInterval(interval)
  }, [])

  const runDiagnostic = async () => {
    setIsTesting(true)
    setProgress(10)

    try {
      // Small delays to simulate test phases and keep UI responsive
      setProgress(20)
      const cpu = await performanceDiagnosticService.runCPUBenchmark()
      setProgress(50)

      const ipc = await performanceDiagnosticService.measureIPCLatency()
      setProgress(70)

      const disk = await performanceDiagnosticService.measureDiskSpeed()
      setProgress(90)

      const bootTime = await window.electronAPI.ipcRenderer.invoke('performance:get-boot-time')

      const diagnosticResult: DiagnosticResult = {
        bootTime: bootTime || 0,
        ipcLatency: Math.round(ipc * 100) / 100,
        diskReadSpeed: Math.round(disk.read * 10) / 10,
        diskWriteSpeed: Math.round(disk.write * 10) / 10,
        cpuScore: cpu,
        timestamp: Date.now()
      }

      setResult(diagnosticResult)
      setProgress(100)
    } catch (e) {
      console.error('Diagnostic failed', e)
    } finally {
      setTimeout(() => {
        setIsTesting(false)
        setProgress(0)
      }, 500)
    }
  }

  const getRating = (res: DiagnosticResult) => {
    if (res.cpuScore > 1000 && res.diskReadSpeed > 1000) return { label: 'ELITE', color: '#3b82f6' }
    if (res.cpuScore > 500) return { label: 'OPTIMIZED', color: '#10b981' }
    return { label: 'STANDARD', color: '#f59e0b' }
  }

  return (
    <div className="tab-content performance-tab animate-fadeIn">
      <div className="tab-header-hero">
        <div className="hero-icon-box">
          <Activity size={24} className="text-blue-400" />
        </div>
        <div className="hero-text">
          <h3>System Performance</h3>
          <p>Diagnostic tools to measure Kalynt&apos;s responsiveness and hardware efficiency on your machine.</p>
        </div>
      </div>

      <div className="performance-grid">
        <section className="diagnostic-section glass-panel-dark">
          <div className="section-header-compact">
            <Layers size={14} />
            <span>Real-time RAM Consumption</span>
          </div>

          <div className="ram-graph-container">
            <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="ram-graph-svg">
              <defs>
                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`M 0 60 ${ramHistory.map((val, i) => {
                  const max = Math.max(...ramHistory, 1000)
                  const h = 60 - (val / max) * 50
                  return `L ${(i / (ramHistory.length - 1)) * 300} ${h}`
                }).join(' ')} L 300 60 Z`}
                fill="url(#ramGradient)"
              />
              <path
                d={ramHistory.map((val, i) => {
                  const max = Math.max(...ramHistory, 1000)
                  const h = 60 - (val / max) * 50
                  return `${i === 0 ? 'M' : 'L'} ${(i / (ramHistory.length - 1)) * 300} ${h}`
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="ram-value-overlay">
              <span className="current-val">{currentRSS} MB</span>
              <span className="label">TOTAL MEMORY</span>
            </div>
          </div>

          <div className="section-header-compact" style={{ marginTop: '24px' }}>
            <Gauge size={14} />
            <span>Core Diagnostics</span>
          </div>

          <div className="diagnostic-dashboard">
            <div className="metric-card">
              <div className="metric-icon"><Timer size={18} /></div>
              <div className="metric-data">
                <span className="label">Boot Latency</span>
                <span className="value">{result ? `${result.bootTime}ms` : '--'}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon"><RefreshCw size={18} /></div>
              <div className="metric-data">
                <span className="label">IPC Latency</span>
                <span className="value">{result ? `${result.ipcLatency}ms` : '--'}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon"><Cpu size={18} /></div>
              <div className="metric-data">
                <span className="label">CPU Rating</span>
                <span className="value">{result ? result.cpuScore : '--'}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon"><HardDrive size={18} /></div>
              <div className="metric-data">
                <span className="label">Disk Read</span>
                <span className="value">{result ? `${result.diskReadSpeed} MB/s` : '--'}</span>
              </div>
            </div>
          </div>

          <div className="diagnostic-actions">
            <button
              className={`btn-run-diagnostic ${isTesting ? 'loading' : ''}`}
              onClick={runDiagnostic}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <div className="test-progress-bar" style={{ width: `${progress}%` }} />
                  <span>Analyzing System...</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>Run Full System Check</span>
                </>
              )}
            </button>
          </div>
        </section>

        {result && (
          <section className="result-section animate-reveal-up">
            <div className="system-score-card">
              <div className="score-header">
                <Check size={20} className="text-green-400" />
                <h4>Diagnostics Complete</h4>
              </div>
              <div className="rating-badge" style={{ backgroundColor: `${getRating(result).color}20`, color: getRating(result).color }}>
                {getRating(result).label}
              </div>
              <p className="rating-desc">
                {getRating(result).label === 'ELITE'
                  ? 'Your system is perfectly optimized for large language models and high-speed indexing.'
                  : 'System performance is healthy for standard development tasks.'}
              </p>
            </div>
          </section>
        )}
      </div>

      <style>{`
        .performance-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .diagnostic-section {
          padding: 20px;
          background: rgba(255, 255, 255, 0.02);
          border: 0.5px solid rgba(59, 130, 246, 0.15);
          border-radius: 12px;
        }
        .ram-graph-container {
          position: relative;
          height: 80px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 12px;
          overflow: hidden;
        }
        .ram-graph-svg {
          width: 100%;
          height: 100%;
        }
        .ram-value-overlay {
          position: absolute;
          top: 12px;
          right: 16px;
          text-align: right;
          pointer-events: none;
        }
        .ram-value-overlay .current-val {
          display: block;
          font-size: 20px;
          font-weight: 800;
          color: white;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .ram-value-overlay .label {
          font-size: 9px;
          color: #3b82f6;
          font-weight: 700;
          letter-spacing: 0.1em;
        }
        .diagnostic-dashboard {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin: 16px 0;
        }
        .metric-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .metric-icon { color: #3b82f6; opacity: 0.8; }
        .metric-data .label { display: block; font-size: 10px; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; }
        .metric-data .value { font-size: 16px; font-weight: 700; color: white; }
        
        .btn-run-diagnostic {
          position: relative;
          width: 100%;
          height: 44px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 8px;
          color: #3b82f6;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.2s;
        }
        .btn-run-diagnostic:hover:not(:disabled) { background: rgba(59, 130, 246, 0.15); border-color: #3b82f6; }
        
        .test-progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          background: rgba(59, 130, 246, 0.2);
          transition: width 0.3s ease;
        }
        
        .system-score-card {
          padding: 24px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 16px;
          text-align: center;
        }
        .score-header { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; }
        .score-header h4 { margin: 0; font-size: 16px; color: white; }
        .rating-badge {
          display: inline-block;
          padding: 4px 16px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.1em;
          margin-bottom: 12px;
        }
        .rating-desc { font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.5; margin: 0; }
      `}</style>
    </div>
  )
}
