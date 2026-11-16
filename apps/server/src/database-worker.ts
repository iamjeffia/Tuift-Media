import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

// Heavy SQLite work that must not stall the server's own connection, on its own thread with its
// own connection. In WAL mode a reader or a passive checkpoint does not block the writer, so
// the server keeps recording events while this runs. No relative imports: the source file may
// be run as TypeScript by Node itself.
type Job =
  { task: 'backup'; source: string; destination: string } | { task: 'checkpoint'; source: string }

const job = workerData as Job

try {
  const database = new DatabaseSync(job.source)
  try {
    database.exec('PRAGMA busy_timeout = 10000')
    if (job.task === 'backup') database.prepare('VACUUM INTO ?').run(job.destination)
    else database.exec('PRAGMA wal_checkpoint(PASSIVE)')
  } finally {
    database.close()
  }
  if (job.task === 'backup') {
    // A cheap proof that the copy is a database: the full check waits for a restore, where
    // its seconds are worth it.
    const copy = new DatabaseSync(job.destination, { readOnly: true })
    try {
      copy.prepare('SELECT count(*) AS tables FROM sqlite_master').get()
    } finally {
      copy.close()
    }
  }
  parentPort?.postMessage({ type: 'done' })
} catch (error) {
  parentPort?.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  })
}
