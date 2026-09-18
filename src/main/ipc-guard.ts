/**
 * IPC 安全守卫 + 声明式 handler 注册器
 *
 * 职责：
 * 1. assertValidSender — 校验调用方是否为合法本地窗口
 * 2. guardedHandle — sender 校验 + schema 校验 + try/catch → IpcResult
 * 3. guardedQuery — 无入参查询的快捷注册（仅 sender + try/catch）
 */
import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import log from 'electron-log/main'
import { ok, fail, type IpcResult } from '../shared/ipc-result'

// ─── Sender 校验 ─────────────────────────────────────────────────────────────

/**
 * 校验 IPC invoke 事件发送方是否为合法的本地窗口。
 * 返回 true 表示通过，false 表示拒绝。
 */
export function assertValidSender(event: IpcMainInvokeEvent, channel: string): boolean {
  const sender = event.sender
  if (sender.isDestroyed()) {
    log.warn(`[IPC Guard] 🚫 ${channel}: sender 已销毁`)
    return false
  }

  const win = BrowserWindow.fromWebContents(sender)
  if (!win || win.isDestroyed()) {
    log.warn(`[IPC Guard] 🚫 ${channel}: sender 不属于任何窗口`)
    return false
  }

  const url = sender.getURL()
  const isLocal =
    url.startsWith('file:') ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:')
  if (!isLocal) {
    log.warn(`[IPC Guard] 🚫 ${channel}: sender URL 非本地: ${url}`)
    return false
  }

  return true
}

// ─── 声明式 Handler 注册器 ───────────────────────────────────────────────────

/**
 * 将 IPC 多参数扁平调用合并为单对象
 * ipcRenderer.invoke('ch', a, b, c) → handler 收到 { 第一个参数名: a, 第二个: b, ... }
 *
 * 当 schema 是 z.object 时，按属性名拆分传入的参数列表
 * 当 schema 不是 object（如 z.string）时，直接传递第一个参数
 */
function packArgs<T>(schema: z.ZodType<T>, args: unknown[]): unknown {
  // 如果 schema 是 z.object，按属性名拆分传入的参数列表
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    const keys = Object.keys(shape)

    // 多参数：按 key 顺序打包
    if (args.length > 1) {
      const packed: Record<string, unknown> = {}
      for (let i = 0; i < args.length && i < keys.length; i++) {
        packed[keys[i]] = args[i]
      }
      return packed
    }

    // 单参数且 schema 有明确 key：如果参数不是对象，包装为 { key: value }
    if (args.length === 1 && keys.length >= 1) {
      const first = args[0]
      if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
        // 已经是对象，直接传
        return first
      }
      // 原始值（string/number/boolean），包装为 { 第一个key: value }
      return { [keys[0]]: first }
    }
  }

  // 非 object schema 或无参数：直接传第一个
  return args[0]
}

/**
 * 声明式 IPC handler 注册器
 *
 * 自动包裹三层防御：
 *   Layer 0: sender 校验
 *   Layer 1: 入参 schema 校验（safeParse）
 *   Layer 2: 业务逻辑 try/catch
 *
 * handler 必须返回 IpcResult，永不 reject。
 *
 * 支持多参数 preload 调用：preload 发送 ipcRenderer.invoke('ch', a, b, c)
 * 时，按 schema 的 object key 自动打包为单对象。
 *
 * @example
 * // preload: ipcRenderer.invoke('worklog:add', content, category)
 * // schema: z.object({ content: z.string(), category: z.string().optional() })
 * guardedHandle('worklog:add', WorklogAddSchema, (data) => {
 *   // data = { content, category }
 *   return ok(addWorkLog(data.content, data.category))
 * })
 */
export function guardedHandle<T>(
  channel: string,
  schema: z.ZodType<T>,
  handler: (data: T, event: IpcMainInvokeEvent) => Promise<IpcResult> | IpcResult
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    // Layer 0: sender 校验
    if (!assertValidSender(event, channel)) {
      log.warn(`[IPC] 🚫 ${channel}: 非法调用方`)
      return fail('SENDER_INVALID', '非法调用方')
    }

    // 将多参数扁平调用打包为单对象
    const raw = packArgs(schema, args)

    // Layer 1: 入参 schema 校验
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      log.warn(`[IPC] ⚠️ ${channel}: 参数校验失败`, parsed.error.issues)
      return fail('VALIDATION_FAILED', '参数校验失败', parsed.error.issues)
    }

    // Layer 2: 业务逻辑（统一 try/catch，永不 reject）
    try {
      return await handler(parsed.data, event)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`[IPC] 💥 ${channel}: ${msg}`)
      return fail('UNKNOWN', msg)
    }
  })
}

/**
 * 无需 schema 的简单查询 handler（read-only getter）
 * 仅做 sender 校验 + try/catch
 *
 * @example
 * guardedQuery('worklog:list', () => {
 *   return ok(getWorkLogs())
 * })
 */
export function guardedQuery<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent) => Promise<IpcResult<T>> | IpcResult<T>
): void {
  ipcMain.handle(channel, async (event) => {
    if (!assertValidSender(event, channel)) {
      return fail('SENDER_INVALID', '非法调用方')
    }
    try {
      return await handler(event)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`[IPC] 💥 ${channel}: ${msg}`)
      return fail('UNKNOWN', msg)
    }
  })
}
