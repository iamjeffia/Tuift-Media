"""Generates every image the root README.md uses, into branding/readme/.

Usage (from the repository root):

  python branding/readme/gerar.py capturas [SANDBOX_URL]   screenshots of the web sandbox
  python branding/readme/gerar.py marca                    wordmark and banner cards
  python branding/readme/gerar.py tudo [SANDBOX_URL]       both, in that order

The sandbox is the app in a browser with dummy data. Start it first, on any free port:

  pnpm --filter @harness/web exec vite --host 127.0.0.1 --port 5437 --strictPort

(default SANDBOX_URL is http://127.0.0.1:5437). Demo strings are renamed and the
"Sandbox" pill is hidden through the page while capturing; the app source is not touched.
Everything runs headless. Fonts: Bricolage Grotesque ExtraBold and Figtree (both OFL),
looked up in the usual system font folders.
"""

import os
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent.parent
SAIDA = Path(__file__).resolve().parent
ICONE = RAIZ / "apps" / "desktop" / "assets" / "tuift-icon.svg"

INK = "#141414"
LARANJA = "#F9670E"
ARCO_IRIS = ["#8FC4FF", "#C6F06A", "#FFE45C", "#FF9F3D", "#FF5FAE"]

VIEW = {"width": 1280, "height": 800}  # feature crops
VIEW_HERO = {"width": 1120, "height": 700}  # product shot, a bit smaller so the UI reads larger
ESCALA = 2  # device scale factor of every capture


# --------------------------------------------------------------------------- fonts


def achar_fonte(nome: str) -> Path:
    pastas = [
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Windows" / "Fonts",
        Path.home() / "Library" / "Fonts",
        Path("/Library/Fonts"),
        Path.home() / ".fonts",
        Path("/usr/share/fonts"),
    ]
    for pasta in pastas:
        if pasta.is_dir():
            achado = next(pasta.rglob(nome), None)
            if achado:
                return achado
    raise SystemExit(f"font {nome} not found; install it (OFL, Google Fonts) and run again")


def css_fontes() -> str:
    faces = [
        ("Bricolage Grotesque", 800, "BricolageGrotesque-ExtraBold.ttf"),
        ("Figtree", 500, "Figtree-Medium.ttf"),
        ("Figtree", 800, "Figtree-ExtraBold.ttf"),
    ]
    return "".join(
        f"@font-face{{font-family:'{familia}';font-weight:{peso};src:url('{achar_fonte(arq).as_uri()}')}}"
        for familia, peso, arq in faces
    )


# --------------------------------------------------------------------------- image helpers


def arredondar(img: Image.Image, raio: int) -> Image.Image:
    """Round the corners with a 4x supersampled mask so the edge is smooth."""
    img = img.convert("RGBA")
    k = 4
    mascara = Image.new("L", (img.width * k, img.height * k), 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        (0, 0, img.width * k - 1, img.height * k - 1), radius=raio * k, fill=255
    )
    img.putalpha(mascara.resize(img.size, Image.LANCZOS))
    return img


def borda(img: Image.Image, raio: int, cor: tuple[int, int, int, int], largura: int = 2) -> Image.Image:
    k = 4
    traco = Image.new("RGBA", (img.width * k, img.height * k), (0, 0, 0, 0))
    ImageDraw.Draw(traco).rounded_rectangle(
        (0, 0, img.width * k - 1, img.height * k - 1), radius=raio * k, outline=cor, width=largura * k
    )
    return Image.alpha_composite(img, traco.resize(img.size, Image.LANCZOS))


def cartao(png: Path, raio: int, cor_borda: tuple[int, int, int, int]) -> Image.Image:
    return borda(arredondar(Image.open(png), raio), raio, cor_borda)


def com_sombra(img: Image.Image, margem: int, deslocamento: int, desfoque: int, opacidade: float) -> Image.Image:
    tela = Image.new("RGBA", (img.width + 2 * margem, img.height + 2 * margem), (0, 0, 0, 0))
    sombra = Image.new("RGBA", tela.size, (0, 0, 0, 0))
    forma = Image.new("L", img.size, int(255 * opacidade))
    sombra.paste((0, 0, 0, 255), (margem, margem + deslocamento), Image.composite(forma, Image.new("L", img.size, 0), img.getchannel("A")))
    tela = Image.alpha_composite(tela, sombra.filter(ImageFilter.GaussianBlur(desfoque)))
    tela.alpha_composite(img, (margem, margem))
    return tela


def salvar_webp(img: Image.Image, destino: Path, largura: int | None = None, qualidade: int = 84) -> None:
    if largura and img.width > largura:
        img = img.resize((largura, round(img.height * largura / img.width)), Image.LANCZOS)
    img.save(destino, "WEBP", quality=qualidade, method=6)
    print(f"{destino.name}: {destino.stat().st_size // 1024} KB, {img.width}x{img.height}")


# --------------------------------------------------------------------------- screenshots

HIDE_PILL = ".sandbox-badge{display:none!important}"

# Demo strings that name another product or this checkout are renamed in the page.
RENAME_JS = """() => {
  const fix = () => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode())
      if (n.nodeValue.includes('tastecode')) n.nodeValue = n.nodeValue.replaceAll('tastecode', 'my-app')
    for (const e of document.querySelectorAll('[title],[aria-label]'))
      for (const a of ['title', 'aria-label'])
        if ((e.getAttribute(a) || '').includes('tastecode'))
          e.setAttribute(a, e.getAttribute(a).replaceAll('tastecode', 'my-app'))
  }
  fix()
  new MutationObserver(fix).observe(document.body, { subtree: true, childList: true, characterData: true })
}"""


def abrir(navegador, base: str, tema: str, idioma: str, chat: str, viewport: dict = VIEW):
    ctx = navegador.new_context(viewport=viewport, device_scale_factor=ESCALA, locale="en-US")
    ctx.add_init_script(
        f"localStorage.setItem('harness.theme','{tema}');localStorage.setItem('harness.language','{idioma}')"
    )
    pg = ctx.new_page()
    pg.goto(f"{base}/sandbox.html?chat={chat}")
    pg.wait_for_selector(".composer", timeout=15000)
    pg.wait_for_timeout(1500)
    pg.add_style_tag(content=HIDE_PILL)
    pg.evaluate(RENAME_JS)
    pg.wait_for_timeout(300)
    return pg


def usar_full_access(pg) -> None:
    pg.get_by_role("button", name="Permissions").click()
    pg.get_by_text("Full access", exact=True).first.click()
    pg.mouse.move(2, 2)
    pg.wait_for_timeout(700)


def settings(pg, pagina: str) -> None:
    pg.get_by_role("button", name="Settings").first.click()
    pg.wait_for_timeout(600)
    pg.locator("button,a,[role=tab]").filter(has_text=pagina).first.click()
    pg.mouse.move(2, 2)
    pg.wait_for_timeout(1500)


def foto(pg, destino: Path, x: int | None = None, y: int = 0, w: int = 800, h: int = 500) -> None:
    clip = None if x is None else {"x": x, "y": y, "width": w, "height": h}
    pg.screenshot(path=str(destino), clip=clip)


def capturar(base: str, tmp: Path) -> None:
    with sync_playwright() as p:
        navegador = p.chromium.launch()

        # Product shot, both themes: a finished Claude Code chat, Full access, Design and Motion.
        for tema in ("dark", "light"):
            pg = abrir(navegador, base, tema, "en", "demo-focus-ring", VIEW_HERO)
            pg.evaluate(
                "setInterval(() => document.querySelectorAll('button').forEach(b => {"
                " if (b.textContent.includes('Jump to latest')) b.style.display = 'none' }), 50)"
            )
            pg.evaluate("document.querySelector('.thread').scrollTop = 0")
            usar_full_access(pg)
            pg.wait_for_timeout(500)
            foto(pg, tmp / f"produto-{tema}.png")
            pg.context.close()

        # Feature crops, dark theme, 8:5 regions of the page, all resized to 1280x800.
        pg = abrir(navegador, base, "dark", "en", "demo-focus-ring")
        settings(pg, "Providers")
        foto(pg, tmp / "f-agentes.png", x=310, y=70, w=940, h=588)
        pg.context.close()

        pg = abrir(navegador, base, "dark", "en", "new")
        pg.get_by_role("button", name="Design", exact=True).click()
        pg.mouse.move(2, 2)
        pg.wait_for_timeout(1600)
        foto(pg, tmp / "f-design.png", x=330, y=180, w=864, h=540)
        pg.context.close()

        pg = abrir(navegador, base, "dark", "en", "demo-focus-ring")
        settings(pg, "MCP servers")
        foto(pg, tmp / "f-mcp.png", x=380, y=70)
        pg.context.close()

        pg = abrir(navegador, base, "dark", "en", "demo-focus-ring")
        settings(pg, "Skills")
        foto(pg, tmp / "f-skills.png", x=380, y=70)
        pg.context.close()

        pg = abrir(navegador, base, "dark", "en", "demo-focus-ring")
        pg.get_by_role("button", name="Show workspace tools").click()
        pg.wait_for_timeout(700)
        # widen the panel to 640px by dragging its edge, so the crop is exactly the panel
        pg.mouse.move(761, 400)
        pg.mouse.down()
        pg.mouse.move(700, 400, steps=5)
        pg.mouse.move(640, 400, steps=5)
        pg.mouse.up()
        pg.wait_for_timeout(500)
        pg.get_by_text("Files", exact=True).first.click()
        pg.wait_for_timeout(1200)
        for nome in ("apps", "web", "src", "styles"):
            pg.get_by_text(nome, exact=True).last.click()
            pg.wait_for_timeout(500)
        pg.get_by_text("focus-ring.css", exact=True).last.click()
        pg.mouse.move(2, 2)
        pg.wait_for_timeout(1200)
        foto(pg, tmp / "f-arquivos.png", x=640, y=34, w=640, h=400)
        pg.context.close()

        pg = abrir(navegador, base, "dark", "pt-BR", "demo-focus-ring")
        settings(pg, "Geral")
        pg.get_by_text("Português (Brasil)").first.click()
        pg.mouse.move(2, 2)
        pg.wait_for_timeout(800)
        foto(pg, tmp / "f-idioma.png", x=380, y=70)
        pg.context.close()

        navegador.close()


def montar_capturas(tmp: Path) -> None:
    # Product shot: window with a soft shadow, transparent around it.
    for tema, contorno in (("dark", (255, 255, 255, 38)), ("light", (0, 0, 0, 36))):
        janela = cartao(tmp / f"produto-{tema}.png", 28, contorno)
        sombra = 0.55 if tema == "dark" else 0.30
        quadro = com_sombra(janela, margem=80, deslocamento=16, desfoque=20, opacidade=sombra)
        salvar_webp(quadro, SAIDA / f"produto-{tema}.webp", largura=2000, qualidade=86)
    # Feature crops: rounded, thin border, no shadow (sit well on both GitHub themes).
    nomes = {
        "f-agentes": "feature-agentes",
        "f-design": "feature-design",
        "f-mcp": "feature-mcp",
        "f-skills": "feature-skills",
        "f-arquivos": "feature-arquivos",
        "f-idioma": "feature-idioma",
    }
    for origem, destino in nomes.items():
        img = Image.open(tmp / f"{origem}.png")
        if img.width != 1280:
            img = img.resize((1280, 800), Image.LANCZOS)
        img.save(tmp / f"{origem}-n.png")
        img = cartao(tmp / f"{origem}-n.png", 26, (128, 128, 128, 70))
        salvar_webp(img, SAIDA / f"{destino}.webp", qualidade=86)


# --------------------------------------------------------------------------- brand cards


def marca_svg(tinta: str) -> str:
    """The app icon's T (apps/desktop/assets/tuift-icon.svg) with its white body recoloured."""
    svg = ICONE.read_text(encoding="utf-8")
    return svg.replace('<rect x="-8" y="-8" width="116" height="116" fill="#fff"', f'<rect x="-8" y="-8" width="116" height="116" fill="{tinta}"')


def html_wordmark(tinta: str) -> str:
    return f"""<html><head><style>{css_fontes()}
html,body{{margin:0;background:transparent}}
.w{{display:inline-flex;align-items:center;gap:26px;padding:24px 40px}}
.w svg{{height:112px;width:112px;display:block}}
.t{{font:800 104px/1 'Bricolage Grotesque';letter-spacing:-.025em;color:{tinta};white-space:nowrap}}
.t b{{color:{LARANJA};font-weight:800}}
</style></head><body><div class="w" id="w">{marca_svg(tinta)}<div class="t">TUIFT <b>Code</b></div></div></body></html>"""


def recortar(img: Image.Image, folga: int) -> Image.Image:
    caixa = img.getbbox()
    img = img.crop(caixa)
    tela = Image.new("RGBA", (img.width + 2 * folga, img.height + 2 * folga), (0, 0, 0, 0))
    tela.alpha_composite(img, (folga, folga))
    return tela


def abrir_html(pg, html: str, tmp: Path) -> None:
    """set_content() pages cannot load file:// fonts or images, so go through a real file."""
    arquivo = tmp / "pagina.html"
    arquivo.write_text(html, encoding="utf-8")
    pg.goto(arquivo.as_uri())
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(400)


def wordmarks(navegador, tmp: Path) -> None:
    for tema, tinta in (("dark", "#FFFFFF"), ("light", INK)):
        pg = navegador.new_page(viewport={"width": 900, "height": 220}, device_scale_factor=3)
        abrir_html(pg, html_wordmark(tinta), tmp)
        destino = SAIDA / f"wordmark-{tema}.png"
        pg.screenshot(path=str(destino), omit_background=True)
        recortar(Image.open(destino), 36).save(destino, optimize=True)
        print(f"{destino.name}: {destino.stat().st_size // 1024} KB")
        pg.close()


def html_banner(tema: str, captura: Path) -> str:
    escuro = tema == "dark"
    fundo = INK if escuro else "#FFFFFF"
    texto = "#FFFFFF" if escuro else INK
    suave = "#B9B9B9" if escuro else "#57606A"
    contorno = "rgba(255,255,255,.14)" if escuro else "#D0D7DE"
    brilho = "rgba(249,103,14,.20)" if escuro else "rgba(249,103,14,.10)"
    faixas = "".join(f'<i style="background:{c}"></i>' for c in ARCO_IRIS)
    return f"""<html><head><style>{css_fontes()}
html,body{{margin:0;background:transparent}}
.b{{position:relative;width:1200px;height:340px;box-sizing:border-box;border-radius:28px;overflow:hidden;
  background:radial-gradient(70% 130% at 100% 0%,{brilho},transparent 62%),{fundo};
  border:1px solid {contorno};color:{texto};font-family:'Figtree'}}
.l{{position:absolute;left:60px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}}
h1{{margin:0;font:800 56px/1.04 'Bricolage Grotesque';letter-spacing:-.025em}}
h1 span{{color:{LARANJA}}}
p{{margin:18px 0 28px;font:500 21px/1.4 'Figtree';color:{suave}}}
.btn{{align-self:flex-start;background:{LARANJA};color:{INK};font:800 20px/1 'Figtree';padding:15px 26px;border-radius:999px}}
.s{{position:absolute;left:640px;top:58px;width:620px;border-radius:18px 0 0 0;border:1px solid {contorno};border-right:0;border-bottom:0;
  box-shadow:0 30px 80px rgba(0,0,0,{.5 if escuro else .22})}}
.r{{position:absolute;left:0;right:0;bottom:0;height:4px;display:flex}}
.r i{{flex:1}}
</style></head><body><div class="b">
<div class="l"><h1>Every coding agent.<br><span>One desktop app.</span></h1>
<p>Windows and macOS builds will be published in Releases.</p><div class="btn">Open Releases &nbsp;&rarr;</div></div>
<img class="s" src="{captura.as_uri()}"><div class="r">{faixas}</div></div></body></html>"""


def banners(navegador, tmp: Path) -> None:
    for tema in ("dark", "light"):
        captura = tmp / f"produto-{tema}.png"
        if not captura.exists():
            raise SystemExit("run the 'capturas' step first (it writes the raw screenshots)")
        pg = navegador.new_page(viewport={"width": 1200, "height": 340}, device_scale_factor=2)
        abrir_html(pg, html_banner(tema, captura), tmp)
        bruto = tmp / f"banner-{tema}.png"
        pg.screenshot(path=str(bruto), omit_background=True)
        salvar_webp(Image.open(bruto), SAIDA / f"banner-{tema}.webp", qualidade=88)
        pg.close()


# --------------------------------------------------------------------------- main


def main() -> None:
    comando = sys.argv[1] if len(sys.argv) > 1 else "tudo"
    base = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:5437").rstrip("/")
    assert comando in ("capturas", "marca", "tudo"), "use: capturas | marca | tudo"
    # Raw screenshots live in a scratch folder next to the images, not committed.
    tmp = Path(tempfile.gettempdir()) / "tuift-readme-raw"
    tmp.mkdir(exist_ok=True)
    if comando in ("capturas", "tudo"):
        capturar(base, tmp)
        montar_capturas(tmp)
    if comando in ("marca", "tudo"):
        with sync_playwright() as p:
            navegador = p.chromium.launch()
            wordmarks(navegador, tmp)
            banners(navegador, tmp)
            navegador.close()


if __name__ == "__main__":
    main()
