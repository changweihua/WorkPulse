import React, { useEffect, useRef } from 'react';
import { useRssStore } from '@/stores/rssStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/Toast';
import { SkeletonLine, SkeletonRect } from '@/components/Skeleton';
import { FadeIn } from '@/components/Motion';
import FeedSidebar from '@/components/rss/FeedSidebar';
import ArticleList from '@/components/rss/ArticleList';
import ArticleReader from '@/components/rss/ArticleReader';
import AddFeedDialog from '@/components/rss/AddFeedDialog';

function RssSkeleton(): React.ReactNode {
  return (
    <div className="h-full overflow-hidden flex gap-3 p-4">
      {/* FeedSidebar 骨架 */}
      <div className="w-64 shrink-0 surface-card rounded-xl p-4 space-y-3">
        <SkeletonLine width="50%" height="1rem" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonLine
              key={i}
              width={i === 4 ? '70%' : '100%'}
              height="0.875rem"
              rounded="0.5rem"
            />
          ))}
        </div>
      </div>
      {/* ArticleList 骨架 */}
      <div className="w-80 shrink-0 surface-card rounded-xl p-4 space-y-3">
        <SkeletonLine width="40%" height="1rem" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 space-y-2">
              <SkeletonLine width={`${70 + i * 5}%`} height="0.8rem" />
              <SkeletonLine width="55%" height="0.625rem" />
            </div>
          ))}
        </div>
      </div>
      {/* ArticleReader 骨架 */}
      <div className="flex-1 surface-card rounded-xl p-6 space-y-4">
        <SkeletonLine width="60%" height="1.25rem" />
        <SkeletonLine width="35%" height="0.625rem" />
        <div className="pt-3 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonLine key={i} width={i === 5 ? '45%' : '100%'} height="0.75rem" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RssPage() {
  const { loadFeeds, loadCategories, loadArticles, error, clearError, feeds, articles } =
    useRssStore(
      useShallow((s) => ({
        loadFeeds: s.loadFeeds,
        loadCategories: s.loadCategories,
        loadArticles: s.loadArticles,
        error: s.error,
        clearError: s.clearError,
        feeds: s.feeds,
        articles: s.articles,
      })),
    );
  const toast = useToast();
  const prevErrorRef = useRef<string | null>(null);
  const loading = feeds.length === 0 && articles.length === 0;

  useEffect(() => {
    loadFeeds();
    loadCategories();
    loadArticles();
  }, []);

  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      toast.error(error);
      prevErrorRef.current = error;
      clearError();
    }
  }, [error]);

  if (loading) {
    return (
      <FadeIn>
        <RssSkeleton />
      </FadeIn>
    );
  }

  return (
    <div className="h-full overflow-hidden flex gap-3 p-4">
      <FeedSidebar />
      <ArticleList />
      <ArticleReader />
      <AddFeedDialog />
    </div>
  );
}
