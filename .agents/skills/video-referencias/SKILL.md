---
name: video-referencias
description: "Workflow obrigatório antes de montar qualquer vídeo com motion (estilo Vox/documentário ou anúncio comercial/hype): assistir a referência quadro a quadro com áudio, baixar os assets reais do assunto, reproduzir o visual das plataformas que o público brasileiro usa (WhatsApp, Gmail, Google Agenda, iFood, Nubank…), buscar pessoas e ambientes no Pinterest e sincronizar um efeito sonoro para cada ação. Usar quando a pessoa mandar uma referência de vídeo, uma notícia ou produto para virar vídeo, ou pedir um anúncio."
---

# Vídeo com referências reais

**Resumo:** workflow obrigatório antes de montar vídeo com motion: medir a referência quadro a quadro e ouvir o áudio, baixar o material real do assunto, reproduzir as plataformas que o público usa, buscar pessoas e ambientes em referências reais e montar o som em camadas. O padrão de animação de produto está na skill [animacao-saas](../animacao-saas/SKILL.md) e as regras de motion sobre narração, em [motion-narrado](../motion-narrado/SKILL.md).

> **Movimento e som contínuos; o respiro é exceção.** Regra completa na regra 7 da skill [animacao-saas](../animacao-saas/SKILL.md).

## 1. Definir o estilo

| Estilo | Quando | Como soa e se move |
|---|---|---|
| **Vox / documentário** | explicar notícia, conceito, produto | narração, papel e textura, palavra-chave grande, material real em molduras, ritmo de documentário |
| **Comercial / hype** | anúncio, lançamento, demonstração de produto | sem narração (no máximo uma fala), música de energia, interface reconhecível, câmera contínua sobre a UI, muitos efeitos sincronizados, humor leve |

## 2. Assistir à referência de verdade (se houver)

Assistir é destrinchar imagem **e** som, não olhar poucos quadros.

1. Baixe com `yt-dlp` (se o cliente padrão der 403, tente `--extractor-args "youtube:player_client=mweb"`; baixe as legendas numa chamada separada).
2. Folhas de contato a **4 quadros por segundo** para a estrutura, recortando a área útil (`fps=4,crop=…,tile=6x5`, com `drawtext` e `fontfile` explícito). Short com vídeo 16:9 dentro de 9:16: recorte a faixa do meio.
3. Áudio: transcreva (`faster-whisper`) e mapeie os golpes por faixa (grave, médio, agudo), o andamento e a curva de volume a cada 0,5 s, com `ffmpeg` e `librosa`.
4. **Olho quadro a quadro:** a folha a 4 qps e um modelo de vídeo a 1 qps não pegam deriva, tremida, chicotes, degradê ou brilho do texto. Escreva a análise com OpenCV: fluxo óptico (`cv2.calcOpticalFlowFarneback`) para tremida, chicotes e deriva da câmera, que viram os números do `wiggle` e das chaves; folha de quadros **consecutivos** numerados; rastro (onion skin e diferença entre quadros); recorte ampliado 4× com contraste, para ver degradê, halo e contorno; curvas do original contra a recriação. **O imperfeito humaniza:** a câmera de referência quase nunca para, então meça a deriva e a tremida e reproduza.
5. Antes de qualquer código, escreva a **gramática de movimento** (recurso × onde × como) e a **tabela som × imagem** (tempo, faixa, o que aparece) num documento do projeto.

## 2b. Copiar a animação: captura de movimento

Para igualar o movimento, o passo 4 não basta: use a skill [captura-de-movimento](../captura-de-movimento/SKILL.md) (cada peça rastreada em cada quadro, números como chaves, comparação por curva e em câmera lenta).

## 3. Coletar o material real do assunto

- Notícia ou produto: na página oficial, liste imagens e vídeos (inclusive iframes do Vimeo), baixe com o referer do site, veja os vídeos por folha de contato e escolha os trechos. Crédito na tela.
- Site que bloqueia download: captura de tela pelo navegador.
- **Marca do assunto tirada do site e do kit.** Os vídeos que mais superaram o original vestiram a marca real. Passo a passo (`/assets/*`, variáveis de cor e fonte do CSS, `/brand`, capturas oficiais, `BRAND.md`) em [references/marca-e-plataformas.md](references/marca-e-plataformas.md#marca-do-assunto-tirada-do-site-e-do-kit). Abra quando o assunto tiver site ou marca própria.
- Referência de "antes e depois" ou comparação de modelos: recorte o painel que interessa antes de medir; numa comparação, recrie uma peça só com o melhor das metades.

## 4. Reproduzir as plataformas que o público usa

Toda ação usa o visual da plataforma que a pessoa reconhece. Antes de desenhar, **busque uma referência visual atual** e copie cores, tipografia, componentes e ícones: para marca, o site oficial (logo vetorial, cores pelo CSS); para telas do app, o Pinterest ou uma captura.

| Ação no vídeo | Plataforma de referência |
|---|---|
| Mensagem com cliente, confirmação, atendimento | WhatsApp (e WhatsApp Business) |
| E-mail | Gmail |
| Planilha, lista, controle | Google Planilhas |
| Agenda, horários | Google Agenda |
| Conversa com IA | ChatGPT (ou Claude, quando o assunto for Claude) |
| Post, repercussão | X e Instagram |
| Pedido de comida, delivery | iFood |
| Pagamento | Pix; banco conforme o público (Nubank para jovens; Itaú, Banco do Brasil ou Caixa para público tradicional) |
| Viagem, cartão internacional | Nomad |
| Notificação | banner de notificação do iPhone ou do Android |
| DM de cliente em negócio de bairro (barbearia, salão, loja) | Instagram Direct |
| Lead de imóvel | ZAP Imóveis (ou VivaReal, do mesmo grupo) |

O método para levantar o visual de cada plataforma e onde registrar o que levantou: [references/marca-e-plataformas.md](references/marca-e-plataformas.md). Abra antes de desenhar uma dessas telas.

## 5. Pessoas e ambientes

Sempre a partir de referências reais (Pinterest, buscadas por nicho e público; no navegador da pessoa, se ela tiver sessão). A pessoa real da foto vira referência de look, idade, roupa, cenário e luz; o **rosto gerado é diferente**. Guarde as referências numa pasta do projeto com um arquivo `FONTES.md`. Para gerar, use um gerador de imagem com referências (por exemplo, GPT Image pelo Higgsfield, com `image_references`) e, para animar, um gerador de vídeo (por exemplo, Kling). Produto real do cliente e dublagem com lip sync (por exemplo, HeyGen) seguem o mesmo cuidado. Gaste créditos de geração só com autorização da pessoa.

## 5b. Direções em quadros: a pessoa escolhe antes de montar

1. Monte uma prancha com pelo menos 10 referências por parte do vídeo (gancho e corpo): Pinterest com buscas curtas (3 buscas por parte e 10 pins cada), vídeos de referência baixados, prévias de bibliotecas de motion e filmes. Registre num documento do projeto.
2. Desenhe 3 direções por parte, nas mesmas 3 cenas, em quadros parados (por exemplo, um HTML por direção renderizado em PNG).
3. A pessoa escolhe, mistura ou pede mais; registre a escolha com o porquê num arquivo de escolhas do projeto e leia esse registro antes de propor de novo.
4. Evite pílulas de rótulo, desenho e futurismo quando a pessoa já os recusou; prefira um elemento-fio contínuo atravessando as cenas.

## 6. Montar

- **Transição entre interfaces pelo estilo:** no narrado e no SaaS, deslize, zoom atravessando ou giro 3D com um pouco de motion blur; em anúncio rápido, o corte seco no bumbo também vale (regra 1 de [animacao-saas](../animacao-saas/SKILL.md)).
- Texto surge do desfoque para o nítido; listas com item em foco; pilhas 3D; grades que abrem.
- **Cursor visível em todo clique**, com som de clique; whoosh em toda troca de tela; tique em cada item de lista; notificação quando chega mensagem; grave curto quando algo fica pronto. Um efeito para cada ação **que importa**; o resto respira (seção 7).
- Ganho dos efeitos e nível da música: [animacao-saas/references/numeros-de-referencia.md](../animacao-saas/references/numeros-de-referencia.md#áudio). Em comercial, música de energia; ela abaixa na fala e antes dos graves de destaque.
- Humor leve com os agentes ou robôs (expressões, falhas), sem virar piada.
- Revise por prévia em meia resolução mais folha de contato antes do render final.

## 7. Sound design em camadas

1. **Camadas nos momentos principais** (drop, tampa ou abertura do produto, logo, virada): 2 a 3 sons com funções diferentes (corpo, ar, brilho), em cascata, não exatamente juntos. No resto, um efeito por ação que importa.
2. **Um efeito vira vários:** varie o mesmo arquivo por tom e velocidade. Comece entre ±2 e ±5 semitons; teto de ±8 (acima soa robótico).
3. **Envelope:** efeito longo (whoosh de ar, ambiência) termina com fade no fim da ação.
4. **Som dentro da tela:** o que acontece num celular, TV ou monitor no vídeo entra abafado (passa-baixa) e abre quando a câmera mergulha nele.
5. **Deixe respirar:** empilhar em toda entrada apaga a diferença entre os momentos.
6. Confira ouvindo só os efeitos e depois no celular. Quem aprova o som é a pessoa: o agente não escuta. Se houver um modelo que ouça áudio (por exemplo, o Gemini), use-o como segunda opinião.

Receita no `ffmpeg` (por efeito): `rubberband=pitch=<2^(n/12)>` para `n` semitons, `rubberband=tempo=<x>` para a velocidade, `lowpass=f=<Hz>` para o som de dentro da tela e `afade=t=out:st=<s>:d=<s>` para o rabo. Posição do efeito: `at = evento − pico`.

Mais três ideias de som: nota no tom da música para o que entra em série (subindo pela pentatônica, uma nota por forma); ação mecânica pede som mecânico repetido no ritmo dela, e ação suave, um whoosh contínuo; foto de lugar pede o ambiente do lugar. Vídeo que troca de estilo várias vezes mantém **uma** música e troca só o tratamento (EQ, bitcrush, reverb, tom).

## 8. Revisão contra a referência

**Quadro parado não prova movimento:** confira no meio dos movimentos, por curva de energia de movimento e em lado a lado 3× mais lento. As 7 checagens (salto, vazio, cortes, parado, "o original grita mais?" no celular, escala, som): [references/revisao-contra-referencia.md](references/revisao-contra-referencia.md). Abra antes de entregar.

## Limites

- Mostrar plataformas como **ferramenta usada** (WhatsApp, Gmail, Planilhas) é o objetivo. Não coloque o logo de outra empresa como parceira nem diga que um produto dela está integrado quando não está.
- Não apresente uma empresa real (uma rede de delivery, uma clínica conhecida) como cliente ou usuária da marca do vídeo num anúncio publicado. Use marca fictícia com os códigos visuais do nicho e aviso de simulação quando o caso for fictício. Para treino interno, pode.
- Credenciais nunca aparecem em tela.
