import React, { useState } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { X, Plus, Loader2, AlertCircle } from 'lucide-react'

export default function AddFeedDialog() {
  const { showAddFeedDialog, setShowAddFeedDialog, addFeed, categories } = useRssStore()
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState('')

  if (!showAddFeedDialog) return null

  const handleAdd = async () => {
    if (!url.trim()) return
    setError('')
    setIsAdding(true)
    try {
      await addFeed(url.trim(), categoryId)
      setUrl('')
      setCategoryId(null)
      setShowAddFeedDialog(false)
    } catch (e: any) {
      setError(e?.message ?? '添加订阅失败')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAddFeedDialog(false)} />
      
      {/* Dialog */}
      <div className="relative surface-elevated rounded-2xl shadow-xl w-[420px] max-w-[90vw]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">添加订阅源</h2>
          <button
            onClick={() => setShowAddFeedDialog(false)}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-inset)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">订阅地址</label>
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError('') }}
              placeholder="https://example.com/feed.xml"
              className="w-full px-3 py-2 text-sm surface-input rounded-lg border-0 outline-none text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">分类（可选）</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 text-sm surface-input rounded-lg border-0 outline-none text-[var(--color-text)]"
            >
              <option value="">未分类</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-subtle)]">
          <button
            onClick={() => setShowAddFeedDialog(false)}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleAdd}
            disabled={!url.trim() || isAdding}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            订阅
          </button>
        </div>
      </div>
    </div>
  )
}
