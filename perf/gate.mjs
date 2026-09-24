// Perf gate: fails (exit 1) when a gated phase of a webgl_probe report carries budget flags.
//   node perf/gate.mjs perf/run-N/report.json [--phases heavy,lot] [--baseline perf/run-M/report.json]
// With --baseline it also fails when a profiled function's self time in the heavy phase grew >20 %
// (ignoring functions under 5 ms, which are sampling noise at 0.5 ms intervals).
import fs from 'node:fs';

const args = process.argv.slice(2), opts = {}, pos = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i]; else pos.push(args[i]); }
const file = pos[0];
const opt = (k, d) => opts[k] ?? d;
if (!file) { console.log('usage: node perf/gate.mjs <report.json> [--phases heavy,lot] [--baseline <report.json>]'); process.exit(2); }

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const gated = opt('phases', 'heavy').split(',');
// Flags that SwiftShader produces on any machine and that do not describe the shipped game:
// long tasks come from the software rasteriser stalling the main thread on readbacks it schedules.
const IGNORE = [/long tasks/];
let failed = 0;
for (const p of report.phases) {
  if (!gated.includes(p.phase)) continue;
  const flags = p.flags.filter(f => !IGNORE.some(r => r.test(f)));
  console.log(`${p.phase}: ${flags.length ? 'FAIL' : 'ok'}  draws ${p.drawsPerFrame.toFixed(0)} · tris ${(p.trisPerFrame / 1000).toFixed(0)}k · JS p95 ${p.jsMsP95.toFixed(1)} ms · upload ${p.uploadKbPerFrame.toFixed(0)} KB · DOM ${p.domMutationsPerSec.toFixed(0)}/s`);
  for (const f of flags) console.log('   - ' + f);
  failed += flags.length;
}

const basePath = opt('baseline');
if (basePath) {
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const cur = report.phases.find(p => p.phase === 'heavy')?.profile, old = base.phases.find(p => p.phase === 'heavy')?.profile;
  if (cur && old) {
    const before = Object.fromEntries(old.top.map(t => [t.fn, t.ms]));
    for (const t of cur.top) {
      const b = before[t.fn];
      if (b !== undefined && b >= 5 && t.ms > b * 1.2 && !/^\((program|idle|garbage collector)\)/.test(t.fn)) {
        console.log(`   - self time grew ${b.toFixed(0)} -> ${t.ms.toFixed(0)} ms: ${t.fn}`);
        failed++;
      }
    }
  }
}
console.log(failed ? `perf gate: ${failed} problem(s)` : 'perf gate: pass');
process.exit(failed ? 1 : 0);
