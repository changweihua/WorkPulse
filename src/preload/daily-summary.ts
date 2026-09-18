/**
 * 预加载脚本：每日摘要弹窗
 * 暴露安全的 API 给渲染进程
 */
import { contextBridge, ipcRenderer } from 'electron'

interface SummaryData {
  todayLogs: number
  todayTasks: number
  streak: number
  totalLogs: number
  totalTasksDone: number
  activeTasks: number
  weekData: Array<{ date: string; log_count: number; task_completed: number }>
  date: string
}

const api = {
  /** 关闭弹窗 */
  dismiss: () => ipcRenderer.send('daily-summary:dismiss'),

  /** 监听数据推送 */
  onData: (cb: (data: SummaryData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SummaryData): void => cb(data)
    ipcRenderer.on('daily-summary:data', handler)
    return () => {
      ipcRenderer.removeListener('daily-summary:data', handler)
    }
  },
}

try {
  contextBridge.exposeInMainWorld('dailySummaryApi', api)
} catch {
  // @ts-ignore — 开发模式 fallback
  window.dailySummaryApi = api
}
