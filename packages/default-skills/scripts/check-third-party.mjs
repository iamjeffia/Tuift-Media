// Checks third-party-skills.json against the network, for the maintainer to run
// before a release (`pnpm --filter @harness/default-skills check:third-party`).
// It is not part of the normal test run: it downloads each pinned archive.
//
// For every repository at its pinned commit it checks that
//   - the commit exists and its archive is served,
//   - the archive has the size and SHA-256 the manifest records,
//   - every skill's folder is in it with a SKILL.md,
//   - the licence text is the one recorded, both at the pinned commit and on the
//     repository's default branch today (a changed licence is a failure: read it
//     again before the next release), or, for a skill with no licence, that the
//     repository still has none.
// A newer commit upstream is only reported. Set GITHUB_TOKEN to lift the API's
// rate limit; nothing is written.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { archiveUrl, tarEntries } from './skill-media.mjs'

const manifestPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'third-party-skills.json',
)
const LICENSE_LIKE = /^(licen[sc]e|copying)/i

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

function headers() {
  return {
    'user-agent': 'tuift-code-manifest-check',
    accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }
}

async function json(url) {
  const response = await fetch(url, { headers: headers() })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/** Every problem found for the skills of one repository at one commit. */
async function checkRepository(repository, commit, entries) {
  const problems = []
  const first = entries[0].source
  const response = await fetch(archiveUrl({ repository, commit }))
  if (!response.ok) return [`${repository}@${commit}: archive answered ${response.status}`]
  const archive = Buffer.from(await response.arrayBuffer())
  if (archive.length !== first.archiveBytes) {
    problems.push(
      `${repository}: archive is ${archive.length} bytes, manifest says ${first.archiveBytes}`,
    )
  }
  if (sha256(archive) !== first.archiveSha256) {
    problems.push(
      `${repository}: archive sha256 is ${sha256(archive)}, manifest says ${first.archiveSha256}`,
    )
  }
  const files = new Map()
  for (const entry of tarEntries(gunzipSync(archive))) {
    files.set(entry.name.split('/').slice(1).join('/'), entry.body)
  }
  for (const { id, source } of entries) {
    if (!files.has(`${source.path}/SKILL.md`)) {
      problems.push(`${id}: no ${source.path}/SKILL.md at ${commit}`)
    }
  }

  const { license } = entries[0]
  if (license.name === null) {
    const rootLicenses = [...files.keys()].filter(
      (name) => !name.includes('/') && LICENSE_LIKE.test(name),
    )
    if (rootLicenses.length)
      problems.push(`${repository}: declares no licence in the manifest but has ${rootLicenses}`)
    const now = (await json(`https://api.github.com/repos/${repository}/contents/`))
      .map((item) => item.name)
      .filter((name) => LICENSE_LIKE.test(name))
    if (now.length)
      problems.push(
        `${repository}: now has a licence file upstream (${now}); the manifest says none`,
      )
    const meta = await json(`https://api.github.com/repos/${repository}`)
    if (meta.license)
      problems.push(`${repository}: GitHub now reports the licence ${meta.license.spdx_id}`)
  } else {
    const pinned = files.get(license.file)
    if (!pinned) problems.push(`${repository}: licence file ${license.file} is not in the archive`)
    else if (sha256(pinned) !== license.sha256) {
      problems.push(
        `${repository}: ${license.file} at ${commit} hashes to ${sha256(pinned)}, manifest says ${license.sha256}`,
      )
    }
    const raw = await fetch(
      `https://raw.githubusercontent.com/${repository}/HEAD/${license.file}`,
      {
        headers: headers(),
      },
    )
    if (!raw.ok)
      problems.push(`${repository}: ${license.file} on the default branch answered ${raw.status}`)
    else if (sha256(Buffer.from(await raw.arrayBuffer())) !== license.sha256) {
      problems.push(
        `${repository}: ${license.file} changed on the default branch since it was pinned`,
      )
    }
  }

  const head = await json(`https://api.github.com/repos/${repository}/commits/HEAD`)
  if (head.sha !== commit)
    console.log(`note ${repository}: upstream is at ${head.sha}, pinned ${commit}`)
  return problems
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const groups = new Map()
for (const entry of manifest.skills) {
  const key = `${entry.source.repository}@${entry.source.commit}`
  groups.set(key, [...(groups.get(key) ?? []), entry])
}
let failed = 0
for (const [key, entries] of groups) {
  const [repository, commit] = key.split('@')
  const problems = await checkRepository(repository, commit, entries).catch((error) => [
    `${repository}: ${error.message}`,
  ])
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${key} (${entries.length} skills)`)
  for (const problem of problems) console.log(`     ${problem}`)
  failed += problems.length
}
process.exit(failed ? 1 : 0)
