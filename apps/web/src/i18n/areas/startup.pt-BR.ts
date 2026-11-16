import type { startupEn } from './startup.en.js'

/*
 * Glossary of this area (same words as the other areas): chat, banco de dados, cópia (backup),
 * índice de busca. TUIFT Code stays as it is.
 */
export const startupPt = {
  'startup.database.restored':
    'O banco de dados dos chats estava danificado e foi restaurado da cópia de {date}.',
  'startup.database.restoredDetail':
    'O arquivo danificado foi guardado em {path}. Chats posteriores a essa cópia não estão nela.',
  'startup.database.empty':
    'O banco de dados dos chats estava danificado e nenhuma cópia pôde ser usada. O TUIFT Code começou vazio.',
  'startup.database.emptyDetail': 'O arquivo danificado foi guardado em {path}. Nada foi apagado.',

  'startup.search.indexing':
    'Ainda atualizando o índice de busca depois de uma atualização. Os resultados podem estar incompletos por enquanto.',
} as const satisfies Record<keyof typeof startupEn, string>
