# Referencias: tela de conectores (MCP cards)

> Data: 2026-11-15 · Tipo: pesquisa · Status: vigente

**Resumo:** telas do Claude Desktop (Settings > Connectors) e de integracoes de outros apps, achadas no Mobbin, e o que a pagina MCP do TUIFT Code toma de cada uma.

## Telas (Mobbin, so os links; as imagens expiram em 30 dias)

- Claude, Settings > Connectors (GitHub "Connected", Figma e Slack "Configure", Google Drive apagado com "Connect"): https://mobbin.com/screens/e6ade293-ed67-4901-8d3c-4196c31b842e
- Claude, Customize > Skills/Connectors (interruptor liga/desliga no topo do item): https://mobbin.com/screens/fbb6e22e-3d94-4e4b-997f-49281993f766
- Plane, Integrations (um cartao por app: icone, nome, uma linha, acao a direita): https://mobbin.com/screens/bf7c6e4b-b0d5-4d1c-aca5-8e850c9b0ff3
- Calendly, Integrations & apps (icone, nome, selo de verificado, "Connected" embaixo): https://mobbin.com/screens/25f3f8e9-bd9d-4ebb-9be6-7d6f5a045eb3
- Mintlify, Integrations (Enabled x Available, botao "Connect", aviso "Slack disabled"): https://mobbin.com/screens/e700ca68-4482-467d-abe8-c66cbbd663fa
- Quo, Integrations (Enabled separado de "Connect other platforms"): https://mobbin.com/screens/b90b19ca-b3fa-4e0b-8a1c-6742c177932d

## O que levamos (5 linhas)

1. Um cartao por integracao: icone da marca a esquerda, nome em destaque, uma linha de origem (URL ou comando) e a acao no canto direito.
2. O estado e legivel de relance: "Connected" como texto colorido, nao escondido num detalhe; desconectado fica apagado com o botao de conectar.
3. A acao certa para cada estado: "Sign in" quando precisa entrar, interruptor para ligar e desligar no projeto, Edit e Remove quietos.
4. Erro e aviso moram dentro do cartao, sob o nome, e o cartao muda a borda e o ponto de cor com a mesma animacao curta do resto do app.
5. Tudo e feito com os tokens do app (borda, raio, ponto de estado, botoes `set-button`, interruptor), sem copiar cor, sombra ou fonte do Claude.
