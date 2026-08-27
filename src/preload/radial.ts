import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('radialApi', {
  onShow: (cb: () => void) => {
    ipcRenderer.on('radial:show', () => cb())
  },
  // 主进程通知窗口状态变化（展开/收起）
  onState: (cb: (info: { expanded: boolean }) => void) => {
    ipcRenderer.on('radial:state', (_event, info) => cb(info))
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
  // 折叠 / 展开
  expand: () => ipcRenderer.send('radial:expand'),
  collapse: () => ipcRenderer.send('radial:collapse'),
  // 光标位置（主进程轮询）
  onCursor: (cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void) => {
    ipcRenderer.on('radial:cursor', (_event, info) => cb(info))
  },
  // 拖拽（movable:false，完全由主进程 IPC 控制）
  dragStart: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-start', mouseX, mouseY),
  dragMove: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-move', mouseX, mouseY),
  dragEnd: () => ipcRenderer.send('radial:drag-end'),
})
