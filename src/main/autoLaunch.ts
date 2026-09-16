/**
 * 开机启动 + 关闭行为 + 窗口材质 IPC
 */
import { app, ipcMain, BrowserWindow } from 'electron'
import { getSetting, setSetting } from './db'
import log from 'electron-log/main'

let mainWinGetter: () => BrowserWindow | null = () => null
let appIconPath = ''

export function setAutoLaunchDeps(getMainWindow: () => BrowserWindow | null, iconPath: string): void {
  mainWinGetter = getMainWindow
  appIconPath = iconPath
}

export function setAutoLaunch(enable: boolean): void {
  setSetting('auto_launch', enable ? 'true' : 'false')
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: app.getPath('exe'),
      args: enable ? ['--hidden'] : []
    })
  }
}

export function getAutoLaunch(): boolean {
  const saved = getSetting('auto_launch')
  if (saved !== null) return saved === 'true'
  return app.getLoginItemSettings().openAtLogin
}

export function registerAutoLaunchIpc(): void {
  ipcMain.handle('set-auto-launch', (_event, enable: boolean) => {
    setAutoLaunch(enable)
    return { success: true }
  })

  ipcMain.handle('get-auto-launch', () => {
    return getAutoLaunch()
  })

  // 启动时恢复系统登录项设置
  if (app.isPackaged) {
    const savedAutoLaunch = getSetting('auto_launch')
    if (savedAutoLaunch !== null) {
      app.setLoginItemSettings({
        openAtLogin: savedAutoLaunch === 'true',
        path: app.getPath('exe'),
        args: savedAutoLaunch === 'true' ? ['--hidden'] : []
      })
    }
  }

  // 关闭行为设置
  ipcMain.handle('get-close-action', () => {
    return getSetting('close_action') || 'minimize'
  })

  ipcMain.handle('set-close-action', (_event, action: string) => {
    setSetting('close_action', action)
    return { success: true }
  })

  // 窗口材质
  ipcMain.handle('get-window-material', () => {
    return getSetting('window_material') || 'tabbed'
  })

  ipcMain.handle('set-window-material', (_event, material: string) => {
    setSetting('window_material', material)
    const win = mainWinGetter()
    if (win && process.platform === 'win32') {
      try {
        win.setBackgroundMaterial(material as 'mica' | 'tabbed' | 'acrylic')
        win.setIcon(appIconPath)
      } catch (err) {
        log.error('[Main] setBackgroundMaterial failed:', err)
        return { success: false }
      }
    }
    return { success: true }
  })
}
