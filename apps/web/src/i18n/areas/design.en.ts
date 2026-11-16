import { DESIGN_MESSAGES } from '@harness/contracts'

/**
 * English messages of what the Design pipeline writes into the chat itself. The server sends a
 * code beside the English text (`Item.parts`); the keys here are `design.msg.<code>`, and their
 * English is the server's own table, so the two cannot drift. See ../README.md.
 */
type DesignKeys = {
  [Code in Extract<keyof typeof DESIGN_MESSAGES, string> as `design.msg.${Code}`]: string
}

/** The label of the activity row of each Design phase (the page's own text, not the server's). */
const designPhaseEn = {
  'design.phase.brief': 'Understanding the request',
  'design.phase.brand': 'Creating brand direction',
  'design.phase.page': 'Planning the page',
  'design.phase.assets': 'Gathering assets',
  'design.phase.build': 'Building the website',
  'design.phase.change': 'Changing the page',
  'design.phase.preview': 'Starting the preview',
  'design.phase.review': 'Reviewing the design',
  'design.phase.repair': 'Refining the website',
} as const

export const designEn = {
  ...(Object.fromEntries(
    Object.entries(DESIGN_MESSAGES).map(([code, text]) => [`design.msg.${code}`, text]),
  ) as DesignKeys),
  ...designPhaseEn,
}
