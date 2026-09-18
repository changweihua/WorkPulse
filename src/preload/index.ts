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

const api = {
  // 鏂板锛氬彂閫?IPC 娑堟伅鍒颁富杩涚▼
  send: (channel: string, ...args: any[]) => {
    const ALLOWED_SEND_CHANNELS = ['screenshot:ready', 'screenshot:cancel', 'screenshot:crop'] as const;
    if ((ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  app: {
    // 鑾峰彇寮€鏈哄惎鍔ㄧ姸鎬?    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    // 璁剧疆寮€鏈哄惎鍔?    setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('set-auto-launch', enable),
    // 鑾峰彇鍏抽棴琛屼负璁剧疆
    getCloseAction: () => ipcRenderer.invoke('get-close-action') as Promise<string>,
    // 璁剧疆鍏抽棴琛屼负
    setCloseAction: (action: string) => ipcRenderer.invoke('set-close-action', action),
    setLanguage: (language: AppLanguage) => ipcRenderer.invoke('app:language:update', language),
    getVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
    getUpdateState: () => ipcRenderer.invoke('app:updates:get-state') as Promise<AppUpdateState>,
    checkForUpdates: () => ipcRenderer.invoke('app:updates:check') as Promise<AppUpdateState>,
    installUpdate: () => ipcRenderer.invoke('app:updates:install') as Promise<boolean>,
    openBackupDir: () => ipcRenderer.invoke('app:open-backup-dir') as Promise<string>
  },
  worklog: {
    add: (content: string, category?: string) =>
      ipcRenderer.invoke('worklog:add', content, category),
    list: (limit?: number, offset?: number) =>
      ipcRenderer.invoke('worklog:list', limit, offset),
    byDateRange: (from: string, to: string) =>
      ipcRenderer.invoke('worklog:byDateRange', from, to),
    search: (keyword: string) => ipcRenderer.invoke('worklog:search', keyword),
    categories: () => ipcRenderer.invoke('worklog:categories') as Promise<string[]>,
    setCategory: (id: number, category: string) =>
      ipcRenderer.invoke('worklog:setCategory', id, category),
    update: (id: number, content: string, category: string, created_at?: string) =>
      ipcRenderer.invoke('worklog:update', id, content, category, created_at),
    delete: (id: number) => ipcRenderer.invoke('worklog:delete', id),
    restore: (log: { content: string; category: string; created_at: string; task_id: number | null }) =>
      ipcRenderer.invoke('worklog:restore', log)
  },
  task: {
    add: (title: string, description?: string, status?: 'todo' | 'draft', createdAt?: string) =>
      ipcRenderer.invoke('task:add', title, description, status, createdAt),
    list: () => ipcRenderer.invoke('task:list'),
    update: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('task:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('task:delete', id),
    reorder: (taskIds: number[], status: string) =>
      ipcRenderer.invoke('task:reorder', taskIds, status),
    complete: (id: number, logContent: string) =>
      ipcRenderer.invoke('task:complete', id, logContent),
    completeOnly: (id: number) =>
      ipcRenderer.invoke('task:completeOnly', id) as Promise<any>,
  },
  stats: {
    get: (days?: number) => ipcRenderer.invoke('stats:get', days)
  },
  event: {
    add: (input: Record<string, unknown>) => ipcRenderer.invoke('event:add', input),
    byDate: (date: string) => ipcRenderer.invoke('event:byDate', date),
    byRange: (from: string, to: string) => ipcRenderer.invoke('event:byRange', from, to),
    update: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('event:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('event:delete', id),
  },
  import: {
    logs: () => ipcRenderer.invoke('import:logs') as Promise<{ imported: number; skipped: number; filePath: string } | null>,
  },
  report: {
    generate: (dateFrom: string, dateTo: string) =>
      ipcRenderer.invoke('report:generate', dateFrom, dateTo),
    weekly: (start: string, end: string) =>
      ipcRenderer.invoke('report:weekly', start, end),
    create: (type: string, dateFrom: string, dateTo: string, content: string) =>
      ipcRenderer.invoke('report:create', type, dateFrom, dateTo, content),
    list: (limit?: number) => ipcRenderer.invoke('report:list', limit),
    update: (id: number, content: string) =>
      ipcRenderer.invoke('report:update', id, content)
  },
  ai: {
    streamChat: (prompt: string) => {
      // 浠庡叏灞€閰嶇疆鑾峰彇娲昏穬妯″瀷閰嶇疆锛堝紓姝ヨ幏鍙栵紝浼犵粰 handler锛?      ipcRenderer.invoke('ai-chat-stream', { userMessage: prompt, history: [] })
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
      ipcRenderer.invoke('model:ensure', modelId, required, optional) as Promise<{
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
    /** 鑾峰彇鍏ㄥ眬妯″瀷閰嶇疆锛坈hat / embedding锛夆€?鍚戝悗鍏煎 */
    getConfig: (type?: 'chat' | 'embedding') =>
      ipcRenderer.invoke('model:get-config', type || 'chat') as Promise<{
        type: 'chat' | 'embedding'
        provider: string
        baseUrl: string
        model: string
        hasApiKey: boolean
        dimension?: number
      }>,
    /** 鑾峰彇瀹屾暣鍏ㄥ眬妯″瀷閰嶇疆锛堜笉鍚槑鏂?token锛?*/
    getGlobalConfig: () =>
      ipcRenderer.invoke('model:get-global-config') as Promise<{
        chatConfigs: Array<{
          id: string; name: string; baseURL: string; model: string;
          token: string; headers: string; temperature: number; max_tokens: number; top_p: number
        }>
        activeChatConfigId: string
        embedding: {
          provider: string; baseURL: string; model: string; dimension: number; token: string
        }
      }>,
    /** 淇濆瓨瀹屾暣鍏ㄥ眬妯″瀷閰嶇疆 */
    setGlobalConfig: (config: any) =>
      ipcRenderer.invoke('model:set-global-config', config) as Promise<{ ok: boolean }>,
    /** 鑾峰彇褰撳墠娲昏穬 Chat 閰嶇疆 */
    getActiveChat: () =>
      ipcRenderer.invoke('model:get-active-chat') as Promise<{
        id: string; name: string; baseURL: string; model: string;
        token: string; headers: string; temperature: number; max_tokens: number; top_p: number
      } | null>,
    /** 璁剧疆娲昏穬 Chat 閰嶇疆 */
    setActiveChat: (configId: string) =>
      ipcRenderer.invoke('model:set-active-chat', configId) as Promise<{ ok: boolean }>,
    /** 娣诲姞 Chat 閰嶇疆 */
    addChatConfig: (config: any) =>
      ipcRenderer.invoke('model:add-chat-config', config) as Promise<{ ok: boolean }>,
    /** 鏇存柊 Chat 閰嶇疆 */
    updateChatConfig: (config: any) =>
      ipcRenderer.invoke('model:update-chat-config', config) as Promise<{ ok: boolean }>,
    /** 鍒犻櫎 Chat 閰嶇疆 */
    deleteChatConfig: (configId: string) =>
      ipcRenderer.invoke('model:delete-chat-config', configId) as Promise<{ ok: boolean }>,
    /** 鏇存柊 Embedding 閰嶇疆鍒楄〃 */
    updateEmbedding: (params: { embeddingConfigs: any[]; activeEmbeddingConfigId: string }) =>
      ipcRenderer.invoke('model:update-embedding', params) as Promise<{ ok: boolean }>,
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key)
  },
  radial: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('radial:set-enabled', enabled),
    setConfig: (items: unknown) => ipcRenderer.invoke('radial:set-config', items),
    getConfig: () => ipcRenderer.invoke('radial:get-config'),
    pickProgram: () => ipcRenderer.invoke('radial:pick-program'),
    getFileIcon: (filePath: string) => ipcRenderer.invoke('radial:get-file-icon', filePath),
    launchProgram: (programPath: string) => ipcRenderer.invoke('radial:launch-program', programPath),
  },
  notification: {
    show: (options: {
      title: string
      body: string
      group?: string
      tag?: string
      urgency?: 'normal' | 'low' | 'critical'
      silent?: boolean
    }) => ipcRenderer.invoke('notification:show', options)
  },
  shortcut: {
    update: (key: string, value: string) => ipcRenderer.invoke('shortcut:update', key, value)
  },
  export: {
    logs: (format: 'csv' | 'markdown') => ipcRenderer.invoke('export:logs', format),
    report: (content: string, dateRange: string) =>
      ipcRenderer.invoke('export:report', content, dateRange)
  },
  attachment: {
    add: (workLogId: number, data: any) => ipcRenderer.invoke('attachment:add', workLogId, data),
    list: (workLogId: number) => ipcRenderer.invoke('attachment:list', workLogId),
    delete: (id: number) => ipcRenderer.invoke('attachment:delete', id),
    pickFile: () => ipcRenderer.invoke('attachment:pickFile'),
  },
  feed: {
    add: (url: string, categoryId?: number | null) =>
      ipcRenderer.invoke('feed:add', url, categoryId),
    list: () => ipcRenderer.invoke('feed:list'),
    update: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('feed:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('feed:delete', id),
    refresh: (id: number) => ipcRenderer.invoke('feed:refresh', id),
    refreshAll: () => ipcRenderer.invoke('feed:refreshAll'),
    importOpml: (xml: string) => ipcRenderer.invoke('feed:importOpml', xml),
    exportOpml: () => ipcRenderer.invoke('feed:exportOpml'),
    categories: {
      list: () => ipcRenderer.invoke('feed:categories:list'),
      add: (name: string) => ipcRenderer.invoke('feed:categories:add', name),
      update: (id: number, name: string) => ipcRenderer.invoke('feed:categories:update', id, name),
      delete: (id: number) => ipcRenderer.invoke('feed:categories:delete', id),
    },
    articles: {
      list: (feedId?: number, filter?: string, limit?: number, offset?: number) =>
        ipcRenderer.invoke('feed:articles:list', feedId, filter, limit, offset),
      read: (id: number) => ipcRenderer.invoke('feed:articles:read', id),
      unread: (id: number) => ipcRenderer.invoke('feed:articles:unread', id),
      star: (id: number) => ipcRenderer.invoke('feed:articles:star', id),
      readAll: (feedId?: number) => ipcRenderer.invoke('feed:articles:readAll', feedId),
    },
    exportPdf: (html: string, title: string, metadata?: { feedTitle?: string; author?: string; publishedAt?: string; url?: string }) =>
      ipcRenderer.invoke('feed:exportPdf', html, title, metadata),
    onExportPdfProgress: (cb: (data: { stage: string; percent: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; percent: number }) => cb(data)
      ipcRenderer.on('feed:exportPdf-progress', handler)
      return () => ipcRenderer.removeListener('feed:exportPdf-progress', handler)
    },
  },
  dotnet: {
    invoke: (method: string, ...args: unknown[]) =>
      ipcRenderer.invoke('dotnet:invoke', method, ...args) as Promise<string | number>,
  },
  vector: {
    initialize: () => ipcRenderer.invoke('vector:initialize'),
    indexWorklog: (id: number, content: string, category: string, date: string) =>
      ipcRenderer.invoke('vector:index-worklog', id, content, category, date),
    indexConversation: (id: string, title: string, messages: Array<{ role: string; content: string }>) =>
      ipcRenderer.invoke('vector:index-conversation', id, title, messages),
    search: (query: string, options?: { type?: string; topK?: number; bm25?: boolean }) =>
      ipcRenderer.invoke('vector:search', query, options),
    stats: () => ipcRenderer.invoke('vector:stats'),
    remove: (uri: string) => ipcRenderer.invoke('vector:remove', uri),
    rebuild: () => ipcRenderer.invoke('vector:rebuild'),
  },
  // 绐楀彛鎺у埗锛圵CO 鍘熺敓鎸夐挳鎺ョ minimize/maximize/close锛屼粎淇濈暀鏉愯川鍒囨崲锛?  window: {
    getMaterial: (): Promise<string> => ipcRenderer.invoke('get-window-material'),
    setMaterial: (material: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('set-window-material', material),
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

    // 鏆撮湶缁欐覆鏌撹繘绋嬬殑 API锛屽皝瑁呭湪 `ai` 鍛藉悕绌洪棿涓?    contextBridge.exposeInMainWorld('ai', {
      invoke: (channel: string, ...args: any[]) => {
        const validChannels = ['ai-chat-stream', 'ai-chat-cancel'];
        if (validChannels.includes(channel)) {
          return ipcRenderer.invoke(channel, ...args);
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
      cancel: (requestId: string) => ipcRenderer.invoke('ai-chat-cancel', requestId),
      saveLLMToken: (modelId: string, token: string) => ipcRenderer.invoke('llm-tokens:save', { modelId, token }),
      getLLMToken: (modelId: string) => ipcRenderer.invoke('llm-tokens:get', modelId),
      deleteLLMToken: (modelId: string) => ipcRenderer.invoke('llm-tokens:delete', modelId),
    });

    // 鏆撮湶瀹夊叏鐨?API 缁欐覆鏌撹繘绋?    contextBridge.exposeInMainWorld('pp', {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => {
          // 鍙厑璁哥壒瀹氶€氶亾
          const validChannels = ['read-model-file'];
          if (!validChannels.includes(channel)) {
            throw new Error(`涓嶅厑璁哥殑 IPC 閫氶亾: ${channel}`);
          }
          return ipcRenderer.invoke(channel, ...args);
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
