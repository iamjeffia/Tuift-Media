import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * How many pages one run captures and reviews. Each page costs a capture (about ten seconds at
 * two widths) and a review turn (about twenty), so six pages is about three minutes of looking;
 * a site of forty pages would run for the better part of an hour and would drown the person in
 * findings. The pages past the ceiling are named in the answer, never skipped silently.
 */
export const MAX_REVIEW_PAGES = 6

export interface DiscoveredPage {
  /** The page's path on the preview server, such as `/` or `/menu.html`. */
  route: string
  /** `file`: found on disk. `link`: linked from a page already found. `sitemap`: listed in sitemap.xml. */
  source: 'entry' | 'file' | 'link' | 'sitemap'
}

export interface PageSelection {
  pages: DiscoveredPage[]
  /** How many pages were found in all. */
  total: number
  /** The routes left out by the ceiling, in the order they were found. */
  cut: string[]
}

const SOURCE_EXTENSIONS = /\.(?:html?|tsx|jsx|astro|vue|svelte)$/i
/** Folders that hold copies, partials and tools, not pages of the site. */
const NOT_PAGES = new Set([
  'node_modules',
  '.git',
  '.taste',
  '.design',
  '.next',
  '.astro',
  '.svelte-kit',
  'partials',
  'components',
  'includes',
  'templates',
  'vendor',
  'test',
  'tests',
  '__tests__',
  'assets',
  'public-assets',
  'coverage',
])
const MAX_ENTRIES = 2_000

/** Whether the folder already holds a page or an app to change or review. A shallow look. */
export function workspaceHasPage(workspacePath: string): boolean {
  let seen = 0
  const visit = (directory: string, depth: number): boolean => {
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch {
      return false
    }
    for (const name of names) {
      if (++seen > MAX_ENTRIES) return false
      if (NOT_PAGES.has(name) || name.startsWith('.')) continue
      const file = path.join(directory, name)
      let info
      try {
        info = statSync(file)
      } catch {
        continue
      }
      if (info.isFile() && SOURCE_EXTENSIONS.test(name)) return true
      if (info.isDirectory() && depth < 3 && visit(file, depth + 1)) return true
    }
    return false
  }
  return visit(workspacePath, 0)
}

/**
 * The pages of a static project: its HTML files up to two folders deep, the entry first.
 * Pages that only a script reaches, and routes a framework builds from a folder of components,
 * are not found this way; they come from the links of the pages and from sitemap.xml.
 */
export function staticPageRoutes(root: string, entry: string): DiscoveredPage[] {
  const found: string[] = []
  const visit = (directory: string, depth: number) => {
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch {
      return
    }
    for (const name of names.sort()) {
      if (found.length >= MAX_ENTRIES) return
      if (NOT_PAGES.has(name) || name.startsWith('.')) continue
      const file = path.join(directory, name)
      let info
      try {
        info = statSync(file)
      } catch {
        continue
      }
      if (info.isDirectory()) {
        if (depth < 2) visit(file, depth + 1)
      } else if (/\.html?$/i.test(name)) {
        found.push(path.relative(root, file).split(path.sep).join('/'))
      }
    }
  }
  visit(root, 0)
  const entryPath = entry.split(path.sep).join('/')
  const ordered = [entryPath, ...found.filter((file) => file !== entryPath)]
  return [...new Set(ordered)].map((file, index) => ({
    route: routeOfFile(file),
    source: index === 0 ? ('entry' as const) : ('file' as const),
  }))
}

/** `index.html` is `/`, `menu/index.html` is `/menu/`, `contact.html` is `/contact.html`. */
export function routeOfFile(file: string): string {
  const normalized = file.replace(/^\.?\//, '')
  if (normalized === 'index.html' || normalized === 'index.htm') return '/'
  if (/(?:^|\/)index\.html?$/i.test(normalized)) {
    return `/${normalized.replace(/index\.html?$/i, '')}`
  }
  return `/${normalized}`
}

/**
 * The same-origin routes a page links to, in document order: anchors only, no files that are
 * not pages (images, styles, documents), no fragments or queries, no `mailto:` or `tel:`.
 */
export function linkedRoutes(html: string, pageUrl: string, origin: string): string[] {
  const routes: string[] = []
  const anchor = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  for (const match of html.matchAll(anchor)) {
    const href = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (
      !href ||
      href.startsWith('#') ||
      /^(?:mailto|tel|sms|javascript|data|whatsapp):/i.test(href)
    )
      continue
    let url: URL
    try {
      url = new URL(href, pageUrl)
    } catch {
      continue
    }
    if (url.origin !== origin) continue
    // `/index.html` and `/` are one page, as are `/menu/index.html` and `/menu/`.
    const route = url.pathname.replace(/\/index\.html?$/i, '/')
    const last = route.split('/').pop() ?? ''
    if (last.includes('.') && !/\.html?$/i.test(last)) continue
    if (!routes.includes(route)) routes.push(route)
  }
  return routes
}

/** The routes a sitemap.xml lists on the same origin. */
export function sitemapRoutes(xml: string, origin: string): string[] {
  const routes: string[] = []
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const url = new URL(match[1]!)
      if (url.origin === origin || url.hostname === '127.0.0.1') {
        const route = url.pathname || '/'
        if (!routes.includes(route)) routes.push(route)
      }
    } catch {
      // Not a URL.
    }
  }
  return routes
}

/** The first `ceiling` pages, the entry first; the rest are named so the answer can say so. */
export function selectReviewPages(
  found: readonly DiscoveredPage[],
  ceiling = MAX_REVIEW_PAGES,
): PageSelection {
  const unique: DiscoveredPage[] = []
  for (const page of found) {
    if (!unique.some((entry) => entry.route === page.route)) unique.push(page)
  }
  return {
    pages: unique.slice(0, ceiling),
    total: unique.length,
    cut: unique.slice(ceiling).map(({ route }) => route),
  }
}
