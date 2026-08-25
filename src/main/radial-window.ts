import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let radialWindow: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null

/**
 * 获取主窗口引用（由 index.ts 注册）
 */
export function setMainWindow(win: BrowserWindow): void {
  mainWin = win
}

function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  // 默认居中屏幕
  const display = screen.getPrimaryDisplay()
  const size = 320
  const x = Math.round(display.workArea.x + (display.workArea.width - size) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - size) / 2)

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

  // Load the radial entry point
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/radial.html`)
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/radial.html'))
  }

  // Tell renderer to animate in
  radialWindow.webContents.on('did-finish-load', () => {
    radialWindow?.webContents.send('radial:show')
  })

  return radialWindow
}

/** 显示径向菜单，同时隐藏主窗口 */
export function showRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.show()
    return
  }
  createRadialWindow(parent)
}

/** 切换径向菜单 ↔ 主窗口（互斥） */
export function toggleRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    // 径向菜单当前可见 → 关闭径向菜单，打开主窗口
    hideRadialWindow()
    const win = getMainWindow()
    if (win) {
      if (!win.isVisible()) win.show()
      win.focus()
    }
  } else {
    // 径向菜单当前不可见 → 打开径向菜单，关闭主窗口
    createRadialWindow(parent)
    const win = getMainWindow()
    if (win && win.isVisible()) {
      win.hide()
    }
  }
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.close()
    radialWindow = null
  }
}

/** 托盘显示主窗口：隐藏径向菜单 */
export function showMainWindow(): void {
  hideRadialWindow()
  const win = getMainWindow()
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
  }
}

// --- IPC: radial menu actions ---
// 渲染进程通过 radialApi 调用，这里把动作转发给主窗口并隐藏径向菜单。
ipcMain.handle('radial:action', (_event, action: string) => {
  const win = getMainWindow()
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.send('radial:action', action)
  }
  // 执行操作后隐藏径向菜单
  hideRadialWindow()
  return true
})

ipcMain.handle('radial:close', () => {
  hideRadialWindow()
  return true
})
