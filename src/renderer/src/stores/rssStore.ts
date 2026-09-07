import { create } from 'zustand'

interface FeedCategory { id: number; name: string; sort_order: number; created_at: string }
interface Feed { id: number; url: string; title: string | null; description: string | null; site_url: string | null; favicon_url: string | null; category_id: number | null; refresh_interval: number; last_fetched_at: string | null; is_muted: number; created_at: string; unread_count?: number }
interface Article { id: number; feed_id: number; guid: string | null; title: string; url: string | null; author: string | null; content: string | null; summary: string | null; published_at: string | null; is_read: number; is_starred: number; created_at: string; feed_title?: string; feed_favicon_url?: string | null }

interface RssState {
  // Data
  feeds: Feed[]
  categories: FeedCategory[]
  articles: Article[]
  
  // UI state
  selectedFeedId: number | null  // null = show all
  selectedArticleId: number | null
  filter: 'all' | 'unread' | 'starred'
  isLoading: boolean
  isRefreshing: boolean
  showAddFeedDialog: boolean
  searchQuery: string

  // Actions
  loadFeeds: () => Promise<void>
  loadCategories: () => Promise<void>
  loadArticles: (feedId?: number) => Promise<void>
  setSelectedFeed: (feedId: number | null) => void
  setSelectedArticle: (articleId: number | null) => void
  setFilter: (filter: 'all' | 'unread' | 'starred') => void
  setSearchQuery: (query: string) => void
  setShowAddFeedDialog: (show: boolean) => void
  
  addFeed: (url: string, categoryId?: number | null) => Promise<void>
  deleteFeed: (id: number) => Promise<void>
  refreshFeed: (id: number) => Promise<void>
  refreshAll: () => Promise<void>
  
  markRead: (id: number) => Promise<void>
  markUnread: (id: number) => Promise<void>
  toggleStar: (id: number) => Promise<void>
  markAllRead: (feedId?: number) => Promise<void>
  
  addCategory: (name: string) => Promise<void>
  deleteCategory: (id: number) => Promise<void>
  
  importOpml: (xml: string) => Promise<void>
  exportOpml: () => Promise<string>
}

export const useRssStore = create<RssState>((set, get) => ({
  feeds: [],
  categories: [],
  articles: [],
  selectedFeedId: null,
  selectedArticleId: null,
  filter: 'all',
  isLoading: false,
  isRefreshing: false,
  showAddFeedDialog: false,
  searchQuery: '',

  loadFeeds: async () => {
    const feeds = await window.api.feed.list()
    set({ feeds })
  },

  loadCategories: async () => {
    const categories = await window.api.feed.categories.list()
    set({ categories })
  },

  loadArticles: async (feedId?: number) => {
    set({ isLoading: true })
    const { filter } = get()
    const targetFeedId = feedId ?? get().selectedFeedId ?? undefined
    const articles = await window.api.feed.articles.list(targetFeedId, filter)
    set({ articles, isLoading: false })
  },

  setSelectedFeed: (feedId) => {
    set({ selectedFeedId: feedId, selectedArticleId: null })
    get().loadArticles()
  },

  setSelectedArticle: (articleId) => set({ selectedArticleId: articleId }),

  setFilter: (filter) => {
    set({ filter, selectedArticleId: null })
    get().loadArticles()
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowAddFeedDialog: (show) => set({ showAddFeedDialog: show }),

  addFeed: async (url, categoryId) => {
    await window.api.feed.add(url, categoryId)
    await get().loadFeeds()
    await get().loadArticles()
  },

  deleteFeed: async (id) => {
    await window.api.feed.delete(id)
    const { selectedFeedId } = get()
    if (selectedFeedId === id) set({ selectedFeedId: null })
    await get().loadFeeds()
    await get().loadArticles()
  },

  refreshFeed: async (id) => {
    set({ isRefreshing: true })
    await window.api.feed.refresh(id)
    await get().loadFeeds()
    await get().loadArticles()
    set({ isRefreshing: false })
  },

  refreshAll: async () => {
    set({ isRefreshing: true })
    await window.api.feed.refreshAll()
    await get().loadFeeds()
    await get().loadArticles()
    set({ isRefreshing: false })
  },

  markRead: async (id) => {
    await window.api.feed.articles.read(id)
    set((s) => ({
      articles: s.articles.map(a => a.id === id ? { ...a, is_read: 1 } : a),
      feeds: s.feeds.map(f => {
        const affected = s.articles.find(a => a.id === id)
        if (affected && f.id === affected.feed_id) {
          return { ...f, unread_count: Math.max(0, (f.unread_count ?? 0) - 1) }
        }
        return f
      })
    }))
  },

  markUnread: async (id) => {
    await window.api.feed.articles.unread(id)
    set((s) => ({
      articles: s.articles.map(a => a.id === id ? { ...a, is_read: 0 } : a),
      feeds: s.feeds.map(f => {
        const affected = s.articles.find(a => a.id === id)
        if (affected && f.id === affected.feed_id) {
          return { ...f, unread_count: (f.unread_count ?? 0) + 1 }
        }
        return f
      })
    }))
  },

  toggleStar: async (id) => {
    await window.api.feed.articles.star(id)
    set((s) => ({
      articles: s.articles.map(a => a.id === id ? { ...a, is_starred: a.is_starred ? 0 : 1 } : a)
    }))
  },

  markAllRead: async (feedId) => {
    await window.api.feed.articles.readAll(feedId ?? get().selectedFeedId ?? undefined)
    await get().loadFeeds()
    await get().loadArticles()
  },

  addCategory: async (name) => {
    await window.api.feed.categories.add(name)
    await get().loadCategories()
  },

  deleteCategory: async (id) => {
    await window.api.feed.categories.delete(id)
    await get().loadCategories()
    await get().loadFeeds()
  },

  importOpml: async (xml) => {
    await window.api.feed.importOpml(xml)
    await get().loadFeeds()
    await get().loadCategories()
    await get().loadArticles()
  },

  exportOpml: async () => {
    return window.api.feed.exportOpml()
  },
}))
