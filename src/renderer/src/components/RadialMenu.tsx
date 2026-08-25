import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

const OUTER_R = 120
const INNER_R = 70
const GAP_PX = 4
const CENTER_R = 50
const WIDGET_SIZE = 250

const CENTER_SIZE = CENTER_R * 2 // 100px diameter
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number
  action: () => void
}

const ITEMS: RadialItem[] = [
  { key: 'log', label: 'Work Log', emoji: '📝', angle: -90, action: () => window.radialApi.createLog() },
  { key: 'task', label: 'Task', emoji: '📋', angle: 0, action: () => window.radialApi.createTask() },
  { key: 'meeting', label: 'Meeting', emoji: '📅', angle: 90, action: () => window.radialApi.createMeeting() },
  { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 180, action: () => window.radialApi.openAI() },
]

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 24, mass: 0.7 }

/**
 * 生成环形扇区的 SVG path（平行切口版本）
 * 关键：内弧的间隙角度 > 外弧的间隙角度，使两侧切口呈平行直线。
 *
 * @param cx 中心x
 * @param cy 中心y
 * @param innerR 内半径
 * @param outerR 外半径
 * @param outerStart 外弧起始角度（度，0=上方，顺时针）
 * @param outerEnd 外弧结束角度
 * @param innerStart 内弧起始角度（与外弧同侧）
 * @param innerEnd 内弧结束角度（与外弧同侧）
 */
function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  outerStart: number,
  outerEnd: number,
  innerStart: number,
  innerEnd: number
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180
  const oS = toRad(outerStart)
  const oE = toRad(outerEnd)
  const iS = toRad(innerStart)
  const iE = toRad(innerEnd)

  const ox1 = cx + outerR * Math.cos(oS)
  const oy1 = cy + outerR * Math.sin(oS)
  const ox2 = cx + outerR * Math.cos(oE)
  const oy2 = cy + outerR * Math.sin(oE)
  const ix1 = cx + innerR * Math.cos(iE)
  const iy1 = cy + innerR * Math.sin(iE)
  const ix2 = cx + innerR * Math.cos(iS)
  const iy2 = cy + innerR * Math.sin(iS)

  const largeOuter = outerEnd - outerStart > 180 ? 1 : 0
  const largeInner = innerEnd - innerStart > 180 ? 1 : 0

  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${largeOuter} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${largeInner} 0 ${ix2} ${iy2}`,
    'Z',
  ].join(' ')
}

/** 角度转坐标（0=上方，顺时针） */
function angleToXY(deg: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius }
}

export function RadialMenu(): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0 })

  useEffect(() => {
    window.radialApi.onShow(() => setShow(true))
  }, [])

  // 拖拽结束后持久化窗口位置
  useEffect(() => {
    const handleMouseUp = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false
        window.radialApi.dragEnd()
      }
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    dragRef.current = { active: true, startX: e.screenX, startY: e.screenY }
    window.radialApi.dragStart(e.screenX, e.screenY)
  }, [])

  const numItems = ITEMS.length
  const segAngle = 360 / numItems
  // 间隙换算成角度：外弧间隙小，内弧间隙大 → 平行切口
  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI)
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI)

  return (
    <div
      className="relative select-none"
      style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}
    >
      {/* SVG 环形扇区（平行切口，无连接线） */}
      <AnimatePresence>
        {expanded && (
          <motion.svg
            key="ring"
            width={WIDGET_SIZE}
            height={WIDGET_SIZE}
            className="absolute inset-0"
            style={{
              overflow: 'visible',
              backdropFilter: 'blur(32px) saturate(180%)',
              WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              zIndex: 1,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <defs>
              <linearGradient id="segGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.55)" />
              </linearGradient>
            </defs>
            {ITEMS.map((item, i) => {
              const segStart = item.angle - segAngle / 2
              const segEnd = item.angle + segAngle / 2
              const outerStart = segStart + gapOuterDeg / 2
              const outerEnd = segEnd - gapOuterDeg / 2
              const innerStart = segStart + gapInnerDeg / 2
              const innerEnd = segEnd - gapInnerDeg / 2
              const path = describeArc(
                CX, CY, INNER_R, OUTER_R,
                outerStart, outerEnd, innerStart, innerEnd
              )
              const isHover = hovered === item.key
              return (
                <motion.path
                  key={item.key}
                  d={path}
                  fill={isHover ? 'rgba(255,255,255,0.85)' : 'url(#segGlass)'}
                  style={{
                    cursor: 'pointer',
                    transformBox: 'view-box',
                    transformOrigin: `${CX}px ${CY}px`,
                    transition: 'fill 0.2s ease',
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 24,
                    mass: 0.7,
                    delay: expanded ? i * 0.05 : (numItems - 1 - i) * 0.05,
                  }}
                  onMouseEnter={() => setHovered(item.key)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={item.action}
                />
              )
            })}
          </motion.svg>
        )}
      </AnimatePresence>

      {/* 图标 + hover tooltip（定位在每个扇区弧中心） */}
      <AnimatePresence>
        {expanded &&
          ITEMS.map((item, i) => {
            const midDeg = item.angle
            const iconRadius = (INNER_R + OUTER_R) / 2
            const pos = angleToXY(midDeg, iconRadius, CX, CY)
            const isHover = hovered === item.key
            // tooltip 偏移方向：沿半径向外
            const tipRadius = OUTER_R + 18
            const tipPos = angleToXY(midDeg, tipRadius, CX, CY)
            return (
              <motion.div
                key={`label-${item.key}`}
                className="absolute pointer-events-none"
                style={{ left: pos.x, top: pos.y, zIndex: 3, transform: 'translate(-50%, -50%)' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 24,
                  mass: 0.7,
                  delay: expanded ? i * 0.05 : (numItems - 1 - i) * 0.05,
                }}
              >
                <span className="text-xl drop-shadow-sm" style={{ opacity: isHover ? 1 : 0.9 }}>
                  {item.emoji}
                </span>
              </motion.div>
            )
          })}
      </AnimatePresence>

      {/* Hover tooltip（扇形外侧） */}
      <AnimatePresence>
        {expanded && hovered && (() => {
          const item = ITEMS.find((it) => it.key === hovered)
          if (!item) return null
          const tipRadius = OUTER_R + 20
          const tipPos = angleToXY(item.angle, tipRadius, CX, CY)
          return (
            <motion.div
              key="tooltip"
              className="absolute pointer-events-none whitespace-nowrap rounded-lg px-2.5 py-1
                         text-xs font-medium text-zinc-700 dark:text-zinc-200"
              style={{
                left: tipPos.x, top: tipPos.y, zIndex: 4,
                transform: 'translate(-50%, -50%)',
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* 中心圆形（可拖拽 / 点击展开收起） */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex flex-col items-center justify-center rounded-full
                   cursor-grab active:cursor-grabbing"
        style={{
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow:
            'inset 0 1px 3px rgba(255,255,255,0.5), inset 0 -1px 0 rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.12)',
          border: '1px solid rgba(255,255,255,0.4)',
          zIndex: 2,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
        initial={{ scale: 0, opacity: 0 }}
        animate={show ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={SPRING}
        onClick={toggleExpand}
        onMouseDown={handleDragStart}
      >
        <span className="text-[13px] font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
          WorkPulse
        </span>
        {/* 关闭按钮：默认隐藏，展开菜单才显示，点击收起菜单（不关窗口） */}
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full
                     bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                     hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Collapse"
          initial={{ opacity: 0, scale: 0 }}
          animate={expanded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span className="text-[10px] leading-none">✕</span>
        </motion.button>
      </motion.div>
    </div>
  )
}
