# Método de captura: do vídeo ao render aprovado

**Resumo:** nove etapas: preparar, olhar a 30 qps, medir o fundo, rastrear cada peça com a ferramenta certa, gerar chaves, construir no After Effects, comparar por movimento, corrigir em circuito fechado e iterar por cena com a pessoa. Vem da skill [captura-de-movimento](../SKILL.md).

## Convenções

- **Espaço de medida:** o tamanho e a taxa do original (por exemplo, 720 × 1280 a 30 qps). Se a composição for maior (1080 × 1920), o construtor multiplica por um fator fixo; guarde o fator num lugar só.
- **Tempo e quadro:** o quadro `n` (base 0) está em `n/fps` segundos. Nomeie os arquivos extraídos em sequência (`q0001.jpg`, ...).
- **Caminhos com acento no Windows:** `cv2.imread` falha; use `cv2.imdecode(np.fromfile(caminho, np.uint8), 1)`.
- **Rode os scripts de uma pasta própria**, nunca de `TEMP`: arquivos soltos com nome de módulo (um `av.py` esquecido) quebram imports.

## Etapa 1: preparar

Para cada vídeo, uma pasta com o original, o áudio e todos os quadros:

```bash
ffmpeg -v error -y -i original.mp4 quadros/q%04d.jpg
ffmpeg -v error -y -i original.mp4 -vn audio.wav
```

Se houver fala, transcreva com `faster-whisper` (modelo grande, com tempo por palavra) e guarde uma lista de `{palavra, início, fim}`. Se houver trilha, meça batidas e ataques no instrumental. Uma folha de contato a 4 qps serve só como visão geral. Para ver tudo, monte uma prancha com todos os quadros (30 colunas = 1 s por linha).

Um modelo que assiste a vídeo (por exemplo, o Gemini) ajuda com som e com a estrutura, e a câmera lenta (`setpts=8*PTS`) dá um inventário. Ele erra nos detalhes; confira sempre no quadro.

## Etapa 2: olhar a 30 qps

Antes de medir, veja os trechos com movimento quadro a quadro, em sequências de quadros consecutivos recortadas na área útil. **Para medir coordenada, use o quadro inteiro**: medir y em quadro recortado foi o primeiro erro típico.

Anote quando cada peça nasce e some, os cortes, o que parece mola e o que para. Para detalhe fino, amplie o recorte 3× ou 4× com LANCZOS: é assim que aparecem logos antigos e o desenho de um rabisco.

## Etapa 3: medir o fundo e as trocas de cena

Meça a cor do fundo em três alturas (topo, meio, base) e os pixels mais claro e mais escuro de cada quadro, nos quadros da troca. Interprete antes de supor fusão, clarão ou véu:

- **O fundo muda e o texto segue nítido, sem fantasma:** rampa de cor do fundo com corte seco do conteúdo.
- **O conteúdo some de um jeito suave junto com a mudança:** aí sim é fusão.
- **O pixel mais escuro continua preto com fundo claro:** a cena nova já está por cima, sem véu branco.
- **O fundo não muda (por exemplo, claro para claro):** não há rampa. A saída em grupo é a própria transição; passe a cor fixa e não crie chaves de fundo.

As cores viram chaves da rampa do fundo, só quando o fundo muda.

**Cuidado:** meça a cor numa faixa lateral onde não passa texto. Texto saindo por ali suja a leitura e parece mudança de fundo; se a cor saltar só naqueles quadros, confira o quadro antes de criar chave.

## Etapa 4: rastrear cada peça com a ferramenta certa

| Peça | Ferramenta | Como funciona | Falha quando |
|---|---|---|---|
| Capa, foto, objeto com textura | SIFT mais homografia (`cv2.SIFT_create`, `cv2.findHomography`) contra uma imagem da peça | dá os 4 cantos, centro, largura, altura, rotação e a contagem de pontos que bateram; testando todas as imagens por quadro, acha também a troca | borrão total (poucos pontos batendo), peça lisa |
| Palavra grande sobre fundo liso | limiar mais fechamento morfológico horizontal para achar as palavras no quadro de repouso; depois `cv2.findTransformECC` afim para trás e para frente | segue cada palavra; quadro borrado é repescado desfocando tudo e testando escalas | texto pequeno ou linhas coladas: o ECC deforma (escala x diferente da y, correlação baixa) |
| Palavra pequena ou linhas coladas | casamento de modelo (`cv2.matchTemplate`) testando escalas, em janela de poucas dezenas de pixels em volta da posição anterior | mede posição e escala | peça que gira; não mede rotação nem cor |
| Peça lisa que gira muito (numeral) | máscara por cor; testa rotação e escala em volta do centroide, a partir do repouso, para os dois lados | mede rotação e escala | peça cortada pela borda ou misturada com outra da mesma cor |
| Ícone colorido com partes que giram separadas | centro e escala pelos pixels saturados; ângulo pelo centro de uma das cores; degradê pelo centro de outra | específico: adapte as faixas de cor | ícone sem cor forte |
| Risco colorido (cometa) | maior mancha da cor fora da área do botão: centro, comprimento, reta | | sobreposto a outra peça da mesma cor |
| Tracejado que anda | correlação de uma linha da borda entre quadros, para sentido e velocidade; empilhar a linha no tempo mostra listras inclinadas quando anda | | contraste muito baixo |
| Peça rígida ligada a outra | tire a área da peça principal e meça o resto: revela que a folga é fixa | | |

**Escolha do quadro de repouso:** onde a peça está parada, nítida e com todas as palavras visíveis. Ele define quantas caixas existem e a escala de repouso (`s = 1`).

**Largura do fechamento horizontal (texto):** precisa ser maior que o vão entre letras e menor que o espaço entre palavras. Comece com 7 px: se palavras coladas viram uma caixa só, diminua; se uma palavra partiu em duas, aumente. Confira as caixas listadas antes de seguir.

**Como validar uma captura:** correlação de 0,9 ou mais em quadros nítidos; diferença entre escala x e y abaixo de 0,03; curva suave no gráfico. Se a curva pular, olhe o quadro antes de filtrar: pode ser um degrau real.

**Quadros de borrão total** não rastreiam. Vá ao quadro, estime e registre à mão (um JSON de ajustes manuais). Uma chave **entre quadros** permite ter muito borrão num quadro e pouco no seguinte; uma chave **antes do `inPoint`** alimenta o borrão de entrada.

## Etapa 5: gerar as chaves

Transforme as medições em chaves de After Effects. O gerador (escreva o seu, em Python, produzindo um `.jsx`) faz, na ordem:

1. Descarta quadros deformados (escala x e y muito diferentes) e começos fracos (correlação baixa).
2. Palavra sem rastreio (menos de 5 quadros) segue a vizinha mais longa, com o afastamento de repouso.
3. Lê a cor exibida: mediana dos 15% de pixels de maior contraste na caixa. Quadro borrado herda a cor do primeiro quadro bom.
4. Desfoque só nos 3 primeiros e 2 últimos quadros, pela nitidez relativa; no meio, a variação é ruído de compressão.
5. Estende entrada e saída pela velocidade, enquanto houver contraste.
6. Bloco que sai rígido: quem perde o rastreio segue o líder como corpo único.
7. Aplica as correções de cor e de posição da etapa 8.
8. **Saída em grupo:** mediana do deslocamento de todas as peças por quadro; todas passam a usar essa curva.

Tire o ruído das séries com mediana de 5 quadros (preserva degrau; a média o destruiria).

Descreva cada vídeo num arquivo de configuração: os blocos (peça, arquivo da medição, palavras ou imagens por caixa, limite de tempo para estender) e os grupos de saída (início medido da saída, último quadro). `null` descarta uma caixa; uma imagem no lugar da palavra diz que a caixa é uma imagem. Se o número de caixas não bater com as palavras, o gerador deve parar e listar as caixas.

## Etapa 6: construir no After Effects

Abra o After Effects escondido (sem janela, como em renderização `-noui`) e execute o construtor pela ponte (`ae_do` com `eval.run`), ou rode o `.jsx` pelo próprio After Effects. Depois de um render, o After Effects escondido costuma cair: reabra.

Padrões do construtor:

- **Uma pré-comp por cena**, com o tempo interno igual ao tempo do vídeo. Nada de deslocamento.
- **Chaves em massa:** `prop.setValuesAtTimes(tempos, valores)`. Interpolação linear entre quadros; a curva real está nos valores.
- **Tempos exatos:** encaixe todo tempo na grade de quadros e use `inPoint = tempo - 0,001`, senão o arredondamento some com a peça naquele quadro.
- **Largura medida para tamanho de texto:** `tamanho = 50 × (largura medida × fator) / largura da palavra em tamanho 50` (use `sourceRectAtTime`). Em imagem, a largura vai direto.
- **Corpo único no bloco** (mediana das palavras de 4 letras ou mais), senão "e", "o", "1" incham.
- **Motion blur:** meça o obturador: rastro dividido pela velocidade, vezes 360°, dá o ângulo. Fase = −ângulo ÷ 2. Use `motionBlurSamplesPerFrame = 64` nas cenas com giro. Meça por cena; ângulos entre 75° e 180° aparecem em peças diferentes.
- **Cor:** efeito Fill com `setValuesAtTimes`.
- **Recorte de placa:** amplie 3× com LANCZOS; fica com a nitidez do original.

Veja rápido com `ae_see` (folha de contato nos tempos pedidos).

## Etapa 7: comparar por movimento

Sempre as três:

1. **Recorte lado a lado nos quadros do meio dos movimentos:** original em cima, o seu embaixo, mesmo recorte.
2. **Energia de movimento:** percentual de pixels que mudam por segundo, original contra o seu, mais a lista de trechos parados.
3. **Curvas:** extraia rotação e largura do seu render com as mesmas ferramentas da etapa 4 e compare com as do original (erro médio e gráfico).

E o lado a lado em vídeo, também a 3× mais lento:

```bash
ffmpeg -i original.mp4 -i render.mp4 -filter_complex "[0:v]scale=540:960,setsar=1[a];[1:v]scale=540:960,setsar=1[b];[a][b]hstack[v]" -map "[v]" -map 0:a -c:v libx264 -crf 18 -c:a aac comparativo.mp4
ffmpeg -i comparativo.mp4 -vf "setpts=3*PTS" -an -c:v libx264 -crf 18 -r 30 comparativo-3x-lento.mp4
```

## Etapa 8: correção em circuito fechado

O render tem fonte e compressão diferentes do original, então a mesma leitura dá valores diferentes. Corrija medindo os dois:

1. **Cor:** leia a cor de cada palavra em cada quadro nos dois vídeos; acumule 80% da diferença num arquivo de correção de cor.
2. **Posição:** case o recorte de cada palavra do original no seu render; guarde o desvio num arquivo de correção de posição.
3. Regere as chaves, reconstrua e renderize.

Uma rodada de cada costuma bastar para reduzir o erro de cor pela metade e zerar o desvio de posição. **Rode cada correção uma vez por render**: rodar duas vezes sobre o mesmo render soma a correção em dobro. Para medir o erro depois da correção sem somar de novo, copie os arquivos de correção, rode as medições no render novo e restaure as cópias.

## Etapa 9: iterar por cena com a pessoa

1. Faça **uma cena piloto** e mande o lado a lado em câmera lenta. Só escale depois do "ficou bem melhor".
2. Quando a pessoa apontar um trecho, vá aos quadros daquele trecho a 30 qps e meça. **Não aplique a explicação dela nem a sua sem medir:** a descrição é pista. Já aconteceu de a descrição dizer que o botão voltava a azul e a medição mostrar que ficava vermelho, e de a hipótese ser "fusão" e a medição mostrar rampa de fundo. Avise quando a medição discordar.
3. Renderize numa pasta nova, sem acento no caminho, para não sobrescrever a versão anterior.

**Vídeo longo: frentes em paralelo.** Um vídeo de 20 ou mais cenas pode ser dividido em frentes, uma por trecho, cada uma com a própria instância escondida do After Effects. O que torna isso seguro:

- Regras comuns e limites de escrita num arquivo de briefing.
- Fundo medido uma vez no vídeo inteiro, numa camada só; as cenas são transparentes.
- Uma cena por arquivo e um construtor que aceita testar só algumas cenas.
- Um gerador que junta as configurações de todas as frentes.
- Um coordenador que junta, renderiza, mede erro e energia por cena e faz a correção de cor e posição uma vez.

## Armadilhas que custaram rodadas

- Medir coordenada em quadro recortado.
- Supor fusão ou clarão antes de medir o fundo.
- Aplicar a mesma rampa de fundo a cenas que têm fundo contínuo.
- Fixar um único obturador para o vídeo inteiro.
- Comparar quadros parados e declarar pronto.
- Rodar a correção de cor ou de posição duas vezes sobre o mesmo render.
- Deixar palavras com corpos diferentes dentro do mesmo bloco.
