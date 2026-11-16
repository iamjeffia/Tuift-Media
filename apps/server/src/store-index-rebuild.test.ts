import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '@harness/contracts'
import { DatabaseSync } from './sqlite.js'
import { Store } from './store.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const message = (
  id: string,
  text: string,
  role: 'user' | 'assistant' = 'assistant',
): DomainEvent => ({
  type: 'item.completed',
  item: { id, turnId: 't1', type: 'message', role, status: 'completed', text, createdAt: 0 },
})

/** A database with a bit of everything the deferred indexes are made from. */
function seed(rows = 60): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-index-rebuild-'))
  dirs.push(dir)
  const file = path.join(dir, 'tastecode.db')
  const store = new Store(file)
  store.addProject('/repo')
  for (const id of ['a', 'b']) {
    store.addThread({ id, projectPath: '/repo', provider: 'codex', title: id })
    for (let i = 0; i < rows; i++) {
      store.append(id, message(`${id}-${i}`, `needle number ${i} in chat ${id}`))
      if (i % 10 === 0) {
        store.append(id, {
          type: 'usage.updated',
          usage: {
            inputTokens: i,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: i,
          },
        })
        store.append(id, { type: 'diff.updated', turnId: `turn-${i}`, diff: `patch ${i}` })
      }
    }
    store.append(id, {
      type: 'approval.requested',
      request: { id: `${id}-open`, kind: 'command', createdAt: 2 },
    })
    store.append(id, {
      type: 'approval.requested',
      request: { id: `${id}-done`, kind: 'command', createdAt: 3 },
    })
    store.append(id, { type: 'approval.resolved', id: `${id}-done`, decision: 'accept' })
  }
  store.close()
  return file
}

/** Forget every derived index, as an update that bumps their versions does. */
function unmigrate(file: string): void {
  const raw = new DatabaseSync(file)
  raw.exec('DELETE FROM schema_migrations')
  raw.close()
}

function dump(file: string) {
  const raw = new DatabaseSync(file)
  const rows = (sql: string) =>
    raw
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }))
  const result = {
    search: rows(
      'SELECT rowid, thread_id, event_seq, turn_id, text FROM session_search ORDER BY rowid',
    ),
    usage: rows('SELECT event_seq, thread_id FROM usage_events ORDER BY event_seq'),
    inbox: rows('SELECT event_seq, thread_id FROM inbox_events ORDER BY event_seq'),
    diffs: rows('SELECT event_seq, thread_id, turn_id FROM turn_diff_events ORDER BY event_seq'),
    migrations: rows('SELECT name FROM schema_migrations ORDER BY name'),
    progress: rows(`SELECT value FROM app_settings WHERE key = 'derived_index_rebuild_v1'`),
  }
  raw.close()
  return result
}

// One small query per slice, so a few dozen rows take many slices.
const SMALL = { batch: 10, sliceMs: 0 }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('deferred derived-index rebuild', () => {
  it('opens at once, reports search as updating, and ends with the rows of the one-shot rebuild', async () => {
    const oneShot = seed()
    unmigrate(oneShot)
    new Store(oneShot).close()
    const expected = dump(oneShot)

    const sliced = seed()
    unmigrate(sliced)
    const store = new Store(sliced, { deferDerivedIndexes: true })
    expect(store.searchIndexing).toBe(true)
    expect(store.indexesRebuilding).toBe(true)
    // Right after opening, search answers with what it has and says so.
    expect(store.searchSessions({ query: 'needle' }).indexing).toBe(true)
    let slices = 0
    await store.rebuildIndexesInSlices({
      ...SMALL,
      yieldToRequests: async () => {
        slices += 1
        await tick()
      },
    })
    expect(slices).toBeGreaterThan(1)
    expect(store.searchIndexing).toBe(false)
    expect(store.searchSessions({ query: 'needle', limit: 100 }).indexing).toBeUndefined()
    store.close()

    expect(dump(sliced)).toEqual(expected)
  })

  it('answers a search in the middle with part of the rows, and the whole once done', async () => {
    const file = seed()
    unmigrate(file)
    const store = new Store(file, { deferDerivedIndexes: true })
    const counts: number[] = []
    await store.rebuildIndexesInSlices({
      ...SMALL,
      yieldToRequests: async () => {
        const page = store.searchSessions({ query: 'needle', limit: 100 })
        counts.push(page.results.length)
        expect(page.indexing).toBe(true)
        await tick()
      },
    })
    expect(counts.some((count) => count > 0 && count < 100)).toBe(true)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(store.searchSessions({ query: 'needle', limit: 100 }).results).toHaveLength(100)
    store.close()
  })

  it('takes a write in the middle without losing or doubling an index row', async () => {
    const file = seed()
    unmigrate(file)
    const store = new Store(file, { deferDerivedIndexes: true })
    store.recoverInterruptedThreads()
    let wrote = 0
    await store.rebuildIndexesInSlices({
      ...SMALL,
      yieldToRequests: async () => {
        if (wrote < 3) {
          wrote += 1
          store.append('a', message(`live-${wrote}`, `liveword${wrote} written during the rebuild`))
          store.append('a', {
            type: 'approval.requested',
            request: { id: `live-approval-${wrote}`, kind: 'command', createdAt: 9 },
          })
          // Resolving a request the rebuild has not reached yet must still remove it.
          if (wrote === 1)
            store.append('a', { type: 'approval.resolved', id: 'a-open', decision: 'accept' })
        }
        await tick()
      },
    })
    expect(wrote).toBe(3)
    // Each live message is found exactly once.
    for (const n of [1, 2, 3])
      expect(store.searchSessions({ query: `liveword${n}` }).results).toHaveLength(1)
    expect(store.searchSessions({ query: 'needle', limit: 100 }).results).toHaveLength(100)
    const approvals = store.inboxProjections().get('a')?.approvals
    expect(approvals).toEqual(new Set(['live-approval-1', 'live-approval-2', 'live-approval-3']))
    store.close()

    // And the same rows a fresh one-shot rebuild of the final log gives.
    const sliced = dump(file)
    unmigrate(file)
    new Store(file).close()
    expect(dump(file)).toEqual(sliced)
  })

  it('resumes where it stopped when the app closed in the middle', async () => {
    const file = seed()
    unmigrate(file)
    const first = new Store(file, { deferDerivedIndexes: true })
    let slices = 0
    await first.rebuildIndexesInSlices({
      ...SMALL,
      yieldToRequests: async () => {
        slices += 1
        if (slices === 3) first.close()
        await tick()
      },
    })
    expect(first.indexesRebuilding).toBe(true)
    const interrupted = dump(file) as { progress: Array<{ value: string }>; migrations: unknown[] }
    expect(JSON.parse(interrupted.progress[0]!.value).cursor).toBeGreaterThan(0)

    const second = new Store(file, { deferDerivedIndexes: true })
    expect(second.searchIndexing).toBe(true)
    await second.rebuildIndexesInSlices(SMALL)
    expect(second.searchIndexing).toBe(false)
    expect(second.searchSessions({ query: 'needle', limit: 100 }).results).toHaveLength(100)
    second.close()

    const resumed = dump(file)
    unmigrate(file)
    new Store(file).close()
    expect(dump(file)).toEqual(resumed)
  })

  it('leaves user submissions and recovery to the constructor', () => {
    const file = seed(2)
    const store = new Store(file)
    store.append('a', message('sub-1', 'hello', 'user'))
    store.close()
    unmigrate(file)
    const reopened = new Store(file, { deferDerivedIndexes: true })
    // Built before the port opens: a retried send must still be refused.
    expect(reopened.hasUserSubmission('a', 'sub-1')).toBe(true)
    reopened.close()
  })

  it('does nothing when no index is out of date', async () => {
    const file = seed(5)
    const store = new Store(file, { deferDerivedIndexes: true })
    expect(store.indexesRebuilding).toBe(false)
    await store.rebuildIndexesInSlices()
    store.close()
  })
})
