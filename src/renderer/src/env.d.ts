/// <reference path="../../preload/index.d.ts" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string
    // 可以添加更多环境变量
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

interface RadialApi {
  // 状态监听（main → renderer）
  onState: (cb: (info: { expanded: boolean }) => void) => void
  onCursor: (cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void) => void
  // 交互动作（renderer → main）
  centerClick: () => void
  segmentClick: (key: string) => void
  // 拖拽
  dragStart: () => void
  dragMove: (dx: number, dy: number) => void
  dragEnd: () => void
  // 截图
  startCapture: () => Promise<boolean>
  onScreenshotResult: (cb: (result: { ok: boolean; file?: string; width?: number; height?: number }) => void) => void
  // 导航
  navigateTo: (page: string) => Promise<boolean>
  close: () => Promise<void>
  // 配置
  getConfig: () => Promise<unknown[]>
  setConfig: (items: unknown) => Promise<boolean>
}

/** 选区矩形（绝对全局 DIP，w/h；crop 上报时转 width/height） */
interface ScreenshotSelRect {
  x: number
  y: number
  w: number
  h: number
}

interface ScreenshotCommitInfo {
  rect: ScreenshotSelRect
  /** 工具栏应显示的显示器 id（commit 时的光标所在屏） */
  displayId: number
}

interface ScreenshotOverlayApi {
  // 主进程 → 渲染层广播
  onReady: (cb: (info: {
    displayId: number
    displayBounds: { x: number; y: number; width: number; height: number }
    scaleFactor: number
    unionBounds: { x: number; y: number; width: number; height: number }
  }) => void) => void
  onCursor: (cb: (p: { gx: number; gy: number }) => void) => void
  onSelection: (cb: (rect: ScreenshotSelRect | null) => void) => void
  onCommit: (cb: (info: ScreenshotCommitInfo | null) => void) => void
  onCapturing: (cb: () => void) => void
  onReset: (cb: () => void) => void
  onResult: (cb: (r: { ok: boolean; message: string; displayId: number }) => void) => void
  // 渲染层 → 主进程：鼠标事件单向上报（绝对全局 DIP 坐标）
  down: (gx: number, gy: number, shiftKey: boolean) => void
  move: (gx: number, gy: number, shiftKey: boolean) => void
  up: (gx: number, gy: number) => void
  dblClick: (gx: number, gy: number) => void
  crop: (rect: { x: number; y: number; width: number; height: number }, action?: 'copy' | 'save' | 'both', full?: boolean) => Promise<{ ok: boolean; file?: string; width?: number; height?: number; error?: string }>
  cancel: () => Promise<boolean>
}

declare global {
  interface Window {
    radialApi: RadialApi
    screenshotOverlayApi: ScreenshotOverlayApi
  }
}

export {}
