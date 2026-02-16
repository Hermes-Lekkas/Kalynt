/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
// @ts-ignore
import { List } from 'react-window'
import {
  Search, X, ChevronDown, ChevronRight, FileText, Replace,
  CaseSensitive, Regex, WholeWord, History, Filter, RefreshCw,
  AlertCircle, FolderOpen
} from 'lucide-react'
import { useNotificationStore } from '../../stores/notificationStore'

// Interface for List row props
interface ListRowProps {
  ariaAttributes: {
    "aria-posinset": number
    "aria-setsize": number
    role: "listitem"
    style?: React.CSSProperties
  }
  index: number
  style: React.CSSProperties
}

// Types
interface SearchResult {
  filePath: string
  fileName: string
  line: number
  column: number
  matchText: string
  lineContent: string
  contextBefore: string
  contextAfter: string
}

interface SearchHistory {
  query: string
  timestamp: number
}

interface SearchStats {
  filesSearched: number
  totalFiles: number
  matchCount: number
  fileMatchCount: number
}

// Constants
const MAX_RESULTS = 1000
const MAX_HISTORY = 20
const HISTORY_KEY = 'kalynt-search-history'
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'webp', 'bmp',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'pyc', 'wasm', 'o', 'a'
])

// Security: ReDoS protection
const MAX_REGEX_TIME_MS = 100
const DANGEROUS_PATTERNS = [
  // eslint-disable-next-line security/detect-unsafe-regex
  /(\(.*\+.*\))+/,
  // eslint-disable-next-line security/detect-unsafe-regex
  /(\(.*\*.*\))+/,
  // eslint-disable-next-line security/detect-unsafe-regex
  /(\(.*\{.*,.*\}.*\))+/,
]

// Utility Functions
const escapeRegex = (str: string) => str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

const isBinaryFile = (fileName: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return BINARY_EXTENSIONS.has(ext)
}

const getSearchPattern = (query: string, options: { regex: boolean, caseSensitive: boolean, wholeWord: boolean }): RegExp | null => {
  try {
    let patternStr = options.regex ? query : escapeRegex(query)

    if (options.wholeWord && !options.regex) {
      patternStr = String.raw`\b${patternStr}\b`
    }

    const flags = options.caseSensitive ? 'g' : 'gi'

    // Security: Check for dangerous patterns
    if (options.regex) {
      for (const dangerous of DANGEROUS_PATTERNS) {
        if (dangerous.test(query)) {
          console.warn('[Search] Potentially dangerous regex pattern detected')
        }
      }
    }

    return new RegExp(patternStr, flags)
  } catch (error) {
    console.error('[Search] Invalid regex:', error)
    return null
  }
}

const preserveCase = (original: string, replacement: string): string => {
  if (original === original.toUpperCase()) return replacement.toUpperCase()
  if (original === original.toLowerCase()) return replacement.toLowerCase()
  if (original.startsWith(original[0].toUpperCase())) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
  }
  return replacement
}

// Custom hook for resize observer
const useResizeObserver = (ref: React.RefObject<HTMLElement | null>) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect
        setDimensions({ width, height })
      }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return dimensions
}

// Props
interface SearchPanelProps {
  readonly workspacePath: string | null
  readonly onFileSelect: (path: string, line?: number) => void
}

export default function SearchPanel({ workspacePath, onFileSelect }: SearchPanelProps) {
  // State
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Search Options
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [preserveCaseReplace, setPreserveCaseReplace] = useState(true)
  const [includePattern, setIncludePattern] = useState('')
  const [excludePattern, setExcludePattern] = useState('node_modules,dist,.git,build,.next')

  // Stats & History
  const [stats, setStats] = useState<SearchStats>({ filesSearched: 0, totalFiles: 0, matchCount: 0, fileMatchCount: 0 })
  const [history, setHistory] = useState<SearchHistory[]>([])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // Refs
  const abortRef = useRef(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const queryInputRef = useRef<HTMLInputElement>(null)
  const { width, height } = useResizeObserver(resultsRef)
  const { addNotification } = useNotificationStore()

  // Load search history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) setHistory(JSON.parse(saved))
    } catch (e) {
      console.error('[Search] Failed to load history:', e)
    }
  }, [])

  // Save to history
  const addToHistory = useCallback((q: string) => {
    if (!q.trim()) return
    setHistory(prev => {
      const filtered = prev.filter(h => h.query !== q)
      const updated = [{ query: q, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // Count files recursively
  const countFiles = useCallback(async (dir: string, excludeDirs: Set<string>): Promise<number> => {
    let count = 0
    const res = await globalThis.window.electronAPI?.fs.readDir(dir)
    if (!res?.success || !res.items) return 0

    for (const entry of res.items) {
      if (entry.isDirectory) {
        if (!excludeDirs.has(entry.name)) {
          count += await countFiles(`${dir}/${entry.name}`, excludeDirs)
        }
      } else if (!isBinaryFile(entry.name)) {
        count++
      }
    }
    return count
  }, [])

  // Search function
  const handleSearch = useCallback(async () => {
    if (!query.trim() || !workspacePath) return

    setIsSearching(true)
    setResults([])
    setExpandedFiles(new Set())
    setStats({ filesSearched: 0, totalFiles: 0, matchCount: 0, fileMatchCount: 0 })
    abortRef.current = false
    addToHistory(query)

    const pattern = getSearchPattern(query, { regex: useRegex, caseSensitive, wholeWord })
    if (!pattern) {
      addNotification('Invalid search pattern', 'error')
      setIsSearching(false)
      return
    }

    const includeExts = includePattern.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const excludeDirs = new Set(excludePattern.split(',').map(s => s.trim()).filter(Boolean))
    const newResults: SearchResult[] = []
    const matchedFiles = new Set<string>()
    let filesSearched = 0

    // Count total files for progress
    const totalFiles = await countFiles(workspacePath, excludeDirs)
    setStats(s => ({ ...s, totalFiles }))

    const searchFile = async (filePath: string, fileName: string) => {
      if (abortRef.current) return

      try {
        const fileRes = await globalThis.window.electronAPI?.fs.readFile(filePath)
        if (!fileRes?.success || !fileRes.content) return

        const lines = fileRes.content.split('\n')
        const startTime = Date.now()

        for (let i = 0; i < lines.length; i++) {
          if (abortRef.current) return
          if (Date.now() - startTime > MAX_REGEX_TIME_MS * lines.length) break

          const line = lines[i]
          pattern.lastIndex = 0
          let match

          while ((match = pattern.exec(line)) !== null) {
            if (newResults.length >= MAX_RESULTS) {
              abortRef.current = true
              return
            }

            matchedFiles.add(filePath)
            newResults.push({
              filePath,
              fileName,
              line: i + 1,
              column: match.index + 1,
              matchText: match[0],
              lineContent: line,
              contextBefore: line.slice(Math.max(0, match.index - 40), match.index),
              contextAfter: line.slice(match.index + match[0].length, match.index + match[0].length + 60)
            })
          }
        }
      } catch (error) {
        console.error('[Search] Error reading file:', filePath, error)
      }
    }

    const searchDir = async (dir: string) => {
      if (abortRef.current) return

      const res = await globalThis.window.electronAPI?.fs.readDir(dir)
      if (!res?.success || !res.items) return

      for (const entry of res.items) {
        if (abortRef.current) return

        if (entry.isDirectory) {
          if (!excludeDirs.has(entry.name)) {
            await searchDir(`${dir}/${entry.name}`)
          }
        } else {
          if (isBinaryFile(entry.name)) continue

          const ext = entry.name.split('.').pop()?.toLowerCase() || ''
          if (includeExts.length > 0 && !includeExts.some(ie => ext === ie || entry.name.endsWith(ie))) continue

          await searchFile(`${dir}/${entry.name}`, entry.name)
          filesSearched++

          if (filesSearched % 50 === 0) {
            setStats(s => ({ ...s, filesSearched, matchCount: newResults.length, fileMatchCount: matchedFiles.size }))
          }
        }
      }
    }

    try {
      await searchDir(workspacePath)
      setResults(newResults)
      setStats({ filesSearched, totalFiles, matchCount: newResults.length, fileMatchCount: matchedFiles.size })

      // Auto-expand first few files
      const filesToExpand = [...new Set(newResults.slice(0, 50).map(r => r.filePath))].slice(0, 5)
      setExpandedFiles(new Set(filesToExpand))
    } catch (error) {
      console.error('[Search] Search failed:', error)
      addNotification('Search failed', 'error')
    } finally {
      setIsSearching(false)
    }
  }, [query, workspacePath, useRegex, caseSensitive, wholeWord, includePattern, excludePattern, countFiles, addToHistory, addNotification])

  // Replace in single file
  const replaceInFile = useCallback(async (filePath: string, onlyFirst: boolean = false) => {
    if (!replaceText && replaceText !== '') return

    const pattern = getSearchPattern(query, { regex: useRegex, caseSensitive, wholeWord })
    if (!pattern) return

    try {
      const fileRes = await globalThis.window.electronAPI?.fs.readFile(filePath)
      if (!fileRes?.success || !fileRes.content) return false

      let newContent: string
      if (preserveCaseReplace && !useRegex) {
        newContent = fileRes.content.replace(pattern, (match: string) => preserveCase(match, replaceText))
        if (onlyFirst) {
          // For single replacement, only replace first match
          const singlePattern = new RegExp(pattern.source, pattern.flags.replace('g', ''))
          newContent = fileRes.content.replace(singlePattern, (match: string) => preserveCase(match, replaceText))
        }
      } else {
        if (onlyFirst) {
          const singlePattern = new RegExp(pattern.source, pattern.flags.replace('g', ''))
          newContent = fileRes.content.replace(singlePattern, replaceText)
        } else {
          newContent = fileRes.content.replace(pattern, replaceText)
        }
      }

      if (newContent !== fileRes.content) {
        await globalThis.window.electronAPI?.fs.writeFile({ path: filePath, content: newContent })
        return true
      }
      return false
    } catch (error) {
      console.error('[Search] Replace failed:', filePath, error)
      return false
    }
  }, [query, replaceText, useRegex, caseSensitive, wholeWord, preserveCaseReplace])

  // Replace all in workspace
  const replaceAll = useCallback(async () => {
    if (!results.length || !replaceText && replaceText !== '') return

    const confirmed = confirm(`Replace ${stats.matchCount} occurrences in ${stats.fileMatchCount} files?\n\nThis cannot be undone.`)
    if (!confirmed) return

    setIsReplacing(true)
    const uniqueFiles = [...new Set(results.map(r => r.filePath))]
    let replacedCount = 0

    for (const filePath of uniqueFiles) {
      const success = await replaceInFile(filePath, false)
      if (success) replacedCount++
    }

    addNotification(`Replaced in ${replacedCount} files`, 'success')
    setIsReplacing(false)

    // Re-run search to update results
    await handleSearch()
  }, [results, replaceText, stats, replaceInFile, handleSearch, addNotification])

  // Toggle file expansion
  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery('')
    setReplaceText('')
    setResults([])
    setStats({ filesSearched: 0, totalFiles: 0, matchCount: 0, fileMatchCount: 0 })
    abortRef.current = true
    queryInputRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        queryInputRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'h') {
        e.preventDefault()
        setShowReplace(true)
        queryInputRef.current?.focus()
      }
    }
    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Build virtualized items
  const items = useMemo(() => {
    const grouped: Record<string, SearchResult[]> = {}
    for (const r of results) {
      if (!grouped[r.filePath]) grouped[r.filePath] = []
      grouped[r.filePath].push(r)
    }

    const flat: Array<{ type: 'file' | 'match', filePath: string, count?: number, result?: SearchResult }> = []
    for (const [filePath, fileResults] of Object.entries(grouped)) {
      flat.push({ type: 'file', filePath, count: fileResults.length })
      if (expandedFiles.has(filePath)) {
        for (const result of fileResults) {
          flat.push({ type: 'match', filePath, result })
        }
      }
    }
    return flat
  }, [results, expandedFiles])

  // Get relative path
  const getRelativePath = useCallback((filePath: string) => {
    if (!workspacePath) return filePath
    return filePath.replaceAll(workspacePath, '').replaceAll(/^[\\/]/g, '').replaceAll(/\\/g, '/')
  }, [workspacePath])

  // Render row
  const Row = useCallback(({ index, style, ariaAttributes }: ListRowProps) => {
    const item = items[index]
    if (!item) return null

    const rowStyle = { ...style, ...ariaAttributes?.style }

    if (item.type === 'file') {
      const isExpanded = expandedFiles.has(item.filePath)
      return (
        <div style={rowStyle} className="search-result-file" {...ariaAttributes}>
          <button className="file-header" onClick={() => toggleFile(item.filePath)}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <FileText size={14} className="file-icon" />
            <span className="file-name">{item.filePath.split(/[\\/]/).pop()}</span>
            <span className="file-path">{getRelativePath(item.filePath)}</span>
            <span className="match-badge">{item.count}</span>
          </button>
        </div>
      )
    } else if (item.result) {
      return (
        <div style={rowStyle} className="search-result-match" {...ariaAttributes}>
          <button
            className="match-row"
            onClick={() => onFileSelect(item.filePath, item.result!.line)}
          >
            <span className="line-num">{item.result.line}</span>
            <span className="match-content">
              <span className="context">{item.result.contextBefore}</span>
              <mark className="highlight">{item.result.matchText}</mark>
              <span className="context">{item.result.contextAfter}</span>
            </span>
          </button>
        </div>
      )
    }
    return null
  }, [items, expandedFiles, toggleFile, getRelativePath, onFileSelect])

  // No workspace
  if (!workspacePath) {
    return (
      <div className="search-panel empty-state">
        <FolderOpen size={48} strokeWidth={1} />
        <p>Open a folder to search</p>
        <style>{searchStyles}</style>
      </div>
    )
  }

  return (
    <div className="search-panel">
      {/* Search Input */}
      <div className="search-header">
        <div className="search-input-row">
          <div className="input-group">
            <Search size={14} className="input-icon" />
            <input
              ref={queryInputRef}
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              onFocus={() => setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            />
            {query && (
              <button className="clear-btn" onClick={clearSearch}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="toggle-buttons">
            <button
              className={`toggle-btn ${caseSensitive ? 'active' : ''}`}
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="Match Case (Aa)"
            >
              <CaseSensitive size={14} />
            </button>
            <button
              className={`toggle-btn ${wholeWord ? 'active' : ''}`}
              onClick={() => setWholeWord(!wholeWord)}
              title="Match Whole Word"
            >
              <WholeWord size={14} />
            </button>
            <button
              className={`toggle-btn ${useRegex ? 'active' : ''}`}
              onClick={() => setUseRegex(!useRegex)}
              title="Use Regular Expression"
            >
              <Regex size={14} />
            </button>
            <button
              className={`toggle-btn ${showReplace ? 'active' : ''}`}
              onClick={() => setShowReplace(!showReplace)}
              title="Toggle Replace"
            >
              <Replace size={14} />
            </button>
          </div>
        </div>

        {/* Search History Dropdown */}
        {showHistory && history.length > 0 && (
          <div className="search-history">
            <div className="history-header">
              <History size={12} /> Recent Searches
            </div>
            {history.slice(0, 8).map((h) => (
              <button
                key={`${h.query}-${h.timestamp}`}
                className="history-item"
                onMouseDown={() => { setQuery(h.query); setShowHistory(false) }}
              >
                {h.query}
              </button>
            ))}
          </div>
        )}

        {/* Replace Input */}
        {showReplace && (
          <div className="replace-row">
            <div className="input-group">
              <Replace size={14} className="input-icon" />
              <input
                type="text"
                placeholder="Replace with..."
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
              />
            </div>
            <div className="replace-actions">
              <button
                className={`toggle-btn small ${preserveCaseReplace ? 'active' : ''}`}
                onClick={() => setPreserveCaseReplace(!preserveCaseReplace)}
                title="Preserve Case"
              >
                AB
              </button>
              <button
                className="action-btn"
                onClick={replaceAll}
                disabled={!results.length || isReplacing}
                title="Replace All"
              >
                {isReplacing ? <RefreshCw size={12} className="spin" /> : 'Replace All'}
              </button>
            </div>
          </div>
        )}

        {/* Advanced Options */}
        <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          <Filter size={12} />
          {showAdvanced ? 'Hide Filters' : 'Filters'}
          <ChevronDown size={12} className={showAdvanced ? 'rotated' : ''} />
        </button>

        {showAdvanced && (
          <div className="advanced-options">
            <div className="option-row">
              <label htmlFor="search-include">Include:</label>
              <input
                id="search-include"
                type="text"
                placeholder=".ts, .tsx, .js"
                value={includePattern}
                onChange={(e) => setIncludePattern(e.target.value)}
              />
            </div>
            <div className="option-row">
              <label htmlFor="search-exclude">Exclude:</label>
              <input
                id="search-exclude"
                type="text"
                value={excludePattern}
                onChange={(e) => setExcludePattern(e.target.value)}
              />
            </div>
            <div className="quick-filters">
              <button onClick={() => setIncludePattern('.ts,.tsx')}>TypeScript</button>
              <button onClick={() => setIncludePattern('.js,.jsx')}>JavaScript</button>
              <button onClick={() => setIncludePattern('.css,.scss')}>Styles</button>
              <button onClick={() => setIncludePattern('.json')}>JSON</button>
              <button onClick={() => setIncludePattern('.md')}>Markdown</button>
            </div>
          </div>
        )}

        {/* Search Button & Stats */}
        <div className="search-footer">
          <button
            className="search-btn"
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? (
              <>
                <RefreshCw size={14} className="spin" />
                Searching...
              </>
            ) : (
              <>
                <Search size={14} />
                Search
              </>
            )}
          </button>

          {(isSearching || results.length > 0) && (
            <div className="search-stats">
              {isSearching ? (
                <span className="progress">
                  {stats.filesSearched} / {stats.totalFiles || '?'} files
                </span>
              ) : (
                <span className="results-count">
                  <strong>{stats.matchCount}</strong> results in <strong>{stats.fileMatchCount}</strong> files
                  {results.length >= MAX_RESULTS && (
                    <span className="limit-warning">
                      <AlertCircle size={12} /> Limited
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="search-results" ref={resultsRef}>
        {results.length > 0 ? (
          <List
            style={{ height: height || 400, width: width || 300 } as React.CSSProperties}
            rowCount={items.length}
            rowHeight={28}
            rowComponent={Row as any}
            rowProps={{}}
          />
        ) : (
          <div className="no-results">
            {isSearching && (
              <div className="searching">
                <RefreshCw size={24} className="spin" />
                <p>Searching files...</p>
              </div>
            )}
            {!isSearching && query && (
              <p>No results found</p>
            )}
            {!isSearching && !query && (
              <p>Enter a search term</p>
            )}
          </div>
        )}
      </div>

      <style>{searchStyles}</style>
    </div>
  )
}

const searchStyles = `
    .search-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--color-surface);
        font-size: 13px;
    }

    .search-panel.empty-state {
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        gap: 12px;
    }

    .search-header {
        padding: 12px;
        border-bottom: 1px solid var(--color-border-subtle);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .search-input-row {
        display: flex;
        gap: 8px;
    }

    .input-group {
        flex: 1;
        display: flex;
        align-items: center;
        background: var(--color-bg);
        border: 1px solid var(--color-border-subtle);
        border-radius: 6px;
        padding: 0 8px;
        gap: 8px;
    }

    .input-group:focus-within {
        border-color: var(--color-accent);
    }

    .input-group input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--color-text);
        padding: 8px 0;
        font-size: 13px;
        outline: none;
    }

    .input-icon {
        color: var(--color-text-muted);
    }

    .clear-btn {
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
    }

    .clear-btn:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .toggle-buttons {
        display: flex;
        gap: 2px;
    }

    .toggle-btn {
        padding: 6px 8px;
        background: var(--color-bg);
        border: 1px solid var(--color-border-subtle);
        border-radius: 4px;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.15s;
    }

    .toggle-btn:hover {
        color: var(--color-text);
        background: var(--color-surface-elevated);
    }

    .toggle-btn.active {
        background: var(--color-accent);
        border-color: var(--color-accent);
        color: white;
    }

    .toggle-btn.small {
        padding: 4px 6px;
        font-size: 10px;
        font-weight: 600;
    }

    .search-history {
        position: absolute;
        top: 100%;
        left: 12px;
        right: 12px;
        background: var(--color-surface-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 100;
        overflow: hidden;
    }

    .history-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        font-size: 11px;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border-subtle);
    }

    .history-item {
        display: block;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        text-align: left;
        color: var(--color-text);
        cursor: pointer;
        font-size: 12px;
    }

    .history-item:hover {
        background: var(--color-surface);
    }

    .replace-row {
        display: flex;
        gap: 8px;
    }

    .replace-actions {
        display: flex;
        gap: 4px;
    }

    .action-btn {
        padding: 6px 12px;
        background: var(--color-accent);
        border: none;
        border-radius: 4px;
        color: white;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .advanced-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        font-size: 11px;
        cursor: pointer;
        padding: 4px 0;
    }

    .advanced-toggle:hover {
        color: var(--color-text);
    }

    .advanced-toggle .rotated {
        transform: rotate(180deg);
    }

    .advanced-options {
        background: var(--color-bg);
        border-radius: 6px;
        padding: 10px;
    }

    .option-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }

    .option-row label {
        font-size: 11px;
        color: var(--color-text-muted);
        min-width: 60px;
    }

    .option-row input {
        flex: 1;
        padding: 4px 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border-subtle);
        border-radius: 4px;
        color: var(--color-text);
        font-size: 11px;
    }

    .quick-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .quick-filters button {
        padding: 4px 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border-subtle);
        border-radius: 4px;
        color: var(--color-text-secondary);
        font-size: 10px;
        cursor: pointer;
    }

    .quick-filters button:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text);
    }

    .search-footer {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .search-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: linear-gradient(135deg, var(--color-accent), #1a5fb4);
        border: none;
        border-radius: 6px;
        color: white;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .search-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .search-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .search-stats {
        font-size: 11px;
        color: var(--color-text-muted);
    }

    .search-stats strong {
        color: var(--color-text);
    }

    .limit-warning {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #d29922;
        margin-left: 8px;
    }

    .progress {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .search-results {
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }

    .search-result-file,
    .search-result-match {
        display: flex;
    }

    .file-header,
    .match-row {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0 12px;
        background: transparent;
        border: none;
        color: var(--color-text);
        gap: 8px;
        cursor: pointer;
        text-align: left;
    }

    .file-header:hover,
    .match-row:hover {
        background: var(--color-surface-elevated);
    }

    .file-header {
        font-size: 12px;
    }

    .file-icon {
        color: var(--color-accent);
    }

    .file-name {
        font-weight: 500;
    }

    .file-path {
        flex: 1;
        font-size: 11px;
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .match-badge {
        font-size: 10px;
        padding: 2px 6px;
        background: var(--color-surface-elevated);
        border-radius: 10px;
        color: var(--color-text-muted);
    }

    .match-row {
        padding-left: 32px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
    }

    .line-num {
        min-width: 36px;
        color: var(--color-text-muted);
        text-align: right;
    }

    .match-content {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .context {
        color: var(--color-text-secondary);
    }

    .highlight {
        background: rgba(255, 200, 0, 0.25);
        color: #ffc800;
        padding: 1px 2px;
        border-radius: 2px;
    }

    .no-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-muted);
        gap: 8px;
    }

    .searching {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .spin {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`
