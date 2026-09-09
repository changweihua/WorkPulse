import React, { useState, useCallback, type ReactNode } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { ExternalLink, Star, Clock, User, FileDown, Hash } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

function isExternalLink(href: string | undefined): boolean {
  if (!href) return false
  return href.startsWith('http://') || href.startsWith('https://')
}

const headingCounts = new Map<string, number>()
function uniqueSlug(text: string): string {
  const base = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '')
  const count = headingCounts.get(base) || 0
  headingCounts.set(base, count + 1)
  return count > 0 ? `${base}-${count}` : base
}

// ── Custom Code Block (with language label + copy button) ──
function CodeBlock({ children, className, ...props }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)

  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const codeString = typeof children === 'string' ? children : String(children)

  // Only show copy button for block code (has language class)
  const isBlockCode = !!match

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = codeString
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [codeString])

  if (isBlockCode) {
    return (
      <div className="github-code-block">
        <div className="github-code-header">
          <span className="github-code-lang">{language}</span>
          <button
            onClick={handleCopy}
            className="github-code-copy"
            title={copied ? '已复制' : '复制代码'}
            aria-label={copied ? '已复制' : '复制代码'}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z" />
                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z" />
              </svg>
            )}
          </button>
        </div>
        <pre className={className} style={{ margin: 0, padding: '16px', overflowX: 'auto' }}>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    )
  }

  // Inline code
  return (
    <code className={`github-inline-code ${className || ''}`} {...props}>
      {children}
    </code>
  )
}

// ── Custom Components ──
const components = {
  // Headings with bottom border + anchor
  h1: ({ children, ...props }: any) => (
    <h1 className="github-heading github-heading-1" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="github-heading github-heading-2" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="github-heading github-heading-3" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h3>
  ),
  h4: ({ children, ...props }: any) => (
    <h4 className="github-heading github-heading-4" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h4>
  ),
  h5: ({ children, ...props }: any) => (
    <h5 className="github-heading github-heading-5" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h5>
  ),
  h6: ({ children, ...props }: any) => (
    <h6 className="github-heading github-heading-6" {...props}>
      {children}
      <a href={`#${uniqueSlug(String(children))}`} className="github-anchor">
        <Hash className="github-anchor-icon" />
      </a>
    </h6>
  ),

  // Code blocks with language label and copy
  code: CodeBlock,

  // Links with external icon
  a: ({ href, children, ...props }: any) => (
    <a
      href={href}
      className="github-link"
      target={isExternalLink(href) ? '_blank' : undefined}
      rel={isExternalLink(href) ? 'noopener noreferrer' : undefined}
      {...props}
    >
      {children}
      {isExternalLink(href) && (
        <ExternalLink className="github-external-icon" />
      )}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="github-blockquote" {...props}>
      {children}
    </blockquote>
  ),

  // Tables with responsive wrapper
  table: ({ children, ...props }: any) => (
    <div className="github-table-wrapper">
      <table className="github-table" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="github-thead" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: any) => (
    <th className="github-th" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="github-td" {...props}>
      {children}
    </td>
  ),

  // Images
  img: ({ src, alt, ...props }: any) => (
    <img
      src={src}
      alt={alt}
      className="github-image"
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none' }}
      {...props}
    />
  ),

  // Horizontal rules
  hr: (props: any) => <hr className="github-hr" {...props} />,

  // Task list checkboxes
  input: ({ checked, ...props }: any) => {
    if (props.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          className="github-task-checkbox"
          readOnly
          {...props}
        />
      )
    }
    return <input {...props} />
  },

  // Lists with proper spacing
  ul: ({ children, ...props }: any) => (
    <ul className="github-list github-list-unordered" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="github-list github-list-ordered" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="github-list-item" {...props}>
      {children}
    </li>
  ),
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
          <button
            onClick={async () => {
              const result = await window.api.feed.exportPdf(content, article.title)
              if (result?.success) {
                window.api.notification?.show?.({ title: 'PDF 已保存', body: result.filePath || '', urgency: 'normal' })
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" />
            导出 PDF
          </button>
        </div>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {content ? (
          <div className="github-markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={components}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-tertiary)] italic">暂无内容</p>
        )}
      </div>
    </div>
  )
}
