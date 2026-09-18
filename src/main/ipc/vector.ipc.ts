/**
 * IPC 领域：向量搜索
 * 迁移至 guardedHandle 模式
 */
import { guardedHandle, guardedQuery } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import { vectorSearch } from '../vector-search'
import {
  VectorSearchSchema, VectorIndexWorklogSchema, VectorRemoveSchema,
} from '../ipc-schemas'

export function registerVectorIpc(): void {
  guardedQuery('vector:initialize', () => {
    vectorSearch.initialize()
    return ok({ ok: true })
  })

  guardedHandle('vector:search', VectorSearchSchema, async (data) => {
    return ok(await vectorSearch.search(data.query, data.options))
  })

  guardedQuery('vector:stats', async () => {
    return ok(await vectorSearch.getStats())
  })

  guardedQuery('vector:rebuild', () => {
    vectorSearch.rebuildIndex()
    return ok({ ok: true })
  })

  guardedQuery('vector:auto-index', async () => {
    return ok(await vectorSearch.autoIndexAll())
  })

  guardedHandle('vector:index-worklog', VectorIndexWorklogSchema, async (data) => {
    return ok(await vectorSearch.indexSingleWorklog(data.id, data.content))
  })
}
