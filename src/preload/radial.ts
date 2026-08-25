import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('radialApi', {
  onShow: (cb: () => void) => {
    ipcRenderer.on('radial:show', () => cb())
  },
  // Actions the radial menu can trigger
  createLog: () => ipcRenderer.invoke('radial:action', 'log'),
  createTask: () => ipcRenderer.invoke('radial:action', 'task'),
  createMeeting: () => ipcRenderer.invoke('radial:action', 'meeting'),
  openAI: () => ipcRenderer.invoke('radial:action', 'ai'),
  close: () => ipcRenderer.invoke('radial:close'),
})
