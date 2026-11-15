# Rota: produto 3D com interface colada na tela

Anúncio de produto ou app em modo claro: um aparelho em 3D (relógio, celular, fone), a interface colada na tela, widgets de vidro que saem do aparelho, uma frase que entra palavra por palavra e um fecho de marca. Horizontal (1920 × 1080) ou vertical (1080 × 1920), 30 qps, cerca de 20 s, renderizador Advanced 3D.

## Esqueleto

| Item | Valor de partida |
|---|---|
| Fundo | sólido cinza muito claro |
| Câmera | Two-Node, preset de 50 mm (zoom 2666,7 px: em z = 0 a escala é 1:1) |
| Luz | Spot branca (93%, cone 111°, feather 38%, falloff Smooth, sem sombra) e uma Environment Light somada |
| Fonte e texto | uma sans média, texto preto de 56 a 64 px, uma camada por palavra |
| Cores | preto, branco e cinzas; a cor da marca só nos acentos |

Com qualquer luz na comp, a iluminação padrão do modelo some: some sempre a Environment Light à spot.

## Curvas

Use as de [curvas-e-molas.md](curvas-e-molas.md): arranque (10/100) para câmera, produto e textos que deslizam; elástica (72/83) para widgets, anéis, balões e logo; mola com ultrapassagem nas chegadas pequenas. Escalone 1 quadro entre pontos e letras e 2 entre palavras e balões. Motion blur nas camadas que se movem.

## Produto e interface na tela

1. Importe o modelo `.glb` de uma fonte cuja licença permita o uso. Mude a comp para Advanced 3D **antes** de pôr o modelo; senão o After Effects abre um aviso modal que bloqueia o MCP.
2. Um retângulo escuro arredondado sobre o vidro do aparelho, 3D, filho do modelo.
3. A interface é uma comp do tamanho da tela, 3D, filha da forma, com Z um pouco à frente. Em modelo com vidro abaulado, a tela some atrás do vidro: ponha-a numa comp clássica separada que segue o aparelho por nulls e expressão, por cima dele.
4. Cantos arredondados da interface por Roughen Edges (modo Cut, Border em torno de 25% da largura da camada, Edge Sharpness 10, Fractal Influence 0, Complexity 2); salve como preset para reaproveitar no ícone. Para ícone, prefira máscara de retângulo arredondado mais um sólido de fundo na comp da tela.
5. Movimento do produto por **dois nulls 3D encadeados** com a câmera parada: o de dentro faz a aproximação (Z de −1600 a 0 em cerca de 3,8 s, curva de arranque); o de fora faz o recuo, sobreposto (Z +1070 entre 2,3 e 3,75 s). A sobreposição dá a cauda longa.
6. Contador: Source Text = `Math.round(effect("Valor")("Slider"))`, slider de 0 a 70 em cerca de 2,5 s.

## Elementos que saem do aparelho

- **Widgets de vidro:** uma comp por widget (cantos de 22), fundo cinza médio mais uma cópia da forma com Fast Box Blur 100 como camada de ajuste. O vidro só desfoca o que está atrás com Collapse Transformations ligado, o que pode conflitar com Advanced 3D: teste e, se conflitar, desligue.
- **Saída e volta:** Scale 0 no centro da tela para a posição final com Scale 100, curva elástica, escalonado alguns quadros. A volta é o inverso; o widget principal vira a nova tela.
- **QR ou selo 3D:** forma 3D com Orientation (0, 330, 0), Z Rotation 21 e Scale 0 para 100, com ultrapassagem.
- **Anéis:** elipse de cerca de 1043 px a 66%, Repeater com 3 cópias, Scale 142%, opacidade final 0; Offset de −5 a 0 em 1,5 s. Os parâmetros do Repeater não aparecem em `property.list`: use `property.set` em `["Contents","Ellipse 1","Contents","Repeater 1", ...]`.
- **Balões de mensagem:** vetor azul e cinza, texto branco no azul e preto no cinza; Scale 0 para 100 com rotação pequena e ultrapassagem; saída para o centro com opacidade 0.
- **Imagem saindo do balão:** PNG com Track Matte Alpha = balão, mais uma cópia com Alpha Inverted e máscara só no topo, filha do original.
- **Círculo de destino:** a mesma elipse sem Repeater serve de matte para um globo 3D girando (pré-composto) e para uma montagem de clipes de 10 quadros; fecha com Scale 100 para 0 em 20 quadros. Track matte não renderiza em Advanced 3D na comp principal: pré-componha em clássico a parte que tem matte.
- **Logo que enche:** logo cinza (Fill) mais um retângulo da cor da marca com Track Matte Alpha = logo e Wave Warp (Sine, altura 10, largura 105); a posição Y do retângulo sobe.
- **Letras do logotipo com quique:** imagem do logotipo, Linear Color Key na cor de fundo, Fill escuro, uma camada por letra com máscara, âncora no canto inferior esquerdo, entrada pela direita com rotação e Scale 0, ultrapassagem, 1 a 2 quadros entre letras, cor da marca para escuro durante o voo. Brilho por letra só durante o voo, com Glow nativo; com intensidade 0 o Glow ainda deixa halo escuro em letra preta, então desligue pela Effect Opacity.
- **Aura atrás do produto:** cópia da camada do produto abaixo dela com 4-Color Gradient (quatro cores abertas, Blend 1002), CC RepeTile em 400 nos quatro lados, desfoque grande e opacidade 33%. Hue/Saturation não grava pelo MCP (o valor fica 0): gire a matiz animando os pontos do gradiente por expressão.

## Micro-detalhes que fazem parecer profissional

Confira com recortes ampliados do mesmo quadro, referência contra nosso.

- **Tela cheia, sem vazar:** conteúdo quase encostando no aro (borda de 3 a 5 px). A proporção da tela real difere da comp: use uma cópia da forma da tela 6 px menor como track matte alfa do conteúdo, numa comp clássica.
- **Vídeo na tela "com sol":** Brightness & Contrast leve, CC Vignette e um sólido escuro com Gradient Ramp radial laranja em Add a cerca de 22%. Glow no vídeo estoura a imagem clara.
- **Ícone de clima vivo:** Gradient Ramp na nuvem, Bevel Alpha leve, chuva em traços inclinados com queda em loop por expressão (`var t=((time+ph)%per)/per; value+[-3.4*t, 9.4*t]`, opacidade `100*min(1,1.6*sin(PI*t))`).
- **Cards voltando:** partida rápida e escala encolhendo só no fim. Em Advanced 3D a ordem das camadas não decide quem fica na frente: dê um Z negativo pequeno ao card de cima.
- **Card que vira a tela:** o fundo do card some, o produto cresce e o brilho da marca aumenta.

## Armadilhas

- Texto vindo de PSD perde a fonte se ela não estiver instalada: recrie como texto nativo.
- Modelo pequeno ou de lado: ajuste escala e orientação até aparecer (conferir por `render.frame`); "Make Comp Size" nas Model Settings ajusta a escala do modelo ao quadro.
- Comps com modelo 3D e comps com Collapse ou camadas de ajuste podem pedir renderizadores diferentes: pré-componha uma delas e deixe-a em Classic 3D.
- Plugins pagos de terceiros (texto explodido, curvas, desfoque profundo) têm equivalente nativo: expressão de Source Text que divide o texto por palavra (`split(/[\s\r]/g)[índice]`, uma cópia da camada por índice), curvas de influência desta skill e Glow ou Fast Box Blur.
- Render de Advanced 3D: trechos de cerca de 15 s e `project.purge` antes. A cor do H.264 sai em BT.709 sem etiqueta: etiquete na junção, senão o vermelho escurece.
