/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore, AI_PROVIDERS } from '../stores/appStore'
import { Check } from 'lucide-react'

export default function WelcomeScreen() {
  const { apiKeys, setAPIKey, removeAPIKey } = useAppStore()
  const [showAPISetup, setShowAPISetup] = useState(false)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')

  const handleSaveKey = (providerId: string) => {
    if (keyInput.trim()) {
      setAPIKey(providerId, keyInput.trim())
    }
    setEditingProvider(null)
    setKeyInput('')
  }

  return (
    <div className="welcome">
      <div className="welcome-content animate-fadeIn">
        <div className="welcome-header">
          <h1>Kalynt</h1>
          <p className="tagline">Serverless collaboration. Peer-to-peer sync. Your data stays yours.</p>
          <div className="beta-badge">Free Beta</div>
        </div>

        {showAPISetup ? (
          <div className="api-setup">
            <div className="setup-header">
              <h2>API Keys</h2>
              <button className="btn btn-ghost" onClick={() => setShowAPISetup(false)}>Done</button>
            </div>
            <p className="setup-desc">Add your own API keys to use AI features. Keys are stored locally.</p>

            <div className="providers-list">
              {Object.values(AI_PROVIDERS).map((provider) => {
                const hasKey = !!apiKeys[provider.id as keyof typeof apiKeys]
                const isEditing = editingProvider === provider.id

                return (
                  <div key={provider.id} className="provider-card">
                    <div className="provider-header">
                      <span className="provider-name">{provider.name}</span>
                      {hasKey && <span className="configured-badge"><Check size={14} /></span>}
                    </div>

                    <div className="provider-models">
                      {provider.models.slice(0, 3).join(', ')}
                      {provider.models.length > 3 && ` +${provider.models.length - 3}`}
                    </div>

                    {isEditing ? (
                      <div className="key-input-row">
                        <input
                          type="password"
                          className="input"
                          placeholder={provider.keyPlaceholder}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(provider.id)}
                          autoFocus
                        />
                        <button className="btn btn-primary" onClick={() => handleSaveKey(provider.id)}>Save</button>
                        <button className="btn btn-ghost" onClick={() => { setEditingProvider(null); setKeyInput(''); }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="key-actions">
                        {hasKey ? (
                          <>
                            <span className="key-masked">â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢</span>
                            <button className="btn btn-ghost" onClick={() => { setEditingProvider(provider.id); setKeyInput(''); }}>Change</button>
                            <button className="btn btn-ghost" onClick={() => removeAPIKey(provider.id)}>Remove</button>
                          </>
                        ) : (
                          <button className="btn btn-secondary" onClick={() => setEditingProvider(provider.id)}>Add Key</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="features-grid">
              <div className="feature-card">
                <h3>Unlimited Everything</h3>
                <p>No limits on workspaces, collaborators, or AI models during beta</p>
              </div>
              <div className="feature-card">
                <h3>All AI Providers</h3>
                <p>OpenAI, Anthropic, Google AI - bring your own keys</p>
              </div>
              <div className="feature-card">
                <h3>Full Encryption</h3>
                <p>E2E encryption â€¢ P2P sync â€¢ Your data never leaves your machine</p>
              </div>
            </div>



            <div className="included">
              <span>Free Beta:</span> Unlimited workspaces â€¢ Unlimited collaborators â€¢ E2E encryption â€¢ P2P sync â€¢ BYOK (Bring Your Own Keys)
            </div>
          </>
        )}

        <div className="cta">
          <p>Create a workspace to get started</p>
        </div>
      </div>

      <style>{`
        .welcome {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          overflow-y: auto;
        }

        .welcome-content {
          max-width: 900px;
          text-align: center;
        }

        .welcome-header {
          margin-bottom: var(--space-6);
        }

        .welcome-header h1 {
          font-size: var(--text-3xl);
          font-weight: var(--font-bold);
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-middle));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.04em;
          margin-bottom: var(--space-3);
        }

        .tagline {
          font-size: var(--text-base);
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin-bottom: var(--space-3);
        }

        .beta-badge {
          display: inline-block;
          padding: 4px 12px;
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
          color: white;
          border-radius: var(--radius-pill);
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          box-shadow: var(--shadow-glow);
        }

        .api-setup {
          text-align: left;
          padding: var(--space-5);
          background: var(--color-glass);
          backdrop-filter: blur(var(--backdrop-blur));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-xl);
          margin-bottom: var(--space-4);
          box-shadow: var(--shadow-lg);
        }

        .setup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .setup-header h2 {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text);
        }

        .setup-desc {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          margin-bottom: var(--space-4);
        }

        .providers-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .provider-card {
          padding: var(--space-4);
          background: var(--color-glass);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-lg);
          transition: all var(--transition-base);
        }

        .provider-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }

        .provider-card.locked {
          opacity: 0.5;
        }

        .provider-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-1);
        }

        .provider-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }

        .locked-badge {
          font-size: 10px;
          padding: 2px 6px;
          background: var(--color-surface);
          border-radius: var(--radius-sm);
          color: var(--color-text-muted);
        }

        .configured-badge {
          color: var(--color-success);
        }

        .provider-models {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .key-input-row {
          display: flex;
          gap: var(--space-2);
        }

        .key-input-row .input {
          flex: 1;
          height: 32px;
        }

        .key-input-row .btn {
          height: 32px;
          font-size: var(--text-xs);
        }

        .key-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .key-masked {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .key-actions .btn {
          height: 28px;
          font-size: var(--text-xs);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }

        .feature-card {
          padding: var(--space-5);
          background: var(--color-glass);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-xl);
          text-align: center;
          transition: all var(--transition-base);
        }

        .feature-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 8px 32px rgba(59, 130, 246, 0.15);
        }

        .feature-card h3 {
          font-size: var(--text-lg);
          font-weight: var(--font-bold);
          background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-middle));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: var(--space-2);
        }

        .feature-card p {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          line-height: 1.6;
        }



        .included {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          padding: var(--space-3) var(--space-4);
          background: var(--color-glass);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-4);
          line-height: 1.6;
        }

        .included span {
          font-weight: var(--font-semibold);
          color: var(--color-accent);
        }

        .cta p {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  )
}
