/**
 * IPC 统一 Result 类型
 * 所有 ipcMain.handle 返回此类型，渲染端统一判断 ok/error
 */
import type { z } from 'zod'

// ─── Result Types ────────────────────────────────────────────────────────────

/** IPC 统一返回结果 */
export type IpcResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: IpcError }

/** 结构化错误 */
export type IpcError =
  | { code: 'SENDER_INVALID'; message: string }
  | { code: 'VALIDATION_FAILED'; message: string; issues: z.ZodIssue[] }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'PERMISSION_DENIED'; message: string }
  | { code: 'BUSINESS_ERROR'; message: string }
  | { code: 'UNKNOWN'; message: string }

// ─── Constructors ────────────────────────────────────────────────────────────

/** 构造成功结果 */
export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

/** 构造失败结果 */
export function fail(
  code: IpcError['code'],
  message: string,
  issues?: z.ZodIssue[]
): IpcResult {
  return { ok: false, error: { code, message, ...(issues ? { issues } : {}) } as IpcError }
}

// ─── Renderer Helper ─────────────────────────────────────────────────────────

/**
 * 安全调用 IPC，自动 unwrap Result
 * 失败时抛出带 code 的错误，方便上层 try/catch 统一处理
 *
 * @example
 * try {
 *   const logs = await invoke(window.api.worklog.list())
 * } catch (e) {
 *   if (e.code === 'VALIDATION_FAILED') { ... }
 * }
 */
export async function invoke<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  const err = new Error(result.error.message)
  ;(err as Error & { code: string }).code = result.error.code
  throw err
}
