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
- [x] 1.13 Termos decididos pelo dono do projeto (15/11): ficam "chats", "Atalhos" e "Caixa de entrada"; "Trilho" virou "Por provedor" (par de "Lista" no seletor de modelo). Os botões de ícone ao lado das mensagens (copiar, editar como novo prompt, restaurar) são do app e ficam traduzidos; as mensagens e as linhas de processo seguem em inglês.
- [ ] 1.14 Traduzir os textos de tela que vêm do servidor (erros de pull request, provedores, MCP, nomes de limite), conforme a proposta do 1.10. Decisão de 15/11: entra depois do modo Motion.
- [x] 1.15 Fronteira fina do chat (15/11): traduzido o que é do app em volta da conversa (rótulos da tela inicial, faixa de avisos, descrições do menu "/", busca no chat, restaurar, copiar, visualizador de mídia, títulos padrão só na hora de mostrar). Continuam em inglês as mensagens, as linhas de processo, o texto de exemplo do campo, os modos de acesso, Design, Motion e o seletor de modelo. Os erros da fila e de anexos foram traduzidos no 1.16.
- [x] 1.16 Restos pequenos traduzidos (15/11): erros de anexo e da fila do campo de texto, página de laboratório de avatar, erros da imagem de fundo, busca da paleta pelo nome do grupo em português (o nome em inglês continua achando), separador de milhar e decimal conforme o idioma, e o nome acessível dos botões de copiar. Ficam em inglês, junto com a conversa, os números das linhas de processo. A busca da paleta ainda diferencia acento ("acoes" não acha "Ações").
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
- [~] 2.6 O instalador leva as skills de vídeo como pacote Motion (feito). Falta o agente enxergar o pacote num chat Motion (fase 3 do Motion).
- [x] 2.8 Skills de terceiros que não podem ir embutidas (16/11): seção "Disponíveis para instalar" na página de Skills, com autor, licença declarada e link para a fonte; instala uma ou todas direto do repositório do autor, em versão fixada e conferida. A instalação é uma só, na pasta de dados do app, e vale para todo projeto e todo provedor; carrega por categoria (design em chats Design, motion em chats Motion) e pode ser removida pela página. Lista de hoje: as três `transitions-*` e a do Remotion, que traz as outras doze dentro dela. As sete `21st-*` foram embutidas no pacote Design, porque o repositório delas declara Apache-2.0.
- [x] 2.9 Medir o uso real das skills (transcrições das sessões e anotações de agosto a novembro) e levar só o que vale: 24 skills entram. Ficam de fora por falta de uso registrado: `edvid`, os pacotes de design de terceiros (Emil Kowalski, Jakub Krehel), as skills da Higgsfield, os fluxos e blocos extras do HyperFrames e as avulsas. Podem entrar depois, se passarem a ser usadas.
- [x] 2.10 Decisão de 15/11: a skill `media-use` fica como o autor publicou, com o envio de uso anônimo e o aviso no índice das skills (quem quiser desliga pela variável de ambiente). As operações de movimento do MCP do After Effects usam o prefixo `tuift.` (decisão do dono do projeto); as skills já dizem `tuift.*`, e o nome antigo segue aceito pelo MCP para projetos existentes.
- [ ] 2.11 O dono do projeto relê os trechos reescritos que as frentes marcaram (morph de UI, método de captura, rotas do After Effects, arco de trilha).

## 3. Página de MCP servers no estilo Claude Desktop

- [x] 3.1 Referências da tela de conectores do Claude Desktop.
- [x] 3.2 Um card por integração, com ícone.
- [x] 3.3 Conectar e desconectar com resposta visual forte (conectando, conectado, erro).
- [x] 3.4 Manter tudo o que a página faz hoje (editar, herdados, por provedor).
- [x] 3.5 Testes e prova visual.
- [~] 3.6 Decisão de 15/11: sem botão "Disconnect" separado; desligar continua sendo a chave liga/desliga. Falta o teste com servidores MCP reais no app instalado.

## 4. Apagar chats em massa

- [x] 4.1 Seleção múltipla na barra lateral: clique, Ctrl+clique e Shift+clique para o intervalo.
- [x] 4.2 Ação de apagar os selecionados, com confirmação.
- [x] 4.3 Teclado (Delete, Esc) e leitor de tela.
- [x] 4.4 Testes.
- [x] 4.5 Aviso discreto de "N selecionados" com Excluir e limpar, só com 2 ou mais chats selecionados, na barra lateral e na Caixa de entrada; a Caixa de entrada agora também confirma antes de apagar vários (15/11). Falta ver no app instalado.

## 5. Sair menos do app: arquivos abrem dentro dele

- [x] 5.1 Clicar num arquivo citado no chat abre o arquivo no painel ao lado, não no Explorer.
- [x] 5.2 Botão direito no arquivo: abrir no Explorer, copiar caminho.
- [x] 5.3 Markdown com dois modos: Preview (formatado) e Raw (texto puro).
- [x] 5.4 Código: realce, número de linha e arquivo grande sem travar.
- [x] 5.5 Imagem, vídeo e áudio, cada um com o seu visualizador. PDF ainda abre fora: embutir pede afrouxar a regra de segurança da janela (`frame-src`), e isso espera decisão.
- [x] 5.6 Medir e otimizar os visualizadores que já existem.
- [x] 5.7 Lista do que mais tira o cliente do app, para as próximas rodadas.
- [x] 5.8 PDF abre no painel lateral com o leitor que já vem no motor do app, numa área isolada (sem acesso à internet, sem navegar a janela, links abrem no navegador do sistema) e sem biblioteca nova (15/11). Falta ver na tela do app instalado.
- [ ] 5.9 Próximos pontos em que o app manda o cliente para fora: link externo nas respostas (abrir na aba Browser do painel), links de pull request, links do terminal, login de provedores e de MCP, "abrir no editor" (não existe).
- [ ] 5.10 Validar no app instalado: clique real, vídeo, áudio e "Open in Explorer".
- [x] 5.11 Arquivo entregue aparece dentro do chat (16/11): quando a resposta cita um vídeo, imagem, áudio ou PDF pelo caminho, um cartão aparece abaixo da mensagem (player, miniatura ou cartão que abre no painel), com menu do botão direito: Copiar, Salvar como, Anexar como contexto, Copiar caminho, Copiar nome, Abrir no painel e Mostrar no Explorer. O caminho é conferido do lado do app e só vale dentro do projeto do chat. O agente Motion é instruído a entregar assim. Visto pelo dono do projeto com um vídeo real em 16/11: o vídeo vertical saía cortado no cartão e no painel. Corrigido no mesmo dia: o cartão toma a proporção real do vídeo ou da imagem (no máximo 480px de altura) e o painel mostra o vídeo inteiro. Ele confirmou no app instalado que o vídeo aparece inteiro nos dois lugares.

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
- [x] 8.5 Imagens fora das mensagens (15/11): cada imagem do histórico é guardada uma vez, como arquivo, e a mensagem leva só a referência; chats antigos migram ao serem abertos, sem perder a imagem se a gravação falhar. No chat medido, os dados enviados à tela caíram de 48 MB para 3 MB e o pico de memória do servidor de 1,1 GB para 0,5 GB.
- [ ] 8.6 Provedores ACP reenviam a saída acumulada inteira a cada atualização: gravar só a diferença.
- [x] 8.7 Teto de 1 MiB na mensagem da IA e no diff que vai para a tela, com nota do corte (15/11). O diff inteiro continua guardado no servidor: o Undo funciona em qualquer tamanho e o cartão mostra os totais reais. O painel de revisão por trechos não é cortado.

## 9. Modo Motion

Definição do dono do projeto (15/11): ligar o Motion transforma aquele chat num projeto de vídeo. Os bonecos da TUIFT entram em cena acima do chat e ficam esperando o trabalho. Tudo o que um vídeo de motion com IA precisa é ligado e carregado (skills, MCPs, contexto), como se o agente virasse um editor de vídeo. Em cada etapa, o boneco daquela etapa fica em destaque (por exemplo, o de referências). Ele ainda não sabe como fazer por dentro: a primeira subtarefa é o plano.

Depende dos itens 2 (skills) e 3 (MCP). O botão do item 6.2 é a porta de entrada. A cena dos bonecos é a exceção combinada à regra do chat intocado.

- [x] 9.1 Plano em `branding/plano-modo-motion.md`, aprovado pelo dono do projeto em 15/11, com os padrões propostos nas seis decisões.
- [x] 9.2 Fase 1, cena dos bonecos (só visual), feita em 15/11. Num chat novo os bonecos ficam acima do título (decisão do dono do projeto):
  - [x] 9.2a Levar as seis cabeças da identidade v2 para o app e registrar a origem.
  - [x] 9.2b Componente da cena acima da conversa, sem tocar no chat nem no campo de texto, com estilo carregado à parte.
  - [x] 9.2c Entrada, destaque e respiração com os tokens de movimento do app; sem animação para quem pediu menos movimento.
  - [x] 9.2d Janela estreita, leitor de tela e tradução de papéis e etapas.
  - [x] 9.2e Testes e prova no ambiente de demonstração, tema claro e escuro.
- [x] 9.3 Fase 2, o Motion guardado no chat:
  - [x] 9.3a Contrato: modo (`motion` ou `design`) e etapa nas configurações do chat; pedido para trocar o modo.
  - [x] 9.3b Servidor guarda e avisa; a tela lê o modo e a etapa do servidor (inclusive mudança vinda do celular) e migra, uma vez por chat, o que estava só local. O botão Motion fica travado enquanto a resposta é gerada.
  - [x] 9.3c Testes: o modo sobrevive a reiniciar a tela e às gravações que já existem.
- [x] 9.4 Fase 3, pacote Motion:
  - [x] 9.4a As skills de vídeo vão no instalador como pacote separado (fecha o item 2.6).
  - [x] 9.4b Instrução curta de papel e das dez etapas no início da sessão (cerca de 250 tokens), pelo mesmo canal do catálogo de skills, em todos os provedores.
  - [x] 9.4c Pacote ligado só em chats Motion (no Claude Code como plugin; nos outros, catálogo de cerca de 630 tokens); chat comum começa exatamente como antes. Ligar ou desligar no meio do chat vale no turno seguinte; em Grok, Cursor, Pi, Antigravity e ACP isso abre uma sessão nova do provedor, com a conversa levada como texto.
  - [x] 9.4d Provados com os programas reais os dois pontos de risco (15/11): o Claude Code lista o pacote só quando ele é passado; o Codex, num turno real, leu uma skill do pacote e rodou o script dela a partir de uma pasta com espaço no caminho.
- [x] 9.5 Fase 4, etapas:
  - [x] 9.5a Ferramenta `motion_stage` no canal do app, só em chats Motion (15/11): o agente avisa a etapa e recebe o dono, a próxima etapa e as skills de vídeo daquela etapa. É um guia, não uma trava. Chega a Claude Code, Codex e OpenCode; nos outros a pessoa define a etapa.
  - [x] 9.5b Etapa guardada e avisada à tela; o boneco certo acende, também na visão dividida, e a mudança é anunciada ao leitor de tela.
  - [x] 9.5c A pessoa troca a etapa clicando num boneco: abre o menu do app com as etapas dele. Travado enquanto a resposta é gerada. Num chat novo o menu só aparece depois da primeira mensagem; no painel secundário da visão dividida a etapa só é mostrada. Falta ver com um provedor real no app instalado.
- [x] 9.6 Fase 5, After Effects (15/11): o MCP do After Effects liga só em chats Motion, quando o After Effects está instalado; se a pessoa já tem um `after-effects` configurado, o dela vale. Sem After Effects, o agente é orientado a montar em HyperFrames e o Cloud mostra o aviso. Usa a lista enxuta de ferramentas. Falta ver com o After Effects de verdade no app instalado.
- [x] 9.7 Fase 6, a cena reage (15/11): o boneco da etapa mostra "esperando você" (balão na borda do círculo) quando o chat precisa de uma resposta ou aprovação, e um boneco acende enquanto um ajudante com o nome dele trabalha, inclusive nomes de plugin como `equipe:cloud`.
- [x] 9.10 Feixe do Motion em volta do campo de texto, como o Design tem, em cores mais fortes do elenco (pedido de 15/11). Corrigido em seguida um bloco cortado no canto de cima do campo em chat novo: o brilho interno ficava por cima da faixa do projeto e era cortado na emenda (valia também para o Design).
- [ ] 9.8 Elenco e papéis: Zig lidera (o laranja de óculos escuros, principal), Moss pesquisa as referências, Bun escreve o roteiro, Pip organiza o projeto, Cloud monta o vídeo no After Effects (o lilás) e Penny revisa cada quadro.
- [ ] 9.9 Validação do dono do projeto no app instalado, com um vídeo de verdade.

## 10. Um provedor por tipo de tarefa

Visão do dono do projeto (15/11): o TUIFT Code é a alternativa ao Claude Code, ao Codex e ao Grok para quem quer todos os provedores num lugar só. O cliente despacha cada tarefa para o modelo que faz aquilo melhor: pesquisa num, design noutro, planejamento complexo noutro. A base já existe no app; este item organiza o que falta.

- [ ] 10.1 Levantar o que o app já faz hoje: sub-agentes, escolha de provedor e modelo por agente, revisão automática.
- [ ] 10.2 Perfis por tipo de tarefa (pesquisa, design, planejamento, código), cada um com provedor e modelo, que o cliente configura.
- [ ] 10.3 Despacho de subtarefas para provedores diferentes dentro do mesmo chat.
- [ ] 10.4 Testes e validação no app.

## 11. MCP do After Effects embutido por padrão

Decisão de 15/11: o MCP de After Effects da casa vem dentro do app, para o cliente usar sem instalar mais nada.

- [x] 11.1 Levantamento feito (15/11): o servidor é um fork do `mcp-aftereffects` da Kumo (MIT) com as ferramentas da casa; precisa do After Effects 2024 a 2026 com a permissão de scripts ligada e roda com o próprio executável do app, sem Node instalado. Ficam de fora a documentação da Adobe, pacotes de terceiros sem licença de redistribuição e o que depende de produtos comerciais.
- [x] 11.2 Empacotado (15/11): o servidor vive no repositório público `iamjeffia/ae-mcp-tuift` (MIT, decisão do dono do projeto, com código, estilo padrão e lições), e o app fixa a versão 0.4.0 por SHA-256 em `packages/after-effects-mcp/server.json` e a leva no instalador, fora do arquivo compactado do app.
- [x] 11.3 Liga junto com o modo Motion, só naquele chat (fase 5 do Motion).
- [x] 11.4 After Effects ausente: aviso no boneco Cloud e na instrução do agente, em vez de erro.
- [~] 11.5 Testes feitos com servidores e arquivos falsos e com o pacote real subindo sem After Effects. Falta a validação no app instalado com o After Effects aberto, em cada provedor.

## 12. Sons e trilhas dentro do app

Decisão do dono do projeto (16/11): a biblioteca completa de sons (tonal sounds, efeitos e trilhas) fica hospedada e é usada dentro do app por quem assina o Clube do Motion e conectou a conta (item 17). Não vai no instalador e não existe download da biblioteca: o som usado num vídeo vira arquivo na pasta de áudio daquele projeto. Os agentes precisam saber que ela existe e usá-la na etapa de trilha, salvo quando o projeto já tem sons próprios ou a pessoa desligou.

- [x] 12.1 Biblioteca hospedada completada com os efeitos sonoros que faltavam e com trilhas (16/11): 6.894 sons, entre tonais, efeitos, trilhas e respostas de impulso. As trilhas têm gênero, tom e BPM estimados.
- [x] 12.2 Ferramentas do app para o agente (16/11), em chats Motion: buscar som (texto, tipo, categoria, tom, modo, faixa de BPM), usar som, buscar música do Clube e usar música. O som usado vai para `audio/clube/` do projeto com o nome real; o mesmo som pedido de novo reaproveita o arquivo. Chegam a Claude Code, Codex e OpenCode.
- [x] 12.3 Instrução no modo Motion (cerca de 116 tokens) e skill `composicao-trilha` reescrita na ordem: sons do próprio projeto, biblioteca do app, pasta da pessoa, saídas de emergência. Em Ajustes, "Usar os sons do app" e "Minha pasta de sons" (16/11).
- [x] 12.4 Sem assinatura, sem conta conectada, com o limite do dia ou com a biblioteca desligada, o agente recebe a explicação em palavras e a aba Sons mostra o que falta e o caminho (16/11).
- [x] 12.5 Aba Sons no painel em chats Motion (16/11): Tonais, Efeitos e Músicas (trilhas ou músicas do Clube), com busca, filtros, prévia e "Enviar" para o chat.
- [x] 12.6 Skill `ouvir`, com a earshot (MIT) como motor em versão fixada (16/11): medir volume e pico, eventos e conferência contra o plano de sons, tom e andamento com aviso de confiança, comparar, descrever, achar trecho, transcrever fala e segunda opinião opcional. `watch` e `ouvir` valem em todo chat e voltaram às etapas do Motion (referências, trilha e revisão).
- [ ] 12.7 Validação do dono do projeto no app instalado, com a conta real: conectar, buscar e usar um som, uma trilha e uma música; a transcrição de fala da `ouvir` não rodou de verdade.

## 13. Modo Design completo

Decisão de 16/11: o modo Design cobre tudo de UI/UX (site novo, tela de app, redesign, revisão e animação de interface) e carrega todas as skills de design que a casa usa, não só as próprias. O pacote Design já ia no instalador com a `ui-profissional`, mas nenhum chat o carregava.

- [x] 13.1 Pacote Design completo (16/11), 44 skills: as da casa (`ui-profissional`, `stageshow`, `figma`) e 41 de terceiros com licença que permite, em versão fixada e com a licença de cada uma. `design-taste-frontend` e `frontend-design` foram unidas numa só, que continua em todos os chats com as duas licenças; uma skill pode estar em dois pacotes.
- [x] 13.2 O pacote carrega em chats com Design ligado, com instrução de papel (16/11). A causa de não carregar era a tela guardar o botão Design só localmente: agora o servidor é avisado.
- [x] 13.3 Diagnóstico com provedor de verdade em cinco tipos de pedido (16/11), e conserto de: fase enviada depois da parada de emergência, captura de tela sem janela aberta (termina com aviso em vez de travar), achados da revisão escondidos e pasta grande sem aviso. Provas em `branding/provas/design-diagnosis/`.
- [x] 13.4 As skills de design instaladas pela página de Skills também carregam em chats Design (16/11).
- [x] 13.5 Fluxo do Design corrigido (16/11), provado com quatro pedidos reais: o pedido é classificado em site novo, redesign, mudança ou revisão, e cada um faz só o seu trabalho (revisão não muda arquivo; mudança pula briefing, marca, plano e imagens); a revisão automática vê a página inteira no desktop e no celular e recebe medidas da própria página, reprovando as duas páginas que tinha aprovado errado; o redesign acha e revisa todas as páginas, com teto de seis por rodada; cada validação que um modelo costuma errar tem conserto automático, e a resposta diz o modelo e o que o app completou; as mensagens do fluxo são traduzidas pela tela e os achados são pedidos no idioma do pedido. As fases que escrevem a interface passam a poder usar o pacote Design. O player do card de áudio ganhou uma linha própria, e o Motion manda ouvir um som com a `ouvir` antes de recomendar. Provas em `branding/provas/design-flow/`.
- [ ] 13.6 Validação do dono do projeto no app instalado.

## 14. README bonito no GitHub

Pedido de 15/11: o repositório é público e a página inicial precisa ser visual, no nível das referências escolhidas (open-design, ego-lite, taste-skill).

- [x] 14.1 Estudar as referências e anotar a estrutura.
- [x] 14.2 Hero com a marca, frase curta e selos; captura real do app logo abaixo.
- [x] 14.3 Grade de recursos com imagens reais e legenda curta, pouco texto.
- [x] 14.4 Créditos e licença compactos, mantendo a atribuição ao TasteCode.
- [x] 14.5 Prova: README renderizado em tema claro e escuro, largura normal e celular.
- [x] 14.6 Índice `.agents/skills/README.md` com o mesmo cabeçalho do README principal (marca, selos e atalhos para cada grupo), feito em 15/11.

## 15. Roteiro visível dentro do app (build in public)

Ideia do dono do projeto em 15/11: este checklist fica público porque pode virar um roteiro visual dentro do app, para quem usa acompanhar o que está pronto e o que vem.

- [ ] 15.1 Definir o que o roteiro mostra (itens, estado, data) e de onde lê: este arquivo no repositório ou um resumo gerado dele.
- [ ] 15.2 Tela do roteiro com os componentes que o app já tem.
- [ ] 15.3 Manter este arquivo sem dado privado, já que ele passa a aparecer para o cliente.

## 16. Confiabilidade e desempenho

Pedido de 15/11, depois de um trabalho longo de vídeo em que o sistema ficou sem memória e o agente caiu: mapear os cenários de falha, tratar cada um e deixar o app leve.

- [x] 16.1 O feixe em volta do campo de texto (Design e Motion) anima só transformação e opacidade. Antes animava um valor de estilo a cada quadro: com o chat parado, a tela passava de 6 GB em dois minutos e usava um núcleo inteiro de CPU; agora fica em cerca de 240 MB, com o mesmo visual. Para com a janela oculta. Falta medir com placa de vídeo real no app instalado. Em 16/11, medido com placa de vídeo real: num monitor de 360 Hz qualquer animação contínua desenhava 360 quadros por segundo. O feixe agora dá algumas voltas (ao ligar o modo, ao começar um turno, ao focar o campo) e descansa; spinner, pulso e respiração dos bonecos andam em passos; o brilho do texto varre poucas vezes. Chat Motion parado: de 32% e 135% de um núcleo (tela e processo de vídeo) para cerca de 1% e 0,2%.
- [x] 16.2 Processo do provedor que morre: aviso em português com o motivo (falta de memória, encerrado, erro do provedor ou desconhecido), o que foi preservado e o botão Continuar; o código bruto fica numa linha de detalhes.
- [x] 16.3 Fechar o app com chats trabalhando pergunta antes; na saída normal os turnos param como no botão Stop. Depois de qualquer reinício, o chat interrompido avisa e oferece Continuar; nada continua sozinho.
- [x] 16.4 Aviso de memória baixa do sistema, uma vez por episódio, citando os maiores consumidores (Windows).
- [x] 16.5 O chat sempre mostra que há trabalho: ajudante, ferramenta e comando com tempo próprio e o que estão fazendo agora; faixa de status acima do campo de texto; "última atividade há…" quando nada chega, e uma linha calma depois de dois minutos; turno interrompido não aparece como concluído. Em 16/11 os bonecos do Motion passaram a morar nessa faixa (parado: os seis rostos e a etapa; trabalhando: o rosto de quem trabalha no lugar do ponto), e a faixa de bonecos acima da conversa saiu.
- [x] 16.5b Ao enviar uma mensagem, o prompt fica ancorado no topo mesmo quando a área da conversa muda de altura logo depois (16/11). O caso exato relatado pelo dono do projeto não foi reproduzido em bancada; ele confirmou no app instalado, em 16/11, que o chat não sobe mais.
- [x] 16.6 O computador não dorme enquanto um turno roda (16/11): o app segura o sono do sistema, deixa a tela apagar, e solta quando o último chat termina, ao sair, ou dois minutos depois de a tela sumir sem avisar.
- [x] 16.7 Servidor do app que não sobe diz o motivo (16/11): código de saída próprio para porta em uso, pasta de dados presa por outra cópia, banco travado, banco danificado, sem permissão e disco cheio; o aviso fala a causa e o que fazer, sem repetir tentativas inúteis; "reinstale" ficou só para causa desconhecida, com o caminho do registro. As últimas linhas de saída do servidor ficam num arquivo pequeno e filtrado.
- [x] 16.8 Falha de escrita no meio de um turno não derruba o servidor (16/11): reproduzida antes de corrigir (com o disco cheio o servidor caía). Agora o turno termina com aviso traduzido (disco cheio, arquivo em uso ou falha ao salvar), o provedor é parado, a fila fica guardada e o servidor segue respondendo.
- [x] 16.9 Cópia de segurança rotativa do banco de conversas (16/11): no máximo uma por dia, as duas mais novas ficam na pasta `backups` ao lado do banco, feita em segundo plano sem travar um turno. Banco danificado é separado com data, a cópia mais nova que abre é restaurada e um aviso fica na tela até ser dispensado; banco só travado nunca é separado. Nada é apagado.
- [x] 16.10 Janela escondida na bandeja deixa de ocupar memória (16/11): depois de 5 minutos escondida, sem chat trabalhando e sem nada a perder (rascunho é salvo; painel lateral, terminal, Ajustes ou diálogo abertos seguram a descarga), a janela é desfeita e volta no mesmo chat ao ser mostrada.
- [x] 16.11 Processos de provedor que sobraram de uma queda são encerrados na partida seguinte (16/11): só quando o número, a hora de início e o executável batem com o que foi gravado e o app que os iniciou já não existe. Um registro por pasta de dados.
- [x] 16.12 A tela se recupera depois de cair, até três vezes seguidas; a contagem zera depois de cinco minutos saudável (16/11). O motivo vai para o diagnóstico. Depois de queda por falta de memória o chat não é reaberto, com um aviso de uma linha.
- [x] 16.13 Teto de 256 KiB para a mensagem da pessoa, o plano e o raciocínio (16/11). A mensagem da pessoa nunca é cortada: o campo recusa antes de enviar e oferece "Anexar como arquivo". Nenhum evento passa de 4 MiB, então um texto enorme não derruba mais a conexão.
- [x] 16.14 Login vencido ou sem acesso no meio do turno vira aviso com o botão Entrar, que abre os provedores, e Continuar ao lado (16/11). Cobre Claude Code, Codex, OpenCode e agentes ACP, pelo sinal que o próprio provedor dá. Grok, Cursor, Pi e Antigravity seguem com o texto cru.
- [x] 16.15 Brilhos de texto que redesenhavam a cada quadro: agora varrem poucas vezes e param (16/11). Um teste lista toda animação contínua e falha quando aparece uma que não seja barata.
- [x] 16.16 A porta do servidor abre antes de refazer índices grandes (16/11): com 197 mil eventos a partida até a primeira resposta caiu de cerca de 7 a 9 segundos para 0,5 a 2,3 segundos; a reconstrução segue em fatias, retoma se o app fechar, e a busca avisa que ainda está atualizando.
- [ ] 16.17 Validação do dono do projeto no app instalado: memória e CPU com um chat Motion aberto por uma hora.
- [x] 16.18 O app sabe pelo servidor quais chats trabalham, não pela tela (16/11): o servidor avisa o processo que o iniciou a cada mudança de estado (trabalhando, esperando aprovação ou resposta, falhou), pelo mesmo canal do pedido de encerramento. Sono do computador, descarga da janela escondida, pergunta ao sair e notificações usam esse aviso, então valem para um turno iniciado pelo celular com a janela descarregada ou fechada. O modo de notificação escolhido fica guardado pelo app para valer sem tela. Falta ver no app instalado com um turno real do celular.
- [x] 16.19 Restos da rodada de 16/11, feitos em 16/11: o app do celular mostra o aviso de banco restaurado (alerta com a data da cópia e o local do arquivo no computador; dispensar no celular dispensa em todo lugar); o shell de cada terminal entra no registro de processos órfãos; login recusado vira aviso com Entrar no Grok, no Cursor e no Antigravity, só pelas mensagens que o próprio programa de cada um traz.
- [ ] 16.20 Validação do dono do projeto no app instalado dos itens 16.6 a 16.16: nenhum foi visto com sono real, bandeja real, queda real, disco cheio ou banco danificado de verdade.
- [ ] 16.21 O Swift do aviso no celular não foi compilado (não há Mac nesta máquina): falta gerar o app do iPhone e ver o alerta. O app do celular segue o idioma do aparelho, não o escolhido no computador.
- [ ] 16.22 Login vencido ainda cru: Pi (sem mensagem de erro documentada e sem o programa instalado para capturar) e, em todos os quatro, conta sem acesso. Um processo que um comando do terminal separou do grupo sobrevive a uma queda e o registro não o alcança.
- [x] 16.23 Saída limpa na troca de versão (16/11): o instalador pede ao app para sair antes de trocar os arquivos e espera até 25 segundos; o app para os turnos e marca os chats, desliga o servidor, encerra provedores e terminais e fecha o banco, com prazo em cada etapa (15 segundos no total). Com chat trabalhando, a instalação silenciosa não fecha nada e para com código próprio; a instalação com janela pergunta. O botão "Reiniciar para atualizar" passou a sair primeiro e instalar depois. Só encerra à força se o app não sair, e registra. A primeira instalação depois desta ainda encerra à força, porque a versão anterior não conhece o pedido. Falta ver um instalador real sobre o app real.
- [ ] 16.24 Aviso do Node no registro do servidor em uso real (16/11): mais de dez ouvintes de saída no mesmo processo filho, repetido a cada turno. Achar quem registra o ouvinte de novo em vez de uma vez, e medir se cresce num chat longo.

## 17. Conexão com o Clube do Motion

Decisão de 16/11: o Clube do Motion faz parte do ecossistema e pode ser citado no app. Quem assina o Clube usa no TUIFT Code todos os benefícios de assinante: MCP conectado, sons, trilhas, biblioteca, projetos e skills.

- [x] 17.1 Conectar com a conta do Clube pelo login que ele já oferece (16/11): passo opcional no onboarding e aba em Ajustes, com os estados conectado, sem assinatura, falha e desconectar. O acesso fica no cofre de credenciais do sistema e nunca aparece para o agente, em arquivo de projeto ou no celular.
- [x] 17.2 MCP do Clube ligado sozinho depois de conectar com conta de assinante (16/11), em Claude Code, Codex e OpenCode, com o servidor do app no meio; se a pessoa já tem o dela configurado, o dela vale. Período de teste não conta como assinante. Falta nos provedores que ainda não recebem as ferramentas do app.
- [x] 17.3 Do lado do Clube (16/11): sons para o assinante que conecta pelo TUIFT Code, prévia que não conta no limite, filtros e faixa de BPM.
- [ ] 17.4 Painel do Clube no app: buscar na biblioteca, baixar projeto para a pasta, instalar skills do Clube e ver os limites do dia.
- [ ] 17.5 Validação do dono do projeto no app instalado, com a conta real: nada desta seção rodou contra o Clube de verdade.

## Ondas de trabalho

Cada frente roda num worktree próprio em `C:/Dev/tuift-wt/<frente>`, numa branch `tuift/<frente>`, e volta para a `main` por merge depois de conferida.

| Onda | Frente                                                                                                                                       | Subtarefas                                 | Estado                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------- |
| 1    | `i18n-core`                                                                                                                                  | 1.1, 1.2, 1.3                              | na `main` (15/11), testada |
| 1    | `mcp-cards`                                                                                                                                  | 3.1 a 3.5                                  | na `main` (15/11), testada |
| 1    | `bulk-delete`                                                                                                                                | 4.1 a 4.4                                  | na `main` (15/11), testada |
| 1    | `file-viewers`                                                                                                                               | 5.1 a 5.7                                  | na `main` (15/11), testada |
| 1    | `composer`                                                                                                                                   | 6.1, 6.2                                   | na `main` (15/11), testada |
| 1    | `design-scan`                                                                                                                                | 6.3                                        | na `main` (15/11), testada |
| 1    | `skills`                                                                                                                                     | 2.1, 2.3, 2.4                              | na `main` (15/11), testada |
| 1    | `chat-leak`                                                                                                                                  | 8.1 a 8.4                                  | na `main` (15/11), testada |
| 1b   | `skills-pin`                                                                                                                                 | 2.5a                                       | na `main` (15/11)          |
| 1b   | `skills-motion`                                                                                                                              | 2.5b                                       | na `main` (15/11)          |
| 1b   | `skills-ae-trilha`                                                                                                                           | 2.5c                                       | na `main` (15/11)          |
| 1b   | `skills-misc`                                                                                                                                | 2.5d                                       | na `main` (15/11)          |
| 1b   | `readme`                                                                                                                                     | 14.1 a 14.5                                | na `main` (15/11)          |
| 3    | `motion-cast`, `motion-state`, `motion-pack`                                                                                                 | 9.2, 9.3a, 9.4a                            | na `main` (15/11), testada |
| 2    | `i18n-settings`, `i18n-sidebar`, `i18n-onboarding`, `i18n-workspace`, `i18n-dialogs`, `i18n-desktop`                                         | 1.4 a 1.12                                 | na `main` (15/11), testada |
| 4    | `restos-i18n`                                                                                                                                | 1.16                                       | na `main` (15/11), testada |
| 5    | `motion-read`, `motion-session`, `bulk-count`, `pdf-viewer`, `output-caps`                                                                   | 9.3b, 9.3c, 9.4b, 9.4c, 4.5, 5.8, 8.7      | na `main` (15/11), testada |
| 6    | `motion-stage-tool`, `motion-stage-ui`                                                                                                       | 9.5a, 9.5b, 9.5c                           | na `main` (15/11), testada |
| 7    | `motion-ae`, `motion-ae-ui`, `ae-bundle`                                                                                                     | 9.6, 11.1 a 11.4                           | na `main` (15/11), testada |
| 8    | `motion-react`, `chat-feedback`, `crash-recovery`, `memory-images`, `beam-compositor`                                                        | 9.7, 8.5, 16.1 a 16.5                      | na `main` (15/11), testada |
| 9    | `strip-cast`, `perf-gpu`, `media-delivery`                                                                                                   | 5.11, 16.1, 16.5, 16.5b, 16.15             | na `main` (16/11), testada |
| 10   | `desk-lifecycle`, `server-startup`, `write-safety`, `orphans-caps`                                                                           | 16.6 a 16.14, 16.16                        | na `main` (16/11), testada |
| 11   | `server-activity`                                                                                                                            | 16.18                                      | na `main` (16/11), testada |
| 12   | `reliability-leftovers`                                                                                                                      | 16.19                                      | na `main` (16/11), testada |
| 13   | `ouvir-skill`, `design-pack`, `skills-catalog`, `design-diagnosis`, `clube-link`, `sound-library`, `third-party-pack`, `design-skill-fusion` | 2.8, 12.1 a 12.6, 13.1 a 13.4, 17.1 a 17.3 | na `main` (16/11), testada |
| 14   | `design-flow`                                                                                                                                | 13.5                                       | na `main` (16/11), testada |
| 15   | `clean-exit`                                                                                                                                 | 16.23                                      | na `main` (16/11), testada |
