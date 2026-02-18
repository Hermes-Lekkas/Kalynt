/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import path from 'node:path'
import fs from 'node:fs'
import simpleGit, { SimpleGit } from 'simple-git'
import { safeStorage } from 'electron'

async function getGitHubToken(userDataPath: string): Promise<string | null> {
    try {
        const filePath = path.join(userDataPath, 'secure-keys.json')
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8')
            const keys = JSON.parse(data)
            const encryptedBase64 = keys['github-update-token']
            if (encryptedBase64 && safeStorage.isEncryptionAvailable()) {
                const encrypted = Buffer.from(encryptedBase64, 'base64')
                return safeStorage.decryptString(encrypted)
            }
        }
    } catch (e) {
        console.error('[Git] Failed to get GitHub token:', e)
    }
    return null
}

export function registerGitHandlers(ipcMain: Electron.IpcMain, getCurrentWorkspacePath: () => string | null, getUserDataPath: () => string) {
    // Helper to get git instance with auth
    const getGit = async (repoPath: string) => {
        const git: SimpleGit = simpleGit(repoPath)
        
        if (safeStorage.isEncryptionAvailable()) {
            const token = await getGitHubToken(getUserDataPath())
            if (token) {
                // Configure git to use the token for HTTPS remotes on github.com
                await git.addConfig('http.https://github.com/.extraheader', `AUTHORIZATION: basic ${Buffer.from(`token:${token}`).toString('base64')}`)
            }
        }
        
        return git
    }

    ipcMain.handle('git:status', async (_event, repoPath: string) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git = await getGit(repoPath)
            const status = await git.status()
            return { success: true, status: JSON.parse(JSON.stringify(status)) }
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
            const git = await getGit(options.repoPath)
            const log = await git.log({ maxCount: options.maxCount || 50 })
            return { success: true, log: JSON.parse(JSON.stringify(log)) }
        } catch (error) {
            return { success: false, error: String(error) }
        }
    })

    ipcMain.handle('git:diff', async (_event, options: { repoPath: string, file?: string, staged?: boolean }) => {
        try {
            const currentWorkspacePath = getCurrentWorkspacePath()
            if (!currentWorkspacePath || !options.repoPath.startsWith(currentWorkspacePath)) {
                return { success: false, error: 'Invalid repo path' }
            }
            if (!fs.existsSync(path.join(options.repoPath, '.git'))) {
                return { success: false, error: 'Not a git repository' }
            }
            const git = await getGit(options.repoPath)
            const args: string[] = []
            if (options.staged) args.push('--cached')
            if (options.file) args.push('--', options.file)
            const diff = args.length > 0 ? await git.diff(args) : await git.diff()
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(repoPath)
            const branches = await git.branch()
            return { success: true, branches: JSON.parse(JSON.stringify(branches)) }
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(repoPath)
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
            const git = await getGit(repoPath)
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
            const git = await getGit(repoPath)
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(options.repoPath)
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
            const git = await getGit(repoPath)
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
            const git = await getGit(repoPath)
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

    // NEW: Clone a repository
    ipcMain.handle('git:clone', async (_event, options: { url: string, targetPath: string }) => {
        try {
            // Ensure target directory exists or parent exists
            const parentDir = path.dirname(options.targetPath)
            if (!fs.existsSync(parentDir)) {
                await fs.promises.mkdir(parentDir, { recursive: true })
            }

            const git: SimpleGit = simpleGit()
            const token = await getGitHubToken(getUserDataPath())
            
            let cloneUrl = options.url
            if (token && cloneUrl.includes('github.com')) {
                // For cloning, we can inject the token into the URL
                // e.g. https://token@github.com/user/repo.git
                cloneUrl = cloneUrl.replace('https://', `https://token:${token}@`)
            }

            await git.clone(cloneUrl, options.targetPath)
            return { success: true }
        } catch (error) {
            console.error('[Git] Clone failed:', error)
            return { success: false, error: String(error) }
        }
    })
}
