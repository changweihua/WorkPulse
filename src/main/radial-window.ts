import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL } from './event-bus'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

// 方案 C（Meel 架构）：窗口固定206×206，不做 resize
const WIDGET_SIZE = 206
const CENTER_R = 24
const POLL_INTERVAL_MS = 8

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

/**
 * 生成圆形区域的矩形近似（用于 setShape）
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

// ─── 方案 C：主进程轮询光标位置（Meel 模式） ───
let cursorPollTimer: ReturnType<typeof setInterval> | null = null

function startCursorPolling(win: BrowserWindow): void {
  stopCursorPolling()
  cursorPollTimer = setInterval(() => {
    if (win.isDestroyed()) { stopCursorPolling(); return }
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const localX = cursor.x - wx
    const localY = cursor.y - wy
    const dx = localX - WIDGET_SIZE / 2
    const dy = localY - WIDGET_SIZE / 2
    const dist = Math.sqrt(dx * dx + dy * dy)
    const isOverCenter = dist <= CENTER_R
    // 发送光标位置给 renderer（用于高亮）
    win.webContents.send('radial:cursor', { x: localX, y: localY, dist, isOverCenter })
  }, POLL_INTERVAL_MS)
}

function stopCursorPolling(): void {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null }
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
    focusable: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    movable: false,               // 拖拽由主进程通过 setPosition 处理
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

  // 方案 C：setShape 定义可交互区域（中心 48px 圆）
  // 圆外区域的点击穿透到下层窗口
  if (process.platform !== 'darwin') {
    radialWindow.setShape(circleShape(WIDGET_SIZE / 2, WIDGET_SIZE / 2, CENTER_R + 2))
  }

  // 启动光标轮询
  startCursorPolling(radialWindow)

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
  radialWindow.on('closed', stopCursorPolling)

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

// 展开：setShape 扩大到全圆（环形菜单可交互）
ipcMain.on('radial:expand', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  if (process.platform !== 'darwin') {
    win.setShape(circleShape(WIDGET_SIZE / 2, WIDGET_SIZE / 2, WIDGET_SIZE / 2))
  }
})

// 折叠：setShape 缩小到中心 48px 圆
ipcMain.on('radial:collapse', () => {
  const win = getRadialWindow()
  if (!win || win.isDestroyed()) return
  if (process.platform !== 'darwin') {
    win.setShape(circleShape(WIDGET_SIZE / 2, WIDGET_SIZE / 2, CENTER_R + 2))
  }
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