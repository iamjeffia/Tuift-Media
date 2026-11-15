# Operações do MCP do After Effects

Os nomes abaixo são os do MCP que acompanha o TUIFT Code. A lista completa e atual de operações vem de `ae_catalog` (por categoria); confira ali antes de assumir um argumento.

## Ferramentas

| Ferramenta | Para quê |
|---|---|
| `ae_project_info`, `ae_comp_info`, `ae_layer_info`, `ae_version_info`, `ae_context` | inspecionar projeto, comp, camada e ambiente |
| `ae_catalog`, `ae_do` | descobrir e executar operações atômicas |
| `ae_render_frame`, `ae_see` | quadros em PNG; folha de contato como imagem |
| `ae_review_motion`, `ae_expressions_check`, `ae_plano_check` | revisão de movimento, expressões quebradas, plano de cenas |
| `ae_sound_cues`, `ae_place_sfx`, `ae_beats` | pistas de som, posicionamento por pico, batidas de música |
| `ae_render_video`, `ae_render_status`, `ae_avaliar_render` | render em segundo plano, estado, nota do arquivo |
| `ae_checkpoint`, `ae_save_project`, `ae_project_export_json`, `ae_project_import_json` | pontos de salvamento, salvar, exportar e importar o projeto em JSON |
| `ae_docs`, `ae_lessons`, `ae_get_skill` | documentação offline, diário de lições, fluxos prontos (`ae-clean-rig`) |

## Convenções de `ae_do`

- Em `batch.run` o parâmetro é `ops` (lista de `{operation, args}`), não `operations`. Um lote é um passo de desfazer, mas não é transacional: leia `results`.
- Mire camadas por nome ou `{ id }`, nunca por índice: o índice muda quando se cria camada.
- Para script maior, `eval.run` (ExtendScript, ES3) está disponível quando a variável do servidor que o habilita estiver ligada; prefira operações do catálogo e use `eval.run` para o que elas não cobrem. O código vira corpo de função: termine com `return <JSON>`.
- Para um construtor inteiro em arquivo, `$.evalFile` com o `.jsx` em UTF-8 com BOM; caminhos com acento entram como URI.

## Operações mais usadas

- Projeto e comps: `project.new`, `project.import_file`, `comp.create`, `comp.set_props`, `comp.precompose`, `item.move_to_folder`.
- Camadas: `layer.create_footage|create_shape|create_text|create_null|create_solid|create_camera|create_light`, `layer.set_parent`, `layer.set_track_matte`, `layer.set_props` (inPoint, outPoint, motionBlur, enabled), `layer.bounds`.
- Formas: `shape.add_group|add_rect|add_ellipse|add_path|add_polystar|add_fill|add_stroke|add_repeater|add_trim_paths`.
- Transformação e chaves: `transform.set`, `keyframe.set_batch`, `keyframe.set_value`, `keyframe.set_easing`, `keyframe.apply`, `property.set|get|list`, `expression.set`.
- Texto: `text.set_content`, `text.set_style`, `text.set_style_range`, `text.measure`, `text.add_animator`.
- Efeitos: `effect.add`, `effect.set_property` (com `time` cria chave), `layer.apply_preset`.
- Render de quadro: `render.frame` em lote nos quadros-chave.

## Caminhos de propriedade

- Dentro de uma forma: `["Contents","<grupo>","Contents","Stroke 1","Opacity"]`; transformação do grupo: `["Contents","<grupo>","Transform","Scale"]`.
- Efeito: `["Effects","<nome>","Slider"]`. Áudio: `["Audio","Audio Levels"]`.
- Repeater e alguns efeitos não listam parâmetros em `property.list`: use `property.set` com o caminho completo.

## Estrutura de comps para telas de app

| Comp | Tamanho típico | Conteúdo |
|---|---|---|
| `TELA_<nome>` | tela do aparelho × 3 (ex.: 1170 × 2532) | captura como base mais destaques nativos, todas começando em 0 |
| `TELAS_sequencia` | igual | telas em sequência, cortadas por `inPoint/outPoint`, com push |
| `CELULAR` | corpo do aparelho | corpo mais `Telas (sequencia)` com track matte `Mascara da tela` |
| `MAIN_<projeto>` | 1080 × 1920 a 30 qps | fundos, null de câmera com `Celular`, legendas, marca, cursor, som |

Pastas do projeto: capturas, marca, precomps, som.

## Montar um projeto grande por JSON

`ae_project_import_json` é bem mais rápido que operação por operação (cerca de mil camadas em poucos minutos). Chame `project.new` antes; na tela inicial a importação fica parada. Contornos do importador:

- filho de null fica com a posição compensada: use uma precomp por grupo;
- camada de forma guarda só o último grupo: use uma camada por grupo;
- a justificação do texto é ignorada: aplique `text.set_style` depois;
- tracejado de contorno não entra: desenhe em PNG.

## Texto em telas desenhadas

Para tela de app que não existe, desenhe a tela em HTML do tamanho do aparelho (por exemplo 390 × 844), capture a 3x com um Chrome sem janela e gere uma versão "base" sem os elementos que o After Effects vai refazer (números, checks, chaves). A fonte do app pode faltar: confira com `font.list_missing` e, se for preciso, use outra do mesmo desenho com +5% de tamanho, avisando o usuário.
