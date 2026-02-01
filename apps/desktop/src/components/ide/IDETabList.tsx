/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'

interface OpenFile {
    path: string
    name: string
    isDirty: boolean
}

interface IDETabListProps {
    openFiles: OpenFile[]
    activeFile: string | null
    onSelectFile: (path: string) => void
    onCloseFile: (path: string, e: React.MouseEvent) => void
}

export const IDETabList: React.FC<IDETabListProps> = ({
    openFiles,
    activeFile,
    onSelectFile,
    onCloseFile
}) => {
    if (openFiles.length === 0) return null

    return (
        <div className="file-tabs">
            {openFiles.map(file => (
                <div
                    key={file.path}
                    className={`file-tab ${file.path === activeFile ? 'active' : ''}`}
                    onClick={() => onSelectFile(file.path)}
                >
                    <span className="tab-name">
                        {file.isDirty && <span className="dirty-dot">â—</span>}
                        {file.name}
                    </span>
                    <button
                        className="tab-close"
                        onClick={(e) => onCloseFile(file.path, e)}
                    >
                        Ã—
                    </button>
                </div>
            ))}
        </div>
    )
}
