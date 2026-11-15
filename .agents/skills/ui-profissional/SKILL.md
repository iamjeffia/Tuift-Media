---
name: ui-profissional
description: Criar ou revisar telas de interface (landing page, seção de site, loja virtual/e-commerce, dashboard, app, componente, tela simulada para vídeo) com regras universais de UI/UX que deixam o resultado profissional e sem cara de feito por IA. Usar ao desenhar, refazer, auditar ou polir qualquer tela, inclusive quando for preciso buscar referências visuais (Mobbin primeiro, Pinterest como reserva). Para loja virtual, a seção 7 traz a base de e-commerce.
---

# UI profissional

Duas formas de uso na mesma skill:

- **Criar:** desenhar uma tela ou seção nova, ou refazer uma existente.
- **Revisar:** auditar uma tela pronta, apontar o que quebra cada regra e, se o pedido incluir, corrigir.

As regras resumem práticas de designers, reescritas aqui como método: ideias de Kole Jain (conceitos de UI/UX e telas escaneáveis, regras 1 a 10 e 13), da uxpeak (design barato × caro, regra 12, detalhes em [references/design-caro.md](references/design-caro.md)) e de Emil Kowalski (movimento com propósito, regra 11). Os números são pontos de partida, não lei: o sistema visual do projeto vem antes.

## 1. Contexto antes de desenhar

1. Ache o sistema visual do projeto: tokens (cores, fontes, espaçamentos, raios), componentes e decisões registradas (ex.: README, pasta de design, guia de estilo). Siga o que existe; as regras abaixo ajustam a execução, não trocam a marca.
2. Defina o tipo de tela: **landing/site** (amplitude grande de tipografia) ou **dashboard/app** (densidade alta, texto até 24px).
3. Liste o que cada bloco precisa comunicar e qual é o elemento mais importante de cada um.

## 2. Referências: Mobbin primeiro

Ao criar ou refazer uma tela, busque referência real antes de desenhar. Regra de escolha (detalhes e chamadas em [references/referencias.md](references/referencias.md)):

| Precisa de | Fonte |
|---|---|
| Tela de app ou site, seção de landing (hero, preço, FAQ, depoimento, rodapé), dashboard, fluxo (onboarding, checkout) | **Mobbin** (MCP `search_sections`, `search_screens`, `search_flows`). Escolha ideal e principal. |
| Motion graphics, motion design, efeito animado, estética, foto, pessoa, ambiente, ilustração, moodboard | **Pinterest** |
| O Mobbin não tem o que se procura ou o MCP não está disponível | **Pinterest** |
| Movimento e componente pronto: transição, ícone que muda de forma ou anima no hover, microinteração, tela de agente de IA, efeito de IA (orbe, borda de luz) | **transitions.dev, morphicons, itshover, libraries.dev, bencho, beautifului** (o que usar em cada caso, os comandos de instalação e a régua de durações e curvas estão em [references/motion-e-componentes.md](references/motion-e-componentes.md)) |

Pinterest pelo navegador da própria pessoa (sessão já logada) ou por um navegador que o agente controle. O agente **não digita senha**: se a sessão estiver deslogada, pede para a pessoa entrar (detalhes em `references/referencias.md`).

Use a referência para estrutura, hierarquia, espaçamento e padrões; não copie marca, texto ou imagem de terceiros.

## 3. Regras (resumo; números e exemplos em [references/regras.md](references/regras.md))

1. **Signifiers:** a tela se explica sozinha. Agrupe com contêiner, destaque o selecionado, acinzente o inativo. Clicável mostra hover, pressionado, item ativo; ícone sem texto ganha tooltip.
2. **Hierarquia:** tamanho, posição e cor. O mais importante no topo, maior e em negrito; o secundário menor e cinza. Um destaque de cor por bloco. Imagem, logo e ícone no lugar de rótulos ("From:", "Restaurant:"). Lista "rótulo: valor" toda igual = planilha, não design.
3. **Espaço:** espaço em branco antes de grade. Múltiplos de 4 (4–40px). Um espaçamento base entre blocos (ex.: 32px) e metade (16px) entre itens que andam juntos. Grade 12/8/4 colunas para conteúdo repetido; landing pode sair dela.
4. **Tipografia:** uma família sans-serif. Texto grande com espaçamento entre letras de −2% a −3% e altura de linha de 110–120%. Landing: até 6 tamanhos (ex.: 64/42/32/20/16/14). Dashboard: até 24px (ex.: 24/20/18/16/14/12).
5. **Cor:** uma primária; versões claras para fundo e escuras para texto (rampa 50–950). Outras cores só com função: azul confiança/foco, vermelho erro/urgência, amarelo aviso, verde sucesso/novo.
6. **Modo escuro:** borda clara discreta; profundidade por superfície mais clara que o fundo; chip com fundo escuro dessaturado e texto claro da mesma cor; fundo pode ter matiz.
7. **Sombra:** opacidade baixa, desfoque alto. Card pouco; popover e menu mais. Se a sombra é a primeira coisa que se nota, está errada.
8. **Ícones e botões:** ícone do tamanho da altura de linha do texto; texto próximo. Padding horizontal = 2× vertical. Par de CTA: primário preenchido + secundário ghost.
9. **Feedback:** botão com padrão, hover, pressionado, desabilitado (+ carregando). Campo com foco, erro com mensagem e aviso. Toda ação responde (spinner, progresso, "Copiado!").
10. **Imagem com texto:** gradiente linear localizado atrás do texto, não camada escura na foto toda; desfoque progressivo como acabamento.
11. **Animações sutis em toda interface (padrão da skill):** card **clicável** sobe 2px com sombra larga e fraca no hover (`translateY(-2px)`, `0 8px 24px -16px rgba(0,0,0,.25)`, 0,16 s ease), só dentro de `@media (hover: hover) and (pointer: fine)`; card informativo, painel/dashboard e superfície de uso frequente não sobem (critério de Emil Kowalski: animação sem propósito sai); ripple leve no clique; link escurece e ganha sublinhado; entrada de blocos subindo com fade; skeleton com brilho no carregamento. Curto e discreto: nada se mexe sozinho fora do carregamento. Detalhes na seção 12 de [references/regras.md](references/regras.md).
12. **Design caro: decidir fácil, não só parecer limpo (uxpeak).** A imagem que vende é o maior elemento do card (miniatura de 56 pt → 172 → 353 pt); 3 degraus de texto, com o dado de decisão em peso ou cor; filtros frequentes em chips visíveis e o resto num sheet sobre os resultados; botão que diz a consequência ("Ver 41 imóveis", "Pagar R$ 239,90"); contagem em cada opção antes do clique; "3+" como padrão; slider junto de campos; perguntar o que a pessoa sabe e fazer a conta; texto de terceiros fora da foto; um selo por tela; navegação mais quieta que o conteúdo; uma escala de raio. Parecer simples não é decidir fácil: aceite o elemento que elimina um passo ou uma dúvida e corte o dado que não ajuda a decidir. Tabelas barato × caro e checklist em [references/design-caro.md](references/design-caro.md).
13. **Tela escaneável: arestas, diferenciação e contraste relativo (Kole Jain).** Ninguém lê a tela, caça a resposta. Cada elemento encosta em 2 ou mais arestas (borda, linha de cima, coluna): texto duro à esquerda, valor e hora duros à direita, centralizado só o que não é para ler; faltou aresta, crie uma (banner, linha) em vez de esconder função num ⋮, e não encha espaço vazio. Linha de texto não atravessa o card. Densidade se resolve diferenciando (avatar onde cita pessoa, grupo com cabeçalho cinza, chip com ícone, link azul), não espaçando. Símbolo universal no lugar de texto; não "explique mais" com comparação, % e (i) empilhados; ícone sem rótulo só se universal. Ênfase é a diferença com os vizinhos: valor padrão e inativo em cinza, e para destacar neutralize o entorno em vez de engrossar o alvo; checkbox desligado sem cor. Sem caixa dentro de caixa nem raios empilhados: uma linha de 1 px pode substituir os cards.
14. **Enquadramento medido:** texto dentro de campo, botão, pílula ou chip: padding ≥ 25% da altura da caixa (mínimo 12px), centro vertical (diferença ≤ 10% da altura), dois textos no mesmo campo com folgas iguais e a mesma linha, grupo em linha centrado na tela. Em HTML, use flex com `align-items:center` e padding, nunca `position:absolute` com número solto. Confira rodando [scripts/enquadramento.js](scripts/enquadramento.js) (console, `javascript_tool` ou `page.evaluate`): tem de devolver lista vazia. Tela simulada em vídeo vale igual: meça no quadro parado.
15. **Nada rola para o lado:** a página e o chat nunca ganham barra de rolagem horizontal, em nenhuma largura. Texto comprido de uma linha (comando, caminho, título de lista, linha de atividade) fica numa linha só e corta com "…" (`min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, e `min-width:0` em cada pai flex ou grid). Código não quebra linha: rola dentro da própria caixa, com barra fina e discreta (`white-space:pre; overflow:auto; max-width:100%`). Tabela larga rola dentro dela; imagem com `max-width:100%`; código no meio do texto pode quebrar (`overflow-wrap:anywhere`). Confira com `document.scrollingElement.scrollWidth <= innerWidth` e o mesmo para a área de rolagem principal, no desktop e no celular.

## 4. Modo Criar

1. Contexto (seção 1) e referências (seção 2): 3 a 6 referências por tela ou seção, anotando o padrão aproveitado de cada uma.
2. Defina tokens antes do layout: escala de espaçamento (múltiplos de 4), escala tipográfica (até 6 tamanhos, com altura de linha), rampa da cor primária e cores semânticas.
3. Monte a hierarquia de cada bloco (o que é título, apoio, ação), depois o layout.
4. Implemente com estados (hover, pressionado, foco, desabilitado, carregando, erro) desde o início, não no fim.
5. Verifique (seção 6).

**Ilustração de produto dentro da página:** hero animado, card de recurso, grade bento ou mockup de app/celular com cursor (a "tela do produto" desenhada dentro de uma landing ou loja) pode sair pela skill `stageshow`, se ela estiver instalada (kit React copiado para o projeto, com ensaio de verificação). Esta skill continua dona da página em volta; o Stageshow faz a tela de dentro.

## 5. Modo Revisar

1. Renderize a tela (navegador do harness, dev server ou build) e capture desktop e celular. Leia o código dos estilos para conferir números.
2. Passe o checklist abaixo e registre cada problema com: onde (seção/componente, arquivo:linha), regra quebrada, evidência (valor atual) e correção proposta (valor novo).
3. Ordene por impacto: hierarquia e legibilidade primeiro, depois espaçamento e tipografia, depois polimento (sombra, estados, microinteração).
4. Se o pedido incluir corrigir: aplique em mudanças pequenas e verificáveis, preservando marca e copy. Texto novo para o público passa pela revisão de português do projeto, se houver.

### Checklist (cada item é também um "cheiro de IA")

- [ ] Algum card ou lista parece planilha (rótulos repetidos, tudo do mesmo tamanho)?
- [ ] Cada bloco tem um único elemento dominante? Há mais de um destaque de cor competindo?
- [ ] Espaçamentos fora de múltiplos de 4, ou iguais entre itens que deviam ficar agrupados?
- [ ] Mais de uma família de fonte? Mais de 6 tamanhos (landing) ou texto > 24px (dashboard)?
- [ ] Títulos grandes com espaçamento de letras e altura de linha padrão (soltos)?
- [ ] Cor usada só para decorar, ou cores semânticas trocadas?
- [ ] Sombra pesada, escura ou visível antes do conteúdo? Borda clara forte no modo escuro? Chip neon?
- [ ] Ícones maiores que a altura de linha do texto, ou longe do rótulo? Ícone dentro de quadrado colorido (ícone de app): o símbolo está no centro e ocupa ~55% da caixa? Meça o desenho real (união das formas do SVG) contra a caixa, não a tag; um `<i>` que embrulha o SVG sem ocupar a caixa deixa o símbolo pequeno e torto.
- [ ] Botões com padding desproporcional, ou dois CTAs com o mesmo peso?
- [ ] Faltam estados (hover, pressionado, foco, desabilitado, carregando, erro)? Ação sem resposta visível?
- [ ] Cards e elementos clicáveis sem animação sutil de hover e entrada (regra 11)? Seções coladas, sem respiro, ou sombras pesadas?
- [ ] Texto branco direto sobre foto, ou foto inteira escurecida?
- [ ] Rótulo em caixa alta acima do título (eyebrow) ou seção de "3 passos numerados" com ícone centralizado? Evite os dois: use um título só, à esquerda, e mostre a coisa real (ex.: celular com a conversa) no lugar dos passos.
- [ ] Menu com hover só de sublinhado? O padrão é o botão fantasma (ex.: 40 px de altura, fundo branco a 10% no escuro, raio 10) com um traço na seção atual.
- [ ] Design barato (regra 12): foto do produto pequena demais, metadado corrido em cinza, filtros escondidos em dropdown, botão mudo ("Aplicar") sem dizer quantos resultados ou quanto vai pagar, opções sem contagem, stepper + e − para escolher número, texto sobre a foto do lojista, mais de um selo, raios misturados? Passe o checklist D de [references/design-caro.md](references/design-caro.md).
- [ ] Rolagem lateral (regra 15): alguma barra horizontal na página ou no chat? Linha comprida empurrando a largura em vez de cortar com "…"? Código quebrando linha em vez de rolar dentro da caixa?
- [ ] Tela escaneável (regra 13): elemento solto, sem 2 arestas, ou centralizado sem motivo? Botões escondidos em ⋮ para "limpar"? Texto correndo a largura toda? Tudo do mesmo jeito em vez de avatar, grupo e chip? Comparação, % e (i) empilhados? Vários valores padrão coloridos competindo? Card dentro de card com raios empilhados? Em tela para vídeo, pare o quadro 1 s no celular: o que se vê primeiro é o que a narração diz?
- [ ] Gradientes roxo-azul genéricos, emojis como ícones, cantos e sombras iguais em tudo, texto de preenchimento? (sinais comuns de tela gerada sem critério; inferência nossa, não do vídeo)

## 6. Verificação

- Renderize e olhe: desktop (1440px) e celular (390px), claro e escuro se existir.
- Confira no código os números das regras (tamanhos, alturas de linha, espaçamentos, paddings, sombras).
- Rode `scripts/enquadramento.js` em cada tela, desktop e celular: a lista tem de voltar vazia (regra 14).
- Interaja: hover, clique, foco e envio de formulário mostram resposta.
- Compare antes e depois com capturas e liste o que mudou e por quê (regra).

## 7. Loja virtual (e-commerce): base para qualquer nicho

Loja nova parte de uma referência máxima (uma loja real bem feita do mesmo tipo, escolhida com a pessoa) e tem de superá-la em clareza e velocidade de compra.

1. **A marca do cliente provavelmente já existe.** Procure logos, paleta e fontes nos arquivos do cliente antes de criar identidade. A marca entra nos pontos de assinatura (header, rodapé, gaveta do menu); a interface fica neutra.
2. Escolha o caminho: **A**, partir de uma base de loja que o projeto já tenha e trocar marca, dados e o que é de nicho; ou **B**, nova referência máxima com o mesmo método (medir, clonar o CSS de origem sem alterar, polir numa camada separada).
3. O que não muda: uma referência máxima por loja; animações da regra 11; celular como app (alvos de 44 px, input de 16 px, barra inferior, barra de compra fixa, gavetas que sobem da base); preço com o meio de pagamento local (ex.: Pix) e parcelas como parte do preço; frete grátis com barra de progresso; checkout em 3 etapas sem distrações, com erros que dizem o que fazer; checkout pede só o essencial e nada que o meio de pagamento já pede; meio de pagamento citado na tela aparece com o ícone oficial, não como badge só de texto; todas as páginas (inclusive ajuda, guia de medidas, conta, termos e 404) e nenhum `href="#"`.
4. Só mostre como pronta depois de uma auditoria automática em 360, 390, 768, 1024 e 1440 px com 0 problemas e do teste do fluxo de compra (todos os meios de pagamento).
5. Ao terminar, registre no repositório da loja o que ela fez melhor que a referência, para a próxima.
6. **Coleção ou lançamento com 6 a 12 produtos de perfil: estilo "vitrine em parede" (opcional).** Parede escura com prateleiras de acrílico que acendem e câmera que dá zoom até o produto, no desktop e no celular. Defina números de zoom, tempo e luz no projeto e teste nos dois formatos.

## Exemplo de relatório do modo Revisar

Use uma tabela por tela: **onde · regra quebrada · antes · depois**. Exemplo:

| Onde | Regra | Antes | Depois |
|---|---|---|---|
| Hero, título | 4 (tipografia) | 56 px, letra 0, linha 1,4 | 64 px, letra −2%, linha 1,15 |
| Card de plano | 2 (hierarquia) | 7 linhas rótulo/valor iguais | preço à direita em cor de destaque, resto em cinza menor |

Para redesenhar um sistema que já está no ar: capture referências, aplique uma camada de tokens por cima do CSS existente sem mexer no comportamento, publique uma prévia num endereço separado antes da troca e mantenha backup para voltar.
