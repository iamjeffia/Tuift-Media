import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { PhoneAccessStatus, PhoneAddress, PhonePairing } from '@harness/contracts'
import { writeClipboardText } from '../bridge.js'
import { getLanguage, t, useI18n, type MessageKey } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import { RowIssue } from './RowIssue.js'
import { Skeleton, SkeletonStatus } from './Skeleton.js'
import { withStrong } from './settings/rich-message.js'
import {
  SettingsEmpty,
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './settings/SettingsLayout.js'
import '../styles/phone-settings.css'

const ADDRESS_LABELS = {
  hostname: 'settings.phone.addressHostname',
  lan: 'settings.phone.addressLan',
  tailscale: 'settings.phone.addressTailscale',
} as const satisfies Record<PhoneAddress['kind'], MessageKey>

/**
 * Pairing a phone and the phones already paired. The pairing code is the page:
 * while it is open the computer is waiting for exactly one phone, and the code
 * gives way to that phone's name the moment it pairs.
 */
export function PhoneSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  const { transport } = props
  const [status, setStatus] = useState<PhoneAccessStatus>()
  const [pairing, setPairing] = useState<PhonePairing>()
  const [paired, setPaired] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const knownDevices = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const accept = (next: PhoneAccessStatus) => {
      if (cancelled) return
      setStatus(next)
      if (next.pairingExpiresAt === undefined) setPairing(undefined)
      const added = next.devices.find((device) => !knownDevices.current.has(device.id))
      if (added && knownDevices.current.size + 1 === next.devices.length) setPaired(added.name)
      knownDevices.current = new Set(next.devices.map((device) => device.id))
    }
    const off = transport.on('phone.changed', accept)
    transport
      .request('phone.status', {})
      .then((next) => {
        knownDevices.current = new Set(next.devices.map((device) => device.id))
        accept(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
      off()
    }
  }, [transport])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const toggle = () =>
    run(async () => {
      setStatus(await transport.request('phone.setEnabled', { enabled: !status?.enabled }))
    })

  const startPairing = () =>
    run(async () => {
      setPaired(undefined)
      const result = await transport.request('phone.startPairing', {})
      setStatus(result.status)
      setPairing(result.pairing)
    })

  const cancelPairing = () =>
    run(async () => {
      setStatus(await transport.request('phone.cancelPairing', {}))
      setPairing(undefined)
    })

  const removeDevice = (deviceId: string) =>
    run(async () => {
      setStatus(await transport.request('phone.removeDevice', { deviceId }))
    })

  return (
    <SettingsPage title={t('settings.nav.phone')} description={t('settings.phone.description')}>
      {status === undefined ? (
        error ? (
          <SettingsNotice tone="error">{error}</SettingsNotice>
        ) : (
          <SkeletonStatus label={t('settings.phone.loading')}>
            <Skeleton width={260} height={11} />
          </SkeletonStatus>
        )
      ) : (
        <>
          <SettingsRow
            searchId="phone-access"
            name={t('settings.phone.access.name')}
            note={t('settings.phone.access.note')}
            tone={status.enabled ? 'active' : undefined}
          >
            <button
              className={`switch${status.enabled ? ' is-on' : ''}`}
              type="button"
              role="switch"
              aria-label={t('settings.phone.access.name')}
              aria-checked={status.enabled}
              disabled={busy}
              onClick={() => void toggle()}
            >
              <span className="switch__thumb" />
            </button>
          </SettingsRow>
          {status.enabled && status.addresses.length > 0 ? (
            <SettingsRow
              name={t('settings.phone.reachable')}
              note={t('settings.phone.port', { port: status.port })}
            >
              <span className="phone-addresses">
                {status.addresses.map((address) => (
                  <span key={address.host} title={t(ADDRESS_LABELS[address.kind])}>
                    {address.host}
                  </span>
                ))}
              </span>
            </SettingsRow>
          ) : null}
          {status.error ? <SettingsNotice tone="error">{status.error}</SettingsNotice> : null}
          {error ? <RowIssue message={error} /> : null}

          <SettingsSection
            title={t('settings.phone.pair.title')}
            note={pairing ? undefined : t('settings.phone.pair.note')}
          >
            {pairing ? (
              <PairingCode
                pairing={pairing}
                serverName={status.serverName}
                busy={busy}
                onCancel={() => void cancelPairing()}
              />
            ) : (
              <div className="phone-pair">
                {paired ? (
                  <p className="phone-pair__done" role="status">
                    {withStrong((name) => t('settings.phone.pair.done', { name }), paired)}
                  </p>
                ) : null}
                <button
                  className="set-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void startPairing()}
                >
                  {paired ? t('settings.phone.pair.another') : t('settings.phone.pair.show')}
                </button>
              </div>
            )}
          </SettingsSection>

          <SettingsSection title={t('settings.phone.devices.title')}>
            {status.devices.length === 0 ? (
              <SettingsEmpty title={t('settings.phone.devices.empty')} />
            ) : (
              status.devices.map((device) => (
                <article
                  className="set-entity"
                  key={device.id}
                  data-tone={device.connected ? undefined : 'muted'}
                >
                  <div className="set-entity__main">
                    <div className="set-entity__head">
                      <h2 className="set-entity__name">{device.name}</h2>
                      <span className="set-leader" aria-hidden />
                      <span
                        className="set-entity__status"
                        data-connected={device.connected || undefined}
                      >
                        {device.connected
                          ? t('settings.phone.devices.connected')
                          : lastSeen(device.lastSeenAt)}
                      </span>
                    </div>
                    <p className="set-entity__detail">
                      {t('settings.phone.devices.paired', { date: formatDate(device.pairedAt) })}
                    </p>
                  </div>
                  <div className="set-entity__actions">
                    <button
                      className="set-button set-button--quiet"
                      type="button"
                      disabled={busy}
                      aria-label={t('settings.phone.devices.removeLabel', { name: device.name })}
                      onClick={() => void removeDevice(device.id)}
                    >
                      {t('settings.phone.devices.remove')}
                    </button>
                  </div>
                </article>
              ))
            )}
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  )
}

function PairingCode(props: {
  pairing: PhonePairing
  serverName: string
  busy: boolean
  onCancel: () => void
}) {
  const { t } = useI18n()
  const path = useMemo(() => qrPath(props.pairing.uri), [props.pairing.uri])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (copy !== 'copied') return
    const timer = window.setTimeout(() => setCopy('idle'), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copy])
  const copyLink = async () => {
    try {
      await writeClipboardText(props.pairing.uri)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }
  const left = Math.max(0, props.pairing.expiresAt - now)
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1_000)
  return (
    <div className="phone-code">
      <svg
        className="phone-code__qr"
        viewBox={`0 0 ${path.size} ${path.size}`}
        role="img"
        aria-label={t('settings.phone.code.label')}
        shapeRendering="crispEdges"
      >
        <rect width={path.size} height={path.size} fill="#fff" />
        <path d={path.d} fill="#111" />
      </svg>
      <div className="phone-code__copy">
        <p className="phone-code__title">{t('settings.phone.code.title')}</p>
        <p className="phone-code__note">
          {withStrong((name) => t('settings.phone.code.note', { name }), props.serverName)}
        </p>
        <p className="phone-code__expiry">
          {t('settings.phone.code.expires', {
            time: `${minutes}:${String(seconds).padStart(2, '0')}`,
          })}
        </p>
        <div className="phone-code__actions">
          <button
            className="set-button"
            type="button"
            disabled={props.busy}
            onClick={() => void copyLink()}
          >
            {copy === 'copied' ? t('settings.phone.code.copied') : t('settings.phone.code.copy')}
          </button>
          <button
            className="set-button set-button--quiet"
            type="button"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            {t('settings.phone.code.cancel')}
          </button>
          {copy === 'failed' ? (
            <span className="phone-code__issue" role="alert">
              {t('settings.phone.code.copyFailed')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** How long "Copied" stays before the button reads "Copy link" again. */
const COPIED_MS = 1600

const QR_MARGIN = 2

type QrPath = { d: string; size: number }

/** One path of unit squares, so the code stays sharp at any size. */
function qrPath(text: string): QrPath {
  // A screen is never smudged; the lowest correction keeps the code sparse enough to scan quickly.
  const code = qrcode(0, 'L')
  code.addData(text)
  code.make()
  const count = code.getModuleCount()
  let d = ''
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (code.isDark(row, column)) d += `M${column + QR_MARGIN} ${row + QR_MARGIN}h1v1h-1z`
    }
  }
  return { d, size: count + QR_MARGIN * 2 }
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(getLanguage() === 'en' ? undefined : 'pt-BR', {
    month: 'short',
    day: 'numeric',
  })
}

function lastSeen(at: number | undefined): string {
  if (at === undefined) return t('settings.phone.seen.never')
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return t('settings.phone.seen.now')
  if (minutes < 60) return t('settings.phone.seen.minutes', { minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('settings.phone.seen.hours', { hours })
  return t('settings.phone.seen.date', { date: formatDate(at) })
}
