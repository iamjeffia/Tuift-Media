# Regras detalhadas, com números e exemplos

Método reescrito a partir de ideias de Kole Jain sobre conceitos de UI/UX (seções 1 a 11) e de práticas de movimento sutil (seção 12). Os números são pontos de partida; o sistema visual do projeto prevalece.

## 1. Affordances e signifiers

- **Affordance:** o que o elemento permite fazer. **Signifier:** a pista visual que comunica isso.
- Exemplo: três pares ícone + texto (Drinks, Food, Dessert). Contêiner em pílula em volta de dois = relacionados. Pílula branca com sombra leve num deles = selecionado e alternável. Texto cinza claro = inativo.
- Se a interface sinaliza bem, ela dispensa instruções escritas.
- Signifiers obrigatórios: estado pressionado do botão, destaque do item ativo na navegação, hover, tooltip em ícone sem rótulo.

## 2. Hierarquia visual

- Ferramentas: **tamanho, posição, cor**. Hierarquia é contraste: pequeno × grande, colorido × neutro.
- Antes: card com 7 linhas rótulo/valor iguais (Restaurant, Item, Day, Time, Deliver To, Pickup From, Total Cost) = parece planilha, não design.
- Depois:
  - logo/imagem no topo esquerdo (imagem facilita escanear, como as fotos dos carros no Uber);
  - item principal ao lado, maior e em negrito;
  - dia e hora juntos numa linha menor e cinza ("Today 9:30am");
  - preço no topo direito, alinhado à direita, em azul (único destaque de cor);
  - origem e destino com ícones de pino e linha, menores, sem rótulos "From/To".
- Variante com foto grande no topo também é válida: não é ciência exata. Fixos: mais importante perto do topo; maior e com cor = mais importante; imagens sempre que possível.

## 3. Grade, layout e espaçamento

- Grade de 12 colunas e "exatamente 8px" são guias. Landing personalizada pode não alinhar a coluna nenhuma.
- Para conteúdo estruturado e repetido (galeria, blog, cards): 12 colunas no desktop, 8 no tablet, 4 no celular.
- Mais importante que grade: **espaço em branco** (deixar as coisas respirarem).
- Exemplo de seção (hero escuro "Detailed Analytics"):

| Elemento | Fonte | Altura de linha |
|---|---|---|
| Título | 64px | 72px |
| Subtítulo | 20px | 28px |
| Selo/anúncio | 16px | 20px |
| Botão | 14px | 18px |

- Espaçamento: 32px entre todos os itens; 16px entre itens que andam juntos (selo + título, ou título + subtítulo). Agrupar por proximidade é outra forma de hierarquia.
- Sistema de 4 pontos: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40px. Motivo: dá para dividir ao meio sem frações (1x, 0.5x, 0.25x), o que mantém consistência.

## 4. Tipografia

- Design é, em boa parte, texto.
- Uma família por design. Sans-serif. As que o autor usa: DM Sans, Axiforma, SF Pro, Geist, Plus Jakarta Sans, Montserrat, Unbounded. Não gaste tempo escolhendo fonte.
- **Texto grande:** espaçamento entre letras −2% a −3% (CSS: `letter-spacing: -0.02em` a `-0.03em`) e altura de linha 110–120% (`line-height: 1.1`–`1.2`). Faz qualquer texto grande parecer profissional na hora.
- Landing e site: até 6 tamanhos, amplitude grande. Exemplo: H1 64 · H2 42 · H3 32 · H4 20 · H5 16 · H6 14px.
- Dashboard: amplitude encolhe por densidade de informação; normalmente nada acima de 24px. Exemplo: 24 · 20 · 18 · 16 · 14 · 12px.

## 5. Cor

- Comece com **uma cor primária** (em geral a da marca).
- Clareie para fundos e escureça para textos (ex.: card lilás claro com título roxo escuro e botão roxo). Isso já é meia **rampa** (50, 100, 200 … 900, 950), usada para chips, estados (padrão, hover, clicado, desabilitado) e gráficos.
- Deixe a cor achar você: cor onde tem função (barra de anúncio, foco no campo, chip "New" verde).
- Semânticas: **azul** confiança/informação/foco · **vermelho** perigo, erro, urgência · **amarelo** aviso · **verde** sucesso, novo.
- Cor serve a um propósito, não só a decoração.

## 6. Modo escuro

- Borda clara em card escuro = contraste demais; abaixe até quase sumir.
- Sem sombra para dar profundidade: a superfície mais alta é **mais clara** que o fundo (camadas empilhadas, a de cima mais clara).
- Chip brilhante (verde-menta com texto escuro) → fundo escuro dessaturado da mesma cor e texto claro dessa cor.
- Fundo escuro pode ser roxo, vinho ou verde profundos, não só cinza ou azul-marinho.

## 7. Sombras

- Ferramenta do modo claro. A maioria é forte demais: **menos opacidade, mais desfoque**.
- Força depende de frente e fundo: card pede pouca; o que fica por cima de outro conteúdo (popover, menu, modal) pede mais.
- Sombra interna (brilho na borda de cima) + externa (embaixo) = botão em relevo, tátil.
- Se a sombra é a primeira coisa que se nota, ela está errada.
- Ponto de partida em CSS (nosso, não do vídeo): card `0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .06)`; popover `0 4px 12px rgb(0 0 0 / .08), 0 16px 40px rgb(0 0 0 / .12)`.

## 8. Ícones e botões

- Ícones costumam ser grandes demais. Regra: **ícone = altura de linha do texto** (texto 15px / linha 24px → ícone 24px) e aproxime o texto.
- Link de sidebar = **ghost button** (sem fundo até o hover). Isolado e centralizado vira botão secundário, comum ao lado do primário: CTA primário e secundário lado a lado.
- **Padding: horizontal = 2× vertical** (ex.: 16px em cima/embaixo, 32px nas laterais). Com ou sem ícone.

## 9. Feedback e estados

- Quando a pessoa faz qualquer coisa, deve haver uma resposta.
- Botão: padrão, hover, ativo/pressionado, desabilitado; carregando (spinner no lugar do ícone) quando houver espera.
- Campo: foco (borda azul), erro (borda vermelha + mensagem que diz o problema: "Digite um e-mail válido"), aviso (borda amarela + saída: "Este e-mail já existe. Entrar?").
- Em toda parte: spinner ao buscar, barra de progresso com tempo restante, confirmação ao terminar, animação no scroll/arrasto.

## 10. Microinterações

- Feedback "a notch" acima. O botão de copiar com hover e clique ainda deixa a dúvida; um chip "✓ Copied!" que sobe confirma.
- Vão do prático (confirmar ação, mostrar disponibilidade) ao divertido (confete ao acertar um atalho, transição orgânica entre telas).

## 11. Overlays

- Texto branco direto sobre foto clara some. Camada escura na foto toda tira a vida da imagem.
- **Gradiente linear** transparente em cima e escuro atrás do texto: a foto fica viva e o texto legível.
- Acabamento extra: desfoque progressivo por cima do gradiente.

## 12. Animações sutis em cards e elementos interativos

Toda interface leva animações sutis em cards e elementos interativos. Valores de partida:

- **Card que sobe:** no hover, `transform: translateY(-2px)` + `box-shadow: 0 8px 24px -16px rgba(0,0,0,.25)`; transição `transform .16s ease, box-shadow .16s ease`. Sombra larga, com spread negativo, quase invisível em repouso.
  - **Só onde tem propósito (critério de Emil Kowalski):** o card sobe quando é clicável e leva a algum lugar (produto, categoria, marca, banner). Card informativo, número de painel, linha de lista e qualquer superfície usada dezenas de vezes por dia ficam parados. Hover sempre dentro de `@media (hover: hover) and (pointer: fine)`, porque no celular o toque dispara hover falso.
- **Toque:** ripple de 10% de preto no clique dos cards.
- **Link de texto:** cor escurece (ex.: `#333` → `#000`) + sublinhado com `text-underline-offset: 3px` no hover.
- **Seleção (tamanho, filtro, aba):** hover clareia o fundo; selecionado vira a cor de destaque com texto branco.
- **Entrada:** blocos sobem 2em com opacidade 0 → 1; carregamento com skeleton em brilho que corre (cinzas claros como `#eee`/`#f5f5f5`); selo de "novo" com pulso (`scale 1 → 2.4`, opacidade .7 → 0).
- **Setas e pontos de carrossel:** transição de `opacity` e `color` em 0,5 s.
- Duração curta (0,16 s nos cards, até 0,3 s em gavetas). Nada balança, gira ou chama atenção sozinho fora de carregamento.

Junto das animações, funciona bem: fundo da página em cinza muito claro (ex.: `#f5f5f7`) com seções brancas de raio 20 px bem separadas, espaçamento generoso e componentes maiores que o comum (CTA de compra em largura cheia).
