import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type QuickCreateType = 'log' | 'task'
type NavigatePage = 'worklog' | 'kanban' | 'report' | 'reports' | 'stats' | 'calendar' | 'chat' | 'xray' | 'onnx' | 'ocr' | 'pp' | 'settings'
type AppLanguage = 'system' | 'zh' | 'en'
type UpdateStatus = 'idle' | 'checking' | 'available' | 'not_available' | 'downloading' | 'downloaded' | 'error'

interface AppUpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  releaseName?: string
  releaseDate?: string
  releaseNotes?: string
  releaseUrl?: string
  downloadUrl?: string
  progress?: number
  error?: string
  canInstall?: boolean
}

// ─── IpcResult 解包 ──────────────────────────────────────────────────────────
// 主进程 handler 统一返回 { ok, data } 或 { ok, error }
// invoke() 解包成功结果，失败时抛出错误（保持渲染端 try/catch 兼容）

interface IpcOk<T> { ok: true; data: T }
interface IpcFail { ok: false; error: { code: string; message: string; issues?: unknown[] } }
type IpcResult<T = unknown> = IpcOk<T> | IpcFail

async function invoke<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  const err = new Error(result.error.message)
  ;(err as Error & { code: string }).code = result.error.code
  throw err
}

const api = {
  // 新增：发送 IPC 消息到主进程
  send: (channel: string, ...args: any[]) => {
    const ALLOWED_SEND_CHANNELS = ['screenshot:ready', 'screenshot:cancel', 'screenshot:crop'] as const;
    if ((ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  app: {
    getAutoLaunch: () => invoke(ipcRenderer.invoke('get-auto-launch')),
    setAutoLaunch: (enable: boolean) => invoke(ipcRenderer.invoke('set-auto-launch', enable)),
    getCloseAction: () => invoke(ipcRenderer.invoke('get-close-action')) as Promise<string>,
    setCloseAction: (action: string) => invoke(ipcRenderer.invoke('set-close-action', action)),
    setLanguage: (language: AppLanguage) => invoke(ipcRenderer.invoke('app:language:update', language)),
    getVersion: () => invoke(ipcRenderer.invoke('app:get-version')) as Promise<string>,
    getUpdateState: () => invoke(ipcRenderer.invoke('app:updates:get-state')) as Promise<AppUpdateState>,
    checkForUpdates: () => invoke(ipcRenderer.invoke('app:updates:check')) as Promise<AppUpdateState>,
    installUpdate: () => invoke(ipcRenderer.invoke('app:updates:install')) as Promise<boolean>,
    openBackupDir: () => invoke(ipcRenderer.invoke('app:open-backup-dir')) as Promise<string>
  },
  worklog: {
    add: (content: string, category?: string) =>
      invoke(ipcRenderer.invoke('worklog:add', content, category)),
    list: (limit?: number, offset?: number) =>
      invoke(ipcRenderer.invoke('worklog:list', limit, offset)),
    byDateRange: (from: string, to: string) =>
      invoke(ipcRenderer.invoke('worklog:byDateRange', from, to)),
    search: (keyword: string) => invoke(ipcRenderer.invoke('worklog:search', keyword)),
    categories: () => invoke(ipcRenderer.invoke('worklog:categories')) as Promise<string[]>,
    setCategory: (id: number, category: string) =>
      invoke(ipcRenderer.invoke('worklog:setCategory', id, category)),
    update: (id: number, content: string, category: string, created_at?: string) =>
      invoke(ipcRenderer.invoke('worklog:update', id, content, category, created_at)),
    delete: (id: number) => invoke(ipcRenderer.invoke('worklog:delete', id)),
    restore: (log: { content: string; category: string; created_at: string; task_id: number | null }) =>
      invoke(ipcRenderer.invoke('worklog:restore', log))
  },
  task: {
    add: (title: string, description?: string, status?: 'todo' | 'draft', createdAt?: string) =>
      invoke(ipcRenderer.invoke('task:add', title, description, status, createdAt)),
    list: () => invoke(ipcRenderer.invoke('task:list')),
    update: (id: number, updates: Record<string, unknown>) =>
      invoke(ipcRenderer.invoke('task:update', id, updates)),
    delete: (id: number) => invoke(ipcRenderer.invoke('task:delete', id)),
    reorder: (taskIds: number[], status: string) =>
      invoke(ipcRenderer.invoke('task:reorder', taskIds, status)),
    complete: (id: number, logContent: string) =>
      invoke(ipcRenderer.invoke('task:complete', id, logContent)),
    completeOnly: (id: number) =>
      invoke(ipcRenderer.invoke('task:completeOnly', id)) as Promise<any>,
  },
  stats: {
    get: (days?: number) => invoke(ipcRenderer.invoke('stats:get', days))
  },
  event: {
    add: (input: Record<string, unknown>) => invoke(ipcRenderer.invoke('event:add', input)),
    byDate: (date: string) => invoke(ipcRenderer.invoke('event:byDate', date)),
    byRange: (from: string, to: string) => invoke(ipcRenderer.invoke('event:byRange', from, to)),
    update: (id: number, updates: Record<string, unknown>) =>
      invoke(ipcRenderer.invoke('event:update', id, updates)),
    delete: (id: number) => invoke(ipcRenderer.invoke('event:delete', id)),
  },
  import: {
    logs: () => invoke(ipcRenderer.invoke('import:logs')) as Promise<{ imported: number; skipped: number; filePath: string } | null>,
  },
  report: {
    generate: (dateFrom: string, dateTo: string) =>
      invoke(ipcRenderer.invoke('report:generate', dateFrom, dateTo)),
    weekly: (start: string, end: string) =>
      invoke(ipcRenderer.invoke('report:weekly', start, end)),
    create: (type: string, dateFrom: string, dateTo: string, content: string) =>
      invoke(ipcRenderer.invoke('report:create', type, dateFrom, dateTo, content)),
    list: (limit?: number) => invoke(ipcRenderer.invoke('report:list', limit)),
    update: (id: number, content: string) =>
      invoke(ipcRenderer.invoke('report:update', id, content))
  },
  ai: {
    streamChat: (prompt: string) => {
      // 流式聊天：invoke 返回 void，通过事件监听接收数据
      ipcRenderer.invoke('ai-chat-stream', { userMessage: prompt, history: [] })
      return {
        onChunk: (cb: (text: string) => void) => {
          const handler = (_e: any, text: string) => cb(text)
          ipcRenderer.on('ai-stream-chunk', handler)
          return () => ipcRenderer.removeListener('ai-stream-chunk', handler)
        },
        onDone: (cb: () => void) => {
          const handler = () => cb()
          ipcRenderer.on('ai-stream-done', handler)
          return () => ipcRenderer.removeListener('ai-stream-done', handler)
        },
        onError: (cb: (err: string) => void) => {
          const handler = (_e: any, err: string) => cb(err)
          ipcRenderer.on('ai-stream-error', handler)
          return () => ipcRenderer.removeListener('ai-stream-error', handler)
        }
      }
    }
  },
  models: {
    ensure: (modelId: string, required: string[], optional: string[]) =>
      invoke(ipcRenderer.invoke('model:ensure', modelId, required, optional)) as Promise<{
        ok: boolean
        missing: string[]
      }>,
    onProgress: (
      cb: (p: { modelId: string; file: string; loaded: number; total: number; percent: number }) => void
    ) => {
      const handler = (_e: unknown, p: { modelId: string; file: string; loaded: number; total: number; percent: number }): void =>
        cb(p)
      ipcRenderer.on('model-download-progress', handler)
      return () => ipcRenderer.removeListener('model-download-progress', handler)
    },
    getConfig: (type?: 'chat' | 'embedding') =>
      invoke(ipcRenderer.invoke('model:get-config', type || 'chat')) as Promise<{
        type: 'chat' | 'embedding'
        provider: string
        baseUrl: string
        model: string
        hasApiKey: boolean
        dimension?: number
      }>,
    getGlobalConfig: () =>
      invoke(ipcRenderer.invoke('model:get-global-config')) as Promise<{
        chatConfigs: Array<{
          id: string; name: string; baseURL: string; model: string;
          token: string; headers: string; temperature: number; max_tokens: number; top_p: number
        }>
        activeChatConfigId: string
        embedding: {
          provider: string; baseURL: string; model: string; dimension: number; token: string
        }
      }>,
    setGlobalConfig: (config: any) =>
      invoke(ipcRenderer.invoke('model:set-global-config', 'global', JSON.stringify(config))) as Promise<{ ok: boolean }>,
    getActiveChat: () =>
      invoke(ipcRenderer.invoke('model:get-active-chat')) as Promise<{
        id: string; name: string; baseURL: string; model: string;
        token: string; headers: string; temperature: number; max_tokens: number; top_p: number
      } | null>,
    setActiveChat: (configId: string) =>
      invoke(ipcRenderer.invoke('model:set-active-chat', configId)) as Promise<{ ok: boolean }>,
    addChatConfig: (config: any) =>
      invoke(ipcRenderer.invoke('model:add-chat-config', config)) as Promise<{ ok: boolean }>,
    updateChatConfig: (config: any) =>
      invoke(ipcRenderer.invoke('model:update-chat-config', config)) as Promise<{ ok: boolean }>,
    deleteChatConfig: (configId: string) =>
      invoke(ipcRenderer.invoke('model:delete-chat-config', configId)) as Promise<{ ok: boolean }>,
    updateEmbedding: (params: { embeddingConfigs: any[]; activeEmbeddingConfigId: string }) =>
      invoke(ipcRenderer.invoke('model:update-embedding', params)) as Promise<{ ok: boolean }>,
  },
  settings: {
    get: (key: string) => invoke(ipcRenderer.invoke('settings:get', key)),
    set: (key: string, value: string) => invoke(ipcRenderer.invoke('settings:set', key, value)),
    delete: (key: string) => invoke(ipcRenderer.invoke('settings:delete', key))
  },
  radial: {
    setEnabled: (enabled: boolean) => invoke(ipcRenderer.invoke('radial:set-enabled', enabled)),
    setConfig: (items: unknown) => invoke(ipcRenderer.invoke('radial:set-config', items)),
    getConfig: () => invoke(ipcRenderer.invoke('radial:get-config')),
    pickProgram: () => invoke(ipcRenderer.invoke('radial:pick-program')),
    getFileIcon: (filePath: string) => invoke(ipcRenderer.invoke('radial:get-file-icon', filePath)),
    launchProgram: (programPath: string) => invoke(ipcRenderer.invoke('radial:launch-program', programPath)),
  },
  notification: {
    show: (options: {
      title: string
      body: string
      group?: string
      tag?: string
      urgency?: 'normal' | 'low' | 'critical'
      silent?: boolean
    }) => invoke(ipcRenderer.invoke('notification:show', options))
  },
  shortcut: {
    update: (key: string, value: string) => invoke(ipcRenderer.invoke('shortcut:update', key, value))
  },
  export: {
    logs: (format: 'csv' | 'markdown') => invoke(ipcRenderer.invoke('export:logs', format)),
    report: (content: string, dateRange: string) =>
      invoke(ipcRenderer.invoke('export:report', content, dateRange))
  },
  attachment: {
    add: (workLogId: number, data: any) => invoke(ipcRenderer.invoke('attachment:add', { workLogId, ...data })),
    list: (workLogId: number) => invoke(ipcRenderer.invoke('attachment:list', workLogId)),
    delete: (id: number) => invoke(ipcRenderer.invoke('attachment:delete', id)),
    pickFile: () => invoke(ipcRenderer.invoke('attachment:pickFile')),
  },
  feed: {
    add: (url: string, categoryId?: number | null) =>
      invoke(ipcRenderer.invoke('feed:add', url, categoryId)),
    list: () => invoke(ipcRenderer.invoke('feed:list')),
    update: (id: number, updates: Record<string, unknown>) =>
      invoke(ipcRenderer.invoke('feed:update', id, updates)),
    delete: (id: number) => invoke(ipcRenderer.invoke('feed:delete', id)),
    refresh: (id: number) => invoke(ipcRenderer.invoke('feed:refresh', id)),
    refreshAll: () => invoke(ipcRenderer.invoke('feed:refreshAll')),
    importOpml: (xml: string) => invoke(ipcRenderer.invoke('feed:importOpml', xml)),
    exportOpml: () => invoke(ipcRenderer.invoke('feed:exportOpml')),
    categories: {
      list: () => invoke(ipcRenderer.invoke('feed:categories:list')),
      add: (name: string) => invoke(ipcRenderer.invoke('feed:categories:add', name)),
      update: (id: number, name: string) => invoke(ipcRenderer.invoke('feed:categories:update', id, name)),
      delete: (id: number) => invoke(ipcRenderer.invoke('feed:categories:delete', id)),
    },
    articles: {
      list: (feedId?: number, filter?: string, limit?: number, offset?: number) =>
        invoke(ipcRenderer.invoke('feed:articles:list', feedId, filter, limit, offset)),
      read: (id: number) => invoke(ipcRenderer.invoke('feed:articles:read', id)),
      unread: (id: number) => invoke(ipcRenderer.invoke('feed:articles:unread', id)),
      star: (id: number) => invoke(ipcRenderer.invoke('feed:articles:star', id)),
      readAll: (feedId?: number) => invoke(ipcRenderer.invoke('feed:articles:readAll', feedId)),
    },
    exportPdf: (html: string, title: string, metadata?: { feedTitle?: string; author?: string; publishedAt?: string; url?: string }) =>
      invoke(ipcRenderer.invoke('feed:exportPdf', html, title, metadata)),
    onExportPdfProgress: (cb: (data: { stage: string; percent: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; percent: number }) => cb(data)
      ipcRenderer.on('feed:exportPdf-progress', handler)
      return () => ipcRenderer.removeListener('feed:exportPdf-progress', handler)
    },
  },
  dotnet: {
    invoke: (method: string, ...args: unknown[]) =>
      invoke(ipcRenderer.invoke('dotnet:invoke', method, args)) as Promise<string | number>,
  },
  vector: {
    initialize: () => invoke(ipcRenderer.invoke('vector:initialize')),
    indexWorklog: (id: number, content: string) =>
      invoke(ipcRenderer.invoke('vector:index-worklog', id, content)),
    search: (query: string, options?: { type?: string; topK?: number }) =>
      invoke(ipcRenderer.invoke('vector:search', query, options)),
    stats: () => invoke(ipcRenderer.invoke('vector:stats')),
    remove: (uri: string) => invoke(ipcRenderer.invoke('vector:remove', uri)),
    rebuild: () => invoke(ipcRenderer.invoke('vector:rebuild')),
    autoIndex: () => invoke(ipcRenderer.invoke('vector:auto-index')),
  },
  window: {
    getMaterial: (): Promise<string> => invoke(ipcRenderer.invoke('get-window-material')),
    setMaterial: (material: string): Promise<{ success: boolean }> =>
      invoke(ipcRenderer.invoke('set-window-material', material)),
  },
  on: {
    quickCreate: (cb: (type: QuickCreateType) => void) => {
      const logHandler = (): void => cb('log')
      const taskHandler = (): void => cb('task')
      ipcRenderer.on('quick-create:log', logHandler)
      ipcRenderer.on('quick-create:task', taskHandler)
      return () => {
        ipcRenderer.removeListener('quick-create:log', logHandler)
        ipcRenderer.removeListener('quick-create:task', taskHandler)
      }
    },
    navigate: (cb: (page: NavigatePage) => void) => {
      const pages: NavigatePage[] = ['worklog', 'kanban', 'report', 'reports', 'stats', 'calendar', 'chat', 'xray', 'onnx', 'ocr', 'pp', 'settings']
      const handlers = pages.map((page) => {
        const handler = (): void => cb(page)
        ipcRenderer.on(`navigate:${page}`, handler)
        return { page, handler }
      })
      return () => {
        handlers.forEach(({ page, handler }) =>
          ipcRenderer.removeListener(`navigate:${page}`, handler)
        )
      }
    },
    updateStatus: (cb: (state: AppUpdateState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: AppUpdateState): void => cb(state)
      ipcRenderer.on('app:update-status', handler)
      return () => {
        ipcRenderer.removeListener('app:update-status', handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)

    // 暴露给渲染进程的 AI API，封装在 `ai` 命名空间下
    contextBridge.exposeInMainWorld('ai', {
      invoke: (channel: string, ...args: any[]) => {
        const validChannels = ['ai-chat-stream', 'ai-chat-cancel'];
        if (validChannels.includes(channel)) {
          return invoke(ipcRenderer.invoke(channel, ...args));
        }
        throw new Error(`Invalid channel: ${channel}`);
      },
      on: (channel: string, listener: (...args: any[]) => void) => {
        const validChannels = ['ai-stream-chunk', 'ai-stream-done', 'ai-stream-error', 'ai-stream-reasoning', 'ai-stream-retry', 'ai-stream-request-id'];
        if (validChannels.includes(channel)) {
          ipcRenderer.on(channel, listener);
        }
      },
      removeAllListeners: (channel: string) => {
        const validChannels = ['ai-stream-chunk', 'ai-stream-done', 'ai-stream-error', 'ai-stream-reasoning', 'ai-stream-retry', 'ai-stream-request-id'];
        if (validChannels.includes(channel)) {
          ipcRenderer.removeAllListeners(channel);
        }
      },
      cancel: (requestId: string) => invoke(ipcRenderer.invoke('ai-chat-cancel', requestId)),
      saveLLMToken: (modelId: string, token: string) => invoke(ipcRenderer.invoke('llm-tokens:save', { modelId, token })),
      getLLMToken: (modelId: string) => invoke(ipcRenderer.invoke('llm-tokens:get', modelId)),
      deleteLLMToken: (modelId: string) => invoke(ipcRenderer.invoke('llm-tokens:delete', modelId)),
    });

    // 暴露安全的 API 给渲染进程
    contextBridge.exposeInMainWorld('pp', {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => {
          const validChannels = ['read-model-file'];
          if (!validChannels.includes(channel)) {
            throw new Error(`不允许的 IPC 通道: ${channel}`);
          }
          return invoke(ipcRenderer.invoke(channel, ...args));
        },
      },
    });
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
