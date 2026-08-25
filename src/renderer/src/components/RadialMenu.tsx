import { useEffect, useState, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number // degrees, 0 = top, clockwise
  action: () => void
}

const RING_RADIUS = 120 // 菜单项到圆心的距离
const ITEM_SIZE = 60
const CENTER_SIZE = 140

// 均匀分布4个菜单项，从顶部(-90°)开始
const ITEMS: RadialItem[] = [
  { key: 'log', label: 'Work Log', emoji: '📝', angle: 0, action: () => window.radialApi.createLog() },
  { key: 'task', label: 'Task', emoji: '📋', angle: 90, action: () => window.radialApi.createTask() },
  { key: 'meeting', label: 'Meeting', emoji: '📅', angle: 180, action: () => window.radialApi.createMeeting() },
  { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 270, action: () => window.radialApi.openAI() },
]

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 22, mass: 0.8 }

/** 角度转坐标（0°=上方，顺时针） */
function angleToXY(deg: number, radius: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180 // -90 让 0° 指向正上方
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius }
}

export function RadialMenu(): ReactNode {
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    window.radialApi.onShow(() => setShow(true))
  }, [])

  // IPC 拖拽
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      window.radialApi.dragMove(e.screenX, e.screenY)
    }
    const handleMouseUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    isDragging.current = true
    window.radialApi.dragStart(e.screenX, e.screenY)
  }

  return (
    <div className="relative w-[320px] h-[320px] select-none">
      {/* 中心圆形 */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex flex-col items-center justify-center rounded-full cursor-grab active:cursor-grabbing"
        style={{
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          background: 'rgba(255,255,255,0.35)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow:
            'inset 0 1px 3px rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.08)',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={show ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={SPRING}
        onMouseDown={handleDragStart}
      >
        <span className="text-[16px] font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
          WorkPulse
        </span>
        <button
          type="button"
          onClick={() => window.radialApi.close()}
          className="mt-1 flex h-6 w-6 items-center justify-center rounded-full
                     bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                     hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
          aria-label="Close"
        >
          <span className="text-xs leading-none">✕</span>
        </button>
      </motion.div>

      {/* 环形菜单项 */}
      {ITEMS.map((item, i) => {
        const pos = angleToXY(item.angle, RING_RADIUS)
        const isHover = hovered === item.key

        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={item.action}
            onHoverStart={() => setHovered(item.key)}
            onHoverEnd={() => setHovered((h) => (h === item.key ? null : h))}
            className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center"
            style={{
              width: ITEM_SIZE,
              height: ITEM_SIZE,
              marginLeft: -ITEM_SIZE / 2,
              marginTop: -ITEM_SIZE / 2,
            }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={
              show
                ? { x: pos.x, y: pos.y, scale: 1, opacity: 1 }
                : { x: 0, y: 0, scale: 0, opacity: 0 }
            }
            transition={{ ...SPRING, delay: show ? 0.06 * i : 0 }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
          >
            {/* 图标：方形毛玻璃 */}
            <div
              className="flex items-center justify-center rounded-2xl text-2xl"
              style={{
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                background: 'rgba(255,255,255,0.35)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                boxShadow:
                  'inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.06)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              <span className="drop-shadow-sm">{item.emoji}</span>
            </div>

            {/* 文字标签：沿圆环外侧分布 */}
            <motion.span
              className="absolute whitespace-nowrap text-[10px] font-medium text-zinc-600 dark:text-zinc-300"
              style={{
                // 文字在图标外侧，沿径向偏移
                top: pos.y > 0 ? `calc(50% + ${ITEM_SIZE / 2 + 8}px)` : undefined,
                bottom: pos.y < 0 ? `calc(50% + ${ITEM_SIZE / 2 + 8}px)` : undefined,
                left: pos.x > 0 ? `calc(50% + ${ITEM_SIZE / 2 + 4}px)` : undefined,
                right: pos.x < 0 ? `calc(50% + ${ITEM_SIZE / 2 + 4}px)` : undefined,
                // 对于水平位置(0°/180°)的特殊处理
                ...(item.angle === 0 || item.angle === 180
                  ? {
                      top: '50%',
                      transform: 'translateY(-50%)',
                      ...(item.angle === 0
                        ? { left: `calc(50% + ${ITEM_SIZE / 2 + 8}px)` }
                        : { right: `calc(50% + ${ITEM_SIZE / 2 + 8}px)` }),
                    }
                  : {}),
                // 对于垂直位置(90°/270°)的特殊处理
                ...(item.angle === 90 || item.angle === 270
                  ? {
                      left: '50%',
                      transform: 'translateX(-50%)',
                      ...(item.angle === 90
                        ? { top: `calc(50% + ${ITEM_SIZE / 2 + 8}px)` }
                        : { bottom: `calc(50% + ${ITEM_SIZE / 2 + 8}px)` }),
                    }
                  : {}),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: isHover ? 1 : 0.7 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          </motion.button>
        )
      })}
    </div>
  )
}
