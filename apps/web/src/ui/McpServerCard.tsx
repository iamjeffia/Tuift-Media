import { useState, type ComponentType } from 'react'
import type { McpServer, McpTransport, ResultOf } from '@harness/contracts'
import {
  IconAlertTriangle as AlertTriangle,
  IconBrandAsana,
  IconBrandAws,
  IconBrandAzure,
  IconBrandCloudflare,
  IconBrandDiscord,
  IconBrandDocker,
  IconBrandDropbox,
  IconBrandFigma,
  IconBrandFirebase,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandGoogle,
  IconBrandGoogleDrive,
  IconBrandGoogleMaps,
  IconBrandMongodb,
  IconBrandNotion,
  IconBrandOpenai,
  IconBrandPaypal,
  IconBrandSentry,
  IconBrandSlack,
  IconBrandStripe,
  IconBrandSupabase,
  IconBrandTelegram,
  IconBrandTrello,
  IconBrandVercel,
  IconBrandYoutube,
  IconBrain,
  IconBrowser,
  IconCalendar,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconLoader2 as Loader,
  IconMail,
  IconSearch,
} from '@tabler/icons-react'
import { generatedAvatar } from '../generated-avatar.js'
import { t, useI18n, type MessageKey } from '../i18n/index.js'

type Inventory = ResultOf<'mcp.list'>
type IconComponent = ComponentType<{ size?: number; stroke?: number; 'aria-hidden'?: boolean }>

/**
 * Known server words and the mark each one wears. A word matches a whole
 * token of the server's id, name, host or command, never part of one.
 */
const KNOWN_ICONS = {
  github: IconBrandGithub,
  githubcopilot: IconBrandGithub,
  gitlab: IconBrandGitlab,
  figma: IconBrandFigma,
  notion: IconBrandNotion,
  slack: IconBrandSlack,
  stripe: IconBrandStripe,
  sentry: IconBrandSentry,
  supabase: IconBrandSupabase,
  vercel: IconBrandVercel,
  cloudflare: IconBrandCloudflare,
  discord: IconBrandDiscord,
  asana: IconBrandAsana,
  trello: IconBrandTrello,
  paypal: IconBrandPaypal,
  aws: IconBrandAws,
  azure: IconBrandAzure,
  firebase: IconBrandFirebase,
  mongodb: IconBrandMongodb,
  docker: IconBrandDocker,
  dropbox: IconBrandDropbox,
  telegram: IconBrandTelegram,
  youtube: IconBrandYoutube,
  openai: IconBrandOpenai,
  gdrive: IconBrandGoogleDrive,
  drive: IconBrandGoogleDrive,
  maps: IconBrandGoogleMaps,
  google: IconBrandGoogle,
  gmail: IconMail,
  mail: IconMail,
  email: IconMail,
  calendar: IconCalendar,
  postgres: IconDatabase,
  postgresql: IconDatabase,
  mysql: IconDatabase,
  sqlite: IconDatabase,
  redis: IconDatabase,
  database: IconDatabase,
  filesystem: IconFolder,
  files: IconFolder,
  memory: IconBrain,
  playwright: IconBrowser,
  puppeteer: IconBrowser,
  browser: IconBrowser,
  fetch: IconBrowser,
  search: IconSearch,
  brave: IconSearch,
  exa: IconSearch,
  tavily: IconSearch,
  docs: IconFileText,
  context7: IconFileText,
} satisfies Record<string, IconComponent>

function tokens(text: string | undefined): string[] {
  return text ? (text.toLowerCase().match(/[a-z0-9]+/g) ?? []) : []
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * The most specific words first: the id, the display name, the host, then
 * the command line. The first word with a known mark wins.
 */
export function serverIconWords(server: McpServer): string[] {
  const transport = server.transport
  return [
    ...tokens(server.id),
    ...tokens(server.displayName),
    ...(transport?.type === 'http' ? tokens(hostOf(transport.url)) : []),
    ...(transport?.type === 'stdio'
      ? [...tokens(transport.command), ...tokens(transport.args?.join(' '))]
      : []),
  ]
}

/** The mark a server wears, or `undefined` when it gets a monogram. */
export function knownServerIcon(server: McpServer): IconComponent | undefined {
  for (const word of serverIconWords(server)) {
    if (Object.hasOwn(KNOWN_ICONS, word)) return KNOWN_ICONS[word as keyof typeof KNOWN_ICONS]
  }
  return undefined
}

/** One letter or digit to stand for a server with no known mark. */
export function serverMonogram(server: McpServer): string {
  const text = (server.displayName ?? server.id).trim()
  return ([...text].find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '?').toUpperCase()
}

function McpServerIcon(props: { server: McpServer }) {
  const Known = knownServerIcon(props.server)
  if (Known) {
    return (
      <span className="mcp-card__icon" aria-hidden>
        <Known size={22} stroke={1.6} aria-hidden />
      </span>
    )
  }
  // The same tones the profile pictures take from a name, so one name keeps one colour.
  const tones = generatedAvatar(props.server.displayName ?? props.server.id)
  return (
    <span
      className="mcp-card__icon mcp-card__icon--monogram"
      style={{ background: tones.ground, color: tones.inks[0] }}
      aria-hidden
    >
      {serverMonogram(props.server)}
    </span>
  )
}

export type McpCardState =
  'disabled' | 'failed' | 'signin' | 'connecting' | 'connected' | 'idle' | 'unknown'

export const MCP_STATE_LABELS = {
  disabled: 'settings.mcpServerCard.state.disabled',
  failed: 'settings.mcpServerCard.state.failed',
  signin: 'settings.mcpServerCard.state.signin',
  connecting: 'settings.mcpServerCard.state.connecting',
  connected: 'settings.mcpServerCard.state.connected',
  idle: 'settings.mcpServerCard.state.idle',
  unknown: 'settings.mcpServerCard.state.unknown',
} satisfies Record<McpCardState, MessageKey>

/** What the card shows, from the server's own reports. A failure outranks a pending sign-in. */
export function mcpCardState(server: McpServer): McpCardState {
  if (!server.enabled) return 'disabled'
  if (server.startup?.state === 'failed') return 'failed'
  if (server.auth?.status === 'sign_in_required') return 'signin'
  switch (server.startup?.state) {
    case 'starting':
      return 'connecting'
    case 'ready':
      return 'connected'
    case 'stopped':
      return 'idle'
    default:
      return 'unknown'
  }
}

export function canHideInherited(capabilities: Inventory['capabilities']): boolean {
  return capabilities.hideInherited ?? (capabilities.add && capabilities.inventory)
}

export function serverName(server: McpServer): string {
  return server.displayName ?? server.id
}

export function transportLabel(transport: McpTransport | undefined): string {
  if (!transport) return t('settings.mcpServerCard.managed')
  return transport.type === 'http'
    ? transport.url
    : [transport.command, ...(transport.args ?? [])].join(' ')
}

/**
 * One MCP server as a card: its mark, name and origin, a status that changes
 * with the state and the controls that state allows.
 */
export function McpServerCard(props: {
  server: McpServer
  capabilities: Inventory['capabilities']
  providerName: string
  /** A change to this server is in flight. */
  busy: boolean
  /** A sign-in for this server is waiting on the browser. */
  signingIn: boolean
  onSignIn: () => void
  onToggle: () => void
  onEdit: (opener: HTMLButtonElement) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const { server } = props
  const auth = server.auth
  const inherited = server.scope === 'global'
  const needsOAuth =
    props.capabilities.startOAuth && auth?.status === 'sign_in_required' && auth.method === 'oauth'
  const canToggle =
    props.capabilities.remove &&
    ((!server.enabled && server.scope === 'project') ||
      (canHideInherited(props.capabilities) && server.scope === 'global'))
  // A server can report hundreds of tools; render them only once someone looks.
  const [toolsOpen, setToolsOpen] = useState(false)
  const canEdit = props.capabilities.update && server.scope === 'project' && server.transport
  const canRemove = props.capabilities.remove && server.scope === 'project' && server.enabled
  // Project servers are the page's own list; inherited ones sit under their section.
  const Name = inherited ? 'h3' : 'h2'
  const state = props.signingIn ? 'connecting' : mcpCardState(server)
  const working = props.busy || props.signingIn || state === 'connecting'
  const statusLabel = props.signingIn
    ? t('settings.mcpServerCard.waitingSignIn')
    : props.busy
      ? t('settings.mcpServerCard.updating')
      : t(MCP_STATE_LABELS[state])
  return (
    <article className="mcp-card" data-state={state} aria-busy={props.busy || undefined}>
      <McpServerIcon server={server} />
      <div className="mcp-card__main">
        <div className="mcp-card__head">
          <Name className="mcp-card__name">{serverName(server)}</Name>
          {/* Keyed by what it says, so a change of state fades in instead of snapping. */}
          <span className="mcp-card__status" key={statusLabel}>
            {working ? <Loader className="spinner" aria-hidden /> : <i aria-hidden />}
            {statusLabel}
          </span>
        </div>
        {inherited && !server.transport ? (
          server.description ? (
            <p className="mcp-card__detail">{server.description}</p>
          ) : null
        ) : (
          <p className="mcp-card__detail mcp-card__detail--code">
            {transportLabel(server.transport)}
          </p>
        )}
        {auth?.status === 'sign_in_required' && !needsOAuth ? (
          // No Sign in button would work here, so say where signing in happens.
          <p className="mcp-card__detail">
            {t('settings.mcpServerCard.signInElsewhere', { provider: props.providerName })}
          </p>
        ) : null}
        {server.startup?.state === 'failed' ? (
          <p className="mcp-card__detail mcp-card__detail--error" role="alert">
            <AlertTriangle size={13} aria-hidden />
            {server.startup.message}
          </p>
        ) : null}
        <details
          className="mcp-row__details"
          onToggle={(event) => setToolsOpen(event.currentTarget.open)}
        >
          <summary>
            {t('settings.mcpServerCard.counts', {
              tools: server.tools.length,
              resources: server.resources.length,
              templates: server.resourceTemplates.length,
            })}
          </summary>
          {!toolsOpen ? null : server.tools.length ? (
            <ul>
              {server.tools.map((tool) => (
                <li key={tool.name}>
                  <strong>{tool.title ?? tool.name}</strong>
                  {tool.description ? ` — ${tool.description}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('settings.mcpServerCard.noTools')}</p>
          )}
        </details>
      </div>
      <div className="mcp-card__actions">
        {needsOAuth ? (
          <button
            className="set-button"
            type="button"
            disabled={props.busy}
            onClick={props.onSignIn}
          >
            {props.signingIn ? <Loader className="spinner" aria-hidden /> : null}
            {t('settings.mcpServerCard.signIn')}
          </button>
        ) : null}
        {canToggle ? (
          <button
            className={`switch${server.enabled ? ' is-on' : ''}`}
            type="button"
            role="switch"
            aria-label={t(
              server.enabled
                ? 'settings.mcpServerCard.disableForProject'
                : 'settings.mcpServerCard.enableForProject',
              { name: serverName(server) },
            )}
            aria-checked={server.enabled}
            disabled={props.busy}
            onClick={props.onToggle}
          >
            <span className="switch__thumb" />
          </button>
        ) : null}
        {canEdit ? (
          <button
            className="set-button set-button--quiet"
            type="button"
            disabled={props.busy}
            onClick={(event) => props.onEdit(event.currentTarget)}
          >
            {t('settings.mcpServerCard.edit')}
          </button>
        ) : null}
        {canRemove ? (
          <button
            className="set-button set-button--danger"
            type="button"
            disabled={props.busy}
            onClick={props.onRemove}
          >
            {t('settings.mcpServerCard.remove')}
          </button>
        ) : null}
      </div>
    </article>
  )
}
