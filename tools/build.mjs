// Bundles src/ into build/game.js (single IIFE, three.js included), then emits
//  - dist/web/        the deployable static site (Vercel output directory, see vercel.json):
//                     index.html + content-hashed bundle + assets/, nothing else from the repo
//  - dist/artifact.html  an artifact-ready page whose outer document tags are stripped
import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev') || watch;

const opts = {
  entryPoints: [path.join(root, process.env.ENTRY || 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  outfile: path.join(root, 'build/game.js'),
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  define: { __DEV__: dev ? 'true' : 'false' },
  logLevel: 'info',
};

function emitArtifact() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  // The artifact host supplies <!doctype>, <html>, <head> and <body>; keep only their content.
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1]
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\s*/gi, '');   // the artifact host supplies its own icon
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/artifact.html'), head.trim() + '\n' + body.trim() + '\n');
}

// Static site: the bundle gets a content hash so it can be cached forever; index.html is rewritten
// to point at it and is the only file that must be revalidated on every visit.
function emitSite() {
  const out = path.join(root, 'dist/web');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'build'), { recursive: true });
  const js = fs.readFileSync(path.join(root, 'build/game.js'));
  const hash = crypto.createHash('sha256').update(js).digest('hex').slice(0, 10);
  const bundle = `build/game.${hash}.js`;
  fs.writeFileSync(path.join(out, bundle), js);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('src="build/game.js"')) throw new Error('index.html no longer loads build/game.js');
  fs.writeFileSync(path.join(out, 'index.html'), html.replace('src="build/game.js"', `src="${bundle}"`));
  for (const dir of ['tex', 'models', 'hdri', 'enemies']) fs.cpSync(path.join(root, 'assets', dir), path.join(out, 'assets', dir), { recursive: true });
  // recorded voice and sound packs, when present (docs/voice/HANDOFF.md)
  for (const dir of ['voice', 'sfx']) if (fs.existsSync(path.join(root, 'assets', dir))) fs.cpSync(path.join(root, 'assets', dir), path.join(out, 'assets', dir), { recursive: true });
  // icons (regenerate the raster ones with tools/make_favicon.mjs after editing favicon.svg)
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) fs.copyFileSync(path.join(root, f), path.join(out, f));
  let files = 0, bytes = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { files++; bytes += fs.statSync(f).size; } } };
  walk(out);
  console.log(`site: dist/web (${files} files, ${(bytes / 1048576).toFixed(1)} MB, bundle ${bundle})`);
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
  emitArtifact();
  emitSite();
}
