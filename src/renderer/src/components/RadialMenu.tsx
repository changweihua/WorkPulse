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

      {/* ═══ 中心圆形：程序图标 + 收起按钮（均居中） ═══ */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex items-center justify-center rounded-full
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
        onDoubleClick={toggleExpand}
        onMouseDown={handleDragStart}
      >
        {/* 程序图标：收起时显示 */}
        <motion.img
          src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNzg0MDg1MDIzMjc1IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjI0Mzk3IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPjxwYXRoIGQ9Ik02NTEuNjEwOTA5IDEwMjMuOTkySDI3OS4yNzc4MThsOS4yNTU5MjgtNC42Mzk5NjRhMTg2LjE1ODU0NiAxODYuMTU4NTQ2IDAgMCAwIDEwMC4wOTUyMTgtMTM0LjIwNjk1MWwxOC44NzE4NTItMTA3LjAzOTE2NGE5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAxIDkyLjE1OTI4LTc5LjkzNTM3NUg2MTcuNDM1MTc2YzQ2LjMxOTYzOCAwIDg1LjU5OTMzMSAzNC4wNzk3MzQgOTIuMTU5MjggNzkuOTM1Mzc1bDM0LjE1OTczMyAxMzkuNjMwOTA5YzcuMjc5OTQzIDUwLjg5NTYwMi0yOC4wODc3ODEgOTguMDQ3MjM0LTc4Ljk4MzM4MyAxMDUuMzE5MTc3LTQuMzU5OTY2IDAuNjIzOTk1LTguNzU5OTMyIDAuOTM1OTkzLTEzLjE2Nzg5NyAwLjkzNTk5M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0Mzk4Ij48L3BhdGg+PHBhdGggZD0iTTc0Mi4yOTgyMDEgOTExLjczNjg3N2wtMy44NjM5Ny0xNS44MTU4NzYtNS40Nzk5NTctMjIuMzY3ODI2LTYuMjcxOTUxLTI1LjYzMTc5OS02LjI3MTk1MS0yNS42Mzk4LTUuNDc5OTU3LTIyLjM2NzgyNS0zLjg2Mzk3LTE1LjgwNzg3Ny0xLjQ3MTk4OS01Ljk5OTk1M2E5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAwLTkyLjE1OTI4LTc5LjkzNTM3NWgtMi41NTk5OGEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAwIDAgNDYuNTUxNjM2aDIuNTU5OThhNDYuNzY3NjM1IDQ2Ljc2NzYzNSAwIDAgMSA0Ni4wNzk2NCAzOS45NTk2ODhjMC4yMTU5OTggMS41MDM5ODggMC41MDM5OTYgMi45OTk5NzcgMC44NzE5OTMgNC40Nzk5NjVsMzMuNTM1NzM4IDEzNy4wNDY5MjlhNDYuNTU5NjM2IDQ2LjU1OTYzNiAwIDAgMS00Ni4zMTE2MzggNTEuMjM5NkgyNTUuOTk4QTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDAgMjU1Ljk5OCAxMDIzLjk5MmgzOTUuNjEyOTA5YzUxLjM4MzU5OSAwLjAzMiA5My4wNzEyNzMtNDEuNTk5Njc1IDkzLjEwMzI3My05Mi45NzUyNzQgMC00LjQ0Nzk2NS0wLjMxOTk5OC04Ljg3OTkzMS0wLjk0Mzk5My0xMy4yNzk4OTZsLTEuNDcxOTg4LTUuOTk5OTUzeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQzOTkiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA3NDQuNzE0MTgyaDkzLjEwMzI3M2E2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxIDAgMTM5LjYzODkwOUg0ODguNzE2MTgyYTY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEgMC0xMzkuNjMwOTA5eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDAiPjwvcGF0aD48cGF0aCBkPSJNOTMuMDk1MjczIDBoODM3LjgwMTQ1NEM5ODIuMzEyMzI2IDAgMTAyMy45OTIgNDEuNjc5Njc0IDEwMjMuOTkyIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDk1MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjOTk5QUFDIiBwLWlkPSIyNDQwMSI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgMGg2OTguMTcwNTQ1YzUxLjQxNTU5OCAwIDkzLjA4NzI3MyA0MS42Nzk2NzQgOTMuMDg3MjczIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDg3MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQwMiI+PC9wYXRoPjxwYXRoIGQ9Ik05MjkuNTkyNzM4IDIyLjkxOTgyMWE0Ny43NTk2MjcgNDcuNzU5NjI3IDAgMCAwLTcuODM5OTM5IDAuNjYzOTk1IDQ3LjMzNTYzIDQ3LjMzNTYzIDAgMCAwLTM4LjYyMzY5OCA1NC4zMTk1NzV2MC4wMzJsMC4wMTU5OTkgMC4wOCAwLjI4Nzk5OCAxLjg5NTk4NSAwLjE3NTk5OSAxLjA3OTk5MWMwLjA0IDAuNDYzOTk2IDAuMDc5OTk5IDAuOTI3OTkzIDAuMTQzOTk5IDEuMzk5OTg5IDAuMjU1OTk4IDIuMzExOTgyIDAuNDMxOTk3IDQuNjM5OTY0IDAuNTI3OTk2IDcuMDA3OTQ2bDAuMDA3OTk5IDAuMTU5OTk4djAuMDA4bDAuMDA4IDAuMTUxOTk5djAuMDI0bDAuMDA4IDAuMTQzOTk5djAuMDE2bDAuMDE2IDAuNjU1OTk1djAuMDE1OTk5bDAuMDA4IDAuMTUxOTk5djAuMTk5OTk5bDAuMDA4IDAuMTE5OTk5djAuNjk1OTk0bDAuMDE2IDAuMDMydjYwNy42MjcyNTNsLTAuMDA4IDAuMTAzOTk5djAuMzM1OTk3bC0wLjAwOCAwLjEyNzk5OVY3MDAuMjkwNTI5bC0wLjAwOCAwLjEzNTk5OXYwLjE2Nzk5OWwtMC4wMDggMC4yNzE5OTd2MC4wMjRsLTAuMDA4IDAuMTM1OTk5VjcwMS4zMzA1MjFsLTAuMDI0IDAuMjg3OTk4djAuMzExOTk3bC0wLjAxNTk5OSAwLjE0Mzk5OXYwLjI5NTk5OGEzLjU4Mzk3MiAzLjU4Mzk3MiAwIDAgMC0wLjAyNCAwLjI5NTk5N3YwLjAwOGMtMC4zNDM5OTcgNy4zNTk5NDMtMS41Njc5ODggMTQuNjQ3ODg2LTMuNjM5OTcyIDIxLjcxOTgzMWE0Ni41NTE2MzYgNDYuNTUxNjM2IDAgMCAwIDg5LjMzNTMwMiAyNi4xNjc3OTVjNC45ODM5NjEtMTcuMDE1ODY3IDcuNTExOTQxLTM0LjY1NTcyOSA3LjUwMzk0Mi01Mi4zOTE1OVY5My4wOTUyNzNjMC03LjA3OTk0NS0wLjM5OTk5Ny0xNC4xNTE4ODktMS4xOTk5OTEtMjEuMTc1ODM1YTU0LjQ3OTU3NCA1NC40Nzk1NzQgMCAwIDAtMC4yNzE5OTgtMi4wMTU5ODQgNTEuOTU5NTk0IDUxLjk1OTU5NCAwIDAgMC0wLjM3NTk5Ny0zLjA2Mzk3NmwtMC43ODM5OTQtNS4wNTU5NjFhNDUuNzc1NjQyIDQ1Ljc3NTY0MiAwIDAgMC00NS4yMzE2NDYtMzguODYzNjk2eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDMiPjwvcGF0aD48cGF0aCBkPSJNNzkxLjI3MzgxOCAwSDkzLjA4NzI3M0M0MS42Nzk2NzQgMCAwIDQxLjY3OTY3NCAwIDkzLjA4NzI3M3Y1MTEuOTk2aDg4NC4zNjEwOTF2LTUxMS45OTZDODg0LjM2MTA5MSA0MS42Nzk2NzQgODQyLjY4MTQxNyAwIDc5MS4yNjU4MTggMHoiIGZpbGw9IiMyQzJGNTMiIHAtaWQ9IjI0NDA0Ij48L3BhdGg+PHBhdGggZD0iTTQ2NS40NTIzNjQgNjk4LjE3MDU0NmE0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMSAxLTkzLjA4NzI3MyAwIDQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAxIDEgOTMuMDg3MjczIDB6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwNSI+PC9wYXRoPjxwYXRoIGQ9Ik05NTQuMTY4NTQ2IDEzOS42MzA5MDlhMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAyMy4yNzk4MTggMjMuMjc5ODE4djIzMi43MTgxODJhMjMuMjcxODE4IDIzLjI3MTgxOCAwIDEgMS00Ni41NTE2MzcgMHYtMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDIzLjI3OTgxOC0yMy4yNzk4MTh6IiBmaWxsPSIjMkMyRjUzIiBwLWlkPSIyNDQwNiI+PC9wYXRoPjxwYXRoIGQ9Ik02OS44MjM0NTUgNjA1LjA5MTI3M2g3NDQuNzE0MTgxYTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41MzU2MzZINjkuODIzNDU1YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMC00Ni41MzU2MzZ6IiBmaWxsPSIjRUFFQUVFIiBwLWlkPSIyNDQwNyI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgNDY1LjQ1MjM2NGg2OTguMTcwNTQ1YTQ2LjU1MTYzNiA0Ni41NTE2MzYgMCAwIDEgMCA5My4wODcyNzJIOTMuMDk1MjczYTQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAwIDEgMC05My4wODcyNzJ6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwOCI+PC9wYXRoPjxwYXRoIGQ9Ik0xMzkuNjMwOTA5IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iIzExQ0JFNSIgcC1pZD0iMjQ0MDkiPjwvcGF0aD48cGF0aCBkPSJNMTE2LjM2NzA5MSA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEtMC4wMDggNDYuNTQzNjM3IDIzLjI3MTgxOCAyMy4yNzE4MTggMCAwIDEgMC00Ni41NDM2Mzd6IiBmaWxsPSIjQkNGNEY1IiBwLWlkPSIyNDQxMCI+PC9wYXRoPjxwYXRoIGQ9Ik0zMjUuODIxNDU1IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAxNiA5My4xMDMyNzMgNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSAwLjAxNi05My4xMDMyNzN6IiBmaWxsPSIjOTFFREY4IiBwLWlkPSIyNDQxMSI+PC9wYXRoPjxwYXRoIGQ9Ik01MTEuOTk2IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAwOCA5My4xMDMyNzNBNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSA1MTEuOTk2IDQxOC45MDA3Mjd6IiBmaWxsPSIjRkRCOEJGIiBwLWlkPSIyNDQxMiI+PC9wYXRoPjxwYXRoIGQ9Ik02OTguMTcwNTQ2IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iI0ZBNDY1OSIgcC1pZD0iMjQ0MTMiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA0MTguOTAwNzI3YTIzLjI3OTgxOCAyMy4yNzk4MTggMCAxIDEgMCA0Ni41NTk2MzcgMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAwLTQ2LjU1OTYzN3pNNjc0Ljg5ODcyNyA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41NDM2MzcgMjMuMjcxODE4IDIzLjI3MTgxOCAwIDAgMSAwLTQ2LjU0MzYzN3oiIGZpbGw9IiNGRURFRTEiIHAtaWQ9IjI0NDE0Ij48L3BhdGg+PHBhdGggZD0iTTMwMi41NDE2MzYgNDE4LjkwMDcyN2EyMy4yNzk4MTggMjMuMjc5ODE4IDAgMSAxIDAgNDYuNTU5NjM3IDIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NTk2Mzd6IiBmaWxsPSIjRTlGRkY1IiBwLWlkPSIyNDQxNSI+PC9wYXRoPjxwYXRoIGQ9Ik0yMDkuNDU0MzY0IDk3Ny40NDgzNjRoMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDAgNDYuNTQzNjM2aC0yMzIuNzE4MTgyYTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NDM2MzZ6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQxNiI+PC9wYXRoPjwvc3ZnPg=="
          alt="WorkPulse"
          className="pointer-events-none"
          style={{ width: 52, height: 52, objectFit: 'contain', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          initial={{ opacity: 1 }}
          animate={{ opacity: expanded ? 0 : 1 }}
          transition={{ duration: 0.2 }}
        />

        {/* 关闭按钮：展开时显示，收起时隐藏 */}
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
          }}
          className="absolute flex items-center justify-center rounded-full
                     bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-300
                     hover:bg-zinc-900/10 dark:hover:bg-white/20 transition-colors"
          style={{
            width: CENTER_SIZE, height: CENTER_SIZE,
            WebkitAppRegion: 'no-drag',
            pointerEvents: expanded ? 'auto' : 'none',
          } as React.CSSProperties}
          aria-label="Collapse menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <span className="text-lg leading-none">✕</span>
        </motion.button>
      </motion.div>
    </div>
  )
}
