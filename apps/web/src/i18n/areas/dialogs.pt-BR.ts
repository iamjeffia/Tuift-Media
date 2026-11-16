import type { dialogsEn } from './dialogs.en.js'

/*
 * Glossary of this area (one word per concept):
 * - chat: o chat (not "conversa" or "thread"); "chat lateral" for a side chat.
 * - provedor: provider. Provider and model names stay as they are.
 * - atualização / atualizar: update. "Reiniciar" for restart, "instalar" for install.
 * - checkout, commit, worktree, branch, bypass permissions: stay in English.
 * - "tentar de novo" for retry and try again; never "repetir".
 * - Errors say what happened, then what to do: "Não foi possível …. Tente de novo."
 * - "Fechar" for the close and dismiss buttons of notices and dialogs.
 */

/** Brazilian Portuguese messages of the `dialogs` area: exactly the keys of `dialogs.en.ts`. */
export const dialogsPt = {
  // Words several dialogs share
  'dialogs.common.close': 'Fechar',
  'dialogs.common.cancel': 'Cancelar',
  'dialogs.common.dismiss': 'Fechar',
  'dialogs.common.retry': 'Tentar de novo',
  'dialogs.common.reloadWindow': 'Recarregar janela',
  'dialogs.common.tryAgain': 'Tentar de novo',

  // Desktop bridge: browser fallbacks and errors it writes itself
  'dialogs.bridge.folderPrompt': 'Pasta para trabalhar',
  'dialogs.bridge.skillFolderPrompt': 'Caminho completo de uma pasta de skill',
  'dialogs.bridge.filePrompt': 'Caminho completo de um arquivo para anexar',
  'dialogs.bridge.pickerInvalid': 'O seletor de arquivos do sistema retornou dados inválidos.',
  'dialogs.bridge.clipboardUnavailable': 'O acesso à área de transferência não está disponível',

  // Whole-window recovery screen
  'dialogs.renderer.title': 'O TUIFT Code não conseguiu exibir esta janela',
  'dialogs.renderer.body':
    'Algo deu errado ao desenhar a interface. Os agentes em execução e os chats salvos não foram afetados, então recarregar retoma de onde você parou.',
  'dialogs.renderer.askTitle': 'Pedir a um agente para corrigir',
  'dialogs.renderer.askHint': 'Abre o Claude Code, o Codex ou o Grok',
  'dialogs.renderer.copyDiagnostics': 'Copiar diagnóstico',
  'dialogs.renderer.copied': 'Diagnóstico copiado.',
  'dialogs.renderer.copyFailed': 'Não foi possível copiar o diagnóstico. Tente de novo.',
  'dialogs.renderer.agentsTitle': 'Qual agente deve olhar isso?',
  'dialogs.renderer.agentsBody':
    'Ele abre no seu terminal no modo bypass permissions, com um relatório do erro e um pedido para explicar o que aconteceu e como corrigir.',
  'dialogs.renderer.notInstalled': 'Não instalado',
  'dialogs.renderer.opening': 'Abrindo…',
  'dialogs.renderer.back': 'Voltar',
  'dialogs.renderer.opened': '{name} aberto no seu terminal.',
  'dialogs.renderer.openFailed': 'Não foi possível abrir o {name} em um terminal.',

  // One surface's recovery screen (Settings)
  'dialogs.surface.loadFailed': 'Não foi possível carregar {name}',
  'dialogs.surface.renderFailed': 'Houve um problema em {name}',
  'dialogs.surface.loadBody': 'Recarregue a janela para tentar de novo.',
  'dialogs.surface.renderBody': 'O resto do TUIFT Code continua funcionando.',

  // Skeleton labels read by screen readers
  'dialogs.skeleton.projects': 'Carregando projetos…',
  'dialogs.skeleton.threads': 'Carregando chats…',
  'dialogs.skeleton.settings': 'Carregando configurações…',
  'dialogs.skeleton.pullRequests': 'Carregando pull requests',
  'dialogs.skeleton.workspaceTools': 'Carregando ferramentas do workspace…',
  'dialogs.skeleton.search': 'Abrindo a busca…',
  'dialogs.skeleton.find': 'Abrindo o localizador…',
  'dialogs.skeleton.viewer': 'Abrindo o visualizador…',

  // Notice, row issue and select built-in labels
  'dialogs.rowIssue.label': 'Problema: {message}',
  'dialogs.select.empty': 'Nenhuma opção encontrada',

  // Feedback dialog
  'dialogs.feedback.kind.bug': 'Bug',
  'dialogs.feedback.kind.idea': 'Ideia',
  'dialogs.feedback.kind.question': 'Dúvida',
  'dialogs.feedback.kind.praise': 'Elogio',
  'dialogs.feedback.kind.other': 'Outro',
  'dialogs.feedback.waitSeconds': 'Aguarde {seconds} s',
  'dialogs.feedback.waitMinutes': 'Aguarde {minutes} min',
  'dialogs.feedback.unreachable':
    'Não foi possível acessar o servidor local do TUIFT Code. Seu texto continua aqui.',
  'dialogs.feedback.titleReport': 'Relatar um problema',
  'dialogs.feedback.titleSend': 'Enviar feedback',
  'dialogs.feedback.placeholderBug': 'O que aconteceu? O que você esperava?',
  'dialogs.feedback.placeholderOther': 'O que você quer nos contar?',
  'dialogs.feedback.sending': 'Enviando…',
  'dialogs.feedback.send': 'Enviar',
  'dialogs.feedback.closeFeedback': 'Fechar feedback',
  'dialogs.feedback.kindsLabel': 'Tipo de feedback',
  'dialogs.feedback.noteLabel': 'Adicionar uma observação (opcional)',
  'dialogs.feedback.messageLabel': 'Mensagem',
  'dialogs.feedback.email': 'E-mail',
  'dialogs.feedback.optional': '(opcional)',
  'dialogs.feedback.emailPlaceholder': 'Só se quiser uma resposta',
  'dialogs.feedback.emailHint': 'Digite um e-mail completo ou deixe em branco.',
  'dialogs.feedback.includeError': 'Incluir a mensagem de erro',
  'dialogs.feedback.includeErrorNote':
    'O erro que o TUIFT Code mostrou, sem caminhos de arquivo nem segredos.',
  'dialogs.feedback.includeDetails': 'Incluir detalhes do app',
  'dialogs.feedback.includeDetailsNote':
    'Versão do TUIFT Code, sistema, provedor e modelo. Sem prompts, arquivos nem caminhos.',
  'dialogs.feedback.showPayload': 'Ver exatamente o que será enviado',
  'dialogs.feedback.payloadLabel': 'Conteúdo do feedback',
  'dialogs.feedback.preparing': 'Preparando a prévia…',
  'dialogs.feedback.nothingToSend': 'Ainda não há nada para enviar.',
  'dialogs.feedback.redacted_one': '{count} item foi ocultado.',
  'dialogs.feedback.redacted_other': '{count} itens foram ocultados.',
  'dialogs.feedback.paused': 'O feedback está pausado no momento. Tente de novo mais tarde.',
  'dialogs.feedback.where': 'Vai para a caixa da equipe do TUIFT Code.',
  'dialogs.feedback.sent': 'Enviado. Obrigado!',

  // Checkout discard dialog
  'dialogs.checkoutDiscard.label': 'Descartar o checkout isolado',
  'dialogs.checkoutDiscard.keep': 'Manter o chat',
  'dialogs.checkoutDiscard.title': 'Este checkout tem trabalho sem commit',
  'dialogs.checkoutDiscard.copy':
    'Excluir “{title}” agora descartaria as alterações que o agente ainda não commitou.',
  'dialogs.checkoutDiscard.discarding': 'Descartando…',
  'dialogs.checkoutDiscard.discard': 'Descartar alterações e excluir',

  // App update: the sidebar button, the toast and the chat counts they share
  'dialogs.appUpdate.chats_one': '{count} chat',
  'dialogs.appUpdate.chats_other': '{count} chats',
  'dialogs.appUpdate.stillRunning': '{chats} ainda em execução',
  'dialogs.appUpdate.waiting_one': 'Instala quando {count} chat terminar',
  'dialogs.appUpdate.waiting_other': 'Instala quando {count} chats terminarem',
  'dialogs.appUpdate.retry': 'Tentar atualizar o TUIFT Code de novo',
  'dialogs.appUpdate.downloading': 'Baixando a atualização do TUIFT Code',
  'dialogs.appUpdate.downloadingProgress': 'Baixando a atualização do TUIFT Code ({progress}%)',
  'dialogs.appUpdate.preparing': 'Preparando a atualização do TUIFT Code',
  'dialogs.appUpdate.stoppingToUpdate': 'Parando {chats} para atualizar o TUIFT Code',
  'dialogs.appUpdate.restart': 'Reiniciar para atualizar o TUIFT Code',
  'dialogs.appUpdate.restartTo': 'Reiniciar para atualizar o TUIFT Code para a versão {version}',
  'dialogs.appUpdate.failedDefault': 'Não foi possível concluir a atualização.',
  'dialogs.appUpdate.failedTitle': '{error} Clique para tentar de novo.',
  'dialogs.appUpdate.optionsLabel': '{label}. Opções de atualização',
  'dialogs.appUpdate.installNow': 'Instalar agora',
  'dialogs.appUpdate.stopAndInstall': 'Parar {chats} e instalar',
  'dialogs.appUpdate.keepWaiting': 'Continuar esperando',
  'dialogs.appUpdate.stopsFirst': 'Para {chats} antes',
  'dialogs.appUpdate.installLater': 'Instalar depois',
  'dialogs.appUpdate.stopAndUpdate': 'Parar e atualizar',
  'dialogs.appUpdate.whenTheyFinish': 'Quando terminarem',
  'dialogs.appUpdate.cancel': 'Cancelar atualização',
  'dialogs.appUpdate.stopping': 'Parando {chats}…',
  'dialogs.appUpdate.restarting': 'Reiniciando o TUIFT Code…',
  'dialogs.appUpdate.update': 'Atualizar',
  'dialogs.appUpdate.dismissNotice': 'Fechar o aviso de atualização',
  'dialogs.appUpdate.readyVersion': 'O TUIFT Code {version} está pronto',
  'dialogs.appUpdate.ready': 'Uma atualização do TUIFT Code está pronta',

  // Provider updates: the notice, its rows and the Settings check
  'dialogs.providerUpdates.unitOne': 'atualização',
  'dialogs.providerUpdates.unitOther': 'atualizações',
  'dialogs.providerUpdates.upToDate': 'Atualizado',
  'dialogs.providerUpdates.updateAll': 'Atualizar tudo',
  'dialogs.providerUpdates.dismiss': 'Fechar avisos de atualização dos provedores',
  'dialogs.providerUpdates.verifying': 'Verificando a nova versão…',
  'dialogs.providerUpdates.updatingTo': 'Atualizando para {version}…',
  'dialogs.providerUpdates.updating': 'Atualizando…',
  'dialogs.providerUpdates.updatedTo': 'Atualizado para {version}',
  'dialogs.providerUpdates.failed': 'A atualização falhou',
  'dialogs.providerUpdates.itemLabel': 'Atualização do {name}',
  'dialogs.providerUpdates.stateChecking': 'Verificando',
  'dialogs.providerUpdates.stateUpdating': 'Atualizando',
  'dialogs.providerUpdates.stateUpdated': 'Atualizado',
  'dialogs.providerUpdates.retry': 'Tentar de novo',
  'dialogs.providerUpdates.update': 'Atualizar',
  'dialogs.providerUpdates.guide': 'Guia de atualização',
  'dialogs.providerUpdates.hideDetails': 'Ocultar detalhes',
  'dialogs.providerUpdates.details': 'Detalhes',
  'dialogs.providerUpdates.openingDetails': 'Abrindo os detalhes…',
  'dialogs.providerUpdates.terminalLabel': 'Terminal da atualização do {name}',
  'dialogs.providerUpdates.checkFailedSome': 'Não foi possível verificar todas as atualizações',
  'dialogs.providerUpdates.inProgress': 'Atualização em andamento',
  'dialogs.providerUpdates.needsAttention': 'A atualização precisa de atenção',
  'dialogs.providerUpdates.available_one': '{count} atualização disponível',
  'dialogs.providerUpdates.available_other': '{count} atualizações disponíveis',
  'dialogs.providerUpdates.checking': 'Verificando atualizações…',
  'dialogs.providerUpdates.title': 'Atualizações dos provedores',
  'dialogs.providerUpdates.check': 'Verificar atualizações',

  // Errors the provider update and install stores write
  'dialogs.providerUpdates.error.check':
    'Não foi possível verificar as atualizações. Tente de novo.',
  'dialogs.providerUpdates.error.simulated': 'Falha de atualização simulada. Tente de novo.',
  'dialogs.providerUpdates.error.failed': 'A atualização falhou. Abra os detalhes e tente de novo.',
  'dialogs.providerUpdates.error.unconfirmed':
    'Não foi possível confirmar a nova versão. Veja os detalhes ou tente de novo.',
  'dialogs.providerUpdates.error.start': 'Não foi possível iniciar a atualização.',
  'dialogs.providerInstall.terminalGone': 'Este terminal não está mais disponível. Comece de novo.',

  // Notices, errors and the empty states App builds itself
  'dialogs.app.notice.draftReplaced': 'Seu rascunho foi substituído.',
  'dialogs.app.notice.restoreDraft': 'Restaurar',
  'dialogs.app.notice.undoRestore': 'Desfazer restauração',
  'dialogs.app.notice.changesUndone': 'Alterações desfeitas.',
  'dialogs.app.notice.restored': 'Restaurado para antes de “{label}”.',
  'dialogs.app.notice.restoreUndone': 'Restauração desfeita.',
  'dialogs.app.notice.approvalFailed': 'Não foi possível enviar a aprovação. {reason}',
  'dialogs.app.offline': 'Reconectando ao servidor…',
  'dialogs.app.serverGone':
    'O servidor do TUIFT Code desta janela parou. Reinicie o TUIFT Code para continuar.',
  'dialogs.app.serverTaken':
    'Outro TUIFT Code já está em execução, então esta janela não consegue acessar o próprio servidor. Feche o outro TUIFT Code e reinicie este.',
  'dialogs.app.error.modelsLoad': 'Não foi possível carregar os modelos de {name}. {reason}',
  'dialogs.app.error.providersLoad': 'Não foi possível carregar os provedores. {reason}',
  'dialogs.app.error.accountCheck':
    'Não foi possível confirmar esta conta, mas você ainda pode enviar. {reason}',
  'dialogs.app.error.addFailed': 'Não foi possível adicionar {paths}. {reason}',
  'dialogs.app.error.projectRemoved': 'O projeto foi removido antes de o chat começar.',
  'dialogs.app.error.chatDeleting': 'Este chat está sendo excluído.',
  'dialogs.app.error.sideChatNeedsMain': 'Inicie o chat principal antes de abrir um chat lateral.',
  'dialogs.app.error.sideChatNeedsMessage':
    'Envie uma mensagem no chat principal antes de abrir um chat lateral.',
  'dialogs.app.error.switchBusy':
    'Espere a resposta atual terminar ou interrompa-a antes de este chat mudar para {source}.',
  'dialogs.app.error.switchDropped':
    'A conexão caiu enquanto este chat mudava para {source}. Veja qual provedor o chat mostra e envie de novo.',
  'dialogs.app.error.chooseProject': 'Escolha um projeto antes de enviar.',
  'dialogs.app.empty.loading': 'Carregando projetos…',
  'dialogs.app.empty.failed': 'Não foi possível carregar os projetos.',
  'dialogs.app.empty.noProjects': 'Adicione um projeto para começar a criar.',
  'dialogs.app.empty.addProject': 'Adicionar projeto',

  // Quitting from inside the app while chats are still working
  'dialogs.quit.message': '{chats} ainda em execução. Sair mesmo assim?',
  'dialogs.quit.confirm': 'Sair e parar',
  'dialogs.quit.keep': 'Continuar trabalhando',
  'dialogs.quit.cancel': 'Cancelar saída',
} satisfies Record<keyof typeof dialogsEn, string>
