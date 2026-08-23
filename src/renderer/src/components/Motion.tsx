import { type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'

/**
 * 全局统一动效编排。
 * 原则（沿用路由过渡基调）：纯透明度 + 位移，稳重不抖动；
 * 持续动画（spinner/pulse）仍用 CSS，入场动画统一走这里。
 */

/** 统一缓动曲线：快出缓停 */
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const

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
