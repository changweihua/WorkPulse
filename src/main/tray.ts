/**
 * 托盘模块：系统托盘图标 + 菜单
 */
import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { tMain } from './i18n'
import { appBus, SHOW_MAIN } from './event-bus'
import { setTray } from './notification'

type SendFn = (channel: string) => void

let tray: Tray | null = null
let cachedMenuIcons: { newLog: Electron.NativeImage; newTask: Electron.NativeImage; show: Electron.NativeImage; quit: Electron.NativeImage } | null = null

function getMenuIcons() {
  if (cachedMenuIcons) return cachedMenuIcons
  const iconDir = is.dev
    ? join(__dirname, '../../resources')
    : join(process.resourcesPath)
  cachedMenuIcons = {
    newLog: nativeImage.createFromPath(join(iconDir, 'menu-new-log.png')).resize({ width: 16, height: 16 }),
    newTask: nativeImage.createFromPath(join(iconDir, 'menu-new-task.png')).resize({ width: 16, height: 16 }),
    show: nativeImage.createFromPath(join(iconDir, 'menu-show.png')).resize({ width: 16, height: 16 }),
    quit: nativeImage.createFromPath(join(iconDir, 'menu-quit.png')).resize({ width: 16, height: 16 }),
  }
  return cachedMenuIcons
}

function buildTrayMenu(sendToRenderer: SendFn, onQuit: () => void): Electron.Menu {
  const { newLog: newLogIcon, newTask: newTaskIcon, show: showIcon, quit: quitIcon } = getMenuIcons()

  return Menu.buildFromTemplate([
    { label: tMain('newLog'), icon: newLogIcon, click: () => sendToRenderer('quick-create:log') },
    { label: tMain('newTask'), icon: newTaskIcon, click: () => sendToRenderer('quick-create:task') },
    { type: 'separator' },
    { label: tMain('showApp'), icon: showIcon, click: () => { appBus.emit(SHOW_MAIN) } },
    { type: 'separator' },
    { label: tMain('quit'), icon: quitIcon, click: onQuit }
  ])
}

export function createTray(sendToRenderer: SendFn, onQuit: () => void): void {
  const iconPath = is.dev
    ? join(__dirname, '../../resources/tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') {
    try {
      icon = nativeImage.createFromBuffer(readFileSync(iconPath), { scaleFactor: 2 })
    } catch { /* fallback */ }
  }
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABdJREFUeNpj/P//PwMlgHHUgFEDAAIMAAABBgABsp3F1QAAAABJRU5ErkJggg=='
    )
  }
  if (process.platform !== 'darwin') {
    icon = icon.resize({ width: 18, height: 18 })
  }
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('WorkPulse')
  tray.setContextMenu(buildTrayMenu(sendToRenderer, onQuit))
  setTray(tray)

  tray.on('click', () => {
    appBus.emit(SHOW_MAIN)
  })
}

export function rebuildTrayMenu(sendToRenderer: SendFn, onQuit: () => void): void {
  if (tray) tray.setContextMenu(buildTrayMenu(sendToRenderer, onQuit))
}

export function getTray(): Tray | null {
  return tray
}
