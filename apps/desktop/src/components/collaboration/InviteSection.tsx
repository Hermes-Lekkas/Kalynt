/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Link2,
  Copy,
  Check,
  Share2,
  Key,
  Shield,
  Globe,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react'

interface InviteSectionProps {
  spaceId?: string
  spaceName?: string
  onGenerateLink: () => { url: string; code: string } | null
}

export default function InviteSection({ spaceId: _spaceId, spaceName: _spaceName, onGenerateLink }: InviteSectionProps) {
  const [inviteData, setInviteData] = useState<{ url: string; code: string } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Generate initial link
  useEffect(() => {
    if (!inviteData) {
      const data = onGenerateLink()
      if (data) {
        setInviteData(data)
      }
    }
  }, [inviteData, onGenerateLink])

  const copyToClipboard = useCallback(async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const regenerateLink = useCallback(() => {
    setIsGenerating(true)
    // Simulate generation delay
    setTimeout(() => {
      const data = onGenerateLink()
      if (data) {
        setInviteData(data)
      }
      setIsGenerating(false)
    }, 300)
  }, [onGenerateLink])

  if (!inviteData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Share2 size={28} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Invite Team Members</h3>
          <p className="text-sm text-neutral-400">
            Share this link or room code to collaborate with others
          </p>
        </div>

        {/* Room Code Card */}
        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-900/20 border border-blue-500/20 rounded-2xl p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-500/5" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Key size={16} className="text-blue-400" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Room Code</span>
            </div>
            
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="font-mono text-4xl font-bold text-blue-400 tracking-widest">
                {showCode ? inviteData.code : inviteData.code.replace(/./g, '•')}
              </span>
              <button
                onClick={() => setShowCode(!showCode)}
                className="p-2 text-blue-400/50 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-all"
                title={showCode ? 'Hide code' : 'Show code'}
              >
                {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              onClick={() => copyToClipboard(inviteData.code, 'code')}
              className="w-full py-2.5 px-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium rounded-xl border border-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              {copiedCode ? <Check size={16} /> : <Copy size={16} />}
              {copiedCode ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>

        {/* Invite Link Section */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <Link2 size={20} className="text-neutral-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">Invitation Link</div>
              <div className="text-xs text-neutral-500 truncate">{inviteData.url}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(inviteData.url, 'link')}
              className="flex-1 py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
            >
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={regenerateLink}
              disabled={isGenerating}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-neutral-400 rounded-xl border border-white/10 transition-all disabled:opacity-50"
              title="Regenerate link"
            >
              <RefreshCw size={18} className={isGenerating ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Security Info */}
        <div className="bg-neutral-800/30 border border-white/5 rounded-2xl p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
            <Shield size={16} className="text-green-400" />
            Security & Privacy
          </h4>
          
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Key size={16} className="text-green-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-300 font-medium mb-0.5">End-to-End Encryption</div>
                <p className="text-xs text-neutral-500">
                  All communications are encrypted. Share passwords separately for added security.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Globe size={16} className="text-blue-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-300 font-medium mb-0.5">P2P Direct Connection</div>
                <p className="text-xs text-neutral-500">
                  Data flows directly between peers without central servers.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="text-center">
          <p className="text-xs text-neutral-500">
            Tip: You can share either the link or the room code - both work the same way!
          </p>
        </div>
      </div>
    </div>
  )
}
