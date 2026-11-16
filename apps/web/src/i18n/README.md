# Interface language (i18n)

TUIFT Code speaks Brazilian Portuguese by default (`pt-BR`) with English (`en`) as the second
language. The user picks it in Settings > General > Language; the choice lives in
`localStorage` under `harness.language`, like the other per-user UI preferences, and sets
`<html lang>`. There is no dependency: this folder is the whole module.

| File          | Role                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `en.ts`       | English catalog. **Source of truth for keys**: `MessageKey` is derived from it |
| `pt-BR.ts`    | Portuguese catalog, typed `Record<MessageKey, string>` (same keys or no build) |
| `i18n.ts`     | `t`, `tp`, `translate`, language store, persistence                            |
| `use-i18n.ts` | `useI18n()` hook, re-renders on language change                                |
| `index.ts`    | The only import path components use: `from '../i18n/index.js'`                 |

A missing key in a catalog falls back to English, then to the key itself, so a gap shows on
screen instead of throwing. Missing or extra keys are also a type error and a failing test
(`catalogs.test.ts`).

## Using it

```tsx
import { useI18n } from '../i18n/index.js'

function Example(props: { count: number; name: string }) {
  const { t, tp } = useI18n() // re-renders when the language changes
  return (
    <>
      <h1>{t('general.title')}</h1>
      <p>{t('chat.greeting', { name: props.name })}</p> {/* "Hello {name}" */}
      <p>{tp('common.days', props.count)}</p> {/* common.days_one / common.days_other */}
    </>
  )
}
```

- Outside React (a handler, a plain `.ts` file) import `t` / `tp` from the same index. They read
  the language at call time, so never evaluate them at module load into a constant: that would
  freeze the language. Keep keys in the constant and translate at render, as `GeneralSettings.tsx`
  does with `Option.label: MessageKey`.
- **Add a key**: write it in the English file of its area (`areas/<area>.en.ts`), then in `areas/<area>.pt-BR.ts`. TypeScript names the missing side. `en.ts` and `pt-BR.ts` hold the shell, navigation and General keys and spread the area files; the areas are `settings`, `sidebar`, `onboarding`, `workspace`, `dialogs` and `chat`.
- **Naming**: `area.component.thing`, camelCase segments, dots between them
  (`general.settle.name`, `settings.nav.mcp`, `settings.search.empty`). Group by screen, not by
  word, so two places that happen to share a word can read differently in Portuguese.
- **Interpolation**: `{name}` placeholders, filled from the `vars` object. Both languages must
  use the same placeholder names (tested). A placeholder without a value stays as written. Never
  build a sentence by joining translated pieces: word order differs. Put the whole sentence in
  the catalog and pass already translated parts as vars (`general.settle.after` takes the
  translated `{days}`).
- **Plurals**: a message with a count is a pair `base_one` / `base_other`, both containing
  `{count}`. `tp('base', n)` picks the form with `Intl.PluralRules` for the language
  (Portuguese `one` covers 0 and 1). `base_other` is required; `zero/two/few/many` are optional.
- **Attributes**: `aria-label`, `title`, `placeholder`, `alt` and tooltips are translated too.
- **Do not translate**: product and feature names that are proper names (TUIFT Code, Design,
  Motion, Full access), provider and model names, shortcuts keys, file paths, code, anything the
  user or the AI wrote, and the chat itself (see "The boundary of the chat").
- **Glossary** (keep it consistent): chat / chats (the owner's word), provedor, projeto,
  workspace, Configurações, Geral, Aparência, Atalhos (Keybinds), Servidores MCP, Skills, Uso
  (Usage), Importar chats, Dados e privacidade, Depuração (Debug), Sobre, Barra lateral,
  Caixa de entrada (Inbox sidebar mode), Clássica (Classic).
- **Search entries**: a settings search entry keeps its English `title`/`description` and adds
  `titleKey`/`descriptionKey`; `SettingsSearch` localizes them at render. A test fails if the
  English literal and the catalog drift apart. Search matches the translated title plus the
  English `keywords`, so keep `keywords` English and add Portuguese terms to them when useful.
- **Tests that read source text**: a few tests read a `.tsx` file with `readFileSync` and match
  literals (e.g. `settings-search.test.ts` reads the nav labels). When you convert a file, grep
  the tests for its name and update such scans to read the key through `en`.

## Tests and language

`src/test-setup.ts` (registered in `vite.config.ts` as a vitest setup file) forces English for
every test: it sets a global read by `i18n.ts` as the default when nothing is stored, and calls
`setLanguage('en', { persist: false })` before each test. So all existing tests keep their
English assertions, even after `vi.resetModules()` or `localStorage.clear()`. A test that wants
Portuguese calls `setLanguage('pt-BR', { persist: false })` (it is reset before the next test).
The default itself (`pt-BR` when nothing is stored) is covered by `i18n.test.ts`.

## The boundary of the chat

Rule 2 of `TUIFT-CHECKLIST.md` keeps the chat itself out of translation, and the owner fixed the
exact line on 15/11/2026 (checklist 1.15). The chat is English and untouched; the app chrome next to
it is translated through the `chat` catalog (`areas/chat.*.ts`, keys `chat.…`).

**Stays in English, never translated and never restyled (the chat itself):**

- What the AI and the user write, and everything a message carries: `ui/Markdown.tsx`,
  `ui/CompletedMarkdown.tsx` (except the one `aria-label` below), `ui/MarkdownImage.tsx`,
  `ui/LargeCodeBlock.tsx`, `ui/PromptText.tsx`, `ui/live-markdown.ts`, `ui/markdown-blocks.ts`,
  `ui/message-chips.ts`, `ui/browser-comments.ts` (comment text sent with a message).
- The process rows and the transcript: `ui/Thread.tsx`, `ui/LazyThread.tsx` ("Working for…",
  "Worked for 18s", "Ran 5 commands", "Explored 3 files", "Edited X"), `ui/TurnRail.tsx` +
  `ui/turn-rail.ts`, `ui/turns.ts`, `ui/SubagentRow.tsx`, `ui/tool-call-text.ts`, `ui/Diff.tsx`.
- Approval and plan prompts inside the thread: `ui/Approval.tsx`, `ui/Plan.tsx`.
- The composer text field and its controls: the placeholder ("Do anything", "Ask for follow-up
  changes", and "Stopping…" while a turn stops), `ui/ComposerChipOverlay.tsx`, the access modes
  (Full access, Auto-review, Auto, Ask first: `ui/approval-modes.ts`), the Design and Motion
  buttons and `ui/DesignBeam.tsx`, the model picker and effort names (`ui/ModelSelector.tsx`,
  `ui/ModelSelectorPanel.tsx`, `ui/ModelSearchField.tsx`), voice (`ui/ComposerVoiceControl.tsx`,
  `ui/ComposerVoiceRecorderBar.tsx`, `ui/VoiceWaveform.tsx`), context usage (`ui/ContextUsage.tsx`),
  the queue shelf and the attachment chips, `ui/composer-chips.ts`,
  `ui/composer-inventory.ts`.
- Text that comes from the server and is shown as the error of a turn or an action (`thread.error`,
  `actionError`, `currentModelError`, `providerProblem`) and the "can't ask before running
  commands" notes, which name the access modes.

**Translated now (app chrome that sits next to the chat):**

- The project and location shelf of a new chat in `ui/Composer.tsx` ("Choose project", "New
  project", "Workspace mode", "Local", "Isolated", the branch menu), and the provider setup notice
  it puts in the tray ("Add a provider to start chatting." and its button). Only literals were
  replaced there; project and branch names are data.
- The composer's own error notices: attachments (too large, not supported, could not attach, paste or drop
  in the web build) and a queued prompt that cannot be removed (`chat.attach.*`, `chat.queue.*`). A reason
  the server wrote stays as it came. The copy buttons of a prompt and a response take their `aria-label`
  from `chat.copy.*`.
- The notice tray: `ui/ComposerErrors.tsx`, `ui/UsageResetNotice.tsx`, the `composerErrors` block of
  `App.tsx` ("Reconnecting…", "Retry", "Sign in", "Continued on…", "Switch to…", "Your next message
  switches…"), `continue-account.ts` (`continuationNote`) and `isolateUnavailable`.
- The "/" menu: `app-commands.ts` (descriptions and argument hints; the names a user types, such as
  `/side` and `/feedback`, stay) and the chrome of `ui/ComposerResourcePicker.tsx` and
  `ui/composer-resource.ts` (list names, empty states, "Disabled", "Sign in required", fallback
  descriptions). What a provider, skill or MCP server wrote about itself is data.
- The neighbours: `ui/ThreadSearch.tsx`, `ui/RollbackDialog.tsx`, `ui/ChatDropOverlay.tsx` (it holds
  no text), `ui/CopyButton.tsx` (its default tooltip and failure text; a caller's own `label`, such as
  "Copy response" in the thread, stays English), `ui/MediaViewer.tsx`, `ui/BrowserCommentCard.tsx`
  and the `aria-label` `ui/CompletedMarkdown.tsx` gives the file context menu.
- Default chat titles: the server and the store keep writing "New session", "New chat", "Untitled
  chat" and "Side chat". `chat-title.ts` maps exactly those four strings to `chat.title.*` when a
  title is shown: the sidebar rows (`sidebarProjects`), the header and split pane labels, session
  search and the palette's chat search (`localizeChatTitles`), and the continuation and checkout
  notes. A title the user or the AI wrote is never touched, and `renameSidebarSession` ignores a
  rename that only repeats the translated default, so the stored default survives. Never translate
  a title anywhere else, and never send a mapped title to a provider.

Text that code compares (`startsWith('Design mode failed')`, `/^unknown method/`,
`existingSession?.title === 'New session'`) is never translated; see
`branding/i18n-texto-do-servidor.md` in the repository.

**The one exception inside the transcript: what the Design pipeline writes itself.** Its progress
notes, findings and closing summary are built from codes (`DESIGN_MESSAGES` in
`packages/contracts/src/design-messages.ts`). The server sends the English text and its pieces
beside it (`Item.parts`); `server-message.ts` translates each piece from the `design.msg.<code>`
keys of `areas/design.*.ts`, a piece with no code (text a model wrote) stays as written, and a code
this app does not know shows the English. The English catalog is generated from the server's table,
so the two cannot drift (`server-message.test.ts`). The activity rows of a Design run
(`design.phase.*`) are translated the same way.

## Wave 2: what is left to translate

Counts are a static estimate (string attributes, JSX text and quoted sentences per file, tests
and benches excluded). It undercounts template strings and conditionals; read it as "expect
1.3 to 1.6 times this". Checklist items 1.4 to 1.10.

| Item | Area                                    | Files                                                                                                                                                                                                                                                                                                                                                | ~Strings      |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1.4  | Settings pages (rest of `Settings.tsx`) | `ui/Settings.tsx` (185), `ProviderAccounts` (53), `ProviderTuning` (36), `AccountLimits` (35), `ImportSettings` (31), `PhoneSettings`, `AppBackgroundSettings`, `ProfileSettings`, `KeybindSettings`, `UsageSettings` + `ui/usage/*`, `ProfileAccounts`, `AppearanceColorPicker`, `GeneratedAvatarLab`, `ModelLabSection`, `ModelVisibilityControls` | ~490          |
| 1.4  | Settings search and shortcut labels     | `ui/settings/settings-search.ts` (56, entries need `titleKey`), `ui/settings/provider-tuning-search.ts`, `shortcuts.ts` (47, `KEYBINDING_DEFINITIONS` labels; the Terminal note on General says "Alternar terminal" and must match)                                                                                                                  | ~110          |
| 1.4  | MCP servers and Skills pages            | `ui/McpSettings.tsx` (32), `ui/SkillsSettings.tsx` (16): other agents are rewriting them now; translate after they merge                                                                                                                                                                                                                             | ~50           |
| 1.5  | Sidebar, search, palette, menus         | `ui/Sidebar.tsx` (86), `ui/InboxSidebar.tsx` (52), `ui/SessionSearch.tsx` (17), `SessionSearchHost`, `CommandPalette`, `SidebarConfirmDialog`, `ArchiveToast`, palette commands inside `App.tsx`                                                                                                                                                     | ~170          |
| 1.6  | Onboarding                              | `ui/Onboarding.tsx` (57), `ui/OnboardingPreview.tsx` (33), `SealGuide`, `VersionReel`, `onboarding-motion.ts`                                                                                                                                                                                                                                        | ~95           |
| 1.7  | Workspace panel                         | `ui/workspace/*` (Review 34, Panel 29, Browser 28, Files 23, ReviewComposer 22, Agents, Tabs, Terminal, EmptyState, BrowserAnnotations), `ui/pull-requests/*` (DetailPane 159, View 47, Files 41), `StageHeader` (37), `StagePullRequestChip`, `DiffReview`, `TerminalPane`, `BrowserCommentCard`                                                    | ~530          |
| 1.8  | Dialogs, notices, errors, updates       | `bridge.ts` (29 error texts), `MediaViewer` (28), `RendererErrorBoundary` (25), `FeedbackDialog` (20), `ProviderUpdates` (14), `AppUpdateNotice` (13), `AppUpdateToast`, `RollbackDialog`, `CheckoutDiscardDialog`, `UsageResetNotice`, `Notice`, `EmptyState`, `RowIssue`, `SurfaceErrorBoundary`, error and toast texts in `App.tsx` (83)          | ~250          |
| 1.9  | Native menus, tray and notifications    | `apps/desktop/src/app-menu.ts` (12 menu labels), `chat-notifier.ts`, `image-context-menu.ts`, `main.ts` dialogs (19). The main process cannot import the web module: it needs a small mirror and the current language passed over the bridge. No tray file exists yet                                                                                | ~70           |
| 1.10 | Text that comes from the server         | `apps/server/src`: ~480 string literals, a minority user-visible: `orchestrator.ts` (92), `store.ts` (63), `provider-controls.ts` (53), `pull-requests.ts` (30), `adapters.ts` (26), `checkout-pull-request.ts`. Survey first: prefer error codes the web maps to catalog keys over translating on the server                                        | ~480 (survey) |
| 1.12 | Layout check                            | Portuguese runs 20 to 30 percent longer. On General, "E ao concluir" (notification choice) was shortened to fit one line in the 3-choice grid; check the same in the other pages as they convert                                                                                                                                                     | n/a           |

`MediaViewer`, `RollbackDialog` and `UsageResetNotice` in row 1.8 belong to the chat front (1.15) and are
translated in the `chat` area.

Date, time and number formatting (relative times, usage figures) use `Intl` with the default
locale today; wave 2 should pass `getLanguage()` as the locale where the text is shown.
For a number shown to the user outside the transcript, call `formatNumber(value, options?)` from the
index: it follows the current language (`1,234` in English, `1.234` in Portuguese).
