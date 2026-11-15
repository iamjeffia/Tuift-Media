# TUIFT Code: checklist

> Data: 2026-11-15 · Tipo: projeto · Status: em produção

**Resumo:** tudo o que o dono do projeto pediu para o TasteCode virar TUIFT Code, quebrado em subtarefas. Quem mantém este arquivo é o agente que coordena. Um item grande só fecha quando todas as subtarefas estão feitas, testadas e validadas por ele no app.

Marcação: `[ ]` a fazer · `[~]` em andamento · `[x]` feito e testado · `[v]` validado pelo dono do projeto.

## Regras que valem para tudo

1. **Visual:** seguir o design system que o app já tem (componentes, tokens de `apps/web/src/styles`, espaçamentos, animações). Nada de componente novo por enquanto. Se um for inevitável, ele nasce dos mesmos tokens e padrões.
2. **Interface de chat intocada:** as mensagens da IA, o processo ("Working for…", "Ran 5 commands") e o campo de texto ficam como estão e não são traduzidos. Só entram ali as mudanças pedidas nos itens 5 e 6.
3. **Código, comentários e commits em inglês** (o upstream é em inglês e isso mantém o merge fácil). Este checklist e a pasta `branding/` ficam em português.
4. **Marca:** depois de cada merge do upstream, `python branding/aplicar-marca.py`.
5. **Windows primeiro.** Mac e mobile ficam fora até ele pedir.

## 0. Nome TUIFT Code

- [x] 0.1 Trocar "TUIFT Media" por "TUIFT Code" no app, no instalador e nos IDs (`media.tuift.code`, `%APPDATA%/TUIFT Code`, `~/.tuift-code`, cofre `TUIFTCode`).
- [x] 0.2 Reinstalado no PC como TUIFT Code (15/11). O "TUIFT Media 0.5.1" de teste saiu e o atalho "TUIFT Media" voltou para o app v1.
- [x] 0.3 Repositório recriado com histórico limpo (15/11): um commit em cima do TasteCode. O repositório antigo ficou privado, à espera de ser apagado pelo dono.

## 1. Tradução para português (padrão) com inglês como segunda opção

- [x] 1.1 Núcleo de i18n: módulo de textos, idioma guardado nas preferências, pt-BR padrão, inglês de reserva.
- [x] 1.2 Opção de idioma em Configurações, com os componentes de configuração que já existem.
- [x] 1.3 Fronteira do chat: lista escrita dos arquivos que não se traduzem (regra 2).
- [x] 1.4 Traduzir Configurações (todas as páginas).
- [x] 1.5 Traduzir barra lateral, busca, paleta de comandos e menus de contexto.
- [x] 1.6 Traduzir o onboarding.
- [x] 1.7 Traduzir o painel do workspace (arquivos, revisão, navegador, terminal, PRs, agentes).
- [x] 1.8 Traduzir diálogos, avisos, erros do app e avisos de atualização.
- [x] 1.9 Traduzir menus nativos e bandeja do Windows (`apps/desktop`).
- [x] 1.10 Levantamento dos textos que vêm do servidor: cerca de 565 mensagens, 170 delas de telas do app. Proposta em `branding/i18n-texto-do-servidor.md`: o servidor manda um código junto com o inglês e a tela traduz fora do chat (3 a 4 dias). Traduzir é o item 1.14.
- [x] 1.11 Teste que garante as mesmas chaves e os mesmos `{placeholders}` nos dois idiomas (web e desktop). A revisão do português pela skill `better-portuguese` fica para a leitura final do dono do projeto.
- [x] 1.12 Conferir no app que texto mais longo não quebra layout.
- [ ] 1.13 O dono do projeto confirma os termos usados: "chats", "Atalhos" (Keybinds), "Caixa de entrada" (Inbox), "Trilho" (seletor de modelo em duas etapas), e se os controles vizinhos do chat (busca no chat, desfazer, copiar) são traduzidos.
- [ ] 1.14 Traduzir os textos de tela que vêm do servidor (erros de pull request, provedores, MCP, nomes de limite), conforme a proposta do 1.10.
- [~] 1.15 Fronteira fina do chat, decidida em 15/11 (traduzir o que é do app, manter em inglês o que é da conversa): faixa de avisos acima do campo de texto, "Choose project" e "Add provider" dentro do campo, menu "/", conversa de exemplo do onboarding, erros no campo de mensagem e títulos padrão de chat ("New session").
- [ ] 1.16 Restos pequenos ainda em inglês: página de laboratório de avatar (Depuração), erros da imagem de fundo, busca da paleta pelo nome do grupo em português, separador de milhar em contagens grandes.
- [ ] 1.17 Conferir no app instalado: menus nativos, bandeja, notificações, troca de idioma em tempo real e as telas que só existem lá (Importar chats com dados, celular, navegador interno, terminal).

## 2. Skills da Criação de Conteúdo dentro do app

- [x] 2.1 Inventário das skills da central (design, motion, After Effects, Remotion, HyperFrames): origem, licença, tamanho e se têm dado privado ou caminho do PC.
- [x] 2.2 Lista aprovada pelo dono do projeto em 15/11: entram todas as "prontas" e as "limpar antes" do inventário, mais `motion-app-ae` e `composicao-trilha` (limpas e adaptadas para qualquer cliente usar o conceito), `better-portuguese`, `humanizer`, `stageshow`, `gravar-janela` e todas as de design, frontend e UI. O inventário fica fora deste repositório.
- [x] 2.3 Mecanismo para skills embutidas vindas de pasta local (hoje as embutidas vêm de repositórios fixados por commit).
- [x] 2.4 Página Skills mostrando as do cliente (globais), as do workspace e as embutidas, na base que já existe.
- [x] 2.5 Trazer as skills aprovadas, cada uma com a sua licença em `THIRD_PARTY_NOTICES.md`:
  - [x] 2.5a Trazer de repositórios públicos com licença só o que a casa usa: a base do HyperFrames (12 skills) e `watch`.
  - [x] 2.5b Limpar e trazer as de motion da casa: `animacao-saas`, `captura-de-movimento`, `motion-narrado`, `video-referencias`.
  - [x] 2.5c Adaptar `motion-app-ae` e `composicao-trilha` para qualquer cliente (dependem dos itens 11 e 12).
  - [x] 2.5d Limpar e trazer `ui-profissional`, `gravar-janela`, `humanizer` e `stageshow`. No lugar da `better-portuguese`, que é de um autor externo e não tem licença, entrou a `escrita-pt-br`, escrita do zero pela casa (15/11).
  - [x] 2.5e Revisão de privacidade do coordenador antes de publicar: nenhum nome, marca interna, cliente, caminho do PC ou chave.
- [ ] 2.6 Teste: o instalador leva as skills e o agente enxerga cada uma.
- [ ] 2.8 Ficam de fora por enquanto, pela licença de cada uma: `transitions-dev`, `transitions-polish` e `transitions-ui-generation` (a licença proíbe republicar), `remotion-best-practices` e as sete `21st-*` (sem licença declarada). Ideia: oferecer no app a instalação direto do repositório do autor, sem embutir.
- [x] 2.9 Medir o uso real das skills (transcrições das sessões e anotações de agosto a novembro) e levar só o que vale: 24 skills entram. Ficam de fora por falta de uso registrado: `edvid`, os pacotes de design de terceiros (Emil Kowalski, Jakub Krehel), as skills da Higgsfield, os fluxos e blocos extras do HyperFrames e as avulsas. Podem entrar depois, se passarem a ser usadas.
- [ ] 2.10 Decidir sobre a telemetria da skill `media-use` (envia uso anônimo ao autor; dá para desligar por variável de ambiente) e sobre o prefixo `tda.` das operações do MCP citadas nas skills.
- [ ] 2.11 O dono do projeto relê os trechos reescritos que as frentes marcaram (morph de UI, método de captura, rotas do After Effects, arco de trilha).

## 3. Página de MCP servers no estilo Claude Desktop

- [x] 3.1 Referências da tela de conectores do Claude Desktop.
- [x] 3.2 Um card por integração, com ícone.
- [x] 3.3 Conectar e desconectar com resposta visual forte (conectando, conectado, erro).
- [x] 3.4 Manter tudo o que a página faz hoje (editar, herdados, por provedor).
- [x] 3.5 Testes e prova visual.
- [ ] 3.6 O dono do projeto decide se quer um botão "Disconnect" separado (hoje desligar é a chave liga/desliga) e testa com servidores MCP reais.

## 4. Apagar chats em massa

- [x] 4.1 Seleção múltipla na barra lateral: clique, Ctrl+clique e Shift+clique para o intervalo.
- [x] 4.2 Ação de apagar os selecionados, com confirmação.
- [x] 4.3 Teclado (Delete, Esc) e leitor de tela.
- [x] 4.4 Testes.
- [ ] 4.5 O dono do projeto decide se quer um botão visível de "N selecionados" (hoje é menu do botão direito e tecla Delete) e confirmação também no modo Caixa de entrada.

## 5. Sair menos do app: arquivos abrem dentro dele

- [x] 5.1 Clicar num arquivo citado no chat abre o arquivo no painel ao lado, não no Explorer.
- [x] 5.2 Botão direito no arquivo: abrir no Explorer, copiar caminho.
- [x] 5.3 Markdown com dois modos: Preview (formatado) e Raw (texto puro).
- [x] 5.4 Código: realce, número de linha e arquivo grande sem travar.
- [x] 5.5 Imagem, vídeo e áudio, cada um com o seu visualizador. PDF ainda abre fora: embutir pede afrouxar a regra de segurança da janela (`frame-src`), e isso espera decisão.
- [x] 5.6 Medir e otimizar os visualizadores que já existem.
- [x] 5.7 Lista do que mais tira o cliente do app, para as próximas rodadas.
- [ ] 5.8 PDF dentro do app: decidir e testar o visualizador do Chromium no app empacotado.
- [ ] 5.9 Próximos pontos em que o app manda o cliente para fora: link externo nas respostas (abrir na aba Browser do painel), links de pull request, links do terminal, login de provedores e de MCP, "abrir no editor" (não existe).
- [ ] 5.10 Validar no app instalado: clique real, vídeo, áudio e "Open in Explorer".

## 6. Campo de texto do chat

- [x] 6.1 Full access como permissão padrão.
- [x] 6.2 Botão Motion ao lado do Design: mesmo formato e animação, cores da TUIFT Media quando ligado.
- [ ] 6.2b O que o Motion faz quando ligado: definido pelo dono do projeto em 15/11, virou o item 9.
- [x] 6.3 Design em workspace grande: explicar o erro e corrigir.

**Por que o erro "Design workspace scan exceeds 25000 entries" acontece.** Não é trava de segurança, é proteção de desempenho. O Design lista todos os arquivos da pasta várias vezes por rodada, de uma vez só no servidor local, para saber o que a rodada criou ou mudou e para checar a qualidade do código. Por isso o TasteCode pôs um teto: 25.000 itens, 40 níveis de pasta e 32 MB de código. A central de conteúdo tem 115 mil itens. O erro que o dono do projeto viu é do TasteCode instalado (build de 4/11). O upstream corrigiu um dia depois, e a correção já está no código do TUIFT Code: acima do teto, o Design roda e pula as checagens de qualidade do código e de arquivos inesperados. A frente `design-scan` confirmou isso com testes e fechou uma brecha parecida em pasta de fontes muito grande.

## 7. Atualização automática a partir do TasteCode

- [ ] 7.1 Workflow do GitHub Actions: detecta versão nova do TasteCode, faz o merge, aplica a marca, testa e publica a release que o app instalado já procura. **Não começar** até o dono do projeto mandar: o app ainda vai mudar bastante.

## 8. Saída de terminal nunca vira texto do chat

Relato do dono do projeto (15/11): numa conversa com o Codex, o log de um servidor local que o agente abriu (centenas de linhas `GET /frames/... 200` e erros do Python) apareceu como texto da resposta. Isso pesa no desempenho e não pode acontecer.

- [x] 8.1 Achar a causa: como a saída de um comando em segundo plano foi parar no texto da resposta (com a conversa real como prova).
- [x] 8.2 Corrigir: saída de comando só aparece dentro da linha do comando, recolhida e com tamanho máximo.
- [x] 8.3 Auditoria de casos parecidos em todos os provedores (resultado de ferramenta, MCP, conteúdo de arquivo, diff, subagentes, terminal, histórico importado): onde há teto e onde não há. Sai em `branding/auditoria-saida-no-chat.md`.
- [x] 8.4 Testes que reproduzem o caso e travam o teto.
- [ ] 8.5 Imagens em base64 no histórico do Claude Code: maior peso medido (438 imagens somavam 20 MB de 21,8 MB numa conversa). Guardar em arquivo ou miniatura.
- [ ] 8.6 Provedores ACP reenviam a saída acumulada inteira a cada atualização: gravar só a diferença.
- [ ] 8.7 O dono do projeto decide os tetos que ficaram abertos: 64 KiB por comando (aplicado), diffs (sem teto) e mensagem da IA (sem teto; proposta de 1 MiB).

## 9. Modo Motion

Definição do dono do projeto (15/11): ligar o Motion transforma aquele chat num projeto de vídeo. Os bonecos da TUIFT entram em cena acima do chat e ficam esperando o trabalho. Tudo o que um vídeo de motion com IA precisa é ligado e carregado (skills, MCPs, contexto), como se o agente virasse um editor de vídeo. Em cada etapa, o boneco daquela etapa fica em destaque (por exemplo, o de referências). Ele ainda não sabe como fazer por dentro: a primeira subtarefa é o plano.

Depende dos itens 2 (skills) e 3 (MCP). O botão do item 6.2 é a porta de entrada. A cena dos bonecos é a exceção combinada à regra do chat intocado.

- [x] 9.1 Plano escrito em `branding/plano-modo-motion.md` (15/11). **Falta o dono do projeto aprovar** o plano e as seis decisões do fim dele.
- [ ] 9.2 Fase 1, cena dos bonecos (só visual):
  - [ ] 9.2a Levar as seis cabeças da identidade v2 para o app e registrar a origem.
  - [ ] 9.2b Componente da cena acima da conversa, sem tocar no chat nem no campo de texto, com estilo carregado à parte.
  - [ ] 9.2c Entrada, destaque e respiração com os tokens de movimento do app; sem animação para quem pediu menos movimento.
  - [ ] 9.2d Janela estreita, leitor de tela e tradução de papéis e etapas.
  - [ ] 9.2e Testes e prova no ambiente de demonstração, tema claro e escuro.
- [ ] 9.3 Fase 2, o Motion guardado no chat:
  - [ ] 9.3a Contrato: modo (`motion` ou `design`) e etapa nas configurações do chat; pedido para trocar o modo.
  - [ ] 9.3b Servidor guarda e avisa; a tela lê, e o que estava só local é migrado uma vez.
  - [ ] 9.3c Testes: o modo sobrevive a reiniciar o app e às gravações que já existem.
- [ ] 9.4 Fase 3, pacote Motion:
  - [ ] 9.4a As skills de vídeo vão no instalador como pacote separado (fecha o item 2.6).
  - [ ] 9.4b Instrução curta de papel e etapas no início da sessão, em Codex, Claude Code e Grok.
  - [ ] 9.4c Pacote ligado só em chats Motion; ligar e desligar no meio do chat.
  - [ ] 9.4d Provar com os programas reais os dois pontos de risco do plano.
- [ ] 9.5 Fase 4, etapas:
  - [ ] 9.5a Ferramenta `motion_stage` no canal do app, só em chats Motion.
  - [ ] 9.5b Etapa guardada e avisada à tela; o boneco certo acende.
  - [ ] 9.5c A pessoa troca a etapa clicando num boneco.
- [ ] 9.6 Fase 5, After Effects (depende do item 11): MCP ligado só em chats Motion e aviso claro quando o After Effects não está instalado.
- [ ] 9.7 Fase 6, a cena reage: estado "esperando você" e subagente com nome de boneco acende o boneco.
- [ ] 9.8 Elenco e papéis: Zig lidera (o laranja de óculos escuros, principal), Moss pesquisa as referências, Bun escreve o roteiro, Pip organiza o projeto, Cloud monta o vídeo no After Effects (o lilás) e Penny revisa cada quadro.
- [ ] 9.9 Validação do dono do projeto no app instalado, com um vídeo de verdade.

## 10. Um provedor por tipo de tarefa

Visão do dono do projeto (15/11): o TUIFT Code é a alternativa ao Claude Code, ao Codex e ao Grok para quem quer todos os provedores num lugar só. O cliente despacha cada tarefa para o modelo que faz aquilo melhor: pesquisa num, design noutro, planejamento complexo noutro. A base já existe no app; este item organiza o que falta.

- [ ] 10.1 Levantar o que o app já faz hoje: sub-agentes, escolha de provedor e modelo por agente, revisão automática.
- [ ] 10.2 Perfis por tipo de tarefa (pesquisa, design, planejamento, código), cada um com provedor e modelo, que o cliente configura.
- [ ] 10.3 Despacho de subtarefas para provedores diferentes dentro do mesmo chat.
- [ ] 10.4 Testes e validação no app.

## 11. MCP do After Effects embutido por padrão

Decisão de 15/11: o MCP de After Effects da casa (`ae-mcp-tda`) vem dentro do app, para o cliente usar sem instalar mais nada.

- [ ] 11.1 Levantar o que o MCP precisa para rodar na máquina do cliente (After Effects instalado, ponte, scripts) e a origem e a licença de cada parte que veio de MCPs públicos.
- [ ] 11.2 Empacotar o MCP com o app.
- [ ] 11.3 Ligar por padrão, ou junto com o modo Motion (decidir no plano do item 9).
- [ ] 11.4 After Effects ausente: aviso claro em vez de erro.
- [ ] 11.5 Testes e validação no app.

## 12. Tonal sounds dentro do app

Ideia de 15/11: a biblioteca de tonal sounds aparece dentro do app, só quando o botão Motion do chat está ligado.

- [ ] 12.1 Definir quais sons o app pode distribuir e de onde vêm. O banco usado hoje é um pacote comprado de terceiros.
- [ ] 12.2 Biblioteca de sons no modo Motion: ouvir, buscar e escolher (fase 8 do plano do Motion, bloqueada pelo 12.1).
- [ ] 12.3 Ligação com a skill `composicao-trilha`.
- [ ] 12.4 Testes e validação no app.

## 13. Modo Design carrega as skills de design

Decisão de 15/11: quando a sessão começa com o botão Design ligado, as skills de design, frontend e UI são carregadas, do mesmo jeito que o Motion carrega as de vídeo (item 9.3).

- [ ] 13.1 Lista das skills que formam o pacote Design. Na medição de uso, só `ui-profissional`, `stageshow` e `design-taste-frontend` têm uso registrado; falta decidir se o pacote leva também skills de design de terceiros que a casa ainda não usa.
- [ ] 13.2 Carregar o pacote quando a sessão começa com Design ligado, pelo mesmo mecanismo do pacote Motion (fase 7 do plano do Motion).
- [ ] 13.3 Testes e validação no app.

## 14. README bonito no GitHub

Pedido de 15/11: o repositório é público e a página inicial precisa ser visual, no nível das referências escolhidas (open-design, ego-lite, taste-skill).

- [x] 14.1 Estudar as referências e anotar a estrutura.
- [x] 14.2 Hero com a marca, frase curta e selos; captura real do app logo abaixo.
- [x] 14.3 Grade de recursos com imagens reais e legenda curta, pouco texto.
- [x] 14.4 Créditos e licença compactos, mantendo a atribuição ao TasteCode.
- [x] 14.5 Prova: README renderizado em tema claro e escuro, largura normal e celular.
- [ ] 14.6 Mesmo cuidado no índice `.agents/skills/README.md`, depois que as skills entrarem.

## Ondas de trabalho

Cada frente roda num worktree próprio em `C:/Dev/tuift-wt/<frente>`, numa branch `tuift/<frente>`, e volta para a `main` por merge depois de conferida.

| Onda | Frente                                                                                               | Subtarefas    | Estado                     |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------- | -------------------------- |
| 1    | `i18n-core`                                                                                          | 1.1, 1.2, 1.3 | na `main` (15/11), testada |
| 1    | `mcp-cards`                                                                                          | 3.1 a 3.5     | na `main` (15/11), testada |
| 1    | `bulk-delete`                                                                                        | 4.1 a 4.4     | na `main` (15/11), testada |
| 1    | `file-viewers`                                                                                       | 5.1 a 5.7     | na `main` (15/11), testada |
| 1    | `composer`                                                                                           | 6.1, 6.2      | na `main` (15/11), testada |
| 1    | `design-scan`                                                                                        | 6.3           | na `main` (15/11), testada |
| 1    | `skills`                                                                                             | 2.1, 2.3, 2.4 | na `main` (15/11), testada |
| 1    | `chat-leak`                                                                                          | 8.1 a 8.4     | na `main` (15/11), testada |
| 1b   | `skills-pin`                                                                                         | 2.5a          | na `main` (15/11)          |
| 1b   | `skills-motion`                                                                                      | 2.5b          | na `main` (15/11)          |
| 1b   | `skills-ae-trilha`                                                                                   | 2.5c          | na `main` (15/11)          |
| 1b   | `skills-misc`                                                                                        | 2.5d          | na `main` (15/11)          |
| 1b   | `readme`                                                                                             | 14.1 a 14.5   | na `main` (15/11)          |
| 2    | `i18n-settings`, `i18n-sidebar`, `i18n-onboarding`, `i18n-workspace`, `i18n-dialogs`, `i18n-desktop` | 1.4 a 1.12    | na `main` (15/11), testada |
