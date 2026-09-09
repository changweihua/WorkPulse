import React, { useEffect, useRef } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { useToast } from '@/components/Toast'
import FeedSidebar from '@/components/rss/FeedSidebar'
import ArticleList from '@/components/rss/ArticleList'
import ArticleReader from '@/components/rss/ArticleReader'
import AddFeedDialog from '@/components/rss/AddFeedDialog'

export default function RssPage() {
  const { loadFeeds, loadCategories, loadArticles, error, clearError } = useRssStore()
  const toast = useToast()
  const prevErrorRef = useRef<string | null>(null)

  useEffect(() => {
    loadFeeds()
    loadCategories()
    loadArticles()
  }, [])

  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      toast.error(error)
      prevErrorRef.current = error
      clearError()
    }
  }, [error])

  return (
    <div className="h-full overflow-hidden flex gap-3 p-4">
      <FeedSidebar />
      <ArticleList />
      <ArticleReader />
      <AddFeedDialog />
    </div>
  )
}
