# Architecture

Decisions and why, including what we rejected — that part matters, or we re-argue the same
thing in three months. Detail gets added as we build. To change a decision: edit here and
add a change-log row.

---

## Shape

**A local server owns all state and orchestration. Every client is a thin renderer over a
typed WebSocket protocol.**

```
desktop renderer · web     phone (Expo + UIKit)       thin clients
        │  WebSocket, typed contracts   │ same protocol, end-to-end encrypted link
        │  req/res { id, method, params } · push { channel, sequence, data }
   core server (Node, local, long-lived)
        │  orchestration · adapters · SQLite event log · checkpoints · worktrees · PTY
   codex app-server · ACP agents · CLI adapters · direct API
```

Why not just do it in Electron's main process:

- **Agents survive the UI.** Close the window, the turn keeps running.
- The web client is nearly free.
- The server is headless, so orchestration is testable without booting Electron.

T3 Code and OpenCode independently landed on the same shape.

**Protocol rules:** every payload schema-validated at the boundary, both directions. Push
envelopes carry a monotonic `sequence` per connection so clients detect gaps and resync.
Client transport is an explicit state machine (`connecting → open → reconnecting → closed`)
that queues outbound requests while disconnected.

PR descriptions, comments, and reviews load private repository images through the existing
authenticated `gh` process and typed protocol, not a new HTTP proxy or renderer-held credential.
Repository-file URLs reach fixed Contents/Blob API endpoints; private uploads use a validated
GitHub attachment ID through the same CLI, including renewal of expired private-CDN links.
Responses are bounded to 10 MiB and checked PNG, JPEG, GIF, WebP, AVIF, SVG, BMP, or ICO bytes.
SVG stays in Chromium's isolated image mode, never inline markup, so scripts and external
resources cannot execute. Animated image bytes are preserved. Four concurrent reads share a
bounded queue, and byte-bounded LRU caches in the server and renderer avoid repeat fetches.
Previews start near the visible scroll area and decode asynchronously; relative paths resolve
against the PR head. Public GitHub origins remain image-only in CSP. GitHub permissions still
apply, and neither browser cookies nor signed redirect URLs are copied into renderer responses.

_Rejected:_ everything in Electron main (forecloses the web client). tRPC on the wire (ties us
to a TypeScript client).

**Closing a terminal ends its foreground job, not everything it ever started.** node-pty's
`kill()` only sends the shell SIGHUP; bash and zsh forward it to their jobs, and when the shell
exits the kernel sends it to the terminal's foreground process group. Before that hangup the
server reads the foreground group from a shell it forked as a session leader. A shell still
running after a grace period is SIGKILLed, and the close is done once the shell is gone. The
manager then stops the foreground job in the background, so a chat can open a new terminal at
once: the job gets a grace period to exit on its own, then SIGTERM, then SIGKILL, and a job that
still cannot be stopped is logged rather than failing anything. On a pane or chat close the
shell's grace, the job's grace and the wait after SIGTERM are three seconds each, and the wait
after SIGKILL is one second. Server shutdown waits for every job, under one deadline counted from
the start of the close: a shell still running is SIGKILLed and jobs get SIGTERM from 0.2 s, jobs
get SIGKILL at 2 s, and the close gives up at 2.3 s. That keeps the last SIGKILL inside the
desktop's three-second force stop, and leaves most of the time to SIGTERM, on which servers that
reload on SIGHUP (gunicorn, nginx, postgres) shut down cleanly. Closing or deleting a chat,
removing a project's chats and discarding a worktree wait only for the shells; a project's own
terminal is closed without waiting.

Before each signal the group is listed again. On Linux the job is only signalled while every live
member is still in the closed shell's session, which keeps a recycled group id from being
signalled. macOS `ps` prints 0 as every process's session, so there that re-check guards nothing
and only the shell's session-leader check holds.

Only processes outside the foreground group survive. A job put in the background from the
interactive prompt gets its own group through job control and stays the shell's business, as in
a terminal emulator: `nohup … &` and `disown` keep working, and so does a background job that
ignores SIGHUP, which the OS cannot tell apart from `nohup`. `setsid` leaves the group from
anywhere. Everything else in the foreground group is ended whatever it does with SIGHUP: a
foreground `nohup` command, and the `&` or `nohup … &` children of a foreground script or of a
one-shot `run()` command, which run without job control and stay in the group. On Windows
node-pty already terminates every process attached to the closed ConPTY (read from its source,
not yet tried on Windows).

_Rejected:_ sweeping the whole PTY session (#1162): it also kills `nohup` and disowned jobs that
a terminal emulator leaves running. SIGTERM straight after the hangup: it cut off jobs that need
more than a moment to shut down cleanly. Waiting for the job in the close itself: closing a chat
took up to nine seconds and its terminal could not be reopened meanwhile.

### User feedback goes through the server

**Outbound feedback goes through the local server; the inbox key lives only in the server
process.** The renderer's CSP allows only the local server, so the feedback dialog calls
`feedback.status`, `feedback.preview` and `feedback.submit`, and the server builds, redacts and
sends the Trecko request. Preview and submit share one builder, so the preview is exactly what
is sent, and only `feedback.submit` (the dialog's Send) sends anything. The key is injected at
build time: `apps/desktop/scripts/feedback-endpoint.js` writes the gitignored
`dist/feedback/feedback.env`, which ships as an extra resource outside `app.asar`. Desktop main
passes the server only that file's path; the server reads it once at startup and deletes every
feedback variable from `process.env`, so agent CLIs, terminals and git never inherit the key.
`pnpm dev` reads `~/.tastecode/trecko-feedback.env` instead. Builds without a key answer
`not_configured`, and every entry point stays hidden. The local limits (one send at a time,
waits after each attempt, daily caps, duplicate refusal) only stop the app itself from spamming
the inbox. The key can be extracted from any packaged build, so real abuse protection belongs
in Trecko.

_Rejected:_ a renderer `fetch` to Trecko (widens the CSP and puts the key in the renderer).
Leaving the key in the server's environment (every child process would inherit it). Compiling
the key into desktop main (main never needs it).

### Phones connect over an end-to-end encrypted link

**A paired phone is one more client of the same protocol, reached directly over the local
network or a tailnet, with every frame encrypted end to end.** For now phone access is a dev
feature: a build offers it only when the server runs with `HARNESS_PHONE_ACCESS=1`, which
`pnpm dev` sets. Without it nothing can open the phone listener (resuming a state an earlier dev
build stored as on, turning access on and pairing all refuse with "Phone access is not part of
this build."), `phone.status` answers `available: false`, and the desktop hides Settings › Phone.
The packaged desktop passes its own environment to the server it starts, so a tester of a dev
installer turns it on with a user environment variable (on Windows `setx HARNESS_PHONE_ACCESS 1`
or System Properties › Environment Variables) and then quits and restarts TasteCode. Where it is
offered, phone access is off until the user turns it on in Settings › Phone. Then a second listener (`HARNESS_PHONE_PORT`, default 4317) accepts WebSockets on `/link` from private, link-local, loopback and tailnet
(100.64.0.0/10) addresses only, refuses any request carrying an `Origin` header (no page can
reach it), and speaks nothing but a **Noise IK** handshake (`Noise_IK_25519_ChaChaPoly_SHA256`,
prologue `tastecode-link/1`) until the phone has proved its key. The pairing code is a
`tastecode://pair` link holding the computer's static X25519 key, its port, its addresses (local
name, Wi-Fi, Tailscale) and a one-time secret that expires after ten minutes; the first phone to
present it is registered by its public key, and the code closes. The phone pins the computer's
key, so no address in the code has to be trusted and nothing can stand in the middle. After the
handshake each WebSocket message is one ChaCha20-Poly1305 frame, larger than Noise's own 64 KiB
limit when a history page needs it; a frame that fails authentication closes the link. Both
implementations (Node's crypto in `apps/server/src/phone-noise.ts`, CryptoKit in
`apps/mobile/modules/tastecode-link`) reproduce the published cacophony vector byte for byte.

The server's private key lives in the OS credential store, one per data folder; paired phones
are stored as public keys in `app_settings`. A phone may call only `PHONE_METHODS`: reading and
driving chats, choosing models and access levels, browsing folders to add a project, attaching
images. Terminals, installs, credentials, MCP and further pairing stay on the desktop, and
phone links never receive `phone.*` or preview pushes. A paired phone sees every push the
desktop sees, so a turn started on either streams on both; `projects.changed` tells every client
when another one started, renamed or moved a chat. A chat's setup (model, reasoning effort,
service tier, access level) is kept by the server, not by each client: `thread.settings` reads
it, `thread.setSettings` and `thread.setApproval` change it, and the `thread.settings` push
carries every change, so a pick on one device shows on the other at once. The desktop publishes
the choice keys its picker hides (`models.hidden`) and the phone offers only the rest, because
the desktop never runs a chat on a hidden model.

The phone app is Expo with its interface written in Swift: UIKit view controllers (iOS 26, Liquid
Glass) under one native view that the React root fills the screen with, in the local
`tastecode-ui` module, beside the `tastecode-link` module (Network.framework and CryptoKit, keys in the Keychain). Protocol logic,
reconnects and state are TypeScript and import the shared contracts' types. TypeScript also
words what the screens show (`src/view`: chat rows, step summaries, approval subjects) and sends
it to Swift as JSON; an open chat sends only the rows that changed, so a streaming reply carries
its own text and nothing else; Swift reads that JSON off the main thread. Swift draws and asks
back through one action event. The chat transcript is a collection view whose layout knows every
row's exact height, rows laid out on a background queue from Markdown blocks
measured once and cached, and in a long reply only the blocks near the screen built. Text is
drawn off the main thread into IOSurfaces (also a screen and a half ahead of a scroll), which the
main thread hands to Core Animation as they are; a streaming row moves only itself and the rows
below it. An Android build replaces the two native modules with Kotlin and Compose and keeps
everything else. The phone app has its own npm install, outside the pnpm workspace.

_Rejected:_ the earlier phone design's bearer tokens in a plaintext WebSocket URL (safe only on
Tailscale, readable by anyone on a café Wi-Fi). TLS with a pinned self-signed certificate
(React Native's WebSocket cannot pin, and Node needs a certificate generator). A relay server
(traffic and metadata would leave the user's machines; a relay can come later, carrying the same
encrypted frames). A fully native Swift app (Android would share nothing). Screens composed in
React from `@expo/ui`'s SwiftUI components (the first version): menus, toolbars, the composer's
glass and scrolling could not be shaped as iOS draws them, and every streamed delta re-rendered
React. Screens as one SwiftUI hierarchy inside an `@expo/ui` host (the second version): a held
chat's grey highlight stayed about 0.8 s after its menu closed, with no way to end it; the chosen
typeface replaced the monospaced face of keys and diffs; and the UIKit transcript sat behind a
representable. The transcript in SwiftUI (a lazy stack of `Text`): every streamed delta parsed and laid out
the whole reply again on the main thread: streaming the same reply in a simulator, it used about
three times the main thread's time the UIKit transcript does. Transcript text drawn in
`draw(_:)`, even with `drawsAsynchronously`: the main thread typeset every changed block and then
waited at each commit for Core Animation's drawing queue, about 60% of its busy time while
streaming. Text as plain `CGImage` contents: it cost the main thread 5–10% more CPU while
scrolling than IOSurfaces, which Core Animation shares with the render server rather than
sending over.

---

## Desktop shell: Electron

**The primary desktop client is Electron on macOS and Windows.** One Chromium renderer gives
both platforms the same layout, text and motion implementation. Tauri and other system-webview
shells are smaller, but their Chromium/WebKit split would make visual parity a permanent
cross-platform problem.

The local Node server remains a separate long-lived process behind the typed WebSocket
protocol. Closing or restarting the Electron window does not stop active agents. The renderer
stays a thin client and never owns orchestration, persistence, provider processes, the PTY, or
credentials. Quitting asks the server to shut down over IPC (`{ type: 'harness:shutdown' }`),
so it flushes streamed text and closes the store; the desktop force-stops it only after three
seconds. A crashed renderer reloads on its own up to three times in a row (the count starts over
after five healthy minutes) and then offers a Reload dialog instead of looping; after running
out of memory the new page opens without the chat that was open and says so. A window hidden
in the tray for five minutes with no chat working and nothing unsaved is destroyed and built
again when shown, on the chat it had open. While a turn runs, the desktop keeps the computer
awake (the display may still turn off). The server it owns tells it which chats are not at rest
over the same parent channel, in the other direction (`{ type: 'harness:chatActivity', running,
chats }`: the whole picture, coalesced, and once in full at start), so that count, the quit
question, the hidden-window unload and the OS notifications are right with no window open; a
window only adds the notification mode the person chose. The packaged server takes its port from the
renderer's compiled CSP, so a stray `HARNESS_PORT` cannot split the two.

Every quit runs against deadlines (`quit-watchdog.ts`): the update cleanup 3 s, the server's own
shutdown 10 s, the whole quit 15 s, after which the log names what did not close and the app
exits with code 3. An installer asks the running app to quit by starting the app's own
executable with `--quit-for-install=silent|ask`: Electron's single-instance lock hands the
request to the running app (`install-quit.ts`), which answers through a status file in its data
folder and ignores a request without the per-run secret it wrote there. Rejected: ending the
processes by name from the installer (what electron-builder's default does, and what skips the
ordered shutdown), a localhost endpoint for the request (a port anything on the machine could
reach), and a native message window of our own in the installer (the app already has the quit
question).

Durable user data never lives in the OS temp folder, which the system may clean at any time.
Pasted attachments are written under the app's data folder, because chat history keeps their
paths; files pasted by older builds into `<temp>/TasteCode/pasted-files` stay readable. They
are never pruned by age: only chat history knows whether a file is still referenced. New
isolated chat checkouts live in `trees` beside the database for the same reason
(`HARNESS_WORKTREE_DIR` overrides it); existing checkouts keep their stored paths.

A picture a saved transcript carries inline (a `data:` attachment of an imported Claude Code or
Codex chat) is written once, by content hash, to `<data folder>/pasted-files/<sha256>.<ext>` when
the transcript is merged into the log. The event keeps only that path and a few facts about it
(`attachmentInfo`: type, bytes, width, height), so a chat of 184 screenshots went from 48 MB to 3 MB
on the wire. The renderer shows the picture through the desktop's signed preview URL (or, in a
browser tab, `attachments.read`) only while its row is mounted. Events an older version saved with
the picture inline are moved to files when the chat is opened (once per run) and by
`harness history compact`; a file that cannot be written leaves the picture inline, so nothing is
lost, and an inline picture still renders. Deleting a chat removes the files no other chat names.

Electron's weaker security defaults are fixed in the shell: `contextIsolation: true`,
`nodeIntegration: false`, sandboxing, a strict CSP, a narrow typed `contextBridge`, and
deny-by-default external navigation. The renderer never spawns a process, touches the
filesystem, or reads a credential.

_Rejected:_ Tauri/Wails/Neutralino use divergent operating-system webviews · separate AppKit
and WinUI clients create two permanent UI implementations · a web-only primary cannot own the
native terminal, filesystem and credential-store surface. The Rust + GPUI rewrite is preserved
on `archive/rust-rewrite-2026-08-15`; it is not part of `main`.

### Embedded browser previews

**Page previews use a renderer-owned Electron `<webview>` guest, never an iframe or an
operating-system webview.** Before attachment, the main process strips preload access, assigns a
dedicated persistent partition, disables Node integration, and requires sandboxing, context
isolation, and web security. Top-level navigation accepts HTTPS anywhere and HTTP only on
loopback, where dev previews bind 127.0.0.1. Programmatic navigation is checked through the
session request API; stopping inside `did-start-navigation` can crash Chromium. This policy
is not a general subresource or network firewall. The guest denies permissions, keeps
attempted new windows in the same preview, and exposes an explicit validated system-browser
handoff. Guests keep Chromium's background throttling, so a hidden or minimized window does not
run a page's timers and animation frames at full rate. Hidden full-page captures use their own
unthrottled offscreen window instead.

The guest remains a normal DOM element, so it follows the animated workspace without a native
overlay or bounds IPC. A renderer `ResizeObserver` fits fluid, desktop, tablet, and mobile modes;
fixed modes retain their requested CSS viewport and scale the complete guest to fit instead of
stretching it. All modes therefore share Electron's Chromium path across macOS, Windows, and
Linux.

Browser annotations live entirely in the trusted renderer: an overlay intercepts clicks,
reads bounded DOM descriptions on demand, and captures the guest's visible pixels. There is no
new guest preload, IPC, global, event listener, stylesheet or DOM mutation. Leaving the mode
removes the overlay and stops polling. Going to another page discards the round; a reload of
the same page keeps it, because dev servers reload pages under an agent's edits. Open shadow
boundaries use `>>>` in a DOM path, while frames and closed roots are represented by their host elements.
Pins follow current element rectangles; removed elements retain their captured reference with
an explicit missing-element label. A replaced element with the same selector can inherit a pin.

`executeJavaScript` runs in the page world. A hostile page can falsify DOM metadata or deny the
read, so the host validates shapes, counts and finite coordinates, bounds and strips control
characters, and quotes all page strings as untrusted JSON. Every read of the page has a time
limit, and a selector it cannot resolve counts as a removed element, so neither a hung page nor
a bad selector stalls the mode. It cannot supply user comments,
create pins without a host click, invoke a host action or receive host state through this
stateless pull. Screenshots are also untrusted reference content. Quoting reduces instruction
confusion; it cannot guarantee that an agent will resist every visual or textual injection.
Crops use the captured bitmap dimensions relative to the guest's CSS viewport, independently
of host scaling and device pixel ratio. Only visible portions are captured, at selection time.

Add to chat moves a round into the composer as one chip per comment and saves each crop. The
draft holds only the chip; sending expands it into a quoted block and collects the screenshots
of chips still in the draft, so the ordinary send, queue, Steer and rejection recovery stay
authoritative. The block is also what lets the transcript draw the chip again after a restart.
The comment itself is the user's request and keeps its lines and joining characters; the
block's closing sentence separates it from the page data and is free text, so it can be
reworded without old messages losing their chips. A comment belongs to its page, not a provider,
so its chip survives a provider or project change. Copying one gives the user's words alone,
and recalling a sent prompt brings each chip back with its screenshot.
No protocol or shared-contract changes are required.

_Rejected:_ guest-to-host message channels, privileged guest preloads, persistent injected
listeners and DOM overlays would add an unnecessary trust boundary and cleanup obligation.

**An agent drives only its own chat's tab, through the same guest.** The server routes a
`browser.command` to the window that shows the chat; the renderer checks every page against
the address bar's rule again, and the session filter above stays the last line. While a tab is
agent-driven, the main process drops its downloads. The field check that keeps agents out of
password, sign-in code and payment fields, the typing itself and clicks run in a JavaScript world
of TasteCode's own (`executeJavaScriptInIsolatedWorld`): it shares the page's DOM but not its
globals, so a page cannot replace `querySelector`, value setters or labels to slip a field past
it. Clicks are DOM clicks there, because native input events do not reach a guest whose window
is in the background. Reading text, scrolling and the console run in the page's own world on
purpose: what they return is the page's word, which can lie, and it reaches the agent only as
quoted, bounded data. A page that lies there can mislead the agent, not get past the field check.

**The Browser's recently used pages stay in the renderer's own storage.** A tab the user opened
lists a page once it has finished loading, newest first and capped at 50. A fragment move does
not add a row, and a username or password in the address is dropped before saving. The agent's
tab and Design previews record nothing, because their pages are not the user's history, and
only the user's tabs offer the list, because a row loads in the tab that shows it. Like the
other device preferences the list is per renderer origin, so the dev renderer and the packaged
app keep separate lists. _Rejected:_ the server's SQLite store, which would need a contract
change and a protocol round trip for data no other client reads; and Chromium's history for the
guest partition, which Electron exposes only as each guest's back and forward list, gone with
the tab.

### Desktop update assets

The desktop updater finds releases in `Leonxlnx/tastecode` through the public release Atom
feed on github.com. The API's anonymous limit is 60 requests an hour per IP address, shared
by everything behind one office, school or VPN address, and an anonymous 304 still counts.
The feed is outside that limit. A check that finds no newer version tag in the feed spends
no API request. The newest newer tag costs one request to `/releases/tags/<tag>`, which
confirms the release is published and supplies the asset digests. When that tag has no
published release (drafts and bare tags answer 404), when none of the feed's ten newest
tags is the installed version or older, when a feed entry has no readable tag, or when a
full feed has nothing newer but no longer lists the installed release (later-published
older versions can push a newer release out of the window), the release list is read
instead. The feed is ordered by publication, so while it still lists the installed release
everything published after it is in view. A check therefore spends at most two API
requests while the project has fewer than 100 releases. Either way the highest semantic
version wins regardless of publication order, and downgrades stay disabled.

GitHub's pre-release flag does not matter: during the alpha every release is published as
a pre-release, and every published release reaches every install. Drafts stay invisible.
Beta 7 through 0.1.1 select by publication date; those installed clients still require the
newest public release to contain both desktop installers. The client requires the matching EXE or DMG and verifies
its size and SHA-256 against GitHub's asset metadata.

Downloads survive failures and restarts. The installer is stored in the machine's cache
directory (`~/Library/Caches/TasteCode/update-downloads` on macOS, local AppData on Windows)
under its SHA-256, and the next attempt asks for the remaining bytes with a Range request.
A minute without data ends an attempt and keeps the bytes so far. The bytes are verified
before use, removed once the native updater holds its own copy, and discarded when a check
finds nothing newer. A verified download also survives a failed preparation (`ditto`,
`hdiutil`, `codesign`, a timeout or a Squirrel error); only proof that the package itself
is bad (wrong signature, invalid or corrupt image) discards it, so a local failure never
costs a silent 500 MB re-download. Removal retries and never fails an update, because
Windows virus scanners briefly lock fresh installers.

Background attempts never surface their failures. An offline launch, a GitHub outage or a
dropped download falls back to the last verdict, is recorded in opt-in local diagnostics,
and retries after 5, 15 and 30 minutes, then hourly. A rate-limited answer waits for
GitHub's reset. A check the user starts, and a failed install of a ready update, show the
error. After the machine wakes, an overdue check runs within 15 seconds.

Installation remains owned by electron-updater's NSIS and Squirrel.Mac paths. On macOS,
the client mounts the DMG read-only, validates its app ID, version and signature, and
creates Squirrel's ZIP locally. A private loopback endpoint supplies the verified file
with locally computed SHA-512 metadata. It closes after the native updater consumes the
file. Quit waits for active download cleanup so a mounted DMG is detached.

Beta 7 retains the public YAML/ZIP assets needed by beta 6. Starting at beta 8, only the
EXE and DMG are uploaded; the complete checksums and packaging proof remain local.
The cutoff and remaining beta 6 users are covered in [RELEASING.md](./RELEASING.md).

_Rejected:_ replacing app bundles with a custom shell/helper installer would duplicate
native signing checks and replacement logic; a second release repository would split
the release process. Removing compatibility files in beta 7 would strand beta 6 users.
Sorting by publication date allows an older, later-published platform proof to hide the
current version and fail asset validation before the downgrade check runs.
Conditional API requests with ETags do not save the anonymous limit. electron-updater's
YAML feeds and blockmaps would add files to every release and give up the two-asset
release that installed clients rely on, so differential downloads are not offered either.
Stable and beta channels keyed on the pre-release flag were built and removed the same day:
with every alpha release published as a pre-release, a stable default would have blocked all
updates. Channels need a real stable line first, at v1 at the earliest.

---

## Stack

|                    |                                            |                                                                         |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| Language / runtime | TypeScript 5.9.3, Node 24 LTS              | One language across the server, adapters, web client, and desktop shell |
| Monorepo           | pnpm workspaces + Vite                     | pnpm's store keeps worktree-heavy development cheap                     |
| Desktop            | Electron 43                                | One Chromium renderer across macOS and Windows                          |
| UI                 | React 19                                   | Shared renderer behavior and app-owned controls                         |
| Chat list          | TanStack Virtual, end-anchored             | Variable-height streamed rows keep stable keys and cached measurement   |
| Markdown           | Streamdown + Shiki's JavaScript engine     | Incomplete streamed blocks stay cheap without weakening the CSP         |
| Styling            | CSS token layer                            | Themes, geometry, density, and motion remain app-owned                  |
| State              | React external store + event-derived views | Deltas update the live tail without rebuilding completed history        |
| DB                 | Node SQLite, WAL, FTS5                     | Append-only events and rebuildable read models remain unchanged         |
| PTY                | `node-pty`                                 | The shared process layer handles Unix PTYs and Windows ConPTY           |
| Tests              | Vitest + live Electron checks              | Captured provider frames and platform runs remain the final contract    |

**On Effect-TS:** T3 Code uses it throughout and it genuinely fits this problem. We don't
adopt it for v1 — the learning curve colors every signature and with two developers the
fluency cost outweighs the benefit before we've shipped. We take the patterns (explicit
layers, typed errors, drainable workers) in plain TypeScript. Revisit if orchestrator
concurrency bugs become a recurring pain.

---

## Agent adapters

**One internal model: Thread → Turn → Item.** Borrowed from Codex because it's the best
designed and maps straight onto the UI. Items are `message`, `reasoning`, `command`,
`file_change`, `tool_call`, `plan`, `error`, each with a `started → deltas → completed`
lifecycle. Adapters translate _into_ this. Nothing engine-specific leaks past them.

| Tier       | Mechanism                        | Engines                                                                                 | Fidelity                              |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| 1 — Native | Vendor protocol or supported SDK | Codex (`app-server` JSON-RPC), Claude Code (Agent SDK), OpenCode (HTTP), Pi (RPC JSONL) | Full where the protocol exposes it    |
| 2 — ACP    | Agent Client Protocol over stdio | Gemini CLI + ~25 others                                                                 | Good. One adapter, long tail for free |
| 3 — CLI    | Headless NDJSON                  | Cursor, Grok                                                                            | Adequate. Version-pinned, fragile     |

Engines can appear in more than one tier. We default to the highest fidelity available, with
a user override. Claude Code now runs through Anthropic's Agent SDK while keeping the user's
installed `claude` executable and account, so the adapter gets a persistent prompt stream,
interactive permissions and questions, and live control calls without making shared behavior
depend on that vendor. A different Claude surface can still replace it without touching the UI.
The user can instead run it through `claude -p` with stream-json on both pipes, where the adapter
speaks the same control protocol itself (`cli-runtime.ts`); an engine declares such choices as
`capabilities.runtimes`, and the server stores the choice and applies it at every launch.
Because the adapter always names that executable, the SDK's optional per-platform CLI packages
(about 290 MB each) are removed from the dependency graph in `pnpm-workspace.yaml` and excluded
from the desktop package; the app ships no Claude binary of its own.

**Users may register protocol-compatible executables as separate harness sources.** Each
entry names an existing adapter protocol and stores an executable, fixed argv, optional launch
directory, and non-secret environment overrides in
`~/.tastecode/custom-harnesses.json`; arguments never pass through a shell, and secrets
never belong in this file. Provider CLIs, terminals, and custom commands resolve against a
desktop-safe PATH. GUI-launched Electron apps do not inherit a login shell, so the server
adds conventional user locations such as `~/.local/bin`, Homebrew's prefix, and
`%LOCALAPPDATA%/Programs/OpenAI/Codex/bin` rather than sourcing `.zshrc`. Settings can also
name one executable per built-in CLI provider or ACP agent. The server validates it, stores it
with the app settings and applies it through one override table in `@harness/proc`, so
detection, version checks, launches, and sign-in and update terminals all reach the same file;
running processes keep theirs, and phone links may neither read nor change it. Codex's adapter
owns its official standalone install command, so fresh desktops do not need npm to install
their first provider. The server allowlists that same command for guided setup. When a mod boots
from its own directory,
`HARNESS_WORKSPACE_PATH` retains the active project for its wrapper and native protocols still
receive that project normally. The source gets its own model catalog and persisted identity, so
a fork can coexist with the stock CLI without replacing it.

Settings can run a bounded compatibility check before the first prompt. Codex, Claude Code, Pi,
OpenCode, and ACP complete their actual initialize handshake; one-shot CLI adapters run only their
free help/model-discovery command. Claude's SDK probe uses a never-yielding prompt stream, so it can
read models and account metadata without starting an Anthropic API request. Its synthetic `default`
row is discarded, live aliases are presented with their resolved version numbers, and the live list
is merged with Claude Code's complete versioned catalog. Missing executables,
inaccessible directories, protocol failures, and timeouts are reported separately, and timed-out
protocol children are disposed. A successful check proves the advertised handshake, not arbitrary
behavior in a modified implementation, so version drift and custom-server instability remain
disclosed. Parked built-ins stay hidden unless the user explicitly registers one of these sources.

**`capabilities()` is what makes it honest.** Not every engine can fork, steer, or emit
reasoning. The UI reads capabilities and hides what's unavailable rather than showing a
button that fails.

**TasteCode thread ids and provider resume ids are separate identities.** The stable TasteCode
id owns the event log, queue, worktree, and UI route. When a provider reports a different opaque
session id, the adapter emits it as recovery metadata and the server persists it separately.
Restarted runtimes receive both ids and must return the original TasteCode id; the provider id is
used only at that adapter's resume boundary. A provider that never reported one fails with a
recoverable new-chat instruction rather than passing a synthetic TasteCode id to the provider.

**Completed resumable runtimes are a hardware-scaled warm LRU.** Each attached adapter can own a
child process, so keeping every completed thread attached makes idle memory grow without a bound.
TasteCode keeps one warm idle runtime per 8 GiB of RAM, with a floor of two and a ceiling of six,
and stops an idle runtime after two minutes. An idle Claude Code process holds about 0.5-1 GB.
Viewing a thread refreshes its recency; an evicted thread resumes on its next submission. Running,
queued, Side chat, provider-operation, and non-resumable runtimes are never evicted.

**Large optional feature engines load only when their feature starts.** The server keeps Design
mode's tiny attachment marker on the normal turn path, but defers its full prompts, parsers, and
validators until a design run starts or resumes. An unused optional feature must not add to every
startup or idle process merely because its routes exist.

**Startup readiness uses the lightest provider-owned check.** Codex sign-in readiness comes from
its short `login status` command, so opening TasteCode does not start a full `app-server` merely to
enable the composer. Provider Settings still asks the native protocol for rich account details.
The selected source may also reuse a model catalog that the provider validated within the last five
minutes; opening the model picker always requests live discovery. Cached models never replace the
per-launch sign-in check.

**Tier 3 will break** — it's coupled to someone else's output shape. Each Tier 3 adapter
needs a declared version range, a CI contract test that runs the real binary, graceful
degradation to an `unknown` item (never a crash, never silent loss), and a visible
"untested version" banner.

Checkpoints, worktrees, cost accounting and search live **above** the adapters, implemented
once. Git checkpoints work identically regardless of which engine made the change.

**Branch scope (2026-10-03).** `main` ships only the Codex, Claude Code and Grok adapters.
Every other adapter in this document, the ACP agent roster and the direct API runtime exist
only on `nightly`; on `main`, `packages/adapter-acp` remains solely as the protocol client
behind project-enabled Grok MCP sessions. The decisions below still bind both branches.

**Each build offers the providers of its edition (2026-11-01).** Promotions `dev` → `nightly`
→ `main` merge whole branches, so the provider code on `dev` reaches `main` with a promotion;
the build, not the branch, decides what a user is offered. A release build offers exactly Claude Code, Codex,
Grok, Cursor and Antigravity; a dev build offers every provider. The edition is decided at
package time through electron-builder `extraMetadata`: `dist` and `dist:dir` write
`tastecodeEdition=dev` into the packaged `package.json`, and `dist:release` writes nothing.
Desktop main reads that field; a missing, unknown or unreadable value means release, so a
package built any other way fails closed. It passes the edition to the server as
`HARNESS_EDITION`, applied after the inherited environment so a variable set on the machine
cannot widen a release build; unpackaged runs (`pnpm dev`) pass nothing and offer everything.
The server reads `HARNESS_EDITION` once at startup, deletes it from `process.env` so agent CLIs
and terminals do not inherit it, and refuses to start on any value other than `release` or
`dev`. It enforces the edition at `providers.list` (and `acp.agents`), at provider install and
launch, in the runtime loader every session passes through, in `startThread` before the
base-branch switch, and in the custom-harness listing. The renderer only follows
`providers.list`; shared code never checks a provider by name. The release asset check refuses
a package whose `tastecodeEdition` is anything other than `release`.

**The product must work with only a direct API provider configured.** TasteCode owns the
shared session model, persistence, orchestration, queueing, review, worktrees, terminal and
UI. Provider integrations supply inference and declare optional capabilities; they do not
own shared product behavior. New features are designed against the internal contracts
first, then mapped through every adapter. A missing provider capability hides or degrades
only that capability, never the surrounding workflow. Behavioral provider-name branches
belong inside adapters, not the server or renderer.

**Side chat is a provider-neutral ephemeral session, not a native-fork dependency.** At the
fork boundary the orchestrator folds a bounded, reasoning-free snapshot of the parent event
log into session instructions and starts a normal session through the selected adapter.
The side event channel and transcript are independent, the row stays out of project history
and search, and closing the panel disposes and deletes it. A provider may expose native fork,
but shared Side chat semantics cannot depend on that optional capability.

**Direct model API connections were removed (2026-10-20).** TasteCode no longer stores API
keys or runs chats on them itself. Its own small agent loop (four workspace tools, a 64 KiB
request budget) made a key-backed chat a far weaker agent than any CLI, and the OpenCode-backed
replacement tried the same day was dropped before it shipped. To use their own key, users sign
in to OpenCode with it and chat through the OpenCode provider. The `api` provider id and the
`connections.*` methods remain in `packages/contracts` until a contracts change removes them;
the server answers those methods as unknown, and a saved API chat stays readable but cannot
start again. The principle above, and the matching hard rule in `AGENTS.md`, named the direct
API provider as the one every shared feature is checked against; which provider takes that
place is Leon's decision.

_Rejected:_ ACP-only (gives up Codex's richest-in-class surface) · native-only (caps us at
4 engines) · a TasteCode agent loop as the only integration path (throws away richer vendor
agent features) · a `switch` on provider in the orchestrator.

### Voice dictation uses the signed-in Codex account

Desktop Codex chats offer dictation immediately to the left of Send. The renderer records
bounded mono 24 kHz PCM WAV and sends audio through the existing local voice protocol.
The Codex adapter obtains account authorization through app-server `getAuthStatus` and
uploads the clip to the fixed ChatGPT transcription endpoint. It refreshes authorization
once after a 401/403. Credentials remain in adapter memory, never in the renderer,
configuration, database, logs, or protocol responses. No separate API key is required.

Recording shows live audio levels, a timer, cancel, transcribe, and transcribe-and-send.
Escape cancels; cancellation closes the microphone and aborts uploads. The transport and
response sizes are bounded. This account endpoint is not a public API contract, so failures
must remain visible and must not silently switch to a billed API connection.

_Rejected:_ browser SpeechRecognition (unreliable in packaged Electron) and requiring an
extra OpenAI API key for account-backed dictation.

---

## Project-scoped MCP configuration

**TasteCode owns project-scoped MCP configuration; vendor-global configuration is an
inherited input, not our storage layer.** Definitions and per-project enablement live in
the server-owned, human-readable user-config location documented under Storage, keyed by
the canonical project path and a stable server id. They do not live in the repository or
the SQLite event log.

Secrets live only in the OS credential store. The config may contain an opaque credential
reference, never a token or secret environment value. Provider-owned OAuth credentials
remain with the provider binary; TasteCode starts the provider's login flow and observes its
reported status without reading the credential.

For each provider, effective MCP configuration resolves in this order:

1. An explicitly disabled project entry hides the vendor-global server with the same id.
2. A project definition replaces the vendor-global definition with the same id for that
   project only.
3. Vendor-global servers without a project override remain inherited and read-only.

Project-scoped operations never rewrite or delete unrelated vendor-global configuration.
An adapter that cannot perform an operation reports it as unsupported through capabilities
and returns an actionable error; TasteCode does not pretend success or fall back to mutating
global state. Read-only inventory may still be exposed when the provider supports it.

Grok's one-shot print mode has no session-scoped MCP input, so a Grok session with enabled
project servers starts through the same installed binary's ACP stdio mode and passes those
servers in `session/new`. Sessions without a project server keep the captured streaming-JSON
path. This preserves Grok's inherited user configuration without writing `~/.grok/config.toml`
or a repository `.grok/config.toml` on the user's behalf.

Claude Code receives enabled project definitions on both start and resume through the Agent
SDK. Initial same-id loopback definitions suppress overridden inherited servers without exposing
credentials. Before the session becomes ready, the SDK control channel replaces these definitions
with the configured transports. Each server receives only its own credentials; secrets do not
enter command arguments or the shared Claude process environment. Diagnostics are redacted.
Other inherited servers remain available. The captured SDK cannot safely hide an inherited
server without writing vendor settings. Claude's adapter therefore rejects disabled entries
and unsupported per-server working directories before persistence or process startup. It
does not advertise live inventory, reload, or OAuth controls. Removing a project definition
still restores the inherited configuration on the next start or resume.

_Rejected:_ repository-local MCP config (opening an untrusted checkout must not authorize
command execution; revisit only with an explicit trust gate) · SQLite config (not
human-readable or hand-editable) · writing project state into each vendor's global config
(provider-specific, lossy, and too easy to overwrite unrelated user settings).

### The Clube do Motion link

The app is an OAuth 2.1 public client of the Clube (`clube-account.ts`): it registers itself once as
"TUIFT Code", signs in with PKCE (S256) and the `resource` of the Clube's MCP server, receives the
code on a listener bound to `127.0.0.1` that lives for that sign-in alone (it answers `/callback`
only, and a request with another `state` is refused and ignored), and keeps the tokens in the OS
credential store like a provider key (Windows Credential Manager, sealed with the user's DPAPI key;
the macOS Keychain), one small credential each. Nothing reaches a file, the database, a log, a push
or the phone: the page sees `ClubeStatus` and nothing more, and `clube.changed` carries no payload.
The refresh token is single use, so `#refresh` is the one place that renews: serialised, early
(two minutes before expiry, and once more after a 401), and a refusal unlinks. A paired phone can
call none of `clube.*`.

A chat reaches the Clube's tools through the app, never directly: the agent tools endpoint serves
`<route>/clube`, which forwards to `https://clubedomotion.com/mcp` with a token that is fresh at
that moment, so no provider process ever holds the account's token. The provider is given the
endpoint with the chat's own credential, the same as for the agent tools. It is attached to every
chat that gets the agent tools (Claude Code, Codex and OpenCode) once the account is a subscriber,
under the id `tuift-clube`, which is not a name a person picks for their own, so their own server
(saved for the project, hidden by them, or loaded by their provider) is always told apart and wins.
A 403, a 429 and an unreachable Clube reach the agent as a tool error.

_Rejected:_ writing a bearer header into the provider's MCP configuration (the token lasts an hour
and the provider's process would hold it) · one file of tokens next to the database (the credential
store is the app's rule for secrets) · a fixed loopback port (taken by another program, the
sign-in would fail; the app registers the port it got and tries it again next time) · attaching the
server to Motion chats only (the owner asked for "MCP connected", and the Clube is not only for
Motion).

### The Clube's sound library

A subscriber who linked the account uses the Clube's sounds (tonal sounds, effects and music) from the
app, one file at a time (`sound-library.ts`). Searches, facets and previews go through the server with
the account's token (`ClubeAccount.request` adds it; the library never sees it) and reach the page as
`SoundItem`s, never as the Clube's own fields or a collection name; a preview comes back as base64
so the page plays it without calling the Clube. There is no way to download the library: a sound is
fetched only when it is used, into `<project>/audio/clube/` of the chat's project (the stored project
folder, not a private checkout that goes away), under its real name, with a `manifest.json` beside
it. The next use of the same id finds the file there and spends nothing; a restart forgets the
searches but not the manifest. The SHA-256 header is checked (a mismatch is dropped, not kept, not
counted), the folder's real path must stay inside the project's (a link that points out is refused),
names lose every path and device character, and a track's zip is read entry by entry from a temporary
file, keeping only file names. The Clube's ceilings (200 sound files and 60 tracks, over a rolling 24 hours, not a calendar day) are counted here as an estimate, kept in the database; a 429 with the daily reason is remembered so the next use does not ask. A track is different: the Clube answers its detail with a 200, and without `zip.url` when the account may not download now, with a sentence that says why (a limit starts with "Limite"); that sentence is what the person and the agent are shown. A missing or wrong SHA-256 is refused. A track's previews are open MP3 links that come with the search, so listening asks nothing of the account. Music has two sources the person sees apart: the soundtracks (`trilha`, sounds of the library: one MP3, key and BPM estimated, counted with the sounds) and the Clube's music (three aligned WAV versions, key and BPM catalogued).

The agent reaches it on the agent tools channel, in Motion chats only (`sound_search`, `sound_use`,
`music_search`, `music_use`; listed for a Motion chat the way `motion_stage` is). Outside Motion they
would cost tokens in every chat and spend the person's daily files on work that is not a video. A
closed library (no account, no subscription, a limit, turned off in Settings) answers as a tool result
that says what the person can do, never as a broken call. The Motion session start says what the
chat has: the project's own sounds (a cheap look at a few well-known folders, one level down, a few
hundred entries at most), the library (with tools, or, for a provider the tools do not reach, the Sounds
tab of the side panel) or why it is closed, and the person's own sounds folder, which is only a path.
Settings (`sounds.settings`) are the library on or off and that folder; a paired phone calls no
`sounds.*`.

_Rejected:_ syncing or indexing the library (the owner's rule is one sound at a time) · an index of the
person's own folder (the agent can list a folder; the app only says where it is) · a download folder
outside the project (the After Effects tools and the skills read files, so the project is where they
look) · naming files by id only (the name carries instrument, key and mode) · offering the tools to
every chat.

### The Clube's library tab

The side panel has a Clube tab (`WorkspaceClube.tsx`) over `clube-library.ts` in the server: search over
the five kinds of the Clube's library, a record opened **only when the person asks** (the Clube counts an
opening as seen, and the first opening of a reference spends one of the account's credits, so a reference
asks first and shows the credits after), and the actions of each kind. It is offered in Motion chats always
and in other chats once an account is linked (one `clube.status` read, refreshed by `clube.changed`);
a Motion chat does not ask at all. Like every `clube.*` and `sounds.*` method it is closed to a paired phone.

Every byte goes through the server. The page's policy lets it load nothing from the Clube, so covers and
previews come as `clube.library.media`: an address on the Clube's own origin and nothing else (another
origin, a user in the address, a redirect: refused before or without a request), no token, a picture, a short
video or an MP3 within its ceiling (4, 10 and 8 MB, which is what the socket's response budget can carry
as base64). A signed link of a download is held to the same rule: only the Clube's origin, no account token,
no redirect, and every link and every destination of the answer is checked before the first file is fetched.
A download runs one at a time in the server and answers at once with a job the page polls (a request
that waits would meet the transport's two-minute timeout, and a push would reach a paired phone). A file goes
to disk as it arrives, to `<name>.<random>.part`, and gets its name only when whole; a zip is unpacked entry by
entry into a staging folder (CRC-32 checked, every path confined to the item's folder, a drive letter, a
backslash, `..` or a device name refuses the archive) and each file is moved into place only when all
of them came out whole. A cancel or a failure leaves nothing under a final name that was not complete; a part
that finished stays and is not fetched again (a `.clube-download.json` beside the files says which parts are
whole, and a part whose file is gone or changed counts as missing). The ceilings are in `CLUBE_LIMITS`: a file
may not pass what the Clube declared for it (`tamanho_mb`, plus 5% and 2 MB) nor 2 GiB; a download not 4 GiB;
a zip not 5,000 entries, an entry not 2 GiB and the unpacked files not 6 GiB (the reader has no ZIP64, so
4 GiB is the true edge); twice the download's size must be free on the disk; no bytes for 60 seconds or no
answer in 30 seconds stops it. `sound-zip.ts` was not usable as it was (names flattened to file names, 64
entries, each entry read whole into memory); it gained a streaming `writeTo` and the entry's real path,
and its other behaviour is unchanged.

A skill of the Clube is installed once into the app's folder of installed skills through the same catalog
that installs the ones from authors (`SkillCatalog.installStaged`: same staging, same move, same record and
rollback), with `origin: 'clube'` in `installed.json` instead of a commit. `motion` and `som` skills go to the
`motion` category (Motion chats); `texto` and `processo` to `general`, which loads in every chat. It is listed
on the Skills page with its origin and removed by the road the others use; an id that the manifest or the
bundle already uses is refused. Disconnecting the account leaves the installed skills where they are.
Nothing of the Clube's content is in the repository or the installer.

_Rejected:_ loading covers by widening the page's `img-src`/`media-src` to the Clube (every page of the
app would then load from it) · the page holding signed links and downloading (the page must not hold a link
that works without a token) · a push for progress (it would reach a phone) · reusing `sound-zip.ts` as it was
(it flattens paths and reads each entry whole) · a second installer for skills (two writers of one record) ·
sending `usado` from the page after every download (the server does it, once per item per run).

---

## Storage

**SQLite in the server. The append-only event log is the source of truth for thread
transcripts and orchestration history; UI state is a derived read model. FTS5 for search.**

- Crash mid-turn → replay the log, lose nothing.
- Undo and checkpoints fall out naturally.
- Read-model migrations are cheap because they can always be rebuilt.
- **Rule: transcript and orchestration history changes by appending an event.** Project,
  lifecycle, settings, and catalog metadata remain ordinary transactional records. Never write
  directly to read models derived from the event log.

**Local provider history is discovered without starting a model turn.** Codex, Claude Code,
and Grok own their saved-file readers; shared import code only reads their declared history
interface. A background metadata scan adds native chats only to projects already added in
TasteCode and loads transcripts on demand. History readers never add projects. Adding a project
starts a fresh scan; removing it stops further imports until it is added again. Stable provider
identities prevent duplicate chats. Imported messages use the same
typed items and renderer as local turns. New versions append events; source membership hides
replaced native branches without moving local event positions or checkpoints. Replay orders
imported turns by their original time and replaces stale partial client histories when needed.
Provider files stay read-only. Local names, pins, project removal, and deletion remain local
choices; a deleted chat or closed Side chat keeps an import marker, so a rescan does not bring
it back. Cloud-only chats and missing native transcript files are outside this local reader.
**Importing chats is a user's explicit step on top of that discovery.** The background scan
still adds nothing outside projects. Settings lists every saved session, and what apps that are
not history sources saved (T3 Code, OpenCode), through read-only readers that know one store
each; a client picks ids from that scan and never sends a path. A chosen chat a provider can
resume joins provider history as one conversation. Any other chat is copied in and marked for a
handover, so its next prompt carries the transcript to a new session. A chat's folder becomes a
project only here, and the folder's unchosen sessions keep the marker a removed copy has, so
choosing one chat does not bring in the rest of the folder; they can still be imported later.
Background rescans stay cheap: Codex reuses indexed transcript file stats for up to 60 seconds
while its state index is unchanged, and Grok keeps a parsed session summary until the file's
size or modification time changes.

**Checkpoints are git**, captured on turn start and completion. Correct, inspectable with
tools users already trust, identical across every engine. Non-git directories fall back to a
content-addressed snapshot of touched files only.

A snapshot stages the working tree into a temporary index seeded from a copy of the
checkout's own index, reset to HEAD with `read-tree --reset -i`, so `add -A` re-reads only
files whose stat data changed. The copy keeps the source index's timestamp, so git still
re-checks racily clean entries. An index that marks any entry assume-unchanged or
skip-worktree falls back to a plain `read-tree`, because `add -A` would trust the mark and
record HEAD instead of the working file. _Rejected:_ a plain `read-tree` for every snapshot
(no stat data, so every tracked file was hashed before each turn: `add -A` took 404 ms of a
451 ms snapshot of a 2,487-file checkout) · listing changes with `git status` against the
real index (it hides the same marked files and may lock the index the agent is using).

**Search is FTS5** over message and tool-output text. Instant search across every session
ever, for almost no implementation cost — and "what was that command three weeks ago in the
other project?" is a real question nobody in this category answers well. Messages are indexed in
full. Command and tool output indexes its first 12K and last 4K characters, which keeps long logs from
being duplicated into the index. A search-index version change drops and recreates the table
before the rebuild; deleting every row first would tokenize the old index again.

**Many-thread sidebar state stays sparse and incremental.** The SQLite inbox index materializes
only current failures and pending requests; successful historic turns do not add startup work.
Index migrations and transcript rewrites rebuild it from the append-only event log. In memory,
Inbox projections allocate approval and input sets only while requests are pending. Live status
changes enter a bounded thread-id journal, so `projects.list` updates the exact changed rows while
its project, thread, and queue snapshots are unchanged. An expired journal falls back to a
complete projection. Visible inbox clocks also stay narrow: second, minute, and day values use
separate stable context lanes, so one working thread updates its own status without rebuilding
idle rows, menus, or shelf details. Repeated closed menus mount only their trigger; the full
positioning and keyboard controller activates on first use and stays warm. Context-menu targets
share one delegated listener set instead of installing listeners on every visible row.

**Long-thread replay snapshots extend from their durable tail.** An exact snapshot is returned
without parsing the event log. When a few newer events exist, the server reads only those events,
folds them over the prior compact replay, and replaces the snapshot. History rewrites delete the
snapshot first, so a stale branch can never survive a restore. Snapshots duplicate the log, so
disk keeps only the 64 most recently written ones, and closing a thread deletes its snapshot. An
older or closed thread rebuilds its replay from the log when it is opened again.

**Thread history is paged by whole turns.** A `thread.history` request with `page` cuts the
cached compact replay: the newest page holds the last turns plus the latest usage and the
approvals and questions older turns left open (a thread error closes them, as in the renderer),
and `olderCursor` walks back. A page ends only where every turn inside it has emitted its last
event, so a prompt recorded before its provider's turn start or a late tool completion never
straddles a cursor; one oversized block may exceed the requested size. Cursors are opaque,
thread-scoped and name the boundary turn and the replay's sequence. An older page is answered
from the replay saved at that sequence while it still exists, so a streaming turn never makes a
page re-compact or rewrite the snapshot; any rewrite of older history deletes that replay. The
answer is `reset` with the newest page when the boundary turn is gone (a restore removed it), when
the replay now ends before the cursor's sequence (a truncation with nothing written since), or
when provider history gained events after that sequence. A truncation that keeps the boundary turn
and has newer events after it does not reset: the older turns are unchanged. A provider rewrite
that only retires events is detected only through the re-recorded thread start: the merge records
`thread.started` again whenever it retires rows. Requests without `page` keep
the full and `afterSeq` responses.

**A cold open reads only the end of the event log.** When no current replay is parsed in memory,
the newest page is read newest first from the log itself, bounded before compaction (#1363's
plan). The page must equal the one cut from the compacted whole log, so the reader grows its
tail until no turn or item in it also occurs in an older row; compacting such a tail alone gives
the same events, and its blocks after the first are the whole log's blocks. A derived index makes
that check cheap: `history_keys` stores, per thread, the first row naming each turn and item, and
`history_state_events` lists the usage, request, answer, turn-end and error rows that decide what
older rows leave open. Both are written in the event's own transaction; a run of deltas writes
its keys once, so the per-delta path stays one insert. A thread is trusted only with a complete
mark: new threads get it at creation, older ones when a full read indexes them, and a start
that finds rows newer than the recorded watermark (written by a build without the index, or
just before a crash) drops the mark of those threads. Removed or retired rows leave entries that
only make the reader read further back. A tail that compaction would leave unchanged says
nothing about the rows before it, so the reader keeps reading. It falls back to the full read for
imported provider turns, which display in time order rather than log order, and when it would
read the whole log anyway; that read also saves the replay older pages are cut from. The
reader saves no replay itself: the first older page compacts the whole log once.
On the 10,375-event benchmark a cold newest page takes about 9 ms instead of about 40 ms.

**Streamed turn diffs are stored only when they change.** Providers can resend the same
working-tree diff many times during one turn. The orchestrator skips an identical repeat for the
running turn; the latest stored diff is unchanged.

|             | Windows                     | macOS                                      |
| ----------- | --------------------------- | ------------------------------------------ |
| DB + logs   | `%APPDATA%\TasteCode\`      | `~/Library/Application Support/TasteCode/` |
| User config | `%USERPROFILE%\.tastecode\` | `~/.tastecode/`                            |
| Credentials | Credential Manager          | Keychain                                   |

On first use, TasteCode moves legacy Personal Harness files into these locations without
overwriting an existing TasteCode file.

Config is human-readable and hand-editable on purpose. It is never where secrets go.

History retention is user controlled. The local `history` command reports storage size,
exports records, previews eligible closed tasks, and archives them before explicit cleanup.
Cleanup retains active tasks and private checkouts, then reclaims unused database pages.
There is no automatic history expiry. Explicit compaction also removes streamed text fragments
that a later completed event of the same item already holds in full; replay reads the completed
text, so transcripts stay identical. This maintenance command is the only path that removes
event rows without removing their task. See [History maintenance](./HISTORY.md).

Checkpoint and undo commits have database-scoped Git refs. Worktree cleanup combines all
retained commits by Git common directory before removing unused refs. Its identity is the
filesystem-native canonical path, so Windows long paths and 8.3 aliases share one retained-commit
set. Resolution errors propagate and separate repositories remain distinct. Restore and branch
switch guards instead use the canonical checkout directory: separate worktrees can work
independently, while tasks sharing a checkout cannot restore files during another turn or
while its process is still stopping. An isolated start receives its base ref directly.

`ProviderControls` owns provider-specific account, login, usage, MCP and skill behavior.
Shared orchestration reads declared capabilities and merges shared local configuration.
Settings views renew 60-second notification leases; one read cannot hold a control process
for the whole app lifetime. Usage-limit reads are cached per provider for 60 seconds and shared
by concurrent callers. A turn's usage update, a sign-in change or a reset marks them stale; so
does an account read that reports a different account, which is how a sign-in or switch made in
the provider's own CLI reaches the app. An account without plan limits keeps its "unavailable"
answer for 30 minutes instead, through usage updates: spending usage cannot give it limits, and
Claude scans its local transcripts for up to a minute to say so. Only an account change or a
reset discards that answer early. Failed reads are never cached.
Change notifications to clients are coalesced to one leading and one trailing notice per
provider every 30 seconds. Repeated reads, such as switching threads, reuse the cached result
until something changes instead of starting a limit-reading process each time.
Background writing (chat titles, commit messages) reads only the sources its model choice
needs: a manual target alone, otherwise Claude Code, then Codex, then Grok, and every source
only for the cheapest-model fallback. Automatic writing prefers Claude Code's newest Haiku at
medium effort, then a Codex subscription's newest Luna at medium, then Grok 4.6 at low. Each source's account and model read is cached for 60 seconds and
shared with the Settings listing; a sign-in change or harness edit drops them. Reading every
source per task was rejected: it started six vendor processes per new chat.
`ThreadController` owns web transcript, replay, queue, submission
and draft state, while the frame store still batches streamed deltas for React.

_Rejected:_ JSONL files (we'll _read_ Claude Code's, but no indexing/transactions/search) ·
libsql/Turso (sync story we don't need yet) · SQLite in the renderer (source of truth in the
most disposable process) · whole-DB encryption (the DB holds no credentials by policy).

---

### Direct API request retention

Removed with API connections on 2026-10-20.

### One text, one ceiling; one event, one frame

Every kind of text an item can carry has a ceiling in `packages/contracts/src/item-limits.ts`,
applied by `item-output-bounds.ts` before the log and the wire, and read by the renderer from the
same table: 64 KiB of machine output, 1 MiB of the agent's message and of a diff, 256 KiB of its
plan (an item, or the steps of a `plan.updated`) and 256 KiB of its reasoning. A text over its
ceiling keeps its start and its end with a line saying how much was dropped. The plan and the
reasoning are drawn as a document behind a disclosure and every replay pays for each character,
so they got a quarter of a message. What the person sends is the one text that is never cut:
above 256 KiB the prompt box refuses to send and offers to move the text into a file, and
`thread.sendTurn` answers `bad_request` with a catalog `key` and `params`, so the screen says it
in the reader's language and the socket stays open.

No event is sent or stored above 4 MiB serialized, whatever its kind (`fitEvent`): long strings are
cut, largest first, until it fits. The push channel closes a socket sent a frame over 8 MiB, and a
client that reconnects reads the log and meets the same frame again, so the bus sends such a frame
cut to fit with its own sequence and `seq`; one that cannot be cut is left out and the sequence it
used shows the client a gap, which makes it read the log again. A chat stored before these
ceilings is cut as it is read (`boundStoredEvent`, in the store's parse and in a saved replay);
the database is never rewritten, and the full text stays in the log.

_Rejected:_ cutting what the person sends (a prompt that silently loses its tail is worse than a
refusal) · terminating the socket and letting the client reconnect (it loops) · rewriting old rows
(a migration over a log of hundreds of thousands of events for a display problem) · one ceiling for
every kind (a plan nobody reads at 1 MiB, a diff somebody does).

### Provider processes an app crash leaves behind

On Windows Node ends its direct children when it dies (libuv's job object, which lets a child's own
children out), so a `.cmd` shim goes and the provider CLI behind it runs on with its memory, its
files and its MCP servers; nothing used to end it. `spawnOwned` (every provider, `spawnCli`
included) tells `packages/proc/src/child-registry.ts` about each child that lives past 1.5 s;
the registry writes it and everything below it, as the system reports them (pid, own start time,
executable, and the app process that started them), to `child-processes.json` beside the database
(atomically; one file per data folder; a damaged file or another user's is ignored). The server
reads it before any provider starts (`orphaned-children.ts`, off the port's path) and ends an entry
and its tree only while its pid still has that start time and that executable and the app that
wrote it is gone; anything else is dropped, never ended. A child that ends takes its entries out.
A crash in the first 1.5 s of a child is not covered, and the registry costs one process list (a
PowerShell start, about 0.4 s) per provider start and per start after a crash.

Terminals are written the same way: `terminal.ts` hands the registry the pid of each pty's process
(`trackOwnedProcess`) and takes it out when the pty exits. On Windows that pid is the shell itself
(`cmd.exe`, a child of the server like the console host `conhost.exe` beside it), so the entry
holds the shell and whatever runs under it when it is written; the console host is the system's
and is not written. Measured with node-pty 1.2.0-beta.15: when the server is killed, the shell, its
ordinary children and the console host all die with it (the job object); what survives is a
process that broke away (a detached daemon a command started), whose parent link is gone and which
no entry names. So a terminal entry matters when a shell outlives the server, and then the next
start ends the shell and its whole tree, the long job the person left running included.

_Rejected:_ a Windows job object (no way to create one from plain Node, a native module is
off the table, and a PowerShell helper per spawn costs more than the list) · a watcher process that
ends the tree the moment the app dies (works, costs a process per app, left to the owner) · ending
by pid alone, or by parent link alone (pids are reused at once on Windows) · writing every child,
`git status` included (a file write per command).

## Long threads must feel instant

Threads exceed 200 messages of streamed markdown, code, diffs and tool output. This is the
hardest problem in the client and it decides whether the app feels premium or cheap.

Agent chat is harder than normal chat because **rows resize hundreds of times per turn while
streaming** — naive virtualization re-measures on every delta and the viewport walks upward.
That's the classic AI-chat scroll bug. Plus: rows are huge and heterogeneous, highlighting is
expensive, markdown arrives incomplete, and history is prepended.

The rules that solve it:

1. **End-anchored virtualization.** TanStack Virtual with `anchorTo: 'end'`, stable item
   keys (never index), cached size estimates. Follow-on-append **switches off the moment the
   user scrolls away**, with a "jump to latest" affordance.
2. **A completed message is immutable and renders exactly once.** Streaming deltas append to
   a separate live-tail component — the only thing re-rendering during a turn. No context, no
   store subscription, no inline lambdas inside the message subtree.
3. **Two-phase code blocks.** Cheap CSS treatment instantly, Shiki from a worker swapped in
   after, identical layout box so nothing reflows. Only the languages we load; cache by
   content hash. Grammar regexes scan one-byte copies of Latin-1 lines: a line cut from a
   reply or patch with one em dash anywhere is stored two bytes wide, and V8 tokenized it
   about half as fast in Electron 43. Copying whole blocks was rejected because one wide
   character inside the block defeats it.
   Completed fences above 32 KiB keep all source lines mounted while decorative token DOM
   is applied in 12-line animation-frame batches. Repeated foreground colors inherit from
   their line; tokens with attributes or other styles retain their elements. Simple complete
   fences skip Markdown/HTML AST construction; complex fences retain Streamdown parsing.
   Plain chunks reserve their full line height in one layout box, and adjacent inherited
   text shares a text node to avoid unnecessary initial layout and removal work.
   Large code containers override Streamdown's block-level content visibility so
   offscreen token batches also lay out incrementally rather than all at first scroll.
   Whole-block token commits exceeded the frame budget. CSS layout containment was rejected
   because it increased theme compositing cost; clipping or dropping source was rejected
   because selection, copy, horizontal scrolling and accessibility must remain intact.
4. **Batch deltas on rAF** (~16ms). Imperceptible, an order of magnitude fewer renders.
5. **Closed activity owns no detail DOM.** Command and tool details mount when their
   disclosure opens, stay mounted for the closing animation, then unmount. Collapsed output
   must not consume layout, DOM, parsing, or image-preview work: a closed row decides that it
   can open from its arguments, or from its output once per item, and builds its detail only
   when it mounts.
6. **Collapse huge blocks by default** — better UX and better performance.
7. **Never mount full history on open.** A cold open asks for the newest ten turns; twenty more
   load when the reader nears the top, and the row being read keeps its position as they are
   prepended. Find in chat and search jumps need every turn, so they fetch the rest in one
   unpaged read instead of searching only what is loaded. A failed read says so and waits for
   Retry. Closing find only drops that read's reply: a transport request cannot be aborted, so
   the server still sends the whole history and the renderer still parses and validates it
   (about 133 ms for a 4.76 MB chat in the browser) before discarding it.
8. **Partial background caches do not grow a second transcript.** At most eight inactive
   workers keep a hot transcript, with 256 items or 256 KiB per worker and 512 items or 512 KiB
   in total. Older or larger workers retain only lifecycle and attention state. Their transcript
   reloads from the local event log when selected.
9. **Completed inactive histories have a shared text budget.** The three-entry / 3,000-item LRU
   also caps retained strings at 8 Mi characters (at most 16 MiB of UTF-16 payload). An oversized
   completed transcript leaves the cache and reloads from the local event log when selected, so
   one huge reply cannot consume idle memory.

### Budgets — local release gates

|                                         |                          |
| --------------------------------------- | ------------------------ |
| Open a 500-message thread → first paint | < 150 ms                 |
| Scroll a 500-message thread             | 60 fps, no frame > 32 ms |
| Main-thread work per delta batch        | < 4 ms                   |
| Cold start → interactive                | < 1.5 s                  |
| Switch sessions                         | < 100 ms                 |
| Idle memory, 5 sessions                 | < 500 MB                 |
| Collapsed 300-call activity, 37.5 MiB   | < 8 MiB, < 200 elements  |
| Same activity, reopened and closed      | < 2 MiB retained         |

Build a 1,000-message fixture thread early, keep it in the repo, run every UI PR against it.
**A PR that regresses a budget doesn't merge.**

The [local Electron gate](./PERFORMANCE-CHECKS.md) measures real visible rows, repeated
startup and stable idle memory. Reports also keep transient memory peaks. Hosted CI stays
manual.

---

## Dashboard design references (nightly)

**Dashboards run as tasteskill app screens since 2026-10-25 (owner request).** A dashboard brief
is dealt an app sheet from the tasteskill v2.5 app library bundled in
`packages/design-agent/references/app-screens/` (styles, shells and screen patterns as data, no
images) and every phase works from that sheet and quoted sections of tasteskill's app-screen
chapter; see [DESIGN-REFERENCES.md](./DESIGN-REFERENCES.md). `APP_SCREENS_ENABLED` in
`packages/design-agent/src/app-screen-mode.ts` is the switch. The sheet is dealt by the server
and persisted with the run, so every provider gets the same deal and nothing depends on running
tasteskill's scripts inside a provider; the kit files reach the provider through `.taste/app-kit/`
in the workspace, which every provider can read with ordinary file tools.

_Rejected:_ running tasteskill's `draw.mjs` and `inspect.mjs` inside the provider (needs Node,
Chrome and shell access in every provider, and the deal would not survive a resume) · inlining
`charts.js` into the Build prompt (the model would have to retype 60 KB).

**The dashboard image catalog has been parked since 2026-10-16 (owner decision).** The dashboard
asset set is not good enough to ship. Its switch, `DASHBOARD_REFERENCES_ENABLED` in
`packages/design-agent/src/dashboard-references.ts`, keeps every dashboard catalog unloaded and
no dashboard image deck is sampled. While it is off, the website Page protocol does not offer the
`operate_monitor` mode or the `dashboard` family, and an `operate_monitor` plan on a website run
routes nothing into dashboard prompts; app screens reach theirs through the dealt sheet and the
dashboard brief. With both switches off, `isDashboardBrief` routes nothing either, and a dashboard
request becomes a normal website run. The 400 dashboard WebPs,
their catalog and provenance left the packaged library (about 42 MB) and stay in git history. The
history below describes the parked image path.

Nightly dashboard support is integrated through
[PR #1393](https://github.com/Leonxlnx/tastecode/pull/1393), following
[PR #1392](https://github.com/Leonxlnx/tastecode/pull/1392) merged at `17aa22a3`.
The integrated source includes main through `3e67df35`, retaining the complete nightly provider
roster and usage history. Windows cleanup
[PR #1394](https://github.com/Leonxlnx/tastecode/pull/1394), task authorization
[PR #1403](https://github.com/Leonxlnx/tastecode/pull/1403), and checkpoint identity
[PR #1404](https://github.com/Leonxlnx/tastecode/pull/1404) are merged on main; the API connection
contract in [PR #1395](https://github.com/Leonxlnx/tastecode/pull/1395) is merged on nightly.
This feature is not a public-beta release.
The asset import is complete: a separate dashboard catalog and provenance record contain
200 reviewed generated desktop/mobile pairs, stored as 400 WebPs. The existing 172 website
references and 316 WebPs are unchanged. The combined bundle has 372 references and 716 WebPs:
344 paired references and 28 desktop-only references.
Sampling chooses a layout group uniformly, then one variant within that group, so retries do
not give a composition extra votes. Since 2026-10-12 the dashboard draw is uniform only among the
screens whose domain, tags, product name, cue or motifs best match the request's domain words,
and over all screens when nothing matches. One complete app-shell reference preserves navigation,
content density and responsive hierarchy. The compiled default-bundle checks passed for all
200 selectable dashboard groups, saved-deck roundtrips and both image attachments. All 400
dashboard WebPs have unique matching hashes and valid viewport metadata. The catalog differs
from the private import only in formatting and is deeply JSON-equal; the other 401 imported
files are byte-identical. Website selection still yields 14 website-only references, and
marketing-page classification checks pass.

Briefing distinguishes an operating interface from a marketing page about a dashboard product.
The former plans `operate_monitor` views with functional filters, sorting, tabs, navigation,
drawers and charts. Motion follows those state changes, with keyboard access, focus restoration
and reduced-motion equivalents. Native inline chart SVG in reference-bound dashboard views and
visibly identified demo values avoid website-only validation blockers; asserted product claims
still require evidence. Website hero entrances and scroll reveals keep their existing behavior.

Since 2026-10-12, every phase keeps one design language per page: references set each
section's composition, and one anchor reference sets the type, palette, radius, spacing and
component language. See [One design language per page](./DESIGN-REFERENCES.md#one-design-language-per-page).
Dashboards use one family plus optional monospace data, taken from the anchor screen's own
type, and never add a display face. They are reviewed for shell
consistency, data density, table and chart readability, visible control states and focus.
A site, one-pager or Webseite about an app classifies as a website.

Reference-driven Design requires the session's declared image input capability. Unsupported
sessions reject before inference or persisted Design state; ordinary coding remains available.
The workflow never substitutes an unannounced text-only build for the requested image copying.

Fresh [Windows verification](https://github.com/Leonxlnx/tastecode/actions/runs/37228489532)
passed lint, typecheck, the full test command and build at exact feature source
`edc92ea9c82c40b1c7e0b6f12aa329b2fa05f79e`: 4,445 passed, 18 existing skips, zero failures.
Desktop tests ran: 368 passed and 10 existing skips, included in that total. No deadlines were
overridden. Follow-up integration changes only documentation and recorded screenshots.
Historical local verification at `0ccdb67d` passed all four gates with 4,432 passed and 18 skips.
Thirty-six focused cases cover nine provider IDs: 18 synthetic-vision website/dashboard flows
and 18 capability-rejection/ordinary-follow-up cases.

The isolated browser smoke passed at `a02c6ab3490e55003aa2a95f977b8ccca690bea9`, exercising the
former direct-API runtime (removed 2026-10-20) against a synthetic endpoint. Two unsupported Design attempts made no
additional inference requests and persisted no Design runs. Ordinary follow-ups retained both
API identities, models, messages and tool context across an owned server restart. Four completed
synthetic turns used six fake API requests and 72 synthetic tokens. All 14 source/build
fingerprints stayed stable during the run; the queue was empty, no browser exceptions occurred,
and owned processes were stopped. This proves capability rejection and ordinary API recovery.
Live image-capable dashboard generation, packaged Electron, macOS and real-keyring acceptance
remain unverified. Synthetic flows and a separate external demo do not replace these checks.

_Rejected:_ composing dashboards from marketing sections, treating generation retries as new
layout votes, or requiring static screenshots in place of working native charts and controls.

---

## One design language per generated page (nightly)

Owner decision, 2026-10-12: a generated website must not switch design language between sections.
Randomness stays, but one page keeps one type system (at most two families), one palette, one
radius and spacing scale, and one button, card and label language. This supersedes the uniform,
site-agnostic website sampling from
[PR #1176](https://github.com/Leonxlnx/tastecode/pull/1176), which drew every layout family
independently and put about eleven source sites into one 14-reference deck.

The first drawn section, normally the hero, is still chosen uniformly by group and becomes the
anchor; its source host defines the page's language. Each later section takes the requested
family from the anchor site, then from the three most similar close sites in the optional per-site
`style-profiles.json` (style score at least 10 of 14). Only a sparse family, one with fewer than
ten composition groups, may then borrow a compatible family from those sites; otherwise the
section comes from the uniform pool the family always used. The requested family always beats
borrowed geometry, and the minimum score stops a few broadly similar sites from supplying a rare
section to most pages. Profile outliers never anchor a page or count as their site's language. A
missing or malformed profile file degrades to same-site and uniform sampling rather than failing a
run. Saved deck entries record `site` and `role`; the anchor also carries a one-line `style`
summary. Older decks parse unchanged. Details are in [DESIGN-REFERENCES.md](./DESIGN-REFERENCES.md).

Brand derives the language from the anchor and at most two same-site references instead of the
whole deck, and every phase is told that the anchor sets type, palette, radii, spacing, controls
and surfaces while other references give composition only. Review then audits the generated source
and adds bounded, non-fatal findings for fonts outside the brand and radius drift
([DESIGN-AGENT.md](./DESIGN-AGENT.md)). The audit is a Review finding rather than a hard source
gate because Build and Repair get one correction each, so a false positive must never fail a run.

_Rejected:_ narrowing by style tags (the catalogs carry almost none), drawing every section from
the anchor site only (most sites lack some families, which would shrink the deck), a uniform
draw per family (the source of the mixed-language pages), the anchor site's compatible family
before a close site's own family (it put other section types into a third of FAQ slots), and
similar sites with no minimum score or only half the maximum (a few broadly similar sites then
supplied a rare section, such as the library's only stats section, to a third or more of pages).

---

## Layout

```
apps/      desktop (Electron shell) · web (the UI) · server (core) · marketing
packages/  contracts · domain · adapters-* · ui · design-agent · shared
tools/     scripts (Node, never .sh)
```

`packages/contracts` is the most carefully reviewed package in the repo — a change there is
a breaking change for three clients. Adding an engine is a new `adapters-*` package plus a
registry entry, which is deliberately a good first outside contribution.

---

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-20 | Removed direct API connections; a user's own key runs through OpenCode's sign-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-16 | Sent user-initiated feedback to the team's Trecko inbox through the local server; the inbox key stays in the server process and out of git.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-16 | Parked dashboard references behind `DASHBOARD_REFERENCES_ENABLED`; dashboard requests build as websites and the 42 MB dashboard set left the package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-14 | Read cold newest history pages from the end of the event log, checked against a derived per-thread index of first turn and item rows (#957).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-14 | Seeded checkpoint snapshots from the checkout's own index so a turn start re-reads only changed files instead of hashing every tracked file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-14 | Kept a provider's "unavailable" limits answer for 30 minutes through usage updates, so Claude's minute-long transcript scan no longer reruns after every turn.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-12 | Sample website references from one anchor site, then similar profiled sites, to keep one design language per page; prefer dashboards matching the requested domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-11 | Paged thread history by whole turns over the cached compact replay instead of sending the full replay on every open; a store-level reader for cold opens remains (#957).                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-04 | Added nightly dashboard references and image-capability preflight; Windows gates passed. Live-vision and packaged acceptance remain separate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-04 | Canonicalized checkpoint Git storage with native filesystem paths so Windows long/8.3 aliases retain the combined refs of linked worktrees (#1404).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-03 | Trust exact WebSocket origins only; keep isolated checkouts and pasted files out of the OS temp folder; bind pull-request reviews and merges to the inspected head commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-03 | Removed every provider except Codex, Claude Code and Grok from `main`; the rest, including the direct API runtime, live only on `nightly`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-03 | Find desktop updates through the release feed, resume interrupted downloads, keep background failures quiet, and check again after the machine wakes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-09-30 | Batch large completed-code token rendering and inherit repeated foregrounds without reducing the source workload; enforce the frame budget against native renderer traces.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-09-22 | Select desktop releases by semantic version, preventing a later-published older platform proof from hiding the current release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-28 | Initial decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-01 | Defined ownership and precedence for project-scoped MCP configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-02 | Added Codex-backed voice dictation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-03 | Added the provider-neutral direct API runtime decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-06 | Replaced the Electron target with a staged Rust + GPUI migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-12 | Added user-owned, protocol-compatible harness commands and Pi RPC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-12 | Defined provider-neutral ephemeral Side chat sessions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-12 | Standardized Electron browser previews on sandboxed `<webview>` guests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-14 | Removed phone and remote-client support from active product scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-14 | Routed project-enabled Grok MCP sessions through ACP stdio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-15 | Archived the Rust + GPUI rewrite and restored Electron on `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-18 | Moved voice transcription from ChatGPT session reuse to explicit OpenAI API auth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-18 | Separated stable TasteCode ids from provider-native resume identities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | Bounded completed resumable adapter runtimes with a hardware-scaled warm LRU.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-21 | Made many-thread Inbox state sparse and status projection incremental.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | Materialized only current Inbox state instead of replaying every historic turn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-21 | Extended stale long-thread replay snapshots from only their new event tail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-21 | Added shared item, byte, and worker limits for background transcript caches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-21 | Bounded completed inactive transcript caches by retained string size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-21 | Deferred closed menu controllers and shared row context-menu listeners.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-21 | Released one-shot Codex control processes after a short idle window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-21 | Expired resumable thread processes after a bounded warm idle window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-21 | Limited runtime-retention sweeps to safe resumable idle processes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-21 | Removed full provider-control startup from cached, signed-in launches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | Indexed workspace review folders to bound large changed-file tree construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-22 | Applied the desktop-safe PATH to provider detection, CLI spawns, and the PTY.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-09-08 | Added checkpoint reachability and checkout guards, explicit history maintenance, provider controls, task-state ownership, bounded leases and local Electron performance gates.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-09-15 | Added authenticated repository and upload image previews, isolated SVG rendering, lazy loading, and byte-bounded caches for pull-request Markdown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-15 | Dropped the Claude Agent SDK's bundled per-platform CLI from the dependency graph and the desktop package; the adapter always spawns the user's `claude`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-09-18 | Added the beta 7 updater bridge and verified EXE/DMG transport, with two public assets from beta 8 and native installers retained.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-26 | Scanned one-byte copies of Latin-1 lines in every Shiki grammar pass, including the main-thread diff views.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-09-26 | Kept inline tool images out of Codex tool text and imported tool calls; the transcript never shows tool attachments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-09-26 | Let provider history reads skip turns already stored locally; the server drops their echoes anyway.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-26 | Cached usage-limit reads, skipped repeated turn diffs, bounded search-indexed tool output and disk replay snapshots, and folded completed deltas during compaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-26 | Loaded the desktop release updater as a lazy chunk and kept background throttling for browser guests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-11 | Kept closed activity rows from building their detail and gated a collapsed 300-call activity's heap locally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-11 | Ended a closed terminal's foreground job after a grace period, and a shell ignoring SIGHUP; background jobs stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-14 | Background writing reads only the model sources its choice needs, caches each source separately, and reuses Grok's sign-in `grok models` output for its model list.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-19 | Made Claude Code's newest Haiku at medium the automatic background model, ahead of Codex Luna, which moved from low to medium effort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-22 | Added phone access: a Noise IK link on the LAN or a tailnet, one-time pairing codes, a phone method allowlist, `projects.changed`, and the Expo + SwiftUI phone app.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-22 | Phone app screens moved from React-composed Expo UI to one SwiftUI hierarchy in Swift; TypeScript words the content and sends changed rows only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-23 | Each chat's setup moved from every client's own storage to the server (`thread.settings`); the desktop shares its hidden models.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-25 | Claude Code can also run through `claude -p` (stream-json, same protocol); engines declare `capabilities.runtimes`, the server keeps the choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-25 | Phone app screens moved from SwiftUI to UIKit view controllers under one native view; Expo UI is no longer a dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-25 | Dashboards run again as app screens dealt from the bundled tasteskill v2.1.5 app library, without reference images; the dashboard image catalog stays parked.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-31 | Phone access became dev-only: offered only with `HARNESS_PHONE_ACCESS=1` (set by `pnpm dev`); other builds never open the phone port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-01 | Each build offers its edition's providers: release offers Claude Code, Codex, Grok, Cursor and Antigravity, dev every provider; missing means release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-06 | Kept the Browser's recently used pages in renderer storage, recorded only from tabs the user opened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-15 | A provider process that dies is classified once, in the orchestrator, from the adapters' own end sentences (`process-exit.ts`), into a `reason` on `thread.error` the renderer words with a Continue action; closing the app stops running turns like Stop and marks them; the quit asks first while chats work; a low memory warning (`system.memory`) reads free physical memory per tick while a turn runs and the commit charge only when that is low. Rejected: structured exit data from every adapter (eight edits for what one parser covers), auto-resuming after a crash, polling the commit charge on a timer. |
| 2026-11-15 | Pictures inside a saved transcript are kept as content-addressed files beside the pasted attachments; events carry the path, old inline pictures move out when the chat opens.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-16 | Gave the plan, the reasoning and the person's message a ceiling (256 KiB each; the message is refused, never cut), sent an event over the frame limit cut to fit instead of closing the socket, and wrote provider children to a registry the next start reads to end the ones a crash left behind.                                                                                                                                                                                                                                                                                                                       |
| 2026-11-16 | Linked the app to a Clube do Motion account (OAuth 2.1 public client, tokens in the credential store) and offered the Clube's MCP server to every chat through the app's own endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-16 | Added the Clube's sound library to Motion chats: agent tools to search and use one sound or track at a time into the project's `audio/clube/`, a line about it in the Motion session start, two Settings rows and a Sounds tab in the side panel.                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-16 | An installer asks the running app to quit (`--quit-for-install`, through the single-instance lock) and waits for an ordered quit with deadlines before replacing files, instead of ending its processes by force; a silent install never interrupts a working chat (exit code 10); the Windows Update button starts the installer after the app has shut down.                                                                                                                                                                                                                                                            |
| 2026-11-16 | Added the Clube's library tab to the side panel: search, records opened only on request, project and animation downloads confined to the chat's project with a job the page polls, Clube skills installed once through the skill catalog, covers and previews fetched by the server from the Clube's origin only.                                                                                                                                                                                                                                                                                                         |
