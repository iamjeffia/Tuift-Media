import {
  useEffect,
  useMemo,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { IconSearch as Search } from '@tabler/icons-react'
import '../styles/keybinds.css'
import { suspendNativeMenuShortcuts } from '../bridge.js'
import { useI18n, type MessageKey } from '../i18n/index.js'
import { SettingsEmpty, SettingsPage, SettingsSection } from './settings/SettingsLayout.js'
import {
  DEFAULT_KEYBINDINGS,
  findKeybindingConflict,
  KEYBINDING_DEFINITIONS,
  reservedShortcutLabel,
  sameShortcut,
  shortcutFromKeyboardEvent,
  shortcutLabel,
  type KeybindingGroup,
  type KeybindingId,
  type Keybindings,
  type Shortcut,
} from '../shortcuts.js'

const GROUPS = [
  'App',
  'Chats',
  'Projects',
  'Workspace',
] as const satisfies readonly KeybindingGroup[]
const GROUP_KEYS = {
  App: 'settings.keybinds.group.app',
  Chats: 'settings.keybinds.group.chats',
  Projects: 'settings.keybinds.group.projects',
  Workspace: 'settings.keybinds.group.workspace',
} as const satisfies Record<KeybindingGroup, MessageKey>
const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift'])

type Modifiers = { primary: boolean; alt: boolean; shift: boolean }
const NO_MODIFIERS: Modifiers = { primary: false, alt: false, shift: false }

const MODIFIERS = [
  { name: 'primary', icon: 'command', mac: '⌘', other: 'Ctrl' },
  { name: 'alt', icon: 'option', mac: '⌥', other: 'Alt' },
  { name: 'shift', icon: 'shift', mac: '⇧', other: 'Shift' },
] as const

type Fault = {
  action: KeybindingId
  text: string
  attempt?: Shortcut
  conflict?: KeybindingId
}

/** Command is the primary modifier on macOS only; elsewhere Meta is the Windows key. */
function heldModifiers(event: ReactKeyboardEvent, macOS: boolean): Modifiers {
  return {
    primary: macOS ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  }
}

/**
 * A shortcut set the way a macOS menu sets it: plain type, modifiers packed
 * against the key, and the key in a column of its own so every shortcut on
 * the page lines up under the one above.
 */
function Chord(props: { shortcut: Shortcut; macOS: boolean; landed?: boolean }) {
  const label = shortcutLabel(props.shortcut, props.macOS)
  if (!props.macOS) {
    return (
      <kbd className="keybind-shortcut" title={label} data-landed={props.landed || undefined}>
        {label}
      </kbd>
    )
  }
  return (
    <kbd className="keybind-shortcut" title={label} data-landed={props.landed || undefined}>
      {MODIFIERS.map((modifier) =>
        props.shortcut[modifier.name] ? (
          <span
            className="keybind-shortcut__modifier"
            data-shortcut-icon={modifier.icon}
            key={modifier.name}
          >
            {modifier.mac}
          </span>
        ) : null,
      )}
      <span className="keybind-shortcut__key">
        {shortcutLabel({ key: props.shortcut.key }, true)}
      </span>
    </kbd>
  )
}

/**
 * The chord being typed. Every modifier waits in its place, faint, and takes
 * ink while it is held; the caret stands where the key will land.
 */
function LiveChord(props: { held: Modifiers; macOS: boolean }) {
  return (
    <span
      className={`keybind-shortcut keybind-shortcut--live${props.macOS ? '' : ' keybind-shortcut--words'}`}
      aria-hidden
    >
      {MODIFIERS.map((modifier) => (
        <span
          className="keybind-shortcut__modifier"
          data-held={props.held[modifier.name] || undefined}
          key={modifier.name}
        >
          {props.macOS ? modifier.mac : `${modifier.other}+`}
        </span>
      ))}
      <span className="keybind-shortcut__key keybind-shortcut__caret" />
    </span>
  )
}

export function KeybindSettings(props: {
  keybindings: Keybindings
  macOS: boolean
  onChange: (action: KeybindingId, shortcut: Shortcut | null) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<KeybindingId>()
  const [held, setHeld] = useState<Modifiers>(NO_MODIFIERS)
  const [fault, setFault] = useState<Fault>()
  const [landed, setLanded] = useState<KeybindingId>()
  const recordingShortcut = recording !== undefined
  useEffect(() => {
    if (!recordingShortcut) return
    // Menu accelerators fire before the page sees the key, so a recorded
    // combination would run its old action instead of reaching the recorder.
    suspendNativeMenuShortcuts(true)
    return () => suspendNativeMenuShortcuts(false)
  }, [recordingShortcut])
  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return KEYBINDING_DEFINITIONS
    return KEYBINDING_DEFINITIONS.filter((definition) => {
      const searchable = `${t(definition.labelKey)} ${t(definition.descriptionKey)} ${t(
        GROUP_KEYS[definition.group],
      )}`.toLowerCase()
      return terms.every((term) => searchable.includes(term))
    })
  }, [query, t])
  const changed = KEYBINDING_DEFINITIONS.some(
    (definition) =>
      !sameShortcut(props.keybindings[definition.id], DEFAULT_KEYBINDINGS[definition.id]),
  )

  const stop = () => {
    setRecording(undefined)
    setHeld(NO_MODIFIERS)
    setFault(undefined)
  }
  const assign = (action: KeybindingId, shortcut: Shortcut | null) => {
    props.onChange(action, shortcut)
    setLanded(shortcut ? action : undefined)
    stop()
  }
  // Moving focus to the open row's own actions keeps it recording.
  const leaveRow = (event: ReactFocusEvent<HTMLElement>) => {
    const row = event.currentTarget.closest('.keybind-row')
    if (!row?.contains(event.relatedTarget as Node | null)) stop()
  }

  const record = (action: KeybindingId, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Tab and Shift+Tab still move on, to the row's own actions or back out.
    const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      stop()
      return
    }
    setHeld(heldModifiers(event, props.macOS))
    if (MODIFIER_KEYS.has(event.key)) {
      // Reaching for a modifier starts the next attempt, so the refused one goes.
      if (fault?.action === action) setFault(undefined)
      return
    }

    if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
      assign(action, null)
      return
    }

    const shortcut =
      props.macOS || !event.metaKey ? shortcutFromKeyboardEvent(event.nativeEvent) : undefined
    if (!shortcut) {
      setFault({
        action,
        text: t(
          props.macOS
            ? 'settings.keybinds.needModifier.mac'
            : 'settings.keybinds.needModifier.other',
        ),
      })
      return
    }
    // A binding saved there before this check still runs; pressing it again keeps it.
    const reserved = sameShortcut(props.keybindings[action], shortcut)
      ? undefined
      : reservedShortcutLabel(shortcut)
    if (reserved) {
      setFault({
        action,
        text: t('settings.keybinds.usedBy', { name: reserved }),
        attempt: shortcut,
      })
      return
    }
    const conflict = findKeybindingConflict(props.keybindings, action, shortcut)
    if (conflict) {
      setFault({
        action,
        text: t('settings.keybinds.usedBy', { name: t(conflict.labelKey) }),
        attempt: shortcut,
        conflict: conflict.id,
      })
      return
    }
    assign(action, shortcut)
  }

  // Row actions keep focus on the recorder, so pressing one does not blur
  // the row closed before its click lands.
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault()

  return (
    <SettingsPage
      title={t('settings.keybinds.title')}
      description={t('settings.keybinds.description')}
      actions={
        changed ? (
          <button
            className="set-button set-button--quiet"
            type="button"
            onClick={() => {
              props.onReset()
              setLanded(undefined)
              stop()
            }}
          >
            {t('settings.keybinds.restoreDefaults')}
          </button>
        ) : undefined
      }
    >
      <label className="keybind-settings__search">
        <Search className="keybind-settings__search-icon" size={14} stroke={1.75} aria-hidden />
        <input
          className="set-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('settings.keybinds.search.placeholder')}
          aria-label={t('settings.keybinds.search.label')}
          spellCheck={false}
        />
        {query ? (
          <button
            className="set-button set-button--quiet keybind-settings__search-clear"
            type="button"
            aria-label={t('settings.keybinds.search.clearLabel')}
            onClick={(event) => {
              setQuery('')
              event.currentTarget.parentElement?.querySelector('input')?.focus()
            }}
          >
            {t('settings.keybinds.clear')}
          </button>
        ) : null}
      </label>

      {GROUPS.map((group) => {
        const definitions = filtered.filter((definition) => definition.group === group)
        if (definitions.length === 0) return null
        return (
          <SettingsSection key={group} title={t(GROUP_KEYS[group])}>
            {definitions.map((definition) => {
              const shortcut = props.keybindings[definition.id]
              const fallback = DEFAULT_KEYBINDINGS[definition.id]
              const active = recording === definition.id
              const rowFault = fault?.action === definition.id ? fault : undefined
              const descriptionId = `keybind-description-${definition.id}`
              const messageId = `keybind-message-${definition.id}`
              // The shared leader carries the row's state: refused, recording, or not set.
              const tone = rowFault ? 'error' : active ? 'active' : shortcut ? undefined : 'muted'
              return (
                <div
                  className="set-row keybind-row"
                  data-settings-id={`keybind:${definition.id}`}
                  key={definition.id}
                  data-tone={tone}
                  data-recording={active || undefined}
                  data-landed={landed === definition.id || undefined}
                >
                  <p className="set-row__name keybind-row__name">{t(definition.labelKey)}</p>
                  <span className="set-leader" aria-hidden />
                  <button
                    className="keybind-recorder"
                    type="button"
                    aria-label={t('settings.keybinds.changeLabel', {
                      name: t(definition.labelKey),
                    })}
                    aria-pressed={active}
                    aria-describedby={`${descriptionId}${rowFault ? ` ${messageId}` : ''}`}
                    onClick={() => {
                      if (active) return
                      setRecording(definition.id)
                      setHeld(NO_MODIFIERS)
                      setFault(undefined)
                      setLanded(undefined)
                    }}
                    onKeyDown={(event) => {
                      if (active) record(definition.id, event)
                    }}
                    onKeyUp={(event) => {
                      if (active) setHeld(heldModifiers(event, props.macOS))
                    }}
                    onBlur={(event) => {
                      if (active) leaveRow(event)
                    }}
                  >
                    {active && rowFault?.attempt ? (
                      <Chord shortcut={rowFault.attempt} macOS={props.macOS} />
                    ) : active ? (
                      <LiveChord held={held} macOS={props.macOS} />
                    ) : shortcut ? (
                      <Chord
                        shortcut={shortcut}
                        macOS={props.macOS}
                        landed={landed === definition.id}
                      />
                    ) : (
                      <span className="keybind-recorder__empty">
                        {t('settings.keybinds.notSet')}
                      </span>
                    )}
                  </button>
                  <div className="keybind-row__detail">
                    <div className="keybind-row__detail-inner">
                      <p className="keybind-row__note" id={descriptionId}>
                        {t(definition.descriptionKey)}
                      </p>
                      {active ? (
                        <div className="keybind-row__line">
                          {rowFault ? (
                            <p className="keybind-row__message" id={messageId} role="alert">
                              {rowFault.text}
                            </p>
                          ) : (
                            <p className="keybind-row__hint">
                              {t(
                                props.macOS
                                  ? 'settings.keybinds.hint.mac'
                                  : 'settings.keybinds.hint.other',
                              )}
                            </p>
                          )}
                          <span
                            className="keybind-row__actions"
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.stopPropagation()
                                event.currentTarget
                                  .closest('.keybind-row')
                                  ?.querySelector<HTMLElement>('.keybind-recorder')
                                  ?.focus()
                                stop()
                              }
                            }}
                          >
                            {rowFault?.conflict && rowFault.attempt ? (
                              <button
                                className="set-button keybind-row__action"
                                type="button"
                                onMouseDown={keepFocus}
                                onBlur={leaveRow}
                                onClick={() => {
                                  props.onChange(rowFault.conflict!, null)
                                  assign(definition.id, rowFault.attempt!)
                                }}
                              >
                                {t('settings.keybinds.moveHere')}
                              </button>
                            ) : null}
                            {fallback && !sameShortcut(shortcut, fallback) ? (
                              <button
                                className="set-button set-button--quiet keybind-row__action"
                                type="button"
                                onMouseDown={keepFocus}
                                onBlur={leaveRow}
                                onClick={() => {
                                  const conflict = findKeybindingConflict(
                                    props.keybindings,
                                    definition.id,
                                    fallback,
                                  )
                                  if (conflict) props.onChange(conflict.id, null)
                                  assign(definition.id, { ...fallback })
                                }}
                              >
                                {t('settings.keybinds.restore', {
                                  shortcut: shortcutLabel(fallback, props.macOS),
                                })}
                              </button>
                            ) : null}
                            {shortcut ? (
                              <button
                                className="set-button set-button--quiet keybind-row__action"
                                type="button"
                                aria-label={t('settings.keybinds.clearLabel', {
                                  name: t(definition.labelKey),
                                })}
                                onMouseDown={keepFocus}
                                onBlur={leaveRow}
                                onClick={() => assign(definition.id, null)}
                              >
                                {t('settings.keybinds.clear')}
                              </button>
                            ) : null}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </SettingsSection>
        )
      })}

      {filtered.length === 0 ? (
        <div role="status">
          <SettingsEmpty
            icon={<Search stroke={1.75} />}
            title={t('settings.keybinds.noMatch', { query: query.trim() })}
          />
        </div>
      ) : null}
    </SettingsPage>
  )
}
