/**
 * Touch Bar 窗口 preload：向 window.touchbarApi 暴露主进程能力
 *
 * 所有 invoke 都经过本地 unwrap：主进程 handler 返回 IpcResult（{ ok, data }），
 * 这里解出 data 再交给渲染层，与 window.api 的行为保持一致。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DeviceDetails, WindowMaterial } from '../shared/touchbar';

const HW_STATS_CHANNEL = 'hw-stats';

interface IpcOk {
  ok: true;
  data: unknown;
}
interface IpcFail {
  ok: false;
  error: { code: string; message: string; issues?: unknown[] };
}
type IpcResult<T = unknown> = IpcOk | IpcFail;

async function invoke<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.data as T;
  const err = new Error(result.error.message);
  (err as Error & { code: string }).code = result.error.code;
  throw err;
}

const touchbarApi = {
  // 状态 / 硬件数据
  onState: (callback: (state: { expanded: boolean }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: { expanded: boolean }): void =>
      callback(state);
    ipcRenderer.on('touchbar:state', listener);
    return () => ipcRenderer.removeListener('touchbar:state', listener);
  },
  onHwStats: (callback: (stats: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, stats: unknown): void => callback(stats);
    ipcRenderer.on(HW_STATS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(HW_STATS_CHANNEL, listener);
  },
  onConfigChanged: (callback: (items: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, items: unknown[]): void => callback(items);
    ipcRenderer.on('touchbar:config-changed', listener);
    return () => ipcRenderer.removeListener('touchbar:config-changed', listener);
  },
  onMaterialChanged: (callback: (material: WindowMaterial) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, material: WindowMaterial): void =>
      callback(material);
    ipcRenderer.on('touchbar:material', listener);
    return () => ipcRenderer.removeListener('touchbar:material', listener);
  },
  onPinnedChanged: (callback: (pinned: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, value: boolean): void => callback(value);
    ipcRenderer.on('touchbar:pinned', listener);
    return () => ipcRenderer.removeListener('touchbar:pinned', listener);
  },
  onDetailsChanged: (callback: (details: DeviceDetails) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, details: DeviceDetails): void =>
      callback(details);
    ipcRenderer.on('touchbar:details', listener);
    return () => ipcRenderer.removeListener('touchbar:details', listener);
  },
  // 主进程隐藏窗口时复位卡片（避免重新显示后残留透明扩窗区域）
  onPopoverReset: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('touchbar:popover-reset', listener);
    return () => ipcRenderer.removeListener('touchbar:popover-reset', listener);
  },

  // 交互
  itemClick: (key: string, item?: unknown): void => {
    ipcRenderer.send('touchbar:item-click', key, item);
  },
  toggleExpand: (): void => {
    ipcRenderer.send('touchbar:toggle-expand');
  },
  dragStart: (): void => ipcRenderer.send('touchbar:drag-start'),
  dragMove: (): void => ipcRenderer.send('touchbar:drag-move'),
  dragEnd: (): void => ipcRenderer.send('touchbar:drag-end'),

  // 配置
  getConfig: (): Promise<unknown[]> => invoke(ipcRenderer.invoke('touchbar:get-config')),
  setConfig: (items: unknown[]): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:set-config', items)),
  getPrograms: (): Promise<unknown[]> => invoke(ipcRenderer.invoke('touchbar:get-programs')),

  // 悬停详情卡片
  getDetails: (): Promise<DeviceDetails> => invoke(ipcRenderer.invoke('touchbar:get-details')),
  setPopover: (open: boolean): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:set-popover', { open })),
  openTaskManager: (): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:open-task-manager')),

  // 窗口材质 / 置顶
  getMaterial: (): Promise<WindowMaterial> => invoke(ipcRenderer.invoke('touchbar:get-material')),
  getPinned: (): Promise<boolean> => invoke(ipcRenderer.invoke('touchbar:get-pinned')),
  setPinned: (pinned: boolean): Promise<boolean> =>
    invoke(ipcRenderer.invoke('touchbar:set-pinned', { pinned })),

  // 形态切换
  getMode: (): Promise<'radial' | 'touchbar'> => invoke(ipcRenderer.invoke('touchbar:get-mode')),
  setMode: (mode: 'radial' | 'touchbar'): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:set-mode', mode)),

  // 系统快捷控制
  volumeGet: (): Promise<{ level: number | null }> =>
    invoke(ipcRenderer.invoke('touchbar:volume-get')),
  volumeSet: (level: number): Promise<{ success: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:volume-set', level)),
  volumeStep: (delta: number): Promise<{ level: number | null }> =>
    invoke(ipcRenderer.invoke('touchbar:volume-step', delta)),
  volumeMute: (): void => ipcRenderer.send('touchbar:volume-mute'),
  brightnessStep: (delta: number): Promise<{ current: number | null; supported: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:brightness-step', delta)),
  toggleWifi: (): Promise<{ enabled: boolean | null; needsSettings: boolean; message?: string }> =>
    invoke(ipcRenderer.invoke('touchbar:toggle-wifi')),
  toggleBluetooth: (): Promise<{
    enabled: boolean | null;
    needsSettings: boolean;
    message?: string;
  }> => invoke(ipcRenderer.invoke('touchbar:toggle-bluetooth')),
  openSettings: (uri: string): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:open-settings', uri)),

  // 导航 / 关闭
  navigateTo: (page: string): Promise<{ ok: boolean }> =>
    invoke(ipcRenderer.invoke('touchbar:navigate-to', page)),
  close: (): Promise<{ ok: boolean }> => invoke(ipcRenderer.invoke('touchbar:close')),
};

contextBridge.exposeInMainWorld('touchbarApi', touchbarApi);

export type TouchbarApi = typeof touchbarApi;
