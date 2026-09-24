/**
 * 启动窗口模块：Splash Screen 创建与生命周期
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'

const MIN_SPLASH_DISPLAY = 1500
const MAX_SPLASH_DISPLAY = 5000

let splashWindow: BrowserWindow | null = null
let splashCreatedAt = 0
// splash 是否已真正显示过（自身 ready-to-show 触发 show 后置为 true）
let splashShown = false

function getSplashPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'splash.html')
  } else {
    return join(app.getAppPath(), 'resources', 'splash.html')
  }
}

export function createSplashWindow(): void {
  log.info('[Splash] 🟢 开始创建启动窗口...')
  splashCreatedAt = Date.now()
  splashShown = false
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    frame: false,
    roundedCorners: true,
    hasShadow: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../preload/splash.js'),
    },
  })

  log.info('[Splash] ✅ 窗口已创建')
  splashWindow.setBackgroundColor('#00000000')

  const splashPath = getSplashPath()
  log.info('[Splash] 📁 加载路径:', splashPath)

  const loadSplash = (isRetry = false): void => {
    if (!splashWindow) return
    splashWindow.loadFile(splashPath).then(() => {
      log.info('[Splash] ✅ HTML 加载成功')
    }).catch((err) => {
      if (!splashWindow) return
      if (isRetry) {
        log.error('[Splash] ❌ HTML 重试仍失败:', err)
        return
      }
      log.warn('[Splash] ⚠️ HTML 加载失败，500ms 后重试:', err)
      setTimeout(() => loadSplash(true), 500)
    })
  }
  loadSplash()

  splashWindow.center()
  splashWindow.once('ready-to-show', () => {
    if (splashWindow) {
      log.info('[Splash] 🟢 窗口已准备显示')
      splashShown = true
      splashWindow.show()
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

  setTimeout(() => {
    if (splashWindow) {
      log.warn('[Splash] 强制关闭（超时）')
      closeSplashWindow()
    }
  }, MAX_SPLASH_DISPLAY)
}

export function closeSplashWindow(): void {
  if (!splashWindow) return
  const elapsed = Date.now() - splashCreatedAt
  // 快速启动：splash 已显示过 → 主窗 ready-to-show 早到就立即关闭，跳过 1.5s 剩余下限
  // 兜底：splash 尚未真正显示（HTML 加载慢/淡入未开始）→ 仍等满最短显示下限再关，
  //       避免"创建即销毁"的闪没；慢启动时 elapsed 本就 ≥ 下限，remaining 自然为 0
  const remaining = splashShown ? 0 : Math.max(0, MIN_SPLASH_DISPLAY - elapsed)
  // 保持 setTimeout 延迟关闭：主窗 ready-to-show 回调（maximize/hide/SHOW_RADIAL）先执行完，
  // splash 消失与主界面出现之间不留空窗
  setTimeout(() => {
    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }
  }, remaining)
}
