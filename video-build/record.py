# Drives the LIVE app (real Qloo data) and records it; writes timeline.json with when each narration segment starts.
import json, time, sys, subprocess
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'https://makan-kaki-production.up.railway.app/'
segs = {s['id']: s for s in json.load(open('segments.json'))}
for s in segs.values():
    s['dur'] = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f"{s['id']}.mp3"], capture_output=True, text=True).stdout)
timeline = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir='raw', record_video_size={'width': 1280, 'height': 720})
    pg = ctx.new_page(); pg.set_default_timeout(90000); T0 = time.time()
    pg.goto(URL); pg.wait_for_selector('.member'); pg.wait_for_timeout(800)
    def seg(id):
        st = time.time(); timeline.append({'id': id, 't': st - T0}); return st + segs[id]['dur'] + 0.4
    def until(t):
        r = t - time.time()
        if r > 0: pg.wait_for_timeout(int(r * 1000))
    def scroll(sel, block='start'):
        pg.evaluate(f"document.querySelector('{sel}').scrollIntoView({{behavior:'smooth', block:'{block}'}})"); pg.wait_for_timeout(1000)
    def by(px, wait=1200):
        pg.evaluate(f"window.scrollBy({{top:{px}, behavior:'smooth'}})"); pg.wait_for_timeout(wait)

    end = seg('intro'); pg.wait_for_timeout(4000)
    for i, m in enumerate(pg.query_selector_all('.member')):
        m.scroll_into_view_if_needed(); m.hover(); pg.wait_for_timeout(2500)
    until(end)
    end = seg('setup'); scroll('#setup'); pg.hover('#court'); pg.wait_for_timeout(2500); pg.hover('#endTime'); pg.wait_for_timeout(2000)
    pg.query_selector_all('.member .cravings')[0].hover(); pg.wait_for_timeout(2500)
    pg.query_selector_all('.member .diet')[2].hover(); pg.wait_for_timeout(2000)
    scroll('#go', 'center'); until(end)
    end = seg('run'); pg.click('#go'); pg.wait_for_selector('#cards article'); pg.wait_for_timeout(500)
    scroll('#trace', 'center'); until(end)
    end = seg('results'); scroll('#results'); pg.wait_for_timeout(2500); by(250, 3000)
    pg.screenshot(path='../screenshot.png'); until(end)
    end = seg('guard'); scroll('#rejected', 'start'); pg.wait_for_timeout(8000); by(250, 6000); until(end)
    end = seg('trace'); scroll('#traceBox', 'start'); pg.wait_for_timeout(3500)
    scroll('#setup'); pg.select_option('#court', 'georgetown'); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#cards').innerHTML=''"); scroll('#go', 'center'); pg.click('#go')
    pg.wait_for_selector('#cards article'); pg.wait_for_timeout(500); scroll('#traceBox', 'start'); pg.wait_for_timeout(3000); until(end)
    end = seg('outro'); scroll('#results'); pg.wait_for_timeout(4000); by(300, 3000)
    pg.evaluate("window.scrollTo({top:0, behavior:'smooth'})"); until(end)
    pg.wait_for_timeout(500); total = time.time() - T0
    vid = pg.video.path(); ctx.close(); b.close()
json.dump({'timeline': timeline, 'total': total, 'video': str(vid)}, open('timeline.json', 'w'), indent=1)
print(json.dumps(timeline), total, vid)
