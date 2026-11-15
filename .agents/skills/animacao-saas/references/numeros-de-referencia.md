# Números de referência

**Resumo:** os valores que o padrão de animação usa como ponto de partida: mola, curvas, câmera, motion blur, áudio e revisão. São pontos de partida; o estilo do vídeo e a identidade decidem, e quem foge do padrão registra no projeto.

## Mola padrão

Para entrada de cartão, botão, balão, notificação, selo e morph de UI.

- Chaves **lineares** de 0 a 100 em **0,25 s** (velocidade de 400 %/s).
- Amplitude 0,05, frequência 2, decay 4. O elemento passa do ponto (cerca de 112%), volta a cerca de 95% e assenta em 100 em aproximadamente 0,6 s.
- Em posição, a mesma expressão: com 100 px em 0,25 s, passa cerca de 12 px.

No After Effects, expressão na propriedade que tem duas chaves lineares (pela ponte: `expression.set`):

```js
var amp=.05,freq=2,decay=4;var n=0;if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time)n--;}var t=(n==0)?0:time-key(n).time;if(n>0&&t<1){var v=velocityAtTime(key(n).time-thisComp.frameDuration/10);value+v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);}else{value;}
```

Em HTML (GSAP, relógio da composição) ou em outro motor, a mesma fórmula como função de tempo:

```js
// de → para em `dur` s (linear), depois oscila e assenta; t em segundos desde o início da entrada
function molaPadrao(t, de, para, dur = 0.25, amp = 0.05, freq = 2, decay = 4) {
  if (t <= 0) return de;
  if (t < dur) return de + (para - de) * (t / dur);
  const s = t - dur, v = (para - de) / dur;
  return para + v * amp * Math.sin(freq * s * 2 * Math.PI) / Math.exp(decay * s);
}
```

Alternativas quando o vídeo pedir: Easy Ease para algo sóbrio, uma mola suave para algo macio, um back-out discreto para algo contido.

## Curvas

| Uso | Curva |
|---|---|
| Câmera e troca de cena (padrão SaaS) | bezier (.86, 0, .07, 1): sai devagar, metade do movimento em 2 a 3 quadros, assenta longo |
| Entrada de elemento sem mola | bezier (.33, 0, .67, 1) (Easy Ease 33/33) |
| Pop de balão e ícone | bezier (.34, 1.56, .64, 1) |
| Lousa contínua | bezier (.333, 0, .2285, 1) |

## Câmera

- Câmera nunca parada: deriva contínua (chaves lineares) mais um `wiggle` lento num null pai. A câmera de referência quase nunca para; meça a deriva e o chicote e reproduza (o chicote medido pode ter, por exemplo, 7 quadros, e não 2 ou 3).
- Exceção declarada: em vídeo de opinião ou manifesto, 2 a 3 paradas completas de propósito nos momentos de verdade, anotadas no projeto. O `ae_review_motion` acusa parada acima de 0,5 s.
- Câmera que acompanha a ação (digitação, toque): fecha em escala 1,3 a 1,5 no ponto da ação e volta; a legenda fica fora da câmera.

## Motion blur

Depende do estilo. Telas de app e UI costumam ficar em 70° de obturador e 40° de fase; uma peça de câmera rápida no estilo Apple Clean UI pode usar 180°.

## Texto e digitação

- Texto de destaque sempre com acabamento: degradê, brilho, textura, contorno ou palavra preenchida com filmagem.
- Digitação em tela: teclado do iOS subindo e teclas reais; nunca texto "esticando" por máscara.

## Áudio

- **Música sob a voz:** documentário narrado com arco de história, em que a trilha ajuda a contar: cerca de 15 dB abaixo da voz (aceita 14 a 17). Demais vídeos com fala (apresentação de produto, tutorial, anúncio, reel narrado): cerca de 19 dB (aceita 17 a 21). Na dúvida, 19. Volume de curto prazo constante (p90 menos p10 de até 2 a 3 dB); nos respiros curtos cerca de 13 dB abaixo; nos trechos só de música (2,5 s ou mais sem voz) cerca de 5 dB abaixo do nível da voz.
- **Loudness final:** narrado e "apresentando": -14 LUFS; tour de loja com mix mais baixo: -16 LUFS. `loudnorm` em duas passagens. Outro valor se o estilo pedir, declarado no projeto.
- **Efeitos (SFX):** bibliotecas niveladas, ganho 1, volume relativo à voz de 0,2 a 0,6; ganho 0,5 só para arquivo que não foi nivelado. Posição do efeito: `at = evento − pico_ms/1000`, porque o pico do efeito está em milissegundos. Meça a sincronia num stem só de efeitos (onsets), nunca no mix; alvo mediano de até 25 ms.
- **Voz:** narração seca, sem reverb nem eco.
- **Música:** real e licenciada para o uso, nunca repetida de um vídeo para o seguinte.

## Revisão

Rascunho a meia escala e folha de contato antes do render final. Folhas de contato a 4 quadros por segundo para a estrutura, e a 30 qps nos trechos com movimento.
