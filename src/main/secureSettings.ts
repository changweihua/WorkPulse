import { safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from './db'

const API_KEY_KEY = 'api_key'
const API_KEY_ENCRYPTED_KEY = 'api_key_encrypted'

export function getStoredApiKey(): string | null {
  const encrypted = getSetting(API_KEY_ENCRYPTED_KEY)
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      deleteSetting(API_KEY_KEY)
      return decrypted
    } catch {
      // Fall through to the legacy plaintext value if decryption fails.
    }
  }

  const plain = getSetting(API_KEY_KEY)
  if (plain && safeStorage.isEncryptionAvailable()) {
    try {
      setSetting(API_KEY_ENCRYPTED_KEY, safeStorage.encryptString(plain).toString('base64'))
      deleteSetting(API_KEY_KEY)
    } catch {
      // Keep using the legacy value if migration fails.
    }
  }

  return plain
}

export function setStoredApiKey(value: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    setSetting(API_KEY_ENCRYPTED_KEY, safeStorage.encryptString(value).toString('base64'))
    deleteSetting(API_KEY_KEY)
    return
  }

  setSetting(API_KEY_KEY, value)
}

export function deleteStoredApiKey(): void {
  deleteSetting(API_KEY_KEY)
  deleteSetting(API_KEY_ENCRYPTED_KEY)
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
