/**
 * The few sentences the phone words itself (the rest of the app speaks English). The desktop
 * keeps its language in the browser's storage, which the phone cannot read, so the phone follows
 * its own: Portuguese when the device is set to it, English otherwise.
 */
export type Language = 'en' | 'pt-BR'

const messages = {
  en: {
    'notice.title': 'Chat database restored',
    'notice.restored': 'Your chat database was damaged. It was restored from the backup of {date}.',
    'notice.restoredDetail':
      'The damaged file was kept on your computer, at {path}. Chats written after that backup are not in the restored copy.',
    'notice.empty':
      'Your chat database was damaged and no backup could be used, so TUIFT Code started empty.',
    'notice.emptyDetail':
      'The damaged file was kept on your computer, at {path}. Nothing was deleted.',
    'notice.dismiss': 'Dismiss',
  },
  'pt-BR': {
    'notice.title': 'Banco de dados restaurado',
    'notice.restored':
      'O banco de dados dos chats estava danificado e foi restaurado da cópia de {date}.',
    'notice.restoredDetail':
      'O arquivo danificado foi guardado no computador, em {path}. Chats posteriores a essa cópia não estão nela.',
    'notice.empty':
      'O banco de dados dos chats estava danificado e nenhuma cópia pôde ser usada. O TUIFT Code começou vazio.',
    'notice.emptyDetail':
      'O arquivo danificado foi guardado no computador, em {path}. Nada foi apagado.',
    'notice.dismiss': 'Dispensar',
  },
} as const satisfies Record<Language, Record<string, string>>

export type MessageKey = keyof (typeof messages)['en']

/** The language of a device locale such as `pt-BR` or `en-US`. */
export function languageOf(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

/** The device's own language. */
export function deviceLanguage(): Language {
  return languageOf(Intl.DateTimeFormat().resolvedOptions().locale)
}

export function say(
  language: Language,
  key: MessageKey,
  vars: Record<string, string> = {},
): string {
  return messages[language][key].replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)
}
