import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { loadNotificationMode, saveNotificationMode } from './notification-mode.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'tuift-mode-'))
})
afterEach(() => rm(directory, { recursive: true, force: true }))

it('keeps the mode the page chose for the next launch', () => {
  const file = path.join(directory, 'nested', 'chat-notifications.json')
  expect(loadNotificationMode(file)).toBeUndefined()
  for (const mode of ['off', 'needs-you', 'needs-you-or-finished'] as const) {
    saveNotificationMode(file, mode)
    expect(loadNotificationMode(file)).toBe(mode)
  }
})

it('ignores a file that is not a mode', async () => {
  const file = path.join(directory, 'chat-notifications.json')
  for (const content of ['', 'nope', '[]', '{"mode":"loud"}', '{"mode":1}', '{}']) {
    await writeFile(file, content)
    expect(loadNotificationMode(file)).toBeUndefined()
  }
})
