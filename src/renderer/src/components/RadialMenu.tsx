import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'

/* ── 尺寸参数 ── */
const OUTER_R = 94
const INNER_R = 38
const GAP_PX = 3
const CENTER_R = 24
const WIDGET_SIZE = 206
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2

// WorkPulse program icon
const ICON_SVG = `data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNzg0MDg1MDIzMjc1IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjI0Mzk3IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPjxwYXRoIGQ9Ik02NTEuNjEwOTA5IDEwMjMuOTkySDI3OS4yNzc4MThsOS4yNTU5MjgtNC42Mzk5NjRhMTg2LjE1ODU0NiAxODYuMTU4NTQ2IDAgMCAwIDEwMC4wOTUyMTgtMTM0LjIwNjk1MWwxOC44NzE4NTItMTA3LjAzOTE2NGE5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAxIDkyLjE1OTI4LTc5LjkzNTM3NUg2MTcuNDM1MTc2YzQ2LjMxOTYzOCAwIDg1LjU5OTMzMSAzNC4wNzk3MzQgOTIuMTU5MjggNzkuOTM1Mzc1bDM0LjE1OTczMyAxMzkuNjMwOTA5YzcuMjc5OTQzIDUwLjg5NTYwMi0yOC4wODc3ODEgOTguMDQ3MjM0LTc4Ljk4MzM4MyAxMDUuMzE5MTc3LTQuMzU5OTY2IDAuNjIzOTk1LTguNzU5OTMyIDAuOTM1OTkzLTEzLjE2Nzg5NyAwLjkzNTk5M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0Mzk4Ij48L3BhdGg+PHBhdGggZD0iTTc0Mi4yOTgyMDEgOTExLjczNjg3N2wtMy44NjM5Ny0xNS44MTU4NzYtNS40Nzk5NTctMjIuMzY3ODI2LTYuMjcxOTUxLTI1LjYzMTc5OS02LjI3MTk1MS0yNS42Mzk4LTUuNDc5OTU3LTIyLjM2NzgyNS0zLjg2Mzk3LTE1LjgwNzg3Ny0xLjQ3MTk4OS01Ljk5OTk1M2E5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAwLTkyLjE1OTI4LTc5LjkzNTM3NWgtMi41NTk5OGEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAwIDAgNDYuNTUxNjM2aDIuNTU5OThhNDYuNzY3NjM1IDQ2Ljc2NzYzNSAwIDAgMSA0Ni4wNzk2NCAzOS45NTk2ODhjMC4yMTU5OTggMS41MDM5ODggMC41MDM5OTYgMi45OTk5NzcgMC44NzE5OTMgNC40Nzk5NjVsMzMuNTM1NzM4IDEzNy4wNDY5MjlhNDYuNTU5NjM2IDQ2LjU1OTYzNiAwIDAgMS00Ni4zMTE2MzggNTEuMjM5NkgyNTUuOTk4QTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDAgMjU1Ljk5OCAxMDIzLjk5MmgzOTUuNjEyOTA5YzUxLjM4MzU5OSAwLjAzMiA5My4wNzEyNzMtNDEuNTk5Njc1IDkzLjEwMzI3My05Mi45NzUyNzQgMC00LjQ0Nzk2NS0wLjMxOTk5OC04Ljg3OTkzMS0wLjk0Mzk5My0xMy4yNzk4OTZsLTEuNDcxOTg4LTUuOTk5OTUzeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQzOTkiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA3NDQuNzE0MTgyaDkzLjEwMzI3M2E2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxIDAgMTM5LjYzODkwOUg0ODguNzE2MTgydjMwLjMyNzI3M0g0NDQuNDQ0NDQ0YTY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEtMjYuNzI3MjczLTUuMjczNDU2IDY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEtMzQuNTQ1NDU1LTE0LjU0NTQ1NSA2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxLTE0LjU0NTQ1NS0zNC41NDU0NTUgNjkuODIzNDU1IDY5LjgyMzQ1NSAwIDAgMS01LjI3MzQ1Ni0yNi43MjcyNzNoMzAuMzI3MjczdjMwLjMyNzI3M0g0MTQuMTE2MTE2djMwLjMyNzI3M2gzMC4zMjcyNzN2MzAuMzI3MjczaDMwLjMyNzI3M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0NDAwIj48L3BhdGg+PHBhdGggZD0iTTQ0NC40NDQ0NDQgNDE0LjExNjExNnYzMC4zMjcyNzNoLTMwLjMyNzI3M3YtMzAuMzI3MjczaDMwLjMyNzI3M3oiIGZpbGw9IiM3QzdGOTUiIHAtaWQ9IjI0NDAxIj48L3BhdGg+PHBhdGggZD0iTTQxNC4xMTYxMTYgNDQ0LjQ0NDQ0NGgzMC4zMjcyNzN2LTMwLjMyNzI3M2gtMzAuMzI3MjczeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDIiPjwvcGF0aD48L3N2Zz4=`

const TOOLTIP_LABELS: Record<string, { zh: string; en: string }> = {
  log: { zh: '日志', en: 'Work Log' },
  task: { zh: '任务', en: 'Task' },
  meeting: { zh: '日程', en: 'Meeting' },
  ai: { zh: 'AI 生成', en: 'AI Generate' },
  screenshot: { zh: '截图', en: 'Screenshot' },
}

const CENTER_SIZE = CENTER_R * 2

interface RadialItem {
  key: string
  label: string
  emoji: string
  angle: number
  route: string
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

/**
 * 方案 C（Meel 架构）：纯视觉渲染 + 主进程轮询光标位置
 *
 * - 窗口固定 206×206，不 resize，无闪烁
 * - 主进程每 8ms 轮询 screen.getCursorScreenPoint()
 * - 发送 radial:cursor IPC 给 renderer（光标相对于窗口的坐标 + dist + isOverCenter）
 * - Renderer 用光标角度做命中检测：判断光标在哪个扇区上 → 高亮
 * - click 由 window mouseup + hovered 状态驱动（非 DOM onClick）
 * - 拖拽仍由 DOM mousedown/mousemove/mouseup 处理（setShape 范围内有效）
 * - clip-path circle() 做展开/收起动画
 */
export function RadialMenu(): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const expandedRef = useRef(false)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, moved: false })
  // 主进程轮询的光标位置（相对于窗口坐标）
  const cursorRef = useRef({ x: 0, y: 0, isOverCenter: false })

  const ITEMS: RadialItem[] = [
    { key: 'log', label: 'Work Log', emoji: '📝', angle: -90, route: 'worklog' },
    { key: 'task', label: 'Task', emoji: '📋', angle: -18, route: 'kanban' },
    { key: 'meeting', label: 'Meeting', emoji: '📅', angle: 54, route: 'calendar' },
    { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 126, route: 'chat' },
    { key: 'screenshot', label: 'Screenshot', emoji: '📸', angle: 198, route: '' },
  ]

  const numItems = ITEMS.length
  const segAngle = 360 / numItems
  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI)
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI)
  const iconRadius = (INNER_R + OUTER_R) / 2

  // ─── 执行扇区 action ───
  const fireAction = useCallback((key: string) => {
    if (key === 'screenshot') {
      window.radialApi.startCapture().catch(() => {
        setToast('❌ Capture failed')
        setTimeout(() => setToast(null), 2500)
      })
    } else {
      const item = ITEMS.find((i) => i.key === key)
      if (item?.route) {
        window.radialApi.navigateTo(item.route)
      }
    }
  }, [])

  // ─── 方案 C：监听主进程光标轮询 IPC ───
  useEffect(() => {
    window.radialApi.onCursor((info) => {
      cursorRef.current = info

      if (!expandedRef.current) {
        setHovered(null)
        return
      }

      // 展开态：根据光标角度判断命中哪个扇区
      const dx = info.x - CX
      const dy = info.y - CY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < INNER_R || dist > OUTER_R) {
        setHovered(null)
        return
      }

      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
      if (angle < 0) angle += 360

      let bestKey: string | null = null
      let bestDist = Infinity
      for (const item of ITEMS) {
        let diff = Math.abs(angle - item.angle)
        if (diff > 180) diff = 360 - diff
        if (diff < segAngle / 2 && diff < bestDist) {
          bestDist = diff
          bestKey = item.key
        }
      }
      setHovered(bestKey)
    })
  }, [])

  // ─── 监听主进程 radial:state（同步展开/收起状态） ───
  useEffect(() => {
    window.radialApi.onState((info) => {
      expandedRef.current = info.expanded
      setExpanded(info.expanded)
      if (!info.expanded) setHovered(null)
    })
  }, [])

  // ─── 展开/折叠 ───
  const handleExpand = useCallback(() => {
    expandedRef.current = true
    setExpanded(true)
    window.radialApi.expand()
  }, [])

  const handleCollapse = useCallback(() => {
    expandedRef.current = false
    setExpanded(false)
    window.radialApi.collapse()
    setHovered(null)
  }, [])

  // ─── 拖拽 + 扇区 click（setShape 范围内 DOM 事件有效） ───
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
          ref.moved = true
          window.radialApi.dragStart(e.screenX, e.screenY)
        }
      }
    }

    const handleMouseUp = () => {
      const ref = dragRef.current
      if (dragStarted) {
        // 拖拽结束
        dragStarted = false
        ref.active = false
        window.radialApi.dragEnd()
      } else if (!ref.moved) {
        if (!expandedRef.current) {
          // 折叠态：点击中心圆 → 展开
          handleExpand()
        }
        // 展开态：mouseup 时如果 hovered 有值 → 触发 action
        // （等 DOM mouseup 事件冒泡到 window 时，hovered 已由 onCursor 更新）
      }
      dragRef.current = { active: false, startX: 0, startY: 0, moved: false }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleExpand])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (expandedRef.current) {
      // 展开态下 mousedown：记录用于后续 mouseup 触发 action
      dragRef.current = { active: false, startX: e.screenX, startY: e.screenY, moved: false }
      return
    }
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    dragRef.current = { active: false, startX: e.screenX, startY: e.screenY, moved: false }
  }, [])

  // clip-path 动画参数
  const collapsedClip = `circle(${CENTER_R}px at 50% 50%)`
  const expandedClip = `circle(${CENTER_R + 79}px at 50% 50%)`

  return (
    <div
      className="select-none"
      style={{
        position: 'fixed',
        width: WIDGET_SIZE,
        height: WIDGET_SIZE,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* ═══ 环形扇区 + 图标（clip-path 圆形揭示动画） ═══ */}
      <motion.div
        key="radial-content"
        className="absolute inset-0"
        style={{ width: WIDGET_SIZE, height: WIDGET_SIZE, willChange: 'clip-path' }}
        initial={{ clipPath: collapsedClip }}
        animate={{ clipPath: expanded ? expandedClip : collapsedClip }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* SVG 环形扇区（纯视觉，无 onClick — 方案 C 要求） */}
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
                  transition: 'fill 0.2s ease',
                }}
              />
            )
          })}
        </svg>

        {/* 扇区图标 */}
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

        {/* Hover tooltip */}
        {(() => {
          const item = ITEMS.find((it) => it.key === hovered)
          if (!item) return null
          const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en'
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              {TOOLTIP_LABELS[item.key]?.[lang] ?? item.label}
            </motion.div>
          )
        })()}
      </motion.div>

      {/* ═══ Toast ═══ */}
      {toast && (
        <div
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
        >
          {toast}
        </div>
      )}

      {/* ═══ 中心圆形：折叠态可拖拽/点击展开；展开态显示 ✕ 关闭 ═══ */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: 2 }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: CENTER_SIZE,
            height: CENTER_SIZE,
            background: 'rgba(240,242,246,0.96)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            boxShadow:
              'inset 0 1px 3px rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.08)',
            cursor: expanded ? 'default' : 'pointer',
            transition: 'transform 0.15s ease',
          } as React.CSSProperties}
        >
          {expanded ? (
            <button
              type="button"
              onClick={handleCollapse}
              aria-label="close"
              className="flex h-full w-full items-center justify-center rounded-full"
              style={{ cursor: 'pointer' }}
            >
              <svg
                width={CENTER_R}
                height={CENTER_R}
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(60,64,72,0.9)"
                strokeWidth={2.4}
                strokeLinecap="round"
                className="pointer-events-none"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          ) : (
            <img
              key="icon"
              src={ICON_SVG}
              alt="WorkPulse"
              className="pointer-events-none"
              style={{ width: CENTER_R, height: CENTER_R, objectFit: 'contain' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
