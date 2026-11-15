# TUIFT Code branding

> Data: 2026-11-15 · Tipo: guia · Status: vigente

**Resumo:** o que este fork muda em relação ao TasteCode (`upstream`) e como manter a marca depois de cada atualização. Interface, features e comportamento ficam iguais aos do TasteCode.

## O que muda

| O quê                             | TasteCode               | TUIFT Code              | Por quê                                 |
| --------------------------------- | ----------------------- | ----------------------- | --------------------------------------- |
| Nome na tela, instalador e janela | Taste Code / TasteCode  | TUIFT Code              | marca                                   |
| Ícone e marca do onboarding       | T do TasteCode          | T (ou mascote v2)       | marca                                   |
| ID do app                         | `dev.tastecode.desktop` | `media.tuift.code`      | instalar ao lado do TasteCode           |
| Pasta do Electron                 | `%APPDATA%/TasteCode`   | `%APPDATA%/TUIFT Code`  | pasta própria, separada do TasteCode    |
| Pasta de configuração             | `~/.tastecode`          | `~/.tuift-code`         | não ler nem mover os dados do TasteCode |
| Cofre de senhas                   | `PersonalHarness`       | `TUIFTCode`             | não mexer nas contas do TasteCode       |
| Porta do servidor local           | 4311                    | 4317                    | rodar os dois apps ao mesmo tempo       |
| Atualizações e link "Source"      | `Leonxlnx/tastecode`    | `iamjeffia/Tuift-Media` | não baixar o instalador do TasteCode    |

Ficam como estão: nomes internos (`tastecode-attachment`, `TASTECODE_*`, `@harness/*`), `LICENSE`, créditos do TasteCode, `docs/` do upstream e as skills embutidas.

## Ícones

`python branding/gerar-icones.py mascote` (ou `t`) gera as duas opções em `branding/mascote/` e `branding/t/` e copia a escolhida para `apps/desktop/assets` e `apps/mobile/assets`. Aplicada: `t` (15/11). A marca do onboarding (`TuiftMark` em `apps/web/src/ui/Onboarding.tsx`) desenha o mesmo T; se trocar o ícone, troque ela também.

## Depois de cada atualização do TasteCode

```text
git fetch upstream
git merge upstream/main
python branding/aplicar-marca.py
python branding/aplicar-marca.py --checar
pnpm format
pnpm test
```

O `aplicar-marca.py` só mexe no que ainda estiver com a marca antiga. Se o upstream criar um ícone ou um caminho novo, acrescente a troca na lista `TROCAS` do script.
