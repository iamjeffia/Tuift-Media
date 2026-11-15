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
      // Read by a design review to see what a menu did.
      sandboxAsked: asked,
      sandboxCopied: copied,
    },
  })
}
