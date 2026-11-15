"""Compara a tela reconstruída no AE com a captura original, lado a lado.

Uso:
    python comparar_captura.py captura.png render_ae.png y0 y1 saida.png

Recorta a mesma faixa vertical (y0–y1, em pixels da captura 1170×2532) das duas
imagens e monta captura à esquerda e AE à direita, reduzidas para leitura.
Renderize antes com ae_render_frame da comp TELA_<nome>.
"""
import sys

from PIL import Image


def main():
    cap, ae, y0, y1, saida = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
    a = Image.open(cap).convert("RGB")
    b = Image.open(ae).convert("RGB")
    w = a.width
    faixa_a, faixa_b = a.crop((0, y0, w, y1)), b.crop((0, y0, w, y1))
    lado = Image.new("RGB", (w * 2, y1 - y0), (128, 128, 128))
    lado.paste(faixa_a, (0, 0))
    lado.paste(faixa_b, (w, 0))
    escala = min(1.0, 1400 / lado.width)
    lado.resize((int(lado.width * escala), int(lado.height * escala))).save(saida)
    print(saida)


if __name__ == "__main__":
    main()
