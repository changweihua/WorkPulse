import { useState, useCallback, useEffect } from 'react'

export interface SearchResult {
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

export interface UseVectorSearchReturn {
  results: SearchResult[]
  loading: boolean
  error: string | null
  stats: VectorStats | null
  initialized: boolean
  search: (query: string, options?: { type?: string; topK?: number; bm25?: boolean }) => Promise<SearchResult[]>
  indexWorklog: (id: number, content: string, category: string, date: string) => Promise<boolean>
  indexConversation: (id: string, title: string, messages: Array<{ role: string; content: string }>) => Promise<boolean>
  removeDocument: (uri: string) => Promise<boolean>
  refreshStats: () => Promise<void>
  rebuildIndex: () => Promise<boolean>
}

export function useVectorSearch(): UseVectorSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<VectorStats | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Initialize on mount
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        await (window as any).api.vector.initialize()
        if (!cancelled) {
          setInitialized(true)
          const s = await (window as any).api.vector.stats()
          if (!cancelled) setStats(s)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  const search = useCallback(async (query: string, options?: { type?: string; topK?: number; bm25?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await (window as any).api.vector.search(query, options)
      setResults(res)
      return res
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const indexWorklog = useCallback(async (id: number, content: string, category: string, date: string) => {
    try {
      await (window as any).api.vector.indexWorklog(id, content, category, date)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [])

  const indexConversation = useCallback(async (id: string, title: string, messages: Array<{ role: string; content: string }>) => {
    try {
      await (window as any).api.vector.indexConversation(id, title, messages)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [])

  const removeDocument = useCallback(async (uri: string) => {
    try {
      await (window as any).api.vector.remove(uri)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [])

  const refreshStats = useCallback(async () => {
    try {
      const s = await (window as any).api.vector.stats()
      setStats(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const rebuildIndex = useCallback(async () => {
    try {
      await (window as any).api.vector.rebuild()
      await refreshStats()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [refreshStats])

  return {
    results,
    loading,
    error,
    stats,
    initialized,
    search,
    indexWorklog,
    indexConversation,
    removeDocument,
    refreshStats,
    rebuildIndex,
  }
}
