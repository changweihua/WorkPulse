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
  // 拖拽
  dragStart: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-start', mouseX, mouseY),
  dragMove: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-move', mouseX, mouseY),
  dragEnd: () => ipcRenderer.send('radial:drag-end'),
  // 透明区域鼠标穿透：renderer 转发 mousemove，主进程动态切换
  reportMouseMove: (clientX: number, clientY: number) => ipcRenderer.send('radial:mousemove', clientX, clientY),
})
