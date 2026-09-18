// 蹇呴』鏈€鍏堝姞杞斤細璁╀富杩涚▼璇诲彇椤圭洰鏍圭洰褰?.env锛圔ARK_KEY 绛夛級
import 'dotenv/config'

// V8 鍘熺敓缂栬瘧缂撳瓨锛氱儹鍚姩 JS 鍔犺浇鎻愰€?30-50%
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

// 鈹€鈹€ 鏃ュ織鍒濆鍖?鈹€鈹€
log.initialize()
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
log.transports.file.level = 'info'
;(log.transports.file as any).processor = createSanitizingProcessor((log.transports.file as any).processor)
;(log.transports.console as any).processor = createSanitizingProcessor((log.transports.console as any).processor)

// 鈹€鈹€ V8 鍫嗛檺鍒?+ GPU 缂撳瓨閲嶅畾鍚?鈹€鈹€
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')
if (process.platform === 'win32') {
  const gpuCacheDir = join(app.getPath('userData'), 'gpu-cache')
  app.commandLine.appendSwitch('disk-cache-dir', gpuCacheDir)
}

const appTitle = process.env.VITE_APP_TITLE || 'WorkPulse'
log.info('[Main] 馃煝 涓昏繘绋嬪凡鍚姩锛?)

let isQuitting = false

const APP_ICON_PATH = is.dev
  ? join(__dirname, '../../resources/icon.ico')
  : join(process.resourcesPath, 'icon.ico')

// 鈹€鈹€ 鏍稿績 Helper 鈹€鈹€

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

// 鈹€鈹€ 鍏ㄥ眬蹇嵎閿?鈹€鈹€

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

// 鈹€鈹€ 蹇嵎閿?/ 璇█ IPC 鈹€鈹€

function registerShortcutIpc(): void {
  ipcMain.handle('shortcut:update', (_event, key: 'shortcut_quick_log' | 'shortcut_quick_task', value: string) => {
    const overrides = key === 'shortcut_quick_log' ? { log: value } : { task: value }
    const results = reregisterGlobalShortcuts(overrides)
    if (!results.log || !results.task) { reregisterGlobalShortcuts(); return false }
    setSetting(key, value)
    buildMenu(sendToRenderer)
    rebuildTrayMenu(sendToRenderer, () => { isQuitting = true; app.quit() })
    return true
  })

  ipcMain.handle('app:language:update', (_event, language: AppLanguage) => {
    if (!['system', 'zh', 'en'].includes(language)) return
    setSetting('app_language', language)
    buildMenu(sendToRenderer)
    rebuildTrayMenu(sendToRenderer, () => { isQuitting = true; app.quit() })
  })
}

// 鈹€鈹€ 涓荤獥鍙?鈹€鈹€

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

  // 鈹€鈹€ 瀵艰埅閿侊細闃叉椤甸潰琚姭鎸佽烦杞埌澶栭儴 URL 鈹€鈹€
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 寮€鍙戞ā寮忓厑璁?Vite HMR
    if (is.dev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')) return
    // file: 鍗忚鍏佽锛堟湰鍦版瀯寤轰骇鐗╋級
    if (url.startsWith('file:')) return
    // 鍏朵粬涓€寰嬮樆姝紝鍦ㄥ閮ㄦ祻瑙堝櫒鎵撳紑
    event.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  log.info('[Main] 馃搵 Loading URL...')
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 鈹€鈹€ .NET Bridge 鈹€鈹€

let dotnetLib: any = null
let dotnetLoaded = false

async function ensureDotNet(): Promise<void> {
  if (!dotnetLoaded) {
    try { dotnetLib = await loadDotNet(); log.info('鉁?.NET 宸插姞杞?) }
    catch (err) { log.error('鈿狅笍 .NET 鍔犺浇澶辫触', err) }
    dotnetLoaded = true
  }
}

function registerDotnetIpc(): void {
  ipcMain.handle('dotnet:invoke', async (_event, method: string, ...args: unknown[]) => {
    await ensureDotNet()
    if (!dotnetLib?.NativeBridge) throw new Error('.NET Bridge not loaded')
    const fn = dotnetLib.NativeBridge[method]
    if (typeof fn !== 'function') throw new Error(`Unknown method: ${method}`)
    try { return fn(...args) }
    catch (err: unknown) { log.error(`[Dotnet] ${method} failed:`, err); throw err }
  })
}

// 鈹€鈹€ 閫氱煡 IPC 鈹€鈹€

function registerNotificationIpc(): void {
  ipcMain.handle('notification:show', (_event, options: {
    title: string; body: string; group?: string; tag?: string;
    urgency?: 'normal' | 'low' | 'critical'; silent?: boolean
  }) => {
    try { showNotification(options); return { ok: true } }
    catch (err) { log.error('[Notification] IPC show failed:', err); return { ok: false, error: String(err) } }
  })
}

// 鈹€鈹€ 妯″瀷鏂囦欢璇诲彇 IPC 鈹€鈹€

function registerModelFileIpc(): void {
  ipcMain.handle('read-model-file', async (_event, fileName: string) => {
    const basePath = app.isPackaged
      ? path.join(process.resourcesPath, 'models')
      : path.join(app.getAppPath(), 'resources', 'models')
    const filePath = path.join(basePath, fileName)
    try {
      const buffer = await fs.readFile(filePath)
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    } catch (error) {
      log.error(`璇诲彇妯″瀷鏂囦欢澶辫触: ${filePath}`, error)
      throw error
    }
  })
}

// 鈹€鈹€ 鍗忚娉ㄥ唽锛堝繀椤诲湪 app.ready 涔嬪墠锛?鈹€鈹€
initNotifications()

// 鈹€鈹€ 鍗曞疄渚嬮攣 鈹€鈹€
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

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
//  Bootstrap 鈥?娓愯繘寮忔祦姘寸嚎
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲

app.whenReady().then(async () => {
  // Phase 1: 瀹屾暣鎬ф牎楠?+ 瀹夊叏
  verifyIntegrity()
  registerAttachmentProtocol()

  // 鈹€鈹€ 鏉冮檺鎷︽埅锛圥0锛夛細闃叉鎭舵剰鑴氭湰鐢宠鎽勫儚澶?楹﹀厠椋?浣嶇疆 鈹€鈹€
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
      log.warn(`[Security] 馃毇 鎷掔粷鏉冮檺璇锋眰: ${permission}`)
      callback(false)
    }
  })

  // Phase 2: 鏍稿績鍩虹璁炬柦
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

  // 妯″瀷鏈湴缂撳瓨鍗忚
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

  // Phase 3: 鏁版嵁搴?+ 璋冨害 + IPC
  initDatabase()
  startScheduler(getMainWindow)
  registerAutoLaunchIpc()
  setAutoLaunchDeps(getMainWindow, APP_ICON_PATH)

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

  // Phase 4: WCO 娣辫壊妯″紡閫傞厤
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

  // Phase 5: UI 灞?  const onQuit = () => { isQuitting = true; app.quit() }
  buildMenu(sendToRenderer)
  createTray(sendToRenderer, onQuit)

  // 鈹€鈹€ 鐢垫簮绠＄悊锛圥1锛夛細绯荤粺浼戠湢/鎭㈠鏃舵殏鍋?鎭㈠璋冨害鍣?鈹€鈹€
  powerMonitor.on('suspend', () => {
    log.info('[Power] 馃挙 绯荤粺鍗冲皢浼戠湢锛屾殏鍋滆皟搴﹀櫒')
    stopScheduler()
  })

  powerMonitor.on('resume', () => {
    log.info('[Power] 鈿?绯荤粺鎭㈠锛岄噸鍚皟搴﹀櫒')
    // 寤惰繜 2 绉掑悗鎭㈠锛岀瓑寰呯綉缁滃拰绯荤粺鏈嶅姟灏辩华
    setTimeout(() => {
      startScheduler(getMainWindow)
    }, 2000)
  })

  // Phase 6: 浜嬩欢椹卞姩 鈥?涓荤獥鍙?鈫?寰勫悜鑿滃崟浜掓枼鏄剧ず
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

  // Phase 7: 绐楀彛鍒涘缓 + 鍚姩妫€鏌?  createSplashWindow()
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
