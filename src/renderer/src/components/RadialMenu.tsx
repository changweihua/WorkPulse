import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/* ── 尺寸参数 ── */
const OUTER_R = 94
const INNER_R = 38
const GAP_PX = 3
const CENTER_R = 24
const WIDGET_SIZE = 206
const CX = WIDGET_SIZE / 2
const CY = WIDGET_SIZE / 2

// WorkPulse program icon (base64 encoded SVG)
const ICON_SVG = `data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNzg0MDg1MDIzMjc1IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjI0Mzk3IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPjxwYXRoIGQ9Ik02NTEuNjEwOTA5IDEwMjMuOTkySDI3OS4yNzc4MThsOS4yNTU5MjgtNC42Mzk5NjRhMTg2LjE1ODU0NiAxODYuMTU4NTQ2IDAgMCAwIDEwMC4wOTUyMTgtMTM0LjIwNjk1MWwxOC44NzE4NTItMTA3LjAzOTE2NGE5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAxIDkyLjE1OTI4LTc5LjkzNTM3NUg2MTcuNDM1MTc2YzQ2LjMxOTYzOCAwIDg1LjU5OTMzMSAzNC4wNzk3MzQgOTIuMTU5MjggNzkuOTM1Mzc1bDM0LjE1OTczMyAxMzkuNjMwOTA5YzcuMjc5OTQzIDUwLjg5NTYwMi0yOC4wODc3ODEgOTguMDQ3MjM0LTc4Ljk4MzM4MyAxMDUuMzE5MTc3LTQuMzU5OTY2IDAuNjIzOTk1LTguNzU5OTMyIDAuOTM1OTkzLTEzLjE2Nzg5NyAwLjkzNTk5M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0Mzk4Ij48L3BhdGg+PHBhdGggZD0iTTc0Mi4yOTgyMDEgOTExLjczNjg3N2wtMy44NjM5Ny0xNS44MTU4NzYtNS40Nzk5NTctMjIuMzY3ODI2LTYuMjcxOTUxLTI1LjYzMTc5OS02LjI3MTk1MS0yNS42Mzk4LTUuNDc5OTU3LTIyLjM2NzgyNS0zLjg2Mzk3LTE1LjgwNzg3Ny0xLjQ3MTk4OS01Ljk5OTk1M2E5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAwLTkyLjE1OTI4LTc5LjkzNTM3NWgtMi41NTk5OGEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAwIDAgNDYuNTUxNjM2aDIuNTU5OThhNDYuNzY3NjM1IDQ2Ljc2NzYzNSAwIDAgMSA0Ni4wNzk2NCAzOS45NTk2ODhjMC4yMTU5OTggMS41MDM5ODggMC41MDM5OTYgMi45OTk5NzcgMC44NzE5OTMgNC40Nzk5NjVsMzMuNTM1NzM4IDEzNy4wNDY5MjlhNDYuNTU5NjM2IDQ2LjU1OTYzNiAwIDAgMS00Ni4zMTE2MzggNTEuMjM5NkgyNTUuOTk4QTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDAgMjU1Ljk5OCAxMDIzLjk5MmgzOTUuNjEyOTA5YzUxLjM4MzU5OSAwLjAzMiA5My4wNzEyNzMtNDEuNTk5Njc1IDkzLjEwMzI3My05Mi45NzUyNzQgMC00LjQ0Nzk2NS0wLjMxOTk5OC04Ljg3OTkzMS0wLjk0Mzk5My0xMy4yNzk4OTZsLTEuNDcxOTg4LTUuOTk5OTUzeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQzOTkiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA3NDQuNzE0MTgyaDkzLjEwMzI3M2E2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxIDAgMTM5LjYzODkwOUg0ODguNzE2MTgyYTY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEgMC0xMzkuNjMwOTA5eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDAiPjwvcGF0aD48cGF0aCBkPSJNOTMuMDk1MjczIDBoODM3LjgwMTQ1NEM5ODIuMzEyMzI2IDAgMTAyMy45OTIgNDEuNjc5Njc0IDEwMjMuOTkyIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDk1MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjOTk5QUFDIiBwLWlkPSIyNDQwMSI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgMGg2OTguMTcwNTQ1YzUxLjQxNTU5OCAwIDkzLjA4NzI3MyA0MS42Nzk2NzQgOTMuMDg3MjczIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDg3MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQwMiI+PC9wYXRoPjxwYXRoIGQ9Ik05MjkuNTkyNzM4IDIyLjkxOTgyMWE0Ny43NTk2MjcgNDcuNzU5NjI3IDAgMCAwLTcuODM5OTM5IDAuNjYzOTk1IDQ3LjMzNTYzIDQ3LjMzNTYzIDAgMCAwLTM4LjYyMzY5OCA1NC4zMTk1NzV2MC4wMzJsMC4wMTU5OTkgMC4wOCAwLjI4Nzk5OCAxLjg5NTk4NSAwLjE3NTk5OSAxLjA3OTk5MWMwLjA0IDAuNDYzOTk2IDAuMDc5OTk5IDAuOTI3OTkzIDAuMTQzOTk5IDEuMzk5OTg5IDAuMjU1OTk4IDIuMzExOTgyIDAuNDMxOTk3IDQuNjM5OTY0IDAuNTI3OTk2IDcuMDA3OTQ2bDAuMDA3OTk5IDAuMTU5OTk4djAuMDA4bDAuMDA4IDAuMTUxOTk5djAuMDI0bDAuMDA4IDAuMTQzOTk5djAuMDE2bDAuMDE2IDAuNjU1OTk1djAuMDE1OTk5bDAuMDA4IDAuMTUxOTk5djAuMTk5OTk5bDAuMDA4IDAuMTE5OTk5djAuNjk1OTk0bDAuMDE2IDAuMDMydjYwNy42MjcyNTNsLTAuMDA4IDAuMTAzOTk5djAuMzM1OTk3bC0wLjAwOCAwLjEyNzk5OVY3MDAuMjkwNTI5bC0wLjAwOCAwLjEzNTk5OXYwLjE2Nzk5OWwtMC4wMDggMC4yNzE5OTd2MC4wMjRsLTAuMDA4IDAuMTM1OTk5VjcwMS4zMzA1MjFsLTAuMDI0IDAuMjg3OTk4djAuMzExOTk3bC0wLjAxNTk5OSAwLjE0Mzk5OXYwLjI5NTk5OGEzLjU4Mzk3MiAzLjU4Mzk3MiAwIDAgMC0wLjAyNCAwLjI5NTk5N3YwLjAwOGMtMC4zNDM5OTcgNy4zNTk5NDMtMS41Njc5ODggMTQuNjQ3ODg2LTMuNjM5OTcyIDIxLjcxOTgzMWE0Ni41NTE2MzYgNDYuNTUxNjM2IDAgMCAwIDg5LjMzNTMwMiAyNi4xNjc3OTVjNC45ODM5NjEtMTcuMDE1ODY3IDcuNTExOTQxLTM0LjY1NTcyOSA3LjUwMzk0Mi01Mi4zOTE1OVY5My4wOTUyNzNjMC03LjA3OTk0NS0wLjM5OTk5Ny0xNC4xNTE4ODktMS4xOTk5OTEtMjEuMTc1ODM1YTU0LjQ3OTU3NCA1NC40Nzk1NzQgMCAwIDAtMC4yNzE5OTgtMi4wMTU5ODQgNTEuOTU5NTk0IDUxLjk1OTU5NCAwIDAgMC0wLjM3NTk5Ny0zLjA2Mzk3NmwtMC43ODM5OTQtNS4wNTU5NjFhNDUuNzc1NjQyIDQ1Ljc3NTY0MiAwIDAgMC00NS4yMzE2NDYtMzguODYzNjk2eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDMiPjwvcGF0aD48cGF0aCBkPSJNNzkxLjI3MzgxOCAwSDkzLjA4NzI3M0M0MS42Nzk2NzQgMCAwIDQxLjY3OTY3NCAwIDkzLjA4NzI3M3Y1MTEuOTk2aDg4NC4zNjEwOTF2LTUxMS45OTZDODg0LjM2MTA5MSA0MS42Nzk2NzQgODQyLjY4MTQxNyAwIDc5MS4yNjU4MTggMHoiIGZpbGw9IiMyQzJGNTMiIHAtaWQ9IjI0NDA0Ij48L3BhdGg+PHBhdGggZD0iTTQ2NS40NTIzNjQgNjk4LjE3MDU0NmE0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMSAxLTkzLjA4NzI3MyAwIDQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAxIDEgOTMuMDg3MjczIDB6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwNSI+PC9wYXRoPjxwYXRoIGQ9Ik05NTQuMTY4NTQ2IDEzOS42MzA5MDlhMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAyMy4yNzk4MTggMjMuMjc5ODE4djIzMi43MTgxODJhMjMuMjcxODE4IDIzLjI3MTgxOCAwIDEgMS00Ni41NTE2MzcgMHYtMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDIzLjI3OTgxOC0yMy4yNzk4MTh6IiBmaWxsPSIjMkMyRjUzIiBwLWlkPSIyNDQwNiI+PC9wYXRoPjxwYXRoIGQ9Ik02OS44MjM0NTUgNjA1LjA5MTI3M2g3NDQuNzE0MTgxYTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41MzU2MzZINjkuODIzNDU1YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMC00Ni41MzU2MzZ6IiBmaWxsPSIjRUFFQUVFIiBwLWlkPSIyNDQwNyI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgNDY1LjQ1MjM2NGg2OTguMTcwNTQ1YTQ2LjU1MTYzNiA0Ni41NTE2MzYgMCAwIDEgMCA5My4wODcyNzJIOTMuMDk1MjczYTQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAwIDEgMC05My4wODcyNzJ6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwOCI+PC9wYXRoPjxwYXRoIGQ9Ik0xMzkuNjMwOTA5IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iIzExQ0JFNSIgcC1pZD0iMjQ0MDkiPjwvcGF0aD48cGF0aCBkPSJNMTE2LjM2NzA5MSA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEtMC4wMDggNDYuNTQzNjM3IDIzLjI3MTgxOCAyMy4yNzE4MTggMCAwIDEgMC00Ni41NDM2Mzd6IiBmaWxsPSIjQkNGNEY1IiBwLWlkPSIyNDQxMCI+PC9wYXRoPjxwYXRoIGQ9Ik0zMjUuODIxNDU1IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAxNiA5My4xMDMyNzMgNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSAwLjAxNi05My4xMDMyNzN6IiBmaWxsPSIjOTFFREY4IiBwLWlkPSIyNDQxMSI+PC9wYXRoPjxwYXRoIGQ9Ik01MTEuOTk2IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAwOCA5My4xMDMyNzNBNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSA1MTEuOTk2IDQxOC45MDA3Mjd6IiBmaWxsPSIjRkRCOEJGIiBwLWlkPSIyNDQxMiI+PC9wYXRoPjxwYXRoIGQ9Ik02OTguMTcwNTQ2IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iI0ZBNDY1OSIgcC1pZD0iMjQ0MTMiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA0MTguOTAwNzI3YTIzLjI3OTgxOCAyMy4yNzk4MTggMCAxIDEgMCA0Ni41NTk2MzcgMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAwLTQ2LjU1OTYzN3pNNjc0Ljg5ODcyNyA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41NDM2MzcgMjMuMjcxODE4IDIzLjI3MTgxOCAwIDAgMSAwLTQ2LjU0MzYzN3oiIGZpbGw9IiNGRURFRTEiIHAtaWQ9IjI0NDE0Ij48L3BhdGg+PHBhdGggZD0iTTMwMi41NDE2MzYgNDE4LjkwMDcyN2EyMy4yNzk4MTggMjMuMjc5ODE4IDAgMSAxIDAgNDYuNTU5NjM3IDIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NTk2Mzd6IiBmaWxsPSIjRTlGRkY1IiBwLWlkPSIyNDQxNSI+PC9wYXRoPjxwYXRoIGQ9Ik0yMDkuNDU0MzY0IDk3Ny40NDgzNjRoMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDAgNDYuNTQzNjM2aC0yMzIuNzE4MTgyYTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NDM2MzZ6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQxNiI+PC9wYXRoPjwvc3ZnPg==`

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
 * 混合方案：Meel 原则 + DOM 交互
 *
 * - 窗口创建一次复用（Meel 原则）
 * - focusable:false + alwaysOnTop re-assert（Meel 原则）
 * - 光标轮询做 hover 高亮（Meel 原则）
 * - DOM 事件处理点击/拖拽（与 Meel 的全局 hook 不同）
 * - clip-path 圆形揭示动画（视觉效果）
 */
export function RadialMenu(): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(false)

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

  // ─── 监听主进程状态（展开/收起） ───
  useEffect(() => {
    window.radialApi.onState((info) => {
      expandedRef.current = info.expanded
      setExpanded(info.expanded)
      if (!info.expanded) setHovered(null)
    })
  }, [])

  // ─── 光标轮询 hover 高亮（Meel 原则） ───
  useEffect(() => {
    window.radialApi.onCursor((info) => {
      if (!expandedRef.current) {
        setHovered(null)
        return
      }
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

  // ─── 中心按钮：展开态单击 ✕ 收起，收起态双击展开，单击+拖拽移动 ───
  const isDraggingRef = useRef(false)

  const handleCenterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 展开态 ✕ 按钮不可拖动，只做收起
    if (expandedRef.current) return

    isDraggingRef.current = false
    window.radialApi.dragStart()

    const onMouseMove = (me: MouseEvent) => {
      if (Math.abs(me.movementX) > 2 || Math.abs(me.movementY) > 2) {
        isDraggingRef.current = true
      }
      window.radialApi.dragMove(me.movementX, me.movementY)
    }
    const onMouseUp = () => {
      window.radialApi.dragEnd()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // 单击：展开态 → 收起（✕ 按钮）；收起态 → 无操作
  const handleCenterClick = useCallback(() => {
    if (isDraggingRef.current) return
    if (expandedRef.current) {
      window.radialApi.centerClick()
    }
  }, [])

  // 双击：收起态 → 展开
  const handleCenterDoubleClick = useCallback(() => {
    if (!expandedRef.current) {
      window.radialApi.centerClick()
    }
  }, [])

  // ─── 扇区点击 ───
  const handleSegmentClick = useCallback((key: string) => {
    window.radialApi.segmentClick(key)
  }, [])

  // clip-path 动画参数
  const collapsedClip = `circle(${CENTER_R}px at 50% 50%)`
  const expandedClip = `circle(103px at 50% 50%)`

  return (
    <div
      className="select-none"
      style={{
        position: 'fixed',
        width: WIDGET_SIZE,
        height: WIDGET_SIZE,
        left: 0,
        top: 0,
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
        {/* SVG 环形扇区 */}
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
                style={{ cursor: 'pointer', transition: 'fill 0.2s ease' }}
                onClick={() => handleSegmentClick(item.key)}
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

      {/* ═══ 中心圆形：logo / 关闭按钮 + 拖拽 ═══ */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: 2 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: CENTER_SIZE,
            height: CENTER_SIZE,
            background: expanded
              ? 'rgba(240,242,246,0.96)'
              : 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(230,233,240,0.4) 50%, rgba(210,215,225,0.35) 100%)',
            backdropFilter: expanded ? 'blur(32px) saturate(180%)' : 'blur(8px)',
            WebkitBackdropFilter: expanded ? 'blur(32px) saturate(180%)' : 'blur(8px)',
            boxShadow: expanded
              ? 'inset 0 1px 3px rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.08)'
              : 'inset 0 2px 4px rgba(255,255,255,0.7), inset 0 -2px 3px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid rgba(255,255,255,0.6)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, background 0.2s ease',
          } as React.CSSProperties}
          onClick={handleCenterClick}
          onDoubleClick={handleCenterDoubleClick}
          onMouseDown={handleCenterMouseDown}
        >
          <AnimatePresence mode="wait" initial={false}>
            {expanded ? (
              <motion.svg
                key="close"
                width={CENTER_R}
                height={CENTER_R}
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(60,64,72,0.9)"
                strokeWidth={2.4}
                strokeLinecap="round"
                initial={{ rotate: -90, scale: 0, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </motion.svg>
            ) : (
              <motion.img
                key="logo"
                src={ICON_SVG}
                alt="WorkPulse"
                style={{ width: CENTER_R, height: CENTER_R, objectFit: 'contain' }}
                initial={{ rotate: 90, scale: 0, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: -90, scale: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
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
