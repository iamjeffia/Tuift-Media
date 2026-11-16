import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  linkedRoutes,
  MAX_REVIEW_PAGES,
  routeOfFile,
  selectReviewPages,
  sitemapRoutes,
  staticPageRoutes,
  workspaceHasPage,
} from './page-discovery.js'
import { fallbackPreviewPlan, staticPreviewPlan } from './preview.js'

const roots: string[] = []
function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'design-pages-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('page discovery', () => {
  it('finds the pages of a static project, the entry first, and leaves partials and dependencies out', () => {
    const root = project({
      'index.html': '<h1>Home</h1>',
      'cardapio.html': '',
      'contato.html': '',
      'blog/index.html': '',
      'blog/post.html': '',
      'partials/header.html': '',
      'node_modules/x/index.html': '',
      '.taste/page.html': '',
      'styles.css': '',
    })
    expect(staticPageRoutes(root, 'index.html').map(({ route }) => route)).toEqual([
      '/',
      '/blog/',
      '/blog/post.html',
      '/cardapio.html',
      '/contato.html',
    ])
  })

  it('names routes the way a static server serves them', () => {
    expect(routeOfFile('index.html')).toBe('/')
    expect(routeOfFile('menu/index.html')).toBe('/menu/')
    expect(routeOfFile('contact.html')).toBe('/contact.html')
  })

  it('reads the pages a page links to, and only those', () => {
    const html = `
      <a href="/cardapio">Cardápio</a> <a href='contato.html'>Contato</a>
      <a href="#topo">Topo</a> <a href="mailto:a@b.c">Mail</a> <a href="https://wa.me/55">Zap</a>
      <a href="/img/foto.png">Foto</a> <a href="/cardapio?x=1#y">Again</a> <a href="/docs/guia.pdf">PDF</a>
      <a href="index.html">Home</a> <a href="/menu/index.html">Menu</a>`
    expect(linkedRoutes(html, 'http://127.0.0.1:4173/', 'http://127.0.0.1:4173')).toEqual([
      '/cardapio',
      '/contato.html',
      '/',
      '/menu/',
    ])
  })

  it('reads a sitemap on the same origin', () => {
    const xml =
      '<urlset><url><loc>http://127.0.0.1:4173/sobre</loc></url><url><loc>https://example.com/x</loc></url></urlset>'
    expect(sitemapRoutes(xml, 'http://127.0.0.1:4173')).toEqual(['/sobre'])
  })

  it('stops at the ceiling, names what it left out, and counts what it found', () => {
    const found = Array.from({ length: 9 }, (_, index) => ({
      route: index === 0 ? '/' : `/p${index}.html`,
      source: index === 0 ? ('entry' as const) : ('file' as const),
    }))
    const selection = selectReviewPages([...found, found[2]!])
    expect(MAX_REVIEW_PAGES).toBe(6)
    expect(selection.pages).toHaveLength(6)
    expect(selection.total).toBe(9)
    expect(selection.cut).toEqual(['/p6.html', '/p7.html', '/p8.html'])
    expect(selection.pages[0]!.route).toBe('/')
  })

  it('knows whether a folder already holds a page', () => {
    expect(workspaceHasPage(project({ 'index.html': '' }))).toBe(true)
    expect(workspaceHasPage(project({ 'src/App.tsx': '' }))).toBe(true)
    expect(workspaceHasPage(project({ 'README.md': '', 'notes/todo.txt': '' }))).toBe(false)
    expect(workspaceHasPage(project({ 'node_modules/x/index.html': '' }))).toBe(false)
  })
})

describe('preview without a model', () => {
  it('serves a plain static project itself', () => {
    const plan = staticPreviewPlan(project({ 'index.html': '<h1>x</h1>' }))
    expect(plan).toMatchObject({ kind: 'static', entry: 'index.html', cwd: '.' })
    expect(plan!.viewports.map(({ width }) => width)).toEqual([1440, 390])
  })

  it('leaves a project with its own dev script to the Preview phase, and has a fallback for known tools', () => {
    const root = project({
      'index.html': '',
      'package.json': JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^7' } }),
      'pnpm-lock.yaml': '',
    })
    expect(staticPreviewPlan(root)).toBeUndefined()
    expect(fallbackPreviewPlan(root)).toMatchObject({
      kind: 'command',
      command: 'pnpm',
      args: ['dev', '--host', '127.0.0.1', '--port', '5173'],
      url: 'http://127.0.0.1:5173',
    })
    const unknown = project({ 'package.json': JSON.stringify({ scripts: { dev: 'serve-it' } }) })
    expect(fallbackPreviewPlan(unknown)).toBeUndefined()
  })
})
