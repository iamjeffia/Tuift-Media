# De onde vêm os sons

Esta skill não traz áudio. Os sons que ela descreve (drone, loop, melodia, hit, riser, transição) vêm de uma biblioteca que o usuário tem ou que o app oferece.

## Ordem de busca

Na etapa de trilha, procure nesta ordem e pare no primeiro lugar que resolve:

1. **Os sons do próprio projeto.** Se o projeto já tem sons (uma pasta `audio/`, `sons/`, `sfx/` ou `music/` com arquivos), são os que o usuário escolheu: use esses primeiro. O app avisa no começo da sessão quando o projeto tem sons próprios e onde ficam; sem esse aviso, olhe essas pastas uma vez, de relance, sem abrir arquivo por arquivo. Só vá adiante para o que esses sons não cobrem.
2. **A biblioteca de sons do app**, quando as ferramentas dela existem na sessão: `sound_search`, `sound_use`, `music_search` e `music_use`. É a biblioteca do Clube do Motion, aberta pela conta que o usuário conectou no app: sons tonais em todos os tons, efeitos e músicas. Como usar está logo abaixo.
3. **A pasta de sons do próprio usuário**, a que ele indicou nos Ajustes do app (o aviso do começo da sessão diz o caminho; nada nela é copiado nem indexado) ou, sem essa indicação, a que ele disser quando você perguntar uma vez, no começo. Pergunte também de qual tom e modo cada pacote costuma ser organizado; muitos vêm em uma pasta por tom.
4. **Fontes públicas com licença clara** (por exemplo bibliotecas de domínio público ou Creative Commons): confira a licença de cada arquivo e o uso em vídeo comercial antes de baixar. Peça autorização ao usuário antes de baixar.
5. **Síntese de emergência** (abaixo), quando nada disso existe e o usuário quer seguir mesmo assim.

Pacotes comprados são do usuário: não copie, não redistribua e não os coloque em repositório público.

## A biblioteca do app

Ela é só o que o usuário tem direito de usar com a conta dele, e chega um som por vez, quando você o usa. Não há como baixar a biblioteca inteira e você não deve tentar.

- **Busque antes de usar.** `sound_search` filtra por texto, tipo (`tonal`, `efeito`), categoria, tom, modo e faixa de BPM; `music_search`, por texto, gênero, clima, artista, tom e BPM. Buscar não gasta nada do limite do dia. Descreva o que precisa por função, tom, modo e duração (seção seguinte) e escolha pelo resultado.
- **Use só o que escolheu.** `sound_use` traz um arquivo para a pasta `audio/clube/` do projeto e responde o caminho absoluto, o formato, a duração e o volume (LUFS); `music_use` traz as versões em WAV da faixa para `audio/clube/music/<nome da faixa>/`. O nome do arquivo guarda o nome do som (instrumento, tom e modo estão nele). Pedir o mesmo som outra vez devolve o arquivo que já está lá, sem gastar o limite.
- **Os limites são do usuário.** Uma conta tem cerca de 200 arquivos de som e 60 faixas por dia. Escolha antes de usar; não traga dez alternativas para ouvir. Se o limite acabar, a resposta diz; avise o usuário e siga com o que o projeto já tem.
- **Tom e BPM de música são estimativas.** Confira com a skill `ouvir` antes de montar a trilha sobre eles. Os de um som tonal são de gravação e valem como estão.
- **Se a ferramenta responde que não pode** (sem conta conectada, sem assinatura, biblioteca desligada nos Ajustes), diga ao usuário o que ele pode fazer, que a própria resposta traz, e passe para o próximo lugar da ordem. Nunca finja que usou um som que não veio.
- **Se a sessão não tem as ferramentas** (alguns provedores não alcançam as ferramentas do app), peça ao usuário para escolher os sons na aba Sons do painel lateral: ela busca, toca a prévia e anexa o som escolhido ao chat. Trabalhe com os arquivos anexados.

## Descrever o som que se precisa

Ao pedir ou escolher um som, descreva-o por função, tom, modo e duração, não por nome de produto:

- drone ou textura em Lá menor, 40 a 90 s, sem pulso;
- loop de dúvida em Lá menor, 8 a 16 compassos, 90 BPM;
- melodia de cello em Lá, nos respiros da voz;
- riser de 8 a 12 s em Lá, com pico perto do fim;
- hit grave com cauda em Lá, ataque em menos de 25 ms;
- transição neutra de 5 a 8 s com pico no meio.

Com a descrição em mãos, ouça as alternativas e confira o tom antes de fixar.

## Se não houver nenhuma biblioteca

Diga ao usuário e ofereça duas saídas: (a) ele indica uma pasta de sons ou uma fonte livre; (b) você gera material básico por síntese, ciente de que soa mais simples que gravações reais. Não invente que um som existe e nunca finja que usou um pacote que você não tem.

### Síntese básica com ffmpeg

Valores no tom de Lá (A2 = 110 Hz). Os comandos usam aspas do Git Bash ou do Linux e macOS; no PowerShell, troque as aspas externas.

Drone em Lá menor (A2, E3, A3 empilhados, passa-baixas e fades):

```bash
ffmpeg -f lavfi -i "aevalsrc='0.3*sin(2*PI*110*t)+0.2*sin(2*PI*164.81*t)+0.15*sin(2*PI*220*t)':d=30:s=48000" \
  -af "lowpass=f=900,afade=t=in:d=3,afade=t=out:st=27:d=3" drone_A.wav
```

Riser (seno que sobe de frequência, com pico em 4 s e queda rápida):

```bash
ffmpeg -f lavfi -i "aevalsrc='sin(2*PI*(200*t+120*t*t))*pow(min(t/4,1),2)*if(lt(t,4),1,exp(-(t-4)*8))':d=5:s=48000" riser_A.wav
```

Hit grave com cauda:

```bash
ffmpeg -f lavfi -i "aevalsrc='(sin(2*PI*55*t)+0.4*sin(2*PI*110*t))*exp(-3*t)':d=4:s=48000" hit_A.wav
```

Para outro tom, troque as frequências (A2 = 110 Hz; cada semitom multiplica por 1,0595). Confira o pico dos arquivos com `python scripts/mixar_cues.py --medir arquivo.wav`.

Limites: esses sons são puros e sem timbre. Servem para ensaiar a partitura e a sincronia e para vídeos em que o usuário aceita um som sintético; para o resultado final, o usuário deve fornecer gravações.
