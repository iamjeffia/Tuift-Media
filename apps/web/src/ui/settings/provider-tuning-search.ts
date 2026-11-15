import {
  DEFAULT_ACCOUNT_ID,
  type Account,
  type ProviderAccount,
  type ProviderStatus,
} from '@harness/contracts'
import { t, type MessageKey } from '../../i18n/index.js'
import type { SettingsSearchEntry } from './settings-search.js'

/** These labels are shared with the rows they describe. */
export const TUNING_LABELS = {
  model: 'Model',
  access: 'Access',
  context: 'Context',
  runtime: 'Runtime',
} as const
/** The executable path control's label, shared with its search entry. */
export const EXECUTABLE_PATH_LABEL = 'Executable path'
/** How each shared label reads in a search result: "{name}" is the provider or account. */
const TUNING_TITLE_KEYS = {
  Model: 'settings.search.tuning.model',
  Access: 'settings.search.tuning.access',
  Context: 'settings.search.tuning.context',
  Runtime: 'settings.search.tuning.runtime',
} as const satisfies Record<(typeof TUNING_LABELS)[keyof typeof TUNING_LABELS], MessageKey>
export function executablePathSearchId(source: string): string {
  return `provider:${source}:executable-path`
}
/** Every provider row that runs its own CLI shows where that CLI is found. */
export function executablePathEntries(statuses: readonly ProviderStatus[]): SettingsSearchEntry[] {
  return statuses
    .filter((status) => status.id !== 'api' && status.id !== 'acp')
    .map((status) => ({
      id: executablePathSearchId(status.id),
      section: 'providers' as const,
      title: t('settings.search.executablePath', { name: status.displayName }),
      keywords: 'cli binary command location custom path',
    }))
}
export function tuningSearchId(provider: string, name: string, label: string): string {
  return `provider:${provider}:${name}:${label}`
}
export function providerTuningEntries(
  statuses: readonly ProviderStatus[],
  accounts: readonly ProviderAccount[],
  signedIn: ReadonlyMap<string, Account>,
): SettingsSearchEntry[] {
  return statuses.flatMap((status) => {
    const own = accounts.filter((account) => account.provider === status.id)
    const defaultAccount =
      own.length > 1 ? own.find((account) => account.id === DEFAULT_ACCOUNT_ID) : undefined
    const defaultName = defaultAccount
      ? `${status.displayName} · ${defaultAccount.label}`
      : status.displayName
    const names = [
      ...(signedIn.get(status.id)?.signedIn ? [{ name: defaultName, runtime: true }] : []),
      ...(status.installed && status.capabilities?.multipleAccounts === true ? own : [])
        .filter(
          (account) =>
            account.id !== DEFAULT_ACCOUNT_ID &&
            (account.email !== undefined || account.plan !== undefined),
        )
        .map((account) => ({ name: `${status.displayName} · ${account.label}`, runtime: false })),
    ]
    return names.flatMap(({ name, runtime }) =>
      [
        TUNING_LABELS.model,
        TUNING_LABELS.access,
        ...(status.capabilities?.context ? [TUNING_LABELS.context] : []),
        ...(runtime && (status.capabilities?.runtimes?.length ?? 0) > 1
          ? [TUNING_LABELS.runtime]
          : []),
      ].map((label) => ({
        id: tuningSearchId(status.id, name, label),
        section: 'providers' as const,
        title: t(TUNING_TITLE_KEYS[label], { name }),
        keywords: 'provider defaults new chat',
      })),
    )
  })
}
