import { joinMessageTexts, type Item } from '@harness/contracts'
import { getLanguage, translate } from './i18n/index.js'

/**
 * A message the server wrote itself in pieces (the Design pipeline's progress and results),
 * said in the reader's language. A piece with a code the catalog knows is translated; a piece
 * with no code is text a model wrote for the person and stays as it is; a code this app does
 * not know shows the English the server sent beside it. Undefined when the item has no pieces.
 */
export function serverMessageText(item: Pick<Item, 'parts'>): string | undefined {
  if (!item.parts?.length) return undefined
  const language = getLanguage()
  return joinMessageTexts(
    item.parts.map((part) => {
      if (!part.code) return part.text
      const key = `design.msg.${part.code}`
      const text = translate(language, key, part.params ?? {})
      return text === key ? part.text : text
    }),
  )
}

/** The text a message shows: its translated pieces when it has them, otherwise its own text. */
export function messageDisplayText(item: Pick<Item, 'parts' | 'text'>): string {
  return serverMessageText(item) ?? item.text ?? ''
}
