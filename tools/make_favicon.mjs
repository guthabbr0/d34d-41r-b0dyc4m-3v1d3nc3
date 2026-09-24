// Rasterises favicon.svg (headless Chromium) into
//   favicon.ico           16, 32 and 48 px PNG entries (the file browsers request by themselves)
//   apple-touch-icon.png  180 px, full-bleed square (iOS applies its own corner mask)
// The SVG adapts its own detail to the drawn size (media query inside it), so each size is
// rendered from the same file. Outputs are committed; the site build only copies them.
//   node tools/make_favicon.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const svg = fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8');
const dataUri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');

const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {});
async function render(source, size, background = 'transparent') {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:${background}"><img src="${dataUri(source)}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  const png = await page.screenshot({ omitBackground: background === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return png;
}

// ICO container with PNG payloads (supported by every current browser and Windows Vista+)
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map(e => e.png)]);
}

const entries = [];
for (const size of [16, 32, 48]) entries.push({ size, png: await render(svg, size) });
fs.writeFileSync(path.join(root, 'favicon.ico'), ico(entries));
// full-bleed square for iOS home screens (no transparent corners, which iOS would fill with black)
const square = svg.replace(/(<rect class="tile"[^>]*?)rx="\d+"/, '$1rx="0"');
fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), await render(square, 180, '#07090c'));
await browser.close();
for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) console.log(f.padEnd(22), (fs.statSync(path.join(root, f)).size / 1024).toFixed(1), 'KB');
