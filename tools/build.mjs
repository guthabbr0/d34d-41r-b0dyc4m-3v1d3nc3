// Bundles src/ into build/game.js (single IIFE, three.js included) and emits an
// artifact-ready page (dist/artifact.html) whose outer document tags are stripped.
import * as esbuild from 'esbuild';
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
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/artifact.html'), head.trim() + '\n' + body.trim() + '\n');
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
  emitArtifact();
}
