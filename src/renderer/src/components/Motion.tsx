import { type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'

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
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const

/** 全局弹簧参数：stiffness=180, damping=28 */
export const SPRING_SPRING = { type: 'spring' as const, stiffness: 180, damping: 28 }

interface FadeInProps {
  children: ReactNode
  /** 延迟秒数，用于卡片错峰 */
  delay?: number
  className?: string
  style?: CSSProperties
  /** 是否带上浮位移；dnd-kit 拖拽项必须传 false，避免 transform 冲突 */
  rise?: boolean
}

/** 入场：淡入（可选上浮）（替代原 animate-slide-up / animate-pop-in） */
export function FadeIn({ children, delay = 0, className, style, rise = true }: FadeInProps): ReactNode {
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
  )
}

interface SpringInProps {
  children: ReactNode
  /** 延迟秒数，用于卡片错峰 */
  delay?: number
  className?: string
  style?: CSSProperties
  /** 弹簧驱动的位移距离（px） */
  y?: number
  /** 自定义弹簧参数（默认 stiffness=180, damping=28） */
  spring?: { stiffness?: number; damping?: number }
}

/**
 * 弹簧入场：位移由弹簧物理驱动，opacity 用独立过渡。
 * 适合需要「自然弹性」感的入场，如列表项、面板展开。
 * spring @ spring 原则：弹簧只做位移，不同时改 opacity。
 */
export function SpringIn({
  children,
  delay = 0,
  className,
  style,
  y = 16,
  spring,
}: SpringInProps): ReactNode {
  const s = { ...SPRING_SPRING, ...spring }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: { ...s, delay },
        opacity: { duration: 0.24, ease: 'easeOut', delay },
      }}
    >
      {children}
    </motion.div>
  )
}

interface SpringScaleProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** 悬停时的缩放值 */
  scale?: number
}

/**
 * 弹簧缩放：用于悬停效果。
 * scale 由弹簧驱动，hover 时弹性放大，离开时弹性回弹。
 */
export function SpringScale({ children, className, style, scale = 1.04 }: SpringScaleProps): ReactNode {
  return (
    <motion.div
      className={className}
      style={style}
      whileHover={{ scale }}
      whileTap={{ scale: 0.97 }}
      transition={SPRING_SPRING}
    >
      {children}
    </motion.div>
  )
}

interface FadeProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  duration?: number
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
  )
}
