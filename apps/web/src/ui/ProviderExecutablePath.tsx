import { useEffect, useState } from 'react'
import type { Transport } from '../transport.js'
import { executablePathSearchId } from './settings/provider-tuning-search.js'
import { useI18n } from '../i18n/index.js'
import '../styles/provider-executable-path.css'

type ExecutablePaths = Readonly<Record<string, string>>

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** One read for the whole page. A failure only matters once someone opens a field. */
export function useProviderExecutablePaths(transport: Transport) {
  const [paths, setPaths] = useState<ExecutablePaths>()
  const [readError, setReadError] = useState<string>()
  useEffect(() => {
    let current = true
    setPaths(undefined)
    setReadError(undefined)
    void transport.request('providers.executablePaths', {}).then(
      (next) => {
        if (current) setPaths(next)
      },
      (cause: unknown) => {
        if (current) setReadError(errorText(cause))
      },
    )
    return () => {
      current = false
    }
  }, [transport])
  return { paths, readError, setPaths }
}

/** A blank value returns the provider to the desktop's ordinary PATH search. */
export function ProviderExecutablePath(props: {
  source: string
  name: string
  paths: ExecutablePaths | undefined
  readError: string | undefined
  transport: Transport
  onSaved: (paths: ExecutablePaths) => void
}) {
  const { t } = useI18n()
  const saved = props.paths && (props.paths[props.source] ?? '')
  const [open, setOpen] = useState(false)
  /** Undefined until edited, so the field follows what the server has. */
  const [draft, setDraft] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const value = draft ?? saved ?? ''
  const error = saveError ?? props.readError

  const save = async () => {
    setBusy(true)
    setSaveError(undefined)
    try {
      const paths = await props.transport.request('providers.updateExecutablePath', {
        source: props.source,
        path: value,
      })
      setDraft(undefined)
      props.onSaved(paths)
    } catch (cause) {
      setSaveError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      className="provider-executable"
      open={open}
      data-settings-id={executablePathSearchId(props.source)}
    >
      <summary
        onClick={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
      >
        {t('settings.providerExecutablePath.label')}
        {saved ? ` · ${t('settings.providerExecutablePath.custom')}` : ''}
      </summary>
      {open ? (
        <>
          <p>{t('settings.providerExecutablePath.hint', { name: props.name })}</p>
          <form
            className="provider-executable__form"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <label className="visually-hidden" htmlFor={`executable-${props.source}`}>
              {t('settings.providerExecutablePath.inputLabel', { name: props.name })}
            </label>
            <input
              className="set-input"
              id={`executable-${props.source}`}
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('settings.providerExecutablePath.placeholder')}
              disabled={saved === undefined || busy}
              spellCheck={false}
            />
            <button
              className="set-button"
              type="submit"
              disabled={saved === undefined || busy || value === saved}
            >
              {busy
                ? t('settings.providerExecutablePath.saving')
                : t('settings.providerExecutablePath.save')}
            </button>
          </form>
          {error ? (
            <p className="provider-executable__error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
