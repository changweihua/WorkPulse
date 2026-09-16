/**
 * AIFloatingButton — Global floating action button for the AI chat panel.
 * Fixed bottom-right, always visible, toggles the AIChatPanel via aiPanelStore.
 * Shifts left when the panel is open so it remains visible and accessible.
 *
 * Liquid Glass Personality: breathing animation, gradient glass surface,
 * blue glow shadows, radial icon aura, glass tooltip.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot } from 'lucide-react';
import { useAIPanelStore } from '../stores/aiPanelStore';

const PANEL_WIDTH = 420;
const FAB_SIZE = 56;
const GAP = 20;
const MOBILE_BREAKPOINT = 768;

/* ─── CSS Keyframes for breathing animation ────────────────────── */
const BREATHING_CSS = `
@keyframes ai-fab-breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(59,130,246,0.12), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 1px rgba(255,255,255,0.15); }
  50% { transform: scale(1.04); box-shadow: 0 6px 28px rgba(59,130,246,0.2), 0 0 12px rgba(59,130,246,0.08), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 2px rgba(255,255,255,0.2); }
}
@keyframes ai-fab-glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 0.9; transform: scale(1.1); }
}
@keyframes ai-ring-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

export default function AIFloatingButton() {
    const { open, togglePanel } = useAIPanelStore();
    const [hovered, setHovered] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
    );

    useEffect(() => {
        const timer = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(timer);
    }, []);

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    if (isMobile) return null;

    const isDark = typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark');

    const isIdle = !open && !hovered;

    /* ─── Dynamic style values ─── */
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
                onClick={togglePanel}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                initial={{ opacity: 0, scale: 0.7, right: GAP }}
                animate={{
                    opacity: mounted ? 1 : 0,
                    scale: mounted ? 1 : 0.7,
                    right: open ? PANEL_WIDTH + GAP : GAP,
                }}
                transition={{
                    right: { type: 'spring', stiffness: 200, damping: 28 },
                    opacity: { duration: 0.4, delay: 0.15 },
                    scale: { type: 'spring', stiffness: 300, damping: 22, delay: 0.15 },
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                className="fixed bottom-6 z-35
                           rounded-full
                           flex items-center justify-center
                           backdrop-blur-xl
                           cursor-pointer
                           outline-none
                           focus-visible:ring-2 focus-visible:ring-blue-400/70"
                style={{
                    width: FAB_SIZE,
                    height: FAB_SIZE,
                    background: fabBackground,
                    boxShadow: fabShadow,
                    border: fabBorder,
                    animation: isIdle ? 'ai-fab-breathe 3s ease-in-out infinite' : 'none',
                    transition: 'background 0.4s ease, box-shadow 0.4s ease, border-color 0.3s ease',
                }}
                aria-label="AI 助手"
            >
                {/* ─── Radial icon aura ─── */}
                <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                        background: open
                            ? 'radial-gradient(circle at 40% 35%, rgba(99,130,255,0.2) 0%, transparent 65%)'
                            : 'radial-gradient(circle at 40% 35%, rgba(99,130,255,0.1) 0%, transparent 60%)',
                        transition: 'background 0.4s ease',
                    }}
                />

                {/* ─── Bot icon with animated swap ─── */}
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

                {/* ─── Active ring — gradient border + glow when panel is open ─── */}
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

                {/* ─── Glass tooltip ─── */}
                <AnimatePresence>
                    {hovered && !open && (
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
                                background: isDark
                                    ? 'rgba(25,28,45,0.82)'
                                    : 'rgba(255,255,255,0.82)',
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
                                    borderTopColor: isDark
                                        ? 'rgba(25,28,45,0.82)'
                                        : 'rgba(255,255,255,0.82)',
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>
        </>
    );
}
