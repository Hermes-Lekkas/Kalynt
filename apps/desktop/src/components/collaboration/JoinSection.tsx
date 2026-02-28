/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import {
  Search,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Globe,
  Lock
} from 'lucide-react'

interface JoinSectionProps {
  onJoin: (input: string, password?: string) => Promise<void>
  isJoining: boolean
  error: string | null
}

export default function JoinSection({ onJoin, isJoining, error }: JoinSectionProps) {
  const [input, setInput] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'input' | 'confirm'>('input')
  const [parsedData, setParsedData] = useState<{
    roomId: string
    password?: string
    spaceName?: string
  } | null>(null)
  const [localError, setLocalError] = useState<string | null>(error)

  const handleParseInput = () => {
    setLocalError(null)
    const trimmed = input.trim()

    if (!trimmed) {
      setLocalError('Please enter a room code or invite link')
      return
    }

    // Check for protocol
    if (trimmed.includes(':') && !trimmed.startsWith('kalynt://')) {
      setLocalError('Invalid protocol. Only kalynt:// links are supported.')
      return
    }

    // Try to parse as link
    if (trimmed.startsWith('kalynt://')) {
      try {
        const url = new URL(trimmed)
        const roomId = url.pathname.split('/').pop()
        const hashParams = new URLSearchParams(url.hash.slice(1))
        const password = hashParams.get('p') || undefined
        const spaceName = hashParams.get('n') || undefined

        if (roomId) {
          setParsedData({ roomId, password, spaceName })
          if (password) {
            setPassword(password)
          }
          setStep('confirm')
          return
        }
      } catch {
        // Fall through to room code handling
      }
    }

    // Treat as room code
    if (trimmed.length <= 50) {
      setParsedData({ roomId: trimmed.toLowerCase() })
      setStep('confirm')
      return
    }

    setLocalError('Invalid input. Please enter a valid room code or invite link.')
  }

  const handleJoin = async () => {
    if (!parsedData) return

    try {
      await onJoin(input.trim(), password || undefined)
    } catch {
      // Error is handled by parent
    }
  }

  const handleBack = () => {
    setStep('input')
    setParsedData(null)
    setPassword('')
    setLocalError(null)
  }

  if (step === 'confirm' && parsedData) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-green-500/20">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>

          <h3 className="text-xl font-semibold text-white text-center mb-2">
            Workspace Found
          </h3>
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
              <Globe size={14} className="text-blue-400" />
              <span className="font-mono text-sm text-blue-300">
                {parsedData.roomId.slice(0, 16)}...
              </span>
            </div>
            {parsedData.spaceName && (
              <p className="text-sm text-neutral-400 mt-2">
                {parsedData.spaceName}
              </p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-2 ml-1">
                Workspace Password {parsedData.password ? '(pre-filled from link)' : '(if required)'}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="Enter password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-green-500/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Error */}
            {(localError || error) && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{localError || error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className="flex-[2] py-3 px-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isJoining ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Join Workspace
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
          <Search size={32} className="text-blue-400" />
        </div>

        <h3 className="text-xl font-semibold text-white text-center mb-2">
          Join Workspace
        </h3>
        <p className="text-sm text-neutral-400 text-center mb-8">
          Enter an invite link or room code to connect with your team
        </p>

        {/* Input */}
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setLocalError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleParseInput()}
              placeholder="Paste link or enter code..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
              autoFocus
            />
          </div>

          {/* Error */}
          {localError && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {/* Continue Button */}
          <button
            onClick={handleParseInput}
            disabled={!input.trim() || isJoining}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
          >
            Continue
            <ArrowRight size={18} />
          </button>
        </div>

        {/* Tips */}
        <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/5">
          <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Where to find your code
          </h4>
          <ul className="space-y-2 text-xs text-neutral-500">
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Ask your team admin for an invite link
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Check your email for an invitation
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Room codes are 8-12 characters long
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
