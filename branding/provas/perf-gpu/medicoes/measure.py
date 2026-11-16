"""Headless measurement of the TUIFT sandbox: CPU of renderer + GPU process, frames, animations.

usage: python measure.py <label> [--gpu|--soft] [--seconds 60] [--css "..."] [--query "..."]
       [--scheme light|dark] [--size 1600x1000] [--trace] [--extra-args "..."] [--out file]
Nothing is shown: Playwright new headless. Priority is lowered for every browser process.
"""
import argparse, json, re, sys, time
import psutil
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('label')
ap.add_argument('--gpu', action='store_true')
ap.add_argument('--seconds', type=int, default=60)
ap.add_argument('--css', default='')
ap.add_argument('--query', default='chat=demo-focus-ring')
ap.add_argument('--scheme', default='light')
ap.add_argument('--size', default='1600x1000')
ap.add_argument('--trace', action='store_true')
ap.add_argument('--trace-seconds', type=int, default=6)
ap.add_argument('--extra-args', default='')
ap.add_argument('--out', default='results.jsonl')
ap.add_argument('--settle', type=int, default=10)
ap.add_argument('--port', default='5561')
ap.add_argument('--js', default='')
ap.add_argument('--no-measure', action='store_true')
ap.add_argument('--shot', default='')
ap.add_argument('--url', default='')
a = ap.parse_args()

GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
args = (GPU_ARGS if a.gpu else ['--disable-gpu']) + a.extra_args.split()
w, h = map(int, a.size.split('x'))


def classify(p):
    try:
        cl = ' '.join(p.cmdline())
    except Exception:
        return None
    m = re.search(r'--type=([\w-]+)', cl)
    return m.group(1) if m else 'browser'


def snapshot(root_pid):
    root = psutil.Process(root_pid)
    procs = [root] + root.children(recursive=True)
    out = {}
    for p in procs:
        kind = classify(p)
        if kind is None:
            continue
        try:
            t = p.cpu_times()
            rss = p.memory_info().private if hasattr(p.memory_info(), 'private') else p.memory_info().rss
        except Exception:
            continue
        out.setdefault(kind, []).append((p.pid, t.user + t.system, rss))
    return out


def lower(root_pid):
    root = psutil.Process(root_pid)
    for p in [root] + root.children(recursive=True):
        try:
            p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        except Exception:
            pass


def cpu_pct(s0, s1, dt):
    res = {}
    for kind in ('renderer', 'gpu-process', 'browser'):
        c0 = {pid: c for pid, c, _ in s0.get(kind, [])}
        total = 0.0
        for pid, c, _ in s1.get(kind, []):
            total += c - c0.get(pid, c)
        res[kind] = round(100 * total / dt, 1)
    return res


result = {'label': a.label, 'gpu': a.gpu, 'scheme': a.scheme, 'size': a.size, 'seconds': a.seconds, 'query': a.query, 'css': a.css, 'extra_args': a.extra_args}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chromium', args=args)
    ctx = browser.new_context(viewport={'width': w, 'height': h}, color_scheme=a.scheme, device_scale_factor=1)
    # the app's own theme preference: follow the emulated scheme
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(a.url or f'http://127.0.0.1:{a.port}/sandbox.html?{a.query}', wait_until='load')
    page.wait_for_timeout(2500)
    if a.js:
        page.evaluate(a.js)
    if a.css:
        page.add_style_tag(content=a.css)
    root_pid = None
    cdp_b = browser.new_browser_cdp_session()
    info = cdp_b.send('SystemInfo.getProcessInfo')
    for pi in info['processInfo']:
        if pi['type'] == 'browser':
            root_pid = pi['id']
    lower(root_pid)
    page.wait_for_timeout(a.settle * 1000)
    probe = page.evaluate("""() => ({
      anims: document.getAnimations().filter(x => x.playState === 'running').length,
      animsByName: Object.fromEntries(Object.entries(document.getAnimations().filter(x => x.playState === 'running').reduce((m, x) => { const n = x.animationName || x.transitionProperty || x.constructor.name; m[n] = (m[n]||0)+1; return m }, {}))),
      beams: document.querySelectorAll('[data-beam-turn]').length,
      layers: document.querySelectorAll('[data-beam-glow],[data-beam-stroke],[data-beam-bloom],[data-beam-turn],[data-beam-still]').length,
      hidden: document.visibilityState, dpr: devicePixelRatio, w: innerWidth, h: innerHeight,
      hasMotion: !!document.querySelector('.composer__motion-beam'),
    })""")
    result['probe'] = probe
    if a.shot:
        page.screenshot(path=a.shot)
    if not a.no_measure:
        samples = []
        s_prev = snapshot(root_pid)
        t_prev = time.time()
        s_first, t_first = s_prev, t_prev
        step = 10
        for i in range(a.seconds // step):
            time.sleep(step)
            s = snapshot(root_pid)
            t = time.time()
            samples.append(cpu_pct(s_prev, s, t - t_prev))
            s_prev, t_prev = s, t
        result['samples'] = samples
        result['avg'] = cpu_pct(s_first, s_prev, t_prev - t_first)
        result['rssMB'] = {k: round(sum(r for _, _, r in v) / 1048576) for k, v in s_prev.items()}
    if a.trace:
        cats = 'cc,viz,gpu,benchmark,disabled-by-default-cc.debug.cdp-perf'
        cdp_b.send('Tracing.start', {'categories': 'cc,viz,gpu,benchmark,blink,disabled-by-default-devtools.timeline', 'transferMode': 'ReturnAsStream'})
        time.sleep(a.trace_seconds)
        done = {}
        cdp_b.on('Tracing.tracingComplete', lambda ev: done.update(ev))
        cdp_b.send('Tracing.end')
        for _ in range(100):
            if done: break
            page.wait_for_timeout(200)
        handle = done.get('stream')
        data = ''
        while handle:
            r = cdp_b.send('IO.read', {'handle': handle})
            data += r.get('data', '')
            if r.get('eof'): break
        ev = json.loads(data)
        evs = ev['traceEvents'] if isinstance(ev, dict) else ev
        names = {}
        for e in evs:
            if e.get('ph') in ('X', 'B', 'I', 'b', 'n') or e.get('ph') == 'R':
                key = (e.get('cat'), e.get('name'))
                d = names.setdefault(key, [0, 0.0])
                d[0] += 1
                d[1] += e.get('dur', 0) / 1000.0
        top = sorted(names.items(), key=lambda kv: -kv[1][1])[:25]
        counts = {k: v for k, v in names.items() if k[1] in ('Display::DrawAndSwap', 'DrawAndSwap', 'Graphics.Pipeline.DrawAndSwap', 'DirectRenderer::DrawFrame', 'LayerTreeHostImpl::PrepareToDraw', 'RasterTask', 'ThreadProxy::ScheduledActionDraw', 'ProxyImpl::ScheduledActionDraw', 'PictureLayerImpl::UpdateTiles', 'GpuChannel::OnMessageReceived', 'SkiaOutputSurfaceImplOnGpu::SwapBuffers', 'Commit', 'BeginMainFrame', 'UpdateLayoutTree', 'Paint', 'Layerize', 'PrePaint')}
        result['trace'] = {
            'seconds': a.trace_seconds,
            'counts_per_s': {f'{k[0]}|{k[1]}': round(v[0] / a.trace_seconds, 1) for k, v in counts.items()},
            'top_by_time_ms_per_s': [{'cat': k[0], 'name': k[1], 'n_per_s': round(v[0] / a.trace_seconds, 1), 'ms_per_s': round(v[1] / a.trace_seconds, 1)} for k, v in top],
        }
    result['errors'] = errors[:3]
    browser.close()
with open(a.out, 'a', encoding='utf-8') as f:
    f.write(json.dumps(result) + '\n')
print(json.dumps({k: v for k, v in result.items() if k not in ('trace',)}, indent=None))
if 'trace' in result:
    print(json.dumps(result['trace']['counts_per_s']))
    for t in result['trace']['top_by_time_ms_per_s'][:14]:
        print(t)
