import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { motion, AnimatePresence } from 'motion/react'
import { Copy, Save, Pen, Eye } from 'lucide-react'

interface ReadyInfo {
  dataUrl?: string
  width: number
  height: number
  scaleFactor: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Point {
  x: number
  y: number
}

type ToolAction = 'copy' | 'save' | 'both'

// 统一缓动曲线（与全局动效一致：快出缓停）
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// 工具栏按钮定义（左 → 右）
interface ToolDef {
  key: string
  label: string
  hint?: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  run: () => void
}

function ScreenshotOverlay(): React.ReactNode {
  const [info, setInfo] = useState<ReadyInfo | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const [toast, setToast] = useState(false)
  const [toastMsg, setToastMsg] = useState('Capturing...')
  const [tbSize, setTbSize] = useState({ w: 0, h: 0 })

  const drawingRef = useRef(false)
  const startRef = useRef<Point | null>(null)
  const selRef = useRef<Rect | null>(null)
  const capturedRef = useRef(false)
  const showToolbarRef = useRef(false)
  const pendingCancelRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const tbRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.screenshotOverlayApi.onReady((data: ReadyInfo) => setInfo(data))
  }, [])

  // 清理定时器，避免窗口关闭后误触
  useEffect(() => {
    return () => {
      if (pendingCancelRef.current) clearTimeout(pendingCancelRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const clearTimers = () => {
    if (pendingCancelRef.current) { clearTimeout(pendingCancelRef.current); pendingCancelRef.current = null }
    if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); toastTimerRef.current = null }
  }

  const updateSel = (next: Rect | null) => {
    selRef.current = next
    setSel(next)
  }

  // 触发裁剪：先显示「Capturing...」，主进程此刻才真正截图并裁剪
  const triggerCrop = async (
    rect: { x: number; y: number; width: number; height: number },
    action: ToolAction = 'both',
    full = false
  ) => {
    if (capturedRef.current) return
    capturedRef.current = true
    setCaptured(true)
    setDragging(false)
    setShowToolbar(false)
    showToolbarRef.current = false

    setToastMsg('Capturing...')
    setToast(true)

    let ok = false
    try {
      const res = await window.screenshotOverlayApi.crop(rect, action, full)
      ok = !!res?.ok
    } catch {
      ok = false
    }

    if (!ok) {
      window.screenshotOverlayApi.cancel()
      return
    }

    // 裁剪完成：短暂提示后自动关闭覆盖窗口（cancel 会恢复径向菜单）
    const msg =
      action === 'both'
        ? '✓ 已复制并保存到文件'
        : action === 'copy'
          ? '✓ 已复制到剪贴板'
          : '✓ 已保存到文件'
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      window.screenshotOverlayApi.cancel()
    }, 700)
  }

  // 工具栏真实动作：Copy / Save / Copy+Save
  const runAction = (action: ToolAction) => {
    const r = selRef.current
    if (!r || capturedRef.current) return
    triggerCrop({ x: r.x, y: r.y, width: r.w, height: r.h }, action)
  }

  // 占位功能（开发中）
  const runPlaceholder = (msg: string) => {
    if (capturedRef.current) return
    setToastMsg(msg)
    setToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(false), 1600)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    drawingRef.current = true
    setDragging(true)
    setShowToolbar(false)
    showToolbarRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }
    updateSel({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    setCursor({ x: e.clientX, y: e.clientY })
    if (!drawingRef.current || !startRef.current) return
    const sx = startRef.current.x
    const sy = startRef.current.y
    let dx = e.clientX - sx
    let dy = e.clientY - sy

    // 按住 Shift：锁定为正方形（等比）
    if (e.shiftKey) {
      const m = Math.max(Math.abs(dx), Math.abs(dy))
      dx = Math.sign(dx) * m
      dy = Math.sign(dy) * m
    }

    const x = Math.min(sx, sx + dx)
    const y = Math.min(sy, sy + dy)
    const w = Math.abs(dx)
    const h = Math.abs(dy)
    updateSel({ x, y, w, h })
  }

  const onMouseUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    setDragging(false)
    const r = selRef.current
    if (r && r.w > 3 && r.h > 3) {
      // 选区有效：展示浮动工具栏，等待用户选择动作（不再立即裁剪）
      setShowToolbar(true)
      showToolbarRef.current = true
    } else {
      // 选区过小：可能是双击的前奏，延迟取消以等待 dblclick
      if (pendingCancelRef.current) clearTimeout(pendingCancelRef.current)
      pendingCancelRef.current = window.setTimeout(() => {
        window.screenshotOverlayApi.cancel()
      }, 220)
    }
  }

  // 双击任意位置：直接截取光标所在显示器的全屏
  const onDoubleClick = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    if (pendingCancelRef.current) {
      clearTimeout(pendingCancelRef.current)
      pendingCancelRef.current = null
    }
    triggerCrop({ x: e.clientX, y: e.clientY, width: 0, height: 0 }, 'both', true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimers()
        window.screenshotOverlayApi.cancel()
        return
      }
      // 工具栏快捷键仅在选区完成、工具栏可见时生效
      if (!showToolbarRef.current || capturedRef.current) return
      // 若焦点已在某个按钮上，交给按钮自身的激活处理，避免重复触发
      if (e.key === 'Enter' && (document.activeElement as HTMLElement | null)?.tagName === 'BUTTON') return

      if (e.key === 'Enter') {
        e.preventDefault()
        runAction('both')
      } else if (e.key === '1' || e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        runAction('copy')
      } else if (e.key === '2' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        runAction('save')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 测量工具栏尺寸，用于精确计算位置（避免溢出屏幕）
  useLayoutEffect(() => {
    if (showToolbar && tbRef.current) {
      const r = tbRef.current.getBoundingClientRect()
      setTbSize({ w: r.width, h: r.height })
    }
  }, [showToolbar, sel])

  // Loading state: 透明背景，几乎无感（不再需要等待截图）
  if (!info) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed', inset: 0, margin: 0, padding: 0,
          background: 'rgba(0,0,0,0.01)', cursor: 'crosshair',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ color: 'white', fontSize: 18, fontFamily: 'system-ui, sans-serif', opacity: 0.8 }}>
          Loading...
        </div>
      </motion.div>
    )
  }

  // 尺寸标签位置（跟随光标，避免溢出屏幕）
  const labelX = cursor ? Math.min(cursor.x + 14, info.width - 110) : 0
  const labelY = cursor ? Math.min(cursor.y + 14, info.height - 34) : 0

  // 工具栏定位：默认在选区下方，靠近底部时翻转到上方；水平居中并夹紧在屏幕内
  const tbW = tbSize.w || 268
  const tbH = tbSize.h || 68
  const gap = 12
  let tbLeft = 0
  let tbTop = 0
  let placeAbove = false
  if (sel) {
    const anchorX = sel.x + sel.w / 2
    tbTop = sel.y + sel.h + gap
    if (tbTop + tbH > info.height - 8) {
      tbTop = sel.y - tbH - gap
      placeAbove = true
      if (tbTop < 8) tbTop = Math.max(8, info.height - tbH - 8)
    }
    tbLeft = anchorX - tbW / 2
    tbLeft = Math.max(8, Math.min(tbLeft, info.width - tbW - 8))
  }

  const TOOLS: ToolDef[] = [
    { key: 'copy', label: '复制', hint: '1', Icon: Copy, run: () => runAction('copy') },
    { key: 'save', label: '保存', hint: '2', Icon: Save, run: () => runAction('save') },
    { key: 'mark', label: '标记截图', Icon: Pen, run: () => runPlaceholder('标记功能开发中') },
    { key: 'search', label: '视觉搜索', Icon: Eye, run: () => runPlaceholder('视觉搜索开发中') },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* 透明捕获层：用户透过它看到真实屏幕，同时接收所有鼠标事件 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: EASE }}
        style={{
          position: 'fixed', inset: 0,
          margin: 0, padding: 0,
          background: 'rgba(0,0,0,0.01)',
          cursor: captured ? 'default' : dragging ? 'grabbing' : showToolbar ? 'default' : 'crosshair',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Crosshair guide lines following cursor */}
        {cursor && !captured && !showToolbar && (
          <>
            <div style={{
              position: 'fixed', left: cursor.x, top: 0, width: 1, height: '100vh',
              background: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'fixed', top: cursor.y, left: 0, height: 1, width: '100vw',
              background: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Selection rect (semi-transparent fill + border) */}
        <AnimatePresence>
          {sel && sel.w > 0 && sel.h > 0 && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }}
              style={{
                position: 'absolute',
                left: sel.x, top: sel.y, width: sel.w, height: sel.h,
                background: 'rgba(100,150,255,0.15)',
                border: '1.5px solid rgba(120,170,255,0.95)',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Dimension label near cursor while dragging */}
        <AnimatePresence>
          {dragging && sel && sel.w > 1 && sel.h > 1 && (
            <motion.div
              key="dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute', left: labelX, top: labelY,
                padding: '3px 8px', borderRadius: 6,
                background: 'rgba(20,20,22,0.78)', color: '#fff',
                fontSize: 12, fontFamily: 'system-ui, sans-serif',
                letterSpacing: 0.4, pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(sel.w)} × {Math.round(sel.h)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard / interaction hints */}
        {!captured && (
          <div
            style={{
              position: 'absolute', bottom: 28, left: 0, right: 0,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 13, fontFamily: 'system-ui, sans-serif',
              letterSpacing: 0.3, pointerEvents: 'none',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            {showToolbar
              ? 'Enter 复制并保存 · 1/C 复制 · 2/S 保存 · ESC 取消'
              : '拖拽选择截图区域 · ESC 取消 · 按住 Shift 等比缩放 · 双击全屏'}
          </div>
        )}
      </motion.div>

      {/* Layer 3: Floating action toolbar — appears after a valid selection */}
      <AnimatePresence>
        {showToolbar && sel && sel.w > 3 && sel.h > 3 && (
          <motion.div
            ref={tbRef}
            key="toolbar"
            initial={{ opacity: 0, x: tbLeft, y: tbTop + (placeAbove ? 12 : -12), scale: 0.94 }}
            animate={{ opacity: 1, x: tbLeft, y: tbTop, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 480, damping: 30, mass: 0.7 }}
            style={{
              position: 'fixed', left: 0, top: 0,
              zIndex: 20, pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 10px', borderRadius: 14,
              background: 'rgba(30,30,32,0.92)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {TOOLS.map((t, i) => (
              <React.Fragment key={t.key}>
                <ToolButton def={t} />
                {i < TOOLS.length - 1 && (
                  <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.10)' }} />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast: 反馈提示（底部居中，上滑淡入） */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 16, x: '-50%' }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{
              position: 'fixed', bottom: 56, left: '50%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 999,
              background: 'rgba(20,20,22,0.82)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#fff', fontSize: 14, fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              pointerEvents: 'none', zIndex: 10,
            }}
          >
            <span style={{ color: '#4ade80', fontSize: 15, lineHeight: 1 }}>✓</span>
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 工具栏单个按钮：图标 + 中文标签 + 可选快捷键提示
function ToolButton({ def }: { def: ToolDef }): React.ReactNode {
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)
  const { Icon, label, hint, run } = def

  return (
    <button
      onClick={(e) => {
        ;(e.currentTarget as HTMLElement).blur()
        run()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false) }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, width: 60, padding: '8px 4px', borderRadius: 10,
        background: active ? 'rgba(255,255,255,0.16)' : hover ? 'rgba(255,255,255,0.10)' : 'transparent',
        border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.92)',
        transform: active ? 'scale(0.96)' : 'scale(1)',
        transition: 'background 0.15s ease, transform 0.1s ease',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Icon size={20} strokeWidth={1.8} color="rgba(255,255,255,0.92)" />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', lineHeight: 1, letterSpacing: 0.3 }}>{label}</span>
      {/* hint removed — no number labels on buttons */}
    </button>
  )
}

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(<ScreenshotOverlay />)
