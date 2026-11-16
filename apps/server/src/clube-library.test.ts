import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClubeJob } from '@harness/contracts'
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore, zip } from './clube-fake.test-support.js'
import { ClubeLibrary } from './clube-library.js'
import { loadInstalledSkills, readInstalledRecord } from './installed-skills.js'
import { SkillCatalog } from './skill-catalog.js'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function folder(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `clube-panel-${name}-`))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

async function setup(options: { link?: boolean; plan?: FakeClube['plan'] } = {}) {
  const fake = new FakeClube()
  await fake.start()
  cleanups.push(() => fake.stop())
  if (options.plan) fake.plan = options.plan
  const clube = new ClubeAccount({ origin: fake.origin, store: new MemoryClubeStore() })
  if (options.link !== false) {
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(() => expect(clube.linked()).toBe(true))
  }
  const project = folder('project')
  const skillsRoot = path.join(folder('data'), 'third-party-skills')
  const changed: string[] = []
  const catalog = new SkillCatalog({
    entries: () => [],
    root: skillsRoot,
    onChanged: (provider, projectPath) => changed.push(`${provider}:${projectPath}`),
  })
  const logs: string[] = []
  const library = new ClubeLibrary({
    clube,
    log: (line) => logs.push(line),
    installSkill: (skill, stage, where) =>
      catalog.installStaged(where.provider, where.projectPath, skill, stage),
  })
  return { fake, clube, library, project, skillsRoot, catalog, changed, logs }
}

async function finished(library: ClubeLibrary, jobId: string): Promise<ClubeJob> {
  let last: ClubeJob | undefined
  await vi.waitFor(
    () => {
      const result = library.job(jobId)
      if (!result.ok) throw new Error('no job')
      last = result.job
      expect(['done', 'failed', 'cancelled']).toContain(last.state)
    },
    { timeout: 10_000 },
  )
  return last!
}

async function download(
  library: ClubeLibrary,
  project: string,
  id: string,
  parts?: string[],
): Promise<ClubeJob> {
  const started = await library.download(project, id, parts)
  if (!started.ok) throw new Error(`not started: ${started.reason}`)
  return finished(library, started.jobId)
}

function tree(root: string, base = root): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(root, entry.name)
      return entry.isDirectory()
        ? tree(full, base)
        : [path.relative(base, full).replaceAll('\\', '/')]
    })
    .sort()
}

describe('searching the library', () => {
  it('turns the Clube words into items, facets and a cursor, and pages by it', async () => {
    const { library, fake } = await setup()
    const first = await library.search({ limit: 3 })
    if (!first.ok) throw new Error('search failed')
    expect(first.total).toBe(6)
    expect(first.items).toHaveLength(3)
    expect(first.items[0]).toMatchObject({
      id: 'animacao/marca-pulsante',
      kind: 'animation',
      title: 'Marca pulsante',
      access: 'subscriber',
    })
    expect(first.items[0]!.cover).toBe(`${fake.origin}/media/capa/marca-pulsante.png`)
    expect(first.facets.kind.map((entry) => entry.value)).toEqual([
      'animation',
      'project',
      'reference',
      'skill',
      'music',
    ])
    expect(first.next).toBe('3')
    const second = await library.search({ limit: 3, cursor: first.next! })
    if (!second.ok) throw new Error('search failed')
    expect(second.items.map((item) => item.id)).toEqual([
      'referencia/r1',
      'skill/ritmo-de-corte',
      'musica/m1',
    ])
    expect(second.next).toBeNull()
  })

  it('sends the term, the kind and several values of a facet joined by commas', async () => {
    const { library, fake } = await setup()
    await library.search({
      query: 'marca',
      kind: 'animation',
      style: ['minimal', 'saas'],
      tool: ['after-effects'],
    })
    const sent = new URLSearchParams(fake.library.searches.at(-1))
    expect(sent.get('q')).toBe('marca')
    expect(sent.get('tipo')).toBe('animacao')
    expect(sent.get('estilo')).toBe('minimal,saas')
    expect(sent.get('ferramenta')).toBe('after-effects')
  })

  it('answers an empty search with the Clube notice, not an error', async () => {
    const { library } = await setup()
    const found = await library.search({ query: 'nada-disso' })
    expect(found).toMatchObject({ ok: true, total: 0, items: [], notice: 'Nada encontrado.' })
  })

  it('hides an item for the account in every later search', async () => {
    const { library, fake } = await setup()
    expect(await library.signal('referencia/r1', 'hide')).toEqual({ ok: true })
    expect(fake.library.signals).toEqual([{ id: 'referencia/r1', sinal: 'ocultar' }])
    const found = await library.search({})
    if (!found.ok) throw new Error('search failed')
    expect(found.items.map((item) => item.id)).not.toContain('referencia/r1')
  })
})

describe('what the Clube refuses', () => {
  it('says a free or trial account is not a subscriber', async () => {
    for (const plan of ['grátis', 'teste'] as const) {
      const { library } = await setup({ plan })
      expect(await library.search({})).toEqual({ ok: false, reason: 'no-subscription' })
    }
  })

  it('says the per-minute limit with the seconds to wait', async () => {
    const { library, fake } = await setup()
    fake.library.retryAfter = 17
    expect(await library.search({})).toEqual({ ok: false, reason: 'rate-limit', retryAfterS: 17 })
    // The limits route answers outside that limit and so is not blocked by it.
    expect((await library.limits()).ok).toBe(true)
  })

  it('says not linked without calling the Clube', async () => {
    const { library, fake } = await setup({ link: false })
    expect(await library.search({})).toEqual({ ok: false, reason: 'not-linked' })
    expect(await library.item('projeto/p1')).toEqual({ ok: false, reason: 'not-linked' })
    expect(fake.library.searches).toEqual([])
  })

  it('refuses an id that is not an id of the library before any request', async () => {
    const { library, fake } = await setup()
    for (const id of ['../x', 'projeto/../x', 'foo/bar', 'projeto/', 'projeto/a/b']) {
      expect(await library.item(id)).toEqual({ ok: false, reason: 'not-found' })
    }
    expect(fake.library.opened).toEqual([])
  })
})

describe('the record of an item', () => {
  it('is opened only when asked for: a search opens nothing', async () => {
    const { library, fake } = await setup()
    await library.search({})
    expect(fake.library.opened).toEqual([])
  })

  it('brings the analysis, the aspects that are not null and the prompt of an animation, with its files as parts', async () => {
    const { library } = await setup()
    const opened = await library.item('animacao/marca-pulsante')
    if (!opened.ok) throw new Error('not opened')
    const { record } = opened
    expect(record.analysis).toContain('pulsa')
    expect(record.aspects).toEqual({
      animation: 'Mola curta.',
      colors: 'Duas cores chapadas.',
      typography: undefined,
      transition: undefined,
      sound: undefined,
    })
    expect(record.prompt).toBe('Faça um logotipo pulsar duas vezes.')
    expect(record.parts.map((part) => [part.key, part.files, part.onDisk])).toEqual([
      ['preview', 1, false],
      ['modelo', 1, false],
    ])
  })

  it('lists a project parts and sizes from its own route, which gives no link and costs no file', async () => {
    const { library, fake } = await setup()
    const before = fake.library.filesToday
    const opened = await library.item('projeto/p1')
    if (!opened.ok) throw new Error('not opened')
    expect(opened.record.parts.map((part) => part.key)).toEqual([
      'guia',
      'audio',
      'projeto',
      'render',
    ])
    expect(opened.record.parts[3]!.sizeMb).toBeCloseTo(3000 / 1048576, 5)
    expect(fake.library.filesToday).toBe(before)
  })

  it('brings a reference with its credits, which move once however many times it is opened', async () => {
    const { library } = await setup()
    const one = await library.item('referencia/r1')
    const two = await library.item('referencia/r1')
    if (!one.ok || !two.ok) throw new Error('not opened')
    expect(one.record.original).toBe('https://example.test/original')
    expect(one.record.credits).toEqual({ used: 1, of: 300, period: '30 dias' })
    expect(two.record.credits).toEqual({ used: 1, of: 300, period: '30 dias' })
  })

  it('brings a skill with the whole SKILL.md as its analysis, and never the install command', async () => {
    const { library } = await setup()
    const opened = await library.item('skill/ritmo-de-corte')
    if (!opened.ok) throw new Error('not opened')
    expect(opened.record.analysis).toContain('name: ritmo-de-corte')
    expect(JSON.stringify(opened.record)).not.toContain('npx')
    expect(opened.record.parts).toEqual([])
  })

  it('brings a music record with the three previews and its catalogued facts', async () => {
    const { library, fake } = await setup()
    const opened = await library.item('musica/m1')
    if (!opened.ok) throw new Error('not opened')
    expect(opened.record.music).toEqual({
      previews: {
        full: `${fake.origin}/media/previa/m1-completa.mp3`,
        instrumental: `${fake.origin}/media/previa/m1-instrumental.mp3`,
        vocal: `${fake.origin}/media/previa/m1-vocal.mp3`,
      },
      bpm: 84,
      key: 'Am',
      genre: 'cinematic',
      moods: ['tenso'],
    })
  })

  it('marks a part already complete in the project', async () => {
    const { library, project } = await setup()
    await download(library, project, 'projeto/p1', ['guia'])
    const opened = await library.item('projeto/p1', project)
    if (!opened.ok) throw new Error('not opened')
    expect(opened.record.parts.map((part) => [part.key, part.onDisk])).toEqual([
      ['guia', true],
      ['audio', false],
      ['projeto', false],
      ['render', false],
    ])
  })
})

describe('covers and previews', () => {
  it('fetches an open cover from the Clube origin with no token', async () => {
    const { library, fake } = await setup()
    const media = await library.media(`${fake.origin}/media/capa/marca-pulsante.png`)
    expect(media).toMatchObject({ ok: true, mime: 'image/png' })
    expect(fake.library.mediaCalls).toHaveLength(1)
    expect(fake.library.mediaCalls[0]!.authorization).toBeUndefined()
  })

  it('refuses any address that is not on the Clube origin before a request', async () => {
    const { library, fake } = await setup()
    for (const link of [
      'http://example.invalid/capa.png',
      `${fake.origin.replace('127.0.0.1', 'localhost')}/media/capa/x.png`,
      'file:///etc/passwd',
      'not a url',
      `http://user:pass@${fake.origin.replace('http://', '')}/media/capa/x.png`,
    ]) {
      expect(await library.media(link)).toEqual({ ok: false, reason: 'unsafe' })
    }
    expect(fake.library.mediaCalls).toEqual([])
  })
})

describe('the day limits', () => {
  it('reads files, sounds and reference credits', async () => {
    const { library } = await setup()
    expect(await library.limits()).toEqual({
      ok: true,
      files: { used: 0, limit: 60 },
      sounds: { used: 3, limit: 200 },
      references: { used: 0, limit: 300 },
      unlimited: false,
    })
  })

  it('says there is no limit when the account has none', async () => {
    const { library, fake } = await setup()
    fake.library.semLimite = true
    expect(await library.limits()).toMatchObject({ ok: true, unlimited: true })
  })

  it('hides them, without breaking anything, when the route is not published', async () => {
    const { library, fake } = await setup()
    fake.library.limitsRoute = false
    expect(await library.limits()).toEqual({ ok: false, reason: 'unavailable' })
    expect((await library.search({})).ok).toBe(true)
  })

  it('hides them when not linked', async () => {
    const { library } = await setup({ link: false })
    expect(await library.limits()).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('downloading a project', () => {
  it('writes every part at its destino, unpacks the zip and removes it, then says where', async () => {
    const { library, project, fake } = await setup()
    const job = await download(library, project, 'projeto/p1')
    expect(job.state).toBe('done')
    const root = path.join(project, 'clube', 'projetos', 'p1')
    expect(job.result).toMatchObject({ folder: root, files: 5, reusedParts: 0 })
    expect(tree(root)).toEqual([
      '.clube-download.json',
      'LEIA-ME.md',
      'assets/logo.png',
      'comp.json',
      'narracao.mp3',
      'render/final.mp4',
    ])
    expect(existsSync(path.join(root, 'projeto.zip'))).toBe(false)
    expect(readFileSync(path.join(root, 'comp.json'), 'utf8')).toBe('{"comp":1}')
    expect(fake.library.downloads).toEqual([
      { id: 'projeto/p1', partes: ['guia', 'audio', 'projeto', 'render'] },
    ])
    expect(job.receivedBytes).toBeGreaterThan(0)
    expect(job.filesDone).toBe(job.filesTotal)
  })

  it('never sends the account token to a signed link', async () => {
    const { library, project, fake } = await setup()
    await download(library, project, 'projeto/p1', ['guia'])
    expect(fake.library.signedCalls).toHaveLength(1)
    expect(fake.library.signedCalls[0]!.authorization).toBeUndefined()
  })

  it('fetches only the parts chosen, and counts only their files', async () => {
    const { library, project, fake } = await setup()
    const job = await download(library, project, 'projeto/p1', ['guia', 'audio'])
    expect(job.filesTotal).toBe(2)
    expect(fake.library.filesToday).toBe(2)
    expect(tree(path.join(project, 'clube', 'projetos', 'p1'))).toEqual([
      '.clube-download.json',
      'LEIA-ME.md',
      'narracao.mp3',
    ])
  })

  it('does not fetch a part that is already complete, and asks the Clube for nothing then', async () => {
    const { library, project, fake } = await setup()
    await download(library, project, 'projeto/p1', ['guia', 'audio'])
    const first = fake.library.filesToday
    const again = await download(library, project, 'projeto/p1', ['guia', 'audio', 'render'])
    expect(again.state).toBe('done')
    expect(again.result).toMatchObject({ reusedParts: 2 })
    expect(fake.library.downloads.at(-1)!.partes).toEqual(['render'])
    expect(fake.library.filesToday).toBe(first + 1)
    const nothing = await download(library, project, 'projeto/p1', ['guia', 'audio', 'render'])
    expect(nothing.result).toMatchObject({ reusedParts: 3, files: 0 })
    expect(fake.library.downloads).toHaveLength(2)
  })

  it('fetches a part again when its file is gone or changed', async () => {
    const { library, project, fake } = await setup()
    await download(library, project, 'projeto/p1', ['guia'])
    writeFileSync(path.join(project, 'clube', 'projetos', 'p1', 'LEIA-ME.md'), 'edited by hand')
    await download(library, project, 'projeto/p1', ['guia'])
    expect(fake.library.downloads).toHaveLength(2)
    expect(readFileSync(path.join(project, 'clube', 'projetos', 'p1', 'LEIA-ME.md'), 'utf8')).toBe(
      '# Guia\n',
    )
  })

  it('sends `usado` once after a download', async () => {
    const { library, project, fake } = await setup()
    await download(library, project, 'projeto/p1', ['guia'])
    await vi.waitFor(() =>
      expect(fake.library.signals).toEqual([{ id: 'projeto/p1', sinal: 'usado' }]),
    )
    await download(library, project, 'projeto/p1', ['audio'])
    await library.markUsed('projeto/p1')
    expect(fake.library.signals).toHaveLength(1)
  })

  it('refuses a signed link on another origin before any request, and fetches nothing', async () => {
    const { library, project, fake } = await setup()
    fake.library.items
      .find((item) => item.id === 'projeto/p2')!
      .files!.push({
        parte: 'render',
        nome: 'x.mp4',
        data: Buffer.from('x'),
        foreign: true,
      })
    const job = await download(library, project, 'projeto/p2')
    expect(job.state).toBe('failed')
    expect(job.failure).toEqual({ ok: false, reason: 'unsafe' })
    expect(fake.library.signedCalls).toEqual([])
    expect(
      tree(path.join(project, 'clube', 'projetos', 'p2')).filter(
        (file) => file !== '.clube-download.json',
      ),
    ).toEqual([])
  })

  it('refuses a destino that would leave the folder, before any request', async () => {
    for (const destino of [
      '../fora.txt',
      'a/../../fora.txt',
      'C:/fora.txt',
      '/abs.txt',
      'a\\b.txt',
    ]) {
      const { library, project, fake } = await setup()
      fake.library.items.find((item) => item.id === 'projeto/p2')!.files![0]!.destino = destino
      const job = await download(library, project, 'projeto/p2')
      expect(job.failure?.reason, destino).toBe('unsafe')
      expect(fake.library.signedCalls).toEqual([])
    }
  })

  it('refuses a zip with an entry that leaves the folder and keeps every other entry out too', async () => {
    const { library, project, fake } = await setup()
    const hostile = zip([
      { name: 'bom.txt', data: Buffer.from('bom') },
      { name: '../fora.txt', data: Buffer.from('mau') },
    ])
    fake.library.items.find((item) => item.id === 'projeto/p2')!.files = [
      { parte: 'projeto', nome: 'projeto.zip', data: hostile },
    ]
    const job = await download(library, project, 'projeto/p2')
    expect(job.failure?.reason).toBe('unsafe')
    const root = path.join(project, 'clube', 'projetos', 'p2')
    expect(tree(root)).toEqual([])
    expect(existsSync(path.join(project, 'clube', 'projetos', 'fora.txt'))).toBe(false)
    expect(existsSync(path.join(project, 'clube', 'fora.txt'))).toBe(false)
  })

  it('refuses entries with a drive letter, a backslash or an absolute path', async () => {
    for (const name of ['C:/x.txt', '/x.txt', 'a\\x.txt', 'a/./b.txt', 'con.txt']) {
      const { library, project, fake } = await setup()
      fake.library.items.find((item) => item.id === 'projeto/p2')!.files = [
        { parte: 'projeto', nome: 'projeto.zip', data: zip([{ name, data: Buffer.from('x') }]) },
      ]
      const job = await download(library, project, 'projeto/p2')
      expect(job.failure?.reason, name).toBe('unsafe')
    }
  })

  it('answers a damaged archive as damaged and leaves nothing under a final name', async () => {
    const { library, project, fake } = await setup()
    fake.library.items.find((item) => item.id === 'projeto/p2')!.files = [
      {
        parte: 'projeto',
        nome: 'projeto.zip',
        data: Buffer.from('this is not a zip archive at all'),
      },
    ]
    const job = await download(library, project, 'projeto/p2')
    expect(job.failure?.reason).toBe('damaged')
    expect(tree(path.join(project, 'clube', 'projetos', 'p2'))).toEqual([])
  })

  it('stops a file larger than the Clube declared', async () => {
    const { library, project, fake } = await setup()
    const files = fake.library.items.find((item) => item.id === 'projeto/p2')!.files!
    files[0]!.data = Buffer.alloc(5 * 1024 * 1024, 1)
    files[0]!.declaredMb = 0.001
    const job = await download(library, project, 'projeto/p2')
    expect(job.failure?.reason).toBe('too-large')
    expect(tree(path.join(project, 'clube', 'projetos', 'p2'))).toEqual([])
  })

  it('refuses a download over the ceiling for one download, before any request for the files', async () => {
    const fake = await setup()
    const library = new ClubeLibrary({
      clube: fake.clube,
      installSkill: () => Promise.resolve(),
      limits: { download: 1024 },
    })
    fake.fake.library.items.find((item) => item.id === 'projeto/p1')!.files![3]!.declaredMb = 5
    const job = await download(library, fake.project, 'projeto/p1', ['render'])
    expect(job.failure?.reason).toBe('too-large')
    expect(fake.fake.library.signedCalls).toEqual([])
  })

  it('cancels in the middle and leaves no half file, keeping the parts that were whole', async () => {
    const { library, project, fake } = await setup()
    const files = fake.library.items.find((item) => item.id === 'projeto/p1')!.files!
    files.find((file) => file.parte === 'render')!.slow = true
    const started = await library.download(project, 'projeto/p1', ['guia', 'render'])
    if (!started.ok) throw new Error('not started')
    await vi.waitFor(() => {
      const result = library.job(started.jobId)
      expect(result.ok && result.job.file).toBe('render.mp4')
      expect(fake.library.signedCalls).toHaveLength(2)
    })
    library.cancel(started.jobId)
    const job = await finished(library, started.jobId)
    expect(job.state).toBe('cancelled')
    const root = path.join(project, 'clube', 'projetos', 'p1')
    expect(tree(root)).toEqual(['.clube-download.json', 'LEIA-ME.md'])
    // The part that was whole is not fetched again.
    const again = await download(library, project, 'projeto/p1', ['guia'])
    expect(again.result).toMatchObject({ reusedParts: 1 })
  })

  it('refuses a chat with no project folder', async () => {
    const { library, project } = await setup()
    expect(await library.download(path.join(project, 'missing'), 'projeto/p1', undefined)).toEqual({
      ok: false,
      reason: 'no-project',
    })
    const file = path.join(project, 'a-file')
    writeFileSync(file, 'x')
    expect(await library.download(file, 'projeto/p1', undefined)).toEqual({
      ok: false,
      reason: 'no-project',
    })
  })

  it('refuses a clube folder that is a link to somewhere outside the project', async () => {
    const { library, project } = await setup()
    const outside = folder('outside')
    try {
      symlinkSync(outside, path.join(project, 'clube'), 'junction')
    } catch {
      return
    }
    expect(await library.download(project, 'projeto/p1', undefined)).toEqual({
      ok: false,
      reason: 'no-project',
    })
    expect(readdirSync(outside)).toEqual([])
  })

  it('says the day limit as the Clube words it when a link request answers 429', async () => {
    const { library, project, fake } = await setup()
    fake.library.filesToday = 60
    const job = await download(library, project, 'projeto/p1', ['guia'])
    expect(job.failure).toEqual({
      ok: false,
      reason: 'daily-limit',
      retryAfterS: 3600,
      message: 'Você chegou ao limite de 60 arquivos em 24 horas.',
    })
  })

  it('says unlinked when the account is not linked', async () => {
    const { library, project } = await setup({ link: false })
    expect(await library.download(project, 'projeto/p1', undefined)).toEqual({
      ok: false,
      reason: 'not-linked',
    })
  })

  it('refuses to download what is not a project or an animation', async () => {
    const { library, project } = await setup()
    for (const id of ['skill/ritmo-de-corte', 'musica/m1', 'referencia/r1']) {
      expect(await library.download(project, id, undefined)).toEqual({
        ok: false,
        reason: 'not-found',
      })
    }
  })
})

describe('downloading an animation', () => {
  it('uses the files of its record, under clube/animacoes/<slug>, from links just made', async () => {
    const { library, project, fake } = await setup()
    fake.library.items.find((item) => item.id === 'animacao/marca-pulsante')!.files![1]!.data = zip(
      [{ name: 'modelo/comp.json', data: Buffer.from('{}') }],
    )
    const job = await download(library, project, 'animacao/marca-pulsante')
    expect(job.state).toBe('done')
    expect(tree(path.join(project, 'clube', 'animacoes', 'marca-pulsante'))).toEqual([
      '.clube-download.json',
      'modelo/comp.json',
      'preview.mp4',
    ])
  })

  it('says the Clube sentence when the day limit left the record with no files', async () => {
    const { library, project, fake } = await setup()
    fake.library.filesToday = 60
    const job = await download(library, project, 'animacao/marca-pulsante')
    expect(job.failure).toEqual({
      ok: false,
      reason: 'daily-limit',
      message: 'Limite de arquivos do dia atingido.',
    })
  })
})

describe('text for the agent', () => {
  it('writes the analysis, the aspects and the prompt of a reference in one Markdown file under clube/', async () => {
    const { library, project } = await setup()
    const written = await library.exportText(project, 'referencia/r1')
    if (!written.ok) throw new Error('not written')
    expect(written.path).toBe(path.join(project, 'clube', 'referencias', 'r1.md'))
    const markdown = readFileSync(written.path, 'utf8')
    expect(markdown).toContain('# Referência de teste')
    expect(markdown).toContain('Original: https://example.test/original')
    expect(markdown).toContain('## Analysis')
    expect(markdown).toContain('cortes secos')
    expect(markdown).toContain('## Transition')
    expect(markdown).toMatch(/## Prompt\n\n```\nAlterne cortes secos e zoom\.\n```/)
  })

  it('refuses a chat with no project and says the same for an unlinked account', async () => {
    const { library, project } = await setup()
    expect(await library.exportText(path.join(project, 'gone'), 'referencia/r1')).toEqual({
      ok: false,
      reason: 'no-project',
    })
    const unlinked = await setup({ link: false })
    expect(await unlinked.library.exportText(unlinked.project, 'referencia/r1')).toEqual({
      ok: false,
      reason: 'not-linked',
    })
  })
})

describe('installing a skill of the Clube', () => {
  const where = { provider: 'claude-code', projectPath: '/somewhere' } as const

  it('installs once in the app folder, lists it with its origin, and removes it by the road of the others', async () => {
    const { library, skillsRoot, catalog, changed, fake } = await setup()
    const result = await library.installSkill('skill/ritmo-de-corte', where)
    expect(result).toEqual({ ok: true, name: 'Ritmo de corte' })
    expect(
      readFileSync(path.join(skillsRoot, 'motion', 'skills', 'ritmo-de-corte', 'SKILL.md'), 'utf8'),
    ).toContain('name: ritmo-de-corte')
    expect(
      existsSync(
        path.join(skillsRoot, 'motion', 'skills', 'ritmo-de-corte', 'references', 'nota.md'),
      ),
    ).toBe(true)
    expect(changed).toEqual(['claude-code:/somewhere'])
    expect(readInstalledRecord(skillsRoot).skills['ritmo-de-corte']).toMatchObject({
      origin: 'clube',
      category: 'motion',
      title: 'Ritmo de corte',
    })
    const listed = await catalog.list('/somewhere')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: 'ritmo-de-corte',
      author: 'Clube do Motion',
      origin: 'clube',
      state: 'installed',
      installedFor: 'app',
      license: null,
      category: 'motion',
    })
    await vi.waitFor(() =>
      expect(fake.library.signals).toEqual([{ id: 'skill/ritmo-de-corte', sinal: 'usado' }]),
    )
    await catalog.remove('claude-code', '/somewhere', 'ritmo-de-corte')
    expect(existsSync(path.join(skillsRoot, 'motion'))).toBe(false)
    expect(await catalog.list('/somewhere')).toEqual([])
  })

  it('loads motion and sound skills in Motion chats only, and text and process skills in every chat', async () => {
    const { library, skillsRoot } = await setup()
    await library.installSkill('skill/ritmo-de-corte', where)
    await library.installSkill('skill/tom-de-voz', where)
    const everyChat = loadInstalledSkills(skillsRoot, ['general'])
    expect(everyChat?.skills).toEqual(['tom-de-voz'])
    const motionChat = loadInstalledSkills(skillsRoot, ['general', 'motion'])
    expect(motionChat?.skills.sort()).toEqual(['ritmo-de-corte', 'tom-de-voz'])
    expect(motionChat?.catalog).toContain('Uma skill de teste sobre ritmo.')
  })

  it('maps the four areas to the two categories', async () => {
    const { library, fake, skillsRoot } = await setup()
    fake.library.skills = (['motion', 'som', 'texto', 'processo'] as const).map((area) => ({
      id: `s-${area}`,
      nome: area,
      area,
      resumo: area,
    }))
    for (const area of ['motion', 'som', 'texto', 'processo']) {
      await library.installSkill(`skill/s-${area}`, where)
    }
    const record = readInstalledRecord(skillsRoot).skills
    expect(
      Object.fromEntries(Object.entries(record).map(([id, entry]) => [id, entry.category])),
    ).toEqual({
      's-motion': 'motion',
      's-som': 'motion',
      's-texto': 'general',
      's-processo': 'general',
    })
  })

  it('installing again replaces the folder', async () => {
    const { library, skillsRoot } = await setup()
    await library.installSkill('skill/ritmo-de-corte', where)
    writeFileSync(path.join(skillsRoot, 'motion', 'skills', 'ritmo-de-corte', 'extra.txt'), 'x')
    expect((await library.installSkill('skill/ritmo-de-corte', where)).ok).toBe(true)
    expect(
      existsSync(path.join(skillsRoot, 'motion', 'skills', 'ritmo-de-corte', 'extra.txt')),
    ).toBe(false)
  })

  it('keeps an installed skill when the account is unlinked', async () => {
    const { library, clube, skillsRoot } = await setup()
    await library.installSkill('skill/ritmo-de-corte', where)
    await clube.disconnect()
    expect(
      existsSync(path.join(skillsRoot, 'motion', 'skills', 'ritmo-de-corte', 'SKILL.md')),
    ).toBe(true)
    expect(loadInstalledSkills(skillsRoot, ['general', 'motion'])?.skills).toEqual([
      'ritmo-de-corte',
    ])
  })

  it('refuses a zip whose entries are not inside one folder named by the skill id', async () => {
    for (const entries of [
      [{ name: 'SKILL.md', data: Buffer.from('x') }],
      [{ name: 'outra/SKILL.md', data: Buffer.from('x') }],
      [
        { name: 'ritmo-de-corte/SKILL.md', data: Buffer.from('x') },
        { name: 'ritmo-de-corte/../../fora.md', data: Buffer.from('x') },
      ],
      [{ name: 'ritmo-de-corte/leia.md', data: Buffer.from('x') }],
    ]) {
      const { library, fake, skillsRoot } = await setup()
      fake.library.skills = [
        { id: 'ritmo-de-corte', nome: 'Ritmo', area: 'motion', resumo: 'r', entries },
      ]
      const result = await library.installSkill('skill/ritmo-de-corte', where)
      expect(result.ok).toBe(false)
      expect(existsSync(path.join(skillsRoot, 'motion'))).toBe(false)
      expect(readInstalledRecord(skillsRoot).skills).toEqual({})
    }
  })

  it('refuses a skill whose download is on another origin, without a request for it', async () => {
    const { library, fake, skillsRoot } = await setup()
    const real = fake.library.handle.bind(fake.library)
    fake.library.handle = async (url, request, response, json, body) =>
      real(
        url,
        request,
        response,
        (status, value, headers) => {
          const wrapped = value as { download?: { url: string } }
          if (wrapped.download) wrapped.download.url = 'http://example.invalid/skill.zip'
          json(status, wrapped, headers)
        },
        body,
      )
    expect(await library.installSkill('skill/ritmo-de-corte', where)).toEqual({
      ok: false,
      reason: 'unsafe',
    })
    expect(fake.library.signedCalls).toEqual([])
    expect(existsSync(path.join(skillsRoot, 'motion'))).toBe(false)
  })

  it('refuses an id a skill listed by TUIFT Code already uses', async () => {
    const { fake, clube, skillsRoot } = await setup()
    const catalog = new SkillCatalog({
      entries: () => [],
      root: skillsRoot,
      bundled: () => new Set(['ritmo-de-corte']),
      onChanged: () => {},
    })
    const library = new ClubeLibrary({
      clube,
      installSkill: (skill, stage, at) =>
        catalog.installStaged(at.provider, at.projectPath, skill, stage),
    })
    expect((await library.installSkill('skill/ritmo-de-corte', where)).ok).toBe(false)
    expect(fake.library.signals).toEqual([])
  })

  it('says the day limit as the Clube words it, and does not install', async () => {
    const { library, fake, skillsRoot } = await setup()
    fake.library.filesToday = 60
    expect(await library.installSkill('skill/ritmo-de-corte', where)).toMatchObject({
      ok: false,
      reason: 'daily-limit',
    })
    expect(existsSync(path.join(skillsRoot, 'motion'))).toBe(false)
  })

  it('does not install a skill that is not a skill id', async () => {
    const { library } = await setup()
    for (const id of ['skill/Maiusculas', 'skill/ab..', 'musica/m1']) {
      expect((await library.installSkill(id, where)).ok).toBe(false)
    }
  })
})

describe('the account token', () => {
  it('goes only to the Clube API and never to a signed link or a cover', async () => {
    const { library, project, fake } = await setup()
    await library.media(`${fake.origin}/media/capa/x.png`)
    await download(library, project, 'projeto/p1', ['guia'])
    for (const call of [...fake.library.signedCalls, ...fake.library.mediaCalls]) {
      expect(call.authorization).toBeUndefined()
    }
    expect(fake.seen.every((call) => call.authorization?.startsWith('Bearer '))).toBe(true)
  })

  it('is not written in any log line', async () => {
    const { library, project, logs, fake } = await setup()
    await download(library, project, 'projeto/p1', ['guia'])
    await library.installSkill('skill/ritmo-de-corte', { provider: 'codex', projectPath: '/x' })
    for (const line of logs) {
      expect(line).not.toMatch(/access-token|refresh-token|Bearer|arquivos\//)
      expect(line).not.toContain(fake.origin)
    }
  })
})
