/**
 * IPC 领域：工作日志 CRUD + 统计 + 分类
 */
import { ipcMain } from 'electron'
import {
  addWorkLog, getWorkLogs, getWorkLogsByDateRange, searchWorkLogs,
  getCategories, updateWorkLogCategory, deleteWorkLog, restoreWorkLog,
  getStats, updateWorkLog, workLogExists
} from '../db'
import { validate, WorklogAddSchema, WorklogUpdateSchema, WorklogDeleteSchema } from '../ipc-schemas'

export function registerWorklogIpc(): void {
  ipcMain.handle('worklog:add', (_event, content: string, category?: string) => {
    const v = validate(WorklogAddSchema, { content, category })
    return addWorkLog(v.content, v.category)
  })

  ipcMain.handle('worklog:list', (_event, limit?: number, offset?: number) => {
    return getWorkLogs(limit, offset)
  })

  ipcMain.handle('worklog:byDateRange', (_event, from: string, to: string) => {
    return getWorkLogsByDateRange(from, to)
  })

  ipcMain.handle('worklog:search', (_event, keyword: string) => {
    return searchWorkLogs(keyword)
  })

  ipcMain.handle('worklog:categories', () => {
    return getCategories()
  })

  ipcMain.handle('worklog:setCategory', (_event, id: number, category: string) => {
    updateWorkLogCategory(id, category)
  })

  ipcMain.handle('worklog:update', (_event, id: number, content: string, category: string, created_at?: string) => {
    const v = validate(WorklogUpdateSchema, { id, content, category, created_at })
    return updateWorkLog(v.id, v.content, v.category, v.created_at)
  })

  ipcMain.handle('worklog:delete', (_event, id: number) => {
    const v = validate(WorklogDeleteSchema, { id })
    return deleteWorkLog(v.id)
  })

  ipcMain.handle(
    'worklog:restore',
    (_event, log: { content: string; category: string; created_at: string; task_id: number | null }) => {
      return restoreWorkLog(log)
    }
  )

  ipcMain.handle('stats:get', (_event, days?: number) => {
    return getStats(days)
  })
}
