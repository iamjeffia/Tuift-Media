# Third-party notices

This file records direct runtime dependencies and incorporated generated material. It is a
maintainer inventory, not a replacement for the full license texts that must accompany a
distributed build.

## Direct runtime dependencies

The table below is generated from `licenses/direct-runtime-dependencies.json` and checked by
`pnpm licenses:verify`. Every shipped transitive dependency is also inspected by that command.

<!-- BEGIN DIRECT RUNTIME DEPENDENCIES -->
<!-- prettier-ignore -->
| npm package | Use | Reviewed license | Source |
| --- | --- | --- | --- |
| `@anthropic-ai/claude-agent-sdk` | Claude Code adapter runtime | LicenseRef-Anthropic-Commercial-Terms | [source](https://github.com/anthropics/claude-agent-sdk-typescript) |
| `@fontsource-variable/geist` | Geist variable font | OFL-1.1 | [source](https://github.com/fontsource/font-files) |
| `@fontsource-variable/geist-mono` | Geist Mono variable font | OFL-1.1 | [source](https://github.com/fontsource/font-files) |
| `@fontsource-variable/inter` | Inter variable font | OFL-1.1 | [source](https://github.com/fontsource/font-files) |
| `@fontsource-variable/jetbrains-mono` | JetBrains Mono variable font | OFL-1.1 | [source](https://github.com/fontsource/font-files) |
| `@napi-rs/keyring` | OS credential-store integration | MIT | [source](https://github.com/Brooooooklyn/keyring-node) |
| `@opencode-ai/sdk` | OpenCode adapter client | MIT | [source](https://github.com/anomalyco/opencode) |
| `@pierre/diffs` | Pull-request diff rendering | Apache-2.0 | [source](https://github.com/pierrecomputer/pierre) |
| `@shikijs/langs` | Syntax highlighting grammars | MIT | [source](https://github.com/shikijs/shiki) |
| `@shikijs/themes` | Syntax highlighting themes | MIT | [source](https://github.com/shikijs/shiki) |
| `@streamdown/math` | Math rendering in replies | Apache-2.0 | [source](https://github.com/vercel/streamdown) |
| `@tabler/icons-react` | Interface icons | MIT | [source](https://github.com/tabler/tabler-icons) |
| `@tanstack/react-virtual` | Thread virtualization | MIT | [source](https://github.com/TanStack/virtual) |
| `@xterm/addon-fit` | Terminal sizing | MIT | [source](https://github.com/xtermjs/xterm.js) |
| `@xterm/addon-unicode11` | Terminal Unicode width support | MIT | [source](https://github.com/xtermjs/xterm.js) |
| `@xterm/addon-web-links` | Terminal link detection | MIT | [source](https://github.com/xtermjs/xterm.js) |
| `@xterm/addon-webgl` | Terminal WebGL renderer | MIT | [source](https://github.com/xtermjs/xterm.js) |
| `@xterm/xterm` | Terminal UI | MIT | [source](https://github.com/xtermjs/xterm.js) |
| `electron` | Desktop runtime | MIT | [source](https://github.com/electron/electron) |
| `electron-updater` | Desktop update client | MIT | [source](https://github.com/electron-userland/electron-builder) |
| `katex` | Math typesetting and its fonts | MIT | [source](https://github.com/KaTeX/KaTeX) |
| `micromark` | Markdown parsing | MIT | [source](https://github.com/micromark/micromark) |
| `micromark-util-decode-string` | Markdown string decoding | MIT | [source](https://github.com/micromark/micromark) |
| `node-pty` | Pseudoterminal integration | MIT | [source](https://github.com/microsoft/node-pty) |
| `parse5` | Static preview HTML parsing | MIT | [source](https://github.com/inikulin/parse5) |
| `qrcode-generator` | Phone pairing code | MIT | [source](https://github.com/kazuhikoarase/qrcode-generator) |
| `react` | Renderer UI | MIT | [source](https://github.com/facebook/react) |
| `react-dom` | Renderer DOM integration | MIT | [source](https://github.com/facebook/react) |
| `semver` | Desktop release version ordering | ISC | [source](https://github.com/npm/node-semver) |
| `shiki` | Syntax highlighting | MIT | [source](https://github.com/shikijs/shiki) |
| `streamdown` | Streaming Markdown rendering | Apache-2.0 | [source](https://github.com/vercel/streamdown) |
| `thinking-orbs` | Agent activity indicators | MIT | [source](https://github.com/Jakubantalik/thinking-orbs) |
| `ws` | WebSocket runtime | MIT | [source](https://github.com/websockets/ws) |
| `zod` | Runtime schema validation | MIT | [source](https://github.com/colinhacks/zod) |

<!-- END DIRECT RUNTIME DEPENDENCIES -->

## Incorporated material

| Project         | Use                                                             | License                                                  | Source                                                                      |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Codex           | Generated app-server protocol types                             | Apache-2.0                                               | [openai/codex](https://github.com/openai/codex)                             |
| Thinking Orbs   | Adapted activity-indicator source                               | [MIT](./licenses/thinking-orbs-MIT.txt)                  | [Jakubantalik/thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) |
| cinetic         | Default Agent Skill `cinetic`, shipped unmodified               | [MIT](./licenses/cinetic-MIT.txt)                        | [Leonxlnx/cinetic](https://github.com/Leonxlnx/cinetic)                     |
| taste-skill     | Default Agent Skill `design-taste-frontend`, with a local patch | [MIT](./licenses/taste-skill-MIT.txt)                    | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)             |
| frontend-design | Adapted into `design-taste-frontend` (changed, see below)       | [Apache-2.0](./licenses/anthropic-skills-Apache-2.0.txt) | [anthropics/skills](https://github.com/anthropics/skills)                   |
| taste-skill     | Design app-screen library, rules, `app.css` and `charts.js`     | [MIT](./licenses/taste-skill-MIT.txt)                    | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) v2.5        |
| cook            | Default Agent Skill `cook`, shipped unmodified                  | [MIT](./licenses/cook-MIT.txt)                           | [Leonxlnx/cook](https://github.com/Leonxlnx/cook)                           |

The default Agent Skills are pinned to exact commits in `packages/default-skills/skills.json`
and ship as real files in the app's `resources/default-skills` folder, each with its own
`LICENSE`.

The Design pack's 41 third-party skills come from five public repositories, each pinned to an
exact commit in `packages/default-skills/skills.json` (or, for `libraries-dev`, copied into
`.agents/skills/` at the commit below) and each shipped unmodified with its own `LICENSE`. The pack
holds only skills, never the other files of those repositories: from `Jakubantalik/Libraries.dev`
it takes the skill alone, not the libraries or the `Magnet` and `VoicePosition` model files that
its separate model licence covers. The Remotion and `transitions-*` skills are not in the
installer, because their licences do not allow embedding; the Skills page installs them from their
authors, once for the whole app.

<!-- prettier-ignore -->
| Source repository | Design pack skills | License | Commit |
| --- | --- | --- | --- |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `animate`, `animate-expo`, `animation-performance`, `animation-vocabulary`, `apple-design`, `ask-emil`, `ask-sonner`, `break-ui`, `choreograph`, `emil-design-eng`, `find-animation-opportunities`, `gestures`, `improve-animations`, `learn-taste`, `mobile-native`, `pick-ui-library`, `prototype`, `remove-animations`, `review-animations` | [MIT](./licenses/emilkowalski-skills-MIT.txt) | `64eb3de` |
| [jakubkrehel/skills](https://github.com/jakubkrehel/skills) | `better-accessibility`, `better-colors`, `better-interface`, `better-layout`, `better-typography`, `better-ui`, `better-writing`, `break`, `build-design`, `explain-interface`, `interface-review`, `state-machine`, `variant` | [MIT](./licenses/jakubkrehel-skills-MIT.txt) | `6c21201` |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `design-an-interface` (retired upstream, so pinned at the last commit that holds it) | [MIT](./licenses/mattpocock-skills-MIT.txt) | `f958fa1` |
| [Jakubantalik/Libraries.dev](https://github.com/Jakubantalik/Libraries.dev) | `libraries-dev` | [MIT](./licenses/libraries-dev-MIT.txt) | `387b049` |
| [21st-dev/skill](https://github.com/21st-dev/skill) | `21st-ai`, `21st-cli-use`, `21st-design-sync`, `21st-registry`, `21st-ui-build`, `21st-ui-explore`, `21st-ui-review` (Apache-2.0, Copyright 2026 21st.dev, per the repository's `LICENSE` at the pinned commit) | [Apache-2.0](./licenses/21st-dev-skill-Apache-2.0.txt) | `15c7436` |

`design-taste-frontend` (taste-skill v2.5.0) ships without its picture library. Its photographs,
the sample photographs of its demos and hero templates, its demo icon sets, its objects kit's sample
posters and sample product specs, and the credits files that list them are not in the installer, and
TasteCode never downloads them. Three of its files are
replaced by TasteCode's own copies, which point the skill at the user's own pictures:
`SKILL.md`, `references/photos.md` and `scripts/photos.mjs`. The copies and the reasons for them are
in `packages/default-skills/patches/design-taste-frontend`. The installer holds no picture from the skill.

The same skill is also where Anthropic's `frontend-design` (anthropics/skills at `1780c5e`, Apache-2.0)
lives now: the two were merged into one skill, and `frontend-design` no longer ships on its own. Its
substance was adapted, with changes, into the skill's `SKILL.md` and into `references/direction.md`, a
file of TasteCode's own. The skill folder therefore carries the MIT `LICENSE` of taste-skill, the
Apache-2.0 text as `LICENSE-APACHE-2.0`, and a `NOTICE` that says which parts were adapted and that
they were changed.

The release gate requires a complete top-level Apache-2.0 `LICENSE`, a clean production install,
and a license or notice file for every package in the resolved production graph. It emits only
metadata; it never copies license bodies. The reviewed license files themselves must be bundled
with each Windows and macOS distribution. When an npm package omits that file, the exact reviewed
fallback and its upstream source are recorded in `licenses/direct-runtime-dependencies.json`.

## After Effects MCP server

Motion chats can attach an After Effects MCP server. It is TUIFT Media's fork of Kumo's
`mcp-aftereffects` (MIT) with the house tools added (MIT), published in its own repository,
[iamjeffia/ae-mcp-tuift](https://github.com/iamjeffia/ae-mcp-tuift). TUIFT Code does not build it:
`packages/after-effects-mcp/server.json` pins one release asset by SHA-256, `sync.js` refuses the
download unless its size and hash match, and the installer carries the unpacked folder as real
files in the app's `resources/after-effects-mcp` folder, outside the ASAR (After Effects reads its
`jsx/` scripts, and Node reads its `node_modules/`). Until a release is pinned there, the installer
carries no server.

The folder holds the `LICENSE` of the server (MIT), a `NOTICE.md` with its own attributions, and a `THIRD_PARTY_LICENSES.txt` with the licence texts of the production
dependencies bundled in its `node_modules/`; those texts are not repeated here. The release gate
fails a pinned bundle that lacks any of the three, and the installer proof compares the shipped
folder with the pinned release.

## TUIFT Media artwork

The six character images in `apps/web/src/motion/cast/` (Zig, Moss, Bun, Pip, Cloud and Penny, shown
by the Motion mode) are original TUIFT Media art. They are not third-party material and are used
under the repository's own license.

## Workspace Agent Skills (`.agents/skills/`)

The workspace skills are plain files read by coding agents working in this repository. `watch` and
`ouvir` ship in the base bundle of default skills, with the ones above. Two other groups of them also ship in the installer, as separate packs next to the default Agent Skills above, in the
app's `resources/default-skills/packs/` folder: the `motion` pack (`motion-app-ae`,
`composicao-trilha`, `video-referencias`, `captura-de-movimento`, `animacao-saas`, `motion-narrado`,
`stageshow` and the twelve HyperFrames skills in the table below) and the `design` pack
(`ui-profissional`, `stageshow` and `figma`, which both packs hold, and the third-party skills of
the table above). They are pinned by content hash in `packages/default-skills/skills.json`, and the
release check fails when one differs from its pin. The other workspace skills (`humanizer`,
`escrita-pt-br`, `gravar-janela`) are not shipped. Each third-party skill keeps the licence of its
authors as a `LICENSE` file inside its folder, unmodified, and every shipped skill carries its own
`LICENSE`. `.agents/skills/SOURCES.json` records the exact commit and every change. Skills written by
TUIFT Media carry their own Apache-2.0 `LICENSE`.

<!-- prettier-ignore -->
| Source repository | Skills in `.agents/skills/` | License | Notes |
| --- | --- | --- | --- |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | `hyperframes`, `hyperframes-core`, `hyperframes-animation`, `hyperframes-audio`, `hyperframes-cli`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-registry`, `hyperframes-studio`, `media-use`, `motion-graphics`, `figma` | Apache-2.0 | Commit `b20f3f7`. The 19 bundled `.mp3` sound effects of `media-use` (Pixabay Content License) are left out. `hyperframes-creative` includes Inter, EB Garamond and JetBrains Mono (`.woff2`), each with its SIL Open Font License 1.1 text. |
| [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | `watch` | MIT | Commit `03ceb42`. |
| [Leonxlnx/earshot](https://github.com/Leonxlnx/earshot) | `ouvir` | MIT | Version 0.4.1, commit `4ac3d2a`. Not copied into the repository: `ouvir` downloads that exact archive, checks its hash and installs it into its own folder on the person's say-so. Its licence is kept in `.agents/skills/ouvir/EARSHOT-LICENSE`. |
| [blader/humanizer](https://github.com/blader/humanizer) | `humanizer` | MIT | Adapted. |
| [benjitaylor/skills](https://github.com/benjitaylor/skills) | `stageshow` | MIT | Its own `LICENSE` and `NOTICE.md` stay in the skill folder. |
| [Jakubantalik/Libraries.dev](https://github.com/Jakubantalik/Libraries.dev) | `libraries-dev` | MIT | Commit `387b049`. Only the skill folder, unmodified, with the repository's `LICENSE`. |
