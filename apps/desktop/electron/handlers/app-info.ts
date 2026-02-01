/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { detectHardwareInfo, getRealTimeStats } from '../services/hardware-service'

export function registerAppInfoHandlers(ipcMain: Electron.IpcMain, app: Electron.App, modelsDir: string) {
    ipcMain.handle('get-app-path', () => app.getPath('userData'))

    ipcMain.handle('get-version', () => app.getVersion())

    ipcMain.handle('get-models-directory', () => modelsDir)

    ipcMain.handle('shell:openExternal', async (_event, url: string) => {
        const electron = await import('electron')
        await electron.shell.openExternal(url)
    })

    ipcMain.handle('shell:showItemInFolder', async (_event, path: string) => {
        const electron = await import('electron')
        electron.shell.showItemInFolder(path)
    })

    ipcMain.handle('get-hardware-info', async () => {
        return await detectHardwareInfo()
    })

    ipcMain.handle('get-realtime-stats', () => {
        return getRealTimeStats()
    })
}
