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
//
// Stop early with: xcrun simctl location booted clear

import { spawn } from 'node:child_process';
import polyline from '@mapbox/polyline';

const DEFAULT_POLYLINE =
  'cgtQ{tckR?~@?fL@zC@vC@bJ@`@?Z?D?l@?n@?z@?hD@vBAlB?fD?D?bB@d@?N?V@T@P@H@DDLFNJPpCvC^p@Pl@DZ@H@FBNA^S?M?_B?qA@gAAiBAk@C{@Me@MuCy@sAa@u@Ws@Wk@Oc@Ie@Eo@Cw@?{GEmLAG?wH?kj@CsRA_JA_J@}DBsB@yBFsIAw@B[B]JYL_@TOLe@b@Sb@q@fAw@pA]h@o@x@c@Zk@X}@XmANk@@o@B[K]WQYI]?]DQHWPUJKVOVGb@?r@BpA@`A?l@?b@E\\Gz@[n@e@\\e@Zm@f@a@~DcJn@oCJi@RWn@wFj@wFdBqOJ_B?m@@yDCsD?q@[wAAWEkEAqBCwBAcAA[AGISKQUOSGOAI?I?ODIBKFIFyDfEYLYDWAUI}CiBqBmAe@UQKWKYMOAa@GsGDqA?aBFmAAg@?MAOAcACKAKAA?IAMAQAe@GYC[?wCAmBAeA?oAAcC@gB?yBA{O?oD?_C@{AAk@CcAMw@Qe@QqBaAi@YMIiHqD}JgF]AW@SDW?WEQOMMMQGWGUU_@aCoAIEo@I{ASmFu@mCa@y@MsAQC?AAUCGAG?I?KEIECCCCDWL{@J_APqAiAOq@Ts@Tk@gBg@wA_Bw@m@[a@SqAo@aBy@cAi@o@[MIa@SyAaAqB}AwBeBaCiBm@e@k@c@k@c@g@_@vBqCpBiCHK';

const MAX_WAYPOINTS = 100;

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
    process.once('SIGINT',  () => child.kill('SIGINT'));
    process.once('SIGTERM', () => child.kill('SIGTERM'));
    child.on('exit', (code) =>
      code === 0 || code === null ? resolve() : reject(new Error(`simctl exited ${code}`)),
    );
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

const argv  = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const polyArg  = positional[0];
const speedArg = positional[1];
const encoded  = polyArg ?? DEFAULT_POLYLINE;

if (flags.has('--phases')) {
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
