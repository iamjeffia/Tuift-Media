import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { AvailableSkill, ProviderId, ResultOf, Skill } from '@harness/contracts'
import {
  IconAlertTriangle as AlertTriangle,
  IconExternalLink as ExternalLink,
  IconFolderPlus as FolderPlus,
} from '@tabler/icons-react'
import { pickSkillFolder } from '../bridge.js'
import { useI18n } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import { useProviderWatch } from '../provider-watch.js'
import {
  SettingsEmpty,
  SettingsEntitySkeleton,
  SettingsNotice,
  SettingsPage,
  SettingsSection,
} from './settings/SettingsLayout.js'
import '../styles/switch.css'

type Inventory = ResultOf<'skills.list'>
type Context = { transport: Transport; provider: ProviderId; projectPath: string | undefined }

export function SkillsSettings(props: {
  transport: Transport
  provider: ProviderId
  providerName: string
  projectPath: string | undefined
  projectName: string | undefined
}) {
  const { t } = useI18n()
  useProviderWatch(props.transport, props.provider, props.projectPath, 'skills')
  const [inventory, setInventory] = useState<Inventory>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  // Per id: one toggle settling must not unlock another switch still in flight.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [reload, setReload] = useState(0)
  // The skills their authors publish, which TUIFT Code installs from the source.
  const [available, setAvailable] = useState<AvailableSkill[]>()
  const [availableError, setAvailableError] = useState<string>()
  const [catalogBusy, setCatalogBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [catalogFailures, setCatalogFailures] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set())
  const [removeFailures, setRemoveFailures] = useState<ReadonlyMap<string, string>>(() => new Map())
  const availableGeneration = useRef(0)
  const refreshAvailable = useRef<() => Promise<void>>(async () => {})
  const inventoryGeneration = useRef(0)
  const inventoryContext = useRef<Context | undefined>(undefined)
  const errorContext = useRef<Context | undefined>(undefined)
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

  useEffect(() => {
    if (!props.projectPath) {
      inventoryGeneration.current += 1
      setInventory(undefined)
      inventoryContext.current = undefined
      errorContext.current = undefined
      setLoading(false)
      setError(undefined)
      setBusy(new Set())
      return
    }

    let active = true
    // Ordered: two overlapping refreshes (initial load racing a
    // skills.changed push) must not land out of order.
    const load = async () => {
      const context = {
        transport: props.transport,
        provider: props.provider,
        projectPath: props.projectPath,
      }
      const mine = ++inventoryGeneration.current
      setLoading(true)
      try {
        const next = await props.transport.request('skills.list', {
          provider: props.provider,
          projectPath: props.projectPath!,
        })
        if (active && mine === inventoryGeneration.current) {
          inventoryContext.current = context
          errorContext.current = undefined
          setInventory(next)
          setError(undefined)
        }
      } catch (cause) {
        if (active && mine === inventoryGeneration.current) {
          errorContext.current = context
          setError(message(cause))
        }
      } finally {
        if (active && mine === inventoryGeneration.current) setLoading(false)
      }
    }
    setInventory(undefined)
    inventoryContext.current = undefined
    errorContext.current = undefined
    setError(undefined)
    setBusy(new Set())
    void load()
    const off = props.transport.on('skills.changed', ({ provider, projectPath }) => {
      if (provider === props.provider && projectPath === props.projectPath) void load()
    })
    let reconnecting = props.transport.state === 'reconnecting'
    const offState = props.transport.onState((state) => {
      if (state === 'reconnecting') reconnecting = true
      else if (state === 'open' && reconnecting) {
        reconnecting = false
        void load()
      }
    })
    return () => {
      active = false
      off()
      offState()
    }
  }, [props.transport, props.provider, props.projectPath, reload])

  // The install no longer depends on the provider: it lands in the app's own data folder.
  useEffect(() => {
    setAvailable(undefined)
    setAvailableError(undefined)
    setCatalogBusy(new Set())
    setCatalogFailures(new Map())
    setRemoving(new Set())
    setRemoveFailures(new Map())
    if (!props.projectPath) return
    let active = true
    // Ordered like the inventory's load: a push may overlap the first read.
    const load = async () => {
      const mine = ++availableGeneration.current
      try {
        const next = await props.transport.request('skills.available', {
          provider: props.provider,
          projectPath: props.projectPath!,
        })
        if (active && mine === availableGeneration.current) {
          setAvailable(next.skills)
          setAvailableError(undefined)
        }
      } catch (cause) {
        if (active && mine === availableGeneration.current) setAvailableError(message(cause))
      }
    }
    refreshAvailable.current = load
    void load()
    const off = props.transport.on('skills.changed', ({ provider, projectPath }) => {
      if (provider === props.provider && projectPath === props.projectPath) void load()
    })
    return () => {
      active = false
      refreshAvailable.current = async () => {}
      off()
    }
  }, [props.transport, props.provider, props.projectPath])

  /**
   * Installs skills from their authors. The server reports each one that lands
   * with `skills.changed`, which refreshes both lists; the answer carries the
   * reason for each one that failed.
   */
  async function installFromAuthors(ids: string[]): Promise<void> {
    if (!props.projectPath || !ids.length) return
    setCatalogBusy((current) => new Set([...current, ...ids]))
    setCatalogFailures((current) => {
      const next = new Map(current)
      for (const id of ids) next.delete(id)
      return next
    })
    let failed: Array<[string, string]>
    try {
      const { results } = await props.transport.request('skills.installAvailable', {
        provider: props.provider,
        projectPath: props.projectPath,
        ids,
      })
      failed = results.flatMap((result): Array<[string, string]> =>
        result.ok ? [] : [[result.id, result.message]],
      )
    } catch (cause) {
      failed = ids.map((id) => [id, message(cause)])
    }
    if (!isCurrentContext()) return
    setCatalogFailures((current) => new Map([...current, ...failed]))
    setCatalogBusy((current) => {
      const next = new Set(current)
      for (const id of ids) next.delete(id)
      return next
    })
    await refreshAvailable.current()
  }

  /** Removes a skill installed for the whole app, after the person confirms. */
  async function removeFromApp(skill: AvailableSkill): Promise<void> {
    if (
      !props.projectPath ||
      !window.confirm(t('settings.skills.catalog.confirmRemove', { name: skill.name }))
    )
      return
    setRemoving((current) => new Set([...current, skill.id]))
    setRemoveFailures((current) => {
      const next = new Map(current)
      next.delete(skill.id)
      return next
    })
    try {
      await props.transport.request('skills.removeAvailable', {
        provider: props.provider,
        projectPath: props.projectPath,
        id: skill.id,
      })
    } catch (cause) {
      if (isCurrentContext())
        setRemoveFailures((current) => new Map([...current, [skill.id, message(cause)]]))
    }
    if (!isCurrentContext()) return
    setRemoving(without(skill.id))
    await refreshAvailable.current()
  }

  async function toggle(skill: Skill): Promise<void> {
    if (!props.projectPath) return
    setBusy((current) => new Set(current).add(skill.id))
    setError(undefined)
    try {
      const { enabled } = await props.transport.request('skills.setEnabled', {
        provider: props.provider,
        projectPath: props.projectPath,
        skillId: skill.id,
        enabled: !skill.enabled,
      })
      if (!isCurrentContext()) return
      inventoryGeneration.current += 1
      setLoading(false)
      setInventory((current) =>
        current
          ? {
              ...current,
              skills: current.skills.map((entry) =>
                entry.id === skill.id ? { ...entry, enabled } : entry,
              ),
            }
          : current,
      )
    } catch (cause) {
      if (isCurrentContext()) setError(message(cause))
    } finally {
      if (isCurrentContext()) setBusy(without(skill.id))
    }
  }

  async function install(): Promise<void> {
    if (!props.projectPath) return
    setError(undefined)
    setBusy((current) => new Set(current).add('install'))
    try {
      const folderPath = await pickSkillFolder()
      if (!folderPath || !isCurrentContext()) return
      const { skill } = await props.transport.request('skills.installFromFolder', {
        provider: props.provider,
        projectPath: props.projectPath,
        folderPath,
      })
      if (!isCurrentContext()) return
      inventoryGeneration.current += 1
      setLoading(false)
      setInventory((current) =>
        current
          ? {
              ...current,
              skills: [...current.skills.filter((entry) => entry.id !== skill.id), skill],
            }
          : current,
      )
    } catch (cause) {
      if (isCurrentContext()) setError(message(cause))
    } finally {
      if (isCurrentContext()) setBusy(without('install'))
    }
  }

  const contextMatches = (context: Context | undefined) =>
    context?.transport === props.transport &&
    context.provider === props.provider &&
    context.projectPath === props.projectPath
  const currentInventory = contextMatches(inventoryContext.current) ? inventory : undefined
  const currentError = currentInventory || contextMatches(errorContext.current) ? error : undefined
  const projectSkills = currentInventory?.skills.filter((skill) => skill.scope === 'project') ?? []
  const globalSkills = currentInventory?.skills.filter((skill) => skill.scope === 'user') ?? []
  const includedSkills = currentInventory?.skills.filter(isIncludedSkill) ?? []
  const missingFromAuthors = (available ?? []).filter(
    (skill) => skill.state === 'not-installed' && !catalogBusy.has(skill.id),
  )
  // A background refresh keeps the current list on screen; blanking it
  // to a loading note on every skills.changed push read as flicker.
  const discovering = Boolean(props.projectPath) && loading && !inventory

  return (
    <SettingsPage
      title={t('settings.nav.skills')}
      description={pageDescription(props.providerName, props.projectPath, props.projectName)}
      actions={
        props.projectPath && currentInventory?.capabilities.install ? (
          <button
            className="set-button"
            type="button"
            disabled={busy.size > 0}
            onClick={() => void install()}
          >
            <FolderPlus size={14} aria-hidden />
            {busy.has('install') ? t('settings.skills.installing') : t('settings.skills.install')}
          </button>
        ) : undefined
      }
    >
      {currentError ? (
        <SettingsNotice
          tone="error"
          action={
            <button className="set-button" type="button" onClick={() => setReload((n) => n + 1)}>
              {t('settings.skills.retry')}
            </button>
          }
        >
          {currentError}
        </SettingsNotice>
      ) : null}
      {currentInventory && !currentInventory.capabilities.inventory ? (
        <SettingsNotice tone="info">
          {t('settings.skills.notListed', { provider: props.providerName })}
        </SettingsNotice>
      ) : null}
      {currentInventory?.errors.length ? (
        <SettingsNotice tone="error">
          {t('settings.skills.loadErrors')}
          {currentInventory.errors.map((entry) => (
            <span className="set-notice__line" key={`${entry.path}:${entry.message}`}>
              {entry.message} · {entry.path}
            </span>
          ))}
        </SettingsNotice>
      ) : null}
      {!props.projectPath ? (
        <SettingsEmpty title={t('settings.skills.selectProject')} />
      ) : discovering ? (
        <SettingsEntitySkeleton label={t('settings.skills.discovering')} />
      ) : !currentInventory?.capabilities.inventory ? null : projectSkills.length ? (
        <SettingsSection
          title={t('settings.skills.project.title')}
          note={t('settings.skills.project.note')}
        >
          {projectSkills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              configurable={currentInventory.capabilities.configure}
              busy={busy.has(skill.id)}
              onToggle={() => void toggle(skill)}
            />
          ))}
        </SettingsSection>
      ) : (
        <SettingsEmpty title={t('settings.skills.project.empty')} />
      )}
      {props.projectPath && (available?.length || availableError) ? (
        <SettingsSection
          title={t('settings.skills.catalog.title')}
          note={t('settings.skills.catalog.note')}
          action={
            available?.length ? (
              <button
                className="set-button set-button--quiet"
                type="button"
                disabled={!missingFromAuthors.length}
                onClick={() => void installFromAuthors(missingFromAuthors.map((skill) => skill.id))}
              >
                {t('settings.skills.catalog.installAll')}
              </button>
            ) : undefined
          }
        >
          {availableError ? (
            <SettingsNotice
              tone="error"
              action={
                <button
                  className="set-button"
                  type="button"
                  onClick={() => void refreshAvailable.current()}
                >
                  {t('settings.skills.retry')}
                </button>
              }
            >
              {availableError}
            </SettingsNotice>
          ) : null}
          {(available ?? []).map((skill) => (
            <AvailableSkillRow
              key={skill.id}
              skill={skill}
              installing={catalogBusy.has(skill.id)}
              failure={catalogFailures.get(skill.id)}
              removing={removing.has(skill.id)}
              removeFailure={removeFailures.get(skill.id)}
              onInstall={() => void installFromAuthors([skill.id])}
              onRemove={() => void removeFromApp(skill)}
            />
          ))}
        </SettingsSection>
      ) : null}
      {props.projectPath && currentInventory && globalSkills.length ? (
        <SettingsSection
          title={t('settings.skills.global.title')}
          note={t('settings.skills.global.note')}
        >
          {globalSkills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              configurable={currentInventory.capabilities.configure}
              busy={busy.has(skill.id)}
              onToggle={() => void toggle(skill)}
            />
          ))}
        </SettingsSection>
      ) : null}
      {props.projectPath && includedSkills.length ? (
        <SettingsSection
          title={t('settings.skills.included.title')}
          note={t('settings.skills.included.note')}
        >
          {includedSkills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              configurable={false}
              busy={false}
              onToggle={() => undefined}
            />
          ))}
        </SettingsSection>
      ) : null}
    </SettingsPage>
  )
}

/** Skills that ship with TUIFT Code itself; the server gives them `tastecode:` ids. */
function isIncludedSkill(skill: Skill): boolean {
  return skill.scope === 'system' && skill.id.startsWith('tastecode:')
}

/** The provider and, once a project is open, the project the list belongs to. */
function pageDescription(
  providerName: string,
  projectPath: string | undefined,
  projectName: string | undefined,
): string {
  return projectPath && projectName ? `${providerName} · ${projectName}` : providerName
}

/**
 * One skill: its name along the leader to its switch (or to its state when
 * the provider does not let TUIFT Code change it), with what it does, where
 * it lives and anything it is missing underneath, across the whole row.
 */
function SkillRow(props: {
  skill: Skill
  configurable: boolean
  busy: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const name = props.skill.displayName ?? props.skill.name
  const source =
    props.skill.source.type === 'folder' ? props.skill.source.path : t('settings.skills.managed')
  return (
    <article className="set-entity" data-tone={props.skill.enabled ? undefined : 'muted'}>
      <div className="set-entity__main">
        <div className="set-entity__head">
          <h2 className="set-entity__name">{name}</h2>
          <span className="set-leader" aria-hidden />
          {props.configurable ? null : (
            <span className="set-entity__status">
              {props.skill.enabled ? t('settings.skills.enabled') : t('settings.skills.disabled')}
            </span>
          )}
        </div>
      </div>
      {props.configurable ? (
        <div className="set-entity__actions">
          <button
            className={`switch${props.skill.enabled ? ' is-on' : ''}`}
            type="button"
            role="switch"
            aria-label={t(
              props.skill.enabled ? 'settings.skills.disable' : 'settings.skills.enable',
              {
                name,
              },
            )}
            aria-checked={props.skill.enabled}
            disabled={props.busy}
            onClick={props.onToggle}
          >
            <span className="switch__thumb" />
          </button>
        </div>
      ) : null}
      <div className="set-entity__details">
        {props.skill.description ? (
          <SkillDescription name={name} text={props.skill.description} />
        ) : null}
        <p className="set-entity__detail set-entity__detail--code" title={source}>
          {source}
        </p>
        {props.skill.dependencyErrors.map((entry) => (
          <p
            className="set-entity__detail set-entity__detail--error"
            key={`${entry.dependency}:${entry.message}`}
          >
            <AlertTriangle size={13} aria-hidden />
            <span>
              <strong>{entry.dependency}</strong> · {entry.message}
            </span>
          </p>
        ))}
      </div>
    </article>
  )
}

/**
 * One skill from its author: the same row as an installed skill, with who
 * wrote it, the licence as its repository declares it, a link to read the
 * source before installing, and the install button where the state allows it.
 */
function AvailableSkillRow(props: {
  skill: AvailableSkill
  installing: boolean
  failure: string | undefined
  removing: boolean
  removeFailure: string | undefined
  onInstall: () => void
  onRemove: () => void
}) {
  const { t, language } = useI18n()
  const { skill } = props
  // Installed wins over a request still in flight: an update that landed is done.
  const installing = props.installing && skill.state !== 'installed'
  const failed = !installing && props.failure !== undefined && skill.state !== 'installed'
  const status = props.removing
    ? t('settings.skills.catalog.removing')
    : installing
      ? t('settings.skills.installing')
      : failed
        ? t('settings.skills.catalog.failed')
        : skill.state === 'installed'
          ? t('settings.skills.catalog.installed')
          : skill.state === 'update-available'
            ? t('settings.skills.catalog.updateAvailable')
            : undefined
  const [action, actionFor] = failed
    ? ([
        t('settings.skills.retry'),
        t('settings.skills.catalog.retryFor', { name: skill.name }),
      ] as const)
    : skill.state === 'update-available'
      ? ([
          t('settings.skills.catalog.update'),
          t('settings.skills.catalog.updateFor', { name: skill.name }),
        ] as const)
      : ([
          t('settings.skills.catalog.install'),
          t('settings.skills.catalog.installFor', { name: skill.name }),
        ] as const)
  return (
    <article className="set-entity" data-tone={failed ? 'error' : undefined}>
      <div className="set-entity__main">
        <div className="set-entity__head">
          <h2 className="set-entity__name">{skill.name}</h2>
          <span className="set-leader" aria-hidden />
          {status ? <span className="set-entity__status">{status}</span> : null}
        </div>
      </div>
      <div className="set-entity__actions">
        {skill.state === 'installed' ? null : (
          <button
            className="set-button"
            type="button"
            disabled={installing || props.removing}
            aria-label={actionFor}
            onClick={props.onInstall}
          >
            {action}
          </button>
        )}
        {skill.installedFor === 'app' ? (
          <button
            className="set-button set-button--danger"
            type="button"
            disabled={installing || props.removing}
            aria-label={t('settings.skills.catalog.removeFor', { name: skill.name })}
            onClick={props.onRemove}
          >
            {t('settings.skills.catalog.remove')}
          </button>
        ) : null}
        <a
          className="set-button set-button--quiet set-button--icon"
          href={skill.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('settings.skills.catalog.openSource', { name: skill.name })}
          title={t('settings.skills.catalog.openSource', { name: skill.name })}
        >
          <ExternalLink size={14} aria-hidden />
        </a>
      </div>
      <div className="set-entity__details">
        <SkillDescription
          name={skill.name}
          text={language === 'pt-BR' ? skill.summary['pt-BR'] : skill.summary.en}
        />
        <p className="set-entity__detail">
          {skill.license === null
            ? t('settings.skills.catalog.metaNoLicense', { author: skill.author })
            : t('settings.skills.catalog.meta', { author: skill.author, license: skill.license })}
        </p>
        {skill.installedFor === 'app' ? (
          <p className="set-entity__detail">
            {t(`settings.skills.catalog.scopeApp.${skill.category}`)}
          </p>
        ) : skill.installedFor === 'project' ? (
          <p className="set-entity__detail">{t('settings.skills.catalog.scopeProject')}</p>
        ) : null}
        {failed ? (
          <p className="set-entity__detail set-entity__detail--error">
            <AlertTriangle size={13} aria-hidden />
            <span>{props.failure}</span>
          </p>
        ) : null}
        {props.removeFailure ? (
          <p className="set-entity__detail set-entity__detail--error">
            <AlertTriangle size={13} aria-hidden />
            <span>{props.removeFailure}</span>
          </p>
        ) : null}
      </div>
    </article>
  )
}

/**
 * What a skill does, held to two lines. Only a description that runs past
 * them offers Show more; that button and a click on the text itself open
 * the rest and close it again. Selecting part of the text is not a click.
 */
function SkillDescription(props: { name: string; text: string }) {
  const { t } = useI18n()
  const id = useId()
  const paragraph = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Measured while clamped, and again whenever the row's width changes. An
  // open description keeps its Show less until it is closed and measured anew.
  useLayoutEffect(() => {
    const element = paragraph.current
    if (!element || expanded) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [props.text, expanded])

  const expandable = overflows || expanded
  const toggle = () => setExpanded((open) => !open)
  const label = expanded ? t('settings.skills.showLess') : t('settings.skills.showMore')
  return (
    <>
      <p
        className={`set-entity__detail${expanded ? '' : ' set-entity__detail--clamped'}`}
        id={id}
        ref={paragraph}
        data-expandable={expandable || undefined}
        onClick={
          expandable
            ? () => {
                if (window.getSelection()?.type !== 'Range') toggle()
              }
            : undefined
        }
      >
        {props.text}
      </p>
      {expandable ? (
        <button
          className="set-entity__more"
          type="button"
          aria-label={t(
            expanded ? 'settings.skills.showLessAbout' : 'settings.skills.showMoreAbout',
            { name: props.name },
          )}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggle}
        >
          {label}
        </button>
      ) : null}
    </>
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
