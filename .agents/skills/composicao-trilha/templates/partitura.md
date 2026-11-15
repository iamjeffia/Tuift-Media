# Partitura: [nome do vídeo]

Status: rascunho, em teste ou aprovada. Data: AAAA-MM-DD.

A trilha deste vídeo em uma tela: tipo e receita, tom-casa, mapa de emoções, camadas com o tempo de cada uma e conferência. Copie para a pasta do projeto (por exemplo `audio/partitura.md`) e preencha antes de montar o som. Método: skill `composicao-trilha`.

## 1. Base

| Campo | Valor |
|---|---|
| Tipo de vídeo | narrado só com tonais, narrado com música real, abertura com música real, sem narração (hype), reel musical, sync edit, som de cena |
| Receita | de `references/10-receitas-por-tipo.md` |
| Duração | s |
| Narração | arquivo aprovado ou "sem narração" |
| Música real | nome, trecho, tom medido, BPM, afinação em cents; ou "nenhuma" |
| Tom-casa | por exemplo Lá menor. Desvio previsto: por exemplo Ré menor no bloco X |
| Modo dos sons | menor combina com menor e neutro; maior com maior e neutro (mistura só de propósito, pelo relativo) |
| Montagem | `scripts/mixar_cues.py` / ferramenta de áudio do usuário |

## 2. Mapa de emoções (a partir do roteiro aprovado)

Uma linha por trecho, com um sentimento. Marque viradas e palavras-gatilho (acelerar, parar, tempo, crescer, cair, perigo, conclusão).

| # | De–até (s) | Fala ou imagem | Sentimento | Virada? | Palavra-gatilho | Decisão de trilha |
|---|---|---|---|---|---|---|
| 1 | 0,0–5,0 | gancho | curiosidade | — | — | riser e relógio, transição, loop 1 |
| 2 | | | | sim (assunto novo) | | hit na emenda, loop 2, drone novo |
| 3 | | volta à fala | | | | respiro de 1 a 2 s |
| n | | conclusão | resolução | | | loop maior e riser discreto, corte seco |

### Alavancas por trecho ([12](../references/12-alavancas-e-arco.md))

Dois trechos seguidos não repetem a mesma linha; cada virada muda pelo menos duas alavancas. Alavanca guardada: ___ (solta em ___ s).

| # | Momento | Cor | Pulso | Camadas | Grave | Volume |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## 3. Camadas (a timeline da trilha)

Para risers e hits, o tempo é o do **pico**, não o começo do arquivo.

| Camada | Arquivo | Tom | Entra (s) | Sai (s) | Pico em (s) | Entrada e saída | Nível | Por quê |
|---|---|---|---|---|---|---|---|---|
| Loop 1 | | | | | — | colado, corte na virada | | dúvida do gancho |
| Textura | | | | | — | fade-in, sobe até o corte | | base |
| Riser | | | | | (= quadro do corte) | — | | prepara a frase X |
| Hit | | | | | (= emenda) | — | enterrado | esconde a troca |

## 4. Partitura contada

| Categoria | Quantos | Observação |
|---|---|---|
| Loops | | |
| Texturas e drones | | |
| Melodias | | |
| Progressões de acordes | | |
| Risers e transições | | |
| Hits | | |
| Respiros e silêncios | | duração de cada um |
| Música real | | só no bloco "outro mundo"? |
| Efeitos comuns (elementos) | | nunca tonal |

Pergunta de controle: virou parede de som ou tem cor e respiro? Cada camada tem função?

## 5. Conferência

- [ ] Todo som tonal no tom-casa ou no desvio planejado; nenhum substituto "parecido".
- [ ] Picos de riser e hit no quadro da virada (medidos no stem).
- [ ] Nenhuma camada some com volume caindo; loops trocam nas viradas; drones cruzam.
- [ ] Música abaixo da voz no nível combinado; narração seca.
- [ ] Nenhum tonal em elemento de interface.
- [ ] Prévia com som enviada ao usuário.
- [ ] Retorno anotado aqui.

## 6. Retorno e versões

| Versão | O que mudou | Retorno |
|---|---|---|
| v1 | | |
