# Como ler cada resultado

Todo comando devolve `{"ok": true, "command": ..., "file": ..., ...}`. Com `"ok": false`, leia `error` e `fix`. Tempos em segundos, níveis em dB. Os limites de cada medida estão em [limites.md](limites.md).

## measure

```json
{"duration_s": 4.0, "sample_rate_hz": 44100, "channels": 1,
 "integrated_lufs": -23.6, "short_term_max_lufs": -24.8, "lra_lu": null,
 "true_peak_dbtp": -20.0, "peak_dbfs": -20.0, "rms_dbfs": -26.0, "crest_factor_db": 6.0,
 "noise_floor_dbfs": null, "dynamic_range_db": null, "clipped_samples": 0,
 "silence": {"start_s": 1.0, "end_s": 1.0, "floor_dbfs": -60.0, "gaps_inside": []},
 "bands_db": {"sub": -56.0, "low": -48.9, "lowmid": -2.2, "mid": -4.1, "presence": -64.6, "air": -72.2, "top": -78.3}}
```

- `integrated_lufs` é o volume do arquivo inteiro (BS.1770, com a porta de silêncio). Precisa de 0,4 s. Para um master de web, o alvo comum é perto de -14 LUFS; confira com a pessoa o destino.
- `true_peak_dbtp` é o pico entre as amostras (sobreamostrado 4x). Fica abaixo de -1 dBTP num master. `peak_dbfs` é o pico das amostras.
- `lra_lu` é a variação de volume ao longo do tempo (precisa de 6 s). `dynamic_range_db` é o trecho mais alto de 20 ms menos o piso de ruído; vem `null` quando o piso é silêncio digital. `crest_factor_db` é pico menos RMS.
- `silence.start_s` e `end_s` são os segundos de silêncio (picos abaixo de `floor_dbfs`, -60 por padrão, em quadros de 5 ms) no começo e no fim. Mude o piso com `--floor-db` se houver um ruído de sala. `gaps_inside` lista buracos de pelo menos 0,25 s no meio.
- `bandwidth_hz` baixo (por exemplo 16000) denuncia um corte de filtro ou um mp3 de baixa taxa. `clipped_samples` maior que zero é distorção por estouro.
- `sample_rate_hz` é o do arquivo, não o da análise.

## events

```json
{"event_count": 6, "events": [{"t": 0.5, "kind": "hit", "peak_t": 0.5, "peak_dbfs": -6.2,
   "prominence_db": 40.1, "length_ms": 19.0, "band": "full", "at_file_start": false}],
 "cue_check": {"hits": 4, "misses": 2, "hit_rate": 0.667, "chance_hit_rate": 0.093,
   "median_abs_offset_ms": 0.0, "missing": ["d (no sound)"], "notes": [], "cues": [
   {"time": 2.03, "label": "c", "tolerance_ms": 40.0, "status": "hit", "matched_on": "onset", "offset_ms": -30.0},
   {"time": 2.6, "label": "d (no sound)", "status": "miss", "nearest_offset_ms": 500.0}]}}
```

- `t` é onde o ataque começa (refinado a 1 ms). `peak_t` é onde o som é mais alto. Alinhe pelo pico quem sobe devagar (whoosh, riser); o ataque vale para clique e pancada. `kind: swell` é um crescendo. `prominence_db` é quanto o som subiu sobre o que vinha antes.
- `offset_ms` é **evento menos cue**: negativo, o som veio antes do cue; positivo, depois. `matched_on` diz se bateu pelo ataque ou pelo pico.
- `miss` traz o `nearest_offset_ms` do evento mais próximo (para você ver se foi por pouco).
- `hit_rate` contra `chance_hit_rate`: o segundo é a fração de tempos aleatórios que também acertariam. Se a diferença for pequena, o campo `notes` avisa que não prova sincronia.
- Formato da lista de cues (arquivo JSON ou texto JSON em `--cues`):
  ```json
  {"fps": 30, "cues": [{"time": 2.5, "label": "logo hit", "tolerance_ms": 40}, {"frame": 93, "label": "corte"}]}
  ```
  Aceita também uma lista simples de segundos (`[0.5, 1.2]`). `time` em segundos (ou `t`), `frame` precisa de `fps` (no arquivo ou em `--fps`), `tolerance_ms` por cue (ou `tolerance` em segundos), padrão `--tolerance-ms 40`.

## key

```json
{"key": {"best": "C major", "correlation": 0.908, "reliable": true, "why_not_reliable": [],
         "candidates": [{"key": "C major", "r": 0.908}, {"key": "C minor", "r": 0.598}]},
 "pitch": null,
 "tempo": {"bpm": 120.0, "bpm_alt": null, "confidence": "clear", "pulse_clarity": 0.972, "reliable": true}}
```

- Use `key.best` só com `reliable: true`. Com `false`, `why_not_reliable` diz o motivo (curto demais, uma nota só, o relativo parecido, a segunda candidata quase tão forte, correlação baixa) e você diz isso à pessoa.
- `pitch` aparece quando o arquivo é uma nota ou duas: nota, Hz e cents de desvio. Para um som tonal curto é a leitura certa.
- `tempo.bpm` só vem com confiança `clear` ou `weak`; use só `clear`. `bpm_alt` é o dobro quando também há pulso ali. `beats_s` lista as batidas (resolução de 10 ms) para casar cortes.

## compare

- **Dois arquivos:** `difference_b_minus_a` traz volume, pico, alcance, ruído, brilho e duração (B menos A), e `in_words` diz em frases ("B está 6,0 LU mais baixo que A"). Para comparar o efeito de uma mixagem, compare no mesmo trecho e leve em conta a diferença de volume antes de falar de timbre. Com os modelos instalados, `listening_model` acrescenta a leitura de escuta (`--query "descrição"` diz qual dos dois chega mais perto).
- **Arquivo contra descrição** (`--text`): `verdict` e `z`. `z >= 3` forte, `2,5 a 3` plausível, `2 a 2,5` fraco, abaixo de 2 nenhuma correspondência. `p_vs_alts` só diz qual das frases (a sua e as `--alt`) encaixa melhor; não é probabilidade de acerto. `closest_vocab` traz os que mais se parecem com o som. Com um verdict fraco, tente duas ou três redações da descrição e confie na leitura que se sustenta.

## describe

- `overall.summary` descreve o som em uma frase com os números; `top_tags` são os rótulos com `z`; `audioset` são classes gerais com probabilidade.
- `over_time.sections` mostra onde o som muda de caráter; `over_time.events` lista os eventos com `t`, os palpites de tipo e `prominence_db`. Os tempos e os níveis são medidas; os rótulos são palpites.
- `--quick` pula o `over_time`. A parte `over_time` só existe a partir de 3 s.

## find

`segments` traz `start` e `end` (um trecho para cortar), o `z` com o `verdict`, `kind` (`stroke` é um som que decai, `event` junta golpes que andam juntos, `window` é um pedaço de textura) e `head_db` e `tail_db` (volume dos 5 ms iniciais e dos 10 ms finais contra o pico; -30 ou menos é limpo). `cut` marcado (`head cut`, `tail cut`) quer dizer que o trecho começa ou termina no meio de um som: não use como está. Um melhor trecho só "fraco" pode significar que a gravação não tem esse som.

## speech

`segments` com `start`, `end` e `text`; `backend` diz quem transcreveu e `audio_left_the_machine` diz se o áudio foi para a nuvem. Vazio quer dizer que não achou fala (ou que o backend falhou em silêncio: confira o volume com `measure`).

## opinion

`result.critique` traz nota geral, veredito, problemas com tempo e gravidade e correções sugeridas, na régua de filmes de lançamento de produto. Apresente como "segunda opinião de um modelo", cite os tempos como aproximados e confirme cada correção com `events` ou `measure`. `result.uploaded` registra o que foi enviado e se o arquivo temporário foi apagado do Google.
