/**
 * IPC 领域：设置 + LLM Token + 导入导出 + 报告
 * 迁移至 guardedHandle 模式
 */
import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import {
  getAllWorkLogs, getSetting, setSetting, deleteSetting,
  saveReport, getReports, updateReportContent, generateWeeklyReport,
  addWorkLog, workLogExists
} from '../db'
import { guardedHandle, guardedQuery } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import {
  SettingsSetSchema, SettingsGetSchema, SettingsDeleteSchema,
  ReportListSchema, ReportCreateSchema, ReportUpdateSchema, ReportWeeklySchema,
  ExportLogsSchema, ExportReportSchema,
  LlmTokenSaveSchema, LlmTokenSchema,
  ModelSetActiveChatSchema,
} from '../ipc-schemas'
import { saveLLMToken, getLLMToken, deleteLLMToken } from '../secureSettings'
import { showNotification } from '../notification'
import { tMain } from '../i18n'
import {
  getGlobalConfig, setGlobalConfig,
  getActiveChatConfig, setActiveChatConfig,
} from '../modelConfig'

// 渲染进程允许访问的 settings 键白名单
const ALLOWED_SETTINGS_KEYS = new Set([
  'reminder_enabled', 'reminder_lead',
  'radial_enabled', 'radial_items',
  'ai_provider', 'ai_base_url', 'ai_model',
  'ai_embedding_provider', 'ai_embedding_baseUrl', 'ai_embedding_model',
  'report_language', 'report_style', 'system_prompt', 'report_template',
  'shortcut_quick_log', 'shortcut_quick_task',
  'app_language', 'theme', 'ui_accent',
  'daily_summary_enabled', 'daily_summary_last_shown',
  'api_key',
  'search_mode',
])

export function registerSettingsIpc(): void {
  // --- Settings ---
  guardedHandle('settings:get', SettingsGetSchema, (data) => {
    if (!ALLOWED_SETTINGS_KEYS.has(data.key)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED' as const, message: `拒绝访问未授权的 settings 键: ${data.key}` } }
    }
    return ok(getSetting(data.key))
  })

  guardedHandle('settings:set', SettingsSetSchema, (data) => {
    if (!ALLOWED_SETTINGS_KEYS.has(data.key)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED' as const, message: `拒绝写入未授权的 settings 键: ${data.key}` } }
    }
    setSetting(data.key, data.value)
    return ok(undefined)
  })

  guardedHandle('settings:delete', SettingsDeleteSchema, (data) => {
    if (!ALLOWED_SETTINGS_KEYS.has(data.key)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED' as const, message: `拒绝删除未授权的 settings 键: ${data.key}` } }
    }
    deleteSetting(data.key)
    return ok(undefined)
  })

  // --- LLM Token ---
  guardedHandle('llm-tokens:save', LlmTokenSaveSchema, (data) => {
    saveLLMToken(data.modelId, data.token)
    return ok(true)
  })

  guardedHandle('llm-tokens:get', LlmTokenSchema, (data) => {
    return ok(getLLMToken(data.modelId))
  })

  guardedHandle('llm-tokens:delete', LlmTokenSchema, (data) => {
    deleteLLMToken(data.modelId)
    return ok(true)
  })

  // --- 全局模型配置 ---
  guardedQuery('model:get-global-config', () => {
    return ok(getGlobalConfig())
  })

  guardedHandle('model:set-global-config', SettingsSetSchema, (data) => {
    try {
      const config = JSON.parse(data.value)
      setGlobalConfig(config)
      return ok(true)
    } catch {
      return { ok: false, error: { code: 'VALIDATION_FAILED' as const, message: '无效的 JSON 配置', issues: [] } }
    }
  })

  guardedQuery('model:get-config', (event) => {
    // 保留向后兼容：返回 chat 配置
    const active = getActiveChatConfig()
    if (!active) {
      return ok({
        type: 'chat' as const,
        provider: '',
        baseUrl: '',
        model: '',
        hasApiKey: false,
      })
    }
    return ok({
      type: 'chat' as const,
      provider: '',
      baseUrl: active.baseURL,
      model: active.model,
      hasApiKey: !!(active.token || getLLMToken(active.id)),
    })
  })

  guardedQuery('model:get-active-chat', () => {
    return ok(getActiveChatConfig())
  })

  guardedHandle('model:set-active-chat', ModelSetActiveChatSchema, (data) => {
    setActiveChatConfig(data.configId)
    return ok(true)
  })

  // --- Report ---
  guardedHandle('report:list', ReportListSchema, (data) => {
    return ok(getReports(data.limit))
  })

  guardedHandle('report:create', ReportCreateSchema, (data) => {
    return ok(saveReport(data.type, data.dateFrom, data.dateTo, data.content))
  })

  guardedHandle('report:update', ReportUpdateSchema, (data) => {
    return ok(updateReportContent(data.id, data.content))
  })

  guardedHandle('report:weekly', ReportWeeklySchema, async (data) => {
    return ok(await generateWeeklyReport(data.start, data.end))
  })

  // --- Export ---
  guardedHandle('export:logs', ExportLogsSchema, async (data) => {
    const logs = getAllWorkLogs()
    if (logs.length === 0) {
      return { ok: false, error: { code: 'BUSINESS_ERROR' as const, message: tMain('noLogsToExport') } }
    }

    const ext = data.format === 'csv' ? 'csv' : 'md'
    const result = await dialog.showSaveDialog({
      title: tMain('exportLogsTitle'),
      defaultPath: `workpulse-logs.${ext}`,
      filters: [
        data.format === 'csv'
          ? { name: 'CSV', extensions: ['csv'] }
          : { name: 'Markdown', extensions: ['md'] }
      ]
    })

    if (result.canceled || !result.filePath) return ok(null)

    let content: string
    if (data.format === 'csv') {
      const escapeCsvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`
      const header = tMain('csvHeader')
      const rows = logs
        .map((l) => [l.created_at, l.category, l.content].map(escapeCsvCell).join(','))
        .join('\n')
      content = header + rows
    } else {
      const grouped = new Map<string, typeof logs>()
      for (const log of logs) {
        const date = log.created_at.slice(0, 10)
        const list = grouped.get(date) || []
        list.push(log)
        grouped.set(date, list)
      }
      const sections = Array.from(grouped.entries()).map(([date, dateLogs]) => {
        const items = dateLogs.map((l) => {
          const category = l.category ? ` [${l.category}]` : ''
          return `- ${l.created_at.slice(11, 16)}${category} ${l.content}`
        }).join('\n')
        return `## ${date}\n\n${items}`
      })
      content = `${tMain('markdownLogsTitle')}\n\n${sections.join('\n\n')}\n`
    }

    writeFileSync(result.filePath, content, 'utf-8')
    showNotification({
      title: '工作日志已导出',
      body: result.filePath,
      tag: 'export-logs',
      group: 'workpulse',
    })
    return ok(result.filePath)
  })

  // --- Import ---
  guardedQuery('import:logs', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入工作日志',
      filters: [{ name: 'CSV / Markdown', extensions: ['csv', 'md'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) return ok(null)

    const filePath = result.filePaths[0]
    const content = readFileSync(filePath, 'utf-8')
    const ext = filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'md'

    let imported = 0
    let skipped = 0
    if (ext === 'csv') {
      const lines = content.split('\n').filter(l => l.trim())
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const parts = parseCSVLine(line)
        if (parts.length >= 3) {
          const [time, category, logContent] = parts
          const cat = category || ''
          if (logContent && !workLogExists(logContent, cat)) {
            addWorkLog(logContent, cat, null, time || undefined)
            imported++
          } else { skipped++ }
        }
      }
    } else {
      const sections = content.split('\n## ')
      for (const section of sections) {
        const lines = section.split('\n')
        let dateStr = ''
        const headerLine = lines[0].replace(/^#+\s*/, '').trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(headerLine)) dateStr = headerLine
        for (const line of lines) {
          const match = line.match(/^-\s*(\d{2}:\d{2}(:\d{2})?)\s*(?:\[([^\]]+)\]\s*)?(.+)$/)
          if (match) {
            const time = match[1]
            const category = match[3] || ''
            const logContent = match[4].trim()
            const createdAt = dateStr ? `${dateStr} ${time}` : undefined
            if (logContent && !workLogExists(logContent, category, createdAt || undefined)) {
              addWorkLog(logContent, category, null, createdAt)
              imported++
            } else { skipped++ }
          }
        }
      }
    }

    if (imported > 0) {
      showNotification({
        title: '工作日志已导入',
        body: `成功导入 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`,
        tag: 'import-logs',
        group: 'workpulse',
      })
    }
    return ok({ imported, skipped, filePath })
  })

  guardedHandle('export:report', ExportReportSchema, async (data) => {
    const result = await dialog.showSaveDialog({
      title: tMain('exportReportTitle'),
      defaultPath: `workpulse-report-${data.dateRange}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return ok(null)
    writeFileSync(result.filePath, data.content, 'utf-8')
    showNotification({
      title: '报告已导出',
      body: result.filePath,
      tag: 'export-report',
      group: 'workpulse',
    })
    return ok(result.filePath)
  })

  // --- Navigate ---
  // 注意：navigate 用 ipcMain.on（非 invoke），保留原样
  const { ipcMain, BrowserWindow } = require('electron')
  ipcMain.on('navigate', (event: Electron.IpcMainEvent, page: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.webContents.send('navigate', page)
  })
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = false }
      } else { current += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { result.push(current); current = '' }
      else { current += ch }
    }
  }
  result.push(current)
  return result
}
