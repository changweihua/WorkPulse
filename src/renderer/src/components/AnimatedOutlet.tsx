import { type ReactNode } from 'react'
import { Outlet, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'

/**
 * 路由切换动画：AnimatePresence + useOutlet 快照模式。
 * 退出时保留旧页面快照淡出，新页面随后淡入上移，避免内容闪变。
 */
export default function AnimatedOutlet(): ReactNode {
  const location = useLocation()
  const element = useOutlet()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {element ?? <Outlet />}
      </motion.div>
    </AnimatePresence>
  )
}
