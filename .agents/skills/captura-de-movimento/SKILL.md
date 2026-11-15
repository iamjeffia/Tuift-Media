---
name: captura-de-movimento
description: "Copiar a animação de um vídeo de referência com fidelidade: mede cada peça quadro a quadro (posição, escala, rotação, cor, fundo), usa os números como chaves no After Effects e compara por movimento, nunca por quadro parado. Usar quando a pessoa pedir para recriar, refazer igual ou fazer engenharia reversa de um vídeo, ou quando disser que a animação ficou crua, robotizada ou diferente do original."
---

# Captura de movimento

**Resumo:** a animação orgânica não se descreve nem se chuta: se mede em cada quadro. Esta skill leva uma recriação de "as animações estão longe de ser iguais" a "ficou igual": rastrear cada peça, transformar a medição em chaves, comparar curva contra curva e corrigir em circuito fechado. O passo a passo técnico está em [references/metodo.md](references/metodo.md).

Só recrie o que a pessoa tem direito de reproduzir (um vídeo dela, um estudo de movimento para uso interno, uma referência da qual se copia o movimento e não o conteúdo). Mede-se o movimento; o conteúdo e a identidade da peça nova são da pessoa.

## Qual caminho

| Pedido | Faça |
|---|---|
| Recriar ou fazer engenharia reversa de um vídeo | [metodo.md](references/metodo.md) inteiro, com o checklist A abaixo |
| Uma animação específica (mola da palavra, troca de cena, numeral que gira, ícone, cards, botão, cometa, tracejado que anda, contador) | etapas 4 e 5 de [metodo.md](references/metodo.md) para a peça, e a tabela de peças |
| Vídeo inteiro com várias cenas | frentes em paralelo (etapa 9 de [metodo.md](references/metodo.md)) |
| Vai escrever JSX de AE ou medir | leia as armadilhas em [metodo.md](references/metodo.md#armadilhas-que-custaram-rodadas) antes |

## As regras que não mudam

1. **Quadros a 30 qps nos trechos com movimento.** Folha a 4 qps é só visão geral: joga fora 7 de cada 8 quadros.
2. **Meça tudo antes de supor.** Rastreie cada peça com a ferramenta certa (SIFT mais homografia em imagem; ECC em palavra grande; casamento de modelo em várias escalas em texto pequeno; silhueta por cor em peça lisa que gira). Um modelo de visão (por exemplo, o Gemini) só dá inventário, nunca coordenada.
3. **Chaves medidas por quadro**, com `setValuesAtTimes`, sem easing inventado. Algumas peças precisam de duas chaves dentro do quadro para controlar o rastro. A mediana tira ruído preservando degraus.
4. **Compare por movimento:** curva contra curva, energia de movimento por segundo, folha nos quadros do meio dos movimentos, lado a lado a 3× mais lento. Quadro parado engana: uma versão com diferença quase nula nos quadros parados pode ser reprovada no movimento.
5. **Troca de cena: meça a cor do fundo primeiro.** Há cenas com rampa de cor no fundo e corte seco do conteúdo, cenas com fundo contínuo e cenas com fusão de verdade. Identifique e confira cada caso; não aplique uma rampa automaticamente.
6. **O que sai junto é um grupo com uma curva só.** Mediana do deslocamento de todas as peças, nulo pai, início medido: a saída começa bem antes de parecer.
7. **Meça também o obturador e a fonte.** O motion blur varia por cena (ângulos de obturador entre 75° e 180° são comuns); não fixe um valor para o vídeo inteiro nem suponha que toda configuração é uma medição óptica do original. A fonte se escolhe por erro e observação; algumas letras precisam ser traçadas.
8. **Feche o circuito:** compare o seu render com o original e corrija cor e posição pela diferença medida (etapa 8 do método).
9. **Cena piloto antes de escalar.** Mande o lado a lado em câmera lenta para a pessoa. Olhe você mesmo a folha do trecho alterado antes de entregar.
10. **O retorno da pessoa é pista:** vá ao quadro e meça. Se a medição discordar, siga a medição e avise.

## Peças comuns e como medir

| Peça | Ferramenta de medida |
|---|---|
| Capa, foto, objeto com textura | SIFT mais homografia contra a imagem da peça: quatro cantos, centro, largura, altura, rotação |
| Palavra grande sobre fundo liso | detecção por limiar com fechamento horizontal e rastreio ECC afim |
| Palavra pequena ou linhas coladas | casamento de modelo em várias escalas, em janela pequena em volta da posição anterior |
| Peça lisa que gira muito (numeral) | máscara por cor e busca de rotação e escala em volta do centroide |
| Ícone colorido com partes que giram | centro e escala pelos pixels saturados; ângulo pelo centro de uma das cores |
| Risco colorido (cometa) | maior mancha da cor fora da área do botão: centro, comprimento, reta |
| Tracejado que anda | correlação de uma linha da borda entre quadros, para sentido e velocidade |

## Ferramentas

- **Para rodar a medição:** Python com OpenCV (`cv2`), NumPy e Pillow; `ffmpeg` para extrair quadros e montar comparativos. Confira com `python -c "import cv2, numpy, PIL"` e `ffmpeg -version`; instale o que faltar e anote no projeto.
- **No After Effects:** use o After Effects MCP que acompanha o TUIFT Code (`ae_do` para construir, `ae_see` para olhar quadros, `ae_render_video` e `ae_review_motion` para renderizar e revisar). Sem a ponte, rode um script `.jsx` pelo próprio After Effects.
- **Transcrição do áudio (se houver fala):** `faster-whisper`, para o tempo por palavra.
- **Ler um render:** com `ffmpeg` extraindo os quadros para imagens; `cv2.VideoCapture` pode ler quadros em posição errada em alguns arquivos.
- Os scripts de medição não vêm junto com a skill: escreva o que a peça pedir com as funções do OpenCV acima, guardando o resultado em JSON por quadro (peça, quadro, x, y, largura, altura, rotação, confiança).

## Checklists

**A. Recriar um vídeo**

- [ ] Quadros extraídos a 30 qps, áudio separado e (se houver fala) transcrito.
- [ ] Trechos com movimento vistos quadro a quadro; anotado quando cada peça nasce, some, para ou parece mola.
- [ ] Fundo medido em cada troca de cena; tipo de transição identificado.
- [ ] Cada peça rastreada com a ferramenta certa; confiança e escala conferidas; quadros borrados tratados à mão.
- [ ] Chaves geradas por quadro, com mediana onde há ruído; saída em grupo com curva única.
- [ ] Motion blur e fonte medidos por cena.
- [ ] Comparado por curva, por energia de movimento e em lado a lado lento.
- [ ] Cor e posição corrigidas uma vez por render.
- [ ] Cena piloto aprovada antes de escalar.

**B. Usar o método em animação nova**

- [ ] A curva medida vira receita com nome e valores; a peça nova usa a receita, não a curva copiada com o conteúdo original.
- [ ] Mola, troca por rampa de fundo, saída em grupo, tracejado que anda e cometa no botão entram só onde fazem sentido para a cena.
- [ ] Movimento revisado com `ae_review_motion` e quadros do meio dos movimentos.
