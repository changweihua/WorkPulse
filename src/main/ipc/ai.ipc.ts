/**
 * IPC 领域：AI 聊天流式传输 + 模型管理 + 理由链
 */
import { ipcMain, BrowserWindow, powerSaveBlocker } from 'electron'
import OpenAI from 'openai'
import log from 'electron-log/main'
import { validate, AiChatStreamSchema } from '../ipc-schemas'
import { ensureModelFiles, setModelProgressSender } from '../model-files'
import { getLLMToken } from '../secureSettings'
import { assertValidSender } from '../ipc-guard'

export function registerAiIpc(): void {
  // 模型下载进度广播
  setModelProgressSender((p) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('model-download-progress', p)
    }
  })

  ipcMain.handle(
    'model:ensure',
    (_event, modelId: string, required: string[], optional: string[]) =>
      ensureModelFiles(modelId, required || [], optional || [])
  )

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

  ipcMain.handle('ai-chat-cancel', (_event, requestId: string) => {
    const controller = activeStreams.get(requestId)
    if (controller) {
      controller.abort()
      activeStreams.delete(requestId)
      stopPowerBlock()
    }
  })

  ipcMain.handle('ai-chat-stream', async (event, params) => {
    // ── IPC 发送者校验：防止注入脚本调用敏感通道 ──
    if (!assertValidSender(event, 'ai-chat-stream')) {
      event.sender.send('ai-stream-error', '非法调用方')
      return
    }

    const validated = validate(AiChatStreamSchema, params)
    const { userMessage, history, config } = validated

    let apiKey = config.token || process.env.API_KEY

    // ── 推理开始，启用防休眠 ──
    startPowerBlock()
    if (!apiKey && config.id) {
      apiKey = getLLMToken(config.id)
    }
    if (!apiKey) {
      event.sender.send('ai-stream-error', '未提供 API Key')
      stopPowerBlock()
      return
    }

    let defaultHeaders: Record<string, string> = {}
    if (config.headers) {
      try { defaultHeaders = JSON.parse(config.headers) } catch { log.warn('解析 headers 失败') }
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
          baseURL: config.baseURL,
          apiKey,
          defaultHeaders,
        })

        const stream = (await client.chat.completions.create(
          {
            model: config.model,
            messages: [...history, { role: 'user', content: userMessage }],
            stream: true,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.max_tokens ?? 2048,
            top_p: config.top_p ?? 0.9,
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
