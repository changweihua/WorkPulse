/**
 * IPC 聚合器：按领域注册所有 IPC 处理器
 * 渐进式流水线 — 每个领域模块独立维护，聚合器只负责调用顺序
 */
import { registerWorklogIpc } from './worklog.ipc'
import { registerTaskIpc } from './task.ipc'
import { registerEventIpc } from './event.ipc'
import { registerFeedIpc } from './feed.ipc'
import { registerAiIpc } from './ai.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerVectorIpc } from './vector.ipc'
import { registerAttachmentIPC } from '../attachments'
import { getDatabase } from '../db'
import { registerDailySummaryIpc } from './daily-summary.ipc'
import { registerAiUsageIpc } from './ai-usage.ipc'

export function registerIpcHandlers(): void {
  // 核心业务
  registerWorklogIpc()
  registerTaskIpc()
  registerEventIpc()

  // AI 与模型
  registerAiIpc()
  registerAiUsageIpc()

  // 设置与导入导出
  registerSettingsIpc()

  // 每日摘要弹窗
  registerDailySummaryIpc()

  // RSS 订阅
  registerFeedIpc()

  // 向量搜索
  registerVectorIpc()

  // 附件
  registerAttachmentIPC(getDatabase())
}
