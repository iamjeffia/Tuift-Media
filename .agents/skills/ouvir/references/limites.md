# Limites e o que não é confiável

Leia isto antes de transformar um resultado em decisão. As regras de leitura de cada campo estão em [resultados.md](resultados.md).

## O que é medida e o que é palpite

| Tipo | O que entra | Quanto confiar |
|---|---|---|
| **Medidor** | volume integrado (LUFS), pico real (dBTP), faixa de volume (LRA), silêncio, tempos de ataque e de pico, bandas de frequência | exato; use para níveis e para tempos |
| **Estimativa** | tom, andamento, onde as seções mudam | só quando o próprio resultado diz `reliable: true` ou `confidence: clear` |
| **Palpite calibrado** | etiquetas de `describe`, `find` e `compare --text` (z) | forte em som isolado e limpo; metade das vezes em mix densa |
| **Opinião** | `opinion` (modelo hospedado) | nunca é medida; a pessoa decide |

Gosto, emoção e se a trilha combina com a marca não são medidos por nada daqui. A skill diz o que o som é e quanto mede; a pessoa diz se está bom.

## Tom e andamento

Medido nos testes desta skill, com áudio gerado de tom e andamento conhecidos:

- Uma progressão de acordes de 12 s em dó maior a 120 BPM volta `C major` (correlação alta) e 120 BPM com `confidence: clear`. Um som tonal curto (uma nota, um acorde de um segundo) volta uma tonalidade com correlação parecida entre a menor e a maior da mesma nota: o resultado marca `reliable: false`, explica por quê e devolve a nota (`pitch`). Não use tom de som com menos de 4 s, de uma ou duas notas, nem de percussão.
- O método é o de perfil de tonalidade (Krumhansl-Kessler) sobre o cromagrama: só maior e menor, e o relativo (dó maior e lá menor) se confunde com facilidade. Quando os dois mais fortes são relativos, o resultado diz.
- O andamento vem de um detector de pulso com confiança `clear`, `weak` ou `none`. Música sem batida fixa, rubato e material curto voltam `none`. Pode vir na metade ou no dobro do andamento sentido (`bpm_alt`). Não ajuste cortes com um andamento que não seja `clear`.
- Nenhum dos dois foi validado nesta skill em música real, com gravações de instrumentos. Em música real, confirme o tom com a pessoa ou com a partitura.

## Sincronia (events com cues)

- A lista de cues é a verdade: os tempos que a pessoa ou o roteiro marcaram. O resultado diz se há **um som** dentro da tolerância, não se é **o som certo**. Outro som perto do cue conta como acerto.
- Na mix final, com música e voz, quase todo ponto tem algum ataque perto. Por isso o resultado traz `chance_hit_rate`: a fração de tempos aleatórios que também acertariam. Um acerto de 95% com acaso de 88% não prova nada.
- A medida vale de verdade no **stem só dos efeitos**, onde cada ataque é um efeito. Peça o stem ou renderize um.
- Um whoosh ou riser que sobe devagar pode não ter um ataque marcado: o resultado olha também o pico (`peak_t`) e os crescendos (`kind: swell`), e mesmo assim pode errar um som muito suave. Ouça antes de acrescentar um som onde veio `miss`.
- A tolerância padrão é 40 ms (cerca de um quadro a 25 qps). Troque por cue com `tolerance_ms`.
- Só entram eventos pelo menos 6 dB acima do que vinha antes (`--min-prominence-db`). Ruído de fundo contínuo não vira evento.

## Os modelos que ouvem

- Eles ouvem de 50 Hz a 14 kHz (e o classificador de rótulos só até 8 kHz). Ar e corte de filtro se medem com `measure` (`bandwidth_hz`, bandas), não com `describe`.
- Sons de menos de meio segundo: os rótulos de classe vêm fracos. Uma classe vizinha (um "zíper" para um swish, "estalo de dedo" para um clique) é neutra; só uma classe totalmente diferente (fala, motor) é sinal de alerta.
- Música: gênero e clima têm acerto baixo. Instrumento, chuva, pássaros e voz acertam mais.
- Uma camada sob uma mix alta passa despercebida. Julgue os stems, não só a mix.
- Eles não reconhecem fala: dizem que há voz, não o que foi dito. Para isso existe `speech`.
- Sem decisão de licença, procedência ou direitos autorais: isso se lê na página do som.

## Fala

- Vem dos backends do `watch`. O local (whisperx) deixa o áudio no computador e é lento em CPU; a nuvem é rápida e recebe o áudio. A qualidade depende do backend e do áudio: música alta, fala sobreposta e clipes curtos voltam vazios ou errados. Diga isso, não preencha.
- Os tempos são dos segmentos, não das palavras.

## Segunda opinião

- O modelo recebe uma cópia mono reduzida, então não julga ar, estéreo nem pico. Ele erra: num teste com cinco cliques gerados em tempos conhecidos e desiguais, a resposta dele disse que estavam espaçados de um em um segundo. Os tempos são aproximados. Pode demorar minutos (8 minutos num teste, com o modelo configurado no `watch`). Os números de volume que ele cita vêm da leitura do motor, que num arquivo mono é 3 dB mais alta que a de `measure`: não os repita. A régua que ele usa é a de filmes de lançamento de produto (cortes rápidos, interface, música movida), que não serve para tudo. Pergunte à pessoa, peça o `--question` certo e confirme tudo com `events` e `measure`.

## Peso e velocidade

- `measure`, `events`, `key` e `compare A B` rodam em segundos (a primeira chamada de cada processo carrega as bibliotecas, uns 3 s).
- `describe`, `find` e `compare --text` carregam dois modelos a cada chamada: de 15 a 30 s num arquivo de 12 s ainda não visto, com pico perto de 1,7 GB de RAM. O resultado de cada arquivo fica em cache e a repetição é mais rápida. Use `--quick` quando não precisar do tempo e não repita sem necessidade.
- Por padrão a skill usa 2 threads. Num PC que a pessoa está usando, mantenha assim e rode uma análise por vez.
