import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL } from './event-bus'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const size = 340

  const savedX = getSetting('radial_pos_x')
  const savedY = getSetting('radial_pos_y')
  const x =
    savedX !== null && savedY !== null
      ? Math.round(Number(savedX))
      : Math.round(display.workArea.x + (display.workArea.width - size) / 2)
  const y =
    savedX !== null && savedY !== null
      ? Math.round(Number(savedY))
      : Math.round(display.workArea.y + (display.workArea.height - size) / 2)

  radialWindow = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    movable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/radial.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/radial.html`)
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/radial.html'))
  }

  // 显式调用 show()，避免 Windows 透明窗口静默创建不显示
  radialWindow.show()

  radialWindow.webContents.on('did-finish-load', () => {
    radialWindow?.webContents.send('radial:show')
  })

  return radialWindow
}

/** 显示径向菜单，同时隐藏主窗口（通过事件总线） */
export function showRadialWindow(parent: BrowserWindow): void {
  appBus.emit(SHOW_RADIAL, parent)
}

/** 切换径向菜单 ↔ 主窗口（互斥，通过事件总线） */
export function toggleRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    appBus.emit(SHOW_MAIN)
  } else {
    appBus.emit(SHOW_RADIAL, parent)
  }
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.close()
    radialWindow = null
  }
}

/** 托盘显示主窗口：隐藏径向菜单（通过事件总线） */
export function showMainWindow(): void {
  appBus.emit(SHOW_MAIN)
}

/** 获取当前径向菜单窗口引用（供事件处理器使用） */
export function getRadialWindow(): BrowserWindow | null {
  return radialWindow && !radialWindow.isDestroyed() ? radialWindow : null
}

// --- IPC ---
const RADIAL_ROUTES: Record<string, string> = {
  log: '/worklog',
  task: '/kanban',
  meeting: '/calendar',
  ai: '/chat',
}

ipcMain.handle('radial:action', (_event, action: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) {
    const route = RADIAL_ROUTES[action] ?? action
    win.webContents.send('navigate', route)
  }
  hideRadialWindow()
  return true
})

ipcMain.on('radial:drag-end', () => {
  if (radialWindow && !radialWindow.isDestroyed()) {
    const [x, y] = radialWindow.getPosition()
    setSetting('radial_pos_x', String(x))
    setSetting('radial_pos_y', String(y))
  }
})

const DEFAULT_RADIAL_ITEMS = [
  { id: 'log', label: 'Work Log', route: '/worklog' },
  { id: 'task', label: 'Tasks', route: '/kanban' },
  { id: 'meeting', label: 'Meetings', route: '/calendar' },
  { id: 'ai', label: 'AI Chat', route: '/chat' },
]

ipcMain.handle('radial:get-config', () => {
  const saved = getSetting('radial_items')
  if (saved === null) return DEFAULT_RADIAL_ITEMS
  try {
    return JSON.parse(saved)
  } catch {
    return DEFAULT_RADIAL_ITEMS
  }
})

ipcMain.handle('radial:set-config', (_event, items: unknown) => {
  setSetting('radial_items', JSON.stringify(items))
  return true
})

ipcMain.handle('radial:close', () => {
  appBus.emit(SHOW_RADIAL)
  return true
})

// 拖拽：renderer 发送鼠标偏移，主进程移动窗口
let dragOffset = { x: 0, y: 0 }

ipcMain.on('radial:drag-start', (event, mouseX: number, mouseY: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const [winX, winY] = win.getPosition()
  dragOffset = { x: mouseX - winX, y: mouseY - winY }
})

ipcMain.on('radial:drag-move', (event, mouseX: number, mouseY: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  win.setPosition(mouseX - dragOffset.x, mouseY - dragOffset.y)
})
