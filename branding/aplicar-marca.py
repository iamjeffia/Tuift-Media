"""Troca a marca TasteCode pelo TUIFT Code no código. Pode rodar de novo depois de cada
merge do upstream: só mexe no que ainda estiver com a marca antiga.

Uso: python branding/aplicar-marca.py            (aplica)
     python branding/aplicar-marca.py --checar   (só lista o que falta; sai com 1 se houver)

O que muda e por quê está em branding/README.md. Arquivos de licença, créditos, docs
internos do upstream e os tipos gerados do Codex ficam como estão.
"""

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NOME = "TUIFT Code"
REPO = "iamjeffia/TuiftCode"
APP_ID = "media.tuift.code"
PORTA_ANTIGA, PORTA = "4311", "4317"

PASTAS = ["apps", "packages", "tools"]
EXTENSOES = {".ts", ".tsx", ".js", ".cjs", ".mjs", ".json", ".css", ".html", ".md", ".swift", ".plist", ".yml"}
IGNORAR = ("node_modules", "/dist/", "/generated/", "/release/", "/.vite/")

# Ordem importa: os casos especiais vêm antes da troca geral do nome.
TROCAS = [
    ("'PersonalHarness'", "'TUIFTCode'"),  # serviço no cofre de senhas do Windows
    ("Leonxlnx/tastecode", REPO),
    ("owner: 'Leonxlnx', repo: 'tastecode'", "owner: '%s', repo: '%s'" % tuple(REPO.split("/"))),
    ("dev.tastecode.desktop", APP_ID),
    ("'.tastecode'", "'.tuift-code'"),
    ("~/.tastecode", "~/.tuift-code"),
    ("tastecode-app-icon.png", "tuift-app-icon.png"),
    ("tastecode-icon.icon", "tuift-icon.icon"),
    ("../assets/tastecode-icon", "../assets/tuift-icon"),
    ("tastecode.icon", "tuift.icon"),
    ("TasteCodeMark", "TuiftMark"),
    ("-pTasteCode", f"-p{NOME}"),  # texto colado num teste ("claude -p" + nome)
    ("function TasteCode(", "function TuiftApp("),  # componente de teste
    ("<TasteCode />", "<TuiftApp />"),
    ("TasteCode-", "TUIFT-Code-"),  # nomes de arquivo do instalador e das releases
    ("Taste Code", NOME),
    (re.compile(r"\bTasteCode\b"), NOME),
]
# A porta só muda onde ela é o padrão do app (o build fixa a mesma porta em todo instalador).
ARQUIVOS_PORTA = [
    "apps/server/src/server-config.ts",
    "apps/web/src/server-url.ts",
    "apps/web/vite.config.ts",
    "tools/scripts/dev.js",
    "apps/web/src/server-url.test.ts",
]


def arquivos():
    for pasta in PASTAS:
        for caminho in (RAIZ / pasta).rglob("*"):
            texto = caminho.as_posix()
            if caminho.is_file() and caminho.suffix in EXTENSOES and not any(p in texto for p in IGNORAR):
                yield caminho


def trocar(texto: str) -> str:
    for antigo, novo in TROCAS:
        texto = antigo.sub(novo, texto) if isinstance(antigo, re.Pattern) else texto.replace(antigo, novo)
    return texto


def pacote_desktop(dados: dict) -> dict:
    dados["productName"] = NOME
    dados["description"] = "TUIFT Code: a local desktop workspace for coding agents."
    dados["author"] = "TUIFT Media"
    dados["copyright"] = "TUIFT Code by TUIFT Media. Based on TasteCode by @blueemi99 and @lexnlin (Apache-2.0)."
    build = dados["build"]
    build["appId"] = APP_ID
    for alvo in build.get("publish", []):
        if alvo.get("provider") == "github":
            alvo["owner"], alvo["repo"] = REPO.split("/")
    return dados


def main(checar: bool) -> int:
    pendentes = []
    for caminho in arquivos():
        antes = caminho.read_text(encoding="utf-8")
        depois = trocar(antes)
        rel = caminho.relative_to(RAIZ).as_posix()
        if rel in ARQUIVOS_PORTA:
            depois = depois.replace(PORTA_ANTIGA, PORTA)
        if rel == "apps/desktop/package.json":
            depois = json.dumps(pacote_desktop(json.loads(depois)), indent=2, ensure_ascii=False) + "\n"
        if depois != antes:
            pendentes.append(rel)
            if not checar:
                caminho.write_text(depois, encoding="utf-8", newline="")
    for rel in pendentes:
        print(("falta: " if checar else "trocado: ") + rel)
    print(f"{len(pendentes)} arquivo(s) {'com marca antiga' if checar else 'alterado(s)'}")
    return 1 if checar and pendentes else 0


if __name__ == "__main__":
    sys.exit(main("--checar" in sys.argv))
