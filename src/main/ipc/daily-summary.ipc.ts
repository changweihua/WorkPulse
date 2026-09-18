/**
 * IPC 领域：每日工作摘要弹窗
 * 迁移至 guardedHandle 模式
 */
import { guardedHandle } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import { getStats } from '../db'
import { DailySummarySchema } from '../ipc-schemas'

export function registerDailySummaryIpc(): void {
  guardedHandle('daily-summary:get', DailySummarySchema, (data) => {
    const stats = getStats(data.days)
    return ok(stats)
  })
}
