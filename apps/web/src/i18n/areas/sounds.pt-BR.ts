import type { soundsEn } from './sounds.en.js'

/**
 * Brazilian Portuguese messages of the Clube's sound library: exactly the keys of `sounds.en.ts`.
 *
 * Glossary (this area): som / sons, efeitos, músicas (the library's three kinds: sons tonais,
 * efeitos e músicas), prévia (preview), tom (key), assinatura e assinante, Clube do Motion
 * (never translated), conta conectada, chat, projeto, pasta.
 */
export const soundsPt = {
  // Side panel
  'workspace.tool.sounds': 'Sons',
  'sounds.type.label': 'Tipo de som',
  'sounds.type.tonal': 'Tonais',
  'sounds.type.efeito': 'Efeitos',
  'sounds.type.music': 'Músicas',
  'sounds.source.label': 'Tipo de música',
  'sounds.source.trilha': 'Trilhas',
  'sounds.source.clube': 'Músicas do Clube',
  'sounds.search.label': 'Buscar na biblioteca de sons',
  'sounds.search.placeholder.sound': 'Buscar por nome, instrumento ou função',
  'sounds.search.placeholder.music': 'Buscar por título, artista ou clima',
  'sounds.search.placeholder.trilha': 'Buscar por nome ou gênero',
  'sounds.filter.bpmMin': 'BPM mín.',
  'sounds.filter.bpmMax': 'BPM máx.',
  'sounds.filter.category': 'Categoria',
  'sounds.filter.genre': 'Gênero',
  'sounds.filter.key': 'Tom',
  'sounds.filter.allCategories': 'Todas as categorias',
  'sounds.filter.allGenres': 'Todos os gêneros',
  'sounds.filter.anyKey': 'Qualquer tom',
  'sounds.results_one': '{count} resultado',
  'sounds.results_other': '{count} resultados',
  'sounds.list.label': 'Sons',
  'sounds.more': 'Mostrar mais',
  'sounds.row.play': 'Ouvir a prévia de {name}',
  'sounds.row.pause': 'Pausar a prévia de {name}',
  'sounds.row.previewFailed': 'A prévia não carregou.',
  'sounds.row.send': 'Enviar',
  'sounds.row.sendLabel': 'Enviar {name} ao chat',
  'sounds.row.sending': 'Enviando…',
  'sounds.row.sent': 'No chat',
  'sounds.row.noChat': 'Abra um chat para enviar sons.',
  'sounds.row.estimated': 'estimado',
  'sounds.row.seconds': '{seconds} s',
  'sounds.row.keyMode': '{key} {mode}',
  'sounds.row.mode.maior': 'maior',
  'sounds.row.mode.menor': 'menor',
  'sounds.row.bpm': '{bpm} BPM',
  // States
  'sounds.state.loading': 'Carregando os sons…',
  'sounds.state.empty.title': 'Nenhum som encontrado',
  'sounds.state.empty.detail': 'Tente outra palavra ou limpe os filtros.',
  'sounds.state.error.title': 'A biblioteca não respondeu',
  'sounds.state.error.detail': 'Confira sua conexão e tente de novo.',
  'sounds.state.retry': 'Tentar de novo',
  'sounds.state.notLinked.title': 'Conecte sua conta do Clube do Motion',
  'sounds.state.notLinked.detail':
    'A biblioteca de sons do Clube abre aqui quando a conta está conectada: sons tonais em todos os tons, efeitos, trilhas e músicas. Os agentes também usam a biblioteca nos seus vídeos.',
  'sounds.state.notLinked.action': 'Abrir os ajustes do Clube',
  'sounds.state.noSubscription.title': 'A biblioteca é para assinantes',
  'sounds.state.noSubscription.detail':
    'Sua conta do Clube do Motion está conectada, mas não tem assinatura. Os planos incluem toda a biblioteca de sons.',
  'sounds.state.noSubscription.action': 'Ver os planos',
  // The day
  'sounds.daily.left': '{left} de {limit} arquivos restantes em 24 h',
  'sounds.daily.leftMusic': '{left} de {limit} músicas restantes em 24 h',
  'sounds.daily.note':
    'Contagem feita por este app, como estimativa, numa janela de 24 horas que corre: os arquivos voltam um a um, não à meia-noite.',
  'sounds.daily.spent.title': 'O limite de arquivos foi atingido',
  'sounds.daily.spent.detail':
    'Você ainda pode buscar e ouvir prévias. Os sons que já estão no projeto continuam valendo, e os arquivos voltam aos poucos nas próximas 24 horas.',
  'sounds.rate.notice': 'Muitas buscas seguidas. Tente de novo em {seconds} segundos.',
  'sounds.rate.noticeNow': 'Muitas buscas seguidas. Tente de novo em um minuto.',
  // Using a sound
  'sounds.use.failed': 'Não foi possível enviar o som.',
  'sounds.use.damaged': 'O arquivo chegou danificado e não foi guardado. Tente de novo.',
  'sounds.use.attachFailed': 'O som está no projeto, mas não foi possível anexá-lo ao chat.',
  // Settings
  'settings.sounds.section': 'Sons',
  'settings.sounds.use.name': 'Usar os sons do app',
  'settings.sounds.use.note':
    'Os agentes dos chats Motion buscam na biblioteca de sons do Clube e trazem os sons para o projeto, um por vez. A aba Sons funciona de qualquer jeito.',
  'settings.sounds.use.needsAccount':
    'Precisa de uma conta do Clube do Motion conectada e com assinatura.',
  'settings.sounds.folder.name': 'Minha pasta de sons',
  'settings.sounds.folder.note':
    'Os agentes sabem onde ela fica e olham ali depois da biblioteca. Nada é copiado nem indexado.',
  'settings.sounds.folder.none': 'Nenhuma pasta escolhida',
  'settings.sounds.folder.choose': 'Escolher pasta',
  'settings.sounds.folder.change': 'Trocar',
  'settings.sounds.folder.remove': 'Remover',
  'settings.sounds.folder.invalid': 'Não foi possível usar essa pasta.',
  'settings.sounds.unavailable':
    'Não foi possível falar com o servidor do TUIFT Code. O que aparece pode estar desatualizado.',
} as const satisfies Record<keyof typeof soundsEn, string>
