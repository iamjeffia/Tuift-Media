import path from 'node:path'
import {
  linkedRoutes,
  selectReviewPages,
  sitemapRoutes,
  staticPageRoutes,
  type DiscoveredPage,
  type PageSelection,
  type PreviewPlan,
} from '@harness/design-agent'

const FETCH_TIMEOUT_MS = 4_000
const MAX_HTML_BYTES = 600_000
/** Pages fetched to read their links: enough for a small site, bounded for a large one. */
const MAX_CRAWL_FETCHES = 14

export type FetchText = (url: string, signal?: AbortSignal) => Promise<string | undefined>

/** The preview server's own answer, as text: only a page (HTML) that answered 200, and not too long. */
export const fetchPreviewText: FetchText = async (url, signal) => {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
        : AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return undefined
    const type = response.headers.get('content-type') ?? ''
    if (!/html|xml|text\/plain/i.test(type)) return undefined
    const text = await response.text()
    return text.slice(0, MAX_HTML_BYTES)
  } catch {
    return undefined
  }
}

export interface DiscoverInput {
  plan: PreviewPlan
  /** The URL the running preview serves (the actual port). */
  previewUrl: string
  workspacePath: string
  ceiling: number
  signal?: AbortSignal | undefined
  fetchText?: FetchText | undefined
}

/**
 * The pages a review looks at. Found three ways: the HTML files of a static project, the links
 * between pages (same origin, anchors only, two clicks deep from the entry) and the project's
 * sitemap.xml. A page that only a script or a login reaches, a route with a parameter, and a
 * file no page links to on a dev server are not found, and the answer says how many pages were
 * found so the person can see when the ceiling or the search left some out.
 */
export async function discoverReviewPages(input: DiscoverInput): Promise<PageSelection> {
  const fetchText = input.fetchText ?? fetchPreviewText
  const base = new URL(input.previewUrl)
  const entryRoute = base.pathname || '/'
  const found: DiscoveredPage[] = [{ route: entryRoute, source: 'entry' }]
  const known = new Set([entryRoute])
  const add = (route: string, source: DiscoveredPage['source']) => {
    if (known.has(route)) return
    known.add(route)
    found.push({ route, source })
  }

  if (input.plan.kind === 'static') {
    try {
      const root = path.resolve(input.workspacePath, input.plan.cwd)
      for (const page of staticPageRoutes(root, input.plan.entry)) add(page.route, 'file')
    } catch {
      // A folder that cannot be listed leaves the links to find the pages.
    }
  }

  // Links, breadth first from the entry, to at most two clicks.
  let frontier = [entryRoute]
  let fetches = 0
  const verified = new Set<string>()
  for (let depth = 0; depth < 2 && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const route of frontier) {
      if (fetches >= MAX_CRAWL_FETCHES || input.signal?.aborted) break
      fetches += 1
      const html = await fetchText(new URL(route, base).href, input.signal)
      if (html === undefined) continue
      verified.add(route)
      for (const link of linkedRoutes(html, new URL(route, base).href, base.origin)) {
        if (!known.has(link)) {
          add(link, 'link')
          next.push(link)
        }
      }
    }
    frontier = next
  }

  const sitemap = await fetchText(new URL('/sitemap.xml', base).href, input.signal)
  if (sitemap) for (const route of sitemapRoutes(sitemap, base.origin)) add(route, 'sitemap')

  // A linked route that does not answer with a page is dropped, so a dead link is never a page.
  const answered: DiscoveredPage[] = []
  for (const page of found) {
    const sure = page.source === 'entry' || page.source === 'file' || verified.has(page.route)
    // Only the pages that will be captured are worth a request; the rest are counted as found.
    const wanted = answered.length < input.ceiling
    if (sure || !wanted || fetches >= MAX_CRAWL_FETCHES + 8 || input.signal?.aborted) {
      answered.push(page)
      continue
    }
    fetches += 1
    if ((await fetchText(new URL(page.route, base).href, input.signal)) !== undefined) {
      answered.push(page)
    }
  }
  return selectReviewPages(answered, input.ceiling)
}
