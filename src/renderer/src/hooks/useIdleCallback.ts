// src/renderer/src/hooks/useIdleCallback.ts
import { useEffect, useRef } from 'react';

/**
 * requestIdleCallback 封装，带 Safari / 不支持环境的 setTimeout fallback。
 *
 * 用法：
 *   useIdleCallback((deadline) => {
 *     while (deadline.timeRemaining() > 0 && queue.length > 0) {
 *       processItem(queue.shift()!)
 *     }
 *   }, [deps])
 *
 * 或配合 runWhenIdle 工具函数在组件外使用。
 */

// ---------- polyfill ----------
const _ric: typeof requestIdleCallback | undefined =
  typeof window !== 'undefined' ? (window as any).requestIdleCallback : undefined;

const requestIdle: (cb: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => number =
  _ric
    ? _ric.bind(window)
    : (cb, opts) => {
        const start = Date.now();
        return setTimeout(() => {
          cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          });
        }, opts?.timeout ?? 1) as unknown as number;
      };

const _cid: typeof cancelIdleCallback | undefined =
  typeof window !== 'undefined' ? (window as any).cancelIdleCallback : undefined;

const cancelIdle: (id: number) => void = _cid ? _cid.bind(window) : (id) => clearTimeout(id);

// ---------- hook ----------
export function useIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  deps: React.DependencyList = []
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const idRef = useRef<number>(0);

  useEffect(() => {
    const wrappedCb = (deadline: IdleDeadline) => {
      cbRef.current(deadline);
    };

    idRef.current = requestIdle(wrappedCb, { timeout: 200 });
    return () => cancelIdle(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------- 工具函数（组件外也可用） ----------
export interface IdleTask {
  fn: () => void;
  priority?: number; // 越大越优先
}

/**
 * 在浏览器空闲时依次执行任务队列。
 * 返回 cancel 函数用于清理。
 */
export function runWhenIdle(tasks: IdleTask[], opts?: { timeout?: number }): () => void {
  const queue = [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let cancelled = false;
  let id = 0;

  const processChunk = (deadline: IdleDeadline) => {
    if (cancelled) return;
    while (queue.length > 0 && deadline.timeRemaining() > 0) {
      const task = queue.shift()!;
      try { task.fn(); } catch (e) { console.error('[useIdleCallback] task error:', e); }
    }
    if (queue.length > 0) {
      id = requestIdle(processChunk, opts);
    }
  };

  id = requestIdle(processChunk, opts);

  return () => {
    cancelled = true;
    cancelIdle(id);
  };
}
