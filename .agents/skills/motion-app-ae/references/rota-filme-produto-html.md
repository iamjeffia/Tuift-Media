# Rota: filme de produto em HTML determinístico

Filme horizontal de 15 a 20 s feito só com HTML e um navegador sem janela: palco arredondado, interface de app recriada, uma capa ou produto que atravessa as cenas e a marca no fim. Um `apply(t)` posiciona tudo a partir do tempo absoluto, o render sai a 60 qps com subquadros (desfoque de movimento) e a revisão é feita em três passadas. O HTML é a fonte editável e não passa pelo After Effects.

## Quando usar

- Pedido com linha do tempo por segundo, interface de app, capa ou produto que muda de papel entre cenas e fecho de marca.
- Quando o pedido exige `seek(t)` reprodutível, 60 qps reais ou subquadros.
- Se a peça pedir acabamento do After Effects (3D com modelo, efeitos nativos), use as outras rotas.

## Arquitetura (arquivo único `html/index.html`)

1. **Palco:** um `#stage` de 1536 × 810 no centro do quadro, com `clip-path: inset(0 round 44px)` cortando tudo que passa da borda (capa gigante, câmera). A sombra fica num div irmão atrás, porque o `clip-path` cortaria a sombra.
2. **Tudo em coordenadas do palco.** Uma função `place(el, {x, y, w, h, s, r, rx, ry, z, o, blur})` posiciona pelo centro. Nas capas, defina tamanho por `width/height` e não por `scale`: texto e SVG ficam nítidos em qualquer tamanho.
3. **Tempo absoluto:** `apply(t)` recalcula cada propriedade; sem `transition`, `animation`, timers ou estado acumulado. `window.seek = async t => { apply(t); await frame }`; `window.ready` espera fontes e `img.decode()`.
4. **Ferramentas de movimento:** `tw(t, t0, dur, ease)`, `kf(t, [[t, {props}, ease], …])` (a chave herda o que não muda), `bez()` igual ao `cubic-bezier` do CSS, uma mola crítica sem ultrapassagem (`crit`), uma mola suave com cerca de 2% de ultrapassagem só para chegadas de marca (`soft`), `out` (expo) e `in` para saídas.
5. **Texto com máscara de linha:** entra de baixo em 0,5 a 0,6 s (expo) e sai por cima em 0,14 a 0,2 s. A saída termina antes da próxima entrada no mesmo lugar.
6. **Câmera de um grupo:** `cam(t)` devolve escala, foco e alvo, e `w2s()` converte mundo em palco. A janela do app recebe `translate · scale · translate` e uma inclinação de entrada (`perspective rotateX` em torno da base).

## Transferências sem emenda

- **Troca de elemento parado:** o que está dentro de um grupo inclinado (identidade, player, capas) é trocado por uma cópia no palco no instante em que o grupo está plano e parado, na mesma posição calculada.
- **Uma capa herói só** do resultado de busca até o zoom: miniatura, capa, bloco, ocupar o quadro cortada pelo palco, condensar dentro das letras. Nunca duas capas diferentes para o mesmo objeto.
- **A cor da marca nasce do botão:** um círculo cresce a partir do botão de ação (raio inicial igual à metade da altura do botão); o escuro volta crescendo a partir da capa no momento forte.
- **Arte dentro das letras:** na saída do zoom, o título entra em escala 2,5 com a capa como `background-clip: text`, a capa de fundo some com desfoque e as letras ganham cor em 0,4 s.
- **Marca que não encosta no ícone:** a borda esquerda do recorte do nome é `max(início da palavra, borda direita do ícone + 22 px)`; a revelação é uma cortina com borda macia (`mask-image` em gradiente de 80 px).
- **Nada para morto:** a capa grande deriva enquanto espera, o ícone respira (+6%), um grupo de capas em 3D orbita (±5°) e flutua com a mesma onda defasada.

## Mapa de tempo na batida

Anime no tempo que a cena pede. Depois, uma tabela `WARP = [[saída, animação], …]` leva cada evento à batida ou colcheia medida da música, com curva monotônica (Fritsch–Butland) para não haver degrau de velocidade, e `apply(warp(t))` no HTML. O script de áudio lê a mesma tabela e inverte a curva para pôr cada efeito no lugar. Meça antes e depois: no filme de origem, de 25 eventos, 7 ficavam a até 60 ms da batida antes do mapa e 20 a até 30 ms da colcheia depois, com variação de velocidade de no máximo ±25% entre âncoras. Âncoras muito próximas com deslocamentos opostos geram trechos lentos demais: mantenha a razão entre intervalos entre 0,75 e 1,25 e refaça a conferência depois de mexer em qualquer tempo.

## Render

Um script de render (por exemplo com `playwright-core`) abre o HTML num Chrome sem janela e captura com `Page.captureScreenshot` (`optimizeForSpeed`). Com 4 subquadros centrados no instante e cobrindo meio intervalo (obturador 0,5), o ffmpeg recebe 240 qps e faz `tmix=frames=4` mais `select` 1 em 4, resultando em 60 qps reais. Intermediário em ProRes 422 HQ, final em H.264 CRF 16 com etiqueta BT.709. Tempo medido: cerca de 0,07 s por captura; 18 s com 4 subquadros levam cerca de 5 minutos; a prévia sem subquadros, cerca de 80 s.

Render em trechos (quando o ffmpeg ficar sem memória ou o Chrome travar com outras sessões): trechos de 2 s, navegador novo por trecho, limite de 20 s por captura e por `seek`, até 3 tentativas e junção com `concat -c copy`. Trecho pronto é pulado: depois de uma correção, apague só os trechos afetados (com mapa de tempo, converta o intervalo para tempo de saída). O `seek` não deve esperar `requestAnimationFrame`, que trava com a aba em segundo plano; a captura já força o quadro.

**Estroboscópio dos subquadros:** com 4 amostras, um objeto que anda mais de cerca de 60 px por quadro vira 4 cópias em degrau. Encurte o chicote e use desfoque direcional SVG (`feGaussianBlur stdDeviation="X 0"`) proporcional à velocidade só durante o movimento rápido. Zoom de escala não sofre disso.

## Revisão em três passadas

1. **Quadros parados:** 72 quadros a 4 qps em folha de contato mais recortes em tamanho real dos momentos-chave.
2. **Movimento:** prévia sem subquadros e folhas a 15 qps só nas transições.
3. **Olho externo:** um modelo de visão (quadros mais medição de áudio) com a pergunta "onde o movimento parece robótico, para morto, embola, pisca ou vira dissolução barata". Desconfie de leituras em baixa resolução: ele pode "ver" erro que era só uma máscara entrando.

## Som

Uma família de efeito por ação: pop para entrada, clique para botão, digitação procedural para campo, whoosh com passa-baixas de 7 a 9 kHz para troca de tela, whoosh mais impacto para o momento forte, um tom no tom da música para a marca. Posicione o pico de cada arquivo no evento (`t − pico`), some um pulso grave nas batidas da intro que respira antes do momento forte e normalize em duas passagens (-14 LUFS). Confira que os efeitos ficam abaixo da música (mediana de cerca de 17 dB abaixo, o mais alto a 7 dB). Ver [som-e-mixagem.md](som-e-mixagem.md).

## Armadilhas

- `visibility: visible` num filho vence o `hidden` do pai: esconda contêineres com `display: none`.
- `filter` (inclusive `drop-shadow`) num cartão 3D achata o `preserve-3d` e o verso vira espelho da frente: sombra como `box-shadow` em cada face.
- Imagem dentro de uma face precisa de `width/height: 100%` e `object-fit: cover`.
- `kf` sem herança de propriedades zera a opacidade antes da hora.
- Máscara de linha com `padding` em `em` herda o tamanho do pai: use px em elementos montados à mão.
- Mapeamentos lista para faixa devem respeitar a ordem (de cima para baixo vira da esquerda para a direita), senão as capas se cruzam.

## Variante com HyperFrames ou Remotion e técnicas extras

A mesma ideia de `apply(t)` funciona em HyperFrames (um relógio que chama `render(t)` a cada atualização, para DOM, canvas e WebGL saírem do mesmo `t`) e em Remotion (mola por chave, folha de batidas, câmera por chaves `[t, x, y, zoom]`). Técnicas que somam:

- **Fontes antes da timeline:** registre a timeline só depois de `document.fonts.load` de cada peso; meça o DOM (`getBoundingClientRect`) depois de aplicar todas as transformações do mesmo `t`, ou no build.
- **Canvas 2D** para partículas, gráficos e formas: um `render(t)` só, pontos desenhados em lote por cor, física em passo fixo de 1/240 s com estado em `Float32Array` recomeçando do zero se o tempo voltar; desfoque por subamostras dentro do canvas evita capturar a 240 qps.
- **Especificação por tabela:** `kf(quadro, [[f, valor]…])` com cúbica monotônica e desfoque proporcional ao módulo da derivada, separado em X e Y.
- **Câmera que mergulha num ponto:** `transform-origin: 0 0` com `{scale: s, x: 960 − s·cx, y: 540 − s·cy}` e o mesmo foco nas duas pontas; para trocar de foco, um pan curto antes do zoom.
- **Tela dentro da tela (efeito Droste):** `Z = largura_do_quadro / largura_da_tela`, ponto fixo `f = Z·origem/(Z−1)`, escala `Z^p`; a cena de dentro roda ao vivo pelo menos 1 s antes; moldura e vidro numa camada acima da filha.
- **Abertura de app:** o ícone vira um retângulo que cresce até a tela (mola de interface), o corpo do telefone aparece em volta e a cena anterior sai por máscara radial nascendo do ícone, com o retângulo voando numa camada própria acima.
- **Vidro líquido em WebGL:** campo de distância de caixas arredondadas e letras de canvas borrado, unidos por smooth-min (k ≈ 26 px), refração cromática com R, G e B ligeiramente diferentes; a força do vidro vai a 0 antes de a forma sumir.
- **Pegadinhas:** `clip-path: inset()` com lados iguais é encurtado pelo navegador e o GSAP interpola errado; use `isolation: isolate` em toda cena para o `z-index` de um filho não escapar; texto DOM escalado acima de cerca de 10x trava a GPU (zoom em letra vai para o canvas); o lint do HyperFrames exige o script inline.
