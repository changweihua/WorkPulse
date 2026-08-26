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
  const size = 206

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
  // Windows 透明窗口必须用 'screen-saver' 级别才能真正置顶
  radialWindow.show()
  radialWindow.setAlwaysOnTop(true, 'screen-saver')

  // 透明区域鼠标穿透：圆外的透明四角不阻挡下方窗口
  // forward: true 保留 mousemove（光标跟踪），renderer 通过 IPC 动态切换
  radialWindow.setIgnoreMouseEvents(true, { forward: true })

  // Windows 透明窗口极不可靠：失去焦点、hide/show 切换都可能丢失置顶
  // 通过多事件持续重新断言 + 跨桌面可见来加固
  const enforceOnTop = (): void => {
    if (radialWindow && !radialWindow.isDestroyed()) {
      radialWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }

  radialWindow.on('focus', enforceOnTop)
  radialWindow.on('blur', () => {
    // 失去焦点后延迟重新断言（等其他窗口 Z-order 稳定）
    setTimeout(enforceOnTop, 100)
  })
  radialWindow.on('show', enforceOnTop)

  // 跨桌面可见（macOS Spaces / Linux workspaces）
  radialWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

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
    radialWindow.hide()
    // 不销毁窗口 — 保留引用，下次 show() 直接用，避免重建延迟和置顶丢失
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
    const route = RADIAL_ROUTES[action]
    if (route) {
      // 发送正确的 channel 格式：navigate:worklog, navigate:kanban 等
      const page = route.replace('/', '')
      win.webContents.send(`navigate:${page}`)
    }
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

// 径向菜单按钮 → 打开主窗口 + 导航到对应页面
ipcMain.handle('radial:navigate-to', (_event, page: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) {
    win.webContents.send(`navigate:${page}`)
  }
  hideRadialWindow()
  return true
})

// 拖拽：renderer 发送鼠标偏移，主进程移动窗口
let dragOffset = { x: 0, y: 0 }

// 透明区域鼠标穿透：renderer 动态切换
ipcMain.on('radial:set-ignore-mouse-events', (event, ignore: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, { forward: true })
  }
})

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
