/** English messages of the Clube do Motion link: its Settings page and its onboarding step. Keys follow `area.component.thing` (see ../README.md). */
export const clubeEn = {
  // Settings page
  'settings.nav.clube': 'Clube do Motion',
  'settings.clube.description':
    'Link your Clube do Motion account to use the Clube inside TUIFT Code.',
  'settings.clube.loading': 'Loading the Clube do Motion link…',
  'settings.clube.unavailable':
    'Could not reach TUIFT Code’s server. The state shown may be out of date.',
  'settings.clube.account.name': 'Clube do Motion account',
  'settings.clube.off.note':
    'Connect to use the Clube’s MCP server in your chats, on every provider that takes it. It is for people who subscribe to the Clube.',
  'settings.clube.connect': 'Connect',
  'settings.clube.connecting.state': 'Waiting for the browser…',
  'settings.clube.connecting.note':
    'Finish signing in on the Clube page that opened in your browser. This page updates by itself.',
  'settings.clube.cancel': 'Cancel',
  'settings.clube.reopen': 'Open the page again',
  'settings.clube.connected.state': 'Connected',
  'settings.clube.name': 'Name',
  'settings.clube.email': 'E-mail',
  'settings.clube.plan': 'Plan',
  'settings.clube.plan.mensal': 'Monthly',
  'settings.clube.plan.anual': 'Annual',
  'settings.clube.plan.tuift': 'Released by the Clube',
  'settings.clube.plan.teste': 'Trial',
  'settings.clube.plan.gratis': 'Free account',
  'settings.clube.mcp.name': 'MCP server',
  'settings.clube.mcp.on': 'On in new chats',
  'settings.clube.mcp.note':
    'The Clube’s tools reach new chats on Claude Code, Codex and OpenCode. A chat that is already open gets them the next time it starts.',
  'settings.clube.link.name': 'Link',
  'settings.clube.disconnect': 'Disconnect',
  'settings.clube.disconnect.note':
    'Signs this app out of the Clube and revokes its access there. You can connect again at any time.',
  'settings.clube.noSubscription':
    'This account has no active subscription, so the Clube’s MCP server stays off. Subscribe to turn it on.',
  'settings.clube.plans': 'See the plans',
  'settings.clube.accountUnavailable':
    'Could not read the account right now. The link is still in place.',
  'settings.clube.failure.denied':
    'The sign-in was not allowed on the Clube page. Connect again when you want.',
  'settings.clube.failure.timeout': 'The sign-in took too long and was closed. Connect again.',
  'settings.clube.failure.mismatch': 'The Clube did not accept the sign-in answer. Connect again.',
  'settings.clube.failure.unreachable':
    'Could not reach the Clube. Check your connection and connect again.',
  'settings.clube.failure.unlinked':
    'The Clube refused to renew the access, so this app was disconnected. Connect again.',
  'settings.clube.failure.failed': 'The sign-in failed. Connect again.',

  // MCP page
  'settings.mcp.clube.title': 'Clube do Motion',
  'settings.mcp.clube.note':
    'Provided by your Clube do Motion link, to chats on providers that take it. Change it in Settings, under Clube do Motion.',
  'settings.mcpServerCard.providedByClube': 'Provided by your Clube do Motion account link.',

  // Onboarding step
  'onboarding.step.clube': 'Clube do Motion',
  'onboarding.clube.title': 'Connect the Clube do Motion',
  'onboarding.clube.lead':
    'Optional. Sign in with your Clube account to use its MCP server in your chats. You can do this later in Settings.',
  'onboarding.clube.connect': 'Connect',
  'onboarding.clube.skip': 'Not now',
  'onboarding.clube.waiting': 'Finish signing in on the page that opened in your browser.',
  'onboarding.clube.connectedAs': 'Connected as {name}.',
  'onboarding.clube.connected': 'Connected.',
  'onboarding.clube.noSubscription':
    'This account has no active subscription yet, so the MCP server stays off until it has one.',
} as const
