import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NOTIFICATION_MODES, type NotificationMode } from './chat-attention.js'

/**
 * The person's chat notification mode (Settings > General), kept by the main
 * process. The page owns the choice and sends it with every report; the main
 * process keeps the last one so it still applies with no window open, when only
 * the server tells it what the chats are doing. Same small-file pattern as the
 * language the page chose (i18n.ts).
 */

export function loadNotificationMode(filePath: string): NotificationMode | undefined {
  try {
    const saved: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    const mode =
      typeof saved === 'object' && saved !== null
        ? (saved as Record<string, unknown>)['mode']
        : undefined
    return NOTIFICATION_MODES.find((known) => known === mode)
  } catch {
    return undefined
  }
}

export function saveNotificationMode(filePath: string, mode: NotificationMode): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  writeFileSync(filePath, `${JSON.stringify({ mode })}\n`, { encoding: 'utf8', mode: 0o600 })
}
