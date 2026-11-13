/** 悬浮窗形态：径向菜单 / Touch Bar */
export type WidgetMode = 'radial' | 'touchbar';

/** ── 几何常量：主进程窗口 bounds 与渲染层布局共用，避免改高度时两处漂移 ── */
export const TOUCHBAR_W = 560;
/** 底栏行高（系统状态项） */
export const TOUCHBAR_BAR_H = 56;
/** 展开面板行高（快捷入口）。从 54 提到 72：容纳 30px 图标底座 + 标签且不被裁切 */
export const TOUCHBAR_PANEL_H = 72;
/** 展开态窗口总高 */
export const TOUCHBAR_EXPANDED_H = TOUCHBAR_BAR_H + TOUCHBAR_PANEL_H;

/**
 * 悬停详情卡片占用的窗口高度（主进程扩窗与渲染层布局共用）。
 * 悬浮窗是 frameless + transparent，超出 bounds 的内容会被直接裁掉，
 * 因此卡片出现时主进程必须同步把窗口向上扩这么多像素。
 */
export const TOUCHBAR_POPOVER_H = 196;

/**
 * 悬停卡片补充的设备详情。
 * 实时字段（Wi-Fi/蓝牙/CPU/内存/电池）走 hw-stats 推送，这里只放
 * 静态或采集较慢、不适合每秒推的字段；亮度异步回填，其余同步可读。
 */
export interface DeviceDetails {
  /** 默认音频输出设备名（winmm waveOutGetDevCapsW）；null = 读取失败 */
  audioDevice: string | null;
  /** 本机第一个非回环 IPv4；null = 无可用地址 */
  ipv4: string | null;
  /** 当前显示器亮度 0-100；null = 不支持 / 尚未采集完成 */
  brightness: number | null;
  /** 显示器是否支持软件亮度调节 */
  brightnessSupported: boolean;
  /** CPU 型号 */
  cpuModel: string | null;
  /** 逻辑处理器数量 */
  cpuCores: number;
  /** 本次快照时间戳 */
  ts: number;
}

/** L0 系统窗口材质（设置页配置，Touch Bar 背景跟随同一取值） */
export type WindowMaterial = 'none' | 'auto' | 'mica' | 'tabbed' | 'acrylic';

/** Touch Bar 显示项（与 radial_items 同构，key 区分功能） */
export interface TouchbarItem {
  key: string;
  label: string;
  emoji?: string;
  /** system=系统状态/快捷控制（常驻底栏）；app=WorkPulse 功能入口（展开面板）；program=自定义程序 */
  type?: 'system' | 'app' | 'program';
  programPath?: string;
  enabled: boolean;
}

/** 系统项（底栏常驻） */
export const TOUCHBAR_SYSTEM_KEYS = [
  'clock',
  'wifi',
  'bluetooth',
  'battery',
  'cpu',
  'memory',
  'volume',
  'brightness',
] as const;

/** 应用入口（展开面板） */
export const TOUCHBAR_APP_KEYS = [
  'log',
  'task',
  'meeting',
  'ai',
  'screenshot',
  'settings',
] as const;

/** Touch Bar 默认显示项（状态常驻 + 快捷开关 + 控制 + WorkPulse 入口） */
export const TOUCHBAR_DEFAULT_ITEMS: TouchbarItem[] = [
  { key: 'clock', label: '时钟', type: 'system', enabled: true },
  { key: 'wifi', label: 'Wi-Fi', type: 'system', enabled: true },
  { key: 'bluetooth', label: '蓝牙', type: 'system', enabled: true },
  { key: 'battery', label: '电池', type: 'system', enabled: true },
  { key: 'cpu', label: 'CPU', type: 'system', enabled: true },
  { key: 'memory', label: '内存', type: 'system', enabled: true },
  { key: 'volume', label: '音量', type: 'system', enabled: true },
  { key: 'brightness', label: '亮度', type: 'system', enabled: true },
  { key: 'log', label: '工作日志', emoji: '📝', type: 'app', enabled: true },
  { key: 'task', label: '任务管理', emoji: '📋', type: 'app', enabled: true },
  { key: 'meeting', label: '会议记录', emoji: '📅', type: 'app', enabled: true },
  { key: 'ai', label: 'AI 生成', emoji: '🤖', type: 'app', enabled: true },
  { key: 'screenshot', label: '截图标注', emoji: '📸', type: 'app', enabled: true },
  { key: 'settings', label: '设置', emoji: '⚙️', type: 'app', enabled: true },
];
