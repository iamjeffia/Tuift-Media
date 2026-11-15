# Referências visuais: Mobbin primeiro, Pinterest como reserva

Sempre que for criar ou refazer uma tela e precisar de referência, siga esta ordem.

## Qual fonte usar

| Caso | Fonte | Por quê |
|---|---|---|
| Seção de landing: hero, preço, FAQ, depoimentos, recursos, CTA, rodapé | Mobbin `search_sections` | Seções reais de sites de produto |
| Tela de app ou web: dashboard, configurações, perfil, lista, checkout, login | Mobbin `search_screens` (`platform`: `web` ou `ios`) | Telas de produtos publicados |
| Fluxo com várias telas: onboarding, cadastro, checkout, agendamento | Mobbin `search_flows` | Sequência completa |
| Página de preço de landing ou dashboard interno de plataforma | **Mobbin** | Caso ideal; é onde ele é mais forte |
| Motion graphics, motion design, efeito animado, transição | **Pinterest** | O Mobbin não tem esse tipo de recurso |
| Foto, pessoa, ambiente, ilustração, estética, moodboard, persona | **Pinterest** | Acervo de imagens |
| O Mobbin não trouxe nada útil ou o MCP não está disponível | **Pinterest** | Reserva |

## Mobbin (MCP)

Ferramentas: `search_sections`, `search_screens`, `search_flows` (servidor MCP do Mobbin; o nome do servidor muda por cliente, procure por essas ferramentas).

- `query`: descreva **uma** tela ou seção, com os elementos que ela teria. Bom: "pricing section with three plans and monthly/annual toggle". Evite juntar várias telas, negações e adjetivos vagos ("modern").
- Para filtrar por produto, cite o nome: "Calendly pricing page".
- `output_destination`: `code` quando a referência vai virar código; `doc` quando vira relatório.
- `task_intent`: uma frase em inglês com o objetivo; mantenha igual em todas as chamadas da mesma tarefa.
- Comece com `limit` 6–10 para economizar contexto. Olhe as imagens retornadas, não só os metadados.
- Ao citar uma referência, use o link `mobbin_url`. Para guardar, baixe de `image_url` (expira em 30 dias) para a pasta de referências do projeto.
- Se o resultado trouxer `ai_usage_notice`, mostre o texto como veio.

## Pinterest

1. **Navegador:** primeiro o navegador da própria pessoa, com a sessão dela já aberta (por uma extensão de controle de navegador, se houver). Se não houver, use um navegador que o agente controle.
2. **Login:** o agente **não digita senha nem lê o valor dela**. Se o Pinterest pedir login, peça para a pessoa entrar e continue depois. Nunca copie credenciais para conversa, log, doc ou commit.
3. **Busca:** termos em inglês costumam render mais ("motion design UI animation", "SaaS dashboard dark", "esthetician clinic portrait"). Abra o pin, confira a imagem em tamanho cheio e baixe para `refs/pinterest/` do projeto, com o link do pin anotado.
4. Pessoa real em foto vira referência de look, idade, roupa, cenário e luz; ao gerar imagem, o rosto muda.

## Como usar o que foi encontrado

- Anote por referência o padrão aproveitado (ex.: "preço anual com selo de desconto", "cards de plano com o recomendado elevado").
- Aproveite estrutura, hierarquia, espaçamento e comportamento. Não copie marca, texto, foto ou ilustração de terceiros.
- Guarde as referências usadas ao lado do projeto (ex.: `brain/design/explorations/<tela>/` ou `refs/`), com link e data.
