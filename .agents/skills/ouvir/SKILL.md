---
name: ouvir
description: Ouvir e medir áudio que o agente não consegue ouvir, e devolver JSON com números e tempos. Mede volume (LUFS), pico, silêncio, onde cada som começa e se cai nos cues, tom e andamento, descrição, comparação, melhor trecho, fala e, com o ok da pessoa, a segunda opinião de um modelo que ouve. Usar depois de mixar, antes de entregar, ao escolher sons e quando pedirem "ouve isso" ou "está no tempo?".
license: Apache-2.0
allowed-tools: Bash, Read, AskUserQuestion
metadata:
  version: "0.1.0"
---

# Ouvir

Você não ouve. Antes de dizer como um áudio soa, que um som "encaixa" ou que um efeito cai no corte, rode um comando daqui e cite o número ("-14,2 LUFS", "o hit começa 8 ms depois do cue"). O ouvido final é da pessoa: o que esta skill dá é evidência, nunca gosto.

Ela usa o [earshot](https://github.com/Leonxlnx/earshot) (MIT, de Leon Lin) como motor, numa versão fixa instalada numa pasta própria. A licença dele está em [EARSHOT-LICENSE](EARSHOT-LICENSE).

## Resolver a pasta e o Python

`SKILL_DIR` é a pasta absoluta deste `SKILL.md`; `scripts/` fica ao lado. Use um Python 3.10+ do sistema (`python3` no macOS e Linux; no Windows confira `python --version` ou `py -3 --version`). O launcher só usa a biblioteca padrão. A análise roda no ambiente próprio da skill.

```bash
python3 "${SKILL_DIR}/scripts/ouvir.py" <comando> ARQUIVO [opções]
```

Todo comando imprime um objeto JSON no stdout (`"ok": true` ou `"ok": false` com `error` e `fix`) e mensagens de andamento no stderr. Códigos de saída: 0 certo, 1 erro no arquivo ou no pedido, 2 falta instalar algo, 3 falta o ok da pessoa.

## Primeira vez: a instalação

```bash
python3 "${SKILL_DIR}/scripts/ouvir_setup.py"
```

Devolve o estado em JSON. Nada é instalado sem pedir: os dois instaladores recusam rodar sem `--yes`, e o `--yes` só vale depois que a pessoa disse sim.

1. **ffmpeg e ffprobe** são necessários e o app não os traz. Se faltarem, o estado traz o comando (Windows `winget install --id Gyan.FFmpeg --exact`, macOS `brew install ffmpeg`, Linux o gerenciador de pacotes). Peça para a pessoa instalar ou peça licença para instalar, e reabra o terminal depois. O mesmo caminho da skill `watch`.
2. **uv** cria o ambiente. Se faltar, o estado traz o comando.
3. **Motor de medida (obrigatório para quase tudo).** Pergunte, dizendo o tamanho e o lugar: "Instalar o motor de áudio? Cerca de 350 MB de disco, numa pasta própria em `~/.cache/ouvir`, sem mexer no resto do computador." Se ela aceitar:
   ```bash
   python3 "${SKILL_DIR}/scripts/ouvir_setup.py" --install --yes
   ```
   Libera `measure`, `events`, `key` e `compare` entre dois arquivos.
4. **Modelos que ouvem (opcional).** Só quando o pedido precisar de `describe`, `find` ou `compare --text`. Pergunte: "Isso precisa de dois modelos de escuta: baixa cerca de 1,3 GB e ocupa cerca de 4,5 GB de disco, também na pasta própria. Pode baixar?" Se ela aceitar:
   ```bash
   python3 "${SKILL_DIR}/scripts/ouvir_setup.py" --install-models --yes
   ```
   Depois de instalados, nenhum áudio sai do computador nesses comandos.
5. **Fala e segunda opinião** usam a configuração da skill `watch` (`~/.config/watch/.env`): o mesmo motor de transcrição e a mesma chave do Gemini. Uma configuração serve às duas skills; se estiver faltando, rode a configuração do `watch`, não a daqui.

Se `first_run` já passou (o estado mostra `measuring_ready: true`), siga sem avisar nem perguntar de novo.

## Os comandos

| Para quê | Comando | O que vem |
|---|---|---|
| **Medir** | `measure ARQUIVO` | `integrated_lufs`, `true_peak_dbtp`, `peak_dbfs`, `lra_lu`, `dynamic_range_db`, `crest_factor_db`, `noise_floor_dbfs`, `sample_rate_hz`, `duration_s`, `silence` (início, fim e buracos no meio), bandas |
| **Eventos e cues** | `events ARQUIVO [--cues cues.json] [--tolerance-ms 40]` | onde cada som começa (`t`) e onde é mais alto (`peak_t`); com `--cues`, quais cues têm som dentro da tolerância e quais não |
| **Tom e andamento** | `key ARQUIVO` | `key.best` com `reliable` e `why_not_reliable`; `tempo.bpm` com `confidence`; `pitch` para uma nota só |
| **Comparar dois arquivos** | `compare A B` | diferenças medidas (volume, pico, brilho, ruído) em números e em palavras; com os modelos, também a leitura de escuta |
| **Comparar com uma descrição** | `compare ARQUIVO --text "um clique curto de mouse" [--alt "outra leitura"]` | `z` e veredito (forte, plausível, fraco, nenhum) |
| **Descrever** | `describe ARQUIVO [--quick]` | o que se ouve e, ao longo do tempo, as seções e os eventos com palpites de tipo |
| **Achar o melhor trecho** | `find ARQUIVO "uma batida seca" [--top 3]` | trechos em segundos, cada um com o `z` e se começa ou termina cortado |
| **Fala** | `speech ARQUIVO [--backend whisperx\|groq\|openai]` | segmentos com início, fim e texto |
| **Segunda opinião** | `opinion ARQUIVO --yes-upload [--question "..."]` | texto e notas de um modelo que ouve, marcado como opinião |

`--start` e `--end` (segundos) restringem a análise a um trecho, em todos menos `speech` por backend de nuvem (a nuvem recebe o áudio inteiro e o resultado é filtrado depois). Arquivo de vídeo serve: o áudio dele é lido. Para uma frase, escreva o som, não o uso: "um clique de madeira numa sala pequena", não "um som para o botão".

## Quando usar

- **Depois de mixar e antes de entregar:** `measure` na mix (volume integrado, pico real abaixo de -1 dBTP para um master, silêncio de começo e fim) e `events --cues` no stem de efeitos.
- **Para conferir sincronia:** monte a lista de cues com o tempo de cada corte ou pancada pretendida e rode `events --cues` **no stem só dos efeitos**, não na mix final. Na mix, música e voz têm ataques por toda parte e o acerto sai alto por acaso; o resultado traz `chance_hit_rate` para você ver isso.
- **Ao escolher entre sons:** `compare --text` para a pergunta "isto é o que eu pedi?", `find` para o trecho limpo de uma gravação longa, `compare A B` para a mix antes e depois.
- **Na trilha:** `key` para saber o tom de uma música antes de empilhar sons tonais (ver `composicao-trilha`).
- **Quando a pessoa pedir "ouve isso":** `describe`, e conte o que veio com os tempos. Se ela quiser opinião de gosto, entregue os números e a lista curta; quem decide é ela.

## Como ler o resultado

A leitura campo a campo está em [references/resultados.md](references/resultados.md) e os limites com as evidências em [references/limites.md](references/limites.md). O essencial:

- **Medida é medida.** LUFS, pico, silêncio e tempos de ataque são medidores; dê o número e o arquivo. Mono: o volume é a leitura de um canal, igual à do medidor do ffmpeg.
- **Cue check.** `status: hit` com `offset_ms` (negativo = o som veio antes do cue). `miss` traz o `nearest_offset_ms`. Se `hit_rate` não passa `chance_hit_rate` por uma boa margem, o resultado diz que não prova sincronia; reconfira num stem ou ouça os trechos.
- **Tom e andamento.** Só confie em `key.best` quando `reliable` for `true` e no `tempo.bpm` quando `confidence` for `clear`. Em um tom isolado, uma nota curta ou um acorde só, o resultado diz que não dá para saber o tom e entrega o `pitch`. O andamento pode vir na metade ou no dobro do sentido (`bpm_alt`).
- **Etiquetas dos modelos** (`describe`, `find`, `compare --text`) são palpites calibrados. Em som isolado e limpo acertam bem; numa mix densa, mais ou menos a metade das vezes. Os tempos e os níveis ao lado delas são medidas.
- **Segunda opinião** é a opinião de um modelo que ouviu uma cópia reduzida. Diga que é segunda opinião e nunca a trate como medida; os tempos dela são aproximados e ela não é determinística. Pode levar vários minutos. Antes de qualquer correção, confirme com `events` ou `measure`.

## O que sai do computador

Nada, em `measure`, `events`, `key`, `compare`, `describe` e `find`: rodam na CPU, e os modelos só são baixados na instalação.

Só saem áudio nestes dois casos, ambos escolhidos pela pessoa:

- `speech` com backend de nuvem (`groq` ou `openai`) manda o áudio extraído ao serviço. Com `whisperx` (local), nada sai. O resultado traz `audio_left_the_machine`.
- `opinion` manda o áudio (mono reduzido) ao Google Gemini. Exige a chave já configurada para a skill `watch` e a flag `--yes-upload`: pergunte à pessoa se esse áudio pode ser enviado e só depois use a flag. Nunca por conta própria.

Credenciais ficam na configuração do `watch`; esta skill não as grava nem imprime.

## Se algo falhar

O `error` diz o que houve e o `fix` diz o que fazer; diga isso à pessoa em uma linha e tente o caminho do `fix`. Sem ffmpeg: instale (acima). Sem motor: pergunte e instale. Arquivo sem faixa de áudio: o erro avisa. Não troque de comando em silêncio por outro que dê um resultado parecido.

## Pasta

`scripts/ouvir.py` (comandos), `scripts/engine.py` (análise, roda no ambiente próprio), `scripts/ouvir_setup.py` (estado e instalação), `scripts/test_ouvir.py` (testes com áudio gerado: `python scripts/test_ouvir.py`). O motor fica em `~/.cache/ouvir` (mude com `OUVIR_HOME`); apagar essa pasta desfaz a instalação. Os comandos de modelo guardam em `earshot/` desta pasta o áudio decodificado (cerca de 23 MB por minuto) e as leituras de cada arquivo; apague as subpastas `decoded` e `emb` para liberar espaço.

Construída sobre o earshot v0.4.1 (commit `4ac3d2a`, MIT, Copyright 2026 Leon Lin). Código desta skill: Apache-2.0, Copyright 2026 TUIFT Media.
