import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { motion, AnimatePresence } from 'motion/react'

interface ReadyInfo {
  dataUrl: string
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

// 统一缓动曲线（与全局动效一致：快出缓停）
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/**
 * Screenshot overlay using SurfSense pattern:
 * - <img> for screenshot (pointer-events: none)
 * - Full-screen veil div for mouse events (covers every pixel)
 * - Selection rect / guides / hints / toast inside veil
 */
function ScreenshotOverlay(): React.ReactNode {
  const [info, setInfo] = useState<ReadyInfo | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [toast, setToast] = useState(false)

  const drawingRef = useRef(false)
  const startRef = useRef<Point | null>(null)
  const selRef = useRef<Rect | null>(null)
  const capturedRef = useRef(false)
  const pendingCancelRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingCancelRef.current) clearTimeout(pendingCancelRef.current)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        window.screenshotOverlayApi.cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Loading state: solid background, no interaction needed
  if (!info) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed', inset: 0, margin: 0, padding: 0,
          background: '#000', cursor: 'crosshair',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ color: 'white', fontSize: 18, fontFamily: 'system-ui, sans-serif', opacity: 0.8 }}>
          截图准备中...
        </div>
      </motion.div>
    )
  }

  const updateSel = (next: Rect | null) => {
    selRef.current = next
    setSel(next)
  }

  // 触发裁剪：复制 + 保存（由主进程完成），随后展示提示 2 秒再关闭窗口
  const triggerCrop = async (rect: { x: number; y: number; width: number; height: number }) => {
    if (capturedRef.current) return
    capturedRef.current = true
    setCaptured(true)
    setDragging(false)

    let ok = false
    try {
      const res = await window.screenshotOverlayApi.crop(rect)
      ok = !!res?.ok
    } catch {
      ok = false
    }

    if (!ok) {
      window.screenshotOverlayApi.cancel()
      return
    }

    // 展示成功提示，2 秒后关闭覆盖窗口（cancel 会恢复径向菜单）
    setToast(true)
    toastTimerRef.current = window.setTimeout(() => {
      window.screenshotOverlayApi.cancel()
    }, 2000)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    drawingRef.current = true
    setDragging(true)
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
      triggerCrop({ x: r.x, y: r.y, width: r.w, height: r.h })
    } else {
      // 选区过小：可能是双击的前奏，延迟取消以等待 dblclick
      if (pendingCancelRef.current) clearTimeout(pendingCancelRef.current)
      pendingCancelRef.current = window.setTimeout(() => {
        window.screenshotOverlayApi.cancel()
      }, 220)
    }
  }

  // 双击任意位置：直接截取全屏
  const onDoubleClick = () => {
    if (capturedRef.current) return
    if (pendingCancelRef.current) {
      clearTimeout(pendingCancelRef.current)
      pendingCancelRef.current = null
    }
    triggerCrop({ x: 0, y: 0, width: info.width, height: info.height })
  }

  // 尺寸标签位置（跟随光标，避免溢出屏幕）
  const labelX = cursor ? Math.min(cursor.x + 14, info.width - 110) : 0
  const labelY = cursor ? Math.min(cursor.y + 14, info.height - 34) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* Layer 1: Screenshot image — pointer-events: none, covers entire window */}
      <img
        src={info.dataUrl}
        alt="Screenshot"
        draggable={false}
        onError={() => console.error('[Screenshot] img failed to load, dataUrl length:', info.dataUrl?.length)}
        style={{
          position: 'fixed', inset: 0,
          width: '100vw', height: '100vh',
          objectFit: 'fill',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 2: Near-invisible veil — receives ALL mouse events, covers every pixel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{
          position: 'fixed', inset: 0,
          margin: 0, padding: 0,
          background: 'rgba(0,0,0,0.03)',
          cursor: captured ? 'default' : dragging ? 'grabbing' : 'crosshair',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Crosshair guide lines following cursor */}
        {cursor && !captured && (
          <>
            <div style={{
              position: 'fixed', left: cursor.x, top: 0, width: 1, height: '100vh',
              background: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'fixed', top: cursor.y, left: 0, height: 1, width: '100vw',
              background: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Selection rect (spotlight + thin border + inner depth) */}
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
                background: 'transparent',
                border: '1.5px solid rgba(255,255,255,0.95)',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.3)',
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
              color: 'rgba(255,255,255,0.78)',
              fontSize: 13, fontFamily: 'system-ui, sans-serif',
              letterSpacing: 0.3, pointerEvents: 'none',
              textShadow: '0 1px 3px rgba(0,0,0,0.55)',
            }}
          >
            拖拽选择截图区域 · ESC 取消 · 按住 Shift 等比缩放
          </div>
        )}
      </motion.div>

      {/* Toast: 复制成功反馈（底部居中，上滑淡入） */}
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
            <span>已复制到剪贴板</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(<ScreenshotOverlay />)
