/**
 * 截图模块：区域截图覆盖窗口 + 裁剪 + 剪贴板/文件保存
 * 从 index.ts 提取，遵循渐进式流水线模式
 */
import { BrowserWindow, screen, desktopCapturer, clipboard, ClipboardItem, ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import fs from 'fs/promises'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { hideRadialWindow, getRadialWindow, isRadialEnabled } from './radial-window'
import { showNotification } from './notification'

let screenshotOverlayWindow: BrowserWindow | null = null
let screenshotOverlayOrigin = { x: 0, y: 0 }
let screenshotBusy = false
let screenshotDestroyTimer: ReturnType<typeof setTimeout> | null = null

// 开始截图：隐藏径向菜单 → 捕获全屏 → 创建透明覆盖窗口
async function startScreenshotCapture(): Promise<{ ok: boolean; error?: string }> {
  if (screenshotBusy) return { ok: false, error: 'Already in progress' }
  screenshotBusy = true

  try {
    // 1. 隐藏径向菜单（不销毁，便于后续重新显示）
    hideRadialWindow()

    // 2. 计算所有显示器的联合边界，使覆盖窗口横跨全部屏幕
    const displays = screen.getAllDisplays()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of displays) {
      minX = Math.min(minX, d.bounds.x)
      minY = Math.min(minY, d.bounds.y)
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
    }
    const overlayX = minX
    const overlayY = minY
    const overlayW = maxX - minX
    const overlayH = maxY - minY
    screenshotOverlayOrigin = { x: overlayX, y: overlayY }

    // 3. 复用已有的覆盖窗口
    if (screenshotOverlayWindow && !screenshotOverlayWindow.isDestroyed()) {
      if (screenshotDestroyTimer) {
        clearTimeout(screenshotDestroyTimer)
        screenshotDestroyTimer = null
      }
      screenshotOverlayWindow.setBounds({ x: overlayX, y: overlayY, width: overlayW, height: overlayH })
      screenshotOverlayWindow.setAlwaysOnTop(true, 'screen-saver')
      screenshotOverlayWindow.setIgnoreMouseEvents(false)
      screenshotOverlayWindow.show()
      screenshotOverlayWindow.focus()
      screenshotOverlayWindow.webContents.send('screenshot:ready', {
        x: 0, y: 0, width: overlayW, height: overlayH
      })
      return { ok: true }
    }

    // 4. 首次创建全屏透明覆盖窗口
    screenshotOverlayWindow = new BrowserWindow({
      x: overlayX,
      y: overlayY,
      width: overlayW,
      height: overlayH,
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

    const win = screenshotOverlayWindow
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(false)

    const readyHandler = () => {
      if (!win.isDestroyed()) {
        const primaryDisplay = screen.getDisplayNearestPoint({ x: overlayX, y: overlayY })
        win.show()
        win.focus()
        win.webContents.send('screenshot:ready', {
          width: overlayW,
          height: overlayH,
          scaleFactor: primaryDisplay.scaleFactor,
        })
      }
    }
    win.webContents.once('did-finish-load', readyHandler)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/screenshot-overlay.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/screenshot-overlay.html'))
    }
    return { ok: true }
  } catch (err) {
    screenshotBusy = false
    log.error('[Screenshot] startScreenshotCapture failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 裁剪选定区域：此刻才真正捕获屏幕
async function cropScreenshot(
  rect: { x: number; y: number; width: number; height: number },
  action: 'copy' | 'save' | 'both' = 'both',
  full = false
): Promise<{ ok: boolean; file?: string; width?: number; height?: number; error?: string }> {
  const gx = rect.x + screenshotOverlayOrigin.x
  const gy = rect.y + screenshotOverlayOrigin.y
  const target = screen.getDisplayNearestPoint({ x: gx, y: gy })
  const sf = target.scaleFactor
  const { x: dx, y: dy, width: dw, height: dh } = target.bounds

  const thumbnailSize = {
    width: Math.floor(dw * sf),
    height: Math.floor(dh * sf),
  }

  const CAPTURE_TIMEOUT_MS = 8000
  let sources: Awaited<ReturnType<typeof desktopCapturer.getSources>> | null = null
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
  const source = sources.find((s) => s.display_id === String(target.id)) || sources[0]
  const image = source.thumbnail

  const destroyImage = (img: Electron.NativeImage): void => {
    try { (img as unknown as { destroy(): void }).destroy() } catch {}
  }

  let file: string | undefined
  let w = 0
  let h = 0

  try {
    let cx: number, cy: number, cw: number, ch: number
    if (full) {
      cx = 0; cy = 0; cw = thumbnailSize.width; ch = thumbnailSize.height
    } else {
      const localX = gx - dx
      const localY = gy - dy
      cx = Math.max(0, Math.round(localX * sf))
      cy = Math.max(0, Math.round(localY * sf))
      cw = Math.max(1, Math.round(rect.width * sf))
      ch = Math.max(1, Math.round(rect.height * sf))
    }
    const cropped = image.crop({ x: cx, y: cy, width: cw, height: ch })

    if (action === 'copy' || action === 'both') {
      const pngData = new Uint8Array(cropped.toPNG())
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
      const pngBuffer = cropped.toPNG()
      await fs.writeFile(f, pngBuffer)
      file = f
    }

    w = cropped.getSize().width
    h = cropped.getSize().height
    destroyImage(cropped)
  } finally {
    destroyImage(source.thumbnail)
    for (const s of sources) {
      if (s !== source) destroyImage(s.thumbnail)
    }
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

// 取消截图
function cancelScreenshot(): void {
  if (screenshotOverlayWindow && !screenshotOverlayWindow.isDestroyed()) {
    screenshotOverlayWindow.hide()
    if (screenshotDestroyTimer) {
      clearTimeout(screenshotDestroyTimer)
      screenshotDestroyTimer = null
    }
    screenshotDestroyTimer = setTimeout(() => {
      if (screenshotOverlayWindow && !screenshotOverlayWindow.isDestroyed()) {
        screenshotOverlayWindow.destroy()
        screenshotOverlayWindow = null
      }
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
  ipcMain.handle('screenshot:start', () => startScreenshotCapture())
  ipcMain.handle('screenshot:crop', async (_event, rect, action = 'both', full = false) => {
    return cropScreenshot(rect, action, full)
  })
  ipcMain.handle('screenshot:cancel', async () => {
    cancelScreenshot()
    return true
  })
}

export { startScreenshotCapture }
