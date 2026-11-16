import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { McpServer, McpServerConfig, ProviderId, ResultOf } from '@harness/contracts'
import { McpServerConfigSchema, McpTransportSchema } from '@harness/contracts'
import { IconPlugConnected as PlugConnected, IconPlus as Plus } from '@tabler/icons-react'
import { useI18n } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import { useProviderWatch } from '../provider-watch.js'
import { isComposingKey } from '../shortcuts.js'
import { AppSelect } from './AppSelect.js'
import { cachedInventory, inventoryChanged, loadInventory } from './composer-inventory.js'
import { McpServerCard, canHideInherited, serverName } from './McpServerCard.js'
import { Skeleton, SkeletonStatus } from './Skeleton.js'
import {
  SettingsEmpty,
  SettingsNotice,
  SettingsPage,
  SettingsSection,
} from './settings/SettingsLayout.js'
import '../styles/mcp-settings.css'
import '../styles/switch.css'

type Inventory = ResultOf<'mcp.list'>
type Editor = {
  mode: 'add' | 'edit' | 'hide'
  id: string
  displayName: string
  transport: string
  opener: HTMLButtonElement
}
type OAuthCompletion = {
  serverId: string
  loginId: string
  success: boolean
  error: string | null
}
type PendingOAuth = {
  serverId: string
  loginId: string | undefined
  completion?: OAuthCompletion
}
type Context = { transport: Transport; provider: ProviderId; projectPath: string | undefined }

/**
 * The last list this window saw for the provider and project, from this page
 * or the composer's `@` menu. Each list request can wait on the provider:
 * Codex starts its app-server, Claude Code and Grok start an agent for a
 * project without a chat. The page opens on this answer and asks again behind it.
 */
function lastInventory(context: Context): Inventory | undefined {
  if (!context.projectPath) return undefined
  return cachedInventory(context.transport, 'mcp', {
    provider: context.provider,
    projectPath: context.projectPath,
  })
}

export function McpSettings(props: {
  transport: Transport
  provider: ProviderId
  providerName: string
  providers?: Array<{ provider: ProviderId; providerName: string }>
  projectPath: string | undefined
  projectName: string | undefined
}) {
  const { t } = useI18n()
  const providers = props.providers?.length
    ? props.providers
    : [{ provider: props.provider, providerName: props.providerName }]
  const initialProvider =
    providers.find((option) => option.provider === props.provider) ?? providers[0]!
  const [provider, setProvider] = useState(initialProvider.provider)
  const availableProviders = providers.map((option) => option.provider).join('\0')

  useEffect(() => {
    if (availableProviders.split('\0').includes(provider)) return
    setProvider(initialProvider.provider)
  }, [availableProviders, initialProvider.provider, provider])

  const selected = providers.find((option) => option.provider === provider) ?? initialProvider
  return (
    <ProviderMcpSettings
      key={selected.provider}
      {...props}
      provider={selected.provider}
      providerName={selected.providerName}
      providerPicker={
        providers.length > 1 ? (
          <div className="mcp-settings__provider">
            <span>{t('settings.mcp.provider')}</span>
            <AppSelect
              value={selected.provider}
              options={providers.map((option) => ({
                value: option.provider,
                label: option.providerName,
              }))}
              onChange={setProvider}
              ariaLabel={t('settings.mcp.providerLabel')}
              className="mcp-settings__provider-select"
              align="right"
            />
          </div>
        ) : null
      }
    />
  )
}

function ProviderMcpSettings(props: {
  transport: Transport
  provider: ProviderId
  providerName: string
  projectPath: string | undefined
  projectName: string | undefined
  providerPicker?: ReactNode
}) {
  const { t } = useI18n()
  useProviderWatch(props.transport, props.provider, props.projectPath, 'mcp')
  const [inventory, setInventory] = useState(() => lastInventory(props))
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<Editor>()
  // Per id: one row settling must not unlock another row still in flight.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  // The server whose sign-in waits on the browser, for its card's status.
  const [signingIn, setSigningIn] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const inventoryContext = useRef<Context | undefined>(
    inventory
      ? { transport: props.transport, provider: props.provider, projectPath: props.projectPath }
      : undefined,
  )
  const errorContext = useRef<Context | undefined>(undefined)
  const pendingOAuth = useRef<PendingOAuth | undefined>(undefined)
  const activeContext = useRef({
    transport: props.transport,
    provider: props.provider,
    projectPath: props.projectPath,
  })
  activeContext.current = {
    transport: props.transport,
    provider: props.provider,
    projectPath: props.projectPath,
  }
  const isCurrentContext = () =>
    activeContext.current.transport === props.transport &&
    activeContext.current.provider === props.provider &&
    activeContext.current.projectPath === props.projectPath

  // Generation counter: a slow reply from a previous project must not land
  // on top of the current one's list (or arrive after unmount).
  const refreshGeneration = useRef(0)
  useEffect(
    () => () => {
      refreshGeneration.current += 1
    },
    [],
  )

  /**
   * Opening the page joins a list already on its way (the composer's, say). A
   * change, a sign-in or a reconnect may postdate that one, so those ask anew.
   */
  const refresh = useCallback(
    async (join = false) => {
      if (!props.projectPath || !isCurrentContext()) return
      const context = {
        transport: props.transport,
        provider: props.provider,
        projectPath: props.projectPath,
      }
      const place = { provider: props.provider, projectPath: props.projectPath }
      const generation = ++refreshGeneration.current
      setLoading(true)
      try {
        if (!join) inventoryChanged(props.transport, ['mcp'], place)
        const inventory = await loadInventory(props.transport, 'mcp', place)
        if (refreshGeneration.current !== generation || !isCurrentContext()) return
        inventoryContext.current = context
        errorContext.current = undefined
        setInventory(inventory)
        setError(undefined)
      } catch (cause) {
        if (refreshGeneration.current !== generation || !isCurrentContext()) return
        errorContext.current = context
        setError(message(cause))
      } finally {
        if (refreshGeneration.current === generation && isCurrentContext()) setLoading(false)
      }
    },
    [props.transport, props.provider, props.projectPath],
  )

  const completeOAuth = useCallback(
    (result: OAuthCompletion) => {
      pendingOAuth.current = undefined
      setSigningIn(undefined)
      setBusy(without(result.serverId))
      if (result.success) {
        setNotice(t('settings.mcp.signInDone'))
        setError(undefined)
        void refresh()
      } else {
        setNotice(undefined)
        setError(result.error ?? t('settings.mcp.signInFailed'))
      }
    },
    [refresh, t],
  )

  useEffect(() => {
    const context = {
      transport: props.transport,
      provider: props.provider,
      projectPath: props.projectPath,
    }
    // The list this window last saw here shows at once; the read below replaces it.
    const last = lastInventory(context)
    setInventory(last)
    inventoryContext.current = last ? context : undefined
    errorContext.current = undefined
    setError(undefined)
    // "Server added." must not survive into an unrelated project's panel.
    setNotice(undefined)
    setEditor(undefined)
    pendingOAuth.current = undefined
    setSigningIn(undefined)
    setBusy(new Set())
    if (!props.projectPath) {
      setLoading(false)
      return
    }
    void refresh(true)
    const offOAuth = props.transport.on('mcp.oauth', (result) => {
      if (result.provider !== props.provider || result.projectPath !== props.projectPath) return
      const pending = pendingOAuth.current
      if (pending) {
        if (pending.serverId !== result.serverId) {
          if (result.success) void refresh()
          return
        }
        if (pending.loginId === undefined) {
          pending.completion = result
          return
        }
        if (pending.loginId !== result.loginId) {
          if (result.success) void refresh()
          return
        }
      }
      completeOAuth(result)
    })
    const offChanged = props.transport.on('mcp.changed', ({ provider, projectPath }) => {
      if (provider === props.provider && projectPath === props.projectPath) void refresh()
    })
    let reconnecting = props.transport.state === 'reconnecting'
    const offState = props.transport.onState((state) => {
      if (state === 'reconnecting') reconnecting = true
      else if (state === 'open' && reconnecting) {
        reconnecting = false
        void refresh()
      }
    })
    return () => {
      offOAuth()
      offChanged()
      offState()
    }
  }, [props.transport, props.provider, props.projectPath, refresh, completeOAuth])

  async function applyChange<Result>(
    busyId: string,
    action: () => Promise<Result>,
    success: string,
  ): Promise<boolean> {
    setBusy((current) => new Set(current).add(busyId))
    setError(undefined)
    setNotice(undefined)
    try {
      await action()
      if (!isCurrentContext()) return false
      setNotice(success)
      if (inventory?.capabilities.reload && props.projectPath) {
        try {
          await props.transport.request('mcp.reload', {
            provider: props.provider,
            projectPath: props.projectPath,
          })
          if (!isCurrentContext()) return false
          setNotice(t('settings.mcp.reloadNotice', { success }))
        } catch (cause) {
          if (!isCurrentContext()) return false
          setNotice(`${success} ${message(cause)}`)
        }
      }
      await refresh()
      if (!isCurrentContext()) return false
      return true
    } catch (cause) {
      if (isCurrentContext()) setError(message(cause))
      return false
    } finally {
      if (isCurrentContext()) setBusy(without(busyId))
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editor || !props.projectPath || busy.has('editor')) return
    const projectPath = props.projectPath
    let server: McpServerConfig
    try {
      server = McpServerConfigSchema.parse(
        editor.mode === 'hide'
          ? {
              id: editor.id.trim(),
              enabled: false,
            }
          : {
              id: editor.id.trim(),
              enabled: true,
              ...(editor.displayName.trim()
                ? {
                    displayName: editor.displayName.trim(),
                  }
                : {}),
              transport: McpTransportSchema.parse(JSON.parse(editor.transport)),
            },
      )
    } catch {
      setError(
        editor.mode === 'hide' ? t('settings.mcp.needId') : t('settings.mcp.needIdAndTransport'),
      )
      return
    }
    const saved = await applyChange(
      'editor',
      () =>
        props.transport.request(editor.mode === 'edit' ? 'mcp.update' : 'mcp.add', {
          provider: props.provider,
          projectPath,
          server,
        }),
      editor.mode === 'hide'
        ? t('settings.mcp.hidden')
        : editor.mode === 'add'
          ? t('settings.mcp.added')
          : t('settings.mcp.updated'),
    )
    if (saved) setEditor(undefined)
  }

  function toggle(server: McpServer): void {
    if (!props.projectPath) return
    void applyChange(
      server.id,
      () =>
        server.enabled
          ? props.transport.request('mcp.add', {
              provider: props.provider,
              projectPath: props.projectPath!,
              server: { id: server.id, enabled: false },
            })
          : props.transport.request('mcp.remove', {
              provider: props.provider,
              projectPath: props.projectPath!,
              serverId: server.id,
            }),
      server.enabled ? t('settings.mcp.disabled') : t('settings.mcp.overrideRemoved'),
    )
  }

  function remove(server: McpServer): void {
    if (
      !props.projectPath ||
      !window.confirm(t('settings.mcp.confirmRemove', { name: serverName(server) }))
    )
      return
    void applyChange(
      server.id,
      () =>
        props.transport.request('mcp.remove', {
          provider: props.provider,
          projectPath: props.projectPath!,
          serverId: server.id,
        }),
      t('settings.mcp.removed'),
    )
  }

  async function signIn(server: McpServer): Promise<void> {
    if (!props.projectPath || pendingOAuth.current) return
    pendingOAuth.current = { serverId: server.id, loginId: undefined }
    setSigningIn(server.id)
    setBusy((current) => new Set(current).add(server.id))
    setError(undefined)
    try {
      const result = await props.transport.request('mcp.startOAuth', {
        provider: props.provider,
        projectPath: props.projectPath,
        serverId: server.id,
      })
      if (!isCurrentContext()) return
      const pending = pendingOAuth.current
      if (!pending || pending.serverId !== server.id) return
      pending.loginId = result.loginId
      if (pending.completion?.loginId === result.loginId) {
        completeOAuth(pending.completion)
        return
      }
      delete pending.completion
      const opened = window.open(result.authUrl, '_blank', 'noopener,noreferrer')
      if (!opened) {
        setNotice(t('settings.mcp.popupBlocked', { url: result.authUrl }))
      } else {
        setNotice(t('settings.mcp.finishSignIn'))
      }
    } catch (cause) {
      if (isCurrentContext()) {
        pendingOAuth.current = undefined
        setSigningIn(undefined)
        setBusy(without(server.id))
        setError(message(cause))
      }
    }
  }

  const contextMatches = (context: Context | undefined) =>
    context?.transport === props.transport &&
    context.provider === props.provider &&
    context.projectPath === props.projectPath
  const currentInventory = contextMatches(inventoryContext.current) ? inventory : undefined
  const currentError = currentInventory || contextMatches(errorContext.current) ? error : undefined
  const projectServers =
    currentInventory?.servers.filter((server) => server.scope === 'project') ?? []
  // The provider loads these in every chat whether or not the project adds anything;
  // hiding them made a fully configured provider read as having no MCP servers.
  const inheritedServers =
    currentInventory?.servers.filter(
      (server) => server.scope === 'global' && server.providedBy === undefined,
    ) ?? []
  // What a link of the person's Clube do Motion account provides: shown, never edited here.
  const providedServers = currentInventory?.servers.filter((server) => server.providedBy) ?? []
  // The provider is still collecting its servers, so an empty list is not final.
  const checking = Boolean(currentInventory?.loading)
  const canHide = currentInventory ? canHideInherited(currentInventory.capabilities) : false
  const loadingInventory =
    Boolean(props.projectPath) &&
    ((loading && !inventory) ||
      (checking && projectServers.length === 0 && inheritedServers.length === 0))
  const card = (server: McpServer, inherited: boolean) => (
    <McpServerCard
      key={server.id}
      server={server}
      capabilities={currentInventory!.capabilities}
      providerName={props.providerName}
      busy={busy.has(server.id)}
      signingIn={signingIn === server.id}
      onSignIn={() => void signIn(server)}
      onToggle={() => toggle(server)}
      onEdit={(opener) =>
        inherited
          ? undefined
          : setEditor({
              mode: 'edit',
              opener,
              id: server.id,
              displayName: server.displayName ?? '',
              transport: JSON.stringify(server.transport, null, 2),
            })
      }
      onRemove={() => (inherited ? undefined : remove(server))}
    />
  )
  const projectList = !props.projectPath ? (
    <SettingsEmpty icon={<PlugConnected aria-hidden />} title={t('settings.mcp.selectProject')} />
  ) : loadingInventory ? (
    <McpCardSkeleton label={t('settings.mcp.loading')} />
  ) : !currentInventory ? null : projectServers.length === 0 ? (
    <SettingsEmpty icon={<PlugConnected aria-hidden />} title={t('settings.mcp.empty')} />
  ) : (
    <div className="mcp-list">{projectServers.map((server) => card(server, false))}</div>
  )

  return (
    <SettingsPage
      title={t('settings.nav.mcp')}
      description={pageDescription(props.providerName, props.projectPath, props.projectName)}
      actions={
        <>
          {props.providerPicker}
          {props.projectPath && canHide ? (
            <button
              className="set-button set-button--quiet"
              type="button"
              disabled={busy.size > 0}
              onClick={(event) =>
                setEditor({
                  mode: 'hide',
                  id: '',
                  displayName: '',
                  transport: '',
                  opener: event.currentTarget,
                })
              }
            >
              {t('settings.mcp.hideById')}
            </button>
          ) : null}
          {props.projectPath && currentInventory?.capabilities.add ? (
            <button
              className="set-button"
              type="button"
              disabled={busy.size > 0}
              onClick={(event) =>
                setEditor({
                  mode: 'add',
                  opener: event.currentTarget,
                  id: '',
                  displayName: '',
                  transport: '{\n  "type": "http",\n  "url": "https://example.com/mcp"\n}',
                })
              }
            >
              <Plus size={14} aria-hidden />
              {t('settings.mcp.add')}
            </button>
          ) : null}
        </>
      }
    >
      {currentError ? (
        <SettingsNotice
          tone="error"
          action={
            <button className="set-button" type="button" onClick={() => void refresh()}>
              {t('settings.mcp.retry')}
            </button>
          }
        >
          {currentError}
        </SettingsNotice>
      ) : null}
      {currentInventory && !currentInventory.capabilities.inventory ? (
        <SettingsNotice tone="info">
          {t('settings.mcp.notListed', { provider: props.providerName })}
        </SettingsNotice>
      ) : null}
      {checking && !loadingInventory ? (
        <SettingsNotice tone="progress">
          {t('settings.mcp.checking', { provider: props.providerName })}
        </SettingsNotice>
      ) : null}
      {notice ? <SettingsNotice tone="info">{notice}</SettingsNotice> : null}
      {editor ? (
        <ServerEditor
          key={editor.mode === 'edit' ? `edit:${editor.id}` : editor.mode}
          editor={editor}
          busy={busy.has('editor')}
          onChange={setEditor}
          onCancel={() => setEditor(undefined)}
          onSubmit={(event) => void save(event)}
        />
      ) : null}
      {projectList ? (
        <SettingsSection
          label={t('settings.mcp.projectServers')}
          note={
            // Once there is a change to apply: above the empty line it read as its lead-in.
            currentInventory?.capabilities.add &&
            !currentInventory.capabilities.reload &&
            (projectServers.length > 0 || notice)
              ? t('settings.mcp.applyNote')
              : undefined
          }
        >
          {projectList}
        </SettingsSection>
      ) : null}
      {currentInventory && providedServers.length > 0 ? (
        <SettingsSection title={t('settings.mcp.clube.title')} note={t('settings.mcp.clube.note')}>
          <div className="mcp-list">{providedServers.map((server) => card(server, true))}</div>
        </SettingsSection>
      ) : null}
      {currentInventory && inheritedServers.length > 0 ? (
        <SettingsSection
          title={t('settings.mcp.inherited.title', { provider: props.providerName })}
          note={t(canHide ? 'settings.mcp.inherited.noteHide' : 'settings.mcp.inherited.note', {
            provider: props.providerName,
          })}
        >
          <div className="mcp-list">{inheritedServers.map((server) => card(server, true))}</div>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  )
}

const CARD_SKELETON_NAME_WIDTHS = [112, 148, 88] as const
const CARD_SKELETON_DETAIL_WIDTHS = [236, 184, 212] as const

/** Cards before their list arrives: a mark, a name, a status and one line of detail each. */
function McpCardSkeleton(props: { label: string }) {
  return (
    <SkeletonStatus label={props.label} className="mcp-list">
      {CARD_SKELETON_NAME_WIDTHS.map((width, index) => (
        <div className="mcp-card mcp-card--skeleton" key={width} aria-hidden>
          <Skeleton className="skeleton--block" width={40} height={40} />
          <div className="mcp-card__main">
            <div className="mcp-card__head">
              <Skeleton width={width} height={11} />
              <Skeleton width={72} height={16} />
            </div>
            <Skeleton
              className="mcp-card__skeleton-detail"
              width={CARD_SKELETON_DETAIL_WIDTHS[index]}
              height={8}
            />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  )
}

/** The provider and, once a project is open, the project the list belongs to. */
function pageDescription(
  providerName: string,
  projectPath: string | undefined,
  projectName: string | undefined,
): string {
  return projectPath && projectName ? `${providerName} · ${projectName}` : providerName
}

function ServerEditor(props: {
  editor: Editor
  busy: boolean
  onChange: (editor: Editor) => void
  onCancel: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const { t } = useI18n()
  const update = (change: Partial<Editor>) => props.onChange({ ...props.editor, ...change })
  const field = useRef<HTMLInputElement>(null)
  const hiding = props.editor.mode === 'hide'
  const opener = props.editor.opener
  useEffect(() => {
    field.current?.form?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
    return () => {
      if (document.contains(opener)) opener.focus()
    }
  }, [opener])
  return (
    <form
      className="set-form mcp-editor"
      aria-label={t(
        hiding
          ? 'settings.mcp.editor.labelHide'
          : props.editor.mode === 'add'
            ? 'settings.mcp.editor.labelAdd'
            : 'settings.mcp.editor.labelEdit',
      )}
      onSubmit={props.onSubmit}
      onKeyDown={(event) => {
        if (isComposingKey(event)) return
        if (event.key === 'Escape' && !props.busy) {
          event.stopPropagation()
          props.onCancel()
        }
      }}
    >
      {hiding ? (
        <p className="set-form__wide set-form__note">{t('settings.mcp.editor.hideNote')}</p>
      ) : null}
      <label className={hiding ? 'set-form__wide' : undefined}>
        {t('settings.mcp.editor.id')}
        <input
          ref={field}
          className="set-input"
          required
          disabled={props.editor.mode === 'edit'}
          value={props.editor.id}
          onChange={(event) => update({ id: event.target.value })}
        />
      </label>
      {!hiding ? (
        <label>
          {t('settings.mcp.editor.displayName')}
          <input
            className="set-input"
            value={props.editor.displayName}
            onChange={(event) => update({ displayName: event.target.value })}
          />
        </label>
      ) : null}
      {!hiding ? (
        <label className="set-form__wide">
          {t('settings.mcp.editor.transport')}
          <textarea
            className="set-input mcp-editor__transport"
            required
            spellCheck={false}
            value={props.editor.transport}
            onChange={(event) => update({ transport: event.target.value })}
          />
          <small className="set-form__hint">{t('settings.mcp.editor.transportHint')}</small>
        </label>
      ) : null}
      <footer className="set-form__actions">
        <button
          className="set-button set-button--quiet"
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          {t('settings.mcp.editor.cancel')}
        </button>
        <button className="set-button set-button--primary" type="submit" disabled={props.busy}>
          {props.busy
            ? t('settings.mcp.editor.saving')
            : hiding
              ? t('settings.mcp.editor.hide')
              : t('settings.mcp.editor.save')}
        </button>
      </footer>
    </form>
  )
}

function without(id: string) {
  return (current: ReadonlySet<string>) => {
    const next = new Set(current)
    next.delete(id)
    return next
  }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
