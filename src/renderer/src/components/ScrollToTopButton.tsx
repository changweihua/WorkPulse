import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';

const SCROLL_THRESHOLD = 300;

export function ScrollToTopButton({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
}): ReactNode {
  const [show, setShow] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setShow(el.scrollTop > SCROLL_THRESHOLD);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [scrollRef]);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="scroll-to-top"
          onClick={scrollToTop}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="fixed bottom-[88px] right-6 z-[35] w-14 h-14 rounded-full
                               flex items-center justify-center cursor-pointer
                               bg-gradient-to-br from-blue-500 to-purple-600
                               text-white shadow-lg hover:shadow-xl transition-shadow"
          aria-label="返回顶部"
        >
          <ArrowUp className="w-6 h-6" />

          {/* Tooltip */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute bottom-full mb-3 right-0
                                           px-3 py-1.5 rounded-lg
                                           text-xs font-medium whitespace-nowrap
                                           pointer-events-none
                                           text-zinc-700 dark:text-zinc-200
                                           bg-white dark:bg-zinc-800
                                           border border-zinc-200 dark:border-zinc-700
                                           shadow-lg"
              >
                返回顶部
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
