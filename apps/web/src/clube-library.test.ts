// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClubePart } from '@harness/contracts'
import { translate } from './i18n/index.js'
import { TestTransport } from './test-transport.js'
import {
  ClubeMedia,
  NO_CLUBE_FILTERS,
  clubeFailureText,
  clubeSearchParams,
  itemFolderName,
  partsTotals,
  slugOf,
  withoutFrontMatter,
} from './clube-library.js'

const revoked: string[] = []
beforeEach(() => {
  revoked.length = 0
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`)
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
})

const png = { ok: true, mime: 'image/png', data: btoa('png') }

describe('what the filters ask the server', () => {
  it('sends only what is set, one value per facet, and a page size', () => {
    expect(clubeSearchParams(NO_CLUBE_FILTERS)).toEqual({ limit: 24 })
    expect(
      clubeSearchParams(
        { ...NO_CLUBE_FILTERS, query: '  marca ', kind: 'project', style: 'saas' },
        '24',
      ),
    ).toEqual({ query: 'marca', kind: 'project', style: ['saas'], cursor: '24', limit: 24 })
  })

  it('names the folder a download lands in, and the slug of an id', () => {
    expect(slugOf('projeto/p1')).toBe('p1')
    expect(itemFolderName({ id: 'projeto/p1', kind: 'project' })).toBe('clube/projetos/p1/')
    expect(itemFolderName({ id: 'animacao/a1', kind: 'animation' })).toBe('clube/animacoes/a1/')
  })
})

describe('the totals of the parts chosen', () => {
  const parts: ClubePart[] = [
    { key: 'a', label: 'a', sizeMb: 1.5, files: 1, onDisk: false },
    { key: 'b', label: 'b', sizeMb: 30, files: 2, onDisk: false },
    { key: 'c', label: 'c', sizeMb: 100, files: 3, onDisk: true },
  ]

  it('counts the size and the files of what will be fetched, never of a part on disk', () => {
    expect(partsTotals(parts, new Set(['a', 'b', 'c']))).toEqual({
      sizeMb: 31.5,
      files: 3,
      nothingToFetch: false,
    })
    expect(partsTotals(parts, new Set(['b']))).toMatchObject({ sizeMb: 30, files: 2 })
  })

  it('says nothing is to be fetched when only parts on disk are chosen, and not when none is chosen', () => {
    expect(partsTotals(parts, new Set(['c'])).nothingToFetch).toBe(true)
    expect(partsTotals(parts, new Set()).nothingToFetch).toBe(false)
  })
})

describe('the sentence of a failure', () => {
  const i18nFor = (language: 'en' | 'pt-BR') =>
    ({
      t: (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
        translate(language, key, vars),
      language,
    }) as unknown as Parameters<typeof clubeFailureText>[1]
  const english = i18nFor('en')
  const portuguese = i18nFor('pt-BR')

  it('uses the Clube own sentence only in Portuguese', () => {
    const failure = { ok: false as const, reason: 'refused' as const, message: 'Não pode agora.' }
    expect(clubeFailureText(failure, portuguese)).toBe('Não pode agora.')
    expect(clubeFailureText(failure, english)).toBe('The Clube refused the request.')
  })

  it('words the per-minute limit with the seconds', () => {
    expect(clubeFailureText({ ok: false, reason: 'rate-limit', retryAfterS: 9 }, english)).toBe(
      'Too many requests in a row. Try again in 9 seconds.',
    )
    expect(clubeFailureText({ ok: false, reason: 'rate-limit' }, portuguese)).toBe(
      'Muitos pedidos seguidos. Tente de novo em um minuto.',
    )
  })
})

describe('covers and previews', () => {
  it('fetches an address once, however many ask, and keeps the blob', async () => {
    const transport = new TestTransport(async () => png)
    const media = new ClubeMedia(transport)
    const [one, two] = await Promise.all([
      media.load('http://c.test/a.png'),
      media.load('http://c.test/a.png'),
    ])
    expect(one).toBe(two)
    expect(media.state('http://c.test/a.png')).toBe(one)
    await media.load('http://c.test/a.png')
    expect(transport.requests).toHaveLength(1)
  })

  it('remembers a failure instead of asking again', async () => {
    const transport = new TestTransport(async () => ({ ok: false, reason: 'unreachable' }))
    const media = new ClubeMedia(transport)
    expect(await media.load('http://c.test/a.png')).toBeNull()
    expect(media.state('http://c.test/a.png')).toBeNull()
    await media.load('http://c.test/a.png')
    expect(transport.requests).toHaveLength(1)
  })

  it('asks four at a time', async () => {
    let running = 0
    let most = 0
    const transport = new TestTransport(async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
      return png
    })
    const media = new ClubeMedia(transport)
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => media.load(`http://c.test/${index}.png`)),
    )
    expect(most).toBe(4)
    expect(transport.requests).toHaveLength(12)
  })

  it('lets go of every address when torn down, and can be used again after (a remount)', async () => {
    const transport = new TestTransport(async () => png)
    const media = new ClubeMedia(transport)
    const first = await media.load('http://c.test/a.png')
    media.dispose()
    expect(revoked).toEqual([first])
    expect(media.state('http://c.test/a.png')).toBeUndefined()
    const again = await media.load('http://c.test/a.png')
    expect(again).toBeTruthy()
    expect(again).not.toBe(first)
  })

  it('drops a fetch that was on its way when the tab was torn down', async () => {
    let release: () => void = () => {}
    const transport = new TestTransport(
      () => new Promise((resolve) => (release = () => resolve(png))),
    )
    const media = new ClubeMedia(transport)
    const pending = media.load('http://c.test/a.png')
    media.dispose()
    release()
    expect(await pending).toBeNull()
    expect(revoked).toHaveLength(1)
    expect(media.state('http://c.test/a.png')).toBeUndefined()
  })
})

describe('the front matter of a SKILL.md', () => {
  it('is left out of what is rendered, and a file without one is left as it is', () => {
    expect(withoutFrontMatter('---\nname: a\ndescription: b\n---\n\n# Titulo\n\ncorpo')).toBe(
      '# Titulo\n\ncorpo',
    )
    expect(withoutFrontMatter('---\r\nname: a\r\n---\r\n# Titulo')).toBe('# Titulo')
    expect(withoutFrontMatter('# Sem bloco\n\n---\n\noutro')).toBe('# Sem bloco\n\n---\n\noutro')
    expect(withoutFrontMatter('---\nsem fim\n# Titulo')).toBe('---\nsem fim\n# Titulo')
  })
})
