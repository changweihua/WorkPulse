import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/* ── 尺寸参数 ── */
const OUTER_R = 94
const INNER_R = 38
const GAP_PX = 3
const CENTER_R = 24
const WIDGET_SIZE = 206

// WorkPulse program icon
const ICON_SVG = `data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNzg0MDg1MDIzMjc1IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjI0Mzk3IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPjxwYXRoIGQ9Ik02NTEuNjEwOTA5IDEwMjMuOTkySDI3OS4yNzc4MThsOS4yNTU5MjgtNC42Mzk5NjRhMTg2LjE1ODU0NiAxODYuMTU4NTQ2IDAgMCAwIDEwMC4wOTUyMTgtMTM0LjIwNjk1MWwxOC44NzE4NTItMTA3LjAzOTE2NGE5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAxIDkyLjE1OTI4LTc5LjkzNTM3NUg2MTcuNDM1MTc2YzQ2LjMxOTYzOCAwIDg1LjU5OTMzMSAzNC4wNzk3MzQgOTIuMTU5MjggNzkuOTM1Mzc1bDM0LjE1OTczMyAxMzkuNjMwOTA5YzcuMjc5OTQzIDUwLjg5NTYwMi0yOC4wODc3ODEgOTguMDQ3MjM0LTc4Ljk4MzM4MyAxMDUuMzE5MTc3LTQuMzU5OTY2IDAuNjIzOTk1LTguNzU5OTMyIDAuOTM1OTkzLTEzLjE2Nzg5NyAwLjkzNTk5M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0Mzk4Ij48L3BhdGg+PHBhdGggZD0iTTc0Mi4yOTgyMDEgOTExLjczNjg3N2wtMy44NjM5Ny0xNS44MTU4NzYtNS40Nzk5NTctMjIuMzY3ODI2LTYuMjcxOTUxLTI1LjYzMTc5OS02LjI3MTk1MS0yNS42Mzk4LTUuNDc5OTU3LTIyLjM2NzgyNS0zLjg2Mzk3LTE1LjgwNzg3Ny0xLjQ3MTk4OS01Ljk5OTk1M2E5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAwLTkyLjE1OTI4LTc5LjkzNTM3NWgtMi41NTk5OGEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAwIDAgNDYuNTUxNjM2aDIuNTU5OThhNDYuNzY3NjM1IDQ2Ljc2NzYzNSAwIDAgMSA0Ni4wNzk2NCAzOS45NTk2ODhjMC4yMTU5OTggMS41MDM5ODggMC41MDM5OTYgMi45OTk5NzcgMC44NzE5OTMgNC40Nzk5NjVsMzMuNTM1NzM4IDEzNy4wNDY5MjlhNDYuNTU5NjM2IDQ2LjU1OTYzNiAwIDAgMS00Ni4zMTE2MzggNTEuMjM5NkgyNTUuOTk4QTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDAgMjU1Ljk5OCAxMDIzLjk5MmgzOTUuNjEyOTA5YzUxLjM4MzU5OSAwLjAzMiA5My4wNzEyNzMtNDEuNTk5Njc1IDkzLjEwMzI3My05Mi45NzUyNzQgMC00LjQ0Nzk2NS0wLjMxOTk5OC04Ljg3OTkzMS0wLjk0Mzk5My0xMy4yNzk4OTZsLTEuNDcxOTg4LTUuOTk5OTUzeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQzOTkiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA3NDQuNzE0MTgyaDkzLjEwMzI3M2E2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxIDAgMTM5LjYzODkwOUg0ODguNzE2MTgyYTY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEgMC0xMzkuNjMwOTA5eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDAiPjwvcGF0aD48cGF0aCBkPSJNOTMuMDk1MjczIDBoODM3LjgwMTQ1NEM5ODIuMzEyMzI2IDAgMTAyMy45OTIgNDEuNjc5Njc0IDEwMjMuOTkyIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDk1MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjOTk5QUFDIiBwLWlkPSIyNDQwMSI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgMGg2OTguMTcwNTQ1YzUxLjQxNTU5OCAwIDkzLjA4NzI3MyA0MS42Nzk2NzQgOTMuMDg3MjczIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDg3MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQwMiI+PC9wYXRoPjxwYXRoIGQ9Ik05MjkuNTkyNzM4IDIyLjkxOTgyMWE0Ny43NTk2MjcgNDcuNzU5NjI3IDAgMCAwLTcuODM5OTM5IDAuNjYzOTk1IDQ3LjMzNTYzIDQ3LjMzNTYzIDAgMCAwLTM4LjYyMzY5OCA1NC4zMTk1NzV2MC4wMzJsMC4wMTU5OTkgMC4wOCAwLjI4Nzk5OCAxLjg5NTk4NSAwLjE3NTk5OSAxLjA3OTk5MWMwLjA0IDAuNDYzOTk2IDAuMDc5OTk5IDAuOTI3OTkzIDAuMTQzOTk5IDEuMzk5OTg5IDAuMjU1OTk4IDIuMzExOTgyIDAuNDMxOTk3IDQuNjM5OTY0IDAuNTI3OTk2IDcuMDA3OTQ2bDAuMDA3OTk5IDAuMTU5OTk4djAuMDA4bDAuMDA4IDAuMTUxOTk5djAuMDI0bDAuMDA4IDAuMTQzOTk5djAuMDE2bDAuMDE2IDAuNjU1OTk1djAuMDE1OTk5bDAuMDA4IDAuMTUxOTk5djAuMTk5OTk5bDAuMDA4IDAuMTE5OTk5djAuNjk1OTk0bDAuMDE2IDAuMDMydjYwNy42MjcyNTNsLTAuMDA4IDAuMTAzOTk5djAuMzM1OTk3bC0wLjAwOCAwLjEyNzk5OVY3MDAuMjkwNTI5bC0wLjAwOCAwLjEzNTk5OXYwLjE2Nzk5OWwtMC4wMDggMC4yNzE5OTd2MC4wMjRsLTAuMDA4IDAuMTM1OTk5VjcwMS4zMzA1MjFsLTAuMDI0IDAuMjg3OTk4djAuMzExOTk3bC0wLjAxNTk5OSAwLjE0Mzk5OXYwLjI5NTk5OGEzLjU4Mzk3MiAzLjU4Mzk3MiAwIDAgMC0wLjAyNCAwLjI5NTk5N3YwLjAwOGMtMC4zNDM5OTcgNy4zNTk5NDMtMS41Njc5ODggMTQuNjQ3ODg2LTMuNjM5OTcyIDIxLjcxOTgzMWE0Ni41NTE2MzYgNDYuNTUxNjM2IDAgMCAwIDg5LjMzNTMwMiAyNi4xNjc3OTVjNC45ODM5NjEtMTcuMDE1ODY3IDcuNTExOTQxLTM0LjY1NTcyOSA3LjUwMzk0Mi01Mi4zOTE1OVY5My4wOTUyNzNjMC03LjA3OTk0NS0wLjM5OTk5Ny0xNC4xNTE4ODktMS4xOTk5OTEtMjEuMTc1ODM1YTU0LjQ3OTU3NCA1NC40Nzk1NzQgMCAwIDAtMC4yNzE5OTgtMi4wMTU5ODQgNTEuOTU5NTk0IDUxLjk1OTU5NCAwIDAgMC0wLjM3NTk5Ny0zLjA2Mzk3NmwtMC43ODM5OTQtNS4wNTU5NjFhNDUuNzc1NjQyIDQ1Ljc3NTY0MiAwIDAgMC00NS4yMzE2NDYtMzguODYzNjk2eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDMiPjwvcGF0aD48cGF0aCBkPSJNNzkxLjI3MzgxOCAwSDkzLjA4NzI3M0M0MS42Nzk2NzQgMCAwIDQxLjY3OTY3NCAwIDkzLjA4NzI3M3Y1MTEuOTk2aDg4NC4zNjEwOTF2LTUxMS45OTZDODg0LjM2MTA5MSA0MS42Nzk2NzQgODQyLjY4MTQxNyAwIDc5MS4yNjU4MTggMHoiIGZpbGw9IiMyQzJGNTMiIHAtaWQ9IjI0NDA0Ij48L3BhdGg+PHBhdGggZD0iTTQ2NS40NTIzNjQgNjk4LjE3MDU0NmE0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMSAxLTkzLjA4NzI3MyAwIDQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAxIDEgOTMuMDg3MjczIDB6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwNSI+PC9wYXRoPjxwYXRoIGQ9Ik05NTQuMTY4NTQ2IDEzOS42MzA5MDlhMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAyMy4yNzk4MTggMjMuMjc5ODE4djIzMi43MTgxODJhMjMuMjcxODE4IDIzLjI3MTgxOCAwIDEgMS00Ni41NTE2MzcgMHYtMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDIzLjI3OTgxOC0yMy4yNzk4MTh6IiBmaWxsPSIjMkMyRjUzIiBwLWlkPSIyNDQwNiI+PC9wYXRoPjxwYXRoIGQ9Ik02OS44MjM0NTUgNjA1LjA5MTI3M2g3NDQuNzE0MTgxYTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41MzU2MzZINjkuODIzNDU1YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMC00Ni41MzU2MzZ6IiBmaWxsPSIjRUFFQUVFIiBwLWlkPSIyNDQwNyI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgNDY1LjQ1MjM2NGg2OTguMTcwNTQ1YTQ2LjU1MTYzNiA0Ni41NTE2MzYgMCAwIDEgMCA5My4wODcyNzJIOTMuMDk1MjczYTQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAwIDEgMC05My4wODcyNzJ6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwOCI+PC9wYXRoPjxwYXRoIGQ9Ik0xMzkuNjMwOTA5IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iIzExQ0JFRSIgcC1pZD0iMjQ0MDkiPjwvcGF0aD48cGF0aCBkPSJNMTE2LjM2NzA5MSA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEtMC4wMDggNDYuNTQzNjM3IDIzLjI3MTgxOCAyMy4yNzE4MTggMCAwIDEgMC00Ni41NDM2Mzd6IiBmaWxsPSIjQkNGNEY1IiBwLWlkPSIyNDQxMCI+PC9wYXRoPjxwYXRoIGQ9Ik0zMjUuODIxNDU1IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAxNiA5My4xMDMyNzMgNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSAwLjAxNi05My4xMDMyNzN6IiBmaWxsPSIjOTFFREY4IiBwLWlkPSIyNDQxMSI+PC9wYXRoPjxwYXRoIGQ9Ik01MTEuOTk2IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAwOCA5My4xMDMyNzNBNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSA1MTEuOTk2IDQxOC45MDA3Mjd6IiBmaWxsPSIjRkRCOEJGIiBwLWlkPSIyNDQxMiI+PC9wYXRoPjxwYXRoIGQ9Ik02OTguMTcwNTQ2IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iI0ZBNDY1OSIgcC1pZD0iMjQ0MTMiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA0MTguOTAwNzI3YTIzLjI3OTgxOCAyMy4yNzk4MTggMCAxIDEgMCA0Ni41NTk2MzcgMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAwLTQ2LjU1OTYzN3pNNjc0Ljg5ODcyNyA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41NDM2MzcgMjMuMjcxODE4IDIzLjI3MTgxOCAwIDAgMSAwLTQ2LjU0MzYzN3oiIGZpbGw9IiNGRURFRTEiIHAtaWQ9IjI0NDE0Ij48L3BhdGg+PHBhdGggZD0iTTMwMi41NDE2MzYgNDE4LjkwMDcyN2EyMy4yNzk4MTggMjMuMjc5ODE4IDAgMSAxIDAgNDYuNTU5NjM3IDIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NTk2Mzd6IiBmaWxsPSIjRTlGRkY1IiBwLWlkPSIyNDQxNSI+PC9wYXRoPjxwYXRoIGQ9Ik0yMDkuNDU0MzY0IDk3Ny40NDgzNjRoMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDAgNDYuNTQzNjM2aC0yMzIuNzE4MTgyYTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NDM2MzZ6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQxNiI+PC9wYXRoPjwvc3ZnPg==`

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
  const [expanded, setExpanded] = useState(false)
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

  // 手动双击检测：不依赖浏览器 dblclick（透明窗口上不可靠）
  const clickTimerRef = useRef<number | null>(null)
  const handleCenterClick = useCallback(() => {
    if (clickTimerRef.current) {
      // 双击 → 切换展开/收起
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      setExpanded((v) => !v)
      setHovered(null)
    } else {
      // 单击 → 等 280ms 看有没有第二次点击
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        // 单击：展开时收起
        if (expanded) {
          setExpanded(false)
          setHovered(null)
        }
      }, 280)
    }
  }, [expanded])

  // 清理计时器
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const numItems = ITEMS.length
  const segAngle = 360 / numItems
  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI)
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI)
  // 图标位置：内外弧间距不同，视觉中心向外偏移补偿
  const iconRadius = INNER_R + (OUTER_R - INNER_R) * 0.52

  return (
    <div
      className="relative select-none"
      style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}
    >
      {/* ═══ 环形扇区 + 图标（双击展开/收起） ═══ */}
      <AnimatePresence>
        {expanded && (
          <>
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
              {ITEMS.map((item, index) => {
                const segStart = item.angle - segAngle / 2
                const segEnd = item.angle + segAngle / 2
                const path = describeArc(
                  CX, CY, INNER_R, OUTER_R,
                  segStart + gapOuterDeg / 2, segEnd - gapOuterDeg / 2,
                  segStart + gapInnerDeg / 2, segEnd - gapInnerDeg / 2,
                )
                const isHover = hovered === item.key
                return (
                  <motion.g
                    key={item.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      delay: index * 0.06,
                      type: 'spring',
                      stiffness: 300,
                      damping: 22,
                    }}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered(item.key)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => { item.action(); setExpanded(false); setHovered(null) }}
                  >
                    <motion.path
                      d={path}
                      fill={isHover ? 'rgba(200,210,225,0.95)' : 'url(#segGlass)'}
                      style={{
                        transition: 'fill 0.2s ease, filter 0.2s ease',
                        filter: isHover
                          ? 'drop-shadow(0 0 10px rgba(120,140,180,0.55))'
                          : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
                      }}
                    />
                  </motion.g>
                )
              })}
            </svg>

            {/* 扇区图标 */}
            {ITEMS.map((item) => {
              const pos = angleToXY(item.angle, iconRadius, CX, CY)
              const isHover = hovered === item.key
              return (
                <motion.div
                  key={`icon-${item.key}`}
                  className="absolute flex items-center justify-center pointer-events-none"
                  style={{
                    left: pos.x, top: pos.y, zIndex: 3,
                    width: 40, height: 40,
                    transform: 'translate(-50%, -50%)',
                  }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{
                    delay: ITEMS.indexOf(item) * 0.06,
                    type: 'spring',
                    stiffness: 400,
                    damping: 15,
                  }}
                >
                  <motion.span
                    className="text-2xl drop-shadow-sm"
                    animate={isHover ? { scale: 1.3, rotate: [0, -5, 5, 0] } : { scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  >
                    {item.emoji}
                  </motion.span>
                </motion.div>
              )
            })}
          </>
        )}
      </AnimatePresence>

      {/* ═══ Hover tooltip（仅展开时 hover） ═══ */}
      {expanded && (() => {
        const item = ITEMS.find((it) => it.key === hovered)
        if (!item) return null
        const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en'
        const tipR = INNER_R - 20
        const tipPos = angleToXY(item.angle, tipR, CX, CY)
        return (
          <div
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
          >
            {TOOLTIP_LABELS[item.key]?.[lang] ?? item.label}
          </div>
        )
      })()}

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
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 中心圆形：拖拽 + 单击收起/双击切换 ═══ */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: 2 }}
        onMouseDown={handleMouseDown}
        onClick={handleCenterClick}
      >
        <motion.div
          className="flex items-center justify-center rounded-full
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
          } as React.CSSProperties}
          animate={{ scale: expanded ? [1, 1.08, 1] : [1, 1.03, 1] }}
          transition={{ duration: expanded ? 0.3 : 3, repeat: expanded ? 0 : Infinity, ease: 'easeInOut' }}
        >
          <AnimatePresence mode="wait">
            {expanded ? (
              <motion.span
                key="close"
                className="text-lg font-bold leading-none text-zinc-500"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                ✕
              </motion.span>
            ) : (
              <motion.img
                key="icon"
                src={ICON_SVG}
                alt="WorkPulse"
                className="pointer-events-none"
                style={{ width: CENTER_R * 1.2, height: CENTER_R * 1.2, objectFit: 'contain' }}
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
