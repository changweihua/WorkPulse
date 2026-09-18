/**
 * 开机启动 + 关闭行为 + 窗口材质 IPC
 * 迁移至 guardedHandle 模式
 */
import { app, BrowserWindow } from 'electron'
import { getSetting, setSetting } from './db'
import log from 'electron-log/main'
import { guardedHandle, guardedQuery } from './ipc-guard'
import { ok } from '../shared/ipc-result'
import { AutoLaunchSchema, CloseActionSchema, WindowMaterialSchema } from './ipc-schemas'

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
  guardedHandle('set-auto-launch', AutoLaunchSchema, (data) => {
    setAutoLaunch(data.enable)
    return ok(undefined)
  })

  guardedQuery('get-auto-launch', () => {
    return ok(getAutoLaunch())
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

  guardedQuery('get-close-action', () => {
    return ok(getSetting('close_action') || 'minimize')
  })

  guardedHandle('set-close-action', CloseActionSchema, (data) => {
    setSetting('close_action', data.action)
    return ok(undefined)
  })

  guardedQuery('get-window-material', () => {
    return ok(getSetting('window_material') || 'tabbed')
  })

  guardedHandle('set-window-material', WindowMaterialSchema, (data) => {
    setSetting('window_material', data.material)
    const win = mainWinGetter()
    if (win && process.platform === 'win32') {
      try {
        win.setBackgroundMaterial(data.material as 'mica' | 'tabbed' | 'acrylic')
        win.setIcon(appIconPath)
      } catch (err) {
        log.error('[Main] setBackgroundMaterial failed:', err)
      }
    }
    return ok(undefined)
  })
}
