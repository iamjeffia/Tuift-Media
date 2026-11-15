# Render e revisão

## Revisar antes do render

- `ae_see` em lote nos quadros-chave e **no meio dos movimentos** (entrada, push, zoom, saída): pose parada não mostra robô. Com `reference`, REF, NOSSO e DIF lado a lado.
- Recortes ampliados do mesmo quadro para texto, bordas e sombras.
- `ae_review_motion` sem erro de enquadramento antes do render. Ele aponta câmera parada, pausa morta, linear sem mola, início simultâneo, texto pequeno (menos de 22 px em 1080), margem insegura (48 px), expressões com erro.
- Teste de editabilidade: mude o valor de um controle (por exemplo "Valor final"), leia o `Source Text` com `property.get` e volte.
- Salve o projeto e crie um `ae_checkpoint`.

## Render

Use `ae_render_video`: ele roda o `aerender` em segundo plano, em trechos, com várias threads e trava de memória, junta sem recodificar com BT.709, trata o áudio por fora e checa preto, quadros congelados e volume. Acompanhe com `ae_render_status`.

- **Trechos:** cerca de 30 s para comps comuns, 15 s para 3D e 10 s para projetos pesados; abrir o aerender custa algumas dezenas de segundos por trecho, então trechos muito curtos saem caros. Um trecho que falha é refeito sozinho sem multi-frame; refaça só um intervalo com `redo: [a, b]` e a mesma pasta de saída. Nunca use `software: true` no vídeo inteiro (muito mais lento); só no trecho que saiu preto por erro de GPU.
- **Modos:** `mode: "previa"` renderiza meia resolução de um trecho só, para conferir rápido; `mode: "turbo"` só no final.
- **Nunca renderize pela fila interna do After Effects** com "Best Settings" e codec H.264 de bitrate alto em projeto grande: a memória explode e o computador trava. Se a chamada cair, confira `ae_render_status` e `ffprobe` antes de renderizar de novo.
- **Caminho** sem acentos (o aerender não abre "ç"): o MCP usa o caminho curto ou uma cópia ASCII.
- **Projeto grande:** `project.purge` antes. Se aparecer erro de GPU sem memória, use `project.set_settings` com `bitsPerChannel: 8` e desfoque de movimento só na comp principal (limite de amostras 8 e adaptativo 16).
- **Antes do render completo**, renderize 3 s (`timeSpanDuration: 3`) e confira com `ffprobe`.
- **Cor:** o aerender grava BT.709 sem etiqueta; etiquete na junção, senão o vermelho escurece.
- **Footage sobrescrita** no mesmo caminho gera preto: importe uma cópia com nome novo.

## Depois do render

- `ae_avaliar_render` no arquivo final: nota medida mais um pacote para uma revisão externa. Pronto a partir de 85, revisar entre 70 e 85.
- Folha do MP4 a 2 qps (`ffmpeg -vf "fps=2,scale=216:384,tile=10x4"`) e `ffprobe` (quadros e duração esperados).
- Um modelo de visão pode dar uma segunda leitura (movimento robótico, texto, ritmo), mas a decisão é sua e do usuário; confira o que ele diz no próprio quadro.
- Registre o que aprendeu com `ae_lessons`.
