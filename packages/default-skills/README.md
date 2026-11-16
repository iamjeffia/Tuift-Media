# Default skills

The Agent Skills TUIFT Code ships. `skills.json` is the manifest: what each skill is, where it
comes from and the hashes it must match. `scripts/sync.js` builds `bundle/` from it (gitignored),
and the installer copies `bundle/` to `resources/default-skills`.

## Where a skill comes from

- **Pinned:** a public repository at an exact commit (`repository`, `commit`, `archiveSha256`).
- **Local** (`"source": "local"`): a folder of this repository, `.agents/skills/<folder>/`, the one
  copy agents working here read. It needs its own `SKILL.md` and `LICENSE` and names its `license`.
  Nothing is copied into the package: edit the skill there, then run
  `node scripts/sync.js --update` to record the new hashes. Until then `--verify`, `sync` and the
  release checks fail with "changed since it was pinned".

## Base bundle and packs

A skill with no `pack` is in the base bundle and goes to every chat. A skill with
`"pack": "<name>"` (declared once under `packs`, with its own plugin name) is in a pack, which no
chat receives until the app turns it on.

```
bundle/                         base plugin ("tastecode"): skills with no pack
  .claude-plugin/plugin.json
  skills/<folder>/SKILL.md
  skills.json                   whole manifest, packs included; the app reads this one
  packs/<name>/                 one more plugin per pack ("tastecode-<name>")
    .claude-plugin/plugin.json
    skills/<folder>/SKILL.md
```

- Claude Code: pass `bundle` and, for a pack, `bundle/packs/<name>` as two plugin directories.
  The base plugin lists only its own `skills/`; the nested `packs/` is not scanned.
- Other providers: a short catalog of the pack, from `loadDefaultSkillPack` in
  `apps/server/src/default-skills.ts`.

Packs today: `motion` (video and motion skills) and `design` (`ui-profissional`).

## Commands

```
pnpm --filter @harness/default-skills sync      build bundle/ (fetches only what is missing)
pnpm --filter @harness/default-skills verify    check bundle/ against skills.json
pnpm --filter @harness/default-skills test
```

## Skills from their authors

Some skills cannot ship inside the app: their repositories declare no licence, or one that forbids
republishing. `third-party-skills.json` lists them instead (author, licence as the repository
declares it, the exact commit, the archive's SHA-256 and size). The Skills page offers them under
"Available to install"; an install downloads the pinned archive straight from the author's host
(`apps/server/src/skill-catalog.ts`, `skill-download.ts`), checks it, unpacks only the skill's folder
and hands it to the same path "Install from folder" uses. Nothing of those skills is in this
repository. Before a release, run `pnpm --filter @harness/default-skills check:third-party`: it
downloads each pinned archive and checks the commit, hash, folders and licence text against the
network.

What an install leaves in the project: the skill's folder under `.agents/skills/<id>` and
`.agents/skills/.tuift-catalog.json`, `{ version: 1, skills: { <id>: { commit, category, set?,
installedAt } } }`. The category (`motion`, `design`, `general`) is there for whatever later loads
installed `design` skills into Design chats; read it with `readCatalogRecord(projectPath)`.
