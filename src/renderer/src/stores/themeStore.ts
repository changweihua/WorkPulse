import { create } from 'zustand';
import type { TranslationKey } from '../lib/i18n';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'indigo' | 'violet' | 'cyan' | 'emerald' | 'orange' | 'rose';

/** 主题切换扩散动画的起点，取自点击事件的 clientX / clientY */
export interface ThemeSwitchOrigin {
  x: number;
  y: number;
}

export const ACCENTS: { id: Accent; color: string; labelKey: TranslationKey }[] = [
  { id: 'blue', color: '#3b82f6', labelKey: 'settings.accentBlue' },
  { id: 'indigo', color: '#6366f1', labelKey: 'settings.accentIndigo' },
  { id: 'violet', color: '#a855f7', labelKey: 'settings.accentViolet' },
  { id: 'cyan', color: '#06b6d4', labelKey: 'settings.accentCyan' },
  { id: 'emerald', color: '#10b981', labelKey: 'settings.accentEmerald' },
  { id: 'orange', color: '#f97316', labelKey: 'settings.accentOrange' },
  { id: 'rose', color: '#f43f5e', labelKey: 'settings.accentRose' },
];

interface ThemeStore {
  theme: Theme;
  accent: Accent;
  setTheme: (theme: Theme, origin?: ThemeSwitchOrigin) => Promise<void>;
  setAccent: (accent: Accent) => Promise<void>;
  init: () => Promise<void>;
}

const REVEAL_CLASS = 'theme-reveal';
const FALLBACK_CLASS = 'theme-transition';
const REVEAL_DURATION = 420;

let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
let revealToken = 0;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearRevealStyles(): void {
  document.documentElement.style.removeProperty('background');
  document.documentElement.classList.remove(REVEAL_CLASS);
}

function applyTheme(theme: Theme): boolean {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  return isDark;
}

/** 无点击起点 / 不支持 View Transition 时的 300ms 颜色过渡降级 */
function applyThemeWithFallback(theme: Theme): void {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  if (!prefersReducedMotion()) {
    document.documentElement.classList.add(FALLBACK_CLASS);
    fallbackTimer = setTimeout(() => {
      document.documentElement.classList.remove(FALLBACK_CLASS);
      fallbackTimer = undefined;
    }, 350);
  }
  applyTheme(theme);
}

/**
 * 从点击位置扩散新主题快照。
 * 只动画 ::view-transition-new(root)，旧快照保持静止；
 * 新快照临时补目标主题底色，避免透明根容器让扩散只剩文字变色。
 */
function applyThemeWithReveal(
  theme: Theme,
  origin: ThemeSwitchOrigin,
  onUpdated: () => void,
): void {
  const root = document.documentElement;
  const { x, y } = origin;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const token = ++revealToken;

  root.classList.add(REVEAL_CLASS);

  const transition = document.startViewTransition(() => {
    const isDark = applyTheme(theme);
    root.style.background = isDark ? '#0d0d14' : '#eef4ff';
    onUpdated();
  });

  transition.ready
    .then(() => {
      if (token !== revealToken) return;
      root.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
        },
        {
          duration: REVEAL_DURATION,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // 过渡被浏览器跳过时 DOM 已完成切换，这里不阻断主题更新
    });

  transition.finished
    .finally(() => {
      if (token !== revealToken) return;
      clearRevealStyles();
    })
    .catch(() => {
      // finished 仅在 updateCallback 失败时拒绝；主题更新已失败时仍要清理
      if (token === revealToken) clearRevealStyles();
    });
}

function applyAccent(accent: Accent): void {
  if (accent === 'blue') {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
}

export const useThemeStore = create<ThemeStore>()((set) => ({
  theme: 'system',
  accent: 'blue',

  setTheme: async (theme: Theme, origin?: ThemeSwitchOrigin) => {
    if (
      origin &&
      typeof document.startViewTransition === 'function' &&
      !prefersReducedMotion() &&
      document.visibilityState !== 'hidden'
    ) {
      applyThemeWithReveal(theme, origin, () => set({ theme }));
    } else {
      revealToken++;
      clearRevealStyles();
      applyThemeWithFallback(theme);
      set({ theme });
    }

    await window.api.settings.set('theme', theme);
  },

  setAccent: async (accent: Accent) => {
    applyAccent(accent);
    set({ accent });
    await window.api.settings.set('ui_accent', accent);
  },

  init: async () => {
    const saved = (await window.api.settings.get('theme')) as Theme | null;
    const theme = saved || 'system';
    applyTheme(theme);
    set({ theme });

    const savedAccent = (await window.api.settings.get('ui_accent')) as Accent | null;
    const accent = savedAccent || 'blue';
    applyAccent(accent);
    set({ accent });

    // Listen for OS theme changes when using 'system'
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = useThemeStore.getState().theme;
      if (current === 'system') {
        revealToken++;
        clearRevealStyles();
        applyThemeWithFallback('system');
      }
    });
  },
}));
