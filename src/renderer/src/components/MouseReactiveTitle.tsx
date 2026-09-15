/* eslint-disable react/no-unknown-property */

/**
 * MouseReactiveTitle — A spotlight-effect title component where a flowing
 * rainbow gradient follows the cursor. Uses CSS mask-image for soft-edge
 * spotlight masking and requestAnimationFrame for smooth animation.
 *
 * Based on the "MouseReactiveTitle" pattern: HSL rainbow gradient + radial
 * gradient mask driven by mouse position + hue rotation over time.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/* ─── Props ──────────────────────────────────────────────────── */

export interface MouseReactiveTitleProps {
  /** Text or elements to render as the title */
  children: ReactNode
  /** Rainbow hue rotation speed multiplier (default: 1) */
  timeScale?: number
  /** Spotlight radius in px (default: 160) */
  spotlightRadius?: number
  /** Rainbow gradient alpha when hovered (default: 0.88) */
  rainbowAlpha?: number
  /** Additional CSS classes applied to the outermost container */
  className?: string
  /** Additional inline styles applied to the outermost container */
  style?: CSSProperties
}

/* ─── Helpers ─────────────────────────────────────────────────── */

/** Build a six-stop linear-gradient rotating through the HSL hue ring. */
function buildRainbowGradient(hueOffset: number, alpha: number): string {
  const stops = [0, 72, 144, 216, 288, 360]
    .map((offset) => {
      const hue = (hueOffset + offset) % 360
      return `hsla(${hue}, 88%, 62%, ${alpha})`
    })
    .join(', ')
  return `linear-gradient(105deg, ${stops})`
}

/** Build a radial-gradient mask centred at (x, y) with soft falloff. */
function buildSpotlightMask(x: number, y: number, radius: number): string {
  return `radial-gradient(circle ${radius}px at ${x}px ${y}px, ` +
    `rgba(0,0,0,1) 0%, ` +
    `rgba(0,0,0,0.78) 32%, ` +
    `rgba(0,0,0,0.45) 58%, ` +
    `rgba(0,0,0,0.15) 78%, ` +
    `transparent 100%)`
}

/* ─── Component ───────────────────────────────────────────────── */

export function MouseReactiveTitle({
  children,
  timeScale = 1,
  spotlightRadius = 160,
  rainbowAlpha = 0.88,
  className = '',
  style,
}: MouseReactiveTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [hueOffset, setHueOffset] = useState(0)

  /* ── Mouse position (relative to container) ── */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  /* ── Animation loop: rotates hue over time via rAF ── */
  useEffect(() => {
    if (!isHovering) return
    let frameId = 0
    const tick = (time: number) => {
      setHueOffset((time / 1000) * timeScale * 120)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [isHovering, timeScale])

  /* ── Derived CSS strings (stable between renders unless deps change) ── */
  const rainbow = useMemo(
    () => buildRainbowGradient(hueOffset, rainbowAlpha),
    [hueOffset, rainbowAlpha],
  )
  const mask = useMemo(
    () => buildSpotlightMask(mouse.x, mouse.y, spotlightRadius),
    [mouse.x, mouse.y, spotlightRadius],
  )

  /* ── Shared text layer style ── */
  const baseTextStyle: CSSProperties = useMemo(
    () => ({
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    }),
    [],
  )

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      style={style}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
    >
      {/* Layer 0: Baseline text (always visible, ensures layout) */}
      <div className="relative z-0">{children}</div>

      {/* Layer 1: Subtle ambient glow behind the text (only on hover) */}
      {isHovering && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          aria-hidden
          style={{
            background: `radial-gradient(circle ${spotlightRadius * 1.5}px at ${mouse.x}px ${mouse.y}px, rgba(120,160,255,0.08) 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Layer 2: Rainbow text overlay masked by spotlight */}
      {isHovering && (
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          aria-hidden
          style={{ transform: 'scale(1.008)' }}
        >
          {/* Rainbow text */}
          <div
            style={{
              ...baseTextStyle,
              backgroundImage: rainbow,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          >
            {children}
          </div>

          {/* Outer glow / shadow layer */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: rainbow,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              filter: 'blur(6px)',
              opacity: 0.5,
              maskImage: mask,
              WebkitMaskImage: mask,
              transform: 'scale(1.02)',
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

export default MouseReactiveTitle
