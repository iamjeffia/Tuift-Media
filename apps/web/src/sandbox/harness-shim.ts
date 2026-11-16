/**
 * The design sandbox has no desktop shell. With `?bridge=files` this stands in for the native
 * calls the Files tab and the chat's file links use, so those surfaces can be looked at in a
 * browser: the media a project file would stream from disk is generated here, and "Open in
 * Explorer" only notes that it was asked. Without the parameter the sandbox is unchanged.
 * It must run before the app's bridge module reads `window.harness`.
 */
import { demoMedia } from './demo-media.js'

if (new URLSearchParams(window.location.search).get('bridge') === 'files') {
  const asked: string[] = []
  const copied: string[] = []
  const nothing = async () => undefined

  Object.assign(window, {
    harness: {
      // The calls the app makes without checking that they exist.
      pickFolder: nothing,
      pickSkillFolder: nothing,
      pickFiles: async () => [],
      revealPath: async (path: string) => void asked.push(path),
      savePastedFile: nothing,
      setZoom: nothing,
      setTheme: nothing,
      capturePreview: nothing,
      openExternal: nothing,
      // The two the Files tab uses.
      revealProjectFile: async (path: string) => void asked.push(path),
      previewProjectFile: async (path: string) => demoMedia(path),
      writeClipboardText: async (text: string) => void copied.push(text),
      // What a reply that names media by path needs: the desktop resolves each path inside the
      // project. Here every path with a media extension exists except one that says it is gone.
      resolveDeliveredFiles: async (candidates: string[]) =>
        (
          await Promise.all(
            candidates.map(async (path) => {
              if (/gone|missing/.test(path)) return undefined
              const name = path.split('/').at(-1) ?? path
              const pdf = /\.pdf$/i.test(path)
              const media = pdf ? { url: 'about:blank', mediaType: 'pdf' } : await demoMedia(path)
              return media
                ? {
                    path: ['C:', 'Users', 'demo', 'tuift', ...path.split('/')].join('\\'),
                    name,
                    size: pdf ? 184_320 : media.mediaType === 'video' ? 6_300_000 : 412_000,
                    copyable: true,
                    ...media,
                  }
                : undefined
            }),
          )
        ).filter(Boolean),
      copyDeliveredFile: async (path: string) => void asked.push(`copy ${path}`),
      saveDeliveredFile: async (path: string) => {
        asked.push(`save ${path}`)
        return true
      },
      attachDeliveredFile: async (path: string) => {
        asked.push(`attach ${path}`)
        return { path, name: path.split('\\').at(-1) ?? path }
      },
      // `?quit=2` holds a quit with two chats running, as the desktop shell asks for it.
      ...(Number(new URLSearchParams(window.location.search).get('quit')) > 0
        ? {
            onQuitRequested: (listener: (chats: number) => void) => {
              const chats = Number(new URLSearchParams(window.location.search).get('quit'))
              const timer = setTimeout(() => listener(chats), 1500)
              return () => clearTimeout(timer)
            },
            answerQuit: (quit: boolean) => void asked.push(quit ? 'quit' : 'keep working'),
          }
        : {}),
      // Read by a design review to see what a menu did.
      sandboxAsked: asked,
      sandboxCopied: copied,
    },
  })
}
