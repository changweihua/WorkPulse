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

interface ScreenshotOverlayApi {
  onReady: (cb: (info: { dataUrl?: string; width: number; height: number; scaleFactor: number }) => void) => void
  crop: (rect: { x: number; y: number; width: number; height: number }, action?: 'copy' | 'save' | 'both', full?: boolean) => Promise<{ ok: boolean; file?: string; width?: number; height?: number }>
  cancel: () => Promise<boolean>
}

declare global {
  interface Window {
    radialApi: RadialApi
    screenshotOverlayApi: ScreenshotOverlayApi
  }
}

export {}
