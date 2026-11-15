# Design caro × barato: decidir fácil, não só parecer limpo

**Resumo:** método reescrito a partir de ideias da uxpeak sobre o mesmo app desenhado em níveis diferentes de experiência, em dois casos (lista de restaurantes e filtro de imóveis). O "caro" não está no enfeite: está em imagem com espaço, hierarquia que deixa escanear, controles que mostram a consequência e interface que pergunta o que a pessoa sabe. Os números são pontos de partida; o sistema visual do projeto prevalece.

## A. Card e lista (caso 1: app de comida)

| # | Barato | Caro | Medida de partida |
|---|---|---|---|
| A1 | Logo da loja como imagem | Foto do produto consumido | o logo diz quem vende; a foto diz o que a pessoa vai comer |
| A2 | Miniatura de 56 pt à esquerda | Foto como o maior elemento do card | 56 → 172 pt (3×) em grade de 2 colunas → 353 pt em largura total; nunca menos de ~80 pt quando a imagem vende |
| A3 | Encher a primeira dobra (6 itens ilegíveis) | 1 a 4 itens bonitos e completos | hoje todo mundo rola a tela |
| A4 | Filtros em 2 dropdowns com 17 opções escondidas | 3 a 8 chips visíveis e tocáveis; o resto num sheet | o chip ativo é preto cheio; o toque filtra na hora |
| A5 | Título 13 pt e metadado 11,5 pt numa linha cinza corrida com hífens | 3 degraus: título, dado de decisão, apoio | título ~18 pt semibold; nota "★ 4.8" em peso ou cor; apoio cinza; ~4–5 pt entre título e apoio |
| A6 | Cantos de 4 pt misturados com círculos | Uma escala de raio | ex.: campo ~10, foto ~12, card grande ~16, chip em pílula |
| A7 | Cards com borda cinza e vão de 7 pt | Sem borda: separação por espaço; campo de busca preenchido, sem borda | margem lateral ~20 pt; um acento de cor só para estado ativo ou ação |
| A8 | Fotos de categoria brigando com as fotos do feed | Ícones ou ilustrações próprios na navegação | fotos de categoria competem com as fotos do feed |
| A9 | Navegação colorida como o conteúdo | Navegação com saturação menor que o conteúdo | fundo de ícone pastel → neutro bege-claro |
| A10 | Lista sem noção do tamanho | Contador do conjunto ao lado do título | "640 places" em cinza, ~60% do tamanho do título |
| A11 | Uma visualização só | Alternância cards (emocional) × lista (comparar) | sem padrão certo para todos, dê o controle à pessoa |
| A12 | Placeholder "Search Verde" | Placeholder que ensina o escopo | "Search places, dishes or cuisines" |
| A13 | Selos espalhados ou nenhum | Um único selo por tela, com base em dados | "BEST MATCH" em pílula pequena, versal com espaçamento largo |
| A14 | Texto essencial sobre a foto enviada por terceiros | Foto limpa em cima, detalhes embaixo sobre fundo neutro | o card fica igual seja qual for a foto do lojista (padrão do Uber Eats) |
| A15 | Fundo branco puro | Branco quente e cinza quente | ex.: tela `#FBF9F7`, card `#FFFFFC`, texto `#171712` |

## B. Filtros e controles (caso 2: filtro de imóveis)

| # | Barato | Caro | Medida de partida |
|---|---|---|---|
| B1 | "Limpo" porque cada filtro vive numa subpágina (7 toques para 2 filtros) | Todas as decisões ligadas na mesma vista | conte os toques da tarefa comum; filtro curto (≤ 6 opções) mora na tela principal |
| B2 | Filtro em tela cheia que esconde os resultados | Folha (bottom sheet) sobre os resultados | o contexto continua visível |
| B3 | Botão mudo ("Show homes", "Aplicar") | Botão que diz a consequência | "Show 41 homes", "Ver 41 imóveis", "Pagar R$ 239,90", atualizado em tempo real |
| B4 | Cortar elementos para parecer simples | Aceitar elemento que elimina um passo, uma conta ou uma dúvida | parecer simples ≠ decidir fácil |
| B5 | Só slider, ou só campo | Slider para explorar + campos para precisão | os dois sincronizados |
| B6 | Stepper + e − para escolher um número | Opções visíveis (Studio, 1+, 2+, 3+, 4+) | stepper só para ajustar algo que já existe (carrinho, termostato) |
| B7 | Valor exato que corta o 4 quando se pede 3 | "3+" como padrão; modo exato opcional | o rótulo mostra a regra |
| B8 | Opção só com texto | Opção com ícone para reconhecer | tipo de imóvel, categoria, tamanho |
| B9 | Controle que só pede o valor | Controle que mostra o mercado | histograma dentro do slider; barras na faixa em roxo, fora em cinza; mediana ("median $568K") |
| B10 | Bloco sem contexto | Cada seção diz quanto do total ela representa | número forte + total fraco |
| B11 | Pedir o que a pessoa não sabe (preço máximo) | Perguntar o que ela sabe e fazer a conta | entrada + parcela → "Your reach: $708K" marcado no histograma |
| B12 | Opção sem consequência | Contagem em cada opção antes do clique | "11 · 628 · 589 · 459 · 229"; "-230 homes"; opção que dá zero fica visualmente desabilitada |
| B13 | Escolha de um valor só | Seleção por faixa quando se pensa em intervalo | toque em 2 e em 4 = pílula contínua 2–4, com "Clear" |
| B14 | Mais dados = mais caro | Cada dado responde a uma pergunta daquele momento | o que não responde sai ou fica atrás de um toque (detalhe recolhido) |

## C. Como aplicar nos nossos projetos

- **Loja:** facetas de tamanho, marca e preço com contagem por opção; tamanho sem estoque desabilitado; chips de filtro visíveis; botão da gaveta de filtro "Ver 128 pares"; foto do produto como o maior elemento do card; texto do card nunca sobre a foto do fornecedor; um selo por tela.
- **Checkout e carrinho:** o botão diz o total e a forma ("Pagar R$ 239,90 no Pix"); parcelas calculadas a partir do que a pessoa sabe (quanto quer pagar por mês).
- **Painel e dashboard:** cada bloco mostra quanto do total representa; dado que não responde pergunta sai da tela principal.
- **Vitrine de vídeos com formatos misturados:** galeria justificada, com cada vídeo no formato real, sem corte, e a mesma altura na linha (a linha fecha com ou sem o próximo card, o que ficar mais perto da altura-alvo); card com o vídeo limpo e o texto embaixo; no celular, alvo alto o bastante para 2 verticais por linha. Vídeo com texto próprio embaixo não serve de capa com legenda por cima.
- **Tela simulada em vídeo:** as mesmas regras valem; a tela "cara" é o que torna o motion crível.

## D. Checklist rápido (modo Revisar)

- [ ] A imagem que vende é o maior elemento do card (≥ 3× a miniatura)?
- [ ] Há 3 degraus de texto, com o dado de decisão destacado em peso ou cor?
- [ ] Os filtros frequentes estão à mostra, e o resto num sheet sobre os resultados?
- [ ] O botão principal diz a consequência (quantos resultados, quanto vai pagar)?
- [ ] As opções mostram a contagem antes do clique, e as que dão zero aparecem desabilitadas?
- [ ] Os filtros numéricos são "X+" por padrão, com campos junto do slider?
- [ ] A interface pergunta o que a pessoa sabe e faz a conta por ela?
- [ ] O texto de terceiros fica fora da foto? Há um único selo? A navegação é mais quieta que o conteúdo?
- [ ] A escala de raio é uma só, e o espaço faz o papel das bordas?
- [ ] Algum dado na tela não ajuda a decidir? Se sim, sai ou fica atrás de um toque.
