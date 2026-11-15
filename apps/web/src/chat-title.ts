import { getLanguage, t, type MessageKey } from './i18n/index.js'

/**
 * The titles a chat has before anyone names it. The server and the store write
 * them in English and keep them that way (the first message replaces
 * "New session"), so they are only mapped when a title is shown.
 */
const DEFAULT_TITLES = new Map<string, MessageKey>([
  ['New session', 'chat.title.newSession'],
  ['New chat', 'chat.title.newChat'],
  ['Untitled chat', 'chat.title.untitled'],
  ['Side chat', 'chat.title.sideChat'],
])

/** The title to show: a stored default in the current language, any other title as it is. */
export function displayChatTitle(title: string): string
export function displayChatTitle(title: string | undefined): string | undefined
export function displayChatTitle(title: string | undefined): string | undefined {
  if (title === undefined) return undefined
  const key = DEFAULT_TITLES.get(title)
  return key ? t(key) : title
}

type Titled = { title: string }
const shown = new WeakMap<object, { language: string; projects: unknown }>()

/**
 * The same projects with the default chat titles in the current language, for the
 * places that list or search chats. Only a project that has such a chat is
 * copied, and the result is kept per input, so memoised rows see the same
 * objects until the projects or the language change. English returns the input.
 */
export function localizeChatTitles<Session extends Titled, Project extends { sessions: Session[] }>(
  projects: Project[],
): Project[] {
  const language = getLanguage()
  if (language === 'en') return projects
  const known = shown.get(projects)
  if (known?.language === language) return known.projects as Project[]
  const next = projects.map((project) => {
    let changed = false
    const sessions = project.sessions.map((session) => {
      const title = displayChatTitle(session.title)
      if (title === session.title) return session
      changed = true
      return { ...session, title }
    })
    return changed ? { ...project, sessions } : project
  })
  shown.set(projects, { language, projects: next })
  return next
}
