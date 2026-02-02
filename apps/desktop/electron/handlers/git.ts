/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import path from 'node:path'
import fs from 'node:fs'
import simpleGit, { SimpleGit } from 'simple-git'

export function registerGitHandlers(ipcMain: Electron.IpcMain, getCurrentWorkspacePath: () => string | null) {
    ipcMain.handle('git:status', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            const status = await git.status()
            return { success: true, status }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:log', async (_event, options: { repoPath: string, maxCount?: number }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            const log = await git.log({ maxCount: options.maxCount || 50 })
            return { success: true, log }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:diff', async (_event, options: { repoPath: string, file?: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(options.repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            const diff = options.file
                ? await git.diff(['--', options.file])
                : await git.diff()
            if (diff.length > 5 * 1024 * 1024) {
                return { success: false, error: 'Diff too large to display' }
            }
            return { success: true, diff }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:add', async (_event, options: { repoPath: string, files: string[] }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(options.repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            await git.add(options.files)
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:commit', async (_event, options: { repoPath: string, message: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(options.repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            const result = await git.commit(options.message)
            return { success: true, result }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:branch', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            const branches = await git.branch()
            return { success: true, branches }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:checkout', async (_event, options: { repoPath: string, branch: string }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            await git.checkout(options.branch)
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:reset', async (_event, options: { repoPath: string, files: string[] }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            await git.reset(['HEAD', '--', ...options.files])
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:push', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            await git.push()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:pull', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            await git.pull()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Initialize a new git repository
    ipcMain.handle('git:init', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (fs.existsSync(path.join(repoPath, '.git'))) {
                return { success: false, error: 'Already a git repository' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            await git.init()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Discard changes (checkout file from HEAD)
    ipcMain.handle('git:discard', async (_event, options: { repoPath: string, files: string[] }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            // For untracked files, we need to delete them
            // For tracked files, checkout from HEAD
            await git.checkout(['--', ...options.files])
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Create a new branch
    ipcMain.handle('git:createBranch', async (_event, options: { repoPath: string, branchName: string, checkout?: boolean }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(options.repoPath)
            if (options.checkout) {
                await git.checkoutLocalBranch(options.branchName)
            } else {
                await git.branch([options.branchName])
            }
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Fetch from remote
    ipcMain.handle('git:fetch', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            await git.fetch()
            return { success: true }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    // Get remote info (ahead/behind counts)
    ipcMain.handle('git:remote', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            const git: SimpleGit = simpleGit(repoPath)
            const status = await git.status()
            return {
                success: true,
                ahead: status.ahead,
                behind: status.behind,
                tracking: status.tracking
            }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })
}
