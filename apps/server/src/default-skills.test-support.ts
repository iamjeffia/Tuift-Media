import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BUNDLED = [
  ['cinetic', 'cinematic videos and motion design made in code'],
  ['design-taste-frontend', 'art direction for websites and app screens (tasteskill)'],
  ['cook', 'long reference-matching loops for ambitious visual builds'],
] as const

/**
 * Writes a bundle like packages/default-skills/scripts/sync.js lays out under
 * `parent`, with only the `present` skill folders on disk, and returns its root.
 */
export async function writeDefaultSkillsFixture(
  parent: string,
  present: readonly string[] = BUNDLED.map(([folder]) => folder),
): Promise<string> {
  const root = path.join(parent, 'bundle')
  await mkdir(path.join(root, 'skills'), { recursive: true })
  await writeFile(
    path.join(root, 'skills.json'),
    JSON.stringify({
      plugin: { name: 'tastecode' },
      skills: BUNDLED.map(([folder, summary]) => ({ folder, summary })),
    }),
  )
  for (const folder of present) {
    await mkdir(path.join(root, 'skills', folder), { recursive: true })
    await writeFile(
      path.join(root, 'skills', folder, 'SKILL.md'),
      `---\nname: ${folder}\ndescription: The long ${folder} description.\n---\n# ${folder}\n`,
    )
  }
  return root
}

/**
 * Adds a pack to a fixture bundle the way packages/default-skills/scripts/sync.js
 * lays one out: entries with `pack` in skills.json, and the skills under
 * `packs/<name>/skills`. Only the `present` folders are written to disk.
 */
export async function writeDefaultSkillPackFixture(
  root: string,
  name: string,
  skills: readonly (readonly [folder: string, summary: string])[],
  present: readonly string[] = skills.map(([folder]) => folder),
): Promise<void> {
  const manifestPath = path.join(root, 'skills.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    packs?: Record<string, unknown>
    skills: unknown[]
  }
  manifest.packs = { ...manifest.packs, [name]: { plugin: `tastecode-${name}` } }
  manifest.skills.push(...skills.map(([folder, summary]) => ({ folder, summary, pack: name })))
  await writeFile(manifestPath, JSON.stringify(manifest))
  for (const folder of present) {
    const dir = path.join(root, 'packs', name, 'skills', folder)
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${folder}\ndescription: The long ${folder} description.\n---\n# ${folder}\n`,
    )
  }
}
