import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { getSetting, setSetting } from './db';
import {
  appBus,
  SHOW_MAIN,
  SHOW_RADIAL,
  RADIAL_SCREENSHOT,
  WIDGET_VISIBILITY_CHANGED,
  WIDGET_SCALE_CHANGED,
} from './event-bus';
import {
  COLLAPSED_BASE_SCALE,
  FLOATING_SCALE_KEY,
  FLOATING_SCALE_RANGE,
  floatingScaleFactor,
  normalizeFloatingScale,
} from '../shared/floating-scale';
import { setMoveCursor, restoreCursor } from './cursor';
import { startHwStats, stopHwStats } from './hw-stats';
import { launchProgramPath, getFileIconBase64 } from './program-utils';

let radialWindow: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;

/* ── 尺寸常量（与 renderer 严格一致） ── */
const WIDGET_SIZE = 206;
const CX = WIDGET_SIZE / 2;
const CY = WIDGET_SIZE / 2;
const INNER_R = 38;
const OUTER_R = 94;
const CENTER_R = 24;
const EXPANDED_R = 103; // 展开态可点击半径（= INNER_R + gap + (OUTER_R - INNER_R)/2）
/** 收起态可见内容最外缘（CSS 设计单位）：顶部插头盒上沿 = R_RING + PLUG_SIZE/2 = 34.65，
 *  大于电量圆点衬边外缘 32.3 与弧线外沿 30.85，是整层最外的一个元素。
 *  v3：渲染层不再手工放大，此值就是 206 画布里的真实半径。 */
const COLLAPSED_CONTENT_R = 34.65;
const SEG_ANGLE = 72;
const POLL_INTERVAL_MS = 30;

/* ── 收起态窗口真实缩放（v3：用户反馈「是悬浮窗收起状态的窗口大小，不是整体文字大小」）──
 * 关键：收起态把窗口 bounds 与页面 zoomFactor **同系数**放大：
 *   bounds = 206 × Z（DIP），zoomFactor = Z ⇒ CSS 视口恒 206 → 渲染层几何零改动。
 *   窗口物理边界与画面同步变大，画面永远不会被 206 的旧边界裁切（这才是「边框不完整」真因）。
 * 展开态恒 bounds=206 / zoomFactor=1 → 菜单文字保持设计尺寸，不受用户缩放影响。
 * Z（收起态）= COLLAPSED_BASE_SCALE(1.3) × userScale，100% 档视觉与旧版完全一致。
 * 页面级 setZoomFactor 不破坏 backdrop-filter（棋盘格 A/B 实测 zoom 1→3 玻璃恒定）。
 * 注意：模块加载早于 initDatabase()，不可在顶层 getSetting。 */
let userScale = floatingScaleFactor(FLOATING_SCALE_RANGE.default);
/** 收起态有效缩放系数（基础 1.3 × 用户滑动条） */
function collapsedScale(): number {
  return COLLAPSED_BASE_SCALE * userScale;
}
/** 当前页面/窗口缩放：仅收起态放大，展开态恒 1 */
function currentZoom(): number {
  return expanded ? 1 : collapsedScale();
}
/** 当前窗口 DIP 边长（收起态放大、展开态 206） */
function windowSize(): number {
  return Math.round(WIDGET_SIZE * currentZoom());
}
/** CSS 设计单位 → DIP（setShape 命中区用；窗口 DIP = 206 × zoom） */
function toDip(cssValue: number): number {
  return cssValue * currentZoom();
}
/** 收起态命中区半径（CSS 设计单位）：覆盖可见内容外缘 + 3px 余量（缩放由 toDip 承担） */
function collapsedHitR(): number {
  return Math.ceil(COLLAPSED_CONTENT_R) + 3;
}

// 径向菜单扇区定义（角度与 renderer 严格保持一致）
const RADIAL_ITEMS = [
  { key: 'log', label: 'Work Log', angle: -90, route: 'worklog' },
  { key: 'task', label: 'Task', angle: -18, route: 'kanban' },
  { key: 'meeting', label: 'Meeting', angle: 54, route: 'calendar' },
  { key: 'ai', label: 'AI Chat', angle: 126, route: 'chat' },
  { key: 'screenshot', label: 'Screenshot', angle: 198, route: '' },
];

export function setMainWindow(win: BrowserWindow): void {
  mainWin = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null;
}

// ─── 混合方案：Meel 原则 + DOM 交互 ───
// Meel 原则：窗口创建一次复用、focusable:false、alwaysOnTop re-assert、光标轮询
// 区别：show:true（默认显示）、setShape 点击穿透、DOM 点击/拖拽
let expanded = false;

// ─── 光标轮询（Meel 原则） ───
let cursorPollTimer: ReturnType<typeof setInterval> | null = null;

function startCursorPolling(win: BrowserWindow): void {
  stopCursorPolling();
  cursorPollTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopCursorPolling();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    // 收起态 zoomFactor = currentZoom()：光标是 DIP、渲染层按 206 CSS 设计单位判定，
    // 故先除 zoom 换回 CSS 坐标（展开态 zoom=1 无需换算）。
    const zoom = currentZoom();
    const localX = (cursor.x - wx) / zoom;
    const localY = (cursor.y - wy) / zoom;
    const dx = localX - CX;
    const dy = localY - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 中心判定半径用 CSS 设计单位：渲染层不再手工放大，中心玻璃恒 CENTER_R
    const centerHitR = CENTER_R;
    const isOverCenter = dist <= centerHitR;
    // 收起态不再按悬停带改 shape：状态环收起态是纯展示层（读数条与悬停变暗均已移除），
    // 可见区域恒为半径 collapsedHitR() 的圆；轮询只负责把光标坐标发给渲染层（展开态扇区 hover / 中心判定用）。
    // Skip IPC send when window is hidden and not expanded (no cursor tracking needed)
    if (!win.isVisible() && !expanded) return;
    win.webContents.send('radial:cursor', { x: localX, y: localY, dist, isOverCenter });
  }, POLL_INTERVAL_MS);
}

function stopCursorPolling(): void {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

// ─── setShape: OS 级点击穿透 ───
// Windows: setShape 定义可点击区域，区域外的鼠标事件穿透到下层窗口
// 用多行矩形条带（每行 1px 高、宽=弦长）平铺逼近圆形（而非单个方形 rect）：
// Windows 透明窗上 OS 会对 setShape 区域边界合成一圈暗边/阴影，方形 shape 会呈现
// 「正方形阴影」；条带圆形轮廓与内容形状一致 → 无方形感。仅展开/收起时调用，开销可忽略。
// radius 为 CSS 设计单位（相对 206px 画布），内部 ×currentZoom 换成 DIP（相对放大后的窗口）。
function buildCircleRects(cssRadius: number): Electron.Rectangle[] {
  const radius = toDip(cssRadius);
  const center = windowSize() / 2; // DIP 圆心（= 103 × zoom）
  const y0 = Math.round(center - radius);
  const size = Math.round(radius * 2);
  const rects: Electron.Rectangle[] = [];
  for (let i = 0; i < size; i++) {
    const dy = i - radius + 0.5; // 行中心相对圆心
    const half = Math.sqrt(Math.max(radius * radius - dy * dy, 0));
    if (half < 0.5) continue;
    rects.push({ x: Math.round(center - half), y: y0 + i, width: Math.round(half * 2), height: 1 });
  }
  return rects;
}

// 收起 / 展开分别以半径 collapsedHitR() / EXPANDED_R 的圆条带定义可点击区域；
// 状态环收起态纯展示，无需为任何悬浮元素额外并入矩形。
function applyShape(win: BrowserWindow, cssRadius: number): void {
  const radius = toDip(cssRadius);
  const center = windowSize() / 2;
  const x0 = Math.round(center - radius);
  const y0 = Math.round(center - radius);
  const size = Math.round(radius * 2);
  const rects = buildCircleRects(cssRadius);
  if (rects.length === 0) {
    win.setShape([{ x: x0, y: y0, width: size, height: size }]);
    return;
  }
  win.setShape(rects);
}

/** 把当前缩放应用到窗口：收起态改 bounds+zoomFactor（同步放大，画面不被裁），锚定中心不跳位。
 *  展开态不调用（展开恒 206/zoom 1）；用户尺寸变更只在收起态生效。 */
function applyCollapsedScaleToWindow(win: BrowserWindow): void {
  const newSize = windowSize();
  const b = win.getBounds();
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.max(wa.x, Math.min(Math.round(centerX - newSize / 2), wa.x + wa.width - newSize));
  const y = Math.max(wa.y, Math.min(Math.round(centerY - newSize / 2), wa.y + wa.height - newSize));
  // 先 zoom 后 bounds：CSS 视口恒 206，避免中间态几何错位
  win.webContents.setZoomFactor(currentZoom());
  win.setBounds({ x, y, width: newSize, height: newSize });
  applyShape(win, collapsedHitR());
  debouncedSavePosition();
}

// ─── 展开 / 收起 ───

function expandRadial(): void {
  const win = radialWindow;
  if (!win || win.isDestroyed()) return;
  expanded = true;
  // 展开态：窗口缩回 206、zoom 1（菜单保持设计尺寸），锚定中心
  const b = win.getBounds();
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;
  const wa = screen.getDisplayMatching(b).workArea;
  const size = WIDGET_SIZE;
  const x = Math.max(wa.x, Math.min(Math.round(centerX - size / 2), wa.x + wa.width - size));
  const y = Math.max(wa.y, Math.min(Math.round(centerY - size / 2), wa.y + wa.height - size));
  win.webContents.setZoomFactor(1);
  win.setBounds({ x, y, width: size, height: size });
  applyShape(win, EXPANDED_R);
  win.webContents.send('radial:state', { expanded: true });
}

function collapseRadial(): void {
  const win = radialWindow;
  if (!win || win.isDestroyed()) return;
  expanded = false;
  // 收起态：窗口与 zoom 同步放大到当前尺寸设置
  applyCollapsedScaleToWindow(win);
  win.webContents.send('radial:state', { expanded: false });
}

function fireRadialAction(key: string, item?: any): void {
  // Program-type items: launch via shell
  if (item?.type === 'program' && item?.programPath) {
    void launchProgramPath(item.programPath);
    return;
  }
  if (key === 'screenshot') {
    appBus.emit(RADIAL_SCREENSHOT);
    return;
  }
  const builtin = RADIAL_ITEMS.find((i) => i.key === key);
  if (builtin?.route) {
    appBus.emit(SHOW_MAIN);
    const main = getMainWindow();
    if (main) {
      main.webContents.send(`navigate:${builtin.route}`);
    }
  }
}

/**
 * 创建径向菜单悬浮窗 — 创建一次，永不销毁（Meel 原则）。
 *
 * 与 Meel 的区别：
 * - show:true → 默认显示（不是隐藏）
 * - setShape → OS 级点击穿透（不是 setIgnoreMouseEvents）
 * - DOM 事件 → 点击/拖拽（不是全局 hook）
 * - focusable:false + alwaysOnTop re-assert → 与 Meel 一致
 */
function savePosition(): void {
  if (!radialWindow || radialWindow.isDestroyed()) return;
  const [x, y] = radialWindow.getPosition();
  setSetting('radial_position', JSON.stringify({ x, y }));
}

/** 位置写入防抖：拖拽 move 与尺寸变更都会触发，合并成一次磁盘写 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSavePosition(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 500);
}

function getSavedPosition(): { x: number; y: number } | null {
  const raw = getSetting('radial_position');
  if (!raw) return null;
  try {
    const pos = JSON.parse(raw) as { x: number; y: number };
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

export function createRadialWindow(_parent: BrowserWindow): BrowserWindow {
  // DB 此时已初始化，读取持久化收起态尺寸（模块顶层读会在 initDatabase 之前拿到空/抛错）
  userScale = floatingScaleFactor(normalizeFloatingScale(getSetting(FLOATING_SCALE_KEY)));
  const display = screen.getPrimaryDisplay();
  const b = display.workArea;
  // 收起态初始即按当前尺寸设置放大窗口（expanded 初始为 false → currentZoom=collapsedScale）
  const size = windowSize();
  // 优先恢复上次位置，否则居中
  const savedPosition = getSavedPosition();
  let x = b.x + Math.floor((b.width - size) / 2);
  let y = b.y + Math.floor((b.height - size) / 2);
  if (savedPosition) {
    // 确保仍在屏幕内
    x = Math.max(b.x, Math.min(savedPosition.x, b.x + b.width - size));
    y = Math.max(b.y, Math.min(savedPosition.y, b.y + b.height - size));
  }

  radialWindow = new BrowserWindow({
    x,
    y,
    width: size,
    height: size,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false, // 拖拽通过 IPC 控制（Meel 原则）
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false, // 永不抢焦点（Meel 原则）
    hasShadow: false,
    backgroundColor: '#00000000',
    show: true, // 默认显示（与 Meel 的区别）
    webPreferences: {
      // ⚠️ 必须用独立 partition：Electron 的 setZoomFactor 按 session+origin 持久化并共享。
      // 悬浮窗用 zoom 放大收起态，若与主窗口共用 defaultSession + 同源，
      // 调悬浮窗 zoom 会把主窗口字体一起放大（用户实测「改悬浮窗尺寸却改了主窗口字体」）。
      // 独立 session 后 zoom 互不干扰；悬浮窗不依赖 localStorage/IndexedDB（全走 IPC），隔离无副作用。
      partition: 'radial-isolated',
      preload: join(__dirname, '../preload/radial.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // v8CacheOptions: 'none', // 已启用全局 V8 编译缓存，不再禁用
    },
  });

  // 页面级缩放：收起态 zoomFactor = currentZoom()，CSS 视口恒 206；创建时即设，保证首帧几何正确。
  // 独立 partition 下 zoom 按该 session 存储，只影响悬浮窗自身，不碰主窗口。
  radialWindow.webContents.setZoomFactor(currentZoom());

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/radial.html`);
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/radial.html'));
  }

  // Meel 原则：alwaysOnTop + re-assert on show/blur
  radialWindow.setAlwaysOnTop(true, 'screen-saver');
  radialWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 光标轮询（Meel 原则）
  startCursorPolling(radialWindow);

  // 硬件状态采样推送（CPU/内存/电池，每秒一次）
  startHwStats(radialWindow);

  // Re-assert alwaysOnTop（Meel 原则 + 周期性强制置顶）
  // 主窗口可见时隐藏悬浮窗，主窗口隐藏时才置顶
  let lastMainVisible: boolean | null = null;
  const enforceOnTop = (): void => {
    if (isRadialEnabled() === false) return;
    if (!radialWindow || radialWindow.isDestroyed() || !radialWindow.isVisible()) return;
    if (radialWindow && !radialWindow.isDestroyed()) {
      const main = getMainWindow();
      const mainVisible = !!(main && !main.isDestroyed() && main.isVisible());
      if (mainVisible === lastMainVisible) return;
      lastMainVisible = mainVisible;
      if (mainVisible) {
        // 主窗口可见 → 隐藏悬浮窗
        radialWindow.hide();
      } else {
        // 主窗口隐藏 → 置顶悬浮窗
        radialWindow.setAlwaysOnTop(true, 'screen-saver');
        radialWindow.moveTop();
      }
    }
  };
  radialWindow.on('show', enforceOnTop);
  radialWindow.on('blur', () => setTimeout(enforceOnTop, 100));
  radialWindow.on('focus', enforceOnTop);
  // 周期性强制置顶（防止其他窗口抢占 z-order）
  const topInterval = setInterval(enforceOnTop, 3000);
  radialWindow.on('closed', () => {
    clearInterval(topInterval);
    stopCursorPolling();
    stopHwStats(radialWindow);
    if (saveTimer) clearTimeout(saveTimer);
    isDragging = false;
  });

  // 位置记忆：拖拽结束后保存（复用模块级防抖，尺寸变更也走这里）
  radialWindow.on('move', debouncedSavePosition);

  // 内容加载完成后，应用收起态 setShape 并通知 renderer
  radialWindow.webContents.on('did-finish-load', () => {
    if (radialWindow && !radialWindow.isDestroyed()) {
      // 导航可能重置 zoomFactor，这里兜底重设（幂等）
      radialWindow.webContents.setZoomFactor(currentZoom());
      applyShape(radialWindow, collapsedHitR()); // 收起态：命中区跟上窗口尺寸
      radialWindow.webContents.send('radial:state', { expanded: false });
    }
  });

  return radialWindow;
}

// ─── 公开 API ───

export function showRadialWindow(): void {
  if (isRadialEnabled() === false) return;
  const win = radialWindow;
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  win.moveTop();
  startCursorPolling(win);
}

export function hideRadialWindow(): void {
  if (radialWindow && !radialWindow.isDestroyed()) {
    radialWindow.hide();
  }
  stopCursorPolling();
}

export function getRadialWindow(): BrowserWindow | null {
  return radialWindow && !radialWindow.isDestroyed() ? radialWindow : null;
}

export function isRadialEnabled(): boolean {
  return getSetting('radial_enabled') !== '0';
}

// ─── IPC: renderer → main ───

// 中心按钮点击：展开 / 收起
ipcMain.on('radial:center-click', () => {
  if (!expanded) {
    expandRadial();
  } else {
    collapseRadial();
  }
});

// 扇区点击：执行动作 + 收起
ipcMain.on('radial:segment-click', (_event, key: string, item?: any) => {
  collapseRadial();
  fireRadialAction(key, item);
});

// 拖拽（center button mousedown → document mousemove → mouseup）
// 位移一律在主进程用 screen.getCursorScreenPoint() 绝对差分计算：
// 渲染层 movementX/Y 在「主进程移动窗口 → Chromium 按新窗口位置重算合成鼠标事件」时会反向/重复，
// 导致窗口与光标反向分开；主进程绝对坐标不受窗口移动影响。
let isDragging = false;
let dragStartCursor: { x: number; y: number } | null = null;
let dragStartWindow: { x: number; y: number } | null = null;

ipcMain.on('radial:drag-start', () => {
  isDragging = true;
  const cursor = screen.getCursorScreenPoint();
  dragStartCursor = { x: cursor.x, y: cursor.y };
  if (radialWindow && !radialWindow.isDestroyed()) {
    const [wx, wy] = radialWindow.getPosition();
    dragStartWindow = { x: wx, y: wy };
    applyShape(radialWindow, WIDGET_SIZE / 2); // 拖拽时整窗可点击（CSS 103 → applyShape 内部 ×zoom 得 DIP 半径）
    setMoveCursor();
  }
});

ipcMain.on('radial:drag-move', () => {
  if (
    !isDragging ||
    !radialWindow ||
    radialWindow.isDestroyed() ||
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
  // 绝对定位：起点窗口位置 + 光标位移（拖拽期间窗口移动不影响光标屏幕坐标）
  const targetX = dragStartWindow.x + (cursor.x - dragStartCursor.x);
  const targetY = dragStartWindow.y + (cursor.y - dragStartCursor.y);
  const size = windowSize();
  const clampedX = Math.max(minX, Math.min(targetX, maxX - size));
  const clampedY = Math.max(minY, Math.min(targetY, maxY - size));
  radialWindow.setPosition(clampedX, clampedY);
});

ipcMain.on('radial:drag-end', () => {
  isDragging = false;
  // 恢复 setShape 并重新启用 mouse events
  if (radialWindow && !radialWindow.isDestroyed()) {
    applyShape(radialWindow, expanded ? EXPANDED_R : collapsedHitR()); // 收起态：命中区跟上视觉尺寸
    restoreCursor();
  }
});

import { guardedHandle, guardedQuery } from './ipc-guard';
import { ok } from '../shared/ipc-result';
import {
  RadialSetConfigSchema,
  RadialSetEnabledSchema,
  RadialGetFileIconSchema,
  RadialLaunchProgramSchema,
  RadialNavigateToSchema,
} from './ipc-schemas';

// ─── 配置 IPC ───

const DEFAULT_RADIAL_ITEMS = [
  { id: 'log', label: 'Work Log', route: '/worklog' },
  { id: 'task', label: 'Tasks', route: '/kanban' },
  { id: 'meeting', label: 'Meetings', route: '/calendar' },
  { id: 'ai', label: 'AI Chat', route: '/chat' },
];

guardedQuery('radial:get-config', () => {
  const saved = getSetting('radial_items');
  if (saved === null) return ok(DEFAULT_RADIAL_ITEMS);
  try {
    return ok(JSON.parse(saved));
  } catch {
    return ok(DEFAULT_RADIAL_ITEMS);
  }
});

guardedHandle('radial:set-config', RadialSetConfigSchema, (data) => {
  setSetting('radial_items', JSON.stringify(data.items));
  const win = radialWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('radial:config-changed', data.items);
  }
  return ok(true);
});

guardedHandle('radial:navigate-to', RadialNavigateToSchema, (data) => {
  appBus.emit(SHOW_MAIN);
  const win = getMainWindow();
  if (win) win.webContents.send(`navigate:${data.page}`);
  collapseRadial();
  return ok(true);
});

// ─── 悬浮窗开关（设置页实时切换） ───

guardedHandle('radial:set-enabled', RadialSetEnabledSchema, (data) => {
  setSetting('radial_enabled', data.enabled ? '1' : '0');
  // 由 index.ts 统一调度：仅径向模式且启用时创建/显示，禁用时隐藏
  appBus.emit(WIDGET_VISIBILITY_CHANGED);
  return ok(true);
});

guardedQuery('radial:close', () => {
  hideRadialWindow();
  return ok(true);
});

// ─── 程序配置 IPC ───

guardedQuery('radial:pick-program', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: '选择程序',
    filters: [
      { name: '可执行文件', extensions: ['exe', 'lnk', 'bat', 'cmd', 'ps1'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return ok(null);
  const filePath = result.filePaths[0];
  const name =
    filePath
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? '';
  return ok({ path: filePath, name });
});

guardedHandle('radial:get-file-icon', RadialGetFileIconSchema, async (data) => {
  return ok(await getFileIconBase64(data.filePath));
});

guardedHandle('radial:launch-program', RadialLaunchProgramSchema, async (data) => {
  await launchProgramPath(data.programPath);
  return ok(true);
});

// ─── 收起态尺寸变更：即时生效，不重建窗口（收起态改 bounds+zoom，展开态暂存的收起时生效） ───
appBus.on(WIDGET_SCALE_CHANGED, (raw: string) => {
  userScale = floatingScaleFactor(normalizeFloatingScale(raw));
  const win = radialWindow;
  if (!win || win.isDestroyed()) return; // 窗口未创建时只更新 userScale，下次创建读取
  if (expanded) return; // 展开态恒 206/zoom 1，尺寸设置等收起后再应用
  applyCollapsedScaleToWindow(win);
});
