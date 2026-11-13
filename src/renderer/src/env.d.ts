/// <reference path="../../preload/index.d.ts" />
/// <reference types="vite/client" />

import type { HwStats } from '../../shared/hw-stats';
import type { DeviceDetails, WindowMaterial } from '../../shared/touchbar';

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  // 可以添加更多环境变量
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface RadialApi {
  // 状态监听（main → renderer）
  onState: (cb: (info: { expanded: boolean }) => void) => void;
  onCursor: (
    cb: (info: { x: number; y: number; dist: number; isOverCenter: boolean }) => void,
  ) => void;
  /** 订阅硬件状态推送（通道 'hw-stats'），返回取消订阅函数 */
  onHwStats: (cb: (stats: HwStats) => void) => () => void;
  // 交互动作（renderer → main）
  centerClick: () => void;
  segmentClick: (key: string, item?: unknown) => void;
  // 拖拽
  dragStart: () => void;
  dragMove: () => void;
  dragEnd: () => void;
  // 截图
  startCapture: () => Promise<boolean>;
  onScreenshotResult: (
    cb: (result: { ok: boolean; file?: string; width?: number; height?: number }) => void,
  ) => void;
  // 导航
  navigateTo: (page: string) => Promise<boolean>;
  close: () => Promise<void>;
  // 配置
  getConfig: () => Promise<unknown[]>;
  setConfig: (items: unknown) => Promise<boolean>;
  // 配置变更监听（与 preload/radial.ts 暴露的实现对齐），返回取消订阅函数
  onConfigChanged?: (cb: (items?: unknown) => void) => () => void;
}

interface TouchbarApi {
  // 状态监听（main → renderer）
  onState: (cb: (state: { expanded: boolean }) => void) => () => void;
  onHwStats: (cb: (stats: HwStats) => void) => () => void;
  onConfigChanged: (cb: (items?: unknown) => void) => () => void;
  onMaterialChanged: (cb: (material: WindowMaterial) => void) => () => void;
  onPinnedChanged: (cb: (pinned: boolean) => void) => () => void;
  onDetailsChanged: (cb: (details: DeviceDetails) => void) => () => void;
  onPopoverReset: (cb: () => void) => () => void;
  // 交互动作（renderer → main）
  itemClick: (key: string, item?: unknown) => void;
  toggleExpand: () => void;
  dragStart: () => void;
  dragMove: () => void;
  dragEnd: () => void;
  // 配置
  getConfig: () => Promise<unknown[]>;
  setConfig: (items: unknown) => Promise<{ ok: boolean }>;
  getPrograms: () => Promise<unknown[]>;
  // 悬停详情卡片
  getDetails: () => Promise<DeviceDetails>;
  setPopover: (open: boolean) => Promise<{ ok: boolean }>;
  openTaskManager: () => Promise<{ ok: boolean }>;
  // 窗口材质 / 置顶
  getMaterial: () => Promise<WindowMaterial>;
  getPinned: () => Promise<boolean>;
  setPinned: (pinned: boolean) => Promise<boolean>;
  // 形态切换
  getMode: () => Promise<'radial' | 'touchbar'>;
  setMode: (mode: 'radial' | 'touchbar') => Promise<{ ok: boolean }>;
  // 系统快捷控制
  volumeGet: () => Promise<{ level: number | null }>;
  volumeSet: (level: number) => Promise<{ success: boolean }>;
  volumeStep: (delta: number) => Promise<{ level: number | null }>;
  volumeMute: () => void;
  brightnessStep: (delta: number) => Promise<{ current: number | null; supported: boolean }>;
  toggleWifi: () => Promise<{ enabled: boolean | null; needsSettings: boolean; message?: string }>;
  toggleBluetooth: () => Promise<{
    enabled: boolean | null;
    needsSettings: boolean;
    message?: string;
  }>;
  openSettings: (uri: string) => Promise<{ ok: boolean }>;
  // 导航 / 关闭
  navigateTo: (page: string) => Promise<{ ok: boolean }>;
  close: () => Promise<{ ok: boolean }>;
}

/** 选区矩形（绝对全局 DIP，w/h；crop 上报时转 width/height） */
interface ScreenshotSelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ScreenshotCommitInfo {
  rect: ScreenshotSelRect;
  /** 工具栏应显示的显示器 id（commit 时的光标所在屏） */
  displayId: number;
}

interface ScreenshotOverlayApi {
  // 主进程 → 渲染层广播
  onReady: (
    cb: (info: {
      displayId: number;
      displayBounds: { x: number; y: number; width: number; height: number };
      scaleFactor: number;
      unionBounds: { x: number; y: number; width: number; height: number };
    }) => void,
  ) => void;
  onCursor: (cb: (p: { gx: number; gy: number }) => void) => void;
  onSelection: (cb: (rect: ScreenshotSelRect | null) => void) => void;
  onCommit: (cb: (info: ScreenshotCommitInfo | null) => void) => void;
  onCapturing: (cb: () => void) => void;
  onReset: (cb: () => void) => void;
  onResult: (cb: (r: { ok: boolean; message: string; displayId: number }) => void) => void;
  // 渲染层 → 主进程：鼠标事件单向上报（绝对全局 DIP 坐标）
  down: (gx: number, gy: number, shiftKey: boolean) => void;
  move: (gx: number, gy: number, shiftKey: boolean) => void;
  up: (gx: number, gy: number) => void;
  dblClick: (gx: number, gy: number) => void;
  crop: (
    rect: { x: number; y: number; width: number; height: number },
    action?: 'copy' | 'save' | 'both',
    full?: boolean,
  ) => Promise<{ ok: boolean; file?: string; width?: number; height?: number; error?: string }>;
  cancel: () => Promise<boolean>;
}

declare global {
  interface Window {
    radialApi: RadialApi;
    screenshotOverlayApi: ScreenshotOverlayApi;
    touchbarApi: TouchbarApi;
  }
}

export {};
