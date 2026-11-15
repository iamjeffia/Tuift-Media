---
name: motion-narrado
description: "Regras para montar motion graphics sobre uma narração (Reels explicativos e anúncios narrados com telas de interface): a cena se constrói conforme a fala, sem spoiler; legenda viva com tempo de leitura e sem marca-texto; um elemento real ou metáfora visual para cada ideia dita (print real, logo oficial, foto do assunto, analogia ilustrada); destaques variados; trocas de cena na batida da trilha. Usar em todo vídeo narrado com motion feito em After Effects, HyperFrames ou Remotion, antes de escrever as cenas e de novo antes de renderizar."
---

# Motion narrado: a cena se constrói pela fala

**Resumo:** regras para montar motion sobre a narração: nada antes de ser dito, legenda com tempo de leitura, um elemento real ou uma metáfora por ideia, trocas de cena depois da fala. Vale para todo vídeo narrado, com acabamento no After Effects pela ponte MCP que acompanha o TUIFT Code (partes podem vir do HyperFrames ou do Remotion). Para vídeo de produto ou demo de software, some o padrão da skill [animacao-saas](../animacao-saas/SKILL.md), com a fala no lugar da batida. Números de áudio em [animacao-saas/references/numeros-de-referencia.md](../animacao-saas/references/numeros-de-referencia.md#áudio).

As regras nasceram do retorno de revisão de um Reel explicativo narrado sobre anúncios em IA, em duas versões. A ideia de base é a **legenda viva**: a frase aparece palavra por palavra, no tempo da fala, e dá tempo de ser lida.

Todo vídeo cria a identidade a partir do assunto (fonte, cores, ícones, componentes e transição do produto ou site em pauta) e passa pela revisão de quadros e de áudio. Antes de começar, siga a skill [video-referencias](../video-referencias/SKILL.md) e, para escolher o visual, proponha 3 direções em quadros parados (as mesmas cenas nas três) para a pessoa escolher antes de animar.

## Regra 1: nada aparece antes de ser dito (sem spoiler)

Cada elemento entra **no momento da palavra que o justifica** (até cerca de 0,15 s antes, nunca segundos antes). A cena começa vazia ou só com a legenda e vai se montando.

| Errado | Certo |
|---|---|
| card do Google Ads visível desde o início da cena | o ícone do Google nasce quando a voz diz "Google", com uma animação própria. Quando diz "Google Ads", ele voa para o cabeçalho e o card se monta |
| site velho já na tela em "Se o seu site…" | o site entra quando a voz diz "site" |
| três passos esmaecidos antes de serem citados | cada passo entra quando é falado; antes, um risco na cor de acento ilustra "de ponta a ponta" |

**Como aplicar:** antes de animar, escreva a tabela `palavra → tempo (da transcrição com tempo por palavra) → elemento que entra`. Revise a folha de contato procurando qualquer elemento que apareça sem ter sido falado.

**Exceção:** o herói da cena (por exemplo, o celular onde a ação acontece) pode estar na tela desde a abertura em íris, desde que a voz já esteja falando dele.

## Regra 2: legenda que dá tempo de ler

- Frases de 4 a 9 palavras, em até 2 linhas definidas à mão. Trechos de 1 ou 2 palavras trocando sem parar somem antes de serem lidos.
- **Tempo mínimo de leitura:** cada frase fica pelo menos 0,6 s depois da última palavra entrar. A próxima espera a anterior sair; pode atrasar até cerca de 0,5 s em relação à fala, nunca adiantar. Em lista rápida (nichos, itens), leitura 0.
- Sem quebra automática: a fonte encolhe para caber, o que garante que o texto nunca vira uma terceira linha escondida atrás do celular.

## Regra 3: destaque sem marca-texto e sem repetição

- **Proibido:** marca-texto (faixa de cor atrás da palavra). A máscara e a íris o cortavam, e ficava repetitivo.
- **Padrão:** a palavra-chave muda de cor (um verde-oliva escuro no fundo claro, a cor de acento no fundo escuro) e sobe um peso. No máximo uma por frase.
- **Varie** quando o destaque importa: logo oficial dentro da linha, um elemento que nasce da palavra (o G do Google), um contador, um anel na cor de acento no card. Não repita o mesmo recurso em cenas seguidas.

## Regra 4: elemento real e metáfora para cada ideia

- **Lugar real pede print real.** "Negócio local" pede o mapa de verdade: captura do navegador sem janela, com a cidade selecionada e o limite tracejado. Por cima vão marcadores de **negócios reais** (de uma coleta de dados, posicionados por projeção Mercator com o mesmo centro e zoom; confira plotando todos os pontos antes). O "sua empresa" é o único pino na cor de acento. O card de resultado ("1º Sua Empresa · ★ 4,9") fecha a ideia de "primeiros resultados".
- **Analogia do público pede a ilustração dela.** "Mais lerdo que fila no posto de saúde" pede o posto: o logo oficial do sistema, uma foto realista de fila (pessoas de costas, sem texto legível, gerada com um gerador de imagem) e um painel de senha em LED vermelho com "tempo de espera: 4 horas". Uma senha genérica não comunica a piada.
- **Logo, ícone e SVG de site:** extraia pelo próprio navegador (uma extensão de exportar SVG ou o código da página). Logos de terceiros só identificam o assunto, nunca aparecem como parceiros.
- Cada frase falada deve ter uma tradução visual literal. Se a frase não tem elemento, a legenda sozinha precisa bastar.

## Regra 5: música, efeitos e batida conversam

0. **Trilha:** música real, que a pessoa tem direito de usar, em remix cinematográfico; nunca repete a do vídeo anterior. Se houver uma skill de composição de trilha no projeto, use-a para a trilha e as viradas. Narração seca (sem eco), música abaixando sob a fala e seguindo o vídeo inteiro. A abertura cinematográfica é única por vídeo e entra em tutorial, vídeo de resultado e anúncio startup; a fala vem depois dela, nunca por cima. Em vídeo informativo rápido, a narração começa logo.
1. Meça a trilha pelo grave com um detector de batidas (por exemplo, `beat_this` ou `librosa`) a 30 qps e marque as batidas na linha do tempo do After Effects.
2. A íris abre no bumbo (início da cena = bumbo + 0,3 s).
3. A parada da trilha cai na virada do roteiro (adiante ou atrase a música).
4. A trilha abaixa cerca de 4 dB sob impactos.
5. Um efeito por elemento que entra (o G nasce: pop; o card monta: whoosh; o passo entra: deslize; o recorte da fila entra: whoosh mais tique-taque).
6. Confira os cortes contra as batidas do render; meta de 70% ou mais dos cortes na batida.

## Regra 6: acabamento

- Nada atrás do celular ou de outro herói: legenda no topo, herói a partir de cerca de 24% da altura do quadro.
- Nenhum efeito cortado no meio por uma transição: um destaque só começa se tiver tempo de terminar antes da saída da frase ou da íris.
- Cenas escuras só de texto podem respirar (até cerca de 1 s antes da primeira palavra); cenas claras não abrem vazias por mais de 0,3 s, a não ser que o elemento ainda não tenha sido dito (Regra 1).

## Regra 7: recursos de acabamento estilo Apple/SaaS

Câmera que acompanha a ação, mão-cursor com ondas, transição de pontos (2 ou 3 viradas grandes, não em todas), pino com foto e radar, pilha de palavras, Dynamic Island, logo por traço, fundo pastel, contador com rolagem, onda com pílulas: [references/recursos-de-acabamento.md](references/recursos-de-acabamento.md). Abra ao escolher o destaque de uma cena, um clique, um mapa ou a revelação da marca.

## Regra 8: retorno de revisão de um anúncio de produto no estilo showreel

- **Troca de tela só depois da fala.** Uma cena nova só começa depois que a última palavra da frase anterior terminou (fim da palavra mais cerca de 0,06 s; a malha de pontos cobre a tela cerca de 0,45 s antes do corte, então o corte vai para fim mais 0,48 s). Só então ajuste para a batida mais próxima, se estiver a até 0,2 s.
- **Legenda palavra por palavra com máscara:** cada palavra sobe de dentro de uma caixa com `overflow: hidden` (de 100% para 0, com leve desfoque). Palavra flutuando com desfoque e deslocamento livre não combina com o estilo.
- **Não reaproveite vídeo de pessoa feito para outra situação.** Para emoção, um emoji em SVG que muda com a fala (neutro, bravo, vermelho com vapor) funciona melhor. Para pessoa real, gere UGC novo: uma foto estilo selfie de celular com um gerador de imagem (ele costuma desenhar uma interface falsa de story, que precisa ser recortada) e anime a foto com um gerador de vídeo; gaste créditos de geração só com a autorização da pessoa.
- **Elemento que a câmera segue e que se transforma:** um ponto na cor de acento viaja entre telas reais da empresa, num "mundo" maior que a tela; cada tela acende quando ele chega, e no fim a câmera abre para mostrar tudo. Um cartão genérico com nós e chips fica amador.
- **Ilustre o conceito, não liste.** "Gargalo" é um fluxo de processo que trava: clientes chegando e se acumulando numa etapa, contador subindo, carregamento que para, etiqueta "travado".
- **Transição suave:** a cena nova entra por cima, saindo do desfoque (de 22 px para 0) e da escala 1,08 para 1, em 0,85 s. A cena antiga **continua opaca**, só desfoca e encolhe; se as duas ficarem semitransparentes, o fundo aparece como um véu cinza.

## Checklist antes de renderizar

- [ ] Tabela palavra → elemento escrita; nenhum elemento antes da palavra.
- [ ] Legenda: frases de 4 a 9 palavras, no máximo 2 linhas, leitura mínima, nada atrás do herói.
- [ ] Nenhum marca-texto; destaques variados.
- [ ] Cada analogia ou lugar citado tem imagem real ou ilustração clara.
- [ ] Trocas medidas contra as batidas da trilha.
- [ ] Cliques mostrados com mão-cursor; câmera fecha nas ações pequenas; no máximo 3 transições de pontos.
- [ ] Quadros revisados (folha de contato e recortes ampliados), procurando spoiler, texto escondido, efeito cortado e tela vazia.
- [ ] Nenhuma troca de tela antes do fim da frase; nenhum vídeo reaproveitado fora do contexto original.
- [ ] Comparado lado a lado com a melhor referência do mesmo tipo: está melhor no conjunto? Se não, ainda não está pronto.
