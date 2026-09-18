import { net } from 'electron'
import { getSetting } from './db'
import { getResolvedLanguage, tMain } from './i18n'
import { getActiveChatConfig, getActiveProviderInfo } from './modelConfig'
import type { ChatModelConfig } from './modelConfig'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ReportTaskContext {
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done' | 'draft'
  due_date?: string | null
  completed_at?: string | null
}

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的工作报告助手。请根据用户提供的工作日志，生成一份结构化的工作总结报告。

要求：
- 语言：{{language}}
- 风格：{{style}}
- 时间范围：{{dateFrom}} 至 {{dateTo}}
- 输出格式：Markdown
- 按主题/项目分类归纳
- 突出关键成果和产出
- 简洁有力，避免流水账`

const DEFAULT_REPORT_TEMPLATE = `## 工作总结 ({{dateFrom}} - {{dateTo}})

### 主要产出
（按项目/主题分类列出关键成果）

### 进行中的工作
（尚未完成但有进展的事项）

### 下周计划
（基于当前工作的合理推断）`

const DEFAULT_SYSTEM_PROMPT_EN = `You are a professional work report assistant. Generate a structured work summary from the user's work logs.

Requirements:
- Language: {{language}}
- Style: {{style}}
- Date range: {{dateFrom}} to {{dateTo}}
- Output format: Markdown
- Group work by topic/project
- Highlight key outcomes and deliverables
- Keep it concise and useful; avoid a raw chronological dump`

const DEFAULT_REPORT_TEMPLATE_EN = `## Work Summary ({{dateFrom}} - {{dateTo}})

### Key Outcomes
(Group important outcomes by project/topic)

### Work in Progress
(Items that are not finished but have meaningful progress)

### Next Plan
(Reasonable next steps based on current work)`

export async function generateReport(
  logs: { content: string; created_at: string }[],
  dateFrom: string,
  dateTo: string,
  tasks: ReportTaskContext[] = []
): Promise<string> {
  const info = getActiveProviderInfo()
  if (!info.token) {
    throw new Error(tMain('apiKeyMissing'))
  }

  const resolvedLanguage = getResolvedLanguage()
  const language = getSetting('report_language') || (resolvedLanguage === 'zh' ? '中文' : 'English')
  const style = getSetting('report_style') || (resolvedLanguage === 'zh' ? '简洁专业' : 'Concise professional')
  const customPrompt = getSetting('system_prompt') || (resolvedLanguage === 'zh' ? DEFAULT_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT_EN)
  const reportTemplate = getSetting('report_template') || (resolvedLanguage === 'zh' ? DEFAULT_REPORT_TEMPLATE : DEFAULT_REPORT_TEMPLATE_EN)

  const vars: Record<string, string> = { language, style, dateFrom, dateTo }
  const systemPrompt = replaceVars(customPrompt, vars)
  const templateHint = replaceVars(reportTemplate, vars)

  const logsText = logs
    .map((log) => `[${log.created_at}] ${log.content}`)
    .join('\n')

  const taskContext = formatTaskContext(tasks)
  const taskBlock = taskContext ? tMain('taskContextTitle', { tasks: taskContext }) : ''
  const userMessage = tMain('reportUserMessage', {
    logs: logsText,
    tasks: taskBlock,
    template: templateHint
  })

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]

  return callProvider(info, messages)
}

/** 统一的 Provider 调用入口 */
async function callProvider(
  info: { baseURL: string; model: string; token: string; headers: Record<string, string>; temperature: number; max_tokens: number; top_p: number },
  messages: Message[]
): Promise<string> {
  if (!info.token) {
    throw new Error(tMain('apiKeyMissing'))
  }

  // 检测是否是 Anthropic（通过 baseURL 或特殊 headers）
  const isAnthropic = info.baseURL.includes('anthropic') || ('anthropic-version' in info.headers)

  if (isAnthropic) {
    const url = info.baseURL.replace(/\/+$/, '') + '/v1/messages'
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMsg = messages.find((m) => m.role === 'user')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': info.token,
        'anthropic-version': '2023-06-01',
        ...info.headers,
      },
      body: JSON.stringify({
        model: info.model || 'claude-sonnet-4-20250514',
        max_tokens: info.max_tokens || 2000,
        system: systemMsg?.content || '',
        messages: [{ role: 'user', content: userMsg?.content || '' }]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`${tMain('anthropicError')}: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return data.content[0]?.text || tMain('noGeneratedContent')
  }

  // OpenAI / DeepSeek / Custom（统一 OpenAI 兼容格式）
  const url = info.baseURL.replace(/\/+$/, '') + '/chat/completions'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${info.token}`,
      ...info.headers,
    },
    body: JSON.stringify({
      model: info.model || 'gpt-4o-mini',
      messages,
      temperature: info.temperature || 0.7,
      max_tokens: info.max_tokens || 2000,
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`${tMain('openAiError')}: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || tMain('noGeneratedContent')
}

function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

function formatTaskContext(tasks: ReportTaskContext[]): string {
  if (tasks.length === 0) return ''
  const separator = getResolvedLanguage() === 'zh' ? '，' : ', '

  const statusLabel: Record<ReportTaskContext['status'], string> = {
    todo: tMain('taskTodo'),
    in_progress: tMain('taskInProgress'),
    done: tMain('taskDone'),
    draft: tMain('taskDraft')
  }

  return tasks
    .slice(0, 100)
    .map((task) => {
      const meta = [
        statusLabel[task.status],
        task.due_date ? tMain('taskDue', { date: task.due_date }) : '',
        task.completed_at ? tMain('taskCompletedAt', { date: task.completed_at }) : ''
      ].filter(Boolean).join(separator)
      const description = task.description?.trim() ? ` — ${task.description.trim()}` : ''
      return `- [${meta}] ${task.title}${description}`
    })
    .join('\n')
}

// callOpenAI / callAnthropic / callDeepSeek 已合并到 callProvider

// --- Streaming API ---

function parseSSEChunk(line: string): string | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6)
  if (data === '[DONE]') return null
  try {
    const json = JSON.parse(data)
    if (json.choices?.[0]?.delta?.content) return json.choices[0].delta.content
    if (json.type === 'content_block_delta') return json.delta?.text
    return null
  } catch {
    return null
  }
}

export async function streamChat(
  prompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const info = getActiveProviderInfo()
  if (!info.token) {
    onError(tMain('apiKeyMissing'))
    return
  }

  const resolvedLanguage = getResolvedLanguage()
  const language = getSetting('report_language') || (resolvedLanguage === 'zh' ? '中文' : 'English')
  const style = getSetting('report_style') || (resolvedLanguage === 'zh' ? '简洁专业' : 'Concise professional')
  const customPrompt = getSetting('system_prompt') || (resolvedLanguage === 'zh' ? DEFAULT_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT_EN)

  const vars: Record<string, string> = { language, style, dateFrom: '', dateTo: '' }
  const systemPrompt = replaceVars(customPrompt, vars)

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ]

  const maxRetries = 3
  const baseDelay = 1000

  // 检测是否是 Anthropic
  const isAnthropic = info.baseURL.includes('anthropic') || ('anthropic-version' in info.headers)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = isAnthropic
        ? info.baseURL.replace(/\/+$/, '') + '/v1/messages'
        : info.baseURL.replace(/\/+$/, '') + '/chat/completions'

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...info.headers,
      }
      if (isAnthropic) {
        headers['x-api-key'] = info.token
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${info.token}`
      }

      const body: Record<string, unknown> = {
        model: info.model,
        messages,
        stream: true,
        temperature: info.temperature || 0.7,
        max_tokens: info.max_tokens || 2000,
      }

      const response = await net.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        const error = await response.text()
        // Don't retry on client errors (4xx except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          onError(`${response.status}: ${error}`)
          return
        }
        // Retry on server errors (5xx) and rate limits (429)
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        onError(`${response.status}: ${error}`)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            onDone()
            return
          }

          // Check if aborted
          if (signal?.aborted) {
            return
          }

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            const text = parseSSEChunk(line)
            if (text) onChunk(text)
          }
        }
      }
    } catch (err) {
      // Don't retry if aborted
      if (signal?.aborted) {
        return
      }
      // Retry on network errors
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      onError(String(err))
      return
    }
  }
}

export { DEFAULT_SYSTEM_PROMPT, DEFAULT_REPORT_TEMPLATE, DEFAULT_SYSTEM_PROMPT_EN, DEFAULT_REPORT_TEMPLATE_EN }
