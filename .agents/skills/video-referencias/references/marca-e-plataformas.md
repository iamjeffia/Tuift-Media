# Marca e plataformas: como levantar o visual real

**Resumo:** como tirar a marca real do site do assunto e como levantar cores, fontes e logos das plataformas que o público usa (iFood, Nubank, Nomad, ZAP, Instagram Direct, WhatsApp, Google). Vem da seção 4 da skill [video-referencias](../SKILL.md).

## Marca do assunto tirada do site e do kit

Os vídeos de recriação que mais superaram o original vestiram a marca real. O passo a passo:

1. Baixe o HTML com `curl` e liste os `/assets/*` (woff2, SVG do símbolo, ícones, às vezes vídeo 3D).
2. Variáveis de cor e fonte: nomes no CSS do Tailwind (`--color-<marca>-*`) ou os hex mais usados no CSS compilado.
3. Procure `/brand` ou `/press` e use as **capturas oficiais do produto antes da home**: a home mostra o marketing, a captura mostra o produto. A cor das métricas se mede na captura (`getpixel` do PIL).
4. Anote cada valor com a fonte num `BRAND.md` do projeto. Esse arquivo vale mais que o padrão da skill.
5. Confira os números do site no dia: contagens e listas (por exemplo, o número de idiomas suportados) envelhecem.
6. Vídeo oficial com rótulo queimado: use só trechos limpos, escolhidos numa folha de contato a 8 qps.

Se a marca real é clara, não invente uma versão escura.

## Plataformas que o público usa

Para cada plataforma da tabela da seção 4, levante o visual no dia da produção, em vez de confiar em valores guardados:

- **Marca (logo e cores):** o site oficial costuma render mais que o Pinterest: logo vetorial e cores exatas pelo CSS. Por exemplo, o logo de uma plataforma costuma estar num SVG na própria página institucional ou na página de parceiros.
- **Telas do app:** o Pinterest ou uma captura de tela real. O Pinterest ajuda com telas de aplicativo; para marca, prefira o site.
- **Componentes de conversa (WhatsApp, Instagram Direct):** copie a diferença entre mensagens enviadas e recebidas (cor do balão, alinhamento, hora, status). No Instagram Direct, as enviadas levam um degradê roxo-azul e as recebidas um cinza claro.
- **Fontes:** use a fonte oficial da plataforma quando for pública (confira no CSS do site); sem ela, use a mais próxima e declare.

**Registre cada plataforma nova** num documento do projeto com: nome, referência usada (URL ou captura), cores, fonte, logo (arquivo) e data do levantamento. Reaproveite o registro nos próximos vídeos, conferindo se a marca não mudou.
