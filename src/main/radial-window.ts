import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL } from './event-bus'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

const EXPANDED_SIZE = 206
const COLLAPSED_SIZE = 48

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

/**
 * 生成圆形区域的矩形近似（用于 setShape）
 * 将圆按扫描线拆分为若干矩形，圆外区域的点击会穿透到下层窗口
 */
function circleShape(cx: number, cy: number, r: number, step = 2): Electron.Rectangle[] {
  const rects: Electron.Rectangle[] = []
  for (let y = 0; y < 2 * r; y += step) {
    const dy = y - r + 0.5 * step
    const half = Math.sqrt(Math.max(0, r * r - dy * dy))
    rects.push({
      x: Math.round(cx - half),
      y: Math.round(y),
      width: Math.round(half * 2),
      height: step,
    })
  }
  return rects
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const size = COLLAPSED_SIZE

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
    focusable: false,
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

  radialWindow.show()
  radialWindow.setAlwaysOnTop(true, 'screen-saver')

  // 初始 setShape：中心 48px 圆
  if (process.platform !== 'darwin') {
    radialWindow.setShape(circleShape(size / 2, size / 2, size / 2))
  }

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

// 展开：resize 到 206×206 + setShape 全圆
ipcMain.on('radial:expand', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const newX = x + Math.floor((w - EXPANDED_SIZE) / 2)
  const newY = y + Math.floor((h - EXPANDED_SIZE) / 2)
  win.setBounds({ x: newX, y: newY, width: EXPANDED_SIZE, height: EXPANDED_SIZE })
  if (process.platform !== 'darwin') {
    win.setShape(circleShape(EXPANDED_SIZE / 2, EXPANDED_SIZE / 2, EXPANDED_SIZE / 2))
  }
})

// 折叠：resize 回 48×48 + setShape 小圆
ipcMain.on('radial:collapse', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const newX = x + Math.floor((w - COLLAPSED_SIZE) / 2)
  const newY = y + Math.floor((h - COLLAPSED_SIZE) / 2)
  win.setBounds({ x: newX, y: newY, width: COLLAPSED_SIZE, height: COLLAPSED_SIZE })
  if (process.platform !== 'darwin') {
    win.setShape(circleShape(COLLAPSED_SIZE / 2, COLLAPSED_SIZE / 2, COLLAPSED_SIZE / 2))
  }
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
  { id: 'ai', label: 'AI Chat', route: '/calendar' },
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