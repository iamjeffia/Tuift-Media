# Curvas, molas e vida na pausa

Números de partida que as cinco rotas compartilham. São nossos valores de trabalho: ajuste por vídeo, mas mude com um motivo.

## Influência: a curva em duas pontas

No After Effects, uma curva é o par "influência de saída da chave de partida" e "influência de chegada da chave seguinte", com velocidade 0 nas duas pontas (Easy Ease). Quanto mais alta a chegada, mais o elemento arranca rápido e assenta devagar.

| Nome | Saída | Chegada | Para quê |
|---|---|---|---|
| entrada | 15 a 33 | 85 | tudo que "chega": cartão, câmera, carrossel |
| arranque | 10 | 100 | câmera e produto que deslizam longe, sem quique |
| elástica | 72 | 83 | widget que sai e volta, balão, logo |
| saída | 75 | linear | saída de cena: começa devagar e sai acelerando |
| simétrica | 33 | 33 | texto que rola dentro de um cartão |
| pausa | hold | — | piscar de opacidade quadro a quadro |

Passos no script: crie as chaves lineares, ponha todos os valores, e só no fim aplique a facilidade (mudar o easing troca a interpolação para bezier). Chaves de cor não aceitam easing: deixe lineares. `scripts/gerar_easing.py` monta o lote `keyframe.set_easing` para uma lista de propriedades.

## Mola com ultrapassagem (overshoot)

Para entradas de cartão, botão, balão e selo: duas chaves lineares (de e para) e esta expressão na propriedade. Ela lê a velocidade com que a chave chegou e continua oscilando de forma amortecida.

```js
// Position / Scale: chaves lineares + esta expressão
var amp = 0.05, freq = 2, decay = 4;   // partida: 5% de ultrapassagem, 2 oscilações/s, amortecimento 4
var n = 0;
if (numKeys > 0) {
  n = nearestKey(time).index;
  if (key(n).time > time) n--;
}
if (n > 0) {
  var t = time - key(n).time;
  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);
  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
} else {
  value;
}
```

A mola precisa de velocidade na chegada. Com easy ease nos dois lados a velocidade é zero e a mola não aparece: use chaves lineares. A operação `tda.mola` do MCP já faz isso (duração 0,25 s, amp 0,05, freq 2, decay 4 por padrão). Para texto com ultrapassagem menor, amp 0,04, freq 1,8, decay 3.

## Escalonamento

Elementos de um grupo não começam no mesmo quadro (o revisor acusa início simultâneo de três ou mais). Valores de partida: 1 quadro entre pontos e letras, 2 quadros entre palavras, linhas e balões, 3 quadros entre itens de uma pílula, 0,15 s entre seções. `tda.stagger` desloca as chaves de camadas selecionadas por esses passos.

## Vida na pausa

Parar morto entre dois movimentos parece robô. Mantenha uma deriva lenta: posição com `wiggle(0.1, 14)`, rotação de 0,4° a 1,5°, respiração de escala de 2 a 6%, câmera que anda 40% do deslocamento entre dois pontos. `tda.vivo` e `tda.camera_viva` aplicam isso. Câmera perfeita demais também parece robô: se a referência treme, meça a tremida antes de ajustar, em vez de chutar.

## Desfoque de movimento

Ligue na comp e em cada camada que se move; em tela de app comum, obturador de 70° a 90° (180° borra demais). O desfoque precisa de três chaves ligadas: a comp, a camada da precomp e cada camada que se move dentro dela. Em peça de câmera muito rápida, 180° é aceitável. Em render, 8 amostras com limite adaptativo de 16 bastam.

## Texto que entra

- Entrada: opacidade 0 para 100 e deslocamento de 30 px em 0,35 s; saída em 0,25 s subindo 20 px.
- Entrada com desfoque por letra: animador de texto com Blur (30 a 45) e Range Selector com Start de 0 a 100 em 0,2 a 0,55 s; a primeira letra fica nítida enquanto o resto ainda está borrado. Por script, depois de cada `addProperty` no animador, busque o animador de novo pelo índice.
- Gradiente no texto: sólido com Gradient Ramp e o texto como track matte. Brilho: cópia branca do texto com Gaussian Blur de 22 a 34 por baixo, a 45 a 50%.
- Contador: Source Text = `Math.round(effect("Valor")("Slider"))`, com o slider animado e chaves de influência 10 na saída e 85 na chegada (começa rápido e freia no número).
