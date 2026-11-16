import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PreviewPlan } from '@harness/design-agent'
import { discoverReviewPages, type FetchText } from './design-pages.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const commandPlan: PreviewPlan = {
  version: 1,
  kind: 'command',
  command: 'pnpm',
  args: ['dev', '--port', '5173'],
  cwd: '.',
  url: 'http://127.0.0.1:5173',
  viewports: [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ],
}

/** A site served from memory: a route answers with its HTML, any other with nothing. */
const site =
  (pages: Record<string, string>): FetchText =>
  async (url) => {
    const { pathname } = new URL(url)
    return pages[pathname]
  }

describe('page discovery on a running preview', () => {
  it('follows links from the entry two clicks deep, and drops a dead link', async () => {
    const found = await discoverReviewPages({
      plan: commandPlan,
      previewUrl: 'http://127.0.0.1:5173/',
      workspacePath: os.tmpdir(),
      ceiling: 6,
      fetchText: site({
        '/': '<a href="/menu">Menu</a> <a href="/contact">Contact</a> <a href="/gone">Gone</a>',
        '/menu': '<a href="/menu/bread">Bread</a> <a href="/">Home</a>',
        '/contact': '<p>Contact</p>',
        '/menu/bread': '<p>Bread</p>',
      }),
    })
    expect(found.pages.map(({ route }) => route)).toEqual(['/', '/menu', '/contact', '/menu/bread'])
    expect(found.total).toBe(4)
    expect(found.cut).toEqual([])
  })

  it('reads the sitemap and stops at the ceiling, saying what it left out', async () => {
    const sitemap = `<urlset>${Array.from({ length: 8 }, (_, index) => `<url><loc>http://127.0.0.1:5173/p${index}</loc></url>`).join('')}</urlset>`
    const pages = Object.fromEntries([
      ['/', '<p>Home</p>'],
      ['/sitemap.xml', sitemap],
      ...Array.from({ length: 8 }, (_, index) => [`/p${index}`, '<p>x</p>']),
    ])
    const found = await discoverReviewPages({
      plan: commandPlan,
      previewUrl: 'http://127.0.0.1:5173/',
      workspacePath: os.tmpdir(),
      ceiling: 3,
      fetchText: site(pages),
    })
    expect(found.pages.map(({ route }) => route)).toEqual(['/', '/p0', '/p1'])
    expect(found.total).toBe(9)
    expect(found.cut).toHaveLength(6)
  })

  it('finds the HTML files of a static project without asking the server, and the entry first', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'design-pages-'))
    roots.push(root)
    for (const file of ['index.html', 'cardapio.html', 'blog/index.html']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), '<p>x</p>')
    }
    const plan: PreviewPlan = {
      version: 1,
      kind: 'static',
      entry: 'index.html',
      cwd: '.',
      url: 'http://127.0.0.1:4173/',
      viewports: commandPlan.viewports,
    }
    const found = await discoverReviewPages({
      plan,
      previewUrl: 'http://127.0.0.1:4173/',
      workspacePath: root,
      ceiling: 6,
      fetchText: async () => undefined,
    })
    expect(found.pages.map(({ route }) => route)).toEqual(['/', '/blog/', '/cardapio.html'])
  })

  it('reviews only the entry when the server answers nothing else', async () => {
    const found = await discoverReviewPages({
      plan: commandPlan,
      previewUrl: 'http://127.0.0.1:5173/app',
      workspacePath: os.tmpdir(),
      ceiling: 6,
      fetchText: async () => undefined,
    })
    expect(found.pages).toEqual([{ route: '/app', source: 'entry' }])
  })
})
