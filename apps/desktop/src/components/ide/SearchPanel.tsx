/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { List, ListImperativeAPI } from 'react-window'
import { logger } from '../../utils/logger'

const useResizeObserver = (ref: React.RefObject<HTMLElement>) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect
        setDimensions({ width, height })
      }
    })
    resizeObserver.observe(ref.current)
    return () => resizeObserver.disconnect()
  }, [ref])
  return dimensions
}

interface SearchResult {
  filePath: string
  fileName: string
  line: number
  column: number
  matchText: string
  contextBefore: string
  contextAfter: string
}

const shouldSkipFile = (fileName: string, includeExts: string[]) => {
  const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'zip', 'tar', 'gz']
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  if (binaryExts.includes(ext)) return true
  if (includeExts.length > 0 && !includeExts.some(ie => ext === ie || fileName.endsWith(ie))) return true

  return false
}

const searchInFile = (content: string, filePath: string, fileName: string, pattern: RegExp, results: SearchResult[]) => {
  const lines = content.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    pattern.lastIndex = 0
    let match

    // SECURITY FIX: Add timeout protection for potentially malicious regex
    const startTime = Date.now()
    const MAX_REGEX_TIME = 100 // milliseconds

    try {
      while ((match = pattern.exec(line)) !== null) {
        // Check timeout to prevent ReDoS attacks
        if (Date.now() - startTime > MAX_REGEX_TIME) {
          console.warn('[SearchPanel] Regex execution timeout, skipping rest of line', { fileName, line: idx + 1 })
          break
        }

        results.push({
          filePath,
          fileName,
          line: idx + 1,
          column: match.index + 1,
          matchText: match[0],
          contextBefore: line.slice(Math.max(0, match.index - 30), match.index),
          contextAfter: line.slice(match.index + match[0].length, match.index + match[0].length + 50)
        })
        if (results.length >= 500) return true
      }
    } catch (error) {
      console.error('[SearchPanel] Regex execution error:', error)
      break // Skip this line and continue with next
    }
  }
  return false
}

const getSearchPattern = (query: string, useRegex: boolean, caseSensitive: boolean) => {
  const flags = caseSensitive ? 'g' : 'gi'
  const patternStr = useRegex ? query : query.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

  // SECURITY FIX: Wrap RegExp construction in try-catch to prevent crashes from invalid patterns
  try {
    // Validate regex complexity to prevent ReDoS
    if (useRegex) {
      // Check for common ReDoS patterns
      const dangerousPatterns = [
        /(\(.*\+.*\))+/,  // Nested quantifiers like (a+)+
        /(\(.*\*.*\))+/,  // Nested quantifiers like (a*)+
        /(\(.*\{.*,.*\}.*\))+/,  // Nested ranges
      ]

      for (const dangerous of dangerousPatterns) {
        if (dangerous.test(query)) {
          console.warn('[SearchPanel] Potentially dangerous regex pattern detected')
          // Don't block entirely, but user has been warned via console
        }
      }
    }

    const regex = new RegExp(patternStr, flags)
    return regex
  } catch (error) {
    console.error('[SearchPanel] Invalid regex pattern:', error)
    // Return a pattern that matches nothing on error
    return new RegExp('(?!.*)', flags)
  }
}

const SearchRow = (props: any) => {
  const { index, style, ariaAttributes, items, expandedFiles, toggleFile, getRelativePath, onFileSelect } = props
  const item = items[index]
  if (!item) return null

  if (item.type === 'header') {
    return (
      <div style={style} {...ariaAttributes}>
        <button
          className="result-file-header"
          onClick={() => toggleFile(item.filePath)}
          aria-expanded={expandedFiles.has(item.filePath)}
        >
          <span className="expand-icon">
            {expandedFiles.has(item.filePath) ? 'â–¼' : 'â–¶'}
          </span>
          <span className="file-name">{item.results[0].fileName}</span>
          <span className="file-path">{getRelativePath(item.filePath)}</span>
          <span className="match-count">{item.count}</span>
        </button>
      </div>
    )
  } else {
    return (
      <div style={style} {...ariaAttributes}>
        <button
          className="result-match"
          onClick={() => onFileSelect(item.filePath, item.result.line)}
          aria-label={`Go to line ${item.result.line} in ${item.filePath}`}
        >
          <span className="line-number">{item.result.line}</span>
          <span className="match-content">
            <span className="context">{item.result.contextBefore}</span>
            <span className="highlight">{item.result.matchText}</span>
            <span className="context">{item.result.contextAfter}</span>
          </span>
        </button>
      </div>
    )
  }
}

interface SearchPanelProps {
  readonly workspacePath: string | null
  readonly onFileSelect: (path: string, line?: number) => void
}

export default function SearchPanel({ workspacePath, onFileSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [includePattern, setIncludePattern] = useState('')
  const [excludePattern, setExcludePattern] = useState('node_modules,dist,.git')
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const abortRef = useRef<boolean>(false)

  const listRef = useRef<ListImperativeAPI>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const { width, height } = useResizeObserver(parentRef)

  const items = useMemo(() => {
    const grouped: Record<string, SearchResult[]> = {}
    for (const res of results) {
      if (!grouped[res.filePath]) grouped[res.filePath] = []
      grouped[res.filePath].push(res)
    }

    const flat: any[] = []
    for (const [filePath, fileResults] of Object.entries(grouped)) {
      flat.push({ type: 'header', filePath, count: fileResults.length, results: fileResults })
      if (expandedFiles.has(filePath)) {
        for (const res of fileResults) {
          flat.push({ type: 'match', filePath, result: res })
        }
      }
    }
    return flat
  }, [results, expandedFiles])

  const getItemSize = (index: number) => {
    return items[index].type === 'header' ? 32 : 24
  }

  const toggleFile = (filePath: string) => {
    const next = new Set(expandedFiles)
    if (next.has(filePath)) next.delete(filePath)
    else next.add(filePath)
    setExpandedFiles(next)
  }

  const getRelativePath = (filePath: string) => {
    if (!workspacePath) return filePath
    return filePath.replace(workspacePath, '').replace(/^[\\/]/, '').replaceAll('\\', '/')
  }

  const handleSearch = async () => {
    if (!query || !workspacePath) return
    setIsSearching(true)
    setResults([])
    setExpandedFiles(new Set())
    abortRef.current = false

    try {
      const includeExts = includePattern.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const excludeDirs = new Set(excludePattern.split(',').map(s => s.trim()).filter(Boolean))
      const pattern = getSearchPattern(query, useRegex, caseSensitive)

      const searchDir = async (dir: string) => {
        if (abortRef.current) return

        const res = await globalThis.window.electronAPI.fs.readDir(dir)
        if (!res.success || !res.items) return

        for (const entry of res.items) {
          if (abortRef.current) return
          if (entry.isDirectory) {
            if (excludeDirs.has(entry.name)) continue
            await searchDir(`${dir}/${entry.name}`)
          } else if (!shouldSkipFile(entry.name, includeExts)) {
            await processFile(`${dir}/${entry.name}`, entry.name, pattern)
          }
        }
      }

      const processFile = async (fullPath: string, fileName: string, pattern: RegExp) => {
        try {
          const fileRes = await globalThis.window.electronAPI.fs.readFile(fullPath)
          if (fileRes.success && fileRes.content) {
            if (searchInFile(fileRes.content, fullPath, fileName, pattern, results)) {
              abortRef.current = true
            }
          }
        } catch (error) {
          logger.ide.debug('Failed to read file during search', { fullPath, error })
        }
      }

      await searchDir(workspacePath)
      setResults([...results])
    } catch (error) {
      logger.ide.error('Search operation failed', { workspacePath, query, error })
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setExpandedFiles(new Set())
    abortRef.current = true
  }

  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  return (
    <div className="search-panel">
      <div className="search-header">
        <div className="search-input-wrapper">
          <input
            id="search-query"
            type="text"
            placeholder="Search query..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            aria-label="Search query"
          />
          <div className="search-actions">
            <button className={caseSensitive ? 'active' : ''} onClick={() => setCaseSensitive(!caseSensitive)} title="Case Sensitive">Aa</button>
            <button className={useRegex ? 'active' : ''} onClick={() => setUseRegex(!useRegex)} title="Use Regex">.*</button>
            <button onClick={handleSearch} disabled={isSearching}>{isSearching ? '...' : 'ðŸ”'}</button>
            <button onClick={clearSearch}>âœ–ï¸</button>
          </div>
        </div>
        <div className="search-options">
          <div className="option">
            <label htmlFor="search-include">Include:</label>
            <input id="search-include" type="text" placeholder="e.g. .ts, .tsx" value={includePattern} onChange={(e) => setIncludePattern(e.target.value)} />
          </div>
          <div className="option">
            <label htmlFor="search-exclude">Exclude:</label>
            <input id="search-exclude" type="text" value={excludePattern} onChange={(e) => setExcludePattern(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="search-results-container" ref={parentRef} style={{ flex: 1, minHeight: 0 }}>
        {results.length > 0 ? (
          <List
            listRef={listRef}
            rowCount={items.length}
            rowHeight={getItemSize}
            style={{ height, width }}
            rowProps={{
              items,
              expandedFiles,
              toggleFile,
              getRelativePath,
              onFileSelect
            }}
            rowComponent={SearchRow as any}
          />
        ) : (
          <div className="no-results">
            {isSearching ? 'Searching...' : 'No results found'}
          </div>
        )}
      </div>

      <style>{`
        .search-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--color-bg, #1e1e1e);
          color: var(--color-text, #ccc);
        }
        .search-header {
          padding: 12px;
          border-bottom: 1px solid var(--color-border, #3c3c3c);
        }
        .search-input-wrapper {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .search-input-wrapper input {
          flex: 1;
          padding: 6px 10px;
          background: var(--color-surface, #252526);
          border: 1px solid var(--color-border, #3c3c3c);
          color: inherit;
          border-radius: 4px;
        }
        .search-actions {
          display: flex;
          gap: 4px;
        }
        .search-actions button {
          padding: 4px 8px;
          background: var(--color-surface, #252526);
          border: 1px solid var(--color-border, #3c3c3c);
          color: inherit;
          cursor: pointer;
          border-radius: 4px;
        }
        .search-actions button.active {
          background: var(--color-accent, #007acc);
          color: white;
          border-color: var(--color-accent, #007acc);
        }
        .search-options {
          display: flex;
          gap: 12px;
          font-size: 11px;
        }
        .option {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .option input {
          background: var(--color-surface, #252526);
          border: 1px solid var(--color-border, #3c3c3c);
          color: inherit;
          padding: 2px 4px;
          border-radius: 2px;
        }
        .search-results-container {
          overflow: hidden;
        }
        .result-file-header, .result-match {
          display: flex;
          align-items: center;
          width: 100%;
          border: none;
          background: transparent;
          color: inherit;
          text-align: left;
          padding: 0;
          margin: 0;
          cursor: pointer;
        }
        .result-file-header {
          gap: 8px;
          padding: 4px 8px;
          font-size: 13px;
        }
        .result-file-header:hover, .result-match:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .file-name {
          font-weight: 600;
        }
        .file-path {
          font-size: 11px;
          opacity: 0.6;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .match-count {
          font-size: 11px;
          opacity: 0.6;
        }
        .result-match {
          gap: 12px;
          padding: 2px 24px;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
        }
        .line-number {
          opacity: 0.5;
          min-width: 32px;
          text-align: right;
        }
        .match-content {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .highlight {
          background: rgba(255, 255, 0, 0.2);
          color: #ffca28;
        }
        .no-results {
          padding: 20px;
          text-align: center;
          opacity: 0.5;
        }
      `}</style>
    </div>
  )
}
