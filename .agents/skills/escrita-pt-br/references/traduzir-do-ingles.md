# Traduzir do inglês para o português do Brasil

Traduzir é reescrever, para outro leitor, o que o original quer dizer. A pergunta de trabalho é: "como um brasileiro explicaria isto, na mesma situação, ao mesmo leitor?"

## Método

1. **Leia o original inteiro** antes de traduzir. Descubra quem lê, para quê e em que tom.
2. **Separe o que não se traduz**: nomes de produto e de pessoas, código, comandos, caminhos, URLs, variáveis, marcação.
3. **Traduza o sentido, por unidade de ideia**, não palavra por palavra. Se a frase em inglês é longa, divida.
4. **Adapte** o que depende de cultura, formato e convenção (datas, moeda, medidas, tom, piadas).
5. **Releia só o português**, sem olhar o original. O texto se sustenta? Soa como alguém daqui escrevendo?
6. **Compare com o original**: nada foi acrescentado, perdido ou distorcido? Números, nomes e negações conferem?

Se o original é ambíguo, escolha a leitura mais provável e avise em uma linha. Não "melhore" o texto acrescentando informação que ele não tinha.

## O que muda de ordem e de forma

| Inglês                                  | Português                                          |
| --------------------------------------- | -------------------------------------------------- |
| substantivo empilhado: *project settings page* | página de configurações do projeto           |
| adjetivo antes do substantivo           | adjetivo depois, na maioria dos casos              |
| *Your account was created.*             | A conta foi criada. / Conta criada.                |
| *You can…*                              | Verbo no imperativo, ou "Dá para…"                 |
| *Please* em toda instrução              | Em geral dispensado. Fica para pedido real de favor |
| *we* de empresa                         | "nós", ou o verbo na 1ª pessoa do plural; muitas vezes dá para omitir |
| pronome *it* e *they* (singular)        | repita o substantivo, ou reformule                  |
| *just*, *simply*, *easily*              | corte (o leitor pode achar que não é fácil)         |
| *-ing* como sujeito: *Adding a file…*   | infinitivo ou substantivo: "Adicionar um arquivo…" / "A inclusão…" |

## Frases de produto, de bolso

| Inglês                       | Português                                   |
| ---------------------------- | ------------------------------------------- |
| Learn more                   | Saiba mais                                  |
| Get started                  | Começar                                     |
| Sign up for free             | Criar conta grátis                          |
| Welcome back                 | Que bom ver você de novo                    |
| Something went wrong         | Não foi possível concluir. Tente de novo.   |
| Are you sure?                | Excluir este item? (diga a ação)            |
| Coming soon                  | Em breve                                    |
| Built for creators           | Feito para quem cria                        |
| No results found             | Nenhum resultado para "x"                   |
| Hey there!                   | Oi!                                         |
| Oops!                        | (corte, ou diga o fato)                     |

Evite traduzir um título de efeito palavra a palavra. "Built for creators" pode ser "Feito para quem cria", mas um slogan com trocadilho precisa de uma nova ideia, não de uma tradução.

## O que localizar

| Elemento                      | Em inglês         | No Brasil                          |
| ----------------------------- | ----------------- | ---------------------------------- |
| Data                          | 11/15/2026        | 15/11/2026 ou 15 de novembro de 2026 |
| Hora                          | 3:30 PM           | 15h30 (ou 15:30 em tela)           |
| Milhar e decimal              | 1,234.56          | 1.234,56                           |
| Moeda                         | $49.99            | US$ 49,99 (dólar) ou R$ 49,99 (real) |
| Bilhão e trilhão              | billion, trillion | bilhão, trilhão                    |
| Medidas                       | 5 miles, 70 °F    | 8 km, 21 °C                        |
| Nomes de teclas               | Return, Control   | Enter, Ctrl (confira o teclado)    |
| Campos de formulário          | ZIP code          | CEP                                |
| Cargos e nomes de instituição | State Department  | use o nome oficial em português, se existir |

- Converta uma medida quando o leitor precisar dela para decidir ou agir (receita, tamanho, prazo). Mantenha quando for citação, dado histórico ou nome próprio. Se converter, diga: "8 km (5 milhas)".
- Preço em dólar não vira preço em reais por conta própria: o câmbio muda. Mantenha "US$" e deixe a conversão para quem publica.
- Referências culturais (feriados, esportes, escolas, marcas só dos Estados Unidos): troque por um equivalente brasileiro só se o texto for de uso local; senão, mantenha e explique em poucas palavras.

## O que manter

- Nome de produto, recurso e comando, como aparece na tela de quem vai usar.
- Código, caminhos, URLs, variáveis, chaves de configuração.
- Placeholders e marcação: `{nome}`, `%s`, `{{count}}`, `<b>…</b>`. Não os traduza nem os apague. Só mude a ordem se o formato aceitar posições numeradas.
- Citações de terceiros. Se for citar em português, indique que é tradução sua.
- Siglas conhecidas (API, PDF, SaaS, CPU). Se a sigla for desconhecida para o leitor, expanda na primeira vez.

## Termos que ficam em inglês

Decida por três perguntas:

1. **O público já usa o termo em inglês?** (app, link, e-mail, site, backup, wi-fi, login, podcast, streaming.) Mantenha.
2. **Tem equivalente que o público reconhece?** (download → baixar; upload → enviar; dashboard → painel; template → modelo.) Traduza.
3. **É nome de coisa específica (comando, recurso, produto, função de código)?** Mantenha e, se ajudar, explique na primeira vez: "o recurso de *prompt* (a instrução que você escreve para o modelo)".

Regras de apoio:

- Use o mesmo termo em todo o texto. Não alterne "arquivo" e "file", nem "baixar" e "fazer download".
- Termos técnicos para público técnico ficam em inglês quando a tradução soa estranha ("fazer um pull request" é a fala comum da equipe de código).
- Termo em inglês dentro do português: plural com "s" ("os apps", "dois prompts"), sem apóstrofo.
- Em documentação, o termo estrangeiro ainda não incorporado vai em itálico na primeira vez. Em tela de produto, sem itálico.
- Verbos: prefira o verbo português se existir ("baixar", "enviar", "publicar"). Se for jargão de equipe de código, "commitar" e "deployar" circulam, mas não use com um público leigo.

## Tom, humor e jogo de palavras

- Registro: o inglês de marca costuma ser casual; o português do mesmo tom pede "você", frases curtas e poucas exclamações.
- Humor e trocadilho raramente sobrevivem. Escolha entre adaptar com uma piada nova ou escrever sem a piada. Avise quando fizer isso.
- Hipérbole de marketing ("amazing", "game-changing") soa mais forte e menos crível em português. Reduza e conecte a um fato.

## Gênero, número e a pessoa que lê

- *User*: "pessoa", "quem usa", "usuário" (se o termo for estabelecido no produto).
- *They* singular: reformule ("a pessoa", "quem") ou escolha uma forma e mantenha.
- *Welcome*, *connected*, *invited*: adjetivos com gênero em português. Reformule ("Boas-vindas", "Sessão iniciada", "Convite enviado"). Veja `texto-de-interface.md`.
- Plural e zero: veja `texto-de-interface.md`.

## Comprimento

O português ocupa 20% a 30% mais espaço que o inglês. Em interface, legenda e título, compare o tamanho do original e do resultado. Se estourar, reescreva mais curto, em vez de abreviar. Não corte conteúdo sem avisar.

## Exemplo completo

Original:

> We're sorry — we couldn't upload your file. Please make sure you're connected to the internet and try again. If the problem continues, contact support.

Tradução palavra a palavra, ruim:

> Nós lamentamos — nós não pudemos fazer o upload do seu arquivo. Por favor, tenha certeza de que você está conectado à internet e tente novamente. Se o problema continuar, contate o suporte.

Tradução trabalhada:

> Não foi possível enviar o arquivo. Confira sua conexão com a internet e tente de novo. Se continuar assim, fale com o suporte.

O que mudou: "lamentamos" saiu (o erro não precisa de pedido de desculpas teatral); "fazer o upload" virou "enviar"; "tenha certeza de que você está" virou "confira"; "please" sumiu; "contate" virou "fale com".
