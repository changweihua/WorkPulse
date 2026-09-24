import { safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from './db'

/**
 * 使 modelConfig 的模块级配置缓存失效。
 *
 * token 是 GlobalModelConfig 的组成部分（loadToken 参与 config 构建），任何
 * token 写入都必须让整个 config 缓存失效。失效钩子必须放在本模块内部——
 * settings.ipc.ts 的 llm-tokens:save/delete IPC 绕过 modelConfig.saveToken
 * 直连这里的 save/delete，只挂在 saveToken 上会漏掉该路径。
 *
 * 采用运行时 require 懒加载，避免 modelConfig ↔ secureSettings 循环依赖。
 */
function invalidateGlobalConfigCache(): void {
  const mod = require('./modelConfig') as {
    invalidateGlobalConfigCache: () => void
  }
  mod.invalidateGlobalConfigCache()
}

export function saveLLMToken(modelId: string, token: string): void {
  if (safeStorage.isEncryptionAvailable() && token) {
    setSetting(`llm_token_${modelId}`, safeStorage.encryptString(token).toString('base64'))
  } else if (token) {
    // Fallback: store plaintext when encryption unavailable (e.g. Linux without keyring)
    setSetting(`llm_token_${modelId}`, token)
  } else {
    deleteSetting(`llm_token_${modelId}`)
  }
  // 先写 DB、后失效缓存（三个分支均覆盖）
  invalidateGlobalConfigCache()
}

export function getLLMToken(modelId: string): string | null {
  const encrypted = getSetting(`llm_token_${modelId}`)
  if (!encrypted) return null
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      // Might be plaintext from fallback — return as-is
      return encrypted
    }
  }
  return encrypted
}

export function deleteLLMToken(modelId: string): void {
  deleteSetting(`llm_token_${modelId}`)
  // 先删 DB、后失效缓存
  invalidateGlobalConfigCache()
}
