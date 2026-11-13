/**
 * 开机启动 + 关闭行为 + 窗口材质 IPC
 * 迁移至 guardedHandle 模式
 */
import { app, BrowserWindow } from 'electron';
import { getSetting, setSetting } from './db';
import log from 'electron-log/main';
import { guardedHandle, guardedQuery } from './ipc-guard';
import { ok } from '../shared/ipc-result';
import { AutoLaunchSchema, CloseActionSchema, WindowMaterialSchema } from './ipc-schemas';
import { applyWindowMaterial, resolveWindowMaterial, type WindowMaterial } from './window-material';
import { appBus, WINDOW_MATERIAL_CHANGED } from './event-bus';

let mainWinGetter: () => BrowserWindow | null = () => null;
let appIconPath = '';

/** 将材质应用到主窗口（含 win32 下的图标恢复），供「保存」与「预览」共用 */
function applyMaterialToMainWindow(material: WindowMaterial): void {
  const win = mainWinGetter();
  if (!win) return;
  // 统一走 applyWindowMaterial：同步切换原生背景色 + DWM 材质
  applyWindowMaterial(win, material);
  if (process.platform === 'win32') {
    try {
      win.setIcon(appIconPath);
    } catch (err) {
      log.error('[Main] setIcon failed:', err);
    }
  }
  // 预览与保存都广播：Touch Bar 不落盘但读取同一套材质预设，保持与设置页一致
  appBus.emit(WINDOW_MATERIAL_CHANGED, material);
}

export function setAutoLaunchDeps(
  getMainWindow: () => BrowserWindow | null,
  iconPath: string,
): void {
  mainWinGetter = getMainWindow;
  appIconPath = iconPath;
}

export function setAutoLaunch(enable: boolean): void {
  setSetting('auto_launch', enable ? 'true' : 'false');
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: app.getPath('exe'),
      args: enable ? ['--hidden'] : [],
    });
  }
}

export function getAutoLaunch(): boolean {
  const saved = getSetting('auto_launch');
  if (saved !== null) return saved === 'true';
  return app.getLoginItemSettings().openAtLogin;
}

export function registerAutoLaunchIpc(): void {
  guardedHandle('set-auto-launch', AutoLaunchSchema, (data) => {
    setAutoLaunch(data.enable);
    return ok(undefined);
  });

  guardedQuery('get-auto-launch', () => {
    return ok(getAutoLaunch());
  });

  // 启动时恢复系统登录项设置
  if (app.isPackaged) {
    const savedAutoLaunch = getSetting('auto_launch');
    if (savedAutoLaunch !== null) {
      app.setLoginItemSettings({
        openAtLogin: savedAutoLaunch === 'true',
        path: app.getPath('exe'),
        args: savedAutoLaunch === 'true' ? ['--hidden'] : [],
      });
    }
  }

  guardedQuery('get-close-action', () => {
    return ok(getSetting('close_action') || 'minimize');
  });

  guardedHandle('set-close-action', CloseActionSchema, (data) => {
    setSetting('close_action', data.action);
    return ok(undefined);
  });

  guardedQuery('get-window-material', () => {
    // 默认值按 Windows 版本判定：Win11 22H2+ 默认 mica，其余默认 tabbed
    return ok(resolveWindowMaterial(getSetting('window_material')));
  });

  guardedHandle('set-window-material', WindowMaterialSchema, (data) => {
    setSetting('window_material', data.material);
    applyMaterialToMainWindow(data.material);
    // 必须返回 { success: true }：preload 会 unwrap IpcResult，设置页按 res?.success
    // 判定是否落盘成功；返回 ok(undefined) 会让「应用」按钮静默无反应
    return ok({ success: true });
  });

  // 预览材质：仅即时应用效果到窗口，不调 setSetting（不落盘）；保存仍走 set-window-material
  guardedHandle('preview-window-material', WindowMaterialSchema, (data) => {
    applyMaterialToMainWindow(data.material);
    return ok({ success: true });
  });
}
