import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from './db'
import { appBus, SHOW_MAIN, SHOW_RADIAL, RADIAL_SCREENSHOT } from './event-bus'
import { setMoveCursor, restoreCursor } from './cursor'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

/* ── 尺寸常量（与 renderer 严格一致） ── */
const WIDGET_SIZE = 206
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2
const INNER_R = 38
const OUTER_R = 94
const CENTER_R = 24
const EXPANDED_R = 103 // 展开态可点击半径（= INNER_R + gap + (OUTER_R - INNER_R)/2）
const SEG_ANGLE = 72
const POLL_INTERVAL_MS = 30

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

// ─── 混合方案：Meel 原则 + DOM 交互 ───
// Meel 原则：窗口创建一次复用、focusable:false、alwaysOnTop re-assert、光标轮询
// 区别：show:true（默认显示）、setShape 点击穿透、DOM 点击/拖拽
let expanded = false

// ─── 光标轮询（Meel 原则） ───
let cursorPollTimer: ReturnType<typeof setInterval> | null = null

function startCursorPolling(win: BrowserWindow): void {
  stopCursorPolling()
  cursorPollTimer = setInterval(() => {
    if (win.isDestroyed()) { stopCursorPolling(); return }
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const localX = cursor.x - wx
    const localY = cursor.y - wy
    const dx = localX - CX
    const dy = localY - CY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const isOverCenter = dist <= CENTER_R
    // Skip IPC send when window is hidden and not expanded (no cursor tracking needed)
    if (!win.isVisible() && !expanded) return
    win.webContents.send('radial:cursor', { x: localX, y: localY, dist, isOverCenter })
  }, POLL_INTERVAL_MS)
}

function stopCursorPolling(): void {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null }
}

// ─── setShape: OS 级点击穿透 ───
// Windows: setShape 定义可点击区域，区域外的鼠标事件穿透到下层窗口
function applyShape(win: BrowserWindow, radius: number): void {
  const x = Math.round(CX - radius)
  const y = Math.round(CY - radius)
  const size = Math.round(radius * 2)
  win.setShape([{ x, y, width: size, height: size }])
}

// ─── 展开 / 收起 ───

function expandRadial(): void {
  const win = radialWindow
  if (!win || win.isDestroyed()) return
  expanded = true
  applyShape(win, EXPANDED_R)
  win.webContents.send('radial:state', { expanded: true })
}

function collapseRadial(): void {
  const win = radialWindow
  if (!win || win.isDestroyed()) return
  expanded = false
  applyShape(win, CENTER_R)
  win.webContents.send('radial:state', { expanded: false })
}

function fireRadialAction(key: string): void {
  if (key === 'screenshot') {
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
 * 创建径向菜单悬浮窗 — 创建一次，永不销毁（Meel 原则）。
 *
 * 与 Meel 的区别：
 * - show:true → 默认显示（不是隐藏）
 * - setShape → OS 级点击穿透（不是 setIgnoreMouseEvents）
 * - DOM 事件 → 点击/拖拽（不是全局 hook）
 * - focusable:false + alwaysOnTop re-assert → 与 Meel 一致
 */
function savePosition(): void {
  if (!radialWindow || radialWindow.isDestroyed()) return
  const [x, y] = radialWindow.getPosition()
  setSetting('radial_position', JSON.stringify({ x, y }))
}

function getSavedPosition(): { x: number; y: number } | null {
  const raw = getSetting('radial_position')
  if (!raw) return null
  try {
    const pos = JSON.parse(raw) as { x: number; y: number }
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos
  } catch { /* ignore */ }
  return null
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const b = display.workArea
  // 优先恢复上次位置，否则居中
  const saved = getSavedPosition()
  let x = b.x + Math.floor((b.width - WIDGET_SIZE) / 2)
  let y = b.y + Math.floor((b.height - WIDGET_SIZE) / 2)
  if (saved) {
    // 确保仍在屏幕内
    x = Math.max(b.x, Math.min(saved.x, b.x + b.width - WIDGET_SIZE))
    y = Math.max(b.y, Math.min(saved.y, b.y + b.height - WIDGET_SIZE))
  }

  radialWindow = new BrowserWindow({
    x, y,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,       // 拖拽通过 IPC 控制（Meel 原则）
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,     // 永不抢焦点（Meel 原则）
    hasShadow: false,
    backgroundColor: '#00000000',
    show: true,           // 默认显示（与 Meel 的区别）
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

  // Meel 原则：alwaysOnTop + re-assert on show/blur
  radialWindow.setAlwaysOnTop(true, 'screen-saver')
  radialWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 光标轮询（Meel 原则）
  startCursorPolling(radialWindow)

  // Re-assert alwaysOnTop（Meel 原则 + 周期性强制置顶）
  // 主窗口可见时隐藏悬浮窗，主窗口隐藏时才置顶
  let lastMainVisible: boolean | null = null
  const enforceOnTop = (): void => {
    if (isRadialEnabled() === false) return
    if (radialWindow && !radialWindow.isDestroyed()) {
      const main = getMainWindow()
      const mainVisible = !!(main && !main.isDestroyed() && main.isVisible())
      if (mainVisible === lastMainVisible) return
      lastMainVisible = mainVisible
      if (mainVisible) {
        // 主窗口可见 → 隐藏悬浮窗
        radialWindow.hide()
      } else {
        // 主窗口隐藏 → 置顶悬浮窗
        radialWindow.setAlwaysOnTop(true, 'screen-saver')
        radialWindow.moveTop()
      }
    }
  }
  radialWindow.on('show', enforceOnTop)
  radialWindow.on('blur', () => setTimeout(enforceOnTop, 100))
  radialWindow.on('focus', enforceOnTop)
  // 周期性强制置顶（防止其他窗口抢占 z-order）
  const topInterval = setInterval(enforceOnTop, 3000)
  radialWindow.on('closed', () => {
    clearInterval(topInterval)
    stopCursorPolling()
    if (saveTimer) clearTimeout(saveTimer)
    isDragging = false
  })

  // 位置记忆：拖拽结束后保存
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(savePosition, 500)
  }
  radialWindow.on('move', debouncedSave)

  // 内容加载完成后，应用收起态 setShape 并通知 renderer
  radialWindow.webContents.on('did-finish-load', () => {
    if (radialWindow && !radialWindow.isDestroyed()) {
      applyShape(radialWindow, CENTER_R) // 收起态：仅中心圆可点击
      radialWindow.webContents.send('radial:state', { expanded: false })
    }
  })

  return radialWindow
}

// ─── 公开 API ───

export function showRadialWindow(): void {
  if (isRadialEnabled() === false) return
  const win = radialWindow
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.moveTop()
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.hide()
  }
}

export function getRadialWindow(): BrowserWindow | null {
  return radialWindow && !radialWindow.isDestroyed() ? radialWindow : null
}

export function isRadialEnabled(): boolean {
  return getSetting('radial_enabled') !== '0'
}

// ─── IPC: renderer → main ───

// 中心按钮点击：展开 / 收起
ipcMain.on('radial:center-click', () => {
  if (!expanded) {
    expandRadial()
  } else {
    collapseRadial()
  }
})

// 扇区点击：执行动作 + 收起
ipcMain.on('radial:segment-click', (_event, key: string) => {
  collapseRadial()
  fireRadialAction(key)
})

// 拖拽（center button mousedown → document mousemove → mouseup）
let isDragging = false

ipcMain.on('radial:drag-start', () => {
  isDragging = true
  if (radialWindow && !radialWindow.isDestroyed()) {
    applyShape(radialWindow, WIDGET_SIZE / 2)
    setMoveCursor()
  }
})

ipcMain.on('radial:drag-move', (_event, dx: number, dy: number) => {
  if (!isDragging || !radialWindow || radialWindow.isDestroyed()) return
  const [x, y] = radialWindow.getPosition()
  const displays = screen.getAllDisplays()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
  }
  const clampedX = Math.max(minX, Math.min(x + dx, maxX - 206))
  const clampedY = Math.max(minY, Math.min(y + dy, maxY - 206))
  radialWindow.setPosition(clampedX, clampedY)
})

ipcMain.on('radial:drag-end', () => {
  isDragging = false
  // 恢复 setShape 并重新启用 mouse events
  if (radialWindow && !radialWindow.isDestroyed()) {
    applyShape(radialWindow, expanded ? EXPANDED_R : CENTER_R)
    restoreCursor()
  }
})

// ─── 配置 IPC ───

const DEFAULT_RADIAL_ITEMS = [
  { id: 'log', label: 'Work Log', route: '/worklog' },
  { id: 'task', label: 'Tasks', route: '/kanban' },
  { id: 'meeting', label: 'Meetings', route: '/calendar' },
  { id: 'ai', label: 'AI Chat', route: '/chat' },
]

ipcMain.handle('radial:get-config', () => {
  const saved = getSetting('radial_items')
  if (saved === null) return DEFAULT_RADIAL_ITEMS
  try { return JSON.parse(saved) } catch { return DEFAULT_RADIAL_ITEMS }
})

ipcMain.handle('radial:set-config', (_event, items: unknown) => {
  setSetting('radial_items', JSON.stringify(items))
  return true
})

ipcMain.handle('radial:navigate-to', (_event, page: string) => {
  appBus.emit(SHOW_MAIN)
  const win = getMainWindow()
  if (win) win.webContents.send(`navigate:${page}`)
  collapseRadial()
  return true
})

// ─── 悬浮窗开关（设置页实时切换） ───

ipcMain.handle('radial:set-enabled', (_event, enabled: boolean) => {
  setSetting('radial_enabled', enabled ? '1' : '0')
  if (enabled) {
    // 开启：如果窗口不存在则创建，否则显示
    if (!radialWindow || radialWindow.isDestroyed()) {
      const main = getMainWindow()
      if (main) createRadialWindow(main)
    } else {
      showRadialWindow()
    }
  } else {
    // 关闭：收起并隐藏
    if (radialWindow && !radialWindow.isDestroyed()) {
      if (expanded) collapseRadial()
      hideRadialWindow()
    }
  }
  return true
})

ipcMain.handle('radial:close', () => {
  hideRadialWindow()
  return true
})
