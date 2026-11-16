import './harness-shim.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App.js'
import { RendererErrorBoundary } from '../RendererErrorBoundary.js'
import {
  applyAccentPreference,
  applyBackdropPreference,
  applyFontPreference,
  applyTheme,
  readAccentPreference,
  readBackdropPreference,
  readFontPreference,
  readThemePreference,
  resolveTheme,
} from '../theme.js'
import { backdropColorScheme } from '../theme-colors.js'
import { applyDocumentLanguage } from '../i18n/index.js'
import { MotionStageSchema, ThreadErrorReasonSchema } from '@harness/contracts'
import { DemoTransport } from './demo-transport.js'
import '../styles/tokens.css'
import '../styles/app.css'
import './sandbox.css'

/**
 * The design sandbox: the real App in a normal browser, answered by an
 * in-memory server with dummy data. No desktop shell, no local server, no
 * provider and no subscription is involved. Start it with `pnpm sandbox` in
 * apps/web and open http://127.0.0.1:5420/sandbox.html.
 *
 * `?chat=<id>` opens that chat once the sidebar shows it, for example
 * `?chat=demo-focus-ring`. The ids are in demo-data.ts.
 */

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

// The same appearance start-up as main.tsx, so the sandbox opens in the theme,
// font and accent the user picked in it last time.
const appearanceMode = resolveTheme(readThemePreference())
const backdrop = readBackdropPreference(appearanceMode)
applyTheme(backdropColorScheme(backdrop) ?? appearanceMode)
applyBackdropPreference(backdrop)
applyFontPreference(readFontPreference(appearanceMode))
applyAccentPreference(readAccentPreference(appearanceMode))
applyDocumentLanguage()
document.documentElement.dataset['shell'] = 'web'

// `?usageReset=60&chat=demo-focus-ring` exercises a quota reset in sixty seconds.
const usageResetSeconds = Number(new URLSearchParams(window.location.search).get('usageReset'))
// `?motion=demo-focus-ring:motion` makes that chat a Motion chat at the stage `motion`.
const [motionChat, motionStage] = (
  new URLSearchParams(window.location.search).get('motion') ?? ''
).split(':')
// `?cutShort=demo-focus-ring:process_memory` ends that chat's last turn for that reason.
const [cutShortChat, cutShortCode] = (
  new URLSearchParams(window.location.search).get('cutShort') ?? ''
).split(':')
const cutShortReason = ThreadErrorReasonSchema.safeParse({
  code: cutShortCode,
  ...(cutShortCode === 'process_memory'
    ? { certainty: 'likely', exitCode: 3221226505 }
    : cutShortCode === 'process_signal'
      ? { signal: 'SIGKILL' }
      : cutShortCode === 'process_provider_error'
        ? { message: 'Credit balance is too low' }
        : {}),
}).data
const transport = new DemoTransport({
  ...(cutShortChat && cutShortReason ? { cutShortChats: { [cutShortChat]: cutShortReason } } : {}),
  ...(usageResetSeconds > 0 && Number.isFinite(usageResetSeconds)
    ? { usageResetMs: Math.min(usageResetSeconds, 604_800) * 1000 }
    : {}),
  ...(motionChat
    ? { motionChats: { [motionChat]: MotionStageSchema.catch('idea').parse(motionStage) } }
    : {}),
})
Object.assign(window, { sandboxTransport: transport })
// `?memory=low` pushes the low memory warning, as the server does once per episode.
if (new URLSearchParams(window.location.search).get('memory') === 'low') {
  const GIB = 1024 ** 3
  setTimeout(
    () =>
      transport.server.announce('system.memory', {
        state: 'low',
        committedPercent: 94,
        consumers: [
          { name: 'After Effects', bytes: 9.2 * GIB },
          { name: 'TUIFT Code', bytes: 3.1 * GIB },
        ],
      }),
    1500,
  )
}

// `?startup=restored` or `?startup=empty` pushes the notice the server sends after it put a
// damaged database right.
const startup = new URLSearchParams(window.location.search).get('startup')
if (startup === 'restored' || startup === 'empty') {
  setTimeout(
    () =>
      transport.server.announce('server.startupNotice', {
        notice: {
          kind: 'database.restored',
          at: Date.now(),
          backupAt: startup === 'restored' ? Date.now() - 20 * 60 * 60 * 1000 : null,
          asidePath: 'C:/Users/you/AppData/Roaming/TUIFT Code/tastecode.db.damaged-20261116-081500',
        },
      }),
    1500,
  )
}

createRoot(root).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App transport={transport} />
    </RendererErrorBoundary>
    <div className="sandbox-badge" role="note">
      Sandbox · dummy data
    </div>
  </StrictMode>,
)

const requestedChat = new URLSearchParams(window.location.search).get('chat')
if (requestedChat) openChatWhenListed(requestedChat)

/**
 * Clicks the chat's sidebar row once it renders. Start-up can still move to a
 * new chat after the list first appears, so it clicks again until the row has
 * stayed active for a second, and gives up after ten seconds.
 */
function openChatWhenListed(id: string): void {
  const selector = `[data-archive-session-id="${CSS.escape(id)}"]`
  const startedAt = Date.now()
  let clickedAt = 0
  const attempt = () => {
    const row = document.querySelector(selector)
    const active = row?.classList.contains('is-active') === true
    if (active && Date.now() - clickedAt > 1_000) return
    if (row && !active && Date.now() - clickedAt > 400) {
      row.querySelector<HTMLButtonElement>('button.sess')?.click()
      clickedAt = Date.now()
    }
    if (Date.now() - startedAt < 10_000) window.setTimeout(attempt, 100)
    else console.warn(`[sandbox] chat ${id} did not open from the sidebar`)
  }
  attempt()
}
