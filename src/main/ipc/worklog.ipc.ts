/**
 * IPC 领域：工作日志 CRUD + 统计 + 分类
 * 迁移至 guardedHandle 模式：sender 校验 + schema 校验 + IpcResult
 */
import { guardedHandle, guardedQuery } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import {
  addWorkLog, getWorkLogs, getWorkLogsByDateRange, searchWorkLogs,
  getCategories, updateWorkLogCategory, deleteWorkLog, restoreWorkLog,
  getStats, updateWorkLog, getDatabase
} from '../db'
import {
  WorklogAddSchema, WorklogUpdateSchema, WorklogDeleteSchema,
  WorklogListSchema, WorklogByDateRangeSchema, WorklogSearchSchema,
  WorklogSetCategorySchema, WorklogRestoreSchema, StatsGetSchema,
} from '../ipc-schemas'
import { vectorSearch } from '../vector-search'

export function registerWorklogIpc(): void {
  guardedHandle('worklog:add', WorklogAddSchema, (data) => {
    const log = addWorkLog(data.content, data.category)
    // 即时向量化（异步，不阻塞返回）
    vectorSearch.indexSingleWorklog(log.id, log.content).catch(() => {})
    return ok(log)
  })

  guardedHandle('worklog:list', WorklogListSchema, (data) => {
    return ok(getWorkLogs(data.limit, data.offset))
  })

  guardedHandle('worklog:byDateRange', WorklogByDateRangeSchema, (data) => {
    return ok(getWorkLogsByDateRange(data.from, data.to))
  })

  guardedHandle('worklog:search', WorklogSearchSchema, async (data) => {
    const { getSetting } = await import('../db')
    const mode = getSetting('search_mode') || 'vector'
    if (mode === 'like') {
      return ok(searchWorkLogs(data.keyword))
    }
    // 向量语义搜索，失败时回退到 LIKE
    try {
      const results = await vectorSearch.search(data.keyword, { type: 'worklog', topK: 20 })
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
          return ok(rows)
        }
      }
    } catch {
      // 向量搜索失败，回退到 LIKE
    }
    return ok(searchWorkLogs(data.keyword))
  })

  guardedQuery('worklog:categories', () => {
    return ok(getCategories())
  })

  guardedHandle('worklog:setCategory', WorklogSetCategorySchema, (data) => {
    updateWorkLogCategory(data.id, data.category)
    return ok(undefined)
  })

  guardedHandle('worklog:update', WorklogUpdateSchema, (data) => {
    const updated = updateWorkLog(data.id, data.content, data.category, data.created_at)
    // 更新后重新向量化
    if (updated) {
      vectorSearch.indexSingleWorklog(updated.id, updated.content).catch(() => {})
    }
    return ok(updated)
  })

  guardedHandle('worklog:delete', WorklogDeleteSchema, (data) => {
    return ok(deleteWorkLog(data.id))
  })

  guardedHandle('worklog:restore', WorklogRestoreSchema, (data) => {
    return ok(restoreWorkLog(data))
  })

  guardedHandle('stats:get', StatsGetSchema, (data) => {
    return ok(getStats(data.days))
  })
}
