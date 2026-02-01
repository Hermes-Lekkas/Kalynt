/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import FileExplorer from './FileExplorer'
import SearchPanel from './SearchPanel'
import GitPanel from './GitPanel'

interface OpenFile {
    path: string
    name: string
    isDirty?: boolean
}

interface IDEPanelContainerProps {
    sidebarOpen: boolean
    sidebarWidth: number
    activePanel: string
    workspacePath: string | null
    onOpenFolder: () => void
    onCloseWorkspace?: () => void
    onSelectFile: (path: string, line?: number) => void
    onCloseFile?: (path: string) => void
    selectedFile: string | null
    openFiles?: OpenFile[]
    onFileCreate: (dir: string, name: string) => void
    onFileDelete: (path: string) => void
    onFileRename: (oldPath: string, newPath: string) => void
    requestedExpansion: string | null
    onExpansionComplete: () => void
}

export const IDEPanelContainer: React.FC<IDEPanelContainerProps> = ({
    sidebarOpen,
    sidebarWidth,
    activePanel,
    workspacePath,
    onOpenFolder,
    onCloseWorkspace,
    onSelectFile,
    onCloseFile,
    selectedFile,
    openFiles = [],
    onFileCreate,
    onFileDelete,
    onFileRename,
    requestedExpansion,
    onExpansionComplete
}) => {
    if (!sidebarOpen) return null

    return (
        <aside className="ide-sidebar" style={{ width: sidebarWidth }}>
            <div style={{ display: activePanel === 'files' ? 'flex' : 'none', height: '100%' }}>
                <FileExplorer
                    workspacePath={workspacePath}
                    onOpenFolder={onOpenFolder}
                    onCloseWorkspace={onCloseWorkspace}
                    onSelectFile={(path) => onSelectFile(path)}
                    onCloseFile={onCloseFile}
                    selectedFile={selectedFile}
                    openFiles={openFiles}
                    onFileCreate={onFileCreate}
                    onFileDelete={onFileDelete}
                    onFileRename={onFileRename}
                    requestedExpansion={requestedExpansion}
                    onExpansionComplete={onExpansionComplete}
                />
            </div>
            <div style={{ display: activePanel === 'search' ? 'block' : 'none', height: '100%' }}>
                <SearchPanel
                    workspacePath={workspacePath}
                    onFileSelect={onSelectFile}
                />
            </div>
            <div style={{ display: activePanel === 'git' ? 'block' : 'none', height: '100%' }}>
                <GitPanel workspacePath={workspacePath} isVisible={activePanel === 'git'} />
            </div>
        </aside>
    )
}
