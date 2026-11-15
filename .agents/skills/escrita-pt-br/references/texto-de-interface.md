# Texto de interface

Texto de tela é lido de relance, em pouco espaço, por quem quer fazer outra coisa. Cada palavra precisa ajudar a pessoa a agir. Estas regras valem para botão, menu, título, mensagem, dica e tela vazia.

## Botões e itens de menu

- **Verbo no infinitivo**, que diz o que acontece ao clicar: "Salvar", "Enviar convite", "Excluir projeto".
- **Seja específico.** "Criar conta" é melhor que "Continuar". "Excluir projeto" é melhor que "Sim".
- **Não use** "OK" quando há uma ação mais precisa. "OK" serve para avisos que só confirmam a leitura.
- **Mantenha uma forma só.** Todos os botões no infinitivo ("Salvar", "Cancelar"); instruções em frase no imperativo ("Digite o código"). Não misture "Entre" com "Cadastrar".
- **Pares claros:** "Cancelar" e "Salvar"; "Manter" e "Excluir"; "Voltar" e "Avançar".
- **Sem ponto final** em botão, rótulo, aba ou item de menu.

## Maiúsculas

Só a primeira letra da frase e os nomes próprios. O inglês usa "Title Case" ("Save Changes"); o português não.

| Em inglês         | Em português         |
| ----------------- | -------------------- |
| Save Changes      | Salvar alterações    |
| Create New Project | Criar projeto novo  |
| Account Settings  | Configurações da conta |

Nomes de produto, de recurso com nome próprio, de mês e de dia seguem a regra geral (mês e dia em minúscula).

## Títulos e rótulos

- Título diz o que a tela faz ou o que aconteceu: "Convide sua equipe", "Pagamento confirmado".
- Rótulo de campo é um substantivo curto: "E-mail", "Senha", "Nome do projeto". Sem dois-pontos se o layout já separa o rótulo do campo.
- Texto de exemplo (placeholder) mostra um valor plausível (um endereço de e-mail fictício, num campo de e-mail), não repete o rótulo e não substitui o rótulo.
- Link com texto próprio: "Ver planos", "Ler a política de privacidade". Evite "Clique aqui" e "Saiba mais" soltos.

## Mensagens de erro

Uma boa mensagem de erro diz três coisas, nesta ordem, nas palavras do usuário:

1. **O que aconteceu.**
2. **Por que** (se souber e se ajudar).
3. **O que fazer agora.**

| Antes                                    | Depois                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Erro 500.                                | Não conseguimos salvar agora. Tente de novo em alguns minutos.               |
| E-mail inválido!                         | Esse e-mail parece incompleto. Confira se ele tem @ e o domínio.             |
| Você digitou a senha errada.             | A senha não confere. Tente de novo ou redefina a senha.                      |
| Oops! Algo deu errado :(                 | Não foi possível enviar o arquivo. Verifique sua conexão e tente de novo.    |
| Falha na operação. Contate o administrador. | Você não tem permissão para excluir este projeto. Peça acesso a quem o administra. |

Regras:

- Não culpe a pessoa ("Você errou"). Descreva o estado do sistema ("O código não confere").
- Sem exclamação, sem humor forçado, sem "Oops" e sem emoji em erro. A pessoa está frustrada.
- Evite código e jargão sozinhos. Se houver código de erro, ponha-o depois, em tom discreto: "Código: E-2041".
- Diga a saída. Um erro sem próximo passo é um beco.
- Erro em campo de formulário aparece junto do campo, e diz como corrigir, não só o que está errado.

## Estados de sucesso e de espera

- Sucesso: confirme o que foi feito, em poucas palavras. "Alterações salvas." "Convite enviado para a Ana."
- Carregando: "Carregando…" para espera curta. Para espera longa, diga o que acontece: "Importando 120 arquivos…".
- Tela vazia: explique o que viria ali e ofereça a primeira ação. "Você ainda não tem projetos. Crie o primeiro."
- Confirmação de ação destrutiva: diga o que será perdido e se é reversível. Botão repete a ação.

| Título                         | Texto                                                        | Botões                  |
| ------------------------------ | ------------------------------------------------------------ | ----------------------- |
| Excluir o projeto "Verão"?     | Os 24 arquivos do projeto serão apagados. Não dá para desfazer. | Cancelar · Excluir projeto |

## Ponto final e exclamação

- Frase completa leva ponto. Rótulo, botão e título curto não.
- Mensagem com duas frases leva ponto nas duas.
- Se uma frase de aviso é a única do componente, use o mesmo critério do produto inteiro e não varie de tela em tela.
- Exclamação só em comemoração real ("Conta criada!"). Uma por tela, no máximo.

## Plural, zero e gênero

- **Não use "(s)".** "Arquivo(s) selecionado(s)" é difícil de ler e de traduzir. Escreva as formas separadas.
- **Zero, um e vários.** No português do Brasil, bibliotecas de plural (como `Intl.PluralRules`) tratam 0 e 1 como a mesma categoria, o que daria "0 arquivo". Escreva o zero à parte:

| Quantidade | Texto                    |
| ---------- | ------------------------ |
| 0          | Nenhum arquivo           |
| 1          | 1 arquivo                |
| 2 ou mais  | 24 arquivos              |

- **Gênero.** Evite adjetivo e particípio que dependem do gênero do usuário: "Conectado(a)", "Bem-vindo(a)", "Cadastrado". Reformule: "Sessão iniciada", "Boas-vindas", "Cadastro concluído". Veja também a seção de linguagem inclusiva em `registro-e-tratamento.md`.
- **Concordância com variáveis.** "{n} arquivos" com texto fixo quebra em "1 arquivos". Se o código monta frases, entregue mensagens inteiras para cada forma, e não peças soltas.

## Tamanho

O português costuma ocupar 20% a 30% mais espaço que o inglês. Planeje:

- Prefira palavras curtas. "Enviar" em vez de "Fazer envio". "Pedido" em vez de "Solicitação".
- Não abrevie para caber ("Cad.", "Qtd.", "Config."). Abreviação confunde e quase nunca poupa espaço útil. Se não couber, reescreva mais curto.
- Para menus e abas, uma palavra. Para botões, uma a três palavras. Para títulos, até uma linha. Para mensagens, até duas frases.
- Não deixe reticências cortarem um comando, um número ou um nome de arquivo.

## Termos de software

Termo consagrado fica; termo com equivalente claro, traduz. Mantenha o mesmo termo para a mesma coisa em todo o produto.

| Inglês                | Português                         | Observação                                        |
| --------------------- | --------------------------------- | ------------------------------------------------- |
| Sign in, Log in       | Entrar                            | "Fazer login" também é comum                      |
| Sign out, Log out     | Sair                              |                                                   |
| Sign up               | Criar conta, Cadastrar-se         | "Cadastre-se" em texto direto                     |
| Settings              | Configurações                     | "Preferências" para ajustes pessoais              |
| Dashboard             | Painel                            |                                                   |
| Download              | Baixar                            | "Download" como substantivo é aceito              |
| Upload                | Enviar                            | "Fazer upload" é aceito em texto informal         |
| Delete                | Excluir, Apagar                   | "Remover" tira de uma lista, sem apagar de vez    |
| Share                 | Compartilhar                      |                                                   |
| Undo, Redo            | Desfazer, Refazer                 |                                                   |
| Search                | Buscar, Pesquisar                 | Escolha um e mantenha                             |
| Drag and drop         | Arraste e solte                   |                                                   |
| Retry                 | Tentar de novo                    |                                                   |
| Workspace             | Espaço de trabalho                |                                                   |
| Template              | Modelo                            |                                                   |
| Placeholder           | Texto de exemplo                  |                                                   |
| Tooltip               | Dica                              |                                                   |
| Feedback              | Opinião, retorno                  | "Feedback" é comum no mundo do trabalho           |
| Link, app, e-mail, site, backup, Wi-Fi | iguais              | Já fazem parte do português                       |
| Prompt, token, commit, branch, API | iguais              | Termos técnicos para público técnico              |

Para decidir o que manter, veja `traduzir-do-ingles.md`, seção "Termos que ficam em inglês".

## Cliques, toques e atalhos

- "Clique" para computador, "Toque" para tela de toque, "Selecione" ou "Escolha" quando serve aos dois.
- Nomes de tecla: Ctrl, Shift, Enter, Esc, Tab, Delete. Combinações com "+" e sem espaço extra: Ctrl+S.
- Em texto corrido, ponha o nome do botão entre aspas ou em negrito, de forma constante: clique em **Salvar**.

## Números, datas e moeda na tela

- Data curta: 15/11/2026. Data longa: 15 de novembro de 2026.
- Hora em 24 horas: 14:30 (tela) ou 14h30 (texto).
- Moeda: R$ 49,90. Dólar: US$ 49,90.
- Tempo relativo: "há 3 minutos", "ontem", "em 2 dias".
- Mais detalhes: `pontuacao-e-tipografia.md`.
