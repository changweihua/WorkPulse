import { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, ipcMain } from 'electron'
import path, { join } from 'path'
import { readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, getSetting, setSetting } from './db'
import { registerIpcHandlers } from './ipc'
import { tMain, type AppLanguage } from './i18n'
import { configureAutoUpdater, registerUpdateIpc, startUpdateCheck } from './updater'
import {
  MicaBrowserWindow,
  // @ts-ignore
  useMicaElectron
} from 'talex-mica-electron';
import {
  registerTitleBarListener,
  attachTitleBarToWindow
} from '@electron-uikit/titlebar'

let tray: Tray | null = null
let isQuitting = false

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

// --- Tray ---

function buildTrayMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: tMain('newLog'),
      click: () => sendToRenderer('quick-create:log')
    },
    {
      label: tMain('newTask'),
      click: () => sendToRenderer('quick-create:task')
    },
    { type: 'separator' },
    {
      label: tMain('showApp'),
      click: () => {
        const win = getMainWindow()
        if (win) { win.show(); win.focus() }
      }
    },
    { type: 'separator' },
    {
      label: tMain('quit'),
      click: () => app.quit()
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

function createWindow(): void {
  const iconPath = is.dev
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
  const mainWindow = new MicaBrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 500,
    show: false,
    title: 'WorkPulse',
    frame: false,                    // ← 完全移除默认标题栏
    transparent: true,               // ← 允许圆角/透明效果
    titleBarStyle: 'hidden',
    icon: iconPath,
    //frame: false, // needed if process.versions.electron < 14
    /* You can use *titleBarOverlay: true* to use the original Windows controls */
    titleBarOverlay: false,
    backgroundMaterial: 'mica',  // Windows 11 云母效果
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 2. 应用 Windows 11 云母效果
  mainWindow.setMicaEffect();           // 标准云母效果
  // win.setMicaTabbedEffect();  // 备选：带选项卡的云母效果 (Mica Alt)
  // win.setMicaAcrylicEffect(); // 备选：亚克力效果

  // 当窗口准备就绪后，最大化并显示
  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize(); // 最大化窗口
    mainWindow.show();     // 显示窗口
  });

  if (process.platform !== 'darwin') {
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        mainWindow.hide()
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

// --- Bootstrap ---
useMicaElectron()
app.whenReady().then(() => {
  // Register title bar IPC listeners
  registerTitleBarListener()

  registerAutoLaunchIpc();

  electronApp.setAppUserModelId('com.workpulse')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    // Attach a title bar to the window
    attachTitleBarToWindow(window)
  })

  initDatabase()
  configureAutoUpdater()
  registerIpcHandlers()
  registerShortcutIpc()
  registerUpdateIpc()
  buildMenu()
  createTray()
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

app.on('will-quit', () => {
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
  app.setLoginItemSettings({
    openAtLogin: enable,
    // 可选：如果你希望在开机启动时隐藏主窗口（只显示托盘），可以传递自定义参数
    args: enable ? ['--hidden'] : []
  });
}

/**
 * 获取当前开机启动状态
 */
export function getAutoLaunch(): boolean {
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
}