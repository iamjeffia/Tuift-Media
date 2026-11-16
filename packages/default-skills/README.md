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
chat receives until the app turns it on. `pack` may also be a list, `["motion", "design"]`: the
skill is then copied into each of those packs and hashed once (`stageshow` and `figma` are in both).
A chat has one mode, so it loads one pack and a shared skill is never listed twice.

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

Packs today: `motion` (video and motion skills) and `design` (44 skills: the team's own, and the
third-party ones whose licences allow embedding, each pinned by commit; see
`THIRD_PARTY_NOTICES.md`). A source whose archive is too large to fetch for one skill is copied into
`.agents/skills/` instead and bundled as a local skill (`libraries-dev`).

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
(`apps/server/src/skill-catalog.ts`, `skill-download.ts`), checks it and unpacks only the skill's
folder into the app's own data folder. Nothing of those skills is in this repository. Before a
release, run `pnpm --filter @harness/default-skills check:third-party`: it downloads each pinned
archive and checks the commit, hash, folders and licence text against the network.

An install is made once for the whole app, not for a project or a provider. It is laid out like the
bundle, so the same mechanism serves it (`apps/server/src/installed-skills.ts`):

```
<data folder>/third-party-skills/          next to the app's database
  installed.json                           { version: 1, skills: { <id>: { commit, category, set?, installedAt } } }
  <category>/                              design, motion or general: a Claude Code plugin, "tastecode-installed-<category>"
    .claude-plugin/plugin.json
    skills/<id>/SKILL.md
```

The `category` each manifest entry carries decides which chats load it: `general` in every chat,
`design` in a chat with Design on, `motion` in a chat with Motion on, through the same session
start that carries the bundled packs. A provider that loads plugins gets the folder as one more
plugin directory; the others get a short catalog (about 300 tokens per category at most). A skill
the bundle already has is neither offered nor listed twice. The page can remove an installed skill
(its folder and its record). An earlier version installed into a project's `.agents/skills`, with a
record in `.agents/skills/.tuift-catalog.json`: those stay where they are, are shown as installed
for that project, and are read with `readCatalogRecord(projectPath)`. They are not migrated.

A manifest entry whose files another entry carries inside it is listed once: `remotion-best-practices`
holds the other twelve Remotion skills as subfolders, so it alone is in the manifest.
