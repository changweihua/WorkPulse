import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'

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

/**
 * Screenshot overlay using SurfSense pattern:
 * - <img> for screenshot (pointer-events: none)
 * - Full-screen veil div for mouse events (covers every pixel)
 * - Selection rect inside veil
 */
function ScreenshotOverlay(): React.ReactNode {
  const [info, setInfo] = useState<ReadyInfo | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)
  const drawingRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const selRef = useRef<Rect | null>(null)

  useEffect(() => {
    window.screenshotOverlayApi.onReady((data: ReadyInfo) => setInfo(data))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.screenshotOverlayApi.cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Loading state: solid background, no interaction needed
  if (!info) {
    return (
      <div style={{
        position: 'fixed', inset: 0, margin: 0, padding: 0,
        background: '#000', cursor: 'crosshair',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}>
        <div style={{ color: 'white', fontSize: 18, fontFamily: 'system-ui, sans-serif', opacity: 0.8 }}>
          截图准备中...
        </div>
      </div>
    )
  }

  const updateSel = (next: Rect | null) => {
    selRef.current = next
    setSel(next)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    drawingRef.current = true
    startRef.current = { x: e.clientX, y: e.clientY }
    updateSel({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawingRef.current || !startRef.current) return
    const sx = startRef.current.x
    const sy = startRef.current.y
    const x = Math.min(sx, e.clientX)
    const y = Math.min(sy, e.clientY)
    const w = Math.abs(e.clientX - sx)
    const h = Math.abs(e.clientY - sy)
    updateSel({ x, y, w, h })
  }

  const onMouseUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const r = selRef.current
    if (r && r.w > 3 && r.h > 3) {
      window.screenshotOverlayApi.crop({ x: r.x, y: r.y, width: r.w, height: r.h })
    } else {
      window.screenshotOverlayApi.cancel()
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* Layer 1: Screenshot image — pointer-events: none, covers entire window */}
      <img
        src={info.dataUrl}
        alt="Screenshot"
        draggable={false}
        style={{
          position: 'fixed', inset: 0,
          width: '100vw', height: '100vh',
          objectFit: 'fill',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 2: Dark veil — receives ALL mouse events, covers every pixel */}
      <div
        style={{
          position: 'fixed', inset: 0,
          margin: 0, padding: 0,
          background: 'rgba(0,0,0,0.4)',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        {/* Selection rect */}
        {sel && sel.w > 0 && sel.h > 0 && (
          <>
            {/* Clear area inside selection — shows screenshot underneath */}
            <div
              style={{
                position: 'absolute',
                left: sel.x, top: sel.y, width: sel.w, height: sel.h,
                background: 'transparent',
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Hint text */}
        <div
          style={{
            position: 'absolute', bottom: 40, left: 0, right: 0,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 14, fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
          }}
        >
          拖拽选择截图区域 · ESC 取消
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(<ScreenshotOverlay />)
