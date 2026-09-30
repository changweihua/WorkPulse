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
  deps: React.DependencyList = [],
) {
  const cbRef = useRef(callback);
  // 回调同步移出 render：在 effect 中更新 ref，避免 render 期间访问 ref.current
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const idRef = useRef<number>(0);
  const depsRef = useRef<React.DependencyList | null>(null);

  const wrappedCb = (deadline: IdleDeadline) => {
    cbRef.current(deadline);
  };

  // 依赖不能作为第二参数直接传入（会被 exhaustive-deps 判定为非数组字面量），
  // 改为每次渲染后手动做浅比较（逐项 Object.is），与 React 依赖数组的比较语义完全一致：
  // 仅当 deps 变化时才取消旧的空闲回调并重新调度。
  useEffect(() => {
    const prev = depsRef.current;
    const changed =
      prev === null || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]));
    depsRef.current = deps;
    if (!changed) return;
    cancelIdle(idRef.current);
    idRef.current = requestIdle(wrappedCb, { timeout: 200 });
  });

  // 组件卸载时取消尚未执行的空闲回调
  useEffect(() => {
    return () => cancelIdle(idRef.current);
  }, []);
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
      try {
        task.fn();
      } catch (e) {
        console.error('[useIdleCallback] task error:', e);
      }
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
