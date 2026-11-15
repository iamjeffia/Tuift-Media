---
name: gravar-janela
description: Gravar em vídeo (MP4) um software, uma janela, o navegador, uma aba, um componente específico (recortado do vídeo) ou um monitor inteiro por alguns segundos, em segundo plano e sem OBS, para depois assistir quadro a quadro. Usar sempre que o usuário pedir para gravar alguma coisa na tela, ou quando for preciso entender uma animação, transição, hover, loading ou qualquer movimento que um print não mostra (por exemplo, "grava o Meu App por 30 s enquanto eu mexo" ou "grava a animação do menu e recria no meu app"), ou para registrar um bug ou um trecho de uso.
---

# gravar-janela

Grava pela Windows Graphics Capture. A janela pode ficar **atrás de outras**: a pessoa continua usando o PC e o mouse não é tocado. Também funciona com app de GPU (Electron, Chrome), que no `gdigrab` sai preto.

`SKILL_DIR` = pasta deste arquivo. Script: `scripts/gravar.py`.

## Requisitos

- Windows 10 1903 ou mais novo, Python 3 e `ffmpeg` no PATH (confira com `ffmpeg -version`).
- Pacotes Python: `pip install windows-capture opencv-python pywin32 psutil`. O script avisa qual pacote falta.
- Sem esses requisitos, não há como gravar por aqui: diga isso à pessoa e peça que ela grave a tela com a ferramenta que já usa, então siga do passo 4.

## Passos

1. **Achar a janela**
   ```bash
   python "$SKILL_DIR/scripts/gravar.py" --listar
   ```
   Mostra HWND, processo e título. Janela minimizada não entrega quadros: restaure-a (ela pode ficar atrás das outras).

2. **Deixar o estado pronto.** Se a animação depende de uma ação (menu aberto, hover, abrir um menu), provoque-a antes ou logo no início, com computer use ou pelo navegador. Para pegar o começo de algo que você dispara, use `--atraso 1` e dispare durante esse segundo.

3. **Gravar**
   ```bash
   python "$SKILL_DIR/scripts/gravar.py" --janela "Meu App" --segundos 5 --fps 60 --saida demo.mp4
   ```
   - `--janela` = trecho do título; `--processo chrome` = trecho do nome do processo; `--hwnd N` = exato (título dinâmico).
   - `--monitor 1` grava o monitor inteiro.
   - `--sem-cursor` tira o ponteiro. `--fps 60` é o padrão; 30 basta para movimento lento.
   - Salve numa pasta temporária, ou na pasta de referências do projeto quando a gravação for virar referência.

4. **Recortar o componente** (opcional, ajuda muito a ler o movimento):
   ```bash
   ffmpeg -i demo.mp4 -vf "crop=400:300:1200:80" -c:v libx264 -crf 12 recorte.mp4
   ```
   Pegue as coordenadas num quadro: `ffmpeg -ss 1 -i demo.mp4 -frames:v 1 q.png`.

5. **Assistir quadro a quadro**: extraia os quadros com `ffmpeg` (por exemplo `ffmpeg -i demo.mp4 -vf fps=20 q_%04d.png`) e olhe-os em sequência, ou use uma skill de assistir vídeo se o ambiente tiver uma. Para medir curvas e durações, compare a posição do elemento em cada quadro.
   Conferência rápida de que houve movimento: `ffmpeg -i demo.mp4 -vf mpdecimate -f null -` (o `frame=` final é o número de quadros diferentes).

## Navegador

Página aberta no Chrome, no Edge ou no Brave: grave a janela com `--processo chrome` (ou `msedge`/`brave`) mais `--janela "<título da aba>"`. O título da janela é o da aba ativa, e só a aba ativa é desenhada: para gravar uma aba específica, deixe-a ativa (ou abra-a numa janela própria). Para um componente da página, grave a janela e recorte (passo 4). Página que você mesmo abre via Playwright: o `record_video_dir` do próprio Playwright também serve.

## Limites

- Só Windows 10 1903+.
- O WGC manda quadro só quando a tela muda; o script amostra num relógio fixo, então a duração do vídeo é o tempo real. Se aparecer "a gravação levou X s", baixe o `--fps`.
- Menu ou tooltip que abre como janela separada não entra na gravação de uma janela; use `--monitor`.
- Sem áudio.
