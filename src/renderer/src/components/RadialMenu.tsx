import { useEffect, useState, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number // degrees, 0 = right, -90 = top
  action: () => void
}

const RADIUS = 112

const ITEMS: RadialItem[] = [
  { key: 'log', label: 'Work Log', emoji: '📝', angle: -90, action: () => window.radialApi.createLog() },
  { key: 'task', label: 'Task', emoji: '📋', angle: 0, action: () => window.radialApi.createTask() },
  { key: 'meeting', label: 'Meeting', emoji: '📅', angle: 90, action: () => window.radialApi.createMeeting() },
  { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 180, action: () => window.radialApi.openAI() },
]

const SPRING = { type: 'spring' as const, stiffness: 520, damping: 17, mass: 0.7 }

export function RadialMenu(): ReactNode {
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    window.radialApi.onShow(() => setShow(true))
  }, [])

  // IPC-based drag: 监听全局 mousemove/mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      window.radialApi.dragMove(e.screenX, e.screenY)
    }
    const handleMouseUp = () => {
      isDragging.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDragStart = (e: React.MouseEvent) => {
    // 只在点击中心圆盘时触发拖拽，不在按钮上触发
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    isDragging.current = true
    window.radialApi.dragStart(e.screenX, e.screenY)
  }

  return (
    <div className="relative w-[320px] h-[320px] select-none">
      {/* Central hub: liquid glass disc with logo + close */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex flex-col items-center justify-center rounded-full
                   surface-card cursor-grab active:cursor-grabbing"
        style={{
          width: 132,
          height: 132,
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 45%, rgba(120,150,255,0.10) 100%), var(--color-surface-card)',
          boxShadow:
            'inset 0 1px 2px rgba(255,255,255,0.30), inset 0 -1px 0 rgba(255,255,255,0.08), var(--glass-shadow)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={show ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={SPRING}
        onMouseDown={handleDragStart}
      >
        <span className="text-[15px] font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
          WorkPulse
        </span>
        <button
          type="button"
          onClick={() => window.radialApi.close()}
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-full
                     bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                     hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
          aria-label="Close radial menu"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      </motion.div>

      {/* Action buttons arranged evenly in a circle */}
      {ITEMS.map((item, i) => {
        const rad = (item.angle * Math.PI) / 180
        const tx = Math.cos(rad) * RADIUS
        const ty = Math.sin(rad) * RADIUS
        const isHover = hovered === item.key

        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={item.action}
            onHoverStart={() => setHovered(item.key)}
            onHoverEnd={() => setHovered((h) => (h === item.key ? null : h))}
            className="group absolute left-1/2 top-1/2 flex items-center justify-center
                       rounded-full surface-card text-2xl"
            style={{
              width: 64,
              height: 64,
              marginLeft: -32,
              marginTop: -32,
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.03) 45%, rgba(120,150,255,0.08) 100%), var(--color-surface-card)',
              boxShadow:
                'inset 0 1px 2px rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06), var(--glass-shadow)',
            }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={
              show
                ? { x: tx, y: ty, scale: 1, opacity: 1 }
                : { x: 0, y: 0, scale: 0, opacity: 0 }
            }
            transition={{ ...SPRING, delay: show ? 0.04 * i : 0 }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.92 }}
          >
            <span className="drop-shadow-sm">{item.emoji}</span>

            {/* Tooltip */}
            <motion.span
              className="pointer-events-none absolute whitespace-nowrap rounded-lg px-2.5 py-1
                         text-xs font-medium text-zinc-700 dark:text-zinc-200 surface-card"
              style={{
                left: '50%',
                top: '50%',
                x: item.angle === 0 ? 52 : item.angle === 180 ? -52 : 0,
                y: item.angle === -90 ? -52 : item.angle === 90 ? 52 : 0,
                translateX: '-50%',
                translateY: '-50%',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: isHover ? 1 : 0 }}
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
