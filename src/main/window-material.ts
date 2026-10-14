/**
 * L0 系统材质（Windows DWM backgroundMaterial）统一入口
 *
 * 职责：
 * 1. 按 Windows 版本给出默认材质（Win11 22H2+ 用 mica）
 * 2. 把材质应用到窗口，并同步切换原生窗口背景色：
 *    - 材质开启（mica/tabbed/acrylic）→ 背景透明，DWM 材质透出
 *    - 材质为 none → 不透明底色兜底，避免露出黑底/桌面穿透（降级路径）
 * 材质由 DWM 合成，零 JS/GPU 自维护成本。
 */
import type { BrowserWindow } from 'electron';
import { nativeTheme } from 'electron';
import log from 'electron-log/main';

/** 系统材质取值：none = 不透明（GPU 合成异常时的降级项） */
export type WindowMaterial = 'none' | 'mica' | 'tabbed' | 'acrylic';

/** 材质透出所需的透明窗口背景色 */
const TRANSPARENT_BG = '#00000000';

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
  if (saved === 'none' || saved === 'mica' || saved === 'tabbed' || saved === 'acrylic') {
    return saved;
  }
  return defaultWindowMaterial();
}

/** 指定材质对应的原生窗口背景色：none 给不透明兜底，其余透明让材质透出 */
export function windowBackgroundColor(material: WindowMaterial): string {
  return material === 'none' ? opaqueFallbackBg() : TRANSPARENT_BG;
}

/** 应用材质到窗口：先落背景色再上材质（与 BrowserWindow 构造顺序一致，避免闪透） */
export function applyWindowMaterial(win: BrowserWindow, material: WindowMaterial): void {
  try {
    win.setBackgroundColor(windowBackgroundColor(material));
    if (process.platform === 'win32') {
      win.setBackgroundMaterial(material);
    }
  } catch (err) {
    log.error('[Main] applyWindowMaterial failed:', err);
  }
}
