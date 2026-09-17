import { useState, type ReactNode } from 'react'
import { Cpu, HardDrive, Hash, FileCode, Loader2, Play } from 'lucide-react'
import { useToast } from '../components/Toast'
import { useI18n } from '../stores/languageStore'

type TabKey = 'system' | 'performance' | 'hash'

const TABS: { key: TabKey; icon: ReactNode; label: string }[] = [
  { key: 'system', icon: <Cpu className="w-4 h-4" />, label: 'System Info' },
  { key: 'performance', icon: <HardDrive className="w-4 h-4" />, label: 'Performance' },
  { key: 'hash', icon: <Hash className="w-4 h-4" />, label: 'Hash' },
]

const HASH_ALGORITHMS = ['SHA256', 'SHA1', 'SHA384', 'SHA512', 'MD5']

function DotnetBridgePage(): ReactNode {
  const [tab, setTab] = useState<TabKey>('system')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [hashInput, setHashInput] = useState('')
  const [hashMode, setHashMode] = useState<'text' | 'file'>('text')
  const [hashAlgo, setHashAlgo] = useState('SHA256')
  const toast = useToast()
  const { t } = useI18n()

  const invoke = async (method: string, ...args: unknown[]): Promise<void> => {
    setLoading(true)
    setResult(null)
    try {
      const res = await window.api.dotnet.invoke(method, ...args)
      setResult(String(res))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setResult(`Error: ${msg}`)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRun = (): void => {
    switch (tab) {
      case 'system':
        invoke('getSystemInfo')
        break
      case 'performance':
        invoke('getPerformanceInfo')
        break
      case 'hash':
        if (!hashInput.trim()) {
          toast.error('Please enter input')
          return
        }
        if (hashMode === 'text') {
          invoke('computeHash', hashInput, hashAlgo)
        } else {
          invoke('computeFileHash', hashInput, hashAlgo)
        }
        break
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
          .NET Bridge
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {t('dotnet.subtitle')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 surface-card rounded-xl border border-[var(--color-border)]">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => { setTab(item.key); setResult(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              tab === item.key
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="surface-card rounded-xl border border-[var(--color-border)] p-5 space-y-4">
        {/* System Info / Performance — 一键查询 */}
        {(tab === 'system' || tab === 'performance') && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tab === 'system' ? t('dotnet.systemDesc') : t('dotnet.perfDesc')}
          </p>
        )}

        {/* Hash tab — 输入区域 */}
        {tab === 'hash' && (
          <div className="space-y-3">
            {/* text / file 切换 */}
            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-700/50 rounded-lg">
              <button
                onClick={() => setHashMode('text')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  hashMode === 'text'
                    ? 'bg-zinc-50 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                {t('dotnet.textHash')}
              </button>
              <button
                onClick={() => setHashMode('file')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  hashMode === 'file'
                    ? 'bg-zinc-50 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                {t('dotnet.fileHash')}
              </button>
            </div>

            {/* 输入框 */}
            <input
              type="text"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRun()}
              placeholder={hashMode === 'text' ? t('dotnet.hashTextPlaceholder') : t('dotnet.hashFilePlaceholder')}
              className="w-full px-4 py-2.5 text-sm border border-[var(--color-border)] rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800 surface-input dark:text-zinc-100"
            />

            {/* 算法选择 */}
            <div className="flex flex-wrap gap-2">
              {HASH_ALGORITHMS.map((algo) => (
                <button
                  key={algo}
                  onClick={() => setHashAlgo(algo)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    hashAlgo === algo
                      ? 'bg-purple-500 text-white'
                      : 'surface-card border border-[var(--color-border)] text-zinc-500 dark:text-zinc-400 hover:border-purple-300'
                  }`}
                >
                  {algo}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Run 按钮 */}
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {loading ? t('common.loading') : t('dotnet.run')}
        </button>
      </div>

      {/* 结果 */}
      {result && (
        <div className="surface-card rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">Result</p>
          <pre className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-all font-mono bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 max-h-64 overflow-auto">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}

export default DotnetBridgePage
