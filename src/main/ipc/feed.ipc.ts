/**
 * IPC 领域：RSS 订阅源 + 文章 + 分类
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import {
  getFeeds, updateFeed, deleteFeed,
  getFeedCategories, addFeedCategory, updateFeedCategory, deleteFeedCategory,
  getArticles, markArticleRead, markArticleUnread, toggleArticleStar, markAllRead
} from '../db'
import { subscribeFeed, refreshFeed, refreshAllFeeds, importOpmlData, generateOpmlData } from '../feedService'
import { showNotification } from '../notification'

export function registerFeedIpc(): void {
  ipcMain.handle('feed:add', async (_event, url: string, categoryId?: number | null) => {
    return subscribeFeed(url, categoryId ?? null)
  })

  ipcMain.handle('feed:list', () => {
    return getFeeds()
  })

  ipcMain.handle('feed:update', (_event, id: number, updates: Record<string, unknown>) => {
    return updateFeed(id, updates as any)
  })

  ipcMain.handle('feed:delete', (_event, id: number) => {
    return deleteFeed(id)
  })

  ipcMain.handle('feed:refresh', async (_event, id: number) => {
    const result = await refreshFeed(id)
    showNotification({
      title: '订阅源已刷新',
      body: result.newArticles > 0 ? `获取 ${result.newArticles} 篇新文章` : '无新文章',
      tag: 'feed-refresh',
      group: 'workpulse',
    })
    return result
  })

  ipcMain.handle('feed:refreshAll', async () => {
    const results = await refreshAllFeeds()
    const totalNew = results.reduce((sum, r) => sum + r.result.newArticles, 0)
    showNotification({
      title: '全部订阅源已刷新',
      body: totalNew > 0 ? `获取 ${totalNew} 篇新文章` : '无新文章',
      tag: 'feed-refresh-all',
      group: 'workpulse',
    })
    return results
  })

  ipcMain.handle('feed:importOpml', (_event, xml: string) => {
    const result = importOpmlData(xml)
    showNotification({
      title: 'OPML 已导入',
      body: `导入 ${result.feeds.length} 个订阅源，${result.categories.length} 个分类`,
      tag: 'feed-import-opml',
      group: 'workpulse',
    })
    return result
  })

  ipcMain.handle('feed:exportOpml', () => {
    const opml = generateOpmlData()
    showNotification({
      title: 'OPML 已生成',
      body: '订阅源数据已准备就绪',
      tag: 'feed-export-opml',
      group: 'workpulse',
    })
    return opml
  })

  ipcMain.handle('feed:categories:list', () => {
    return getFeedCategories()
  })

  ipcMain.handle('feed:categories:add', (_event, name: string) => {
    return addFeedCategory(name)
  })

  ipcMain.handle('feed:categories:update', (_event, id: number, name: string) => {
    return updateFeedCategory(id, name)
  })

  ipcMain.handle('feed:categories:delete', (_event, id: number) => {
    return deleteFeedCategory(id)
  })

  ipcMain.handle('feed:articles:list', (_event, feedId?: number, filter?: string, limit?: number, offset?: number) => {
    return getArticles(feedId, (filter as any) ?? 'all', limit ?? 100, offset ?? 0)
  })

  ipcMain.handle('feed:articles:read', (_event, id: number) => {
    return markArticleRead(id)
  })

  ipcMain.handle('feed:articles:unread', (_event, id: number) => {
    return markArticleUnread(id)
  })

  ipcMain.handle('feed:articles:star', (_event, id: number) => {
    return toggleArticleStar(id)
  })

  ipcMain.handle('feed:articles:readAll', (_event, feedId?: number) => {
    markAllRead(feedId)
  })

  ipcMain.handle('feed:exportPdf', async (event, html: string, title: string, metadata?: { feedTitle?: string; author?: string; publishedAt?: string; url?: string }) => {
    const sendProgress = (stage: string, percent: number) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('feed:exportPdf-progress', { stage, percent })
        }
      } catch { /* webContents 可能已销毁 */ }
    }

    try {
    sendProgress('preparing', 10)

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${title.replace(/[<>:"/\\|?*]/g, '_')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) {
      sendProgress('done', 100)
      return { success: false }
    }

    sendProgress('rendering', 30)

    const metaParts: string[] = []
    if (metadata?.feedTitle) metaParts.push(`<span class="meta-source">${metadata.feedTitle}</span>`)
    if (metadata?.author) metaParts.push(`<span class="meta-author">作者：${metadata.author}</span>`)
    if (metadata?.publishedAt) metaParts.push(`<span class="meta-date">${new Date(metadata.publishedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>`)
    if (metadata?.url) metaParts.push(`<a class="meta-link" href="${metadata.url}">原文链接</a>`)
    const metaHtml = metaParts.length > 0 ? `<div class="article-meta">${metaParts.join('')}</div>` : ''

    const wrappedHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 2cm 2.5cm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  * { box-sizing: border-box; }
  body {
    font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a; line-height: 1.8; font-size: 14px;
    max-width: 100%; margin: 0; padding: 0;
  }

  /* ════════════════════════════════════════════
     隐藏交互元素 — 只保留纯阅读内容
     ════════════════════════════════════════════ */
  .github-code-copy,
  .github-anchor,
  .github-external-icon,
  .github-anchor-icon {
    display: none !important;
  }

  /* 代码块头部：保留语言标签，隐藏复制按钮 */
  .github-code-header {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: #e8eaed;
    border-bottom: 1px solid #d0d7de;
    border-radius: 8px 8px 0 0;
    font-size: 12px;
    color: #57606a;
  }
  .github-code-lang {
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 链接：去掉外部图标，保留文字 */
  .github-link {
    text-decoration: none;
    color: #2563eb;
  }

  /* ── 文章头部 ── */
  .article-title {
    font-size: 24px; font-weight: 700; line-height: 1.3;
    margin: 0 0 12px; color: #111;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  .article-meta {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    font-size: 12px; color: #666; padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb; margin-bottom: 24px;
  }
  .meta-source {
    background: #f0f7ff; color: #2563eb; padding: 2px 8px;
    border-radius: 4px; font-weight: 500;
  }
  .meta-author, .meta-date { color: #666; }
  .meta-link { color: #2563eb; text-decoration: none; }

  /* ── 标题层级 ── */
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600; line-height: 1.4; color: #111;
    page-break-after: avoid;
    page-break-inside: avoid;
    margin-top: 28px; margin-bottom: 12px;
  }
  h1 { font-size: 22px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
  h2 { font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px; }
  h3 { font-size: 16px; }
  h4 { font-size: 15px; }
  h5, h6 { font-size: 14px; color: #555; }

  /* ── 段落与行内 ── */
  p {
    margin: 0 0 16px;
    orphans: 2;
    widows: 2;
  }
  strong { font-weight: 600; }
  em { font-style: italic; }
  a { color: #2563eb; text-decoration: none; }

  /* ── 引用块 ── */
  blockquote {
    margin: 16px 0; padding: 12px 16px;
    border-left: 4px solid #d0d7de; background: #f6f8fa;
    border-radius: 0 6px 6px 0; color: #57606a;
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }

  /* ── 代码块 ── */
  pre {
    background: #f6f8fa; border: 1px solid #d0d7de;
    border-radius: 0 0 8px 8px;
    padding: 16px; overflow-x: auto;
    font-size: 13px; line-height: 1.5; margin: 16px 0;
    page-break-inside: avoid;
  }
  pre code {
    background: none; padding: 0; border-radius: 0;
    font-size: inherit; color: #24292f;
  }
  code {
    background: #eff1f3; padding: 2px 6px; border-radius: 4px;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
    font-size: 13px; color: #cf222e;
  }

  /* ── 表格 ── */
  .github-table-wrapper {
    overflow: visible;
    margin: 16px 0;
    page-break-inside: avoid;
  }
  table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #d0d7de; padding: 8px 12px; text-align: left;
  }
  th {
    background: #f6f8fa; font-weight: 600; color: #24292f;
  }
  tr:nth-child(even) { background: #f9fafb; }

  /* ── 列表 ── */
  ul, ol { margin: 8px 0 16px; padding-left: 24px; }
  li { margin: 4px 0; }
  li > ul, li > ol { margin: 4px 0; }

  /* ── 任务列表 ── */
  .task-list-item { list-style: none; margin-left: -20px; }
  .task-list-item input[type="checkbox"] {
    margin-right: 6px; accent-color: #2563eb;
  }

  /* ── 图片 ── */
  img {
    max-width: 100%; height: auto; border-radius: 6px;
    margin: 12px 0; page-break-inside: avoid;
  }

  /* ── 分割线 ── */
  hr {
    border: none; border-top: 1px solid #d0d7de;
    margin: 24px 0;
  }

  /* ── 删除线 ── */
  del { color: #8b949e; }

  /* ── 脚注 ── */
  .footnotes {
    font-size: 12px; color: #666;
    border-top: 1px solid #e5e7eb;
    margin-top: 32px; padding-top: 12px;
    page-break-before: auto;
  }

  /* ── highlight.js 兼容 ── */
  .hljs { background: transparent; }

  /* ── Mermaid 图表 ── */
  .github-mermaid {
    text-align: center;
    margin: 16px 0;
    page-break-inside: avoid;
  }
  .github-mermaid svg {
    max-width: 100%;
    height: auto;
  }

  /* ════════════════════════════════════════════
     版权水印 — 屏幕几乎不可见，打印很明显
     ════════════════════════════════════════════ */
  body::before {
    content: "WorkPulse Personal Use Only";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 48px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
    letter-spacing: 4px;
    user-select: none;
    /* 屏幕上：几乎不可见 */
    color: rgba(0, 0, 0, 0.025);
  }
  @media print {
    body::before {
      /* 打印时：清晰可见的灰色水印 */
      color: rgba(0, 0, 0, 0.12);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style></head><body>
  <h1 class="article-title">${title}</h1>
  ${metaHtml}
  <article>${html}</article>
</body></html>`

    const win = new BrowserWindow({
      show: false,
      width: 800,
      webPreferences: { offscreen: true },
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wrappedHtml)}`)
    sendProgress('rendering', 50)
    await new Promise(resolve => setTimeout(resolve, 300))

    sendProgress('generating', 70)
    const articleDate = metadata?.publishedAt
      ? new Date(metadata.publishedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
      : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })

    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      headerFooter: {
        left: `<span style="font-size:9px;color:#999;font-family:sans-serif">${metadata?.feedTitle || 'WorkPulse'}</span>`,
        center: '',
        right: `<span style="font-size:9px;color:#999;font-family:sans-serif">${articleDate}</span>`,
      },
    })

    sendProgress('saving', 90)
    writeFileSync(filePath, pdfData)
    win.destroy()

    sendProgress('done', 100)
    return { success: true, filePath }
    } catch (err) {
      console.error('[feed:exportPdf] 导出失败:', err)
      sendProgress('done', 100)
      return { success: false, error: String(err) }
    }
  })
}
