/**
 * IPC 领域：向量搜索
 */
import { ipcMain } from 'electron'
import { vectorSearch } from '../vector-search'

export function registerVectorIpc(): void {
  ipcMain.handle('vector:initialize', async () => {
    await vectorSearch.initialize()
    return { ok: true }
  })

  ipcMain.handle('vector:index-worklog', async (_event, id: number, content: string, category: string, date: string) => {
    await vectorSearch.indexWorkLog(id, content, category, date)
    return { ok: true }
  })

  ipcMain.handle('vector:index-conversation', async (_event, id: string, title: string, messages: Array<{ role: string; content: string }>) => {
    await vectorSearch.indexConversation(id, title, messages)
    return { ok: true }
  })

  ipcMain.handle('vector:search', async (_event, query: string, options?: { type?: string; topK?: number; bm25?: boolean }) => {
    return vectorSearch.search(query, options)
  })

  ipcMain.handle('vector:stats', async () => {
    return vectorSearch.getStats()
  })

  ipcMain.handle('vector:remove', async (_event, uri: string) => {
    await vectorSearch.removeDocument(uri)
    return { ok: true }
  })

  ipcMain.handle('vector:rebuild', async () => {
    await vectorSearch.rebuildIndex()
    return { ok: true }
  })
}
