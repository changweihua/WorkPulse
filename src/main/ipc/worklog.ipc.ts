/**
 * IPC 领域：工作日志 CRUD + 统计 + 分类
 */
import { ipcMain } from 'electron'
import {
  addWorkLog, getWorkLogs, getWorkLogsByDateRange, searchWorkLogs,
  getCategories, updateWorkLogCategory, deleteWorkLog, restoreWorkLog,
  getStats, updateWorkLog, workLogExists, getDatabase
} from '../db'
import { validate, WorklogAddSchema, WorklogUpdateSchema, WorklogDeleteSchema } from '../ipc-schemas'
import { vectorSearch } from '../vector-search'
import log from 'electron-log/main'

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

  ipcMain.handle('worklog:search', async (_event, keyword: string) => {
    // 优先使用向量语义搜索，失败时回退到 LIKE
    try {
      const results = await vectorSearch.search(keyword, { type: 'worklog', topK: 50 })
      if (results.length > 0) {
        const ids = results
          .map(r => {
            const match = r.uri.match(/^worklog:\/\/(\d+)$/)
            return match ? parseInt(match[1]) : null
          })
          .filter((id): id is number => id !== null)

        if (ids.length > 0) {
          const db = getDatabase()
          const placeholders = ids.map(() => '?').join(',')
          const rows = db.prepare(
            `SELECT wl.*, t.due_date AS task_due_date
             FROM work_logs wl
             LEFT JOIN tasks t ON wl.task_id = t.id
             WHERE wl.id IN (${placeholders})
             ORDER BY COALESCE(t.due_date, wl.created_at) DESC`
          ).all(...ids)
          return rows
        }
      }
    } catch (e) {
      log.warn('[WorklogIPC] 向量搜索失败，回退到 LIKE:', e)
    }
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
    (_event, log_: { content: string; category: string; created_at: string; task_id: number | null }) => {
      return restoreWorkLog(log_)
    }
  )

  ipcMain.handle('stats:get', (_event, days?: number) => {
    return getStats(days)
  })
}
