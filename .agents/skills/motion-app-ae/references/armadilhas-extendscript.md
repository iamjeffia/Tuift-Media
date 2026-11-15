# Armadilhas de ExtendScript e do After Effects para agentes

Falhas silenciosas que já custaram tempo ao controlar o After Effects por script. Quando uma delas aparecer num erro, o MCP também anexa a lição correspondente (`ae_lessons`).

## 1. Linguagem: script é ES3, expressão é JavaScript moderno

- Script: sem `let`/`const`, arrow function, template literal, desestruturação, `forEach/map/filter`, `Object.keys` nem classes.
- Palavra reservada aborta o script, como variável (`short`, `int`, `char`, `byte`, `long`, `float`, `double`, `boolean`) e como chave de objeto sem aspas (`{in: x}`, `{null: x}`, `{class: x}`).
- Ternário encadeado associa à esquerda: `a ? x : b ? y : z` vira `((a ? x : b) ? y : z)`. Use if/else.
- Texto somado a array dispara soma vetorial ("invalid numeric result"): use `String(valor)` ou `valor.join(',')`.
- Em erro, use `e.message`, nunca `"falhou: " + e`.
- Comentário `//` no meio de uma linha com vários comandos apaga os comandos seguintes.
- Expressão usa o motor JavaScript moderno; não existem `app`, `File` nem `$` nela. Erro de expressão não lança no script: rode `ae_expressions_check`.

## 2. Propriedades

- Use matchName, nunca o nome exibido (muda com o idioma): `ADBE Transform Group`, `ADBE Position`, `ADBE Scale`, `ADBE Rotate Z`, `ADBE Opacity`, `ADBE Anchor Point`; texto em `ADBE Text Properties > ADBE Text Document`; formas em `ADBE Root Vectors Group`; efeitos em `ADBE Effect Parade`.
- O ponto de interesse da câmera é o `ADBE Anchor Point` no script; o zoom é `ADBE Camera Options Group > ADBE Camera Zoom`.
- Adicionar uma propriedade invalida as referências anteriores ("Object is invalid"). Adicione tudo e busque cada uma de novo. Vale também para máscaras: ponha as chaves de uma máscara antes de criar a próxima.
- Parâmetro de efeito é `<matchName>-000N`, sem padrão entre efeitos: descubra com `property.list`. Busca de efeito por nome devolve o primeiro: renomeie cada controle ao criar.
- Atribuir a um atributo que não existe é aceito em silêncio. Leia de volta.
- Com "Separate Dimensions", `setValue` no Position líder lança erro escondido: grave em X e Y. `property.set`, `transform.set` e as operações de movimento já desviam disso.

## 3. Chaves e easing

- A quantidade de `KeyframeEase` depende da propriedade: Position e Anchor (espaciais) usam 1, mesmo em 3D; Scale usa 3; Opacity e sliders usam 1.
- Defina os eases por último, depois de todos os valores. A influência fica entre 0,1 e 100; a velocidade é em unidades por segundo.
- Pausa precisa de chave hold: entre duas chaves bezier iguais o valor ainda se mexe.
- Expressão roda no tempo da comp: mudar `startTime` move as chaves, não o `time` da expressão.
- Encaixe os tempos em quadros inteiros (`round(t·fps)/fps`); o último quadro visível é `duration − 1/fps`.

## 4. Camadas, parentesco e comps

- Null novo nasce com âncora em (0, 0), não no centro: a posição local de um filho é mundo menos a posição do null.
- Parenteie antes de pôr as chaves do filho e escreva as chaves em coordenadas locais. Chaves criadas antes do parentesco ficam erradas.
- `layer.parent = x` compensa (a camada fica onde está); `setParentWithJump(x)` não compensa (a camada pula).
- Opacidade não passa do pai para o filho: anime a escala a partir de 0 ou use `parent.transform.opacity` na opacidade dos filhos.
- Track matte desliga o vídeo da camada usada como matte. Para o mesmo desenho servir de matte e de peça visível, use uma cópia.
- Dentro de Contents de uma forma, o índice 1 fica na frente e `addProperty` adiciona atrás; um Fill vale para todos os caminhos acima dele no grupo.
- SVG importado vira comp de 1 quadro: aumente a duração da comp e o `outPoint` da camada.
- Vídeo curto numa camada longa: ajuste o `startTime` para cobrir até o fim.
- `CompItem.duplicate()` é raso (precomps compartilhadas). Remover uma comp apaga as camadas que a aninham.
- Impossível por script: paradas de cor de gradiente de forma (use Gradient Ramp ou 4-Color Gradient num sólido com matte), tracejado por `setValue`, estilos de camada. Blur de elipse corta na borda da camada: para brilho de fundo, Gradient Ramp radial num sólido.
- O After Effects segura o arquivo de vídeo importado: grave a versão nova com outro nome.

## 5. Texto e fontes

- `justification`, `tracking`, `boxText` e `baselineShift` só depois que a camada existe: leia `textProp.value`, mude e dê `setValue`. Leia a justificação de volta.
- `addText()` herda o tracking do painel: grave tracking explícito (`tracking: 0, allCaps: false, fauxBold: false` em texto novo).
- Fonte pelo nome PostScript; fonte ausente é substituída em silêncio (`font.list_missing`). Fonte nova: instale para todos os usuários e reinicie o After Effects.
- `sourceRectAtTime` ignora a escala da própria camada e dá 0 por 0 em forma recém-criada. Meça o texto renderizado (`text.measure`, `layer.bounds`), não conte caracteres.

## 6. Desfazer, diálogos e segurança

- Cada `ae_do` já é um grupo de desfazer: nunca `beginUndoGroup` dentro de `eval.run`.
- Diálogo modal bloqueia tudo. A resposta traz `DIALOG_OPEN` com o texto: feche com `instance.dismiss_dialog`. Diálogo de serial de plugin: nunca digite serial.
- Se o After Effects não estiver aberto, a resposta é `NO_INSTANCE`: abra-o primeiro.
- Sem janela, não chame `app.newProject()`: derruba o After Effects.
- `app.executeCommand` pela ponte quase sempre não faz nada. Efeitos que abrem diálogo ao aplicar travam o After Effects.
- Não mande comandos ao MCP com um render em andamento.

## 7. Render e verificação

- A fila usa a work area por padrão: confira-a ou passe `range` em `ae_render_video`.
- Código de saída do aerender não é prova: confira o log, `ffprobe` e quadros pretos ou congelados (o `ae_render_video` já checa).
- `saveFrameToPng` é assíncrono e pode devolver quadro velho em comp pesada: use `ae_see`.
- Plugins de terceiros sem licença põem marca d'água: use o efeito nativo equivalente.
- O render é a fonte da verdade: resposta de ferramenta não prova que o movimento está bom.
