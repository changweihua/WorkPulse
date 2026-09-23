import { contextBridge, ipcRenderer } from 'electron'

/** 本窗 ready 载荷（每屏一窗）：本屏信息 + 全部屏联合 bounds */
interface ReadyInfo {
  displayId: number
  displayBounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  unionBounds: { x: number; y: number; width: number; height: number }
}

/** 选区矩形（绝对全局 DIP，w/h；crop 上报时转 width/height） */
interface SelRect {
  x: number
  y: number
  w: number
  h: number
}

interface CommitInfo {
  rect: SelRect
  /** 工具栏应显示的显示器 id（commit 时的光标所在屏） */
  displayId: number
}

interface CursorInfo {
  gx: number
  gy: number
}

interface ResultInfo {
  ok: boolean
  message: string
  displayId: number
}

type CropRect = { x: number; y: number; width: number; height: number }
type CropResult = { ok: boolean; file?: string; width?: number; height?: number; error?: string }

/**
 * 通用缓冲订阅：preload 在渲染层 React 挂载前就监听通道，避免错过首条消息
 * （如 ready）。只缓冲订阅前的最后一条，订阅时若有积压立即补发。
 */
function bufferedChannel<T>(channel: string): (cb: (payload: T) => void) => void {
  let handler: ((payload: T) => void) | null = null
  let pending: T | null = null
  let hasPending = false
  ipcRenderer.on(channel, (_event, payload: T) => {
    if (handler) {
      handler(payload)
    } else {
      pending = payload
      hasPending = true
    }
  })
  return (cb: (payload: T) => void) => {
    handler = cb
    if (hasPending) {
      cb(pending as T)
      hasPending = false
      pending = null
    }
  }
}

// 主进程 → 渲染层广播通道
const onReady = bufferedChannel<ReadyInfo>('screenshot:ready')
const onCursor = bufferedChannel<CursorInfo>('screenshot:cursor')
const onSelection = bufferedChannel<SelRect | null>('screenshot:selection')
const onCommit = bufferedChannel<CommitInfo | null>('screenshot:commit')
const onCapturing = bufferedChannel<void>('screenshot:capturing')
const onReset = bufferedChannel<void>('screenshot:reset')
const onResult = bufferedChannel<ResultInfo>('screenshot:result')

contextBridge.exposeInMainWorld('screenshotOverlayApi', {
  onReady,
  onCursor,
  onSelection,
  onCommit,
  onCapturing,
  onReset,
  onResult,
  // 鼠标事件单向上报：坐标为绝对全局 DIP（渲染层用 client + 本窗 displayBounds 原点换算）
  down: (gx: number, gy: number, shiftKey: boolean) => ipcRenderer.send('screenshot:down', { gx, gy, shiftKey }),
  move: (gx: number, gy: number, shiftKey: boolean) => ipcRenderer.send('screenshot:move', { gx, gy, shiftKey }),
  up: (gx: number, gy: number) => ipcRenderer.send('screenshot:up', { gx, gy }),
  dblClick: (gx: number, gy: number) => ipcRenderer.send('screenshot:dblclick', { gx, gy }),
  // crop 的 rect 同样为绝对全局 DIP（主进程入口归一化为 union 本地坐标）
  crop: (rect: CropRect, action?: 'copy' | 'save' | 'both', full?: boolean) =>
    ipcRenderer.invoke('screenshot:crop', rect, action || 'both', full || false) as Promise<CropResult>,
  cancel: () => ipcRenderer.invoke('screenshot:cancel'),
})
