import { create } from 'zustand'
import type { TranslationKey } from '../lib/i18n'

export type Theme = 'light' | 'dark' | 'system'
export type Accent = 'blue' | 'indigo' | 'violet' | 'cyan' | 'emerald' | 'orange' | 'rose'

export const ACCENTS: { id: Accent; color: string; labelKey: TranslationKey }[] = [
  { id: 'blue', color: '#3b82f6', labelKey: 'settings.accentBlue' },
  { id: 'indigo', color: '#6366f1', labelKey: 'settings.accentIndigo' },
  { id: 'violet', color: '#a855f7', labelKey: 'settings.accentViolet' },
  { id: 'cyan', color: '#06b6d4', labelKey: 'settings.accentCyan' },
  { id: 'emerald', color: '#10b981', labelKey: 'settings.accentEmerald' },
  { id: 'orange', color: '#f97316', labelKey: 'settings.accentOrange' },
  { id: 'rose', color: '#f43f5e', labelKey: 'settings.accentRose' }
]

interface ThemeStore {
  theme: Theme
  accent: Accent
  setTheme: (theme: Theme) => Promise<void>
  setAccent: (accent: Accent) => Promise<void>
  init: () => Promise<void>
}

function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  document.documentElement.classList.toggle('dark', isDark)
}

function applyAccent(accent: Accent): void {
  if (accent === 'blue') {
    delete document.documentElement.dataset.accent
  } else {
    document.documentElement.dataset.accent = accent
  }
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'system',
  accent: 'blue',

  setTheme: async (theme: Theme) => {
    applyTheme(theme)
    set({ theme })
    await window.api.settings.set('theme', theme)
  },

  setAccent: async (accent: Accent) => {
    applyAccent(accent)
    set({ accent })
    await window.api.settings.set('ui_accent', accent)
  },

  init: async () => {
    const saved = (await window.api.settings.get('theme')) as Theme | null
    const theme = saved || 'system'
    applyTheme(theme)
    set({ theme })

    const savedAccent = (await window.api.settings.get('ui_accent')) as Accent | null
    const accent = savedAccent || 'blue'
    applyAccent(accent)
    set({ accent })

    // Listen for OS theme changes when using 'system'
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = useThemeStore.getState().theme
      if (current === 'system') applyTheme('system')
    })
  }
}))
