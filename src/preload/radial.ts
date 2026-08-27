import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('radialApi', {
  onShow: (cb: () => void) => {
    ipcRenderer.on('radial:show', () => cb())
  },
  // Actions
  createLog: () => ipcRenderer.invoke('radial:action', 'log'),
  createTask: () => ipcRenderer.invoke('radial:action', 'task'),
  createMeeting: () => ipcRenderer.invoke('radial:action', 'meeting'),
  openAI: () => ipcRenderer.invoke('radial:action', 'ai'),
  startCapture: () => ipcRenderer.invoke('screenshot:start'),
  onScreenshotResult: (cb: (result: { ok: boolean; file?: string; width?: number; height?: number }) => void) => {
    ipcRenderer.on('screenshot:result', (_event, result) => cb(result))
  },
  close: () => ipcRenderer.invoke('radial:close'),
  navigateTo: (page: string) => ipcRenderer.invoke('radial:navigate-to', page),
  // 方案 C：折叠/展开
  expand: () => ipcRenderer.send('radial:expand'),
  collapse: () => ipcRenderer.send('radial:collapse'),
  // 方案 C：切换窗口交互状态（hover 中心时设为可交互）
  interactive: (on: boolean) => ipcRenderer.send('radial:interactive', on),
  // 拖拽
  dragStart: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-start', mouseX, mouseY),
  dragMove: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-move', mouseX, mouseY),
  dragEnd: () => ipcRenderer.send('radial:drag-end'),
})
