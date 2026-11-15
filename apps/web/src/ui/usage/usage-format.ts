/** Number and date formats shared by the Usage page's sections and the account popup. */

import { getLanguage, t, type MessageKey } from '../../i18n/index.js'

/** The formats follow the interface language; English keeps the en-US shapes it always had. */
const LOCALES = { en: 'en-US', 'pt-BR': 'pt-BR' } as const

const numbers = new Map<string, Intl.NumberFormat>()
/** A number format for the current language, kept so each one is built once. */
export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${getLanguage()}:${JSON.stringify(options)}`
  let format = numbers.get(key)
  if (!format) {
    format = new Intl.NumberFormat(LOCALES[getLanguage()], options)
    numbers.set(key, format)
  }
  return format
}

const dates = new Map<string, Intl.DateTimeFormat>()
/** A date format for the current language, kept so each one is built once. */
export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${getLanguage()}:${JSON.stringify(options)}`
  let format = dates.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALES[getLanguage()], options)
    dates.set(key, format)
  }
  return format
}

const MONEY: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}

export function formatInteger(value: number): string {
  return numberFormat().format(Math.round(value))
}

export function formatMoney(value: number): string {
  return numberFormat(MONEY).format(value)
}

/**
 * A count with its noun, "1 session" or "1,234 sessions". The count is written with
 * thousands separators, which `tp` does not do, so the caller names both forms.
 */
export function countText(value: number, one: MessageKey, other: MessageKey): string {
  return t(value === 1 ? one : other, { count: formatInteger(value) })
}

/** "950", "12.3K", "1.23M", "51.4B": three significant figures at most. */
export function formatTokens(value: number): string {
  const absolute = Math.abs(value)
  if (absolute < 1_000) return formatInteger(value)
  const units = [
    { size: 1_000_000_000_000, suffix: 'T' },
    { size: 1_000_000_000, suffix: 'B' },
    { size: 1_000_000, suffix: 'M' },
    { size: 1_000, suffix: 'K' },
  ]
  const unit = units.find((candidate) => absolute >= candidate.size) ?? units.at(-1)
  if (!unit) return formatInteger(value)
  const scaled = value / unit.size
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2
  // Up to `digits` decimals, without trailing zeros: "12.3", "1.4", "412".
  return `${numberFormat({ maximumFractionDigits: digits }).format(scaled)}${unit.suffix}`
}

/** A day key ("2026-10-17") at local noon, so no time zone moves it to another day. */
export function dateFromKey(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

const weekdayOptions: Intl.DateTimeFormatOptions = { weekday: 'short' }
const monthDayOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const monthDayYearOptions: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}
const clockOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
/** The clock follows the system's own hour style in English, as it always has. */
const clock = (date: Date) =>
  new Intl.DateTimeFormat(getLanguage() === 'en' ? undefined : 'pt-BR', clockOptions).format(date)

/**
 * A moment in the words of a reset line: "Nov 30, 9:24 PM", with the year
 * only when it is not this year's.
 */
export function dateTimeText(at: number, now: number): string | undefined {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return undefined
  const day =
    date.getFullYear() === new Date(now).getFullYear()
      ? dateFormat(monthDayOptions).format(date)
      : dateFormat(monthDayYearOptions).format(date)
  return `${day}, ${clock(date)}`
}

/**
 * "resets in 42m" and "resets in 3h 12m" within a day, the weekday and time
 * within the week, the date after that. The exact time is kept for hover.
 */
export function resetText(at: number, now: number): { label: string; title: string } | undefined {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return undefined
  const weekday = dateFormat(weekdayOptions).format(date)
  const monthDay = dateFormat(monthDayOptions).format(date)
  const title = `${weekday}, ${monthDay}, ${clock(date)}`
  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes <= 0) return { label: t('settings.usageFormat.resetsNow'), title }
  if (minutes < 60) return { label: t('settings.usageFormat.resetsInMinutes', { minutes }), title }
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return {
      label:
        rest > 0
          ? t('settings.usageFormat.resetsInHoursMinutes', { hours, minutes: rest })
          : t('settings.usageFormat.resetsInHours', { hours }),
      title,
    }
  }
  if (at - now < 6 * 86_400_000) {
    return { label: t('settings.usageFormat.resetsWeekday', { weekday, time: clock(date) }), title }
  }
  return { label: t('settings.usageFormat.resetsDate', { date: monthDay }), title }
}
