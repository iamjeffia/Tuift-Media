---
name: composicao-trilha
description: Compor a trilha sonora e o sound design de um vídeo de forma reativa ao que se vê e se diz, com sons tonais (drones, texturas, loops, melodias, acordes, hits, risers e transições gravados em tons definidos) e, quando houver, música real. Cobre tom, camadas, pontuação no quadro da virada, transições sem emenda, silêncio, abertura, fecho, mixagem sob a voz e revisão. Usar na etapa de trilha de qualquer vídeo, ao planejar, montar, mixar ou revisar trilha, intro tonal, remix cinematográfico, filme curto sem narração ou som de um vídeo narrado, e ao escolher ou posicionar sons tonais.
---

# Composição de trilha com sons tonais

A trilha é composta, não colada. Ela nasce do mapa de emoções do roteiro e reage à fala, aos cortes e à imagem, para a pessoa sentir o que o vídeo quer. Esta skill é um método: escolher o tom, montar uma cama contínua, trocar de sentimento na virada, pontuar no quadro certo, deixar o silêncio trabalhar e mixar sem brigar com a voz.

Ela não traz sons. Os arquivos vêm, nesta ordem, dos sons do próprio projeto, da biblioteca de sons do app (pelas ferramentas `sound_search`, `sound_use`, `music_search` e `music_use`, quando existem na sessão: sons tonais, efeitos, trilhas e músicas), da pasta de sons do usuário e, por último, de fontes públicas ou de síntese de emergência. Ver [fontes-de-som.md](references/fontes-de-som.md), que traz também o que fazer quando não há nenhuma biblioteca.

## O que é um som tonal

Uma terceira categoria entre o efeito comum e a música. O efeito comum (whoosh, boom, clique) é ruído sem nota e imita o mundo. A música é uma decisão emocional fechada, com tom, andamento e arco fixos. O som tonal é um som musical gravado em um tom definido, feito para empilhar afinado com qualquer outro som do mesmo tom e com a música no mesmo tom. Na prática ele é a trilha do trecho, não um efeito: monte primeiro a cama contínua e só depois pontue.

## Princípios

1. **Compor é decidir de propósito.** Cada som tem uma razão escrita na partitura.
2. **Comece pelo sentimento, não pelo som.** Primeiro o mapa de emoções do roteiro aprovado; depois os sons.
3. **Tudo no mesmo tom.** O tom da música, ou um tom-casa quando a trilha é original. Maior com maior e neutro; menor com menor e neutro; o relativo serve de coringa. Um som "parecido" em outro tom é nota errada.
4. **Segure o sentimento.** Um loop ou uma textura por trecho, repetido enquanto o assunto não muda.
5. **Mude na virada.** Troca de assunto é loop novo, base nova e um hit com o pico na emenda.
6. **O pico cai no quadro da virada.** Alinhe hits e risers pelo pico do arquivo, nunca pelo começo. O golpe vai 1 a 2 quadros depois do corte, nunca antes.
7. **A trilha ouve a fala.** Palavras-gatilho mudam a música: acelerar pede pulso rápido, tempo pede relógio, perigo pede ameaça, perda pede acordes, outra voz pede outro tom, conclusão pede maior.
8. **Som tonal é emoção e expectativa, não elemento.** Clique, card, contador e traço levam efeito comum que descreve a ação.
9. **O silêncio faz parte.** Respiro antes do impacto e nas frases fortes; a volta é puxada por uma transição, nunca "do nada".
10. **Ninguém percebe a emenda.** Cauda de reverb, textura que atravessa, volta pela EQ, rampa de velocidade; nada soa como volume caindo. Música real não recomeça no meio da fala: toca uma vez, na ordem dela, e a trilha passa aos poucos para tonais no mesmo tom.
11. **Menos, e cada camada com função.** Sob a fala, no máximo cama, loop e um tonal pontual. A voz manda.
12. **O ouvido final é do usuário.** Você mede e envia a prévia com som; um modelo de áudio só dá segunda opinião estrutural. Para medir e conferir (volume, pico, onde cada som começa, tom, andamento) use a skill `ouvir`.

## Fluxo em 8 etapas

| # | Etapa | O que fazer | Entregável |
|---|---|---|---|
| 1 | Base | Identifique o tipo de vídeo ([10-receitas-por-tipo.md](references/10-receitas-por-tipo.md)). Com música real, meça tom, BPM e afinação | seção 1 da partitura |
| 2 | Mapa de emoções | Com roteiro e narração aprovada na velocidade final, divida em trechos de um sentimento, marque viradas e palavras-gatilho ([06-trilha-reativa.md](references/06-trilha-reativa.md)) | seção 2 |
| 3 | Tom e paleta | Defina o tom-casa e o desvio, se houver ([03](references/03-tom-e-harmonia.md), [12](references/12-alavancas-e-arco.md)). Escolha por função: cama, loop, melodia, pontuação ([02](references/02-paleta-e-camadas.md)). Ouça alternativas antes de fixar | sons escolhidos e motivo |
| 4 | Partitura | Monte a timeline: abertura ([07](references/07-abertura-e-fecho.md)), loops por trecho, textura, pontuação e transições ([04](references/04-pontuacao-e-transicoes.md)), respiros ([05](references/05-silencio-e-dinamica.md)), fecho. Anote o tempo do pico de cada riser e hit | seção 3 |
| 5 | Conta | Preencha a partitura contada. Virou parede de som? Tem cor e respiro? Corte o que não tem função | seção 4 |
| 6 | Montagem | Posicione cada som pelo pico, com `scripts/mixar_cues.py` ou na ferramenta de áudio do usuário ([11-ferramentas-e-fluxo.md](references/11-ferramentas-e-fluxo.md)) | `cues.json`, `mix.wav` |
| 7 | Mix e conferência | Níveis e hierarquia ([09-mixagem.md](references/09-mixagem.md)); sincronia medida no stem; checklist abaixo | relatório e checklist |
| 8 | Ouvido e registro | Envie a prévia com som; anote o retorno na partitura | seção 6 |

Modelo de partitura: [templates/partitura.md](templates/partitura.md). Para um filme curto sem narração, com música original feita só de tonais, veja [13-filme-sem-narracao.md](references/13-filme-sem-narracao.md).

## Consulta rápida

| Peça | Função |
|---|---|
| Textura ou drone | o chão; ninguém nota |
| Loop | segura um sentimento por vários compassos |
| Melodia | o personagem, nos respiros da voz |
| Progressão de acordes | movimento; uma por vídeo, no momento de peso |
| Hit | pontuação com nota |
| Riser ou swell | a cola e a expectativa |
| Transição | troca de cena com o pico no corte |

| Momento | Pontuação |
|---|---|
| Troca de assunto | hit na emenda |
| Marca ou fato forte | hit enterrado no mix |
| Pessoa entrando, câmera revelando | swell baixo terminando no movimento |
| Volta à fala | transição no corte, depois respiro |
| Frase-tese | riser pequeno mais hit pequeno |
| Frase de efeito | tudo sobe e corta antes dela |
| Drop de uma música | riser com pico no tempo 1, golpe sem graves, corte seco do resto |

**Tom:** casa em tom menor, "outra voz" no quarto grau, volta por um riser ainda no tom de saída com o pico no primeiro som do tom de casa, fecho no maior próximo. Em tom menor, acordes e loops maiores saem do relativo maior (3 semitons acima).

**Abertura:** num narrado comum, a voz entra em 0 a 1 s e a trilha começa junto ou um instante antes. Escolha uma forma por vídeo. Começo suave; nada de música no volume máximo.

**Fecho:** loop maior "passivo" mais riser discreto cortando seco na última palavra; ou melodia que se resolve e some; ou chamada para ação com a música real. Se depois da última palavra vem logo, marca ou animação final, a trilha acompanha esse gesto e se desfaz no último quadro; nem corta nem fica em silêncio.

## Checklist antes de entregar

- [ ] Cada trecho tem cama contínua (drone mais melodia ou loop) no tom-casa; os tonais formam a trilha, não pontos soltos.
- [ ] Partitura preenchida (base, mapa de emoções, camadas com picos, conta).
- [ ] Todo som tonal no tom-casa ou no desvio planejado, com o modo certo; nenhum substituto "parecido".
- [ ] Cada troca de loop numa virada da história; hit na emenda; drones cruzando entre capítulos (o corte seco antes de uma frase de efeito é de propósito).
- [ ] Picos de riser e hit no quadro da virada, medidos no stem de tonais ou efeitos.
- [ ] Pelo menos um momento em que a trilha reage a uma palavra do roteiro.
- [ ] Respiro onde o roteiro pede; a volta puxada por uma transição.
- [ ] Nenhum tonal em elemento de interface.
- [ ] Narração seca; trilha abaixo da voz; nada soando como volume caindo; nenhuma emenda perceptível.
- [ ] Abertura suave e única; fecho decidido.
- [ ] Prévia com som enviada ao usuário; retorno anotado.

## Mapa das referências

| Arquivo | Assunto |
|---|---|
| [01-pensamento-de-trilha.md](references/01-pensamento-de-trilha.md) | por que compor; música pronta e tonal; achar, segurar, mudar, merecer |
| [02-paleta-e-camadas.md](references/02-paleta-e-camadas.md) | tipos de peça, loops, textura, melodia, progressão, ritmo, receitas de camada |
| [03-tom-e-harmonia.md](references/03-tom-e-harmonia.md) | casar o tom; modo; relativo; tom-casa com desvio; achar e conferir o tom |
| [04-pontuacao-e-transicoes.md](references/04-pontuacao-e-transicoes.md) | anatomia, alinhar pelo pico, onde pontuar, emendas |
| [05-silencio-e-dinamica.md](references/05-silencio-e-dinamica.md) | silêncio, respiro, build, drop, velocidade e escuridão |
| [06-trilha-reativa.md](references/06-trilha-reativa.md) | mapa de emoções, palavras-gatilho, corte e imagem, tonal contra efeito comum |
| [07-abertura-e-fecho.md](references/07-abertura-e-fecho.md) | formas de abrir e de fechar |
| [08-musica-real-e-cama-tonal.md](references/08-musica-real-e-cama-tonal.md) | receitas de intro, parada, troca e remix com música real |
| [09-mixagem.md](references/09-mixagem.md) | hierarquia, sob a narração, EQ, reverb, nivelar, conferir |
| [10-receitas-por-tipo.md](references/10-receitas-por-tipo.md) | qual trilha cada tipo de vídeo pede |
| [11-ferramentas-e-fluxo.md](references/11-ferramentas-e-fluxo.md) | medir, separar, montar, conferir, quem aprova |
| [12-alavancas-e-arco.md](references/12-alavancas-e-arco.md) | um tom, cinco alavancas e um arco emocional |
| [13-filme-sem-narracao.md](references/13-filme-sem-narracao.md) | filme curto com música original feita de camadas tonais |
| [fontes-de-som.md](references/fontes-de-som.md) | de onde vêm os sons: os do projeto, a biblioteca do app, a pasta do usuário; o que fazer sem biblioteca; síntese de emergência |

## Créditos

O conceito de "tonal sounds" (sons musicais gravados nos doze tons) foi popularizado pelo Multiply Sound. Esta skill é um método próprio, escrito do zero, e não inclui nem depende de nenhum pacote, curso ou texto dele.
