// Fetches the Agent Skills TUIFT Code ships by default from their pinned GitHub
// commits, checks them against skills.json and lays them out as one folder that
// is both a plain skills tree (`skills/<name>/SKILL.md`) and a Claude Code
// plugin (`.claude-plugin/plugin.json`), with a copy of skills.json for the app.
//
// A skill can also live in this repository, in tuift/<folder>/ with its own
// SKILL.md and LICENSE. Its skills.json entry has `"source": "local"`, a
// `license` and the measured hashes, and no repository or commit. It is
// checked, bundled and installed exactly like a pinned one: edit the folder,
// then run `sync.js --update` to record the new hashes.
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
import { digestFiles, fetchArchive, isStray, omitFiles, skillFiles } from './skill-media.mjs'

export { digestFiles, isStray, skillFiles, tarEntries } from './skill-media.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const packageRoot = path.resolve(here, '..')
export const manifestPath = path.join(packageRoot, 'skills.json')
export const bundleRoot = path.join(packageRoot, 'bundle')
/** TUIFT Code's own copies of upstream skill files, one folder per skill (see its README). */
export const patchesRoot = path.join(packageRoot, 'patches')
/** Skills that live in this repository, one folder per skill. */
export const localRoot = path.join(packageRoot, 'tuift')

export function isLocalSkill(skill) {
  return skill.source === 'local'
}

export function patchPath(skill, relative, root = patchesRoot) {
  return path.join(root, skill.folder, ...relative.split('/'))
}

/**
 * Takes the files a skill's `patch` entry replaces out of `files` and returns
 * TUIFT Code's copies of them. Each upstream file must still be the one its
 * patch was written against; with `update`, the measured hashes are returned
 * instead, for a maintainer who has carried the patch over to a new pin.
 */
async function patchFiles(files, skill, update, root = patchesRoot) {
  const replacements = new Map()
  if (!skill.patch) return { replacements, entry: undefined }
  const measured = {}
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
  if (!/^[\w.-]+$/.test(folder) || folder === '.' || folder === '..')
    throw new Error(`${folder}: not a usable skill folder name`)
  if (skill.patch || skill.omit || skill.repository)
    throw new Error(`${folder}: a local skill is bundled as it is, with no pin, patch or omit`)
  if (!skill.license) throw new Error(`${folder}: a local skill must name its license`)
  const files = new Map()
  try {
    await readTree(path.join(root, folder), '', files)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${folder}: tuift/${folder} is missing`)
    throw error
  }
  for (const name of files.keys()) if (isStray(name)) files.delete(name)
  if (!files.has('SKILL.md')) throw new Error(`${folder}: no SKILL.md in tuift/${folder}`)
  if (!files.get('LICENSE')?.length) throw new Error(`${folder}: no LICENSE in tuift/${folder}`)
  return files
}

/** The plugin manifest Claude Code reads; its name is the prefix skills show under. */
export function pluginManifest(manifest) {
  return `${JSON.stringify(manifest.plugin, null, 2)}\n`
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
  const problems = []
  try {
    if (!(await stat(root)).isDirectory()) return [`${root} is not a folder`]
  } catch {
    return [`${root} is missing; run pnpm --filter @harness/default-skills sync`]
  }
  try {
    const plugin = await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')
    if (plugin !== pluginManifest(manifest)) problems.push('plugin.json differs from skills.json')
  } catch {
    problems.push('plugin.json is missing')
  }
  try {
    const copy = JSON.parse(await readFile(path.join(root, 'skills.json'), 'utf8'))
    if (JSON.stringify(copy) !== JSON.stringify(manifest))
      problems.push('skills.json in the bundle differs from the pinned one')
  } catch {
    problems.push('skills.json is missing from the bundle')
  }
  const expected = new Set(['.claude-plugin', 'skills', 'skills.json'])
  for (const name of await readdir(root))
    if (!expected.has(name)) problems.push(`unexpected entry in bundle: ${name}`)
  let folders = []
  try {
    folders = await readdir(path.join(root, 'skills'))
  } catch {
    problems.push('skills folder is missing')
  }
  const wanted = new Set(manifest.skills.map((skill) => skill.folder))
  for (const folder of folders)
    if (!wanted.has(folder)) problems.push(`unexpected skill folder: ${folder}`)
  for (const skill of manifest.skills) {
    const dir = path.join(root, 'skills', skill.folder)
    let files
    try {
      files = await readTree(dir)
    } catch {
      problems.push(`${skill.folder} is missing`)
      continue
    }
    for (const relative of Object.keys(skill.patch?.files ?? {})) {
      const shipped = files.get(relative)
      if (!shipped?.equals(await readFile(patchPath(skill, relative, patches))))
        problems.push(`${skill.folder}: ${relative} is not TUIFT Code's patched copy`)
      files.delete(relative)
    }
    const digest = digestFiles(files)
    if (digest.treeSha256 !== skill.treeSha256)
      problems.push(
        `${skill.folder} differs from its pin (${digest.files} files, ${digest.bytes} bytes; expected ${skill.files} files, ${skill.bytes} bytes)`,
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
      : [`tuift/${skill.folder} changed since it was pinned; run sync.js --update`]
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
  if (!update && (await verifyBundle(manifest, root, patches, locals)).length === 0) {
    log('Default skills are up to date.')
    return manifest
  }
  const staging = `${root}.staging-${process.pid}`
  await rm(staging, { recursive: true, force: true })
  const next = { ...manifest, skills: [] }
  try {
    for (const skill of manifest.skills) {
      let archiveSha256
      let all
      if (isLocalSkill(skill)) all = await localSkillFiles(skill, locals)
      else {
        const gz = await fetchArchive(skill, fetchImpl)
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
            ? `${skill.folder}: tuift/${skill.folder} changed since it was pinned; run sync.js --update`
            : `${skill.folder}: extracted files do not match the pinned tree hash`,
        )
      for (const [relative, body] of [...files, ...patch.replacements]) {
        const target = path.join(staging, 'skills', skill.folder, ...relative.split('/'))
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
        `${skill.folder}: ${digest.files + patch.replacements.size} files @ ${skill.commit ?? `tuift/${skill.folder}`}` +
          (skill.omit ? `, ${all.size - files.size - patch.replacements.size} left out` : '') +
          (patch.entry ? `, ${patch.replacements.size} patched` : ''),
      )
    }
    await mkdir(path.join(staging, '.claude-plugin'), { recursive: true })
    await writeFile(path.join(staging, '.claude-plugin', 'plugin.json'), pluginManifest(manifest))
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
