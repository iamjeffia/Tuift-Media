import type { onboardingEn } from './onboarding.en.js'

/**
 * Brazilian Portuguese messages of the `onboarding` area: exactly the keys of `onboarding.en.ts`.
 *
 * Glossary (this area): agente de código (coding agent), subagente, provedor, projeto, chat,
 * configuração inicial (setup), selo (the seal of the profile picture), cunhar (to strike).
 * Settings pages are named as the Settings shell names them: Configurações › Aparência /
 * Provedores / Modelos. The sample chat in the preview speaks Portuguese, as a Brazilian user's
 * chat would, while the rows the app itself writes into a chat (Explored 3 files…) and the
 * composer's own words stay English, as in the real chat.
 */
export const onboardingPt = {
  // Steps (progress dots) and shared buttons
  'onboarding.progress.label': 'Progresso da configuração',
  'onboarding.step.welcome': 'Boas-vindas',
  'onboarding.step.name': 'Seu nome',
  'onboarding.step.appearance': 'Aparência',
  'onboarding.step.agents': 'Agentes de código',
  'onboarding.step.subagents': 'Subagentes',
  'onboarding.step.project': 'Primeiro projeto',
  'onboarding.skip': 'Pular configuração',
  'onboarding.back': 'Voltar',
  'onboarding.continue': 'Continuar',

  // Welcome
  'onboarding.welcome.title': 'Boas-vindas ao TUIFT Code',
  'onboarding.welcome.lead':
    'Uma janela só para os agentes de código que já estão neste computador. Algumas escolhas rápidas e pronto.',
  'onboarding.welcome.start': 'Começar',

  // Name
  'onboarding.name.title': 'Como podemos te chamar?',
  'onboarding.name.lead': 'Aparece no seu perfil, com todos os provedores. Pode deixar em branco.',
  'onboarding.name.label': 'Seu nome',

  // Appearance
  'onboarding.appearance.title': 'Escolha seu visual',
  'onboarding.appearance.lead':
    'Aplicado na hora. Fontes, cores de destaque e fundos ficam em Configurações › Aparência.',
  'onboarding.appearance.legend': 'Tema',
  'onboarding.theme.system': 'Sistema',
  'onboarding.theme.systemNote': 'Segue o sistema',
  'onboarding.theme.light': 'Claro',
  'onboarding.theme.lightNote': 'Alto contraste',
  'onboarding.theme.dark': 'Escuro',
  'onboarding.theme.darkNote': 'Suave, sem ofuscar',

  // Coding agents
  'onboarding.agents.title': 'Escolha seus agentes de código',
  'onboarding.agents.empty': 'Marque os que você usa. Nada é adicionado até você escolher.',
  'onboarding.agents.added_one':
    '{count} adicionado. Você pode mudar isso quando quiser em Configurações › Provedores.',
  'onboarding.agents.added_other':
    '{count} adicionados. Você pode mudar isso quando quiser em Configurações › Provedores.',
  'onboarding.agents.providers': 'Provedores',
  'onboarding.agents.acp': 'Agentes ACP',
  'onboarding.agents.loading': 'Procurando os agentes de código instalados neste computador…',
  'onboarding.readiness.checking': 'Verificando…',
  'onboarding.readiness.notInstalled': 'Não instalado',
  'onboarding.readiness.attention': 'Precisa de atenção',
  'onboarding.readiness.signIn': 'Falta entrar',
  'onboarding.readiness.signedIn': 'Conectado',
  'onboarding.readiness.installed': 'Instalado',

  // Sub-agents
  'onboarding.subagents.title': 'Subagentes em outros provedores',
  'onboarding.subagents.lead':
    'O TUIFT Code pode usar suas outras assinaturas nos subagentes quando outro modelo servir melhor para a tarefa. Você pode mudar isso quando quiser em Configurações › Modelos.',
  'onboarding.subagents.allow': 'Permitir',
  'onboarding.subagents.allowNote': 'Os agentes escolhem o melhor provedor para cada subagente.',
  'onboarding.subagents.ask': 'Só quando eu pedir',
  'onboarding.subagents.askNote': 'Subagentes usam o provedor do chat, salvo se você pedir outro.',

  // First project
  'onboarding.project.title': 'Abra seu primeiro projeto',
  'onboarding.project.lead':
    'Escolha a pasta em que você está trabalhando: um repositório git ou qualquer pasta comum.',
  'onboarding.project.note':
    'Projetos e chats ficam neste computador. O login fica com cada provedor.',
  'onboarding.project.skip': 'Agora não',
  'onboarding.project.choose': 'Escolher pasta',

  // The small app drawn beside the pages (interface labels and sample content)
  'onboarding.preview.localProfile': 'Perfil local',
  'onboarding.preview.newChat': 'Novo chat',
  'onboarding.preview.newProject': 'Novo projeto',
  'onboarding.preview.projects': 'Projetos',
  'onboarding.preview.yourProject': 'Seu projeto',
  'onboarding.preview.chatTheme': 'Adicionar seletor de tema',
  'onboarding.preview.chatUpload': 'Corrigir upload instável',
  'onboarding.preview.chatDeps': 'Atualizar dependências',
  'onboarding.preview.earlierAnswer':
    'Os 214 testes passam. A nova tentativa de upload agora espera o socket fechar antes de abrir outro.',
  'onboarding.preview.said':
    'Adicione um seletor de tema claro e escuro nas Configurações. Ele deve acompanhar o sistema até alguém escolher um.',
  'onboarding.preview.answer':
    'Pronto. O seletor fica em Configurações › Aparência e acompanha o sistema até alguém escolher um lado.',

  // How a seal is struck (the "?" beside the profile seal)
  'onboarding.seal.toggle': 'Como o selo é cunhado',
  'onboarding.seal.hashed':
    'Sem letras para ler, este selo vem de um hash. A mesma palavra sempre gera o mesmo selo.',
  'onboarding.seal.colour': '{value} define a cor',
  'onboarding.seal.ground': 'termina em {value}, então é {tone}',
  'onboarding.seal.dark': 'escuro',
  'onboarding.seal.light': 'claro',
  'onboarding.seal.endVowel': 'termine em vogal para ficar claro',
  'onboarding.seal.endOther': 'termine em qualquer outra letra para ficar escuro',
  'onboarding.seal.letters': '{value} letras, {symmetry}',
  'onboarding.seal.quad': 'quatro fatias',
  'onboarding.seal.mirror': 'espelhado',
  'onboarding.seal.triple': 'três fatias',
  'onboarding.seal.tiles': 'cada letra coloca uma peça, de cima para baixo, de fora para dentro',
  'onboarding.seal.vowels': 'vogais',
} satisfies Record<keyof typeof onboardingEn, string>
