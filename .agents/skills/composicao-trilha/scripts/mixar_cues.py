"""Posiciona sons pelo pico e mistura uma trilha a partir de um cues.json.

Precisa de Python 3 (só biblioteca padrão) e ffmpeg/ffprobe no PATH.

Medir onde está o pico de energia de um arquivo (para hits, risers, transições):
    python mixar_cues.py --medir riser.wav

Mixar:
    python mixar_cues.py cues.json saida.wav

cues.json:
{
  "dur": 60.0,                      duração total em segundos
  "saida_lufs": -14,                opcional; se existir, normaliza em duas passagens
  "cues": [
    {"arquivo": "sons/drone.wav", "t": 0.0, "alinha": "inicio", "ganho_db": -20,
     "ate": 58.0, "fade_in": 3.0, "fade_out": 2.5},
    {"arquivo": "sons/riser.wav", "t": 12.4, "alinha": "pico", "ganho_db": -14},
    {"arquivo": "sons/hit.wav",   "t": 12.43, "alinha": "pico", "pico": 0.02}
  ]
}
  t        instante do evento (alinha "pico") ou do começo do som (alinha "inicio")
  alinha   "pico" (padrão): o início do arquivo é t - pico; "inicio": o arquivo começa em t
  pico     opcional; segundos do pico dentro do arquivo. Sem ele, é medido
  ganho_db ganho em dB (padrão 0)
  ate      opcional; corta o som neste instante do vídeo
  fade_in, fade_out  opcionais, em segundos
Caminhos relativos valem a partir da pasta do cues.json.
"""
import array
import json
import subprocess
import sys
from pathlib import Path

JANELA = 0.05  # segundos por janela de energia


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def medir_pico(arquivo):
    """Instante (s) da janela de maior energia (RMS) do arquivo."""
    taxa = 16000
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(arquivo), "-ac", "1", "-ar", str(taxa),
         "-f", "s16le", "-"], capture_output=True, check=True)
    amostras = array.array("h")
    amostras.frombytes(r.stdout)
    n = int(taxa * JANELA)
    melhor, onde = -1.0, 0
    for i in range(0, max(1, len(amostras) - n), n):
        bloco = amostras[i:i + n]
        energia = sum(a * a for a in bloco) / max(1, len(bloco))
        if energia > melhor:
            melhor, onde = energia, i
    return round((onde + n / 2) / taxa, 3)


def mixar(cues_json, saida):
    base = Path(cues_json).resolve().parent
    dados = json.load(open(cues_json, encoding="utf-8"))
    dur = float(dados["dur"])
    entradas, filtros, rotulos = [], [], []
    for i, c in enumerate(dados["cues"]):
        arq = Path(c["arquivo"])
        arq = arq if arq.is_absolute() else base / arq
        entradas += ["-i", str(arq)]
        t = float(c["t"])
        if c.get("alinha", "pico") == "pico":
            pico = c.get("pico")
            pico = medir_pico(arq) if pico is None else float(pico)
            inicio = t - pico
        else:
            inicio = t
        cadeia = f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo"
        corte = max(0.0, -inicio)  # parte do arquivo que cairia antes do zero
        if corte:
            cadeia += f",atrim=start={corte},asetpts=PTS-STARTPTS"
        inicio = max(0.0, inicio)
        if c.get("ate") is not None:
            cadeia += f",atrim=end={max(0.0, float(c['ate']) - inicio)}"
        if c.get("fade_in"):
            cadeia += f",afade=t=in:d={c['fade_in']}"
        if c.get("fade_out"):
            # o fim do som é o corte pedido, ou a duração do arquivo
            fim = (float(c["ate"]) - inicio) if c.get("ate") is not None else None
            if fim is None:
                fim = float(subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "csv=p=0", str(arq)], capture_output=True, text=True,
                    check=True).stdout.strip()) - corte
            cadeia += f",afade=t=out:st={max(0.0, fim - float(c['fade_out']))}:d={c['fade_out']}"
        ms = round(inicio * 1000)
        cadeia += f",volume={c.get('ganho_db', 0)}dB,adelay={ms}|{ms}[c{i}]"
        filtros.append(cadeia)
        rotulos.append(f"[c{i}]")
    filtros.append(
        "".join(rotulos) + f"amix=inputs={len(rotulos)}:normalize=0:duration=longest,"
        f"apad=whole_dur={dur},atrim=0:{dur}[out]")
    destino = Path(saida)
    bruta = destino if "saida_lufs" not in dados else destino.with_name(destino.stem + "-bruta.wav")
    ff(*entradas, "-filter_complex", ";".join(filtros), "-map", "[out]",
       "-ar", "48000", "-c:a", "pcm_s24le", str(bruta))
    if "saida_lufs" in dados:
        alvo = float(dados["saida_lufs"])
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(bruta), "-af",
             f"loudnorm=I={alvo}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
            capture_output=True, text=True)
        m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
        ff("-i", str(bruta), "-af",
           f"loudnorm=I={alvo}:TP=-1.5:LRA=11:linear=true:measured_I={m['input_i']}:"
           f"measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
           f"measured_thresh={m['input_thresh']}:offset={m['target_offset']},aresample=48000",
           "-c:a", "pcm_s24le", str(destino))
        bruta.unlink()
    print("gravado:", destino)


def main():
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "--medir":
        print(f"pico de energia em {medir_pico(a[1])} s")
    elif len(a) == 2:
        mixar(a[0], a[1])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
