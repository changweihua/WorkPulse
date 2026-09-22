/**
 * AIFloatingButton — 全局浮动 AI 助手按钮。
 * 固定定位，支持拖拽和 localStorage 持久化。
 * 通过 aiPanelStore 切换 AIChatPanel。
 *
 * Liquid Glass 美学 — 多色渐变呼吸动画、毛玻璃表面、
 * violet→blue→cyan 发光阴影、径向图标光晕、玻璃 tooltip。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot } from 'lucide-react';
import { useAIPanelStore } from '../stores/aiPanelStore';
import { useShallow } from 'zustand/react/shallow';

const PANEL_WIDTH = 420;
const FAB_SIZE = 56;
const GAP = 20;
const MOBILE_BREAKPOINT = 768;
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = 'ai-fab-position';

/* ─── CSS Keyframes — 多色渐变呼吸 + 图标浮动 ─────────────────── */
const BREATHING_CSS = `
@keyframes ai-fab-breathe {
  0%, 100% {
    transform: scale(1);
    box-shadow:
      0 4px 20px rgba(139,92,246,0.10),
      0 4px 20px rgba(59,130,246,0.08),
      0 0 0 1px rgba(255,255,255,0.08),
      inset 0 1px 1px rgba(255,255,255,0.12);
  }
  50% {
    transform: scale(1.035);
    box-shadow:
      0 6px 32px rgba(139,92,246,0.18),
      0 6px 32px rgba(59,130,246,0.12),
      0 0 16px rgba(34,211,238,0.06),
      0 0 0 1px rgba(255,255,255,0.10),
      inset 0 1px 2px rgba(255,255,255,0.18);
  }
}
@keyframes ai-fab-pop {
  0% { transform: scale(1); }
  30% { transform: scale(0.82); }
  60% { transform: scale(1.12); }
  80% { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@keyframes ai-icon-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-1.5px); }
}
@keyframes ai-icon-glow {
  0%, 100% { filter: drop-shadow(0 0 1px rgba(139,92,246,0.2)) drop-shadow(0 0 3px rgba(59,130,246,0.1)); }
  50% { filter: drop-shadow(0 0 3px rgba(139,92,246,0.35)) drop-shadow(0 0 6px rgba(34,211,238,0.2)); }
}
`;

/** Load saved position from localStorage, clamped to viewport */
function loadSavedPosition(): { bottom: number; right: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.bottom !== 'number' || typeof pos.right !== 'number') return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      right: Math.max(GAP, Math.min(pos.right, vw - FAB_SIZE - GAP)),
      bottom: Math.max(GAP, Math.min(pos.bottom, vh - FAB_SIZE - GAP)),
    };
  } catch {
    return null;
  }
}

export default function AIFloatingButton() {
  const { open, togglePanel } = useAIPanelStore(
    useShallow((s) => ({ open: s.open, togglePanel: s.togglePanel })),
  );
  const [hovered, setHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  // ── Drag state ──
  const [position, setPosition] = useState<{ bottom: number; right: number }>(
    () => loadSavedPosition() || { bottom: GAP + 80, right: GAP },
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ── Pop animation key — forces re-mount to trigger entrance animation ──
  const [popKey, setPopKey] = useState(0);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current !== open) {
      prevOpenRef.current = open;
      setPopKey((k) => k + 1);
    }
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Drag handlers ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.right,
        posY: position.bottom,
      };
      hasDraggedRef.current = false;
    },
    [position],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      hasDraggedRef.current = true;
      setIsDragging(true);
    }
    if (!hasDraggedRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      right: Math.max(GAP, Math.min(dragStartRef.current.posX - dx, vw - FAB_SIZE - GAP)),
      bottom: Math.max(GAP, Math.min(dragStartRef.current.posY - dy, vh - FAB_SIZE - GAP)),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!dragStartRef.current) return;
    const wasDragging = hasDraggedRef.current;
    dragStartRef.current = null;
    if (wasDragging) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch {
        /* ignore */
      }
      setTimeout(() => setIsDragging(false), 50);
    }
  }, [position]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleClick = useCallback(() => {
    if (hasDraggedRef.current) return;
    togglePanel();
  }, [togglePanel]);

  if (isMobile) return null;

  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const isIdle = !open && !hovered && !isDragging;

  // 多色渐变背景 — violet→blue→cyan
  const fabBackground = open
    ? isDark
      ? 'linear-gradient(135deg, rgba(50,30,80,0.80) 0%, rgba(25,35,70,0.70) 50%, rgba(20,55,80,0.60) 100%)'
      : 'linear-gradient(135deg, rgba(200,190,255,0.65) 0%, rgba(160,195,255,0.45) 50%, rgba(180,230,255,0.55) 100%)'
    : isDark
      ? 'linear-gradient(135deg, rgba(45,35,70,0.80) 0%, rgba(30,35,60,0.70) 50%, rgba(25,50,75,0.60) 100%)'
      : 'linear-gradient(135deg, rgba(255,250,255,0.78) 0%, rgba(210,220,255,0.48) 50%, rgba(200,235,255,0.58) 100%)';

  // 多色发光阴影 — violet + blue + cyan
  const fabShadow = hovered
    ? '0 8px 40px rgba(139,92,246,0.20), 0 8px 40px rgba(59,130,246,0.15), 0 0 24px rgba(34,211,238,0.08), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 2px rgba(255,255,255,0.22)'
    : '0 4px 20px rgba(139,92,246,0.10), 0 4px 20px rgba(59,130,246,0.08), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 1px rgba(255,255,255,0.12)';

  const fabBorder = hovered
    ? '1px solid rgba(139,140,255,0.30)'
    : open
      ? '1px solid rgba(120,130,255,0.22)'
      : '1px solid rgba(255,255,255,0.10)';

  return (
    <>
      <style>{BREATHING_CSS}</style>

      <motion.button
        key={popKey}
        ref={buttonRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        whileHover={{ scale: isDragging ? 1 : 1.08 }}
        whileTap={{ scale: isDragging ? 1 : 0.92 }}
        className={`fixed z-[35] w-[56px] h-[56px] rounded-full
                           flex items-center justify-center
                           backdrop-blur-xl outline-none
                           focus-visible:ring-2 focus-visible:ring-blue-400/70
                           ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        style={{
          bottom: position.bottom,
          right: position.right,
          background: fabBackground,
          boxShadow: fabShadow,
          border: fabBorder,
          animation: isIdle ? 'ai-fab-breathe 3s ease-in-out infinite' : 'none',
          transition:
            'background 0.4s ease, box-shadow 0.4s ease, border-color 0.3s ease, bottom 0.3s cubic-bezier(0.22,1,0.36,1), right 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}
        aria-label="AI 助手"
      >
        {/* 径向图标光晕 — 多色 */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: open
              ? 'radial-gradient(circle at 40% 35%, rgba(139,92,246,0.15) 0%, rgba(59,130,246,0.12) 40%, transparent 65%)'
              : 'radial-gradient(circle at 40% 35%, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 40%, transparent 60%)',
            transition: 'background 0.4s ease',
          }}
        />

        {/* Bot 图标 — 多色渐变 */}
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="open"
              initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative z-[1]"
            >
              <div className="w-7 h-7 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="ai-grad-open" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="50%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                  {/* 主星芒 — 中心四角星 */}
                  <path
                    d="M12 3l1.8 5.4L19.2 10l-5.4 1.8L12 17.2l-1.8-5.4L4.8 10l5.4-1.8z"
                    fill="url(#ai-grad-open)"
                  />
                  {/* 小星芒 — 右上 */}
                  <path
                    d="M17.5 2.5l.6 1.8L19.9 4.9l-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z"
                    fill="url(#ai-grad-open)"
                    opacity="0.8"
                  />
                  {/* 小星芒 — 左下 */}
                  <path
                    d="M5.5 16.5l.6 1.8L7.9 18.9l-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z"
                    fill="url(#ai-grad-open)"
                    opacity="0.55"
                  />
                </svg>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="closed"
              initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative z-[1]"
              style={
                isIdle
                  ? {
                      animation: 'ai-icon-float 2.5s ease-in-out infinite',
                    }
                  : {}
              }
            >
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={
                  isIdle
                    ? {
                        animation: 'ai-icon-glow 2.5s ease-in-out infinite',
                      }
                    : {}
                }
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="ai-grad-closed" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={hovered ? '#8b5cf6' : '#71717a'} />
                      <stop offset="50%" stopColor={hovered ? '#3b82f6' : '#a1a1aa'} />
                      <stop offset="100%" stopColor={hovered ? '#22d3ee' : '#71717a'} />
                    </linearGradient>
                  </defs>
                  {/* 主星芒 — 中心四角星 */}
                  <path
                    d="M12 3l1.8 5.4L19.2 10l-5.4 1.8L12 17.2l-1.8-5.4L4.8 10l5.4-1.8z"
                    fill="url(#ai-grad-closed)"
                  />
                  {/* 小星芒 — 右上 */}
                  <path
                    d="M17.5 2.5l.6 1.8L19.9 4.9l-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z"
                    fill="url(#ai-grad-closed)"
                    opacity={hovered ? 0.8 : 0.55}
                  />
                  {/* 小星芒 — 左下 */}
                  <path
                    d="M5.5 16.5l.6 1.8L7.9 18.9l-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z"
                    fill="url(#ai-grad-closed)"
                    opacity={hovered ? 0.6 : 0.4}
                  />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 打开状态 — 多色渐变环 */}
        <AnimatePresence>
          {open && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-[-5px] rounded-full pointer-events-none"
              style={{
                border: '1.5px solid transparent',
                backgroundImage: `linear-gradient(${isDark ? 'rgba(30,35,60,0.9)' : 'rgba(255,255,255,0.9)'}, ${isDark ? 'rgba(30,35,60,0.9)' : 'rgba(255,255,255,0.9)'}), linear-gradient(135deg, rgba(139,92,246,0.5), rgba(59,130,246,0.4), rgba(34,211,238,0.5))`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                boxShadow:
                  '0 0 20px rgba(139,92,246,0.12), 0 0 20px rgba(59,130,246,0.08), inset 0 0 12px rgba(139,92,246,0.04)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Glass tooltip */}
        <AnimatePresence>
          {hovered && !open && !isDragging && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute bottom-full mb-3 right-0
                                       px-3 py-1.5 rounded-xl
                                       text-xs font-medium whitespace-nowrap
                                       pointer-events-none"
              style={{
                background: isDark ? 'rgba(25,28,45,0.82)' : 'rgba(255,255,255,0.82)',
                backdropFilter: 'blur(16px) saturate(150%)',
                WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                border: isDark
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid rgba(255,255,255,0.35)',
                color: isDark ? 'rgba(220,225,240,0.95)' : 'rgba(30,35,50,0.9)',
                boxShadow: isDark
                  ? '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)'
                  : '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5)',
              }}
            >
              AI 助手
              <span
                className="absolute top-full right-[18px] w-0 h-0
                                           border-l-[5px] border-l-transparent
                                           border-r-[5px] border-r-transparent
                                           border-t-[5px]"
                style={{
                  borderTopColor: isDark ? 'rgba(25,28,45,0.82)' : 'rgba(255,255,255,0.82)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
