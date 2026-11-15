"""Modelo de mixagem para motion de app (skill motion-app-ae).

Soma uma trilha e uma lista de efeitos posicionados pelo pico e grava o vídeo com o
áudio novo, sem renderizar a imagem de novo. Precisa de Python 3 e ffmpeg no PATH.

Uso:
    python mixar_modelo.py cues.json video.mp4 saida.mp4 --sfx pasta_de_efeitos
        [--trilha trilha.mp3] [--dur 20] [--trilha-ganho 0.45] [--saida-lufs -14]

cues.json: {"cues": [{"t": 3.3, "arquivo": "whoosh-longo", "pico": 0.139,
                      "volume": 0.5, "nota": "virada para o claro"}, ...]}
  t       instante do evento no vídeo, em segundos
  arquivo nome do arquivo em --sfx, sem extensão (.wav)
  pico    instante do som mais alto dentro do arquivo, em segundos (padrão 0)
  volume  ganho linear do efeito (padrão 1)
O efeito começa em t - pico, para o pico cair no evento.
"""
import argparse
import json
import subprocess
from pathlib import Path


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def stem_efeitos(cues, sfx, dur, destino):
    entradas, filtros, rotulos = [], [], []
    for i, c in enumerate(cues):
        entradas += ["-i", str(sfx / f"{c['arquivo']}.wav")]
        ms = max(0, round((c["t"] - c.get("pico", 0.0)) * 1000))
        filtros.append(
            f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,"
            f"volume={c.get('volume', 1.0)},adelay={ms}|{ms}[c{i}]"
        )
        rotulos.append(f"[c{i}]")
    filtros.append(
        "".join(rotulos)
        + f"amix=inputs={len(cues)}:normalize=0:duration=longest,"
        f"apad=whole_dur={dur},atrim=0:{dur}[out]"
    )
    ff(*entradas, "-filter_complex", ";".join(filtros), "-map", "[out]",
       "-ar", "48000", "-c:a", "pcm_s24le", str(destino))


def stem_trilha(trilha, ganho, dur, destino):
    ff("-i", str(trilha), "-af",
       f"aresample=48000,volume={ganho},atrim=0:{dur},"
       f"afade=t=out:st={dur - 0.4}:d=0.4,apad=whole_dur={dur}",
       "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(destino))


def medir(arquivo, alvo, tp=-1.5):
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(arquivo), "-af",
         f"loudnorm=I={alvo}:TP={tp}:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    return json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("cues")
    p.add_argument("video")
    p.add_argument("saida")
    p.add_argument("--sfx", required=True, help="pasta com os efeitos (.wav)")
    p.add_argument("--trilha", help="arquivo de música; sem ele a mix leva só os efeitos")
    p.add_argument("--dur", type=float, default=20.0, help="duração do vídeo em segundos")
    p.add_argument("--trilha-ganho", type=float, default=0.45)
    p.add_argument("--saida-lufs", type=float, default=-14.0)
    a = p.parse_args()

    cues = json.load(open(a.cues, encoding="utf-8"))["cues"]
    aqui = Path(a.saida).resolve().parent
    efeitos, trilha = aqui / "stem-efeitos.wav", aqui / "stem-trilha.wav"
    soma, mix = aqui / "soma-bruta.wav", aqui / "mix.wav"

    stem_efeitos(cues, Path(a.sfx), a.dur, efeitos)
    if a.trilha:
        stem_trilha(a.trilha, a.trilha_ganho, a.dur, trilha)
        ff("-i", str(trilha), "-i", str(efeitos), "-filter_complex",
           "[0:a][1:a]amix=inputs=2:normalize=0:duration=longest[o]", "-map", "[o]",
           "-c:a", "pcm_s24le", str(soma))
    else:
        ff("-i", str(efeitos), "-c:a", "pcm_s24le", str(soma))
    m = medir(soma, a.saida_lufs)
    ff("-i", str(soma), "-af",
       f"loudnorm=I={a.saida_lufs}:TP=-1.5:LRA=11:linear=true:"
       f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
       f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
       f"offset={m['target_offset']},aresample=48000",
       "-c:a", "pcm_s24le", str(mix))
    ff("-i", a.video, "-i", str(mix), "-map", "0:v", "-map", "1:a",
       "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", a.saida)
    print("soma bruta:", m["input_i"], "LUFS /", m["input_tp"], "dBTP")
    print("final:", medir(mix, a.saida_lufs)["input_i"], "LUFS ->", a.saida)


if __name__ == "__main__":
    main()
