import React, { useState, useRef } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { Rss, Star, Eye, EyeOff, ChevronDown, ChevronRight, Plus, RefreshCw, MoreHorizontal, Trash2, CheckCheck, Download, Upload } from 'lucide-react'

export default function FeedSidebar() {
  const {
    feeds, categories, selectedFeedId, filter, searchQuery,
    setSelectedFeed, setFilter, setSearchQuery,
    setShowAddFeedDialog, refreshAll, deleteFeed, markAllRead,
    isRefreshing
  } = useRssStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ feedId: number; x: number; y: number } | null>(null)

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalUnread = feeds.reduce((sum, f) => sum + (f.unread_count ?? 0), 0)

  const feedsByCategory = new Map<number | null, typeof feeds>()
  for (const feed of feeds) {
    const key = feed.category_id ?? null
    const arr = feedsByCategory.get(key) ?? []
    arr.push(feed)
    feedsByCategory.set(key, arr)
  }

  const filteredFeeds = (feedList: typeof feeds) => {
    if (!searchQuery) return feedList
    return feedList.filter(f => 
      (f.title ?? f.url).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  const handleContextMenu = (e: React.MouseEvent, feedId: number) => {
    e.preventDefault()
    setContextMenu({ feedId, x: e.clientX, y: e.clientY })
  }

  const handleExportOpml = async () => {
    const { exportOpml } = useRssStore.getState()
    const xml = await exportOpml()
    const blob = new Blob([xml], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workpulse-feeds.opml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportOpml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const { importOpml } = useRssStore.getState()
    await importOpml(text)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="w-64 h-full flex flex-col surface-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">订阅源</h2>
          <button
            onClick={() => refreshAll()}
            disabled={isRefreshing}
            className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-inset)] transition-colors disabled:opacity-50"
            title="Refresh all feeds"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* Search */}
        <input
          type="text"
          placeholder="搜索订阅源..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs surface-input rounded-lg border-0 outline-none text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
        />
      </div>

      {/* Quick filters */}
      <div className="px-2 py-2 space-y-0.5">
        <button
          onClick={() => setSelectedFeed(null)}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
            selectedFeedId === null
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)]'
          }`}
        >
          <Rss className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">全部文章</span>
          {totalUnread > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
              {totalUnread}
            </span>
          )}
        </button>

        {/* Filter tabs */}
        {(['all', 'unread', 'starred'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              filter === f && selectedFeedId === null
                ? 'bg-[var(--color-surface-inset)] text-[var(--color-text)] font-medium'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)]'
            }`}
          >
            {f === 'all' && <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">●</span>}
            {f === 'unread' && <Eye className="w-3.5 h-3.5" />}
            {f === 'starred' && <Star className="w-3.5 h-3.5" />}
            <span className="flex-1 text-left">{f === 'all' ? '全部' : f === 'unread' ? '未读' : '已收藏'}</span>
          </button>
        ))}
      </div>

      <div className="mx-2 border-t border-[var(--color-border-subtle)]" />

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* Uncategorized feeds */}
        {filteredFeeds(feedsByCategory.get(null) ?? []).map(feed => (
          <FeedItem
            key={feed.id}
            feed={feed}
            isSelected={selectedFeedId === feed.id}
            onSelect={() => setSelectedFeed(feed.id)}
            onContextMenu={(e) => handleContextMenu(e, feed.id)}
          />
        ))}

        {/* Categories */}
        {categories.map(cat => {
          const catFeeds = filteredFeeds(feedsByCategory.get(cat.id) ?? [])
          const expanded = expandedCategories.has(cat.id)
          const catUnread = catFeeds.reduce((s, f) => s + (f.unread_count ?? 0), 0)
          
          return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span className="flex-1 text-left truncate">{cat.name}</span>
                {catUnread > 0 && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">{catUnread}</span>
                )}
              </button>
              {expanded && catFeeds.map(feed => (
                <FeedItem
                  key={feed.id}
                  feed={feed}
                  isSelected={selectedFeedId === feed.id}
                  onSelect={() => setSelectedFeed(feed.id)}
                  onContextMenu={(e) => handleContextMenu(e, feed.id)}
                  indented
                />
              ))}
            </div>
          )
        })}
      </div>

      {/* Footer: Add feed + OPML */}
      <div className="p-2 border-t border-[var(--color-border-subtle)] space-y-1">
        <button
          onClick={() => setShowAddFeedDialog(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-inset)] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加订阅
        </button>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handleExportOpml}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
            title="导出 OPML"
          >
            <Download className="w-3 h-3" />
            导出
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
            title="导入 OPML"
          >
            <Upload className="w-3 h-3" />
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            onChange={handleImportOpml}
            className="hidden"
          />
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 surface-elevated rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => { markAllRead(contextMenu.feedId); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)]"
            >
              <CheckCheck className="w-3.5 h-3.5" /> 全部已读
            </button>
            <div className="mx-2 my-1 border-t border-[var(--color-border-subtle)]" />
            <button
              onClick={() => { deleteFeed(contextMenu.feedId); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> 删除订阅
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function FeedItem({ feed, isSelected, onSelect, onContextMenu, indented }: {
  feed: { id: number; title: string | null; url: string; unread_count?: number }
  isSelected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  indented?: boolean
}) {
  const hostname = (() => { try { return new URL(feed.url).hostname.replace('www.', '') } catch { return feed.url } })()
  
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`w-full flex items-center gap-2 rounded-lg text-xs transition-colors ${
        indented ? 'pl-7 pr-2' : 'px-2'
      } py-1.5 ${
        isSelected
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)]'
      }`}
    >
      <img
        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
        alt=""
        className="w-3.5 h-3.5 rounded-sm shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <span className="flex-1 text-left truncate">{feed.title ?? hostname}</span>
      {(feed.unread_count ?? 0) > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
          {feed.unread_count}
        </span>
      )}
    </button>
  )
}
