import { type ReactNode } from 'react';
import { Outlet, useLocation, useOutlet } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { SPRING_SPRING } from './Motion';

/**
 * 路由切换动画：AnimatePresence + useOutlet 快照模式。
 *
 * 设计纪律（DeepSeek 风格）：
 * - 入场：弹簧驱动位移（y:8→0），opacity 独立淡入
 * - 退场：快速淡出（0.18s），不用弹簧（退场要快）
 * - 异步时机：入场慢（弹簧自然节奏），退场快（不拖泥带水）
 */
export default function AnimatedOutlet(): ReactNode {
  const location = useLocation();
  const element = useOutlet();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{
          // 入场：弹簧驱动 y 位移，opacity 独立过渡
          y: SPRING_SPRING,
          opacity: { duration: 0.18, ease: 'easeOut' },
        }}
      >
        {element ?? <Outlet />}
      </motion.div>
    </AnimatePresence>
  );
}
