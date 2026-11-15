# Revisão contra a referência

**Resumo:** as checagens que acharam defeito em todas as recriações de vídeos de referência (salto, vazio, cortes, parado, impacto no celular, escala, som) e a regra de conferir o movimento, não o quadro parado. Vem da seção 8 da skill [video-referencias](../SKILL.md).

**Quadro parado não prova movimento:** uma versão com diferença quase nula nos quadros parados pode ser reprovada no movimento. Confira no meio dos movimentos, por curva (percentual de pixels que mudam por segundo, original contra o seu) e em lado a lado 3× mais lento. Veja a skill [captura-de-movimento](../../captura-de-movimento/SKILL.md).

As checagens:

1. **Salto:** detector de diferença entre quadros (3× os vizinhos) em todo render; cada salto restante tem de ser um corte de propósito, no bumbo.
2. **Vazio:** detector de quadro chapado ou isolado no master de alta taxa; um quadro de captura falho é trocado pelo vizinho, nunca entregue.
3. **Cortes:** folha com o quadro antes, o do corte e o depois em cada corte (nenhum vira dissolve de 1 quadro nem dupla exposição).
4. **Parado:** procure trechos de 0,3 a 0,5 s sem movimento; meça a porcentagem de quadros quase iguais contra a do original.
5. **"O original grita mais?" no celular:** na comparação empilhada (original em cima, o seu embaixo), compare contraste, saturação, peso do tipo e tamanho dos elementos. Se o original ganha impacto, o seu ainda não o superou, mesmo que esteja mais sofisticado.
6. **Escala:** elementos do mesmo tamanho ou maiores que no original; UI legível no celular.
7. **Som:** stem só de efeitos medido (cada efeito no evento, nível contra a música); um modelo que ouça áudio como segunda opinião, quando houver.
