"""Grava uma janela específica (ou um monitor) por N segundos em MP4.

Usa Windows Graphics Capture (pip install windows-capture): pega a janela
mesmo coberta por outras e com GPU (Electron, Chrome), sem frame preto do gdigrab.

  python gravar.py --listar
  python gravar.py --janela "Meu App" --segundos 5 --saida demo.mp4
  python gravar.py --processo chrome --segundos 8 --fps 60
  python gravar.py --monitor 1 --segundos 3
"""
import argparse, subprocess, sys, threading, time

try:
    import cv2
    import win32gui, win32process
    import psutil
    from windows_capture import WindowsCapture
except ImportError as e:
    sys.exit(f"Falta um pacote Python ({e.name}). Rode: pip install windows-capture opencv-python pywin32 psutil")


def janelas():
    out = []
    def cb(h, _):
        t = win32gui.GetWindowText(h)
        if t and win32gui.IsWindowVisible(h):
            try:
                proc = psutil.Process(win32process.GetWindowThreadProcessId(h)[1]).name()
            except Exception:
                proc = "?"
            out.append((h, proc, t, win32gui.IsIconic(h)))
    win32gui.EnumWindows(cb, None)
    return out


def achar(janela, processo):
    alvo = [j for j in janelas()
            if (not janela or janela.lower() in j[2].lower())
            and (not processo or processo.lower() in j[1].lower())]
    if not alvo:
        sys.exit("Nenhuma janela encontrada. Rode --listar.")
    # título exato ganha; senão a primeira (ordem Z: a mais à frente)
    exato = [j for j in alvo if janela and j[2].lower() == janela.lower()]
    return (exato or alvo)[0]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--listar", action="store_true")
    p.add_argument("--janela", help="trecho do título")
    p.add_argument("--processo", help="trecho do nome do processo (ex.: chrome)")
    p.add_argument("--hwnd", type=int)
    p.add_argument("--monitor", type=int, help="1 = principal")
    p.add_argument("--segundos", type=float, default=5)
    p.add_argument("--fps", type=int, default=60)
    p.add_argument("--atraso", type=float, default=0, help="espera antes de começar")
    p.add_argument("--sem-cursor", action="store_true")
    p.add_argument("--saida", default="gravacao.mp4")
    a = p.parse_args()

    if a.listar:
        for h, proc, t, mini in janelas():
            print(f"{h:>10}  {proc:<22} {t}{'  [minimizada]' if mini else ''}")
        return

    kw = dict(cursor_capture=not a.sem_cursor, draw_border=False)
    if a.monitor:
        kw["monitor_index"] = a.monitor
        nome = f"monitor {a.monitor}"
    else:
        h = a.hwnd or achar(a.janela, a.processo)[0]
        if win32gui.IsIconic(h):
            sys.exit("A janela está minimizada; o Windows não entrega quadros dela. Restaure (pode ficar atrás de outras).")
        kw["window_hwnd"] = h
        nome = win32gui.GetWindowText(h)

    cap = WindowsCapture(**kw)
    ultimo = {"f": None}
    pronto = threading.Event()

    @cap.event
    def on_frame_arrived(frame, control):
        ultimo["f"] = frame.frame_buffer.copy()  # BGRA
        pronto.set()
        if parar.is_set():
            control.stop()

    @cap.event
    def on_closed():
        pronto.set()

    parar = threading.Event()
    ctl = cap.start_free_threaded()
    if not pronto.wait(5) or ultimo["f"] is None:
        sys.exit("Nenhum quadro em 5 s. A janela está aberta e visível em algum monitor?")
    if a.atraso:
        time.sleep(a.atraso)

    alt, larg = ultimo["f"].shape[:2]
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{larg}x{alt}", "-r", str(a.fps), "-i", "-",
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", a.saida,
    ], stdin=subprocess.PIPE)

    # O WGC só manda quadro quando algo muda; amostrar num relógio fixo mantém o tempo real.
    total = round(a.segundos * a.fps)
    t0 = time.perf_counter()
    print(f"Gravando '{nome}' ({larg}x{alt}) por {a.segundos}s a {a.fps} fps...", flush=True)
    for i in range(total):
        f = ultimo["f"]
        if f.shape[:2] != (alt, larg):  # janela redimensionada
            f = cv2.resize(f, (larg, alt))
        ff.stdin.write(f.tobytes())
        espera = t0 + (i + 1) / a.fps - time.perf_counter()
        if espera > 0:
            time.sleep(espera)
    real = time.perf_counter() - t0
    parar.set()
    ff.stdin.close()
    ff.wait()
    try:
        ctl.stop()
    except Exception:
        pass
    if real > a.segundos * 1.05:
        print(f"Aviso: a gravação levou {real:.2f}s (máquina lenta); baixe o --fps.")
    print(a.saida)


if __name__ == "__main__":
    main()
