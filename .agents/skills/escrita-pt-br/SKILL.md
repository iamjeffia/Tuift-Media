---
name: escrita-pt-br
description: Redigir, traduzir ou revisar texto em português do Brasil que uma pessoa vai ler, como texto de interface, legenda, roteiro, post, e-mail, documentação e nota de versão, mantendo o sentido e o registro. Use quando o pedido for produzir ou melhorar um texto escrito, inclusive traduzir do inglês. Não use só porque a conversa está em português, nem para código, nem para português de Portugal.
---

# Escrita em português do Brasil

Esta skill é o método para escrever, traduzir e revisar texto em português do Brasil. O objetivo é um texto que a pessoa leia sem esforço, entenda de primeira e não perceba que foi traduzido ou gerado por máquina.

## Quando usar

- Escrever do zero: texto de tela, legenda, roteiro, post, e-mail, documentação, nota de versão.
- Traduzir do inglês (ou de outra língua) para o português do Brasil.
- Revisar um texto que já existe: clareza, naturalidade, gramática, tom.

Não use para conversar em português, para comentário de código, nem quando o leitor é de Portugal. Nesse último caso, avise que o vocabulário e a grafia seguem o Brasil.

## Método

### 1. Entenda quem lê e para quê

Antes de escrever, responda em uma linha cada:

- **Quem lê** e o que já sabe do assunto.
- **Onde lê**: tela pequena, e-mail, legenda de vídeo, página de ajuda, voz alta.
- **O que deve acontecer depois**: entender, decidir, clicar, copiar um comando, só se informar.
- **Registro**: formal, neutro ou informal. Veja `references/registro-e-tratamento.md`.
- **Limites**: número de caracteres, glossário, nome de produto, termos que não mudam.

Se faltar uma dessas respostas e errar custar pouco, assuma e diga o que assumiu em uma frase. Se errar custar caro (texto jurídico, preço, aviso de segurança, marca), pergunte uma vez, com opções.

### 2. Escolha o modo

- **Redigir:** comece pelo que o leitor mais precisa. Escreva como se explicaria a uma pessoa inteligente que não conhece o assunto.
- **Traduzir:** traduza o sentido, não as palavras. Siga `references/traduzir-do-ingles.md`. Mantenha nomes, números, código, variáveis e marcação.
- **Revisar:** mexa o mínimo. Preserve a voz de quem escreveu e o que já está bom. Corrija o que atrapalha o leitor, não o que só difere do seu gosto.

Nos três modos: não invente fato, número, citação nem promessa. Se o original é ambíguo, escolha uma leitura e avise.

### 3. Escreva em camadas

1. **Estrutura.** Ideia principal primeiro. Uma ideia por parágrafo. Lista quando os itens são paralelos; passos numerados quando há ordem.
2. **Frases.** Curtas e na ordem direta (quem faz, o quê). Verbo concreto no lugar de substantivo abstrato. Veja `references/claro-e-direto.md`.
3. **Naturalidade.** Troque o que soa traduzido ou de máquina. Veja `references/naturalidade.md` e `references/cara-de-maquina.md`.
4. **Língua.** Gramática, pontuação, números, datas, maiúsculas. Veja `references/armadilhas-gramaticais.md` e `references/pontuacao-e-tipografia.md`.
5. **Leitura final.** Leia como quem recebe o texto. Onde tropeçar, reescreva.

Para texto de tela, siga também `references/texto-de-interface.md`.

### 4. Confira antes de entregar

- [ ] O leitor sabe o que fazer ou o que entender depois da primeira frase ou do primeiro bloco?
- [ ] O sentido, os números, os nomes e os fatos do original continuam iguais?
- [ ] O tratamento é um só (você, ou outro escolhido) do começo ao fim?
- [ ] Nenhuma frase passa de umas 30 palavras sem motivo?
- [ ] Há verbo conjugado onde estava "estar + gerúndio", "realizar", "efetuar", "proceder a"?
- [ ] Sobrou palavra que só enche: "é importante ressaltar que", "basicamente", "na verdade"?
- [ ] Algum trecho lembra o inglês: ordem das palavras, "seu/sua" em excesso, "você pode" onde bastava o imperativo?
- [ ] Algum sinal de texto de máquina: abertura grandiosa, lista de três adjetivos, "não é só X, é Y", fecho que resume o que acabou de dizer?
- [ ] Crase, regência, concordância e "por que/porque" revisados nos pontos de dúvida?
- [ ] Números, datas, moeda e porcentagem no formato brasileiro?
- [ ] Título e botão em maiúscula só na primeira letra (e nomes próprios)?
- [ ] Marcação, variáveis (`{nome}`, `%s`) e termos do glossário intactos?
- [ ] O texto cabe no espaço (tela, legenda, campo)?

### 5. Entregue

Dê o texto pronto primeiro. Depois, só se ajudar, um bloco curto com:

- escolhas que o autor pode querer reverter (termo mantido em inglês, tom adotado);
- dúvidas que ficaram (trecho ambíguo, dado que não dá para conferir);
- o que foi mudado, se o pedido era revisão e a pessoa quer ver as alterações.

Não explique regra de gramática que ninguém pediu. Não elogie o próprio texto.

## Referências

Abra só o arquivo que a tarefa pede.

| Preciso de…                                                            | Arquivo                               |
| ---------------------------------------------------------------------- | ------------------------------------- |
| Frases mais curtas, verbos mais fortes, menos enrolação                | `references/claro-e-direto.md`        |
| Tirar o jeito de tradução: calques, falsos cognatos, gerúndio, passiva | `references/naturalidade.md`          |
| Decidir você, tom, formal ou informal; texto para ser falado           | `references/registro-e-tratamento.md` |
| Botão, mensagem de erro, plural, gênero, termos de software            | `references/texto-de-interface.md`    |
| Aspas, travessão, números, datas, moeda, maiúsculas                    | `references/pontuacao-e-tipografia.md` |
| Tirar dúvida de crase, regência, concordância, porque, mal/mau         | `references/armadilhas-gramaticais.md` |
| Reconhecer e desfazer texto com cara de máquina                        | `references/cara-de-maquina.md`       |
| Traduzir do inglês: o que muda, o que adaptar, o que manter            | `references/traduzir-do-ingles.md`    |
