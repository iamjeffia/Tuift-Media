import { Component, createRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconRefresh,
  IconTerminal2,
} from '@tabler/icons-react'
import {
  canLaunchCrashAgent,
  crashAgents,
  isDesktop,
  launchCrashAgent,
  reportRendererError,
  writeClipboardText,
  type CrashAgentAvailability,
  type CrashAgentId,
} from './bridge.js'
import { t } from './i18n/index.js'
import type { ProviderMark } from './model-catalog.js'
import { ProviderIcon } from './ui/ProviderIcon.js'
import './styles/renderer-recovery.css'

type Props = { children: ReactNode; reload?: () => void }
type Status = { tone: 'idle' | 'success' | 'error'; text: string }
type State = {
  failed: boolean
  view: 'summary' | 'agents'
  copied: boolean
  status: Status
  diagnostics: string
  agents: CrashAgentAvailability[] | undefined
  launching: CrashAgentId | undefined
}

const IDLE: Status = { tone: 'idle', text: '' }

const CRASH_AGENTS = {
  'claude-code': { name: 'Claude Code', mark: 'anthropic' },
  codex: { name: 'Codex', mark: 'openai' },
  grok: { name: 'Grok', mark: 'grok' },
} satisfies Record<CrashAgentId, { name: string; mark: ProviderMark }>

/** Recovery must not depend on the stores or UI subtree that just failed. */
export class RendererErrorBoundary extends Component<Props, State> {
  override state: State = {
    failed: false,
    view: 'summary',
    copied: false,
    status: IDLE,
    diagnostics: '',
    agents: undefined,
    launching: undefined,
  }

  #error: unknown
  #componentStack = ''
  #reload = createRef<HTMLButtonElement>()
  #ask = createRef<HTMLButtonElement>()
  #agentList = createRef<HTMLUListElement>()

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    // Detailed errors go through the desktop's existing opt-in, redacted sink.
    // Clipboard diagnostics use an allowlist: exception text can contain secrets
    // and arbitrary project paths that pattern-based redaction cannot recognize.
    // Only the agent hand-off carries the error itself, scrubbed by the desktop.
    this.#error = error
    this.#componentStack = info.componentStack ?? ''
    const diagnostics = [
      'TUIFT Code renderer recovery',
      `Time: ${new Date().toISOString()}`,
      `Client: ${isDesktop ? 'desktop' : 'web'}`,
      'Failure: application render exception',
    ].join('\n')
    this.setState({ diagnostics })
    try {
      reportRendererError(error)
    } catch {
      // A diagnostic bridge failure must not take down recovery too.
    }
  }

  override componentDidMount(): void {
    if (this.state.failed) this.#reload.current?.focus()
  }

  override componentDidUpdate(_props: Props, previous: State): void {
    if (!previous.failed && this.state.failed) this.#reload.current?.focus()
    if (previous.view === this.state.view) return
    if (this.state.view === 'agents') {
      this.#agentList.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    } else {
      this.#ask.current?.focus()
    }
  }

  #copy = async () => {
    try {
      await writeClipboardText(this.state.diagnostics)
      this.setState({
        copied: true,
        status: { tone: 'success', text: t('dialogs.renderer.copied') },
      })
    } catch {
      this.setState({
        copied: false,
        status: { tone: 'error', text: t('dialogs.renderer.copyFailed') },
      })
    }
  }

  #showAgents = () => {
    this.setState({ view: 'agents', status: IDLE })
    if (this.state.agents) return
    void crashAgents().then((agents) =>
      this.setState({ agents }, () => {
        // A row that turned out to be uninstalled is now disabled and drops focus.
        const active = document.activeElement
        if (active !== document.body && !(active instanceof HTMLButtonElement && active.disabled))
          return
        const list = this.#agentList.current
        list?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() ??
          list
            ?.closest('section')
            ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
            ?.focus()
      }),
    )
  }

  #showSummary = () => {
    this.setState({ view: 'summary' })
  }

  #onAgentsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || this.state.launching) return
    event.preventDefault()
    this.#showSummary()
  }

  #launch = async (agent: CrashAgentId) => {
    if (this.state.launching) return
    const { name } = CRASH_AGENTS[agent]
    this.setState({ launching: agent })
    try {
      await launchCrashAgent(agent, this.#error, this.#componentStack)
      this.setState({
        launching: undefined,
        view: 'summary',
        status: { tone: 'success', text: t('dialogs.renderer.opened', { name }) },
      })
    } catch {
      this.setState({
        launching: undefined,
        status: { tone: 'error', text: t('dialogs.renderer.openFailed', { name }) },
      })
    }
  }

  #renderSummary(): ReactNode {
    const { copied, status } = this.state
    return (
      <>
        <span className="renderer-recovery__mark" aria-hidden="true">
          <IconAlertTriangle size={18} stroke={1.75} />
        </span>
        <h1 id="renderer-recovery-title" className="renderer-recovery__title">
          {t('dialogs.renderer.title')}
        </h1>
        <p className="renderer-recovery__body">{t('dialogs.renderer.body')}</p>
        {canLaunchCrashAgent ? (
          <button
            type="button"
            ref={this.#ask}
            className="renderer-recovery__ask"
            onClick={this.#showAgents}
          >
            <span className="renderer-recovery__ask-icon" aria-hidden="true">
              <IconTerminal2 size={16} stroke={1.75} />
            </span>
            <span className="renderer-recovery__ask-text">
              <span className="renderer-recovery__ask-title">{t('dialogs.renderer.askTitle')}</span>
              <span className="renderer-recovery__ask-hint">{t('dialogs.renderer.askHint')}</span>
            </span>
            <IconChevronRight
              className="renderer-recovery__chevron"
              size={16}
              stroke={1.75}
              aria-hidden="true"
            />
          </button>
        ) : null}
        <p role="status" className="renderer-recovery__status" data-tone={status.tone}>
          {status.text}
        </p>
        <div className="renderer-recovery-actions">
          {this.state.diagnostics ? (
            <button type="button" className="renderer-recovery__secondary" onClick={this.#copy}>
              {copied ? (
                <IconCheck size={15} stroke={2} aria-hidden="true" />
              ) : (
                <IconCopy size={15} stroke={1.75} aria-hidden="true" />
              )}
              {t('dialogs.renderer.copyDiagnostics')}
            </button>
          ) : null}
          <button
            type="button"
            className="renderer-recovery__primary"
            ref={this.#reload}
            onClick={() => (this.props.reload ?? (() => window.location.reload()))()}
          >
            <IconRefresh size={15} stroke={2} aria-hidden="true" />
            {t('dialogs.common.reloadWindow')}
          </button>
        </div>
      </>
    )
  }

  #renderAgents(): ReactNode {
    const { agents, launching, status } = this.state
    return (
      <div onKeyDown={this.#onAgentsKeyDown}>
        <h1 id="renderer-recovery-title" className="renderer-recovery__title">
          {t('dialogs.renderer.agentsTitle')}
        </h1>
        <p className="renderer-recovery__body">{t('dialogs.renderer.agentsBody')}</p>
        <ul ref={this.#agentList} className="renderer-recovery__agents" aria-busy={!agents}>
          {(Object.keys(CRASH_AGENTS) as CrashAgentId[]).map((id) => {
            const agent = CRASH_AGENTS[id]
            const installed = agents?.find((entry) => entry.id === id)?.installed !== false
            return (
              <li key={id}>
                <button
                  type="button"
                  className="renderer-recovery__agent"
                  disabled={!installed}
                  aria-busy={launching === id}
                  aria-describedby={installed ? undefined : `renderer-recovery-agent-${id}`}
                  onClick={() => void this.#launch(id)}
                >
                  <span className="renderer-recovery__agent-mark" aria-hidden="true">
                    <ProviderIcon mark={agent.mark} size={15} />
                  </span>
                  <span className="renderer-recovery__agent-name">{agent.name}</span>
                  {!installed ? (
                    <span
                      id={`renderer-recovery-agent-${id}`}
                      className="renderer-recovery__agent-note"
                    >
                      {t('dialogs.renderer.notInstalled')}
                    </span>
                  ) : launching === id ? (
                    <span className="renderer-recovery__agent-note">
                      {t('dialogs.renderer.opening')}
                    </span>
                  ) : (
                    <IconChevronRight
                      className="renderer-recovery__chevron"
                      size={16}
                      stroke={1.75}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <p role="status" className="renderer-recovery__status" data-tone={status.tone}>
          {status.text}
        </p>
        <div className="renderer-recovery-actions is-split">
          <button
            type="button"
            className="renderer-recovery__secondary"
            disabled={launching !== undefined}
            onClick={this.#showSummary}
          >
            <IconChevronLeft size={15} stroke={1.75} aria-hidden="true" />
            {t('dialogs.renderer.back')}
          </button>
        </div>
      </div>
    )
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="renderer-recovery" aria-labelledby="renderer-recovery-title">
        <section className="renderer-recovery__card" data-view={this.state.view}>
          {this.state.view === 'agents' ? this.#renderAgents() : this.#renderSummary()}
        </section>
      </main>
    )
  }
}
