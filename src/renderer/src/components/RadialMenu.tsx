import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/* ── 尺寸参数 ── */
const OUTER_R = 94
const INNER_R = 38
const GAP_PX = 3
const CENTER_R = 24
const WIDGET_SIZE = 206

// Simple work pulse icon: checkmark in circle
const ICON_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%2316a34a' opacity='0.9'/%3E%3Cpath d='M30 52 L44 66 L72 36' stroke='white' stroke-width='8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E`

const TOOLTIP_LABELS: Record<string, { zh: string; en: string }> = {
  log: { zh: '日志', en: 'Work Log' },
  task: { zh: '任务', en: 'Task' },
  meeting: { zh: '日程', en: 'Meeting' },
  ai: { zh: 'AI 生成', en: 'AI Generate' },
  screenshot: { zh: '截图', en: 'Screenshot' },
}

const CENTER_SIZE = CENTER_R * 2 // 68px diameter
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number
  action: () => void
}

/**
 * 生成环形扇区 SVG path（平行切口版本）
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
  const [show, setShow] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0 })

  const ITEMS: RadialItem[] = [
    { key: 'log', label: 'Work Log', emoji: '📝', angle: -90, action: () => window.radialApi.createLog() },
    { key: 'task', label: 'Task', emoji: '📋', angle: -18, action: () => window.radialApi.createTask() },
    { key: 'meeting', label: 'Meeting', emoji: '📅', angle: 54, action: () => window.radialApi.createMeeting() },
    { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 126, action: () => window.radialApi.openAI() },
    { key: 'screenshot', label: 'Screenshot', emoji: '📸', angle: 198, action: async () => {
      try {
        await window.radialApi.startCapture()
      } catch {
        setToast('❌ Capture failed')
        setTimeout(() => setToast(null), 2500)
      }
    } },
  ]

  useEffect(() => {
    window.radialApi.onShow(() => setShow(true))
  }, [])

  // 监听主进程截图结果，显示提示
  useEffect(() => {
    window.radialApi.onScreenshotResult((result) => {
      if (result.ok && result.width && result.height) {
        setToast(`📸 Saved (${result.width}×${result.height})`)
      } else {
        setToast('❌ Capture failed')
      }
      setTimeout(() => setToast(null), 2500)
    })
  }, [])

  // 拖拽：延迟判定，超过阈值才启动
  useEffect(() => {
    const DRAG_THRESHOLD = 5
    let dragStarted = false
    const handleMouseMove = (e: MouseEvent) => {
      const ref = dragRef.current
      if (dragStarted) {
        window.radialApi.dragMove(e.screenX, e.screenY)
      } else if (ref.startX !== 0 || ref.startY !== 0) {
        const dx = e.screenX - ref.startX
        const dy = e.screenY - ref.startY
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          dragStarted = true
          ref.active = true
          window.radialApi.dragStart(e.screenX, e.screenY)
        }
      }
    }
    const handleMouseUp = () => {
      if (dragStarted) {
        dragStarted = false
        dragRef.current.active = false
        window.radialApi.dragEnd()
      }
      dragRef.current.startX = 0
      dragRef.current.startY = 0
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    dragRef.current = { active: false, startX: e.screenX, startY: e.screenY }
  }, [])

  const numItems = ITEMS.length
  const segAngle = 360 / numItems
  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI)
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI)
  const iconRadius = (INNER_R + OUTER_R) / 2

  return (
    <div
      className="relative select-none"
      style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}
    >
      {/* ═══ SVG 环形扇区（始终显示） ═══ */}
      <svg
        key="ring"
        width={WIDGET_SIZE}
        height={WIDGET_SIZE}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      >
        <defs>
          <linearGradient id="segGlass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(240,242,246,0.96)" />
            <stop offset="100%" stopColor="rgba(225,228,234,0.92)" />
          </linearGradient>
        </defs>
        {ITEMS.map((item) => {
          const segStart = item.angle - segAngle / 2
          const segEnd = item.angle + segAngle / 2
          const path = describeArc(
            CX, CY, INNER_R, OUTER_R,
            segStart + gapOuterDeg / 2, segEnd - gapOuterDeg / 2,
            segStart + gapInnerDeg / 2, segEnd - gapInnerDeg / 2,
          )
          const isHover = hovered === item.key
          return (
            <path
              key={item.key}
              d={path}
              fill={isHover ? 'rgba(200,210,225,0.95)' : 'url(#segGlass)'}
              style={{
                cursor: 'pointer',
                transition: 'fill 0.2s ease',
                backdropFilter: 'blur(32px) saturate(180%)',
                WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              }}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              onClick={item.action}
            />
          )
        })}
      </svg>

      {/* ═══ 扇区图标 ═══ */}
      {ITEMS.map((item) => {
        const pos = angleToXY(item.angle, iconRadius, CX, CY)
        return (
          <div
            key={`icon-${item.key}`}
            className="absolute flex items-center justify-center pointer-events-none"
            style={{
              left: pos.x, top: pos.y, zIndex: 3,
              width: 40, height: 40,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="text-2xl drop-shadow-sm">{item.emoji}</span>
          </div>
        )
      })}

      {/* ═══ Hover tooltip ═══ */}
      <AnimatePresence>
        {hovered && (() => {
          const item = ITEMS.find((it) => it.key === hovered)
          if (!item) return null
          const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en'
          // New: inward direction (toward center, between center and inner edge)
          const tipR = INNER_R - 20
          const tipPos = angleToXY(item.angle, tipR, CX, CY)
          return (
            <motion.div
              key="tooltip"
              className="absolute pointer-events-none whitespace-nowrap rounded-lg px-3 py-1.5
                         text-sm font-medium text-zinc-800 dark:text-zinc-100"
              style={{
                left: tipPos.x, top: tipPos.y, zIndex: 10,
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                background: 'rgba(240,242,246,0.96)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid rgba(0,0,0,0.08)',
              }}
              initial={{ opacity: 0, scale: 0.8, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              {TOOLTIP_LABELS[item.key]?.[lang] ?? item.label}
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ═══ Toast ═══ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap rounded-lg px-3 py-1.5
                       text-sm font-medium text-zinc-800 dark:text-zinc-100"
            style={{
              bottom: 8, zIndex: 10,
              background: 'rgba(240,242,246,0.96)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 中心圆形：程序图标（拖拽 + 点击打开主窗口） ═══ */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   flex items-center justify-center rounded-full
                   cursor-grab active:cursor-grabbing"
        style={{
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          background: 'rgba(240,242,246,0.96)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow:
            'inset 0 1px 3px rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.08)',
          zIndex: 2,
        } as React.CSSProperties}
        onMouseDown={handleMouseDown}
      >
        <img
          src={ICON_SVG}
          alt="WorkPulse"
          className="pointer-events-none"
          style={{ width: CENTER_R * 1.2, height: CENTER_R * 1.2, objectFit: 'contain' }}
        />
      </div>
    </div>
  )
}
