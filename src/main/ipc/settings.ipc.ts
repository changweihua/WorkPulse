/**
 * IPC 棰嗗煙锛氳缃?+ LLM Token + 瀵煎叆瀵煎嚭 + 鎶ュ憡
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

// 娓叉煋杩涚▼鍏佽璁块棶鐨?settings 閿櫧鍚嶅崟
const ALLOWED_SETTINGS_KEYS = new Set([
  'api_key', 'reminder_enabled', 'reminder_lead',
  'radial_enabled', 'radial_items',
  'ai_provider', 'ai_base_url', 'ai_model',
  'ai_embedding_provider', 'ai_embedding_baseUrl', 'ai_embedding_model',
  'report_language', 'report_style', 'system_prompt', 'report_template',
  'shortcut_quick_log', 'shortcut_quick_task',
  'app_language', 'theme', 'ui_accent',
])

export function registerSettingsIpc(): void {
  // --- Settings ---
  ipcMain.handle('settings:get', (_event, key: string) => {
    const v = validate(SettingsGetSchema, { key })
    if (!ALLOWED_SETTINGS_KEYS.has(v.key)) {
      throw new Error(`鎷掔粷璁块棶鏈巿鏉冪殑 settings 閿? ${v.key}`)
    }
    if (v.key === 'api_key') return getStoredApiKey()
    return getSetting(v.key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    const v = validate(SettingsSetSchema, { key, value })
    if (!ALLOWED_SETTINGS_KEYS.has(v.key)) {
      throw new Error(`鎷掔粷鍐欏叆鏈巿鏉冪殑 settings 閿? ${v.key}`)
    }
    if (v.key === 'api_key') { setStoredApiKey(v.value); return }
    setSetting(v.key, v.value)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      throw new Error(`鎷掔粷鍒犻櫎鏈巿鏉冪殑 settings 閿? ${key}`)
    }
    if (key === 'api_key') { deleteStoredApiKey(); return }
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

  // --- 鍏ㄥ眬妯″瀷閰嶇疆 ---
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
      title: '宸ヤ綔鏃ュ織宸插鍑?,
      body: result.filePath,
      tag: 'export-logs',
      group: 'workpulse',
    })
    return result.filePath
  })

  // --- Import ---
  ipcMain.handle('import:logs', async (_event) => {
    const result = await dialog.showOpenDialog({
      title: '瀵煎叆宸ヤ綔鏃ュ織',
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
        title: '宸ヤ綔鏃ュ織宸插鍏?,
        body: `鎴愬姛瀵煎叆 ${imported} 鏉?{skipped > 0 ? `锛岃烦杩?${skipped} 鏉 : ''}`,
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
      title: '鎶ュ憡宸插鍑?,
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
