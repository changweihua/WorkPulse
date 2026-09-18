/**
 * IPC 领域：向量搜索
 */
import { ipcMain } from 'electron'
import { vectorSearch } from '../vector-search'

export function registerVectorIpc(): void {
  ipcMain.handle('vector:initialize', () => {
    vectorSearch.initialize()
    return { ok: true }
  })

  ipcMain.handle('vector:search', async (_event, query: string, options?: { type?: string; topK?: number }) => {
    return vectorSearch.search(query, options)
  })

  ipcMain.handle('vector:stats', async () => {
    return vectorSearch.getStats()
  })

  ipcMain.handle('vector:rebuild', async () => {
    vectorSearch.rebuildIndex()
    return { ok: true }
  })

  ipcMain.handle('vector:auto-index', async () => {
    return vectorSearch.autoIndexAll()
  })
}
