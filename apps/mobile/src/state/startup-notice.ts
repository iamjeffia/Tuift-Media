import type { StartupNotice } from '@harness/contracts'
import type { Connection } from '../link/connection'
import { Store } from '../store'

/**
 * What the computer did while starting that the person must hear about (a damaged database it
 * put right). It sends the notice again on every connection until it is dismissed, and tells
 * every window and phone when one of them dismisses it, so the notice is the computer's, not
 * this phone's: dismissing here dismisses it everywhere.
 */
export class StartupNotices {
  readonly state = new Store<StartupNotice | undefined>(undefined)

  constructor(private readonly connection: Connection) {
    // A notice dismissed elsewhere while the link was down is not sent again: start from none.
    connection.onOpen(() => this.state.set(undefined))
    connection.on('server.startupNotice', ({ notice }) => this.state.set(notice ?? undefined))
  }

  async dismiss(): Promise<void> {
    this.state.set(undefined)
    // Unreachable computer: it keeps the notice and sends it again when the link reopens.
    await this.connection.request('startup.dismissNotice', {}).catch(() => undefined)
  }
}
