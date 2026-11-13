/**
 * 全局排版偏好（字体族 + 基础字号）。
 *
 * 设计约束：
 * - settings 里存的是**预设 id**，不是 CSS 字符串。主进程把 id 映射到这里的白名单
 *   font-family 链后再注入 insertCSS，避免渲染层通过 settings:set 传入任意 CSS 造成注入。
 * - 字体链一律带中文回退（'Microsoft YaHei UI'），保证中英混排不会出现豆腐块。
 * - 默认「JetBrains Maple Mono / 12px」，与项目 @theme 的 --font-sans 口径一致。
 */
export interface FontPreset {
  id: string;
  label: string;
  /** 可直接拼进 CSS 的 font-family 链（已含引号） */
  stack: string;
}

export const FONT_PRESETS: readonly FontPreset[] = [
  {
    id: 'jetbrains-maple-mono',
    label: 'JetBrains Maple Mono',
    stack: "'JetBrains Maple Mono', 'Maple Mono NF CN', 'Microsoft YaHei UI', sans-serif",
  },
  {
    id: 'maple-mono-cn',
    label: 'Maple Mono NF CN',
    stack: "'Maple Mono NF CN', 'JetBrains Maple Mono', 'Microsoft YaHei UI', sans-serif",
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono', 'Microsoft YaHei UI', monospace",
  },
  {
    id: 'cascadia-code',
    label: 'Cascadia Code',
    stack: "'Cascadia Code', 'Microsoft YaHei UI', monospace",
  },
  {
    id: 'consolas',
    label: 'Consolas',
    stack: "Consolas, 'Microsoft YaHei UI', monospace",
  },
  {
    id: 'yahei-ui',
    label: 'Microsoft YaHei UI',
    stack: "'Microsoft YaHei UI', 'Segoe UI', sans-serif",
  },
  {
    id: 'system',
    label: '系统默认 / System UI',
    stack: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
  },
] as const;

export const DEFAULT_FONT_ID = 'jetbrains-maple-mono';

/** 允许的基础字号（px）；12 为默认 */
export const FONT_SIZES = [11, 12, 13, 14, 16] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const DEFAULT_FONT_SIZE: FontSize = 12;

export const FONT_FAMILY_SETTING_KEY = 'app_font_family';
export const FONT_SIZE_SETTING_KEY = 'app_font_size';

export function normalizeFontId(value: string | null | undefined): string {
  return FONT_PRESETS.some((p) => p.id === value) ? (value as string) : DEFAULT_FONT_ID;
}

/** 从白名单解析 font-family 链；非法 id 一律回退默认，绝不把原始字符串拼进 CSS */
export function resolveFontStack(value: string | null | undefined): string {
  const id = normalizeFontId(value);
  return FONT_PRESETS.find((p) => p.id === id)!.stack;
}

export function normalizeFontSize(value: string | number | null | undefined): FontSize {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return (FONT_SIZES as readonly number[]).includes(n) ? (n as FontSize) : DEFAULT_FONT_SIZE;
}
