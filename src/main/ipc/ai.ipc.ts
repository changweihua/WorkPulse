/**
 * IPC 领域：AI 聊天流式传输 + 模型管理 + 理由链
 * 迁移至 guardedHandle 模式（流式 handler 保留 event.sender.send 模式）
 */
import { BrowserWindow, powerSaveBlocker } from 'electron'
import OpenAI from 'openai'
import log from 'electron-log/main'
import { guardedHandle, guardedQuery, assertValidSender } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import { ensureModelFiles, setModelProgressSender } from '../model-files'
import { getLLMToken } from '../secureSettings'
import {
  AiChatStreamSchema, AiChatCancelSchema, ModelEnsureSchema,
} from '../ipc-schemas'
import { getActiveChatConfig } from '../modelConfig'

export function registerAiIpc(): void {
  // 模型下载进度广播
  setModelProgressSender((p) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('model-download-progress', p)
    }
  })

  guardedHandle('model:ensure', ModelEnsureSchema, async (data) => {
    return ok(await ensureModelFiles(data.modelId, data.required || [], data.optional || []))
  })

  // --- 流式聊天（带重试 + 取消） ---
  const activeStreams = new Map<string, AbortController>()

  // ── 防休眠：AI 推理期间阻止系统进入休眠 ──
  let powerBlockerId: number | null = null

  function startPowerBlock(): void {
    if (powerBlockerId !== null) return
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    log.info('[AI] ⚡ 防休眠已启用')
  }

  function stopPowerBlock(): void {
    if (powerBlockerId === null) return
    powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
    log.info('[AI] 💤 防休眠已关闭')
  }

  guardedHandle('ai-chat-cancel', AiChatCancelSchema, (data) => {
    const controller = activeStreams.get(data.requestId)
    if (controller) {
      controller.abort()
      activeStreams.delete(data.requestId)
      stopPowerBlock()
    }
    return ok(undefined)
  })

  // 流式聊天：使用原始 ipcMain.handle 但加上 sender 校验
  // （因为流式 handler 通过 event.sender.send 推送数据，不适合用 guardedHandle 包裹）
  const { ipcMain } = require('electron')
  ipcMain.handle('ai-chat-stream', async (event: Electron.IpcMainInvokeEvent, params: unknown) => {
    // ── IPC 发送者校验 ──
    if (!assertValidSender(event, 'ai-chat-stream')) {
      event.sender.send('ai-stream-error', '非法调用方')
      return
    }

    // ── 入参 schema 校验 ──
    const validated = AiChatStreamSchema.safeParse(params)
    if (!validated.success) {
      event.sender.send('ai-stream-error', `参数校验失败: ${validated.error.issues.map(i => i.message).join(', ')}`)
      return
    }

    let { userMessage, history, config } = validated.data

    // 始终从全局配置获取模型信息，config 中的值作为覆盖
    const active = getActiveChatConfig()
    if (!active) {
      event.sender.send('ai-stream-error', '未配置模型，请先在 AI 模型页面添加配置')
      stopPowerBlock()
      return
    }
    const finalConfig = {
      id: active.id,
      baseURL: active.baseURL,
      model: active.model,
      token: config?.token || active.token || '',
      headers: config?.headers || active.headers || '',
      temperature: config?.temperature ?? active.temperature ?? 0.7,
      max_tokens: config?.max_tokens ?? active.max_tokens ?? 4096,
      top_p: config?.top_p ?? active.top_p ?? 0.9,
    }

    let apiKey = finalConfig.token || process.env.API_KEY

    // ── 推理开始，启用防休眠 ──
    startPowerBlock()
    if (!apiKey && finalConfig.id) {
      apiKey = getLLMToken(finalConfig.id) ?? undefined
    }
    if (!apiKey) {
      event.sender.send('ai-stream-error', '未提供 API Key')
      stopPowerBlock()
      return
    }

    let defaultHeaders: Record<string, string> = {}
    if (finalConfig.headers) {
      try { defaultHeaders = JSON.parse(finalConfig.headers) } catch { log.warn('解析 headers 失败') }
    }

    const MAX_RETRIES = 3
    const BASE_DELAY = 1000
    const isTransient = (status?: number) => !status || status === 429 || status >= 500

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const requestId = `chat-${Date.now()}-${attempt}`
      const controller = new AbortController()
      activeStreams.set(requestId, controller)
      event.sender.send('ai-stream-request-id', requestId)

      try {
        const client = new OpenAI({
          baseURL: finalConfig.baseURL,
          apiKey,
          defaultHeaders,
        })

        const stream = (await client.chat.completions.create(
          {
            model: finalConfig.model,
            messages: [...history, { role: 'user', content: userMessage }],
            stream: true,
            temperature: finalConfig.temperature ?? 0.7,
            max_tokens: finalConfig.max_tokens ?? 2048,
            top_p: finalConfig.top_p ?? 0.9,
          },
          { signal: controller.signal }
        )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>

        for await (const chunk of stream) {
          if (chunk.choices.length === 0) continue
          const delta = chunk.choices[0].delta
          if ('reasoning_content' in delta && delta.reasoning_content) {
            event.sender.send('ai-stream-reasoning', delta.reasoning_content)
          }
          if (delta.content) {
            event.sender.send('ai-stream-chunk', delta.content)
          }
        }

        event.sender.send('ai-stream-done')
        activeStreams.delete(requestId)
        stopPowerBlock()
        return
      } catch (error: any) {
        activeStreams.delete(requestId)

        if (error.name === 'AbortError') {
          event.sender.send('ai-stream-done')
          stopPowerBlock()
          return
        }

        const status = error?.status || error?.response?.status
        if (!isTransient(status)) {
          event.sender.send('ai-stream-error', String(error.message || error))
          stopPowerBlock()
          return
        }

        if (attempt < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 8000)
          const jitter = Math.random() * 500
          log.warn(`[ai-chat-stream] Attempt ${attempt + 1} failed (${status || error.message}), retrying in ${delay}ms...`)
          event.sender.send('ai-stream-retry', { attempt: attempt + 1, maxRetries: MAX_RETRIES, waitMs: delay })
          await new Promise((r) => setTimeout(r, delay + jitter))
          continue
        }

        event.sender.send('ai-stream-error', `${String(error.message || error)}（已重试${MAX_RETRIES}次）`)
        stopPowerBlock()
      }
    }
  })
}
