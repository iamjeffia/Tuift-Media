import { soundsPt } from './areas/sounds.pt-BR.js'
import { settingsPt } from './areas/settings.pt-BR.js'
import { clubePt } from './areas/clube.pt-BR.js'
import { clubePanelPt } from './areas/clubePanel.pt-BR.js'
import { sidebarPt } from './areas/sidebar.pt-BR.js'
import { onboardingPt } from './areas/onboarding.pt-BR.js'
import { workspacePt } from './areas/workspace.pt-BR.js'
import { dialogsPt } from './areas/dialogs.pt-BR.js'
import { chatPt } from './areas/chat.pt-BR.js'
import { startupPt } from './areas/startup.pt-BR.js'
import { designPt } from './areas/design.pt-BR.js'
import type { MessageKey } from './en.js'

/**
 * Brazilian Portuguese. `satisfies Record<MessageKey, string>` makes TypeScript reject a
 * missing key and an extra one, so this file can never drift from `en.ts`.
 */
export const ptBR = {
  // Settings shell and navigation
  'settings.title': 'Configurações',
  'settings.back': 'Voltar ao app',
  'settings.nav.label': 'Categorias de configurações',
  'settings.nav.general': 'Geral',
  'settings.nav.profile': 'Perfil',
  'settings.nav.appearance': 'Aparência',
  'settings.nav.keybinds': 'Atalhos',
  'settings.nav.providers': 'Provedores',
  'settings.nav.models': 'Modelos',
  'settings.nav.mcp': 'Servidores MCP',
  'settings.nav.skills': 'Skills',
  'settings.nav.usage': 'Uso',
  'settings.nav.phone': 'Celular',
  'settings.nav.import': 'Importar chats',
  'settings.nav.data': 'Dados e privacidade',
  'settings.nav.debug': 'Depuração',
  'settings.nav.about': 'Sobre',

  // Settings search
  'settings.search.label': 'Buscar configurações',
  'settings.search.placeholder': 'Buscar configurações…',
  'settings.search.resultsLabel': 'Resultados da busca',
  'settings.search.empty': 'Nenhuma configuração encontrada',
  'settings.search.count_one': '{count} resultado',
  'settings.search.count_other': '{count} resultados',

  // Shared units
  'common.days_one': '{count} dia',
  'common.days_other': '{count} dias',

  // Settings > General
  'general.title': 'Geral',
  'general.language.name': 'Idioma',
  'general.language.note':
    'O idioma da interface do TUIFT Code. Os chats e o que a IA escreve não são traduzidos.',
  'general.sidebar.name': 'Barra lateral',
  'general.sidebar.note':
    'Clássica organiza os chats dentro dos projetos. Caixa de entrada lista por última atividade.',
  'general.sidebar.classic': 'Clássica',
  'general.sidebar.inbox': 'Caixa de entrada',
  'general.terminal.name': 'Terminal',
  'general.terminal.note': 'Onde o atalho Alternar terminal abre o terminal.',
  'general.terminal.bottom': 'Embaixo',
  'general.terminal.right': 'Direita',
  'general.modelPicker.name': 'Seletor de modelo',
  'general.modelPicker.note':
    'Por provedor escolhe primeiro o provedor e depois o modelo. Lista mostra todos os modelos de uma vez.',
  'general.modelPicker.list': 'Lista',
  'general.modelPicker.rail': 'Por provedor',
  'general.notifications.name': 'Notificações',
  'general.notifications.note':
    'Com o TUIFT Code em segundo plano: avisa sobre aprovações, perguntas e falhas, ou também quando um chat termina.',
  'general.notifications.off': 'Desligadas',
  'general.notifications.needsYou': 'Precisa de mim',
  'general.notifications.alsoFinished': 'E ao concluir',
  'general.settle.name': 'Recolher chats parados',
  'general.settle.never': 'nunca',
  'general.settle.neverSpoken': 'Nunca',
  'general.settle.after': 'após {days}',
  // Area catalogs: each wave-2 front owns one file in ./areas
  ...settingsPt,
  ...sidebarPt,
  ...onboardingPt,
  ...workspacePt,
  ...dialogsPt,
  ...chatPt,
  ...startupPt,
  ...designPt,
  ...clubePt,
  ...clubePanelPt,
  ...soundsPt,
} satisfies Record<MessageKey, string>
