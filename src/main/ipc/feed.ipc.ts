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

  ipcMain.handle('feed:exportPdf', async (_event, html: string, title: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${title.replace(/[<>:"/\\|?*]/g, '_')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false }

    const win = new BrowserWindow({
      show: false,
      width: 800,
      webPreferences: { offscreen: true },
    })

    const wrappedHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.7; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  pre, code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  pre { padding: 12px; overflow-x: auto; }
  blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
</style></head><body>
  <h1>${title}</h1>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
  ${html}
</body></html>`

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wrappedHtml)}`)
    await new Promise(resolve => setTimeout(resolve, 500))

    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })

    writeFileSync(filePath, pdfData)
    win.destroy()
    return { success: true, filePath }
  })
}
