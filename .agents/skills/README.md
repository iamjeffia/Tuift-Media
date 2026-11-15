# Workspace Agent Skills

This folder holds the Agent Skills that agents use when they work in this repository: design and
interface work, motion, video, After Effects, HyperFrames and writing. Each skill is a folder with a
`SKILL.md` (front matter `name` and `description`) and, where it needs them, `references/` and
`scripts/`. An agent picks the skill that fits the task and reads its `SKILL.md` before acting.

Skills written by TUIFT Media carry their own `LICENSE` (Apache-2.0). Skills taken from public
repositories keep the licence of their authors: `SOURCES.json` records the repository, pinned
commit, path, licence and any change for each one, and `THIRD_PARTY_NOTICES.md` at the repository
root lists the sources.

## Skills

### Motion & video

| Skill                    | For                                                                                              | Origin               | Licence    |
| ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------- | ---------- |
| `animacao-saas`        | Product and SaaS videos: one shape through the film, a camera of nulls, a button that inflates on the drop                          | TUIFT Media          | Apache-2.0 |
| `captura-de-movimento` | Measuring a reference video frame by frame and rebuilding it as keyframes                        | TUIFT Media          | Apache-2.0 |
| `motion-narrado`       | Motion rules for explainer videos and ads built over a narration                                 | TUIFT Media          | Apache-2.0 |
| `video-referencias`    | Work to do before assembling a video: watch the reference, collect real assets                   | TUIFT Media          | Apache-2.0 |
| `motion-app-ae`        | App and product motion in After Effects (needs an After Effects bridge) or in deterministic HTML | TUIFT Media          | Apache-2.0 |
| `composicao-trilha`    | Soundtrack and sound design for a video                                                          | TUIFT Media          | Apache-2.0 |
| `stageshow`            | Building fake app and web screens as video material, frame by frame                              | `benjitaylor/skills` | MIT        |

### HyperFrames

HyperFrames renders video from HTML. Start with `hyperframes`: it is the entry point and routes to
the others.

| Skill                   | For                                                                             | Origin                   | Licence    |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------ | ---------- |
| `hyperframes`           | Entry point: project state, intent, routing and which skill to load next        | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-core`      | The composition contract: structure, `data-*` timing, tracks, determinism       | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-animation` | Motion rules, scene blueprints, transitions and animation runtimes              | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-keyframes` | Seek-safe keyframes and keyframe diagnostics                                    | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-creative`  | Design specs, concept, palette, typography, narration and beat planning         | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-audio`     | Voiceover carving, audio effect chains, automation and submix buses             | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-cli`       | Init, lint, check, preview, render, publish and diagnostics                     | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-registry`  | Registry blocks and components, and named looks and transitions                 | `heygen-com/hyperframes` | Apache-2.0 |
| `hyperframes-studio`    | Laying out a project so it reads well in Studio                                 | `heygen-com/hyperframes` | Apache-2.0 |
| `motion-graphics`       | Short, unnarrated, motion-first units such as titles, stat hits and chart hits  | `heygen-com/hyperframes` | Apache-2.0 |
| `media-use`             | Sourcing and generating images, icons, audio and captions, and media treatments | `heygen-com/hyperframes` | Apache-2.0 |
| `figma`                 | Bringing Figma assets, tokens and frames into a composition as motion           | `heygen-com/hyperframes` | Apache-2.0 |

HyperFrames also has workflow skills (`general-video`, `product-launch-video`, `faceless-explainer`,
`pr-to-video`, `slideshow`, `remotion-to-hyperframes`, `embedded-captions`, `talking-head-recut`,
`music-to-video`). They are not in this folder. `hyperframes` installs the one a task needs from
the upstream repository (`npx hyperframes skills update <workflow-name>`); without the HyperFrames
CLI, use `npx skills add heygen-com/hyperframes --skill <workflow-name>`.

### Design & UI

| Skill               | For                                                                                                           | Origin      | Licence    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| `ui-profissional` | Building and reviewing screens (landing pages, stores, dashboards, apps) with rules that avoid a generic look | TUIFT Media | Apache-2.0 |

### Writing

| Skill                 | For                                                               | Origin             | Licence                       |
| --------------------- | ----------------------------------------------------------------- | ------------------ | ----------------------------- |
| `humanizer`         | Rewriting text that reads as machine-written so it sounds natural | `blader/humanizer` | MIT                           |

### Capture & tools

| Skill             | For                                                                                     | Origin                       | Licence    |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| `watch`           | Watching a video from a URL or file: frames and transcript, so an agent can describe it | `bradautomates/claude-video` | MIT        |
| `gravar-janela` | Recording a window, a browser tab or a screen region to MP4 in the background           | TUIFT Media                  | Apache-2.0 |

## Using them

**Any agent.** `AGENTS.md` and `CLAUDE.md` point here. Read `.agents/skills/<name>/SKILL.md` for the
skill that fits the task and follow it. This works on every system with no setup.

**Claude Code** loads project skills from `.claude/skills`, not from `.agents/skills`. The repository
does not commit a symlink there (cloning it on Windows would not create a working one), so link the
folder once on your machine. From the repository root:

- Windows (PowerShell, no administrator rights needed):
  `New-Item -ItemType Directory -Force .claude | Out-Null; New-Item -ItemType Junction -Path .claude\skills -Target .agents\skills`
- macOS and Linux: `mkdir -p .claude && ln -s ../.agents/skills .claude/skills`

Add `.claude/skills` to `.git/info/exclude` so the link stays out of `git status`.

## Notes on specific skills

- **`media-use`** sends anonymous usage events to PostHog (`scripts/lib/telemetry.mjs`). It stays
  off when `HYPERFRAMES_NO_TELEMETRY=1` or `DO_NOT_TRACK=1` is set, and in CI. The upstream
  `hyperframes-cli` skill also describes a feedback report sent after a render; the same opt-outs
  apply. Both are upstream behaviours, kept as published.
- **`media-use`** ships without the 19 sound-effect `.mp3` files of the upstream skill (see
  `media-use/audio/assets/sfx/OMITTED.md`).
- **`hyperframes-creative`** carries six `.woff2` font files (Inter, EB Garamond, JetBrains Mono)
  with their SIL Open Font License texts next to them.
- **`watch`** needs `yt-dlp`, `ffmpeg` and Python; its `SKILL.md` lists the optional API keys.
- Some HyperFrames references name sibling workflow skills or repository paths that are not in
  this folder (see the HyperFrames section above). They are upstream text, kept as published.
