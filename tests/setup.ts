import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom 缺少浏览器原生能力：matchMedia / WAAPI / scrollIntoView / visibilityState。
 * 这里提供可被单个测试覆盖的默认实现，避免每个用例重复造轮子。
 * node 环境（主进程纯逻辑测试）没有 window / document，需整块跳过。
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });

  if (typeof Element.prototype.animate !== 'function') {
    Element.prototype.animate = vi.fn(
      () => ({ cancel: () => {}, finished: Promise.resolve() }) as unknown as Animation,
    );
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = vi.fn();
  }

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
    localStorage.clear();
  });
} else {
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
