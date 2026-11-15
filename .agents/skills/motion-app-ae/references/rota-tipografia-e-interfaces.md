# Rota: tipografia grande e interfaces horizontais

Motion editorial em 2D: letras grandes cortadas por máscara, interfaces com cursor, fotos arrastadas entre janelas, logos e cartões de resultado. O fluxo é **cena declarativa, depois HTML determinístico e After Effects nativo**: uma descrição das cenas gera o filme em HTML (para revisar rápido) e o mesmo conteúdo vira camadas nativas no After Effects (para o acabamento e a edição). É uma rota 2D de cena comum; não imponha celular, câmera e trilha da rota de app.

## Quando usar

Pedido de motion editorial com tipografia, interface de software, cursor, transferência de objetos entre janelas, logos e cartões de resultado, em geral horizontal (1920 × 1080, 30 qps). Se o usuário tem um filme de referência, trate-o como medida: duração, número de cenas e de camadas.

## Execução

1. Trabalhe numa cópia de pasta nova; preserve qualquer projeto, vídeo e manifesto que o usuário já aprovou.
2. Troque marca, fotos, textos, domínio, cursor e interface. Para 9:16, refaça layout e enquadramento. Meça texto com uma função de palavras (largura de cada palavra) para cortar cada palavra por máscara, e use uma função de entrada que sirva a entrada, o repouso e a saída.
3. **Curvas** (cubic-bezier): expo `(.16, 1, .3, 1)` para entradas e fades; suave `(.65, 0, .35, 1)` para arrastes e transferências; pop `(.34, 1.56, .64, 1)` para unidades pequenas; linear para progresso e sinal. Uma expressão que controle a interpolação entre chaves não é alterada por Easy Ease aplicado depois.
4. Foto, forma e precomp posicionam pelo centro; texto pela linha de base. Todas as precomps começam no tempo global (startTime 0): se mover uma cena, desloque também os tempos internos e os sons.
5. O gerador é a fonte: a descrição de cenas (JSON) é saída e não se edita à mão; mude o gerador. O HTML expõe `window.ready` e `seek(t)`; capture com `seek(frame/fps)`.
6. Valide o JSON do projeto com `dryRun`, importe num projeto novo ou vazio (`ae_project_import_json`) e aplique as correções pós-importação com `batch.run`. Salve num `.aep` novo.
7. Confira fontes e mídias ausentes, poses e transições. Se a fonte não cobrir os ícones, use uma de símbolos do sistema. Correções em nomes repetidos por índice. A âncora do cursor em [0, 0] precisa sobreviver à criação da camada; justificação de texto reaplica-se depois da importação.
8. Render por `ae_render_video` com o After Effects aberto e salvo, em pasta nova de trechos por versão ([render-e-revisao.md](render-e-revisao.md)). Concatene copiando a faixa de vídeo; áudio final em AAC 256 kbps, 48 kHz estéreo. Confira metadados, decodificação, poses e som.

Um lote de reconstrução que limpa o projeto aberto (`clearFirst: true`) só deve rodar num projeto seu: nunca num arquivo alheio.

## Acabamento

- Máscaras arredondadas com oito vértices e tangentes de 0,55228475 do raio.
- Sombra preta a 12%, distância 10, suavidade 36; blur direcional de 70° com fase −35°, 8 amostras e adaptativo até 16.
- Um grupo vetorial por camada evita a limitação do importador; hierarquia por precomps evita a compensação de parentesco.
- Som: eventos procedurais (toque, clique, ar, batida de tecla, acorde final) acompanhando contatos e viradas, sem trilha contínua, com semente fixa para reproduzir. Normalização de partida de −28 LUFS para uma peça só de efeitos. Se houver narração ou outra intenção sonora, adapte o mix.
- Registre separadamente o que foi observado, o que o usuário preferiu e o que é hipótese: a aprovação de uma comparação lado a lado comprova preferência estética, não igualdade de pixels.
