---
name: animacao-saas
description: "Padrão de animação SaaS/produto para vídeos de lançamento, 'apresentando…', demonstração de software ou anúncio estilo startup, narrados ou sem narração. Uma forma só atravessa o vídeo e vira cada função do produto; câmera de nulls com bezier(.86,0,.07,1); legenda palavra por palavra que nasce na cor de acento e vira tinta; botão que infla no drop; fecho que repete a abertura. Usar antes de planejar as cenas e de novo antes de renderizar."
---

# Animação SaaS: o padrão de vídeo de produto

**Resumo:** padrão de vídeo de produto, lançamento e demo de software, narrado ou não, mais uma variante para produto físico e loja. Uma forma só atravessa o vídeo, a câmera é feita de nulls, o botão infla no drop e o fecho repete a abertura. Motor: After Effects, pela ponte MCP que acompanha o TUIFT Code. Os números (mola, curvas, áudio) estão em [references/numeros-de-referencia.md](references/numeros-de-referencia.md).

## Os blocos do vídeo

Cada bloco é uma peça que você monta (no After Effects, em HTML determinístico ou em outro motor). Defina a lógica e os tempos de cada um antes de animar.

| Bloco | Função |
|---|---|
| Câmera e mundo | câmera feita de nulls encadeados; o card nasce onde o botão está na tela, porque a posição do botão passa pela câmera |
| Logo-título | ícone que aparece por varredura diagonal com uma luz que atravessa, giro de 360°, nome letra por letra (abre e fecha o vídeo) |
| Arco | traço que sai do centro para os lados e vira a barra de prompt |
| Barra | prompt com itens subindo de dentro, digitação com rastro na cor de acento, campo que rola antes do microfone |
| Mão | cursor pela ponta do dedo; o clique aperta a mão e o botão juntos |
| Herói | uma forma `{cx, cy, w, h, r, cor}` que se transforma; o conteúdo de cada fase é recortado por ela |
| Frase | legenda palavra por palavra, recentrando em saltos, com um ponto de acento que conduz o olho |
| Órbita | ferramentas reais entrando uma por vez ao redor do hub, ligadas por pontilhado |
| Faixas e fecho | três faixas desfocadas sobem; o fecho repete a abertura |
| Fundo | off-white, luz viva na cor de acento embaixo, grade de pontos |

## Como montar no After Effects

Use o After Effects MCP que acompanha o TUIFT Code. Confira se ele responde (por exemplo, `ae_context`); se não houver ponte, o mesmo padrão vale em HTML determinístico com `seek(t)` a 60 qps ou em outro motor, com os mesmos números.

- `ae_plano_check` no plano de cenas antes de construir; `ae_checkpoint` antes de mudar a estrutura.
- Procure no catálogo da ponte (`ae_catalog`) as operações prontas deste estilo e use-as pelo `ae_do`: mola de entrada (card, botão, balão, selo e morph de UI), entrada e saída, stagger, movimento vivo (nada fica morto), câmera viva, curvas do padrão SaaS e morph (uma camada vira outra com mola).
- `ae_see` para olhar quadros do meio dos movimentos e `ae_review_motion` para saber se o movimento parece humano ou robotizado.
- Sem a ponte: expressões e chaves escritas à mão no After Effects, com a mola de [numeros-de-referencia](references/numeros-de-referencia.md#mola-padrão).

## As regras do padrão

Ponto de partida. Nada é proibido: vale o que fica melhor para o estilo do vídeo; registre no projeto quando fugir do padrão.

1. **Uma forma vira a próxima.** Nada de vários cards espalhados; a transição é tamanho, cantos, cor e conteúdo mudando. O corte seco depende do estilo: em anúncio rápido de produto, o corte seco no bumbo serve.
2. **Um elemento por vez**, na sua vez (ou na palavra, se for narrado).
3. **Curva:** bezier (.86, 0, .07, 1) em câmera e troca de cena; bezier (.33, 0, .67, 1) em entradas; uma curva com leve passada (`POP`) em balões e ícones. Movimentos de câmera sobrepostos. **Entrada de elemento** (cartão, botão, balão, notificação, selo) **e morph de UI** usam a mola padrão de [numeros-de-referencia](references/numeros-de-referencia.md#mola-padrão).
4. **O botão infla com pausa:** círculo → quadrado de 300 px (0,28 s, leve passada do ponto) → espera de 0,08 s → card (0,5 s). Sem narração, o clique cai no silêncio antes do drop e a inflada no drop.
5. **A cor de acento nasce e some:** palavras e letras nascem na cor de acento, com brilho, e viram tinta em cerca de 2 quadros.
6. **O container é máscara:** o conteúdo nasce de dentro da forma; texto digitado nunca passa por baixo de ícone.
7. **Sem quadro morto; movimento e som contínuos, o respiro é exceção.** Todo elemento tem entrada e saída com movimento suave, e cada ação tem o seu som. O respiro (todo som e movimento param, em suspense) só entra logo antes de uma revelação ou entrada cinematográfica com batida: o hype cresce, tudo para por um instante e vem o impacto.
8. **Modo claro**, com a identidade da marca do vídeo, ícones e telas reais, foto de perfil própria.
9. **Música real nova**, em remix cinematográfico; um efeito para cada ação que importa, com camadas nos momentos principais (veja o sound design em camadas na skill `video-referencias`). Níveis e loudness em [numeros-de-referencia](references/numeros-de-referencia.md#áudio).

## Variante "produto físico / loja"

Para "apresentando…" de loja, marca ou produto físico, o vídeo tem 6 atos: celular real com o site; túnel 3D de cards; botão que infla e vira o estúdio com os produtos (caixa que abre, whips no compasso); card que vira o chip da frase; sacola com tudo; logo.

Regras de acabamento (estilo Apple) somadas: texto subindo pela máscara em Bold, cinzas Apple no secundário, vidro com borda em overlay a 30%, sombras sutis e bevel no logo.

### Morph de UI

1. Animar **tamanho e raio** (`{cx, cy, w, h, r}`), nunca a escala: escala estica os cantos.
2. A **cor muda junto** com o tamanho (mesma curva).
3. Forma que cresce: o raio **diminui** um pouco (proporcional); o "quadrado Apple" nunca tem canto reto.
4. Conteúdo em **grupos** (como nulls), cada um com posição e escala na **mesma curva e tempos** da forma: a imagem cresce no lugar, os controles descem, o que não existe na UI nova some por opacidade.
5. Imagem dentro da forma **recortada por máscara** (`overflow: hidden` ou Stencil Alpha), com o raio animado junto.
6. **Quique pequeno** na chegada, com a mola padrão.
7. **Motion blur** no morph rápido.
8. A UI nova entra **depois** que a forma chega: extras por opacidade e posição.
9. **Referência real:** grave a tela do aparelho ou do site e copie movimento e raio.
10. **Mola do morph = a mola padrão** (passa cerca de 12% do ponto e assenta). Uma mola mais solta (amplitude 0,06, frequência 1,8, decay 5) e a curva SAAS no morph são alternativas. Câmera e transição de cena seguem na curva SAAS.
11. **Uma curva para tudo:** a mesma mola em tamanho, posição, escala e rotação. Para mudar o ritmo, mude a duração, não a curva.
12. **Raio com teto:** `r = min(r, w/2, h/2)`. Anime o raio só quando a forma muda de caráter (círculo → quadrado).
13. **Um elemento fica** (por exemplo, o botão) e o container muda à volta dele. O conteúdo novo entra por último.
14. **Um empurra o outro:** botão e container indo para o mesmo lado, atrase um dos dois em 1 quadro (causa e efeito).
15. **Conteúdo atrasado:** ícone e texto copiam a escala da forma com 0,1 s de atraso.
16. **Mudança de lugar em arco**, nunca em linha reta. A mola vai no progresso do caminho, não em x e y separados (senão treme).
17. **O clique dispara:** escala 100 → 96 → 100% e o morph começa na soltura.
18. **Cor e ícone trocam juntos:** cor nos mesmos keyframes do tamanho; o ícone vai a opacidade 0 enquanto o rótulo novo entra preso ao botão.
19. **Texto com mola própria**, 0,05 s entre palavras (preço por letra). Rótulo cai de cima, status sobe de baixo, cabeçalho desliza do meio, número vem da direita.
20. **Colapso:** o que não existe na UI nova encolhe no eixo que some e vai a opacidade 0 nos mesmos quadros.
21. **Inclinação global:** a UI inteira num wrapper com rotação de ±3 a 5° em mola a cada morph.
22. **Ritmo:** sem narração, cada estado fica 0,5 a 0,7 s; narrado, segue a fala.

## Lições de recriação

Especificação quadro a quadro, folha de batidas, magic move, identidade tirada do site, protagonista contínuo, mascote: [references/licoes-de-recriacao.md](references/licoes-de-recriacao.md). Abra ao planejar peça sem narração no tempo da batida, ou com marca real, logo ou mascote.

## Narrado ou sem narração

- **Sem narração:** o tempo vem da trilha (drop, compassos e meias batidas).
- **Narrado:** o tempo vem da fala (transcrição com tempo por palavra). Siga também a skill `motion-narrado`:
  - a frase da legenda segue as palavras ditas, com 0,6 s de leitura;
  - narração seca; nível da música sob a voz e ganho dos efeitos em [numeros-de-referencia](references/numeros-de-referencia.md#áudio);
  - a abertura cinematográfica só entra em tutorial, vídeo de resultado e anúncio startup, e a fala vem depois dela.

## Antes de animar

Escreva um briefing curto (objetivo, público, mensagem, lista de cenas) e leve o storyboard para a pessoa aprovar antes de animar.

## Antes de entregar

- Rascunho a meia escala, quadros isolados em lote (`ae_render_frame`) e quadros cheios nos momentos críticos; folha de contato e recortes ampliados dos trechos com movimento.
- Lista de verificação:
  - [ ] Nenhum corte seco por acidente: toda troca é uma forma virando outra (ou as faixas no fecho). Em anúncio de produto com batida, o corte seco no bumbo é uma escolha declarada.
  - [ ] Um elemento por vez; nada aparece antes da vez (ou da palavra, se narrado).
  - [ ] Câmera e transformações com `bezier(0.86, 0, 0.07, 1)`, movimentos sobrepostos.
  - [ ] O conteúdo nasce de dentro do container; texto digitado não passa por baixo de ícone.
  - [ ] Sem quadro morto: forma vazia ou legenda ausente por mais de cerca de 0,2 s só se for intencional.
  - [ ] Legenda palavra por palavra recentrando em saltos, com a cor de acento nascendo e virando tinta; até 2 linhas.
  - [ ] O clique cai no silêncio antes do drop e a inflada no drop (sem narração), ou na palavra (narrado).
  - [ ] Ícones e telas reais das plataformas; foto de perfil própria, bem enquadrada.
  - [ ] O fecho repete a abertura, com o logo na batida final.
  - [ ] Trilha real nova (não repetir a do vídeo anterior); um efeito por ação; loudness conforme [numeros-de-referencia](references/numeros-de-referencia.md#áudio).
  - [ ] Folha de contato e quadros cheios conferidos; texto do post revisado.
