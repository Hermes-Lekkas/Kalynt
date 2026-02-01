/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Titlebar from './components/Titlebar'
import MainContent from './components/MainContent'
import WelcomeScreen from './components/WelcomeScreen'
import { useAppStore } from './stores/appStore'
import { useUpdateStore } from './stores/updateStore'
import { EncryptionProvider } from './hooks/useEncryption'
import { NotificationSystem } from './components/NotificationSystem'
import UpdateModal from './components/UpdateModal'
import { setModelsDirectory } from './services/modelDownloadService'
import { logger } from './utils/logger'

type Tab = 'editor' | 'tasks' | 'files' | 'history'

import { StartupLayout } from './components/StartupLayout'
import './styles/window-animations.css'

// ... existing imports ...

function App() {
  const { currentSpace, initialize, _hasHydrated, startupStatus } = useAppStore()
  const { initialize: initializeUpdates } = useUpdateStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isSplashComplete, setIsSplashComplete] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('editor')

  // Handle Minimize Animation
  const [isMinimizing, setIsMinimizing] = useState(false)

  useEffect(() => {
    const handleMinimizeRequest = () => {
      // Calculate distance to bottom-center of screen (typical taskbar icon location)
      const screenWidth = window.screen.availWidth
      const screenHeight = window.screen.availHeight

      // Target: Bottom Center
      const targetX = screenWidth / 2
      const targetY = screenHeight

      // Calculate relative travel distance from window's current center to target
      const winCenterX = window.screenX + (window.innerWidth / 2)

      const travelX = targetX - winCenterX
      const travelY = targetY - window.screenY // Distance from top of window to bottom of screen

      document.documentElement.style.setProperty('--genie-travel-x', `${travelX}px`)
      document.documentElement.style.setProperty('--genie-travel-y', `${travelY}px`)

      setIsMinimizing(true)

      // Wait for CPU-optimized v9 animation to complete
      setTimeout(() => {
        if (window.electronAPI?.minimizeWindow) {
          window.electronAPI.minimizeWindow()
        }
        // Reset state
        setTimeout(() => setIsMinimizing(false), 200)
      }, 600)
    }

    window.addEventListener('kalynt-minimize', handleMinimizeRequest)
    return () => window.removeEventListener('kalynt-minimize', handleMinimizeRequest)
  }, [])

  useEffect(() => {
    logger.general.debug('App hydration state', { _hasHydrated })

    // Set a timeout to force initialization even if hydration doesn't complete
    const timeoutId = setTimeout(() => {
      if (!_hasHydrated) {
        logger.general.warn('Hydration timeout - forcing initialization')
        const init = async () => {
          await initialize()
          setIsLoading(false)
        }
        init()
      }
    }, 1000)

    if (_hasHydrated) {
      clearTimeout(timeoutId)
      const init = async () => {
        logger.general.info('Initializing after hydration')
        await initialize()
        setTimeout(() => setIsLoading(false), 300)
      }
      init()
    }

    return () => clearTimeout(timeoutId)
  }, [initialize, _hasHydrated])

  useEffect(() => {
    async function initModels() {
      if (window.electronAPI?.getModelsDirectory) {
        try {
          const dir = await window.electronAPI.getModelsDirectory()
          setModelsDirectory(dir)
          logger.general.info('Models directory set', { dir })
        } catch (error) {
          logger.general.error('Failed to get models directory', error)
        }
      }
    }
    initModels()
  }, [])

  // Handle Deep Links
  useEffect(() => {
    if (window.electronAPI?.on) {
      window.electronAPI.on('deep-link', (url: string) => {
        logger.general.info('Received deep link', { url })
        // We'll let CollaborationPanel or a global handler process this
        // For now, let's just expose it via an event or store
        // Actually, simplest is to dispatch a custom DOM event that components can listen to
        window.dispatchEvent(new CustomEvent('kalynt-deep-link', { detail: { url } }))
      })
    }
  }, [])

  // Initialize auto-update system
  useEffect(() => {
    const initUpdate = async () => {
      try {
        logger.general.info('Initializing auto-update system')
        await initializeUpdates()
      } catch (error) {
        logger.general.error('Failed to initialize auto-update system', error)
      }
    }
    initUpdate()
  }, [initializeUpdates])

  // Show Startup Animation until both App is ready AND Animation finishes
  if (!isSplashComplete) {
    return <StartupLayout
      isAppReady={!isLoading}
      currentStatus={startupStatus}
      onComplete={() => setIsSplashComplete(true)}
    />
  }

  // Show workspace if currentSpace is set (free beta - no subscription required)
  const showWorkspace = currentSpace !== null

  return (
    <EncryptionProvider spaceId={currentSpace?.id ?? null}>
      <div className={`app ${isMinimizing ? 'genie-minimizing' : ''}`}>
        <Titlebar activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="app-body">
          <Sidebar />
          <main className="main">
            {showWorkspace ? <MainContent activeTab={activeTab} /> : <WelcomeScreen />}
          </main>
        </div>
        <style>{`
          .app {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: var(--color-bg);
          }
          .app-body {
            display: flex;
            flex: 1;
            overflow: hidden;
            background: var(--color-bg);
          }
          .main {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            position: relative;
          }
        `}</style>
        <NotificationSystem />
        <UpdateModal />
      </div>
    </EncryptionProvider>
  )
}

export default App
