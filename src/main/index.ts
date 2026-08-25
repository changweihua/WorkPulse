// 必须最先加载：让主进程读取项目根目录 .env（BARK_KEY 等）
import 'dotenv/config'
import { app, protocol, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, ipcMain } from 'electron'
import path, { join } from 'path'
import { readFileSync, createReadStream } from 'fs'
import { Readable } from 'stream'
import { getModelsDir } from './model-files'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, getSetting, setSetting } from './db'
import { registerAttachmentProtocol } from './attachments'
import { startScheduler } from './scheduler'
import { registerIpcHandlers } from './ipc'
import { tMain, type AppLanguage } from './i18n'
import { configureAutoUpdater, getFullAppVersion, registerUpdateIpc, startUpdateCheck } from './updater'
import {
  registerTitleBarListener,
  attachTitleBarToWindow
} from '@electron-uikit/titlebar'
import contextMenu from 'electron-context-menu'
import { loadDotNet } from './asar-dotnet-loader';
import fs from 'fs/promises';
import log from 'electron-log/main';
import { showRadialWindow, hideRadialWindow, toggleRadialWindow } from './radial-window';

log.initialize(); // 只需调用一次
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
log.transports.file.level = 'info';

const appTitle = process.env.VITE_APP_TITLE || 'WorkPulse'
console.log('[Main] 🟢 主进程已启动！');

let tray: Tray | null = null
let isQuitting = false

// +++++ 新增：启动窗口引用 +++++
// 应用图标：Windows 推荐 .ico（无边框 NC 重绘后仍能稳定显示）
const APP_ICON_PATH = is.dev
  ? join(__dirname, '../../resources/icon.ico')
  : join(process.resourcesPath, 'icon.ico')

let splashWindow: BrowserWindow | null = null

// --- Helpers ---

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] || null
}

function sendToRenderer(channel: string): void {
  const win = getMainWindow()
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.send(channel)
  }
}

// --- Shortcuts ---

const DEFAULT_SHORTCUT_LOG = 'CmdOrCtrl+Shift+L'
const DEFAULT_SHORTCUT_TASK = 'CmdOrCtrl+Shift+T'

function getShortcuts(overrides: Partial<{ log: string; task: string }> = {}): { log: string; task: string } {
  const log = overrides.log ?? getSetting('shortcut_quick_log') ?? DEFAULT_SHORTCUT_LOG
  const task = overrides.task ?? getSetting('shortcut_quick_task') ?? DEFAULT_SHORTCUT_TASK
  return { log, task }
}

function registerShortcut(accelerator: string, channel: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => sendToRenderer(channel))
  } catch {
    return false
  }
}

export function reregisterGlobalShortcuts(
  overrides: Partial<{ log: string; task: string }> = {}
): { log: boolean; task: boolean } {
  globalShortcut.unregisterAll()
  const { log, task } = getShortcuts(overrides)

  // 径向快捷菜单：Cmd/Ctrl + Shift + Space
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      toggleRadialWindow(win)
    }
  })

  return {
    log: registerShortcut(log, 'quick-create:log'),
    task: registerShortcut(task, 'quick-create:task')
  }
}

// --- Application Menu ---

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const { log: logShortcut, task: taskShortcut } = getShortcuts()

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: tMain('create'),
      submenu: [
        {
          label: tMain('newLog'),
          accelerator: logShortcut,
          click: () => sendToRenderer('quick-create:log')
        },
        {
          label: tMain('newTask'),
          accelerator: taskShortcut,
          click: () => sendToRenderer('quick-create:task')
        }
      ]
    },
    {
      label: tMain('navigation'),
      submenu: [
        { label: tMain('logs'), accelerator: 'CmdOrCtrl+1', click: () => sendToRenderer('navigate:worklog') },
        { label: tMain('board'), accelerator: 'CmdOrCtrl+2', click: () => sendToRenderer('navigate:kanban') },
        { label: tMain('reports'), accelerator: 'CmdOrCtrl+3', click: () => sendToRenderer('navigate:report') },
        { label: tMain('stats'), accelerator: 'CmdOrCtrl+4', click: () => sendToRenderer('navigate:stats') },
        { type: 'separator' },
        { label: tMain('settings'), accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('navigate:settings') }
      ]
    },
    {
      label: tMain('edit'),
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: tMain('window'),
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as Electron.MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// --- ContextMenu
// ===== 新增：右键菜单配置 =====
function setupContextMenu(window: BrowserWindow): void {
  contextMenu({
    window,
    showCopyImage: true,
    showCopyImageAddress: true,
    showSaveImage: true,
    showInspectElement: is.dev,
    showSelectAll: true,
    showCopyLink: true,
    // showCopy: true,
    // showCut: true,
    // showPaste: true,
    showSaveLinkAs: true,
    showServices: process.platform === 'darwin',
    prepend: (defaultActions, parameters) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      // 选中文本 → 搜索
      if (parameters.selectionText) {
        const text = parameters.selectionText.trim()
        if (text.length > 0) {
          items.push({
            label: `搜索 "${text.substring(0, 20)}${text.length > 20 ? '…' : ''}"`,
            click: () => {
              shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(text)}`)
            }
          })
          items.push({ type: 'separator' })
        }
      }

      // 链接 → 在浏览器打开
      if (parameters.linkURL) {
        items.push({
          label: '在浏览器中打开链接',
          click: () => {
            shell.openExternal(parameters.linkURL)
          }
        })
        items.push({ type: 'separator' })
      }

      // 应用内导航
      items.push({
        label: '返回工作台',
        click: () => {
          window.webContents.send('navigate:worklog')
        }
      })
      items.push({
        label: '打开设置',
        click: () => {
          window.webContents.send('navigate:settings')
        }
      })

      return items
    },
    append: (defaultActions, parameters) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      // 开发环境信息
      if (!is.dev) {
        items.push({ type: 'separator' })
        items.push({
          label: `开发模式 v${app.getVersion()}`,
          enabled: false,
        })
        // 快速重载
        items.push({
          label: '重载页面',
          click: () => {
            window.webContents.reload()
          }
        })
        // 打开 DevTools
        items.push({
          label: '打开开发者工具',
          click: () => {
            window.webContents.openDevTools()
          }
        })
      }

      // 显示页面信息
      items.push({ type: 'separator' })
      items.push({
        label: `WorkPulse ${getFullAppVersion()}`,
        enabled: false,
      })

      return items
    },
    labels: {
      cut: '剪切',
      copy: '复制',
      paste: '粘贴',
      copyLink: '复制链接地址',
      copyImage: '复制图片',
      copyImageAddress: '复制图片地址',
      saveImage: '保存图片…',
      saveLinkAs: '链接另存为…',
      selectAll: '全选',
      inspect: '检查元素',
    }
  })
}


// --- Tray ---

function buildTrayMenu(): Electron.Menu {
  const iconDir = is.dev
    ? join(__dirname, '../../resources')
    : join(process.resourcesPath)

  const newLogIcon = nativeImage.createFromPath(join(iconDir, 'menu-new-log.png')).resize({ width: 16, height: 16 })
  const newTaskIcon = nativeImage.createFromPath(join(iconDir, 'menu-new-task.png')).resize({ width: 16, height: 16 })
  const showIcon = nativeImage.createFromPath(join(iconDir, 'menu-show.png')).resize({ width: 16, height: 16 })
  const quitIcon = nativeImage.createFromPath(join(iconDir, 'menu-quit.png')).resize({ width: 16, height: 16 })

  return Menu.buildFromTemplate([
    {
      label: tMain('newLog'),
      icon: newLogIcon,
      click: () => sendToRenderer('quick-create:log')
    },
    {
      label: tMain('newTask'),
      icon: newTaskIcon,
      click: () => sendToRenderer('quick-create:task')
    },
    { type: 'separator' },
    {
      label: tMain('showApp'),
      icon: showIcon,
      click: () => {
        const win = getMainWindow()
        if (win) { win.show(); win.focus() }
      }
    },
    { type: 'separator' },
    {
      label: tMain('quit'),
      icon: quitIcon,
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}

function createTray(): void {
  // In dev: resources/ is at project root. In production: extraResources copies it to app.getPath('exe')/../
  const iconPath = is.dev
    ? join(__dirname, '../../resources/tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') {
    try {
      icon = nativeImage.createFromBuffer(readFileSync(iconPath), { scaleFactor: 2 })
    } catch {
      // Fall back to the regular path-loaded image below.
    }
  }
  if (icon.isEmpty()) {
    // Fallback: create a minimal 1x1 white pixel template image
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABdJREFUeNpj/P//PwMlgHHUgFEDAAIMAAABBgABsp3F1QAAAABJRU5ErkJggg=='
    )
  }
  if (process.platform !== 'darwin') {
    icon = icon.resize({ width: 18, height: 18 })
  }
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('WorkPulse')
  tray.setContextMenu(buildTrayMenu())

  // Click on tray icon shows/focuses the window
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible() && win.isFocused()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })
}

// --- Window ---
const MIN_SPLASH_DISPLAY = 1500 // 最少显示 1.5 秒
const MAX_SPLASH_DISPLAY = 5000 // 最多显示 5 秒（防止卡死）


function getSplashPath(): string {
  // 优先使用 app.isPackaged 判断
  if (app.isPackaged) {
    // 生产环境：resourcesPath 直接包含 splash.html
    return join(process.resourcesPath, 'splash.html');
  } else {
    // 开发环境：项目根目录 resources/splash.html
    return join(app.getAppPath(), 'resources', 'splash.html');
  }
}

let splashCreatedAt = 0
// +++++ 新增：创建启动窗口 +++++
function createSplashWindow(): void {
  console.log('[Splash] 🟢 开始创建启动窗口...')
  splashCreatedAt = Date.now()
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    frame: false,
    roundedCorners: true,           // ← 开启圆角（Windows 11）
    hasShadow: false,                // 可保留阴影
    transparent: true,                    // ← 关键：启用透明
    backgroundColor: '#00000000',         // ← 完全透明（8位十六进制，最后两位是 Alpha）
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true, // 允许使用 <webview>
      // +++++ 关键：加载 splash 专用 preload +++++
      preload: join(__dirname, '../preload/splash.js'),  // 注意是 .js（编译后）
    },
  })

  console.log('[Splash] ✅ 窗口已创建')

  // 显式设置背景为透明
  splashWindow.setBackgroundColor('#00000000')

  const splashPath = getSplashPath();
  console.log('[Splash] 📁 加载路径:', splashPath)

  console.log('[Splash] Loading from:', splashPath)  // 调试日志

  const loadSplash = (isRetry = false): void => {
    if (!splashWindow) return
    splashWindow.loadFile(splashPath).then(() => {
      console.log('[Splash] ✅ HTML 加载成功')
    }).catch((err) => {
      // 窗口已被关闭（竞态）则不再处理；否则重试一次
      if (!splashWindow) return
      if (isRetry) {
        console.error('[Splash] ❌ HTML 重试仍失败:', err)
        return
      }
      console.warn('[Splash] ⚠️ HTML 加载失败，500ms 后重试:', err)
      setTimeout(() => loadSplash(true), 500)
    })
  }
  loadSplash()

  splashWindow.center()
  splashWindow.once('ready-to-show', () => {
    if (splashWindow) {
      console.log('[Splash] 🟢 窗口已准备显示')
      splashWindow.show()
      // 可选：淡入效果
      splashWindow.setOpacity(0)
      let opacity = 0
      const interval = setInterval(() => {
        opacity += 0.1
        if (splashWindow) {
          splashWindow.setOpacity(Math.min(opacity, 1))
          if (opacity >= 1) clearInterval(interval)
        } else {
          clearInterval(interval)
        }
      }, 30)
    }
  })

  // 最大时间保护：5 秒后强制关闭
  setTimeout(() => {
    if (splashWindow) {
      console.warn('[Splash] 强制关闭（超时）')
      closeSplashWindow()
    }
  }, MAX_SPLASH_DISPLAY)
}

// +++++ 新增：关闭启动窗口 +++++
function closeSplashWindow(): void {
  if (!splashWindow) return

  const elapsed = Date.now() - splashCreatedAt
  const remaining = Math.max(0, MIN_SPLASH_DISPLAY - elapsed)

  setTimeout(() => {
    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }
  }, remaining)
}

// 原有的 createWindow 函数需要修改 ready-to-show 事件
function createWindow(): void {
  const iconPath = APP_ICON_PATH
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 500,
    show: false,
    title: appTitle,
    frame: false,                    // ← 完全移除默认标题栏
    titleBarStyle: 'hidden',
    icon: iconPath,
    // 原生 Mica（Electron 36+ / PR #47386）：零透明度背景让 DWM 材质透出，
    // 同时保留窗口阴影、贴靠布局与圆角；Win10 上自动忽略该属性
    backgroundColor: '#00000000',
    // 窗口材质：mica | tabbed | acrylic（设置页可切换，默认 tabbed）
    backgroundMaterial: (getSetting('window_material') as 'mica' | 'tabbed' | 'acrylic') || 'tabbed',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 当窗口准备就绪后，最大化并显示
  mainWindow.once('ready-to-show', () => {
    closeSplashWindow()
    // 必须先 show 再 maximize，否则无边框窗口最大化不生效
    mainWindow.show()
    mainWindow.maximize()
    mainWindow.hide() // 隐藏主窗口，通过径向菜单打开
    // 必须设置图标（无边框窗口需要）
    mainWindow.setIcon(APP_ICON_PATH)
    // 自动显示径向悬浮窗
    showRadialWindow(mainWindow)
  })
  if (process.platform !== 'darwin') {
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        const closeAction = getSetting('close_action')
        if (closeAction === 'quit') {
          isQuitting = true
          app.quit()
        } else {
          mainWindow.hide()
        }
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })


  console.log('[Main] 📋 Loading URL...');

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}



// --- IPC: shortcut update ---

function registerShortcutIpc(): void {
  ipcMain.handle('shortcut:update', (_event, key: 'shortcut_quick_log' | 'shortcut_quick_task', value: string) => {
    const overrides = key === 'shortcut_quick_log' ? { log: value } : { task: value }
    const results = reregisterGlobalShortcuts(overrides)
    const success = results.log && results.task

    if (!success) {
      reregisterGlobalShortcuts()
      return false
    }

    setSetting(key, value)
    buildMenu()
    if (tray) tray.setContextMenu(buildTrayMenu())
    return true
  })

  ipcMain.handle('app:language:update', (_event, language: AppLanguage) => {
    if (!['system', 'zh', 'en'].includes(language)) return
    setSetting('app_language', language)
    buildMenu()
    if (tray) tray.setContextMenu(buildTrayMenu())
  })
}

// ===== 单实例锁 =====
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果未获得锁，说明已有实例在运行，退出当前进程
  app.quit()
} else {
  // 获得锁，监听第二个实例启动事件
  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    // 当另一个实例启动时，聚焦到已有窗口
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      win.show()
    }
  })
}

// --- Bootstrap ---
let dotnetLib: any = null;
app.whenReady().then(async () => {
  // 加载 .NET
  try {
    dotnetLib = await loadDotNet();
    console.log('✅ .NET 已加载');
  } catch (err) {
    console.error('⚠️ .NET 加载失败', err);
  }

  // 模型本地缓存协议：appmodel://models/<modelId>/resolve/main/<file>
  registerAttachmentProtocol()
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
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(st.size),
          'access-control-allow-origin': '*'
        }
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })

  // 注册 IPC 处理：读取模型文件
  ipcMain.handle('read-model-file', async (event, fileName: string) => {
    // 开发环境：文件在项目根目录 resources/models
    // 生产环境：文件在 extraResources 目录（process.resourcesPath/models）
    let basePath: string;
    if (app.isPackaged) {
      // 打包后，extraResources 中的文件位于 process.resourcesPath
      basePath = path.join(process.resourcesPath, 'models');
    } else {
      // 开发时，从项目根目录读取
      basePath = path.join(app.getAppPath(), 'resources', 'models');
    }

    const filePath = path.join(basePath, fileName);
    try {
      const buffer = await fs.readFile(filePath);
      // 返回 ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
      console.error(`读取模型文件失败: ${filePath}`, error);
      throw error;
    }
  });

  // 注册 IPC
  ipcMain.handle('say-hello', async (_, name: string) => {
    if (!dotnetLib || !dotnetLib.NativeBridge) {
      throw new Error('.NET 未就绪');
    }
    // 方法名是小写开头的 sayHello（由 Generator 自动转换）
    return dotnetLib.NativeBridge.sayHello(name);
  });
  // Register title bar IPC listeners
  registerTitleBarListener()

  initDatabase()

  startScheduler(getMainWindow)

  registerAutoLaunchIpc();

  // Windows 必须显式设置 AppUserModelID：缺失时 Explorer 按 electron.exe 路径推导
  // 任务栏分组身份，导致显示 exe 默认图标。值与 electron-builder 的 build.appId 一致。
  if (process.platform === 'win32') {
    electronApp.setAppUserModelId('cmono.workpulse.app')
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    // Attach a title bar to the window
    attachTitleBarToWindow(window)
    // ===== 初始化右键菜单 =====
    setupContextMenu(window)
    // if (process.env.NODE_ENV === 'development') {
    //   window.webContents.openDevTools();
    // }
  })

  configureAutoUpdater()
  registerIpcHandlers()
  registerShortcutIpc()
  registerUpdateIpc()
  buildMenu()
  createTray()

  // +++++ 在创建主窗口之前，先创建并显示启动窗口 +++++
  createSplashWindow()

  createWindow()
  startUpdateCheck()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  const results = reregisterGlobalShortcuts()
  if (!results.log || !results.task) {
    console.warn('One or more global shortcuts could not be registered')
  }

})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', async () => {
    globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 监听窗口控制事件
ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  switch (action) {
    case 'minimize': win.minimize(); break
    case 'maximize': win.maximize(); break
    case 'close': win.close(); break
  }
})

/**
 * 设置开机启动状态
 * @param enable - true 启用，false 禁用
 */
export function setAutoLaunch(enable: boolean): void {
  // 持久化到数据库
  setSetting('auto_launch', enable ? 'true' : 'false')
  // 打包后才启用系统登录项，开发环境下 electron.exe 无法正确启动应用
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: app.getPath('exe'),
      args: enable ? ['--hidden'] : []
    });
  }
}

/**
 * 获取当前开机启动状态
 */
export function getAutoLaunch(): boolean {
  // 优先从数据库读取
  const saved = getSetting('auto_launch')
  if (saved !== null) return saved === 'true'
  return app.getLoginItemSettings().openAtLogin;
}

// 在 app ready 后注册 IPC 处理器
export function registerAutoLaunchIpc(): void {
  ipcMain.handle('set-auto-launch', (event, enable: boolean) => {
    setAutoLaunch(enable);
    return { success: true };
  });

  ipcMain.handle('get-auto-launch', () => {
    return getAutoLaunch();
  });

  // 启动时恢复系统登录项设置（仅打包后生效）
  if (app.isPackaged) {
    const savedAutoLaunch = getSetting('auto_launch')
    if (savedAutoLaunch !== null) {
      app.setLoginItemSettings({
        openAtLogin: savedAutoLaunch === 'true',
        path: app.getPath('exe'),
        args: savedAutoLaunch === 'true' ? ['--hidden'] : []
      });
    }
  }

  // 关闭行为设置
  ipcMain.handle('get-close-action', () => {
    return getSetting('close_action') || 'minimize'
  })

  ipcMain.handle('set-close-action', (_event, action: string) => {
    setSetting('close_action', action)
    return { success: true }
  })

  // 窗口材质（Mica / Mica Tabbed / Acrylic），动态切换无需重启
  ipcMain.handle('get-window-material', () => {
    return getSetting('window_material') || 'tabbed'
  })

  ipcMain.handle('set-window-material', (_event, material: string) => {
    setSetting('window_material', material)
    const win = getMainWindow()
    if (win && process.platform === 'win32') {
      try {
        win.setBackgroundMaterial(material as 'mica' | 'tabbed' | 'acrylic')
        win.setIcon(APP_ICON_PATH)
      } catch (err) {
        console.error('[Main] setBackgroundMaterial failed:', err)
        return { success: false }
      }
    }
    return { success: true }
  })
}
