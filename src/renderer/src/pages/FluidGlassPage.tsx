import { useState } from 'react'
import FluidGlass from '../components/FluidGlass'
import { useI18n } from '../stores/languageStore'

type Mode = 'lens' | 'cube' | 'bar'

const MODES: { key: Mode; label: string; desc: string }[] = [
  { key: 'lens', label: 'Lens', desc: '球形透镜，跟随鼠标' },
  { key: 'cube', label: 'Cube', desc: '立方体透镜，跟随鼠标' },
  { key: 'bar', label: 'Bar', desc: '底部导航栏，固定位置' },
]

export default function FluidGlassPage() {
  const [mode, setMode] = useState<Mode>('lens')
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-zinc-200/40 dark:border-zinc-700/40">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t('nav.fluidGlass') || '液态玻璃'}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Liquid Glass — Three.js + R3F + MeshTransmissionMaterial
        </p>

        {/* Mode selector */}
        <div className="flex gap-2 mt-3">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  mode === m.key
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/60 dark:hover:bg-white/10'
                }
              `}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
          {MODES.find((m) => m.key === mode)?.desc}
        </p>
      </div>

      {/* FluidGlass canvas — fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        <FluidGlass
          key={mode}
          mode={mode}
          backgroundColor="#0a0a12"
          textColor="#e5e7eb"
        />

        {/* Hint overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
                        px-3 py-1.5 rounded-full text-xs
                        bg-black/50 text-white/70 backdrop-blur-sm pointer-events-none">
          滚动浏览内容 · 移动鼠标观察折射效果
        </div>
      </div>
    </div>
  )
}
