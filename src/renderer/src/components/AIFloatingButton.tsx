/**
 * AIFloatingButton — Global floating action button for the AI chat panel.
 * Fixed position, draggable with localStorage persistence.
 * Toggles the AIChatPanel via aiPanelStore.
 *
 * Liquid Glass Personality: breathing animation, gradient glass surface,
 * blue glow shadows, radial icon aura, glass tooltip.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot } from 'lucide-react';
import { useAIPanelStore } from '../stores/aiPanelStore';

const PANEL_WIDTH = 420;
const FAB_SIZE = 56;
const GAP = 20;
const MOBILE_BREAKPOINT = 768;
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = 'ai-fab-position';

/* ─── CSS Keyframes ────────────────────────────────────────────── */
const BREATHING_CSS = `
@keyframes ai-fab-breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(59,130,246,0.12), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 1px rgba(255,255,255,0.15); }
  50% { transform: scale(1.04); box-shadow: 0 6px 28px rgba(59,130,246,0.2), 0 0 12px rgba(59,130,246,0.08), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 2px rgba(255,255,255,0.2); }
}
@keyframes ai-fab-pop {
  0% { transform: scale(1); }
  30% { transform: scale(0.82); }
  60% { transform: scale(1.12); }
  80% { transform: scale(0.97); }
  100% { transform: scale(1); }
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
    const { open, togglePanel } = useAIPanelStore();
    const [hovered, setHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
    );

    // ── Drag state ──
    const [position, setPosition] = useState<{ bottom: number; right: number }>(
        () => loadSavedPosition() || { bottom: GAP + 80, right: GAP }
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
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.right,
            posY: position.bottom,
        };
        hasDraggedRef.current = false;
    }, [position]);

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
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* ignore */ }
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

    const isDark = typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark');

    const isIdle = !open && !hovered && !isDragging;

    const fabBackground = open
        ? isDark
            ? 'linear-gradient(135deg, rgba(40,50,90,0.75) 0%, rgba(25,35,70,0.65) 50%, rgba(50,60,110,0.55) 100%)'
            : 'linear-gradient(135deg, rgba(200,215,255,0.65) 0%, rgba(160,185,245,0.45) 50%, rgba(220,230,255,0.55) 100%)'
        : isDark
            ? 'linear-gradient(135deg, rgba(50,55,80,0.75) 0%, rgba(30,35,60,0.65) 50%, rgba(60,65,100,0.55) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(210,220,255,0.45) 50%, rgba(255,255,255,0.6) 100%)';

    const fabShadow = hovered
        ? '0 8px 40px rgba(59,130,246,0.28), 0 0 24px rgba(59,130,246,0.12), 0 0 0 1px rgba(255,255,255,0.15), inset 0 1px 2px rgba(255,255,255,0.25)'
        : '0 4px 20px rgba(59,130,246,0.12), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 1px rgba(255,255,255,0.15)';

    const fabBorder = hovered
        ? '1px solid rgba(120,160,255,0.35)'
        : open
            ? '1px solid rgba(100,140,255,0.25)'
            : '1px solid rgba(255,255,255,0.18)';

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
                    transition: 'background 0.4s ease, box-shadow 0.4s ease, border-color 0.3s ease, bottom 0.3s cubic-bezier(0.22,1,0.36,1), right 0.3s cubic-bezier(0.22,1,0.36,1)',
                }}
                aria-label="AI 助手"
            >
                {/* Radial icon aura */}
                <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                        background: open
                            ? 'radial-gradient(circle at 40% 35%, rgba(99,130,255,0.2) 0%, transparent 65%)'
                            : 'radial-gradient(circle at 40% 35%, rgba(99,130,255,0.1) 0%, transparent 60%)',
                        transition: 'background 0.4s ease',
                    }}
                />

                {/* Bot icon with animated swap */}
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
                            <Bot
                                size={24}
                                className="text-blue-500 dark:text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.35)]"
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="closed"
                            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="relative z-[1]"
                        >
                            <Bot
                                size={24}
                                className={hovered
                                    ? 'text-blue-500 dark:text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.3)]'
                                    : 'text-zinc-600 dark:text-zinc-300 drop-shadow-[0_0_4px_rgba(59,130,246,0.15)]'}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Active ring when panel is open */}
                <AnimatePresence>
                    {open && (
                        <motion.span
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="absolute inset-[-5px] rounded-full pointer-events-none"
                            style={{
                                border: '1.5px solid transparent',
                                backgroundImage: `linear-gradient(${isDark ? 'rgba(30,35,60,0.9)' : 'rgba(255,255,255,0.9)'}, ${isDark ? 'rgba(30,35,60,0.9)' : 'rgba(255,255,255,0.9)'}), linear-gradient(135deg, rgba(99,130,255,0.5), rgba(140,100,255,0.3), rgba(99,180,255,0.5))`,
                                backgroundOrigin: 'border-box',
                                backgroundClip: 'padding-box, border-box',
                                boxShadow: '0 0 20px rgba(59,130,246,0.18), inset 0 0 12px rgba(59,130,246,0.05)',
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
                                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.35)',
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
                                style={{ borderTopColor: isDark ? 'rgba(25,28,45,0.82)' : 'rgba(255,255,255,0.82)' }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>
        </>
    );
}
