/**
 * 模型配置模块 — 全局唯一配置源
 *
 * 支持：
 * - 多个 Chat 模型配置（provider preset）
 * - Embedding 模型配置（含向量维度）
 * - 活跃 Chat 配置选择
 * - 供主进程和渲染进程调用
 */
import { getSetting, setSetting } from './db'

// ==================== 类型定义 ====================

/** 单个 Chat 模型配置 */
export interface ChatModelConfig {
  id: string
  name: string
  baseURL: string
  model: string
  /** API Key 单独加密存储，不进 JSON */
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

/** 全局模型配置（持久化到 settings） */
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
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small',
    dimension: 1536,
    token: '',
  },
]

const DEFAULT_CONFIG: GlobalModelConfig = {
  chatConfigs: DEFAULT_CHAT_CONFIGS,
  activeChatConfigId: 'deepseek',
  embeddingConfigs: DEFAULT_EMBEDDING_CONFIGS,
  activeEmbeddingConfigId: 'openai-embedding',
}

// ==================== 持久化键名 ====================

const STORAGE_KEY = 'model_config'

// ==================== 加密 Token 管理 ====================

const TOKEN_PREFIX = 'llm_token_'

function saveToken(configId: string, token: string): void {
  if (!token) {
    deleteToken(configId)
    return
  }
  // 使用已有的 saveLLMToken（带 safeStorage 加密）
  try {
    const { saveLLMToken } = require('./secureSettings')
    saveLLMToken(configId, token)
  } catch {
    // fallback: 直接存 settings
    setSetting(`${TOKEN_PREFIX}${configId}`, token)
  }
}

function loadToken(configId: string): string {
  try {
    const { getLLMToken } = require('./secureSettings')
    return getLLMToken(configId) || ''
  } catch {
    return getSetting(`${TOKEN_PREFIX}${configId}`) || ''
  }
}

function deleteToken(configId: string): void {
  try {
    const { deleteLLMToken } = require('./secureSettings')
    deleteLLMToken(configId)
  } catch {
    setSetting(`${TOKEN_PREFIX}${configId}`, '')
  }
}

// ==================== 核心读写 ====================

/**
 * 获取完整模型配置（含 token 解密）
 */
export function getGlobalConfig(): GlobalModelConfig {
  const raw = getSetting(STORAGE_KEY)
  let config: GlobalModelConfig

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      // 兼容旧格式：embedding(单个) → embeddingConfigs(数组)
      if (!parsed.embeddingConfigs && parsed.embedding) {
        const emb = { id: 'migrated-embedding', name: 'Embedding（旧配置）', ...parsed.embedding }
        parsed.embeddingConfigs = [emb]
        parsed.activeEmbeddingConfigId = emb.id
      }
      config = { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      config = { ...DEFAULT_CONFIG }
    }
  } else {
    // 兼容旧配置：从扁平 settings 迁移
    config = migrateFromFlatSettings()
  }

  // 确保数组存在且过滤无效元素
  if (!config.chatConfigs) config.chatConfigs = []
  if (!config.embeddingConfigs) config.embeddingConfigs = []
  config.chatConfigs = config.chatConfigs.filter((c) => c && c.id)
  config.embeddingConfigs = config.embeddingConfigs.filter((e) => e && e.id)

  // 解密 token 到每个配置（JSON 中 token 为空，需要从加密存储恢复）
  config.chatConfigs = config.chatConfigs.map((c) => ({
    ...c,
    token: loadToken(c.id),
  }))
  config.embeddingConfigs = config.embeddingConfigs.map((e) => ({
    ...e,
    token: loadToken(`emb_${e.id}`),
  }))

  return config
}

/**
 * 保存完整模型配置
 */
export function setGlobalConfig(config: GlobalModelConfig): void {
  // 提取 token 分别加密存储，JSON 中不保存明文
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

  // 保存不含 token 的 JSON
  const toStore: GlobalModelConfig = {
    ...config,
    chatConfigs: config.chatConfigs.map((c) => ({ ...c, token: '' })),
    embeddingConfigs: config.embeddingConfigs.map((e) => ({ ...e, token: '' })),
  }
  setSetting(STORAGE_KEY, JSON.stringify(toStore))
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
  const config = getGlobalConfig()
  config.activeChatConfigId = configId
  setGlobalConfig(config)
}

/** 删除 Chat 配置 */
export function deleteChatConfig(configId: string): void {
  const config = getGlobalConfig()
  config.chatConfigs = config.chatConfigs.filter((c) => c.id !== configId)
  if (config.activeChatConfigId === configId) {
    config.activeChatConfigId = config.chatConfigs[0]?.id || ''
  }
  deleteToken(configId)
  setGlobalConfig(config)
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
