// Headless test harness: serves the repo, opens the game in Chromium (SwiftShader WebGL),
// runs an optional scripted sequence and saves screenshots.
//   node tools/shot.mjs --url "index.html?debug=1" --out shot.png [--w 1280 --h 720] [--wait 8000]
//        [--mobile] [--eval "js"] [--steps steps.json] [--root dist/web]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
// --root dist/web serves the built site instead of the repository
const root = args.root ? path.resolve(args.root) : path.dirname(path.dirname(new URL(import.meta.url).pathname));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { if (!args.quiet404) console.log('[server 404] ' + p); res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const W = +(args.w || 1280), H = +(args.h || 720);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  hasTouch: !!args.mobile, isMobile: !!args.mobile,
  userAgent: args.mobile ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' : undefined,
});
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (!args.quiet || m.type() === 'error') console.log(t); });
page.on('response', r => { if (r.status() >= 400) console.log('[http ' + r.status() + '] ' + r.url()); });
page.on('pageerror', e => { console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
const url = `http://127.0.0.1:${port}/${args.url || 'index.html'}`;
await page.goto(url);
const t0 = Date.now();
const out = args.out || 'shot.png';
try {
  await page.waitForFunction(() => window.__DA && window.__DA.ready, null, { timeout: +(args.timeout || 120000) });
} catch (e) { console.log('ready timeout'); }
console.log('ready after', Date.now() - t0, 'ms');
if (args.steps) {
  const steps = JSON.parse(fs.readFileSync(args.steps, 'utf8'));
  let n = 0;
  for (const s of steps) {
    if (s.evalFile) await page.evaluate(fs.readFileSync(s.evalFile, 'utf8'));
    if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); }
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.key) await page.keyboard.press(s.key);
    if (s.down) await page.keyboard.down(s.down);
    if (s.up) await page.keyboard.up(s.up);
    if (s.click) await page.mouse.click(s.click[0], s.click[1]);
    if (s.tap) await page.touchscreen.tap(s.tap[0], s.tap[1]);
    if (s.shot) { await page.screenshot({ path: s.shot }); console.log('saved', s.shot); n++; }
  }
} else {
  if (args.eval) { const r = await page.evaluate(args.eval); console.log('eval ->', JSON.stringify(r)); }
  await page.waitForTimeout(+(args.wait || 3000));
  await page.screenshot({ path: out });
  console.log('saved', out);
}
const stats = await page.evaluate(() => window.__DA && window.__DA.stats ? window.__DA.stats() : null).catch(() => null);
if (stats) console.log('stats', JSON.stringify(stats));
await browser.close();
server.close();
