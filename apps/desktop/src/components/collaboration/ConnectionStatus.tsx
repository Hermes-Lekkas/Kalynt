/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react'
import type { ConnectionDiagnostics } from './types'

interface ConnectionStatusProps {
  status: ConnectionDiagnostics
  onTestConnection: () => Promise<{ stun: boolean; turn: boolean; candidates: { type: string; protocol: string }[] }>
  onReconnect: () => void
}

export default function ConnectionStatus({
  status,
  onTestConnection,
  onReconnect
}: ConnectionStatusProps) {
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    stun: boolean
    turn: boolean
    candidates: { type: string; protocol: string }[]
  } | null>(null)

  const handleTest = async () => {
    setIsTesting(true)
    try {
      const result = await onTestConnection()
      setTestResult(result)
    } catch {
      setTestResult(null)
    } finally {
      setIsTesting(false)
    }
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'connected':
        return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'connecting':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
      case 'error':
        return 'text-red-400 bg-red-500/10 border-red-500/20'
      default:
        return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20'
    }
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'connected':
        return <Wifi size={24} />
      case 'connecting':
        return <Loader2 size={24} className="animate-spin" />
      case 'error':
        return <WifiOff size={24} />
      default:
        return <WifiOff size={24} />
    }
  }

  const getLatencyColor = () => {
    if (status.latencyMs === 0) return 'text-neutral-500'
    if (status.latencyMs < 100) return 'text-green-400'
    if (status.latencyMs < 300) return 'text-yellow-400'
    return 'text-red-400'
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header Status */}
        <div className={`rounded-2xl p-6 border ${getStatusColor()}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/5 rounded-xl">
              {getStatusIcon()}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold capitalize">
                {status.status === 'connected' ? 'Connected' : status.status}
              </h3>
              <p className="text-sm opacity-80">
                {status.status === 'connected'
                  ? `${status.peerCount} peer${status.peerCount !== 1 ? 's' : ''} connected`
                  : status.status === 'connecting'
                  ? 'Establishing connection...'
                  : 'Not connected to P2P network'}
              </p>
            </div>
            {status.status !== 'connected' && (
              <button
                onClick={onReconnect}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Reconnect"
              >
                <RefreshCw size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Latency */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <Zap size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">Latency</span>
            </div>
            <div className={`text-2xl font-semibold ${getLatencyColor()}`}>
              {status.latencyMs === 0 ? '--' : `${status.latencyMs}ms`}
            </div>
          </div>

          {/* Peers */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <Activity size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">Peers</span>
            </div>
            <div className="text-2xl font-semibold text-white">
              {status.peerCount}
            </div>
          </div>

          {/* Data Sent */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <ArrowUpRight size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">Sent</span>
            </div>
            <div className="text-lg font-semibold text-white">
              {formatBytes(status.bytesSent)}
            </div>
          </div>

          {/* Data Received */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <ArrowDownRight size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">Received</span>
            </div>
            <div className="text-lg font-semibold text-white">
              {formatBytes(status.bytesReceived)}
            </div>
          </div>
        </div>

        {/* Connection Details */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Connection Details</h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Signaling State</span>
              <span className={`text-sm capitalize ${
                status.signalingState === 'connected' ? 'text-green-400' : 'text-neutral-300'
              }`}>
                {status.signalingState}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">ICE Servers</span>
              <span className="text-sm text-neutral-300">{status.iceServers} configured</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">TURN Relay</span>
              <span className={`text-sm ${status.turnEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
                {status.turnEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Connection Test */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">Connection Test</h4>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {isTesting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Activity size={14} />
                  Test Now
                </>
              )}
            </button>
          </div>

          {testResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">STUN Servers</span>
                {testResult.stun ? (
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle2 size={14} />
                    Working
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-red-400">
                    <XCircle size={14} />
                    Failed
                  </span>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">TURN Servers</span>
                {testResult.turn ? (
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle2 size={14} />
                    Working
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-yellow-400">
                    <AlertCircle size={14} />
                    Limited
                  </span>
                )}
              </div>

              <div className="mt-3 p-3 bg-white/5 rounded-lg">
                <div className="text-xs text-neutral-500 mb-2">Discovered {testResult.candidates.length} ICE candidates</div>
                <div className="flex flex-wrap gap-2">
                  {testResult.candidates.slice(0, 5).map((candidate, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-1 bg-white/10 rounded-full text-neutral-400"
                    >
                      {candidate.type}/{candidate.protocol}
                    </span>
                  ))}
                  {testResult.candidates.length > 5 && (
                    <span className="text-[10px] px-2 py-1 text-neutral-500">
                      +{testResult.candidates.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              Run a connection test to diagnose P2P connectivity issues.
            </p>
          )}
        </div>

        {/* Tips */}
        <div className="text-center">
          <p className="text-xs text-neutral-500">
            Having connection issues? Make sure your firewall allows WebRTC connections.
          </p>
        </div>
      </div>
    </div>
  )
}
