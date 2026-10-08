/**
 * AIFloatingButton — 全局浮动 AI 助手按钮。
 * 固定定位，支持拖拽和 localStorage 持久化。
 * 通过 aiPanelStore 切换 AIChatPanel。
 *
 * Liquid Glass 美学 — 多色渐变呼吸动画、毛玻璃表面、
 * violet→blue→cyan 发光阴影、径向图标光晕、玻璃 tooltip。
 *
 * 与"返回顶部"按钮自动避让：两者分属不同布局树、无共享 store，
 * 这里通过 DOM 查询对方的实际 getBoundingClientRect 判定矩形重叠，
 * 重叠时朝"位移最小的边缘方向"平滑让位，对方消失后回到用户原位置。
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
/** 避让后与"返回顶部"按钮之间保留的最小视觉间隙（px） */
const AVOID_GAP = 8;
/** 避让重算的跟随窗口时长（ms）— 覆盖对方按钮入场/退场的弹簧动画 */
const SETTLE_MS = 800;
/** 用无障碍标签定位"返回顶部"按钮：跨布局树零侵入，无需修改对方组件 */
const SCROLL_TOP_SELECTOR = '[aria-label="返回顶部"]';

/** 避让偏移量，坐标系与 position 相同：bottom / right 均为距视口边缘的距离 */
type Offset = { bottom: number; right: number };
const ZERO_OFFSET: Offset = { bottom: 0, right: 0 };

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

/**
 * 计算避让偏移量：返回值加到用户位置（position）上即为显示位置。
 *
 * 策略 —— "往边缘调整"：分别求出上 / 下 / 左 / 右四个方向上
 * 刚好能与对方分离所需的位移，剔除会让本按钮越出视口
 * （保留 GAP 边距）的方向，剩下方向里取位移最小的那个，
 * 即朝最近的边缘推开。对方矩形向外扩 AVOID_GAP，保证留有间隙。
 *
 * @param pos   用户位置（距底 / 距右坐标）
 * @param other "返回顶部"按钮的视口矩形
 */
function computeAvoidOffset(pos: { bottom: number; right: number }, other: DOMRect): Offset {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = FAB_SIZE;
  const clampBottom = (v: number) => Math.max(GAP, Math.min(v, vh - FAB_SIZE - GAP));
  const clampRight = (v: number) => Math.max(GAP, Math.min(v, vw - FAB_SIZE - GAP));

  // 对方矩形换算成"距右 / 距底"坐标，并向外扩 AVOID_GAP
  const oRightNear = vw - other.right - AVOID_GAP; // 靠右边界
  const oRightFar = vw - other.left + AVOID_GAP; // 靠左边界
  const oBottomNear = vh - other.bottom - AVOID_GAP; // 靠下边界
  const oBottomFar = vh - other.top + AVOID_GAP; // 靠上边界

  const { bottom: b, right: r } = pos;
  // 两个轴向都相交才算真正重叠
  const overlap = r + s > oRightNear && r < oRightFar && b + s > oBottomNear && b < oBottomFar;
  if (!overlap) return ZERO_OFFSET;

  // 四个方向：目标位置 + 该目标能否真正分离（clamp 后仍满足条件才算有效）
  const sepB = clampBottom(oBottomFar); // 上：bottom 抬到对方上边缘之外
  const dnB = clampBottom(oBottomNear - s); // 下：bottom 压到对方下边缘之外
  const lfR = clampRight(oRightFar); // 左：right 退到对方左边缘之外
  const rtR = clampRight(oRightNear - s); // 右：right 越过对方右边缘
  const moves: Array<{ off: Offset; cost: number; ok: boolean }> = [
    { off: { bottom: sepB - b, right: 0 }, cost: Math.abs(sepB - b), ok: sepB >= oBottomFar },
    { off: { bottom: dnB - b, right: 0 }, cost: Math.abs(dnB - b), ok: dnB + s <= oBottomNear },
    { off: { bottom: 0, right: lfR - r }, cost: Math.abs(lfR - r), ok: lfR >= oRightFar },
    { off: { bottom: 0, right: rtR - r }, cost: Math.abs(rtR - r), ok: rtR + s <= oRightNear },
  ];

  const separable = moves.filter((m) => m.ok);
  // 兜底：视口极小时四个方向都可能失效，此时至少贴住位移最小的边
  const pool = separable.length > 0 ? separable : moves;
  pool.sort((x, y) => x.cost - y.cost);
  return pool[0].off;
}

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
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
      : false,
  );

  // ── Drag state ──
  const [position, setPosition] = useState<{ bottom: number; right: number }>(
    () => loadSavedPosition() || { bottom: GAP + 80, right: GAP },
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ── 避让状态：显示位置 = 用户位置(position) + 避让偏移(avoid) ──
  // position 是"用户位置"，唯一写入 localStorage 的来源；
  // avoid 是纯显示层偏移，对方按钮消失后归零即可回到用户原位置。
  const [avoid, setAvoid] = useState<Offset>(ZERO_OFFSET);
  const positionRef = useRef(position); // 供事件回调同步读取最终位置
  const isDraggingRef = useRef(false); // 拖拽期间冻结避让，按钮始终跟随光标
  const settleRafRef = useRef<number | null>(null); // 避让跟随窗口的 rAF 句柄
  const otherPresentRef = useRef(false); // 对方按钮当前是否在 DOM 中

  // 用户位置同步到 ref：mouseup 等事件闭包读到的一定是最新值
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  /** 取当前应生效的避让偏移（基于用户位置与对方按钮的实际矩形） */
  const getAvoidance = useCallback((): Offset => {
    // 不以自身 ref 是否挂载为条件：按钮重挂载（popKey 变化）的瞬间
    // ref 可能短暂为 null，避让状态不应因此被清空造成闪烁
    const other = document.querySelector<HTMLElement>(SCROLL_TOP_SELECTOR);
    if (!other || !other.isConnected) return ZERO_OFFSET;
    return computeAvoidOffset(positionRef.current, other.getBoundingClientRect());
  }, []);

  /** 重算避让：值不变时跳过 setState，避免无意义的重渲染 */
  const recomputeAvoidance = useCallback(() => {
    if (isDraggingRef.current) return; // 拖拽中冻结，防止按钮"从光标下逃跑"
    const next = getAvoidance();
    setAvoid((prev) => (prev.bottom === next.bottom && prev.right === next.right ? prev : next));
  }, [getAvoidance]);

  /**
   * 触发避让重算，并在 SETTLE_MS 窗口内逐帧跟随对方按钮的
   * 入场 / 退场弹簧动画（它的 getBoundingClientRect 在动画中是变化的）。
   * 重算只读取"目标位置"而非自身动画中的矩形，因此不会自激震荡。
   */
  const scheduleAvoidance = useCallback(() => {
    recomputeAvoidance();
    if (settleRafRef.current !== null) cancelAnimationFrame(settleRafRef.current);
    const start = performance.now();
    const tick = () => {
      recomputeAvoidance();
      if (performance.now() - start < SETTLE_MS) {
        settleRafRef.current = requestAnimationFrame(tick);
      } else {
        settleRafRef.current = null;
      }
    };
    settleRafRef.current = requestAnimationFrame(tick);
  }, [recomputeAvoidance]);

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
    // 初始值已在 useState 初始化器中按同一媒体查询求得，这里只监听后续变化
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── 避让检测：跨布局树的轻量通信 ──
  // 对方按钮的显隐由它自己的 scroll 状态 + AnimatePresence 控制，
  // 这里用 MutationObserver 感知其挂载 / 卸载，只在"出现状态变化"时重算，
  // 避免 DOM 频繁变动（如消息流渲染）反复唤醒重算。
  useEffect(() => {
    if (isMobile) return;
    const observer = new MutationObserver(() => {
      const present = document.querySelector(SCROLL_TOP_SELECTOR) !== null;
      if (present !== otherPresentRef.current) {
        otherPresentRef.current = present;
        scheduleAvoidance();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleAvoidance);
    otherPresentRef.current = document.querySelector(SCROLL_TOP_SELECTOR) !== null;
    scheduleAvoidance(); // 初始：进入页面时对方按钮可能已经存在
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleAvoidance);
      if (settleRafRef.current !== null) cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = null;
    };
  }, [isMobile, scheduleAvoidance]);

  // ── Drag handlers ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isDraggingRef.current = true; // 冻结避让：按下后按钮完全跟随光标
      // 把当前避让偏移折叠进用户位置：视觉零跳变，
      // 之后拖到哪、松手就存哪 —— 避让偏移本身永远不写 localStorage。
      let base = position;
      if (avoid.bottom !== 0 || avoid.right !== 0) {
        base = { bottom: position.bottom + avoid.bottom, right: position.right + avoid.right };
        positionRef.current = base;
        setPosition(base);
        setAvoid(ZERO_OFFSET);
      }
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: base.right,
        posY: base.bottom,
      };
      hasDraggedRef.current = false;
    },
    [position, avoid],
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
    const next = {
      right: Math.max(GAP, Math.min(dragStartRef.current.posX - dx, vw - FAB_SIZE - GAP)),
      bottom: Math.max(GAP, Math.min(dragStartRef.current.posY - dy, vh - FAB_SIZE - GAP)),
    };
    positionRef.current = next; // 同步进 ref，mouseup 读到的一定是最终落点
    setPosition(next);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!dragStartRef.current) return;
    const wasDragging = hasDraggedRef.current;
    dragStartRef.current = null;
    isDraggingRef.current = false; // 解冻避让
    if (wasDragging) {
      try {
        // 只持久化用户位置（= 松手时看到的位置）
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positionRef.current));
      } catch {
        /* ignore */
      }
      setTimeout(() => setIsDragging(false), 50);
    }
    // 松手后重新评估：新落点若仍与"返回顶部"重叠，则平滑滑开
    scheduleAvoidance();
  }, [scheduleAvoidance]);

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
          // 显示位置 = 用户位置 + 避让偏移（避让不改变用户位置本身）
          bottom: position.bottom + avoid.bottom,
          right: position.right + avoid.right,
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
