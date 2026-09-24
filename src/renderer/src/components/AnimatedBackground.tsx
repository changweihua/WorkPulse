import { useEffect, useRef } from 'react'

/**
 * Liquid glass dynamic background layer.
 * Soft, slow-moving ambient blobs that create subtle depth
 * behind frosted-glass card surfaces.
 *
 * 性能说明：鼠标跟随状态保存在 useRef 中，rAF 循环直接写 DOM transform，
 * 不再每帧 setState 触发 React 重渲染；blur 模糊静态放在内层元素上，
 * 外层仅负责位移，便于浏览器缓存已模糊的光栅层。
 */

/** 各光斑的外观与位移参数（静态配置，样式不随帧重建） */
const BLOBS = [
  {
    /** 主蓝光斑 — 非常轻微 */
    size: 500,
    background:
      'radial-gradient(circle, rgba(99,130,255,0.06) 0%, rgba(99,130,255,0.01) 50%, transparent 70%)',
    blur: 60,
    sx: 1,
    sy: 1,
    bx: -200,
    by: -200,
  },
  {
    /** 紫色光斑 — 偏移、更慢 */
    size: 450,
    background:
      'radial-gradient(circle, rgba(168,100,255,0.05) 0%, rgba(168,100,255,0.01) 50%, transparent 70%)',
    blur: 70,
    sx: 0.8,
    sy: 0.85,
    bx: -100,
    by: -60,
  },
  {
    /** 青色光斑 — 最慢、偏移最大 */
    size: 400,
    background:
      'radial-gradient(circle, rgba(56,198,165,0.04) 0%, rgba(56,198,165,0.01) 50%, transparent 70%)',
    blur: 65,
    sx: 0.65,
    sy: 0.7,
    bx: 80,
    by: -120,
  },
  {
    /** 琥珀色光斑 — 暖色点缀、最慢 */
    size: 350,
    background:
      'radial-gradient(circle, rgba(234,88,12,0.035) 0%, rgba(234,88,12,0.008) 50%, transparent 70%)',
    blur: 55,
    sx: 0.5,
    sy: 0.6,
    bx: 200,
    by: 100,
  },
] as const

/** 光斑初始跟随起点（与原实现保持一致） */
const INIT = { x: -400, y: -400 }

export function AnimatedBackground() {
  const rafRef = useRef<number>(0)
  const targetRef = useRef({ x: INIT.x, y: INIT.y })
  const currentRef = useRef({ x: INIT.x, y: INIT.y })
  // 上一次写入 DOM 的取整位置（2px 粒度），无变化则跳过样式写入
  const lastRoundedRef = useRef({ x: INIT.x, y: INIT.y })
  const blobRefs = useRef<Array<HTMLDivElement | null>>(BLOBS.map(() => null))

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    // Slow lerp for calm, non-distracting following
    const tick = () => {
      const c = currentRef.current
      const t = targetRef.current
      c.x += (t.x - c.x) * 0.03 // much slower following
      c.y += (t.y - c.y) * 0.03
      // 保持原实现 2px 取整策略，位置未变化时不写 DOM
      const rx = Math.round(c.x / 2) * 2
      const ry = Math.round(c.y / 2) * 2
      const last = lastRoundedRef.current
      if (rx !== last.x || ry !== last.y) {
        last.x = rx
        last.y = ry
        for (let i = 0; i < BLOBS.length; i++) {
          const el = blobRefs.current[i]
          if (el) {
            const b = BLOBS[i]
            el.style.transform = `translate3d(${rx * b.sx}px, ${ry * b.sy}px, 0)`
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            blobRefs.current[i] = el
          }}
          style={{
            position: 'absolute',
            left: b.bx,
            top: b.by,
            transform: `translate3d(${INIT.x * b.sx}px, ${INIT.y * b.sy}px, 0)`,
            willChange: 'transform',
          }}
        >
          {/* blur 静态化：移动只改外层 transform，模糊内容可被合成层缓存复用 */}
          <div
            style={{
              width: b.size,
              height: b.size,
              borderRadius: '50%',
              background: b.background,
              filter: `blur(${b.blur}px)`,
            }}
          />
        </div>
      ))}
    </div>
  )
}
