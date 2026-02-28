/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import {
  Puzzle, Home, Activity, Code2,
  FolderTree, History, Settings,
  Minimize, Square, X, Users,
  Pin, PinOff
} from 'lucide-react'
import PluginsPanel from './PluginsPanel'
import UpdateButton from './UpdateButton'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

// AI Logos as SVG Components
const AnthropicLogo = () => (
  <svg width="18" height="18" viewBox="0 0 512 509.64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#D77655" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z" />
    <path fill="#FCF2EE" fillRule="nonzero" d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z" />
  </svg>
)

const ChatGPTLogo = () => (
  <svg width="18" height="18" viewBox="0 0 512 509.639" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#fff" d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.613-115.613 115.613H115.612C52.026 509.64 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z" />
    <path fill="#000" fillRule="nonzero" d="M412.037 221.764a90.834 90.834 0 004.648-28.67 90.79 90.79 0 00-12.443-45.87c-16.37-28.496-46.738-46.089-79.605-46.089-6.466 0-12.943.683-19.264 2.04a90.765 90.765 0 00-67.881-30.515h-.576c-.059.002-.149.002-.216.002-39.807 0-75.108 25.686-87.346 63.554-25.626 5.239-47.748 21.31-60.682 44.03a91.873 91.873 0 00-12.407 46.077 91.833 91.833 0 0023.694 61.553 90.802 90.802 0 00-4.649 28.67 90.804 90.804 0 0012.442 45.87c16.369 28.504 46.74 46.087 79.61 46.087a91.81 91.81 0 0019.253-2.04 90.783 90.783 0 0067.887 30.516h.576l.234-.001c39.829 0 75.119-25.686 87.357-63.588 25.626-5.242 47.748-21.312 60.682-44.033a91.718 91.718 0 0012.383-46.035 91.83 91.83 0 00-23.693-61.553l-.004-.005zM275.102 413.161h-.094a68.146 68.146 0 01-43.611-15.8 56.936 56.936 0 002.155-1.221l72.54-41.901a11.799 11.799 0 005.962-10.251V241.651l30.661 17.704c.326.163.55.479.596.84v84.693c-.042 37.653-30.554 68.198-68.21 68.273h.001zm-146.689-62.649a68.128 68.128 0 01-9.152-34.085c0-3.904.341-7.817 1.005-11.663.539.323 1.48.897 2.155 1.285l72.54 41.901a11.832 11.832 0 0011.918-.002l88.563-51.137v35.408a1.1 1.1 0 01-.438.94l-73.33 42.339a68.43 68.43 0 01-34.11 9.12 68.359 68.359 0 01-59.15-34.11l-.001.004zm-19.083-158.36a68.044 68.044 0 0135.538-29.934c0 .625-.036 1.731-.036 2.5v83.801l-.001.07a11.79 11.79 0 005.954 10.242l88.564 51.13-30.661 17.704a1.096 1.096 0 01-1.034.093l-73.337-42.375a68.36 68.36 0 01-34.095-59.143 68.412 68.412 0 019.112-34.085l-.004-.003zm251.907 58.621l-88.563-51.137 30.661-17.697a1.097 1.097 0 011.034-.094l73.337 42.339c21.109 12.195 34.132 34.746 34.132 59.132 0 28.604-17.849 54.199-44.686 64.078v-86.308c.004-.032.004-.065.004-.096 0-4.219-2.261-8.119-5.919-10.217zm30.518-45.93c-.539-.331-1.48-.898-2.155-1.286l-72.54-41.901a11.842 11.842 0 00-5.958-1.611c-2.092 0-4.15.558-5.957 1.611l-88.564 51.137v-35.408l-.001-.061a1.1 1.1 0 01.44-.88l73.33-42.303a68.301 68.301 0 0134.108-9.129c37.704 0 68.281 30.577 68.281 68.281a68.69 68.69 0 01-.984 11.545v.005zm-191.843 63.109l-30.668-17.704a1.09 1.09 0 01-.596-.84v-84.692c.016-37.685 30.593-68.236 68.281-68.236a68.332 68.332 0 0143.689 15.804 63.09 63.09 0 00-2.155 1.222l-72.54 41.9a11.794 11.794 0 00-5.961 10.248v.068l-.05 102.23zm16.655-35.91l39.445-22.782 39.444 22.767v45.55l-39.444 22.767-39.445-22.767v-45.535z" />
  </svg>
)

const GeminiLogo = () => (
  <svg width="20" height="20" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
    <mask id="maskme" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="65" height="65">
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="#000" />
    </mask>
    <g mask="url(#maskme)">
      <g filter="url(#prefix__filter0_f_2001_67)"><path d="M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z" fill="#FFE432" /></g>
      <g filter="url(#prefix__filter1_f_2001_67)"><path d="M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z" fill="#FC413D" /></g>
      <g filter="url(#prefix__filter2_f_2001_67)"><path d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z" fill="#00B95C" /></g>
      <g filter="url(#prefix__filter5_f_2001_67)"><path d="M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z" fill="#3186FF" /></g>
      <g filter="url(#prefix__filter6_f_2001_67)"><path d="M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z" fill="#FBBC04" /></g>
      <g filter="url(#prefix__filter7_f_2001_67)"><path d="M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z" fill="#3186FF" /></g>
    </g>
    <defs>
      <filter id="prefix__filter0_f_2001_67" x="-19.824" y="13.152" width="39.274" height="43.217" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="2.46" result="effect1_foregroundBlur_2001_67" /></filter>
      <filter id="prefix__filter1_f_2001_67" x="-15.001" y="-40.257" width="84.868" height="85.688" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="11.891" result="effect1_foregroundBlur_2001_67" /></filter>
      <filter id="prefix__filter2_f_2001_67" x="-20.776" y="11.927" width="79.454" height="90.916" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur_2001_67" /></filter>
      <filter id="prefix__filter5_f_2001_67" x="29.832" y="-11.552" width="75.117" height="73.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="9.606" result="effect1_foregroundBlur_2001_67" /></filter>
      <filter id="prefix__filter6_f_2001_67" x="-38.583" y="-16.253" width="78.135" height="78.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="8.706" result="effect1_foregroundBlur_2001_67" /></filter>
      <filter id="prefix__filter7_f_2001_67" x="8.107" y="-5.966" width="78.877" height="77.539" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="7.775" result="effect1_foregroundBlur_2001_67" /></filter>
    </defs>
  </svg>
)

interface TitlebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onShowExtensions?: () => void
  onShowCollaboration?: () => void
}

export default function Titlebar({ activeTab, onTabChange, onShowCollaboration }: TitlebarProps) {
  const { currentSpace, setShowSettings } = useAppStore()
  const [showPlugins, setShowPlugins] = useState(false)
  const [notchPinned, setNotchPinned] = useState(true)

  const handleMinimize = () => {
    window.dispatchEvent(new Event('kalynt-minimize'))
  }

  const handleMaximize = () => {
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow()
    }
  }

  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow()
    }
  }

  return (
    <header className="titlebar drag-region">
      {/* Left Section: Branding & Navigation */}
      <div className="titlebar-left no-drag">
        <div className="app-identity">
          <img src="/Kalynt.png" alt="Kalynt" className="app-icon-top" />
          <span className="app-name">Kalynt</span>
        </div>

        <nav className="tab-nav">
          {!currentSpace ? (
            <button className="tab-item active">
              <Home size={14} />
              <span>Welcome</span>
            </button>
          ) : (
            <div className="nav-group-container">
              <div
                className="active-highlight"
                style={{
                  width: 'calc((100% - 6px) / 4)',
                  transform: `translateX(calc(100% * ${activeTab === 'editor' ? 0 :
                    activeTab === 'tasks' ? 1 :
                      activeTab === 'history' ? 2 : 3
                    }))`
                }}
              />
              <TabItem
                active={activeTab === 'editor'}
                onClick={() => onTabChange('editor')}
                icon={<Code2 size={14} />}
                label="Editor"
              />
              <TabItem
                active={activeTab === 'tasks'}
                onClick={() => onTabChange('tasks')}
                icon={<Activity size={14} />}
                label="Tasks"
              />
              <TabItem
                active={activeTab === 'history'}
                onClick={() => onTabChange('history')}
                icon={<History size={14} />}
                label="History"
              />
              <TabItem
                active={activeTab === 'files'}
                onClick={() => onTabChange('files')}
                icon={<FolderTree size={14} />}
                label="Files"
              />
            </div>
          )}
        </nav>
      </div>

      {/* Center Section: Mac-style Notch */}
      <div className={`titlebar-notch no-drag ${notchPinned ? 'pinned' : 'autohide'}`}>
        <div className="notch-content">
          <button className="notch-icon-btn" onClick={() => setNotchPinned(!notchPinned)} title={notchPinned ? "Unpin Notch (Auto-hide)" : "Pin Notch"}>
            {notchPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <div className="notch-divider" />
          <button className="notch-icon-btn" onClick={() => window.electronAPI?.shell?.openExternal('https://claude.ai')} title="Anthropic Claude">
            <AnthropicLogo />
          </button>
          <button className="notch-icon-btn" onClick={() => window.electronAPI?.shell?.openExternal('https://chatgpt.com')} title="ChatGPT">
            <ChatGPTLogo />
          </button>
          <button className="notch-icon-btn" onClick={() => window.electronAPI?.shell?.openExternal('https://gemini.google.com')} title="Google Gemini">
            <GeminiLogo />
          </button>
          <div className="notch-divider" />
          <button
            className="notch-icon-btn"
            onClick={() => setShowSettings(true)}
            title="System Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Right Section: Status & Controls */}
      <div className="titlebar-right no-drag">
        <div className="action-buttons">
          <button
            className="header-icon-action"
            onClick={() => {
              console.log('[Titlebar] Triggering collaboration');
              onShowCollaboration?.();
            }}
            title="Team & Collaboration"
          >
            <Users size={16} />
          </button>
          <button
            className="header-icon-action"
            onClick={() => setShowPlugins(true)}
            title="Plugins & Extensions"
          >
            <Puzzle size={16} />
          </button>
          <div className="v-divider" />
          <UpdateButton />
        </div>

        <div className="window-controls-mac">
          <button className="mac-btn close" onClick={handleClose} title="Close"><X size={8} /></button>
          <button className="mac-btn minimize" onClick={handleMinimize} title="Minimize"><Minimize size={8} /></button>
          <button className="mac-btn maximize" onClick={handleMaximize} title="Maximize"><Square size={8} /></button>
        </div>
      </div>

      {showPlugins && <PluginsPanel onClose={() => setShowPlugins(false)} />}

      <style>{`
        .titlebar {
          height: var(--header-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: var(--color-bg);
          backdrop-filter: blur(40px) saturate(150%);
          border-bottom: 1px solid var(--color-border);
          z-index: 10000;
          position: relative;
        }

        /* Branding */
        .titlebar-left {
          display: flex;
          align-items: center;
          gap: 32px;
          flex: 1;
        }

        .app-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .app-icon-top {
          width: 22px;
          height: 22px;
          object-fit: contain;
          filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.3));
        }

        .app-name {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--color-text);
        }

        /* Navigation */
        .nav-group-container {
          display: flex;
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          padding: 3px;
          border-radius: 100px;
          position: relative;
        }

        .active-highlight {
          position: absolute;
          top: 3px;
          bottom: 3px;
          left: 3px;
          background: var(--color-text);
          border-radius: 100px;
          transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          z-index: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .tab-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 700;
          color: var(--color-text-tertiary);
          border-radius: 100px;
          transition: color 0.3s ease;
          position: relative;
          z-index: 1;
          flex: 1;
          justify-content: center;
        }

        .tab-item:hover {
          color: var(--color-text);
        }

        .tab-item.active {
          color: var(--color-bg);
        }

        /* Mac-style Notch - Always Premium Dark */
        .titlebar-notch {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          height: 30px;
          background: linear-gradient(180deg, rgba(20, 20, 25, 1) 0%, rgba(10, 10, 15, 1) 100%);
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 12px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 15px rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-top: none;
          z-index: 10001;
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }

        .titlebar-notch.autohide {
          transform: translateX(-50%) translateY(-28px);
          opacity: 0;
        }

        /* Hover target expansion for autohide mode */
        .titlebar-notch.autohide::after {
          content: '';
          position: absolute;
          bottom: -20px;
          left: 0;
          right: 0;
          height: 20px;
          background: transparent;
        }

        .titlebar-notch.autohide:hover {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
          height: 32px;
        }

        .titlebar-notch.pinned {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }

        .titlebar-notch.pinned:hover {
          box-shadow: 0 4px 25px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.25);
          border-color: rgba(59, 130, 246, 0.4);
          height: 32px;
        }

        .notch-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .notch-icon-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 5px;
          border-radius: 8px;
        }

        .notch-icon-btn:hover {
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.15);
          transform: scale(1.1);
          filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4));
        }

        .notch-divider {
          width: 1px;
          height: 16px;
          background: rgba(255, 255, 255, 0.08);
          margin: 0 2px;
        }

        /* Right Side */
        .titlebar-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .header-icon-action {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .header-icon-action:hover {
          background: var(--color-glass);
          color: var(--color-text);
        }

        .header-icon-action svg {
          stroke: currentColor;
        }

        .v-divider {
          width: 1px;
          height: 16px;
          background: var(--color-border);
          margin: 0 8px;
        }

        .window-controls-mac {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 8px;
        }

        .mac-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: default;
          transition: all 0.2s;
        }

        .mac-btn svg {
          opacity: 0;
          color: rgba(0, 0, 0, 0.5);
          transition: opacity 0.2s;
        }

        .window-controls-mac:hover .mac-btn svg {
          opacity: 1;
        }

        .mac-btn.close { background: #FF5F56; border: 0.5px solid rgba(0, 0, 0, 0.1); }
        .mac-btn.minimize { background: #FFBD2E; border: 0.5px solid rgba(0, 0, 0, 0.1); }
        .mac-btn.maximize { background: #27C93F; border: 0.5px solid rgba(0, 0, 0, 0.1); }

        .mac-btn.close:active { background: #bf4942; }
        .mac-btn.minimize:active { background: #bf8e22; }
        .mac-btn.maximize:active { background: #1d9730; }
      `}</style>
    </header>
  )
}

function TabItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button className={`tab-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
