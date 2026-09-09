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
  editingFeed: Feed | null
  searchQuery: string
  error: string | null

  // Actions
  loadFeeds: () => Promise<void>
  loadCategories: () => Promise<void>
  loadArticles: (feedId?: number) => Promise<void>
  setSelectedFeed: (feedId: number | null) => void
  setSelectedArticle: (articleId: number | null) => void
  setFilter: (filter: 'all' | 'unread' | 'starred') => void
  setSearchQuery: (query: string) => void
  setShowAddFeedDialog: (show: boolean) => void
  setEditingFeed: (feed: Feed | null) => void
  clearError: () => void
  
  addFeed: (url: string, categoryId?: number | null) => Promise<void>
  updateFeed: (id: number, updates: { title?: string; category_id?: number | null }) => Promise<void>
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
  editingFeed: null,
  searchQuery: '',
  error: null,

  loadFeeds: async () => {
    try {
      const feeds = await window.api.feed.list()
      set({ feeds })
    } catch (e) {
      set({ error: `加载订阅失败: ${String(e)}` })
    }
  },

  loadCategories: async () => {
    try {
      const categories = await window.api.feed.categories.list()
      set({ categories })
    } catch (e) {
      set({ error: `加载分类失败: ${String(e)}` })
    }
  },

  loadArticles: async (feedId?: number) => {
    try {
      set({ isLoading: true })
      const { filter } = get()
      const targetFeedId = feedId ?? get().selectedFeedId ?? undefined
      const articles = await window.api.feed.articles.list(targetFeedId, filter)
      set({ articles, isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: `加载文章失败: ${String(e)}` })
    }
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
  setEditingFeed: (feed) => set({ editingFeed: feed }),
  clearError: () => set({ error: null }),

  addFeed: async (url, categoryId) => {
    try {
      await window.api.feed.add(url, categoryId)
      await get().loadFeeds()
      await get().loadArticles()
    } catch (e) {
      set({ error: `添加订阅失败: ${String(e)}` })
    }
  },

  updateFeed: async (id, updates: { title?: string; url?: string; category_id?: number | null }) => {
    try {
      await window.api.feed.update(id, updates)
      await get().loadFeeds()
      set({ editingFeed: null })
    } catch (e) {
      set({ error: `更新订阅失败: ${String(e)}` })
    }
  },

  deleteFeed: async (id) => {
    try {
      await window.api.feed.delete(id)
      const { selectedFeedId } = get()
      if (selectedFeedId === id) set({ selectedFeedId: null })
      await get().loadFeeds()
      await get().loadArticles()
    } catch (e) {
      set({ error: `删除订阅失败: ${String(e)}` })
    }
  },

  refreshFeed: async (id) => {
    try {
      set({ isRefreshing: true })
      await window.api.feed.refresh(id)
      await get().loadFeeds()
      await get().loadArticles()
    } catch (e) {
      set({ error: `刷新订阅失败: ${String(e)}` })
    } finally {
      set({ isRefreshing: false })
    }
  },

  refreshAll: async () => {
    try {
      set({ isRefreshing: true })
      await window.api.feed.refreshAll()
      await get().loadFeeds()
      await get().loadArticles()
    } catch (e) {
      set({ error: `刷新所有订阅失败: ${String(e)}` })
    } finally {
      set({ isRefreshing: false })
    }
  },

  markRead: async (id) => {
    try {
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
    } catch (e) {
      set({ error: `标记已读失败: ${String(e)}` })
    }
  },

  markUnread: async (id) => {
    try {
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
    } catch (e) {
      set({ error: `标记未读失败: ${String(e)}` })
    }
  },

  toggleStar: async (id) => {
    try {
      await window.api.feed.articles.star(id)
      set((s) => ({
        articles: s.articles.map(a => a.id === id ? { ...a, is_starred: a.is_starred ? 0 : 1 } : a)
      }))
    } catch (e) {
      set({ error: `切换星标失败: ${String(e)}` })
    }
  },

  markAllRead: async (feedId) => {
    try {
      await window.api.feed.articles.readAll(feedId ?? get().selectedFeedId ?? undefined)
      await get().loadFeeds()
      await get().loadArticles()
    } catch (e) {
      set({ error: `全部标记已读失败: ${String(e)}` })
    }
  },

  addCategory: async (name) => {
    try {
      await window.api.feed.categories.add(name)
      await get().loadCategories()
    } catch (e) {
      set({ error: `添加分类失败: ${String(e)}` })
    }
  },

  deleteCategory: async (id) => {
    try {
      await window.api.feed.categories.delete(id)
      await get().loadCategories()
      await get().loadFeeds()
    } catch (e) {
      set({ error: `删除分类失败: ${String(e)}` })
    }
  },

  importOpml: async (xml) => {
    try {
      await window.api.feed.importOpml(xml)
      await get().loadFeeds()
      await get().loadCategories()
      await get().loadArticles()
    } catch (e) {
      set({ error: `导入 OPML 失败: ${String(e)}` })
    }
  },

  exportOpml: async () => {
    return window.api.feed.exportOpml()
  },
}))
