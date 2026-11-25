import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '../../src/renderer/src/stores/themeStore';

function mockMatchMedia(reducedMotion = false): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes('reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function mockSettingsApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      settings: {
        get: vi.fn(async () => null),
        set: vi.fn(async () => undefined),
      },
    },
  });
}

describe('主题切换 store', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    mockSettingsApi();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
  });

  it('减少动态偏好下不走 View Transition，直接落主题并持久化', async () => {
    mockMatchMedia(true);
    const startViewTransition = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    await useThemeStore.getState().setTheme('dark', { x: 40, y: 60 });

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.api.settings.set).toHaveBeenCalledWith('theme', 'dark');
  });

  it('有点击起点时只动画新快照，并临时补目标主题底色', async () => {
    const animate = vi.fn();
    document.documentElement.animate = animate as unknown as typeof Element.prototype.animate;

    let backgroundInSnapshot = '';
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      backgroundInSnapshot = document.documentElement.style.background;
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {},
      };
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    await useThemeStore.getState().setTheme('dark', { x: 10, y: 20 });

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(backgroundInSnapshot).toMatch(/#0d0d14|rgb\(13, 13, 20\)/);
    await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes.clipPath[0]).toBe('circle(0px at 10px 20px)');
    expect(options.pseudoElement).toBe('::view-transition-new(root)');
    expect(options.duration).toBe(420);
  });

  it('系统主题自动变化（无起点）走轻量降级路径', async () => {
    await useThemeStore.getState().setTheme('system');

    expect(useThemeStore.getState().theme).toBe('system');
    expect(window.api.settings.set).toHaveBeenCalledWith('theme', 'system');
  });
});
