# De onde vêm os sons

Esta skill não traz áudio. Os sons que ela descreve (drone, loop, melodia, hit, riser, transição) vêm de uma biblioteca que o usuário tem ou que o app oferece.

## Ordem de busca

1. **A biblioteca de sons do app**, quando existir na sessão. Procure por tipo, tom e duração.
2. **Os arquivos do usuário:** pergunte uma vez, no começo, onde está a pasta de sons (um pacote comprado, efeitos próprios, trilhas licenciadas). Pergunte também de qual tom e modo cada pacote costuma ser organizado; muitos vêm em uma pasta por tom.
3. **Fontes públicas com licença clara** (por exemplo bibliotecas de domínio público ou Creative Commons): confira a licença de cada arquivo e o uso em vídeo comercial antes de baixar. Peça autorização ao usuário antes de baixar.
4. **Síntese de emergência** (abaixo), quando nada disso existe e o usuário quer seguir mesmo assim.

Pacotes comprados são do usuário: não copie, não redistribua e não os coloque em repositório público.

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
