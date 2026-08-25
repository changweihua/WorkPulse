import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let radialWindow: BrowserWindow | null = null

/**
 * 找到主窗口（排除 radial 自身），用于把 radial 的动作转发过去。
 */
function getTargetWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.find((w) => w !== radialWindow) ?? wins[0] ?? null
}

export function createRadialWindow(parent: BrowserWindow): BrowserWindow {
  // 默认居中屏幕；toggle 时跟随光标
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

export function showRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.show()
    return
  }
  createRadialWindow(parent)
}

export function toggleRadialWindow(parent: BrowserWindow): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    hideRadialWindow()
  } else {
    createRadialWindow(parent)
  }
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.close()
    radialWindow = null
  }
}

// --- IPC: radial menu actions ---
// 渲染进程通过 radialApi 调用，这里把动作转发给主窗口并关闭 radial。
ipcMain.handle('radial:action', (_event, action: string) => {
  const win = getTargetWindow()
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.send('radial:action', action)
  }
  // 不关闭窗口，保持常驻
  return true
})

ipcMain.handle('radial:close', () => {
  hideRadialWindow()
  return true
})
