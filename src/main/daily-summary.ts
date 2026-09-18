/**
 * 每日工作摘要弹窗模块
 * 每天启动时自动弹窗展示当日工作统计
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { getSetting, setSetting, getStats } from './db'

let summaryWindow: BrowserWindow | null = null

function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 检查今日是否已展示过 */
function hasShownToday(): boolean {
  return getSetting('daily_summary_last_shown') === getToday()
}

/** 标记今日已展示 */
function markShownToday(): void {
  setSetting('daily_summary_last_shown', getToday())
}

function getSummaryHTMLPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'daily-summary.html')
  }
  return join(app.getAppPath(), 'src', 'renderer', 'daily-summary.html')
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/daily-summary.js')
}

/** 创建并显示每日摘要弹窗 */
export function showDailySummary(getMainWindow: () => BrowserWindow | null): void {
  // 检查是否已显示
  if (summaryWindow && !summaryWindow.isDestroyed()) return

  // 检查是否启用
  const enabled = getSetting('daily_summary_enabled')
  if (enabled === '0') return

  // 检查今日是否已展示
  if (hasShownToday()) return

  // 获取统计数据（7天用于周活动图）
  const stats = getStats(7)
  const today = getToday()
  const todayStats = stats.daily.find(d => d.date === today)

  const summaryData = {
    todayLogs: todayStats?.log_count ?? 0,
    todayTasks: todayStats?.task_completed ?? 0,
    streak: stats.streak,
    totalLogs: stats.totalLogs,
    totalTasksDone: stats.totalTasksDone,
    activeTasks: stats.totalTasksActive,
    weekData: stats.daily.slice(-7),
    date: today,
  }

  // 获取屏幕尺寸，居中显示
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const winWidth = 420
  const winHeight = 580

  summaryWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((screenWidth - winWidth) / 2),
    y: Math.round((screenHeight - winHeight) / 2),
    frame: false,
    roundedCorners: true,
    hasShadow: true,
    transparent: false,
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
      preload: getPreloadPath(),
    },
  })

  // 加载 HTML
  const htmlPath = getSummaryHTMLPath()
  summaryWindow.loadFile(htmlPath).then(() => {
    log.info('[DailySummary] ✅ HTML loaded')
    // 多次尝试发送数据，确保 preload 监听器就绪
    const trySend = (attempt: number) => {
      if (summaryWindow && !summaryWindow.isDestroyed()) {
        summaryWindow.webContents.send('daily-summary:data', summaryData)
        log.info(`[DailySummary] 📤 数据已发送 (attempt ${attempt})`)
      }
    }
    setTimeout(() => trySend(1), 300)
    setTimeout(() => trySend(2), 800)
    setTimeout(() => trySend(3), 1500)
  }).catch(err => {
    log.error('[DailySummary] ❌ HTML load failed:', err)
    closeDailySummary()
  })

  summaryWindow.on('closed', () => {
    summaryWindow = null
  })

  log.info('[DailySummary] 🟢 弹窗已显示')
}

/** 关闭弹窗 */
export function closeDailySummary(): void {
  if (summaryWindow && !summaryWindow.isDestroyed()) {
    summaryWindow.close()
    summaryWindow = null
  }
}

/** 注册每日摘要 IPC 通道 */
export function registerDailySummaryIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on('daily-summary:dismiss', () => {
    markShownToday()
    closeDailySummary()
    // 如果主窗口隐藏中，显示主窗口
    const main = getMainWindow()
    if (main && !main.isVisible()) {
      main.show()
      main.focus()
    }
  })
}

/** 清除今日残留标记（修复旧版本在创建时误标记的问题） */
export function clearStaleDailySummaryMarker(): void {
  const lastShown = getSetting('daily_summary_last_shown')
  const today = getToday()
  if (lastShown === today) {
    log.info('[DailySummary] 🧹 清除旧版本残留标记')
    setSetting('daily_summary_last_shown', '')
  }
}

/** 手动触发弹窗（用于测试） */
export function triggerDailySummary(getMainWindow: () => BrowserWindow | null): void {
  const prev = getSetting('daily_summary_last_shown')
  setSetting('daily_summary_last_shown', '')
  showDailySummary(getMainWindow)
  if (!summaryWindow && prev) {
    setSetting('daily_summary_last_shown', prev)
  }
}
