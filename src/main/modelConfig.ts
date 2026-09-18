/**
 * 模型配置模块 — 全局唯一配置源
 *
 * 支持：
 * - 多个 Chat 模型配置（provider preset）
 * - Embedding 模型配置（含向量维度）
 * - 活跃 Chat 配置选择
 * - 供主进程和渲染进程调用
 *
 * 存储：model_configs 表（由 db.ts createTables 创建）
 */
import { getDatabase, getSetting, setSetting } from './db'

// ==================== 类型定义 ====================

/** 单个 Chat 模型配置 */
export interface ChatModelConfig {
  id: string
  name: string
  baseURL: string
  model: string
  /** API Key 单独加密存储，不进表 */
  token: string
  headers: string
  temperature: number
  max_tokens: number
  top_p: number
  top_k: number
  /** 系统提示词 */
  prompt: string
  /** 是否启用流式输出 */
  stream: boolean
}

/** Embedding 模型配置 */
export interface EmbeddingModelConfig {
  id: string
  name: string
  baseURL: string
  model: string
  /** 向量维度（如 1536, 384, 768 等） */
  dimension: number
  /** 自定义 Headers (JSON) */
  headers: string
  /** API Key（可选，不设则复用 Chat 的） */
  token: string
}

/** 全局模型配置（持久化到 model_configs 表） */
export interface GlobalModelConfig {
  /** 所有 Chat 模型配置 */
  chatConfigs: ChatModelConfig[]
  /** 当前选中的 Chat 配置 ID */
  activeChatConfigId: string
  /** 所有 Embedding 模型配置 */
  embeddingConfigs: EmbeddingModelConfig[]
  /** 当前选中的 Embedding 配置 ID */
  activeEmbeddingConfigId: string
}

// ==================== 默认值 ====================

const DEFAULT_CHAT_CONFIGS: ChatModelConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    token: '',
    headers: '',
    temperature: 0.7,
    max_tokens: 4096,
    top_p: 0.9,
    top_k: 50,
    prompt: '',
    stream: true,
  },
  {
    id: 'gitee',
    name: 'Gitee AI (Qwen3-8B)',
    baseURL: 'https://ai.gitee.com/v1',
    model: 'Qwen3-8B',
    token: '',
    headers: '{"X-Failover-Enabled":"true"}',
    temperature: 0.7,
    max_tokens: 2048,
    top_p: 0.7,
    top_k: 50,
    prompt: '',
    stream: true,
  },
]

const DEFAULT_EMBEDDING_CONFIGS: EmbeddingModelConfig[] = [
  {
    id: 'openai-embedding',
    name: 'OpenAI Embedding',
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small',
    dimension: 1536,
    headers: '',
    token: '',
  },
]

const DEFAULT_CONFIG: GlobalModelConfig = {
  chatConfigs: DEFAULT_CHAT_CONFIGS,
  activeChatConfigId: 'deepseek',
  embeddingConfigs: DEFAULT_EMBEDDING_CONFIGS,
  activeEmbeddingConfigId: 'openai-embedding',
}

// ==================== 加密 Token 管理 ====================

function saveToken(configId: string, token: string): void {
  if (!token) {
    deleteToken(configId)
    return
  }
  const { saveLLMToken } = require('./secureSettings')
  saveLLMToken(configId, token)
}

function loadToken(configId: string): string {
  const { getLLMToken } = require('./secureSettings')
  return getLLMToken(configId) || ''
}

function deleteToken(configId: string): void {
  const { deleteLLMToken } = require('./secureSettings')
  deleteLLMToken(configId)
}

// ==================== 行 ↔ 类型转换 ====================

interface ModelConfigRow {
  id: string
  config_type: string
  name: string
  base_url: string
  model_name: string
  temperature: number
  max_tokens: number
  top_p: number
  top_k: number
  prompt: string
  stream: number
  dimension: number
  headers: string
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToChatConfig(row: ModelConfigRow): ChatModelConfig {
  return {
    id: row.id,
    name: row.name,
    baseURL: row.base_url,
    model: row.model_name,
    token: loadToken(row.id),
    headers: row.headers,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    top_p: row.top_p,
    top_k: row.top_k,
    prompt: row.prompt,
    stream: row.stream === 1,
  }
}

function rowToEmbedConfig(row: ModelConfigRow): EmbeddingModelConfig {
  return {
    id: row.id,
    name: row.name,
    baseURL: row.base_url,
    model: row.model_name,
    dimension: row.dimension,
    headers: row.headers,
    token: loadToken(`emb_${row.id}`),
  }
}

// ==================== 核心读写 ====================

/** model_configs 表数据版本号，用于自动清理旧迁移脏数据 */
const MODEL_CONFIGS_VERSION = 2

/**
 * 获取完整模型配置（含 token 解密）
 */
export function getGlobalConfig(): GlobalModelConfig {
  const db = getDatabase()

  // 检查数据版本，清理旧迁移写入的脏数据
  const storedVersion = parseInt(getSetting('model_configs_version') || '0', 10)
  if (storedVersion < MODEL_CONFIGS_VERSION) {
    // 旧版本数据可能包含 localStorage 迁移的错误配置，清除后重建默认配置
    db.prepare('DELETE FROM model_configs').run()
    setGlobalConfig(DEFAULT_CONFIG)
    setSetting('model_configs_version', String(MODEL_CONFIGS_VERSION))
    return { ...DEFAULT_CONFIG }
  }

  // 检查表是否有数据
  const count = db.prepare('SELECT COUNT(*) as c FROM model_configs').get() as { c: number }
  if (count.c === 0) {
    // 表为空（首次启动或用户清空），写入默认配置并返回
    setGlobalConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }

  return readConfigFromTable()
}

/** 从 model_configs 表读取配置 */
function readConfigFromTable(): GlobalModelConfig {
  const db = getDatabase()

  const chatRows = db.prepare(
    "SELECT * FROM model_configs WHERE config_type = 'chat' ORDER BY sort_order"
  ).all() as ModelConfigRow[]

  const embedRows = db.prepare(
    "SELECT * FROM model_configs WHERE config_type = 'embedding' ORDER BY sort_order"
  ).all() as ModelConfigRow[]

  const activeChat = chatRows.find((r) => r.is_active)
  const activeEmbed = embedRows.find((r) => r.is_active)

  return {
    chatConfigs: chatRows.map(rowToChatConfig),
    activeChatConfigId: activeChat?.id || chatRows[0]?.id || '',
    embeddingConfigs: embedRows.map(rowToEmbedConfig),
    activeEmbeddingConfigId: activeEmbed?.id || embedRows[0]?.id || '',
  }
}

/**
 * 保存完整模型配置到 model_configs 表
 */
export function setGlobalConfig(config: GlobalModelConfig): void {
  const db = getDatabase()

  // 提取 token 分别加密存储
  for (const c of config.chatConfigs) {
    if (c.token !== undefined) {
      saveToken(c.id, c.token)
    }
  }
  for (const e of config.embeddingConfigs) {
    if (e.token !== undefined) {
      saveToken(`emb_${e.id}`, e.token)
    }
  }

  const tx = db.transaction(() => {
    // 清空旧数据
    db.prepare('DELETE FROM model_configs').run()

    const insertChat = db.prepare(`
      INSERT INTO model_configs
        (id, config_type, name, base_url, model_name, temperature, max_tokens,
         top_p, top_k, prompt, stream, dimension, headers, is_active, sort_order)
      VALUES (?, 'chat', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `)
    const insertEmbed = db.prepare(`
      INSERT INTO model_configs
        (id, config_type, name, base_url, model_name, dimension, headers, is_active, sort_order)
      VALUES (?, 'embedding', ?, ?, ?, ?, ?, ?, ?)
    `)

    let sortIndex = 0
    for (const c of config.chatConfigs) {
      insertChat.run(
        c.id, c.name, c.baseURL, c.model,
        c.temperature, c.max_tokens, c.top_p, c.top_k,
        c.prompt, c.stream ? 1 : 0, c.headers,
        c.id === config.activeChatConfigId ? 1 : 0, sortIndex++
      )
    }
    for (const e of config.embeddingConfigs) {
      insertEmbed.run(
        e.id, e.name, e.baseURL, e.model,
        e.dimension, e.headers,
        e.id === config.activeEmbeddingConfigId ? 1 : 0, sortIndex++
      )
    }
  })
  tx()
}

// ==================== 便捷方法 ====================

/** 获取当前活跃的 Chat 配置 */
export function getActiveChatConfig(): ChatModelConfig | undefined {
  const config = getGlobalConfig()
  return config.chatConfigs.find((c) => c.id === config.activeChatConfigId) || config.chatConfigs[0]
}

/** 获取 Embedding 配置列表 */
export function getEmbeddingConfigs(): EmbeddingModelConfig[] {
  return getGlobalConfig().embeddingConfigs
}

/** 设置活跃 Chat 配置 */
export function setActiveChatConfig(configId: string): void {
  const db = getDatabase()
  db.prepare("UPDATE model_configs SET is_active = 0 WHERE config_type = 'chat'").run()
  db.prepare("UPDATE model_configs SET is_active = 1 WHERE id = ? AND config_type = 'chat'").run(configId)
}

/** 删除 Chat 配置 */
export function deleteChatConfig(configId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM model_configs WHERE id = ?').run(configId)
  deleteToken(configId)

  // 如果删除的是活跃配置，自动切换到第一个
  const active = db.prepare(
    "SELECT id FROM model_configs WHERE config_type = 'chat' AND is_active = 1"
  ).get() as { id: string } | undefined
  if (!active) {
    const first = db.prepare(
      "SELECT id FROM model_configs WHERE config_type = 'chat' ORDER BY sort_order LIMIT 1"
    ).get() as { id: string } | undefined
    if (first) {
      db.prepare('UPDATE model_configs SET is_active = 1 WHERE id = ?').run(first.id)
    }
  }
}

// ==================== 供主进程直接使用 ====================

/**
 * 获取主进程用的 Chat 调用信息（Report / Stream）
 */
export function getActiveProviderInfo(): {
  baseURL: string; model: string; token: string; headers: Record<string, string>;
  temperature: number; max_tokens: number; top_p: number
} {
  const active = getActiveChatConfig()
  if (!active) {
    return { baseURL: '', model: '', token: '', headers: {}, temperature: 0.7, max_tokens: 4096, top_p: 0.9 }
  }
  let customHeaders: Record<string, string> = {}
  if (active.headers) { try { customHeaders = JSON.parse(active.headers) } catch { /* ignore */ } }
  return {
    baseURL: active.baseURL, model: active.model, token: active.token || loadToken(active.id),
    headers: customHeaders, temperature: active.temperature, max_tokens: active.max_tokens, top_p: active.top_p,
  }
}
