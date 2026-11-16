import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/index.js'
import type { CastMember } from './cast.js'

/**
 * What the Motion team says to a screen reader, once per change, from the scene above
 * a new chat and from the status strip of a chat that exists.
 *
 * A live region only speaks about changes made after it exists, so the text goes in
 * one render after the surface appears. The first text says the mode is on; after
 * that every new stage, chosen in a menu or pushed by the server, is said once with
 * its character. The After Effects notice is said once when the surface appears with
 * it and again each time it changes, and so is the chat starting to wait for the
 * person (its end is not said).
 */
export function useCastAnnouncement(input: {
  mode: boolean
  leader: CastMember | undefined
  stageLabel: string
  note: string
  waiting: boolean
}): string {
  const { t } = useI18n()
  const { mode, leader, stageLabel, note, waiting } = input
  const [announcement, setAnnouncement] = useState('')
  const said = useRef<{ stage: string; note: string; waiting: boolean } | undefined>(undefined)

  useEffect(() => {
    if (!mode || !leader) {
      said.current = undefined
      return
    }
    const before = said.current
    const stageText = `${leader.name}|${stageLabel}`
    const lines: string[] = []
    if (before?.stage !== stageText) {
      const key = before ? 'chat.motion.announceStage' : 'chat.motion.announce'
      lines.push(t(key, { stage: stageLabel, name: leader.name }))
    }
    if (note && before?.note !== note) lines.push(note)
    if (waiting && !before?.waiting)
      lines.push(t('chat.motion.announceWaiting', { name: leader.name }))
    said.current = { stage: stageText, note, waiting }
    setAnnouncement(lines.join(' '))
    return () => setAnnouncement('')
  }, [mode, leader, stageLabel, note, waiting, t])

  return announcement
}
