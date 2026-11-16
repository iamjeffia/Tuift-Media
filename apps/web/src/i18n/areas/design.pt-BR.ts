import type { designEn } from './design.en.js'

/*
 * Glossary of this area (same words as the other areas): revisão (review), problema (what a review
 * finds), página, prévia (preview), marca (brand), plano da página (page blueprint). TUIFT Code,
 * Design and the access modes stay as they are. The pipeline speaks in the first person, as the
 * agent does when it narrates its own work.
 */
export const designPt = {
  'design.phase.brief': 'Entendendo o pedido',
  'design.phase.brand': 'Criando a direção de marca',
  'design.phase.page': 'Planejando a página',
  'design.phase.assets': 'Reunindo as imagens',
  'design.phase.build': 'Construindo o site',
  'design.phase.change': 'Alterando a página',
  'design.phase.preview': 'Iniciando a prévia',
  'design.phase.review': 'Revisando o design',
  'design.phase.repair': 'Refinando o site',

  'design.msg.note.briefLocked': 'Briefing definido. Começando o design.',
  'design.msg.note.notDesign':
    'O modo Design foi desligado porque este pedido não é de design de site.',
  'design.msg.note.kindReview':
    'Isto é uma revisão: nada no projeto será alterado. Vou abrir cada página, ver a página inteira nas larguras de desktop e de celular e responder com o que encontrar.',
  'design.msg.note.kindChange':
    'Isto é uma mudança no que já existe, então pulo o briefing, a marca e o plano da página e faço a mudança direto. Depois confiro o resultado no navegador.',
  'design.msg.note.kindLighter':
    'Não deu para saber se você quer um design novo ou uma mudança no que está lá, então segui pelo caminho mais leve: mudar o que já existe. Avise se queria um design novo.',
  'design.msg.note.noProjectChange':
    'Não há nenhuma página nesta pasta para mudar, então vou construir uma nova.',
  'design.msg.note.pagesFound_one': 'Encontrei {count} página para conferir: {list}.',
  'design.msg.note.pagesFound_other': 'Encontrei {count} páginas para conferir: {list}.',
  'design.msg.note.reviewing': 'Revisando {page} ({index} de {count}).',

  'design.msg.final.websiteBuilt': 'Site pronto.',
  'design.msg.final.dashboardBuilt': 'Painel pronto.',
  'design.msg.final.changeDone': 'Mudança feita.',
  'design.msg.final.reviewDone': 'Revisão concluída. Nada no projeto foi alterado.',
  'design.msg.final.notFinished_one': 'Não está terminado: resta {count} problema.',
  'design.msg.final.notFinished_other': 'Não está terminado: restam {count} problemas.',
  'design.msg.final.nothingToReview': 'Não há nenhuma página nesta pasta para revisar.',
  'design.msg.final.filesChangedInReview':
    'O agente alterou arquivos durante esta revisão, mesmo sem poder: {list}. Confira no seu controle de versão antes de manter.',
  'design.msg.final.previewReady': 'Prévia pronta em {url}.',
  'design.msg.final.reviewPassed': 'A revisão visual passou.',
  'design.msg.final.reviewPassedAfter_one':
    'A revisão visual passou depois de {count} tentativa de correção.',
  'design.msg.final.reviewPassedAfter_other':
    'A revisão visual passou depois de {count} tentativas de correção.',
  'design.msg.final.reviewPassedCropped':
    'Só a parte capturada da página foi revisada: {viewports} terminou antes da página, então revise o resto você mesmo.',
  'design.msg.final.reviewStopped_one':
    'A revisão visual parou depois de {limit} tentativas de correção, com {count} problema restante.',
  'design.msg.final.reviewStopped_other':
    'A revisão visual parou depois de {limit} tentativas de correção, com {count} problemas restantes.',
  'design.msg.final.reviewSkippedNoImages':
    'A revisão visual foi pulada porque o provedor escolhido não aceita imagens.',
  'design.msg.final.reviewSkippedNoWindow':
    'A revisão visual foi pulada porque nenhuma janela do TUIFT Code estava aberta para tirar as capturas.',
  'design.msg.final.reviewSkipped': 'A revisão visual foi pulada porque {reason}.',
  'design.msg.final.pagesChecked_one': 'Conferi {count} página:',
  'design.msg.final.pagesChecked_other': 'Conferi {count} páginas:',
  'design.msg.final.pageOk': '\n- {page}: sem problemas.',
  'design.msg.final.pageOpen_one': '\n- {page}: resta {count} problema.',
  'design.msg.final.pageOpen_other': '\n- {page}: restam {count} problemas.',
  'design.msg.final.pagesCut':
    'Foram encontradas {total} páginas e uma execução confere no máximo {ceiling}, então estas ficaram de fora: {list}. Peça essas em um novo pedido.',
  'design.msg.final.stillOpen': 'Ainda em aberto:',
  'design.msg.final.fullList': 'A lista completa está em .taste/review.json.',
  'design.msg.final.scanSkipped':
    'As checagens de qualidade do código não rodaram porque esta pasta tem arquivos demais para varrer.',
  'design.msg.final.repairs':
    'O modelo {model} não conseguiu cumprir algumas das checagens desta execução, então o TUIFT Code as completou sozinho. O resultado é o que um modelo desse tamanho consegue. O que o TUIFT Code completou:',
  'design.msg.final.repairsDefaultModel':
    'O modelo padrão do provedor não conseguiu cumprir algumas das checagens desta execução, então o TUIFT Code as completou sozinho. O resultado é o que um modelo desse tamanho consegue. O que o TUIFT Code completou:',
  'design.msg.final.motionCaptured':
    'Para conferir o movimento, o TUIFT Code capturou {moments} momentos da primeira tela depois do carregamento, listou {animations} animações em execução ({reduced} ainda rodando com movimento reduzido ligado) e testou o passar do mouse em {hovers} controles.',
  'design.msg.final.motionLimit.script_animation':
    'Não verificado: animação feita por script (requestAnimationFrame, GSAP) não aparece na lista de animações; só os momentos a mostram.',
  'design.msg.final.motionLimit.click_not_captured':
    'Não verificado: os estados depois de um clique ou de uma tecla não foram capturados.',
  'design.msg.final.motionLimit.hover_none':
    'Não verificado: nenhum controle da primeira tela pôde receber o mouse.',
  'design.msg.final.motionLimit.moments_failed':
    'Não verificado: os momentos depois do carregamento não puderam ser capturados.',

  'design.msg.review.group.blocking': '\nBloqueantes:',
  'design.msg.review.group.major': '\nImportantes:',
  'design.msg.review.group.minor': '\nMenores:',
  'design.msg.review.reviewSummary_one':
    'Revisei {pages} página(s) e encontrei {count} problema, do mais importante ao menos.',
  'design.msg.review.reviewSummary_other':
    'Revisei {pages} página(s) e encontrei {count} problemas, do mais importante ao menos.',
  'design.msg.review.clean': 'Revisei {pages} página(s) e não encontrei problemas.',
  'design.msg.review.finding': '\n{n}. {page}, {area}: {evidence} O que fazer: {repair}',
  'design.msg.review.finding.empty_region':
    '\n{n}. {page}, largura {viewport}, perto de "{near}": uma faixa de {height}px de altura ({percent}% da janela), de {top}px a {bottom}px da página, não tem texto, imagem nem controle. O que fazer: deixar a seção só tão alta quanto o conteúdo pede (tirar a altura fixa ou de janela inteira e o espaçamento grande) ou trazer o conteúdo para esse espaço.',
  'design.msg.review.finding.heading_out_of_scale':
    '\n{n}. {page}, largura {viewport}: "{text}" está como título com {size}px em {lines} linha(s), fora de escala para o papel que tem. O que fazer: usar o tamanho do corpo ou de rótulo (endereço, horário e contato são informação, não título) ou escrever um título curto e deixar os detalhes pequenos embaixo.',
  'design.msg.review.finding.duplicate_cta':
    '\n{n}. {page}, largura {viewport}: a ação "{text}" aparece {count} vezes na mesma tela. O que fazer: manter uma ação principal por tela ou dar a cada uma uma função diferente.',
  'design.msg.review.finding.horizontal_overflow':
    '\n{n}. {page}, largura {viewport}: a página é {by}px mais larga que a janela. O que fazer: fazer o conteúdo caber na largura da janela, com larguras fluidas e quebra de linha.',
  'design.msg.review.finding.text_clipped':
    '\n{n}. {page}, largura {viewport}: o texto "{text}" é cortado pela própria caixa. O que fazer: deixar a caixa crescer com o texto ou encurtar o texto.',
  'design.msg.review.finding.text_overlap':
    '\n{n}. {page}, largura {viewport}: "{first}" está por cima de "{second}". O que fazer: dar a cada bloco o seu espaço no layout.',
  'design.msg.review.finding.image_alt_missing':
    '\n{n}. {page}, largura {viewport}: {count} imagem(ns) sem texto alternativo. O que fazer: dar a cada imagem com significado um alt que diga o que ela mostra, e alt vazio para a decorativa.',
  'design.msg.review.finding.low_contrast':
    '\n{n}. {page}, largura {viewport}: {count} texto(s) abaixo do contraste que a WCAG pede; o pior é "{text}", com {ratio}:1 onde o mínimo é {required}:1. O que fazer: escurecer o texto ou clarear o fundo.',
  'design.msg.review.finding.interactive_target_size':
    '\n{n}. {page}: {count} controle(s) visível(is) menor(es) que 44 por 44 px, por exemplo {example}. O que fazer: deixar todo controle visível com pelo menos 44 por 44 px em todas as larguras.',
  'design.msg.review.finding.document_h1_count':
    '\n{n}. {page}, largura {viewport}: a página tem {count} títulos h1. O que fazer: usar exatamente um h1 por página.',
  'design.msg.review.finding.font_family_drift':
    '\n{n}. {page}: o código usa fontes fora das aprovadas: {list}. O que fazer: usar só as fontes aprovadas.',
  'design.msg.review.finding.radius_scale_drift':
    '\n{n}. {page}: o código usa raios de borda fora da escala da marca: {list}. O que fazer: usar os tokens de raio da marca.',

  'design.msg.repair.brief.filled':
    '\n- Briefing: o campo "{field}" foi preenchido a partir do seu pedido.',
  'design.msg.repair.brand.filled':
    '\n- Marca: o campo "{field}" foi preenchido com um padrão simples.',
  'design.msg.repair.brand.typeface':
    '\n- Marca: a fonte "{from}" foi trocada por "{to}", a que esta execução recebeu.',
  'design.msg.repair.brand.palette':
    '\n- Marca: a paleta de cores foi trocada por uma segura, que passa nas checagens de contraste.',
  'design.msg.repair.page.reference':
    '\n- Página: a seção {section} ({family}) recebeu a referência {id}, da própria família.',
  'design.msg.repair.page.layout': '\n- Página: o item "{what}" do plano da página foi corrigido.',
  'design.msg.repair.page.copy': '\n- Página: o texto ("{what}") da seção {section} foi limpo.',
  'design.msg.repair.page.fallback':
    '\n- Página: o modelo não conseguiu escrever um plano de página válido, então o TUIFT Code montou um a partir das seções que o seu briefing pedia.',
  'design.msg.repair.page.dropped':
    '\n- Página: a seção {section} não pôde ser corrigida e ficou de fora.',
  'design.msg.repair.review.verdict':
    '\n- Revisão: o veredito foi corrigido de "{from}" para "{to}" para combinar com os problemas listados.',
  'design.msg.repair.review.unreadable':
    '\n- Revisão: o modelo não devolveu uma revisão legível, então só as medidas da própria página a julgaram.',
  'design.msg.repair.preview.plan':
    '\n- Prévia: o modelo não devolveu um plano utilizável, então o TUIFT Code iniciou o projeto sozinho ({kind}).',
  'design.msg.repair.build.report':
    '\n- Construção: o modelo não devolveu o relatório, então o TUIFT Code conferiu o projeto sozinho.',
  'design.msg.repair.assets.demoted':
    '\n- Imagens: {count} imagem(ns) não foram encontradas e viraram elementos nativos da página.',
} as const satisfies Record<keyof typeof designEn, string>
