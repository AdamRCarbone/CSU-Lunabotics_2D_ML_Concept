"""Live training dashboard — HTTP server + state management.

Serves a single-page dashboard at http://localhost:8767 that polls /api/state
every 2 seconds and renders live loss curves + per-epoch metrics.

Usage:
    import dashboard
    dashboard.start(port=8767)
    dashboard.update(epoch=1, train_loss=[0.5], ...)
"""

import http.server
import json
import threading

_state: dict = {
    'epoch': 0, 'epochs': 0,
    'train_loss': [], 'val_loss': [],
    'train_mag':  [], 'val_mag':  [],
    'lr': [],
    'best_val': None,
    'no_improve': 0, 'patience': 20,
    'status': 'starting',
    'device': '',
    'elapsed_s': 0,
    'stage': 0, 'stage_name': '',
}
_state_lock = threading.Lock()


def update(**kw):
    """Thread-safe update of dashboard state. Call once per epoch."""
    with _state_lock:
        _state.update(kw)


_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>OCTANE Nav Training</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080808;color:#e0e0e0;font-family:'Courier New',monospace;font-size:13px}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;
       border-bottom:1px solid #1e1e1e;background:#0d0d0d}
.logo{color:#00e5ff;font-size:1.1rem;font-weight:bold;letter-spacing:.1em}
.device-badge{background:#1a2a1a;color:#4caf50;border:1px solid #2a4a2a;
              padding:2px 10px;border-radius:3px;font-size:.75rem}
.status-badge{padding:2px 10px;border-radius:3px;font-size:.75rem;border:1px solid #333}
.status-badge.running{background:#0a1a2a;color:#00e5ff;border-color:#1e3a5a}
.status-badge.done{background:#1a2a1a;color:#4caf50;border-color:#2a4a2a}
.status-badge.stopped{background:#2a1a1a;color:#ef5350;border-color:#4a2a2a}
main{display:grid;grid-template-columns:1fr 260px;gap:12px;padding:16px;
     height:calc(100vh - 53px)}
.chart-panel{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;
             padding:14px;display:flex;flex-direction:column;gap:8px}
.panel-label{font-size:.7rem;color:#555;letter-spacing:.08em;text-transform:uppercase}
canvas{display:block}
.side{display:flex;flex-direction:column;gap:12px}
.metric-panel{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;padding:14px}
.metric-row{display:flex;justify-content:space-between;align-items:baseline;
            padding:4px 0;border-bottom:1px solid #141414}
.metric-row:last-child{border-bottom:none}
.metric-key{color:#666;font-size:.75rem}
.metric-val{color:#00e5ff;font-size:.9rem}
.metric-val.best{color:#ffd700}
.metric-val.warn{color:#ff9800}
.metric-val.good{color:#4caf50}
.metric-val.stage{color:#bb86fc;font-size:.78rem}
.progress-bar{height:3px;background:#1a1a1a;border-radius:2px;margin-top:8px}
.progress-fill{height:100%;background:#00e5ff;border-radius:2px;transition:width .5s}
</style>
</head>
<body>
<header>
  <span class="logo">&#9672; OCTANE</span>
  <span style="color:#444">NAVIGATION TRAINING</span>
  <span class="device-badge" id="deviceBadge">&#8212;</span>
  <span class="status-badge running" id="statusBadge">STARTING</span>
  <span style="margin-left:auto;color:#444;font-size:.75rem" id="etaText">&#8212;</span>
</header>
<main>
  <div class="chart-panel">
    <div class="panel-label">Loss curves</div>
    <canvas id="chart"></canvas>
    <div style="display:flex;gap:20px;font-size:.7rem;color:#555;margin-top:4px">
      <span><span style="color:#00e5ff">&#9632;</span> Train</span>
      <span><span style="color:#ff9800">&#9632;</span> Val</span>
      <span style="margin-left:auto" id="epochLabel">epoch 0 / 0</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
  </div>
  <div class="side">
    <div class="metric-panel">
      <div class="panel-label" style="margin-bottom:8px">Current epoch</div>
      <div class="metric-row"><span class="metric-key">Stage</span><span class="metric-val stage" id="mStage">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Train loss</span><span class="metric-val" id="mTrain">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Val loss</span><span class="metric-val" id="mVal">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Best val</span><span class="metric-val best" id="mBest">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Motor mag (val)</span><span class="metric-val" id="mMag">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Learning rate</span><span class="metric-val" id="mLR">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">No-improve</span><span class="metric-val" id="mNoImprove">&#8212;</span></div>
      <div class="metric-row"><span class="metric-key">Elapsed</span><span class="metric-val" id="mElapsed">&#8212;</span></div>
    </div>
  </div>
</main>
<script>
const chart = document.getElementById('chart');
const ctx   = chart.getContext('2d');
let state = {};

function resize() {
  const p = chart.parentElement;
  chart.width  = p.clientWidth - 28;
  chart.height = Math.max(200, p.clientHeight - 100);
}
window.addEventListener('resize', () => { resize(); draw(); });
resize();

function fmt(v, digits=4) { return v == null ? '—' : v.toFixed(digits); }
function fmtTime(s) {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function draw() {
  const W = chart.width, H = chart.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#080808';
  ctx.fillRect(0,0,W,H);

  const tl = state.train_loss || [], vl = state.val_loss || [];
  if (tl.length < 2) {
    ctx.fillStyle = '#333'; ctx.font = '12px monospace';
    ctx.fillText('Waiting for data…', W/2-60, H/2);
    return;
  }

  const PAD = {l:50, r:20, t:16, b:30};
  const gW = W - PAD.l - PAD.r;
  const gH = H - PAD.t - PAD.b;
  const n  = tl.length;
  const maxE = state.epochs || n;

  const allVals = [...tl, ...vl].filter(v => v > 0);
  const minY = Math.min(...allVals) * 0.95;
  const maxY = Math.max(...allVals) * 1.05;

  function toX(i) { return PAD.l + (i / Math.max(maxE-1, 1)) * gW; }
  function toY(v) { return PAD.t + (1 - (v-minY)/(maxY-minY)) * gH; }

  // Grid
  ctx.strokeStyle = '#181818'; ctx.lineWidth = 1;
  for (let i=0; i<=4; i++) {
    const y = PAD.t + i * gH / 4;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l+gW, y); ctx.stroke();
    const v = maxY - i*(maxY-minY)/4;
    ctx.fillStyle = '#444'; ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(4), PAD.l-4, y+3);
  }

  // Axes
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH);
  ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();

  // Best val line
  if (state.best_val != null) {
    const by = toY(state.best_val);
    ctx.strokeStyle = 'rgba(255,215,0,0.25)'; ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.l,by); ctx.lineTo(PAD.l+gW,by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd700'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`best ${state.best_val.toFixed(4)}`, PAD.l+4, by-3);
  }

  function drawLine(data, color) {
    if (data.length < 2) return;
    ctx.beginPath();
    data.forEach((v,i) => {
      const x = toX(i), y = toY(v);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.stroke();
    const lx = toX(data.length-1), ly = toY(data[data.length-1]);
    ctx.beginPath(); ctx.arc(lx,ly,3,0,2*Math.PI);
    ctx.fillStyle = color; ctx.fill();
  }

  drawLine(tl, '#00e5ff');
  drawLine(vl, '#ff9800');

  // X axis labels
  ctx.fillStyle = '#444'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(maxE/6));
  for (let i=0; i<=maxE; i+=step) {
    ctx.fillText(i, toX(i), PAD.t+gH+14);
  }
}

function update(s) {
  state = s;
  const epoch  = s.epoch || 0;
  const epochs = s.epochs || 0;
  const pct    = epochs > 0 ? (epoch / epochs * 100).toFixed(1) : 0;

  document.getElementById('deviceBadge').textContent  = s.device || '—';
  document.getElementById('epochLabel').textContent   = `epoch ${epoch} / ${epochs}`;
  document.getElementById('progressFill').style.width = pct + '%';

  // Stage
  const sname = s.stage_name || '';
  document.getElementById('mStage').textContent =
    s.stage != null && sname ? `${s.stage} — ${sname}` : '—';

  const tl = s.train_loss || [], vl = s.val_loss || [];
  document.getElementById('mTrain').textContent = fmt(tl[tl.length-1]);
  document.getElementById('mVal').textContent   = fmt(vl[vl.length-1]);
  document.getElementById('mBest').textContent  = fmt(s.best_val);

  // Motor magnitude (val)
  const vm = s.val_mag || [];
  document.getElementById('mMag').textContent = vm.length ? vm[vm.length-1].toFixed(3) : '—';

  document.getElementById('mLR').textContent =
    s.lr?.length ? s.lr[s.lr.length-1].toExponential(2) : '—';

  const ni = s.no_improve ?? 0, pa = s.patience ?? 20;
  const noImpEl = document.getElementById('mNoImprove');
  noImpEl.textContent = `${ni} / ${pa}`;
  noImpEl.className   = 'metric-val' + (ni >= pa*0.7 ? ' warn' : ni === 0 ? ' good' : '');

  document.getElementById('mElapsed').textContent = fmtTime(s.elapsed_s || 0);

  // ETA
  if (epoch > 0 && epochs > epoch) {
    const per_ep = (s.elapsed_s || 0) / epoch;
    document.getElementById('etaText').textContent = `ETA ${fmtTime(per_ep * (epochs - epoch))}`;
  }

  const badge = document.getElementById('statusBadge');
  badge.textContent = (s.status || 'starting').toUpperCase();
  badge.className   = 'status-badge ' + (s.status === 'running' ? 'running'
                      : s.status === 'done' ? 'done' : 'stopped');
  draw();
}

async function poll() {
  try {
    const r = await fetch('/api/state');
    if (r.ok) update(await r.json());
  } catch(e) {}
  setTimeout(poll, 2000);
}

poll();
</script>
</body>
</html>"""


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def do_GET(self):
        if self.path.startswith('/api/state'):
            with _state_lock:
                body = json.dumps(_state).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
        else:
            body = _HTML.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)


def start(port: int = 8767):
    """Start the dashboard HTTP server on a daemon thread. Returns the server."""
    server = http.server.HTTPServer(('localhost', port), _Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server
