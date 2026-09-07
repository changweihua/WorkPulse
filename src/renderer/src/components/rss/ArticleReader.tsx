import React from 'react'
import { useRssStore } from '@/stores/rssStore'
import { ExternalLink, Star, Clock, User } from 'lucide-react'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

export default function ArticleReader() {
  const { articles, selectedArticleId, toggleStar } = useRssStore()
  const article = articles.find(a => a.id === selectedArticleId)

  if (!article) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center surface-card rounded-xl">
        <div className="w-14 h-14 rounded-full bg-[var(--color-surface-inset)] flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-[var(--color-text-tertiary)]" />
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] font-medium">选择一篇文章</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">使用 J/K 导航，Enter 打开</p>
      </div>
    )
  }

  const content = article.content || article.summary || ''

  return (
    <div className="flex-1 h-full flex flex-col surface-card rounded-xl overflow-hidden">
      {/* Article header */}
      <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] shrink-0">
        <h1 className="text-lg font-semibold text-[var(--color-text)] leading-snug mb-2">
          {article.title}
        </h1>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
          {article.feed_title && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {article.feed_title}
            </span>
          )}
          {article.author && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {article.author}
            </span>
          )}
          {article.published_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(article.published_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => toggleStar(article.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-[var(--color-surface-inset)] transition-colors"
          >
            <Star className={`w-3.5 h-3.5 ${article.is_starred ? 'fill-amber-400 text-amber-400' : 'text-[var(--color-text-tertiary)]'}`} />
            <span className="text-[var(--color-text-secondary)]">{article.is_starred ? '已收藏' : '收藏'}</span>
          </button>
          {article.url && (
            <button
              onClick={() => window.open(article.url, '_blank')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              在浏览器中打开
            </button>
          )}
        </div>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {content ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text-secondary)]
              prose-a:text-blue-500 prose-strong:text-[var(--color-text)]
              prose-img:rounded-lg prose-pre:bg-[var(--color-surface-inset)]
              prose-blockquote:border-l-blue-500/30 prose-blockquote:text-[var(--color-text-secondary)]"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <p className="text-sm text-[var(--color-text-tertiary)] italic">暂无内容</p>
        )}
      </div>
    </div>
  )
}
