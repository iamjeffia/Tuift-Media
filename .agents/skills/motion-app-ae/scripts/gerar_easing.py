"""Gera o lote de keyframe.set_easing para a ponte do After Effects.

`keyframe.set_batch` cria chaves lineares; este script monta o JSON de um
`batch.run` que aplica easing (velocidade 0, influência 70%) em todas elas.
Propriedades de cor não aceitam easing: não as inclua.

Uso:
    python gerar_easing.py lista.json > lote.json

lista.json: [["COMP", "Camada", ["Transform","Scale"], 3], ...]
            (comp, camada, caminho da propriedade, número de chaves)
O conteúdo de lote.json vai em ae_do({operation: "batch.run", args: <lote>}).
Lotes acima de ~80 operações: dividir em mais de uma chamada.
"""
import json
import sys

INFLUENCIA = 70


def main():
    itens = json.load(open(sys.argv[1], encoding="utf-8"))
    ops = []
    for comp, camada, prop, n in itens:
        for k in range(1, n + 1):
            ops.append({"operation": "keyframe.set_easing", "args": {
                "comp": comp, "layer": camada, "property": prop, "keyIndex": k,
                "inSpeed": 0, "outSpeed": 0,
                "inInfluence": INFLUENCIA, "outInfluence": INFLUENCIA}})
    json.dump({"ops": ops}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
