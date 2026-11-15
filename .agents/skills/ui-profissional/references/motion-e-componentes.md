# Motion e componentes prontos: os 6 sites de UI

**Resumo:** quando a tela precisa de movimento, ícone vivo ou componente de IA, comece por estes 6 sites. Confira licença e preço de cada um antes de usar em produto; os comandos abaixo são os que cada site publica.

## O que usar

| Precisa de | Use | Como |
|---|---|---|
| Transição de abrir e fechar (modal, dropdown, painel, toast, abas, badge, tooltip, accordion, toggle, check de sucesso, tremida de erro, skeleton) | **transitions.dev** | skill `transitions-dev` ("transitions apply"); receitas na documentação do site |
| Revisar e afinar o movimento que já existe | skill `transitions-polish` | "transitions review"; nota de 0 a 100: `npx transitions-agent` |
| UI aparecendo como se a IA estivesse gerando (wireframe pontilhado → tela) | skill `transitions-ui-generation` | runtime sem dependências, funciona em HTML puro |
| Ícone que vira outro (menu↔X, play↔pause, copiar↔check, cadeado, tema) | **morphicons** | `npm i morphicons lucide`; React `<MorphIcon icon={…}/>`, HTML `<morph-icon>` ou `createMorph` |
| Ícone que se mexe no hover (carrinho, coração, sino, enviar, lixeira, gráficos, marcas) | **itshover** (263) | `npx shadcn@latest add https://www.itshover.com/r/<nome>-icon.json` (precisa de `motion`) |
| "Pensando", borda de luz, voz, avatar de bot, metal, imagem sendo gerada | **libraries.dev** | skill `libraries-dev`; `npm i border-beam thinking-orbs voice-glow bot-avatars metal-fx img-fx liquid-gooey` |
| Microinteração rica (Dynamic Island, toast em pilha, like com contador, OTP, upload, checklist, reações) | **bencho** (40 grátis) | `https://bencho.dev/api/block-source?id=<slug>` traz o TSX; o CSS vem no bundle do site |
| Tela de agente de IA (thinking, streaming, aprovação, chamadas de ferramenta, tarefas, prompt bar, tabelas que a IA edita) | **beautifului** (tudo grátis) | `npx shadcn add https://www.beautifului.dev/r/<id>.json`, com o `globals.css` do GitHub (o do registro vem quebrado) |

Antes de escrever animação à mão, confira se um desses já resolve.

**Em site sem React:** use direto o que roda em JS puro (régua de movimento, morphicons) e recrie em CSS/JS puro os efeitos que só existem em React (border beam, OTP, coração do itshover).

## Régua de movimento

- **Durações:** 150 ms para fechar ou trocar texto; 250 ms para abrir (modal, dropdown, aba, ícone); 350 a 400 ms para painel e toast; 500 ms para ênfase (badge, check). Stagger de 40 ms, total abaixo de ~300 ms.
- **Curvas:** a padrão é `cubic-bezier(0.22, 1, 0.36, 1)`, a mesma nos 4 sites que publicam código. Pop de entrada: `cubic-bezier(0.34, 1.36, 0.64, 1)`.
- **Regras:** fechar é mais rápido que abrir; bounce só na entrada; hover-in até 250 ms; nunca atrasar um fechamento; translação acima de ~40 px fica arrastada.
- **Escala e blur:** escala de entrada 0,96 (modal) a 0,99; blur de 2 px em troca de texto ou ícone.
- **Molas:** padrão 380–420 de rigidez e 30–34 de amortecimento (snappy, assenta em ~0,4 s); a versão suave fica em 170–190 / 26.
- **Acessibilidade:** todos respeitam `prefers-reduced-motion`. Em ícones que mudam de forma, a troca de estado tem que continuar clara sem a animação.

## Vídeo (HTML com seek(t))

- **morphicons:** `seek(ícone, t)` ou `progress` controlado dá o mesmo quadro para o mesmo `t`.
- **itshover:** tocar com `animate()` do `motion` e `controls.time = t`; o valor aparece 1 quadro depois, então espere 2 quadros por seek.
- **transitions.dev:** levar os números da receita para o relógio da composição, em vez de colar o CSS por tempo real.
- **libraries.dev e beautifului:** canvas/WebGL e timers em tempo real. Para usar em vídeo, grave a tela ou recrie em uma ferramenta de vídeo.
