# Som para motion de app: um efeito por ação

Para música, trilha tonal, silêncio, abertura e fecho, use a skill `composicao-trilha` quando ela estiver disponível. Este documento cobre só o que é específico de motion de app: efeitos que acompanham ações da interface e a mixagem por script.

## Efeitos por ação

Os efeitos vêm da biblioteca de sons da sessão (os arquivos do usuário ou a biblioteca do app, quando existir). Peça ao usuário uma pasta de efeitos se não houver nenhuma. Cada ação ganha um efeito do tipo certo, sem repetir o mesmo arquivo em ações seguidas.

| Ação | Tipo de efeito | Volume de partida (sem voz) |
|---|---|---|
| relógio passando na noite | tique-taque contínuo como cama, com fade, cortado na virada | 0,40 |
| notificação chega | notificação curta, duas variações alternadas | 0,35 a 0,50 |
| virada para o claro | whoosh longo | 0,50 |
| celular entra | whoosh grave | 0,45 |
| zoom no elemento | whoosh curto | 0,40 |
| contorno ou destaque acende | clique | 0,60 a 0,90 |
| troca de tela (push) | whoosh curto, um diferente por troca | 0,45 |
| balão de conversa | pop, dois alternados | 0,35 |
| aviso, número chega | pop com mais corpo | 0,70 |
| selo acende | clique suave | 0,90 |
| número contando | rolagem de contador | 0,70 |
| logo, selo e botão aparecem | pops de alturas diferentes | 0,35 a 0,60 |
| cursor clica | clique de mouse (`at = t − pico`) | 0,50 |
| anel do clique | som de sucesso curto | 0,35 |

`ae_sound_cues` lista onde cada efeito cabe a partir das chaves; `ae_place_sfx` posiciona o arquivo com o pico no evento (`início = evento − pico`). Sem voz, os acentos curtos sob o groove precisam subir: 1,5 a 11 dB abaixo da trilha, nenhum acima.

## Com narração

- Voz a −14 a −16 LUFS de referência; trilha 15 a 19 dB abaixo da voz, subindo nas pausas e no fechamento e zero nos últimos 0,4 s.
- Efeitos no máximo dois ao mesmo tempo sob a voz: acento 0,35, transição 0,5, cama 0,4.
- Nenhuma palavra fica coberta por whoosh: desloque o efeito para a pausa mais próxima.

## Mixagem por script

`scripts/mixar_modelo.py` é um modelo: copie para a pasta do projeto, edite a lista de cues num `cues.json` e rode. Ele precisa de Python 3 e ffmpeg no PATH.

1. Stem de efeitos: cada cue com `adelay` e `volume`, `amix normalize=0`, na duração exata do vídeo.
2. Stem da trilha: ganho para cerca de −20 LUFS na mixagem, corte na duração e fade de 0,4 s no fim.
3. Soma e `loudnorm` em duas passagens, linear, −14 LUFS e −1,5 dBTP.
4. Vídeo: `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k` (a imagem não é renderizada de novo).
5. Conferência: `ebur128` no MP4, atraso do AAC por correlação cruzada com o `mix.wav` (deve dar 0) e a diferença efeito × trilha em cada cue.
6. Importe os stems no projeto, com o ganho da normalização em "Audio Levels".
