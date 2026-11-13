/**
 * L0 系统材质（Windows DWM backgroundMaterial + mica-electron 增强）统一入口
 *
 * 职责：
 * 1. 按 Windows 版本给出默认材质（Win11 22H2+ 用 mica）
 * 2. 把材质应用到窗口，并同步切换原生窗口背景色：
 *    - 材质开启（auto/mica/tabbed/acrylic）→ 背景透明，DWM 材质透出
 *    - 材质为 none → 不透明底色兜底，避免露出黑底/桌面穿透（降级路径）
 * 3. 材质应用优先走 mica-electron 增强路径：
 *    - Win11 22H2+：复用 Electron 原生 backgroundMaterial（含 'auto'），
 *      并叠加 DWM 低层控制（边框强调色 tint）
 *    - Win10：mica-electron 通过 SetWindowCompositionAttribute 提供真 Acrylic
 * 材质由 DWM 合成，零 JS/GPU 自维护成本。
 */
import type { BrowserWindow } from 'electron';
import { nativeTheme } from 'electron';
import log from 'electron-log/main';
import { IS_WINDOWS_11, PARAMS, VALUE } from 'mica-electron';
import { getSetting } from './db';

// 取值定义在 shared，Touch Bar 渲染层按同一份字面量集合切换背景预设
import type { WindowMaterial } from '../shared/touchbar';
export type { WindowMaterial };

/** 材质透出所需的透明窗口背景色 */
const TRANSPARENT_BG = '#00000000';

/** 渲染进程主题强调色 → 十六进制（与 renderer/stores/themeStore.ts 的 ACCENTS 保持一致） */
const ACCENT_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#a855f7',
  cyan: '#06b6d4',
  emerald: '#10b981',
  orange: '#f97316',
  rose: '#f43f5e',
};

/** mica-electron 窗口的鸭子类型：仅使用我们需要的公开方法，避免强依赖其类型声明 */
type MicaWindow = BrowserWindow & {
  setMicaEffect?: () => void;
  setMicaTabbedEffect?: () => void;
  setMicaAcrylicEffect?: () => void;
  setAcrylic?: () => void;
  setBorderColor?: (color: string) => void;
  disableDWM?: () => void;
  disableUser32?: () => void;
  executeDwm?: (params: number, value: number) => void;
};

/** 材质为 none 时的不透明兜底底色（跟随系统深浅色，取自现有 chrome token 色值） */
function opaqueFallbackBg(): string {
  return nativeTheme.shouldUseDarkColors ? '#0d0d14' : '#eef4ff';
}

/**
 * 默认材质按 Windows 版本判定：
 * Win11 22H2+（版本号 >= 10.0.22631，即 build >= 22631）默认 mica，其余默认 tabbed。
 * 非 Windows 平台 setBackgroundMaterial 不生效，返回 tabbed 仅作占位。
 */
export function defaultWindowMaterial(): WindowMaterial {
  if (process.platform !== 'win32') return 'tabbed';
  try {
    const build = Number(process.getSystemVersion().split('.')[2] ?? '0');
    return build >= 22631 ? 'mica' : 'tabbed';
  } catch (err) {
    log.warn('[Main] getSystemVersion failed, fallback to tabbed:', err);
    return 'tabbed';
  }
}

/** 解析用户已保存的材质；未保存或非法值回退到按系统版本判定的默认值 */
export function resolveWindowMaterial(saved: string | null | undefined): WindowMaterial {
  if (
    saved === 'none' ||
    saved === 'auto' ||
    saved === 'mica' ||
    saved === 'tabbed' ||
    saved === 'acrylic'
  ) {
    return saved;
  }
  return defaultWindowMaterial();
}

/** 指定材质对应的原生窗口背景色：none 给不透明兜底，其余透明让材质透出 */
export function windowBackgroundColor(material: WindowMaterial): string {
  return material === 'none' ? opaqueFallbackBg() : TRANSPARENT_BG;
}

/** 判断窗口是否为 mica-electron 的 MicaBrowserWindow（鸭子类型判定） */
function isMicaWindow(win: BrowserWindow): win is MicaWindow {
  return typeof (win as MicaWindow).executeDwm === 'function';
}

/** 当前渲染进程主题强调色 hex（与 themeStore ACCENTS 对齐，默认蓝色） */
export function currentAccentColor(): string {
  const saved = getSetting('ui_accent') ?? 'blue';
  return ACCENT_COLORS[saved] ?? ACCENT_COLORS['blue'];
}

/** 应用强调色 tint：DWM 边框色（mica-electron）+ 原生 setAccentColor（Electron 45） */
export function applyAccentColor(win: BrowserWindow): void {
  if (process.platform !== 'win32') return;
  const accent = currentAccentColor();
  try {
    if (isMicaWindow(win)) {
      win.setBorderColor?.(accent);
    }
    if (typeof win.setAccentColor === 'function') {
      win.setAccentColor(accent);
    }
  } catch (err) {
    log.error('[Main] applyAccentColor failed:', err);
  }
}

/**
 * 应用材质到窗口：先落背景色再上材质（与 BrowserWindow 构造顺序一致，避免闪透）。
 * win32 且窗口为 MicaBrowserWindow 时走 mica-electron 增强分支：
 * - Win11（build >= 22000）：auto/mica/tabbed/acrylic 映射对应 DWM 系统材质
 * - Win10：全部映射为真 Acrylic（SetWindowCompositionAttribute 用户态合成）
 * - none：关闭 DWM 与 user32 两条材质通道，配合不透明底色彻底降级
 * 非 mica-electron 窗口（splash/radial 等）回退 Electron 原生 setBackgroundMaterial。
 */
export function applyWindowMaterial(win: BrowserWindow, material: WindowMaterial): void {
  try {
    win.setBackgroundColor(windowBackgroundColor(material));
    if (process.platform !== 'win32') return;

    if (isMicaWindow(win)) {
      if (material === 'none') {
        // 关闭两条材质通道：先 user32（Win10 生效），再 DWM（Win11 生效）
        win.disableUser32?.();
        win.disableDWM?.();
      } else if (material === 'auto') {
        if (IS_WINDOWS_11) {
          win.executeDwm?.(PARAMS.BACKGROUND.AUTO, VALUE.THEME.AUTO);
        } else {
          win.setAcrylic?.();
        }
      } else if (material === 'mica') {
        if (IS_WINDOWS_11) {
          win.setMicaEffect?.();
        } else {
          win.setAcrylic?.();
        }
      } else if (material === 'tabbed') {
        if (IS_WINDOWS_11) {
          win.setMicaTabbedEffect?.();
        } else {
          win.setAcrylic?.();
        }
      } else {
        // acrylic
        if (IS_WINDOWS_11) {
          win.setMicaAcrylicEffect?.();
        } else {
          win.setAcrylic?.();
        }
      }
    } else {
      // 非 mica-electron 窗口（如 splash/radial 悬浮窗）：走原生 setBackgroundMaterial
      win.setBackgroundMaterial(material);
    }
    applyAccentColor(win);
  } catch (err) {
    log.error('[Main] applyWindowMaterial failed:', err);
  }
}
