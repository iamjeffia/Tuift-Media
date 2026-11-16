// Fetches the Agent Skills TUIFT Code ships by default from their pinned GitHub
// commits, checks them against skills.json and lays them out as one folder that
// is both a plain skills tree (`skills/<name>/SKILL.md`) and a Claude Code
// plugin (`.claude-plugin/plugin.json`), with a copy of skills.json for the app.
//
// A skill can also live in this repository, in .agents/skills/<folder>/ (the one
// copy agents working here read) with its own SKILL.md and LICENSE. Its
// skills.json entry has `"source": "local"`, a `license` and the measured
// hashes, and no repository or commit. It is checked, bundled and installed
// exactly like a pinned one: edit the folder, then run `sync.js --update` to
// record the new hashes.
//
// Layout of the bundle. A skill with no `pack` belongs to the base bundle: the
// bundle root itself, as above. A skill with `"pack": "<name>"` (declared under
// `packs` in skills.json) is laid out as a second plugin of its own. `pack` may
// also be a list of names, `["motion", "design"]`: the skill is then copied into
// each of those packs, and its hashes are measured once.
//
//   bundle/                          base plugin: skills with no pack
//     .claude-plugin/plugin.json
//     skills/<folder>/SKILL.md
//     skills.json                    the whole manifest, packs included
//     packs/<name>/                  one more plugin per pack
//       .claude-plugin/plugin.json
//       skills/<folder>/SKILL.md
//
// The base plugin never lists a pack's skills: Claude Code reads only
// `skills/` of the plugin directory it is given, so the nested `packs/` is
// invisible to it (checked on 2.1.325). A pack is turned on by passing
// `bundle/packs/<name>` as one more plugin directory.
//
//   node scripts/sync.js            fetch when the bundle is missing or differs
//   node scripts/sync.js --verify   check the bundle only; exit 1 when it is off
//   node scripts/sync.js --update   fetch and write the measured hashes into
//                                   skills.json (after moving a pin on purpose)
//
// The bundle is gitignored: the skill files are about 13 MB, so only the pins
// and their hashes live in the repository. A skill's `omit` entry leaves files
// out of the bundle, and its `patch` entry swaps upstream files for TUIFT Code's
// copies in patches/<folder>/ (see the README there). Nothing else is fetched
// later: the bundle is all an installed app has.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  archiveUrl,
  digestFiles,
  fetchArchive,
  isStray,
  omitFiles,
  skillFiles,
} from './skill-media.mjs'

export { digestFiles, isStray, skillFiles, tarEntries } from './skill-media.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const packageRoot = path.resolve(here, '..')
export const manifestPath = path.join(packageRoot, 'skills.json')
export const bundleRoot = path.join(packageRoot, 'bundle')
/** TUIFT Code's own copies of upstream skill files, one folder per skill (see its README). */
export const patchesRoot = path.join(packageRoot, 'patches')
/** Skills that live in this repository, one folder per skill: the folder agents working here read. */
export const localRoot = path.resolve(packageRoot, '..', '..', '.agents', 'skills')
const LOCAL_LABEL = '.agents/skills'
const SAFE_NAME = /^[\w.-]+$/

export function isLocalSkill(skill) {
  return skill.source === 'local'
}

/** The packs a skill belongs to: none (the base bundle), one (`"pack": "a"`) or several (`"pack": ["a", "b"]`). */
export function skillPacks(skill) {
  if (skill.pack === undefined) return []
  return Array.isArray(skill.pack) ? skill.pack : [skill.pack]
}

/** A path inside a skill folder: no absolute path, no `..`, no empty part. */
function isSafeRelative(relative) {
  return (
    typeof relative === 'string' &&
    !path.isAbsolute(relative) &&
    relative
      .split('/')
      .every((part) => part && part !== '.' && part !== '..' && !part.includes('\\'))
  )
}

export function patchPath(skill, relative, root = patchesRoot) {
  return path.join(root, skill.folder, ...relative.split('/'))
}

/**
 * Takes the files a skill's `patch` entry replaces out of `files` and returns
 * TUIFT Code's copies of them, plus the files `patch.add` lists: TUIFT Code's
 * own files that sit beside the upstream ones and must not exist upstream.
 * Each replaced upstream file must still be the one its patch was written
 * against; with `update`, the measured hashes are returned instead, for a
 * maintainer who has carried the patch over to a new pin.
 */
async function patchFiles(files, skill, update, root = patchesRoot) {
  const replacements = new Map()
  if (!skill.patch) return { replacements, entry: undefined }
  const measured = {}
  for (const relative of skill.patch.add ?? []) {
    if (!isSafeRelative(relative))
      throw new Error(
        `${skill.folder}: added file ${relative} is not a relative path inside the skill`,
      )
    if (files.has(relative))
      throw new Error(
        `${skill.folder}: added file ${relative} already exists upstream; use patch.files`,
      )
    replacements.set(relative, await readFile(patchPath(skill, relative, root)))
  }
  for (const [relative, base] of Object.entries(skill.patch.files)) {
    const upstream = files.get(relative)
    if (!upstream) throw new Error(`${skill.folder}: patched file ${relative} is not upstream`)
    const sha = createHash('sha256').update(upstream).digest('hex')
    if (!update && sha !== base)
      throw new Error(
        `${skill.folder}: upstream ${relative} changed (sha256 ${sha}); carry patches/${skill.folder}/${relative} over, then run sync.js --update`,
      )
    measured[relative] = sha
    files.delete(relative)
    replacements.set(relative, await readFile(patchPath(skill, relative, root)))
  }
  return { replacements, entry: { ...skill.patch, files: measured } }
}

/**
 * The files of a skill kept in this repository. It must carry its own licence
 * file and say which licence that is, like a pinned skill does.
 */
export async function localSkillFiles(skill, root = localRoot) {
  const { folder } = skill
  if (!SAFE_NAME.test(folder) || folder === '.' || folder === '..')
    throw new Error(`${folder}: not a usable skill folder name`)
  if (skill.patch || skill.omit || skill.repository)
    throw new Error(`${folder}: a local skill is bundled as it is, with no pin, patch or omit`)
  if (!skill.license) throw new Error(`${folder}: a local skill must name its license`)
  const files = new Map()
  try {
    await readTree(path.join(root, folder), '', files)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${folder}: ${LOCAL_LABEL}/${folder} is missing`)
    throw error
  }
  for (const name of files.keys()) if (isStray(name)) files.delete(name)
  if (!files.has('SKILL.md')) throw new Error(`${folder}: no SKILL.md in ${LOCAL_LABEL}/${folder}`)
  if (!files.get('LICENSE')?.length)
    throw new Error(`${folder}: no LICENSE in ${LOCAL_LABEL}/${folder}`)
  return files
}

function pluginJson(plugin) {
  return `${JSON.stringify(plugin, null, 2)}\n`
}

/** The plugin manifest Claude Code reads; its name is the prefix skills show under. */
export function pluginManifest(manifest) {
  return pluginJson(manifest.plugin)
}

/**
 * The plugins the bundle holds: the base one at `root`, then one per declared
 * pack under `root/packs/<name>`, each with the skills that belong to it.
 */
export function bundleLayout(manifest, root = bundleRoot) {
  const base = {
    dir: root,
    plugin: manifest.plugin,
    skills: manifest.skills.filter((skill) => skillPacks(skill).length === 0),
  }
  const packs = Object.entries(manifest.packs ?? {}).map(([name, pack]) => ({
    name,
    dir: path.join(root, 'packs', name),
    plugin: {
      name: pack.plugin,
      description: pack.description,
      ...(manifest.plugin.author ? { author: manifest.plugin.author } : {}),
    },
    skills: manifest.skills.filter((skill) => skillPacks(skill).includes(name)),
  }))
  return [base, ...packs]
}

/** Where a skill's files go in a bundle (or staging) folder: one place per pack it is in. */
function skillDirs(root, skill) {
  const packs = skillPacks(skill)
  return packs.length
    ? packs.map((pack) => path.join(root, 'packs', pack, 'skills', skill.folder))
    : [path.join(root, 'skills', skill.folder)]
}

/** Mistakes in how skills.json declares packs: unsafe names, repeated folders, empty packs. */
export function manifestProblems(manifest) {
  const problems = []
  const packs = manifest.packs ?? {}
  const plugins = new Set([manifest.plugin?.name])
  for (const [name, pack] of Object.entries(packs)) {
    if (!SAFE_NAME.test(name)) problems.push(`pack ${name}: not a usable pack name`)
    if (!SAFE_NAME.test(pack?.plugin ?? '') || plugins.has(pack.plugin))
      problems.push(`pack ${name}: needs a plugin name of its own`)
    plugins.add(pack?.plugin)
    if (!manifest.skills.some((skill) => skillPacks(skill).includes(name)))
      problems.push(`pack ${name}: has no skills`)
  }
  const folders = new Set()
  for (const skill of manifest.skills) {
    if (folders.has(skill.folder)) problems.push(`${skill.folder}: listed more than once`)
    folders.add(skill.folder)
    const named = skillPacks(skill)
    if (
      skill.pack !== undefined &&
      (named.length === 0 ||
        named.some((pack) => typeof pack !== 'string') ||
        new Set(named).size !== named.length)
    )
      problems.push(`${skill.folder}: pack must be a name or a list of different names`)
    for (const pack of named)
      if (typeof pack === 'string' && !Object.hasOwn(packs, pack))
        problems.push(`${skill.folder}: pack ${pack} is not declared under packs`)
  }
  return problems
}

async function readTree(root, relative = '', into = new Map()) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) await readTree(root, child, into)
    else if (entry.isFile()) into.set(child, await readFile(path.join(root, child)))
    else throw new Error(`Unexpected non-file in bundle: ${child}`)
  }
  return into
}

export async function readManifest(file = manifestPath) {
  return JSON.parse(await readFile(file, 'utf8'))
}

/** Problems with an existing bundle, or an empty list when it matches the manifest exactly. */
export async function verifyBundle(
  manifest,
  root = bundleRoot,
  patches = patchesRoot,
  locals = localRoot,
) {
  const declared = manifestProblems(manifest)
  if (declared.length) return declared
  const problems = []
  try {
    if (!(await stat(root)).isDirectory()) return [`${root} is not a folder`]
  } catch {
    return [`${root} is missing; run pnpm --filter @harness/default-skills sync`]
  }
  try {
    const copy = JSON.parse(await readFile(path.join(root, 'skills.json'), 'utf8'))
    if (JSON.stringify(copy) !== JSON.stringify(manifest))
      problems.push('skills.json in the bundle differs from the pinned one')
  } catch {
    problems.push('skills.json is missing from the bundle')
  }
  const layout = bundleLayout(manifest, root)
  const packs = layout.slice(1)
  const expected = new Set([
    '.claude-plugin',
    'skills',
    'skills.json',
    ...(packs.length ? ['packs'] : []),
  ])
  for (const name of await readdir(root))
    if (!expected.has(name)) problems.push(`unexpected entry in bundle: ${name}`)
  for (const plugin of layout) problems.push(...(await pluginProblems(plugin, patches, locals)))
  if (packs.length) {
    const wanted = new Set(packs.map((pack) => pack.name))
    for (const name of await readdir(path.join(root, 'packs')).catch(() => []))
      if (!wanted.has(name)) problems.push(`unexpected pack folder: ${name}`)
  }
  return problems
}

/** Problems with one plugin of the bundle: the base one (no `name`) or a pack. */
async function pluginProblems({ name, dir, plugin, skills }, patches, locals) {
  const label = name ? `pack ${name}: ` : ''
  const problems = []
  try {
    const shipped = await readFile(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')
    if (shipped !== pluginJson(plugin))
      problems.push(`${label}plugin.json differs from skills.json`)
  } catch {
    problems.push(`${label}plugin.json is missing`)
  }
  if (name)
    for (const entry of await readdir(dir).catch(() => [])) {
      if (entry !== '.claude-plugin' && entry !== 'skills')
        problems.push(`${label}unexpected entry in pack: ${entry}`)
    }
  let folders = []
  try {
    folders = await readdir(path.join(dir, 'skills'))
  } catch {
    problems.push(`${label}skills folder is missing`)
  }
  const wanted = new Set(skills.map((skill) => skill.folder))
  for (const folder of folders)
    if (!wanted.has(folder)) problems.push(`${label}unexpected skill folder: ${folder}`)
  for (const skill of skills) {
    let files
    try {
      files = await readTree(path.join(dir, 'skills', skill.folder))
    } catch {
      problems.push(`${label}${skill.folder} is missing`)
      continue
    }
    for (const relative of [
      ...Object.keys(skill.patch?.files ?? {}),
      ...(skill.patch?.add ?? []),
    ]) {
      const shipped = files.get(relative)
      if (!shipped?.equals(await readFile(patchPath(skill, relative, patches))))
        problems.push(`${label}${skill.folder}: ${relative} is not TUIFT Code's patched copy`)
      files.delete(relative)
    }
    const digest = digestFiles(files)
    if (digest.treeSha256 !== skill.treeSha256)
      problems.push(
        `${label}${skill.folder} differs from its pin (${digest.files} files, ${digest.bytes} bytes; expected ${skill.files} files, ${skill.bytes} bytes)`,
      )
    if (isLocalSkill(skill)) problems.push(...(await localSourceProblems(skill, locals)))
  }
  return problems
}

/** Why the repository's copy of a local skill is not the one its pin describes, if it is not. */
async function localSourceProblems(skill, locals) {
  try {
    const digest = digestFiles(await localSkillFiles(skill, locals))
    return digest.treeSha256 === skill.treeSha256
      ? []
      : [`${LOCAL_LABEL}/${skill.folder} changed since it was pinned; run sync.js --update`]
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }
}

/**
 * Builds the bundle next to the old one and swaps it in only when every skill
 * matched its pin. With `update`, the measured hashes are returned instead of
 * checked so a maintainer can move a pin deliberately.
 */
export async function syncBundle(
  manifest,
  {
    root = bundleRoot,
    patches = patchesRoot,
    locals = localRoot,
    fetchImpl = fetch,
    update = false,
    log = console.log,
  } = {},
) {
  const declared = manifestProblems(manifest)
  if (declared.length) throw new Error(declared.join('; '))
  if (!update && (await verifyBundle(manifest, root, patches, locals)).length === 0) {
    log('Default skills are up to date.')
    return manifest
  }
  const staging = `${root}.staging-${process.pid}`
  await rm(staging, { recursive: true, force: true })
  const next = { ...manifest, skills: [] }
  // Several skills come from one repository at one commit: one download serves them all.
  const archives = new Map()
  const archiveOf = (skill) => {
    const url = archiveUrl(skill)
    if (!archives.has(url)) archives.set(url, fetchArchive(skill, fetchImpl))
    return archives.get(url)
  }
  try {
    for (const skill of manifest.skills) {
      let archiveSha256
      let all
      if (isLocalSkill(skill)) all = await localSkillFiles(skill, locals)
      else {
        const gz = await archiveOf(skill)
        archiveSha256 = createHash('sha256').update(gz).digest('hex')
        if (!update && archiveSha256 !== skill.archiveSha256)
          throw new Error(
            `${skill.folder}: archive sha256 ${archiveSha256} does not match the pinned ${skill.archiveSha256}`,
          )
        all = skillFiles(gunzipSync(gz), skill)
      }
      const files = skill.omit ? omitFiles(all, skill.omit) : all
      const patch = await patchFiles(files, skill, update, patches)
      const digest = digestFiles(files)
      if (!update && digest.treeSha256 !== skill.treeSha256)
        throw new Error(
          isLocalSkill(skill)
            ? `${skill.folder}: ${LOCAL_LABEL}/${skill.folder} changed since it was pinned; run sync.js --update`
            : `${skill.folder}: extracted files do not match the pinned tree hash`,
        )
      for (const dir of skillDirs(staging, skill))
        for (const [relative, body] of [...files, ...patch.replacements]) {
          const target = path.join(dir, ...relative.split('/'))
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, body)
        }
      next.skills.push({
        ...skill,
        ...(archiveSha256 ? { archiveSha256 } : {}),
        ...digest,
        ...(patch.entry ? { patch: patch.entry } : {}),
      })
      log(
        `${skill.pack ? `[${skillPacks(skill).join(', ')}] ` : ''}${skill.folder}: ${digest.files + patch.replacements.size} files @ ${skill.commit ?? `${LOCAL_LABEL}/${skill.folder}`}` +
          (skill.omit ? `, ${all.size - files.size - patch.replacements.size} left out` : '') +
          (patch.entry ? `, ${patch.replacements.size} patched` : ''),
      )
    }
    for (const { dir, plugin } of bundleLayout(manifest, staging)) {
      await mkdir(path.join(dir, '.claude-plugin'), { recursive: true })
      await writeFile(path.join(dir, '.claude-plugin', 'plugin.json'), pluginJson(plugin))
    }
    // The app reads names and summaries from here; the source tree is not shipped.
    await writeFile(path.join(staging, 'skills.json'), `${JSON.stringify(next, null, 2)}\n`)
    await rm(root, { recursive: true, force: true })
    await rename(staging, root)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return next
}

async function main(argv) {
  const manifest = await readManifest()
  if (argv.includes('--verify')) {
    const problems = await verifyBundle(manifest)
    if (problems.length) {
      for (const problem of problems) console.error(`default skills: ${problem}`)
      process.exitCode = 1
    } else console.log('Default skills match skills.json.')
    return
  }
  const update = argv.includes('--update')
  const next = await syncBundle(manifest, { update })
  if (update) await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
