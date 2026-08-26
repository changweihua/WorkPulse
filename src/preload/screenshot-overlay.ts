import { contextBridge, ipcRenderer } from 'electron'

interface ScreenshotReadyInfo {
  dataUrl?: string
  width: number
  height: number
  scaleFactor: number
}

// Eager IPC listener — buffers data if handler not yet set
let readyHandler: ((info: ScreenshotReadyInfo) => void) | null = null
let pendingReady: ScreenshotReadyInfo | null = null

ipcRenderer.on('screenshot:ready', (_event, info: ScreenshotReadyInfo) => {
  if (readyHandler) readyHandler(info)
  else pendingReady = info
})

contextBridge.exposeInMainWorld('screenshotOverlayApi', {
  onReady: (cb: (info: ScreenshotReadyInfo) => void) => {
    readyHandler = cb
    if (pendingReady) {
      cb(pendingReady)
      pendingReady = null
    }
  },
  crop: (rect: { x: number; y: number; width: number; height: number }, action?: 'copy' | 'save' | 'both', full?: boolean) =>
    ipcRenderer.invoke('screenshot:crop', rect, action || 'both', full || false),
  cancel: () => ipcRenderer.invoke('screenshot:cancel'),
})
