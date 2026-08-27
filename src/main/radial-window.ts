import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL, RADIAL_SCREENSHOT } from './event-bus'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

// 窗口内 widget 尺寸（与 renderer 的 WIDGET_SIZE 一致）
const WIDGET_SIZE = 206
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2
const INNER_R = 38
const OUTER_R = 94
const SEG_ANGLE = 72
const POLL_INTERVAL_MS = 8

// 径向菜单扇区定义（角度与 renderer 严格保持一致）
const RADIAL_ITEMS = [
  { key: 'log', label: 'Work Log', angle: -90, route: 'worklog' },
  { key: 'task', label: 'Task', angle: -18, route: 'kanban' },
  { key: 'meeting', label: 'Meeting', angle: 54, route: 'calendar' },
  { key: 'ai', label: 'AI Chat', angle: 126, route: 'chat' },
  { key: 'screenshot', label: 'Screenshot', angle: 198, route: '' },
]

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

// ─── Meel 架构：窗口状态（主进程持有，renderer 仅做视觉呈现） ───
let expanded = false
let anchor = { x: CX, y: CY } // 展开时光标在窗口内的坐标（widget 锚点）
let currentHovered: string | null = null

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
    const dx = localX - anchor.x
    const dy = localY - anchor.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const isOverCenter = dist <= 24 // 收起态中心圆半径
    win.webContents.send('radial:cursor', { x: localX, y: localY, dist, isOverCenter })
    // 展开态：主进程直接计算命中扇区（与 renderer 视觉高亮保持一致）
    if (expanded) {
      currentHovered = computeHovered(localX, localY)
    }
  }, POLL_INTERVAL_MS)
}

function stopCursorPolling(): void {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null }
}

// 根据光标在窗口内的坐标计算命中的扇区
function computeHovered(localX: number, localY: number): string | null {
  const dx = localX - anchor.x
  const dy = localY - anchor.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < INNER_R || dist > OUTER_R) return null
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
  if (angle < 0) angle += 360
  let bestKey: string | null = null
  let bestDist = Infinity
  for (const item of RADIAL_ITEMS) {
    let diff = Math.abs(angle - item.angle)
    if (diff > 180) diff = 360 - diff
    if (diff < SEG_ANGLE / 2 && diff < bestDist) {
      bestDist = diff
      bestKey = item.key
    }
  }
  return bestKey
}

/**
 * Meel 架构：窗口创建一次（show:false），之后通过 show/hide 复用，永不销毁/重建。
 * - focusable:false — 永远不抢键盘焦点
 * - movable:false — 完全由主进程控制
 * - setIgnoreMouseEvents(true, {forward:true}) — 100% 点击穿透，renderer 永不接收点击
 * - 不使用 setShape（Meel 也不使用）
 */
export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay()

  radialWindow = new BrowserWindow({
    width: display.bounds.width,
    height: display.bounds.height,
    x: display.bounds.x,
    y: display.bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false, // Meel: NEVER steal focus
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false, // Meel: NOT shown at creation
    webPreferences: {
      preload: join(__dirname, '../preload/radial.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      v8CacheOptions: 'none',
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/radial.html`)
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/radial.html'))
  }

  // Meel: 永远不抢焦点、永远可点击穿透
  radialWindow.setAlwaysOnTop(true, 'screen-saver')
  radialWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  radialWindow.setIgnoreMouseEvents(true, { forward: true }) // CLICK-THROUGH

  // 启动光标轮询
  startCursorPolling(radialWindow)

  // Meel: 每次 show/blur 后重新断言 alwaysOnTop
  const enforceOnTop = (): void => {
    if (radialWindow && !radialWindow.isDestroyed()) {
      radialWindow.setAlwaysOnTop(true, 'screen-saver')
      radialWindow.moveTop()
    }
  }
  radialWindow.on('show', enforceOnTop)
  radialWindow.on('blur', () => {
    setTimeout(enforceOnTop, 100)
  })
  radialWindow.on('closed', stopCursorPolling)

  radialWindow.webContents.on('did-finish-load', () => {
    // 初始通知 renderer（收起态）
    radialWindow?.webContents.send('radial:show')
    radialWindow?.webContents.send('radial:state', { expanded: false, anchorX: anchor.x, anchorY: anchor.y })
  })

  return radialWindow
}

/**
 * Meel 的 show()：覆盖光标所在显示器 → 重新断言置顶 → showInactive（不抢焦点）→ moveTop
 */
export function showRadialWindow(parent?: BrowserWindow): void {
  const win = radialWindow
  if (!win || win.isDestroyed()) {
    const p = parent && !parent.isDestroyed() ? parent : getMainWindow()
    if (p) createRadialWindow(p)
    return
  }
  // (1) 覆盖光标所在显示器的整个区域
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const b = display.bounds
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  // (2) 重新断言最高层级
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // (3) 点击穿透
  win.setIgnoreMouseEvents(true, { forward: true })
  // (4) 显示但不抢焦点
  win.showInactive()
  win.moveTop()
  // 收起态
  expanded = false
  currentHovered = null
  win.webContents.send('radial:state', { expanded: false, anchorX: anchor.x, anchorY: anchor.y })
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.hide()
  }
}

export function getRadialWindow(): BrowserWindow | null {
  return radialWindow && !radialWindow.isDestroyed() ? radialWindow : null
}

// ─── 展开 / 收起 / 触发（由全局快捷键驱动，renderer 不参与交互） ───

function expandRadial(): void {
  const win = radialWindow
  if (!win || win.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = win.getPosition()
  anchor = { x: cursor.x - wx, y: cursor.y - wy }
  expanded = true
  currentHovered = null
  win.webContents.send('radial:state', { expanded: true, anchorX: anchor.x, anchorY: anchor.y })
}

function collapseRadial(): void {
  const win = radialWindow
  expanded = false
  currentHovered = null
  if (win && !win.isDestroyed()) {
    win.webContents.send('radial:state', { expanded: false, anchorX: anchor.x, anchorY: anchor.y })
  }
}

function fireRadialAction(key: string): void {
  if (key === 'screenshot') {
    // 截图流程由 index.ts 监听该事件触发（避免循环依赖）
    appBus.emit(RADIAL_SCREENSHOT)
    return
  }
  const item = RADIAL_ITEMS.find((i) => i.key === key)
  if (item?.route) {
    appBus.emit(SHOW_MAIN)
    const main = getMainWindow()
    if (main) {
      main.webContents.send(`navigate:${item.route}`)
    }
  }
}

/**
 * 全局快捷键回调（Ctrl+Space）：
 * - 收起态 → 展开（在光标处显示环形菜单）
 * - 展开态 → 触发当前 hover 的扇区动作，然后收起
 */
export function toggleRadialFromShortcut(): void {
  if (!radialWindow || radialWindow.isDestroyed()) return
  if (!expanded) {
    expandRadial()
  } else {
    const key = currentHovered
    collapseRadial()
    if (key) fireRadialAction(key)
  }
}

// --- IPC ---

ipcMain.handle('radial:action', (_event, action: string) => {
  fireRadialAction(action)
  return true
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

ipcMain.handle('radial:navigate-to', (_event, page: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) {
    win.webContents.send(`navigate:${page}`)
  }
  hideRadialWindow()
  return true
})
