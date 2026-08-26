import { contextBridge, ipcRenderer } from 'electron'

interface ScreenshotReadyInfo {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

interface ScreenshotRect {
  x: number
  y: number
  width: number
  height: number
}

contextBridge.exposeInMainWorld('screenshotOverlayApi', {
  // 主进程推送截图数据
  onReady: (cb: (info: ScreenshotReadyInfo) => void) => {
    ipcRenderer.on('screenshot:ready', (_event, info: ScreenshotReadyInfo) => cb(info))
  },
  // 提交裁剪区域（坐标为 CSS 像素，主进程会乘以 scaleFactor）
  crop: (rect: ScreenshotRect) => ipcRenderer.invoke('screenshot:crop', rect),
  // 取消截图
  cancel: () => ipcRenderer.invoke('screenshot:cancel'),
})
