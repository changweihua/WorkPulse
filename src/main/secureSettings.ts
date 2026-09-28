import { safeStorage } from 'electron';
// oxlint-disable-next-line import/no-cycle -- 有意保留的静态环：db 仅在函数体内被读取
import { deleteSetting, getSetting, setSetting } from './db';
// 静态引入 modelConfig 的缓存失效钩子。
// 此前用运行时 require('./modelConfig') 规避 modelConfig ↔ secureSettings 循环依赖，
// 但打包产物是单文件 bundle，裸 require 不会被 rolldown 改写，运行时必然
// Cannot find module './modelConfig'。
// 静态环在打包后是安全的：本模块只在 save/deleteLLMToken 函数体内调用失效钩子，
// 不在模块初始化阶段访问 modelConfig；而 invalidateGlobalConfigCache 是 function
// 声明，会被提升，即便两个模块初始化顺序互换也拿得到。
// 失效钩子语义保持不变：任何 token 写入都必须让 modelConfig 的全局配置缓存失效——
// token 是 GlobalModelConfig 的组成部分（loadToken 参与 config 构建），且
// settings.ipc.ts 的 llm-tokens:save/delete IPC 绕过 modelConfig.saveToken 直连本模块，
// 所以钩子必须留在本模块的 save/delete 内部，不能只挂在 saveToken 上。
// oxlint-disable-next-line import/no-cycle -- 有意保留的静态环：钩子仅在 save/delete 函数体内调用
import { invalidateGlobalConfigCache } from './modelConfig';

export function saveLLMToken(modelId: string, token: string): void {
  if (safeStorage.isEncryptionAvailable() && token) {
    setSetting(`llm_token_${modelId}`, safeStorage.encryptString(token).toString('base64'));
  } else if (token) {
    // Fallback: store plaintext when encryption unavailable (e.g. Linux without keyring)
    setSetting(`llm_token_${modelId}`, token);
  } else {
    deleteSetting(`llm_token_${modelId}`);
  }
  // 先写 DB、后失效缓存（三个分支均覆盖）
  invalidateGlobalConfigCache();
}

export function getLLMToken(modelId: string): string | null {
  const encrypted = getSetting(`llm_token_${modelId}`);
  if (!encrypted) return null;
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      // Might be plaintext from fallback — return as-is
      return encrypted;
    }
  }
  return encrypted;
}

export function deleteLLMToken(modelId: string): void {
  deleteSetting(`llm_token_${modelId}`);
  // 先删 DB、后失效缓存
  invalidateGlobalConfigCache();
}
