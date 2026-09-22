import { useCallback, useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Cpu } from 'lucide-react';

const DRAG_THRESHOLD = 5;

export function DotnetFAB(): ReactNode {
  const navigate = useNavigate();

  // 拖拽状态
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const didDragRef = useRef(false);
  const [hint, setHint] = useState(false);

  // 鼠标悬停显示提示
  useEffect(() => {
    const show = () => setHint(true);
    const hide = () => setHint(false);
    const el = document.getElementById('dotnet-fab');
    if (!el) return;
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    return () => {
      el.removeEventListener('mouseenter', show);
      el.removeEventListener('mouseleave', hide);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const origX = pos.x === -1 ? window.innerWidth - 24 - 56 : pos.x;
      const origY = pos.y === -1 ? window.innerHeight - 24 - 56 : pos.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY, origX, origY };
      didDragRef.current = false;

      const onMouseMove = (me: MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = me.clientX - dragStartRef.current.x;
        const dy = me.clientY - dragStartRef.current.y;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          didDragRef.current = true;
          isDraggingRef.current = true;
          document.body.style.userSelect = 'none';
        }
        if (isDraggingRef.current) {
          setPos({ x: dragStartRef.current.origX + dx, y: dragStartRef.current.origY + dy });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        isDraggingRef.current = false;
        dragStartRef.current = null;
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [pos],
  );

  const handleClick = useCallback(() => {
    if (didDragRef.current) return;
    navigate('/dotnet');
  }, [navigate]);

  const fabStyle: React.CSSProperties =
    pos.x !== -1
      ? { left: pos.x, top: pos.y, position: 'fixed' as const }
      : { right: 24, bottom: 24, position: 'fixed' as const };

  return (
    <div id="dotnet-fab" style={fabStyle} className="z-[35]" onMouseDown={handleMouseDown}>
      <motion.div
        className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
      >
        <Cpu className="w-6 h-6" />
      </motion.div>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 pointer-events-none"
          >
            .NET Bridge
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
