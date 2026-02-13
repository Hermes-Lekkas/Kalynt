/**
 * Extension Manager Component
 * UI for managing VS Code extensions
 */

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Puzzle, Search, Download, Trash2, RefreshCw, 
  CheckCircle, XCircle, AlertCircle, Star, 
  TrendingUp, Package, ExternalLink,
  Play, Square, ChevronDown, ChevronRight
} from 'lucide-react'
import { extensionService } from '../../services/extensions/extensionService'
import { marketplaceService } from '../../services/extensions/marketplaceService'
import { ExtensionGallery, ExtensionContributes } from '../../types/extensions'
import './ExtensionManager.css'

type ViewMode = 'installed' | 'marketplace' | 'recommended'

interface ExtensionMetadata {
  id: string
  name: string
  displayName?: string
  description?: string
  version: string
  publisher?: string | { displayName: string; publisherName: string }
  icon?: string
  categories?: string[]
  isBuiltin?: boolean
  contributes?: ExtensionContributes
}

interface ExtensionManagerProps {
  onClose?: () => void
}

export const ExtensionManager: React.FC<ExtensionManagerProps> = ({ onClose }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('installed')
  const [installed, setInstalled] = useState<ExtensionMetadata[]>([])
  const [activeExtensions, setActiveExtensions] = useState<Set<string>>(new Set())
  const [marketplaceResults, setMarketplaceResults] = useState<ExtensionGallery[]>([])
  const [recommended, setRecommended] = useState<ExtensionGallery[]>([])
  const [popular, setPopular] = useState<ExtensionGallery[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedExtension, setSelectedExtension] = useState<ExtensionMetadata | ExtensionGallery | null>(null)
  const [_contributions, setContributions] = useState<ExtensionContributes>({})
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['commands']))
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [activating, setActivating] = useState<Set<string>>(new Set())

  // Load initial data
  useEffect(() => {
    loadInstalledExtensions()
    loadPopularExtensions()
    
    // Listen for extension activation/deactivation
    const unsubActivate = extensionService.onActivated((id) => {
      setActiveExtensions(prev => new Set([...prev, id]))
      setActivating(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    })

    const unsubDeactivate = extensionService.onDeactivated((id) => {
      setActiveExtensions(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    })

    return () => {
      unsubActivate()
      unsubDeactivate()
    }
  }, [])

  // Load installed extensions
  const loadInstalledExtensions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const extensions = await extensionService.scanExtensions()
      setInstalled(extensions)
      
      // Get active status
      const active = await extensionService.getActiveExtensions()
      setActiveExtensions(new Set(active.map(e => e.id)))
      
      // Get contributions
      const contribs = await extensionService.getContributions()
      setContributions(contribs)
      
      // Load recommended based on installed
      const recs = await extensionService.getRecommendedExtensions()
      setRecommended(recs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions')
    } finally {
      setIsLoading(false)
    }
  }

  // Load popular extensions
  const loadPopularExtensions = async () => {
    try {
      const pop = await marketplaceService.getPopularExtensions(10)
      setPopular(pop)
    } catch (err) {
      console.error('Failed to load popular extensions:', err)
    }
  }

  // Search marketplace
  const searchMarketplace = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMarketplaceResults([])
      return
    }

    setIsLoading(true)
    try {
      const results = await extensionService.searchMarketplace({
        searchText: query,
        pageSize: 20
      })
      setMarketplaceResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (viewMode === 'marketplace') {
        searchMarketplace(searchQuery)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery, viewMode, searchMarketplace])

  // Install extension
  const installExtension = async (extension: ExtensionGallery) => {
    setInstalling(prev => new Set([...prev, extension.id]))
    try {
      await extensionService.installFromMarketplace(extension.id)
      await loadInstalledExtensions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed')
    } finally {
      setInstalling(prev => {
        const next = new Set(prev)
        next.delete(extension.id)
        return next
      })
    }
  }

  // Uninstall extension
  const uninstallExtension = async (id: string) => {
    try {
      await extensionService.uninstallExtension(id)
      await loadInstalledExtensions()
      setSelectedExtension(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstall failed')
    }
  }

  // Activate extension
  const activateExtension = async (id: string) => {
    setActivating(prev => new Set([...prev, id]))
    try {
      await extensionService.activateExtension(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed')
      setActivating(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Deactivate extension
  const deactivateExtension = async (id: string) => {
    try {
      await extensionService.deactivateExtension(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deactivation failed')
    }
  }

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Install from VSIX
  const installFromVSIX = async () => {
    try {
      const result = await window.electronAPI?.ipcRenderer?.invoke('dialog:showOpenDialog', {
        properties: ['openFile'],
        filters: [{ name: 'VS Code Extensions', extensions: ['vsix'] }]
      })

      if (result && !result.canceled && result.filePaths.length > 0) {
        await extensionService.installFromVSIX(result.filePaths[0])
        await loadInstalledExtensions()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install from VSIX')
    }
  }

  return (
    <div className={`extension-manager ${onClose ? 'overlay-mode' : ''}`}>
      {onClose && (
        <div 
          className="extension-overlay-backdrop"
          onClick={onClose}
        />
      )}
      {/* Header */}
      <div className="extension-header">
        <div className="extension-title">
          <Puzzle size={24} />
          <h2>Extensions</h2>
        </div>
        <div className="extension-actions">
          <button 
            className="btn-install-vsix"
            onClick={installFromVSIX}
            title="Install from VSIX"
          >
            <Package size={16} />
            Install from VSIX
          </button>
          <button 
            className="btn-refresh"
            onClick={loadInstalledExtensions}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
          </button>
          {onClose && (
            <button 
              className="btn-close-header"
              onClick={onClose}
              title="Close"
            >
              <XCircle size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="extension-tabs">
        <button
          className={viewMode === 'installed' ? 'active' : ''}
          onClick={() => setViewMode('installed')}
        >
          <CheckCircle size={16} />
          Installed ({installed.length})
        </button>
        <button
          className={viewMode === 'marketplace' ? 'active' : ''}
          onClick={() => setViewMode('marketplace')}
        >
          <Download size={16} />
          Marketplace
        </button>
        <button
          className={viewMode === 'recommended' ? 'active' : ''}
          onClick={() => setViewMode('recommended')}
        >
          <Star size={16} />
          Recommended
        </button>
      </div>

      {/* Search */}
      <div className="extension-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={viewMode === 'marketplace' ? 'Search marketplace...' : 'Search installed...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="extension-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="extension-content">
        {/* Installed View */}
        {viewMode === 'installed' && (
          <div className="extension-list">
            {installed
              .filter(ext => 
                searchQuery === '' || 
                (ext.displayName || ext.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
                ext.id.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(ext => (
                <div
                  key={ext.id}
                  className={`extension-item ${selectedExtension?.id === ext.id ? 'selected' : ''}`}
                  onClick={() => setSelectedExtension(ext)}
                >
                  <div className="extension-item-info">
                    <div className="extension-item-name">{ext.displayName}</div>
                    <div className="extension-item-id">{ext.id} v{ext.version}</div>
                    <div className="extension-item-desc">{ext.description}</div>
                    <div className="extension-item-badges">
                      {activeExtensions.has(ext.id) && (
                        <span className="badge active">
                          <CheckCircle size={12} />
                          Active
                        </span>
                      )}
                      {ext.isBuiltin && (
                        <span className="badge builtin">Built-in</span>
                      )}
                    </div>
                  </div>
                  <div className="extension-item-actions">
                    {activeExtensions.has(ext.id) ? (
                      <button
                        className="btn-deactivate"
                        onClick={(e) => {
                          e.stopPropagation()
                          deactivateExtension(ext.id)
                        }}
                        disabled={activating.has(ext.id)}
                      >
                        <Square size={14} />
                        Stop
                      </button>
                    ) : (
                      <button
                        className="btn-activate"
                        onClick={(e) => {
                          e.stopPropagation()
                          activateExtension(ext.id)
                        }}
                        disabled={activating.has(ext.id)}
                      >
                        <Play size={14} />
                        Start
                      </button>
                    )}
                    <button
                      className="btn-uninstall"
                      onClick={(e) => {
                        e.stopPropagation()
                        uninstallExtension(ext.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            {installed.length === 0 && (
              <div className="extension-empty">
                <Package size={48} />
                <p>No extensions installed</p>
                <button onClick={() => setViewMode('marketplace')}>
                  Browse Marketplace
                </button>
              </div>
            )}
          </div>
        )}

        {/* Marketplace View */}
        {viewMode === 'marketplace' && (
          <div className="extension-list">
            {/* Popular when no search */}
            {searchQuery === '' && popular.length > 0 && (
              <>
                <div className="extension-section-title">
                  <TrendingUp size={16} />
                  Popular
                </div>
                {popular.slice(0, 5).map(ext => (
                  <MarketplaceItem
                    key={ext.id}
                    extension={ext}
                    isInstalled={installed.some(i => i.id === ext.id)}
                    isInstalling={installing.has(ext.id)}
                    onInstall={() => installExtension(ext)}
                    onSelect={() => setSelectedExtension(ext)}
                    isSelected={selectedExtension?.id === ext.id}
                  />
                ))}
              </>
            )}

            {/* Search results */}
            {searchQuery !== '' && (
              <>
                <div className="extension-section-title">
                  Search Results
                </div>
                {marketplaceResults.map(ext => (
                  <MarketplaceItem
                    key={ext.id}
                    extension={ext}
                    isInstalled={installed.some(i => i.id === ext.id)}
                    isInstalling={installing.has(ext.id)}
                    onInstall={() => installExtension(ext)}
                    onSelect={() => setSelectedExtension(ext)}
                    isSelected={selectedExtension?.id === ext.id}
                  />
                ))}
                {marketplaceResults.length === 0 && !isLoading && (
                  <div className="extension-empty">
                    <Search size={48} />
                    <p>No extensions found</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Recommended View */}
        {viewMode === 'recommended' && (
          <div className="extension-list">
            {recommended.map(ext => (
              <MarketplaceItem
                key={ext.id}
                extension={ext}
                isInstalled={installed.some(i => i.id === ext.id)}
                isInstalling={installing.has(ext.id)}
                onInstall={() => installExtension(ext)}
                onSelect={() => setSelectedExtension(ext)}
                isSelected={selectedExtension?.id === ext.id}
              />
            ))}
            {recommended.length === 0 && (
              <div className="extension-empty">
                <Star size={48} />
                <p>Install some extensions to get recommendations</p>
              </div>
            )}
          </div>
        )}

        {/* Details Panel */}
        {selectedExtension && (
          <div className="extension-details">
            <div className="extension-details-header">
              <h3>{'displayName' in selectedExtension ? selectedExtension.displayName : selectedExtension.name}</h3>
              <button 
                className="btn-close"
                onClick={() => onClose ? onClose() : setSelectedExtension(null)}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="extension-details-content">
              {'description' in selectedExtension && (
                <p className="extension-details-desc">{selectedExtension.description}</p>
              )}

              {'shortDescription' in selectedExtension && (
                <p className="extension-details-desc">{selectedExtension.shortDescription}</p>
              )}

              <div className="extension-details-meta">
                <div>
                  <label>ID</label>
                  <span>{selectedExtension.id}</span>
                </div>
                <div>
                  <label>Version</label>
                  <span>{'version' in selectedExtension ? selectedExtension.version : selectedExtension.versions[0]?.version}</span>
                </div>
                <div>
                  <label>Publisher</label>
                  <span>{'publisher' in selectedExtension && selectedExtension.publisher ? (typeof selectedExtension.publisher === 'string' ? selectedExtension.publisher : selectedExtension.publisher.displayName) : 'Unknown'}</span>
                </div>
              </div>

              {/* Contributions */}
              {'contributes' in selectedExtension && selectedExtension.contributes && (
                <div className="extension-contributions">
                  {selectedExtension.contributes.commands && selectedExtension.contributes.commands.length > 0 && (
                    <div className="contribution-section">
                      <button 
                        className="section-header"
                        onClick={() => toggleSection('commands')}
                      >
                        {expandedSections.has('commands') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Commands ({selectedExtension.contributes.commands.length})
                      </button>
                      {expandedSections.has('commands') && (
                        <ul className="section-content">
                          {selectedExtension.contributes.commands.map((cmd: { command: string; title: string }) => (
                            <li key={cmd.command}>
                              <code>{cmd.command}</code>
                              <span>{cmd.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {selectedExtension.contributes.views && (
                    <div className="contribution-section">
                      <button 
                        className="section-header"
                        onClick={() => toggleSection('views')}
                      >
                        {expandedSections.has('views') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Views
                      </button>
                      {expandedSections.has('views') && (
                        <ul className="section-content">
                          {Object.entries(selectedExtension.contributes.views).map(([container, views]: [string, unknown]) => (
                            <li key={container}>
                              <strong>{container}</strong>
                              <ul>
                                {(views as Array<{ id: string; name: string }>).map(view => (
                                  <li key={view.id}>{view.name}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {selectedExtension.contributes.themes && (
                    <div className="contribution-section">
                      <button 
                        className="section-header"
                        onClick={() => toggleSection('themes')}
                      >
                        {expandedSections.has('themes') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Themes ({selectedExtension.contributes.themes.length})
                      </button>
                      {expandedSections.has('themes') && (
                        <ul className="section-content">
                          {selectedExtension.contributes.themes.map((theme: { label: string; uiTheme: string }) => (
                            <li key={theme.label}>
                              {theme.label}
                              <span className="theme-type">{theme.uiTheme}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="extension-details-actions">
                {'isActive' in selectedExtension ? (
                  <>
                    {selectedExtension.isActive ? (
                      <button 
                        className="btn-deactivate"
                        onClick={() => deactivateExtension(selectedExtension.id)}
                      >
                        <Square size={16} />
                        Stop Extension
                      </button>
                    ) : (
                      <button 
                        className="btn-activate"
                        onClick={() => activateExtension(selectedExtension.id)}
                      >
                        <Play size={16} />
                        Start Extension
                      </button>
                    )}
                    <button 
                      className="btn-uninstall"
                      onClick={() => uninstallExtension(selectedExtension.id)}
                    >
                      <Trash2 size={16} />
                      Uninstall
                    </button>
                  </>
                ) : (
                  <button 
                    className="btn-install"
                    onClick={() => installExtension(selectedExtension as ExtensionGallery)}
                    disabled={installing.has(selectedExtension.id)}
                  >
                    {installing.has(selectedExtension.id) ? (
                      <>
                        <RefreshCw size={16} className="spinning" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Install
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Open in marketplace */}
              {'publisher' in selectedExtension && 'name' in selectedExtension && (
                <a 
                  href={`https://open-vsx.org/extension/${selectedExtension.id.replace('.', '/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="marketplace-link"
                >
                  <ExternalLink size={14} />
                  View on Open VSX
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Marketplace Item Component
interface MarketplaceItemProps {
  extension: ExtensionGallery
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
  onSelect: () => void
  isSelected: boolean
}

const MarketplaceItem: React.FC<MarketplaceItemProps> = ({
  extension,
  isInstalled,
  isInstalling,
  onInstall,
  onSelect,
  isSelected
}) => {
  return (
    <div
      className={`extension-item marketplace ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="extension-item-info">
        <div className="extension-item-name">{extension.displayName}</div>
        <div className="extension-item-id">{extension.id} v{extension.versions[0]?.version}</div>
        <div className="extension-item-desc">{extension.shortDescription}</div>
        <div className="extension-item-badges">
          {extension.categories?.slice(0, 3).map(cat => (
            <span key={cat} className="badge category">{cat}</span>
          ))}
        </div>
      </div>
      <div className="extension-item-actions">
        {isInstalled ? (
          <span className="installed-badge">
            <CheckCircle size={14} />
            Installed
          </span>
        ) : (
          <button
            className="btn-install"
            onClick={(e) => {
              e.stopPropagation()
              onInstall()
            }}
            disabled={isInstalling}
          >
            {isInstalling ? (
              <RefreshCw size={14} className="spinning" />
            ) : (
              <Download size={14} />
            )}
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}

export default ExtensionManager
