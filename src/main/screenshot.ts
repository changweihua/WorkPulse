/**
 * 截图模块：每块显示器一个透明覆盖窗口 + 跨屏选区（主进程维护） + 裁剪 + 剪贴板/文件保存
 *
 * 架构说明（多屏/混合 DPI）：
 * - 历史方案是单个 BrowserWindow 跨屏 union bounds，Windows（尤其混合 DPI）下
 *   bounds/输入会失真，导致选区到不了扩展屏。现改为「每 display 一窗」，每窗
 *   bounds 严格等于所在 display.bounds，绝不跨屏。
 * - 所有用户可见坐标（选区/光标/commit）统一为【绝对全局 DIP】；
 *   仅在 screenshot:crop 入口归一化为 union 本地坐标后进入 cropScreenshot
 *   （其内部 gx = rect.x + origin，origin = union 原点），避免坐标系混用。
 * - 选区拖拽状态由主进程维护（down/move/up 可能落在不同窗口），
 *   广播 selection/commit 给全部窗口，各窗只渲染与本窗 bounds 的相交部分。
 */
import { BrowserWindow, screen, desktopCapturer, clipboard, ClipboardItem, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import fs from 'fs/promises'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { hideRadialWindow, getRadialWindow, isRadialEnabled } from './radial-window'
import { showNotification } from './notification'
import { guardedHandle, guardedQuery, assertValidSender } from './ipc-guard'
import { ok } from '../shared/ipc-result'
import { ScreenshotCropSchema } from './ipc-schemas'

// ─── 会话状态 ──

/** 每块显示器一个 overlay 窗口（key = display.id），支持显示器热插拔同步 */
const overlayWindows = new Map<number, BrowserWindow>()
/** 所有 display.bounds 的联合原点（min x/y），每次 start 重新计算；crop 内部坐标基于此 */
let screenshotOverlayOrigin = { x: 0, y: 0 }
let screenshotBusy = false
let screenshotDestroyTimer: ReturnType<typeof setTimeout> | null = null
/** 光标轮询定时器：会话期间 ~16ms 轮询，发送按去重+30Hz 节流收口 */
let cursorPollTimer: ReturnType<typeof setInterval> | null = null
let lastCursorDisplayId: number | null = null
/** 上次已发送的光标坐标与时间戳：坐标未变则零 IPC，发送节流至约 33ms（30Hz） */
let lastSentCursor: { x: number; y: number } | null = null
let lastSentCursorAt = 0
const CURSOR_SEND_INTERVAL_MS = 33
/** 无效选区延迟取消（220ms 等待 dblclick）/ 双击全屏后的自动收尾，共用一个定时器 */
let pendingCloseTimer: ReturnType<typeof setTimeout> | null = null
/** 拖拽会话状态（选区真值只存主进程，跨屏拖拽时 down/up 可能落在不同窗口） */
let dragActive = false
let dragStart = { x: 0, y: 0 }
let dragShift = false

// ─── 窗口管理 ──

/** 向全部存活的 overlay 窗口广播消息 */
function broadcast(channel: string, payload?: unknown): void {
  for (const win of overlayWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** 创建一块显示器的覆盖窗口（bounds = 本屏 bounds，绝不跨屏），返回加载完成 Promise */
function createOverlayWindow(display: Electron.Display): { win: BrowserWindow; loaded: Promise<void> } {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/screenshotOverlay.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(false)

  const loaded = new Promise<void>((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', (_e, code: number, desc: string) =>
      reject(new Error(`覆盖窗口加载失败（${code} ${desc}）`))
    )
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/screenshot-overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/screenshot-overlay.html'))
  }
  return { win, loaded }
}

/** 确保复用窗口内容已加载（新窗口在 createOverlayWindow 中已触发加载） */
function ensureLoaded(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return Promise.resolve()
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve())
  })
}

// 开始截图：隐藏径向菜单 → 同步每屏一窗 → 全部就绪后逐窗发 ready → 启动光标轮询
async function startScreenshotCapture(): Promise<{ ok: boolean; error?: string }> {
  if (screenshotBusy) return { ok: false, error: 'Already in progress' }
  screenshotBusy = true

  try {
    // 1. 隐藏径向菜单（不销毁，便于后续重新显示）
    hideRadialWindow()
    clearPendingClose()
    if (screenshotDestroyTimer) {
      clearTimeout(screenshotDestroyTimer)
      screenshotDestroyTimer = null
    }
    stopCursorPolling()
    dragActive = false

    // 2. 计算联合 bounds（union 原点 = crop 坐标系基准，每次 start 重算）
    const displays = screen.getAllDisplays()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const d of displays) {
      minX = Math.min(minX, d.bounds.x)
      minY = Math.min(minY, d.bounds.y)
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
    }
    screenshotOverlayOrigin = { x: minX, y: minY }
    const unionBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

    // 3. 与当前显示器集合同步窗口（热插拔：显示器减少则销毁对应窗口）
    for (const [id, win] of overlayWindows) {
      if (win.isDestroyed() || !displays.some((d) => d.id === id)) {
        if (!win.isDestroyed()) win.destroy()
        overlayWindows.delete(id)
      }
    }

    // 4. 复用或创建每屏窗口；等全部加载完成后再统一发 ready（渲染层 Loading 才结束）
    const loadTasks: Promise<void>[] = []
    for (const d of displays) {
      const existing = overlayWindows.get(d.id)
      if (existing && !existing.isDestroyed()) {
        // 复用：分辨率可能已变化，重设到当前屏 bounds 并置顶
        existing.setBounds(d.bounds)
        existing.setAlwaysOnTop(true, 'screen-saver')
        existing.setIgnoreMouseEvents(false)
        loadTasks.push(ensureLoaded(existing))
      } else {
        const { win, loaded } = createOverlayWindow(d)
        overlayWindows.set(d.id, win)
        loadTasks.push(loaded)
      }
    }
    await Promise.all(loadTasks)

    // 5. 逐窗发 ready：每窗拿到本屏 displayBounds/scaleFactor + 全局 unionBounds
    for (const d of displays) {
      const win = overlayWindows.get(d.id)
      if (!win || win.isDestroyed()) continue
      win.setBounds(d.bounds)
      win.webContents.send('screenshot:ready', {
        displayId: d.id,
        displayBounds: { ...d.bounds },
        scaleFactor: d.scaleFactor,
        unionBounds,
      })
      win.show()
    }

    // 6. 初始聚焦光标所在屏窗口，随后启动光标轮询（广播 + 焦点跟随）
    focusCursorDisplay()
    startCursorPolling()
    return { ok: true }
  } catch (err) {
    screenshotBusy = false
    stopCursorPolling()
    // 失败时收起全部窗口，避免残留遮挡屏幕
    for (const win of overlayWindows.values()) {
      if (!win.isDestroyed()) win.hide()
    }
    log.error('[Screenshot] startScreenshotCapture failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 把焦点切到光标所在的 overlay 窗口（保证 ESC/Enter/数字键可用） */
function focusCursorDisplay(): void {
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  lastCursorDisplayId = disp.id
  const win = overlayWindows.get(disp.id)
  if (win && !win.isDestroyed() && win.isVisible()) win.focus()
}

/** 会话期间 ~16ms 轮询光标：坐标去重 + 30Hz 节流后仅发给鼠标所在屏 overlay，光标换屏时 focus 该窗口 */
function startCursorPolling(): void {
  stopCursorPolling()
  cursorPollTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint()
    const disp = screen.getDisplayNearestPoint(p)
    if (disp.id !== lastCursorDisplayId) {
      lastCursorDisplayId = disp.id
      const win = overlayWindows.get(disp.id)
      if (win && !win.isDestroyed() && win.isVisible()) win.focus()
    }
    // 去重：坐标相对上次已发送值无变化 → 零 IPC
    if (lastSentCursor && lastSentCursor.x === p.x && lastSentCursor.y === p.y) return
    // 节流：轮询保持 16ms，但发送不超过约 30Hz，避免高频 IPC
    const now = Date.now()
    if (now - lastSentCursorAt < CURSOR_SEND_INTERVAL_MS) return
    lastSentCursor = { x: p.x, y: p.y }
    lastSentCursorAt = now
    // 只发给鼠标所在屏的 overlay；选区仍走 broadcast 求交集，逻辑不变
    const win = overlayWindows.get(disp.id)
    if (win && !win.isDestroyed()) {
      win.webContents.send('screenshot:cursor', { gx: p.x, gy: p.y })
    }
  }, 16)
}

function stopCursorPolling(): void {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer)
    cursorPollTimer = null
  }
  lastCursorDisplayId = null
  // 重置去重/节流状态，保证下次会话首帧必发当前光标位置
  lastSentCursor = null
  lastSentCursorAt = 0
}

function clearPendingClose(): void {
  if (pendingCloseTimer) {
    clearTimeout(pendingCloseTimer)
    pendingCloseTimer = null
  }
}

// ─── 跨屏选区状态（主进程维护，坐标 = 绝对全局 DIP） ──

/** 由起点/终点计算选区矩形；shift = 等比锁定为正方形 */
function computeSelection(
  from: { x: number; y: number },
  to: { x: number; y: number },
  shift: boolean
): { x: number; y: number; w: number; h: number } {
  let dx = to.x - from.x
  let dy = to.y - from.y
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx) * m
    dy = Math.sign(dy) * m
  }
  return {
    x: Math.min(from.x, from.x + dx),
    y: Math.min(from.y, from.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy),
  }
}

/** 注册单向 send 通道（ipc-guard 只覆盖 invoke，这里自行做 sender 校验） */
function registerPointerIpc(): void {
  // 拖拽开始：清掉上一轮工具栏，选区回到起点（清 220ms 取消定时器，可能是双击前奏）
  ipcMain.on('screenshot:down', (event, data: { gx: number; gy: number; shiftKey?: boolean }) => {
    if (!assertValidSender(event as IpcMainInvokeEvent, 'screenshot:down') || !screenshotBusy) return
    clearPendingClose()
    dragActive = true
    dragStart = { x: data.gx, y: data.gy }
    dragShift = !!data.shiftKey
    broadcast('screenshot:commit', null)
    broadcast('screenshot:selection', { x: data.gx, y: data.gy, w: 0, h: 0 })
  })

  // 拖拽移动：主进程计算全局选区并广播（光标可能已跨到另一窗/另一屏）
  ipcMain.on('screenshot:move', (event, data: { gx: number; gy: number; shiftKey?: boolean }) => {
    if (!assertValidSender(event as IpcMainInvokeEvent, 'screenshot:move') || !screenshotBusy || !dragActive) return
    dragShift = !!data.shiftKey
    broadcast('screenshot:selection', computeSelection(dragStart, { x: data.gx, y: data.gy }, dragShift))
  })

  // 拖拽结束：有效选区 → 广播 commit（附光标所在屏 id，工具栏在该窗显示）；
  // 无效选区 → 清残留显示 + 220ms 延迟取消（防双击误取消，由主进程定时）
  ipcMain.on('screenshot:up', (event, data: { gx: number; gy: number }) => {
    if (!assertValidSender(event as IpcMainInvokeEvent, 'screenshot:up') || !screenshotBusy || !dragActive) return
    dragActive = false
    const rect = computeSelection(dragStart, { x: data.gx, y: data.gy }, dragShift)
    if (rect.w > 3 && rect.h > 3) {
      const displayId = screen.getDisplayNearestPoint({ x: data.gx, y: data.gy }).id
      broadcast('screenshot:selection', rect)
      broadcast('screenshot:commit', { rect, displayId })
    } else {
      broadcast('screenshot:selection', null)
      clearPendingClose()
      pendingCloseTimer = setTimeout(() => {
        pendingCloseTimer = null
        cancelScreenshot()
      }, 220)
    }
  })

  // 双击全屏：主进程直接走既有 full crop 路径（内部按 getCursorScreenPoint 判屏）
  ipcMain.on('screenshot:dblclick', async (event, data: { gx: number; gy: number }) => {
    if (!assertValidSender(event as IpcMainInvokeEvent, 'screenshot:dblclick') || !screenshotBusy) return
    clearPendingClose()
    dragActive = false
    // capture 瞬间：隐藏全部窗口的 overlay 内容（AGENTS.md 截图规范）
    broadcast('screenshot:capturing')
    // rect 为 union 本地坐标（cropScreenshot 内部 + origin 还原为绝对 DIP）；full 模式不使用 rect 判屏
    const rect = { x: data.gx - screenshotOverlayOrigin.x, y: data.gy - screenshotOverlayOrigin.y, width: 0, height: 0 }
    const res = await cropScreenshot(rect, 'both', true)
    const displayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
    broadcast('screenshot:result', {
      ok: res.ok,
      message: res.ok ? '✓ 已复制并保存' : `✗ ${res.error || '截图失败'}`,
      displayId,
    })
    // 与原 toast 时序一致：成功 700ms、失败 2000ms 后自动收尾（cancel 会广播 reset 清 toast）
    pendingCloseTimer = setTimeout(() => {
      pendingCloseTimer = null
      cancelScreenshot()
    }, res.ok ? 700 : 2000)
  })
}

// ─── 截图辅助 ──

/** desktopCapturer 捕获源类型 */
type CaptureSource = Awaited<ReturnType<typeof desktopCapturer.getSources>>[number]

/** 销毁原生图片，失败时静默（部分平台可能已被回收） */
function destroyNativeImage(img: Electron.NativeImage | undefined | null): void {
  if (!img) return
  try { (img as unknown as { destroy(): void }).destroy() } catch {}
}

/** 销毁全部捕获源的缩略图，释放原生内存 */
function destroyAllSources(sources: CaptureSource[]): void {
  for (const s of sources) destroyNativeImage(s.thumbnail)
}

/**
 * 在捕获源中挑选目标显示器对应的 source。
 * 兜底优先级：
 *  1. display_id 精确等于 String(display.id)
 *  2. display_id 数字等价匹配（格式差异容错，如前导零）
 *  3. 单显示器系统：唯一捕获源必然对应目标屏
 *  4. display_id 缺失时，按缩略图实际物理尺寸与目标屏期望物理尺寸唯一匹配
 *     （注意：Electron 对所有源统一缩放到同一 thumbnailSize 时，多个同分辨率/同比例
 *      屏会产生多个候选，此步会因无法区分而放弃）
 * 全部失败返回 null —— 调用方必须报错，禁止静默截取错误屏幕。
 */
function findTargetSource(
  sources: CaptureSource[],
  target: Electron.Display,
  expectedSize: { width: number; height: number }
): CaptureSource | null {
  // 1. 精确匹配 display_id
  const exact = sources.find((s) => s.display_id === String(target.id))
  if (exact) return exact

  // 2. 数字等价匹配
  const numeric = sources.find(
    (s) => s.display_id !== '' && !Number.isNaN(Number(s.display_id)) && Number(s.display_id) === target.id
  )
  if (numeric) {
    log.warn(`[Screenshot] display_id 格式不一致，按数字等价匹配: "${numeric.display_id}" → display ${target.id}`)
    return numeric
  }

  // 3. 单显示器系统：唯一源即目标屏
  if (sources.length === 1 && screen.getAllDisplays().length === 1) {
    log.warn(`[Screenshot] display_id 匹配失败（"${sources[0].display_id}"），单显示器系统回退到唯一捕获源`)
    return sources[0]
  }

  // 4. 按缩略图实际物理尺寸唯一匹配
  const sized = sources.filter((s) => {
    const sz = s.thumbnail.getSize()
    return sz.width === expectedSize.width && sz.height === expectedSize.height
  })
  if (sized.length === 1) {
    log.warn(
      `[Screenshot] display_id 匹配失败，按缩略图尺寸 ${expectedSize.width}×${expectedSize.height} 唯一匹配到 source "${sized[0].name}"`
    )
    return sized[0]
  }

  // 兜底全部失败：记录详细日志供排查，返回 null 由调用方报错（禁止截错屏）
  log.warn(
    `[Screenshot] 无法唯一匹配目标屏 display ${target.id}（${target.bounds.width}×${target.bounds.height}@${target.scaleFactor}x）的捕获源，` +
    `尺寸候选 ${sized.length}/${sources.length}，全部源：` +
    sources
      .map((s) => {
        const sz = s.thumbnail.getSize()
        return `{id:"${s.display_id}",name:"${s.name}",thumb:${sz.width}×${sz.height}}`
      })
      .join(', ')
  )
  return null
}

// 裁剪选定区域：此刻才真正捕获屏幕
async function cropScreenshot(
  rect: { x: number; y: number; width: number; height: number },
  action: 'copy' | 'save' | 'both' = 'both',
  full = false
): Promise<{ ok: boolean; file?: string; width?: number; height?: number; error?: string }> {
  // crop 内部坐标基于 union 原点（每 start 重算）；rect 为 union 本地坐标，+ origin 还原为绝对 DIP。
  // 不再读取任何单个窗口的 getBounds（每屏一窗后单窗 bounds ≠ union）。
  const origin = screenshotOverlayOrigin
  const gx = rect.x + origin.x
  const gy = rect.y + origin.y

  // 目标显示器：区域截图按选区【中心点】判断（左上角可能落在相邻屏，如跨屏选区）；
  // full 截图按光标所在点判断，与「双击截取光标所在屏全屏」的语义一致
  const anchor = full
    ? screen.getCursorScreenPoint()
    : { x: gx + rect.width / 2, y: gy + rect.height / 2 }
  const target = screen.getDisplayNearestPoint(anchor)
  const sf = target.scaleFactor // 必须是目标屏的缩放比例，不能用主屏的
  const { x: dx, y: dy, width: dw, height: dh } = target.bounds

  // 期望的目标屏物理像素尺寸（用于请求缩略图与 source 兜底匹配）
  const thumbnailSize = {
    width: Math.floor(dw * sf),
    height: Math.floor(dh * sf),
  }

  const CAPTURE_TIMEOUT_MS = 8000
  let sources: CaptureSource[] | null = null
  try {
    sources = await Promise.race([
      desktopCapturer.getSources({ types: ['screen'], thumbnailSize }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Screen capture timed out')), CAPTURE_TIMEOUT_MS)),
    ])
  } catch (err) {
    screenshotBusy = false
    log.error('[Screenshot] desktopCapturer.getSources failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : '屏幕捕获失败' }
  }
  if (!sources || sources.length === 0) {
    screenshotBusy = false
    return { ok: false, error: 'No capture sources available' }
  }

  // 选择目标屏对应的捕获源；匹配失败直接报错，禁止静默截取错误屏幕
  const source = findTargetSource(sources, target, thumbnailSize)
  if (!source) {
    destroyAllSources(sources)
    screenshotBusy = false
    const error = `无法匹配目标显示器的捕获源（display ${target.id}），已中止截图`
    log.error(`[Screenshot] ${error}`)
    return { ok: false, error }
  }

  const image = source.thumbnail
  // 校验缩略图实际尺寸：Electron 各平台不一定按请求的 thumbnailSize 返回（副屏尤其可能）
  const actual = image.getSize()
  if (actual.width < 1 || actual.height < 1) {
    destroyAllSources(sources)
    screenshotBusy = false
    log.error('[Screenshot] 捕获源缩略图为空:', actual)
    return { ok: false, error: '屏幕捕获结果为空' }
  }

  let file: string | undefined
  let w = 0
  let h = 0

  try {
    let cx: number, cy: number, cw: number, ch: number
    if (full) {
      // 全屏：直接取整张目标屏缩略图，避免任何尺寸换算误差
      cx = 0; cy = 0; cw = actual.width; ch = actual.height
    } else {
      // 实际缩略图尺寸 / 期望物理尺寸 的比例系数，用于把裁剪坐标换算到实际缩略图坐标系
      const rx = actual.width / thumbnailSize.width
      const ry = actual.height / thumbnailSize.height

      // 选区跨越多个显示器时，超出目标屏的部分会被 clamp 裁掉，记录日志便于排查
      if (gx < dx || gy < dy || gx + rect.width > dx + dw || gy + rect.height > dy + dh) {
        log.warn('[Screenshot] 选区跨越多个显示器，超出目标屏的部分将被裁掉')
      }

      const localX = gx - dx
      const localY = gy - dy
      cx = Math.round(localX * sf * rx)
      cy = Math.round(localY * sf * ry)
      cw = Math.max(1, Math.round(rect.width * sf * rx))
      ch = Math.max(1, Math.round(rect.height * sf * ry))

      // clamp 到缩略图边界内，防止 crop 越界抛错或错位
      cx = Math.max(0, Math.min(cx, actual.width - 1))
      cy = Math.max(0, Math.min(cy, actual.height - 1))
      cw = Math.max(1, Math.min(cw, actual.width - cx))
      ch = Math.max(1, Math.min(ch, actual.height - cy))
    }
    const cropped = image.crop({ x: cx, y: cy, width: cw, height: ch })

    // PNG 单次编码：action 只可能是 copy/save/both 之一，统一编码一次，
    // both 模式下剪贴板与存档复用同一 Buffer，避免重复 toPNG 编码开销
    const pngBuffer = cropped.toPNG()

    if (action === 'copy' || action === 'both') {
      const pngData = new Uint8Array(pngBuffer)
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([pngData], { type: 'image/png' })
        })
      ])
    }
    if (action === 'save' || action === 'both') {
      const dir = join(homedir(), 'Pictures', 'WorkPulse')
      mkdirSync(dir, { recursive: true })
      const f = join(dir, `screenshot-${Date.now()}.png`)
      await fs.writeFile(f, pngBuffer)
      file = f
    }

    w = cropped.getSize().width
    h = cropped.getSize().height
    destroyNativeImage(cropped)
  } finally {
    destroyAllSources(sources)
  }

  screenshotBusy = false

  const actionLabel = action === 'copy' ? '已复制到剪贴板' : action === 'save' ? `已保存到 ${file ?? '文件'}` : `已复制并保存`
  showNotification({
    title: '截图完成',
    body: `${w}×${h} ${actionLabel}`,
    tag: 'screenshot-result',
    group: 'workpulse',
  })

  return { ok: true, file, width: w, height: h }
}

// 取消截图：广播复位给全部窗口 + 隐藏全部窗口 + 清定时器 + 复位 busy
function cancelScreenshot(): void {
  dragActive = false
  clearPendingClose()
  stopCursorPolling()
  // 各窗清空选区/工具栏/captured/toast 状态
  broadcast('screenshot:reset')

  // 隐藏全部 overlay 窗口；空闲 30s 后销毁全部（保留 destroyTimer 复用模式）
  let hasVisible = false
  for (const win of overlayWindows.values()) {
    if (win.isDestroyed()) continue
    win.hide()
    hasVisible = true
  }
  if (hasVisible) {
    if (screenshotDestroyTimer) clearTimeout(screenshotDestroyTimer)
    screenshotDestroyTimer = setTimeout(() => {
      for (const win of overlayWindows.values()) {
        if (!win.isDestroyed()) win.destroy()
      }
      overlayWindows.clear()
      screenshotDestroyTimer = null
    }, 30 * 1000)
  }

  screenshotBusy = false
  if (isRadialEnabled()) {
    const radial = getRadialWindow()
    if (radial && !radial.isDestroyed()) {
      radial.show()
    }
  }
}

// ── 公开 API ──

export function registerScreenshotIpc(): void {
  registerPointerIpc()

  guardedQuery('screenshot:start', () => {
    startScreenshotCapture()
    return ok(undefined)
  })

  guardedHandle('screenshot:crop', ScreenshotCropSchema, async (data) => {
    // 渲染层上报的是【绝对全局 DIP】；cropScreenshot 内部 = rect + union 原点，
    // 因此在此唯一入口归一化为 union 本地坐标，避免与其他通道（selection/commit/cursor
    // 全程绝对坐标）混用坐标系。
    const rect = {
      x: data.rect.x - screenshotOverlayOrigin.x,
      y: data.rect.y - screenshotOverlayOrigin.y,
      width: data.rect.width,
      height: data.rect.height,
    }
    // capture 瞬间隐藏所有窗口的 overlay 内容（AGENTS.md 截图规范）
    broadcast('screenshot:capturing')
    return ok(await cropScreenshot(rect, data.action ?? 'both', data.full ?? false))
  })

  guardedQuery('screenshot:cancel', async () => {
    cancelScreenshot()
    return ok(true)
  })
}

export { startScreenshotCapture }
