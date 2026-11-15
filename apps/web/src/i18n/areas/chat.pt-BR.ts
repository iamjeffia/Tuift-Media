import type { chatEn } from './chat.en.js'

/*
 * Glossary of this area (one word per concept, same as the other areas):
 * - chat (never "conversa" or "thread"); "chat lateral" for a side chat; projeto; provedor; modelo.
 * - Entrar (sign in, button) and login (noun); Tentar de novo (retry); Fechar (close and dismiss).
 * - limite (usage limit), "reinicia" (resets), Adiar (snooze) and Retomar (resume).
 * - Restaurar (restore); checkpoint, branch, checkout, skill, MCP, prompt and workspace stay in English.
 * - Isolado / Local: the two workspace modes of a new chat.
 * - What stays in English on purpose (the chat itself): the transcript and its process rows, the
 *   composer placeholder, the access modes, Design, Motion, the model picker, voice and context usage.
 */

/** Brazilian Portuguese messages of the chrome around the chat: exactly the keys of `chat.en.ts`. */
export const chatPt = {
  // Composer: the project and location shelf of a new chat, and the branch menu
  'chat.composer.chooseProject': 'Escolher projeto',
  'chat.composer.newProject': 'Novo projeto',
  'chat.composer.workspaceMode': 'Modo do workspace',
  'chat.composer.local': 'Local',
  'chat.composer.isolated': 'Isolado',
  'chat.composer.isolatedNeedsGit': 'O modo Isolado precisa de um repositório Git',
  'chat.composer.chooseBranch': 'Escolher branch',
  'chat.composer.noBranch': 'Sem branch',
  'chat.composer.loadingBranches': 'Carregando branches',
  'chat.composer.searchBranches': 'Buscar branches',
  'chat.composer.noMatchingBranches': 'Nenhuma branch encontrada.',

  // Composer: what the notice tray says when a provider is not ready to send
  'chat.setup.noProvider': 'Adicione um provedor para começar a conversar.',
  'chat.setup.unavailable': 'Provedor indisponível',
  'chat.setup.signInRequired': 'Entre para usar este provedor.',
  'chat.setup.setUpRequired': 'Configure este provedor para começar a conversar.',
  'chat.setup.checkSetup': 'Verificar configuração',
  'chat.setup.signIn': 'Entrar',
  'chat.setup.setUpProvider': 'Configurar provedor',
  'chat.setup.signInFailed': 'O login em {provider} falhou. Tente entrar de novo.',

  // The notice tray above the composer
  'chat.notice.errors': 'Erros',
  'chat.notice.report': 'Reportar',
  'chat.notice.reportTitle': 'Enviar este erro ao time do TUIFT Code',
  'chat.notice.dismiss': 'Fechar erro',
  'chat.notice.dismissNamed': 'Fechar erro: {message}',
  'chat.notice.open': 'Abrir',
  'chat.notice.continueOn': 'Continuar em {account}',
  'chat.notice.continueOnAnother': 'Continuar em outra conta',
  'chat.notice.continuedOn': 'Continuado em {account}',
  'chat.notice.continueElsewhere': 'Continuar em outro lugar',
  'chat.notice.switchTo': 'Trocar para {provider}',
  'chat.notice.switchToAnother': 'Trocar para outro provedor',
  'chat.notice.stayOn': 'Ficar em {provider}',
  'chat.notice.switchNext':
    'Sua próxima mensagem muda este chat para {provider}. A conversa até aqui vai junto.',
  'chat.notice.retryModels': 'Recarregar modelos',

  // A chat that continues another one
  'chat.continuation.plain':
    'Continua “{title}” em {account}. A conversa vai junto com a sua primeira mensagem.',
  'chat.continuation.carried':
    'Continua “{title}” em {account}. A conversa vai junto com a sua primeira mensagem, e as alterações não commitadas dele já estão no checkout deste chat.',
  'chat.continuation.kept':
    'Continua “{title}” em {account}. A conversa vai junto com a sua primeira mensagem. Não foi possível trazer as alterações não commitadas dele; elas continuam em {keptIn}.',

  // Resume at usage reset
  'chat.usageReset.label': 'Retomar quando o limite reiniciar',
  'chat.usageReset.scheduleFailed': 'Não foi possível agendar a retomada. Tente de novo.',
  'chat.usageReset.snoozing': 'Adiando…',
  'chat.usageReset.cancel': 'Cancelar retomada automática',
  'chat.usageReset.resume': 'Retomar ao reiniciar',
  'chat.usageReset.snoozedUntil': 'Adiado até o limite reiniciar',
  'chat.usageReset.continueWhen': 'Continuar quando o limite reiniciar',
  'chat.usageReset.resumes': 'Retoma',
  'chat.usageReset.resets': 'Reinicia',
  'chat.usageReset.noTime': 'Este provedor ainda não informou quando o limite reinicia.',
  'chat.usageReset.keepOpen':
    'Mantenha o TUIFT Code aberto ou abra de novo depois que o limite reiniciar.',

  // The "/" menu: TUIFT Code's own commands
  'chat.command.side.description': 'Fazer uma pergunta paralela em um chat temporário',
  'chat.command.side.hint': '[pergunta]',
  'chat.command.feedback.description': 'Enviar feedback ao time do TUIFT Code',
  'chat.command.feedback.hint': '[detalhes]',
  'chat.command.new.description': 'Começar um novo chat',
  'chat.command.model.description': 'Escolher o modelo e o nível de raciocínio',
  'chat.command.permissions.description': 'Definir o que o agente faz sem perguntar',
  'chat.command.resume.description': 'Encontrar e abrir um chat anterior',
  'chat.command.settings.description': 'Abrir configurações',
  'chat.command.mcp.description': 'Gerenciar servidores MCP',
  'chat.command.skills.description': 'Explorar e gerenciar skills',
  'chat.command.usage.description': 'Ver uso e limites do plano',
  'chat.command.login.description': 'Entrar ou sair de um provedor',

  // The "/", "$" and "@" menu: lists, empty states and row text
  'chat.menu.list.slash': 'Comandos e skills',
  'chat.menu.list.slashLoading': 'Carregando comandos e skills…',
  'chat.menu.list.skill': 'Skills',
  'chat.menu.list.skillLoading': 'Carregando skills…',
  'chat.menu.list.mcp': 'Servidores MCP',
  'chat.menu.list.mcpLoading': 'Carregando servidores MCP…',
  'chat.menu.slash.browse': 'Escolha um projeto para ver comandos e skills.',
  'chat.menu.slash.noMatch': 'Nenhum comando ou skill corresponde a “{query}”.',
  'chat.menu.slash.noMore': 'Não há mais comandos ou skills disponíveis.',
  'chat.menu.slash.none': '{provider} não tem comandos nem skills para este projeto.',
  'chat.menu.skill.browse': 'Escolha um projeto para ver as skills.',
  'chat.menu.skill.noMatch': 'Nenhuma skill corresponde a “{query}”.',
  'chat.menu.skill.noMore': 'Não há mais skills disponíveis.',
  'chat.menu.skill.none': '{provider} não tem skills para este projeto.',
  'chat.menu.mcp.browse': 'Escolha um projeto para ver os servidores MCP.',
  'chat.menu.mcp.noMatch': 'Nenhum servidor MCP corresponde a “{query}”.',
  'chat.menu.mcp.noMore': 'Não há mais servidores MCP disponíveis.',
  'chat.menu.mcp.none': '{provider} não tem servidores MCP para este projeto.',
  'chat.menu.loadFailed': 'Não foi possível carregar {list}.',
  'chat.menu.source.skills': 'skills',
  'chat.menu.source.mcp': 'servidores MCP',
  'chat.menu.source.commands': 'comandos',
  'chat.menu.source.resources': 'recursos',
  'chat.menu.and': '{head} e {last}',
  'chat.menu.kind.mcpPrompt': 'Prompt MCP',
  'chat.menu.kind.pluginSkill': 'Skill de plugin',
  'chat.menu.kind.skill': 'Skill',
  'chat.menu.kind.pluginCommand': 'Comando de plugin',
  'chat.menu.kind.customCommand': 'Comando personalizado',
  'chat.menu.kind.command': 'Comando',
  'chat.menu.disabled': 'Desativado',
  'chat.menu.signInRequired': 'Login necessário',
  'chat.menu.signInOutside': 'Entre fora do TUIFT Code',
  'chat.menu.tools_one': '{count} ferramenta disponível',
  'chat.menu.tools_other': '{count} ferramentas disponíveis',
  'chat.menu.mcpConfigured': 'Servidor MCP configurado',

  // Find in the open chat
  'chat.find.label': 'Buscar no chat',
  'chat.find.searching': 'Buscando…',
  'chat.find.failed': 'Falhou',
  'chat.find.none': 'Nenhum',
  'chat.find.searchingEarlier': 'Buscando em mensagens anteriores',
  'chat.find.earlierFailed': 'Não foi possível buscar em mensagens anteriores',
  'chat.find.earlierFailedRetry': 'Não foi possível buscar em mensagens anteriores. Tentar de novo',
  'chat.find.retryEarlier': 'Tentar de novo a busca em mensagens anteriores',
  'chat.find.previous': 'Anterior',
  'chat.find.previousMatch': 'Resultado anterior',
  'chat.find.next': 'Próximo',
  'chat.find.nextMatch': 'Próximo resultado',
  'chat.find.close': 'Fechar busca no chat',

  // Restore (rollback) dialog
  'chat.rollback.close': 'Fechar checkpoints',
  'chat.rollback.title': 'Restaurar',
  'chat.rollback.before': 'Antes de “{label}”',
  'chat.rollback.loadingFiles': 'Carregando arquivos',
  'chat.rollback.pick': 'Escolha um prompt para voltar',
  'chat.rollback.filesStay': 'Os arquivos ficam como estão',
  'chat.rollback.moreFiles': 'mais {count} arquivos',
  'chat.rollback.and': 'e',
  'chat.rollback.goBackOne': 'volta junto',
  'chat.rollback.goBackMany': 'voltam junto',
  'chat.rollback.restoring': 'Restaurando…',

  // Copy button
  'chat.copy.title': 'Copiar',
  'chat.copy.failedRetry': 'Falha ao copiar — clique para tentar de novo',
  'chat.copy.failed': 'Falha ao copiar',
  'chat.copy.response': 'Copiar resposta',
  'chat.copy.prompt': 'Copiar prompt',

  // Icon buttons beside a message
  'chat.actions.editAsNewPrompt': 'Editar como novo prompt',
  'chat.actions.restoreBeforePrompt': 'Restaurar para antes deste prompt',
  'chat.actions.restoreBeforeTurn': 'Restaurar para antes deste turno',

  // Notices of the composer: attachments and the queue of prompts
  'chat.attach.unsupported': 'Este provedor não aceita anexos.',
  'chat.attach.blockSend': 'Remova os anexos ou troque para um provedor que aceite anexos.',
  'chat.attach.tooLarge': '“{name}” tem mais de 25 MB. Use o seletor de arquivos.',
  'chat.attach.pasteDesktopOnly': 'Colar arquivos só funciona no app desktop.',
  'chat.attach.dropDesktopOnly': 'Soltar arquivos só funciona no app desktop.',
  'chat.attach.failed': 'Não foi possível anexar “{name}”. Use o seletor de arquivos.',
  'chat.attach.thatFile': 'esse arquivo',
  'chat.queue.removeFailed': 'Não foi possível remover o prompt da fila.',
  'chat.queue.removeFailedStarted':
    'Não foi possível remover o prompt da fila. Ele pode já ter começado; nenhuma cópia foi adicionada.',

  // Image and video viewer
  'chat.media.preview': 'Visualizar {name}',
  'chat.media.actions': 'Ações da mídia',
  'chat.media.reveal': 'Mostrar na pasta',
  'chat.media.downloadImage': 'Baixar imagem',
  'chat.media.downloadVideo': 'Baixar vídeo',
  'chat.media.download': 'Baixar',
  'chat.media.close': 'Fechar visualizador',
  'chat.media.loadingVideo': 'Carregando vídeo',
  'chat.media.videoUnsupported': 'Este formato de vídeo não pode ser reproduzido aqui.',
  'chat.media.videoControls': 'Controles do vídeo',
  'chat.media.playVideo': 'Reproduzir vídeo',
  'chat.media.pauseVideo': 'Pausar vídeo',
  'chat.media.play': 'Reproduzir',
  'chat.media.pause': 'Pausar',
  'chat.media.progress': 'Progresso do vídeo',
  'chat.media.time': 'Tempo do vídeo',
  'chat.media.unmuteVideo': 'Reativar o som do vídeo',
  'chat.media.muteVideo': 'Silenciar vídeo',
  'chat.media.unmute': 'Reativar som',
  'chat.media.mute': 'Silenciar',
  'chat.media.enterFullscreen': 'Entrar em tela cheia',
  'chat.media.exitFullscreen': 'Sair da tela cheia',
  'chat.media.fullscreen': 'Tela cheia',
  'chat.media.zoomControls': 'Controles de zoom da imagem',
  'chat.media.zoomOut': 'Diminuir zoom',
  'chat.media.zoomIn': 'Aumentar zoom',

  // The card a browser comment chip opens, and the file menu of a link in a reply
  'chat.browserComment.annotated': 'Elemento anotado',
  'chat.browserComment.oneElement': '1 elemento',
  'chat.fileOptions': 'Opções do arquivo',

  // Titles a chat has before it is named (stored in English, mapped when shown)
  'chat.title.newSession': 'Novo chat',
  'chat.title.newChat': 'Novo chat',
  'chat.title.untitled': 'Chat sem título',
  'chat.title.sideChat': 'Chat lateral',

  // The Motion team above the chat (names are proper names and stay as written)
  'chat.motion.group': 'Time do Motion',
  'chat.motion.announce': 'Modo Motion ativado. Etapa atual: {stage}, com {name}.',
  'chat.motion.member': '{name}, {role}',
  'chat.motion.memberCurrent': '{name}, {role}. Etapa atual: {stage}',
  'chat.motion.role.zig': 'Lidera',
  'chat.motion.role.moss': 'Pesquisa as referências',
  'chat.motion.role.bun': 'Escreve o roteiro',
  'chat.motion.role.pip': 'Organiza o projeto',
  'chat.motion.role.cloud': 'Monta o vídeo no After Effects',
  'chat.motion.role.penny': 'Revisa cada quadro',
  'chat.motion.stage.idea': 'Ideia',
  'chat.motion.stage.script': 'Roteiro',
  'chat.motion.stage.narration': 'Narração',
  'chat.motion.stage.audioApproval': 'Aprovação do áudio',
  'chat.motion.stage.references': 'Referências',
  'chat.motion.stage.identity': 'Identidade visual',
  'chat.motion.stage.soundtrack': 'Trilha',
  'chat.motion.stage.motion': 'Motion',
  'chat.motion.stage.review': 'Revisão',
  'chat.motion.stage.delivery': 'Entrega',
} satisfies Record<keyof typeof chatEn, string>
