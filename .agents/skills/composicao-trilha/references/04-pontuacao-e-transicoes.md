# Pontuação e transições

Onde e como entram hits, risers, swells e transições, e como emendar cenas, partes e músicas sem que ninguém perceba. A regra que mais importa: o pico do som cai no quadro da virada.

## 1. Anatomia

| Peça | Como é | Para quê |
|---|---|---|
| **Hit** | ataque seco no começo (a menos de cerca de 25 ms do início) e cauda com nota | pontuação: pico emocional, troca de cena, marca. Não é um boom qualquer: tem nota e trabalha com a música |
| **Riser** | transiente baixo e sutil, cresce, chega ao pico, cai | expectativa antes de uma revelação, de uma frase ou do drop; pode levar a música embora no fim |
| **Swell** | sobe rápido, pico cedo, cai devagar | movimento discreto na imagem; respiro que cresce |
| **Transição** | losango: cresce até o meio e desce | passar de uma cena ou emoção para outra; o pico fica no corte e a cauda vaza para depois |
| **Ping ou golpe de piano** | golpe de piano, às vezes com sub, e talvez uma subida curta em reverso antes | abrir como trailer, marcar acorde, marcar o drop; o pré-roll curto cabe numa pausa de fala |

O clímax de cada riser muda de arquivo para arquivo e de tom para tom (pode variar mais de 1 s). Meça o pico do arquivo do tom escolhido; `scripts/mixar_cues.py --medir arquivo.wav` faz isso.

## 2. Alinhar pelo pico, não pelo começo do arquivo

- Alinhe o transiente mais alto ao evento. Não ponha o efeito no começo do arquivo: ponha a parte mais alta no quadro em que a imagem troca.
- Fórmula: `início_do_clipe = evento − pico`. No After Effects, `ae_place_sfx` faz isso.
- **Golpe tonal 1 a 2 quadros depois do corte, nunca antes** (cerca de 30 a 75 ms de atraso). Golpe adiantado soa como erro; atrasado soa como consequência.
- **O riser termina exatamente no evento:** no drop, no corte, no tempo 1 do loop novo ou na frase de efeito. Exemplos: um riser com o pico no primeiro impacto do drop; um riser num buraco da voz, logo antes do corte; um riser que acaba no fim da fala, no corte para o b-roll.
- O ponto sincronizado é a chegada, não a partida: o riser começa antes e aterrissa no acento.
- Se for conferir na timeline, deixe o clipe um pouco antes do som, para o ataque cair no destaque.

## 3. Onde pontuar

| Lugar | O que entra |
|---|---|
| **Virada de assunto** | hit com o pico na emenda dos dois loops: esconde a troca e marca o capítulo novo |
| **Marca, logo ou fato forte na tela** | hit tonal enterrado no mix, que se sente sem perceber |
| **Pessoa ou câmera em movimento** | swell baixo terminando no movimento |
| **Volta da narração para a "cara" do assunto** | transição com o pico no corte; depois a música para |
| **Antes da frase-tese** | riser pequeno mais hit pequeno |
| **Frase de efeito no fim de um build** | tudo sobe junto (textura com volume subindo, relógio, riser, swell) e corta antes da frase. Sob a fala anterior o build fica no nível da trilha; cresce de verdade nos vãos da voz e no último meio segundo. O corte seco aqui é de propósito |
| **Golpe sem corte** | no olhar, no gesto, no título: um golpe marca um gesto, não só um corte |
| **Título** | build forte mais hit no título; a música para no golpe e fica só a cauda |

## 4. Dois risers, dois arcos

- Um agudo e um grave em paralelo dão peso.
- Dois arcos de hype: nada de efeito em cima da hora. O riser começa na abertura e cresce até o corte da voz; no corte, outro riser recomeça até a batida.
- Riser curto (2 a 3 s) serve de ponte de uma parte calma para uma rítmica.

## 5. Emendar sem ninguém perceber

Ninguém pode perceber a emenda entre partes ou entre músicas: ou há continuidade, ou a parte termina suave. A voz sai no fim de uma frase e a outra entra no começo de uma frase.

### A emenda em três tempos

1. **Parar com cauda de reverb:**
   - estenda o clipe (hold) para haver espaço depois do áudio;
   - use um reverb grande (catedral);
   - automatize o molhado de 0 a cerca de 50% só nos últimos 6 a 7 quadros;
   - o ouvido não percebe o reverb entrando, só a sala sustentando a última nota;
   - nunca ponha reverb no loop inteiro, só no último segundo;
   - a receita completa está em [08](08-musica-real-e-cama-tonal.md), "Parar a música".
2. **Momento calmo afinado (cerca de 10 s):** uma transição com o pico no corte (para médios e agudos) mais um build grave de piano subindo até o corte; depois uma textura com sub em fade-in: o drone mantém a música viva.
3. **Voltar abafado e abrir pela EQ:**
   - a música volta cerca de 5 a 6 compassos antes do refrão, com passa-baixas em torno de 650 Hz e passa-altas em torno de 400 Hz (como na sala ao lado);
   - os filtros abrem em cerca de 4 s até o primeiro tempo do refrão;
   - um riser termina e um golpe marca o mesmo tempo 1;
   - traga a música abrindo a EQ, não subindo o fader.

### Outras emendas

| Situação | Como |
|---|---|
| Loop para loop (mesmo tom) | colados na linha de compasso; se abrupto, um riser atravessando o corte, numa faixa abaixo, com o clímax no tempo 1 do loop novo |
| Fechar uma seção | corte seco do loop na linha de compasso e golpe no ponto do corte; sobram a cauda e o drone; um riser passa por cima do vão; entra a parte seguinte |
| Música para coleção de tonais | textura sobreposta à cauda da música; loop novo onde a música corta; riser atravessando o corte |
| Tonais para música | textura que se funde à entrada da música, ou riser mais golpe no tempo 1 da música |
| Música para outra música | ponte com drone ou cello no mesmo tom; a segunda entra com golpe no tempo 1 |
| Partes calmas | crossfade de 2 a 3 s; a cauda da peça anterior esconde a entrada da próxima |
| Entrada de ritmo ou golpe | corte seco no tempo |
| Música que para (antes de fala, virada ou fim) | corte seco numa nota sustentada, cauda de reverb, riser e transição no tom com o pico logo antes do corte |
| Loop para cama | 3 a 4 s de cauda; saída seca soa como erro |
| Drone esticado | duas cópias com cerca de 7 s de crossfade |
| Troca de tom | riser no tom de saída com o pico no primeiro som do tom de chegada |
| Velocidade (música lenta para normal) | rampa, nunca salto |
| Som de cena | J-cut (o som da próxima cena entra antes do corte, em rampa) e L-cut (o da anterior continua depois); a ambiência sempre cruza |

## 6. Continuidade

- Nenhuma camada sai com volume caindo de forma perceptível. Instrumento que sai leva fade de cerca de 2,5 s.
- Uma camada contínua atravessa a intro.
- Antes do drop, o arranjo esvazia: ficam a voz e o riser, e o respiro tem um efeito só, o riser atravessando até o drop.
- Não emende trechos do build original com elementos novos.
- Na troca de velocidade, drone e riser recomeçam com fade-in de 1,5 s.

## 7. Erros de pontuação

- Pico do efeito no lugar errado, porque se alinhou pelo começo do arquivo.
- Golpe adiantado em relação ao corte.
- Riser que passa do drop ou fica em cima das palavras finais; riser cortado seco no fim do swell.
- Golpe com sub junto do bumbo da música, que embola os graves: passa-altas em cerca de 100 Hz no golpe.
- Efeito em cima da hora na emenda, com um arco só.
- Whoosh ou boom genérico numa virada de história: use o tonal no tom.
- Tonal em clique, card, contador ou pop: use efeito comum.
