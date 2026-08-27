import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('radialApi', {
  // ── 状态监听（main → renderer） ──
  onState: (cb: (info: { expanded: boolean }) => void) => {
    ipcRenderer.on('radial:state', (_event, info) => cb(info))
  },
  onCursor: (cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void) => {
    ipcRenderer.on('radial:cursor', (_event, info) => cb(info))
  },

  // ── 交互动作（renderer → main） ──
  centerClick: () => ipcRenderer.send('radial:center-click'),
  segmentClick: (key: string) => ipcRenderer.send('radial:segment-click', key),

  // ── 拖拽（mousedown → mousemove → mouseup） ──
  dragStart: () => ipcRenderer.send('radial:drag-start'),
  dragMove: (dx: number, dy: number) => ipcRenderer.send('radial:drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('radial:drag-end'),

  // ── 截图 ──
  startCapture: () => ipcRenderer.invoke('screenshot:start'),
  onScreenshotResult: (cb: (result: { ok: boolean; file?: string; width?: number; height?: number }) => void) => {
    ipcRenderer.on('screenshot:result', (_event, result) => cb(result))
  },

  // ── 导航 ──
  navigateTo: (page: string) => ipcRenderer.invoke('radial:navigate-to', page),
  close: () => ipcRenderer.invoke('radial:close'),

  // ── 配置 ──
  getConfig: () => ipcRenderer.invoke('radial:get-config'),
  setConfig: (items: unknown) => ipcRenderer.invoke('radial:set-config', items),
})
