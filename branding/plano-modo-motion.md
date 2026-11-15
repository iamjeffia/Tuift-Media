# Plano do modo Motion

> Data: 2026-11-15 · Tipo: projeto · Status: rascunho, à espera de aprovação

**Resumo:** como o botão Motion vira um modo de verdade: os bonecos entram em cena acima do chat, as skills de vídeo e o MCP do After Effects são carregados só naquele chat, e o boneco da etapa atual fica em destaque. São oito fases pequenas; a primeira já mostra a cena. Nada foi construído.

## O que o modo faz, para quem usa

1. A pessoa liga o Motion no campo de texto. Os seis bonecos entram acima do chat, com o Zig na frente.
2. Aquele chat passa a ser um projeto de vídeo: o agente recebe o papel de editor e motion designer, a lista das etapas e o acesso às skills de vídeo e ao After Effects.
3. Conforme o trabalho anda, o agente avisa em que etapa está e o boneco daquela etapa acende. A pessoa também pode trocar a etapa clicando num boneco.
4. Desligar o Motion devolve o chat ao normal. A etapa fica guardada.

## Etapas e donos

| Etapa                      | Boneco |
| -------------------------- | ------ |
| Ideia e critério de pronto | Zig    |
| Roteiro                    | Bun    |
| Narração                   | Bun    |
| Aprovação do áudio         | Zig    |
| Referências e assets       | Moss   |
| Identidade visual          | Moss   |
| Trilha                     | Cloud  |
| Motion no After Effects    | Cloud  |
| Revisão quadro a quadro    | Penny  |
| Entrega                    | Pip    |

## O que o código já oferece

- **O Design não serve de molde por dentro.** O servidor só descobre que o chat é de Design na hora do turno, depois que a sessão já existe. Do Design, o Motion aproveita só o botão e a ideia de guardar por chat.
- **Já existe um lugar para guardar estado por chat no servidor** (as configurações do chat, que a tela já lê e recebe por aviso). O Motion entra ali com dois campos: o modo e a etapa.
- **As skills de vídeo ainda não vão no instalador.** Elas estão em `.agents/skills`, que só vale para quem trabalha neste repositório. O projeto de um cliente não as vê. Isso precisa ser resolvido antes de o Motion carregar qualquer skill (é o item 2.6 do checklist).
- **Cada provedor recebe skills de um jeito.** O Claude Code aceita um pacote de skills por chat. O Codex e o Grok recebem uma lista curta e leem a skill quando precisam.
- **O MCP hoje é por projeto, não por chat.** Mas o app já injeta um servidor próprio num chat só, e o mesmo caminho serve para o After Effects.
- **O app tem um canal próprio de ferramentas para o agente.** É por ele que o agente vai avisar a etapa.
- **A folha de estilo principal está a 39 bytes do limite.** O visual do Motion precisa carregar à parte, como o feixe do Design já faz.

## Decisões de arquitetura (com a opção recomendada)

**Onde o estado fica.** Nas configurações do chat, no servidor, com os campos `mode` (motion ou design) e `motionStage`. Um contrato novo e duas colunas; reaproveita a leitura, o aviso e a migração que já existem. O campo já nasce aceitando "design", para o item 13 não pedir outra mudança de contrato.

**Como o pacote entra no contexto sem pesar.**

1. Uma instrução curta no início da sessão (papel, as dez etapas, "leia a skill só quando a etapa pedir"). Custa cerca de 250 tokens.
2. As skills de vídeo como um pacote separado, ligado só em chats Motion. No Claude Code são cerca de 3.300 tokens de descrições; nos outros, de 200 a 450. O corpo das skills (76 mil tokens no total) só é lido sob demanda.
3. O MCP do After Effects ligado só em chats Motion. As 28 ferramentas custam uma estimativa de 5 a 10 mil tokens por pedido no Codex; o Claude Code costuma adiar essa carga.

A alternativa de mandar um prefixo a cada mensagem foi descartada: ele teria de ser removido do histórico e seria pago de novo a cada turno.

**Como o app sabe a etapa.** O agente chama uma ferramenta pequena do app (`motion_stage`) quando muda de etapa. Ela guarda a etapa, avisa a tela e devolve quais skills ler naquela etapa. A pessoa também pode definir a etapa pela cena. Adivinhar a etapa pelo uso de ferramentas foi descartado por ser impreciso.

## A cena dos bonecos

- **Onde:** uma faixa de 48 px acima da conversa, fora do componente do chat e do campo de texto. Num chat novo, os bonecos aparecem maiores acima do campo: é o momento da entrada.
- **Arquivos:** as seis cabeças da identidade v2 (84 KB no total), arte do dono do projeto.
- **Movimento:** entrada com os tokens de movimento do app, um boneco após o outro, Zig primeiro, em menos de meio segundo. Parados, ficam quietos. Com o agente trabalhando, só o boneco da etapa respira. Quem pediu menos movimento no sistema vê a cena sem animação.
- **Acessibilidade:** cada boneco é um botão com menu das suas etapas; a troca de etapa é anunciada; a cor nunca é o único sinal.
- **Janela estreita:** só as cabeças abaixo de 620 px; abaixo de 480 px, só o boneco ativo e o nome da etapa.
- **Idioma:** os nomes dos bonecos ficam como são; papéis e etapas são traduzidos.

## Fases

| Fase | O que entrega                                                                                       | Depende de           | Tamanho      |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------- | ------------ |
| 1    | A cena aparece ao ligar o Motion, com o Zig em destaque. Só visual.                                 | nada                 | P            |
| 2a   | Modo e etapa no contrato entre tela e servidor.                                                     | nada                 | P            |
| 2b   | O servidor guarda o modo; a tela lê e migra o que estava só local.                                  | 2a                   | M            |
| 3a   | As skills de vídeo vão no instalador, como pacote Motion.                                           | item 2.6             | M            |
| 3b   | A instrução e o pacote entram no início da sessão; ligar e desligar no meio do chat.                | 2b, 3a               | M            |
| 4    | O agente declara a etapa, o boneco certo acende e a pessoa pode trocar.                             | 2b, 3b               | M            |
| 5    | MCP do After Effects só em chats Motion, com aviso claro quando o After Effects não está instalado. | item 11, 3b          | M            |
| 6    | A cena reage: mostra quando espera a pessoa; um subagente com nome de boneco acende o boneco.       | 4                    | P            |
| 7    | Pacote Design pelo mesmo mecanismo.                                                                 | item 13              | P            |
| 8    | Aba de tonal sounds no painel quando o modo é Motion.                                               | item 12, sem decisão | G, bloqueada |

Podem andar em paralelo, sem tocar nos mesmos arquivos: 1, 2a, 3a e o empacotamento do item 11.

## O que dá para testar sem abrir o app

Fases 1, 2 e 4 inteiras no ambiente de demonstração. Na 3 e na 5, o que o servidor manda para cada provedor é testado com provedores falsos; uma rodada real em cada provedor (Codex, Claude Code, Grok) e o After Effects só no app instalado.

## Decisões que mudam o que é construído

| Decisão                                            | Padrão proposto                                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Um agente só ou um subagente de verdade por boneco | Um agente com as skills; os bonecos mostram a etapa. Subagentes por boneco ficam para depois.                                                                        |
| Etapas obrigatórias em ordem ou um guia            | Um guia: a ferramenta registra e orienta, nunca recusa.                                                                                                              |
| After Effects não instalado                        | Não ligar o MCP, orientar o agente a montar em HyperFrames e avisar no boneco Cloud.                                                                                 |
| Ligar ou desligar o Motion no meio do chat         | Permitido com o chat parado; a sessão recomeça no próximo turno.                                                                                                     |
| Grok                                               | Na primeira versão, instrução e skills funcionam, e a etapa é definida pela pessoa. Com o After Effects ligado, o chat precisa ser novo e perde o ajuste de esforço. |
| Design e Motion ao mesmo tempo                     | Não: continuam exclusivos, como hoje.                                                                                                                                |

## Riscos

- **Dois pontos a provar com os programas reais antes de confiar na fase 3:** se o Claude Code ignora uma pasta de pacote dentro do pacote base, e se o Codex lê e roda scripts de skills a partir da pasta de recursos do app, que tem espaço no caminho.
- **Atualizações do TasteCode:** os dois arquivos mais mexidos por eles são os mesmos que o Motion precisa tocar. Por isso o Motion fica em arquivos novos, com ganchos de uma linha.
- **Custo no Codex:** o MCP do After Effects pesa em todo pedido de um chat Motion. Vale medir de verdade na fase 5.
