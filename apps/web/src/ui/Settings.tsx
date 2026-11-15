import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { RowIssue } from './RowIssue.js'
import { surfaceLoadFailed } from '../surface-load-error.js'
import { AppearanceColorPicker } from './AppearanceColorPicker.js'
import { AppBackgroundSettings } from './AppBackgroundSettings.js'
import {
  accentColor,
  backdropColor,
  backdropColorScheme,
  colorForeground,
} from '../theme-colors.js'
import {
  formatModelName,
  getFastModeOffValue,
  getFastServiceTier,
  getFriendlyEffortLabel,
  getNextServiceTierForModel,
  isFastModeEnabled,
} from './model-selector-utils.js'
import { BackgroundModelSettingsSchema, DEFAULT_ACCOUNT_ID } from '@harness/contracts'
import '../styles/sheet.css'
import '../styles/switch.css'
import '../styles/settings.css'
import type {
  Account,
  ApprovalMode,
  DetectedAccountHome,
  BackgroundModelSettings as BackgroundModelSettingsState,
  BackgroundModelSource,
  BackgroundModelTarget,
  DataOf,
  ProviderAccount,
  ProviderId,
  ProviderStatus,
  ResultOf,
  SidebarSettings,
} from '@harness/contracts'
import { z } from 'zod'
import {
  IconChartBar as BarChart3,
  IconChevronDown as ChevronDown,
  IconCircleMinus as CircleMinus,
  IconCirclePlus as CirclePlus,
  IconArrowLeft as ArrowLeft,
  IconUserCircle as CircleUserRound,
  IconBlocks as Blocks,
  IconBug as Bug,
  IconDatabase as Database,
  IconFileImport as FileImport,
  IconDeviceMobile as Smartphone,
  IconInfoCircle as Info,
  IconPackages as Boxes,
  IconKeyboard as Keyboard,
  IconNetwork as Network,
  IconPalette as Palette,
  IconLayoutSidebar as PanelLeft,
  IconRefresh as Refresh,
  IconRotate as RotateCcw,
  IconUser as UserRound,
} from '@tabler/icons-react'
import {
  isCustomModelChoice,
  providerMark,
  sourceKey,
  type ModelChoice,
  type ProviderMark,
} from '../model-catalog.js'
import {
  agentMark,
  agentPresentation,
  type ProviderPresentation,
} from '../provider-presentation.js'
import {
  DIRECT_PROVIDERS,
  agentRosterKey,
  rosterAgent,
  rosterAllows,
  type ProviderRoster,
} from '../provider-roster.js'
import type { ComposerError } from './ComposerErrors.js'
import {
  defaultsScope,
  pinnableModels,
  pinnedModelChoice,
  providerApprovalDefault,
  scopedDefault,
  type DefaultsScope,
  type ProviderDefault,
  type ProviderDefaults,
} from '../provider-defaults.js'
import {
  ProviderTuning,
  ProviderTuningSkeleton,
  useAccountContextSettings,
  useProviderContextSettings,
  useProviderRuntimeSettings,
} from './ProviderTuning.js'
import { Skeleton, SkeletonCode, SkeletonStatus } from './Skeleton.js'
import { listInstalledFontFamilies, readInstalledFontFamilies } from '../local-fonts.js'
import {
  appUpdateState,
  checkForAppUpdates,
  isDesktop,
  localDiagnosticsEnabled,
  onAppUpdateState,
  openLocalDiagnostics,
  setLocalDiagnosticsEnabled,
  simulateAppUpdate,
  writeClipboardText,
  type AppUpdateState,
} from '../bridge.js'
import {
  appUpdateInstallState,
  cancelAppUpdateInstall,
  chatCount,
  installWhenChatsFinish,
  requestAppUpdateInstall,
  runningLabel,
  stopChatsAndInstall,
  subscribeAppUpdateInstall,
  waitingLabel,
} from '../app-update-install.js'
import {
  onSimulatedAppUpdate,
  simulatedAppUpdate,
  stopAppUpdateSimulation,
  type AppUpdateSimulation,
} from '../app-update-simulation.js'
import {
  beginInstall,
  beginLogin,
  cancelInstall,
  clearInstall,
  deviceCode,
  installKey,
  installState,
  loginKey,
  signedInEmail,
  subscribeInstalls,
  type InstallTarget,
  type ProviderLoginTerminalTarget,
} from '../provider-install.js'
import type { Transport } from '../transport.js'
import {
  readAccount,
  rememberAccountRead,
  rememberedAccountReads,
} from '../provider-account-reads.js'
import { lastSignIn } from '../remembered-sign-in.js'
import {
  fontFamilyFromPreference,
  fontFamilyStack,
  fontPreferenceForFamily,
  type AccentPreference,
  type AppearancePreference,
  type AppearancePreferences,
  type BackdropPreference,
  type FontPreference,
  type ThemePreference,
  type ThemeColorScheme,
} from '../theme.js'
import {
  performAppHaptic,
  prepareAppHaptics,
  readAppHaptics,
  subscribeAppHaptics,
  writeAppHaptics,
} from '../haptics.js'
import { t as tNow, useI18n, type MessageKey } from '../i18n/index.js'
import { AppSelect, type AppSelectOption } from './AppSelect.js'
import { Menu, MenuItem } from './Menu.js'
import { AccountEmail } from './AccountEmail.js'
import {
  AccountName,
  AddAccountSection,
  FoundAccountsSection,
  IgnoredSignInsSection,
  ProviderAccountRows,
  useDetectedAccounts,
} from './ProviderAccounts.js'
import { signInKey, useIgnoredSignIns } from '../ignored-sign-ins.js'
import {
  accountsOf,
  activeAccountOf,
  multiAccountProviders,
  useProviderAccounts,
} from '../provider-accounts-state.js'
import { sameAccount } from '../usage-summary-state.js'
import { ProviderIcon } from './ProviderIcon.js'
import { McpSettings } from './McpSettings.js'
import { groupModelsBySource } from './model-selector-utils.js'
import { ImportSettings } from './ImportSettings.js'
import { SkillsSettings } from './SkillsSettings.js'
import { ProviderRow, ProviderRowSkeleton, type ProviderAction } from './ProviderRow.js'
import { ProviderExecutablePath, useProviderExecutablePaths } from './ProviderExecutablePath.js'
import { ProfileSettings } from './ProfileSettings.js'
import { GeneratedAvatarLab } from './GeneratedAvatarLab.js'
import type { ProfileIdentityPreferences } from '../profile-preferences.js'
import { SourceIdentity } from './SourceIdentity.js'
import { ModelBulkActions, ModelVisibilityRow } from './ModelVisibilityControls.js'
import { LARGE_MODEL_SOURCE_ROWS, ModelLabSection } from './ModelLabSection.js'
import { SettingsMeta, StateLabel } from './SettingsStatus.js'
import { UsageSettings } from './UsageSettings.js'
import type { PlanLimitsSource } from './usage/usage-sheets.js'
import {
  SettingsBackSlot,
  SettingsEmpty,
  SettingsNotice,
  SettingsPage,
  SettingsSection,
  SettingsRow,
} from './settings/SettingsLayout.js'
import {
  DEFAULT_KEYBINDINGS,
  isComposingKey,
  type KeybindingId,
  type Keybindings,
  type Shortcut,
} from '../shortcuts.js'
import { KeybindSettings } from './KeybindSettings.js'
import { GeneralSettings } from './GeneralSettings.js'
import { SettingsSearch } from './settings/SettingsSearch.js'
import type { SettingsSearchEntry } from './settings/settings-search.js'
import { ProviderUpdateCheck } from './ProviderUpdates.js'
import { useProviderUpdates, type ProviderUpdateSimulation } from '../provider-updates.js'
import { useInstallCheck } from '../provider-recheck.js'

const PhoneSettings = lazy(() =>
  import('./PhoneSettings.js')
    .then((module) => ({ default: module.PhoneSettings }))
    .catch(surfaceLoadFailed),
)

const InstallTerminal = lazy(() =>
  import('./InstallTerminal.js')
    .then((module) => ({ default: module.InstallTerminal }))
    .catch(surfaceLoadFailed),
)

export type SettingsSection =
  | 'profile'
  | 'providers'
  | 'models'
  | 'mcp'
  | 'skills'
  | 'workflows'
  | 'usage'
  | 'phone'
  | 'appearance'
  | 'keybinds'
  | 'import'
  | 'data'
  | 'debug'
  | 'about'

const THEME_OPTIONS = [
  { value: 'system', label: 'settings.appearance.themeSystem' },
  { value: 'light', label: 'settings.appearance.themeLight' },
  { value: 'dark', label: 'settings.appearance.themeDark' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: MessageKey }>

const FONT_OPTIONS = [
  { value: 'geist', label: 'Geist' },
  { value: 'mono', label: 'Geist Mono' },
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System default' },
] as const satisfies ReadonlyArray<{ value: FontPreference; label: string }>

function legacyFontLabel(font: FontPreference): string | undefined {
  if (font === 'humanist') return 'Humanist'
  if (font === 'rounded') return 'Rounded'
  if (font === 'serif') return 'Editorial'
  return undefined
}

function fontOptionKey(label: string): string {
  return label.normalize('NFKC').toLocaleLowerCase('en-US')
}

function compareFontOptions(left: { label: string }, right: { label: string }): number {
  return left.label.localeCompare(right.label, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

const ACCENT_OPTIONS = [
  { value: 'neutral', label: 'settings.appearance.accent.neutral' },
  { value: 'ocean', label: 'settings.appearance.accent.ocean' },
  { value: 'forest', label: 'settings.appearance.accent.forest' },
  { value: 'sunset', label: 'settings.appearance.accent.sunset' },
  { value: 'amber', label: 'settings.appearance.accent.amber' },
  { value: 'rose', label: 'settings.appearance.accent.rose' },
  { value: 'lavender', label: 'settings.appearance.accent.lavender' },
] as const satisfies ReadonlyArray<{ value: AccentPreference; label: MessageKey }>

/** Stepped, not a raw range: four honest strengths beat 13 near-identical
 *  stops, and the picker matches the other appearance choices. */
const GLASS_OPTIONS = [
  { value: 0, label: 'settings.appearance.glass.off' },
  { value: 20, label: 'settings.appearance.glass.subtle' },
  { value: 35, label: 'settings.appearance.glass.medium' },
  { value: 50, label: 'settings.appearance.glass.strong' },
] as const satisfies ReadonlyArray<{ value: number; label: MessageKey }>

const BACKDROP_OPTIONS = [
  { value: 'default', label: 'settings.appearance.backdrop.graphite' },
  { value: 'slate', label: 'settings.appearance.backdrop.slate' },
  { value: 'mocha', label: 'settings.appearance.backdrop.mocha' },
  { value: 'forest', label: 'settings.appearance.backdrop.forest' },
  { value: 'midnight', label: 'settings.appearance.backdrop.midnight' },
  { value: 'plum', label: 'settings.appearance.backdrop.plum' },
] as const satisfies ReadonlyArray<{ value: BackdropPreference; label: MessageKey }>

const FOCUSABLE_SELECTOR =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function noop(): void {}
function noopKeybindingChange(_action: KeybindingId, _shortcut: Shortcut | null): void {}

/**
 * Phone access is part of some builds only (the server needs
 * HARNESS_PHONE_ACCESS=1). Asked once when Settings opens; the page stays
 * hidden until the server says this build offers it, and on any failure.
 */
function usePhoneAccessAvailable(transport: Transport): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let current = true
    transport
      .request('phone.status', {})
      .then((status) => {
        // Servers from before the flag offered phone access everywhere.
        if (current) setAvailable(status.available !== false)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [transport])
  return available
}

/**
 * Settings stays intentionally small: the sidebar reorganizes the decisions
 * the app already exposes without inventing preferences for their own sake.
 */
function SettingsComponent(props: {
  provider: ProviderId
  providerName: string
  transport: Transport
  projectPath: string | undefined
  projectName: string | undefined
  account: Account | undefined
  accountLoading?: boolean | undefined
  /** Plan limits for every provider, shown on the Usage tab. */
  usageLimits?: PlanLimitsSource | undefined
  profileIdentity?: ProfileIdentityPreferences | undefined
  onProfileIdentityChange?: ((updates: Partial<ProfileIdentityPreferences>) => void) | undefined
  providerStatuses: ProviderStatus[]
  acpAgents?: ResultOf<'acp.agents'>['agents'] | undefined
  /** The providers added to Providers, in the order they were added (provider-roster.ts). */
  providerRoster?: ProviderRoster | undefined
  onProviderRosterChange?: ((roster: ProviderRoster) => void) | undefined
  /** Opens Providers on its picker; asked again with every section request. */
  providersView?: 'add-providers' | undefined
  /** The provider list has not arrived yet. */
  providersLoading?: boolean | undefined
  models: ModelChoice[]
  modelsLoading?: boolean | undefined
  /** Why a source's models could not be listed, by source key. */
  modelErrors?: Readonly<Record<string, ComposerError>> | undefined
  /** Sources whose models are being listed right now. */
  pendingModelSources?: ReadonlySet<string> | undefined
  /**
   * Lists every provider's models. Asked for only while a page that shows
   * them is open; listing starts each provider's CLI. Give it a stable identity.
   */
  onModelsWanted?: (() => void) | undefined
  hiddenModels: Set<string>
  onModelVisibilityChange: (key: string, visible: boolean) => void
  /** Several rows at once, as one change. */
  onModelsVisibilityChange: (keys: readonly string[], visible: boolean) => void
  providerDefaults?: ProviderDefaultsControls | undefined
  onConnectionsChanged: () => void
  projectCount: number
  projectsLoading?: boolean | undefined
  sidebarSettings: SidebarSettings
  onSidebarSettingsChange: (settings: Partial<SidebarSettings>) => void
  themePreference: ThemePreference
  themeColorScheme: ThemeColorScheme
  onThemePreferenceChange: (theme: ThemePreference) => void
  appearancePreferences: AppearancePreferences
  onAppearancePreferenceChange: (
    mode: ThemeColorScheme,
    updates: Partial<AppearancePreference>,
  ) => void
  showMacOSFontSmoothing: boolean
  macOSFontSmoothing: boolean
  onMacOSFontSmoothingChange: (enabled: boolean) => void
  macOS?: boolean | undefined
  keybindings?: Keybindings | undefined
  onKeybindingChange?: ((action: KeybindingId, shortcut: Shortcut | null) => void) | undefined
  onKeybindingsReset?: (() => void) | undefined
  showMacOSHaptics?: boolean | undefined
  onAccountChange: (provider: ProviderId, account: Account) => void
  authRefreshRevision?: number | undefined
  initialSection?: SettingsSection | undefined
  /** Bumped with every request, so asking for the same section again still navigates. */
  sectionRequest?: number | undefined
  showDebug?: boolean | undefined
  onReset: () => void
  onForceOnboarding?: (() => void) | undefined
  onClose: () => void
  /** Leaves Settings for a chat. */
  onOpenChat: (threadId: string) => void
  onProviderLoginTerminalOpen?: ((target: ProviderLoginTerminalTarget) => void) | undefined
}) {
  const { t } = useI18n()
  const [selectedSection, setSection] = useState<SettingsSection>(
    props.initialSection ?? 'workflows',
  )
  const phoneAvailable = usePhoneAccessAvailable(props.transport)
  const section =
    (selectedSection === 'debug' && !props.showDebug) ||
    (selectedSection === 'phone' && !phoneAvailable)
      ? 'workflows'
      : selectedSection

  useEffect(() => {
    setSection(props.initialSection ?? 'workflows')
  }, [props.initialSection, props.sectionRequest])

  // Models and Providers show the model lists. Any other page, MCP servers
  // included, must not wait behind every provider's CLI starting to list them.
  const onModelsWanted = props.onModelsWanted
  const showsModels = section === 'models' || section === 'providers'
  useEffect(() => {
    if (showsModels) onModelsWanted?.()
  }, [showsModels, onModelsWanted])

  // A request for the provider picker opens it once. Leaving Providers drops
  // it, so coming back shows the providers rather than the picker again.
  const [providersView, setProvidersView] = useState(props.providersView)
  useEffect(() => {
    setProvidersView(props.providersView)
  }, [props.providersView, props.sectionRequest])
  useEffect(() => {
    if (section !== 'providers') setProvidersView(undefined)
  }, [section])
  // Where a page opened from inside a tab puts its back button.
  const [backSlot, setBackSlot] = useState<HTMLElement | null>(null)

  // Every tab shares one scroller; a tab opens at its top, not at the offset
  // the previous tab was left at. A freshly mounted scroller is already at its
  // top, and assigning scrollTop there forced a full layout inside the commit
  // that opens Settings.
  const main = useRef<HTMLElement>(null)
  const scrolledSection = useRef(section)
  useLayoutEffect(() => {
    if (scrolledSection.current === section) return
    scrolledSection.current = section
    if (main.current) main.current.scrollTop = 0
  }, [section])

  const [jump, setJump] = useState<{ id: string; section: SettingsSection; serial: number }>()
  const chooseSearchResult = (entry: SettingsSearchEntry) => {
    setProvidersView(undefined)
    setSection(entry.section)
    if (entry.page) {
      setJump(undefined)
      if (main.current) main.current.scrollTop = 0
      return
    }
    setJump((previous) => ({
      id: entry.id,
      section: entry.section,
      serial: (previous?.serial ?? 0) + 1,
    }))
  }
  useEffect(() => {
    const root = main.current
    if (!jump || !root) return
    // A jump belongs to one visit: opening the section again later must not replay it.
    if (section !== jump.section) {
      setJump(undefined)
      return
    }
    let found: HTMLElement | null = null
    let highlightTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(find)
    const deadline = window.setTimeout(() => observer.disconnect(), 2000)
    function find() {
      if (!root || found) return
      found =
        Array.from(root.querySelectorAll<HTMLElement>('[data-settings-id]')).find(
          (element) => element.dataset.settingsId === jump?.id,
        ) ?? null
      if (!found) return
      observer.disconnect()
      found.scrollIntoView?.({
        block: 'center',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
      const control = found.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (control) control.focus({ preventScroll: true })
      else {
        found.tabIndex = -1
        found.focus({ preventScroll: true })
      }
      found.dataset.settingsFound = 'true'
      const row = found
      highlightTimer = setTimeout(() => {
        delete row.dataset.settingsFound
      }, 1500)
    }
    observer.observe(root, { childList: true, subtree: true })
    find()
    return () => {
      observer.disconnect()
      window.clearTimeout(deadline)
      if (highlightTimer) clearTimeout(highlightTimer)
      if (found) delete found.dataset.settingsFound
    }
  }, [jump, section])

  const panel = useRef<HTMLDivElement>(null)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (isComposingKey(event)) return
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose.current()
        return
      }
      if (event.key !== 'Tab' || event.defaultPrevented || !panel.current) return

      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'))
      const first = focusable[0]
      const last = focusable.at(-1)
      const active = document.activeElement
      const atBoundary =
        !first ||
        !last ||
        active === panel.current ||
        !panel.current.contains(active) ||
        (event.shiftKey ? active === first : active === last)
      if (!atBoundary) return

      event.preventDefault()
      ;(event.shiftKey ? last : first)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <div
      className="settings"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      ref={panel}
      tabIndex={-1}
    >
      <div className="settings__titlebar" aria-hidden />
      <div className="settings__back-slot" ref={setBackSlot} />

      <aside className="settings__sidebar">
        <button className="settings__back" type="button" onClick={props.onClose}>
          <ArrowLeft size={14} aria-hidden />
          <span>{t('settings.back')}</span>
        </button>

        <p className="settings__nav-label">{t('settings.title')}</p>
        <SettingsSearch
          transport={props.transport}
          providers={(props.providerRoster ?? PROVIDER_ROSTER).flatMap((key) =>
            props.providerStatuses.filter((status) => status.id === key),
          )}
          provider={props.provider}
          account={props.account}
          providerDefaults={props.providerDefaults !== undefined}
          phone={phoneAvailable}
          debug={props.showDebug === true}
          haptics={props.showMacOSHaptics === true}
          fontSmoothing={props.showMacOSFontSmoothing}
          onChoose={chooseSearchResult}
        >
          <nav className="settings__nav" aria-label={t('settings.nav.label')}>
            <SettingsNavItem
              active={section === 'workflows'}
              icon={<PanelLeft size={15} aria-hidden />}
              label={t('settings.nav.general')}
              onClick={() => setSection('workflows')}
            />
            <SettingsNavItem
              active={section === 'profile'}
              icon={<CircleUserRound size={15} aria-hidden />}
              label={t('settings.nav.profile')}
              onClick={() => setSection('profile')}
            />
            <SettingsNavItem
              active={section === 'appearance'}
              icon={<Palette size={15} aria-hidden />}
              label={t('settings.nav.appearance')}
              onClick={() => setSection('appearance')}
            />
            <SettingsNavItem
              active={section === 'keybinds'}
              icon={<Keyboard size={15} aria-hidden />}
              label={t('settings.nav.keybinds')}
              onClick={() => setSection('keybinds')}
            />
            <SettingsNavItem
              active={section === 'providers'}
              icon={<UserRound size={15} aria-hidden />}
              label={t('settings.nav.providers')}
              onClick={() => setSection('providers')}
            />
            <SettingsNavItem
              active={section === 'models'}
              icon={<Boxes size={15} aria-hidden />}
              label={t('settings.nav.models')}
              onClick={() => setSection('models')}
            />
            <SettingsNavItem
              active={section === 'mcp'}
              icon={<Network size={15} aria-hidden />}
              label={t('settings.nav.mcp')}
              onClick={() => setSection('mcp')}
            />
            <SettingsNavItem
              active={section === 'skills'}
              icon={<Blocks size={15} aria-hidden />}
              label={t('settings.nav.skills')}
              onClick={() => setSection('skills')}
            />
            <SettingsNavItem
              active={section === 'usage'}
              icon={<BarChart3 size={15} aria-hidden />}
              label={t('settings.nav.usage')}
              onClick={() => setSection('usage')}
            />
            {phoneAvailable ? (
              <SettingsNavItem
                active={section === 'phone'}
                icon={<Smartphone size={15} aria-hidden />}
                label={t('settings.nav.phone')}
                onClick={() => setSection('phone')}
              />
            ) : null}
            <SettingsNavItem
              active={section === 'import'}
              icon={<FileImport size={15} aria-hidden />}
              label={t('settings.nav.import')}
              onClick={() => setSection('import')}
            />
            <SettingsNavItem
              active={section === 'data'}
              icon={<Database size={15} aria-hidden />}
              label={t('settings.nav.data')}
              onClick={() => setSection('data')}
            />
            {props.showDebug ? (
              <SettingsNavItem
                active={section === 'debug'}
                icon={<Bug size={15} aria-hidden />}
                label={t('settings.nav.debug')}
                onClick={() => setSection('debug')}
              />
            ) : null}
            <SettingsNavItem
              active={section === 'about'}
              icon={<Info size={15} aria-hidden />}
              label={t('settings.nav.about')}
              onClick={() => setSection('about')}
            />
          </nav>
        </SettingsSearch>
      </aside>

      <main className="settings__main" ref={main}>
        <SettingsBackSlot.Provider value={backSlot}>
          <div className="settings__content">
            {section === 'profile' ? (
              <ProfileSettings
                transport={props.transport}
                provider={props.provider}
                account={props.account}
                accountLoading={props.accountLoading}
                providerName={props.providerName}
                providers={props.providersLoading ? undefined : props.providerStatuses}
                identity={props.profileIdentity}
                onIdentityChange={props.onProfileIdentityChange}
                onManageAccounts={() => setSection('providers')}
                onOpenUsage={() => setSection('usage')}
              />
            ) : null}
            {section === 'providers' ? (
              <ProviderSettings
                key={jump?.section === 'providers' ? jump.serial : 0}
                {...props}
                providersView={providersView}
              />
            ) : null}
            {section === 'models' ? <ModelSettings {...props} /> : null}
            {section === 'mcp' ? (
              <McpSettings
                {...props}
                providers={props.providerStatuses.map(({ id, displayName }) => ({
                  provider: id,
                  providerName: displayName,
                }))}
              />
            ) : null}
            {section === 'skills' ? <SkillsSettings {...props} /> : null}
            {section === 'workflows' ? <GeneralSettings {...props} /> : null}
            {section === 'usage' ? (
              <UsageSettings transport={props.transport} limits={props.usageLimits} />
            ) : null}
            {section === 'phone' ? (
              <Suspense
                fallback={
                  <SkeletonStatus label={t('settings.shell.phoneLoading')}>
                    <Skeleton width={260} height={11} />
                  </SkeletonStatus>
                }
              >
                <PhoneSettings transport={props.transport} />
              </Suspense>
            ) : null}
            {section === 'appearance' ? <AppearanceSettings {...props} /> : null}
            {section === 'keybinds' ? (
              <KeybindSettings
                key={jump?.section === 'keybinds' ? jump.serial : 0}
                keybindings={props.keybindings ?? DEFAULT_KEYBINDINGS}
                macOS={props.macOS ?? false}
                onChange={props.onKeybindingChange ?? noopKeybindingChange}
                onReset={props.onKeybindingsReset ?? noop}
              />
            ) : null}
            {section === 'import' ? (
              <ImportSettings transport={props.transport} onOpenChat={props.onOpenChat} />
            ) : null}
            {section === 'data' ? <DataSettings {...props} /> : null}
            {section === 'debug' ? (
              <SettingsPage title={t('settings.nav.debug')}>
                <SettingsRow searchId="debug-onboarding" name={t('settings.debug.onboarding.name')}>
                  <button
                    className="set-button"
                    type="button"
                    onClick={props.onForceOnboarding}
                    disabled={!props.onForceOnboarding}
                  >
                    {t('settings.debug.onboarding.force')}
                  </button>
                </SettingsRow>
                <UsageHistoryReset transport={props.transport} />
                <AppUpdateSimulationRow />
                <ProviderUpdateSimulationRow transport={props.transport} />
                <SettingsSection
                  searchId="debug-avatar"
                  title={t('settings.debug.avatar.title')}
                  note={t('settings.debug.avatar.note')}
                >
                  <GeneratedAvatarLab initialName={props.profileIdentity?.displayName} />
                </SettingsSection>
              </SettingsPage>
            ) : null}
            {section === 'about' ? <AboutSettings transport={props.transport} /> : null}
          </div>
        </SettingsBackSlot.Provider>
      </main>
    </div>
  )
}

const UPDATE_SIMULATIONS = [
  { scenario: 'update', label: 'settings.debug.appUpdate.update' },
  { scenario: 'failure', label: 'settings.debug.appUpdate.failure' },
  { scenario: 'current', label: 'settings.debug.appUpdate.current' },
] as const satisfies ReadonlyArray<{ scenario: AppUpdateSimulation; label: MessageKey }>

function AppUpdateSimulationRow() {
  const { t } = useI18n()
  const [running, setRunning] = useState(() => simulatedAppUpdate() !== undefined)
  useEffect(() => onSimulatedAppUpdate((state) => setRunning(state !== undefined)), [])

  return (
    <SettingsRow
      searchId="debug-app-update"
      name={t('settings.debug.appUpdate.name')}
      note={t('settings.debug.appUpdate.note')}
    >
      {UPDATE_SIMULATIONS.map(({ scenario, label }) => (
        <button
          key={scenario}
          className="set-button"
          type="button"
          onClick={() => void simulateAppUpdate(scenario)}
        >
          {t(label)}
        </button>
      ))}
      <button
        className="set-button"
        type="button"
        disabled={!running}
        onClick={stopAppUpdateSimulation}
      >
        {t('settings.debug.stop')}
      </button>
    </SettingsRow>
  )
}

const PROVIDER_UPDATE_SIMULATIONS = [
  { scenario: 'one', label: 'settings.debug.providerUpdate.one' },
  { scenario: 'several', label: 'settings.debug.providerUpdate.several' },
  { scenario: 'failure', label: 'settings.debug.providerUpdate.failure' },
] as const satisfies ReadonlyArray<{ scenario: ProviderUpdateSimulation; label: MessageKey }>

function ProviderUpdateSimulationRow(props: { transport: Transport }) {
  const { t } = useI18n()
  const { store, state } = useProviderUpdates(props.transport)
  return (
    <SettingsRow
      searchId="debug-provider-update"
      name={t('settings.debug.providerUpdate.name')}
      note={t('settings.debug.providerUpdate.note')}
    >
      {PROVIDER_UPDATE_SIMULATIONS.map(({ scenario, label }) => (
        <button
          key={scenario}
          className="set-button"
          type="button"
          onClick={() => store.simulate(scenario)}
        >
          {t(label)}
        </button>
      ))}
      <button
        className="set-button"
        type="button"
        aria-label={t('settings.debug.providerUpdate.stopLabel')}
        disabled={!state.simulation}
        onClick={store.stopSimulation}
      >
        {t('settings.debug.stop')}
      </button>
    </SettingsRow>
  )
}

function SettingsNavItem(props: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`settings__nav-item${props.active ? ' is-active' : ''}`}
      type="button"
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onClick}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

type ProviderMap<T> = Partial<Record<ProviderId, T>>

// Every provider with its own integration, shown as it always was before the roster existed.
const PROVIDER_ROSTER: readonly ProviderId[] = DIRECT_PROVIDERS.map((entry) => entry.id)

type AcpAgent = ResultOf<'acp.agents'>['agents'][number]

/** What a new chat on each provider starts with. The app shell owns it. */
export type ProviderDefaultsControls = {
  /** Keyed by provider for its default account, `provider@account` for a further one. */
  pins: ProviderDefaults
  onPinChange: (scope: DefaultsScope, pin: ProviderDefault | undefined) => void
  access: Partial<Record<DefaultsScope, ApprovalMode>>
  onAccessChange: (scope: DefaultsScope, mode: ApprovalMode) => void
}

export function ProviderSettings(props: {
  provider: ProviderId
  account: Account | undefined
  providerStatuses: ProviderStatus[]
  acpAgents?: ResultOf<'acp.agents'>['agents'] | undefined
  providerRoster?: ProviderRoster | undefined
  onProviderRosterChange?: ((roster: ProviderRoster) => void) | undefined
  providersView?: 'add-providers' | undefined
  sectionRequest?: number | undefined
  providersLoading?: boolean | undefined
  projectPath?: string | undefined
  transport: Transport
  models?: ModelChoice[] | undefined
  hiddenModels?: Set<string> | undefined
  providerDefaults?: ProviderDefaultsControls | undefined
  onConnectionsChanged: () => void
  onAccountChange: (provider: ProviderId, account: Account) => void
  authRefreshRevision?: number | undefined
  onProviderLoginTerminalOpen?: ((target: ProviderLoginTerminalTarget) => void) | undefined
}) {
  const { t } = useI18n()
  type AuthReadState =
    | { phase: 'loading' }
    // refreshError: a background re-check failed; the account shown is the last one read.
    | { phase: 'ready'; account: Account; refreshError?: string }
    | { phase: 'error'; message: string }
  type AuthOperation = {
    id: number
    kind: 'sign-in' | 'sign-out'
    transport: Transport
    loginId?: string
  }

  // Rows open on the answers of this page's earlier visits and are read again
  // behind them; only a row read for the first time says "Checking account…".
  const [agentAccounts, setAgentAccounts] = useState<Record<string, Account>>(() => {
    const accounts: Record<string, Account> = {}
    for (const [key, account] of rememberedAccountReads(props.transport)) {
      const agent = rosterAgent(key)
      if (agent !== undefined) accounts[agent] = account
    }
    return accounts
  })
  const [agentAccountErrors, setAgentAccountErrors] = useState<Record<string, string>>({})
  const [agentBusy, setAgentBusy] = useState<string>()
  const [authStates, setAuthStates] = useState<ProviderMap<AuthReadState>>(() => {
    const states: ProviderMap<AuthReadState> = {}
    for (const status of props.providerStatuses) {
      const kept = status.installed ? keptSignIn(status.id) : undefined
      if (kept) states[status.id] = { phase: 'ready', account: kept }
    }
    for (const [key, account] of rememberedAccountReads(props.transport)) {
      if (rosterAgent(key) === undefined) states[key as ProviderId] = { phase: 'ready', account }
    }
    if (props.account) states[props.provider] = { phase: 'ready', account: props.account }
    return states
  })
  const [authOperations, setAuthOperations] = useState<ProviderMap<AuthOperation>>({})
  const [authErrors, setAuthErrors] = useState<ProviderMap<string>>({})
  const sequence = useRef(0)
  const statusRequests = useRef<ProviderMap<{ id: number; transport: Transport }>>({})
  const operations = useRef<ProviderMap<AuthOperation>>({})
  const earlyEvents = useRef<
    ProviderMap<Map<string | null, { operationId: number; event: DataOf<'auth.event'> }>>
  >({})
  const currentTransport = useRef(props.transport)
  currentTransport.current = props.transport
  const providerDefaults = props.providerDefaults
  const context = useProviderContextSettings(props.transport, providerDefaults !== undefined)
  const runtimes = useProviderRuntimeSettings(
    props.transport,
    providerDefaults !== undefined &&
      props.providerStatuses.some((status) => (status.capabilities?.runtimes?.length ?? 0) > 1),
  )

  const updateOperation = useCallback((provider: ProviderId, operation?: AuthOperation) => {
    operations.current = { ...operations.current, [provider]: operation }
    setAuthOperations(operations.current)
  }, [])

  const operationIsCurrent = useCallback(
    (provider: ProviderId, operation: AuthOperation) =>
      operations.current[provider]?.id === operation.id &&
      currentTransport.current === operation.transport,
    [],
  )

  const beginOperation = (provider: ProviderId, kind: AuthOperation['kind']) => {
    const operation = { id: ++sequence.current, kind, transport: props.transport }
    delete statusRequests.current[provider]
    delete earlyEvents.current[provider]
    updateOperation(provider, operation)
    setAuthErrors((current) => ({ ...current, [provider]: undefined }))
    return operation
  }

  useEffect(() => {
    const account = props.account
    if (!account) return
    delete statusRequests.current[props.provider]
    setAuthStates((current) => ({
      ...current,
      [props.provider]: { phase: 'ready', account },
    }))
  }, [props.provider, props.account])

  const refreshAccount = useCallback(
    async (provider: ProviderId, forceLoading = false) => {
      const request = { id: ++sequence.current, transport: props.transport }
      statusRequests.current = { ...statusRequests.current, [provider]: request }
      setAuthStates((current) => {
        if (!forceLoading && current[provider]?.phase === 'ready') return current
        // A row read for the first time this run opens on what the last read said.
        const kept = !forceLoading && !current[provider] ? keptSignIn(provider) : undefined
        return {
          ...current,
          [provider]: kept ? { phase: 'ready', account: kept } : { phase: 'loading' },
        }
      })
      try {
        // Joins a read a closed visit left running; kept for the next visit either way.
        const account = await readAccount(
          request.transport,
          provider,
          () => request.transport.request('auth.status', { provider }),
          { fresh: forceLoading, revision: props.authRefreshRevision ?? 0 },
        )
        if (
          statusRequests.current[provider] !== request ||
          currentTransport.current !== request.transport
        )
          return
        setAuthStates((current) => ({
          ...current,
          [provider]: { phase: 'ready', account },
        }))
        props.onAccountChange(provider, account)
      } catch (cause) {
        if (
          statusRequests.current[provider] !== request ||
          currentTransport.current !== request.transport
        )
          return
        const message = cause instanceof Error ? cause.message : String(cause)
        // A slow CLI must not turn a known sign-in into "Account unavailable":
        // a background re-check keeps the account and only marks the row.
        setAuthStates((current) => {
          const known = current[provider]
          return {
            ...current,
            [provider]:
              !forceLoading && known?.phase === 'ready'
                ? { phase: 'ready', account: known.account, refreshError: message }
                : { phase: 'error', message },
          }
        })
      }
    },
    [props.transport, props.onAccountChange, props.authRefreshRevision],
  )

  const authProviderIds = props.providerStatuses
    .filter(
      (status) =>
        status.installed &&
        status.id !== 'acp' &&
        status.id !== 'api' &&
        rosterAllows(props.providerRoster, status.id),
    )
    .map((status) => status.id)
  const authProviderKey = authProviderIds.join('|')

  const completeLogin = useCallback(
    (event: DataOf<'auth.event'>) => {
      updateOperation(event.provider)
      setAuthErrors((current) => ({
        ...current,
        [event.provider]: event.success
          ? undefined
          : (event.error ?? tNow('settings.providers.signInCancelled')),
      }))
      if (event.success) void refreshAccount(event.provider, true)
    },
    [refreshAccount, updateOperation],
  )

  useEffect(() => {
    for (const provider of authProviderIds) {
      void refreshAccount(provider)
    }
    const unsubscribe = props.transport.on('auth.event', (event) => {
      // A provider row is its default account; a further account's row reads its own.
      if (event.agent || !sameAccount(event.accountId, undefined)) return
      const operation = operations.current[event.provider]
      if (!operation) {
        if (event.success) void refreshAccount(event.provider, true)
        return
      }
      if (operation.kind !== 'sign-in' || operation.transport !== props.transport) return
      if (operation.loginId === undefined) {
        const events = earlyEvents.current[event.provider] ?? new Map()
        events.set(event.loginId, { operationId: operation.id, event })
        earlyEvents.current[event.provider] = events
        return
      }
      if (operation.loginId === event.loginId) completeLogin(event)
    })

    return () => {
      unsubscribe()
      for (const provider of authProviderIds) {
        delete statusRequests.current[provider]
      }
    }
  }, [props.transport, props.authRefreshRevision, authProviderKey, completeLogin, refreshAccount])

  useEffect(() => {
    operations.current = {}
    setAuthOperations({})
    setAuthErrors({})
  }, [props.transport])

  const refreshAgentAccount = useCallback(
    async (agentId: string, fresh = false) => {
      try {
        const account = await readAccount(
          props.transport,
          agentRosterKey(agentId),
          () => props.transport.request('auth.status', { provider: 'acp', agent: agentId }),
          { fresh },
        )
        setAgentAccounts((current) => ({ ...current, [agentId]: account }))
        setAgentAccountErrors((current) => ({ ...current, [agentId]: '' }))
      } catch (cause) {
        setAgentAccountErrors((current) => ({
          ...current,
          [agentId]: cause instanceof Error ? cause.message : String(cause),
        }))
      }
    },
    [props.transport],
  )

  const roster = props.providerRoster
  const onRosterChange = props.onProviderRosterChange
  // Added providers in the order they were added. Before the roster exists the
  // page lists every direct provider and no ACP agent, as it always did.
  const entries = (roster ?? PROVIDER_ROSTER).flatMap((key): RosterEntry[] => {
    const agentId = rosterAgent(key)
    if (agentId !== undefined) {
      const agent = props.acpAgents?.find((entry) => entry.id === agentId)
      return agent ? [{ key, agent }] : []
    }
    const status = props.providerStatuses.find((entry) => entry.id === key)
    return status ? [{ key, status }] : []
  })
  // Only added agents are asked about their account: the check starts them.
  const agents = entries.flatMap((entry) => ('agent' in entry ? [entry.agent] : []))
  // Further accounts sit under their provider; one provider's rows say when the list failed.
  const accountProviders = multiAccountProviders(
    entries.flatMap((entry) => ('status' in entry ? [entry.status] : [])),
  )
  const providerAccounts = useProviderAccounts(props.transport, accountProviders.length > 0)
  const executablePaths = useProviderExecutablePaths(props.transport)
  const accountContext = useAccountContextSettings(
    props.transport,
    providerDefaults !== undefined && accountProviders.length > 0,
  )
  const installedAgentKey = agents
    .filter((agent) => agent.installed)
    .map((agent) => agent.id)
    .join('|')
  useEffect(() => {
    for (const agentId of installedAgentKey.split('|')) {
      if (agentId) void refreshAgentAccount(agentId)
    }
  }, [installedAgentKey, refreshAgentAccount])

  const signIn = async (provider: ProviderId) => {
    const operation = beginOperation(provider, 'sign-in')
    try {
      const result = await props.transport.request('auth.startLogin', { provider })
      if (!operationIsCurrent(provider, operation)) return
      const early = earlyEvents.current[provider]?.get(result.loginId)
      delete earlyEvents.current[provider]
      if (early?.operationId === operation.id && early.event.loginId === result.loginId) {
        completeLogin(early.event)
        return
      }
      updateOperation(provider, { ...operation, loginId: result.loginId })
      if (result.authUrl) window.open(result.authUrl, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      if (!operationIsCurrent(provider, operation)) return
      updateOperation(provider)
      setAuthErrors((current) => ({
        ...current,
        [provider]: cause instanceof Error ? cause.message : String(cause),
      }))
    }
  }

  const signOut = async (provider: ProviderId) => {
    const operation = beginOperation(provider, 'sign-out')
    try {
      await props.transport.request('auth.signOut', { provider })
      if (!operationIsCurrent(provider, operation)) return
      delete statusRequests.current[provider]
      const account = { signedIn: false }
      try {
        localStorage.removeItem(providerEmailKey(provider))
      } catch {
        // An optional display cache must not turn a successful sign-out into a failure.
      }
      rememberAccountRead(operation.transport, provider, account)
      setAuthStates((current) => ({
        ...current,
        [provider]: { phase: 'ready', account },
      }))
      props.onAccountChange(provider, account)
      updateOperation(provider)
    } catch (cause) {
      if (!operationIsCurrent(provider, operation)) return
      updateOperation(provider)
      setAuthErrors((current) => ({
        ...current,
        [provider]: cause instanceof Error ? cause.message : String(cause),
      }))
    }
  }

  const signOutAgent = async (agentId: string) => {
    setAgentBusy(agentId)
    setAgentAccountErrors((current) => ({ ...current, [agentId]: '' }))
    try {
      await props.transport.request('auth.signOut', { provider: 'acp', agent: agentId })
      rememberAccountRead(props.transport, agentRosterKey(agentId), { signedIn: false })
      setAgentAccounts((current) => ({ ...current, [agentId]: { signedIn: false } }))
    } catch (cause) {
      setAgentAccountErrors((current) => ({
        ...current,
        [agentId]: cause instanceof Error ? cause.message : String(cause),
      }))
    } finally {
      setAgentBusy((current) => (current === agentId ? undefined : current))
    }
  }

  const renderAccountRow = (status: ProviderStatus) => {
    const authState =
      authStates[status.id] ??
      (status.id === props.provider && props.account
        ? { phase: 'ready' as const, account: props.account }
        : { phase: 'loading' as const })
    const account = authState.phase === 'ready' ? authState.account : undefined
    if (!status.installed && !account?.signedIn) {
      return (
        <InstallableRow
          key={status.id}
          provider={status}
          target={{ provider: status.id }}
          transport={props.transport}
          onInstalled={props.onConnectionsChanged}
          onOpenExpandedTerminal={props.onProviderLoginTerminalOpen}
        />
      )
    }
    if (authState.phase !== 'ready') {
      return (
        <ProviderRow
          key={status.id}
          provider={status}
          status={
            authState.phase === 'error'
              ? t('settings.providers.accountUnavailable')
              : t('settings.providers.checkingAccount')
          }
          live={authState.phase === 'loading'}
          issue={
            authState.phase === 'error'
              ? { message: authState.message, announce: true }
              : status.problem
                ? { message: status.problem }
                : undefined
          }
          primary={
            authState.phase === 'error'
              ? {
                  label: t('settings.providers.retry'),
                  onClick: () => void refreshAccount(status.id, true),
                }
              : undefined
          }
        />
      )
    }
    if (!account?.signedIn && status.setup?.login === 'provider') {
      return (
        <CliSignInRow
          key={status.id}
          provider={status}
          target={{ provider: status.id }}
          transport={props.transport}
          onSignedIn={() => void refreshAccount(status.id, true)}
          onOpenExpandedTerminal={props.onProviderLoginTerminalOpen}
        />
      )
    }
    const accountStatus = account?.signedIn ? (
      <AccountIdentity provider={status.id} account={account} />
    ) : (
      t('settings.providers.notSignedIn')
    )
    const operation = authOperations[status.id]
    const authError = authErrors[status.id]
    const refreshError = authState.refreshError
    // The provider row is its default account. Once there are others it
    // carries the default account's name, renamed in place like theirs, and
    // with another account active for new chats it offers the way back.
    const further = accountsOf(providerAccounts.snapshot, status.id).length > 1
    const defaultAccount = further
      ? accountsOf(providerAccounts.snapshot, status.id).find(
          (entry) => entry.id === DEFAULT_ACCOUNT_ID,
        )
      : undefined
    const name = defaultAccount ? (
      <AccountName
        provider={status}
        account={defaultAccount}
        onRename={(label) => providerAccounts.store.rename(status.id, DEFAULT_ACCOUNT_ID, label)}
      />
    ) : undefined
    const useDefault: ProviderAction | undefined =
      further &&
      account?.signedIn &&
      activeAccountOf(providerAccounts.snapshot, status.id) !== DEFAULT_ACCOUNT_ID
        ? {
            label: t('settings.providers.setActive'),
            ariaLabel: t('settings.providers.useDefaultLabel', { provider: status.displayName }),
            onClick: () =>
              void providerAccounts.store
                .setActive(status.id, DEFAULT_ACCOUNT_ID)
                .catch(() => undefined),
          }
        : undefined
    const operationStatus =
      operation?.kind === 'sign-in'
        ? t('settings.providers.signingIn')
        : operation?.kind === 'sign-out'
          ? t('settings.providers.signingOut')
          : accountStatus
    return (
      <ProviderRow
        key={status.id}
        provider={status}
        status={operationStatus}
        link={account?.signedIn ? 'connected' : 'open'}
        live={operation !== undefined}
        issue={
          authError
            ? {
                message: authError,
                announce: true,
              }
            : status.problem
              ? { message: status.problem }
              : refreshError
                ? { message: t('settings.providers.refreshFailed', { error: refreshError }) }
                : undefined
        }
        name={name}
        secondary={operation === undefined ? useDefault : undefined}
        primary={
          account?.signedIn
            ? {
                label:
                  operation?.kind === 'sign-out'
                    ? t('settings.providers.signingOut')
                    : t('settings.providers.signOut'),
                disabled: operation !== undefined,
                danger: true,
                onClick: () => void signOut(status.id),
              }
            : {
                label:
                  operation?.kind === 'sign-in'
                    ? t('settings.providers.signingIn')
                    : t('settings.providers.signIn'),
                disabled: operation !== undefined,
                onClick: () => void signIn(status.id),
              }
        }
      />
    )
  }

  const renderAgentRow = (agent: AcpAgent) => {
    const provider: ProviderStatus = {
      id: 'acp',
      displayName: agent.name,
      installed: agent.installed,
      auth: 'unknown',
      setup: agent.setup,
      ...(agent.problem ? { problem: agent.problem } : {}),
    }
    const mark = agentMark(agent.id)
    if (!agent.installed) {
      return (
        <InstallableRow
          key={agent.id}
          provider={provider}
          mark={mark}
          target={{ provider: 'acp', agent: agent.id }}
          transport={props.transport}
          onInstalled={props.onConnectionsChanged}
          onOpenExpandedTerminal={props.onProviderLoginTerminalOpen}
        />
      )
    }
    const account = agentAccounts[agent.id]
    const accountError = agentAccountErrors[agent.id]
    if (!account && !accountError) {
      return (
        <ProviderRow
          key={agent.id}
          provider={provider}
          mark={mark}
          status={t('settings.providers.checkingAccount')}
          live
        />
      )
    }
    if (!account?.signedIn) {
      return (
        <CliSignInRow
          key={agent.id}
          provider={{
            ...provider,
            ...(accountError ? { problem: accountError } : {}),
          }}
          mark={mark}
          target={{ provider: 'acp', agent: agent.id }}
          transport={props.transport}
          onSignedIn={() => void refreshAgentAccount(agent.id, true)}
          onOpenExpandedTerminal={props.onProviderLoginTerminalOpen}
        />
      )
    }
    // An agent whose CLI keeps its login to itself signs out there, not here.
    const canSignOut = agent.signOut !== false
    return (
      <ProviderRow
        key={agent.id}
        provider={provider}
        mark={mark}
        status={
          agentBusy === agent.id
            ? t('settings.providers.signingOut')
            : t('settings.providers.signedIn')
        }
        link="connected"
        live={agentBusy === agent.id}
        issue={accountError ? { message: accountError, announce: true } : undefined}
        primary={
          canSignOut
            ? {
                label:
                  agentBusy === agent.id
                    ? t('settings.providers.signingOut')
                    : t('settings.providers.signOut'),
                disabled: agentBusy === agent.id,
                danger: true,
                onClick: () => void signOutAgent(agent.id),
              }
            : undefined
        }
      />
    )
  }

  const signedIn = (status: ProviderStatus) => {
    const authState = authStates[status.id]
    if (authState) return authState.phase === 'ready' && authState.account.signedIn
    return status.id === props.provider && props.account?.signedIn === true
  }
  const checkingAccount = (status: ProviderStatus) => {
    const authState = authStates[status.id]
    if (authState) return authState.phase === 'loading'
    return !(status.id === props.provider && props.account)
  }
  // With further accounts the default one is named like them, "Claude Code · Team".
  const defaultAccountName = (status: ProviderStatus) => {
    const accounts = accountsOf(providerAccounts.snapshot, status.id)
    const own =
      accounts.length > 1 ? accounts.find((each) => each.id === DEFAULT_ACCOUNT_ID) : undefined
    return own ? `${status.displayName} · ${own.label}` : undefined
  }
  const renderTuning = (status: ProviderStatus) => {
    if (!providerDefaults) return null
    // A provider that may well be signed in keeps the place of its defaults
    // while the account is checked, so the roster does not jump when it answers.
    const pending = status.installed && status.auth !== 'unauthenticated' && checkingAccount(status)
    if (!pending && !signedIn(status)) return null
    const pin = providerDefaults.pins[status.id]
    const pinnedName = pinnedModelChoice(props.models ?? [], status.id, pin)?.model.displayName
    return (
      <ProviderTuning
        provider={status}
        name={defaultAccountName(status)}
        models={pinnableModels(props.models ?? [], status.id, props.hiddenModels)}
        pinned={pin}
        pinnedName={pinnedName}
        onPinnedChange={(next) => providerDefaults.onPinChange(status.id, next)}
        access={providerApprovalDefault(
          providerDefaults.access[status.id],
          status.capabilities?.autoReview === true,
        )}
        onAccessChange={(mode) => providerDefaults.onAccessChange(status.id, mode)}
        context={context.state}
        contextError={context.errors[status.id]}
        onContextChange={(settings) => context.update(status.id, settings)}
        runtime={{
          state: runtimes.state,
          error: runtimes.errors[status.id],
          onChange: (runtime) => runtimes.update(status.id, runtime),
        }}
        pending={pending}
      />
    )
  }
  // A further account's own defaults for new chats, each following its
  // provider's until changed here. Shown once the account names who it is.
  const renderAccountTuning = (status: ProviderStatus, account: ProviderAccount) => {
    if (!providerDefaults) return null
    if (account.email === undefined && account.plan === undefined) return null
    const scope = defaultsScope(status.id, account.id)
    const pin = scopedDefault(providerDefaults.pins, status.id, account.id)
    return (
      <ProviderTuning
        provider={status}
        name={`${status.displayName} · ${account.label}`}
        models={pinnableModels(props.models ?? [], status.id, props.hiddenModels)}
        pinned={pin}
        pinnedName={pinnedModelChoice(props.models ?? [], status.id, pin)?.model.displayName}
        onPinnedChange={(next) => providerDefaults.onPinChange(scope, next)}
        access={providerApprovalDefault(
          scopedDefault(providerDefaults.access, status.id, account.id),
          status.capabilities?.autoReview === true,
        )}
        onAccessChange={(mode) => providerDefaults.onAccessChange(scope, mode)}
        context={context.state}
        accountContext={accountContext.resolve(context.state, status.id, account.id)}
        contextError={accountContext.errors(status.id, account.id)}
        onContextChange={(settings) => accountContext.update(status.id, account.id, settings)}
      />
    )
  }
  const removeFromRoster = (key: string) =>
    roster && onRosterChange?.(roster.filter((entry) => entry !== key))
  const editable = roster !== undefined && onRosterChange !== undefined
  const renderEntry = (entry: RosterEntry) => {
    const name = 'agent' in entry ? entry.agent.name : entry.status.displayName
    return (
      <div className="provider-settings__entry" key={entry.key}>
        {editable ? (
          <button
            className="provider-roster__remove"
            type="button"
            aria-label={t('settings.providers.removeNamed', { name })}
            title={t('settings.providers.removeNamed', { name })}
            onClick={() => removeFromRoster(entry.key)}
          >
            <CircleMinus size={17} stroke={1.6} aria-hidden />
          </button>
        ) : null}
        {'agent' in entry ? renderAgentRow(entry.agent) : renderAccountRow(entry.status)}
        {'status' in entry ? renderTuning(entry.status) : null}
        {'status' in entry && accountProviders.includes(entry.status) ? (
          <ProviderAccountRows
            transport={props.transport}
            provider={entry.status}
            reportsErrors={accountProviders[0] === entry.status}
            onOpenTerminal={props.onProviderLoginTerminalOpen}
            renderTuning={(account) => renderAccountTuning(entry.status, account)}
          />
        ) : null}
        <ProviderExecutablePath
          source={entry.key}
          name={name}
          paths={executablePaths.paths}
          readError={executablePaths.readError}
          transport={props.transport}
          onSaved={(paths) => {
            executablePaths.setPaths(paths)
            props.onConnectionsChanged()
          }}
        />
      </div>
    )
  }

  const [picking, setPicking] = useState(props.providersView === 'add-providers')
  useEffect(() => {
    setPicking(props.providersView === 'add-providers')
  }, [props.providersView, props.sectionRequest])

  // Sign-ins already on the computer that could be accounts here and that
  // nobody ignored, counted beside the plus; asked again when the picker
  // closes or an account comes or goes.
  const ignoredSignIns = useIgnoredSignIns()
  const detected = useDetectedAccounts(
    props.transport,
    multiAccountProviders(props.providerStatuses),
    {
      enabled: editable && !picking,
      again: `${picking} ${providerAccounts.snapshot.accounts.length}`,
    },
  )
  const foundAccounts = detected.filter(
    (entry) => !ignoredSignIns.includes(signInKey(entry)),
  ).length

  if (picking && editable) {
    return (
      <ProviderPicker
        roster={roster}
        providerStatuses={props.providerStatuses}
        signedIn={(id) => {
          const state = authStates[id]
          return state?.phase === 'ready' ? state.account.signedIn : undefined
        }}
        acpAgents={props.acpAgents ?? []}
        transport={props.transport}
        onAdd={(key) => onRosterChange([...roster, key])}
        onRemove={(key) => removeFromRoster(key)}
        onDone={() => setPicking(false)}
      />
    )
  }

  return (
    <SettingsPage
      title={t('settings.nav.providers')}
      description={
        editable && entries.length === 0 ? t('settings.providers.emptyDescription') : undefined
      }
    >
      {props.providersLoading && props.providerStatuses.length === 0 ? (
        <SkeletonStatus label={t('settings.providers.loading')}>
          {(roster ?? PROVIDER_ROSTER).map((key, index) => (
            <div className="provider-settings__entry" key={key}>
              <ProviderRowSkeleton index={index} />
              {providerDefaults && rosterAgent(key) === undefined ? (
                <ProviderTuningSkeleton />
              ) : null}
            </div>
          ))}
        </SkeletonStatus>
      ) : (
        <div className="provider-roster">
          {entries.map(renderEntry)}
          {editable ? (
            <button className="provider-roster__add" type="button" onClick={() => setPicking(true)}>
              <CirclePlus size={17} stroke={1.6} aria-hidden />
              <span>
                {entries.length === 0
                  ? t('settings.providers.addFirst')
                  : t('settings.providers.add')}
                {foundAccounts > 0 ? (
                  <span className="provider-roster__found">
                    {foundAccounts === 1
                      ? t('settings.providers.foundOne')
                      : t('settings.providers.foundMany', { count: foundAccounts })}
                  </span>
                ) : null}
              </span>
            </button>
          ) : null}
        </div>
      )}
      <ProviderUpdateCheck transport={props.transport} />
    </SettingsPage>
  )
}

type RosterEntry = { key: string; status: ProviderStatus } | { key: string; agent: AcpAgent }

/**
 * A direct provider's state in a word: the account read for it when there is
 * one (only added providers are read), else what its CLI reported.
 */
function directState(status: ProviderStatus | undefined, signedIn: boolean | undefined): string {
  if (!status) return tNow('settings.providers.checking')
  if (!status.installed) return tNow('settings.providers.notInstalled')
  if (signedIn ?? status.auth === 'authenticated') return tNow('settings.providers.signedIn')
  if (signedIn === false || status.auth === 'unauthenticated')
    return tNow('settings.providers.notSignedIn')
  return tNow('settings.providers.installed')
}

/**
 * Where providers are added: the ones with their own integration, then the
 * ACP library. Each row is wired once it is added, so the page shows at a
 * glance what is already in the app; adding never moves a row.
 */
function ProviderPicker(props: {
  roster: ProviderRoster
  providerStatuses: ProviderStatus[]
  /** What an account read said, for a provider this page has read. */
  signedIn: (id: ProviderId) => boolean | undefined
  acpAgents: readonly AcpAgent[]
  transport: Transport
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  onDone: () => void
}) {
  const { t } = useI18n()
  // Rows just added under the pointer, whose Added waits for it to leave before offering Remove.
  const [justAdded, setJustAdded] = useState<readonly string[]>([])
  // An account added here brings its provider along when it was not added yet.
  const addProviderOf = (provider: ProviderId) => {
    if (!props.roster.includes(provider)) props.onAdd(provider)
  }
  const accountProviders = multiAccountProviders(props.providerStatuses)
  const detected = useDetectedAccounts(props.transport, accountProviders)
  const ignoredKeys = useIgnoredSignIns()
  const ignored = (entry: DetectedAccountHome) => ignoredKeys.includes(signInKey(entry))
  const row = (input: {
    key: string
    provider: ProviderStatus
    mark: ProviderMark
    maker: string | undefined
    state: string
    installed: boolean
  }) => {
    const added = props.roster.includes(input.key)
    return (
      <ProviderRow
        key={input.key}
        provider={input.provider}
        mark={input.mark}
        status={[input.maker, input.state].filter(Boolean).join(' · ')}
        link={added ? 'connected' : input.installed ? 'open' : 'none'}
        primary={
          added
            ? {
                label: t('settings.providers.added'),
                done: true,
                undo: t('settings.providers.remove'),
                ariaLabel: t('settings.providers.removeNamed', {
                  name: input.provider.displayName,
                }),
                fresh: justAdded.includes(input.key),
                onClick: () => {
                  setJustAdded((current) => current.filter((key) => key !== input.key))
                  props.onRemove(input.key)
                },
              }
            : {
                label: t('settings.providers.addShort'),
                ariaLabel: t('settings.providers.addNamed', { name: input.provider.displayName }),
                onClick: () => {
                  setJustAdded((current) => [...current, input.key])
                  props.onAdd(input.key)
                },
              }
        }
      />
    )
  }
  const direct = DIRECT_PROVIDERS.flatMap((entry) => {
    const status = props.providerStatuses.find((candidate) => candidate.id === entry.id)
    return status ? [{ entry, status }] : []
  })
  return (
    <SettingsPage
      title={t('settings.providers.pickerTitle')}
      className="provider-picker"
      back={{ label: t('settings.nav.providers'), onBack: props.onDone }}
    >
      <FoundAccountsSection
        transport={props.transport}
        providers={accountProviders}
        found={detected.filter((entry) => !ignored(entry))}
        onAdded={addProviderOf}
      />
      <SettingsSection
        title={t('settings.nav.providers')}
        note={t('settings.providers.directNote')}
      >
        {direct.map(({ entry, status }) =>
          row({
            key: entry.id,
            provider: status,
            mark: providerMark(entry.id),
            maker: entry.maker,
            state: directState(status, props.signedIn(entry.id)),
            installed: status.installed,
          }),
        )}
      </SettingsSection>
      {props.acpAgents.length > 0 ? (
        <SettingsSection
          title={t('settings.providers.acpTitle')}
          note={t('settings.providers.acpNote')}
        >
          {props.acpAgents.map((agent) =>
            row({
              key: agentRosterKey(agent.id),
              provider: {
                id: 'acp',
                displayName: agent.name,
                installed: agent.installed,
                auth: 'unknown',
              },
              mark: agentMark(agent.id),
              maker: agent.maker,
              state: agent.installed
                ? t('settings.providers.installed')
                : t('settings.providers.notInstalled'),
              installed: agent.installed,
            }),
          )}
        </SettingsSection>
      ) : null}
      <AddAccountSection
        transport={props.transport}
        providers={accountProviders}
        onAdded={addProviderOf}
      />
      <IgnoredSignInsSection providers={accountProviders} ignored={detected.filter(ignored)} />
    </SettingsPage>
  )
}

function ModelSettings(props: {
  transport: Transport
  models: ModelChoice[]
  modelsLoading?: boolean | undefined
  /** Why a source's models could not be listed, by source key. */
  modelErrors?: Readonly<Record<string, ComposerError>> | undefined
  /** Sources whose models are being listed right now. */
  pendingModelSources?: ReadonlySet<string> | undefined
  providerStatuses: ProviderStatus[]
  acpAgents?: ResultOf<'acp.agents'>['agents'] | undefined
  hiddenModels: Set<string>
  onModelVisibilityChange: (key: string, visible: boolean) => void
  onModelsVisibilityChange: (keys: readonly string[], visible: boolean) => void
  onConnectionsChanged: () => void
}) {
  const { t } = useI18n()
  // Existing stored custom choices remain usable in the composer, but raw
  // provider-id editing is intentionally absent from beta settings.
  const sources = useMemo(
    () => groupModelsBySource(props.models.filter((choice) => !isCustomModelChoice(choice))),
    [props.models],
  )

  // A source whose models failed to load would otherwise vanish from the
  // page. It keeps a section with the reason and a Retry; while it is asked
  // again (or once Retry is pressed, until the next answer) the section
  // shows that instead, so a retry never makes it blink out and back.
  const errors = props.modelErrors
  const [seenFailures, setSeenFailures] = useState<ReadonlySet<string>>(() => new Set())
  const [retryFrom, setRetryFrom] = useState<typeof errors>()
  const loaded = new Set(sources.map((group) => group.key))
  const failing = Object.keys(errors ?? {}).filter((key) => !loaded.has(key))
  if (failing.some((key) => !seenFailures.has(key))) {
    setSeenFailures(new Set([...seenFailures, ...failing]))
  }
  const retrying = retryFrom !== undefined && retryFrom === errors
  const failed = [...new Set([...seenFailures, ...failing])].flatMap((key) => {
    if (loaded.has(key)) return []
    const loading = retrying || props.pendingModelSources?.has(key) === true
    const error = errors?.[key]
    if (!loading && !error) return []
    const presentation = modelSourcePresentation(key, props)
    return [{ key, presentation, loading, error }]
  })
  // A refresh that never answers (the server itself went away) must not
  // leave the sources loading for good.
  useEffect(() => {
    if (retryFrom === undefined) return
    const timer = window.setTimeout(() => setRetryFrom(undefined), 30_000)
    return () => window.clearTimeout(timer)
  }, [retryFrom])
  const retry = () => {
    setRetryFrom(errors)
    props.onConnectionsChanged()
  }

  return (
    <SettingsPage title={t('settings.nav.models')} className="model-settings">
      <BackgroundModelSettings transport={props.transport} />
      <SubagentProviderSettings transport={props.transport} />
      {sources.length > 0 || failed.length > 0 ? (
        <div className="model-settings__sources">
          {sources.map((group) => (
            <ModelVisibilityGroup
              key={group.key}
              source={group.name}
              choices={group.entries}
              hiddenModels={props.hiddenModels}
              onModelVisibilityChange={props.onModelVisibilityChange}
              onModelsVisibilityChange={props.onModelsVisibilityChange}
            />
          ))}
          {failed.map((source) => (
            <SettingsSection
              key={source.key}
              title={
                source.presentation ? (
                  <SourceIdentity presentation={source.presentation} />
                ) : undefined
              }
              label={source.presentation ? undefined : t('settings.models.source')}
            >
              {source.loading ? (
                <SettingsNotice tone="progress">
                  {source.presentation
                    ? t('settings.models.loadingFrom', { name: source.presentation.label })
                    : t('settings.models.loading')}
                </SettingsNotice>
              ) : (
                <SettingsNotice
                  tone="error"
                  action={
                    <button className="set-button" type="button" onClick={retry}>
                      {t('settings.providers.retry')}
                    </button>
                  }
                >
                  {source.error?.message}
                </SettingsNotice>
              )}
            </SettingsSection>
          ))}
        </div>
      ) : props.modelsLoading ? (
        <ModelSourcesSkeleton />
      ) : (
        <SettingsEmpty icon={<Boxes aria-hidden />} title={t('settings.models.empty')} />
      )}
    </SettingsPage>
  )
}

/** The name and mark of a model source, from the roster it was listed from. */
function modelSourcePresentation(
  key: string,
  roster: {
    providerStatuses: ProviderStatus[]
    acpAgents?: ResultOf<'acp.agents'>['agents'] | undefined
  },
): ProviderPresentation | undefined {
  const status = roster.providerStatuses.find((entry) => sourceKey({ provider: entry.id }) === key)
  if (status) return { label: status.displayName, mark: providerMark(status.id) }
  const agent = roster.acpAgents?.find(
    (entry) => sourceKey({ provider: 'acp', agentId: entry.id }) === key,
  )
  if (agent) return agentPresentation(agent.id, agent.name)
  return undefined
}

const MODEL_SKELETON_WIDTHS = [132, 176, 108, 152] as const

function ModelSourcesSkeleton() {
  const { t } = useI18n()
  return (
    <SkeletonStatus label={t('settings.models.loading')} className="model-settings__sources">
      {[4, 3].map((rows, index) => (
        <div className="set-section" key={index} aria-hidden>
          <div className="set-section__head">
            <span className="set-section__title">
              <span className="source-identity source-identity--regular">
                <span className="source-identity__mark">
                  <Skeleton className="skeleton--icon" width={15} height={15} />
                </span>
                <Skeleton width={index === 0 ? 64 : 92} height={9} />
              </span>
            </span>
            <div className="set-section__action">
              <div className="model-visibility__bulk-actions">
                <button type="button" disabled>
                  {t('settings.models.all')}
                </button>
                <button type="button" disabled>
                  {t('settings.models.none')}
                </button>
              </div>
            </div>
          </div>
          {MODEL_SKELETON_WIDTHS.slice(0, rows).map((width, row) => (
            <SettingsRow
              key={row}
              className="model-visibility__model"
              name={
                <span className="settings-value-skeleton">
                  <Skeleton width={width} height={9} />
                </span>
              }
            >
              <span className="settings__switch-skeleton">
                <Skeleton width={30} height={18} />
              </span>
            </SettingsRow>
          ))}
        </div>
      ))}
    </SkeletonStatus>
  )
}

/**
 * Whether an agent may start sub-agents on the user's other providers. The server
 * enforces it; unanswered counts as off.
 */
function SubagentProviderSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  const [allowed, setAllowed] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setError(undefined)
    void Promise.resolve(props.transport.request('subagents.settings', {}))
      .then((settings) => {
        if (!cancelled) setAllowed(settings?.otherProviders === true)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [props.transport])

  const toggle = async () => {
    if (allowed === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const settings = await props.transport.request('subagents.updateSettings', {
        otherProviders: !allowed,
      })
      setAllowed(settings.otherProviders === true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title={t('settings.models.subagents.title')}>
      {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
      <SettingsRow
        searchId="model-subagents"
        name={t('settings.models.subagents.name')}
        note={t('settings.models.subagents.note')}
      >
        <button
          className={`switch${allowed ? ' is-on' : ''}`}
          type="button"
          role="switch"
          aria-label={t('settings.models.subagents.name')}
          aria-checked={allowed === true}
          disabled={allowed === undefined || busy}
          onClick={() => void toggle()}
        >
          <span className="switch__thumb" />
        </button>
      </SettingsRow>
    </SettingsSection>
  )
}

function BackgroundModelSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  const [state, setState] = useState<BackgroundModelSettingsState>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setError(undefined)
    void Promise.resolve(props.transport.request('backgroundModel.settings', {}))
      .then((settings) => {
        if (cancelled) return
        if (isBackgroundModelSettingsState(settings)) {
          setState(settings)
        } else {
          setError(tNow('settings.models.background.unavailable'))
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [props.transport])

  const update = async (preference: BackgroundModelSettingsState['preference']) => {
    setBusy(true)
    setError(undefined)
    try {
      const settings = await props.transport.request('backgroundModel.updateSettings', preference)
      if (!isBackgroundModelSettingsState(settings)) {
        throw new Error(tNow('settings.models.background.unavailable'))
      }
      setState(settings)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const manual = state?.preference.mode === 'manual' ? state.preference.target : undefined
  const selected = manual ? findBackgroundModel(state?.sources ?? [], manual) : undefined
  const selectedValue = selected
    ? backgroundModelValue(selected.source.id, selected.model.id)
    : manual
      ? 'unavailable'
      : 'automatic'
  const resolved = state?.resolved
  const resolvedChoice = resolved ? findBackgroundModel(state?.sources ?? [], resolved) : undefined
  const automaticNote =
    manual && !selected
      ? t('settings.models.background.modelUnavailable', { model: formatModelName(manual.model) })
      : resolved
        ? resolved.effort
          ? t('settings.models.background.currentWithEffort', {
              model: formatModelName(resolvedChoice?.model.displayName ?? resolved.model),
              source: resolved.sourceName,
              effort: getFriendlyEffortLabel(resolved.effort),
            })
          : t('settings.models.background.current', {
              model: formatModelName(resolvedChoice?.model.displayName ?? resolved.model),
              source: resolved.sourceName,
            })
        : t('settings.models.background.connect')
  const modelOptions = [
    { value: 'automatic', label: t('settings.models.background.automatic') },
    ...(manual && !selected
      ? [
          {
            value: 'unavailable',
            label: t('settings.models.background.optionUnavailable', {
              model: formatModelName(manual.model),
            }),
            disabled: true,
          },
        ]
      : []),
    ...(state?.sources ?? []).flatMap((source) =>
      source.models.map((model) => ({
        value: backgroundModelValue(source.id, model.id),
        label: formatModelName(model.displayName),
      })),
    ),
  ]
  const effortOptions =
    selected?.model.reasoningEfforts.map((effort) => ({
      value: effort,
      label: getFriendlyEffortLabel(effort),
    })) ?? []
  const selectedEffort = manual?.effort ?? effortOptions[0]?.value ?? ''
  const fastTier = getFastServiceTier(selected?.model)
  const selectedSpeed = isFastModeEnabled(selected?.model, manual?.serviceTier)
    ? 'fast'
    : 'standard'
  const loading = state === undefined && !error

  return (
    <SettingsSection
      title={t('settings.models.background.title')}
      note={t('settings.models.background.note')}
    >
      {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
      <SettingsRow
        searchId="background-model"
        name={t('settings.models.background.model')}
        note={
          loading ? (
            <SettingsValueSkeleton
              label={t('settings.models.background.loadingDetails')}
              width={240}
            />
          ) : state ? (
            automaticNote
          ) : undefined
        }
      >
        {loading ? (
          <SkeletonStatus
            label={t('settings.models.background.loadingModel')}
            className="settings-value-skeleton"
          >
            <Skeleton width={152} height={9} />
          </SkeletonStatus>
        ) : !state ? (
          <SettingsMeta>{t('settings.models.background.unavailableShort')}</SettingsMeta>
        ) : (
          <AppSelect
            className="set-select--inline"
            ariaLabel={t('settings.models.background.modelLabel')}
            align="right"
            value={selectedValue}
            options={modelOptions}
            disabled={!state || busy}
            onChange={(value) => {
              if (value === 'automatic') {
                void update({ mode: 'automatic' })
                return
              }
              const choice = backgroundModelFromValue(state?.sources ?? [], value)
              if (!choice) return
              const serviceTier = getNextServiceTierForModel({
                nextModel: choice.model,
                currentModel: selected?.model,
                currentServiceTier: manual?.serviceTier,
              })
              void update({
                mode: 'manual',
                target: {
                  provider: choice.source.provider,
                  ...(choice.source.connectionId
                    ? { connectionId: choice.source.connectionId }
                    : {}),
                  ...(choice.source.agent
                    ? {
                        agent: choice.source.agent,
                      }
                    : {}),
                  model: choice.model.id,
                  ...(serviceTier ? { serviceTier } : {}),
                  ...(choice.model.reasoningEfforts[0]
                    ? {
                        effort: choice.model.reasoningEfforts[0],
                      }
                    : {}),
                },
              })
            }}
          />
        )}
      </SettingsRow>
      {manual && selected && effortOptions.length > 0 ? (
        <SettingsRow
          searchId="background-effort"
          name={t('settings.models.background.effort')}
          note={t('settings.models.background.effortNote')}
        >
          <AppSelect
            className="set-select--inline"
            ariaLabel={t('settings.models.background.effortLabel')}
            align="right"
            value={selectedEffort}
            options={effortOptions}
            disabled={busy}
            onChange={(effort) =>
              void update({
                mode: 'manual',
                target: { ...manual, effort },
              })
            }
          />
        </SettingsRow>
      ) : null}
      {manual && selected && fastTier ? (
        <SettingsRow
          searchId="background-speed"
          name={t('settings.models.background.speed')}
          note={t('settings.models.background.speedNote')}
        >
          <AppSelect
            className="set-select--inline"
            ariaLabel={t('settings.models.background.speedLabel')}
            align="right"
            value={selectedSpeed}
            options={[
              { value: 'standard', label: t('settings.models.background.speedStandard') },
              { value: 'fast', label: t('settings.models.background.speedFast') },
            ]}
            disabled={busy}
            onChange={(speed) => {
              const serviceTier =
                speed === 'fast' ? fastTier.id : getFastModeOffValue(selected.model)
              void update({ mode: 'manual', target: { ...manual, serviceTier } })
            }}
          />
        </SettingsRow>
      ) : null}
    </SettingsSection>
  )
}

function isBackgroundModelSettingsState(
  value: z.input<typeof BackgroundModelSettingsSchema>,
): value is BackgroundModelSettingsState {
  return BackgroundModelSettingsSchema.safeParse(value).success
}

function findBackgroundModel(sources: BackgroundModelSource[], target: BackgroundModelTarget) {
  const source = sources.find(
    (candidate) =>
      candidate.provider === target.provider &&
      candidate.connectionId === target.connectionId &&
      candidate.agent === target.agent,
  )
  const model = source?.models.find((candidate) => candidate.id === target.model)
  return source && model ? { source, model } : undefined
}

function backgroundModelValue(sourceId: string, modelId: string): string {
  return JSON.stringify([sourceId, modelId])
}

function backgroundModelFromValue(sources: BackgroundModelSource[], value: string) {
  try {
    const [sourceId, modelId] = z.tuple([z.string(), z.string()]).parse(JSON.parse(value))
    const source = sources.find((candidate) => candidate.id === sourceId)
    const model = source?.models.find((candidate) => candidate.id === modelId)
    return source && model ? { source, model } : undefined
  } catch {
    return undefined
  }
}

function ModelVisibilityGroup(props: {
  source: string
  choices: ModelChoice[]
  hiddenModels: Set<string>
  onModelVisibilityChange: (key: string, visible: boolean) => void
  onModelsVisibilityChange: (keys: readonly string[], visible: boolean) => void
}) {
  const { t } = useI18n()
  const title = props.choices[0] ? (
    <SourceIdentity presentation={{ label: props.source, mark: props.choices[0].mark }} />
  ) : (
    props.source
  )
  if (props.choices.length > LARGE_MODEL_SOURCE_ROWS) {
    return <ModelLabSection title={title} {...props} />
  }

  // A source is one section: its identity is the heading, All and None its
  // action, and every model a leader row whose value is the switch.
  return (
    <SettingsSection
      title={title}
      action={
        <ModelBulkActions
          name={t('settings.models.groupName', { source: props.source })}
          groupLabel={t('settings.models.groupLabel', { source: props.source })}
          choices={props.choices}
          hiddenModels={props.hiddenModels}
          onModelsVisibilityChange={props.onModelsVisibilityChange}
        />
      }
    >
      {props.choices.map((choice) => (
        <ModelVisibilityRow
          key={choice.key}
          choice={choice}
          visible={!props.hiddenModels.has(choice.key)}
          onModelVisibilityChange={props.onModelVisibilityChange}
        />
      ))}
    </SettingsSection>
  )
}

function AppearanceSettings(props: {
  themePreference: ThemePreference
  themeColorScheme: ThemeColorScheme
  onThemePreferenceChange: (theme: ThemePreference) => void
  appearancePreferences: AppearancePreferences
  onAppearancePreferenceChange: (
    mode: ThemeColorScheme,
    updates: Partial<AppearancePreference>,
  ) => void
  showMacOSFontSmoothing: boolean
  macOSFontSmoothing: boolean
  onMacOSFontSmoothingChange: (enabled: boolean) => void
  showMacOSHaptics?: boolean | undefined
}) {
  const { t } = useI18n()
  return (
    <SettingsPage title={t('settings.nav.appearance')}>
      <SettingsSection title={t('settings.appearance.theme')} searchId="theme">
        <ThemePicker
          value={props.themePreference}
          preferences={props.appearancePreferences}
          onChange={props.onThemePreferenceChange}
        />
      </SettingsSection>
      {(['light', 'dark'] as const).map((mode) => (
        <AppearanceEditor
          key={mode}
          mode={mode}
          preference={props.appearancePreferences[mode]}
          onChange={(updates) => props.onAppearancePreferenceChange(mode, updates)}
        />
      ))}
      <AppBackgroundSettings />
      {props.showMacOSHaptics || props.showMacOSFontSmoothing ? (
        <SettingsSection label={t('settings.appearance.sharedLabel')}>
          {props.showMacOSHaptics ? <SidebarHapticsSetting /> : null}
          {props.showMacOSFontSmoothing ? (
            <SettingsRow searchId="font-smoothing" name={t('settings.appearance.fontSmoothing')}>
              <button
                className={`switch${props.macOSFontSmoothing ? ' is-on' : ''}`}
                type="button"
                role="switch"
                aria-label={t('settings.appearance.fontSmoothing')}
                aria-checked={props.macOSFontSmoothing}
                onClick={() => props.onMacOSFontSmoothingChange(!props.macOSFontSmoothing)}
              >
                <span className="switch__thumb" />
              </button>
            </SettingsRow>
          ) : null}
        </SettingsSection>
      ) : null}
    </SettingsPage>
  )
}

function AppearanceEditor(props: {
  mode: ThemeColorScheme
  preference: AppearancePreference
  onChange: (updates: Partial<AppearancePreference>) => void
}) {
  const { t } = useI18n()
  const [installedFontFamilies, setInstalledFontFamilies] = useState(readInstalledFontFamilies)
  const requestInstalledFontFamilies = useCallback(() => {
    void listInstalledFontFamilies().then(setInstalledFontFamilies)
  }, [])
  // Built-in fonts lead, System default first, so the list opens where most
  // choices are; installed families follow alphabetically. Each option carries
  // a sample set in its own face.
  const fontOptions = useMemo(() => {
    const builtIn: AppSelectOption<FontPreference>[] = [
      FONT_OPTIONS[3],
      ...FONT_OPTIONS.slice(0, 3),
    ].map((option) => ({
      ...option,
      label: option.value === 'system' ? t('settings.appearance.fontSystem') : option.label,
    }))
    const legacy = legacyFontLabel(props.preference.font)
    if (legacy) builtIn.push({ value: props.preference.font, label: legacy })
    const taken = new Set(builtIn.map((option) => fontOptionKey(option.label)))
    const installed = new Map<string, AppSelectOption<FontPreference>>()
    for (const family of installedFontFamilies ?? []) {
      const value = fontPreferenceForFamily(family)
      const key = fontOptionKey(family)
      if (value && !taken.has(key)) installed.set(key, { value, label: family })
    }
    const selectedFamily = fontFamilyFromPreference(props.preference.font)
    if (selectedFamily && !installed.has(fontOptionKey(selectedFamily))) {
      installed.set(fontOptionKey(selectedFamily), {
        value: props.preference.font,
        label: selectedFamily,
      })
    }
    const grouped = installed.size > 0
    return [
      ...builtIn.map((option) => ({
        ...option,
        group: grouped ? t('settings.appearance.fontsBuiltIn') : undefined,
      })),
      ...[...installed.values()]
        .sort(compareFontOptions)
        .map((option) => ({ ...option, group: t('settings.appearance.fontsInstalled') })),
    ].map((option) => ({ ...option, sampleFont: fontFamilyStack(option.value) }))
  }, [installedFontFamilies, props.preference.font, t])
  const accentOptions = ACCENT_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))
  const backdropOptions = BACKDROP_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))
  const glassOptions = GLASS_OPTIONS.map((option) => ({
    value: String(option.value),
    label: t(option.label),
  }))
  const fontSearch = {
    label: t('settings.appearance.fontSearch.label'),
    placeholder: t('settings.appearance.fontSearch.placeholder'),
    emptyMessage: t('settings.appearance.fontSearch.empty'),
  }
  const selectedGlass = GLASS_OPTIONS.reduce((best, candidate) =>
    Math.abs(candidate.value - props.preference.glass) <
    Math.abs(best.value - props.preference.glass)
      ? candidate
      : best,
  )
  const light = (backdropColorScheme(props.preference.backdrop) ?? props.mode) === 'light'
  const title =
    props.mode === 'light' ? t('settings.appearance.lightMode') : t('settings.appearance.darkMode')

  const defaultColors =
    props.preference.accent === 'neutral' && props.preference.backdrop === 'default'

  return (
    <SettingsSection
      title={title}
      action={
        defaultColors ? undefined : (
          <button
            className="set-button set-button--quiet"
            type="button"
            onClick={() => props.onChange({ accent: 'neutral', backdrop: 'default' })}
          >
            {t('settings.appearance.resetColors')}
          </button>
        )
      }
    >
      <SettingsRow
        searchId={`appearance:${props.mode}:accent`}
        name={t('settings.appearance.accent')}
      >
        <AppearanceColorPicker
          label={t('settings.appearance.accentPalette')}
          value={props.preference.accent}
          color={accentColor(props.preference.accent, light)}
          options={accentOptions}
          onChange={(accent) => props.onChange({ accent })}
        />
      </SettingsRow>
      <SettingsRow
        searchId={`appearance:${props.mode}:background`}
        name={t('settings.appearance.background')}
      >
        <AppearanceColorPicker
          label={t('settings.appearance.background')}
          value={props.preference.backdrop}
          color={backdropColor(props.preference.backdrop, light)}
          options={backdropOptions}
          onChange={(backdrop) => props.onChange({ backdrop })}
        />
      </SettingsRow>
      <SettingsRow
        searchId={`appearance:${props.mode}:interface-font`}
        name={t('settings.appearance.interfaceFont')}
      >
        <AppSelect
          className="set-select--inline"
          ariaLabel={t('settings.appearance.interfaceFont')}
          align="right"
          value={props.preference.font}
          options={fontOptions}
          onOpen={requestInstalledFontFamilies}
          loadingMessage={
            installedFontFamilies === undefined ? t('settings.appearance.fontsLoading') : undefined
          }
          search={fontSearch}
          onChange={(font) => props.onChange({ font })}
        />
      </SettingsRow>
      <SettingsRow
        searchId={`appearance:${props.mode}:sidebar-translucency`}
        name={t('settings.appearance.translucency')}
      >
        <AppSelect
          className="set-select--inline"
          ariaLabel={t('settings.appearance.translucency')}
          align="right"
          value={String(selectedGlass.value)}
          options={glassOptions}
          onChange={(value) => props.onChange({ glass: Number(value) })}
        />
      </SettingsRow>
    </SettingsSection>
  )
}

function SidebarHapticsSetting() {
  const { t } = useI18n()
  const enabled = useSyncExternalStore(subscribeAppHaptics, readAppHaptics, readAppHaptics)
  return (
    <SettingsRow
      searchId="haptics"
      name={t('settings.appearance.haptics.name')}
      note={t('settings.appearance.haptics.note')}
    >
      <button
        className={`switch${enabled ? ' is-on' : ''}`}
        type="button"
        role="switch"
        aria-label={t('settings.appearance.haptics.name')}
        aria-checked={enabled}
        onClick={() => {
          const next = !enabled
          writeAppHaptics(next)
          if (next) {
            prepareAppHaptics()
            performAppHaptic('generic')
          }
        }}
      >
        <span className="switch__thumb" />
      </button>
    </SettingsRow>
  )
}

function ThemePicker(props: {
  value: ThemePreference
  preferences: AppearancePreferences
  onChange: (theme: ThemePreference) => void
}) {
  const { t } = useI18n()
  return (
    <fieldset className="theme-picker">
      <legend className="visually-hidden">{t('settings.appearance.theme')}</legend>
      {THEME_OPTIONS.map((option) => {
        const selected = props.value === option.value

        return (
          <label className={`theme-option${selected ? ' is-selected' : ''}`} key={option.value}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={selected}
              onChange={() => props.onChange(option.value)}
            />
            <span className={`theme-preview theme-preview--${option.value}`} aria-hidden>
              {option.value === 'dark' ? null : (
                <ThemeWindow mode="light" preference={props.preferences.light} />
              )}
              {option.value === 'light' ? null : (
                <ThemeWindow mode="dark" preference={props.preferences.dark} />
              )}
            </span>
            <span className="theme-option__label">{t(option.label)}</span>
          </label>
        )
      })}
    </fieldset>
  )
}

type ThemeWindowStyle = CSSProperties & {
  '--window-paper': string
  '--window-ink': string
  '--window-accent': string
}

/**
 * A TUIFT Code window in miniature, painted in that mode's own background and
 * accent: the sidebar, a reply under your message, and the prompt bar with its
 * send button. System shows the light window and the dark one split down the middle.
 */
function ThemeWindow(props: { mode: ThemeColorScheme; preference: AppearancePreference }) {
  const light = (backdropColorScheme(props.preference.backdrop) ?? props.mode) === 'light'
  const paper = backdropColor(props.preference.backdrop, light)
  const style: ThemeWindowStyle = {
    '--window-paper': paper,
    '--window-ink': colorForeground(paper) === '#171717' ? '#27272a' : '#ededed',
    '--window-accent': accentColor(props.preference.accent, light),
  }
  return (
    <span className="theme-window" data-mode={props.mode} style={style}>
      <span className="theme-window__rail">
        <i />
        <i data-active />
        <i />
        <i />
      </span>
      <span className="theme-window__chat">
        <i data-you />
        <i />
        <i />
        <i />
        <span className="theme-window__prompt">
          <b />
        </span>
      </span>
    </span>
  )
}

function DataSettings(props: {
  projectCount: number
  projectsLoading?: boolean | undefined
  onReset: () => void
}) {
  const { t, tp } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState<boolean>()
  const [diagnosticsError, setDiagnosticsError] = useState<string>()
  // The row names what the reset clears; the note names what it leaves alone.
  const kept =
    props.projectCount === 0
      ? t('settings.data.keptNone')
      : tp('settings.data.kept', props.projectCount)

  useEffect(() => {
    let cancelled = false
    void localDiagnosticsEnabled()
      .then((enabled) => {
        if (!cancelled) setDiagnosticsEnabled(enabled)
      })
      .catch((cause) => {
        if (!cancelled) {
          setDiagnosticsError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleDiagnostics = async () => {
    setDiagnosticsError(undefined)
    try {
      setDiagnosticsEnabled(await setLocalDiagnosticsEnabled(!diagnosticsEnabled))
    } catch (cause) {
      setDiagnosticsError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <SettingsPage title={t('settings.nav.data')}>
      {isDesktop ? (
        <SettingsRow
          searchId="diagnostics"
          name={t('settings.data.diagnostics.name')}
          note={t('settings.data.diagnostics.note')}
        >
          {diagnosticsError ? <RowIssue message={diagnosticsError} /> : null}
          {diagnosticsEnabled ? (
            <button
              className="set-button"
              type="button"
              onClick={() => void openLocalDiagnostics()}
            >
              {t('settings.data.diagnostics.openFolder')}
            </button>
          ) : null}
          {diagnosticsEnabled === undefined ? (
            diagnosticsError ? null : (
              <SkeletonStatus
                label={t('settings.data.diagnostics.loading')}
                className="settings__switch-skeleton"
              >
                <Skeleton width={30} height={18} />
              </SkeletonStatus>
            )
          ) : (
            <button
              className={`switch${diagnosticsEnabled ? ' is-on' : ''}`}
              type="button"
              role="switch"
              aria-label={t('settings.data.diagnostics.name')}
              aria-checked={diagnosticsEnabled}
              onClick={() => void toggleDiagnostics()}
            >
              <span className="switch__thumb" />
            </button>
          )}
        </SettingsRow>
      ) : null}
      <SettingsRow
        searchId="reset-preferences"
        name={t('settings.data.reset.name')}
        note={
          <>
            {t('settings.data.reset.note')}{' '}
            {props.projectsLoading ? (
              <SettingsValueSkeleton label={t('settings.data.reset.loadingCount')} width={176} />
            ) : (
              kept
            )}
          </>
        }
      >
        <button
          className="set-button set-button--danger"
          type="button"
          aria-label={t('settings.data.reset.name')}
          onClick={() => setConfirming(true)}
        >
          <RotateCcw size={13} aria-hidden />
          <span>{t('settings.data.reset.button')}</span>
        </button>
      </SettingsRow>
      {confirming ? (
        <ResetConfirmation
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            props.onReset()
          }}
        />
      ) : null}
    </SettingsPage>
  )
}

function ResetConfirmation(props: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLButtonElement>('[data-reset-cancel]')?.focus()
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }
    if (event.key !== 'Tab' || event.defaultPrevented || !panel.current) return
    const focusable = Array.from(
      panel.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hasAttribute('disabled'))
    if (focusable.length === 0) return
    const current =
      document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1
    const next =
      current < 0
        ? event.shiftKey
          ? focusable.length - 1
          : 0
        : event.shiftKey
          ? (current - 1 + focusable.length) % focusable.length
          : (current + 1) % focusable.length
    event.preventDefault()
    focusable[next]?.focus()
  }

  return createPortal(
    <div className="sheet" role="presentation">
      <button
        className="sheet__scrim"
        type="button"
        tabIndex={-1}
        aria-label={t('settings.data.reset.cancelLabel')}
        onClick={props.onCancel}
      />
      <div
        className="sheet__panel checkout-discard"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="sheet__head">
          <h2 className="sheet__title" id={titleId}>
            {t('settings.data.reset.dialogTitle')}
          </h2>
        </header>
        <section className="sheet__section">
          <p className="checkout-discard__copy" id={descriptionId}>
            {t('settings.data.reset.dialogCopy')}
          </p>
          <div className="checkout-discard__actions">
            <button className="ghost" type="button" data-reset-cancel onClick={props.onCancel}>
              {t('settings.data.reset.cancel')}
            </button>
            <button className="btn btn--danger" type="button" onClick={props.onConfirm}>
              {t('settings.data.reset.confirm')}
            </button>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  )
}

export function DebugSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  return (
    <SettingsPage title={t('settings.nav.debug')}>
      <UsageHistoryReset transport={props.transport} />
    </SettingsPage>
  )
}

function UsageHistoryReset(props: { transport: Transport }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'resetting' | 'started' | 'error'>('idle')
  const [error, setError] = useState<string>()

  const resetUsage = async () => {
    setState('resetting')
    setError(undefined)
    try {
      await props.transport.request('usage.resetHistory', {})
      setState('started')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState('error')
    }
  }

  return (
    <SettingsRow
      searchId="debug-usage"
      name={t('settings.debug.usage.name')}
      note={t('settings.debug.usage.note')}
    >
      {state === 'started' ? (
        <StateLabel state="checking" detail={t('settings.debug.usage.started')} live />
      ) : null}
      {state === 'error' && error ? (
        <RowIssue message={error} tip={t('settings.debug.usage.tip')} />
      ) : null}
      <button
        className="set-button"
        type="button"
        disabled={state === 'resetting'}
        onClick={() => void resetUsage()}
      >
        <RotateCcw size={13} aria-hidden />
        <span>
          {state === 'resetting'
            ? t('settings.debug.usage.resetting')
            : t('settings.debug.usage.button')}
        </span>
      </button>
    </SettingsRow>
  )
}

function AboutSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ResultOf<'system.updateCheck'>>()
  const [nativeUpdate, setNativeUpdate] = useState<AppUpdateState>()
  const install = useSyncExternalStore(
    subscribeAppUpdateInstall,
    appUpdateInstallState,
    appUpdateInstallState,
  )
  // Install now stops running chats, so it asks once, here in the row.
  const [confirmStop, setConfirmStop] = useState(false)
  // Each step swaps the buttons. A step taken here hands the focus the clicked
  // button took with it to the next step's main button (Keep waiting in the
  // confirmation, so a stray Enter stops nothing); a step taken in the sidebar
  // or by the chats ending leaves focus where it is.
  const stepAction = useRef<HTMLButtonElement>(null)
  const steppedHere = useRef(false)
  const updateStep =
    install.phase === 'waiting' ? (confirmStop ? 'confirm' : 'wait') : install.phase
  const stepHere = (action: () => void) => () => {
    steppedHere.current = true
    action()
  }
  useEffect(() => {
    if (install.phase !== 'waiting') setConfirmStop(false)
  }, [install.phase])
  useLayoutEffect(() => {
    if (!steppedHere.current) return
    steppedHere.current = false
    stepAction.current?.focus()
  }, [updateStep])

  useEffect(() => {
    void appUpdateState().then(setNativeUpdate)
    return onAppUpdateState(setNativeUpdate)
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      const native = await appUpdateState()
      if (native.status !== 'unsupported') {
        setNativeUpdate(await checkForAppUpdates())
      } else {
        setResult(await props.transport.request('system.updateCheck', {}))
      }
    } catch (cause) {
      setResult({ error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setChecking(false)
    }
  }

  const short = (sha: string) => sha.slice(0, 7)
  const nativeChecking = nativeUpdate?.status === 'checking'
  const nativeDownloading = nativeUpdate?.status === 'downloading'
  const nativePreparing = nativeUpdate?.status === 'preparing'
  const nativeReady = nativeUpdate?.status === 'ready'
  const waiting = nativeReady && install.phase === 'waiting'
  // Restart to update was clicked while chats run: stop them, or wait?
  const asking = nativeReady && install.phase === 'confirming'
  const stopping = nativeReady && install.phase === 'stopping'
  const restarting = nativeReady && (install.phase === 'checking' || install.phase === 'installing')
  const confirming = waiting && confirmStop
  // Verdicts stay on the row's one line; a failure goes behind the red dot.
  const updateStatus = !result
    ? undefined
    : result.error
      ? undefined
      : result.upToDate
        ? {
            state: 'ready' as const,
            detail: result.remote
              ? t('settings.about.upToDateAt', { sha: short(result.remote.sha) })
              : t('settings.about.upToDate'),
          }
        : result.upToDate === false && result.remote
          ? {
              state: 'setup-needed' as const,
              detail: t('settings.about.newer', { sha: short(result.remote.sha) }),
            }
          : {
              state: 'unavailable' as const,
              // Without the local commit, a newer remote is only a guess.
              detail: result.remote
                ? t('settings.about.localUnknown', { sha: short(result.remote.sha) })
                : t('settings.about.noVerdict'),
            }
  const nativeStatus =
    nativeUpdate?.status === 'current'
      ? { state: 'ready' as const, detail: t('settings.about.upToDate') }
      : nativeDownloading
        ? {
            state: 'checking' as const,
            detail: `${
              nativeUpdate.version
                ? t('settings.about.downloadingVersion', { version: nativeUpdate.version })
                : t('settings.about.downloadingStatus')
            }${nativeUpdate.progress === undefined ? '' : ` · ${nativeUpdate.progress}%`}`,
          }
        : nativePreparing
          ? {
              state: 'checking' as const,
              detail: nativeUpdate.version
                ? t('settings.about.preparingVersion', { version: nativeUpdate.version })
                : t('settings.about.preparingUpdate'),
            }
          : nativeReady
            ? {
                state: 'ready' as const,
                detail:
                  install.phase === 'waiting'
                    ? waitingLabel(install.running)
                    : install.phase === 'confirming'
                      ? runningLabel(install.running)
                      : install.phase === 'stopping'
                        ? t('settings.about.stoppingChats', { chats: chatCount(install.running) })
                        : nativeUpdate.version
                          ? t('settings.about.versionReady', { version: nativeUpdate.version })
                          : t('settings.about.updateReady'),
              }
            : undefined

  return (
    <SettingsPage title={t('settings.nav.about')}>
      <SettingsRow searchId="about-version" name="TUIFT Code">
        <SettingsMeta>
          {nativeUpdate === undefined ? (
            <SettingsValueSkeleton label={t('settings.about.loadingVersion')} width={132} />
          ) : (
            `${isDesktop ? t('settings.about.desktop') : t('settings.about.browser')} · ${nativeUpdate.status !== 'unsupported' ? nativeUpdate.currentVersion : t('settings.about.preRelease')}${result?.localCommit ? ` · ${short(result.localCommit)}` : ''}`
          )}
        </SettingsMeta>
      </SettingsRow>
      <SettingsRow searchId="about-updates" name={t('settings.about.updates')}>
        {nativeUpdate?.status === 'error' ? (
          <RowIssue
            message={nativeUpdate.error ?? t('settings.about.checkFailed')}
            tip={t('settings.about.checkFailedTip')}
          />
        ) : result?.error ? (
          <RowIssue message={result.error} tip={t('settings.about.networkTip')} />
        ) : nativeReady && install.phase === 'idle' && install.failed ? (
          <RowIssue
            message={t('settings.about.installFailed')}
            tip={t('settings.about.installFailedTip')}
          />
        ) : null}
        {checking || nativeChecking ? <StateLabel state="checking" live /> : null}
        {!checking && nativeUpdate === undefined ? (
          <SettingsMeta>
            <SettingsValueSkeleton label={t('settings.about.loadingStatus')} width={112} />
          </SettingsMeta>
        ) : null}
        {!checking && !nativeChecking && nativeStatus ? (
          <StateLabel {...nativeStatus} live />
        ) : null}
        {!checking && !nativeChecking && !nativeStatus && updateStatus ? (
          <StateLabel {...updateStatus} live />
        ) : null}
        {asking ? (
          <>
            <button
              className="set-button set-button--quiet"
              type="button"
              onClick={stepHere(cancelAppUpdateInstall)}
            >
              {t('settings.about.notNow')}
            </button>
            <button
              ref={stepAction}
              className="set-button set-button--quiet"
              type="button"
              onClick={stepHere(installWhenChatsFinish)}
            >
              {t('settings.about.whenFinish')}
            </button>
            <button
              className="set-button set-button--danger"
              type="button"
              onClick={stepHere(() => void stopChatsAndInstall())}
            >
              {t('settings.about.stopAndUpdate', { chats: chatCount(install.running) })}
            </button>
          </>
        ) : confirming ? (
          <>
            <button
              ref={stepAction}
              className="set-button set-button--quiet"
              type="button"
              onClick={stepHere(() => setConfirmStop(false))}
            >
              {t('settings.about.keepWaiting')}
            </button>
            <button
              className="set-button set-button--danger"
              type="button"
              onClick={stepHere(() => {
                setConfirmStop(false)
                void stopChatsAndInstall()
              })}
            >
              {t('settings.about.stopAndInstall', { chats: chatCount(install.running) })}
            </button>
          </>
        ) : waiting ? (
          <>
            <button
              className="set-button set-button--quiet"
              type="button"
              onClick={stepHere(cancelAppUpdateInstall)}
            >
              {t('settings.about.installLater')}
            </button>
            <button
              ref={stepAction}
              className="set-button"
              type="button"
              onClick={stepHere(() => setConfirmStop(true))}
            >
              {t('settings.about.installNow')}
            </button>
          </>
        ) : (
          <button
            ref={stepAction}
            className="set-button"
            type="button"
            disabled={
              checking ||
              nativeChecking ||
              nativeDownloading ||
              nativePreparing ||
              stopping ||
              restarting
            }
            onClick={
              nativeReady
                ? stepHere(() => {
                    setConfirmStop(false)
                    void requestAppUpdateInstall()
                  })
                : () => void check()
            }
          >
            <Refresh size={13} aria-hidden />
            {stopping
              ? t('settings.about.stopping')
              : restarting
                ? t('settings.about.restarting')
                : nativeReady
                  ? t('settings.about.restart')
                  : nativeDownloading
                    ? t('settings.about.downloading')
                    : nativePreparing
                      ? t('settings.about.preparing')
                      : checking || nativeChecking
                        ? t('settings.providers.checking')
                        : t('settings.about.check')}
          </button>
        )}
      </SettingsRow>
      <SettingsRow searchId="about-source" name={t('settings.about.source')}>
        <button
          className="set-button"
          type="button"
          onClick={() =>
            window.open('https://github.com/iamjeffia/TuiftCode', '_blank', 'noopener,noreferrer')
          }
        >
          GitHub
        </button>
      </SettingsRow>
    </SettingsPage>
  )
}

/**
 * A provider that is not on this machine yet. When the server knows a real
 * install command the button runs it in the background — no docs page — and
 * the row narrates progress from the live output. App-level callers hand the
 * live terminal to the expanded workspace card, and Show terminal brings that
 * one view back; isolated callers keep the attachable details fallback here.
 */
function InstallableRow(props: {
  provider: ProviderStatus
  target: InstallTarget
  transport: Transport
  onInstalled: () => void
  onOpenExpandedTerminal?: ((target: ProviderLoginTerminalTarget) => void) | undefined
  mark?: ProviderMark | undefined
}) {
  const { t } = useI18n()
  const key = installKey(props.target)
  const detailsId = useId()
  const install = useSyncExternalStore(subscribeInstalls, () => installState(key))
  const [showTerminal, setShowTerminal] = useState(false)
  const [startError, setStartError] = useState<string>()
  const { onInstalled } = props
  // Someone may install it outside the app; this looks again on request.
  const recheck = useInstallCheck(props.transport, props.target, onInstalled)

  // Latched: the succeeded state persists across renders (see the unmount
  // cleanup below), and onInstalled may get a new identity from any parent
  // render. Without the latch those two combine into an infinite refresh
  // loop — notify → parent renders → new identity → effect refires — which
  // once held ~170 concurrent `opencode serve` processes alive.
  const notifiedInstall = useRef(false)
  useEffect(() => {
    if (install?.phase === 'failed') setShowTerminal(true)
    if (install?.phase === 'succeeded') {
      if (!notifiedInstall.current) {
        notifiedInstall.current = true
        onInstalled()
      }
    } else {
      notifiedInstall.current = false
    }
  }, [install?.phase, onInstalled])

  // The succeeded entry stays until this row leaves the page — re-detecting
  // the provider takes a moment, and clearing early would flash the idle
  // "Install" button in between. The row unmounting is the confirmation.
  useEffect(
    () => () => {
      if (installState(key)?.phase === 'succeeded') clearInstall(key)
    },
    [key],
  )

  const openExpandedTerminal = () =>
    props.onOpenExpandedTerminal?.({
      provider: props.provider.id,
      displayName: props.provider.displayName,
      installKey: key,
      operation: 'install',
    })

  const start = () => {
    setStartError(undefined)
    setShowTerminal(false)
    void beginInstall(props.transport, props.target)
      .then(openExpandedTerminal)
      .catch((cause: unknown) =>
        setStartError(cause instanceof Error ? cause.message : String(cause)),
      )
  }

  const status =
    install?.phase === 'running'
      ? t('settings.providers.installing')
      : install?.phase === 'succeeded'
        ? t('settings.providers.installedRefreshing')
        : install?.phase === 'failed' || startError
          ? t('settings.providers.installFailedStatus')
          : recheck.checking
            ? t('settings.providers.checking')
            : t('settings.providers.notInstalled')
  const issue =
    install?.phase === 'failed'
      ? {
          message:
            install.exitCode === null
              ? t('settings.providers.installFailed')
              : t('settings.providers.installFailedExit', { code: install.exitCode }),
          announce: true,
        }
      : startError
        ? {
            message: startError,
            announce: true,
          }
        : undefined
  const setup = props.provider.setup
  // The workspace keeps an install's terminal, failed ones included, until it
  // is closed; the row reopens that view rather than drawing a second one.
  const inline = !props.onOpenExpandedTerminal
  const secondary: ProviderAction | undefined =
    install?.phase === 'running' || install?.phase === 'failed' || install?.phase === 'succeeded'
      ? !inline
        ? install.phase === 'succeeded'
          ? undefined
          : { label: t('settings.providers.showTerminal'), onClick: openExpandedTerminal }
        : {
            label: showTerminal
              ? t('settings.providers.hideDetails')
              : t('settings.providers.details'),
            expanded: showTerminal,
            controls: detailsId,
            onClick: () => setShowTerminal((visible) => !visible),
          }
      : {
          label: t('settings.providers.checkAgain'),
          disabled: recheck.checking,
          onClick: recheck.check,
        }
  const primary: ProviderAction | undefined = !setup?.installCommand
    ? setup
      ? { label: t('settings.providers.setupGuide'), href: setup.installUrl }
      : undefined
    : install?.phase === 'running'
      ? { label: t('settings.providers.installing'), disabled: true }
      : install?.phase === 'succeeded'
        ? { label: t('settings.providers.installed'), disabled: true }
        : {
            label:
              install?.phase === 'failed'
                ? t('settings.providers.retryInstall')
                : t('settings.providers.install'),
            onClick: start,
          }

  return (
    <>
      <ProviderRow
        provider={props.provider}
        mark={props.mark}
        status={status}
        link="none"
        live={install?.phase === 'running' || install?.phase === 'succeeded' || recheck.checking}
        issue={issue}
        primary={primary}
        secondary={secondary}
      />
      {install && inline ? (
        <div id={detailsId} className="provider-terminal" hidden={!showTerminal}>
          {showTerminal ? <ProviderTerminal transport={props.transport} installKey={key} /> : null}
        </div>
      ) : null}
    </>
  )
}

/**
 * Sign-in for a provider whose login lives inside its own CLI. The button
 * launches that CLI in a server-side pty. App-level callers hand the attached
 * terminal to the expanded workspace pane for every provider, and Show terminal
 * brings that one view back while the sign-in runs; isolated callers keep the
 * guided card and attachable details here. A clean exit refreshes the account,
 * while a dirty exit keeps the log behind Details for a retry.
 */
function CliSignInRow(props: {
  provider: ProviderStatus
  target: InstallTarget
  transport: Transport
  onSignedIn: () => void
  onOpenExpandedTerminal?: ((target: ProviderLoginTerminalTarget) => void) | undefined
  mark?: ProviderMark | undefined
}) {
  const { t } = useI18n()
  const key = loginKey(props.target)
  const detailsId = useId()
  const login = useSyncExternalStore(subscribeInstalls, () => installState(key))
  // Keep failed output behind Details; the status carries the error.
  const [showTerminal, setShowTerminal] = useState(false)
  const [startError, setStartError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const { onSignedIn } = props

  // Latched like InstallableRow: onSignedIn may get a new identity from any
  // parent render, and firing more than once per success is the seed of the
  // refresh loop fixed there.
  const notifiedLogin = useRef(false)
  const confirmedEmail = signedInEmail(login?.log ?? '')
  useEffect(() => {
    if (!confirmedEmail) return
    try {
      localStorage.setItem(providerEmailKey(props.provider.id), confirmedEmail)
    } catch {
      // Sign-in still completes when storage is full or blocked.
    }
  }, [confirmedEmail, props.provider.id])

  useEffect(() => {
    if (login?.phase === 'succeeded') {
      if (!notifiedLogin.current) {
        notifiedLogin.current = true
        if (!props.onOpenExpandedTerminal) clearInstall(key)
        onSignedIn()
      }
    } else {
      notifiedLogin.current = false
    }
  }, [login?.phase, key, onSignedIn, props.onOpenExpandedTerminal])

  useEffect(() => {
    if (login?.phase && login.phase !== 'running') setShowTerminal(false)
  }, [login?.phase])

  const openExpandedTerminal = () =>
    props.onOpenExpandedTerminal?.({
      provider: props.provider.id,
      displayName: props.provider.displayName,
      installKey: key,
    })

  const start = () => {
    setStarting(true)
    setStartError(undefined)
    setShowTerminal(false)
    setCopied(false)
    // The expanded provider CLI opens its own browser. Do not open the URL it
    // prints as well, or one Sign in click creates two browser tabs.
    void beginLogin(
      props.transport,
      props.target,
      props.onOpenExpandedTerminal && props.provider.setup?.loginOpensBrowser !== false
        ? () => undefined
        : undefined,
    )
      .then(() => {
        if (installState(key)?.phase !== 'running' || installState(key)?.canceling) return
        openExpandedTerminal()
      })
      .catch((cause: unknown) =>
        setStartError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setStarting(false))
  }

  const cancel = () => {
    setCanceling(true)
    setStartError(undefined)
    void cancelInstall(props.transport, key)
      .catch((cause: unknown) =>
        setStartError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setCanceling(false))
  }

  const running = login?.phase === 'running'
  const code = running ? deviceCode(login.log) : undefined
  const issue =
    login?.phase === 'failed'
      ? {
          message:
            login.exitCode === null
              ? t('settings.providers.cliExited')
              : t('settings.providers.cliExitedCode', { code: login.exitCode }),
          announce: true,
        }
      : startError
        ? {
            message: startError,
            announce: true,
          }
        : props.provider.problem
          ? { message: props.provider.problem }
          : undefined
  const busy = running || starting
  const stopping = canceling || login?.canceling
  const status = stopping
    ? t('settings.providers.cancelingSignIn')
    : busy
      ? t('settings.providers.signingIn')
      : issue?.announce
        ? t('settings.providers.signInFailed')
        : login?.phase === 'canceled'
          ? t('settings.providers.signInCanceled')
          : t('settings.providers.notSignedIn')
  // While the sign-in runs, the workspace terminal is its one view: the row
  // brings it back instead of attaching a second one. App closes that view when
  // a sign-in ends, so a failed one keeps its log behind Details here.
  const inline = !props.onOpenExpandedTerminal || !running
  const details: ProviderAction | undefined = !inline
    ? {
        label: t('settings.providers.showTerminal'),
        disabled: stopping,
        onClick: openExpandedTerminal,
      }
    : login && (running || login.phase === 'failed')
      ? {
          label: showTerminal
            ? t('settings.providers.hideDetails')
            : t('settings.providers.details'),
          expanded: showTerminal,
          controls: detailsId,
          onClick: () => setShowTerminal((visible) => !visible),
        }
      : undefined

  return (
    <>
      <ProviderRow
        provider={props.provider}
        mark={props.mark}
        status={status}
        live={busy}
        issue={issue}
        primary={{
          label: stopping
            ? t('settings.providers.canceling')
            : busy
              ? t('settings.providers.cancelSignIn')
              : issue?.announce
                ? t('settings.providers.retrySignIn')
                : t('settings.providers.signIn'),
          disabled: stopping,
          onClick: busy ? cancel : start,
        }}
        secondary={details}
      />
      {running ? (
        <div className="signin-card">
          {code ? (
            <div className="signin-card__code-row">
              <span className="signin-card__hint">{t('settings.providers.confirmCode')}</span>
              <code className="signin-card__code">{code}</code>
              <button
                className="set-button"
                type="button"
                onClick={() => {
                  void writeClipboardText(code).then(
                    () => setCopied(true),
                    () => undefined,
                  )
                }}
              >
                {copied ? t('settings.providers.copied') : t('settings.providers.copy')}
              </button>
            </div>
          ) : (
            <span className="signin-card__hint">
              {login.openedAuthUrl
                ? t('settings.providers.browserOpened')
                : t('settings.providers.startingSignIn')}
            </span>
          )}
          {login.openedAuthUrl ? (
            <button
              className="set-button"
              type="button"
              onClick={() => window.open(login.openedAuthUrl, '_blank', 'noopener,noreferrer')}
            >
              {t('settings.providers.openLinkAgain')}
            </button>
          ) : null}
          {!showTerminal && login.lastLine ? (
            <span className="signin-card__live">{login.lastLine}</span>
          ) : null}
        </div>
      ) : null}
      {login && inline ? (
        <div id={detailsId} className="provider-terminal" hidden={!showTerminal}>
          {showTerminal ? <ProviderTerminal transport={props.transport} installKey={key} /> : null}
        </div>
      ) : null}
    </>
  )
}

/** An install or sign-in log on the workspace terminal's look, like the expanded terminal. */
function ProviderTerminal(props: { transport: Transport; installKey: string }) {
  const { t } = useI18n()
  return (
    <Suspense
      fallback={
        <SkeletonStatus
          label={t('settings.providers.openingTerminal')}
          className="install-terminal"
        >
          <SkeletonCode lines={9} />
        </SkeletonStatus>
      }
    >
      <InstallTerminal
        transport={props.transport}
        installKey={props.installKey}
        profile="workspace"
      />
    </Suspense>
  )
}

/**
 * A provider we intend to support but have not built. Listing it beats
 * omitting it — "not supported yet" and "not installed" must stay
 * distinguishable, and the roadmap belongs in the product, not a doc.
 */
function providerEmailKey(provider: ProviderId): string {
  return `harness.providerEmail.${provider}`
}

/**
 * Whether the last read of a provider's default account, in this run or an
 * earlier one, said signed in (remembered-sign-in.ts). A row opens on it while
 * its account is read again; the saved email names who, as after any read.
 */
function keptSignIn(provider: ProviderId): Account | undefined {
  const signedIn = lastSignIn(provider)
  return signedIn === undefined ? undefined : { signedIn }
}

function AccountIdentity(props: { provider: ProviderId; account: Account }) {
  const { t } = useI18n()
  const [savedEmail] = useState(() => {
    try {
      return localStorage.getItem(providerEmailKey(props.provider))
    } catch {
      return null
    }
  })
  const email = props.account.email ?? savedEmail

  return (
    <span className="settings__account">
      {email ? <AccountEmail email={email} /> : t('settings.providers.signedIn')}
      {props.account.plan ? (
        <span className="settings__account-plan"> · {props.account.plan}</span>
      ) : null}
    </span>
  )
}

function SettingsValueSkeleton(props: { label: string; width: number }) {
  return (
    <span className="settings-value-skeleton skeleton-group" role="status" aria-busy="true">
      <span className="visually-hidden">{props.label}</span>
      <Skeleton width={props.width} height={9} />
    </span>
  )
}

export const Settings = memo(SettingsComponent)
