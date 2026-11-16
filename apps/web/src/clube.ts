import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CLUBE_PLANS_URL,
  type ClubeFailure,
  type ClubePlan,
  type ClubeStatus,
} from '@harness/contracts'
import type { MessageKey } from './i18n/index.js'
import type { Transport } from './transport.js'

/** The plans page a free account is sent to. */
export const CLUBE_PLANS_LINK = CLUBE_PLANS_URL

export const CLUBE_PLAN_WORDS = {
  mensal: 'settings.clube.plan.mensal',
  anual: 'settings.clube.plan.anual',
  teste: 'settings.clube.plan.teste',
  grátis: 'settings.clube.plan.gratis',
} as const satisfies Record<ClubePlan, MessageKey>

export const CLUBE_FAILURE_WORDS = {
  denied: 'settings.clube.failure.denied',
  timeout: 'settings.clube.failure.timeout',
  mismatch: 'settings.clube.failure.mismatch',
  unreachable: 'settings.clube.failure.unreachable',
  unlinked: 'settings.clube.failure.unlinked',
  failed: 'settings.clube.failure.failed',
} as const satisfies Record<ClubeFailure, MessageKey>

/**
 * The link to the Clube do Motion account, as the Settings page and the
 * onboarding step share it: the status the server keeps, and the three things a
 * person can do. The server never sends a token and the page never asks for
 * one; "connect" opens the Clube's own sign-in page in the browser. `active` is false
 * while the screen that uses it is not showing, so nothing asks the server before then.
 */
export function useClube(transport: Transport | undefined, active = true) {
  const [status, setStatus] = useState<ClubeStatus>()
  const [failed, setFailed] = useState(false)
  const [authUrl, setAuthUrl] = useState<string>()
  const [busy, setBusy] = useState(false)
  const current = useRef(true)

  useEffect(() => {
    current.current = true
    if (!transport || !active) return
    const read = () =>
      transport
        .request('clube.status', {})
        .then((next) => {
          if (!current.current) return
          setStatus(next)
          setFailed(false)
          if (next.state !== 'connecting') setAuthUrl(undefined)
        })
        .catch(() => {
          if (current.current) setFailed(true)
        })
    void read()
    const off = transport.on('clube.changed', () => void read())
    return () => {
      current.current = false
      off()
    }
  }, [transport, active])

  const act = useCallback(async (action: () => Promise<ClubeStatus | void>) => {
    setBusy(true)
    setFailed(false)
    try {
      const next = await action()
      if (next && current.current) setStatus(next)
    } catch {
      if (current.current) setFailed(true)
    } finally {
      if (current.current) setBusy(false)
    }
  }, [])

  const open = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return {
    status,
    /** The last request to the server failed; the status shown may be out of date. */
    failed,
    busy,
    /** The sign-in address while one waits, so the page can be opened again. */
    authUrl,
    open,
    connect: () =>
      act(async () => {
        if (!transport) return
        const result = await transport.request('clube.connect', {})
        setAuthUrl(result.authUrl)
        setStatus({ state: 'connecting' })
        open(result.authUrl)
      }),
    cancel: () =>
      act(async () => {
        if (!transport) return
        setAuthUrl(undefined)
        return transport.request('clube.cancel', {})
      }),
    disconnect: () =>
      act(async () => {
        if (!transport) return
        return transport.request('clube.disconnect', {})
      }),
  }
}
