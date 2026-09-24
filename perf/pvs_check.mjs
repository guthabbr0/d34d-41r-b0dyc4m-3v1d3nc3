// Runs perf/pvs_check.js in the headless harness and prints the culprits (meshes the PVS would cull
// although a reachable camera can see them). Exit code 1 when any culprit is found.
//   node perf/pvs_check.mjs [--step 1.5] [--yaws 6] [--doors open|init]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const steps = [
  { wait: 500 },
  { eval: `window.__PVS_STEP = ${+opt('step', 1.5)}; window.__PVS_YAWS = ${+opt('yaws', 6)}; window.__PVS_DOORS = ${JSON.stringify(opt('doors', 'open'))}; true` },
  { eval: fs.readFileSync(path.join(here, 'pvs_check.js'), 'utf8') },
];
const tmp = path.join(here, '.pvs_steps.json');
fs.writeFileSync(tmp, JSON.stringify(steps));
const r = spawnSync('node', [path.join(here, '..', 'tools', 'shot.mjs'), '--url', 'index.html?auto=1&q=low', '--w', '320', '--h', '180', '--steps', tmp, '--quiet', '--timeout', '240000'], { encoding: 'utf8', maxBuffer: 64 << 20 });
fs.unlinkSync(tmp);
const line = (r.stdout || '').split('\n').filter(l => l.startsWith('eval -> {')).pop();
if (!line) { console.log(r.stdout, r.stderr); process.exit(2); }
const res = JSON.parse(line.slice(8));
console.log(`poses ${res.poses}, failing ${res.failures}, culprit meshes ${res.culprits}`);
console.log('poses per zone', JSON.stringify(res.perZone));
console.log('failing per zone', JSON.stringify(res.failZone));
for (const t of res.top) console.log(`${String(t.px).padStart(6)} px ${String(t.poses).padStart(4)} poses  from ${t.seenFrom.join(',')}  -> ${t.name} [${t.mat}] layer ${t.layer} tag ${t.zoneTag} centre ${t.c} r ${t.r} v${t.v} e.g. ${t.at}`);
process.exit(res.culprits ? 1 : 0);
