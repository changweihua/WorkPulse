/**
 * AI 使用统计服务 — 追踪调用次数、token 用量和费用
 *
 * 存储：ai_usage_logs 表（由 db.ts createTables 创建）
 */
import { getDatabase } from './db'

// ==================== 类型定义 ====================

export interface AiUsageRecord {
  model_id: string
  model_name: string
  provider?: string
  usage_type: 'chat' | 'report' | 'ocr' | 'onnx'
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_usd?: number
  latency_ms?: number
  success?: boolean
  error_msg?: string
}

export interface DailyStats {
  date: string
  call_count: number
  total_tokens: number
  total_cost: number
  avg_latency: number
}

export interface ModelStats {
  model_id: string
  model_name: string
  call_count: number
  total_tokens: number
  total_cost: number
}

export interface TypeStats {
  usage_type: string
  call_count: number
  total_tokens: number
  total_cost: number
}

export interface CostSummary {
  total_cost: number
  total_calls: number
  total_tokens: number
  by_model: ModelStats[]
}

export interface TrendData {
  date: string
  model_id: string
  model_name: string
  tokens: number
  cost: number
  calls: number
}

export interface AiUsageLogRow {
  id: number
  model_id: string
  model_name: string
  provider: string
  usage_type: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  latency_ms: number
  success: number
  error_msg: string | null
  created_at: string
}

// ==================== 价格表（USD per 1M tokens） ====================

const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-chat':       { input: 0.14,  output: 0.28 },
  'deepseek-reasoner':   { input: 0.55,  output: 2.19 },
  'gpt-4o':              { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':         { input: 0.15,  output: 0.60 },
  'claude-3-5-sonnet':   { input: 3.00,  output: 15.00 },
  'claude-sonnet-4':     { input: 3.00,  output: 15.00 },
  'glm-4':               { input: 0.70,  output: 0.70 },
  'moonshot-v1-8k':      { input: 0.12,  output: 0.12 },
  'qwen-max':            { input: 0.40,  output: 1.20 },
}

// ==================== 费用计算 ====================

function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const price = TOKEN_PRICES[modelName]
  if (!price) return 0
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

// ==================== 核心读写 ====================

/**
 * 记录一条 AI 使用日志
 */
export function logAiUsage(record: AiUsageRecord): void {
  const db = getDatabase()
  const inputTokens = record.input_tokens || 0
  const outputTokens = record.output_tokens || 0
  const totalTokens = record.total_tokens || inputTokens + outputTokens
  const costUsd = record.cost_usd ?? calculateCost(record.model_name, inputTokens, outputTokens)

  db.prepare(`
    INSERT INTO ai_usage_logs
      (model_id, model_name, provider, usage_type, input_tokens, output_tokens, total_tokens, cost_usd, latency_ms, success, error_msg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.model_id,
    record.model_name,
    record.provider || '',
    record.usage_type,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    record.latency_ms || 0,
    record.success !== false ? 1 : 0,
    record.error_msg || null,
  )
}

/**
 * 按日聚合统计
 */
export function getDailyStats(from: string, to: string): DailyStats[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT
      date(created_at) as date,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `).all(from, to) as DailyStats[]
}

/**
 * 按模型聚合统计
 */
export function getModelStats(from: string, to: string): ModelStats[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT
      model_id,
      model_name,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY model_id
    ORDER BY call_count DESC
  `).all(from, to) as ModelStats[]
}

/**
 * 按用途聚合统计
 */
export function getTypeStats(from: string, to: string): TypeStats[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT
      usage_type,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY usage_type
    ORDER BY call_count DESC
  `).all(from, to) as TypeStats[]
}

/**
 * 费用汇总
 */
export function getCostSummary(from: string, to: string): CostSummary {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as total_calls,
      COALESCE(SUM(total_tokens), 0) as total_tokens
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
  `).get(from, to) as { total_cost: number; total_calls: number; total_tokens: number }

  return {
    ...row,
    by_model: getModelStats(from, to),
  }
}

/**
 * 趋势数据（按日×模型）
 */
export function getUsageTrend(from: string, to: string): TrendData[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT
      date(created_at) as date,
      model_id,
      model_name,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(cost_usd), 0) as cost,
      COUNT(*) as calls
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at), model_id
    ORDER BY date(created_at), model_id
  `).all(from, to) as TrendData[]
}

/**
 * 最近调用记录
 */
export function getRecentLogs(limit: number): AiUsageLogRow[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT * FROM ai_usage_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as AiUsageLogRow[]
}

/**
 * 清理旧数据，返回删除行数
 */
export function cleanupOldLogs(daysToKeep: number): number {
  const db = getDatabase()
  const result = db.prepare(`
    DELETE FROM ai_usage_logs
    WHERE created_at < datetime('now', 'localtime', '-' || ? || ' days')
  `).run(daysToKeep)
  return result.changes
}

/**
 * 导出 CSV
 */
export function exportCsv(from: string, to: string): string {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT * FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ? AND ?
    ORDER BY created_at DESC
  `).all(from, to) as AiUsageLogRow[]

  const header = 'id,model_id,model_name,provider,usage_type,input_tokens,output_tokens,total_tokens,cost_usd,latency_ms,success,error_msg,created_at'
  const lines = rows.map(r =>
    `${r.id},${r.model_id},${r.model_name},${r.provider},${r.usage_type},${r.input_tokens},${r.output_tokens},${r.total_tokens},${r.cost_usd.toFixed(6)},${r.latency_ms},${r.success},"${(r.error_msg || '').replace(/"/g, '""')}",${r.created_at}`
  )
  return [header, ...lines].join('\n')
}
