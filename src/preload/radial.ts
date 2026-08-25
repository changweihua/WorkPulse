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
  capture: () => ipcRenderer.invoke('screenshot:capture'),
  close: () => ipcRenderer.invoke('radial:close'),
  // 拖拽
  dragStart: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-start', mouseX, mouseY),
  dragMove: (mouseX: number, mouseY: number) => ipcRenderer.send('radial:drag-move', mouseX, mouseY),
  dragEnd: () => ipcRenderer.send('radial:drag-end'),
})
