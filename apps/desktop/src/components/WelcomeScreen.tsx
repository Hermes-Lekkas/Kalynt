/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { 
  ArrowRight, Sparkles, 
  Code2, Terminal, FolderTree, Key, Activity, ChevronRight
} from 'lucide-react'

export default function WelcomeScreen() {
  const { version, spaces, setCurrentSpace, setShowSettings } = useAppStore()

  // Parse version string (e.g., "v1.0 beta")
  const versionInfo = useMemo(() => {
    const parts = version.split(' ')
    return {
      number: parts[0] || 'v1.0',
      label: parts[1] ? parts[1].toUpperCase() : 'BETA'
    }
  }, [version])

  return (
    <div className="welcome-container">
      {/* Background Decorative Elements */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>
      
      <div className="welcome-content">
        <div className="welcome-hero animate-reveal-up">
          <div className="hero-badge">
             <span className="pulse-dot"></span>
             {versionInfo.number} {versionInfo.label} ACTIVE
          </div>
          <h1 className="hero-title">
            The Future of <span className="gradient-text">Private Intelligence</span>
          </h1>
          <p className="hero-subtitle">
            Experience the world's first P2P-powered, end-to-end encrypted AI development environment. 
            No cloud accounts. No data harvesting. Just pure speed.
          </p>
        </div>

        <div className="welcome-layout">
          <div className="layout-main animate-reveal-up delay-100">
            <div className="features-grid">
              <div className="feature-card glass-panel">
                <div className="feature-icon-box bg-blue-500/10"><Code2 size={24} className="text-blue-400" /></div>
                <div className="feature-text">
                  <h3>Intelligent Coding</h3>
                  <p>State-of-the-art agentic workflows for refactoring and debugging.</p>
                </div>
              </div>
              <div className="feature-card glass-panel">
                  <div className="feature-icon-box bg-purple-500/10"><Terminal size={24} className="text-purple-400" /></div>
                  <div className="feature-text">
                  <h3>Local Runtime</h3>
                  <p>Execute code in secure sandboxes without leaving your machine.</p>
                </div>
              </div>
              <div className="feature-card glass-panel">
                  <div className="feature-icon-box bg-emerald-500/10"><Activity size={24} className="text-emerald-400" /></div>
                  <div className="feature-text">
                  <h3>Live Collaboration</h3>
                  <p>Peer-to-peer sync with zero latency and full encryption.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="layout-sidebar animate-reveal-up delay-100">
             <div className="action-card glass-panel highlight">
                <div className="card-bg-effect"></div>
                <div className="action-header">
                   <Sparkles size={16} className="text-yellow-400" />
                   <span>Quick Actions</span>
                </div>
                <h3>Get Started Now</h3>
                <p>Create a new workspace or continue where you left off.</p>
                
                <div className="action-buttons">
                   <button className="btn-hero-primary" onClick={() => {
                      const sidebar = document.querySelector('.add-btn') as HTMLButtonElement;
                      if (sidebar) sidebar.click();
                   }}>
                      <FolderTree size={18} />
                      <span>New Workspace</span>
                      <ArrowRight size={16} className="ml-auto" />
                   </button>
                   
                   <button className="btn-hero-secondary" onClick={() => setShowSettings(true)}>
                      <Key size={16} />
                      <span>Setup AI Keys</span>
                   </button>
                </div>

                {spaces.length > 0 && (
                   <div className="recent-spaces">
                      <div className="recent-title">Recent Workspaces</div>
                      {spaces.slice(0, 3).map(space => (
                         <div key={space.id} className="recent-item" onClick={() => setCurrentSpace(space)}>
                            <ChevronRight size={14} />
                            <span>{space.name}</span>
                         </div>
                      ))}
                   </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <style>{`
        .welcome-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px 40px 40px;
          height: 100%;
          position: relative;
          overflow-x: hidden;
          background: #000;
        }

        .bg-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.12;
          z-index: 0;
          pointer-events: none;
        }
        .bg-glow-1 { top: -150px; right: -150px; background: #3b82f6; }
        .bg-glow-2 { bottom: -150px; left: -150px; background: #8b5cf6; }

        .welcome-content {
          width: 100%;
          max-width: 1140px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 40px;
          margin: 0 auto;
        }

        .welcome-hero {
          text-align: center;
          max-width: 800px;
          margin: 0 auto;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 99px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 24px;
        }

        .pulse-dot {
          width: 6px;
          height: 6px;
          background: #4ade80;
          border-radius: 50%;
          box-shadow: 0 0 10px #4ade80;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }

        .hero-title {
          font-size: clamp(32px, 5vw, 56px);
          font-weight: 900;
          line-height: 1.1;
          letter-spacing: -0.04em;
          margin-bottom: 20px;
          color: white;
        }

        .gradient-text {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-subtitle {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.6;
          max-width: 620px;
          margin: 0 auto;
        }

        .welcome-layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 24px;
          align-items: stretch; 
        }

        .glass-panel {
          background: rgba(15, 15, 18, 0.6);
          backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .layout-main {
          display: flex;
          flex-direction: column;
        }

        .features-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
        }

        .feature-card {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 24px 32px;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .feature-card:hover {
          transform: translateX(8px);
          border-color: rgba(59, 130, 246, 0.4);
          background: rgba(59, 130, 246, 0.08);
        }

        .feature-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        }

        .feature-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: left;
        }

        .feature-card h3 {
          font-size: 18px;
          font-weight: 800;
          color: white;
          margin: 0;
        }

        .feature-card p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.5;
          margin: 0;
        }

        /* Sidebar Cards */
        .action-card {
          padding: 32px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .action-card.highlight {
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 10px 40px rgba(59, 130, 246, 0.15);
        }

        .card-bg-effect {
          position: absolute;
          top: -50px; right: -50px; width: 150px; height: 150px;
          background: #3b82f6; filter: blur(60px); opacity: 0.15;
        }

        .action-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #f59e0b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 16px;
        }

        .action-card h3 { font-size: 24px; font-weight: 900; margin-bottom: 12px; color: white; }
        .action-card p { font-size: 14px; color: rgba(255, 255, 255, 0.4); line-height: 1.5; margin-bottom: 24px; }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: auto;
        }

        .btn-hero-primary {
          width: 100%;
          padding: 16px 20px;
          background: #fff;
          color: #000;
          border-radius: 16px;
          font-weight: 800;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .btn-hero-primary:hover { transform: scale(1.02); box-shadow: 0 12px 32px rgba(255, 255, 255, 0.2); }

        .btn-hero-secondary {
          width: 100%;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .btn-hero-secondary:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }

        .recent-spaces {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .recent-title { font-size: 11px; font-weight: 800; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
        .recent-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin: 0 -8px; font-size: 13px; color: rgba(255, 255, 255, 0.5); cursor: pointer; border-radius: 10px; transition: all 0.2s; }
        .recent-item:hover { color: #3b82f6; background: rgba(59, 130, 246, 0.1); transform: translateX(4px); }

        @media (max-width: 1040px) {
          .welcome-layout { grid-template-columns: 1fr; }
          .welcome-content { gap: 32px; padding: 20px; }
          .layout-sidebar { order: -1; }
        }
      `}</style>
    </div>
  )
}
