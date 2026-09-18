/**
 * IPC 领域：每日工作摘要弹窗
 * 提供今日统计数据给渲染进程展示弹窗
 */
import { ipcMain } from 'electron'
import { getStats } from '../db'
import log from 'electron-log/main'
import { tMain } from '../i18n'

export function registerDailySummaryIpc(): void {
  ipcMain.handle('daily-summary:get', async (_event, days = 1) => {
    try {
      const stats = getStats(days)
      return {
        success: true,
        data: stats,
      }
    } catch (err) {
      log.error('[daily-summary:get] failed:', err)
      return {
        success: false,
        error: (err as Error).message,
      }
    }
  })
}