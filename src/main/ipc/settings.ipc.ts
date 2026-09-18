/**
 * IPC 领域：设置 + LLM Token + 导入导出 + 报告
 */
import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import {
  getAllWorkLogs, getSetting, setSetting, deleteSetting,
  saveReport, getReports, updateReportContent, generateWeeklyReport,
  addWorkLog, workLogExists
} from '../db'
import { validate, SettingsSetSchema, SettingsGetSchema } from '../ipc-schemas'
import { saveLLMToken, getLLMToken, deleteLLMToken } from '../secureSettings'
import { showNotification } from '../notification'
import { tMain } from '../i18n'
import {
  getGlobalConfig, setGlobalConfig,
  getActiveChatConfig, setActiveChatConfig,
  type ChatModelConfig, type EmbeddingModelConfig
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
])

export function registerSettingsIpc(): void {
  // --- Settings ---
  ipcMain.handle('settings:get', (_event, key: string) => {
    const v = validate(SettingsGetSchema, { key })
    if (!ALLOWED_SETTINGS_KEYS.has(v.key)) {
      throw new Error(`拒绝访问未授权的 settings 键: ${v.key}`)
    }
    return getSetting(v.key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    const v = validate(SettingsSetSchema, { key, value })
    if (!ALLOWED_SETTINGS_KEYS.has(v.key)) {
      throw new Error(`拒绝写入未授权的 settings 键: ${v.key}`)
    }
    setSetting(v.key, v.value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      throw new Error(`拒绝删除未授权的 settings 键: ${key}`)
    }
    deleteSetting(key)
  })

  // --- LLM Token ---
  ipcMain.handle('llm-tokens:save', async (_event, params: { modelId: string; token: string }) => {
    saveLLMToken(params.modelId, params.token)
    return true
  })

  ipcMain.handle('llm-tokens:get', async (_event, modelId: string) => {
    return getLLMToken(modelId)
  })

  ipcMain.handle('llm-tokens:delete', async (_event, modelId: string) => {
    deleteLLMToken(modelId)
    return true
  })

  // --- 全局模型配置 ---
  ipcMain.handle('model:get-global-config', () => {
    return getGlobalConfig()
  })

  ipcMain.handle('model:set-global-config', (_event, config: any) => {
    setGlobalConfig(config)
    return { ok: true }
  })

  ipcMain.handle('model:set-active-chat', (_event, configId: string) => {
    setActiveChatConfig(configId)
    return { ok: true }
  })

  // --- Report ---
  ipcMain.handle('report:list', (_event, limit?: number) => {
    return getReports(limit)
  })

  ipcMain.handle('report:create', (_event, type: string, dateFrom: string, dateTo: string, content: string) => {
    return saveReport(type, dateFrom, dateTo, content)
  })

  ipcMain.handle('report:update', (_event, id: number, content: string) => {
    return updateReportContent(id, content)
  })

  ipcMain.handle('report:weekly', (_event, startDate: string, endDate: string) => {
    return generateWeeklyReport(startDate, endDate)
  })

  // --- Export ---
  ipcMain.handle('export:logs', async (_event, format: 'csv' | 'markdown') => {
    const logs = getAllWorkLogs()
    if (logs.length === 0) throw new Error(tMain('noLogsToExport'))

    const ext = format === 'csv' ? 'csv' : 'md'
    const result = await dialog.showSaveDialog({
      title: tMain('exportLogsTitle'),
      defaultPath: `workpulse-logs.${ext}`,
      filters: [
        format === 'csv'
          ? { name: 'CSV', extensions: ['csv'] }
          : { name: 'Markdown', extensions: ['md'] }
      ]
    })

    if (result.canceled || !result.filePath) return null

    let content: string
    if (format === 'csv') {
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
    return result.filePath
  })

  // --- Import ---
  ipcMain.handle('import:logs', async (_event) => {
    const result = await dialog.showOpenDialog({
      title: '导入工作日志',
      filters: [{ name: 'CSV / Markdown', extensions: ['csv', 'md'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) return null

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
    return { imported, skipped, filePath }
  })

  ipcMain.handle('export:report', async (_event, reportContent: string, dateRange: string) => {
    const result = await dialog.showSaveDialog({
      title: tMain('exportReportTitle'),
      defaultPath: `workpulse-report-${dateRange}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, reportContent, 'utf-8')
    showNotification({
      title: '报告已导出',
      body: result.filePath,
      tag: 'export-report',
      group: 'workpulse',
    })
    return result.filePath
  })

  // --- Navigate ---
  ipcMain.on('navigate', (event, page: string) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
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
