import { safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from './db'

export function saveLLMToken(modelId: string, token: string): void {
  if (safeStorage.isEncryptionAvailable() && token) {
    setSetting(`llm_token_${modelId}`, safeStorage.encryptString(token).toString('base64'))
  } else if (token) {
    // Fallback: store plaintext when encryption unavailable (e.g. Linux without keyring)
    setSetting(`llm_token_${modelId}`, token)
  } else {
    deleteSetting(`llm_token_${modelId}`)
  }
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
}
