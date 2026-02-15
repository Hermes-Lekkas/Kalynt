/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import { X } from 'lucide-react'

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
                    <span className="tab-name flex items-center gap-2">
                        {file.isDirty && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        {file.name}
                    </span>
                    <button
                        className="tab-close p-1 hover:bg-white/10 rounded-md transition-colors"
                        onClick={(e) => onCloseFile(file.path, e)}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    )
}
