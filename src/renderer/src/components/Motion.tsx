import { type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * 全局统一动效编排。
 * 原则（沿用路由过渡基调）：纯透明度 + 位移，稳重不抖动；
 * 持续动画（spinner/pulse）仍用 CSS，入场动画统一走这里。
 *
 * Spring 物理参数（DeepSeek 风格）：
 *   stiffness=180, damping=28 — 半隐式欧拉积分，
 *   弹簧仅驱动位移，opacity 用独立过渡避免「弹簧透明度」。
 */

/** 统一缓动曲线：快出缓停（用于非弹簧场景） */
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const;

/** 全局弹簧参数：stiffness=180, damping=28 */
export const SPRING_SPRING = { type: 'spring' as const, stiffness: 180, damping: 28 };

/** 侧栏宽度折叠：行程长，用更硬的弹簧收住尾振 */
export const SPRING_SIDEBAR = { type: 'spring' as const, stiffness: 300, damping: 30 };
/** 悬浮操作按钮（返回顶部 / AI FAB）：小尺寸快速弹出，允许轻微回弹 */
export const SPRING_FAB = { type: 'spring' as const, stiffness: 400, damping: 22 };
/** 侧滑 AI 面板：大面积位移，阻尼更高以避免甩过头 */
export const SPRING_PANEL = { type: 'spring' as const, stiffness: 400, damping: 35 };
/** 截图工具栏首次弹出：短促有力，附带较小质量 */
export const SPRING_TOOLBAR_POP = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 34,
  mass: 0.6,
};
/** 截图工具栏跟随选区移动：更软的弹簧，避免拖拽时抖动 */
export const SPRING_TOOLBAR_FOLLOW = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 30,
  mass: 0.7,
};

interface FadeInProps {
  children: ReactNode;
  /** 延迟秒数，用于卡片错峰 */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  /** 是否带上浮位移；dnd-kit 拖拽项必须传 false，避免 transform 冲突 */
  rise?: boolean;
}

/** 入场：淡入（可选上浮）（替代原 animate-slide-up / animate-pop-in） */
export function FadeIn({
  children,
  delay = 0,
  className,
  style,
  rise = true,
}: FadeInProps): ReactNode {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: rise ? 12 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: MOTION_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

interface FadeProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  duration?: number;
}

/** 纯淡入（替代原 animate-fade-in），用于遮罩、弹层、下拉 */
export function Fade({ children, className, style, duration = 0.2 }: FadeProps): ReactNode {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: MOTION_EASE }}
    >
      {children}
    </motion.div>
  );
}
