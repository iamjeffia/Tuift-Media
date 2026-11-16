import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AvailableSkillCategory } from '@harness/contracts'
import {
  installedSkillDir,
  writeInstalledRecord,
  type InstalledRecord,
} from './installed-skills.js'

export type InstalledFixture = { id: string; category: AvailableSkillCategory; name?: string }

const COMMIT = 'c'.repeat(40)

/**
 * Lays out the data folder's installed skills the way the catalog does: the
 * record, and `<category>/skills/<id>/SKILL.md` under `root`.
 */
export async function writeInstalledSkillsFixture(
  root: string,
  skills: readonly InstalledFixture[],
): Promise<void> {
  const record: InstalledRecord = { version: 1, skills: {} }
  for (const { id, category, name } of skills) {
    record.skills[id] = { commit: COMMIT, category, installedAt: '2026-11-16T00:00:00.000Z' }
    const dir = installedSkillDir(root, category, id)
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name ?? id}\ndescription: The long ${id} description.\n---\n# ${id}\n`,
    )
  }
  await writeInstalledRecord(root, record)
}
