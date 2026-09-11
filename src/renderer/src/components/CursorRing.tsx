// src/renderer/src/components/CursorRing.tsx
import { useEffect, useRef, useCallback } from 'react';

interface CursorRingProps {
  size?: number;
  borderWidth?: number;
  className?: string;
}

/**
 * Custom cursor ring that follows the mouse with smooth easing.
 * Uses mix-blend-mode: difference for adaptive contrast.
 * Only renders on devices with fine pointer (no touch).
 * All DOM updates are direct via refs — zero React re-renders.
 */
export default function CursorRing({
  size = 32,
  borderWidth = 1.5,
  className,
}: CursorRingProps) {
  const ringRef = useRef<HTMLDivElement>(null);

  // ─── Mutable state — all in refs, never triggers React re-render ──
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const currentScale = useRef(1);
  const targetScale = useRef(1);
  const currentOpacity = useRef(0);
  const rafId = useRef(0);

  // ─── Pointer position tracking ────────────────────────────────
  const handleMouseMove = useCallback((e: MouseEvent) => {
    target.current.x = e.clientX;
    target.current.y = e.clientY;

    // Snap immediately on first move so the ring doesn't drift from (0,0)
    if (currentOpacity.current === 0) {
      pos.current.x = e.clientX;
      pos.current.y = e.clientY;
    }
  }, []);

  // ─── Interactive element detection ────────────────────────────
  const INTERACTIVE_SEL =
    'a, button, [role="button"], input, select, textarea, label, [data-cursor-hover]';

  const handleMouseOver = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement)?.closest?.(INTERACTIVE_SEL)) {
      targetScale.current = 1.5;
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement)?.closest?.(INTERACTIVE_SEL)) {
      targetScale.current = 1;
    }
  }, []);

  // ─── Animation loop — exponential easing ─────────────────────
  const EASE_POS = 0.12;  // position lag (lower = more trailing)
  const EASE_SCALE = 0.18; // scale lag (slightly snappier than position)
  const EASE_FADE = 0.08;  // opacity fade-in speed

  const tick = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) {
      rafId.current = requestAnimationFrame(tick);
      return;
    }

    // ── Position lerp ──
    pos.current.x += (target.current.x - pos.current.x) * EASE_POS;
    pos.current.y += (target.current.y - pos.current.y) * EASE_POS;

    // ── Scale lerp ──
    currentScale.current += (targetScale.current - currentScale.current) * EASE_SCALE;
    // Snap to avoid sub-pixel drift
    if (Math.abs(currentScale.current - targetScale.current) < 0.005) {
      currentScale.current = targetScale.current;
    }

    // ── Opacity fade-in ──
    if (currentOpacity.current < 1) {
      currentOpacity.current = Math.min(1, currentOpacity.current + EASE_FADE);
      ring.style.opacity = String(currentOpacity.current);
    }

    // ── Compose transform ──
    const tx = pos.current.x - size / 2;
    const ty = pos.current.y - size / 2;
    ring.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${currentScale.current.toFixed(3)})`;

    rafId.current = requestAnimationFrame(tick);
  }, [size]);

  // ─── Mount / unmount ─────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseover', handleMouseOver, { passive: true });
    window.addEventListener('mouseout', handleMouseOut, { passive: true });
    rafId.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mouseout', handleMouseOut);
      cancelAnimationFrame(rafId.current);
    };
  }, [handleMouseMove, handleMouseOver, handleMouseOut, tick]);

  // ─── Render ──────────────────────────────────────────────────
  // Inline <style> is required for @media queries (can't be set inline).
  // Everything else uses inline styles for zero-class-toggle overhead.
  return (
    <>
      <style>{`
        /* Hide on touch / pen devices */
        @media (hover: none) {
          .cursor-ring-global { display: none !important; }
        }
      `}</style>

      <div
        ref={ringRef}
        className={`cursor-ring-global${className ? ` ${className}` : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: '50%',
          border: `${borderWidth}px solid white`,
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'difference',
          willChange: 'transform',
          transform: 'translate3d(0,0,0) scale(1)',
          opacity: 0,
          boxSizing: 'border-box',
        }}
        aria-hidden="true"
      />
    </>
  );
}
