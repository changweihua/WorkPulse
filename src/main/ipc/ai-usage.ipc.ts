/**
 * IPC 领域：AI 使用统计
 * 迁移至 guardedHandle 模式
 */
import { guardedHandle, guardedQuery } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import {
  AiUsageLogSchema, AiUsageDateRangeSchema, AiUsageRecentSchema, AiUsageCleanupSchema,
} from '../ipc-schemas'
import {
  logAiUsage, getDailyStats, getModelStats, getTypeStats,
  getCostSummary, getUsageTrend, getRecentLogs,
  cleanupOldLogs, exportCsv,
} from '../aiUsage'

export function registerAiUsageIpc(): void {
  guardedHandle('ai-usage:log', AiUsageLogSchema, (data) => {
    logAiUsage(data)
    return ok(undefined)
  })

  guardedHandle('ai-usage:daily-stats', AiUsageDateRangeSchema, (data) => {
    return ok(getDailyStats(data.from, data.to))
  })

  guardedHandle('ai-usage:model-stats', AiUsageDateRangeSchema, (data) => {
    return ok(getModelStats(data.from, data.to))
  })

  guardedHandle('ai-usage:type-stats', AiUsageDateRangeSchema, (data) => {
    return ok(getTypeStats(data.from, data.to))
  })

  guardedHandle('ai-usage:cost-summary', AiUsageDateRangeSchema, (data) => {
    return ok(getCostSummary(data.from, data.to))
  })

  guardedHandle('ai-usage:trend', AiUsageDateRangeSchema, (data) => {
    return ok(getUsageTrend(data.from, data.to))
  })

  guardedHandle('ai-usage:recent', AiUsageRecentSchema, (data) => {
    return ok(getRecentLogs(data.limit || 50))
  })

  guardedHandle('ai-usage:cleanup', AiUsageCleanupSchema, (data) => {
    return ok(cleanupOldLogs(data.daysToKeep))
  })

  guardedHandle('ai-usage:export-csv', AiUsageDateRangeSchema, (data) => {
    return ok(exportCsv(data.from, data.to))
  })
}
