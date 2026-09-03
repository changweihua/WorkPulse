/**
 * AIFloatingButton — Global floating action button for the AI chat panel.
 * Fixed bottom-right, always visible, toggles the AIChatPanel via aiPanelStore.
 * Shifts left when the panel is open so it remains visible and accessible.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot } from 'lucide-react';
import { useAIPanelStore } from '../stores/aiPanelStore';

const PANEL_WIDTH = 420;
const FAB_SIZE = 52;
const GAP = 20;
const MOBILE_BREAKPOINT = 768;

export default function AIFloatingButton() {
    const { open, togglePanel } = useAIPanelStore();
    const [hovered, setHovered] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
    );

    // Fade-in after mount so the 420px initial slide doesn't feel abrupt
    useEffect(() => {
        const timer = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(timer);
    }, []);

    // Hide on narrow viewports
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

    return (
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
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="fixed bottom-6 z-35
                       rounded-full
                       flex items-center justify-center
                       backdrop-blur-xl
                       border border-zinc-200/40 dark:border-zinc-700/40
                       cursor-pointer
                       outline-none
                       focus-visible:ring-2 focus-visible:ring-blue-400/70"
            style={{
                width: FAB_SIZE,
                height: FAB_SIZE,
                background: open
                    ? isDark
                        ? 'linear-gradient(135deg, rgba(30,30,30,0.8), rgba(25,25,25,0.7))'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.4))'
                    : isDark
                        ? 'linear-gradient(135deg, rgba(40,40,40,0.75), rgba(30,30,30,0.65))'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.65), rgba(255,255,255,0.45))',
                boxShadow: hovered
                    ? '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.08)'
                    : '0 4px 20px rgba(0,0,0,0.10), 0 0 0 1px rgba(255,255,255,0.06)',
                transition: 'background 0.3s ease, box-shadow 0.3s ease',
            }}
            aria-label="AI 助手"
        >
            <AnimatePresence mode="wait">
                {open ? (
                    <motion.div
                        key="open"
                        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                        <Bot
                            size={22}
                            className="text-blue-500 dark:text-blue-400"
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="closed"
                        initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                        <Bot
                            size={22}
                            className="text-zinc-600 dark:text-zinc-300"
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active ring — subtle blue border, NO glow, NO gradient */}
            <AnimatePresence>
                {open && (
                    <motion.span
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="absolute inset-[-4px] rounded-full
                                   border-[2px] border-blue-400/30 dark:border-blue-500/25"
                        style={{ pointerEvents: 'none' }}
                    />
                )}
            </AnimatePresence>

            {/* Hover tooltip — positioned above, arrow points down-right */}
            <AnimatePresence>
                {hovered && !open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute bottom-full mb-3
                                   right-0
                                   px-2.5 py-1.5 rounded-lg
                                   text-xs font-medium whitespace-nowrap
                                   bg-zinc-800/90 dark:bg-zinc-100/90
                                   text-white dark:text-zinc-900
                                   shadow-lg backdrop-blur-sm
                                   pointer-events-none"
                    >
                        AI 助手
                        {/* Arrow: points down-right toward the FAB */}
                        <span
                            className="absolute top-full right-[18px] w-0 h-0
                                       border-l-[5px] border-l-transparent
                                       border-r-[5px] border-r-transparent
                                       border-t-[5px]
                                       border-t-zinc-800/90 dark:border-t-zinc-100/90"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
}
