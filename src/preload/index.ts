import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { exposeUIKit } from '@electron-uikit/core/preload'

type QuickCreateType = 'log' | 'task'
type NavigatePage = 'worklog' | 'kanban' | 'report' | 'stats' | 'settings'
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
  // 新增：发送 IPC 消息到主进程
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
  app: {
    // 获取开机启动状态
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    // 设置开机启动
    setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('set-auto-launch', enable),
    // 获取关闭行为设置
    getCloseAction: () => ipcRenderer.invoke('get-close-action') as Promise<string>,
    // 设置关闭行为
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
    create: (type: string, dateFrom: string, dateTo: string, content: string) =>
      ipcRenderer.invoke('report:create', type, dateFrom, dateTo, content),
    list: (limit?: number) => ipcRenderer.invoke('report:list', limit),
    update: (id: number, content: string) =>
      ipcRenderer.invoke('report:update', id, content)
  },
  ai: {
    streamChat: (prompt: string) => {
      ipcRenderer.invoke('ai:stream-chat', prompt)
      return {
        onChunk: (cb: (text: string) => void) => {
          const handler = (_e: any, text: string) => cb(text)
          ipcRenderer.on('ai:stream-chunk', handler)
          return () => ipcRenderer.removeListener('ai:stream-chunk', handler)
        },
        onDone: (cb: () => void) => {
          const handler = () => cb()
          ipcRenderer.on('ai:stream-done', handler)
          return () => ipcRenderer.removeListener('ai:stream-done', handler)
        },
        onError: (cb: (err: string) => void) => {
          const handler = (_e: any, err: string) => cb(err)
          ipcRenderer.on('ai:stream-error', handler)
          return () => ipcRenderer.removeListener('ai:stream-error', handler)
        }
      }
    }
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key)
  },
  shortcut: {
    update: (key: string, value: string) => ipcRenderer.invoke('shortcut:update', key, value)
  },
  export: {
    logs: (format: 'csv' | 'markdown') => ipcRenderer.invoke('export:logs', format),
    report: (content: string, dateRange: string) =>
      ipcRenderer.invoke('export:report', content, dateRange)
  },
  // 新增：窗口控制
  window: {
    minimize: () => ipcRenderer.send('window-control', 'minimize'),
    maximize: () => ipcRenderer.send('window-control', 'maximize'),
    close: () => ipcRenderer.send('window-control', 'close'),
    setMicaTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.send('mica:set-theme', theme),
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
      const pages: NavigatePage[] = ['worklog', 'kanban', 'report', 'stats', 'settings']
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

    // 暴露给渲染进程的 API，封装在 `ai` 命名空间下
    contextBridge.exposeInMainWorld('ai', {
      invoke: (channel: string, ...args: any[]) => {
        const validChannels = ['ai-chat-stream'];
        if (validChannels.includes(channel)) {
          return ipcRenderer.invoke(channel, ...args);
        }
        throw new Error(`Invalid channel: ${channel}`);
      },
      on: (channel: string, listener: (...args: any[]) => void) => {
        const validChannels = ['ai-stream-chunk', 'ai-stream-done', 'ai-stream-error', 'ai-stream-reasoning',];
        if (validChannels.includes(channel)) {
          ipcRenderer.on(channel, listener);
        }
      },
      removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
      },
    });

    contextBridge.exposeInMainWorld('nativeAPI', {
      sayHello: (name: string) => ipcRenderer.invoke('say-hello', name),
    });

    // 暴露安全的 API 给渲染进程
    contextBridge.exposeInMainWorld('pp', {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => {
          // 只允许特定通道
          const validChannels = ['read-model-file'];
          if (!validChannels.includes(channel)) {
            throw new Error(`不允许的 IPC 通道: ${channel}`);
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

exposeUIKit()