/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Folder, FileCode, FileJson, FileText, FileEdit, Palette, Globe, FileImage, Terminal, ChevronRight } from 'lucide-react'

interface BreadcrumbsProps {
  filePath: string | null
  workspacePath: string | null
  onNavigate?: (path: string) => void
}

export default function Breadcrumbs({ filePath, workspacePath, onNavigate }: BreadcrumbsProps) {
  if (!filePath) return null

  // Get relative path from workspace
  const relativePath = workspacePath
    ? filePath.replace(workspacePath, '').replace(/^[/\\]+/, '')
    : filePath

  // Split path into segments
  const segments = relativePath.split(/[/\\]/).filter(Boolean)

  // Get file icons based on segment name
  const getIcon = (name: string, isLast: boolean) => {
    const iconSize = 14
    if (!isLast) return <Folder size={iconSize} />

    const ext = name.split('.').pop()?.toLowerCase() || ''

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <FileCode size={iconSize} />
      case 'json':
        return <FileJson size={iconSize} />
      case 'md':
        return <FileEdit size={iconSize} />
      case 'css':
      case 'scss':
        return <Palette size={iconSize} />
      case 'html':
        return <Globe size={iconSize} />
      case 'py':
      case 'rs':
      case 'go':
      case 'java':
        return <FileCode size={iconSize} />
      case 'sh':
        return <Terminal size={iconSize} />
      case 'svg':
      case 'png':
      case 'jpg':
      case 'gif':
        return <FileImage size={iconSize} />
      default:
        return <FileText size={iconSize} />
    }
  }

  // Build the path up to each segment for navigation
  const getPathUpTo = (index: number): string => {
    const basePath = workspacePath || ''
    const pathParts = segments.slice(0, index + 1)
    return `${basePath}/${pathParts.join('/')}`
  }

  return (
    <nav className="breadcrumbs">
      {workspacePath && (
        <>
          <span
            className="breadcrumb-item root"
            onClick={() => onNavigate?.(workspacePath)}
            title={workspacePath}
          >
            <Folder size={16} />
          </span>
          <ChevronRight size={12} className="separator" />
        </>
      )}

      {segments.map((segment, idx) => (
        <span key={idx} className="breadcrumb-segment">
          <span
            className={`breadcrumb-item ${idx === segments.length - 1 ? 'current' : ''}`}
            onClick={() => onNavigate?.(getPathUpTo(idx))}
            title={getPathUpTo(idx)}
          >
            <span className="breadcrumb-icon">{getIcon(segment, idx === segments.length - 1)}</span>
            <span className="breadcrumb-name">{segment}</span>
          </span>
          {idx < segments.length - 1 && (
            <ChevronRight size={12} className="separator" />
          )}
        </span>
      ))}

      <style>{`
        .breadcrumbs {
          display: flex;
          align-items: center;
          padding: 4px 12px;
          background: var(--color-surface, #252526);
          border-bottom: 1px solid var(--color-border, #3c3c3c);
          font-size: 12px;
          overflow-x: auto;
          white-space: nowrap;
        }

        .breadcrumbs::-webkit-scrollbar {
          height: 4px;
        }

        .breadcrumbs::-webkit-scrollbar-thumb {
          background: var(--color-border, #3c3c3c);
          border-radius: 2px;
        }

        .breadcrumb-segment {
          display: flex;
          align-items: center;
        }

        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 6px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--color-text-muted, #888);
          transition: all 0.15s ease;
        }

        .breadcrumb-item:hover {
          background: var(--color-bg, #1e1e1e);
          color: var(--color-text, #ccc);
        }

        .breadcrumb-item.current {
          color: var(--color-text, #ccc);
          font-weight: 500;
        }

        .breadcrumb-item.root {
          font-size: 14px;
        }

        .breadcrumb-icon {
          font-size: 12px;
        }

        .breadcrumb-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .separator {
          margin: 0 2px;
          color: var(--color-text-muted, #555);
          flex-shrink: 0;
        }
      `}</style>
    </nav>
  )
}
