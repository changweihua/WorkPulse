import { useEffect, useRef, useState } from 'react'

/**
 * Liquid glass dynamic background layer.
 * Soft, slow-moving ambient blobs that create subtle depth
 * behind frosted-glass card surfaces.
 */
export function AnimatedBackground() {
  const [pos, setPos] = useState({ x: -400, y: -400 })
  const rafRef = useRef<number>(0)
  const targetRef = useRef({ x: -400, y: -400 })
  const currentRef = useRef({ x: -400, y: -400 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    // Slow lerp for calm, non-distracting following
    const tick = () => {
      const c = currentRef.current
      const t = targetRef.current
      c.x += (t.x - c.x) * 0.03  // much slower following
      c.y += (t.y - c.y) * 0.03
      setPos({ x: c.x, y: c.y })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Only re-render when position changes by >2px to reduce re-render frequency
  const roundedX = Math.round(pos.x / 2) * 2
  const roundedY = Math.round(pos.y / 2) * 2

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Primary blue blob — very subtle */}
      <div
        style={{
          position: 'absolute',
          left: roundedX - 200,
          top: roundedY - 200,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,130,255,0.06) 0%, rgba(99,130,255,0.01) 50%, transparent 70%)',
          filter: 'blur(60px)',
          willChange: 'left, top',
        }}
      />
      {/* Purple blob — offset, slower */}
      <div
        style={{
          position: 'absolute',
          left: roundedX * 0.8 - 100,
          top: roundedY * 0.85 - 60,
          width: 450,
          height: 450,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,100,255,0.05) 0%, rgba(168,100,255,0.01) 50%, transparent 70%)',
          filter: 'blur(70px)',
          willChange: 'left, top',
        }}
      />
      {/* Teal blob — slowest, most offset */}
      <div
        style={{
          position: 'absolute',
          left: roundedX * 0.65 + 80,
          top: roundedY * 0.7 - 120,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56,198,165,0.04) 0%, rgba(56,198,165,0.01) 50%, transparent 70%)',
          filter: 'blur(65px)',
          willChange: 'left, top',
        }}
      />
    </div>
  )
}
