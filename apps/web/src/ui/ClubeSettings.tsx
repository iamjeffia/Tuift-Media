import { useEffect, useState } from 'react'
import type { SoundSettings as SoundSettingsValue } from '@harness/contracts'
import { pickFolder } from '../bridge.js'
import { CLUBE_FAILURE_WORDS, CLUBE_PLAN_WORDS, CLUBE_PLANS_LINK, useClube } from '../clube.js'
import { useI18n } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import { Skeleton, SkeletonStatus } from './Skeleton.js'
import {
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './settings/SettingsLayout.js'

/**
 * The link to the Clube do Motion account: not connected, waiting for the
 * browser, connected (with or without a subscription) and why a sign-in ended.
 * Everything the page knows comes from `clube.status`, which never carries a token.
 */
export function ClubeSettings(props: { transport: Transport }) {
  const { t } = useI18n()
  const clube = useClube(props.transport)
  const { status } = clube

  return (
    <SettingsPage title={t('settings.nav.clube')} description={t('settings.clube.description')}>
      {clube.failed ? (
        <SettingsNotice tone="error">{t('settings.clube.unavailable')}</SettingsNotice>
      ) : null}
      {status === undefined ? (
        clube.failed ? null : (
          <SkeletonStatus label={t('settings.clube.loading')}>
            <Skeleton width={260} height={11} />
          </SkeletonStatus>
        )
      ) : null}

      {status?.state === 'disconnected' ? (
        <>
          {status.failure ? (
            <SettingsNotice tone="error">{t(CLUBE_FAILURE_WORDS[status.failure])}</SettingsNotice>
          ) : null}
          <SettingsRow
            searchId="clube-account"
            name={t('settings.clube.account.name')}
            note={t('settings.clube.off.note')}
          >
            <button
              className="set-button"
              type="button"
              disabled={clube.busy}
              onClick={() => void clube.connect()}
            >
              {t('settings.clube.connect')}
            </button>
          </SettingsRow>
        </>
      ) : null}

      {status?.state === 'connecting' ? (
        <SettingsRow
          searchId="clube-account"
          name={t('settings.clube.account.name')}
          note={t('settings.clube.connecting.note')}
          tone="active"
        >
          <span role="status">{t('settings.clube.connecting.state')}</span>
          {clube.authUrl ? (
            <button
              className="set-button set-button--quiet"
              type="button"
              onClick={() => clube.open(clube.authUrl!)}
            >
              {t('settings.clube.reopen')}
            </button>
          ) : null}
          <button
            className="set-button"
            type="button"
            disabled={clube.busy}
            onClick={() => void clube.cancel()}
          >
            {t('settings.clube.cancel')}
          </button>
        </SettingsRow>
      ) : null}

      {status?.state === 'connected' ? (
        <>
          {status.subscriber === false ? (
            <SettingsNotice
              tone="info"
              action={
                <a
                  className="set-button"
                  href={CLUBE_PLANS_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('settings.clube.plans')}
                </a>
              }
            >
              {t('settings.clube.noSubscription')}
            </SettingsNotice>
          ) : null}
          <SettingsSection searchId="clube-account" title={t('settings.clube.account.name')}>
            {status.account ? (
              <>
                <SettingsRow name={t('settings.clube.name')} tone="active">
                  {status.account.name}
                </SettingsRow>
                <SettingsRow name={t('settings.clube.email')}>{status.account.email}</SettingsRow>
                <SettingsRow name={t('settings.clube.plan')}>
                  {t(CLUBE_PLAN_WORDS[status.account.plan])}
                </SettingsRow>
              </>
            ) : (
              <SettingsRow name={t('settings.clube.connected.state')} tone="muted">
                {t('settings.clube.accountUnavailable')}
              </SettingsRow>
            )}
            {status.subscriber === true ? (
              <SettingsRow name={t('settings.clube.mcp.name')} note={t('settings.clube.mcp.note')}>
                {t('settings.clube.mcp.on')}
              </SettingsRow>
            ) : null}
            <SettingsRow
              name={t('settings.clube.link.name')}
              note={t('settings.clube.disconnect.note')}
            >
              <button
                className="set-button set-button--danger"
                type="button"
                disabled={clube.busy}
                onClick={() => void clube.disconnect()}
              >
                {t('settings.clube.disconnect')}
              </button>
            </SettingsRow>
          </SettingsSection>
        </>
      ) : null}
      <SoundSettings
        transport={props.transport}
        available={status?.state === 'connected' && status.subscriber !== false}
      />
    </SettingsPage>
  )
}

/**
 * What the agents may do with the Clube's sound library, and the person's own sounds folder. The
 * server keeps both; the folder is only a path (nothing is copied or indexed), and a path that
 * is not a folder is refused there.
 */
function SoundSettings(props: { transport: Transport; available: boolean }) {
  const { t } = useI18n()
  const [settings, setSettings] = useState<SoundSettingsValue>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let current = true
    // A failed read leaves the controls off; the page above already says the server did not answer.
    void Promise.resolve(props.transport.request('sounds.settings', {}))
      .then((next) => {
        if (current) setSettings(next)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [props.transport])

  const update = async (
    patch: { enabled?: boolean; ownFolder?: string | null },
    failure: string,
  ) => {
    setBusy(true)
    setError(undefined)
    try {
      setSettings(await props.transport.request('sounds.updateSettings', patch))
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  const choose = async () => {
    const picked = await pickFolder().catch(() => undefined)
    if (picked) await update({ ownFolder: picked }, t('settings.sounds.folder.invalid'))
  }

  return (
    <SettingsSection searchId="sound-library" title={t('settings.sounds.section')}>
      {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
      <SettingsRow
        searchId="sound-library-use"
        name={t('settings.sounds.use.name')}
        note={
          props.available
            ? t('settings.sounds.use.note')
            : `${t('settings.sounds.use.note')} ${t('settings.sounds.use.needsAccount')}`
        }
      >
        <button
          className={`switch${settings?.enabled ? ' is-on' : ''}`}
          type="button"
          role="switch"
          aria-label={t('settings.sounds.use.name')}
          aria-checked={settings?.enabled === true}
          disabled={settings === undefined || busy}
          onClick={() =>
            void update({ enabled: !settings?.enabled }, t('settings.sounds.unavailable'))
          }
        >
          <span className="switch__thumb" />
        </button>
      </SettingsRow>
      <SettingsRow
        searchId="sound-library-folder"
        name={t('settings.sounds.folder.name')}
        note={
          settings?.ownFolder ? (
            <>
              {t('settings.sounds.folder.note')}
              <br />
              {settings.ownFolder}
            </>
          ) : (
            t('settings.sounds.folder.note')
          )
        }
      >
        {settings?.ownFolder ? null : (
          <span className="settings-meta">{t('settings.sounds.folder.none')}</span>
        )}
        <button
          className="set-button"
          type="button"
          disabled={settings === undefined || busy}
          onClick={() => void choose()}
        >
          {t(
            settings?.ownFolder ? 'settings.sounds.folder.change' : 'settings.sounds.folder.choose',
          )}
        </button>
        {settings?.ownFolder ? (
          <button
            className="set-button set-button--quiet"
            type="button"
            disabled={busy}
            onClick={() => void update({ ownFolder: null }, t('settings.sounds.unavailable'))}
          >
            {t('settings.sounds.folder.remove')}
          </button>
        ) : null}
      </SettingsRow>
    </SettingsSection>
  )
}
