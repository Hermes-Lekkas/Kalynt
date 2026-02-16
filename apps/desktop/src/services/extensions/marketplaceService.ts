/**
 * Open VSX Marketplace Service
 * Provides access to the Open VSX registry for downloading VS Code extensions
 */

import { ExtensionGallery, ExtensionQueryOptions } from '../../types/extensions'

const OPENVSX_API_URL = 'https://open-vsx.org/api'
const DEFAULT_PAGE_SIZE = 20

interface OpenVSXSearchResult {
  extensions: Array<{
    namespace: string
    name: string
    version: string
    publishedBy: {
      loginName: string
    }
    displayName?: string
    description?: string
    categories?: string[]
    tags?: string[]
    releaseDate?: string
    lastUpdatedDate?: string
  }>
}

interface OpenVSXExtensionDetails {
  namespace: string
  name: string
  version: string
  publishedBy: {
    loginName: string
  }
  displayName?: string
  description?: string
  categories?: string[]
  tags?: string[]
  releaseDate?: string
  lastUpdatedDate?: string
  versions?: Array<{
    version: string
    lastUpdated?: string
  }>
  files?: {
    download?: string
    manifest?: string
    readme?: string
    changelog?: string
    license?: string
    icon?: string
  }
}

class MarketplaceService {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map()
  private cacheTTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Search for extensions in the Open VSX marketplace
   */
  async searchExtensions(options: ExtensionQueryOptions = {}): Promise<ExtensionGallery[]> {
    const {
      searchText = '',
      categories = [],
      sortBy = 'relevance',
      sortOrder = 'desc',
      pageSize = DEFAULT_PAGE_SIZE,
      pageNumber = 1
    } = options

    try {
      const params = new URLSearchParams()
      if (searchText) params.set('query', searchText)
      if (categories.length > 0) params.set('category', categories.join(','))
      params.set('size', String(pageSize))
      params.set('offset', String((pageNumber - 1) * pageSize))
      
      // Sort options
      const sortMap: Record<string, string> = {
        'none': 'relevance',
        'lastUpdated': 'updatedDate',
        'title': 'name',
        'publisherName': 'namespace',
        'installCount': 'downloadCount',
        'publishedDate': 'relevance',
        'averageRating': 'averageRating',
        'weightedRating': 'weightedRating'
      }
      params.set('sortBy', sortMap[sortBy] || 'relevance')
      params.set('sortOrder', sortOrder === 'ascending' ? 'asc' : 'desc')

      const cacheKey = `search:${params.toString()}`
      const cached = this.getFromCache<OpenVSXSearchResult>(cacheKey)
      
      if (cached) {
        return this.mapSearchResults(cached)
      }

      const response = await fetch(`${OPENVSX_API_URL}/-/search?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`Marketplace search failed: ${response.status} ${response.statusText}`)
      }

      const result: OpenVSXSearchResult = await response.json()
      this.setCache(cacheKey, result)

      return this.mapSearchResults(result)
    } catch (error) {
      console.error('[Marketplace] Search failed:', error)
      throw error
    }
  }

  /**
   * Get extension details
   */
  async getExtensionDetails(namespace: string, name: string): Promise<ExtensionGallery> {
    try {
      const cacheKey = `details:${namespace}.${name}`
      const cached = this.getFromCache<OpenVSXExtensionDetails>(cacheKey)
      
      if (cached) {
        return this.mapExtensionDetails(cached)
      }

      const response = await fetch(`${OPENVSX_API_URL}/${namespace}/${name}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Extension not found: ${namespace}.${name}`)
        }
        throw new Error(`Failed to get extension details: ${response.status}`)
      }

      const details: OpenVSXExtensionDetails = await response.json()
      this.setCache(cacheKey, details)

      return this.mapExtensionDetails(details)
    } catch (error) {
      console.error('[Marketplace] Get details failed:', error)
      throw error
    }
  }

  /**
   * Get specific version of an extension
   */
  async getExtensionVersion(namespace: string, name: string, version: string): Promise<ExtensionGallery> {
    try {
      const cacheKey = `version:${namespace}.${name}:${version}`
      const cached = this.getFromCache<OpenVSXExtensionDetails>(cacheKey)
      
      if (cached) {
        return this.mapExtensionDetails(cached)
      }

      const response = await fetch(`${OPENVSX_API_URL}/${namespace}/${name}/${version}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Extension version not found: ${namespace}.${name}@${version}`)
        }
        throw new Error(`Failed to get extension version: ${response.status}`)
      }

      const details: OpenVSXExtensionDetails = await response.json()
      this.setCache(cacheKey, details)

      return this.mapExtensionDetails(details)
    } catch (error) {
      console.error('[Marketplace] Get version failed:', error)
      throw error
    }
  }

  /**
   * Download extension VSIX file
   */
  async downloadExtension(
    namespace: string,
    name: string,
    version: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<Blob> {
    try {
      const response = await fetch(`${OPENVSX_API_URL}/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}.vsix`)
      
      if (!response.ok) {
        throw new Error(`Failed to download extension: ${response.status}`)
      }

      const total = parseInt(response.headers.get('content-length') || '0', 10)
      
      if (!onProgress || !response.body) {
        return await response.blob()
      }

      // Track download progress
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let downloaded = 0

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        chunks.push(value)
        downloaded += value.length
        onProgress(downloaded, total)
      }

      // Combine chunks
      const allChunks = new Uint8Array(downloaded)
      let position = 0
      for (const chunk of chunks) {
        allChunks.set(chunk, position)
        position += chunk.length
      }

      return new Blob([allChunks])
    } catch (error) {
      console.error('[Marketplace] Download failed:', error)
      throw error
    }
  }

  /**
   * Get download URL for an extension
   */
  getDownloadUrl(namespace: string, name: string, version: string): string {
    // Use the file endpoint which redirects to the actual download
    return `${OPENVSX_API_URL}/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}.vsix`
  }

  /**
   * Get the actual download URL (resolves 'latest' to actual version)
   */
  async getActualDownloadUrl(namespace: string, name: string, version: string): Promise<string> {
    console.log(`[Marketplace] Resolving download URL for ${namespace}.${name}@${version}`)
    
    try {
      let actualVersion: string
      
      if (version === 'latest') {
        // Get the main extension details to find the latest version
        const details = await this.getExtensionDetails(namespace, name)
        actualVersion = details.versions[0]?.version
        
        if (!actualVersion) {
          throw new Error('Could not determine latest version from extension details')
        }
        
        console.log(`[Marketplace] Resolved 'latest' to version: ${actualVersion}`)
      } else {
        // Use the specified version
        actualVersion = version
      }
      
      // Return the file URL with actual version
      // Open VSX uses: /api/{namespace}/{name}/{version}/file/{filename}
      const url = `${OPENVSX_API_URL}/${namespace}/${name}/${actualVersion}/file/${namespace}.${name}-${actualVersion}.vsix`
      console.log('[Marketplace] Resolved download URL:', url)
      return url
    } catch (error) {
      console.error('[Marketplace] Failed to resolve download URL:', error)
      throw new Error(`Failed to get download URL for ${namespace}.${name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get popular extensions
   */
  async getPopularExtensions(limit: number = 20): Promise<ExtensionGallery[]> {
    return this.searchExtensions({
      sortBy: 'installCount',
      sortOrder: 'descending',
      pageSize: limit,
      pageNumber: 1
    })
  }

  /**
   * Get recently updated extensions
   */
  async getRecentlyUpdated(limit: number = 20): Promise<ExtensionGallery[]> {
    return this.searchExtensions({
      sortBy: 'lastUpdated',
      sortOrder: 'descending',
      pageSize: limit,
      pageNumber: 1
    })
  }

  /**
   * Get extensions by category
   */
  async getExtensionsByCategory(category: string, limit: number = 20): Promise<ExtensionGallery[]> {
    return this.searchExtensions({
      categories: [category],
      pageSize: limit,
      pageNumber: 1
    })
  }

  /**
   * Get recommended extensions (based on installed extensions)
   */
  async getRecommendedExtensions(installedIds: string[], limit: number = 10): Promise<ExtensionGallery[]> {
    // Simple recommendation based on similar categories
    try {
      const recommendations: ExtensionGallery[] = []
      const seenIds = new Set(installedIds)

      for (const id of installedIds.slice(0, 5)) {
        const [namespace, name] = id.split('.')
        if (!namespace || !name) continue

        try {
          const extension = await this.getExtensionDetails(namespace, name)
          
          // Search for similar extensions
          if (extension.categories && extension.categories.length > 0) {
            const similar = await this.searchExtensions({
              categories: extension.categories.slice(0, 2),
              pageSize: 5
            })

            for (const ext of similar) {
              if (!seenIds.has(ext.id) && !recommendations.find(r => r.id === ext.id)) {
                recommendations.push(ext)
                if (recommendations.length >= limit) break
              }
            }
          }
        } catch {
          // Skip if extension not found
        }

        if (recommendations.length >= limit) break
      }

      return recommendations
    } catch (error) {
      console.error('[Marketplace] Get recommendations failed:', error)
      return []
    }
  }

  // Private helpers

  private mapSearchResults(result: OpenVSXSearchResult): ExtensionGallery[] {
    if (!result.extensions) return []

    return result.extensions.map(ext => ({
      id: `${ext.namespace}.${ext.name}`,
      name: ext.name,
      displayName: ext.displayName || ext.name,
      shortDescription: ext.description || '',
      publisher: {
        displayName: ext.publishedBy?.loginName || ext.namespace,
        publisherId: ext.namespace,
        publisherName: ext.namespace
      },
      versions: [{
        version: ext.version,
        lastUpdated: ext.lastUpdatedDate || new Date().toISOString(),
        assetUri: `${OPENVSX_API_URL}/${ext.namespace}/${ext.name}/${ext.version}`,
        fallbackAssetUri: `${OPENVSX_API_URL}/${ext.namespace}/${ext.name}`,
        files: []
      }],
      categories: ext.categories || [],
      tags: ext.tags || [],
      releaseDate: ext.releaseDate || new Date().toISOString(),
      publishedDate: ext.releaseDate || new Date().toISOString(),
      lastUpdated: ext.lastUpdatedDate || new Date().toISOString()
    }))
  }

  private mapExtensionDetails(details: OpenVSXExtensionDetails): ExtensionGallery {
    // If versions array is empty or missing, use the main version from the response
    const versions = (details.versions || []).length > 0 
      ? details.versions! 
      : [{ version: details.version, lastUpdated: details.lastUpdatedDate || new Date().toISOString() }]
    
    return {
      id: `${details.namespace}.${details.name}`,
      name: details.name,
      displayName: details.displayName || details.name,
      shortDescription: details.description || '',
      publisher: {
        displayName: details.publishedBy?.loginName || details.namespace,
        publisherId: details.namespace,
        publisherName: details.namespace
      },
      versions: versions.map(v => ({
        version: v.version,
        lastUpdated: v.lastUpdated || new Date().toISOString(),
        assetUri: `${OPENVSX_API_URL}/${details.namespace}/${details.name}/${v.version}`,
        fallbackAssetUri: `${OPENVSX_API_URL}/${details.namespace}/${details.name}`,
        files: []
      })),
      categories: details.categories || [],
      tags: details.tags || [],
      releaseDate: details.releaseDate || new Date().toISOString(),
      publishedDate: details.releaseDate || new Date().toISOString(),
      lastUpdated: details.lastUpdatedDate || new Date().toISOString()
    }
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Export singleton
export const marketplaceService = new MarketplaceService()
export default marketplaceService
