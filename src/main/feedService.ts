import { parseFeed, parseOpml, generateOpml } from 'feedsmith'
import FeedParser from 'feedparser'
import { Readable } from 'stream'
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

/** Max items to collect from a feed (prevents memory blowup on huge feeds). */
const MAX_ITEMS = 500

type FeedItem = {
  guid: string | null
  title: string
  url: string | null
  author: string | null
  content: string | null
  summary: string | null
  publishedAt: string | null
}

/**
 * Stream-parse an XML/Atom/RSS feed using feedparser.
 * Collects at most `MAX_ITEMS` items, then destroys the stream
 * so we never need to load the entire XML DOM into memory.
 */
function streamParseFeed(
  stream: Readable,
  feedUrl: string
): Promise<{ title: string; description: string | null; siteUrl: string | null; items: FeedItem[] }> {
  return new Promise((resolve, reject) => {
    const fp = new FeedParser({ feedurl: feedUrl })
    const items: FeedItem[] = []
    let meta: FeedParser.Meta | null = null

    fp.on('meta', (m: FeedParser.Meta) => {
      meta = m
    })

    fp.on('data', (item: FeedParser.Item) => {
      if (items.length >= MAX_ITEMS) {
        fp.destroy()
        return
      }
      items.push({
        guid: item.guid ?? item.link ?? null,
        title: item.title ?? 'Untitled',
        url: item.link ?? null,
        author: item.author ?? null,
        // feedparser merges content:encoded into summary when present
        content: (item as any)['content:encoded'] ?? item.description ?? null,
        summary: item.summary ?? item.description ?? null,
        publishedAt: item.pubdate ? new Date(item.pubdate).toISOString() : item.date ? new Date(item.date).toISOString() : null,
      })
    })

    fp.on('error', (err: Error) => {
      reject(err)
    })

    fp.on('end', () => {
      resolve({
        title: meta?.title ?? new URL(feedUrl).hostname,
        description: meta?.description ?? null,
        siteUrl: meta?.link ?? null,
        items,
      })
    })

    // Pipe the fetched response body through feedparser
    stream.pipe(fp)
  })
}

/** Strip YAML frontmatter (--- ... ---) from markdown content. */
function stripFrontmatter(raw: string | null): string | null {
  if (!raw) return raw
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('---')) return raw
  const end = trimmed.indexOf('---', 3)
  if (end === -1) return raw
  return trimmed.slice(end + 3).trimStart()
}

/** Coerce any value to string|null. Feedsmith may return objects like { type, value }. */
function toStr(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    // feedsmith wraps some fields: { type: 'html', value: '...' }
    const obj = v as Record<string, unknown>
    if ('value' in obj && typeof obj.value === 'string') return obj.value
    if ('_text' in obj && typeof obj._text === 'string') return obj._text
    // content:encoded may be { encoded: '...' }
    if ('encoded' in obj && typeof obj.encoded === 'string') return obj.encoded
    // Atom content may be { _: '...' } or similar
    if ('_' in obj && typeof obj._ === 'string') return obj._
    return null
  }
  return String(v)
}

function domParseItems(parsed: ReturnType<typeof parseFeed>): FeedItem[] {
  const { format, feed } = parsed
  const items: FeedItem[] = []

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
      guid = toStr(entry.id)
      title = toStr(entry.title) ?? 'Untitled'
      const link = Array.isArray(entry.link) ? entry.link[0] : entry.link
      url = toStr(link?.href)
      author = toStr(entry.author?.name)
      content = toStr(entry.content?.value ?? entry.content)
      summary = toStr(entry.summary?.value ?? entry.summary)
      publishedAt = toStr(entry.published ?? entry.updated)
    } else if (format === 'json') {
      const entry = item as any
      guid = toStr(entry.id)
      title = toStr(entry.title) ?? 'Untitled'
      url = toStr(entry.url ?? entry.external_url)
      author = toStr(entry.author?.name ?? entry.author)
      content = toStr(entry.content_html ?? entry.content)
      summary = toStr(entry.summary)
      publishedAt = toStr(entry.date_published ?? entry.date_modified)
    } else {
      // RSS / RDF
      const entry = item as any
      guid = toStr(entry.guid ?? entry.id ?? entry.link)
      title = toStr(entry.title) ?? 'Untitled'
      url = toStr(entry.link)
      author = toStr(entry.creator ?? entry.author)
      content = toStr(entry['content:encoded'] ?? entry.content ?? entry.description)
      summary = toStr(entry.description)
      publishedAt = toStr(entry.pubDate ?? entry.date)
    }

    items.push({
      guid,
      title,
      url,
      author,
      content: stripFrontmatter(content),
      summary: stripFrontmatter(summary),
      publishedAt,
    })
  }

  return items
}

export async function fetchAndParseFeed(url: string): Promise<{
  title: string
  description: string | null
  siteUrl: string | null
  faviconUrl: string | null
  items: FeedItem[]
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

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
    const isJson = contentType.includes('json') || url.endsWith('.json') || url.endsWith('.jsonfeed')

    // Buffer the response text and parse with feedsmith (DOM-based parser).
    // feedparser's streaming pipe has compatibility issues with Web Streams
    // and Node.js streams (stream.push() after EOF). feedsmith handles all
    // formats (RSS, Atom, JSON Feed) reliably in a single code path.
    const text = await res.text()
    if (isJson) {
      const json = JSON.parse(text)
      const parsed = { format: 'json' as const, feed: json }
      const items = domParseItems(parsed)
      return {
        title: parsed.feed.title ?? new URL(url).hostname,
        description: parsed.feed.description ?? null,
        siteUrl: typeof parsed.feed.link === 'string' ? parsed.feed.link : null,
        faviconUrl: null,
        items,
      }
    }

    const parsed = parseFeed(text)
    const items = domParseItems(parsed)
    return {
      title: (parsed.feed.title as string) ?? new URL(url).hostname,
      description: (parsed.feed.description as string) ?? null,
      siteUrl: (parsed.feed.link as string) ?? null,
      faviconUrl: null,
      items,
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
    const result = addArticle(feed.id, item.guid, item.title, item.url, item.author, item.content, item.summary, publishedAt)
    if (result) imported++
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
