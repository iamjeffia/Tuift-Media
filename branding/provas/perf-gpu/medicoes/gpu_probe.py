import sys, json
from playwright.sync_api import sync_playwright

mode = sys.argv[1] if len(sys.argv) > 1 else 'gpu'
args = {
    'soft': ['--disable-gpu'],
    'gpu': ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization'],
    'gpu2': ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--enable-zero-copy'],
}[mode]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='chromium', args=args)
    pg = b.new_page()
    pg.goto('about:blank')
    cdp = b.new_browser_cdp_session()
    info = cdp.send('SystemInfo.getInfo')
    print('devices', json.dumps(info['gpu'].get('devices'), indent=0)[:600])
    print('featureStatus', json.dumps(info['gpu'].get('featureStatus')))
    print('driverBugWorkarounds', len(info['gpu'].get('driverBugWorkarounds') or []))
    print('auxAttributes', {k: v for k, v in (info['gpu'].get('auxAttributes') or {}).items() if k in ('glRenderer', 'glVendor', 'glVersion', 'directComposition', 'softwareRendering', 'gpuProcessCrash', 'initializationTime', 'glImplementationParts', 'displayType')})
    print('BROWSER', b.version)
    pg.goto('chrome://gpu')
    pg.wait_for_timeout(4000)
    txt = pg.evaluate("""() => { function walk(n, out){ if(n.shadowRoot) walk(n.shadowRoot, out); for (const c of (n.childNodes||[])) { if (c.nodeType===3) out.push(c.textContent); else walk(c, out);} return out } return walk(document.body, []).join(' ').replace(/\\s+/g,' ') }""")
    import re
    for key in ['Canvas', 'Compositing', 'Rasterization', 'GL_RENDERER', 'Direct3D', 'Skia Graphite', 'Display type', 'GL implementation parts', 'Driver D3D12']:
        m = re.search(key + r'.{0,120}', txt)
        print(key, '=>', m.group(0) if m else None)
    b.close()
