/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import {
    Code2, Terminal, FolderTree, GitBranch,
    Palette, Network, StickyNote, Library,
    Monitor, Microscope
} from 'lucide-react'

// Workspace Categories - Define category templates, tools, and layouts

export type WorkspaceCategoryId = 'programming' | 'research'

export interface WorkspaceTool {
    id: string
    name: string
    icon: React.ReactNode
    component: string
    defaultVisible: boolean
}

export interface WorkspaceCategory {
    id: WorkspaceCategoryId
    name: string
    icon: React.ReactNode
    description: string
    color: string
    tools: WorkspaceTool[]
    defaultLayout: 'split' | 'tabs' | 'canvas' | 'focus'
    aiContext: string
}

// Available tools
export const WORKSPACE_TOOLS: Record<string, WorkspaceTool> = {
    codeEditor: {
        id: 'codeEditor',
        name: 'Code Editor',
        icon: <Code2 size={16} />,
        component: 'CodeEditor',
        defaultVisible: true
    },
    terminal: {
        id: 'terminal',
        name: 'Terminal',
        icon: <Terminal size={16} />,
        component: 'Terminal',
        defaultVisible: true
    },
    fileTree: {
        id: 'fileTree',
        name: 'Files',
        icon: <FolderTree size={16} />,
        component: 'FileTree',
        defaultVisible: true
    },
    git: {
        id: 'git',
        name: 'Git',
        icon: <GitBranch size={16} />,
        component: 'GitPanel',
        defaultVisible: false
    },
    canvas: {
        id: 'canvas',
        name: 'Canvas',
        icon: <Palette size={16} />,
        component: 'Canvas',
        defaultVisible: true
    },
    diagram: {
        id: 'diagram',
        name: 'Diagrams',
        icon: <Network size={16} />,
        component: 'DiagramEditor',
        defaultVisible: true
    },
    notes: {
        id: 'notes',
        name: 'Notes',
        icon: <StickyNote size={16} />,
        component: 'NotesPanel',
        defaultVisible: true
    },
    references: {
        id: 'references',
        name: 'References',
        icon: <Library size={16} />,
        component: 'ReferencesPanel',
        defaultVisible: false
    }
}

// Only two workspace categories: IDE (Programming) and Research
export const WORKSPACE_CATEGORIES: WorkspaceCategory[] = [
    {
        id: 'programming',
        name: 'IDE',
        icon: <Monitor />,
        description: 'Full IDE with terminal, file explorer, code editor, and Git',
        color: '#3b82f6',
        tools: [
            WORKSPACE_TOOLS.codeEditor,
            WORKSPACE_TOOLS.terminal,
            WORKSPACE_TOOLS.fileTree,
            WORKSPACE_TOOLS.git
        ],
        defaultLayout: 'split',
        aiContext: 'You are assisting with software development in an IDE. Help with code completion, debugging, refactoring, and best practices. You can read and modify files, run terminal commands, and manage git operations.'
    },
    {
        id: 'research',
        name: 'Research',
        icon: <Microscope />,
        description: 'Canvas for diagrams, notes, drawing, and research collaboration',
        color: '#8b5cf6',
        tools: [
            WORKSPACE_TOOLS.canvas,
            WORKSPACE_TOOLS.diagram,
            WORKSPACE_TOOLS.notes,
            WORKSPACE_TOOLS.references
        ],
        defaultLayout: 'canvas',
        aiContext: 'You are assisting with research. Help with literature review, data visualization, diagrams, organizing research, and synthesizing findings.'
    }
]

// Utility functions
export function getCategoryById(id: WorkspaceCategoryId): WorkspaceCategory | undefined {
    return WORKSPACE_CATEGORIES.find(c => c.id === id)
}

export function getCategoryTools(id: WorkspaceCategoryId): WorkspaceTool[] {
    const category = getCategoryById(id)
    return category?.tools ?? []
}

export function getCategoryAIContext(id: WorkspaceCategoryId): string {
    const category = getCategoryById(id)
    return category?.aiContext ?? ''
}
