import {
  existsSync,
  mkdirSync,
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
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore, zip } from './clube-fake.test-support.js'
import { SoundLibrary, type SoundLibraryStore } from './sound-library.js'
import { openZip, ZipError } from './sound-zip.js'
import { Store } from './store.js'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** A store that holds what the library saves, so a test can look inside. */
function memoryStore(): SoundLibraryStore & { quota: unknown } {
  let settings = { enabled: true } as ReturnType<SoundLibraryStore['soundSettings']>
  const held = { quota: undefined as unknown }
  return {
    get quota() {
      return held.quota
    },
    soundSettings: () => settings,
    setSoundSettings: (next) => {
      settings = next
    },
    soundQuota: () => held.quota,
    setSoundQuota: (next) => {
      held.quota = next
    },
  }
}

async function setup(options: { link?: boolean; plan?: FakeClube['plan'] } = {}) {
  const fake = new FakeClube()
  await fake.start()
  cleanups.push(() => fake.stop())
  if (options.plan) fake.plan = options.plan
  const tokens = new MemoryClubeStore()
  const clock = { now: new Date(2026, 10, 16, 10, 0, 0).getTime() }
  const clube = new ClubeAccount({ origin: fake.origin, store: tokens, now: () => clock.now })
  if (options.link !== false) {
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(() => expect(clube.linked()).toBe(true))
  }
  const store = memoryStore()
  const logs: string[] = []
  const library = new SoundLibrary({
    clube,
    store,
    now: () => clock.now,
    log: (line) => logs.push(line),
  })
  const project = mkdtempSync(path.join(os.tmpdir(), 'tc-sounds-'))
  cleanups.push(() => rmSync(project, { recursive: true, force: true, maxRetries: 3 }))
  return { fake, clube, library, store, tokens, project, clock, logs }
}

const folderOf = (project: string) => path.join(project, 'audio', 'clube')

describe('searching the library', () => {
  it('maps the Clube sounds to the app words, filters, and never carries the collection or a token', async () => {
    const { fake, library, tokens } = await setup()
    const result = await library.search({ shelf: 'sound', type: 'tonal', key: 'A' })
    expect(result).toMatchObject({ ok: true, total: 2, offset: 0 })
    if (!result.ok) throw new Error('unreachable')
    expect(result.items.map((item) => item.name)).toEqual(['Cello Drone A minor', 'Hit Low A'])
    expect(result.items[0]).toEqual({
      id: '101',
      name: 'Cello Drone A minor',
      shelf: 'sound',
      type: 'tonal',
      role: 'drone',
      key: 'A',
      mode: 'menor',
      durationS: 42,
      category: 'Drones',
      lufs: -23,
    })
    const everything = JSON.stringify(result)
    expect(everything).not.toContain('Pack interno')
    expect(everything).not.toContain(tokens.read('clube.access')!)
    // The request carried the account's token, and nothing else carried it anywhere.
    const request = fake.seen.find((entry) => entry.path === '/api/v1/sons')
    expect(request?.authorization).toBe(`Bearer ${tokens.read('clube.access')}`)
  })

  it('matches text and a BPM range, pages, and says how many files are left in the day', async () => {
    const { library } = await setup()
    const text = await library.search({ shelf: 'sound', query: 'whoosh' })
    expect(text).toMatchObject({ ok: true, total: 1, daily: { used: 0, limit: 200 } })
    const bpm = await library.search({ shelf: 'sound', bpmMin: 80, bpmMax: 100 })
    if (!bpm.ok) throw new Error('unreachable')
    // Only a sound that has a measure can be inside a range.
    expect(bpm.items.map((item) => item.id)).toEqual(['102'])
    const page = await library.search({ shelf: 'sound', limit: 2, offset: 3 })
    expect(page).toMatchObject({ ok: true, total: 7, offset: 3 })
    if (!page.ok) throw new Error('unreachable')
    expect(page.items.map((item) => item.id)).toEqual(['104', '105'])
  })

  it('searches music by text, genre, mood, key and BPM', async () => {
    const { library } = await setup()
    const found = await library.search({
      shelf: 'music',
      category: 'cinematic',
      mood: 'tenso',
      key: 'Am',
    })
    if (!found.ok) throw new Error('unreachable')
    // A catalogued track: its key and BPM are facts, so nothing marks them as estimated.
    expect(found.items).toEqual([
      {
        id: 'm1',
        name: 'Slow Burn',
        shelf: 'music',
        key: 'Am',
        durationS: 120,
        category: 'cinematic',
        artist: 'Artista Um',
        mood: 'tenso, sombrio',
        bpm: 84,
      },
    ])
    expect(found.available).toBeUndefined()
    const fast = await library.search({ shelf: 'music', bpmMin: 100 })
    if (!fast.ok) throw new Error('unreachable')
    expect(fast.items.map((item) => item.id)).toEqual(['m2'])
    expect(fast.daily).toEqual({ used: 0, limit: 60 })
  })

  it('tells what a music search can be filtered by when it has no filter, or finds nothing', async () => {
    const { library } = await setup()
    const open = await library.search({ shelf: 'music' })
    if (!open.ok) throw new Error('unreachable')
    expect(open.available).toEqual({
      category: ['cinematic', 'pop'],
      mood: ['alegre', 'sombrio', 'tenso'],
      key: ['Am', 'C'],
      artist: ['Artista Dois', 'Artista Um'],
    })
    const none = await library.search({ shelf: 'music', category: 'nothing' })
    if (!none.ok) throw new Error('unreachable')
    expect(none.items).toEqual([])
    expect(none.notice).toMatch(/Nenhuma/)
    expect(none.available?.category).toContain('pop')
  })

  it('reaches the soundtracks: a type of sound whose key and BPM are estimates', async () => {
    const { library } = await setup()
    const found = await library.search({ shelf: 'sound', type: 'trilha', bpmMin: 100 })
    if (!found.ok) throw new Error('unreachable')
    expect(found.items).toEqual([
      {
        id: '202',
        name: 'City Pulse',
        shelf: 'sound',
        type: 'trilha',
        key: 'A',
        mode: 'menor',
        durationS: 128,
        category: 'Electronic',
        lufs: -14,
        bpm: 118,
        estimated: true,
      },
    ])
    const tonal = await library.search({ shelf: 'sound', type: 'tonal' })
    if (!tonal.ok) throw new Error('unreachable')
    expect(tonal.items.some((item) => item.estimated)).toBe(false)
  })

  it('reads the facets: categories per type and the notes', async () => {
    const { library } = await setup()
    const facets = await library.facets()
    expect(facets).toMatchObject({
      ok: true,
      total: 7,
      keys: ['A', 'C', 'D'],
    })
    if (!facets.ok) throw new Error('unreachable')
    expect(facets.categories).toContainEqual({ type: 'efeito', category: 'Whoosh', total: 1 })
    expect(facets.categories).toContainEqual({ type: 'trilha', category: 'Ambient', total: 1 })
  })

  it('fetches a preview through the server and does not count it in the day', async () => {
    const { fake, library } = await setup()
    const sound = await library.preview('sound', '101')
    expect(sound).toEqual({
      ok: true,
      mime: 'audio/ogg',
      data: Buffer.from('OggS-preview').toString('base64'),
    })
    // A track's preview is the open MP3 its search showed: no token, no call to its detail.
    expect(await library.preview('music', 'm1')).toEqual({ ok: false, reason: 'not-found' })
    await library.search({ shelf: 'music' })
    const music = await library.preview('music', 'm1')
    expect(music).toEqual({
      ok: true,
      mime: 'audio/mpeg',
      data: Buffer.from('ID3-preview').toString('base64'),
    })
    expect(fake.previewCalls).toEqual(['101', 'm1/completa'])
    expect(fake.detailCalls).toEqual([])
    expect(library.daily('sound').used).toBe(0)
    // A track's preview is the whole track: several megabytes, far above a sound's few seconds.
    fake.musicPreview = Buffer.alloc(8 * 1024 * 1024, 1)
    const whole = await library.preview('music', 'm1')
    expect(whole.ok && Buffer.from(whole.data, 'base64').length).toBe(8 * 1024 * 1024)
    fake.musicPreview = Buffer.alloc(25 * 1024 * 1024, 1)
    expect(await library.preview('music', 'm1')).toEqual({ ok: false, reason: 'unreachable' })
    expect((await library.preview('sound', 'nope')).ok).toBe(false)
  })
})

describe('why the library says no', () => {
  it('is not linked without an account', async () => {
    const { library, fake, project } = await setup({ link: false })
    expect(await library.search({ shelf: 'sound' })).toEqual({ ok: false, reason: 'not-linked' })
    expect(await library.facets()).toEqual({ ok: false, reason: 'not-linked' })
    expect(await library.preview('sound', '101')).toEqual({ ok: false, reason: 'not-linked' })
    expect(await library.use(project, 'sound', '101')).toEqual({ ok: false, reason: 'not-found' })
    expect(fake.seen).toHaveLength(0)
    expect(await library.availability()).toBe('unlinked')
  })

  it('has no subscription for a free account, on every call', async () => {
    const { library, project } = await setup({ plan: 'grátis' })
    expect(await library.search({ shelf: 'sound' })).toEqual({
      ok: false,
      reason: 'no-subscription',
    })
    expect(await library.search({ shelf: 'music' })).toEqual({
      ok: false,
      reason: 'no-subscription',
    })
    expect(await library.preview('sound', '101')).toEqual({ ok: false, reason: 'no-subscription' })
    expect(await library.use(project, 'sound', '101')).toEqual({ ok: false, reason: 'not-found' })
    expect(await library.availability()).toBe('no-subscription')
  })

  it('tells the per-minute limit from the daily one, and keeps the wait', async () => {
    const { fake, library } = await setup()
    fake.soundsRetryAfter = 17
    expect(await library.search({ shelf: 'sound' })).toEqual({
      ok: false,
      reason: 'rate-limit',
      retryAfterS: 17,
    })
    fake.soundsRetryAfter = undefined
    expect((await library.search({ shelf: 'sound' })).ok).toBe(true)
  })

  it('is off when the person turned it off', async () => {
    const { library } = await setup()
    library.updateSettings({ enabled: false })
    expect(await library.availability()).toBe('off')
  })

  it('answers not-found for an id no search returned', async () => {
    const { library, project } = await setup()
    expect(await library.use(project, 'sound', '999')).toEqual({ ok: false, reason: 'not-found' })
  })

  it('treats an unreachable Clube as unreachable', async () => {
    const { fake, library } = await setup()
    await fake.stop()
    expect(await library.search({ shelf: 'sound' })).toEqual({ ok: false, reason: 'unreachable' })
  })
})

describe('using a sound', () => {
  async function search(library: SoundLibrary) {
    const result = await library.search({ shelf: 'sound' })
    expect(result.ok).toBe(true)
  }

  it('writes it under audio/clube with its real name, and says where, what and how loud', async () => {
    const { library, project, fake } = await setup()
    await search(library)
    const used = await library.use(project, 'sound', '101')
    expect(used.ok).toBe(true)
    if (!used.ok) throw new Error('unreachable')
    const file = path.join(folderOf(project), 'Cello Drone A minor.flac')
    expect(used.sound).toMatchObject({
      path: file,
      name: 'Cello Drone A minor.flac',
      format: 'flac',
      durationS: 42,
      lufs: -23,
      reused: false,
    })
    expect(path.isAbsolute(used.sound.path)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('audio:101:Cello Drone A minor')
    expect(used.daily).toEqual({ used: 1, limit: 200 })
    expect(fake.fileCalls).toEqual(['101'])
  })

  it('finds a sound again by its id, without spending the day, even in a new library', async () => {
    const { library, project, fake, clube, store, clock } = await setup()
    await search(library)
    await library.use(project, 'sound', '101')
    const again = await library.use(project, 'sound', '101')
    expect(again).toMatchObject({
      ok: true,
      sound: { reused: true, durationS: 42, lufs: -23 },
      daily: { used: 1 },
    })
    expect(fake.fileCalls).toEqual(['101'])

    // A restart forgets the searches, but the project remembers what it has.
    const restarted = new SoundLibrary({ clube, store, now: () => clock.now })
    expect(await restarted.use(project, 'sound', '101')).toMatchObject({
      ok: true,
      sound: { reused: true },
    })
    expect(fake.fileCalls).toEqual(['101'])
  })

  it('fetches again a sound whose file was deleted', async () => {
    const { library, project, fake } = await setup()
    await search(library)
    await library.use(project, 'sound', '101')
    rmSync(path.join(folderOf(project), 'Cello Drone A minor.flac'))
    expect(await library.use(project, 'sound', '101')).toMatchObject({
      ok: true,
      sound: { reused: false },
    })
    expect(fake.fileCalls).toEqual(['101', '101'])
  })

  it('drops a file whose checksum does not match, and does not count it', async () => {
    const { library, project, fake, logs } = await setup()
    await search(library)
    fake.fileHash = 'f'.repeat(64)
    expect(await library.use(project, 'sound', '101')).toEqual({ ok: false, reason: 'damaged' })
    expect(readdirSync(folderOf(project))).toEqual([])
    expect(library.daily('sound').used).toBe(0)
    expect(logs.join('\n')).not.toContain('access-token')
    // The next try, with the right checksum, works.
    fake.fileHash = undefined
    expect((await library.use(project, 'sound', '101')).ok).toBe(true)
  })

  it('refuses a file that comes without a checksum', async () => {
    const { library, project, fake } = await setup()
    await search(library)
    fake.fileHash = null
    expect(await library.use(project, 'sound', '101')).toEqual({ ok: false, reason: 'damaged' })
    expect(readdirSync(folderOf(project))).toEqual([])
  })

  it('fetches a soundtrack like any sound: one MP3', async () => {
    const { library, project } = await setup()
    await library.search({ shelf: 'sound', type: 'trilha' })
    const used = await library.use(project, 'sound', '201')
    expect(used).toMatchObject({
      ok: true,
      sound: { name: 'Quiet Morning.mp3', format: 'mp3', durationS: 150, reused: false },
      daily: { used: 1, limit: 200 },
    })
  })

  it('keeps two sounds with one name apart, and never writes outside the folder', async () => {
    const { library, project, fake } = await setup()
    fake.sons = [
      { id: '1', nome: 'Same', tipo: 'efeito', duracao_s: 1 },
      { id: '2', nome: 'Same', tipo: 'efeito', duracao_s: 1 },
      { id: '3', nome: '..\\..\\evil: name?', tipo: 'efeito', duracao_s: 1 },
      { id: '4', nome: 'CON', tipo: 'efeito', duracao_s: 1 },
    ]
    await search(library)
    for (const id of ['1', '2', '3', '4']) {
      expect((await library.use(project, 'sound', id)).ok).toBe(true)
    }
    const names = readdirSync(folderOf(project)).sort()
    expect(names).toContain('Same.flac')
    expect(names).toContain('Same (2).flac')
    expect(names).toContain('_CON.flac')
    expect(names.filter((name) => name.includes('evil'))).toHaveLength(1)
    expect(names.some((name) => /[<>:"/\\|?*]/.test(name))).toBe(false)
    expect(existsSync(path.join(project, 'evil'))).toBe(false)
  })

  it('stops asking once the day is used up, still reuses what it has, and says when it ends', async () => {
    const { library, project, fake, clock } = await setup()
    fake.dailySounds = 1
    fake.dailyRetryAfter = 3600
    await search(library)
    expect((await library.use(project, 'sound', '101')).ok).toBe(true)
    const blocked = await library.use(project, 'sound', '102')
    expect(blocked).toMatchObject({
      ok: false,
      reason: 'daily-limit',
      retryAfterS: 3600,
      daily: { used: 200, limit: 200 },
    })
    // The wait is remembered: another sound does not even ask.
    const asked = fake.fileCalls.length
    expect(await library.use(project, 'sound', '103')).toMatchObject({
      ok: false,
      reason: 'daily-limit',
    })
    expect(fake.fileCalls).toHaveLength(asked)
    // What the project has still works, and searching still does.
    expect(await library.use(project, 'sound', '101')).toMatchObject({
      ok: true,
      sound: { reused: true },
    })
    expect((await library.search({ shelf: 'sound' })).ok).toBe(true)
    // The window rolls: a day later the files are free again, with no promise of a midnight.
    clock.now += 25 * 3_600_000
    expect(library.daily('sound')).toEqual({ used: 0, limit: 200 })
    fake.dailySounds = 200
    expect((await library.use(project, 'sound', '103')).ok).toBe(true)
  })

  it('refuses a project folder that points outside itself', async () => {
    const { library, project } = await setup()
    await search(library)
    const outside = mkdtempSync(path.join(os.tmpdir(), 'tc-sounds-out-'))
    cleanups.push(() => rmSync(outside, { recursive: true, force: true, maxRetries: 3 }))
    mkdirSync(path.join(project, 'audio'))
    symlinkSync(outside, path.join(project, 'audio', 'clube'), 'junction')
    expect(await library.use(project, 'sound', '101')).toEqual({ ok: false, reason: 'no-project' })
    expect(readdirSync(outside)).toEqual([])
    expect(await library.use(path.join(project, 'missing'), 'sound', '101')).toEqual({
      ok: false,
      reason: 'no-project',
    })
  })

  it('runs uses one at a time and keeps the manifest whole', async () => {
    const { library, project } = await setup()
    await search(library)
    await Promise.all(
      ['101', '102', '103', '104', '105'].map((id) => library.use(project, 'sound', id)),
    )
    const manifest = JSON.parse(
      readFileSync(path.join(folderOf(project), 'manifest.json'), 'utf8'),
    ) as {
      items: Record<string, unknown>
    }
    expect(Object.keys(manifest.items).sort()).toEqual([
      'sound:101',
      'sound:102',
      'sound:103',
      'sound:104',
      'sound:105',
    ])
  })
})

describe('using a track', () => {
  const FOLDER = 'Artista Um - Slow Burn'

  it('unpacks the zip into a folder named after artist and title, and finds it again for free', async () => {
    const { library, project, fake } = await setup()
    await library.search({ shelf: 'music' })
    const used = await library.use(project, 'music', 'm1')
    expect(used.ok).toBe(true)
    if (!used.ok) throw new Error('unreachable')
    const folder = path.join(folderOf(project), 'music', FOLDER)
    expect(used.sound.path).toBe(folder)
    expect(used.sound.files.map((file) => file.version).sort()).toEqual([
      `${FOLDER} - completa`,
      `${FOLDER} - instrumental`,
      `${FOLDER} - vocal`,
    ])
    // The three WAV versions only: the read-me inside the zip is not an audio file.
    expect(readdirSync(folder).sort()).toEqual([
      `${FOLDER} - completa.wav`,
      `${FOLDER} - instrumental.wav`,
      `${FOLDER} - vocal.wav`,
    ])
    expect(readFileSync(path.join(folder, `${FOLDER} - instrumental.wav`), 'utf8')).toBe(
      `RIFF-${FOLDER}-instrumental`,
    )
    expect(used.daily).toEqual({ used: 1, limit: 60 })
    // The zip's temporary file is gone.
    expect(readdirSync(folderOf(project)).filter((name) => name.endsWith('.part'))).toEqual([])

    expect(await library.use(project, 'music', 'm1')).toMatchObject({
      ok: true,
      sound: { reused: true },
    })
    expect(fake.zipCalls).toEqual(['m1'])
    expect(fake.detailCalls).toEqual(['m1'])
    // Sounds and tracks do not share a count.
    expect(library.daily('sound').used).toBe(0)
  })

  it('needs no earlier search: the track names itself from its own detail', async () => {
    const { library, project } = await setup()
    expect(await library.use(project, 'music', 'm2')).toMatchObject({
      ok: true,
      sound: { name: 'Bright Day' },
    })
    expect(await library.use(project, 'music', 'nope')).toEqual({ ok: false, reason: 'not-found' })
  })

  it('keeps only the file name of an entry, never a path from the archive', async () => {
    const { library, project, fake } = await setup()
    fake.musicas[0]!.versions = [
      { name: '../../escape.wav', data: Buffer.from('a') },
      { name: 'nested/dir/ok.wav', data: Buffer.from('b') },
      { name: 'readme.txt', data: Buffer.from('c') },
    ]
    await library.search({ shelf: 'music' })
    const used = await library.use(project, 'music', 'm1')
    expect(used.ok).toBe(true)
    expect(readdirSync(path.join(folderOf(project), 'music', FOLDER)).sort()).toEqual([
      'escape.wav',
      'ok.wav',
    ])
    expect(existsSync(path.join(project, 'escape.wav'))).toBe(false)
  })

  it('reads a 200 without a zip link as "cannot download now", and shows the Clube sentence', async () => {
    const { library, project, fake } = await setup()
    fake.dailyMusic = 0
    const limited = await library.use(project, 'music', 'm1')
    expect(limited).toMatchObject({
      ok: false,
      reason: 'daily-limit',
      message: 'Limite de 0 arquivos por dia atingido (0 hoje): o link volta amanha.',
      daily: { used: 60, limit: 60 },
    })
    expect(readdirSync(folderOf(project))).toEqual([])
    // The Clube's word is remembered as a wait: the next track does not even ask.
    const asked = fake.detailCalls.length
    expect(await library.use(project, 'music', 'm2')).toMatchObject({ reason: 'daily-limit' })
    expect(fake.detailCalls).toHaveLength(asked)
  })

  it('says a plan without the download as no subscription, with the Clube sentence', async () => {
    const { library, project, fake } = await setup()
    fake.musicPlanBlocked = true
    expect(await library.use(project, 'music', 'm1')).toEqual({
      ok: false,
      reason: 'no-subscription',
      message: 'Seu plano nao inclui o download das musicas.',
    })
  })

  it('refuses a damaged archive without leaving anything', async () => {
    const { library, project, fake } = await setup()
    fake.musicas[0]!.versions = []
    await library.search({ shelf: 'music' })
    expect(await library.use(project, 'music', 'm1')).toEqual({ ok: false, reason: 'damaged' })
    expect(readdirSync(path.join(folderOf(project), 'music'))).toEqual([])
  })
})

describe('the zip reader', () => {
  it('reads stored and deflated entries and refuses what is not a zip', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tc-zip-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }))
    const good = path.join(dir, 'good.zip')
    writeFileSync(
      good,
      zip([
        { name: 'a.wav', data: Buffer.from('one') },
        { name: 'dir/b.wav', data: Buffer.from('two'.repeat(100)) },
      ]),
    )
    const archive = await openZip(good)
    expect(archive.entries.map((entry) => entry.name)).toEqual(['a.wav', 'b.wav'])
    expect((await archive.entries[0]!.read()).toString()).toBe('one')
    expect((await archive.entries[1]!.read()).toString()).toBe('two'.repeat(100))
    await archive.close()

    const bad = path.join(dir, 'bad.zip')
    writeFileSync(bad, Buffer.from('not a zip at all'))
    await expect(openZip(bad)).rejects.toBeInstanceOf(ZipError)
  })
})

describe('the settings', () => {
  it('are on by default, keep an existing folder, and refuse one that is not', async () => {
    const { library, project } = await setup()
    expect(library.settings()).toEqual({ enabled: true })
    expect(library.updateSettings({ ownFolder: project })).toEqual({
      enabled: true,
      ownFolder: project,
    })
    expect(library.updateSettings({ enabled: false })).toEqual({
      enabled: false,
      ownFolder: project,
    })
    expect(() => library.updateSettings({ ownFolder: path.join(project, 'nope') })).toThrow()
    expect(() => library.updateSettings({ ownFolder: 'relative/folder' })).toThrow()
    expect(library.updateSettings({ ownFolder: null })).toEqual({ enabled: false })
  })

  it('live in the app store, with the day count', () => {
    const store = new Store(':memory:')
    expect(store.soundSettings()).toEqual({ enabled: true })
    store.setSoundSettings({ enabled: false, ownFolder: path.join(os.tmpdir()) })
    expect(store.soundSettings()).toEqual({ enabled: false, ownFolder: os.tmpdir() })
    expect(store.soundQuota()).toBeUndefined()
    store.setSoundQuota({ day: '2026-11-16', sound: 3, music: 0, blocked: {} })
    expect(store.soundQuota()).toEqual({ day: '2026-11-16', sound: 3, music: 0, blocked: {} })
  })
})
