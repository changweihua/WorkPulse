import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/* ── 尺寸参数 ── */
const OUTER_R = 140
const INNER_R = 82
const GAP_PX = 5
const CENTER_R = 56
const WIDGET_SIZE = 340

const CENTER_SIZE = CENTER_R * 2 // 112px diameter
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number // degrees, 0 = right, -90 = top
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
 * 生成环形扇区 SVG path（平行切口版本）
 * 内弧间隙角度 > 外弧间隙角度，两侧切口呈平行直线。
 */
function describeArc(
  cx: number, cy: number,
  innerR: number, outerR: number,
  outerStart: number, outerEnd: number,
  innerStart: number, innerEnd: number,
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180
  const oS = toRad(outerStart), oE = toRad(outerEnd)
  const iS = toRad(innerStart), iE = toRad(innerEnd)

  const ox1 = cx + outerR * Math.cos(oS), oy1 = cy + outerR * Math.sin(oS)
  const ox2 = cx + outerR * Math.cos(oE), oy2 = cy + outerR * Math.sin(oE)
  const ix1 = cx + innerR * Math.cos(iE), iy1 = cy + innerR * Math.sin(iE)
  const ix2 = cx + innerR * Math.cos(iS), iy2 = cy + innerR * Math.sin(iS)

  const largeO = outerEnd - outerStart > 180 ? 1 : 0
  const largeI = innerEnd - innerStart > 180 ? 1 : 0

  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeO} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeI} 0 ${ix2} ${iy2} Z`
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
  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI)
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI)

  // 图标放在扇区弧形区域的精确中心
  const iconRadius = (INNER_R + OUTER_R) / 2

  return (
    <div
      className="relative select-none"
      style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}
    >
      {/* ═══ SVG 环形扇区 ═══ */}
      <AnimatePresence>
        {expanded && (
          <motion.svg
            key="ring"
            width={WIDGET_SIZE}
            height={WIDGET_SIZE}
            className="absolute inset-0"
            style={{ zIndex: 1 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <defs>
              <linearGradient id="segGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.80)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.50)" />
              </linearGradient>
            </defs>
            {ITEMS.map((item, i) => {
              const segStart = item.angle - segAngle / 2
              const segEnd = item.angle + segAngle / 2
              const path = describeArc(
                CX, CY, INNER_R, OUTER_R,
                segStart + gapOuterDeg / 2, segEnd - gapOuterDeg / 2,
                segStart + gapInnerDeg / 2, segEnd - gapInnerDeg / 2,
              )
              const isHover = hovered === item.key
              return (
                <motion.path
                  key={item.key}
                  d={path}
                  fill={isHover ? 'rgba(255,255,255,0.90)' : 'url(#segGlass)'}
                  style={{
                    cursor: 'pointer',
                    transformBox: 'view-box',
                    transformOrigin: `${CX}px ${CY}px`,
                    transition: 'fill 0.2s ease',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 24,
                    mass: 0.7,
                    delay: expanded ? i * 0.06 : (numItems - 1 - i) * 0.06,
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

      {/* ═══ 扇区图标（精确居中） ═══ */}
      <AnimatePresence>
        {expanded &&
          ITEMS.map((item, i) => {
            const pos = angleToXY(item.angle, iconRadius, CX, CY)
            return (
              <motion.div
                key={`icon-${item.key}`}
                className="absolute flex items-center justify-center pointer-events-none"
                style={{
                  left: pos.x, top: pos.y, zIndex: 3,
                  width: 40, height: 40,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 24,
                  mass: 0.7,
                  delay: expanded ? i * 0.06 : (numItems - 1 - i) * 0.06,
                }}
              >
                <span className="text-2xl drop-shadow-sm">{item.emoji}</span>
              </motion.div>
            )
          })}
      </AnimatePresence>

      {/* ═══ Hover tooltip（扇形外侧，留足空间） ═══ */}
      <AnimatePresence>
        {expanded && hovered && (() => {
          const item = ITEMS.find((it) => it.key === hovered)
          if (!item) return null
          const tipR = OUTER_R + 28
          const tipPos = angleToXY(item.angle, tipR, CX, CY)
          return (
            <motion.div
              key="tooltip"
              className="absolute pointer-events-none whitespace-nowrap rounded-lg px-3 py-1.5
                         text-sm font-medium text-zinc-700 dark:text-zinc-100"
              style={{
                left: tipPos.x, top: tipPos.y, zIndex: 10,
                transform: 'translate(-50%, -50%)',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                border: '1px solid rgba(255,255,255,0.4)',
              }}
              initial={{ opacity: 0, scale: 0.8, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ═══ 中心圆形 ═══ */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex flex-col items-center justify-center rounded-full
                   cursor-grab active:cursor-grabbing"
        style={{
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          background: 'rgba(255,255,255,0.88)',
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
        <span className="text-[14px] font-bold tracking-tight text-zinc-800 dark:text-zinc-100 select-none">
          WorkPulse
        </span>

        {/* 展开图标：未展开时显示，点击展开菜单 */}
        <motion.div
          className="absolute -bottom-1 flex items-center justify-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          initial={{ opacity: 0, scale: 0 }}
          animate={!expanded
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
            className="flex h-7 w-7 items-center justify-center rounded-full
                       bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                       hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-label="Expand menu"
          >
            <span className="text-xs leading-none">⊕</span>
          </button>
        </motion.div>

        {/* 收起按钮：展开后显示，点击收起菜单 */}
        <motion.div
          className="absolute -bottom-1 flex items-center justify-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          initial={{ opacity: 0, scale: 0 }}
          animate={expanded
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
            className="flex h-7 w-7 items-center justify-center rounded-full
                       bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                       hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-label="Collapse menu"
          >
            <span className="text-xs leading-none">✕</span>
          </button>
        </motion.div>
      </motion.div>
    </div>
  )
}
