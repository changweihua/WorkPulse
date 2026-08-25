import { useEffect, useState, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'

interface RadialItem {
  key: string
  label: string
  emoji: string
  action: () => void
}

const CENTER_SIZE = 130      // 中心圆直径
const RING_INNER = 82        // 环形内半径（紧贴中心圆外）
const RING_OUTER = 148       // 环形外半径
const GAP_DEG = 6            // 扇区间间距（度）—— 平行切口
const WINDOW_SIZE = 320      // 窗口尺寸

const ITEMS: RadialItem[] = [
  { key: 'log', label: 'Work Log', emoji: '📝', action: () => window.radialApi.createLog() },
  { key: 'task', label: 'Task', emoji: '📋', action: () => window.radialApi.createTask() },
  { key: 'meeting', label: 'Meeting', emoji: '📅', action: () => window.radialApi.createMeeting() },
  { key: 'ai', label: 'AI Generate', emoji: '🤖', action: () => window.radialApi.openAI() },
]

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 22, mass: 0.8 }

/**
 * 生成环形扇区的 SVG path
 * @param cx 中心x
 * @param cy 中心y
 * @param innerR 内半径
 * @param outerR 外半径
 * @param startDeg 起始角度（度，0=上方，顺时针）
 * @param endDeg 结束角度
 */
function describeArc(
  cx: number, cy: number,
  innerR: number, outerR: number,
  startDeg: number, endDeg: number
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180
  const startRad = toRad(startDeg)
  const endRad = toRad(endDeg)

  const outerX1 = cx + outerR * Math.cos(startRad)
  const outerY1 = cy + outerR * Math.sin(startRad)
  const outerX2 = cx + outerR * Math.cos(endRad)
  const outerY2 = cy + outerR * Math.sin(endRad)
  const innerX1 = cx + innerR * Math.cos(endRad)
  const innerY1 = cy + innerR * Math.sin(endRad)
  const innerX2 = cx + innerR * Math.cos(startRad)
  const innerY2 = cy + innerR * Math.sin(startRad)

  const largeArc = endDeg - startDeg > 180 ? 1 : 0

  return [
    `M ${outerX1} ${outerY1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerX2} ${outerY2}`,
    `L ${innerX1} ${innerY1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX2} ${innerY2}`,
    'Z',
  ].join(' ')
}

/** 角度转坐标 */
function angleToXY(deg: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius }
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
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        // 拖拽结束，持久化窗口位置
        window.radialApi.dragEnd()
      }
    }
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

  const cx = WINDOW_SIZE / 2
  const cy = WINDOW_SIZE / 2
  const numItems = ITEMS.length
  const segmentDeg = 360 / numItems
  const usableDeg = segmentDeg - GAP_DEG

  // 每个间隙中点角度（扇区之间的边界）
  const gapAngles = ITEMS.map((_, i) => i * segmentDeg)

  return (
    <div
      className="relative select-none"
      style={{ width: WINDOW_SIZE, height: WINDOW_SIZE }}
    >
      {/* SVG 环形扇区 + 平行切口 */}
      <svg
        width={WINDOW_SIZE}
        height={WINDOW_SIZE}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {ITEMS.map((item, i) => {
          const startDeg = i * segmentDeg + GAP_DEG / 2
          const endDeg = startDeg + usableDeg
          const path = describeArc(cx, cy, RING_INNER, RING_OUTER, startDeg, endDeg)
          return (
            <path
              key={item.key}
              d={path}
              fill={hovered === item.key ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.32)'}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
              style={{
                transition: 'fill 0.2s ease',
                cursor: 'pointer',
                filter: hovered === item.key ? 'blur(0px) brightness(1.05)' : 'blur(0px)',
              }}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              onClick={item.action}
            />
          )
        })}

        {/* 平行切口：在每两个相邻扇区之间画一条垂直于半径（沿切线方向）的直线 */}
        {gapAngles.map((gapDeg, i) => {
          // 间隙中点角度。切口从内半径偏一侧到外半径偏另一侧，形成一条近似垂直于半径的弦线
          const half = GAP_DEG / 2
          const p1 = angleToXY(gapDeg - half, RING_INNER, cx, cy)
          const p2 = angleToXY(gapDeg + half, RING_OUTER, cx, cy)
          return (
            <line
              key={`cut-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )
        })}
      </svg>

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
          zIndex: 2,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={show ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={SPRING}
        onMouseDown={handleDragStart}
      >
        <span className="text-[15px] font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
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

      {/* 菜单项图标 + 文字（定位在每个扇区的弧中心） */}
      {ITEMS.map((item, i) => {
        const midDeg = i * segmentDeg + GAP_DEG / 2 + usableDeg / 2
        const iconRadius = (RING_INNER + RING_OUTER) / 2
        const pos = angleToXY(midDeg, iconRadius, cx, cy)
        const isHover = hovered === item.key

        // 文字在环形外侧
        const labelRadius = RING_OUTER + 14
        const labelPos = angleToXY(midDeg, labelRadius, cx, cy)

        return (
          <motion.div
            key={item.key}
            className="absolute flex flex-col items-center"
            style={{ zIndex: 3 }}
            initial={{ x: cx, y: cy, scale: 0, opacity: 0 }}
            animate={
              show
                ? { x: pos.x - 20, y: pos.y - 20, scale: 1, opacity: 1 }
                : { x: cx, y: cy, scale: 0, opacity: 0 }
            }
            transition={{ ...SPRING, delay: show ? 0.06 * i : 0 }}
          >
            <button
              type="button"
              onClick={item.action}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              className="flex items-center justify-center rounded-full transition-transform"
              style={{
                width: 40,
                height: 40,
                transform: isHover ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <span className="text-xl drop-shadow-sm">{item.emoji}</span>
            </button>
            {/* 文字标签（始终可见） */}
            <span
              className="absolute whitespace-nowrap text-[10px] font-medium text-zinc-600 dark:text-zinc-300 pointer-events-none"
              style={{
                top: labelPos.y - cy + (WINDOW_SIZE / 2) - pos.y + 20,
                left: '50%',
                transform: 'translateX(-50%)',
                opacity: isHover ? 1 : 0.85,
                transition: 'opacity 0.15s',
              }}
            >
              {item.label}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
