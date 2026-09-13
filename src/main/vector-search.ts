import { LocalDocumentIndex, LocalEmbeddings } from 'vectra'
import { app } from 'electron'
import path from 'path'
import { rmSync } from 'fs'
import log from 'electron-log/main'

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export interface VectorSearchResult {
  uri: string
  score: number
  text: string
  metadata: Record<string, unknown>
}

export interface VectorStats {
  version: number
  items: number
  metadataConfig: Record<string, unknown>
}

class VectorSearchService {
  private index: LocalDocumentIndex | null = null
  private embeddings: LocalEmbeddings
  private initPromise: Promise<void> | null = null

  constructor() {
    this.embeddings = new LocalEmbeddings({
      model: EMBEDDING_MODEL,
      maxTokens: 256,
    })
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInit().catch(e => {
      this.initPromise = null
      throw e
    })
    return this.initPromise
  }

  private async _doInit(): Promise<void> {
    const indexPath = path.join(app.getPath('userData'), 'vector-index')
    this.index = new LocalDocumentIndex({
      folderPath: indexPath,
      indexName: 'search',
      embeddings: this.embeddings,
    })

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({
        version: 1,
        metadata_config: {
          indexed: ['type', 'date', 'category', 'conversationId'],
        },
      })
      log.info('[VectorSearch] Created new index at', indexPath)
    } else {
      log.info('[VectorSearch] Loaded existing index at', indexPath)
    }
  }

  async indexWorkLog(id: number, content: string, category: string, date: string): Promise<void> {
    await this.initialize()
    if (!this.index) throw new Error('Vector index not initialized')

    await this.index.upsertDocument(
      `worklog://${id}`,
      content,
      'text',
      {
        type: 'worklog',
        id: String(id),
        category: category || '',
        date,
      }
    )
    log.debug(`[VectorSearch] Indexed worklog #${id}`)
  }

  async indexConversation(
    id: string,
    title: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<void> {
    await this.initialize()
    if (!this.index) throw new Error('Vector index not initialized')

    // Combine messages into a single document text
    const text = messages
      .filter((m) => m.content?.trim())
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')

    if (!text.trim()) return

    await this.index.upsertDocument(
      `conversation://${id}`,
      text,
      'chat',
      {
        type: 'conversation',
        id,
        title: title || 'Untitled',
        messageCount: messages.length,
      }
    )
    log.debug(`[VectorSearch] Indexed conversation "${title}" (${messages.length} messages)`)
  }

  async search(
    query: string,
    options?: { type?: string; topK?: number; bm25?: boolean }
  ): Promise<VectorSearchResult[]> {
    await this.initialize()
    if (!this.index) throw new Error('Vector index not initialized')

    const filter = options?.type
      ? { type: { $eq: options.type } }
      : undefined

    const results = await this.index.queryDocuments(query, {
      maxDocuments: options?.topK ?? 10,
      maxChunks: 20,
      filter,
      isBm25: options?.bm25 ?? false,
    })

    return Promise.all(
      results.map(async (r) => ({
        uri: r.uri,
        score: r.score,
        text: await r.loadText(),
        metadata: await r.loadMetadata(),
      }))
    )
  }

  async removeDocument(uri: string): Promise<void> {
    await this.initialize()
    if (!this.index) throw new Error('Vector index not initialized')
    await this.index.deleteDocument(uri)
    log.debug(`[VectorSearch] Removed document: ${uri}`)
  }

  async getStats(): Promise<VectorStats> {
    await this.initialize()
    if (!this.index) return { version: 0, items: 0, metadataConfig: {} }

    const stats = await this.index.getIndexStats()
    return {
      version: stats.version,
      items: stats.items,
      metadataConfig: stats.metadata_config || {},
    }
  }

  async rebuildIndex(): Promise<void> {
    const indexPath = path.join(app.getPath('userData'), 'vector-index')
    this.index = null
    this.initPromise = null

    // Let vectra release file handles before deletion (Windows EBUSY)
    await new Promise(r => setTimeout(r, 200))

    // Delete existing index
    try {
      rmSync(indexPath, { recursive: true, force: true })
    } catch {
      // ignore
    }

    await this.initialize()
    log.info('[VectorSearch] Index rebuilt')
  }
}

export const vectorSearch = new VectorSearchService()
