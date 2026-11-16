/** English messages of the Clube's sound library: the Sounds tab of a Motion chat and its Settings rows. Keys follow `area.component.thing` (see ../README.md). */
export const soundsEn = {
  // Side panel
  'workspace.tool.sounds': 'Sounds',
  'sounds.type.label': 'Kind of sound',
  'sounds.type.tonal': 'Tonal',
  'sounds.type.efeito': 'Effects',
  'sounds.type.music': 'Music',
  'sounds.search.label': 'Search the sound library',
  'sounds.search.placeholder.sound': 'Search by name, instrument or role',
  'sounds.search.placeholder.music': 'Search by title, artist or mood',
  'sounds.filter.category': 'Category',
  'sounds.filter.genre': 'Genre',
  'sounds.filter.key': 'Key',
  'sounds.filter.allCategories': 'All categories',
  'sounds.filter.allGenres': 'All genres',
  'sounds.filter.anyKey': 'Any key',
  'sounds.results_one': '{count} result',
  'sounds.results_other': '{count} results',
  'sounds.list.label': 'Sounds',
  'sounds.more': 'Show more',
  'sounds.row.play': 'Play the preview of {name}',
  'sounds.row.pause': 'Pause the preview of {name}',
  'sounds.row.previewFailed': 'The preview did not load.',
  'sounds.row.send': 'Send',
  'sounds.row.sendLabel': 'Send {name} to the chat',
  'sounds.row.sending': 'Sending…',
  'sounds.row.sent': 'In the chat',
  'sounds.row.noChat': 'Open a chat to send sounds.',
  'sounds.row.estimated': 'estimated',
  'sounds.row.seconds': '{seconds} s',
  'sounds.row.keyMode': '{key} {mode}',
  'sounds.row.mode.maior': 'major',
  'sounds.row.mode.menor': 'minor',
  'sounds.row.bpm': '{bpm} BPM',
  // States
  'sounds.state.loading': 'Loading the sounds…',
  'sounds.state.empty.title': 'No sounds found',
  'sounds.state.empty.detail': 'Try another word or clear the filters.',
  'sounds.state.error.title': 'The library did not answer',
  'sounds.state.error.detail': 'Check your connection and try again.',
  'sounds.state.retry': 'Try again',
  'sounds.state.notLinked.title': 'Connect your Clube do Motion account',
  'sounds.state.notLinked.detail':
    "The Clube's sound library opens here once your account is connected: tonal sounds in every key, effects and music. The agents use it in your videos too.",
  'sounds.state.notLinked.action': 'Open the Clube settings',
  'sounds.state.noSubscription.title': 'The library is for subscribers',
  'sounds.state.noSubscription.detail':
    'Your Clube do Motion account is connected but has no subscription. The plans include the whole sound library.',
  'sounds.state.noSubscription.action': 'See the plans',
  // The day
  'sounds.daily.left': '{left} of {limit} files left today',
  'sounds.daily.leftMusic': '{left} of {limit} tracks left today',
  'sounds.daily.note': 'Counted by this app, as an estimate.',
  'sounds.daily.spent.title': "Today's files are used up",
  'sounds.daily.spent.detail':
    'You can still search and play previews. Sounds already in the project keep working, and the count starts again tomorrow.',
  'sounds.rate.notice': 'Too many searches in a row. Try again in {seconds} seconds.',
  'sounds.rate.noticeNow': 'Too many searches in a row. Try again in a minute.',
  // Using a sound
  'sounds.use.failed': 'The sound could not be sent.',
  'sounds.use.damaged': 'The file arrived damaged and was not kept. Try again.',
  'sounds.use.attachFailed':
    'The sound is in the project, but it could not be attached to the chat.',
  // Settings
  'settings.sounds.section': 'Sounds',
  'settings.sounds.use.name': "Use the app's sounds",
  'settings.sounds.use.note':
    "Agents in Motion chats search the Clube's sound library and fetch sounds into the project, one at a time. The Sounds tab works either way.",
  'settings.sounds.use.needsAccount':
    'Needs a connected Clube do Motion account with a subscription.',
  'settings.sounds.folder.name': 'My own sounds folder',
  'settings.sounds.folder.note':
    'Agents are told where it is and look there after the library. Nothing is copied or indexed.',
  'settings.sounds.folder.none': 'No folder chosen',
  'settings.sounds.folder.choose': 'Choose folder',
  'settings.sounds.folder.change': 'Change',
  'settings.sounds.folder.remove': 'Remove',
  'settings.sounds.folder.invalid': 'That folder could not be used.',
  'settings.sounds.unavailable':
    'Could not reach the TUIFT Code server. What is shown may be out of date.',
} as const
