// Procedural humans: skeleton, SDF anatomy (body/head/hands at separate resolutions),
// skinned mesh assembly and a skin/cloth shader with triplanar detail + dynamic blood.
import * as THREE from 'three';
import { buildMesh } from '../engine/sdf.js';
import { mulberry } from '../engine/post.js';
import { mergeGeos } from './builder.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw',
  'L_clav', 'L_upper', 'L_fore', 'L_hand', 'R_clav', 'R_upper', 'R_fore', 'R_hand',
  'L_thigh', 'L_shin', 'L_foot', 'R_thigh', 'R_shin', 'R_foot'];
export const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = [-1, 0, 1, 2, 3, 4, 2, 6, 7, 8, 2, 10, 11, 12, 0, 14, 15, 0, 17, 18];

// Bind-pose joint positions (character faces +Z, left = +X). Returns {joint name: [x,y,z]}
export function makeJoints(o = {}) {
  const s = o.height ?? 1;        // overall scale
  const sw = o.shoulders ?? 1;    // shoulder width scale
  const J = {};
  const P = (x, y, z) => [x * s, y * s, z * s];
  J.hips = P(0, 0.98, 0);
  J.spine = P(0, 1.1, 0);
  J.chest = P(0, 1.3, 0);
  J.neck = P(0, 1.49, 0.0);
  J.head = P(0, 1.595, 0.02);
  J.jaw = P(0, 1.63, 0.035);
  J.headTop = P(0, 1.79, 0.02);
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L_' : 'R_';
    J[S + 'clav'] = P(0.03 * side, 1.43, 0.02);
    const sh = P(0.19 * side * sw, 1.435, 0.0);
    J[S + 'upper'] = sh;
    const ang = 0.42; // A-pose angle from vertical
    const d = [Math.sin(ang) * side, -Math.cos(ang), 0.02];
    const el = [sh[0] + d[0] * 0.29 * s, sh[1] + d[1] * 0.29 * s, sh[2] + 0.015 * s];
    J[S + 'fore'] = el;
    const wr = [el[0] + d[0] * 0.255 * s, el[1] + d[1] * 0.255 * s, el[2] + 0.035 * s];
    J[S + 'hand'] = wr;
    J[S + 'tip'] = [wr[0] + d[0] * 0.18 * s, wr[1] + d[1] * 0.18 * s, wr[2] + 0.02 * s];
    J[S + 'thigh'] = P(0.095 * side, 0.935, 0);
    J[S + 'shin'] = P(0.105 * side, 0.515, 0.015);
    J[S + 'foot'] = P(0.11 * side, 0.09, -0.01);
    J[S + 'toe'] = P(0.115 * side, 0.025, 0.155);
  }
  return J;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function quatFromTo(from, to) {
  const f = norm(from), t = norm(to);
  const d = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
  const c = [f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0]];
  const w = 1 + d;
  const q = [c[0], c[1], c[2], w];
  const l = Math.hypot(...q) || 1;
  return q.map(v => v / l);
}

// ------------------------------------------------------------------ anatomy spec
// o: { height, shoulders, thin (0..1), belly (0..1), female, zombie (0..1 decay), top, bottom, shoes, hair, seed }
export function anatomy(o = {}) {
  const J = makeJoints(o);
  const s = o.height ?? 1;
  const thin = o.thin ?? 0.3, belly = o.belly ?? 0, fem = o.female ? 1 : 0, decay = o.zombie ?? 0;
  const body = [], head = [], handL = [], handR = [];
  const B = BI;
  const S = (v) => v * s;
  const bulk = 1 - thin * 0.22;
  // ---------------- torso
  body.push({ t: 'ell', c: [0, S(0.965), S(-0.012)], r: [S(0.158 + fem * 0.02), S(0.11), S(0.112)], bone: B.hips, k: S(0.05) });
  body.push({ t: 'ell', c: [0, S(1.1), S(0.005 + belly * 0.03)], r: [S(0.138 * bulk + belly * 0.03), S(0.12), S(0.095 * bulk + belly * 0.06)], bone: B.spine, k: S(0.06) });
  body.push({ t: 'ell', c: [0, S(1.3), S(-0.005)], r: [S(0.158 * bulk), S(0.165), S(0.108 * bulk)], bone: B.chest, k: S(0.06) });
  if (fem) for (const x of [-1, 1]) body.push({ t: 'sphere', c: [S(0.058 * x), S(1.29), S(0.075)], r: S(0.055), bone: B.chest, k: S(0.04) });
  else for (const x of [-1, 1]) body.push({ t: 'ell', c: [S(0.07 * x), S(1.335), S(0.058)], r: [S(0.075), S(0.058), S(0.045 * bulk)], bone: B.chest, k: S(0.04) });
  body.push({ t: 'cone', a: [S(-0.13), S(1.425), S(-0.025)], b: [S(0.13), S(1.425), S(-0.025)], ra: S(0.055 * bulk), rb: S(0.055 * bulk), bone: B.chest, k: S(0.05) });
  for (const x of [-1, 1]) body.push({ t: 'ell', c: [S(0.065 * x), S(0.915), S(-0.07)], r: [S(0.078 + fem * 0.012), S(0.085), S(0.066 + fem * 0.01)], bone: B.hips, k: S(0.04) });
  // emaciated ribs: shallow grooves across the flanks
  if (thin > 0.55 && decay > 0) {
    for (let i = 0; i < 5; i++) for (const x of [-1, 1]) {
      const y = S(1.19 + i * 0.045);
      body.push({ t: 'cone', a: [S(0.1 * x), y, S(0.07)], b: [S(0.155 * x), y - S(0.02), S(0.0)], ra: S(0.007), rb: S(0.006), op: 'sub', k: S(0.012), bone: B.chest });
    }
  }
  // neck
  body.push({ t: 'cone', a: [0, S(1.43), S(-0.005)], b: add(J.head, [0, S(-0.015), S(-0.005)]), ra: S(0.058 * bulk), rb: S(0.052 * bulk), bone: B.neck, k: S(0.035) });
  // ---------------- arms (to wrist) + legs
  for (const side of [1, -1]) {
    const P = side > 0 ? 'L_' : 'R_';
    body.push({ t: 'sphere', c: add(J[P + 'upper'], [S(-0.01 * side), S(0.005), 0]), r: S(0.056 * bulk), bone: B[P + 'upper'], k: S(0.035) });
    body.push({ t: 'cone', a: J[P + 'upper'], b: J[P + 'fore'], ra: S(0.047 * bulk), rb: S(0.036), bone: B[P + 'upper'], k: S(0.02) });
    body.push({ t: 'ell', c: lerp(J[P + 'upper'], J[P + 'fore'], 0.45), r: [S(0.038 * bulk), S(0.07), S(0.042 * bulk)], q: quatFromTo([0, 1, 0], sub(J[P + 'fore'], J[P + 'upper'])), bone: B[P + 'upper'], k: S(0.02) });
    body.push({ t: 'cone', a: J[P + 'fore'], b: J[P + 'hand'], ra: S(0.039 * bulk), rb: S(0.026), bone: B[P + 'fore'], k: S(0.02) });
    body.push({ t: 'ell', c: lerp(J[P + 'fore'], J[P + 'hand'], 0.3), r: [S(0.036 * bulk), S(0.07), S(0.034 * bulk)], q: quatFromTo([0, 1, 0], sub(J[P + 'hand'], J[P + 'fore'])), bone: B[P + 'fore'], k: S(0.02) });
    // legs
    body.push({ t: 'cone', a: J[P + 'thigh'], b: J[P + 'shin'], ra: S(0.083 * bulk + fem * 0.01), rb: S(0.05), bone: B[P + 'thigh'], k: S(0.045) });
    body.push({ t: 'sphere', c: add(J[P + 'shin'], [0, S(0.01), S(0.02)]), r: S(0.047), bone: B[P + 'shin'], k: S(0.03) });
    body.push({ t: 'cone', a: J[P + 'shin'], b: J[P + 'foot'], ra: S(0.047), rb: S(0.03), bone: B[P + 'shin'], k: S(0.02) });
    body.push({ t: 'ell', c: add(lerp(J[P + 'shin'], J[P + 'foot'], 0.28), [0, 0, S(-0.03)]), r: [S(0.045 * bulk), S(0.1), S(0.045 * bulk)], bone: B[P + 'shin'], k: S(0.03) });
    // feet (shoes or bare)
    const shoe = o.shoes && o.shoes !== 'none';
    const ft = J[P + 'foot'], toe = J[P + 'toe'];
    const fc = lerp(ft, toe, 0.45);
    body.push({ t: 'box', c: [fc[0], S(0.045), fc[2] + S(0.0)], s: [S(shoe ? 0.05 : 0.042), S(shoe ? 0.045 : 0.035), S(shoe ? 0.135 : 0.12)], r: S(0.03), bone: B[P + 'foot'], k: S(0.03), mat: shoe ? 3 : 0 });
    body.push({ t: 'sphere', c: add(ft, [0, S(-0.005), S(-0.02)]), r: S(0.04), bone: B[P + 'foot'], k: S(0.03), mat: shoe ? 3 : 0 });
    if (shoe) body.push({ t: 'cone', a: add(ft, [0, S(0.02), S(-0.01)]), b: add(ft, [0, S(0.09), S(-0.01)]), ra: S(0.046), rb: S(0.044), bone: B[P + 'foot'], k: S(0.01), mat: 3, wScale: 0.5 });
  }
  // ---------------- clothing layer
  const cloth = [];
  const inf = S(0.011);
  if (o.top && o.top !== 'none') {
    const clip = [S(0.9), S(o.top === 'tank' ? 1.46 : 1.5)];
    for (const p of body.slice(0, 5 + (fem ? 2 : 2))) if (p.op !== 'sub' && p.bone !== B.neck) cloth.push({ ...p, layer: 'cloth', inflate: inf * (p.bone === B.hips ? 1.4 : 1), mat: 1, clipY: [clip[0], clip[1]] });
    cloth.push({ t: 'cone', a: [S(-0.13), S(1.425), S(-0.025)], b: [S(0.13), S(1.425), S(-0.025)], ra: S(0.055 * bulk), rb: S(0.055 * bulk), bone: B.chest, k: S(0.05), layer: 'cloth', inflate: inf, mat: 1 });
    if (o.top !== 'tank') for (const side of [1, -1]) {
      const P = side > 0 ? 'L_' : 'R_';
      const long = o.top === 'long' || o.top === 'uniform' || o.top === 'hoodie';
      cloth.push({ t: 'sphere', c: J[P + 'upper'], r: S(0.058 * bulk), bone: B[P + 'upper'], k: S(0.04), layer: 'cloth', inflate: inf, mat: 1 });
      const end = long ? J[P + 'fore'] : lerp(J[P + 'upper'], J[P + 'fore'], 0.5);
      cloth.push({ t: 'cone', a: J[P + 'upper'], b: end, ra: S(0.05 * bulk), rb: S(long ? 0.04 : 0.048), bone: B[P + 'upper'], k: S(0.02), layer: 'cloth', inflate: inf, mat: 1 });
      if (long) cloth.push({ t: 'cone', a: J[P + 'fore'], b: lerp(J[P + 'fore'], J[P + 'hand'], 0.93), ra: S(0.042 * bulk), rb: S(0.032), bone: B[P + 'fore'], k: S(0.02), layer: 'cloth', inflate: inf * 1.2, mat: 1 });
    }
    if (o.top === 'hoodie') cloth.push({ t: 'ell', c: [0, S(1.47), S(-0.07)], r: [S(0.13), S(0.06), S(0.06)], bone: B.chest, k: S(0.04), layer: 'cloth', mat: 1 });
  }
  if (o.bottom && o.bottom !== 'none') {
    const shorts = o.bottom === 'shorts';
    cloth.push({ ...body[0], layer: 'cloth', inflate: inf * 1.3, mat: 2, clipY: [S(0.5), S(1.04)] });
    cloth.push({ ...body[1], layer: 'cloth', inflate: inf * 1.2, mat: 2, clipY: [S(0.5), S(1.04)] });
    for (const side of [1, -1]) {
      const P = side > 0 ? 'L_' : 'R_';
      const knee = J[P + 'shin'];
      cloth.push({ t: 'cone', a: J[P + 'thigh'], b: shorts ? lerp(J[P + 'thigh'], knee, 0.6) : knee, ra: S(0.09 * bulk), rb: S(0.058), bone: B[P + 'thigh'], k: S(0.045), layer: 'cloth', inflate: inf, mat: 2 });
      cloth.push({ t: 'ell', c: add(J[P + 'thigh'], [0, S(-0.02), S(-0.06)]), r: [S(0.08), S(0.09), S(0.07)], bone: B.hips, k: S(0.04), layer: 'cloth', inflate: inf, mat: 2 });
      if (!shorts) cloth.push({ t: 'cone', a: knee, b: add(J[P + 'foot'], [0, S(0.07), 0]), ra: S(0.057), rb: S(0.05), bone: B[P + 'shin'], k: S(0.03), layer: 'cloth', inflate: inf, mat: 2 });
    }
  }
  if (o.vest) {
    // tactical / ballistic vest over the torso
    cloth.push({ t: 'box', c: [0, S(1.24), S(0.0)], s: [S(0.17), S(0.2), S(0.125)], r: S(0.06), bone: B.chest, k: S(0.03), layer: 'cloth', mat: 3, wScale: 1.2 });
  }
  // ---------------- head (fine)
  const H = J.head;
  const hc = add(H, [0, S(0.095), S(0.0)]);
  head.push({ t: 'cone', a: add(H, [0, S(-0.09), S(-0.01)]), b: add(H, [0, S(0.02), S(0.0)]), ra: S(0.05 * bulk), rb: S(0.047 * bulk), bone: B.neck, k: S(0.03) });
  head.push({ t: 'ell', c: hc, r: [S(0.077), S(0.098), S(0.096)], bone: B.head, k: S(0.02) });
  head.push({ t: 'ell', c: add(hc, [0, S(-0.06), S(0.045)]), r: [S(0.06), S(0.05), S(0.055)], bone: B.head, k: S(0.03) });            // maxilla
  head.push({ t: 'box', c: add(hc, [0, S(-0.105), S(0.052)]), s: [S(0.048), S(0.022), S(0.045)], r: S(0.02), bone: B.jaw, k: S(0.025) });   // mandible
  head.push({ t: 'sphere', c: add(hc, [0, S(-0.122), S(0.088)]), r: S(0.021), bone: B.jaw, k: S(0.02) });                                   // chin
  for (const x of [-1, 1]) {
    head.push({ t: 'cone', a: add(hc, [S(0.05 * x), S(-0.095), S(0.0)]), b: add(hc, [S(0.035 * x), S(-0.118), S(0.06)]), ra: S(0.016), rb: S(0.014), bone: B.jaw, k: S(0.02) });  // jaw line
    head.push({ t: 'sphere', c: add(hc, [S(0.045 * x), S(-0.025), S(0.07)]), r: S(0.02 - decay * 0.004), bone: B.head, k: S(0.02) });     // cheekbone
    head.push({ t: 'ell', c: add(hc, [S(0.079 * x), S(-0.02), S(-0.005)]), r: [S(0.01), S(0.029), S(0.019)], bone: B.head, k: S(0.008) });  // ear
  }
  head.push({ t: 'cone', a: add(hc, [S(-0.046), S(0.012), S(0.083)]), b: add(hc, [S(0.046), S(0.012), S(0.083)]), ra: S(0.016), rb: S(0.016), bone: B.head, k: S(0.02) }); // brow
  head.push({ t: 'cone', a: add(hc, [0, S(0.002), S(0.093)]), b: add(hc, [0, S(-0.046), S(0.115)]), ra: S(0.009), rb: S(0.016), bone: B.head, k: S(0.012) });   // nose
  for (const x of [-1, 1]) head.push({ t: 'sphere', c: add(hc, [S(0.012 * x), S(-0.044), S(0.105)]), r: S(0.011), bone: B.head, k: S(0.01) });                  // nostrils
  // lips
  head.push({ t: 'ell', c: add(hc, [0, S(-0.074), S(0.098)]), r: [S(0.025), S(0.008), S(0.012)], bone: B.head, k: S(0.01) });
  head.push({ t: 'ell', c: add(hc, [0, S(-0.092), S(0.094)]), r: [S(0.024), S(0.008), S(0.012)], bone: B.jaw, k: S(0.01) });
  // carve: eye sockets, mouth
  for (const x of [-1, 1]) head.push({ t: 'sphere', c: add(hc, [S(0.032 * x), S(-0.006), S(0.098)]), r: S(0.018 + decay * 0.004), op: 'sub', k: S(0.012), bone: B.head, matOverride: 7 });
  head.push({ t: 'box', c: add(hc, [0, S(-0.083), S(0.108)]), s: [S(0.022 + decay * 0.006), S(0.004 + decay * 0.004), S(0.03)], r: S(0.003), op: 'sub', k: S(0.006), bone: B.head, matOverride: 6 });
  if (decay > 0.5) head.push({ t: 'sphere', c: add(hc, [S(0.035), S(-0.07), S(0.085)]), r: S(0.016), op: 'sub', k: S(0.008), bone: B.jaw, matOverride: 6 }); // torn cheek
  // teeth (visible in the opened mouth)
  head.push({ t: 'box', c: add(hc, [0, S(-0.077), S(0.093)]), s: [S(0.02), S(0.006), S(0.007)], r: S(0.002), bone: B.head, mat: 5, k: 0 });
  head.push({ t: 'box', c: add(hc, [0, S(-0.089), S(0.09)]), s: [S(0.018), S(0.005), S(0.007)], r: S(0.002), bone: B.jaw, mat: 5, k: 0 });
  // hair / helmet
  if (o.hair === 'short' || o.hair === 'long') {
    head.push({ t: 'ell', c: add(hc, [0, S(0.018), S(-0.008)]), r: [S(0.082), S(0.092), S(0.1)], bone: B.head, k: S(0.01), mat: 4, clipY: [hc[1] + S(0.0), null], bump: S(0.006), bumpF: 60 });
    if (o.hair === 'long') head.push({ t: 'ell', c: add(hc, [0, S(-0.06), S(-0.05)]), r: [S(0.085), S(0.12), S(0.06)], bone: B.head, k: S(0.02), mat: 4, bump: S(0.008), bumpF: 40 });
  }
  if (o.helmet) {
    head.push({ t: 'ell', c: add(hc, [0, S(0.03), S(-0.005)]), r: [S(0.1), S(0.1), S(0.115)], bone: B.head, k: S(0.005), mat: 3, clipY: [hc[1] - S(0.005), null] });
  }
  if (o.mask) head.push({ t: 'ell', c: add(hc, [0, S(-0.06), S(0.06)]), r: [S(0.07), S(0.055), S(0.06)], bone: B.head, k: S(0.01), mat: 7 });
  // ---------------- hands (fine)
  for (const side of [1, -1]) {
    const P = side > 0 ? 'L_' : 'R_';
    const arr = side > 0 ? handL : handR;
    const wr = J[P + 'hand'], tip = J[P + 'tip'];
    const dir = norm(sub(tip, wr));
    const lat = norm([dir[1] * 0 - dir[2] * 0 + 0, 0, 0]);
    // hand frame: forward = dir, palm faces inward (-x*side), thumb forward (+z)
    const inward = [-side, 0, 0];
    const fwd = [0, 0, 1];
    arr.push({ t: 'cone', a: add(wr, mul(dir, S(-0.06))), b: wr, ra: S(0.028), rb: S(0.025), bone: B[P + 'fore'], k: S(0.015) });
    const palmC = add(wr, mul(dir, S(0.05)));
    arr.push({ t: 'box', c: palmC, s: [S(0.014), S(0.045), S(0.038)], r: S(0.012), q: quatFromTo([0, 1, 0], mul(dir, -1)), bone: B[P + 'hand'], k: S(0.012), mat: o.gloves ? 7 : 0 });
    const curl = o.handCurl ?? 0.5;
    for (let f = 0; f < 4; f++) {
      const zoff = S((f - 1.5) * 0.019);
      const base = add(add(wr, mul(dir, S(0.09))), [0, 0, zoff]);
      const len = S([0.075, 0.085, 0.08, 0.065][f]);
      // curl: bend toward palm (inward) progressively
      const mid = add(add(base, mul(dir, len * 0.5)), mul(inward, len * 0.25 * curl));
      const end = add(add(base, mul(dir, len * (0.85 - curl * 0.35))), mul(inward, len * 0.7 * curl));
      arr.push({ t: 'cone', a: base, b: mid, ra: S(0.0095), rb: S(0.0085), bone: B[P + 'hand'], k: S(0.006), mat: o.gloves ? 7 : 0 });
      arr.push({ t: 'cone', a: mid, b: end, ra: S(0.0085), rb: S(0.007), bone: B[P + 'hand'], k: S(0.005), mat: o.gloves ? 7 : (decay > 0.3 ? 0 : 0) });
      if (!o.gloves) arr.push({ t: 'sphere', c: end, r: S(0.0065), bone: B[P + 'hand'], k: S(0.003), mat: decay > 0.3 ? 5 : 0, wScale: 0.2 });
    }
    const tb = add(add(wr, mul(dir, S(0.035))), [0, 0, S(0.035)]);
    const tm = add(add(tb, mul(dir, S(0.03))), add(mul(inward, S(0.012)), [0, 0, S(0.02)]));
    const te = add(add(tm, mul(dir, S(0.03))), add(mul(inward, S(0.018 * (0.5 + curl))), [0, 0, S(0.005)]));
    arr.push({ t: 'cone', a: tb, b: tm, ra: S(0.013), rb: S(0.01), bone: B[P + 'hand'], k: S(0.01), mat: o.gloves ? 7 : 0 });
    arr.push({ t: 'cone', a: tm, b: te, ra: S(0.0095), rb: S(0.008), bone: B[P + 'hand'], k: S(0.006), mat: o.gloves ? 7 : 0 });
  }
  // decay lumps on skin
  if (decay > 0) for (const p of body) if (!p.mat && p.op !== 'sub') { p.bump = S(0.005 * decay); p.bumpF = 22; }
  return { J, body: [...body, ...cloth], head, handL, handR };
}

// Build a merged skinned geometry from an anatomy (parts meshed at different resolutions).
export function buildBodyGeometry(an, detail = 2, tears = null) {
  // detail 3 is the distance LOD (~4x fewer triangles; fingers merge into mitts, invisible past 7 m)
  const hBody = [0.026, 0.021, 0.0165, 0.042][detail], hFine = [0.0095, 0.0078, 0.0064, 0.02][detail];
  const parts = [
    buildMesh({ prims: an.body, h: hBody, bones: BONES.length, tears }),
    buildMesh({ prims: an.head, h: hFine, bones: BONES.length }),
    buildMesh({ prims: an.handL, h: hFine * 1.1, bones: BONES.length }),
    buildMesh({ prims: an.handR, h: hFine * 1.1, bones: BONES.length }),
  ];
  let vc = 0, ic = 0;
  for (const p of parts) { vc += p.vcount; ic += p.index.length; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
  const ma = new Float32Array(vc * 4), mb = new Float32Array(vc * 4);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const p of parts) {
    pos.set(p.position, vo * 3); nor.set(p.normal, vo * 3); si.set(p.skinIndex, vo * 4); sw.set(p.skinWeight, vo * 4);
    ma.set(p.matA, vo * 4); mb.set(p.matB, vo * 4);
    for (let i = 0; i < p.index.length; i++) idx[io++] = p.index[i] + vo;
    vo += p.vcount;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('matA', new THREE.BufferAttribute(ma, 4));
  g.setAttribute('matB', new THREE.BufferAttribute(mb, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1.4;
  g.boundingSphere.center.set(0, 0.9, 0);
  return g;
}

// ------------------------------------------------------------------ material
const CHAR_PARS = /* glsl */`
attribute vec4 matA; attribute vec4 matB;
varying vec4 vMatA; varying vec4 vMatB; varying vec3 vObj; varying vec3 vObjN;
`;
const CHAR_FRAG_PARS = /* glsl */`
varying vec4 vMatA; varying vec4 vMatB; varying vec3 vObj; varying vec3 vObjN;
uniform sampler2D tSkinD; uniform sampler2D tTopD; uniform sampler2D tBotD;
uniform vec3 uSkin; uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uShoe; uniform vec3 uHair; uniform vec3 uGlove;
uniform float uTopScale; uniform float uBotScale; uniform float uDecay; uniform float uDirt; uniform float uSeed;
uniform vec4 uBlood[10]; uniform float uBloodAmt; uniform float uWetness;
float ch(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }
float cfbm(vec3 p) { return cn(p) * 0.5 + cn(p * 2.1 + 3.3) * 0.3 + cn(p * 4.3 + 7.1) * 0.2; }
vec3 triW() { vec3 w = pow(abs(normalize(vObjN)), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec3 tri(sampler2D t, vec3 p, vec3 w) {
  vec3 c = vec3(0.0);
  if (w.x > 0.05) c += texture2D(t, p.zy).rgb * w.x;
  if (w.y > 0.05) c += texture2D(t, p.xz).rgb * w.y;
  if (w.z > 0.05) c += texture2D(t, p.xy).rgb * w.z;
  return c;
}
float charHeight; float charRough; float charBloodMask;
vec3 dPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - grad);
}
`;
const CHAR_ALBEDO = /* glsl */`
{
  vec3 w = triW();
  vec3 op = vObj;
  // skin: base tone, mottling, veins, bruising, lividity
  float n1 = cfbm(op * 18.0 + uSeed);
  float n2 = cfbm(op * 5.0 + uSeed * 2.0);
  float veins = 1.0 - smoothstep(0.0, 0.035, abs(cn(op * 34.0 + uSeed) - 0.5));
  vec3 skin = uSkin * (0.72 + 0.28 * n1);
  skin = mix(skin, skin * vec3(0.55, 0.45, 0.6), smoothstep(0.55, 0.8, n2) * uDecay);          // bruising
  skin = mix(skin, vec3(0.2, 0.22, 0.28) * uSkin * 2.0, veins * 0.35 * uDecay);                    // veins
  vec3 wr = tri(tSkinD, op * 3.0, w);
  skin *= mix(vec3(1.0), wr * 1.25, 0.35);
  // dried blood around mouth, chin, chest and hands
  float patchy = smoothstep(0.35, 0.65, cn(op * 22.0 + uSeed * 3.0));
  float mouth = smoothstep(0.055, 0.0, length((op - vec3(0.0, 1.595, 0.1)) * vec3(1.0, 0.8, 1.0)) - 0.01);
  float chest = smoothstep(0.16, 0.0, length((op - vec3(0.0, 1.36, 0.12)) * vec3(1.4, 0.55, 1.0))) * step(0.03, op.z) * patchy;
  float hands = smoothstep(0.08, 0.0, min(length(op - vec3(0.47, 0.77, 0.04)), length(op - vec3(-0.47, 0.77, 0.04))) - 0.04) * patchy;
  float blood = clamp((mouth * 1.2 + chest * 0.8 + hands) * uDecay, 0.0, 1.0);
  // cloth
  vec3 top = tri(tTopD, op / uTopScale, w) * uTop;
  vec3 bot = tri(tBotD, op / uBotScale, w) * uBot;
  float grime = cfbm(op * 7.0 + 9.0);
  top *= 0.75 + 0.35 * grime * (1.0 - uDirt * 0.5);
  bot *= 0.75 + 0.35 * grime;
  float mA = vMatA.x + vMatA.y + vMatA.z + vMatA.w + vMatB.x + vMatB.y + vMatB.z + vMatB.w;
  vec3 col = skin * vMatA.x + top * vMatA.y + bot * vMatA.z + uShoe * vMatA.w
           + uHair * (0.7 + 0.5 * n1) * vMatB.x + vec3(0.62, 0.55, 0.4) * vMatB.y + vec3(0.18, 0.02, 0.02) * vMatB.z + uGlove * vMatB.w;
  col /= max(mA, 1e-3);
  // blood splatter from wounds (dynamic)
  float wound = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 b = uBlood[i];
    if (b.w <= 0.0) continue;
    float d = length(op - b.xyz);
    float edge = b.w * (0.75 + 0.5 * cn(op * 60.0 + float(i)));
    wound = max(wound, smoothstep(edge, edge * 0.35, d));
    // drips running down the body
    vec2 dd = (op.xz - b.xz) * vec2(1.0, 1.0);
    float drip = smoothstep(0.012, 0.0, abs(dd.x + 0.004 * sin(op.y * 60.0))) * step(op.y, b.y) * smoothstep(b.y - 0.35 * b.w * 6.0, b.y, op.y);
    wound = max(wound, drip * 0.8 * step(0.6, cn(vec3(float(i) * 7.0, 0.0, 0.0) + 1.0)));
  }
  blood = max(blood, wound * uBloodAmt);
  float fresh = wound;
  col = mix(col, mix(vec3(0.16, 0.035, 0.025), vec3(0.28, 0.02, 0.015), fresh), blood * (vMatA.x + vMatA.y + vMatA.z + 0.3));
  col *= 1.0 - uDirt * 0.35 * grime;
  diffuseColor.rgb = col;
  charBloodMask = blood;
  // height for bump + roughness
  float hs = dot(wr, vec3(0.333)) * vMatA.x * 0.8 + n1 * 0.4 * uDecay * vMatA.x;
  hs += dot(top, vec3(0.15)) * vMatA.y + dot(bot, vec3(0.15)) * vMatA.z;
  charHeight = hs;
  charRough = 0.52 * vMatA.x + 0.92 * vMatA.y + 0.9 * vMatA.z + 0.55 * vMatA.w + 0.7 * vMatB.x + 0.25 * vMatB.y + 0.2 * vMatB.z + 0.6 * vMatB.w;
  charRough /= max(mA, 1e-3);
  charRough = mix(charRough, 0.25, blood * 0.8);
  charRough = mix(charRough, charRough * 0.6, uWetness);
}
`;

export function makeCharacterMaterial(assets, v = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.4 });
  const T = (id) => assets.tex[id]?.d || null;
  const blood = []; for (let i = 0; i < 10; i++) blood.push(new THREE.Vector4(0, 0, 0, 0));
  const u = {
    tSkinD: { value: T('leather_white') }, tTopD: { value: T(v.topTex || 'fabric_pattern_07') }, tBotD: { value: T(v.botTex || 'denim_fabric') },
    uSkin: { value: new THREE.Color(v.skin ?? 0x9a9488) }, uTop: { value: new THREE.Color(v.top ?? 0xffffff) }, uBot: { value: new THREE.Color(v.bot ?? 0xffffff) },
    uShoe: { value: new THREE.Color(v.shoe ?? 0x151412) }, uHair: { value: new THREE.Color(v.hair ?? 0x1a120c) }, uGlove: { value: new THREE.Color(v.glove ?? 0x0c0c0d) },
    uTopScale: { value: v.topScale ?? 0.4 }, uBotScale: { value: v.botScale ?? 0.1 },
    uDecay: { value: v.decay ?? 1 }, uDirt: { value: v.dirt ?? 0.6 }, uSeed: { value: v.seed ?? 1 },
    uBlood: { value: blood }, uBloodAmt: { value: 1 }, uWetness: { value: v.wet ?? 0 },
  };
  mat.userData.u = u;
  mat.customProgramCacheKey = () => 'char1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + CHAR_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMatA = matA; vMatB = matB; vObj = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CHAR_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + CHAR_ALBEDO)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = charRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = dPerturb(-vViewPosition, normal, vec2(dFdx(charHeight), dFdy(charHeight)) * 0.05, faceDirection);`);
  };
  return mat;
}

// ------------------------------------------------------------------ skeleton + body instance
export function buildSkeleton(J) {
  const bones = [];
  const world = [];
  for (let i = 0; i < BONES.length; i++) {
    const b = new THREE.Bone();
    b.name = BONES[i];
    const w = J[BONES[i]];
    world.push(w);
    const p = PARENT[i];
    if (p < 0) b.position.set(w[0], w[1], w[2]);
    else b.position.set(w[0] - world[p][0], w[1] - world[p][1], w[2] - world[p][2]);
    bones.push(b);
    if (p >= 0) bones[p].add(b);
  }
  return bones;
}

// A template holds geometry & joint data; instances share geometry.
export class BodyTemplate {
  constructor(assets, opts, detail = 2) {
    this.opts = opts;
    this.an = anatomy(opts);
    this.J = this.an.J;
    this.geometry = buildBodyGeometry(this.an, detail, opts.tears || null);
    this.geometryLod = buildBodyGeometry(this.an, 3, opts.tears || null);
  }
}

export class Body {
  constructor(template, material) {
    this.t = template;
    this.root = new THREE.Group();
    this.bones = buildSkeleton(template.J);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh = new THREE.SkinnedMesh(template.geometry, material);
    this.mesh.add(this.bones[0]);
    this.mesh.bind(this.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    // manual bounds: skinned-mesh bounds would otherwise be computed once from the spawn pose
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.35);
    this.mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.2, -1), new THREE.Vector3(1, 2.1, 1));
    this.root.add(this.mesh);
    this.material = material;
    this.rest = this.bones.map(b => b.position.clone());
    this.bloodIdx = 0;
    this.lod = 0;
    // eyes
    const eyeM = new THREE.MeshStandardMaterial({ color: template.opts.eyeColor ?? (template.opts.zombie ? 0x6e6a5c : 0x9a9690), roughness: 0.12, metalness: 0, emissive: 0xfff4d0, emissiveIntensity: 0 });
    this.eyeMat = eyeM;
    const hc = [template.J.head[0], template.J.head[1] + 0.095 * (template.opts.height ?? 1), template.J.head[2]];
    const s = template.opts.height ?? 1;
    // both eyes in one mesh (one draw per body), geometry shared by every body of the template
    if (!template.eyeGeo) {
      const sphere = new THREE.SphereGeometry(0.0125 * s, 10, 8);
      // position relative to head bone (bind: head bone world = J.head)
      template.eyeGeo = mergeGeos([-1, 1].map(x => ({ geo: sphere, matrix: new THREE.Matrix4().makeTranslation(0.032 * x * s, (hc[1] - 0.006 * s) - template.J.head[1], (hc[2] + 0.088 * s) - template.J.head[2]) })));
      sphere.dispose();
    }
    this.eyes = new THREE.Mesh(template.eyeGeo, eyeM);
    this.bones[BI.head].add(this.eyes);
    this.layer = 0;
  }

  // Convert a world-space point to bind space via a bone, and add a blood splat.
  addBlood(worldPoint, boneIndex, radius = 0.05) {
    const b = this.bones[boneIndex];
    b.updateWorldMatrix(true, false);
    const inv = _m.copy(b.matrixWorld).invert();
    const p = _v.copy(worldPoint).applyMatrix4(inv);
    // bone local -> bind (inverse of boneInverse)
    const bind = _m2.copy(this.skeleton.boneInverses[boneIndex]).invert();
    p.applyMatrix4(bind);
    const arr = this.material.userData.u.uBlood.value;
    arr[this.bloodIdx % arr.length].set(p.x, p.y, p.z, radius);
    this.bloodIdx++;
  }

  // Settled corpses: stop composing bone matrices and re-uploading the bone texture every frame.
  // The skeleton is evaluated once more after freezing (this frame's pose), then held.
  freeze(on) {
    if (!!on === !!this.frozen) return;
    this.frozen = !!on;
    this.root.traverse(o => { o.matrixAutoUpdate = !on; });
    const sk = this.skeleton;
    if (!on) { delete sk.update; return; }
    let pending = true;
    sk.update = function () { if (pending) { pending = false; THREE.Skeleton.prototype.update.call(sk); } };
  }
  // zone layer for portal culling (portals.js); follows the body as it moves between rooms
  setLayer(l) {
    if (l === this.layer) return;
    this.layer = l;
    this.mesh.layers.set(l); this.eyes.layers.set(l);
  }
  // 0 = full mesh, 1 = distance mesh (same skeleton, skin weights and material channels)
  setLod(l) {
    if (l === this.lod) return;
    this.lod = l;
    this.mesh.geometry = l ? this.t.geometryLod : this.t.geometry;
  }
  clearBlood() { for (const v of this.material.userData.u.uBlood.value) v.set(0, 0, 0, 0); this.bloodIdx = 0; }

  resetPose() {
    for (let i = 0; i < this.bones.length; i++) { this.bones[i].position.copy(this.rest[i]); this.bones[i].quaternion.identity(); }
  }
}
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3();

// ------------------------------------------------------------------ variants
const SKIN_ZOMBIE = [0x7a7868, 0x86806e, 0x6c7262, 0x8a7c6c, 0x5f574a, 0x746c5c];
const TOPS = [
  { top: 'tee', topTex: 'denim_fabric', topCol: 0x8a8a86, topScale: 0.12 },
  { top: 'long', topTex: 'fabric_pattern_07', topCol: 0xb0a8a0, topScale: 0.4 },
  { top: 'tee', topTex: 'denim_fabric', topCol: 0x3a4658, topScale: 0.12 },
  { top: 'tank', topTex: 'denim_fabric', topCol: 0xc8c4b8, topScale: 0.14 },
  { top: 'hoodie', topTex: 'denim_fabric', topCol: 0x2a2c30, topScale: 0.14 },
  { top: 'long', topTex: 'fabric_pattern_07', topCol: 0x708090, topScale: 0.35 },
];
export function zombieVariant(i) {
  const r = mulberry(1000 + i * 77);
  const top = TOPS[i % TOPS.length];
  const female = i % 3 === 2;
  return {
    height: female ? 0.94 + r() * 0.04 : 0.98 + r() * 0.07,
    shoulders: female ? 0.9 : 1 + r() * 0.08,
    thin: 0.35 + r() * 0.5, belly: r() < 0.3 ? r() * 0.8 : 0, female,
    zombie: 0.8 + r() * 0.2,
    top: top.top, bottom: r() < 0.15 ? 'shorts' : 'jeans', shoes: r() < 0.2 ? 'none' : 'shoes',
    hair: r() < 0.3 ? 'none' : (female ? 'long' : 'short'),
    handCurl: 0.55 + r() * 0.3,
    tears: { amount: 0.1 + r() * 0.14, freq: 5 + r() * 3, seed: i * 13 + 5 },
    mat: {
      skin: SKIN_ZOMBIE[i % SKIN_ZOMBIE.length], topTex: top.topTex, top: top.topCol, topScale: top.topScale,
      botTex: 'denim_fabric', bot: r() < 0.5 ? 0x5a6a88 : 0x3a3a40, botScale: 0.1, shoe: r() < 0.5 ? 0x141210 : 0x3a3530,
      hair: r() < 0.5 ? 0x15100c : 0x4a3a2a, decay: 0.85 + r() * 0.15, dirt: 0.5 + r() * 0.4, seed: r() * 50,
    },
  };
}

export function officerVariant(kind = 'swat') {
  if (kind === 'swat') return {
    height: 1.02, shoulders: 1.08, thin: 0.1, belly: 0, zombie: 0, top: 'uniform', bottom: 'jeans', shoes: 'shoes', hair: 'none',
    helmet: true, vest: true, gloves: true, handCurl: 0.75,
    mat: { skin: 0xb08a70, topTex: 'denim_fabric', top: 0x2a2e36, topScale: 0.12, botTex: 'denim_fabric', bot: 0x24272e, botScale: 0.1, shoe: 0x0e0e10, hair: 0x1a1a1a, glove: 0x0b0b0c, decay: 0, dirt: 0.2, seed: 3 },
  };
  return {
    height: 1.0, shoulders: 1.05, thin: 0.2, zombie: 0, top: 'uniform', bottom: 'jeans', shoes: 'shoes', hair: 'short', vest: true, gloves: true,
    mat: { skin: 0xc09a80, topTex: 'denim_fabric', top: 0x202a3c, topScale: 0.12, botTex: 'denim_fabric', bot: 0x1c2230, botScale: 0.1, shoe: 0x0e0e10, hair: 0x2a1c12, glove: 0x0b0b0c, decay: 0, dirt: 0.1, seed: 9 },
  };
}
