# Rota: app ou SaaS no celular

Vídeo vertical (1080 × 1920, 30 qps, cerca de 20 s) que mostra um app funcionando: um problema, a virada, três ou quatro telas com uma ideia cada, um resultado que conta e o fecho de marca. As telas são capturas reais do app com os destaques refeitos por cima como camadas nativas e editáveis. Cada vídeo muda a identidade (cores, ritmo, telas); o que se repete é a estrutura.

## O que define o estilo

| Elemento | Como é |
|---|---|
| Estrutura | problema no escuro (2 a 3 s), virada para o claro, celular entra, 3 a 4 telas, número ou resultado contando, fecho de marca |
| Celular | corpo nativo (retângulo arredondado escuro com botões laterais), telas dentro por máscara, sombra suave, troca de tela com push de navegação |
| Telas | captura real a 3x como base mais os destaques refeitos por cima, alinhados ao pixel (cartões, balões, selos, números) |
| Câmera | um null faz entrada, zoom no elemento-chave e inclinação final; nenhuma camada é animada por conta própria |
| Destaque | contorno que acende, selo que muda de cinza para a cor do app, balão que pula do canto, contador que roda |
| Texto | legenda grande no topo (60 px, negrito, centralizada, até 3 linhas), entra subindo 30 px e sai subindo 20 px |
| Fecho | celular inclinado 12° de um lado; marca, selo, frase e botão do outro; cursor clicando, anel no clique, rodapé "demonstração com dados ilustrativos" quando os números forem de protótipo |
| Movimento | câmera e transições com influência 70 e velocidade 0; entrada de cartão, botão, balão e notificação com a mola de [curvas-e-molas.md](curvas-e-molas.md) |
| Som | um efeito por ação, abaixo da trilha ou da voz ([som-e-mixagem.md](som-e-mixagem.md)) |

## Construção

1. **Assets.** Capturas do app a 3x (Chrome sem janela, `deviceScaleFactor: 3`, recorte no elemento do aparelho) e a marca em SVG. Confira as fontes com `font.list_missing`.
2. **Uma precomp por tela**, no tamanho da captura (por exemplo 1170 × 2532). Captura como base; por cima, os destaques nativos nas coordenadas da captura. Se medir na imagem reduzida a 924 px de largura, `px_original = px_exibido × 1,266`. Antes de animar, renderize e compare lado a lado com a captura (`scripts/comparar_captura.py`) e ajuste a fonte até casar.
3. **Celular e sequência.** `TELAS_sequencia` (entrada, saída e push) dentro de `CELULAR` (corpo e telas com track matte arredondado), dentro da comp principal com o null de câmera.
4. **Cena do problema, legendas e fecho.** Fundo escuro com Gradient Ramp radial, relógio por slider, notificações; círculo claro que revela; legendas; marca, selo, frase, botão, cursor e rodapé.
5. **Easing em tudo** (`scripts/gerar_easing.py`); cores ficam lineares.

## Destaques nativos sobre a captura

1. Meça na imagem: centro, tamanho e raio dos cantos de cada elemento (raio em CSS × 3).
2. Crie o elemento como forma nativa com as cores do app e o texto por cima, com a fonte do app ou uma substituta; estilos parciais com `text.set_style_range`.
3. Para redesenhar uma área inteira (uma conversa com balões que entram), cubra a captura com um retângulo da cor do fundo e reconstrua os itens.
4. Acabamentos que valem a pena: balão com "canto de cauda" (segundo retângulo no canto do mesmo grupo); aviso com contorno de 7 px que acende depois; selo que acende (cor de preenchimento com chave cinza para a cor do app e um anel que cresce de 100 para cerca de 140% e some); cartão com gradiente (sólido com 4-Color Gradient, cores amostradas da captura, matte de forma arredondada); contador por null `CTRL` com sliders "Valor final" e "Progresso %".

## Celular

- Corpo: grupo de cerca de 1230 × 2592 com roundness alto, preenchimento quase preto e contorno de 6 px um pouco mais claro; botões laterais como retângulos de 16 × 150 e 16 × 250.
- Máscara da tela: o tamanho da tela com roundness de cerca de 150, como matte alfa de `Telas (sequencia)`.
- Sombra na comp principal: opacidade alta, distância 60, suavidade 160, na cor da tinta do app.
- Push entre telas (0,45 s): a que entra vai de x 1755 para 585, a que sai de 585 para 235, com 0,5 s de sobreposição.

## Câmera por null

O `Celular` é filho de um null que anima posição, escala e rotação. Para centralizar um elemento da tela na câmera, calcule o deslocamento do elemento em relação ao centro do celular, `d = (x_tela, y_tela) − centro`, e com escala `s` e alvo `y_alvo` na tela final use `posição_y = y_alvo − s × d_y` (idem para x). Valores de partida: repouso a 53% de escala, zoom no cartão-chave a 85%, fechamento a 46% com rotação de 12°, entrada de baixo com rotação de 12° para 0 em 0,8 s.

## Cena do problema e virada

- Fundo escuro com Gradient Ramp radial; relógio com Source Text por expressão que lê um slider de minutos num null `CONTROLES`. As chaves do slider são lineares para que o horário bata com cada notificação.
- Notificações: cartão escuro de cerca de 920 × 168, raio 44, entram 70 px acima com escala de 94 para 100.
- Virada: uma elipse da cor do fundo claro, de 3900 px, cresce de 0 a 100% em 0,6 s e precisa cobrir os cantos.

## Com narração

A voz dita o tempo e o método visual é o mesmo. Gere e aprove a fala primeiro. Tempo de cada palavra por transcrição com marcação de palavras. Cada troca de tela, zoom e destaque cai no início da palavra que o justifica; o efeito sonoro vai junto da ação, não da palavra. A legenda vira apoio (frase curta com a palavra-chave) e some quando a fala já diz tudo. A duração segue a fala: três a quatro telas por minuto costumam bastar. A voz manda no mix; a trilha sobe nas pausas e no fecho.

## Referência de esforço

Cerca de uma hora de construção para 20 s, mais 15 minutos de som.
