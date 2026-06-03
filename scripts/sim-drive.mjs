#!/usr/bin/env node
// Drive the booted iOS Simulator along a polyline.
//
// Usage:
//   node scripts/sim-drive.mjs                       # default eco polyline @ 12 m/s
//   node scripts/sim-drive.mjs '<encoded-polyline>'  # custom polyline @ 12 m/s
//   node scripts/sim-drive.mjs '<polyline>' 20       # custom polyline @ 20 m/s
//   node scripts/sim-drive.mjs --phases              # phased drive that triggers
//                                                    # ML hard_brake / hard_accel
//                                                    # alerts (default polyline)
//   node scripts/sim-drive.mjs --phases '<polyline>' # phased drive on custom poly
//   node scripts/sim-drive.mjs --control             # live speed control via
//                                                    # browser at http://localhost:7777
//   node scripts/sim-drive.mjs --control '<poly>'    # control mode on custom poly
//
// Stop early with: Ctrl-C  (or: xcrun simctl location booted clear)

import { spawn } from 'node:child_process';
import http from 'node:http';
import polyline from '@mapbox/polyline';

const DEFAULT_POLYLINE =
  'cgtQ{tckR?~@?fL@zC@vC@bJ@`@?Z?D?l@?n@?z@?hD@vBAlB?fD?D?bB@d@?N?V@T@P@H@DDLFNJPpCvC^p@Pl@DZ@H@FBNA^S?M?_B?qA@gAAiBAk@C{@Me@MuCy@sAa@u@Ws@Wk@Oc@Ie@Eo@Cw@?{GEmLAG?wH?kj@CsRA_JA_J@}DBsB@yBFsIAw@B[B]JYL_@TOLe@b@Sb@q@fAw@pA]h@o@x@c@Zk@X}@XmANk@@o@B[K]WQYI]?]DQHWPUJKVOVGb@?r@BpA@`A?l@?b@E\\Gz@[n@e@\\e@Zm@f@a@~DcJn@oCJi@RWn@wFj@wFdBqOJ_B?m@@yDCsD?q@[wAAWEkEAqBCwBAcAA[AGISKQUOSGOAI?I?ODIBKFIFyDfEYLYDWAUI}CiBqBmAe@UQKWKYMOAa@GsGDqA?aBFmAAg@?MAOAcACKAKAA?IAMAQAe@GYC[?wCAmBAeA?oAAcC@gB?yBA{O?oD?_C@{AAk@CcAMw@Qe@QqBaAi@YMIiHqD}JgF]AW@SDW?WEQOMMMQGWGUU_@aCoAIEo@I{ASmFu@mCa@y@MsAQC?AAUCGAG?I?KEIECCCCDWL{@J_APqAiAOq@Ts@Tk@gBg@wA_Bw@m@[a@SqAo@aBy@cAi@o@[MIa@SyAaAqB}AwBeBaCiBm@e@k@c@k@c@g@_@vBqCpBiCHK';

const MAX_WAYPOINTS = 100;

const CONTROL_PORT = 7777;
const CONTROL_URL  = `http://127.0.0.1:${CONTROL_PORT}`;

// Speed presets for --control mode. Flipping between hard_accel and hard_brake
// produces |Δ| ≫ 2 m/s² across an ML window — well past the hard_accel /
// hard_brake feature gates, so the window classifies as 'aggressive'.
const PRESETS = {
  idle:        1,
  cruise:     8,
  hard_accel: 22,
  hard_brake:  4,
};

function sample(coords, max) {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Insert linearly-interpolated waypoints so consecutive coords are no more
// than `stepM` metres apart. simctl emits one location update per
// `--interval` seconds while traversing the path; with stepM ≈ speed × 1 s,
// the simulator naturally settles into one emission per waypoint at 1 Hz.
// Without this, a 2-waypoint segment finishes in <100 ms with a single
// emission, defeating the point of phased driving.
function densify(coords, stepM) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = haversineMeters(a, b);
    const n = Math.max(1, Math.floor(d / stepM));
    for (let j = 1; j < n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    out.push(b);
  }
  return out;
}

function runStart(speed, coordPairs) {
  const coordArgs = coordPairs.map(([lat, lng]) => `${lat},${lng}`);
  const args = [
    'simctl', 'location', 'booted', 'start',
    '--speed', String(speed),
    '--interval', '1',
    ...coordArgs,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('xcrun', args, { stdio: 'inherit' });
    // Remove these listeners on exit — runControlledDrive invokes runStart many
    // times and would otherwise hit Node's MaxListenersExceededWarning.
    const onSigint  = () => child.kill('SIGINT');
    const onSigterm = () => child.kill('SIGTERM');
    process.once('SIGINT',  onSigint);
    process.once('SIGTERM', onSigterm);
    child.on('exit', (code) => {
      process.off('SIGINT',  onSigint);
      process.off('SIGTERM', onSigterm);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`simctl exited ${code}`));
    });
  });
}

function clearLocation() {
  return new Promise((resolve) => {
    const child = spawn('xcrun', ['simctl', 'location', 'booted', 'clear'], { stdio: 'inherit' });
    child.on('exit', () => resolve());
  });
}

async function runConstantDrive(encoded, speed) {
  const decoded  = polyline.decode(encoded);
  const sampled  = sample(decoded, MAX_WAYPOINTS);

  console.log(
    `Driving simulator: ${sampled.length} waypoints @ ${speed} m/s (~${(speed * 3.6).toFixed(0)} km/h)`,
  );
  console.log('Stop with: xcrun simctl location booted clear');

  await runStart(speed, sampled);
}

async function runPhasedDrive(encoded) {
  const decoded = polyline.decode(encoded);
  const sampled = sample(decoded, MAX_WAYPOINTS);
  if (sampled.length < 6) {
    throw new Error('phased mode needs at least 6 sampled waypoints');
  }

  // Speed transitions:
  //   cruise → brake : 17 → 4  ⇒ Δ = -13 m/s/s  (hard_brake threshold is -2)
  //   brake  → cruise: 4  → 17 ⇒ Δ = +13 m/s/s  (hard_accel threshold is +2)
  // Both transitions land far past the ML detector's ±2 m/s² gates and
  // produce hard_brake_n / hard_accel_n features that classify the window
  // as label=2 (aggressive) with high confidence.
  const CRUISE_SPEED = 17;
  const BRAKE_SPEED  = 4;

  // Each phase consumes a slice of the sampled polyline (~280 m per pair).
  // Cruise/brake count = 1 means one polyline-pair worth of distance.
  // Cruise: ~280 m at 17 m/s ≈ 16 s of 1 Hz samples
  // Brake : ~280 m at 4 m/s  ≈ 70 s of 1 Hz samples
  const phases = [
    { kind: 'cruise', count: 1 },
    { kind: 'brake',  count: 1 },
    { kind: 'cruise', count: 1 },
    { kind: 'brake',  count: 1 },
    { kind: 'cruise', count: -1 },
  ];

  console.log(`Phased drive — ${CRUISE_SPEED} m/s cruise alternated with ${BRAKE_SPEED} m/s brakes.`);
  console.log(`  Δspeed = ${CRUISE_SPEED - BRAKE_SPEED} m/s/s on each transition (ML threshold ±2).`);
  console.log('  Stop early with Ctrl-C or: xcrun simctl location booted clear');

  let cursor = 0;
  for (const p of phases) {
    const end = p.count === -1
      ? sampled.length
      : Math.min(cursor + p.count + 1, sampled.length);
    if (end - cursor < 2) break;

    const slice = sampled.slice(cursor, end);
    cursor = end - 1;

    const speed = p.kind === 'cruise' ? CRUISE_SPEED : BRAKE_SPEED;
    // Densify so each emitted 1 Hz sample lands on a real waypoint.
    const dense = densify(slice, speed);

    let dist = 0;
    for (let i = 1; i < slice.length; i++) {
      dist += haversineMeters(slice[i - 1], slice[i]);
    }
    const durSec = (dist / speed).toFixed(0);
    console.log(`  ${p.kind.padEnd(6)} : ${dense.length} waypoints @ ${speed} m/s over ~${dist.toFixed(0)} m → ~${durSec} s`);
    await runStart(speed, dense);
  }

  console.log('Phased drive done. Clearing simulated location.');
  await clearLocation();
}

// --- Control mode (live speed control via browser) ---

const CONTROL_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>sim-drive control</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0;
         padding: 28px; background: #0f172a; color: #f1f5f9; min-height: 100vh; }
  h1 { font-size: 13px; margin: 0 0 6px; color: #94a3b8; font-weight: 500;
       text-transform: uppercase; letter-spacing: 1.5px; }
  .speed { font-size: 84px; font-weight: 700; margin: 0 0 4px; letter-spacing: -2px; }
  .speed small { font-size: 22px; color: #64748b; font-weight: 400; margin-left: 10px; }
  .kmh { font-size: 16px; color: #64748b; margin: 0 0 28px; }
  .section { font-size: 11px; color: #64748b; text-transform: uppercase;
             letter-spacing: 1.3px; margin: 18px 0 10px; font-weight: 600; }
  .row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px;
         max-width: 520px; margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 520px; }
  button { padding: 22px 12px; font-size: 17px; font-weight: 700; border: 0;
           border-radius: 14px; color: white; cursor: pointer; transition: transform .06s; }
  button:active { transform: scale(0.96); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .b-up         { background: #16a34a; }
  .b-down       { background: #ea580c; }
  .b-up.big     { background: #15803d; }
  .b-down.big   { background: #b45309; }
  .b-cruise     { background: #2563eb; }
  .b-idle       { background: #475569; }
  .b-hard_accel { background: #ea580c; }
  .b-hard_brake { background: #dc2626; }
  .b-stop       { grid-column: 1 / -1; background: #334155; }
  .delta { font-size: 12px; opacity: 0.85; display: block; margin-top: 4px; font-weight: 500; }
</style>
</head>
<body>
  <h1>sim-drive control</h1>
  <p class="speed"><span id="cur">1</span><small>m/s</small></p>
  <p class="kmh"><span id="kmh">4</span> km/h</p>

  <p class="section">Adjust</p>
  <div class="row">
    <button class="b-down big" data-delta="-5">−5<span class="delta">m/s</span></button>
    <button class="b-down"     data-delta="-1">−1<span class="delta">m/s</span></button>
    <button class="b-up"       data-delta="1">+1<span class="delta">m/s</span></button>
    <button class="b-up big"   data-delta="5">+5<span class="delta">m/s</span></button>
  </div>

  <p class="section">Quick set</p>
  <div class="grid">
    <button class="b-idle"       data-preset="idle">Idle<span class="delta">1 m/s</span></button>
    <button class="b-cruise"     data-preset="cruise">Cruise<span class="delta">8 m/s</span></button>
    <button class="b-hard_brake" data-preset="hard_brake">Hard Brake<span class="delta">4 m/s</span></button>
    <button class="b-hard_accel" data-preset="hard_accel">Hard Accel<span class="delta">22 m/s</span></button>
    <button class="b-stop"       data-stop="1">Stop drive</button>
  </div>
<script>
const cur = document.getElementById('cur');
const kmh = document.getElementById('kmh');
function setDisplay(speed) {
  cur.textContent = speed;
  kmh.textContent = Math.round(speed * 3.6);
}
async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? r.json() : null;
}
async function applyPreset(preset) {
  const j = await post('/speed', { preset });
  if (j?.ok) setDisplay(j.speed);
}
async function applyDelta(delta) {
  const j = await post('/speed', { delta });
  if (j?.ok) setDisplay(j.speed);
}
async function stop() {
  await post('/stop');
  cur.textContent = '0';
  kmh.textContent = '0';
}
async function refresh() {
  try {
    const r = await fetch('/state');
    if (!r.ok) return;
    const j = await r.json();
    if (typeof j.speed_mps === 'number') setDisplay(j.speed_mps);
  } catch {}
}
for (const btn of document.querySelectorAll('button[data-preset]')) {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
}
for (const btn of document.querySelectorAll('button[data-delta]')) {
  btn.addEventListener('click', () => applyDelta(Number(btn.dataset.delta)));
}
document.querySelector('button[data-stop]').addEventListener('click', stop);
refresh();
</script>
</body>
</html>`;

function startControlServer(state) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(CONTROL_PAGE);
      return;
    }
    if (req.method === 'POST' && req.url === '/speed') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const { preset, delta, speed } = JSON.parse(body || '{}');

        // Speed clamp: 0 m/s = stopped, 40 m/s = ~144 km/h. Beyond that the
        // ML windows can't keep up and the simulator visibly jumps between
        // waypoints.
        const SPEED_MIN = 0;
        const SPEED_MAX = 40;
        const clamp = (v) => Math.max(SPEED_MIN, Math.min(SPEED_MAX, v));

        let nextSpeed;
        let source;
        if (typeof speed === 'number') {
          nextSpeed = clamp(speed);
          source = `set=${speed}`;
        } else if (typeof delta === 'number') {
          nextSpeed = clamp(state.speed + delta);
          source = `delta=${delta >= 0 ? '+' : ''}${delta}`;
        } else if (preset && preset in PRESETS) {
          nextSpeed = PRESETS[preset];
          source = preset;
        } else {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'need preset, delta, or speed' }));
          return;
        }

        state.speed = nextSpeed;
        // Resuming after a stop clears the stop flag — useful when the user
        // taps ±/preset after pressing Stop.
        if (state.stopped && nextSpeed > 0) state.stopped = false;
        console.log(`[control] speed → ${state.speed} m/s (${source})`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, speed: state.speed }));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad json' }));
      }
      return;
    }
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, {
        'content-type':                'application/json',
        'access-control-allow-origin': '*',
      });
      res.end(JSON.stringify({
        speed_mps: state.speed,
        preset:    Object.entries(PRESETS).find(([, v]) => v === state.speed)?.[0] ?? null,
        stopped:   !!state.stopped,
      }));
      return;
    }
    if (req.method === 'POST' && req.url === '/stop') {
      state.stopped = true;
      console.log('[control] stop requested');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(CONTROL_PORT, '127.0.0.1');
  return server;
}

async function runControlledDrive(encoded) {
  const decoded   = polyline.decode(encoded);
  const waypoints = sample(decoded, MAX_WAYPOINTS);

  // state is mutated by the HTTP handlers; the drive loop re-reads it between
  // every sub-slice so button presses take effect within SECONDS_PER_SLICE.
  const state  = { speed: PRESETS.idle, stopped: false };
  const server = startControlServer(state);

  // First Ctrl-C: stop the outer loop gracefully. Second Ctrl-C: hard exit.
  const onSigint = () => {
    if (state.stopped) {
      console.log('\nForce exit.');
      process.exit(130);
    }
    console.log('\nStopping controlled drive… (press Ctrl-C again to force quit)');
    state.stopped = true;
  };
  process.on('SIGINT',  onSigint);
  process.on('SIGTERM', onSigint);

  console.log(`Control mode — open ${CONTROL_URL} in a browser to drive.`);
  console.log(`Initial speed: ${state.speed} m/s.  Stop with the button or Ctrl-C.`);

  // Each slice spawns a fresh `simctl start --speed <state.speed>`, so this is
  // also the maximum lag between pressing a button on the control UI and the
  // simulator actually driving at the new speed. Longer slices give simctl more
  // 1 Hz emissions per spawn, which the speedometer's Haversine fallback needs
  // to produce a stable reading.
  const SECONDS_PER_SLICE = 5;

  outer: for (let i = 0; i < waypoints.length - 1; i++) {
    if (state.stopped) break outer;
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segMeters = haversineMeters(a, b);

    let traveled = 0;
    let prev = a;
    while (traveled < segMeters - 0.5) {
      if (state.stopped) break outer;
      const speed       = state.speed;
      const chunkMeters = Math.min(speed * SECONDS_PER_SLICE, segMeters - traveled);
      const t           = (traveled + chunkMeters) / segMeters;
      const next = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      const dense = densify([prev, next], speed);
      await runStart(speed, dense);
      traveled += chunkMeters;
      prev = next;
    }
  }

  process.off('SIGINT',  onSigint);
  process.off('SIGTERM', onSigint);
  server.close();
  await clearLocation();
  console.log('Controlled drive done.');
}

const argv  = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const polyArg  = positional[0];
const speedArg = positional[1];
const encoded  = polyArg ?? DEFAULT_POLYLINE;

if (flags.has('--control')) {
  runControlledDrive(encoded).catch((e) => {
    console.error('controlled drive failed:', e.message);
    process.exit(1);
  });
} else if (flags.has('--phases')) {
  runPhasedDrive(encoded).catch((e) => {
    console.error('phased drive failed:', e.message);
    process.exit(1);
  });
} else {
  const speed = speedArg ? Number(speedArg) : 12;
  if (!Number.isFinite(speed) || speed <= 0) {
    console.error(`Invalid speed: ${speedArg}`);
    process.exit(1);
  }
  runConstantDrive(encoded, speed).catch((e) => {
    console.error('drive failed:', e.message);
    process.exit(1);
  });
}

process.on('SIGINT',  () => { void clearLocation(); });
process.on('SIGTERM', () => { void clearLocation(); });
