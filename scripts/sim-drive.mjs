#!/usr/bin/env node
// Drive the booted iOS Simulator along a polyline.
//
// Usage:
//   node scripts/sim-drive.mjs                       # default eco polyline @ 12 m/s
//   node scripts/sim-drive.mjs '<encoded-polyline>'  # custom polyline @ 12 m/s
//   node scripts/sim-drive.mjs '<polyline>' 20       # custom polyline @ 20 m/s
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

const [, , polyArg, speedArg] = process.argv;
const encoded = polyArg ?? DEFAULT_POLYLINE;
const speed = speedArg ? Number(speedArg) : 12;

if (!Number.isFinite(speed) || speed <= 0) {
  console.error(`Invalid speed: ${speedArg}`);
  process.exit(1);
}

const decoded = polyline.decode(encoded);
const sampled = sample(decoded, MAX_WAYPOINTS);
const coordArgs = sampled.map(([lat, lng]) => `${lat},${lng}`);

console.log(
  `Driving simulator: ${sampled.length} waypoints @ ${speed} m/s (~${(speed * 3.6).toFixed(0)} km/h)`,
);
console.log('Stop with: xcrun simctl location booted clear');

const args = [
  'simctl',
  'location',
  'booted',
  'start',
  '--speed',
  String(speed),
  '--interval',
  '1',
  ...coordArgs,
];

const child = spawn('xcrun', args, { stdio: 'inherit' });

const stop = () => {
  spawn('xcrun', ['simctl', 'location', 'booted', 'clear'], { stdio: 'inherit' });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

child.on('exit', (code) => process.exit(code ?? 0));
