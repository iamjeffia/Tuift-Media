"""Gera os ícones da TUIFT Media nos formatos que o app usa.

Uso: python branding/gerar-icones.py [mascote|t]   (padrão: mascote)

Saídas em branding/<opcao>/ e, para a opção escolhida, nos caminhos do app:
  apps/desktop/assets/tuift-app-icon.png      1024, ícone completo (Windows, janela)
  apps/desktop/assets/tuift-icon.png          512, só o símbolo, fundo transparente
  apps/desktop/assets/tuift-icon.svg          símbolo em vetor
  apps/desktop/assets/tuift-icon.icon/        pacote do Icon Composer (macOS)
  apps/mobile/assets/tuift.icon/, icon.png    mesmo par para o app mobile
Identidade: TUIFT Media v2 (mascote do icone-app.svg oficial).
"""

import json
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
FUNDO = "#141414"
LARANJA = "#F9670E"

# Corpo do mascote v2 (quadrado orgânico), copiado do icone-app.svg oficial.
CORPO = (
    "M86.88 52.00C86.61 53.08 86.34 54.12 86.07 55.16C85.80 56.19 85.53 57.20 85.26 58.22C84.99 59.23 84.73 60.23 84.46 61.23C84.19 62.24 83.93 63.24 83.67 64.25C83.40 65.27 83.13 66.28 82.86 67.32C82.58 68.36 82.31 69.41 82.01 70.48C81.71 71.55 81.40 72.64 81.05 73.74C80.71 74.85 80.35 75.98 79.91 77.10C79.48 78.22 79.02 79.37 78.46 80.46C77.89 81.54 77.27 82.64 76.53 83.61C75.79 84.59 74.95 85.52 74.01 86.29C73.07 87.06 72.01 87.71 70.91 88.22C69.81 88.72 68.60 89.07 67.40 89.32C66.21 89.57 64.95 89.66 63.73 89.72C62.51 89.78 61.28 89.72 60.09 89.66C58.90 89.59 57.73 89.46 56.58 89.33C55.44 89.20 54.32 89.04 53.23 88.88C52.13 88.73 51.06 88.56 50.00 88.39C48.94 88.23 47.90 88.06 46.86 87.89C45.82 87.73 44.79 87.56 43.76 87.40C42.72 87.23 41.70 87.06 40.65 86.89C39.61 86.72 38.56 86.55 37.49 86.37C36.42 86.19 35.34 86.01 34.24 85.80C33.13 85.60 32.01 85.39 30.86 85.15C29.71 84.90 28.54 84.65 27.35 84.34C26.17 84.04 24.94 83.71 23.74 83.29C22.54 82.88 21.30 82.43 20.14 81.86C18.98 81.29 17.80 80.65 16.77 79.88C15.74 79.11 14.76 78.23 13.96 77.24C13.16 76.25 12.49 75.12 11.98 73.95C11.48 72.78 11.16 71.49 10.94 70.21C10.73 68.94 10.69 67.60 10.69 66.31C10.70 65.01 10.83 63.71 10.98 62.46C11.12 61.20 11.35 59.97 11.57 58.78C11.79 57.58 12.06 56.43 12.31 55.30C12.57 54.17 12.85 53.08 13.12 52.00C13.39 50.92 13.66 49.88 13.93 48.84C14.20 47.81 14.47 46.80 14.74 45.78C15.01 44.77 15.27 43.77 15.54 42.77C15.81 41.76 16.07 40.76 16.33 39.75C16.60 38.73 16.87 37.72 17.14 36.68C17.42 35.64 17.69 34.59 17.99 33.52C18.29 32.45 18.60 31.36 18.95 30.26C19.29 29.15 19.65 28.02 20.09 26.90C20.52 25.78 20.98 24.63 21.54 23.54C22.11 22.46 22.73 21.36 23.47 20.39C24.21 19.41 25.05 18.48 25.99 17.71C26.93 16.94 27.99 16.29 29.09 15.78C30.19 15.28 31.40 14.93 32.60 14.68C33.79 14.43 35.05 14.34 36.27 14.28C37.49 14.22 38.72 14.28 39.91 14.34C41.10 14.41 42.27 14.54 43.42 14.67C44.56 14.80 45.68 14.96 46.77 15.12C47.87 15.27 48.94 15.44 50.00 15.61C51.06 15.77 52.10 15.94 53.14 16.11C54.18 16.27 55.21 16.44 56.24 16.60C57.28 16.77 58.30 16.94 59.35 17.11C60.39 17.28 61.44 17.45 62.51 17.63C63.58 17.81 64.66 17.99 65.76 18.20C66.87 18.40 67.99 18.61 69.14 18.85C70.29 19.10 71.46 19.35 72.65 19.66C73.83 19.96 75.06 20.29 76.26 20.71C77.46 21.12 78.70 21.57 79.86 22.14C81.02 22.71 82.20 23.35 83.23 24.12C84.26 24.89 85.24 25.77 86.04 26.76C86.84 27.75 87.51 28.88 88.02 30.05C88.52 31.22 88.84 32.51 89.06 33.79C89.27 35.06 89.31 36.40 89.31 37.69C89.30 38.99 89.17 40.29 89.02 41.54C88.88 42.80 88.65 44.03 88.43 45.22C88.21 46.42 87.94 47.57 87.69 48.70C87.43 49.83 87.15 50.92 86.88 52.00Z"
)


def olhos(cx: float, cy: float) -> str:
    """Os dois olhos em barra do mascote v2, centrados em (cx, cy)."""
    return "".join(
        f'<rect x="{x - 3.6:.1f}" y="{cy - 7.5:.1f}" width="7.2" height="15" rx="3.6" '
        f'transform="rotate(-10 {x:.1f} {cy:.1f})"/>'
        for x in (cx - 7.5, cx + 7.5)
    )


def selo(cx: float, cy: float, r: float = 14) -> tuple[str, str]:
    """Selo laranja de play. Devolve (recorte para a máscara, desenho)."""
    recorte = f'<circle cx="{cx}" cy="{cy}" r="{r + 4}" fill="#000"/>'
    desenho = (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{LARANJA}"/>'
        f'<path d="M{cx - 3.5} {cy - 6.5}v13l10-6.5z" fill="#fff"/>'
    )
    return recorte, desenho


def simbolo(opcao: str) -> str:
    """Só o símbolo, sem fundo, no viewBox -8 -8 116 116 do ícone v2."""
    if opcao == "mascote":
        recorte, desenho = selo(82, 82)
        forma = f'<path d="{CORPO}"/>'
        face = olhos(47.5, 40)
    else:  # "t": T pesado (Bricolage do logo) com o rosto do mascote e o play no pé
        # inclinado como o mascote; o selo fica fora da inclinação, no pé da haste
        recorte, desenho = selo(53, 82, 13)
        forma = (
            '<g transform="rotate(-6 50 50)">'
            '<rect x="12" y="12" width="76" height="27" rx="10"/>'
            '<rect x="36.5" y="18" width="27" height="60" rx="10"/></g>'
        )
        face = f'<g transform="rotate(-6 50 50)">{olhos(50, 25.5)}</g>'
    return (
        '<defs><mask id="m" maskUnits="userSpaceOnUse" x="-8" y="-8" width="116" height="116">'
        f'<g fill="#fff">{forma}</g><g fill="#000">{face}</g>{recorte}</mask></defs>'
        f'<rect x="-8" y="-8" width="116" height="116" fill="#fff" mask="url(#m)"/>{desenho}'
    )


def svg(corpo: str, fundo: bool) -> str:
    base = f'<rect x="-8" y="-8" width="116" height="116" rx="26" fill="{FUNDO}"/>' if fundo else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 116 116">{base}{corpo}</svg>\n'


def render(paginas, svg_texto: str, lado: int, destino: Path) -> None:
    paginas.set_viewport_size({"width": lado, "height": lado})
    paginas.set_content(
        f'<html><body style="margin:0;background:transparent">'
        f'<div style="width:{lado}px;height:{lado}px">{svg_texto.replace("<svg ", f"<svg width={lado} height={lado} ")}</div>'
        f"</body></html>"
    )
    paginas.screenshot(path=str(destino), omit_background=True)


def pacote_icon(pasta: Path, nome_svg: str, svg_texto: str) -> None:
    """Pacote do Icon Composer no mesmo molde do original (fundo escuro, símbolo com vidro)."""
    shutil.rmtree(pasta, ignore_errors=True)
    (pasta / "Assets").mkdir(parents=True)
    (pasta / "Assets" / nome_svg).write_text(svg_texto, encoding="utf-8", newline="
")
    manifesto = {
        "fill": {"solid": "extended-gray:0.08000,1.00000"},
        "groups": [{
            "layers": [{
                "blend-mode": "normal", "fill": "automatic", "glass": True,
                "image-name": nome_svg, "name": nome_svg.removesuffix(".svg"),
                "position": {"scale": 8, "translation-in-points": [0, 0]},
            }],
            "shadow": {"kind": "neutral", "opacity": 0.5},
            "translucency": {"enabled": True, "value": 0.3},
        }],
        "supported-platforms": {"circles": ["watchOS"], "squares": "shared"},
    }
    (pasta / "icon.json").write_text(json.dumps(manifesto, indent=2) + "\n", encoding="utf-8", newline="
")


def gerar(opcao: str, aplicar: bool) -> None:
    saida = RAIZ / "branding" / opcao
    saida.mkdir(parents=True, exist_ok=True)
    corpo = simbolo(opcao)
    so_simbolo, completo = svg(corpo, False), svg(corpo, True)
    (saida / "tuift-icon.svg").write_text(so_simbolo, encoding="utf-8", newline="
")
    (saida / "tuift-app-icon.svg").write_text(completo, encoding="utf-8", newline="
")
    with sync_playwright() as p:
        navegador = p.chromium.launch()
        pagina = navegador.new_page()
        render(pagina, completo, 1024, saida / "tuift-app-icon.png")
        render(pagina, so_simbolo, 512, saida / "tuift-icon.png")
        navegador.close()
    if not aplicar:
        return
    desk = RAIZ / "apps" / "desktop" / "assets"
    for nome in ("tuift-app-icon.png", "tuift-icon.png", "tuift-icon.svg"):
        shutil.copy2(saida / nome, desk / nome)
    pacote_icon(desk / "tuift-icon.icon", "tuift-icon.svg", so_simbolo)
    mob = RAIZ / "apps" / "mobile" / "assets"
    shutil.copy2(saida / "tuift-app-icon.png", mob / "icon.png")
    pacote_icon(mob / "tuift.icon", "tuift-icon.svg", so_simbolo)


if __name__ == "__main__":
    escolhida = sys.argv[1] if len(sys.argv) > 1 else "mascote"
    assert escolhida in ("mascote", "t"), "opção: mascote ou t"
    for opcao in ("mascote", "t"):
        gerar(opcao, aplicar=opcao == escolhida)
    print(f"ícones gerados; aplicada no app: {escolhida}")
