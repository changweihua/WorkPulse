import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL } from './event-bus'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

// 方案 C：窗口永远 206×206，不做 resize
const WIDGET_SIZE = 206

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay()

  const savedX = getSetting('radial_pos_x')
  const savedY = getSetting('radial_pos_y')
  const x =
    savedX !== null && savedY !== null
      ? Math.round(Number(savedX))
      : Math.round(display.workArea.x + (display.workArea.width - WIDGET_SIZE) / 2)
  const y =
    savedX !== null && savedY !== null
      ? Math.round(Number(savedY))
      : Math.round(display.workArea.y + (display.workArea.height - WIDGET_SIZE) / 2)

  radialWindow = new BrowserWindow({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,            // 不抢焦点 — 输入通过 DOM 事件
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

  // showInactive：不抢焦点（Meel 模式）
  radialWindow.showInactive()
  radialWindow.setAlwaysOnTop(true, 'screen-saver')

  // 方案 C：setIgnoreMouseEvents + forward — 全窗口点击穿透，但 mousemove 转发给 renderer
  // renderer 检测中心按钮 hover 后，发送 radial:interactive 切换穿透状态
  radialWindow.setIgnoreMouseEvents(true, { forward: true })

  // 窗口始终可见，不销毁（hide/show 切换）
  const enforceOnTop = (): void => {
    if (radialWindow && !radialWindow.isDestroyed()) {
      radialWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }

  radialWindow.on('focus', enforceOnTop)
  radialWindow.on('blur', () => {
    setTimeout(enforceOnTop, 100)
  })
  radialWindow.on('show', enforceOnTop)

  radialWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  radialWindow.webContents.on('did-finish-load', () => {
    radialWindow?.webContents.send('radial:show')
  })

  return radialWindow
}

export function showRadialWindow(parent: BrowserWindow): void {
  appBus.emit(SHOW_RADIAL, parent)
}

export function toggleRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    appBus.emit(SHOW_MAIN)
  } else {
    appBus.emit(SHOW_RADIAL, parent)
  }
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    // 折叠回穿透状态，再隐藏
    radialWindow.setIgnoreMouseEvents(true, { forward: true })
    radialWindow.hide()
  }
}

export function showMainWindow(): void {
  appBus.emit(SHOW_MAIN)
}

export function getRadialWindow(): BrowserWindow | null {
  return radialWindow && !radialWindow.isDestroyed() ? radialWindow : null
}

// --- IPC ---

// 方案 C：renderer 检测到中心按钮 hover 时，切换穿透状态
// expanded=false 且 hover 中心 → setIgnoreMouseEvents(false) → 窗口可交互
// 展开后 → setIgnoreMouseEvents(false) → 全窗口可交互
// 折叠时 → setIgnoreMouseEvents(true, { forward: true }) → 穿透
ipcMain.on('radial:interactive', (_event, interactive: boolean) => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(!interactive, { forward: true })
})

// 展开：不做 resize，只切换穿透状态（renderer 已通过 clip-path 动画显示内容）
ipcMain.on('radial:expand', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  // 展开后全窗口可交互（ring items 需要点击）
  win.setIgnoreMouseEvents(false)
})

// 折叠：切换回穿透状态（renderer 通过 clip-path 动画收起内容）
ipcMain.on('radial:collapse', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  // 折叠后穿透（只保留中心按钮区域可交互，由 renderer 控制）
  win.setIgnoreMouseEvents(true, { forward: true })
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

ipcMain.handle('radial:action', (_event, action: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) {
    const RADIAL_ROUTES: Record<string, string> = {
      log: '/worklog',
      task: '/kanban',
      meeting: '/calendar',
      ai: '/chat',
    }
    const route = RADIAL_ROUTES[action]
    if (route) {
      const page = route.replace('/', '')
      win.webContents.send(`navigate:${page}`)
    }
  }
  hideRadialWindow()
  return true
})

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

ipcMain.handle('radial:navigate-to', (_event, page: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) {
    win.webContents.send(`navigate:${page}`)
  }
  hideRadialWindow()
  return true
})

// 拖拽
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
