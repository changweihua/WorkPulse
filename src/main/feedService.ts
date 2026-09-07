import { parseFeed, parseOpml, generateOpml } from 'feedsmith'
import {
  addFeed,
  getFeeds,
  getFeedById,
  getFeedByUrl,
  updateFeed,
  deleteFeed,
  addArticle,
  getFeedCategories,
  addFeedCategory,
  type Feed,
  type Article,
  type FeedCategory
} from './db'
import log from 'electron-log/main'

function extractItems(parsed: ReturnType<typeof parseFeed>): Array<{
  guid: string | null
  title: string
  url: string | null
  author: string | null
  content: string | null
  summary: string | null
  publishedAt: string | null
}> {
  const { format, feed } = parsed
  const items: Array<{
    guid: string | null
    title: string
    url: string | null
    author: string | null
    content: string | null
    summary: string | null
    publishedAt: string | null
  }> = []

  for (const item of feed.items ?? []) {
    let guid: string | null = null
    let title = 'Untitled'
    let url: string | null = null
    let author: string | null = null
    let content: string | null = null
    let summary: string | null = null
    let publishedAt: string | null = null

    if (format === 'atom') {
      const entry = item as any
      guid = entry.id ?? null
      title = entry.title ?? 'Untitled'
      const link = Array.isArray(entry.link) ? entry.link[0] : entry.link
      url = link?.href ?? null
      author = entry.author?.name ?? null
      content = entry.content?.value ?? entry.content ?? null
      summary = entry.summary?.value ?? entry.summary ?? null
      publishedAt = entry.published ?? entry.updated ?? null
    } else if (format === 'json') {
      const entry = item as any
      guid = entry.id ?? null
      title = entry.title ?? 'Untitled'
      url = entry.url ?? entry.external_url ?? null
      author = entry.author?.name ?? entry.author ?? null
      content = entry.content_html ?? entry.content ?? null
      summary = entry.summary ?? null
      publishedAt = entry.date_published ?? entry.date_modified ?? null
    } else {
      // RSS / RDF
      const entry = item as any
      guid = entry.guid ?? entry.id ?? entry.link ?? null
      title = entry.title ?? 'Untitled'
      url = entry.link ?? null
      author = entry.creator ?? entry.author ?? null
      content = entry['content:encoded'] ?? entry.content ?? entry.description ?? null
      summary = entry.description ?? null
      publishedAt = entry.pubDate ?? entry.date ?? null
    }

    items.push({ guid, title, url, author, content, summary, publishedAt })
  }

  return items
}

export async function fetchAndParseFeed(url: string): Promise<{
  title: string
  description: string | null
  siteUrl: string | null
  faviconUrl: string | null
  items: Array<{
    guid: string | null
    title: string
    url: string | null
    author: string | null
    content: string | null
    summary: string | null
    publishedAt: string | null
  }>
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WorkPulse RSS Reader/1.0',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*'
      }
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()

    let parsed: ReturnType<typeof parseFeed>
    if (contentType.includes('json') || url.endsWith('.json') || url.endsWith('.jsonfeed')) {
      const json = JSON.parse(text)
      parsed = { format: 'json', feed: json }
    } else {
      parsed = parseFeed(text)
    }

    const items = extractItems(parsed)
    const feedTitle = parsed.feed.title ?? new URL(url).hostname
    const description = parsed.feed.description ?? null
    let siteUrl: string | null = null
    if (typeof parsed.feed.link === 'string') {
      siteUrl = parsed.feed.link
    } else if (Array.isArray(parsed.feed.link)) {
      siteUrl = parsed.feed.link[0]?.href ?? null
    }

    return {
      title: feedTitle,
      description,
      siteUrl,
      faviconUrl: null,
      items
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function subscribeFeed(url: string, categoryId?: number | null): Promise<Feed> {
  const existing = getFeedByUrl(url)
  if (existing) throw new Error('Already subscribed')

  const info = await fetchAndParseFeed(url)
  const feed = addFeed(url, info.title, info.description, info.siteUrl, info.faviconUrl, categoryId ?? null)

  let imported = 0
  for (const item of info.items) {
    const publishedAt = item.publishedAt ? new Date(item.publishedAt).toISOString() : null
    addArticle(feed.id, item.guid, item.title, item.url, item.author, item.content, item.summary, publishedAt)
    imported++
  }

  updateFeed(feed.id, { last_fetched_at: new Date().toISOString() })
  log.info(`[RSS] Subscribed to "${info.title}" — ${imported} articles imported`)
  return getFeedById(feed.id)!
}

export async function refreshFeed(feedId: number): Promise<{ newArticles: number; updated: number }> {
  const feed = getFeedById(feedId)
  if (!feed) throw new Error('Feed not found')

  const info = await fetchAndParseFeed(feed.url)
  let newArticles = 0
  for (const item of info.items) {
    const publishedAt = item.publishedAt ? new Date(item.publishedAt).toISOString() : null
    const result = addArticle(feed.id, item.guid, item.title, item.url, item.author, item.content, item.summary, publishedAt)
    if (result) newArticles++
  }

  updateFeed(feedId, {
    title: info.title,
    description: info.description,
    site_url: info.siteUrl,
    last_fetched_at: new Date().toISOString()
  })

  return { newArticles, updated: info.items.length }
}

export async function refreshAllFeeds(): Promise<{ feedId: number; result: { newArticles: number; updated: number } }[]> {
  const feeds = getFeeds()
  const results: { feedId: number; result: { newArticles: number; updated: number } }[] = []
  for (const feed of feeds) {
    if (feed.is_muted) continue
    try {
      const result = await refreshFeed(feed.id)
      results.push({ feedId: feed.id, result })
    } catch (e) {
      log.warn(`[RSS] Failed to refresh feed ${feed.id}: ${e}`)
    }
  }
  return results
}

export function importOpmlData(xml: string): { feeds: Feed[]; categories: FeedCategory[] } {
  const opml = parseOpml(xml)
  const importedFeeds: Feed[] = []
  const importedCategories: FeedCategory[] = []

  function processOutlines(outlines: any[], parentId?: number) {
    for (const outline of outlines ?? []) {
      if (outline.xmlUrl || outline.xmlurl) {
        // This is a feed
        const feedUrl = outline.xmlUrl ?? outline.xmlurl
        const existing = getFeedByUrl(feedUrl)
        if (!existing) {
          try {
            const catId = parentId ?? null
            const feed = addFeed(feedUrl, outline.title ?? outline.text ?? feedUrl, null, outline.htmlUrl ?? outline.htmlurl ?? null, null, catId)
            importedFeeds.push(feed)
          } catch (e) {
            log.warn(`[RSS] Failed to import feed ${feedUrl}: ${e}`)
          }
        }
      } else if (outline.outlines?.length) {
        // This is a category
        const cat = addFeedCategory(outline.title ?? outline.text ?? 'Untitled')
        importedCategories.push(cat)
        processOutlines(outline.outlines, cat.id)
      }
    }
  }

  processOutlines(opml.body?.outlines ?? [])
  return { feeds: importedFeeds, categories: importedCategories }
}

export function generateOpmlData(): string {
  const categories = getFeedCategories()
  const feeds = getFeeds()

  const categoryMap = new Map<number, Feed[]>()
  const uncategorizedFeeds: Feed[] = []
  for (const feed of feeds) {
    if (feed.category_id) {
      const arr = categoryMap.get(feed.category_id) ?? []
      arr.push(feed)
      categoryMap.set(feed.category_id, arr)
    } else {
      uncategorizedFeeds.push(feed)
    }
  }

  const outlines: any[] = []

  for (const cat of categories) {
    const catFeeds = categoryMap.get(cat.id) ?? []
    if (catFeeds.length === 0) continue
    outlines.push({
      text: cat.name,
      title: cat.name,
      outlines: catFeeds.map(f => ({
        text: f.title ?? f.url,
        title: f.title ?? f.url,
        type: 'rss',
        xmlUrl: f.url,
        htmlUrl: f.site_url ?? ''
      }))
    })
  }

  for (const feed of uncategorizedFeeds) {
    outlines.push({
      text: feed.title ?? feed.url,
      title: feed.title ?? feed.url,
      type: 'rss',
      xmlUrl: feed.url,
      htmlUrl: feed.site_url ?? ''
    })
  }

  return generateOpml({
    head: { title: 'WorkPulse RSS Subscriptions', dateCreated: new Date() },
    body: { outlines }
  })
}
