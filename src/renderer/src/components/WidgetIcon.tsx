/**
 * 悬浮窗入口图标的唯一定义（单一数据源）。
 *
 * 同一个 key 在以下位置必须显示同一个图标 + 同一个主题色：
 * - Touch Bar 展开面板的快捷入口（品牌多色图标，彩色圆角底座，28px）
 * - 设置页「悬浮窗」的径向菜单列 / Touch Bar 列（品牌多色图标，彩色圆角底座，24px）
 * - 径向菜单扇区（透明玻璃底，品牌多色图标无底座）
 * - Touch Bar 底栏系统项也从此表取基础图形
 *
 * 图标分两类（与主程序图标风格统一，见 DESIGN.md 5.1）：
 * - 应用快捷入口（log/task/meeting/ai/screenshot/settings）：品牌多色填充图标，
 *   与侧栏导航同源（BrandIcons.tsx），统一品牌色底座。
 * - 系统状态（clock/wifi/battery…）：lucide 单色线性图标，依赖 currentColor
 *   表达动态状态（WifiOff/充电/静音/加载中），Touch Bar 底栏直接取用 icon。
 */
import { memo, type ComponentType, type SVGProps } from 'react';
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
import {
  BrandCalendar,
  BrandChat,
  BrandKanban,
  BrandScreenshot,
  BrandSettings,
  BrandWorklog,
} from './icons/BrandIcons';

type BrandGlyph = ComponentType<SVGProps<SVGSVGElement>>;

export interface WidgetIconMeta {
  /** 单色 lucide：系统状态项显示用，Touch Bar 底栏 sysIcon 直接取用 */
  icon: LucideIcon;
  /** 品牌多色图标：应用快捷入口显示用；存在时优先于 icon，且不走 currentColor */
  brandIcon?: BrandGlyph;
  /** 主题色：浅底用深色 tint；深色壁纸 / 深色主题下由 CSS 向白提亮 */
  tint: string;
  /** Touch Bar 展开面板用的短标签（设置页仍显示完整 label） */
  shortLabel: string;
}

/** 应用快捷入口统一底座色：主图标的灰紫结构色（品牌图标本体多色，底座不再各用杂色） */
const BRAND_TILE_TINT = '#7C7F95';

/**
 * 系统状态项 tint：收敛到主图标品牌色系（深蓝紫 #2C2F53/#4C4F6E、青 #11CBE5、灰紫 #7C7F95），
 * 仅电池/亮度保留少量语义色（绿/琥珀）以便一眼识别。均为深色变体，保证浅底线性图标对比度。
 */
export const WIDGET_ICON_META: Record<string, WidgetIconMeta> = {
  // ── 系统状态（Touch Bar 底栏常驻 / 设置页列表）：单色 lucide，保留动态状态表达 ──
  clock: { icon: Clock, tint: '#7C7F95', shortLabel: '时钟' },
  wifi: { icon: Wifi, tint: '#0E7490', shortLabel: 'Wi-Fi' },
  bluetooth: { icon: Bluetooth, tint: '#4C4F6E', shortLabel: '蓝牙' },
  battery: { icon: Battery, tint: '#0F766E', shortLabel: '电池' },
  cpu: { icon: Cpu, tint: '#2C2F53', shortLabel: 'CPU' },
  memory: { icon: MemoryStick, tint: '#4C4F6E', shortLabel: '内存' },
  volume: { icon: Volume2, tint: '#0E7490', shortLabel: '音量' },
  brightness: { icon: Sun, tint: '#b45309', shortLabel: '亮度' },
  // ── 应用快捷入口（Touch Bar 展开面板 / 径向菜单）：品牌多色图标 ──
  log: {
    icon: NotebookPen,
    brandIcon: BrandWorklog,
    tint: BRAND_TILE_TINT,
    shortLabel: '日志',
  },
  task: { icon: ListTodo, brandIcon: BrandKanban, tint: BRAND_TILE_TINT, shortLabel: '任务' },
  meeting: {
    icon: CalendarDays,
    brandIcon: BrandCalendar,
    tint: BRAND_TILE_TINT,
    shortLabel: '会议',
  },
  ai: { icon: Sparkles, brandIcon: BrandChat, tint: BRAND_TILE_TINT, shortLabel: 'AI' },
  screenshot: {
    icon: ScanLine,
    brandIcon: BrandScreenshot,
    tint: BRAND_TILE_TINT,
    shortLabel: '截图',
  },
  settings: {
    icon: Settings2,
    brandIcon: BrandSettings,
    tint: BRAND_TILE_TINT,
    shortLabel: '设置',
  },
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
  // 动态状态覆盖（外部传入）优先，其次品牌多色图标，最后单色 lucide。
  // overrideIcon 只用于系统状态的动态替换，出现时必须回到 currentColor 单色渲染。
  const BrandGlyph = !overrideIcon ? meta.brandIcon : undefined;
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
    // 品牌图标多色写死、不继承 currentColor，故 color 仅影响单色 lucide 分支。
    return (
      <span
        className={className}
        style={{ ...tintVars, display: 'inline-flex', color: meta.tint }}
        aria-hidden="true"
      >
        {showEmoji ? (
          <span style={{ fontSize: 24, lineHeight: '28px' }}>{emoji}</span>
        ) : BrandGlyph ? (
          <BrandGlyph width={24} height={24} className={iconClassName} />
        ) : (
          <Icon size={24} strokeWidth={1.9} className={iconClassName} />
        )}
      </span>
    );
  }

  const isTouchbar = variant === 'touchbar';
  const glyphSize = isTouchbar ? 17 : 15;
  return (
    <span
      className={`${isTouchbar ? 'tb-app-tile' : 'widget-icon-tile'}${className ? ` ${className}` : ''}`}
      style={tintVars}
      aria-hidden="true"
    >
      {showEmoji ? (
        <span className="tb-app-emoji">{emoji}</span>
      ) : BrandGlyph ? (
        <BrandGlyph width={glyphSize} height={glyphSize} className={iconClassName} />
      ) : (
        <Icon size={glyphSize} strokeWidth={1.9} className={iconClassName} />
      )}
    </span>
  );
}

// hw-stats 每秒推送会让 Touch Bar / 径向菜单整体重渲染；图标 props 都是原始值，
// memo 掉后这些纯展示节点不参与每秒 reconcile，是节流的一环。
export default memo(WidgetIcon);
