/**
 * Touch Bar 悬浮窗（参考 macOS Touch Bar）
 *
 * 形态：
 * - 收起态：一条圆角长条（560×56），常驻系统状态/快捷控制项（Wi-Fi/蓝牙/音量/亮度/时钟/电池等）
 * - 展开态：向上生长为 560×128，在底栏上方增加 WorkPulse 功能入口与自定义程序（按宽度等分）
 *
 * 与径向菜单窗口共享：硬件状态广播（hw-stats）、程序图标/启动工具（program-utils）、
 * 拖拽（主进程绝对差分）、位置记忆。背景跟随设置页窗口材质，置顶由别针按钮切换。
 *
 * 悬停详情卡片：悬浮窗是 frameless + transparent，超出 bounds 的内容会被裁掉，
 * 因此渲染层打开卡片时通过 touchbar:set-popover 让主进程把窗口向上扩
 * TOUCHBAR_POPOVER_H 像素，底栏屏幕位置保持不变（底边对齐）。
 */
import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { getSetting, setSetting } from './db';
import {
  appBus,
  SHOW_MAIN,
  RADIAL_SCREENSHOT,
  WIDGET_MODE_CHANGED,
  WINDOW_MATERIAL_CHANGED,
} from './event-bus';
import { getMainWindow } from './radial-window';
import { getWidgetMode, setWidgetMode } from './widget-mode';
import { resolveWindowMaterial } from './window-material';
import { getDeviceDetails, onDeviceDetailsChanged, refreshDeviceDetails } from './device-details';
import { startHwStats, stopHwStats } from './hw-stats';
import { launchProgramPath } from './program-utils';
import { setMoveCursor, restoreCursor } from './cursor';
import { guardedHandle, guardedQuery } from './ipc-guard';
import { ok } from '../shared/ipc-result';
import {
  TOUCHBAR_BAR_H,
  TOUCHBAR_DEFAULT_ITEMS,
  TOUCHBAR_EXPANDED_H,
  TOUCHBAR_POPOVER_H,
  TOUCHBAR_W,
  type WindowMaterial,
} from '../shared/touchbar';
import {
  TouchbarBrightnessStepSchema,
  TouchbarNavigateToSchema,
  TouchbarOpenSettingsSchema,
  TouchbarSetConfigSchema,
  TouchbarSetModeSchema,
  TouchbarSetPinnedSchema,
  TouchbarSetPopoverSchema,
  TouchbarVolumeSetSchema,
  TouchbarVolumeStepSchema,
} from './ipc-schemas';
import {
  brightnessStep,
  getSystemVolume,
  openSystemSettingsPage,
  openTaskManager,
  sendVirtualKey,
  setSystemVolume,
  toggleBluetooth,
  toggleWifi,
  volumeStep,
  VK_VOLUME_MUTE,
} from './system-controls';

// ─── 尺寸：统一取自 shared/touchbar.ts，与 renderer 的 CSS/布局严格对应 ───
const TOUCHBAR_H = TOUCHBAR_BAR_H;
const EXPANDED_H = TOUCHBAR_EXPANDED_H;
const BOTTOM_MARGIN = 12; // 距工作区底部的间距（像素）

let touchbarWindow: BrowserWindow | null = null;
let expanded = false;
/** 悬停详情卡片是否展开（渲染层通知，主进程据此扩窗；窗口隐藏时自动复位） */
let popoverOpen = false;
/** 是否置顶（可由悬浮窗上的别针按钮切换，持久化到 settings；默认沿用原有的一直置顶） */
let pinned = true;

/** 应用当前置顶策略：置顶 = screen-saver 层级 + 提到最前；非置顶 = 普通 z-order */
function applyPinnedState(win: BrowserWindow): void {
  if (pinned) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  } else {
    win.setAlwaysOnTop(false);
  }
}

/** 与设置页共用同一份材质取值（未保存时按 Windows 版本给默认值） */
function currentWindowMaterial(): WindowMaterial {
  return resolveWindowMaterial(getSetting('window_material'));
}

// 设置页预览 / 应用窗口材质时同步给 Touch Bar（不落盘，只切换背景预设）
appBus.on(WINDOW_MATERIAL_CHANGED, (material: WindowMaterial) => {
  const win = touchbarWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('touchbar:material', material);
  }
});

// 设备详情异步回填（主要是 WMI 亮度）后推给渲染层，卡片不需要自己轮询
onDeviceDetailsChanged((details) => {
  const win = touchbarWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('touchbar:details', details);
  }
});

// ─── 拖拽状态 ───
let isDragging = false;
let dragStartCursor: { x: number; y: number } | null = null;
let dragStartWindow: { x: number; y: number } | null = null;

// ─── 圆角：交给 CSS 抗锯齿，不再用 setShape 逐行矩形拼接 ───
// 早期用每行 1px 的矩形条带逼近圆角，Windows 会把每条带的边界分别合成，
// 放大后是明显阶梯 + 一圈灰色半透明羽化（外阴影还被窗口区域裁断）。
// 现在窗口保持完整矩形区域，圆角由 .touchbar-panel 的 border-radius +
// overflow:hidden 由 Chromium 抗锯齿绘制，边缘连续且锐利。
// 代价：圆角外那几像素的透明三角区不再点击穿透（面积极小，不影响操作）。

// ─── 展开 / 收起 ───

function currentHeight(): number {
  return (expanded ? EXPANDED_H : TOUCHBAR_H) + (popoverOpen ? TOUCHBAR_POPOVER_H : 0);
}

/**
 * 统一窗口几何：底栏底边始终固定，展开面板与悬停卡片都只向上生长。
 * 旧实现靠 y±54 手动加减，两种「向上生长」叠加时会互相覆盖，故统一走这里。
 */
/** 上一次实际下发的几何；避免同一状态被反复 setBounds */
let lastAppliedGeometry: { x: number; y: number; height: number } | null = null;

function applyWindowGeometry(): void {
  const win = touchbarWindow;
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const height = currentHeight();
  const bottom = bounds.y + bounds.height;
  const workArea = screen.getDisplayMatching(bounds).workArea;
  // 贴近屏幕上沿时不再继续上移（宁可让卡片顶部被裁一点，也不让底栏跑出工作区）
  const y = Math.max(workArea.y, bottom - height);
  // 透明窗口每次 resize 都会让 Chromium 重合成整个窗口，并触发 move → 写位置记忆。
  // 渲染层只在首次展开发一次 setPopover(true)（图标间切换不重发），这里再按「请求的几何」去重：
  // 同一展开/卡片状态只下发一次，不比较实际 bounds（Electron 在 Windows 上可能微调高度）。
  if (
    lastAppliedGeometry &&
    lastAppliedGeometry.x === bounds.x &&
    lastAppliedGeometry.y === y &&
    lastAppliedGeometry.height === height
  ) {
    return;
  }
  lastAppliedGeometry = { x: bounds.x, y, height };
  win.setBounds({ x: bounds.x, y, width: TOUCHBAR_W, height });
}

function expandTouchbar(): void {
  const win = touchbarWindow;
  if (!win || win.isDestroyed()) return;
  expanded = true;
  applyWindowGeometry();
  win.webContents.send('touchbar:state', { expanded: true });
}

function collapseTouchbar(): void {
  const win = touchbarWindow;
  if (!win || win.isDestroyed()) return;
  expanded = false;
  applyWindowGeometry();
  win.webContents.send('touchbar:state', { expanded: false });
}

// ─── 动作分发 ───

function fireTouchbarAction(key: string, item?: any): void {
  // 自定义程序
  if (item?.type === 'program' && item?.programPath) {
    void launchProgramPath(item.programPath);
    return;
  }
  if (key === 'screenshot') {
    appBus.emit(RADIAL_SCREENSHOT);
    return;
  }
  const routes: Record<string, string> = {
    log: 'worklog',
    task: 'kanban',
    meeting: 'calendar',
    ai: 'chat',
    settings: 'settings',
  };
  const route = routes[key];
  if (route) {
    appBus.emit(SHOW_MAIN);
    const main = getMainWindow();
    if (main) {
      main.webContents.send(`navigate:${route}`);
    }
  }
}

// ─── 位置记忆 ───

function savePosition(): void {
  if (!touchbarWindow || touchbarWindow.isDestroyed()) return;
  const bounds = touchbarWindow.getBounds();
  // 展开态 / 悬停卡片态窗口会向上扩，直接存 bounds.y 会让下次启动位置偏高；
  // 这里换算成「底栏顶边」的 y，与创建窗口时的坐标口径保持一致。
  const barY = bounds.y + bounds.height - TOUCHBAR_H;
  setSetting('touchbar_position', JSON.stringify({ x: bounds.x, y: barY }));
}

function getSavedPosition(): { x: number; y: number } | null {
  const raw = getSetting('touchbar_position');
  if (!raw) return null;
  try {
    const pos = JSON.parse(raw) as { x: number; y: number };
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── 窗口创建 ───

export function createTouchbarWindow(_parent: BrowserWindow): BrowserWindow {
  // 数据库已初始化后再读取持久化置顶状态（模块加载时 DB 尚未 ready）
  pinned = getSetting('touchbar_pinned') !== 'false';
  const display = screen.getPrimaryDisplay();
  const b = display.workArea;
  const saved = getSavedPosition();
  let x = b.x + Math.floor((b.width - TOUCHBAR_W) / 2);
  let y = b.y + b.height - TOUCHBAR_H - BOTTOM_MARGIN;
  if (saved) {
    x = Math.max(b.x, Math.min(saved.x, b.x + b.width - TOUCHBAR_W));
    y = Math.max(b.y, Math.min(saved.y, b.y + b.height - TOUCHBAR_H));
  }

  // 新窗口实例：清空几何去重缓存，首帧一定下发一次完整 bounds
  lastAppliedGeometry = null;

  touchbarWindow = new BrowserWindow({
    x,
    y,
    width: TOUCHBAR_W,
    height: TOUCHBAR_H,
    frame: false,
    transparent: true,
    alwaysOnTop: pinned,
    resizable: false,
    movable: false, // 拖拽通过 IPC 控制
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/touchbar.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  log.info(
    `[TouchBar] 窗口已创建 bounds=${JSON.stringify(touchbarWindow.getBounds())} isDev=${is.dev} rendererUrl=${process.env['ELECTRON_RENDERER_URL'] ?? '(none)'}`,
  );

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    touchbarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/touchbar.html`);
  } else {
    touchbarWindow.loadFile(join(__dirname, '../renderer/touchbar.html'));
  }

  applyPinnedState(touchbarWindow);
  touchbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 硬件状态广播（与径向菜单共享同一条 hw-stats 通道）
  startHwStats(touchbarWindow);

  // 置顶策略：主窗口可见时隐藏；恢复显示时按当前置顶开关决定 z-order
  // （旧实现无条件 setAlwaysOnTop(true)，会把「非置顶」立刻改回去）
  let lastMainVisible: boolean | null = null;
  const enforceOnTop = (): void => {
    if (!touchbarWindow || touchbarWindow.isDestroyed() || !touchbarWindow.isVisible()) return;
    const main = getMainWindow();
    const mainVisible = !!(main && !main.isDestroyed() && main.isVisible());
    if (mainVisible === lastMainVisible) return;
    lastMainVisible = mainVisible;
    if (mainVisible) {
      // 走公开 hide：隐藏时顺带收起悬停卡片并复原窗口几何
      hideTouchbarWindow();
    } else {
      applyPinnedState(touchbarWindow);
    }
  };
  touchbarWindow.on('show', enforceOnTop);
  touchbarWindow.on('blur', () => setTimeout(enforceOnTop, 100));
  touchbarWindow.on('focus', enforceOnTop);
  const topInterval = setInterval(enforceOnTop, 3000);

  // 位置记忆（拖拽结束后保存）
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 500);
  };
  touchbarWindow.on('move', debouncedSave);

  touchbarWindow.on('closed', () => {
    clearInterval(topInterval);
    stopHwStats(touchbarWindow);
    if (saveTimer) clearTimeout(saveTimer);
    isDragging = false;
    touchbarWindow = null;
  });

  touchbarWindow.webContents.on('did-finish-load', () => {
    if (touchbarWindow && !touchbarWindow.isDestroyed()) {
      log.info(`[TouchBar] did-finish-load url=${touchbarWindow.webContents.getURL()}`);
      touchbarWindow.webContents.send('touchbar:state', { expanded: false });
      // 首帧同步材质与置顶状态，避免渲染层早于广播订阅时拿到默认值
      touchbarWindow.webContents.send('touchbar:material', currentWindowMaterial());
      touchbarWindow.webContents.send('touchbar:pinned', pinned);
      // 重载后卡片状态一律复位，并先推一份同步可读的设备详情；
      // 亮度走 WMI 最慢数秒，后台预取完成后再广播回填
      popoverOpen = false;
      touchbarWindow.webContents.send('touchbar:popover-reset');
      touchbarWindow.webContents.send('touchbar:details', getDeviceDetails());
      refreshDeviceDetails(true);
    }
  });

  // 渲染层加载失败 / 崩溃 / 控制台错误 → 打印到主进程日志，便于定位透明窗口问题
  touchbarWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error(`[TouchBar] did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  touchbarWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error(
      `[TouchBar] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
  touchbarWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      log.warn(`[TouchBar] console[${level}] ${message} (${sourceId}:${line})`);
    }
  });

  return touchbarWindow;
}

// ─── 公开 API ───

export function showTouchbarWindow(): void {
  const win = touchbarWindow;
  if (!win || win.isDestroyed()) return;
  log.info(
    `[TouchBar] showTouchbarWindow bounds=${JSON.stringify(win.getBounds())} visible=${win.isVisible()}`,
  );
  win.show();
  // 按别针开关决定层级，非置顶态不再被强制抬到 screen-saver
  applyPinnedState(win);
}

export function hideTouchbarWindow(): void {
  if (touchbarWindow && !touchbarWindow.isDestroyed()) {
    log.info(`[TouchBar] hideTouchbarWindow visible=${touchbarWindow.isVisible()}`);
    // 隐藏时一并收起卡片，否则下次显示会多出一段没有内容的透明扩窗区域
    if (popoverOpen) {
      popoverOpen = false;
      touchbarWindow.webContents.send('touchbar:popover-reset');
    }
    applyWindowGeometry();
    touchbarWindow.hide();
  }
}

export function getTouchbarWindow(): BrowserWindow | null {
  return touchbarWindow && !touchbarWindow.isDestroyed() ? touchbarWindow : null;
}

// ─── IPC: 交互 ───

ipcMain.on('touchbar:item-click', (_event, key: string, item?: any) => {
  collapseTouchbar();
  fireTouchbarAction(key, item);
});

ipcMain.on('touchbar:toggle-expand', () => {
  if (!touchbarWindow || touchbarWindow.isDestroyed()) return;
  if (expanded) {
    collapseTouchbar();
  } else {
    expandTouchbar();
  }
});

// 拖拽（与径向菜单同策略：主进程绝对差分）
ipcMain.on('touchbar:drag-start', () => {
  isDragging = true;
  const cursor = screen.getCursorScreenPoint();
  dragStartCursor = { x: cursor.x, y: cursor.y };
  if (touchbarWindow && !touchbarWindow.isDestroyed()) {
    const [wx, wy] = touchbarWindow.getPosition();
    dragStartWindow = { x: wx, y: wy };
    setMoveCursor();
  }
});

ipcMain.on('touchbar:drag-move', () => {
  if (
    !isDragging ||
    !touchbarWindow ||
    touchbarWindow.isDestroyed() ||
    !dragStartCursor ||
    !dragStartWindow
  )
    return;
  const cursor = screen.getCursorScreenPoint();
  const displays = screen.getAllDisplays();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }
  const h = currentHeight();
  const targetX = dragStartWindow.x + (cursor.x - dragStartCursor.x);
  const targetY = dragStartWindow.y + (cursor.y - dragStartCursor.y);
  const clampedX = Math.max(minX, Math.min(targetX, maxX - TOUCHBAR_W));
  const clampedY = Math.max(minY, Math.min(targetY, maxY - h));
  touchbarWindow.setPosition(clampedX, clampedY);
});

ipcMain.on('touchbar:drag-end', () => {
  isDragging = false;
  if (touchbarWindow && !touchbarWindow.isDestroyed()) {
    restoreCursor();
  }
});

// ─── IPC: 配置 ───

const DEFAULT_TOUCHBAR_ITEMS = TOUCHBAR_DEFAULT_ITEMS;

// 媒体控制组已整体移除：过滤掉旧配置里残留的 media 项，避免它继续出现在设置页/底栏
function stripMediaItems(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return items.filter((i) => i.key !== 'media');
}

guardedQuery('touchbar:get-config', () => {
  const saved = getSetting('touchbar_items');
  if (saved === null) return ok(DEFAULT_TOUCHBAR_ITEMS);
  try {
    const parsed = JSON.parse(saved) as Array<Record<string, unknown>>;
    return ok(Array.isArray(parsed) ? stripMediaItems(parsed) : DEFAULT_TOUCHBAR_ITEMS);
  } catch {
    return ok(DEFAULT_TOUCHBAR_ITEMS);
  }
});

guardedHandle('touchbar:set-config', TouchbarSetConfigSchema, (data) => {
  const items = stripMediaItems(data.items);
  setSetting('touchbar_items', JSON.stringify(items));
  const win = touchbarWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('touchbar:config-changed', items);
  }
  return ok(true);
});

guardedQuery('touchbar:get-programs', () => {
  const saved = getSetting('radial_items');
  if (!saved) return ok([]);
  try {
    const items = JSON.parse(saved) as Array<Record<string, unknown>>;
    const programs = items.filter(
      (i) => i.type === 'program' && typeof i.programPath === 'string' && i.enabled !== false,
    );
    return ok(programs);
  } catch {
    return ok([]);
  }
});

// ─── IPC: 形态切换 ───

guardedQuery('touchbar:get-mode', () => {
  log.info(`[TouchBar] get-mode called -> ${getWidgetMode()}`);
  return ok(getWidgetMode());
});

guardedHandle('touchbar:set-mode', TouchbarSetModeSchema, (data) => {
  log.info(`[TouchBar] set-mode called mode=${data.mode}`);
  setWidgetMode(data.mode);
  appBus.emit(WIDGET_MODE_CHANGED);
  return ok(true);
});

// ─── IPC: 悬停详情卡片 ───

guardedHandle('touchbar:set-popover', TouchbarSetPopoverSchema, (data) => {
  // 同一个图标反复触发 mouseenter 时不要反复 setBounds（会触发 move → 位置记忆）
  if (popoverOpen !== data.open) {
    popoverOpen = data.open;
    applyWindowGeometry();
  }
  return ok(true);
});

guardedQuery('touchbar:get-details', () => {
  // 顺手触发一次后台刷新（30s 限流），亮度拿到后由 touchbar:details 广播回填
  refreshDeviceDetails();
  return ok(getDeviceDetails());
});

guardedQuery('touchbar:open-task-manager', () => {
  openTaskManager();
  return ok(true);
});

// ─── IPC: 窗口材质 / 置顶 ───

guardedQuery('touchbar:get-material', () => ok(currentWindowMaterial()));

guardedQuery('touchbar:get-pinned', () => ok(pinned));

guardedHandle('touchbar:set-pinned', TouchbarSetPinnedSchema, (data) => {
  pinned = data.pinned;
  setSetting('touchbar_pinned', String(pinned));
  const win = touchbarWindow;
  if (win && !win.isDestroyed()) {
    applyPinnedState(win);
    win.webContents.send('touchbar:pinned', pinned);
  }
  log.info(`[TouchBar] set-pinned -> ${pinned}`);
  return ok(pinned);
});

// ─── IPC: 系统快捷控制 ───

guardedQuery('touchbar:volume-get', () => {
  return ok({ level: getSystemVolume() });
});

guardedHandle('touchbar:volume-set', TouchbarVolumeSetSchema, (data) => {
  return ok({ success: setSystemVolume(data.level) });
});

guardedHandle('touchbar:volume-step', TouchbarVolumeStepSchema, (data) => {
  return ok({ level: volumeStep(data.delta) });
});

ipcMain.on('touchbar:volume-mute', () => {
  sendVirtualKey(VK_VOLUME_MUTE);
});

guardedHandle('touchbar:brightness-step', TouchbarBrightnessStepSchema, async (data) => {
  return ok(await brightnessStep(data.delta));
});

guardedQuery('touchbar:toggle-wifi', async () => {
  return ok(await toggleWifi());
});

guardedQuery('touchbar:toggle-bluetooth', async () => {
  return ok(await toggleBluetooth());
});

guardedHandle('touchbar:open-settings', TouchbarOpenSettingsSchema, (data) => {
  openSystemSettingsPage(data.uri);
  return ok(true);
});

// ─── IPC: 导航 / 关闭 ───

guardedHandle('touchbar:navigate-to', TouchbarNavigateToSchema, (data) => {
  appBus.emit(SHOW_MAIN);
  const win = getMainWindow();
  if (win) win.webContents.send(`navigate:${data.page}`);
  collapseTouchbar();
  return ok(true);
});

guardedQuery('touchbar:close', () => {
  hideTouchbarWindow();
  return ok(true);
});
