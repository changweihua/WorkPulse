/**
 * AI 使用统计服务 — 追踪调用次数、token 用量和费用
 *
 * 存储：ai_usage_logs 表（由 db.ts createTables 创建）
 * 写入使用 Drizzle ORM 类型安全插入，聚合查询使用 Drizzle sql 模板原始 SQL
 */
import { getDrizzleDb, aiUsageLogs } from './db';
import { sql } from 'drizzle-orm';

// ==================== 类型定义 ====================

export interface AiUsageRecord {
  model_id: string;
  model_name: string;
  provider?: string;
  usage_type: 'chat' | 'report' | 'ocr' | 'onnx' | 'embedding';
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  success?: boolean;
  error_msg?: string;
}

export interface DailyStats {
  date: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
  avg_latency: number;
}

export interface ModelStats {
  model_id: string;
  model_name: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}

export interface TypeStats {
  usage_type: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}

export interface CostSummary {
  total_cost: number;
  total_calls: number;
  total_tokens: number;
  by_model: ModelStats[];
}

export interface TrendData {
  date: string;
  model_id: string;
  model_name: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface AiUsageLogRow {
  id: number;
  model_id: string;
  model_name: string;
  provider: string;
  usage_type: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  success: number;
  error_msg: string | null;
  created_at: string;
}

// ==================== 价格表（USD per 1M tokens） ====================

const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'glm-4': { input: 0.7, output: 0.7 },
  'moonshot-v1-8k': { input: 0.12, output: 0.12 },
  'qwen-max': { input: 0.4, output: 1.2 },
};

// ==================== 费用计算 ====================

function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const price = TOKEN_PRICES[modelName];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// ==================== 辅助函数 ====================

/** 格式化为 SQLite datetime('now', 'localtime') 格式：YYYY-MM-DD HH:MM:SS */
function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ==================== 核心读写 ====================

/**
 * 记录一条 AI 使用日志
 */
export function logAiUsage(record: AiUsageRecord): void {
  const db = getDrizzleDb();
  const inputTokens = record.input_tokens || 0;
  const outputTokens = record.output_tokens || 0;
  const totalTokens = record.total_tokens || inputTokens + outputTokens;
  const costUsd = record.cost_usd ?? calculateCost(record.model_name, inputTokens, outputTokens);

  db.insert(aiUsageLogs)
    .values({
      modelId: record.model_id,
      modelName: record.model_name,
      provider: record.provider || '',
      usageType: record.usage_type,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      latencyMs: record.latency_ms || 0,
      success: record.success !== false ? 1 : 0,
      errorMsg: record.error_msg || null,
      createdAt: nowLocal(),
    })
    .run();
}

/**
 * 按日聚合统计
 */
export function getDailyStats(from: string, to: string): DailyStats[] {
  const db = getDrizzleDb();
  return db.all(sql`
    SELECT
      date(created_at) as date,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
      AND usage_type != 'embedding'
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `) as DailyStats[];
}

/**
 * 按模型聚合统计
 */
export function getModelStats(from: string, to: string): ModelStats[] {
  const db = getDrizzleDb();
  return db.all(sql`
    SELECT
      model_id,
      model_name,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
    GROUP BY model_id
    ORDER BY call_count DESC
  `) as ModelStats[];
}

/**
 * 按用途聚合统计
 */
export function getTypeStats(from: string, to: string): TypeStats[] {
  const db = getDrizzleDb();
  return db.all(sql`
    SELECT
      usage_type,
      COUNT(*) as call_count,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
    GROUP BY usage_type
    ORDER BY call_count DESC
  `) as TypeStats[];
}

/**
 * 费用汇总
 */
export function getCostSummary(from: string, to: string): CostSummary {
  const db = getDrizzleDb();
  const row = db.get(sql`
    SELECT
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as total_calls,
      COALESCE(SUM(total_tokens), 0) as total_tokens
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
  `) as { total_cost: number; total_calls: number; total_tokens: number };

  return {
    ...row,
    by_model: getModelStats(from, to),
  };
}

/**
 * 趋势数据（按日×模型）
 */
export function getUsageTrend(from: string, to: string): TrendData[] {
  const db = getDrizzleDb();
  return db.all(sql`
    SELECT
      date(created_at) as date,
      model_id,
      model_name,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(cost_usd), 0) as cost,
      COUNT(*) as calls
    FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
      AND usage_type != 'embedding'
    GROUP BY date(created_at), model_id
    ORDER BY date(created_at), model_id
  `) as TrendData[];
}

/**
 * 最近调用记录
 */
export function getRecentLogs(limit: number): AiUsageLogRow[] {
  const db = getDrizzleDb();
  return db.all(sql`
    SELECT * FROM ai_usage_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as AiUsageLogRow[];
}

/**
 * 清理旧数据，返回删除行数
 */
export function cleanupOldLogs(daysToKeep: number): number {
  const db = getDrizzleDb();
  const result = db.run(sql`
    DELETE FROM ai_usage_logs
    WHERE created_at < datetime('now', 'localtime', '-' || ${daysToKeep} || ' days')
  `);
  return result.changes;
}

/**
 * 导出 CSV
 */
export function exportCsv(from: string, to: string): string {
  const db = getDrizzleDb();
  const rows = db.all(sql`
    SELECT * FROM ai_usage_logs
    WHERE date(created_at) BETWEEN ${from} AND ${to}
    ORDER BY created_at DESC
  `) as AiUsageLogRow[];

  const header =
    'id,model_id,model_name,provider,usage_type,input_tokens,output_tokens,total_tokens,cost_usd,latency_ms,success,error_msg,created_at';
  const lines = rows.map(
    (r) =>
      `${r.id},${r.model_id},${r.model_name},${r.provider},${r.usage_type},${r.input_tokens},${r.output_tokens},${r.total_tokens},${r.cost_usd.toFixed(6)},${r.latency_ms},${r.success},"${(r.error_msg || '').replace(/"/g, '""')}",${r.created_at}`,
  );
  return [header, ...lines].join('\n');
}
