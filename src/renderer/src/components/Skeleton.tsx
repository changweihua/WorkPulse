import { type ReactNode } from 'react';

/**
 * 骨架屏基础组件库
 * 提供 shimmer 动画的加载占位符，用于页面数据加载时展示结构化骨架。
 *
 * 设计原则：
 * - 使用 CSS 动画而非 JS 动画，保持轻量
 * - 支持 dark mode（通过 Tailwind dark: 前缀）
 * - 所有组件接受 className 以便灵活组合
 * - shimmer 方向和速度统一，保持视觉一致性
 */

// ─── 基础 shimmer 动画条 ────────────────────────────────────

interface SkeletonLineProps {
  /** 宽度，默认 '100%' */
  width?: string;
  /** 高度，默认 '0.75rem' (12px) */
  height?: string;
  /** 圆角，默认 '0.375rem' (6px) */
  rounded?: string;
  className?: string;
}

/** 单行骨架条 */
export function SkeletonLine({
  width = '100%',
  height = '0.75rem',
  rounded = '0.375rem',
  className = '',
}: SkeletonLineProps): ReactNode {
  return (
    <div
      className={`skeleton-shimmer bg-zinc-200 dark:bg-zinc-700/50 ${className}`}
      style={{ width, height, borderRadius: rounded }}
    />
  );
}

// ─── 圆形骨架 ──────────────────────────────────────────────

interface SkeletonCircleProps {
  /** 直径，默认 '2.5rem' (40px) */
  size?: string;
  className?: string;
}

/** 圆形骨架（头像、图标占位） */
export function SkeletonCircle({
  size = '2.5rem',
  className = '',
}: SkeletonCircleProps): ReactNode {
  return (
    <div
      className={`skeleton-shimmer bg-zinc-200 dark:bg-zinc-700/50 rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// ─── 矩形骨架 ──────────────────────────────────────────────

interface SkeletonRectProps {
  width?: string;
  height?: string;
  rounded?: string;
  className?: string;
}

/** 矩形骨架（卡片、图片、图表占位） */
export function SkeletonRect({
  width = '100%',
  height = '100%',
  rounded = '0.75rem',
  className = '',
}: SkeletonRectProps): ReactNode {
  return (
    <div
      className={`skeleton-shimmer bg-zinc-200 dark:bg-zinc-700/50 ${className}`}
      style={{ width, height, borderRadius: rounded }}
    />
  );
}

// ─── 复合骨架卡片 ──────────────────────────────────────────

interface SkeletonCardProps {
  /** 行数 */
  lines?: number;
  /** 是否显示圆形头像 */
  avatar?: boolean;
  /** 是否显示第二行较短的文本 */
  shortLast?: boolean;
  className?: string;
}

/** 常见的「头像 + 文本行」骨架卡片 */
export function SkeletonCard({
  lines = 3,
  avatar = false,
  shortLast = true,
  className = '',
}: SkeletonCardProps): ReactNode {
  return (
    <div className={`flex gap-3 p-4 ${className}`}>
      {avatar && <SkeletonCircle size="2.5rem" />}
      <div className="flex-1 space-y-2.5 pt-0.5">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine
            key={i}
            width={i === lines - 1 && shortLast ? '60%' : '100%'}
            height="0.75rem"
          />
        ))}
      </div>
    </div>
  );
}

// ─── 统计卡片骨架 ──────────────────────────────────────────

interface SkeletonStatCardProps {
  className?: string;
}

/** 模拟 StatCard 布局：左侧文本 + 右侧图标 */
export function SkeletonStatCard({ className = '' }: SkeletonStatCardProps): ReactNode {
  return (
    <div className={`h-[88px] p-4 pr-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 ${className}`}>
      <div className="flex items-center gap-4 h-full">
        <div className="w-10 h-10 shrink-0 rounded-lg skeleton-shimmer bg-zinc-200 dark:bg-zinc-700/50" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="3.5rem" height="0.625rem" />
          <SkeletonLine width="5rem" height="1.75rem" rounded="0.5rem" />
        </div>
      </div>
    </div>
  );
}

// ─── 看板任务卡片骨架 ──────────────────────────────────────

interface SkeletonTaskCardProps {
  className?: string;
}

/** 模拟 Kanban 任务卡片 */
export function SkeletonTaskCard({ className = '' }: SkeletonTaskCardProps): ReactNode {
  return (
    <div className={`p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 space-y-2 ${className}`}>
      <SkeletonLine width="85%" height="0.875rem" />
      <SkeletonLine width="60%" height="0.625rem" />
    </div>
  );
}

// ─── 表格行骨架 ────────────────────────────────────────────

interface SkeletonTableRowProps {
  columns?: number;
  className?: string;
}

/** 模拟表格/列表行 */
export function SkeletonTableRow({
  columns = 3,
  className = '',
}: SkeletonTableRowProps): ReactNode {
  const widths = ['40%', '30%', '20%'];
  return (
    <div className={`flex items-center gap-4 px-3 py-2.5 ${className}`}>
      {Array.from({ length: columns }, (_, i) => (
        <SkeletonLine key={i} width={widths[i % widths.length]} height="0.75rem" />
      ))}
    </div>
  );
}

// ─── 统一导出：shimmer 样式 ────────────────────────────────
// 此 CSS 可在全局样式表或组件中使用
export const SKELETON_CSS = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--skeleton-base, #e4e4e7) 25%,
    var(--skeleton-shine, #f4f4f5) 50%,
    var(--skeleton-base, #e4e4e7) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s ease-in-out infinite;
}

.dark .skeleton-shimmer {
  --skeleton-base: rgba(63, 63, 70, 0.5);
  --skeleton-shine: rgba(82, 82, 91, 0.5);
}
`;
