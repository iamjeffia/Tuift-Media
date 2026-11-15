---
name: motion-app-ae
description: "Fazer motion de app, SaaS, interface ou produto no After Effects pelo MCP do After Effects que acompanha o TUIFT Code (ver o quadro, revisar o movimento, operações de movimento prontas, render em segundo plano), ou em HTML determinístico quando o pedido exige seek(t) e 60 qps. Cinco rotas: app no celular com câmera e telas reais; telas de apps encadeadas no ritmo da música; produto 3D com interface colada na tela; tipografia e interfaces horizontais; filme de produto horizontal por linha do tempo em HTML. Usar para animação de app, demo de SaaS, tour de loja feito de telas, motion de interface, com ou sem narração; escolher a rota pelo pedido."
---

# Motion de app, produto e interface no After Effects

Método próprio para animar apps, interfaces e produtos com acabamento, usando o After Effects pelo MCP que acompanha o TUIFT Code. Cada rota é uma receita de técnica e de números de partida; nenhuma depende de arquivos de projeto prontos. O que for específico do cliente (marca, telas, fontes, fotos) o usuário fornece.

## Escolher a rota pelo pedido

| Pedido | Rota | Leia |
|---|---|---|
| App ou SaaS no celular: problema, virada, 3 a 4 telas, resultado, fecho de marca | App no celular | [rota-app-no-celular.md](references/rota-app-no-celular.md) |
| Telas de apps do celular recriadas e encadeadas no ritmo de uma música; tour de loja ou de produto feito de telas | Telas encadeadas | [rota-telas-encadeadas.md](references/rota-telas-encadeadas.md) |
| Produto físico em 3D (relógio, celular, fone) com a interface colada na tela e elementos saindo do aparelho | Produto 3D | [rota-produto-3d.md](references/rota-produto-3d.md) |
| Tipografia grande, interfaces horizontais, cursor, arrastar objetos entre janelas, logos e cartões de resultado | Tipografia e interfaces | [rota-tipografia-e-interfaces.md](references/rota-tipografia-e-interfaces.md) |
| Filme de produto horizontal de 15 a 20 s por linha do tempo, com `seek(t)`, 60 qps reais e subquadros, sem passar pelo After Effects | Filme de produto em HTML | [rota-filme-produto-html.md](references/rota-filme-produto-html.md) |
| Recriar a animação de um vídeo de referência | Medir cada peça quadro a quadro e virar chaves; use uma skill de captura de movimento, se houver, e as curvas de [curvas-e-molas.md](references/curvas-e-molas.md) | — |
| Tela sobre filmagem real (pessoa segurando o celular) | Corner Pin por rastreio de quatro pontos; a tela é uma precomp no tamanho do aparelho | — |

Base comum a todas: [curvas-e-molas.md](references/curvas-e-molas.md) (curvas, mola, escalonamento, vida na pausa), [ponte-ae-mcp.md](references/ponte-ae-mcp.md) (operações e caminhos de propriedade), [armadilhas-extendscript.md](references/armadilhas-extendscript.md), [render-e-revisao.md](references/render-e-revisao.md) e [som-e-mixagem.md](references/som-e-mixagem.md).

## O MCP do After Effects

O servidor é o MCP do After Effects que acompanha o TUIFT Code. Confira que ele está ligado e que o After Effects está aberto com um projeto salvo (`ae_project_info`). Se o servidor não estiver disponível, diga ao usuário e use a rota HTML, que não precisa do After Effects.

Ciclo de trabalho, na ordem:

1. **Plano.** Cenas e tempos num JSON; `ae_plano_check` aponta buracos, sobreposição, texto demais e fala sem cena, e não precisa do After Effects. `ae_context` e `ae_get_skill` (nome `ae-clean-rig`) antes de construir.
2. **Construir** com `ae_do` (`batch.run` com o parâmetro `ops`; a lista de operações vem de `ae_catalog`). Marque cada cena com `tda.cena`.
3. **Ver** com `ae_see`: folha de contato como imagem, incluindo o meio dos movimentos e não só as poses. Com `reference`, monta REF, NOSSO e DIF lado a lado.
4. **Revisar** com `ae_review_motion` ("humano ou robotizado?"): câmera que para morta, pausa congelada, linear sem mola, entradas simultâneas, texto pequeno, margem. Se o projeto tiver `identidade.json` (fontes, paleta, margem, raios), a revisão também confere por ele.
5. **Corrigir** com as operações de movimento do MCP, categoria `tda`: `tda.mola` (entrada de cartão, botão, balão, selo, morph de interface), `tda.entrada` e `tda.saida`, `tda.stagger`, `tda.vivo` (a pausa nunca fica morta), `tda.camera_viva`, `tda.curva`, `tda.morph` (uma camada vira outra com mola). Os números padrão vêm do estilo configurado no MCP e podem ser trocados por vídeo.
6. **Expressões:** `ae_expressions_check` depois de escrever qualquer uma.
7. **Som:** `ae_sound_cues` lista onde cabem efeitos a partir das chaves; `ae_place_sfx` põe cada arquivo com o pico no instante do evento; `ae_beats` marca as batidas de uma música na comp. Ver [som-e-mixagem.md](references/som-e-mixagem.md).
8. **Render** com `ae_render_video` em segundo plano e `ae_render_status`; nota do arquivo final com `ae_avaliar_render`. Ver [render-e-revisao.md](references/render-e-revisao.md).

Segurança, sempre: `ae_checkpoint` (create) antes de mudança estrutural ou lote grande. O lote não é transacional: leia `results` e corrija só o que falhou. Depois de `TIMEOUT`, leia o estado antes de repetir. `DIALOG_OPEN`: `ae_do` com `instance.dismiss_dialog`. Dúvida de API: `ae_docs`. Nunca diga "pronto" a partir da resposta de uma ferramenta: o que prova é um quadro renderizado que você olhou.

## Fluxo, qualquer rota

1. **Briefing curto:** formato (vertical ou horizontal), duração, com ou sem voz, o que a pessoa deve sentir e fazer no fim. Se o formato não estiver claro, pergunte uma vez.
2. **Referências e assets:** peça ao usuário as telas, a marca, as fontes e as fotos que o vídeo usa. Não invente logo nem tela de produto real; quando a tela não existir, desenhe-a em HTML e capture (ver a rota de app no celular).
3. **Direções antes de animar:** quando houver identidade a decidir, mostre 2 ou 3 quadros parados com as mesmas cenas e deixe o usuário escolher. Depois, storyboard em tabela tempo × cena × texto.
4. **Construir pela rota**, salvando o projeto na pasta do trabalho antes (`ae_save_project` com `path`).
5. **Conferir:** quadros-chave e meio dos movimentos, recortes ampliados do texto, teste de editabilidade (mudar um valor de controle e ler o texto de volta).
6. **Som, render, entrega:** pelos documentos de som e de render. Número de protótipo na tela pede o rodapé "dados ilustrativos".

## Créditos

As técnicas destas rotas foram aprendidas olhando trabalhos públicos de motion e reescritas aqui como método próprio. Inspirações citadas: o método de telas encadeadas de Tarık, o anúncio com produto 3D de Zakaria HQ e a tipografia em movimento de Filatov. Nenhum texto, arquivo ou ativo deles está incluído.
