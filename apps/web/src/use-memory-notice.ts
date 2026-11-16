import { useEffect, useState } from 'react'
import { lowMemoryMessage } from './thread-error-reason.js'
import type { Transport } from './transport.js'
import type { ComposerError } from './ui/ComposerErrors.js'

type LowMemory = { id: string; consumers: ReadonlyArray<{ name: string; bytes: number }> }

/**
 * The server says once per episode that the system is close to running out of memory while a
 * chat works, and again when it recovered. The warning is a note in the notice tray, never
 * red, and goes away with the episode or when dismissed.
 */
export function useMemoryNotice(transport: Pick<Transport, 'on'>): ComposerError | undefined {
  const [low, setLow] = useState<LowMemory>()
  useEffect(
    () =>
      transport.on('system.memory', (data) =>
        setLow(
          data.state === 'low'
            ? { id: crypto.randomUUID(), consumers: data.consumers ?? [] }
            : undefined,
        ),
      ),
    [transport],
  )
  if (!low) return undefined
  return {
    id: `memory:${low.id}`,
    role: 'alert',
    tone: 'info',
    message: lowMemoryMessage(low.consumers),
    dismiss: () => setLow(undefined),
  }
}
