// Imports the Ashworth enemy kit (docs/enemies/README.md) into DEAD AIR's compact runtime format.
//   node tools/import_enemy_kit.mjs [path/to/ashworth-enemy-kit-v2.0]
// Writes assets/enemies/:
//   manifest.json          joints, parts, clip tables, file offsets
//   <id>.<lod>.bin         geometry per level of detail (medium / low / far), see LAYOUT below
//   <id>.anim.bin          kit clips sampled at 30 fps (only the ones the game plays)
//   <id>_d.jpg             albedo atlas (sRGB)
//   <id>_nr.jpg            R,G = tangent normal xy, B = roughness (linear, 4:4:4 so channels never mix)
// The kit's own procedural builder generates the meshes, so the 'far' level (the kit ships low and
// medium only) comes from the same source; it is added by patching the builder's resolution table in a
// cached copy of the kit sources. Requires ffmpeg on PATH for texture transcoding.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const kit = path.resolve(process.argv[2] || path.join(root, 'ashworth-enemy-kit-v2.0'));
const out = path.join(root, 'assets/enemies');
const cache = path.join(root, 'tools/.cache/ashworth');

const kitManifest = JSON.parse(fs.readFileSync(path.join(kit, 'manifest.json'), 'utf8'));
if (kitManifest.schema !== 'ashworth-enemy-kit-v1' || kitManifest.atlas !== 'ashworth-atlas-v1') throw new Error('unexpected kit schema ' + kitManifest.schema);
const kitVersion = JSON.parse(fs.readFileSync(path.join(kit, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------- patched builder copy
fs.rmSync(cache, { recursive: true, force: true });
fs.cpSync(path.join(kit, 'src'), path.join(cache, 'src'), { recursive: true });
const geoFile = path.join(cache, 'src/core/geometry.js');
let geo = fs.readFileSync(geoFile, 'utf8');
const patch = (from, to) => {
  if (geo.split(from).length !== 2) throw new Error('kit builder changed, cannot patch: ' + from);
  geo = geo.replace(from, to);
};
patch('const RES={low:', 'const RES={far:{radial:6,long:6,head:18,headRows:12},low:');
patch("quality==='low'?6:10", "quality==='far'?3:quality==='low'?6:10");
fs.writeFileSync(geoFile, geo);
const imp = (f) => import(pathToFileURL(path.join(cache, 'src', f)).href);
const { ENEMY_IDS, loadDefinition } = await imp('enemies/registry.js');
const { buildGeometry } = await imp('core/geometry.js');
const { samplePose, CLIPS } = await imp('core/animations.js');
const { REGION_NAMES, FACE_LANDMARKS, REGIONS, ATLAS_SIZE } = await imp('core/atlas.js');

// clips the game plays (src/game/kitclips.js); everything else is procedural in src/game/anim.js
const CLIP_SET = { crawler: ['crawl', 'frenzy', 'windowLeap'], grandmother: ['caneWalk', 'caneAttack'] };
// bones stored per clip frame: the ones that map onto the game skeleton, plus the cane
const CLIP_BONES = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Jaw',
  'L_Clavicle', 'L_UpperArm', 'L_Forearm', 'L_Hand', 'R_Clavicle', 'R_UpperArm', 'R_Forearm', 'R_Hand',
  'L_Thigh', 'L_Calf', 'L_Foot', 'R_Thigh', 'R_Calf', 'R_Foot', 'Cane'];
const FPS = 30;
const LODS = ['medium', 'low', 'far'];

// LAYOUT of <id>.<lod>.bin, every section 4-byte aligned, offsets in the manifest:
//   pos  int16 x3   position / 32767 * posScale[axis]
//   nrm  int8  x4   normal xyz / 127, w unused
//   uv   uint16 x2  normalized, top-left origin (flipY false)
//   ji   uint8  x4  kit joint indices
//   jw   uint8  x4  skin weights / 255 (each vertex sums to exactly 255)
//   reg  uint8  x1  atlas region index (REGION_NAMES)
//   idx  uint16 or uint32 triangle list
function packGeometry(g) {
  const n = g.positions.length / 3;
  const scale = [0, 0, 0];
  for (let i = 0; i < n * 3; i++) scale[i % 3] = Math.max(scale[i % 3], Math.abs(g.positions[i]));
  const sections = [];
  let size = 0;
  const add = (name, arr) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    sections.push({ name, bytes, offset: size });
    size += Math.ceil(bytes.byteLength / 4) * 4;
  };
  const pos = new Int16Array(n * 3), nrm = new Int8Array(n * 4), uv = new Uint16Array(n * 2), ji = new Uint8Array(n * 4), jw = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = Math.round(g.positions[i * 3 + k] / scale[k] * 32767);
      nrm[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, g.normals[i * 3 + k])) * 127);
    }
    for (let k = 0; k < 2; k++) uv[i * 2 + k] = Math.round(Math.max(0, Math.min(1, g.uvs[i * 2 + k])) * 65535);
    // weights: quantise, then give the rounding remainder to the largest influence
    let sum = 0, big = 0;
    for (let k = 0; k < 4; k++) {
      ji[i * 4 + k] = g.skinIndices[i * 4 + k];
      jw[i * 4 + k] = Math.round(g.skinWeights[i * 4 + k] * 255);
      sum += jw[i * 4 + k];
      if (jw[i * 4 + k] > jw[i * 4 + big]) big = k;
    }
    jw[i * 4 + big] += 255 - sum;
  }
  const idx = n > 65535 ? Uint32Array.from(g.indices) : Uint16Array.from(g.indices);
  add('pos', pos); add('nrm', nrm); add('uv', uv); add('ji', ji); add('jw', jw); add('reg', Uint8Array.from(g.regions)); add('idx', idx);
  const buf = new Uint8Array(size);
  for (const s of sections) buf.set(s.bytes, s.offset);
  const layout = Object.fromEntries(sections.map(s => [s.name, s.offset]));
  return { buf, vertices: n, indices: g.indices.length, index32: n > 65535, posScale: scale.map(v => +v.toFixed(6)), layout };
}

function packClips(id, asset, def) {
  const names = CLIP_SET[id] || [];
  if (!names.length) return null;
  const bi = CLIP_BONES.map(b => { const i = asset.rig.byName[b]; if (i === undefined) throw new Error('missing bone ' + b); return i; });
  const clips = [], chunks = [];
  let offset = 0;
  for (const name of names) {
    const meta = CLIPS[name];
    const frames = Math.max(2, Math.ceil(meta.duration * FPS) + 1);
    // per frame: CLIP_BONES local quaternions (xyzw), then Root and Hips local positions
    const stride = CLIP_BONES.length * 4 + 6;
    const data = new Float32Array(frames * stride);
    for (let f = 0; f < frames; f++) {
      const pose = samplePose(asset.rig, def, name, f / (frames - 1) * meta.duration);
      const o = f * stride;
      bi.forEach((b, k) => data.set(pose[b].rotation, o + k * 4));
      data.set(pose[bi[0]].position, o + CLIP_BONES.length * 4);
      data.set(pose[bi[1]].position, o + CLIP_BONES.length * 4 + 3);
    }
    clips.push({ name, duration: meta.duration, loop: meta.loop, rootMotion: !!meta.rootMotion, events: meta.events, frames, offset });
    chunks.push(data);
    offset += data.byteLength;
  }
  const buf = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) { buf.set(new Uint8Array(c.buffer), o); o += c.byteLength; }
  return { buf, clips, bones: CLIP_BONES, stride: CLIP_BONES.length * 4 + 6 };
}

// ---------------------------------------------------------------- textures (ffmpeg)
const ffmpeg = (args, input) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { input, maxBuffer: 64 << 20 });
const rawRGB = (file) => ffmpeg(['-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const size = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };   // PNG IHDR
function writeJpeg(file, rgb, w, h, q, chroma444) {
  ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-q:v', String(q), '-pix_fmt', chroma444 ? 'yuvj444p' : 'yuvj420p', file], rgb);
}

// ---------------------------------------------------------------- run
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/\.(bin|jpg)$/.test(f)) fs.rmSync(path.join(out, f));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest = {
  schema: 'dead-air-enemies-v1',
  source: { kit: 'ashworth-enemy-kit', version: kitVersion, atlas: kitManifest.atlas, bindPose: kitManifest.bindPose, uvOrigin: kitManifest.uvOrigin },
  regions: REGION_NAMES,
  atlas: { size: ATLAS_SIZE, face: REGIONS.face, landmarks: FACE_LANDMARKS },
  enemies: [],
};
let total = 0;
for (const id of ENEMY_IDS) {
  const def = await loadDefinition(id);
  const entry = {
    id, label: def.label, role: def.role, height: def.height, locomotion: def.locomotion, cane: !!def.cane, feminine: !!def.feminine,
    joints: null, lods: {}, textures: { d: `${id}_d.jpg`, nr: `${id}_nr.jpg` }, sources: {},
  };
  let rig = null;
  for (const lod of LODS) {
    const asset = buildGeometry(def, { quality: lod });
    const bones = asset.rig.bones.map(b => ({ name: b.name, parent: b.parent, world: b.world.map(v => +v.toFixed(6)) }));
    if (!rig) { rig = asset; entry.joints = bones; } else if (JSON.stringify(bones) !== JSON.stringify(entry.joints)) throw new Error(`${id}: ${lod} rig differs`);
    const p = packGeometry(asset.geometry);
    const file = `${id}.${lod}.bin`;
    fs.writeFileSync(path.join(out, file), p.buf);
    total += p.buf.byteLength;
    entry.lods[lod] = { file, bytes: p.buf.byteLength, vertices: p.vertices, triangles: p.indices / 3, index32: p.index32, posScale: p.posScale, layout: p.layout, parts: asset.geometry.parts.map(q => [q.name, q.start, q.count, q.vertexStart, q.vertexCount]) };
  }
  const clips = packClips(id, rig, def);
  if (clips) {
    const file = `${id}.anim.bin`;
    fs.writeFileSync(path.join(out, file), clips.buf);
    total += clips.buf.byteLength;
    entry.anim = { file, bytes: clips.buf.byteLength, fps: FPS, bones: clips.bones, stride: clips.stride, clips: clips.clips };
  }
  // textures
  const tdir = path.join(kit, 'assets/textures', id);
  const [w, h] = size(path.join(tdir, 'albedo.png'));
  writeJpeg(path.join(out, entry.textures.d), rawRGB(path.join(tdir, 'albedo.png')), w, h, 3, false);
  const nrm = rawRGB(path.join(tdir, 'normal.png')), orm = rawRGB(path.join(tdir, 'orm.png'));
  if (nrm.length !== w * h * 3 || orm.length !== w * h * 3) throw new Error(`${id}: map sizes differ`);
  const nr = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { nr[i * 3] = nrm[i * 3]; nr[i * 3 + 1] = nrm[i * 3 + 1]; nr[i * 3 + 2] = orm[i * 3 + 1]; }
  writeJpeg(path.join(out, entry.textures.nr), nr, w, h, 3, true);
  for (const f of ['albedo.png', 'normal.png', 'orm.png']) entry.sources[f] = sha(path.join(tdir, f));
  total += fs.statSync(path.join(out, entry.textures.d)).size + fs.statSync(path.join(out, entry.textures.nr)).size;
  manifest.enemies.push(entry);
  console.log(id.padEnd(14), LODS.map(l => `${l} ${entry.lods[l].triangles} tris ${(entry.lods[l].bytes / 1024 | 0)} KB`).join(' · '), clips ? `· ${clips.clips.length} clips` : '');
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
fs.copyFileSync(path.join(kit, 'LICENSE-CODE.txt'), path.join(out, 'LICENSE-ASHWORTH.txt'));
console.log(`assets/enemies: ${(total / 1048576).toFixed(2)} MB`);
