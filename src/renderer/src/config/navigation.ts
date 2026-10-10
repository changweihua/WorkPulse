import { createElement, type ComponentType, type ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { BarChart3, Bot, CalendarRange, Zap, Rss } from 'lucide-react';
import type { TranslationKey } from '../lib/i18n';
import { SiOnnx, SiPaddle, SiPaddlepaddle } from '../components/icons/SiliconIcons';

/**
 * 全局导航配置（单一数据源）。
 *
 * 侧栏（NavLayout）、旧顶部导航（Layout）与命令面板（CommandPalette）
 * 共享同一份配置，避免导航项双写漂移。
 */

/** 图标描述：lucide/硅基图标等 React 组件，或 iconify 图标名 */
export type NavIcon = ComponentType<{ className?: string }> | { iconify: string };

export interface NavItemConfig {
  /** 路由 path（不含前导斜杠，与 react-router 配置一致） */
  path: string;
  /** i18n key（有固定文案的项可省略，改用 fallbackLabel） */
  labelKey?: TranslationKey;
  /** 无 i18n key 时的固定文案（如「RSS」「AI 模型」） */
  fallbackLabel?: string;
  icon: NavIcon;
  /** 所属分区 id */
  sectionId: string;
}

export interface NavSectionConfig {
  id: string;
  /** 分区标题（与现有侧栏一致，直接使用固定中文文案） */
  label: string;
  items: NavItemConfig[];
}

/** 渲染导航图标为 React 节点（className 统一控制尺寸） */
export function renderNavIcon(icon: NavIcon, className?: string): ReactNode {
  if (typeof icon === 'function') return createElement(icon, { className });
  return createElement(Icon, { icon: icon.iconify, className });
}

/** 解析导航项显示文案（i18n key 优先，其次固定文案，最后回退 path） */
export function resolveNavLabel(
  item: NavItemConfig,
  t: (key: TranslationKey) => string,
): string {
  if (item.labelKey) return t(item.labelKey);
  return item.fallbackLabel ?? item.path;
}

/** 导航分区配置（与原 NavLayout 内联 sections 一一对应，视觉保持不变） */
export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'core',
    label: '核心',
    items: [
      {
        path: 'worklog',
        labelKey: 'nav.worklog',
        icon: { iconify: 'line-md:clipboard-list' },
        sectionId: 'core',
      },
      {
        path: 'kanban',
        labelKey: 'nav.kanban',
        icon: { iconify: 'line-md:grid-3' },
        sectionId: 'core',
      },
      {
        path: 'calendar',
        labelKey: 'nav.calendar',
        icon: { iconify: 'line-md:calendar' },
        sectionId: 'core',
      },
      { path: 'stats', labelKey: 'nav.stats', icon: BarChart3, sectionId: 'core' },
    ],
  },
  {
    id: 'insights',
    label: '洞察',
    items: [
      {
        path: 'report',
        labelKey: 'nav.report',
        icon: { iconify: 'line-md:text-box' },
        sectionId: 'insights',
      },
      { path: 'reports', labelKey: 'nav.weekly', icon: CalendarRange, sectionId: 'insights' },
    ],
  },
  {
    id: 'reading',
    label: '阅读',
    items: [{ path: 'rss', fallbackLabel: 'RSS', icon: Rss, sectionId: 'reading' }],
  },
  {
    id: 'tools',
    label: '工具',
    items: [
      { path: 'ocr', labelKey: 'nav.ocr', icon: SiPaddle, sectionId: 'tools' },
      { path: 'pp', labelKey: 'nav.pp', icon: SiPaddlepaddle, sectionId: 'tools' },
      { path: 'xray', labelKey: 'nav.xray', icon: Zap, sectionId: 'tools' },
      { path: 'onnx', labelKey: 'nav.onnx', icon: SiOnnx, sectionId: 'tools' },
      {
        path: 'model-config',
        fallbackLabel: 'AI 模型',
        icon: { iconify: 'mdi:robot' },
        sectionId: 'tools',
      },
      // AI 对话：路由存在但侧栏暂未渲染入口，仅由顶部导航与命令面板索引
      { path: 'chat', labelKey: 'nav.chat', icon: Bot, sectionId: 'tools' },
      { path: 'ai-stats', labelKey: 'nav.aiStats', icon: BarChart3, sectionId: 'tools' },
      {
        path: 'fluid-glass',
        labelKey: 'nav.fluidGlass',
        icon: { iconify: 'mdi:glass-water' },
        sectionId: 'tools',
      },
      {
        path: 'dotnet',
        labelKey: 'nav.dotnet',
        icon: { iconify: 'mdi:dot-net' },
        sectionId: 'tools',
      },
    ],
  },
];

/** 侧栏底部「设置」入口（不参与分区展示，但同样可被命令面板检索） */
export const NAV_SETTINGS: NavItemConfig = {
  path: 'settings',
  labelKey: 'nav.settings',
  icon: { iconify: 'line-md:cog' },
  sectionId: 'footer',
};

/** 拍平全部导航项（分区项 + 设置），供命令面板检索 */
export function flattenNavItems(): NavItemConfig[] {
  return [...NAV_SECTIONS.flatMap((section) => section.items), NAV_SETTINGS];
}

/** 按 path 查找导航项 */
export function findNavItem(path: string): NavItemConfig | undefined {
  return flattenNavItems().find((item) => item.path === path);
}

/**
 * 顶部导航（旧 Layout）的渲染顺序。
 * 侧栏按 NAV_SECTIONS 分区渲染，顶部导航按此顺序平铺，两者共用同一份导航数据。
 */
export const TOP_NAV_ORDER: string[] = [
  'worklog',
  'kanban',
  'report',
  'stats',
  'calendar',
  'chat',
  'pp',
  'xray',
  'onnx',
  'ocr',
];
