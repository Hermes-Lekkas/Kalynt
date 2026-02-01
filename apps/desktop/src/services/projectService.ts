/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Project Management Service - Spaces, tasks, and collaboration
import { collabEngine } from './collabEngine'
import { storageService } from './storageService'
import { encryptionService } from './encryptionService'

export interface Project {
    id: string
    name: string
    icon: string
    description: string
    createdAt: number
    updatedAt: number
    ownerId: string
    settings: ProjectSettings
    members: ProjectMember[]
}

export interface ProjectSettings {
    isPublic: boolean
    requirePassword: boolean
    passwordHash?: string
    allowAnonymous: boolean
    editorMode: string
    theme: string
}

export interface ProjectMember {
    id: string
    name: string
    email?: string
    role: 'owner' | 'admin' | 'editor' | 'viewer'
    color: string
    joinedAt: number
    lastSeenAt: number
}

export interface Task {
    id: string
    projectId: string
    title: string
    description: string
    status: 'todo' | 'in-progress' | 'review' | 'done'
    priority: 'low' | 'medium' | 'high' | 'urgent'
    assigneeId?: string
    dueDate?: number
    tags: string[]
    createdAt: number
    updatedAt: number
    createdBy: string
    subtasks: Subtask[]
    comments: Comment[]
}

export interface Subtask {
    id: string
    title: string
    completed: boolean
}

export interface Comment {
    id: string
    userId: string
    userName: string
    content: string
    timestamp: number
}

export interface Activity {
    id: string
    projectId: string
    userId: string
    userName: string
    type: 'create' | 'update' | 'delete' | 'comment' | 'join' | 'leave'
    target: 'project' | 'task' | 'document' | 'member'
    targetId: string
    description: string
    timestamp: number
}

type ProjectCallback = (project: Project) => void
type TasksCallback = (tasks: Task[]) => void
type ActivityCallback = (activity: Activity) => void

class ProjectService {
    private projects: Map<string, Project> = new Map()
    private currentUserId: string = ''
    private currentUserName: string = 'Anonymous'

    // Callbacks
    private onProjectUpdate: ProjectCallback | null = null
    private onTasksUpdate: TasksCallback | null = null
    private onActivity: ActivityCallback | null = null

    setUser(userId: string, userName: string) {
        this.currentUserId = userId
        this.currentUserName = userName
    }

    setCallbacks(
        onProjectUpdate: ProjectCallback,
        onTasksUpdate: TasksCallback,
        onActivity: ActivityCallback
    ) {
        this.onProjectUpdate = onProjectUpdate
        this.onTasksUpdate = onTasksUpdate
        this.onActivity = onActivity
    }

    // Create project
    createProject(name: string, icon: string, description: string = ''): Project {
        const project: Project = {
            id: crypto.randomUUID(),
            name,
            icon,
            description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ownerId: this.currentUserId,
            settings: {
                isPublic: false,
                requirePassword: false,
                allowAnonymous: false,
                editorMode: 'general',
                theme: 'dark'
            },
            members: [{
                id: this.currentUserId,
                name: this.currentUserName,
                role: 'owner',
                color: this.generateColor(),
                joinedAt: Date.now(),
                lastSeenAt: Date.now()
            }]
        }

        this.projects.set(project.id, project)

        // Initialize collaborative document
        collabEngine.getDocument(project.id)

        // Save to storage
        storageService.saveSpace({
            id: project.id,
            name: project.name,
            icon: project.icon,
            createdAt: project.createdAt,
            lastModified: project.updatedAt
        })

        // Log activity
        this.logActivity(project.id, 'create', 'project', project.id, `Created project "${name}"`)

        return project
    }

    // Get project
    getProject(projectId: string): Project | undefined {
        return this.projects.get(projectId)
    }

    // Update project
    updateProject(projectId: string, updates: Partial<Project>): Project | null {
        const project = this.projects.get(projectId)
        if (!project) return null

        const updated = { ...project, ...updates, updatedAt: Date.now() }
        this.projects.set(projectId, updated)
        this.onProjectUpdate?.(updated)

        this.logActivity(projectId, 'update', 'project', projectId, `Updated project settings`)

        return updated
    }

    // Delete project
    deleteProject(projectId: string): boolean {
        const project = this.projects.get(projectId)
        if (!project) return false

        this.projects.delete(projectId)
        collabEngine.destroyDocument(projectId)
        storageService.deleteSpace(projectId)

        return true
    }

    // Set project password
    async setProjectPassword(projectId: string, password: string): Promise<void> {
        const hash = await encryptionService.hash(password)
        await encryptionService.setRoomKey(projectId, password)

        this.updateProject(projectId, {
            settings: {
                ...this.projects.get(projectId)!.settings,
                requirePassword: true,
                passwordHash: hash
            }
        })
    }

    // Verify project password
    async verifyPassword(projectId: string, password: string): Promise<boolean> {
        const project = this.projects.get(projectId)
        if (!project?.settings.passwordHash) return true

        return encryptionService.verifyHash(password, project.settings.passwordHash)
    }

    // Add member
    addMember(projectId: string, member: Omit<ProjectMember, 'joinedAt' | 'lastSeenAt'>): boolean {
        const project = this.projects.get(projectId)
        if (!project) return false

        const newMember: ProjectMember = {
            ...member,
            joinedAt: Date.now(),
            lastSeenAt: Date.now()
        }

        project.members.push(newMember)
        project.updatedAt = Date.now()
        this.onProjectUpdate?.(project)

        this.logActivity(projectId, 'join', 'member', member.id, `${member.name} joined the project`)

        return true
    }

    // Remove member
    removeMember(projectId: string, memberId: string): boolean {
        const project = this.projects.get(projectId)
        if (!project) return false

        const member = project.members.find(m => m.id === memberId)
        if (!member) return false

        project.members = project.members.filter(m => m.id !== memberId)
        project.updatedAt = Date.now()
        this.onProjectUpdate?.(project)

        this.logActivity(projectId, 'leave', 'member', memberId, `${member.name} left the project`)

        return true
    }

    // Get tasks from Yjs
    getTasks(projectId: string): Task[] {
        const doc = collabEngine.getDocument(projectId)
        const tasksArray = doc.getArray<Task>('tasks')
        return tasksArray.toArray()
    }

    // Create task
    createTask(projectId: string, task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'comments'>): Task {
        const doc = collabEngine.getDocument(projectId)
        const tasksArray = doc.getArray<Task>('tasks')

        const newTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: this.currentUserId,
            comments: []
        }

        tasksArray.push([newTask])
        this.onTasksUpdate?.(tasksArray.toArray())

        this.logActivity(projectId, 'create', 'task', newTask.id, `Created task "${task.title}"`)

        return newTask
    }

    // Update task
    updateTask(projectId: string, taskId: string, updates: Partial<Task>): boolean {
        const doc = collabEngine.getDocument(projectId)
        const tasksArray = doc.getArray<Task>('tasks')

        const index = tasksArray.toArray().findIndex(t => t.id === taskId)
        if (index === -1) return false

        const task = tasksArray.get(index)
        const updated = { ...task, ...updates, updatedAt: Date.now() }

        doc.transact(() => {
            tasksArray.delete(index)
            tasksArray.insert(index, [updated])
        })

        this.onTasksUpdate?.(tasksArray.toArray())
        this.logActivity(projectId, 'update', 'task', taskId, `Updated task "${updated.title}"`)

        return true
    }

    // Delete task
    deleteTask(projectId: string, taskId: string): boolean {
        const doc = collabEngine.getDocument(projectId)
        const tasksArray = doc.getArray<Task>('tasks')

        const index = tasksArray.toArray().findIndex(t => t.id === taskId)
        if (index === -1) return false

        const task = tasksArray.get(index)
        tasksArray.delete(index)

        this.onTasksUpdate?.(tasksArray.toArray())
        this.logActivity(projectId, 'delete', 'task', taskId, `Deleted task "${task.title}"`)

        return true
    }

    // Add comment to task
    addTaskComment(projectId: string, taskId: string, content: string): boolean {
        const doc = collabEngine.getDocument(projectId)
        const tasksArray = doc.getArray<Task>('tasks')

        const index = tasksArray.toArray().findIndex(t => t.id === taskId)
        if (index === -1) return false

        const task = tasksArray.get(index)
        const comment: Comment = {
            id: crypto.randomUUID(),
            userId: this.currentUserId,
            userName: this.currentUserName,
            content,
            timestamp: Date.now()
        }

        const updated = {
            ...task,
            comments: [...task.comments, comment],
            updatedAt: Date.now()
        }

        doc.transact(() => {
            tasksArray.delete(index)
            tasksArray.insert(index, [updated])
        })

        this.logActivity(projectId, 'comment', 'task', taskId, `Commented on "${task.title}"`)

        return true
    }

    // Log activity
    private logActivity(
        projectId: string,
        type: Activity['type'],
        target: Activity['target'],
        targetId: string,
        description: string
    ): void {
        const activity: Activity = {
            id: crypto.randomUUID(),
            projectId,
            userId: this.currentUserId,
            userName: this.currentUserName,
            type,
            target,
            targetId,
            description,
            timestamp: Date.now()
        }

        this.onActivity?.(activity)
    }

    // Generate random color for user
    private generateColor(): string {
        const colors = [
            '#ef4444', '#f97316', '#eab308', '#22c55e',
            '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
        ]
        return colors[Math.floor(Math.random() * colors.length)]
    }

    // Get all projects
    getAllProjects(): Project[] {
        return Array.from(this.projects.values())
    }

    // Export project data
    exportProject(projectId: string): string | null {
        const project = this.projects.get(projectId)
        if (!project) return null

        const state = collabEngine.exportState(projectId)
        const data = {
            project,
            documentState: state ? Array.from(state) : null,
            exportedAt: Date.now()
        }

        return JSON.stringify(data, null, 2)
    }

    // Import project data
    importProject(json: string): Project | null {
        try {
            const data = JSON.parse(json)
            const project = data.project as Project

            // Generate new ID to avoid conflicts
            project.id = crypto.randomUUID()
            project.createdAt = Date.now()
            project.updatedAt = Date.now()

            this.projects.set(project.id, project)

            if (data.documentState) {
                collabEngine.importState(project.id, new Uint8Array(data.documentState))
            }

            return project
        } catch (e) {
            console.error('Failed to import project:', e)
            return null
        }
    }
}

// Singleton
export const projectService = new ProjectService()
