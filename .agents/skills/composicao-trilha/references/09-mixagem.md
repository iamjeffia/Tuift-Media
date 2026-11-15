# Mixagem da trilha

A hierarquia e os princípios para a trilha soar profissional sem brigar com a voz. Os números são valores de partida medidos em trabalhos anteriores; ajuste pelo ouvido e pelo tipo de vídeo.

## 1. A hierarquia

**voz, depois loop ou música, depois textura, depois hits e risers** (e os efeitos de elemento no seu próprio canal).

- Num documentário bem mixado, o que se ouve de verdade é a voz; o hit de marca fica quase inaudível e a textura, que ninguém nota, sustenta o resto.
- Voz não pode sumir; depois vem a música (ritmo e clima); depois o som de cena (ambiência, diegético, criativo).
- Sem voz, a melodia fica na frente e no centro; texturas são a base; efeitos sem tom são a cereja.

## 2. Sob a narração

- A trilha fica bem abaixo da voz, com volume de curto prazo constante e subindo nos respiros. Valor de partida: cerca de 15 dB abaixo da voz em documentário narrado com arco de história e cerca de 19 dB nos demais tipos com fala (tutorial, reel narrado). Referências medidas: drone 12 a 14 dB abaixo, trilhas de vídeos de produto 13 a 16 dB, trilha só de tonais cerca de 19 dB.
- Narração seca: sem reverb nem eco (reverb na voz soa datado).
- **Golpe forte só sem fala**, num vão da voz, e no máximo um por reel. Com fala no mesmo instante, o hit fica no nível da trilha sob a voz, enterrado: sente-se, não se ouve por cima da palavra.
- Sob a fala, no máximo cama, loop e um tonal pontual. A melodia vai no respiro.
- **Trilha só de tonais:** loops e texturas são a música e seguem o nível da música. Renderize a cama como uma faixa e trate-a como música, e deixe hits e risers como pontuação à parte.

## 3. Abrir espaço sem só baixar o volume

- **EQ:** tire da música as frequências da voz. Enquanto o cantor canta, o médio dos tonais fica 5 a 7 dB abaixo da voz e o grave desce pouco.
- A sensação de trilha baixa pode vir da faixa, não do volume: uma trilha com quase toda a energia abaixo de 200 Hz deixa espaço para os cliques entre 3 e 12 kHz.
- **Passa-altas em torno de 100 Hz no golpe** que cai junto do bumbo da música; no drop, golpe sem graves.
- Abaixe o drone quando entram os acordes (cerca de 11 dB).

## 4. Reverb

- **Nunca na narração.**
- Na voz da música: cantada, sala grande com cerca de 40% de molhado, decay de cerca de 4 s e predelay de 20 ms (só na parte lenta, se houver); rap, hall contido de 2,6 s a 22%. Sem plugin, convoluções de resposta ao impulso ou o filtro `aecho` do ffmpeg dão uma aproximação.
- Tonais não levam envio de reverb: a cauda já vem no arquivo.
- Cauda para emendar: molhado de 0 a 50% só nos últimos 6 a 7 quadros ([04](04-pontuacao-e-transicoes.md)); sem grave, começando cerca de 6 dB abaixo da música e descendo cerca de 11 dB por segundo.
- Reverb é distância: quanto mais, mais ao fundo o som fica.

## 5. Nivelar cada peça pelo que ela é

- **Texturas e loops por LUFS:** `ganho = (LUFS_voz + Δ) − LUFS_arquivo`.
- **Golpes, risers, transientes e passos pelo pico** de curto prazo, porque a cauda longa engana o LUFS.
- Valores de partida por papel: tonal cerca de −28 LUFS, golpe cerca de −22, riser cerca de −25, textura cerca de −31. Ajuste de ouvido.
- Um bom material quase não precisa de mixagem: ganho fixo por clipe e fades curtos, porque o acabamento já está no arquivo.

## 6. Dinâmica e espectro

- **Intro escura, brilho no drop:** agudos 10 a 30 dB abaixo na intro.
- **Nada soa como volume caindo:** fades de cerca de 2,5 s; drones cruzam; a emenda é invisível.
- **Arco de volume por momento:** abertura mais alta, problema mais baixo, virada alta, respiro o mais baixo, clímax o mais alto (cerca de ±4 dB em torno do nível do vídeo sob a fala; variações grandes só nos respiros sem voz).
- **Panning:** graves e tonais no centro; o efeito de interface leva o pan do evento vezes 0,6; ambiência com 0,4 a 2,5 dB de diferença entre os canais.

## 7. Finalizar e conferir

- Master e loudness final: `loudnorm` em duas passagens, alvo −14 LUFS e −1,5 dBTP para web social. Em peça curta, pré-mix, limitador e ganho linear.
- **Som de cena:** nunca normalize sozinho a −14 sem checar; pode sair alto demais.
- **Sincronia medida no stem** de efeitos ou tonais, nunca no mix. Os golpes tonais ficam cerca de +30 ms de propósito.
- **Ouça em outro aparelho** (celular, fone com fio). O atraso do Bluetooth engana a sincronia, e o subgrave não existe no alto-falante do celular: confira com um passa-altas em 300 Hz.
- Contra uma referência, compare só nas janelas sem fala e a mixagem inteira no drop.

## 8. EQ dos ritmos num filme sem narração

Quando um pulso ou bateria soa brilhante demais, compare uma versão com menos agudos (por exemplo um EQ gráfico reduzindo bandas de 4 kHz para cima em 5 a 20 dB), ouvindo no conjunto e com ganho percebido semelhante. Isso abre espaço para melodia e risers. Não aplique o corte automaticamente no master.
