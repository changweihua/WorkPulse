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
  onShow: (cb: () => void) => void
  onState: (cb: (info: { expanded: boolean; anchorX?: number; anchorY?: number }) => void) => void
  createLog: () => Promise<void>
  createTask: () => Promise<void>
  createMeeting: () => Promise<void>
  openAI: () => Promise<void>
  startCapture: () => Promise<boolean>
  onScreenshotResult: (cb: (result: { ok: boolean; file?: string; width?: number; height?: number }) => void) => void
  close: () => Promise<void>
  navigateTo: (page: string) => Promise<boolean>
  onCursor: (cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void) => void
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
