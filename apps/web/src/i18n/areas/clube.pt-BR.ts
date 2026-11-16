import type { clubeEn } from './clube.en.js'

/**
 * Brazilian Portuguese messages of the Clube do Motion link: exactly the keys of `clube.en.ts`.
 *
 * Glossary (this area): Clube do Motion (the product, never translated), conectar / desconectar
 * (link / unlink the account), assinatura e assinante (subscription, subscriber), plano
 * (mensal, anual and trial as "período de teste"), servidor MCP, chat, provedor.
 */
export const clubePt = {
  // Settings page
  'settings.nav.clube': 'Clube do Motion',
  'settings.clube.description':
    'Conecte sua conta do Clube do Motion para usar o Clube dentro do TUIFT Code.',
  'settings.clube.loading': 'Carregando a conexão com o Clube do Motion…',
  'settings.clube.unavailable':
    'Não foi possível falar com o servidor do TUIFT Code. O estado mostrado pode estar desatualizado.',
  'settings.clube.account.name': 'Conta do Clube do Motion',
  'settings.clube.off.note':
    'Conecte para usar o servidor MCP do Clube nos seus chats, em todos os provedores que aceitam. Vale para quem assina o Clube.',
  'settings.clube.connect': 'Conectar',
  'settings.clube.connecting.state': 'Aguardando o navegador…',
  'settings.clube.connecting.note':
    'Conclua o login na página do Clube que abriu no navegador. Esta página atualiza sozinha.',
  'settings.clube.cancel': 'Cancelar',
  'settings.clube.reopen': 'Abrir a página de novo',
  'settings.clube.connected.state': 'Conectada',
  'settings.clube.name': 'Nome',
  'settings.clube.email': 'E-mail',
  'settings.clube.plan': 'Plano',
  'settings.clube.plan.mensal': 'Mensal',
  'settings.clube.plan.anual': 'Anual',
  'settings.clube.plan.teste': 'Período de teste',
  'settings.clube.plan.gratis': 'Conta gratuita',
  'settings.clube.mcp.name': 'Servidor MCP',
  'settings.clube.mcp.on': 'Ativo nos chats novos',
  'settings.clube.mcp.note':
    'As ferramentas do Clube chegam aos chats novos no Claude Code, no Codex e no OpenCode. Um chat que já está aberto recebe na próxima vez que iniciar.',
  'settings.clube.link.name': 'Conexão',
  'settings.clube.disconnect': 'Desconectar',
  'settings.clube.disconnect.note':
    'Tira este app do Clube e revoga o acesso dele lá. Você pode conectar de novo quando quiser.',
  'settings.clube.noSubscription':
    'Esta conta não tem assinatura ativa, então o servidor MCP do Clube fica desligado. Assine para ligar.',
  'settings.clube.plans': 'Ver os planos',
  'settings.clube.accountUnavailable':
    'Não foi possível ler a conta agora. A conexão continua ativa.',
  'settings.clube.failure.denied':
    'O login não foi autorizado na página do Clube. Conecte de novo quando quiser.',
  'settings.clube.failure.timeout': 'O login demorou demais e foi encerrado. Conecte de novo.',
  'settings.clube.failure.mismatch': 'O Clube não aceitou a resposta do login. Conecte de novo.',
  'settings.clube.failure.unreachable':
    'Não foi possível falar com o Clube. Confira a conexão e conecte de novo.',
  'settings.clube.failure.unlinked':
    'O Clube recusou renovar o acesso, então este app foi desconectado. Conecte de novo.',
  'settings.clube.failure.failed': 'O login falhou. Conecte de novo.',

  // MCP page
  'settings.mcp.clube.title': 'Clube do Motion',
  'settings.mcp.clube.note':
    'Fornecido pela conexão com o Clube do Motion, para os chats nos provedores que aceitam. Para mudar, vá em Configurações, em Clube do Motion.',
  'settings.mcpServerCard.providedByClube':
    'Fornecido pela conexão com a sua conta do Clube do Motion.',

  // Onboarding step
  'onboarding.step.clube': 'Clube do Motion',
  'onboarding.clube.title': 'Conecte o Clube do Motion',
  'onboarding.clube.lead':
    'Opcional. Entre com a conta do Clube para usar o servidor MCP dele nos seus chats. Você pode fazer isso depois, em Configurações.',
  'onboarding.clube.connect': 'Conectar',
  'onboarding.clube.skip': 'Agora não',
  'onboarding.clube.waiting': 'Conclua o login na página que abriu no navegador.',
  'onboarding.clube.connectedAs': 'Conectado como {name}.',
  'onboarding.clube.connected': 'Conectado.',
  'onboarding.clube.noSubscription':
    'Esta conta ainda não tem assinatura ativa, então o servidor MCP fica desligado até ter uma.',
} as const satisfies Record<keyof typeof clubeEn, string>
