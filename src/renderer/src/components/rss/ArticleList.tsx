import React, { useEffect, useCallback } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { Star, Clock, ArrowDown, RefreshCw } from 'lucide-react'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
  return new Date(dateStr).toLocaleDateString()
}

export default function ArticleList() {
  const {
    articles, selectedArticleId, setSelectedArticle,
    markRead, toggleStar, isLoading, filter,
    loadArticles, selectedFeedId
  } = useRssStore()

  const currentIndex = articles.findIndex(a => a.id === selectedArticleId)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    switch (e.key) {
      case 'j':
      case 'ArrowDown': {
        e.preventDefault()
        const next = Math.min(currentIndex + 1, articles.length - 1)
        if (articles[next]) setSelectedArticle(articles[next].id)
        break
      }
      case 'k':
      case 'ArrowUp': {
        e.preventDefault()
        const prev = Math.max(currentIndex - 1, 0)
        if (articles[prev]) setSelectedArticle(articles[prev].id)
        break
      }
      case 'Enter': {
        const article = articles[currentIndex]
        if (article?.url) {
          window.open(article.url, '_blank')
          markRead(article.id)
        }
        break
      }
      case 's': {
        const article = articles[currentIndex]
        if (article) toggleStar(article.id)
        break
      }
      case 'r': {
        const article = articles[currentIndex]
        if (article) {
          if (article.is_read) {
            // mark unread not available via markRead, just refresh
          } else {
            markRead(article.id)
          }
        }
        break
      }
    }
  }, [articles, currentIndex, setSelectedArticle, markRead, toggleStar])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Mark as read when selected
  useEffect(() => {
    if (selectedArticleId) {
      const article = articles.find(a => a.id === selectedArticleId)
      if (article && !article.is_read) {
        markRead(selectedArticleId)
      }
    }
  }, [selectedArticleId])

  return (
    <div className="w-80 h-full flex flex-col surface-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-[var(--color-text-secondary)]">
            {filter === 'starred' ? '已收藏' : filter === 'unread' ? '未读' : '全部文章'}
            <span className="ml-1.5 text-[var(--color-text-tertiary)]">({articles.length})</span>
          </h3>
          <button
            onClick={() => loadArticles()}
            className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 text-[var(--color-text-tertiary)] animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-inset)] flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-[var(--color-text-tertiary)]" />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">暂无文章</p>
            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
              添加订阅源或刷新以查看文章
            </p>
          </div>
        ) : (
          articles.map(article => (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-[var(--color-border-subtle)] transition-colors ${
                selectedArticleId === article.id
                  ? 'bg-blue-500/8'
                  : 'hover:bg-[var(--color-surface-inset)]'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!article.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                    <h4 className={`text-xs leading-tight truncate ${
                      article.is_read ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text)] font-medium'
                    }`}>
                      {article.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                    {article.feed_title && <span className="truncate">{article.feed_title}</span>}
                    {article.feed_title && article.published_at && <span>·</span>}
                    <span className="shrink-0">{timeAgo(article.published_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleStar(article.id) }}
                  className="p-1 rounded shrink-0 hover:bg-[var(--color-surface-inset)] transition-colors"
                >
                  <Star className={`w-3 h-3 ${article.is_starred ? 'fill-amber-400 text-amber-400' : 'text-[var(--color-text-tertiary)]'}`} />
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
