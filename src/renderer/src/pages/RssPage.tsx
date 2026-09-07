import React, { useEffect } from 'react'
import { useRssStore } from '@/stores/rssStore'
import FeedSidebar from '@/components/rss/FeedSidebar'
import ArticleList from '@/components/rss/ArticleList'
import ArticleReader from '@/components/rss/ArticleReader'
import AddFeedDialog from '@/components/rss/AddFeedDialog'

export default function RssPage() {
  const { loadFeeds, loadCategories, loadArticles } = useRssStore()

  useEffect(() => {
    loadFeeds()
    loadCategories()
    loadArticles()
  }, [])

  return (
    <div className="h-full overflow-hidden flex gap-3 p-4">
      <FeedSidebar />
      <ArticleList />
      <ArticleReader />
      <AddFeedDialog />
    </div>
  )
}
