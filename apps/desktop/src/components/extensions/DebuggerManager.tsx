/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useEffect } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { Download, AlertCircle, Loader2 } from 'lucide-react'

/**
 * DebuggerManager
 * 
 * Component to handle automated debugger installation and updates.
 */
export const DebuggerManager = () => {
    const { addNotification } = useNotificationStore()
    const [missingAdapter, setMissingAdapter] = useState<any>(null)
    const [installing, setInstalling] = useState(false)

    useEffect(() => {
        if (!window.electronAPI?.on) return

        const removeListener = window.electronAPI.on('debug:adapter-missing', (data: any) => {
            setMissingAdapter(data)
        })

        return () => removeListener()
    }, [])

    const handleInstall = async () => {
        if (!missingAdapter) return
        setInstalling(true)
        
        try {
            // Map debugger types to runtime IDs for the RuntimeManager
            const typeMap: Record<string, string> = {
                'python': 'python',
                'debugpy': 'python',
                'go': 'go',
                'delve': 'go',
                'rust': 'rust',
                'lldb': 'rust'
            }

            const runtimeId = typeMap[missingAdapter.type] || missingAdapter.requiredBinary
            
            addNotification(`Starting installation of ${missingAdapter.type} debugger...`, 'info')
            
            // Trigger download and install via runtimeMgmt API
            const result = await window.electronAPI.runtimeMgmt.downloadAndInstall(runtimeId)
            
            if (result.success) {
                addNotification(`${missingAdapter.type} debugger installed successfully!`, 'success')
                setMissingAdapter(null)
            } else {
                addNotification(`Installation failed: ${result.error}`, 'error')
            }
        } catch (e: any) {
            addNotification(`Error: ${e.message}`, 'error')
        } finally {
            setInstalling(false)
        }
    }

    if (!missingAdapter) return null

    return (
        <div className="debugger-install-banner animate-reveal-up">
            <div className="banner-content">
                <AlertCircle size={18} className="text-blue-400" />
                <div className="text-group">
                    <span className="title">{missingAdapter.type.toUpperCase()} Debugger Missing</span>
                    <span className="desc">To debug this file, you need the ${missingAdapter.requiredBinary} adapter.</span>
                </div>
                <div className="action-group">
                    <button className="btn-ignore" onClick={() => setMissingAdapter(null)}>Ignore</button>
                    <button 
                        className="btn-install-debug" 
                        onClick={handleInstall}
                        disabled={installing}
                    >
                        {installing ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Download size={14} />
                        )}
                        <span>{installing ? 'Installing...' : 'Install Now'}</span>
                    </button>
                </div>
            </div>

            <style>{`
                .debugger-install-banner {
                    position: fixed;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2000;
                    background: rgba(10, 10, 15, 0.9);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: 12px;
                    padding: 12px 20px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                    width: 500px;
                }
                .banner-content { display: flex; align-items: center; gap: 16px; }
                .text-group { flex: 1; display: flex; flex-direction: column; }
                .text-group .title { font-size: 13px; font-weight: 700; color: white; }
                .text-group .desc { font-size: 11px; color: rgba(255, 255, 255, 0.5); }
                .action-group { display: flex; gap: 10px; }
                .btn-ignore { background: transparent; border: none; color: rgba(255, 255, 255, 0.4); font-size: 11px; cursor: pointer; }
                .btn-install-debug {
                    display: flex; align-items: center; gap: 8px;
                    padding: 6px 12px; background: #3b82f6; color: white;
                    border: none; border-radius: 6px; font-size: 11px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                }
                .btn-install-debug:hover { background: #2563eb; transform: translateY(-1px); }
                .btn-install-debug:disabled { opacity: 0.6; cursor: not-allowed; }
            `}</style>
        </div>
    )
}
