// 必须最先加载：让主进程读取项目根目录 .env（BARK_KEY 等）
import 'dotenv/config'

// V8 原生编译缓存：热启动 JS 加载提速 30-50%
import { enableCompileCache } from 'node:module'
enableCompileCache()

import { app, protocol, session, BrowserWindow, shell, ipcMain, screen, nativeTheme, globalShortcut, powerMonitor } from 'electron'
import path, { join } from 'path'
import { createReadStream } from 'fs'
import fs from 'fs/promises'
import { Readable } from 'stream'
import { getModelsDir } from './model-files'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, getSetting, setSetting, getDatabase } from './db'
import { registerAttachmentProtocol } from './attachments'
import { startScheduler, stopScheduler } from './scheduler'
import { registerIpcHandlers } from './ipc'
import { type AppLanguage } from './i18n'
import { configureAutoUpdater, registerUpdateIpc, startUpdateCheck } from './updater'
import log from 'electron-log/main'
import { setMainWindow, hideRadialWindow, showRadialWindow, getRadialWindow, createRadialWindow, isRadialEnabled } from './radial-window'
import { appBus, SHOW_MAIN, SHOW_RADIAL, RADIAL_SCREENSHOT } from './event-bus'
import { initNotifications, showNotification, handleProtocolArgv, setProtocolHandler } from './notification'
import { safeOpenExternal } from './urlWhitelist'
import { verifyIntegrity } from './integrityCheck'
import { createSanitizingProcessor } from './logSanitizer'
import { registerScreenshotIpc, startScreenshotCapture } from './screenshot'
import { buildMenu, setupContextMenu, getShortcuts } from './menu'
import { createTray, rebuildTrayMenu } from './tray'
import { createSplashWindow, closeSplashWindow } from './splash'
import { registerAutoLaunchIpc, setAutoLaunchDeps } from './autoLaunch'
import { loadDotNet } from './asar-dotnet-loader'
import { vectorSearch } from './vector-search'
import { guardedHandle } from './ipc-guard'
import { ok, fail } from '../shared/ipc-result'
import {
  ShortcutUpdateSchema, AppLanguageUpdateSchema,
  DotnetInvokeSchema, NotificationShowSchema, ReadModelFileSchema,
} from './ipc-schemas'

// ── 日志初始化 ──
log.initialize()
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
log.transports.file.level = 'info'
;(log.transports.file as any).processor = createSanitizingProcessor((log.transports.file as any).processor)
;(log.transports.console as any).processor = createSanitizingProcessor((log.transports.console as any).processor)

// ── V8 堆限制 + GPU 缓存重定向 ──
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')
if (process.platform === 'win32') {
  const gpuCacheDir = join(app.getPath('userData'), 'gpu-cache')
  app.commandLine.appendSwitch('disk-cache-dir', gpuCacheDir)
}

const appTitle = process.env.VITE_APP_TITLE || 'WorkPulse'
log.info('[Main] 🟢 主进程已启动！')

let isQuitting = false

const APP_ICON_PATH = is.dev
  ? join(__dirname, '../../resources/icon.ico')
  : join(process.resourcesPath, 'icon.ico')

// ── 核心 Helper ──

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.find((w) => !w.isDestroyed() && w.getTitle() === appTitle) ?? wins[0] ?? null
}

function sendToRenderer(channel: string): void {
  const win = getMainWindow()
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.send(channel)
  }
}

// ── 全局快捷键 ──

function registerShortcut(accelerator: string, channel: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => sendToRenderer(channel))
  } catch { return false }
}

export function reregisterGlobalShortcuts(
  overrides: Partial<{ log: string; task: string }> = {}
): { log: boolean; task: boolean } {
  globalShortcut.unregisterAll()
  const { log: logShortcut, task: taskShortcut } = getShortcuts(overrides)

  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) appBus.emit(SHOW_MAIN)
  })

  return {
    log: registerShortcut(logShortcut, 'quick-create:log'),
    task: registerShortcut(taskShortcut, 'quick-create:task')
  }
}

// ── 快捷键 / 语言 IPC ──

function registerShortcutIpc(): void {
  guardedHandle('shortcut:update', ShortcutUpdateSchema, (data) => {
    const overrides = data.key === 'shortcut_quick_log' ? { log: data.value } : { task: data.value }
    const results = reregisterGlobalShortcuts(overrides)
    if (!results.log || !results.task) { reregisterGlobalShortcuts(); return ok(false) }
    setSetting(data.key, data.value)
    buildMenu(sendToRenderer)
    rebuildTrayMenu(sendToRenderer, () => { isQuitting = true; app.quit() })
    return ok(true)
  })

  guardedHandle('app:language:update', AppLanguageUpdateSchema, (data) => {
    setSetting('app_language', data.language)
    buildMenu(sendToRenderer)
    rebuildTrayMenu(sendToRenderer, () => { isQuitting = true; app.quit() })
    return ok(undefined)
  })
}

// ── 主窗口 ──

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 500,
    show: false,
    title: appTitle,
    frame: false,
    titleBarStyle: 'hidden',
    icon: APP_ICON_PATH,
    backgroundColor: '#00000000',
    backgroundMaterial: (getSetting('window_material') as 'mica' | 'tabbed' | 'acrylic') || 'tabbed',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
        height: 35,
      }
    } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  })

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow()
    setMainWindow(mainWindow)
    mainWindow.maximize()
    mainWindow.setIcon(APP_ICON_PATH)
    mainWindow.hide()
    appBus.emit(SHOW_RADIAL, mainWindow)
  })

  if (process.platform !== 'darwin') {
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        if (getSetting('close_action') === 'quit') {
          isQuitting = true
          app.quit()
        } else {
          mainWindow.hide()
          appBus.emit(SHOW_RADIAL, mainWindow)
        }
      }
    })
  }

  mainWindow.on('minimize', () => { appBus.emit(SHOW_RADIAL, mainWindow) })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void safeOpenExternal(details.url, shell)
    return { action: 'deny' as const }
  })

  // ── 导航锁：防止页面被劫持跳转到外部 URL ──
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 开发模式允许 Vite HMR
    if (is.dev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')) return
    // file: 协议允许（本地构建产物）
    if (url.startsWith('file:')) return
    // 其他一律阻止，在外部浏览器打开
    event.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  log.info('[Main] 📋 Loading URL...')
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── .NET Bridge ──

let dotnetLib: any = null
let dotnetLoaded = false

async function ensureDotNet(): Promise<void> {
  if (!dotnetLoaded) {
    try { dotnetLib = await loadDotNet(); log.info('✅ .NET 已加载') }
    catch (err) { log.error('⚠️ .NET 加载失败', err) }
    dotnetLoaded = true
  }
}

function registerDotnetIpc(): void {
  guardedHandle('dotnet:invoke', DotnetInvokeSchema, async (data) => {
    await ensureDotNet()
    if (!dotnetLib?.NativeBridge) return fail('BUSINESS_ERROR', '.NET Bridge not loaded')
    const fn = dotnetLib.NativeBridge[data.method]
    if (typeof fn !== 'function') return fail('NOT_FOUND', `Unknown method: ${data.method}`)
    return ok(fn(...(data.args || [])))
  })
}

// ── 通知 IPC ──

function registerNotificationIpc(): void {
  guardedHandle('notification:show', NotificationShowSchema, (data) => {
    showNotification(data)
    return ok(undefined)
  })
}

// ── 模型文件读取 IPC ──

function registerModelFileIpc(): void {
  guardedHandle('read-model-file', ReadModelFileSchema, async (data) => {
    const basePath = app.isPackaged
      ? path.join(process.resourcesPath, 'models')
      : path.join(app.getAppPath(), 'resources', 'models')
    const filePath = path.join(basePath, data.fileName)
    const buffer = await fs.readFile(filePath)
    return ok(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  })
}

// ── 协议注册（必须在 app.ready 之前） ──
initNotifications()

// ── 单实例锁 ──
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const protocolUrl = commandLine.find((arg) => arg.toLowerCase().startsWith('workpulse://'))
    if (protocolUrl) {
      setProtocolHandler((url) => {
        const u = new URL(url)
        if (u.searchParams.get('action') === 'click') {
          const win = getMainWindow()
          if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.show() }
        }
      })
      handleProtocolArgv()
    }
    const win = getMainWindow()
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.show() }
  })
}

// ══════════════════════════════════════════
//  Bootstrap — 渐进式流水线
// ══════════════════════════════════════════

app.whenReady().then(async () => {
  // Phase 1: 完整性校验 + 安全
  verifyIntegrity()
  registerAttachmentProtocol()

  // ── 权限拦截（P0）：防止恶意脚本申请摄像头/麦克风/位置 ──
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const ALLOWED: Record<string, boolean> = {
      'notifications': true,
      'clipboard-read': true,
      'fullscreen': true,
      'pointer-lock': true,
    }
    if (ALLOWED[permission]) {
      callback(true)
    } else {
      log.warn(`[Security] 🚫 拒绝权限请求: ${permission}`)
      callback(false)
    }
  })

  // Phase 2: 核心基础设施
  registerDotnetIpc()
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://localhost:* https://* ws://localhost:*; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'"
          ]
        }
      })
    })
  }

  // 模型本地缓存协议
  protocol.handle('appmodel', async (request) => {
    try {
      const u = new URL(request.url)
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
      const modelsDir = path.normalize(getModelsDir())
      const target = path.normalize(path.join(modelsDir, rel))
      if (!target.startsWith(modelsDir)) return new Response('Forbidden', { status: 403 })
      const st = await fs.stat(target)
      if (!st.isFile()) throw new Error('not a file')
      const webStream = Readable.toWeb(createReadStream(target)) as unknown as ReadableStream
      return new Response(webStream, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(st.size), 'access-control-allow-origin': '*' }
      })
    } catch { return new Response('Not Found', { status: 404 }) }
  })

  registerModelFileIpc()

  // Phase 3: 数据库 + 调度 + IPC
  initDatabase()
  startScheduler(getMainWindow)
  registerAutoLaunchIpc()
  setAutoLaunchDeps(getMainWindow, APP_ICON_PATH)

  // 启动后异步增量向量化所有未索引的日志（不阻塞启动）
  vectorSearch.autoIndexAll().catch(() => {})

  if (process.platform === 'win32') {
    electronApp.setAppUserModelId('cmono.workpulse.app')
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    setupContextMenu(window)
  })

  configureAutoUpdater()
  registerIpcHandlers()
  registerShortcutIpc()
  registerUpdateIpc()
  registerNotificationIpc()
  registerScreenshotIpc()

  // Phase 4: WCO 深色模式适配
  nativeTheme.on('updated', () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed() && process.platform === 'win32') {
      try {
        main.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
        })
      } catch (err) { log.error('[Main] setTitleBarOverlay failed:', err) }
    }
  })

  // Phase 5: UI 层
  const onQuit = () => { isQuitting = true; app.quit() }
  buildMenu(sendToRenderer)
  createTray(sendToRenderer, onQuit)

  // ── 电源管理（P1）：系统休眠/恢复时暂停/恢复调度器 ──
  powerMonitor.on('suspend', () => {
    log.info('[Power] 💤 系统即将休眠，暂停调度器')
    stopScheduler()
  })

  powerMonitor.on('resume', () => {
    log.info('[Power] ⚡ 系统恢复，重启调度器')
    // 延迟 2 秒后恢复，等待网络和系统服务就绪
    setTimeout(() => {
      startScheduler(getMainWindow)
    }, 2000)
  })

  // Phase 6: 事件驱动 — 主窗口 ↔ 径向菜单互斥显示
  appBus.on(SHOW_MAIN, () => {
    hideRadialWindow()
    const main = getMainWindow()
    if (main) { if (!main.isVisible()) main.show(); main.focus() }
  })

  appBus.on(SHOW_RADIAL, (parent?: BrowserWindow) => {
    if (!isRadialEnabled()) return
    const main = parent && !parent.isDestroyed() ? parent : getMainWindow()
    if (main && main.isVisible()) main.hide()
    if (!getRadialWindow()) { if (main) createRadialWindow(main) }
    showRadialWindow()
  })

  appBus.on(RADIAL_SCREENSHOT, () => { startScreenshotCapture() })

  // Phase 7: 窗口创建 + 启动检查
  createSplashWindow()
  createWindow()
  startUpdateCheck()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  const results = reregisterGlobalShortcuts()
  if (!results.log || !results.task) {
    log.warn('One or more global shortcuts could not be registered')
  }
})

app.on('before-quit', () => { isQuitting = true })

app.on('will-quit', async () => {
  stopScheduler()
  getDatabase().close()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
