/**
 * 本地向量搜索服务
 *
 * - 调用全局 AI 配置的 Embedding API（OpenAI 兼容）
 * - 向量持久化到 SQLite worklog_vectors 表
 * - 内存余弦相似度搜索
 * - 每日 API 调用上限 100 次，超限回退 BM25
 */
import { app } from 'electron'
import log from 'electron-log/main'
import { getDatabase } from './db'

const DAILY_API_LIMIT_FALLBACK = 100

function getDailyApiLimit(): number {
  try {
    const { getActiveEmbeddingConfigs, getGlobalConfig } = require('./modelConfig') as {
      getActiveEmbeddingConfigs: () => Array<{ dailyLimit: number }>
      getGlobalConfig: () => { activeEmbeddingConfigId: string }
    }
    const config = getGlobalConfig()
    const active = config.embeddingConfigs.find((e: any) => e.id === config.activeEmbeddingConfigId)
    return active?.dailyLimit || DAILY_API_LIMIT_FALLBACK
  } catch {
    return DAILY_API_LIMIT_FALLBACK
  }
}

function getActiveEmbeddingModelId(): string {
  try {
    const { getGlobalConfig } = require('./modelConfig') as {
      getGlobalConfig: () => { activeEmbeddingConfigId: string }
    }
    return getGlobalConfig().activeEmbeddingConfigId || 'embedding'
  } catch {
    return 'embedding'
  }
}

export interface VectorSearchResult {
  uri: string
  score: number
  text: string
  metadata: Record<string, unknown>
}

export interface VectorStats {
  version: number
  items: number
  metadataConfig: Record<string, unknown>
}

// ==================== 向量表初始化 ====================

function ensureVectorTable(): void {
  const db = getDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS worklog_vectors (
      worklog_id INTEGER PRIMARY KEY,
      embedding TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS query_vectors (
      query_text TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `)
}

// ==================== 全局配置读取 ====================

interface EmbeddingConfig {
  baseURL: string
  model: string
  token: string
  dimension: number
  quotaGroup: string
}

function getActiveEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const { getGlobalConfig } = require('./modelConfig') as {
      getGlobalConfig: () => {
        embeddingConfigs: Array<{
          id: string
          name: string
          baseURL: string
          model: string
          token: string
          dimension: number
          headers: string
        }>
        activeEmbeddingConfigId: string
      }
    }
    const config = getGlobalConfig()
    const active = config.embeddingConfigs.find(e => e.id === config.activeEmbeddingConfigId)
    if (!active || !active.baseURL || !active.model) return null
    return {
      baseURL: active.baseURL,
      model: active.model,
      token: active.token,
      dimension: active.dimension,
      quotaGroup: (active as any).quotaGroup || '',
    }
  } catch {
    return null
  }
}

// ==================== 每日调用计数 ====================

function getEmbeddingQuotaGroup(): string {
  try {
    const { getGlobalConfig } = require('./modelConfig') as {
      getGlobalConfig: () => { embeddingConfigs: Array<{ id: string; quotaGroup?: string }>; activeEmbeddingConfigId: string }
    }
    const config = getGlobalConfig()
    const active = config.embeddingConfigs.find((e: any) => e.id === config.activeEmbeddingConfigId)
    return active?.quotaGroup || ''
  } catch { return '' }
}

function getDailyCallCount(): number {
  try {
    const { getDailyCallCount: getDC } = require('./modelConfig') as { getDailyCallCount: (id: string, group: string) => number }
    const activeId = getGlobalConfig().activeEmbeddingConfigId || 'embedding'
    return getDC(activeId, getEmbeddingQuotaGroup())
  } catch { return 0 }
}

function incrementDailyCallCount(): number {
  try {
    const { incrementDailyCallCount: incDC, getDailyCallCount: getDC } = require('./modelConfig') as {
      incrementDailyCallCount: (id: string, group: string) => void
      getDailyCallCount: (id: string, group: string) => number
    }
    const activeId = getGlobalConfig().activeEmbeddingConfigId || 'embedding'
    const group = getEmbeddingQuotaGroup()
    incDC(activeId, group)
    return getDC(activeId, group)
  } catch { return 0 }
}

function isOverDailyLimit(): boolean {
  return getDailyCallCount() >= getDailyApiLimit()
}

// ==================== Embedding API 调用 ====================

async function callEmbeddingAPI(texts: string[]): Promise<number[][]> {
  const config = getActiveEmbeddingConfig()
  if (!config) throw new Error('未配置 Embedding 模型')

  const url = `${config.baseURL.replace(/\/$/, '')}/embeddings`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`
  }

  log.info(`[VectorSearch] 调用 Embedding API: ${url}`)
  log.info(`[VectorSearch] 模型: ${config.model}, 文本数: ${texts.length}`)

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Embedding API 错误 ${resp.status}: ${body}`)
  }

  const data = (await resp.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }

  // 按 index 排序确保顺序正确
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map(d => d.embedding)
}

async function getEmbedding(text: string): Promise<number[]> {
  const results = await callEmbeddingAPI([text])
  return results[0]
}

// ==================== 内容哈希（检测变更） ====================

function contentHash(content: string): string {
  // 简单哈希：长度 + 前后各 50 字符 + 全文长度
  const start = content.slice(0, 50)
  const end = content.slice(-50)
  return `${content.length}-${start}-${end}`
}

// ==================== 余弦相似度 ====================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ==================== 主服务 ====================

class VectorSearchService {
  private initialized = false

  initialize(): void {
    if (this.initialized) return
    ensureVectorTable()
    this.initialized = true
    log.info('[VectorSearch] 初始化完成')
  }

  /**
   * 增量向量化：只处理 vector_synced_at IS NULL 的 worklog 记录
   */
  async autoIndexAll(): Promise<{ indexed: number; errors: number; skipped: number }> {
    this.initialize()

    const { getUnindexedWorkLogs, markWorkLogsIndexed } = await import('./db')
    const unindexed = getUnindexedWorkLogs()

    if (unindexed.length === 0) {
      log.info('[VectorSearch] 所有 worklog 已向量化，无需更新')
      return { indexed: 0, errors: 0, skipped: 0 }
    }

    if (isOverDailyLimit()) {
      log.warn(`[VectorSearch] 已达每日 API 限制 (${getDailyApiLimit()})，跳过向量化，等待明天`)
      return { indexed: 0, errors: 0, skipped: unindexed.length }
    }

    const remaining = getDailyApiLimit() - getDailyCallCount()
    // 过滤掉内容未变更的（已有向量且 hash 一致）
    const db = getDatabase()
    const existingHashes = db.prepare('SELECT worklog_id, content_hash FROM worklog_vectors').all() as Array<{
      worklog_id: number
      content_hash: string
    }>
    const hashMap = new Map(existingHashes.map(r => [r.worklog_id, r.content_hash]))

    const needVectorize = unindexed.filter(wl => {
      const existing = hashMap.get(wl.id)
      if (existing && existing === contentHash(wl.content)) {
        return false // 内容未变，跳过
      }
      return true
    })

    const toProcess = needVectorize.slice(0, remaining)
    const skipped = needVectorize.length - toProcess.length

    if (skipped > 0) {
      log.warn(`[VectorSearch] 每日限制还剩 ${remaining} 次，将跳过 ${skipped} 条`)
    }

    log.info(`[VectorSearch] 发现 ${toProcess.length} 条待向量化 worklog（剩余 API 额度: ${remaining}）`)

    let indexed = 0
    let errors = 0
    const syncedIds: number[] = []

    // 批量处理，每批 10 条（减少 API 调用次数）
    const BATCH_SIZE = 10
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      if (isOverDailyLimit()) {
        log.warn('[VectorSearch] 向量化过程中达到每日限制，停止')
        break
      }

      const batch = toProcess.slice(i, i + BATCH_SIZE)
      try {
        const texts = batch.map(wl => wl.content)
        const embeddings = await callEmbeddingAPI(texts)
        incrementDailyCallCount() // 每批算 1 次调用

        const insert = db.prepare(
          'INSERT OR REPLACE INTO worklog_vectors (worklog_id, embedding, content_hash) VALUES (?, ?, ?)'
        )
        const tx = db.transaction(() => {
          for (let j = 0; j < batch.length; j++) {
            const wl = batch[j]
            const hash = contentHash(wl.content)
            insert.run(wl.id, JSON.stringify(embeddings[j]), hash)
            syncedIds.push(wl.id)
          }
        })
        tx()
        indexed += batch.length
      } catch (e) {
        log.error(`[VectorSearch] 批量向量化失败 (batch ${i / BATCH_SIZE + 1}):`, e)
        errors += batch.length
      }
    }

    // 只标记实际成功向量化的，跳过的保持 NULL 下次再试
    markWorkLogsIndexed(syncedIds)

    // 内容未变的也标记一下（它们已有向量，不需要再处理）
    const unchangedIds = unindexed
      .filter(wl => {
        const existing = hashMap.get(wl.id)
        return existing && existing === contentHash(wl.content)
      })
      .map(wl => wl.id)
    if (unchangedIds.length > 0) {
      markWorkLogsIndexed(unchangedIds)
    }

    log.info(`[VectorSearch] 增量向量化完成: ${indexed} 成功, ${errors} 失败, ${unchangedIds.length} 内容未变`)
    return { indexed, errors, skipped }
  }

  /**
   * 搜索：先尝试向量语义搜索，超限则回退 BM25
   */
  async search(
    query: string,
    options?: { type?: string; topK?: number }
  ): Promise<VectorSearchResult[]> {
    this.initialize()

    const db = getDatabase()

    // 先检查查询缓存
    const cachedRow = db.prepare('SELECT embedding FROM query_vectors WHERE query_text = ?').get(query) as
      | { embedding: string }
      | undefined

    let queryEmbedding: number[]

    if (cachedRow) {
      // 命中缓存，不消耗 API 调用
      queryEmbedding = JSON.parse(cachedRow.embedding)
      log.debug(`[VectorSearch] 查询缓存命中: "${query}"`)
    } else {
      // 超限则回退
      if (isOverDailyLimit()) {
        log.debug('[VectorSearch] 每日限制已满，回退到 BM25')
        return []
      }
      try {
        queryEmbedding = await getEmbedding(query)
        incrementDailyCallCount()
        // 存入缓存
        db.prepare('INSERT OR IGNORE INTO query_vectors (query_text, embedding) VALUES (?, ?)').run(
          query,
          JSON.stringify(queryEmbedding)
        )
      } catch (e) {
        log.warn('[VectorSearch] 查询向量化失败:', e)
        return []
      }
    }

    const rows = db.prepare('SELECT worklog_id, embedding FROM worklog_vectors').all() as Array<{
      worklog_id: number
      embedding: string
    }>

    if (rows.length === 0) return []

    // 计算相似度并排序，过滤低于阈值的结果
    const MIN_SCORE = 0.3
    const scored = rows
      .map(row => {
        const vec = JSON.parse(row.embedding) as number[]
        return {
          worklog_id: row.worklog_id,
          score: cosineSimilarity(queryEmbedding, vec),
        }
      })
      .filter(s => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.topK ?? 10)

    // 加载完整 worklog 数据
    const ids = scored.map(s => s.worklog_id)
    const placeholders = ids.map(() => '?').join(',')
    const worklogs = db.prepare(
      `SELECT wl.*, t.due_date AS task_due_date
       FROM work_logs wl
       LEFT JOIN tasks t ON wl.task_id = t.id
       WHERE wl.id IN (${placeholders})`
    ).all(...ids) as Array<{
      id: number
      content: string
      category: string
      created_at: string
      task_id: number | null
      task_due_date: string | null
    }>

    const worklogMap = new Map(worklogs.map(w => [w.id, w]))

    return scored.map(s => {
      const wl = worklogMap.get(s.worklog_id)
      return {
        uri: `worklog://${s.worklog_id}`,
        score: s.score,
        text: wl?.content ?? '',
        metadata: {
          type: 'worklog',
          id: String(s.worklog_id),
          category: wl?.category ?? '',
          date: wl?.created_at ?? '',
        },
      }
    })
  }

  /**
   * 获取统计信息
   */
  getStats(): VectorStats {
    this.initialize()
    const db = getDatabase()
    const count = db.prepare('SELECT COUNT(*) as cnt FROM worklog_vectors').get() as { cnt: number }
    const dailyUsed = getDailyCallCount()
    return {
      version: 1,
      items: count.cnt,
      metadataConfig: { dailyApiUsed: dailyUsed, dailyApiLimit: getDailyApiLimit() },
    }
  }

  /**
   * 单条 worklog 增量向量化（新增/更新时即时调用）
   */
  async indexSingleWorklog(id: number, content: string): Promise<boolean> {
    this.initialize()

    if (isOverDailyLimit()) {
      log.debug(`[VectorSearch] 每日限制已满，跳过 worklog #${id} 向量化`)
      return false
    }

    const config = getActiveEmbeddingConfig()
    if (!config) {
      log.debug('[VectorSearch] 未配置 Embedding 模型，跳过向量化')
      return false
    }

    const db = getDatabase()
    const hash = contentHash(content)

    // 检查是否已有相同内容的向量
    const existing = db.prepare('SELECT content_hash FROM worklog_vectors WHERE worklog_id = ?').get(id) as
      | { content_hash: string }
      | undefined
    if (existing && existing.content_hash === hash) {
      return true // 内容未变，跳过
    }

    try {
      const embedding = await getEmbedding(content)
      incrementDailyCallCount()

      db.prepare(
        'INSERT OR REPLACE INTO worklog_vectors (worklog_id, embedding, content_hash) VALUES (?, ?, ?)'
      ).run(id, JSON.stringify(embedding), hash)

      // 标记已向量化
      db.prepare("UPDATE work_logs SET vector_synced_at = datetime('now', 'localtime') WHERE id = ?").run(id)

      log.info(`[VectorSearch] worklog #${id} 向量化完成`)
      return true
    } catch (e) {
      log.warn(`[VectorSearch] worklog #${id} 向量化失败:`, e)
      return false
    }
  }

  /**
   * 清空向量索引
   */
  rebuildIndex(): void {
    this.initialize()
    const db = getDatabase()
    db.exec('DELETE FROM worklog_vectors')
    // 重置所有 worklog 的同步标记
    db.exec("UPDATE work_logs SET vector_synced_at = NULL")
    log.info('[VectorSearch] 向量索引已重建')
  }
}

export const vectorSearch = new VectorSearchService()
