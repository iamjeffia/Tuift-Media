// Fetches the pinned release of the After Effects MCP server TUIFT Code ships, checks it
// against server.json and unpacks it into bundle/ (gitignored). The installer copies
// bundle/after-effects-mcp/ to resources/after-effects-mcp, outside the asar: After Effects
// reads its jsx/ files and Node reads its node_modules/.
//
//   node scripts/sync.js            fetch when the bundle is missing or differs
//   node scripts/sync.js --verify   check the bundle on disk against server.json; no network
//
// The release asset is a .tgz with one top-level folder, `after-effects-mcp/`. It is accepted
// only when its size and SHA-256 match server.json, and unpacked only when every entry is a
// regular file below that folder. TUIFT_AE_MCP_TARBALL names a local file that stands in for
// the download (development, tests); the same size and SHA-256 checks apply to it.
//
// While server.json says `"pinned": false` there is nothing to fetch: sync says so, the
// build ships no server and the app behaves as it did before this package existed.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { digestFiles, tarEntries } from '../../default-skills/scripts/skill-media.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const packageRoot = path.resolve(here, '..')
export const manifestPath = path.join(packageRoot, 'server.json')
export const bundleRoot = path.join(packageRoot, 'bundle')
/** The one folder the release asset holds, and the folder that ships. */
export const SERVER_FOLDER = 'after-effects-mcp'
/** Written beside the server folder: what the bundle was built from and its tree digest. */
export const RECEIPT_FILE = 'receipt.json'
export const TARBALL_ENV = 'TUIFT_AE_MCP_TARBALL'

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024
const MAX_FILES = 50_000
/** Files the server cannot run, or cannot be shipped, without. */
const REQUIRED_FILES = [
  'dist/index.js',
  'package.json',
  'LICENSE',
  'NOTICE.md',
  'THIRD_PARTY_LICENSES.txt',
]
/** The fields that stay empty until a release is pinned. */
const PIN_FIELDS = ['version', 'tag', 'commit', 'url', 'sha256', 'bytes']

export const isPinned = (manifest) => manifest.pinned === true

/** What a pinned manifest must say; empty when it is sound. */
export function manifestProblems(manifest) {
  const problems = []
  if (!/^[\w.-]+\/[\w.-]+$/.test(manifest.repository ?? ''))
    problems.push('repository must be owner/name')
  if (!manifest.license) problems.push('license is missing')
  if (typeof manifest.pinned !== 'boolean') return [...problems, 'pinned must be true or false']
  if (!manifest.pinned) {
    for (const field of PIN_FIELDS)
      if (manifest[field] != null) problems.push(`${field} is set while pinned is false`)
    return problems
  }
  const expect = (field, ok) => ok || problems.push(`${field} is missing or malformed`)
  expect('version', /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? ''))
  expect('tag', /^[\w.-]+$/.test(manifest.tag ?? ''))
  expect('commit', /^[0-9a-f]{40}$/.test(manifest.commit ?? ''))
  expect('sha256', /^[0-9a-f]{64}$/.test(manifest.sha256 ?? ''))
  expect(
    'bytes',
    Number.isSafeInteger(manifest.bytes) &&
      manifest.bytes > 0 &&
      manifest.bytes <= MAX_ARCHIVE_BYTES,
  )
  if (manifest.asset !== `${SERVER_FOLDER}-${manifest.version}.tgz`)
    problems.push(`asset must be ${SERVER_FOLDER}-<version>.tgz`)
  // The download can come only from this repository's own release for this tag.
  const url = `https://github.com/${manifest.repository}/releases/download/${manifest.tag}/${manifest.asset}`
  if (manifest.url !== url) problems.push(`url must be ${url}`)
  return problems
}

/**
 * The files of a release tarball, keyed by path inside the server folder. Refuses anything
 * but regular files (no links, no devices), any path that could leave the target, a second
 * top-level entry and paths that differ only in case.
 */
export function extractTarball(gz) {
  const archive = gunzipSync(gz, { maxOutputLength: MAX_UNPACKED_BYTES })
  const files = new Map()
  const seen = new Set()
  for (const entry of tarEntries(archive)) {
    const parts = entry.name.replace(/^\.\//, '').split('/')
    if (parts.some((part) => part === '' || part === '.' || part === '..' || /[\\:\0]/.test(part)))
      throw new Error(`Unsafe path in archive: ${entry.name}`)
    if (parts[0] !== SERVER_FOLDER || parts.length < 2)
      throw new Error(`Unexpected top-level entry in archive: ${entry.name}`)
    const relative = parts.slice(1).join('/')
    const key = relative.toLowerCase()
    if (seen.has(key)) throw new Error(`Repeated path in archive: ${entry.name}`)
    seen.add(key)
    if (files.size >= MAX_FILES) throw new Error('Archive holds too many files')
    files.set(relative, entry.body)
  }
  return files
}

/** What a server folder lacks, given its files. */
function contentProblems(files) {
  const problems = REQUIRED_FILES.filter((name) => !files.get(name)?.length).map(
    (name) => `${name} is missing or empty`,
  )
  if (![...files.keys()].some((name) => name.startsWith('jsx/'))) problems.push('jsx/ has no files')
  return problems
}

async function readTree(root, relative = '', into = new Map()) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) await readTree(root, child, into)
    else if (entry.isFile()) into.set(child, await readFile(path.join(root, child)))
    else throw new Error(`not a regular file: ${child}`)
  }
  return into
}

export async function readManifest(file = manifestPath) {
  return JSON.parse(await readFile(file, 'utf8'))
}

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  )

/**
 * Problems with a server folder on disk (the one that ships, in the bundle or in an
 * installer's resources): the required files are there and its tree is the one the
 * receipt recorded when it was verified.
 */
export async function treeProblems(folder, receipt) {
  let files
  try {
    files = await readTree(folder)
  } catch (error) {
    return [`${folder}: ${error instanceof Error ? error.message : String(error)}`]
  }
  const problems = contentProblems(files)
  const digest = digestFiles(files)
  if (digest.treeSha256 !== receipt?.treeSha256)
    problems.push(
      `${folder} differs from the pinned release (${digest.files} files, ${digest.bytes} bytes; expected ${receipt?.files} files, ${receipt?.unpackedBytes} bytes)`,
    )
  return problems
}

/** Problems with an existing bundle, or an empty list when it matches the manifest. */
export async function verifyBundle(manifest, root = bundleRoot) {
  const declared = manifestProblems(manifest)
  if (declared.length) return declared
  const present = await exists(root)
  if (!isPinned(manifest))
    return present ? [`${root} exists but server.json is not pinned; run sync to remove it`] : []
  if (!present) return [`${root} is missing; run pnpm --filter @harness/after-effects-mcp sync`]
  const problems = []
  for (const name of await readdir(root))
    if (name !== SERVER_FOLDER && name !== RECEIPT_FILE)
      problems.push(`unexpected entry in bundle: ${name}`)
  let receipt
  try {
    receipt = JSON.parse(await readFile(path.join(root, RECEIPT_FILE), 'utf8'))
  } catch {
    return [...problems, `${RECEIPT_FILE} is missing from the bundle`]
  }
  for (const field of ['version', 'sha256', 'bytes'])
    if (receipt[field] !== manifest[field])
      problems.push(`the bundle was built from another release (${field} differs)`)
  return [...problems, ...(await treeProblems(path.join(root, SERVER_FOLDER), receipt))]
}

async function archiveBytes(manifest, { env, fetchImpl }) {
  const local = env[TARBALL_ENV]?.trim()
  if (local) return readFile(path.resolve(local))
  const response = await fetchImpl(manifest.url)
  if (!response.ok) throw new Error(`${manifest.url} answered ${response.status}`)
  if (Number(response.headers.get('content-length')) > manifest.bytes)
    throw new Error(`${manifest.asset} is larger than the pinned ${manifest.bytes} bytes`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Builds the bundle next to the old one and swaps it in only when the tarball matched its
 * pin and unpacked cleanly. Unpinned: nothing is fetched, and a bundle left over from an
 * earlier pin is removed so a build cannot ship a server the manifest no longer vouches for.
 */
export async function syncBundle(
  manifest,
  { root = bundleRoot, env = process.env, fetchImpl = fetch, log = console.log } = {},
) {
  const declared = manifestProblems(manifest)
  if (declared.length) throw new Error(declared.join('; '))
  if (!isPinned(manifest)) {
    if (await exists(root)) {
      await rm(root, { recursive: true, force: true })
      log('After Effects MCP server is not pinned yet: removed the old bundle.')
    }
    log('After Effects MCP server is not pinned yet; nothing to fetch. The app ships without it.')
    return
  }
  if ((await verifyBundle(manifest, root)).length === 0) {
    log(`After Effects MCP server ${manifest.version} is up to date.`)
    return
  }
  const gz = await archiveBytes(manifest, { env, fetchImpl })
  if (gz.length !== manifest.bytes)
    throw new Error(`${manifest.asset} is ${gz.length} bytes; the pin says ${manifest.bytes}`)
  const sha256 = createHash('sha256').update(gz).digest('hex')
  if (sha256 !== manifest.sha256)
    throw new Error(
      `${manifest.asset} sha256 ${sha256} does not match the pinned ${manifest.sha256}`,
    )
  const files = extractTarball(gz)
  const problems = contentProblems(files)
  if (problems.length) throw new Error(`${manifest.asset}: ${problems.join('; ')}`)
  const digest = digestFiles(files)
  const staging = `${root}.staging-${process.pid}`
  await rm(staging, { recursive: true, force: true })
  try {
    for (const [relative, body] of files) {
      const target = path.join(staging, SERVER_FOLDER, ...relative.split('/'))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, body)
    }
    const receipt = {
      version: manifest.version,
      sha256,
      bytes: gz.length,
      treeSha256: digest.treeSha256,
      files: digest.files,
      unpackedBytes: digest.bytes,
    }
    await writeFile(path.join(staging, RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`)
    await rm(root, { recursive: true, force: true })
    await rename(staging, root)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  log(`After Effects MCP server ${manifest.version}: ${digest.files} files, ${digest.bytes} bytes.`)
}

async function main(argv) {
  const manifest = await readManifest()
  if (argv.includes('--verify')) {
    const problems = await verifyBundle(manifest)
    if (problems.length) {
      for (const problem of problems) console.error(`after-effects-mcp: ${problem}`)
      process.exitCode = 1
    } else
      console.log(
        isPinned(manifest)
          ? 'After Effects MCP server matches server.json.'
          : 'After Effects MCP server is not pinned yet; nothing to verify.',
      )
    return
  }
  await syncBundle(manifest)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
