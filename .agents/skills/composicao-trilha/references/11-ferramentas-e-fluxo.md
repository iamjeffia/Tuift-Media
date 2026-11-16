# Ferramentas e fluxo da trilha

As ferramentas na ordem do trabalho: medir a música, separar a voz, escolher os sons, montar, ouvir, conferir e aprovar. Tudo abaixo é opcional e público; confira com o usuário o que está instalado e degrade com graça: sem uma ferramenta, faça a etapa de ouvido e por tentativa.

## 1. Medir a música (quando há música real)

| O quê | Como |
|---|---|
| Tom | `ouvir key` (a skill `ouvir`) ou um analisador de tom (Essentia, librosa ou equivalente); o resultado diz quando não é confiável. Com resultado pouco confiável, desempate em um banco de tons ou na partitura. Para piano e violino, meça a escala no stem harmônico |
| Afinação | `librosa.estimate_tuning` no instrumental. Música desafinada em dezenas de cents desafina todo tonal: meça antes de escolher |
| Batida e andamento | um rastreador de batidas (beat_this, madmom, librosa). O andamento de um catálogo pode estar errado. No After Effects, `ae_beats` mede e marca a comp |
| Acordes | um extrator de acordes, como base para piano e orquestra no pulso |

## 2. Separar e preparar a voz da música

| Material | Rota |
|---|---|
| Stems gerais | um separador de stems (Demucs, `audio-separator`) |
| Voz cantada isolada | um modelo de voz do separador; confira os backing vocals |
| Rap | acapella pronta quando houver (a separação por IA traz os backing vocals) |
| Esticar rap | `ffmpeg -af atempo=<alvo/bpm>` |
| Esticar voz cantada | Rubber Band sem formantes, rampa de 85 a 100% por um mapa de tempo; modo suave: `transients=smooth:detector=soft:window=long:channels=together` |
| Reverb da voz cantada | uma convolução ou o `aecho` do ffmpeg, com os valores de [09](09-mixagem.md) |

## 3. Achar e pegar os sons

Veja [fontes-de-som.md](fontes-de-som.md). Para cada som, anote: tom, modo, duração e pico. O pico é o tempo em que o arquivo tem mais energia; `scripts/mixar_cues.py --medir arquivo.wav` o calcula. Para pacotes grandes, vale um inventário em planilha ou JSON com esses campos (papel, modo, duração, pico, LUFS), o que permite buscar por "riser no tom de Lá" sem abrir arquivo por arquivo.

## 4. Montar

| Situação | Caminho |
|---|---|
| Qualquer vídeo | `scripts/mixar_cues.py cues.json mix.wav`: posiciona cada som pelo pico, aplica ganho, fades e corte, soma e normaliza em duas passagens |
| Vídeo com composição no After Effects | `ae_sound_cues` (onde cabem efeitos), `ae_place_sfx` (arquivo com o pico no evento) e `ae_beats` (batidas como marcadores) |
| O usuário quer ouvir e mexer ao vivo | um editor de áudio de faixas (por exemplo REAPER, Audacity, Ardour): importe os stems do script, uma camada por faixa; o que ele mexer volta para o `cues.json` antes do render final |

Formato do `cues.json` e exemplos: veja o cabeçalho do script.

**Trilha só de tonais sob a narração:** os loops e as texturas são a música. Renderize a cama como uma faixa única (drone, loop, melodia, progressão), trate-a com o nível de música e deixe os hits e risers das viradas como pontuação à parte.

**Nível da música:** com a voz, cerca de 19 dB abaixo (15 dB em documentário). Confira o valor real medido no stem: o ganho que você escreveu não é o resultado.

## 5. Conferir

| O quê | Como |
|---|---|
| Sincronia | onsets no stem só de efeitos ou tonais, nunca no mix; `ouvir events --cues` confere uma lista de cues e mostra o acerto por acaso |
| Contra uma referência | só nas janelas em que o autor não fala, comparando a mixagem inteira no drop |
| Som de cena | confira antes de entregar: ambiência cruzando, sem silêncio morto, sem normalizar sozinho a −14 |
| Densidade em tutorial | conte os grupos de som por 10 s |
| Partitura contada | seção 4 da partitura |

## 6. Quem aprova

- **O ouvido final é do usuário.** Você mede e envia a prévia com som. Para A/B: referência, 2 s de silêncio, a sua, igualadas no drop.
- Um modelo de áudio pode dar uma segunda opinião estrutural (nível, estrutura, artefato, sincronia): `ouvir opinion`, só com o ok da pessoa para enviar o áudio. Volume, pico e silêncio vêm de `ouvir measure`. Ele erra nome de instrumento, inventa tempos e é mau juiz de reverb e de gosto: confira cada crítica no stem.
- Gosto de reverb ou de dose: envie 3 doses do mesmo trecho lado a lado.
