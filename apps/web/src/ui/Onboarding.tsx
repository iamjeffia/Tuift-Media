import type { ProviderStatus, ResultOf } from '@harness/contracts'
import {
  IconArrowLeft as ArrowLeft,
  IconCheck as Check,
  IconCornerDownLeft as CornerDownLeft,
  IconFolderOpen as FolderOpen,
  IconLock as Lock,
} from '@tabler/icons-react'
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import '../styles/onboarding.css'
import { buildEdition, isDesktop, setDesktopTheme } from '../bridge.js'
import { providerDisplayName, providerMark, type ProviderMark } from '../model-catalog.js'
import { agentMark, agentPresentation } from '../provider-presentation.js'
import {
  DIRECT_PROVIDERS,
  agentRosterKey,
  rosterAgent,
  type ProviderRoster,
} from '../provider-roster.js'
import { DARK_THEME_QUERY, type ThemePreference } from '../theme.js'
import { t, useI18n, type MessageKey } from '../i18n/index.js'
import { GeneratedAvatar } from './GeneratedAvatar.js'
import { OnboardingPreview, type PreviewAgent, type PreviewHint } from './OnboardingPreview.js'
import { ProviderIcon } from './ProviderIcon.js'
import { Skeleton, SkeletonGroup, SkeletonStatus } from './Skeleton.js'
import { useDialogFocus } from './dialog-focus.js'
import { catchIn, fly, flyText, morphInto, prefersReducedMotion } from './onboarding-motion.js'
import type { Transport } from '../transport.js'

const STEPS = [
  { id: 'welcome', label: 'onboarding.step.welcome', hint: undefined },
  { id: 'name', label: 'onboarding.step.name', hint: 'profile' },
  { id: 'appearance', label: 'onboarding.step.appearance', hint: undefined },
  { id: 'providers', label: 'onboarding.step.agents', hint: 'model' },
  { id: 'subagents', label: 'onboarding.step.subagents', hint: undefined },
  { id: 'project', label: 'onboarding.step.project', hint: undefined },
] as const satisfies ReadonlyArray<{
  id: string
  label: MessageKey
  hint: PreviewHint | undefined
}>
type StepId = (typeof STEPS)[number]['id']

/** One provider or ACP agent the agents page offers, keyed as the roster keys it. */
type PickEntry = {
  key: string
  name: string
  maker: string | undefined
  mark: ProviderMark
  state: string
  installed: boolean
}

const THEME_CHOICES = [
  { value: 'system', label: 'onboarding.theme.system', note: 'onboarding.theme.systemNote' },
  { value: 'light', label: 'onboarding.theme.light', note: 'onboarding.theme.lightNote' },
  { value: 'dark', label: 'onboarding.theme.dark', note: 'onboarding.theme.darkNote' },
] as const satisfies ReadonlyArray<{
  value: ThemePreference
  label: MessageKey
  note: MessageKey
}>

const PREVIEW = '.onboarding__preview'

const SUBAGENT_CHOICES = [
  { allowed: true, label: 'onboarding.subagents.allow', note: 'onboarding.subagents.allowNote' },
  { allowed: false, label: 'onboarding.subagents.ask', note: 'onboarding.subagents.askNote' },
] as const satisfies ReadonlyArray<{ allowed: boolean; label: MessageKey; note: MessageKey }>

type Readiness = { label: string; tone: 'ready' | 'pending' | 'checking' }

/** One honest line per plan, derived from what the vendor binary told us. */
export function providerReadiness(status: ProviderStatus | undefined): Readiness {
  if (!status) return { label: t('onboarding.readiness.checking'), tone: 'checking' }
  if (!status.installed) return { label: t('onboarding.readiness.notInstalled'), tone: 'pending' }
  if (status.problem) return { label: t('onboarding.readiness.attention'), tone: 'pending' }
  if (status.auth === 'unauthenticated') {
    return { label: t('onboarding.readiness.signIn'), tone: 'pending' }
  }
  const signedIn = status.auth === 'authenticated'
  return {
    label: t(signedIn ? 'onboarding.readiness.signedIn' : 'onboarding.readiness.installed'),
    tone: 'ready',
  }
}

const prefersDark = () => window.matchMedia?.(DARK_THEME_QUERY).matches ?? false

/** Settles on the next change of the OS colour-scheme query, or after `timeout`. */
function schemeChange(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const media = window.matchMedia?.(DARK_THEME_QUERY)
    const finish = () => {
      media?.removeEventListener('change', finish)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, timeout)
    media?.addEventListener('change', finish)
  })
}

/** Settles once the page's theme attribute leaves `before`, or after `timeout`. */
function themeChange(root: HTMLElement, before: string | undefined, timeout: number) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      observer.disconnect()
      window.clearTimeout(timer)
      resolve()
    }
    const observer = new MutationObserver(() => {
      if (root.dataset.theme !== before) finish()
    })
    const timer = window.setTimeout(finish, timeout)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  })
}

/**
 * First-run setup. Full-window and paged on purpose: each step asks one
 * question, applies its answer immediately (name, theme) and never blocks —
 * every page can be skipped and everything here is reachable again in Settings.
 * Beside the pages sits the app itself, drawn small; answers travel into it,
 * and when setup ends it opens up into the real thing.
 */
export function Onboarding(props: {
  displayName?: string | undefined
  onDisplayNameChange?: ((name: string) => void) | undefined
  themePreference: ThemePreference
  onThemePreferenceChange: (theme: ThemePreference) => void
  providerStatuses: ProviderStatus[]
  /** True until the server first answers which providers this build offers. */
  providersLoading: boolean
  /** Why that answer failed, when it never came. */
  providersError?: string | undefined
  /** Undefined until the server has listed them. */
  acpAgents: ResultOf<'acp.agents'>['agents'] | undefined
  /** What is added so far; the agents page adds to it and takes away from it. */
  providerRoster: ProviderRoster
  onProviderRosterChange: (roster: ProviderRoster) => void
  onAddProject: () => void
  onDismiss: () => void
  /** Reads and stores the sub-agent provider answer; without it the page only moves on. */
  transport?: Transport | undefined
  /** Kept mounted but hidden while Settings sits on top, so the page survives the round trip. */
  hidden?: boolean | undefined
  /** Setup is no longer needed — a project arrived — so the page plays its way out. */
  finished?: boolean | undefined
}) {
  const { t, tp } = useI18n()
  const [index, setIndex] = useState(0)
  // The furthest page visited: the progress dots let the user jump back to
  // any page already seen.
  const [reached, setReached] = useState(0)
  // The page the user asked for while the current one is still animating out.
  // The swap happens when that animation ends, so the old page leaves before
  // the new one arrives instead of both fighting over the same frame.
  const [pending, setPending] = useState<number>()
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [closing, setClosing] = useState(false)
  // How the page leaves: the preview morphing into the app, or a plain fade
  // where that cannot play (preview hidden, reduced motion).
  const [exit, setExit] = useState<'morph' | 'fade'>()
  const [enterHeld, setEnterHeld] = useState(false)
  // The welcome page's start animation ends at once on the first click or key.
  const [introSkipped, setIntroSkipped] = useState(false)
  // What the preview has been handed so far: the name as of the last time the
  // name page was left, and the agents that have flown into its model picker.
  const [shownName, setShownName] = useState(props.displayName ?? '')
  const [receivingName, setReceivingName] = useState(false)
  const [landed, setLanded] = useState<readonly string[]>(props.providerRoster)
  const [arriving, setArriving] = useState<readonly string[]>([])
  // The theme card just chosen, shown selected while the desktop shell is
  // still letting go of its pinned scheme.
  const [themeChoice, setThemeChoice] = useState<ThemePreference>()
  // The pointer or focus is on Choose a folder: the preview's waiting project
  // row reacts before anything is chosen.
  const [pointingFolder, setPointingFolder] = useState(false)
  // Undefined until the user answers here or answered before; nothing is preselected.
  const [otherProviders, setOtherProviders] = useState<boolean>()
  const [subagentError, setSubagentError] = useState<string>()
  const step: StepId = STEPS[index]?.id ?? 'welcome'
  const leaving = pending !== undefined
  const titleId = useId()
  const nameId = useId()
  const stepRef = useRef<HTMLElement>(null)
  const revealFrom = useRef<{ x: number; y: number }>(undefined)
  const themeRequest = useRef(0)
  const onDismiss = useRef(props.onDismiss)
  onDismiss.current = props.onDismiss
  const dismiss = () => setClosing(true)
  const dialog = useDialogFocus<HTMLDivElement>(dismiss)
  // Each page names one element to land focus on: its input when it has one,
  // otherwise the heading, so screen readers hear where the page went.
  const focusTarget = useRef<HTMLElement | null>(null)
  const setFocusTarget = (node: HTMLElement | null) => {
    focusTarget.current = node
  }

  // The agents page shows its list once all of it is known, so no row is
  // added, dropped or relabelled after it appears. A list that never comes
  // ends in the server's error instead of placeholders.
  const listState: 'loading' | 'ready' | 'failed' =
    props.providersError !== undefined
      ? 'failed'
      : props.providersLoading || props.acpAgents === undefined
        ? 'loading'
        : 'ready'
  // Every provider the server reports, and only those.
  const direct: PickEntry[] = DIRECT_PROVIDERS.filter((entry) =>
    props.providerStatuses.some((status) => status.id === entry.id),
  ).map((entry) => {
    const status = props.providerStatuses.find((candidate) => candidate.id === entry.id)
    const readiness = providerReadiness(status)
    return {
      key: entry.id,
      name: providerDisplayName(entry.id),
      maker: entry.maker,
      mark: providerMark(entry.id),
      state: readiness.label,
      installed: status?.installed ?? true,
    }
  })
  const agents: PickEntry[] = (props.acpAgents ?? []).map((agent) => ({
    key: agentRosterKey(agent.id),
    name: agent.name,
    maker: agent.maker,
    mark: agentMark(agent.id),
    state: t(
      agent.installed ? 'onboarding.readiness.installed' : 'onboarding.readiness.notInstalled',
    ),
    installed: agent.installed,
  }))
  const offered = [...direct, ...agents]
  const addedCount = props.providerRoster.length
  const profileName = props.displayName?.trim() || 'Local profile'
  const selectedTheme = themeChoice ?? props.themePreference

  useEffect(() => {
    focusTarget.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    if (props.finished) setClosing(true)
  }, [props.finished])

  const transport = props.transport
  useEffect(() => {
    if (!transport) return
    let cancelled = false
    void Promise.resolve(transport.request('subagents.settings', {}))
      .then((settings) => {
        if (!cancelled) setOtherProviders(settings?.otherProviders)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [transport])

  const chooseSubagents = async (allowed: boolean) => {
    setOtherProviders(allowed)
    setSubagentError(undefined)
    if (!transport) return
    try {
      const settings = await transport.request('subagents.updateSettings', {
        otherProviders: allowed,
      })
      setOtherProviders(settings.otherProviders)
    } catch (cause) {
      setSubagentError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const settle = (next: number) => {
    setIndex(next)
    setReached((furthest) => Math.max(furthest, next))
    setPending(undefined)
  }

  // Without a running exit animation (reduced motion that removed it, a
  // hidden page, a test DOM) the swap must not wait for an event that never
  // comes; with one, a timer still guards against a lost animationend.
  useEffect(() => {
    if (pending === undefined) return
    if (!stepRef.current?.getAnimations?.().length) {
      settle(pending)
      return
    }
    const timer = window.setTimeout(() => settle(pending), 400)
    return () => window.clearTimeout(timer)
  }, [pending])

  // Chosen before paint, so the page never starts one exit and switches to
  // the other.
  useLayoutEffect(() => {
    if (!closing) return
    const morph = morphInto(dialog.panel.current, () => flushSync(() => onDismiss.current()))
    setExit(morph ? 'morph' : 'fade')
  }, [closing, dialog.panel])

  useEffect(() => {
    if (exit !== 'fade') return
    const node = dialog.panel.current
    if (!node?.getAnimations?.().length) {
      onDismiss.current()
      return
    }
    const finish = (event?: AnimationEvent) => {
      if (event && event.target !== node) return
      window.clearTimeout(timer)
      node.removeEventListener('animationend', finish)
      onDismiss.current()
    }
    const timer = window.setTimeout(finish, 400)
    node.addEventListener('animationend', finish)
    return () => {
      window.clearTimeout(timer)
      node.removeEventListener('animationend', finish)
    }
  }, [exit, dialog.panel])

  useEffect(() => {
    if (!enterHeld) return
    const timer = window.setTimeout(() => setEnterHeld(false), 180)
    return () => window.clearTimeout(timer)
  }, [enterHeld])

  // An agent added on its page leaves its row for the preview's model
  // picker; one taken away again simply goes.
  const sendAgent = (key: string) => {
    const root = dialog.panel.current
    // The picker makes room first, so the flight has a place to aim for.
    flushSync(() => setArriving((list) => [...list, key]))
    void fly(
      root?.querySelector(`.onboarding__pick-row[data-plan="${key}"] .onboarding__pick-mark svg`),
      root?.querySelector(`${PREVIEW} [data-land="agent-${key}"] svg`),
      root,
      { duration: 820 },
    ).then(() => {
      setArriving((list) => list.filter((entry) => entry !== key))
      setLanded((list) => (list.includes(key) ? list : [...list, key]))
      catchIn(root?.querySelector(`${PREVIEW} [data-land="model"]`))
    })
  }
  const toggleAgent = (key: string) => {
    if (props.providerRoster.includes(key)) {
      props.onProviderRosterChange(props.providerRoster.filter((entry) => entry !== key))
      setLanded((list) => list.filter((entry) => entry !== key))
      setArriving((list) => list.filter((entry) => entry !== key))
      return
    }
    props.onProviderRosterChange([...props.providerRoster, key])
    sendAgent(key)
  }

  // Leaving the name page forward hands the answer over: the picture and the
  // typed name travel into the preview's profile row, which lets go of the
  // old ones as they come.
  const handOverName = (forward: boolean) => {
    const value = props.displayName ?? ''
    const root = dialog.panel.current
    const preview = root?.querySelector(PREVIEW)
    if (!forward || !root || !preview) {
      setShownName(value)
      return
    }
    setReceivingName(true)
    void Promise.all([
      fly(
        root.querySelector('.onboarding__avatar'),
        preview.querySelector('[data-land="avatar"]'),
        root,
        {
          duration: 820,
        },
      ),
      flyText(
        value.trim(),
        root.querySelector<HTMLInputElement>('.onboarding__field input'),
        preview.querySelector('[data-land="name"]'),
        root,
      ),
    ]).then(() => {
      setShownName(value)
      setReceivingName(false)
      catchIn(preview.querySelector('[data-land="profile"]'))
    })
  }

  const go = (next: number) => {
    const clamped = Math.min(STEPS.length - 1, Math.max(0, next))
    if (clamped === index || leaving || closing) return
    if (step === 'name') handOverName(clamped > index)
    setPointingFolder(false)
    setDirection(clamped > index ? 'forward' : 'back')
    setPending(clamped)
  }
  const advance = () => {
    if (leaving || closing) return
    if (step === 'project') props.onAddProject()
    else go(index + 1)
  }

  // The new theme spreads out from the card that chose it, as a circle over
  // a snapshot of the old one. Skipped where it would show nothing: no View
  // Transitions, reduced motion, or a choice that lands on the same scheme.
  const chooseTheme = async (value: ThemePreference, anchor: HTMLElement) => {
    const origin = revealFrom.current
    revealFrom.current = undefined
    if (value === selectedTheme) return
    const request = ++themeRequest.current
    const root = document.documentElement
    const animate = typeof document.startViewTransition === 'function' && !prefersReducedMotion()
    const apply = () => {
      props.onThemePreferenceChange(value)
      setThemeChoice(undefined)
      // Only a pending System choice gets past the guard above with the theme
      // already in force. It let the shell go, and an unchanged preference
      // gives the app no reason to pin it again.
      if (isDesktop && value === props.themePreference) {
        void setDesktopTheme(value).catch(() => undefined)
      }
    }
    // In the desktop shell a pinned Light or Dark also pins what the page is
    // told the OS prefers, so where System lands is unknown until the shell
    // lets go. Let go first; the reveal then shows whatever the OS shows.
    if (value === 'system' && isDesktop && animate) {
      setThemeChoice(value)
      const settled = schemeChange(180)
      await setDesktopTheme('system').catch(() => undefined)
      await settled
      if (request !== themeRequest.current) return
    }
    const before = root.dataset.theme
    const resolved = value === 'system' ? (prefersDark() ? 'dark' : 'light') : value
    if (!animate || before === resolved) {
      apply()
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = window.innerWidth
    const height = window.innerHeight
    const x = origin?.x ?? rect.left + rect.width / 2
    const y = origin?.y ?? rect.top + rect.height / 2
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
    // Percentages of the snapshot, not pixels: on a high-density display
    // Chromium can lay the snapshot out in device pixels and scale it down,
    // which halves a pixel origin. A circle's percentage radius resolves
    // against the box diagonal divided by √2.
    root.style.setProperty('--theme-reveal-x', `${(x / width) * 100}%`)
    root.style.setProperty('--theme-reveal-y', `${(y / height) * 100}%`)
    root.style.setProperty(
      '--theme-reveal-r',
      `${(radius / (Math.hypot(width, height) / Math.SQRT2)) * 100}%`,
    )
    root.dataset.themeReveal = ''
    const transition = document.startViewTransition(() => {
      flushSync(apply)
      // The attribute is written in a layout effect; should the app take a
      // beat longer, hold the snapshot until it has.
      return root.dataset.theme === before ? themeChange(root, before, 200) : undefined
    })
    void transition.finished.finally(() => {
      delete root.dataset.themeReveal
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    dialog.onKeyDown(event)
    if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return
    const target = event.target instanceof HTMLElement ? event.target : null
    // The on-screen key presses along with the physical one; the button
    // itself already fires on Enter when it has focus.
    if (target?.closest('.onboarding__primary')) {
      setEnterHeld(true)
      return
    }
    // Other buttons and links already act on Enter; only bare surfaces and inputs advance.
    if (target?.closest('button, a, textarea')) return
    event.preventDefault()
    setEnterHeld(true)
    advance()
  }

  // An agent added on an earlier visit is drawn from what the app already
  // knows about it wherever the list does not offer it, so the preview's
  // model picker shows it from the first frame and keeps it when the list
  // arrives instead of filling in or dropping it then.
  const knownAgent = (key: string): { name: string; mark: ProviderMark } | undefined => {
    const agentId = rosterAgent(key)
    if (agentId !== undefined) {
      const known = agentPresentation(agentId)
      return { name: known.label, mark: known.mark }
    }
    const provider = DIRECT_PROVIDERS.find((entry) => entry.id === key)
    return provider
      ? { name: providerDisplayName(provider.id), mark: providerMark(provider.id) }
      : undefined
  }
  const previewAgent = (key: string, arriving?: boolean): PreviewAgent[] => {
    const entry = offered.find((candidate) => candidate.key === key) ?? knownAgent(key)
    return entry ? [{ id: key, name: entry.name, mark: entry.mark, arriving }] : []
  }
  const previewAgents: PreviewAgent[] = [
    ...landed
      .filter((key) => props.providerRoster.includes(key))
      .flatMap((key) => previewAgent(key)),
    ...arriving.filter((key) => !landed.includes(key)).flatMap((key) => previewAgent(key, true)),
  ]
  const preview = { name: shownName, agents: previewAgents }

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-step={step}
      data-intro={introSkipped ? 'skipped' : undefined}
      onPointerDownCapture={() => setIntroSkipped(true)}
      onKeyDownCapture={() => setIntroSkipped(true)}
      data-closing={closing || undefined}
      data-exit={exit}
      hidden={props.hidden}
      ref={dialog.panel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="onboarding__titlebar" aria-hidden />

      <header className="onboarding__bar">
        <div className="onboarding__brand">
          <TuiftMark size={15} />
          <span>TUIFT Code</span>
        </div>
        <ol className="onboarding__progress" aria-label={t('onboarding.progress.label')}>
          {STEPS.map((entry, position) => {
            const current = position === index
            const label = <span className="visually-hidden">{t(entry.label)}</span>
            return (
              <li
                key={entry.id}
                className={position <= index ? 'is-done' : undefined}
                aria-current={current ? 'step' : undefined}
              >
                {!current && position <= reached ? (
                  <button type="button" data-label={t(entry.label)} onClick={() => go(position)}>
                    {label}
                  </button>
                ) : (
                  label
                )}
              </li>
            )
          })}
        </ol>
        <div className="onboarding__bar-end">
          {step !== 'project' ? (
            <button className="ghost onboarding__skip" type="button" onClick={dismiss}>
              {t('onboarding.skip')}
            </button>
          ) : null}
        </div>
      </header>

      <div className="onboarding__body">
        <div className="onboarding__layout">
          <section
            className="onboarding__step"
            key={step}
            ref={stepRef}
            data-direction={direction}
            data-phase={leaving ? 'leaving' : 'entering'}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget || pending === undefined) return
              settle(pending)
            }}
          >
            {step === 'welcome' ? (
              <>
                <TuiftMark className="onboarding__mark" size={40} />
                <h1
                  className="onboarding__title onboarding__title--display"
                  id={titleId}
                  ref={setFocusTarget}
                  tabIndex={-1}
                >
                  <Words text={t('onboarding.welcome.title')} />
                </h1>
                <p className="onboarding__lead">{t('onboarding.welcome.lead')}</p>
                <footer className="onboarding__actions">
                  <PrimaryButton onClick={advance} pressed={enterHeld}>
                    {t('onboarding.welcome.start')}
                  </PrimaryButton>
                </footer>
              </>
            ) : null}

            {step === 'name' ? (
              <>
                <AvatarMorph name={profileName} />
                <h1 className="onboarding__title" id={titleId}>
                  {t('onboarding.name.title')}
                </h1>
                <p className="onboarding__lead">{t('onboarding.name.lead')}</p>
                <div className="onboarding__field">
                  <label className="visually-hidden" htmlFor={nameId}>
                    {t('onboarding.name.label')}
                  </label>
                  <input
                    id={nameId}
                    ref={setFocusTarget}
                    autoComplete="nickname"
                    spellCheck={false}
                    maxLength={64}
                    value={props.displayName ?? ''}
                    onChange={(event) => props.onDisplayNameChange?.(event.target.value)}
                    placeholder="Ada Lovelace"
                  />
                </div>
                <StepActions onBack={() => go(index - 1)} onNext={advance} pressed={enterHeld} />
              </>
            ) : null}

            {step === 'appearance' ? (
              <>
                <h1 className="onboarding__title" id={titleId} ref={setFocusTarget} tabIndex={-1}>
                  {t('onboarding.appearance.title')}
                </h1>
                <p className="onboarding__lead">{t('onboarding.appearance.lead')}</p>
                <fieldset className="onboarding__themes">
                  <legend className="visually-hidden">{t('onboarding.appearance.legend')}</legend>
                  {THEME_CHOICES.map((choice) => {
                    const selected = selectedTheme === choice.value
                    return (
                      <label
                        className={`onboarding__theme${selected ? ' is-selected' : ''}`}
                        key={choice.value}
                        onPointerDown={(event) => {
                          revealFrom.current = { x: event.clientX, y: event.clientY }
                        }}
                      >
                        <input
                          type="radio"
                          name="onboarding-theme"
                          value={choice.value}
                          checked={selected}
                          onChange={(event) =>
                            void chooseTheme(
                              choice.value,
                              event.currentTarget.closest('label') ?? event.currentTarget,
                            )
                          }
                        />
                        <span className="onboarding__theme-frame">
                          {choice.value === 'system' ? (
                            <>
                              <OnboardingPreview {...preview} scheme="light" still />
                              <span className="onboarding__theme-half">
                                <OnboardingPreview {...preview} scheme="dark" still />
                              </span>
                            </>
                          ) : (
                            <OnboardingPreview {...preview} scheme={choice.value} still />
                          )}
                          <span className="onboarding__theme-check">
                            <Check size={11} stroke={3} />
                          </span>
                        </span>
                        <span className="onboarding__theme-label">{t(choice.label)}</span>
                        <span className="onboarding__theme-note">{t(choice.note)}</span>
                      </label>
                    )
                  })}
                </fieldset>
                <StepActions onBack={() => go(index - 1)} onNext={advance} pressed={enterHeld} />
              </>
            ) : null}

            {step === 'providers' ? (
              <>
                <h1 className="onboarding__title" id={titleId} ref={setFocusTarget} tabIndex={-1}>
                  {t('onboarding.agents.title')}
                </h1>
                {/* Counted from what is added, which is known from the first
                    frame, so the line stays put while the list loads. */}
                <p className="onboarding__lead" role="status">
                  {listState === 'failed'
                    ? props.providersError
                    : addedCount === 0
                      ? t('onboarding.agents.empty')
                      : tp('onboarding.agents.added', addedCount)}
                </p>
                <div className="onboarding__pick">
                  {listState === 'loading'
                    ? (buildEdition === 'release' ? RELEASE_PICK_SKELETON : FULL_PICK_SKELETON).map(
                        (group, index) => (
                          <PickGroupSkeleton
                            key={group.title}
                            title={t(group.title)}
                            rows={group.rows}
                            announce={index === 0}
                          />
                        ),
                      )
                    : null}
                  {listState === 'ready' ? (
                    <>
                      <PickGroup
                        title={t('onboarding.agents.providers')}
                        entries={direct}
                        roster={props.providerRoster}
                        onToggle={toggleAgent}
                      />
                      <PickGroup
                        title={t('onboarding.agents.acp')}
                        entries={agents}
                        roster={props.providerRoster}
                        onToggle={toggleAgent}
                      />
                    </>
                  ) : null}
                </div>
                <StepActions onBack={() => go(index - 1)} onNext={advance} pressed={enterHeld} />
              </>
            ) : null}

            {step === 'subagents' ? (
              <>
                <h1 className="onboarding__title" id={titleId} ref={setFocusTarget} tabIndex={-1}>
                  {t('onboarding.subagents.title')}
                </h1>
                <p className="onboarding__lead">{t('onboarding.subagents.lead')}</p>
                {subagentError ? (
                  <p className="onboarding__lead" role="alert">
                    {subagentError}
                  </p>
                ) : null}
                <div className="onboarding__pick">
                  <ul
                    className="onboarding__picks onboarding__picks--notes"
                    role="radiogroup"
                    aria-label={t('onboarding.subagents.title')}
                  >
                    {SUBAGENT_CHOICES.map((choice) => {
                      // Unanswered counts as not allowed, so that choice shows as the one in
                      // effect; nothing is stored until the user picks.
                      const selected = (otherProviders ?? false) === choice.allowed
                      return (
                        <li
                          className="onboarding__pick-row"
                          data-added={selected || undefined}
                          key={choice.label}
                        >
                          <label>
                            <input
                              className="visually-hidden"
                              type="radio"
                              name="onboarding-subagents"
                              checked={selected}
                              onChange={() => void chooseSubagents(choice.allowed)}
                            />
                            <span className="onboarding__pick-name">{t(choice.label)}</span>
                            <span className="onboarding__pick-wire" aria-hidden />
                            <span className="onboarding__pick-state">{t(choice.note)}</span>
                            <span className="onboarding__pick-socket" aria-hidden />
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                <StepActions onBack={() => go(index - 1)} onNext={advance} pressed={enterHeld} />
              </>
            ) : null}

            {step === 'project' ? (
              <>
                <h1 className="onboarding__title" id={titleId} ref={setFocusTarget} tabIndex={-1}>
                  {t('onboarding.project.title')}
                </h1>
                <p className="onboarding__lead">{t('onboarding.project.lead')}</p>
                <p className="onboarding__note">
                  <Lock size={15} aria-hidden />
                  <span>{t('onboarding.project.note')}</span>
                </p>
                <footer className="onboarding__actions onboarding__actions--split">
                  <BackButton onClick={() => go(index - 1)} />
                  <div className="onboarding__actions-end">
                    <button className="ghost onboarding__ghost" type="button" onClick={dismiss}>
                      {t('onboarding.project.skip')}
                    </button>
                    <PrimaryButton
                      onClick={props.onAddProject}
                      onPoint={setPointingFolder}
                      icon={<FolderOpen size={15} aria-hidden />}
                      pressed={enterHeld}
                    >
                      {t('onboarding.project.choose')}
                    </PrimaryButton>
                  </div>
                </footer>
              </>
            ) : null}
          </section>

          <div className="onboarding__preview" data-receiving={receivingName || undefined}>
            <OnboardingPreview
              {...preview}
              hint={STEPS[index]?.hint}
              newProject={step === 'project' ? (pointingFolder ? 'ready' : 'open') : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Words arrive one by one, each sharpening out of a blur as it settles. */
function Words(props: { text: string }) {
  return props.text.split(' ').map((word, position) => (
    <Fragment key={position}>
      {position > 0 ? ' ' : null}
      <span className="onboarding__word" style={{ '--word': position } as CSSProperties}>
        {word}
      </span>
    </Fragment>
  ))
}

/**
 * The identicon redraws as the name is typed. The new picture resolves over
 * the previous one instead of replacing it, so fast typing reads as one image
 * shifting rather than a string of flashes.
 */
function AvatarMorph(props: { name: string }) {
  const [layers, setLayers] = useState(() => [{ id: 0, name: props.name }])
  const top = layers[layers.length - 1]!
  if (top.name !== props.name) setLayers([top, { id: top.id + 1, name: props.name }])
  return (
    <div className="onboarding__avatar" aria-hidden>
      {layers.map((layer) => (
        <span className="onboarding__avatar-art" key={layer.id}>
          <GeneratedAvatar name={layer.name} />
        </span>
      ))}
    </div>
  )
}

/**
 * One group of the agents page, each agent a line in the same language as the
 * provider roster: its name, a dotted leader and an empty socket like the one
 * in the preview's model picker. Picking it runs the wire solid into the
 * socket, which fills, while the agent itself flies into the preview.
 */
function PickGroup(props: {
  title: string
  entries: readonly PickEntry[]
  roster: ProviderRoster
  onToggle: (key: string) => void
}) {
  const titleId = useId()
  if (props.entries.length === 0) return null
  return (
    <section className="onboarding__pick-group" aria-labelledby={titleId}>
      <h2 className="onboarding__pick-title" id={titleId}>
        {props.title}
      </h2>
      <ul className="onboarding__picks">
        {props.entries.map((entry) => {
          const added = props.roster.includes(entry.key)
          return (
            <li
              className="onboarding__pick-row"
              data-plan={entry.key}
              data-added={added || undefined}
              data-missing={entry.installed ? undefined : true}
              key={entry.key}
            >
              <label title={entry.maker}>
                <input
                  className="visually-hidden"
                  type="checkbox"
                  checked={added}
                  onChange={() => props.onToggle(entry.key)}
                />
                <span className="onboarding__pick-mark">
                  <ProviderIcon mark={entry.mark} size={16} />
                </span>
                <span className="onboarding__pick-name">{entry.name}</span>
                <span className="onboarding__pick-wire" aria-hidden />
                <span className="onboarding__pick-state">{entry.state}</span>
                <span className="onboarding__pick-socket" aria-hidden />
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type PickSkeletonGroup = { title: MessageKey; rows: number }
// A release build lists five providers and no ACP library, so its answer
// fills these lines in without moving the page.
const RELEASE_PICK_SKELETON: readonly PickSkeletonGroup[] = [
  { title: 'onboarding.agents.providers', rows: 5 },
]
// Every other build lists every provider and then the ACP library, which
// runs past the list's tallest max height. Eight agent lines do as well, so
// the list area already has the height the answer keeps.
const FULL_PICK_SKELETON: readonly PickSkeletonGroup[] = [
  { title: 'onboarding.agents.providers', rows: DIRECT_PROVIDERS.length },
  { title: 'onboarding.agents.acp', rows: 8 },
]
// Fixed widths: a placeholder that reshuffles between renders jitters.
const PICK_SKELETON_NAME_WIDTHS = [52, 88, 40] as const
const PICK_SKELETON_STATE_WIDTHS = [48, 60, 40] as const

/**
 * A group of the agents list before the server has said what it offers: the
 * same lines, with bars where each mark, name and state will be. The first
 * group announces the loading line in place of the list.
 */
function PickGroupSkeleton(props: { title: string; rows: number; announce: boolean }) {
  const { t } = useI18n()
  const titleId = useId()
  const lines = Array.from({ length: props.rows }, (_, index) => (
    <div className="onboarding__pick-row" key={index} aria-hidden>
      <span className="onboarding__pick-line">
        <Skeleton className="skeleton--block" width={16} height={16} />
        <Skeleton
          className="onboarding__pick-name-bar"
          width={PICK_SKELETON_NAME_WIDTHS[index % PICK_SKELETON_NAME_WIDTHS.length]}
        />
        <span className="onboarding__pick-wire" />
        <Skeleton
          className="onboarding__pick-state-bar"
          width={PICK_SKELETON_STATE_WIDTHS[index % PICK_SKELETON_STATE_WIDTHS.length]}
        />
        <span className="onboarding__pick-socket" />
      </span>
    </div>
  ))
  return (
    <section className="onboarding__pick-group" aria-labelledby={titleId}>
      <h2 className="onboarding__pick-title" id={titleId}>
        {props.title}
      </h2>
      {props.announce ? (
        <SkeletonStatus label={t('onboarding.agents.loading')} className="onboarding__picks">
          {lines}
        </SkeletonStatus>
      ) : (
        <SkeletonGroup className="onboarding__picks">{lines}</SkeletonGroup>
      )}
    </section>
  )
}

function StepActions(props: { onBack: () => void; onNext: () => void; pressed: boolean }) {
  const { t } = useI18n()
  return (
    <footer className="onboarding__actions onboarding__actions--split">
      <BackButton onClick={props.onBack} />
      <PrimaryButton onClick={props.onNext} pressed={props.pressed}>
        {t('onboarding.continue')}
      </PrimaryButton>
    </footer>
  )
}

function BackButton(props: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button className="ghost onboarding__ghost" type="button" onClick={props.onClick}>
      <ArrowLeft size={14} aria-hidden />
      {t('onboarding.back')}
    </button>
  )
}

function PrimaryButton(props: {
  onClick: () => void
  /** Told when the pointer or keyboard focus arrives on the button and leaves it. */
  onPoint?: ((pointing: boolean) => void) | undefined
  icon?: ReactNode
  pressed?: boolean | undefined
  children: string
}) {
  return (
    <button
      className="btn onboarding__primary"
      type="button"
      onClick={props.onClick}
      onPointerEnter={() => props.onPoint?.(true)}
      onPointerLeave={() => props.onPoint?.(false)}
      onFocus={() => props.onPoint?.(true)}
      onBlur={() => props.onPoint?.(false)}
    >
      {props.icon}
      {props.children}
      <kbd aria-hidden data-pressed={props.pressed || undefined}>
        <CornerDownLeft size={12} />
      </kbd>
    </button>
  )
}

/**
 * The TUIFT Code T mark reduced to its silhouette, in the current text colour.
 * Children order matters to the welcome animation: path 1 drops in (the play
 * seal) and path 3 rises (the T); the mask sits between them. The T is drawn
 * already tilted, so the seal's cut-out and the eyes share one coordinate space.
 */
function TuiftMark(props: { size?: number | undefined; className?: string | undefined }) {
  const size = props.size ?? 16
  const maskId = `tuift-mark-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg
      className={props.className}
      width={size}
      height={size}
      viewBox="4 4 96 96"
      fill="currentColor"
      aria-hidden
    >
      <path fillRule="evenodd" d="M53 69a13 13 0 1 1 0 26a13 13 0 1 1 0-26zM49.5 75.5v13l10-6.5z" />
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="110" height="110">
        <rect width="110" height="110" fill="#fff" />
        <rect
          x="38.9"
          y="18"
          width="7.2"
          height="15"
          rx="3.6"
          transform="rotate(-6 50 50) rotate(-10 42.5 25.5)"
          fill="#000"
        />
        <rect
          x="53.9"
          y="18"
          width="7.2"
          height="15"
          rx="3.6"
          transform="rotate(-6 50 50) rotate(-10 57.5 25.5)"
          fill="#000"
        />
        <circle cx="53" cy="82" r="17" fill="#000" />
      </mask>
      <path
        mask={`url(#${maskId})`}
        d="M18.18 15.13L73.87 9.28A10 10 0 0 1 84.87 18.18L85.60 25.14A10 10 0 0 1 76.70 36.13L21.00 41.99A10 10 0 0 1 10.01 33.09L9.28 26.13A10 10 0 0 1 18.18 15.13ZM43.17 18.54L50.14 17.81A10 10 0 0 1 61.13 26.71L65.31 66.49A10 10 0 0 1 56.41 77.48L49.45 78.21A10 10 0 0 1 38.46 69.31L34.27 29.53A10 10 0 0 1 43.17 18.54Z"
      />
    </svg>
  )
}
