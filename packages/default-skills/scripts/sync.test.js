import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { omitFiles } from './skill-media.mjs'
import {
  bundleLayout,
  digestFiles,
  localSkillFiles,
  manifestProblems,
  readManifest,
  skillFiles,
  skillPacks,
  syncBundle,
  verifyBundle,
} from './sync.js'

function header(name, size, type) {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100)
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  block.write(type, 156)
  block.write('ustar\0', 257)
  block.write('00', 263)
  block.fill(' ', 148, 156)
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return block
}

function tar(entries) {
  const blocks = []
  for (const [name, content, type = '0'] of entries) {
    const body = Buffer.from(content)
    blocks.push(
      header(name, body.length, type),
      body,
      Buffer.alloc((512 - (body.length % 512)) % 512),
    )
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

const skill = {
  folder: 'demo',
  repository: 'example/demo',
  commit: 'abc',
  path: 'skills/demo',
  licenseFile: 'LICENSE',
  exclude: ['README.md'],
}

const archive = tar([
  ['demo-abc/', '', '5'],
  ['demo-abc/LICENSE', 'MIT text'],
  ['demo-abc/README.md', 'repo readme'],
  ['demo-abc/skills/demo/SKILL.md', '---\nname: demo\n---\n'],
  ['demo-abc/skills/demo/README.md', 'excluded'],
  ['demo-abc/skills/demo/refs/a.md', 'a'],
  ['demo-abc/skills/demo/.DS_Store', 'junk'],
  ['demo-abc/skills/demo/__pycache__/x.pyc', 'junk'],
  ['demo-abc/skills/other/SKILL.md', 'not this one'],
])

test('takes only the skill folder, drops stray files and adds the licence', () => {
  const files = skillFiles(archive, skill)
  assert.deepEqual([...files.keys()].sort(), ['LICENSE', 'SKILL.md', 'refs/a.md'])
  assert.equal(files.get('LICENSE').toString(), 'MIT text')
})

test('refuses links and missing skills', () => {
  assert.throws(
    () => skillFiles(tar([['demo-abc/skills/demo/SKILL.md', 'x', '2']]), skill),
    /type 2/,
  )
  assert.throws(() => skillFiles(tar([['demo-abc/LICENSE', 'x']]), skill), /no SKILL\.md/)
})

test('ignores a link elsewhere in the repository but never one inside the skill', () => {
  const outside = tar([
    ['demo-abc/AGENTS.md', '', '2'],
    ['demo-abc/LICENSE', 'MIT text'],
    ['demo-abc/skills/demo/SKILL.md', 'x'],
  ])
  assert.deepEqual([...skillFiles(outside, skill).keys()].sort(), ['LICENSE', 'SKILL.md'])
  const inside = tar([
    ['demo-abc/LICENSE', 'MIT text'],
    ['demo-abc/skills/demo/SKILL.md', 'x'],
    ['demo-abc/skills/demo/refs/a.md', '', '1'],
  ])
  assert.throws(() => skillFiles(inside, skill), /Refusing tar entry/)
})

test('one repository at one commit is downloaded once, however many skills come from it', async () => {
  const root = path.join(await mkdtemp(path.join(os.tmpdir(), 'default-skills-')), 'bundle')
  const second = { ...skill, folder: 'demo-two', path: 'skills/other' }
  const both = tar([
    ['demo-abc/LICENSE', 'MIT text'],
    ['demo-abc/skills/demo/SKILL.md', 'one'],
    ['demo-abc/skills/other/SKILL.md', 'two'],
  ])
  let downloads = 0
  const fetchImpl = async () => {
    downloads++
    return new Response(gzipSync(both))
  }
  const manifest = {
    plugin: { name: 'tastecode' },
    skills: [skill, second].map((entry) => ({ ...entry, archiveSha256: '', treeSha256: '' })),
  }
  try {
    const pinned = await syncBundle(manifest, { root, fetchImpl, update: true, log: () => {} })
    assert.equal(downloads, 1)
    assert.deepEqual(await verifyBundle(pinned, root), [])
    assert.equal(await readFile(path.join(root, 'skills', 'demo-two', 'SKILL.md'), 'utf8'), 'two')
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true })
  }
})

test('syncs, verifies, and rejects an archive that does not match its pin', async () => {
  const root = path.join(await mkdtemp(path.join(os.tmpdir(), 'default-skills-')), 'bundle')
  const gz = gzipSync(archive)
  const fetchImpl = async () => new Response(gz)
  const manifest = {
    plugin: { name: 'tastecode' },
    skills: [{ ...skill, archiveSha256: '', treeSha256: '', files: 0, bytes: 0 }],
  }
  try {
    const pinned = await syncBundle(manifest, { root, fetchImpl, update: true, log: () => {} })
    assert.deepEqual(await verifyBundle(pinned, root), [])
    assert.equal(
      await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
      '{\n  "name": "tastecode"\n}\n',
    )
    await writeFile(path.join(root, 'skills', 'demo', 'SKILL.md'), 'changed')
    assert.match((await verifyBundle(pinned, root)).join('\n'), /demo differs/)
    const tampered = { ...pinned, skills: [{ ...pinned.skills[0], archiveSha256: '0'.repeat(64) }] }
    await assert.rejects(
      syncBundle(tampered, { root, fetchImpl, log: () => {} }),
      /does not match the pinned/,
    )
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true })
  }
})

const patchedSkill = {
  folder: 'demo',
  repository: 'example/demo',
  commit: 'abc',
  path: 'skills/demo',
  licenseFile: 'LICENSE',
  omit: { paths: ['assets/photos/', 'assets/_demo/'] },
  patch: { files: { 'SKILL.md': '', 'scripts/photos.mjs': '' } },
}

const patchedArchive = tar([
  ['demo-abc/LICENSE', 'MIT text'],
  ['demo-abc/skills/demo/SKILL.md', '---\nname: demo\n---\nUse the photo library.\n'],
  ['demo-abc/skills/demo/scripts/photos.mjs', 'fetch the library'],
  ['demo-abc/skills/demo/assets/photos/photos.json', '{"photos":1}'],
  ['demo-abc/skills/demo/assets/photos/img/a.webp', 'webp'],
  ['demo-abc/skills/demo/assets/_demo/page.html', '<p>demo</p>'],
  ['demo-abc/skills/demo/assets/_demo/b.jpg', 'jpg'],
])

/** A temp folder with TUIFT Code's copies of the patched files, and the bundle synced from them. */
async function patchedFixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'default-skills-patch-'))
  const root = path.join(temp, 'bundle')
  const patches = path.join(temp, 'patches')
  await mkdir(path.join(patches, 'demo', 'scripts'), { recursive: true })
  await writeFile(path.join(patches, 'demo', 'SKILL.md'), '---\nname: demo\n---\nUse your own.\n')
  await writeFile(path.join(patches, 'demo', 'scripts', 'photos.mjs'), 'switched off')
  const manifest = {
    plugin: { name: 'tastecode' },
    skills: [{ ...patchedSkill, archiveSha256: '', treeSha256: '', files: 0, bytes: 0 }],
  }
  const fetchImpl = async () => new Response(gzipSync(patchedArchive))
  const options = { root, patches, fetchImpl, log: () => {} }
  const pinned = await syncBundle(manifest, { ...options, update: true })
  return { temp, root, patches, pinned, options }
}

test('leaves the omitted pictures and credits out, and keeps pages in the same folders', () => {
  const files = omitFiles(skillFiles(patchedArchive, patchedSkill), patchedSkill.omit)
  assert.deepEqual([...files.keys()].sort(), [
    'LICENSE',
    'SKILL.md',
    'assets/_demo/page.html',
    'scripts/photos.mjs',
  ])
})

test('leaves out the files a pattern names, with * inside one path segment', () => {
  const files = new Map(
    [
      'assets/objects/print-cup/fallback-dark.png',
      'assets/objects/print-cup/object.js',
      'assets/objects/print-cup/meta.json',
      'assets/objects/product-turntable/fallback-camera-light.png',
      'assets/objects/print-cup/deeper/fallback.png',
    ].map((name) => [name, Buffer.from(name)]),
  )
  const kept = omitFiles(files, { paths: ['assets/objects/*/fallback*.png'] })
  assert.deepEqual([...kept.keys()].sort(), [
    'assets/objects/print-cup/deeper/fallback.png',
    'assets/objects/print-cup/meta.json',
    'assets/objects/print-cup/object.js',
  ])
})

test('ships TasteSkill with no picture of its own', async () => {
  const manifest = await readManifest()
  const skill = manifest.skills.find((entry) => entry.folder === 'design-taste-frontend')
  for (const sample of [
    'assets/objects/print-cup/fallback-render.png',
    'assets/objects/product-turntable/fallback-chair-dark.png',
    'assets/objects/product-render/specs/city-bike.json',
    'assets/objects/product-render/specs/robot-arm.fallback.png',
    'assets/photos/img/photo-326-1200.webp',
  ])
    assert.equal(
      omitFiles(new Map([[sample, Buffer.alloc(0)]]), skill.omit).size,
      0,
      `${sample} is bundled`,
    )
})

test('bundles the patched copies, no library, and nothing that fetches one', async () => {
  const { temp, root, patches, pinned } = await patchedFixture()
  try {
    const skillDir = path.join(root, 'skills', 'demo')
    assert.deepEqual(await verifyBundle(pinned, root, patches), [])
    assert.equal(
      await readFile(path.join(skillDir, 'SKILL.md'), 'utf8'),
      '---\nname: demo\n---\nUse your own.\n',
    )
    assert.equal(
      await readFile(path.join(skillDir, 'scripts', 'photos.mjs'), 'utf8'),
      'switched off',
    )
    assert.equal(
      await readFile(path.join(skillDir, 'assets', '_demo', 'page.html'), 'utf8'),
      '<p>demo</p>',
    )
    await assert.rejects(stat(path.join(skillDir, 'assets', 'photos')))
    await assert.rejects(stat(path.join(skillDir, 'assets', '_demo', 'b.jpg')))
    assert.match(pinned.skills[0].patch.files['SKILL.md'], /^[0-9a-f]{64}$/)

    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: demo\n---\nUse the photo library.\n',
    )
    assert.match(
      (await verifyBundle(pinned, root, patches)).join('\n'),
      /SKILL\.md is not TUIFT Code's patched copy/,
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('refuses to build when an upstream file changed under its patch', async () => {
  const { temp, root, patches, pinned, options } = await patchedFixture()
  try {
    const moved = structuredClone(pinned)
    moved.skills[0].patch.files['SKILL.md'] = '0'.repeat(64)
    await rm(root, { recursive: true, force: true })
    await assert.rejects(
      syncBundle(moved, options),
      /upstream SKILL\.md changed .*carry patches\/demo\/SKILL\.md over/,
    )
    await assert.rejects(stat(root))
    assert.deepEqual(await verifyBundle(pinned, root, patches), [
      `${root} is missing; run pnpm --filter @harness/default-skills sync`,
    ])
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('the committed manifest pins full commits and measured hashes', async () => {
  const manifest = await readManifest()
  assert.equal(manifest.plugin.name, 'tastecode')
  assert.deepEqual(manifestProblems(manifest), [])
  for (const entry of manifest.skills) {
    if (entry.source === 'local') {
      assert.ok(entry.license, `${entry.folder} names no license`)
      assert.equal(entry.commit, undefined)
    } else {
      assert.match(entry.commit, /^[0-9a-f]{40}$/)
      assert.match(entry.archiveSha256, /^[0-9a-f]{64}$/)
    }
    assert.match(entry.treeSha256, /^[0-9a-f]{64}$/)
    assert.ok(entry.files > 0 && entry.bytes > 0)
    assert.ok(entry.summary.length <= 60, entry.folder)
    for (const base of Object.values(entry.patch?.files ?? {})) assert.match(base, /^[0-9a-f]{64}$/)
    assert.equal(entry.media, undefined, 'nothing is fetched after install')
  }
  assert.equal(digestFiles(new Map()).files, 0)
})

const localSkill = {
  folder: 'mine',
  source: 'local',
  summary: 'a fixture skill',
  license: 'MIT',
  licenseFile: 'LICENSE',
}

/** A temp folder with a tiny skill of our own, standing in for .agents/skills, next to the pinned fixture skill. */
async function localFixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'default-skills-local-'))
  const root = path.join(temp, 'bundle')
  const locals = path.join(temp, 'agents-skills')
  await mkdir(path.join(locals, 'mine', 'refs'), { recursive: true })
  await writeFile(path.join(locals, 'mine', 'SKILL.md'), '---\nname: mine\n---\nOur own.\n')
  await writeFile(path.join(locals, 'mine', 'LICENSE'), 'Our licence text')
  await writeFile(path.join(locals, 'mine', 'refs', 'a.md'), 'a')
  await writeFile(path.join(locals, 'mine', '.DS_Store'), 'junk')
  const manifest = {
    plugin: { name: 'tastecode' },
    skills: [
      { ...skill, archiveSha256: '', treeSha256: '', files: 0, bytes: 0 },
      { ...localSkill },
    ],
  }
  const fetchImpl = async () => new Response(gzipSync(archive))
  const options = { root, locals, fetchImpl, log: () => {} }
  const pinned = await syncBundle(manifest, { ...options, update: true })
  return { temp, root, locals, pinned, options }
}

test('bundles a skill kept in the repository next to the pinned ones, with its own licence', async () => {
  const { temp, root, locals, pinned } = await localFixture()
  try {
    const mine = pinned.skills[1]
    assert.equal(mine.files, 3)
    assert.ok(mine.bytes > 0)
    assert.equal(mine.archiveSha256, undefined)
    assert.match(mine.treeSha256, /^[0-9a-f]{64}$/)
    assert.deepEqual(await verifyBundle(pinned, root, undefined, locals), [])
    const skillDir = path.join(root, 'skills', 'mine')
    assert.equal(await readFile(path.join(skillDir, 'LICENSE'), 'utf8'), 'Our licence text')
    assert.equal(await readFile(path.join(skillDir, 'refs', 'a.md'), 'utf8'), 'a')
    await assert.rejects(stat(path.join(skillDir, '.DS_Store')))
    const copy = JSON.parse(await readFile(path.join(root, 'skills.json'), 'utf8'))
    assert.equal(copy.skills[1].source, 'local')
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('needs no network once pinned, and notices an edit on either side', async () => {
  const { temp, root, locals, pinned, options } = await localFixture()
  const offline = async () => {
    throw new Error('offline')
  }
  const own = { ...pinned, skills: [pinned.skills[1]] }
  const sync = (extra = {}) => syncBundle(own, { ...options, fetchImpl: offline, ...extra })
  try {
    await rm(root, { recursive: true, force: true })
    await sync()
    assert.deepEqual(await verifyBundle(own, root, undefined, locals), [])

    await writeFile(path.join(root, 'skills', 'mine', 'SKILL.md'), 'changed in the bundle')
    assert.match((await verifyBundle(own, root, undefined, locals)).join('\n'), /mine differs/)

    await sync()
    await writeFile(path.join(locals, 'mine', 'refs', 'a.md'), 'edited in the repository')
    assert.deepEqual(await verifyBundle(own, root, undefined, locals), [
      '.agents/skills/mine changed since it was pinned; run sync.js --update',
    ])
    await rm(root, { recursive: true, force: true })
    await assert.rejects(sync(), /\.agents\/skills\/mine changed since it was pinned/)
    await assert.rejects(stat(root))
    const repinned = await sync({ update: true })
    assert.notEqual(repinned.skills[0].treeSha256, own.skills[0].treeSha256)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('refuses a local skill without SKILL.md, licence file, licence name or usable folder', async () => {
  const { temp, locals } = await localFixture()
  const files = (entry) => localSkillFiles({ ...localSkill, ...entry }, locals)
  try {
    await assert.rejects(files({ license: undefined }), /name its license/)
    await assert.rejects(files({ folder: 'gone' }), /\.agents\/skills\/gone is missing/)
    await assert.rejects(files({ folder: '..' }), /not a usable skill folder/)
    await assert.rejects(files({ folder: 'a/b' }), /not a usable skill folder/)
    await assert.rejects(files({ omit: { paths: ['x'] } }), /bundled as it is/)
    await rm(path.join(locals, 'mine', 'LICENSE'))
    await assert.rejects(files({}), /no LICENSE/)
    await writeFile(path.join(locals, 'mine', 'LICENSE'), '')
    await assert.rejects(files({}), /no LICENSE/)
    await writeFile(path.join(locals, 'mine', 'LICENSE'), 'text')
    await rm(path.join(locals, 'mine', 'SKILL.md'))
    await assert.rejects(files({}), /no SKILL\.md/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

const packSkill = { ...localSkill, folder: 'clip', summary: 'a pack skill', pack: 'motion' }
const packs = { motion: { plugin: 'tastecode-motion', description: 'Fixture motion pack.' } }

/** The fixture above plus one skill of our own that belongs to the `motion` pack. */
async function packFixture() {
  const fixture = await localFixture()
  const { locals, pinned, options } = fixture
  await mkdir(path.join(locals, 'clip'), { recursive: true })
  await writeFile(path.join(locals, 'clip', 'SKILL.md'), '---\nname: clip\n---\nIn the pack.\n')
  await writeFile(path.join(locals, 'clip', 'LICENSE'), 'Pack licence text')
  const manifest = { ...pinned, packs, skills: [...pinned.skills, { ...packSkill }] }
  await rm(fixture.root, { recursive: true, force: true })
  const withPack = await syncBundle(manifest, { ...options, update: true })
  return { ...fixture, pinned: withPack }
}

test('lays a pack out as a plugin of its own and leaves the base bundle as it was', async () => {
  const { temp, root, locals, pinned } = await packFixture()
  try {
    assert.deepEqual(await verifyBundle(pinned, root, undefined, locals), [])
    const packDir = path.join(root, 'packs', 'motion')
    assert.equal(
      await readFile(path.join(packDir, 'skills', 'clip', 'LICENSE'), 'utf8'),
      'Pack licence text',
    )
    assert.deepEqual(
      JSON.parse(await readFile(path.join(packDir, '.claude-plugin', 'plugin.json'), 'utf8')),
      { name: 'tastecode-motion', description: 'Fixture motion pack.' },
    )
    // The base plugin keeps its own name and skills, and never lists the pack's skill.
    assert.equal(
      await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
      '{\n  "name": "tastecode"\n}\n',
    )
    await assert.rejects(stat(path.join(root, 'skills', 'clip')))
    assert.deepEqual(
      bundleLayout(pinned, root).map((plugin) => [plugin.name, plugin.skills.map((s) => s.folder)]),
      [
        [undefined, ['demo', 'mine']],
        ['motion', ['clip']],
      ],
    )
    // The app reads one copy of skills.json, at the base root, that names every skill.
    const copy = JSON.parse(await readFile(path.join(root, 'skills.json'), 'utf8'))
    assert.deepEqual(
      copy.skills.map((entry) => entry.pack),
      [undefined, undefined, 'motion'],
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

const designPack = { plugin: 'tastecode-design', description: 'Fixture design pack.' }

/** The pack fixture with `clip` also in a second pack: `pack` is a list. */
async function sharedFixture() {
  const fixture = await packFixture()
  const { pinned, options } = fixture
  const manifest = {
    ...pinned,
    packs: { ...packs, design: designPack },
    skills: pinned.skills.map((entry) =>
      entry.folder === 'clip' ? { ...entry, pack: ['motion', 'design'] } : entry,
    ),
  }
  await rm(fixture.root, { recursive: true, force: true })
  return { ...fixture, pinned: await syncBundle(manifest, { ...options, update: true }) }
}

test('a skill in two packs is copied into both, measured once, and stays out of the base bundle', async () => {
  const { temp, root, locals, pinned } = await sharedFixture()
  try {
    assert.deepEqual(await verifyBundle(pinned, root, undefined, locals), [])
    for (const pack of ['motion', 'design']) {
      assert.equal(
        await readFile(path.join(root, 'packs', pack, 'skills', 'clip', 'LICENSE'), 'utf8'),
        'Pack licence text',
      )
    }
    await assert.rejects(stat(path.join(root, 'skills', 'clip')))
    assert.deepEqual(
      bundleLayout(pinned, root).map((plugin) => [plugin.name, plugin.skills.map((s) => s.folder)]),
      [
        [undefined, ['demo', 'mine']],
        ['motion', ['clip']],
        ['design', ['clip']],
      ],
    )
    assert.deepEqual(skillPacks({}), [])
    assert.deepEqual(skillPacks({ pack: 'motion' }), ['motion'])
    assert.deepEqual(skillPacks({ pack: ['motion', 'design'] }), ['motion', 'design'])

    // Each copy is checked on its own: damage in one pack is named by that pack only.
    await writeFile(path.join(root, 'packs', 'design', 'skills', 'clip', 'SKILL.md'), 'changed')
    const found = (await verifyBundle(pinned, root, undefined, locals)).join('\n')
    assert.match(found, /pack design: clip differs/)
    assert.doesNotMatch(found, /pack motion/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('refuses a pack list with an undeclared, repeated, empty or mistyped name', () => {
  const base = { plugin: { name: 'tastecode' }, packs: { ...packs, design: designPack } }
  const withPack = (pack) => ({ ...base, skills: [{ ...packSkill, pack }] })
  const mistake = 'clip: pack must be a name or a list of different names'
  assert.deepEqual(manifestProblems(withPack(['motion', 'design'])), [])
  assert.deepEqual(manifestProblems(withPack(['motion', 'nope'])), [
    'pack design: has no skills',
    'clip: pack nope is not declared under packs',
  ])
  assert.deepEqual(manifestProblems(withPack(['motion', 'motion'])), [
    'pack design: has no skills',
    mistake,
  ])
  assert.deepEqual(manifestProblems(withPack([])), [
    'pack motion: has no skills',
    'pack design: has no skills',
    mistake,
  ])
  assert.deepEqual(manifestProblems(withPack(['motion', 7])).slice(-1), [mistake])
})

test('a bundle without packs has no packs folder, as before', async () => {
  const { temp, root, locals, pinned } = await localFixture()
  try {
    await assert.rejects(stat(path.join(root, 'packs')))
    assert.deepEqual(await verifyBundle(pinned, root, undefined, locals), [])
    await mkdir(path.join(root, 'packs'))
    assert.deepEqual(await verifyBundle(pinned, root, undefined, locals), [
      'unexpected entry in bundle: packs',
    ])
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('verify catches a pack skill changed in the repository or the bundle, and stray pack files', async () => {
  const { temp, root, locals, pinned, options } = await packFixture()
  const problems = async () => (await verifyBundle(pinned, root, undefined, locals)).join('\n')
  try {
    await writeFile(path.join(locals, 'clip', 'SKILL.md'), 'edited after it was pinned')
    assert.equal(
      await problems(),
      '.agents/skills/clip changed since it was pinned; run sync.js --update',
    )
    await rm(root, { recursive: true, force: true })
    await assert.rejects(
      syncBundle(pinned, options),
      /clip: \.agents\/skills\/clip changed since it was pinned/,
    )
    await writeFile(path.join(locals, 'clip', 'SKILL.md'), '---\nname: clip\n---\nIn the pack.\n')
    await syncBundle(pinned, options)
    assert.equal(await problems(), '')

    const packDir = path.join(root, 'packs', 'motion')
    await writeFile(path.join(packDir, 'skills', 'clip', 'SKILL.md'), 'changed in the bundle')
    assert.match(await problems(), /pack motion: clip differs/)
    await rm(packDir, { recursive: true, force: true })
    assert.match(await problems(), /pack motion: plugin\.json is missing/)
    assert.match(await problems(), /pack motion: clip is missing/)

    await rm(root, { recursive: true, force: true })
    await syncBundle(pinned, options)
    await mkdir(path.join(root, 'packs', 'other'))
    await writeFile(path.join(root, 'packs', 'motion', 'extra.txt'), 'x')
    await mkdir(path.join(root, 'packs', 'motion', 'skills', 'stray'))
    const found = await problems()
    assert.match(found, /unexpected pack folder: other/)
    assert.match(found, /pack motion: unexpected entry in pack: extra\.txt/)
    assert.match(found, /pack motion: unexpected skill folder: stray/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('refuses packs that are undeclared, repeated, empty or unsafe', () => {
  const base = { plugin: { name: 'tastecode' }, packs, skills: [{ ...packSkill }] }
  assert.deepEqual(manifestProblems(base), [])
  assert.deepEqual(manifestProblems({ ...base, skills: [{ ...packSkill, pack: 'nope' }] }), [
    'pack motion: has no skills',
    'clip: pack nope is not declared under packs',
  ])
  assert.deepEqual(
    manifestProblems({ ...base, skills: [packSkill, { ...packSkill, pack: undefined }] }),
    ['clip: listed more than once'],
  )
  assert.deepEqual(manifestProblems({ ...base, packs: { motion: { plugin: 'tastecode' } } }), [
    'pack motion: needs a plugin name of its own',
  ])
  assert.deepEqual(manifestProblems({ ...base, packs: { '../x': packs.motion }, skills: [] }), [
    'pack ../x: not a usable pack name',
    'pack ../x: has no skills',
  ])
})

test('the committed packs hold the Motion skills and the Design skills, with a licence each', async () => {
  const manifest = await readManifest()
  const inPack = (pack) => manifest.skills.filter((entry) => skillPacks(entry).includes(pack))
  assert.deepEqual(Object.keys(manifest.packs), ['motion', 'design'])
  assert.deepEqual(
    inPack('motion').map((entry) => entry.folder),
    [
      'motion-app-ae',
      'composicao-trilha',
      'video-referencias',
      'captura-de-movimento',
      'animacao-saas',
      'motion-narrado',
      'stageshow',
      'hyperframes',
      'hyperframes-core',
      'hyperframes-animation',
      'hyperframes-audio',
      'hyperframes-cli',
      'hyperframes-creative',
      'hyperframes-keyframes',
      'hyperframes-registry',
      'hyperframes-studio',
      'motion-graphics',
      'media-use',
      'figma',
    ],
  )
  const design = inPack('design').map((entry) => entry.folder)
  // The team's own skills first, then the third-party ones.
  assert.deepEqual(design.slice(0, 3), ['stageshow', 'figma', 'ui-profissional'])
  assert.equal(design.length, 36)
  // The two skills the packs share are the only ones in both.
  assert.deepEqual(
    manifest.skills.filter((entry) => skillPacks(entry).length > 1).map((entry) => entry.folder),
    ['stageshow', 'figma'],
  )
  for (const entry of [...inPack('motion'), ...inPack('design')]) {
    assert.match(entry.licenseFile, /LICENSE(\.txt)?$/, entry.folder)
    assert.match(entry.license, /^(MIT|Apache-2\.0)$/, entry.folder)
    // A pinned skill names an exact commit; the others live in this repository.
    if (entry.source === 'local') assert.equal(entry.commit, undefined, entry.folder)
    else assert.match(entry.commit, /^[0-9a-f]{40}$/, entry.folder)
  }
  // The base bundle is the three pinned skills, then `watch` and `ouvir`, with no pack.
  assert.deepEqual(
    manifest.skills.filter((entry) => !entry.pack).map((entry) => entry.folder),
    ['cinetic', 'design-taste-frontend', 'cook', 'watch', 'ouvir'],
  )
})
