import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('radialApi', {
  // ── 状态监听（main → renderer） ──
  onState: (cb: (info: { expanded: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: unknown) => cb(info as any)
    ipcRenderer.on('radial:state', handler)
    return () => { ipcRenderer.removeListener('radial:state', handler) }
  },
  onCursor: (cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pos: unknown) => cb(pos as any)
    ipcRenderer.on('radial:cursor', handler)
    return () => { ipcRenderer.removeListener('radial:cursor', handler) }
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

  // ── 导航 ──
  navigateTo: (page: string) => ipcRenderer.invoke('radial:navigate-to', page),
  close: () => ipcRenderer.invoke('radial:close'),

  // ── 配置 ──
  getConfig: () => ipcRenderer.invoke('radial:get-config'),
  setConfig: (items: unknown) => ipcRenderer.invoke('radial:set-config', items),
})
