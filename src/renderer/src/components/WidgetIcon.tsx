/**
 * 悬浮窗入口图标的唯一定义（单一数据源）。
 *
 * 同一个 key 在以下位置必须显示同一个矢量图标 + 同一个主题色：
 * - Touch Bar 展开面板的快捷入口（彩色圆角底座，28px）
 * - 设置页「悬浮窗」的径向菜单列 / Touch Bar 列（彩色圆角底座，24px）
 * - 径向菜单扇区（透明玻璃底，保持无底座但用同一图形与颜色）
 * - Touch Bar 底栏系统项也从此表取基础图形
 *
 * 旧实现各处各画一套（彩色 emoji / 统一 ⚙️ 兜底 / 线性图标），
 * 既风格不一致，设置页里 8 个系统项还全显示成齿轮。
 */
import { memo } from 'react';
import {
  AppWindow,
  Battery,
  Bluetooth,
  CalendarDays,
  Clock,
  Cpu,
  ListTodo,
  MemoryStick,
  NotebookPen,
  ScanLine,
  Settings2,
  Sparkles,
  Sun,
  Volume2,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

export interface WidgetIconMeta {
  icon: LucideIcon;
  /** 主题色：浅底用深色 tint；深色壁纸 / 深色主题下由 CSS 向白提亮 */
  tint: string;
  /** Touch Bar 展开面板用的短标签（设置页仍显示完整 label） */
  shortLabel: string;
}

/** 内置项：8 个系统状态 + 6 个应用快捷入口 */
export const WIDGET_ICON_META: Record<string, WidgetIconMeta> = {
  // ── 系统状态（Touch Bar 底栏常驻 / 设置页列表） ──
  clock: { icon: Clock, tint: '#475569', shortLabel: '时钟' },
  wifi: { icon: Wifi, tint: '#2563eb', shortLabel: 'Wi-Fi' },
  bluetooth: { icon: Bluetooth, tint: '#4f46e5', shortLabel: '蓝牙' },
  battery: { icon: Battery, tint: '#15803d', shortLabel: '电池' },
  cpu: { icon: Cpu, tint: '#7c3aed', shortLabel: 'CPU' },
  memory: { icon: MemoryStick, tint: '#c2410c', shortLabel: '内存' },
  volume: { icon: Volume2, tint: '#0891b2', shortLabel: '音量' },
  brightness: { icon: Sun, tint: '#b45309', shortLabel: '亮度' },
  // ── 应用快捷入口（Touch Bar 展开面板 / 径向菜单） ──
  log: { icon: NotebookPen, tint: '#4f46e5', shortLabel: '日志' },
  task: { icon: ListTodo, tint: '#c2410c', shortLabel: '任务' },
  meeting: { icon: CalendarDays, tint: '#9333ea', shortLabel: '会议' },
  ai: { icon: Sparkles, tint: '#0891b2', shortLabel: 'AI' },
  screenshot: { icon: ScanLine, tint: '#db2777', shortLabel: '截图' },
  settings: { icon: Settings2, tint: '#475569', shortLabel: '设置' },
};

/** 自定义程序兜底（用户未指定 emoji / exe 图标时） */
export const PROGRAM_ICON_META: WidgetIconMeta = {
  icon: AppWindow,
  tint: '#2563eb',
  shortLabel: '程序',
};

export function getWidgetIcon(key: string): WidgetIconMeta {
  return WIDGET_ICON_META[key] ?? PROGRAM_ICON_META;
}

export type WidgetIconVariant = 'touchbar' | 'settings' | 'radial';

export interface WidgetIconProps {
  itemKey: string;
  /** 自定义程序：保留用户设置的 emoji / 图标，不覆盖用户数据 */
  isProgram?: boolean;
  emoji?: string;
  variant?: WidgetIconVariant;
  /** 动态状态覆盖（WifiOff / BatteryCharging / VolumeX / Loader2 等） */
  overrideIcon?: LucideIcon;
  /** 透传给图标 SVG 的 className（如 dim / spin / hw-alert-pulse） */
  iconClassName?: string;
  className?: string;
}

function WidgetIcon({
  itemKey,
  isProgram = false,
  emoji,
  variant = 'settings',
  overrideIcon,
  iconClassName,
  className,
}: WidgetIconProps): React.JSX.Element {
  const meta = getWidgetIcon(itemKey);
  const Icon = overrideIcon ?? meta.icon;
  // 内置项一律走矢量图标；只有自定义程序才沿用用户自己的 emoji
  const showEmoji = isProgram && !!emoji;
  const tintVars = {
    '--tb-tint': meta.tint,
    '--widget-tint': meta.tint,
  } as React.CSSProperties;

  if (variant === 'radial') {
    // 径向菜单是独立透明窗口（radial-only.css，无 index.css / Tailwind 依赖），
    // 所以这里全部用内联样式；保持无底座，只统一图标图形与颜色。
    return (
      <span
        className={className}
        style={{ ...tintVars, display: 'inline-flex', color: meta.tint }}
        aria-hidden="true"
      >
        {showEmoji ? (
          <span style={{ fontSize: 24, lineHeight: '28px' }}>{emoji}</span>
        ) : (
          <Icon size={24} strokeWidth={1.9} className={iconClassName} />
        )}
      </span>
    );
  }

  const isTouchbar = variant === 'touchbar';
  return (
    <span
      className={`${isTouchbar ? 'tb-app-tile' : 'widget-icon-tile'}${className ? ` ${className}` : ''}`}
      style={tintVars}
      aria-hidden="true"
    >
      {showEmoji ? (
        <span className="tb-app-emoji">{emoji}</span>
      ) : (
        <Icon size={isTouchbar ? 17 : 15} strokeWidth={1.9} className={iconClassName} />
      )}
    </span>
  );
}

// hw-stats 每秒推送会让 Touch Bar / 径向菜单整体重渲染；图标 props 都是原始值，
// memo 掉后这些纯展示节点不参与每秒 reconcile，是节流的一环。
export default memo(WidgetIcon);
