# Rota: telas de apps encadeadas no ritmo da música

Sequência vertical de telas de apps do celular (alarme, calendário, mensagens, fotos, música, mapa, ou as telas de uma loja ou produto) em que cada tela se transforma na seguinte, no tempo de uma música, sem narração. A técnica é recriar cada tela com camadas nativas por cima de uma captura-guia e animar só os pais do grupo. Numa loja, cada cena vira uma tela do cliente: pedido, pagamento, rastreio, calendário de lançamento.

## Esqueleto

| Item | Valor de partida |
|---|---|
| Comp | 1080 × 1920, 30 qps, duração da música; uma precomp por cena e as transições na comp que contém as duas cenas |
| Fundo | sólido claro; a primeira cena pode ser escura e virar o claro por transição circular |
| Fontes | a fonte do sistema do app recriado, ou uma aberta de desenho próximo, instalada antes |
| Cores | as do app recriado, amostradas na captura (com PIL), não de memória |

## O princípio

1. **Captura como guia** numa camada desligada.
2. **Cada elemento recriado por cima** como camada (texto e forma) nas posições da captura. Ícones difíceis saem da própria captura por máscara retangular, uma camada por ícone.
3. **Um pai controla o grupo:** a linha separadora de cada item, o null do calendário, a pílula de um modo de foco, o primeiro cartão de um carrossel.
4. **Animação só no pai**, com a curva de entrada de [curvas-e-molas.md](curvas-e-molas.md); escalonamento de 2 quadros entre linhas e miniaturas e 3 entre itens de uma pílula.

## Técnicas que se repetem (catálogo)

- **Linhas que entram em cascata:** cada item é filho da linha, com "Shy"; a linha entra de fora da tela (+1100 px) em cerca de 1 s, com 2 quadros de diferença de cima para baixo.
- **Zoom por null:** um null pai de tudo escala de 100 a cerca de 316% e leva o elemento-alvo ao centro, em cerca de 1,9 s, com a curva de entrada. Desligue o desfoque de movimento nessa cena.
- **Transição circular por matte:** a precomp da cena anterior com track matte alfa num círculo que vai de 3000% a 100% até o tamanho do elemento da cena seguinte. A borda macia vem de Gaussian Blur de 6 no matte (com matte a 3000% o desfoque cresce junto e some quando o círculo assenta). A cor da cena nova nasce por opacidade devagar (cerca de 0,25 s) e o número ou texto só aparece depois.
- **Zoom em três fases:** segura (100 para 118% em 0,32 s), salta (118 para 280% em 0,25 s, curva 55/45) e assenta (280 para 330% até 1,3 s). O foco do zoom é um ponto entre os dois elementos que importam; uma fórmula que mistura "ponto parado" com "ponto no centro" evita o salto.
- **Foco no zoom:** camada de ajuste com Gaussian Blur de cerca de 14 (Repeat Edge Pixels ligado) e máscara elíptica invertida com pena de 380: centro nítido, redor suave.
- **Cartão que vira pílula:** tamanho do retângulo, arredondamento e cor animados em cerca de 14 quadros; animar o Size (não a escala) mantém os cantos redondos. Depois corte a camada e comece uma nova no destino.
- **Saída radial do que sobra:** cada elemento sai a 420 px do centro, no espaço do null, com a curva de saída, um quadro de atraso por grupo.
- **Tipografia entrando:** palavras entram pelos lados; a última, em cinza e girada 6°, pisca 100/0/100/0/100 com um quadro cada (hold). Uma frase gigante (escala de 400 a 440%, âncora na primeira palavra) com Gaussian Blur de 28 para 0 em 8 quadros encolhe até 100% sob uma pílula que serve de matte.
- **Balões de mensagem em 3D:** a comp da tela é plana (fundo, captura, balões nativos que sobem 8 quadros a cada mensagem). Na comp 3D a tela entra com Y Rotation de −80 para 0 e uma câmera de dois nós aponta para cada balão, parando a 55% do caminho entre o centro e o balão para o balão não cortar. A câmera humanizada tem chicote de cerca de 8 quadros entre mensagens, deriva contínua de 40% do deslocamento e tremida lenta no null pai (`wiggle(0.5, 18)`).
- **Cartões em cadeia (fotos, vídeos):** parentesco em cadeia com 1000 px entre eles, e só o primeiro cartão anima. Miniaturas a 8% com Time Remap de uma chave (quadro congelado) sobem 420 px, 2 quadros entre elas. Cantos por máscara de retângulo arredondado.
- **Letra que sobe linha a linha:** o texto sobe uma linha (por exemplo 74 px) em 0,25 s e uma máscara com pena 80 desce uma linha em 0,2 s, nos mesmos tempos, destacando a linha atual.
- **Mapa "lanterna":** leque largo (±640 px a 1300 px do ícone) como matte, com Gaussian Blur 30; máscara elíptica que abre do ícone (raio 40 para 1650 em 9 quadros, pena 700); segunda máscara em Intersect cortando a interface do app que vem na captura; feixe azul curto, só perto do ícone.

## Apresentação em cartão 3D

Para o "visual de prévia" (celular inclinado com sombra), una a comp final como camada 3D a cerca de 86%, com máscara de cantos arredondados (raio 76) e Drop Shadow (32%, 46 px, suavidade 170) sobre um Gradient Ramp radial claro. Y Rotation de −15° para −9°, X Rotation de 6° para 3° ao longo do vídeo, `wiggle` lento (0,1 a 0,12 Hz) e uma câmera com profundidade de campo (foco no plano do cartão).

## Texto com acabamento

Degradê vertical (Gradient Ramp com o texto como matte), cópia branca borrada por baixo como brilho, palavra preenchida com a própria filmagem (segunda instância da precomp de vídeo ampliada a 165% com matte do texto, mais sombra preta e halo branco por baixo). Itálico pesado por `fauxItalic` quando a fonte não tem a itálica. Legendas ficam fora da precomp do vídeo, filhas do cartão por `setParentWithJump`.

## Construção por script

Um único construtor `.jsx` rodado por `eval.run` é mais confiável que centenas de operações soltas: reconstrua do zero (`project.new` e script) a cada correção, para o script ser a fonte da versão salva. Funções úteis: aplicar chaves com `KeyframeEase` e tangentes espaciais zeradas (caminho reto), criar texto com âncora no centro via `sourceRectAtTime`, montar máscaras arredondadas com tangentes de 0,5523 × raio, e `setTrackMatte` desligando a camada matte. Meça antes de posicionar: posições de ícones nas capturas com PIL (linhas e colunas diferentes do fundo) e cor de fundo amostrada. Alinhe a música à peça de referência, se houver, por correlação do envelope de áudio.

## Armadilhas desta rota

- Captura com margem transparente (conversa) deixa a cena 3D mostrar o que está atrás: ponha um sólido na comp da tela e matte nos balões.
- Gravação de tela com barra preta e alça no topo: a máscara começa abaixo delas.
- Filmagem com tarjas de cinema: recorte só a área ativa. Confira o primeiro quadro do trecho escolhido.
- Meça largura de texto com uma camada temporária e `remove()` antes de montar balões.
- Se um script falhar ao iniciar o `aerender`, rode o render de novo: ele refaz só os trechos que faltam. Conte trechos e quadros antes de juntar.
