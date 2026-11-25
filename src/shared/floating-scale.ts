/**
 * 悬浮窗收起态尺寸（径向菜单悬浮球）。
 *
 * 语义（v3 —— 用户明确：要调的是「悬浮窗收起状态的窗口大小」，不是整体文字大小）：
 *   滑动条只调整径向菜单**收起态**的窗口物理尺寸。
 *   有效缩放 Z = COLLAPSED_BASE_SCALE × (百分比 / 100)，
 *   100% = 当前默认外观（收起球比基准设计大 1.3×）。
 *   展开态径向菜单恒为 206 设计尺寸，Touch Bar 完全不受影响。
 *
 * 核心机制（窗口与画面同步放大，杜绝「边框被裁」）：
 *   主进程收起态设 bounds = 206 × Z（DIP）+ webContents.setZoomFactor(Z)
 *   ⇒ CSS 视口恒 206 → 渲染层几何一行不改，玻璃 backdrop-filter 不破坏（页面级 zoom 已实测）。
 *   窗口物理边界与画面同系数放大，画面永不顶到旧 206 边界被裁。
 *   展开态恢复 bounds=206 / zoomFactor=1；命中区半径按 Z 换算成 DIP 同步。
 *
 * 存储形式：百分比整数字符串（'100' = 默认外观），与 TTS 等滑块一致。
 */
export const FLOATING_SCALE_KEY = 'floating_scale';

/** 收起态基础放大系数 —— renderer（RadialMenu / HardwareStatusRing）与 main（radial-window）三处共用 */
export const COLLAPSED_BASE_SCALE = 1.3;

/** 滑动条档位：70%~160%，步长 5%。下限保证悬浮球仍可读，上限避免遮挡过多屏幕 */
export const FLOATING_SCALE_RANGE = {
  min: 70,
  max: 160,
  step: 5,
  default: 100,
} as const;

/** 读取设置值 → 合法百分比整数（越界钳制、非法回默认） */
export function normalizeFloatingScale(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw === null || raw === undefined || raw === '') {
    return FLOATING_SCALE_RANGE.default;
  }
  return Math.min(FLOATING_SCALE_RANGE.max, Math.max(FLOATING_SCALE_RANGE.min, Math.round(n)));
}

/** 百分比 → 用户缩放系数（100 → 1）；有效收起缩放 = COLLAPSED_BASE_SCALE × 此值 */
export function floatingScaleFactor(percent: number): number {
  return normalizeFloatingScale(String(percent)) / 100;
}
