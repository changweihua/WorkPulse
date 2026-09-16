import { useState, useRef, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Cpu, HardDrive, Hash, FileCode, X, Loader2 } from 'lucide-react'

interface FabAction {
  key: string
  icon: ReactNode
  label: string
  color: string
}

const ACTIONS: FabAction[] = [
  { key: 'system', icon: <Cpu className="w-4 h-4" />, label: 'System Info', color: 'bg-blue-500 hover:bg-blue-600' },
  { key: 'perf', icon: <HardDrive className="w-4 h-4" />, label: 'Performance', color: 'bg-green-500 hover:bg-green-600' },
  { key: 'hash-text', icon: <Hash className="w-4 h-4" />, label: 'Hash Text', color: 'bg-purple-500 hover:bg-purple-600' },
  { key: 'hash-file', icon: <FileCode className="w-4 h-4" />, label: 'Hash File', color: 'bg-orange-500 hover:bg-orange-600' },
]

export function DotnetFAB(): ReactNode {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [hashInput, setHashInput] = useState('')
  const [showHashInput, setShowHashInput] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowHashInput(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleAction = async (key: string): Promise<void> => {
    if (key === 'hash-text') {
      setPendingAction(key)
      setShowHashInput(true)
      return
    }
    if (key === 'hash-file') {
      setPendingAction(key)
      setShowHashInput(true)
      return
    }

    setLoading(true)
    setResult(null)
    try {
      let res: string | number
      switch (key) {
        case 'system':
          res = await window.api.dotnet.invoke('getSystemInfo')
          break
        case 'perf':
          res = await window.api.dotnet.invoke('getPerformanceInfo')
          break
        default:
          res = 'Unknown action'
      }
      setResult(String(res))
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleHashSubmit = async (): Promise<void> => {
    if (!hashInput.trim()) return
    setLoading(true)
    setResult(null)
    try {
      let res: string | number
      if (pendingAction === 'hash-text') {
        res = await window.api.dotnet.invoke('computeHash', hashInput, 'SHA256')
      } else {
        res = await window.api.dotnet.invoke('computeFileHash', hashInput, 'SHA256')
      }
      setResult(String(res))
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
      setShowHashInput(false)
      setHashInput('')
      setPendingAction(null)
    }
  }

  return (
    <>
      {/* FAB 主按钮 */}
      <motion.button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div key="dotnet" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <span className="text-lg font-bold">.N</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* 展开菜单 */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="fixed bottom-22 right-6 z-50 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-2 min-w-[180px]"
          >
            {/* 哈希输入框 */}
            {showHashInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-2 overflow-hidden"
              >
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
                  <input
                    type="text"
                    value={hashInput}
                    onChange={(e) => setHashInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleHashSubmit()}
                    placeholder={pendingAction === 'hash-text' ? 'Enter text...' : 'Enter file path...'}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleHashSubmit}
                      disabled={loading || !hashInput.trim()}
                      className="flex-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Compute'}
                    </button>
                    <button
                      onClick={() => { setShowHashInput(false); setHashInput(''); setPendingAction(null) }}
                      className="px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-700 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 操作按钮列表 */}
            {ACTIONS.map((action, i) => (
              <motion.button
                key={action.key}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white text-sm font-medium transition-colors ${action.color}`}
                onClick={() => handleAction(action.key)}
              >
                {action.icon}
                {action.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 结果展示 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-6 z-50 max-w-md bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">.NET Result</p>
                <p className="text-sm text-zinc-800 dark:text-zinc-200 break-all whitespace-pre-wrap font-mono">
                  {result}
                </p>
              </div>
              <button
                onClick={() => setResult(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 加载指示器 */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Calling .NET...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
