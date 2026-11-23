/* ============================================================
   useLiquidGlass —— 悬浮窗液态玻璃的鼠标跟随高光与流光启停
   ------------------------------------------------------------
   只写 CSS 自定义属性（--lg-mx / --lg-my / --lg-glow / --lg-flow-state），由
   floating-liquid-glass.css 的 @property + transition 完成插值与
   果冻跟随。全程不碰 React state、不碰 transform/backdrop-filter：
     - state 写入会让径向菜单展开动画期重渲染 → 掉帧（见 RadialMenu
       的「展开卡顿修复」），所以位置走 ref 直写 DOM。
     - transform 在 filter 祖先链上会把 LCD 次像素文字降级为灰度
       抗锯齿（C9），所以跟随只 repaint 高光伪元素。
     - 流光默认 paused；--lg-flow-state 与 glow 同源写入，鼠标离开即
       定格当前相位，静止时零动画开销（DeepSeek 式「hover 才流动」）。

   三个坐标入口：
     - writeLiquidSpot      视口坐标（clientX/Y）→ Touch Bar DOM 事件
     - writeLiquidSpotLocal 窗口局部坐标 → 径向菜单主进程轮询
     - writeLiquidSpotPct   百分比 → 底层通用
   ============================================================ */

import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

/** 系统开启「减少动态」或「减少透明度」时不做跟随（CSS 侧也已降级饰面） */
let motionQuery: MediaQueryList | null = null;
function glassInteractive(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  if (!motionQuery) {
    motionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)',
    );
  }
  return !motionQuery.matches;
}

function clampPct(v: number): string {
  return `${Math.max(0, Math.min(100, v))}%`;
}

/** 底层：直接写百分比坐标。glow=0 时高光淡出（位置保留，回归时无跳变）。
 *  同一路信号兼作流光开关：glow>0 时 --lg-flow-state=running 唤醒流光，
 *  glow=0 时 paused 定格当前相位（不跳回起点，避免可见的回位跳变）。 */
export function writeLiquidSpotPct(
  el: HTMLElement | null,
  xPct: number,
  yPct: number,
  glow = 1,
): void {
  if (!el || !glassInteractive()) return;
  el.style.setProperty('--lg-mx', clampPct(xPct));
  el.style.setProperty('--lg-my', clampPct(yPct));
  el.style.setProperty('--lg-glow', String(glow));
  el.style.setProperty('--lg-flow-state', glow > 0 ? 'running' : 'paused');
}

/** 窗口局部坐标（径向菜单：radial:cursor 的 info.x/info.y，原点在窗口左上）。
 *  透明窗无边框、无滚动 → getBoundingClientRect 相对视口 = 相对窗口，
 *  与 info.x/info.y 同一坐标系。不能改用 offsetLeft：径向盘的 offsetParent
 *  是 absolute 的父 motion.div，offsetLeft 会是 0 而非盘在窗口里的真实偏移。 */
export function writeLiquidSpotLocal(
  el: HTMLElement | null,
  localX: number,
  localY: number,
  glow = 1,
): void {
  writeLiquidSpot(el, localX, localY, glow);
}

/** 视口坐标（Touch Bar：DOM 事件的 clientX/clientY）。 */
export function writeLiquidSpot(
  el: HTMLElement | null,
  clientX: number,
  clientY: number,
  glow = 1,
): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  writeLiquidSpotPct(
    el,
    ((clientX - rect.left) / rect.width) * 100,
    ((clientY - rect.top) / rect.height) * 100,
    glow,
  );
}

/** 把高光淡出（位置保留）。鼠标离开悬浮窗时调用；不调用也无害（窗口会淡出关闭）。
 *  同时停掉流光：离开即静止，与跟随高光的 0.32s 淡出同步。 */
export function fadeLiquidSpot(el: HTMLElement | null): void {
  if (!el || !glassInteractive()) return;
  el.style.setProperty('--lg-glow', '0');
  el.style.setProperty('--lg-flow-state', 'paused');
}

/**
 * Touch Bar 面板 / 悬停卡片用：返回 ref 与 rAF 节流的 onMouseMove。
 * - 一帧最多写一次 DOM，连续 mousemove 只保留最后位置。
 * - getBoundingClientRect 在 rAF 回调里读，避免每次原生事件同步触发布局。
 */
export function useLiquidGlass<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    writeLiquidSpot(ref.current, p.x, p.y, 1);
  }, []);

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<T>) => {
      if (!glassInteractive()) return;
      pendingRef.current = { x: e.clientX, y: e.clientY };
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const onMouseLeave = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
    fadeLiquidSpot(ref.current);
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { ref, onMouseMove, onMouseLeave };
}
