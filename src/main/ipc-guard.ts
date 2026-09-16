/**
 * IPC 安全校验：验证调用方是否为主窗口
 * 防止被劫持的 iframe / 注入脚本调用敏感 IPC
 */
import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import log from 'electron-log/main'

/**
 * 校验 IPC invoke 事件发送方是否为合法的本地窗口。
 * 返回 true 表示通过，false 表示拒绝。
 *
 * @param event   ipcMain invoke 事件对象
 * @param channel 通道名，用于日志
 */
export function assertValidSender(event: IpcMainInvokeEvent, channel: string): boolean {
  const sender = event.sender
  if (sender.isDestroyed()) {
    log.warn(`[IPC Guard] 🚫 ${channel}: sender 已销毁`)
    return false
  }

  // 检查 sender 是否属于某个 BrowserWindow
  const win = BrowserWindow.fromWebContents(sender)
  if (!win || win.isDestroyed()) {
    log.warn(`[IPC Guard] 🚫 ${channel}: sender 不属于任何窗口`)
    return false
  }

  // 检查 sender 的 URL 是否为本地（file: 或 dev server）
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

/**
 * 包装 ipcMain.handle，自动校验发送方为合法本地窗口。
 * 适用于敏感 IPC 通道（AI、设置、数据操作等）。
 *
 * @example
 * guardedHandle('ai-chat-stream', async (event, params) => { ... })
 */
export function guardedHandle<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TReturn> | TReturn
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: TArgs) => {
    if (!assertValidSender(event, channel)) {
      throw new Error(`[IPC Guard] 非法调用方: ${channel}`)
    }
    return handler(event, ...args)
  })
}
