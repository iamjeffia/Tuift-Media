/** English messages of the `onboarding` area. Keys follow `area.component.thing` (see ../README.md). */
export const onboardingEn = {
  // Steps (progress dots) and shared buttons
  'onboarding.progress.label': 'Setup progress',
  'onboarding.step.welcome': 'Welcome',
  'onboarding.step.name': 'Your name',
  'onboarding.step.appearance': 'Appearance',
  'onboarding.step.agents': 'Coding agents',
  'onboarding.step.subagents': 'Sub-agents',
  'onboarding.step.project': 'First project',
  'onboarding.skip': 'Skip setup',
  'onboarding.back': 'Back',
  'onboarding.continue': 'Continue',

  // Welcome
  'onboarding.welcome.title': 'Welcome to TUIFT Code',
  'onboarding.welcome.lead':
    'One window for the coding agents already on this machine. A few quick choices and you’re in.',
  'onboarding.welcome.start': 'Get started',

  // Name
  'onboarding.name.title': 'What should we call you?',
  'onboarding.name.lead': 'Shown on your profile, with every provider. You can leave it empty.',
  'onboarding.name.label': 'Your name',

  // Appearance
  'onboarding.appearance.title': 'Choose your look',
  'onboarding.appearance.lead':
    'Applied as you choose. Fonts, accents and backdrops wait in Settings › Appearance.',
  'onboarding.appearance.legend': 'Theme',
  'onboarding.theme.system': 'System',
  'onboarding.theme.systemNote': 'Matches your OS',
  'onboarding.theme.light': 'Light',
  'onboarding.theme.lightNote': 'Bright, high contrast',
  'onboarding.theme.dark': 'Dark',
  'onboarding.theme.darkNote': 'Dimmed, low glare',

  // Coding agents
  'onboarding.agents.title': 'Choose your coding agents',
  'onboarding.agents.empty': 'Pick the ones you use. Nothing is added until you do.',
  'onboarding.agents.added_one': '{count} added. Change this any time in Settings › Providers.',
  'onboarding.agents.added_other': '{count} added. Change this any time in Settings › Providers.',
  'onboarding.agents.providers': 'Providers',
  'onboarding.agents.acp': 'ACP agents',
  'onboarding.agents.loading': 'Looking for the coding agents installed on this machine…',
  'onboarding.readiness.checking': 'Checking…',
  'onboarding.readiness.notInstalled': 'Not installed',
  'onboarding.readiness.attention': 'Needs attention',
  'onboarding.readiness.signIn': 'Sign in needed',
  'onboarding.readiness.signedIn': 'Signed in',
  'onboarding.readiness.installed': 'Installed',

  // Sub-agents
  'onboarding.subagents.title': 'Sub-agents on other providers',
  'onboarding.subagents.lead':
    'TUIFT Code may use your other subscriptions for sub-agents when another model fits a task better. Change this any time in Settings › Models.',
  'onboarding.subagents.allow': 'Allow',
  'onboarding.subagents.allowNote': 'Agents pick the best provider for each sub-agent.',
  'onboarding.subagents.ask': 'Only when I ask',
  'onboarding.subagents.askNote': 'Sub-agents use the chat’s provider unless you name another one.',

  // First project
  'onboarding.project.title': 'Open your first project',
  'onboarding.project.lead':
    'Pick the folder you’re working in — a git repository or any plain directory.',
  'onboarding.project.note':
    'Projects and chats stay on this machine. Sign-in stays with each provider.',
  'onboarding.project.skip': 'Skip for now',
  'onboarding.project.choose': 'Choose a folder',

  // The small app drawn beside the pages (interface labels and sample content)
  'onboarding.preview.localProfile': 'Local profile',
  'onboarding.preview.newChat': 'New chat',
  'onboarding.preview.newProject': 'New project',
  'onboarding.preview.projects': 'Projects',
  'onboarding.preview.yourProject': 'Your project',
  'onboarding.preview.chatTheme': 'Add a theme toggle',
  'onboarding.preview.chatUpload': 'Fix the flaky upload test',
  'onboarding.preview.chatDeps': 'Bump dependencies',
  'onboarding.preview.earlierAnswer':
    'All 214 tests pass. The upload retry now waits for the socket to close before it opens a new one.',
  'onboarding.preview.said':
    'Add a light and dark toggle to Settings. It should follow the system until someone picks one.',
  'onboarding.preview.answer':
    'Done. The toggle sits in Settings › Appearance and follows the system until someone picks a side.',

  // How a seal is struck (the "?" beside the profile seal)
  'onboarding.seal.toggle': 'How a seal is struck',
  'onboarding.seal.hashed':
    'No letters to read, so this seal is hashed. The same word always gives the same seal.',
  'onboarding.seal.colour': '{value} picks the colour',
  'onboarding.seal.ground': 'ends in {value}, so {tone}',
  'onboarding.seal.dark': 'dark',
  'onboarding.seal.light': 'light',
  'onboarding.seal.endVowel': 'end on a vowel for a light one',
  'onboarding.seal.endOther': 'end on any other letter for dark',
  'onboarding.seal.letters': '{value} letters, {symmetry}',
  'onboarding.seal.quad': 'four slices',
  'onboarding.seal.mirror': 'mirrored',
  'onboarding.seal.triple': 'three slices',
  'onboarding.seal.tiles': 'each letter lays a tile, from the top, outside in',
  'onboarding.seal.vowels': 'vowels',
} as const
