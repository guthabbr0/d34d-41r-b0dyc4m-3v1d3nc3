// Ashworth enemy kit on the DEAD AIR skeleton (docs/enemies/README.md).
// The kit builds its enemies in a T-pose on a 44-joint rig; the game animates, ragdolls and hit-tests a
// 20-bone A-pose skeleton (humanoid.js). Each kit mesh is re-posed once at load (linear blend skinning on
// the CPU) into the game's bind pose and its skin weights are folded onto the game bones, so every game
// system (procedural poses, hit reactions, ragdoll, blood, head destruction) drives it unchanged.
// Kit clips go through the same bind change: with Q the re-posing world rotation of each kit joint,
// a kit local rotation L becomes Q_parent · L · Q_joint⁻¹ on the game bone.
import * as THREE from 'three';
import { BONES, BI, buildSkeleton } from './humanoid.js';

export const CANE = BONES.length;   // extra bone (index 20) on rigs that carry the grandmother's cane

// Gameplay identity of each kit archetype (read by zombie.js). Ranges are [min, max] per spawn.
export const ARCHETYPES = {
  worker: { hp: 130, speed: [0.72, 1.0], reach: [0.15, 0.45], limp: [0.35, 0.65], lean: 0.45, voice: 0.86, hardHead: 'Gear / hardhat' },
  tactical: { hp: 110, speed: [1.0, 1.3], reach: [0.75, 1.0], limp: [0, 0.15], lean: 0.2, voice: 0.93, armor: 0.45, hardHead: 'Gear / helmet' },
  businessman: { hp: 90, speed: [0.85, 1.05], reach: [0.4, 0.9], limp: [0, 0.3], lean: 0.3, voice: 1.0, erratic: true },
  businesswoman: { hp: 85, speed: [0.8, 0.95], reach: [0.5, 1.0], limp: [0, 0.2], lean: 0.25, voice: 1.22, stride: 0.24, stalker: true },
  grandmother: { hp: 70, speed: [0.36, 0.42], reach: [0, 0], limp: [0, 0], lean: 0, voice: 1.14, cane: true },
  // gait: metres covered per stride of the IK crawl (anim.js poseCrawl), prowling and galloping
  crawler: { hp: 60, speed: [2.5, 3.1], reach: [0, 0], limp: [0, 0], lean: 0, voice: 1.06, crawler: true, gait: { prowl: 0.46, gallop: 0.72 } },
};

const KIT_TO_GAME = {
  Root: 'hips', Hips: 'hips', Spine: 'spine', Chest: 'chest', Neck: 'neck', Head: 'head', Jaw: 'jaw',
  L_Clavicle: 'L_clav', L_UpperArm: 'L_upper', L_Forearm: 'L_fore', L_Hand: 'L_hand',
  R_Clavicle: 'R_clav', R_UpperArm: 'R_upper', R_Forearm: 'R_fore', R_Hand: 'R_hand',
  L_Thigh: 'L_thigh', L_Calf: 'L_shin', L_Foot: 'L_foot', L_Toe: 'L_foot',
  R_Thigh: 'R_thigh', R_Calf: 'R_shin', R_Foot: 'R_foot', R_Toe: 'R_foot',
};
function gameBoneOf(name, cane) {
  if (KIT_TO_GAME[name]) return BI[KIT_TO_GAME[name]];
  if (name.startsWith('L_Finger')) return BI.L_hand;
  if (name.startsWith('R_Finger')) return BI.R_hand;
  if (name === 'Cane') return cane ? CANE : BI.R_hand;
  throw new Error('unmapped kit joint ' + name);
}

// Game bind pose (humanoid.js makeJoints): arms hang 0.42 rad out from vertical, drifting forward.
const ARM_ANGLE = 0.42;
const CLAV_DROOP = 0.28;   // rad: the T-pose shoulder line is flat; lowered arms want a sloping trapezius
const ARM_DIRS = [['UpperArm', 'Forearm', 0.072], ['Forearm', 'Hand', 0.155], ['Hand', 'Finger1B', 0.13]];

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler();

// ------------------------------------------------------------------ bind change (T-pose -> game A-pose)
// Returns world rotations W and positions P of every kit joint after re-posing.
function reposeRig(joints, o) {
  const n = joints.length, by = {};
  joints.forEach((j, i) => { by[j.name] = i; if (j.parent >= i) throw new Error('kit joints not parent-first'); });
  const local = joints.map(() => new THREE.Quaternion());
  const bind = joints.map(j => new THREE.Vector3(...j.world));
  const W = joints.map(() => new THREE.Quaternion()), P = joints.map(() => new THREE.Vector3());
  const fk = () => {
    for (let i = 0; i < n; i++) {
      const p = joints[i].parent;
      if (p < 0) { W[i].copy(local[i]); P[i].copy(bind[i]); continue; }
      W[i].copy(W[p]).multiply(local[i]);
      P[i].subVectors(bind[i], bind[p]).applyQuaternion(W[p]).add(P[p]);
    }
  };
  for (const [s, K] of [[1, 'L_'], [-1, 'R_']]) {
    local[by[K + 'Clavicle']].setFromAxisAngle(_v.set(0, 0, 1), -s * CLAV_DROOP);
    // aim each arm segment along the game's bind direction; the rotation is the minimal one, so the
    // palm (down in the T-pose) ends up facing the thigh and the thumb forward, as in humanoid.js
    for (const [a, b, fwd] of ARM_DIRS) {
      fk();
      const ia = by[K + a], ib = by[K + b];
      const cur = _v.subVectors(P[ib], P[ia]).normalize();
      const want = _v2.set(s * Math.sin(ARM_ANGLE), -Math.cos(ARM_ANGLE), fwd).normalize();
      const worldNew = _q.setFromUnitVectors(cur, want).multiply(W[ia]);
      const parentW = W[joints[ia].parent];
      local[ia].copy(_q2.copy(parentW).invert().multiply(worldNew));
    }
    // clawed fingers: curl toward the palm (about the hand's local Z in the kit frame)
    for (let f = 0; f < 5; f++) {
      const c = f === 4 ? o.curl * 0.35 : o.curl;
      local[by[`${K}Finger${f}A`]].setFromAxisAngle(_v.set(0, 0, 1), -s * c * 0.8);
      local[by[`${K}Finger${f}B`]].setFromAxisAngle(_v.set(0, 0, 1), -s * c);
    }
  }
  fk();
  // cane: hang it from the fist tilted forward so its tip rests on the floor in the bind pose
  if (o.cane) {
    const ic = by.Cane, ih = by.R_Hand;
    const len = o.cane.length, h = P[ic].y - 0.03;
    const tilt = len > h ? Math.acos(Math.max(-1, Math.min(1, h / len))) : 0;
    const worldNew = _q.setFromUnitVectors(_v.set(0, -1, 0), _v2.set(0, -Math.cos(tilt), Math.sin(tilt)));
    local[ic].copy(_q2.copy(W[ih]).invert().multiply(worldNew));
    fk();
  }
  return { W, P, by, bind };
}

// ------------------------------------------------------------------ decoding
function decodeLod(buf, lod) {
  const L = lod.layout, n = lod.vertices;
  return {
    pos: new Int16Array(buf, L.pos, n * 3), nrm: new Int8Array(buf, L.nrm, n * 4), uv: new Uint16Array(buf, L.uv, n * 2),
    ji: new Uint8Array(buf, L.ji, n * 4), jw: new Uint8Array(buf, L.jw, n * 4), reg: new Uint8Array(buf, L.reg, n),
    idx: lod.index32 ? new Uint32Array(buf, L.idx, lod.triangles * 3) : new Uint16Array(buf, L.idx, lod.triangles * 3),
    n, scale: lod.posScale, parts: lod.parts,
  };
}

const DQ_IDENT = [0, 0, 0, 1, 0, 0, 0, 0];
// normalised blend of two unit dual quaternions (shortest path)
function dqBlend(a, b, t) {
  const h = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const o = a.map((v, i) => v * (1 - t) + b[i] * t * h);
  const l = Math.hypot(o[0], o[1], o[2], o[3]);
  return o.map(v => v / l);
}

// Unit dual quaternion [real xyzw, dual xyzw] of the rigid transform v -> R (v - b) + p.
function dualQuat(R, b, p) {
  const t = _v.copy(b).applyQuaternion(R).negate().add(p);
  const r = [R.x, R.y, R.z, R.w];
  // dual = 0.5 * (t, 0) * real
  const d = [
    0.5 * (t.x * r[3] + t.y * r[2] - t.z * r[1]),
    0.5 * (-t.x * r[2] + t.y * r[3] + t.z * r[0]),
    0.5 * (t.x * r[1] - t.y * r[0] + t.z * r[3]),
    -0.5 * (t.x * r[0] + t.y * r[1] + t.z * r[2]),
  ];
  return [...r, ...d];
}

// Re-pose one level of detail and fold its skin onto the game skeleton. The re-pose uses dual quaternion
// skinning, except around the shoulders: the kit's torso shell keeps a flat T-pose shoulder line weighted
// to the chest, which stands up like a pad once the arm is lowered 66 degrees. There the bake ignores the
// weights and blends by position instead: the top of the torso droops with the clavicle, then the
// transform ramps into the full arm rotation across the shoulder joint.
// Runtime skinning (three.js, linear, original weights) then only works relative to this rest pose.
function buildLodGeometry(d, joints, rp, o) {
  const n = d.n, S = d.scale;
  const DQ = joints.map((j, i) => dualQuat(rp.W[i], _v2.set(...j.world), rp.P[i]));
  const torso = new Set(['Chest', 'Spine', 'Neck'].map(k => rp.by[k]));
  const shoulders = [['L_', 1], ['R_', -1]].map(([K, s]) => ({
    s, clav: rp.by[K + 'Clavicle'], upper: rp.by[K + 'UpperArm'], cp: rp.bind[rp.by[K + 'Clavicle']], up: rp.bind[rp.by[K + 'UpperArm']],
  }));
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
  const gmap = joints.map(j => gameBoneOf(j.name, !!o.cane));
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), qr = new THREE.Quaternion();
  const b = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    v.set(d.pos[i * 3] / 32767 * S[0], d.pos[i * 3 + 1] / 32767 * S[1], d.pos[i * 3 + 2] / 32767 * S[2]);
    b.fill(0);
    // fold influences that land on the same game bone (fingers -> hand, toe -> foot)
    const gi = [0, 0, 0, 0], gw = [0, 0, 0, 0];
    let used = 0, first = -1;
    for (let k = 0; k < 4; k++) {
      const w = d.jw[i * 4 + k];
      if (!w) continue;
      const j = d.ji[i * 4 + k], q = DQ[j];
      if (first < 0) first = j;
      const f = DQ[first], hemi = q[0] * f[0] + q[1] * f[1] + q[2] * f[2] + q[3] * f[3] < 0 ? -1 : 1;
      for (let c = 0; c < 8; c++) b[c] += q[c] * w * hemi;
      const g = gmap[j];
      let s = 0;
      while (s < used && gi[s] !== g) s++;
      if (s === used) { gi[used] = g; used++; }
      gw[s] += w;
    }
    // shoulder region: only torso + one side's clavicle / upper arm influences
    let sh = null;
    for (const c of shoulders) {
      let arm = false, other = false;
      for (let k = 0; k < 4; k++) {
        if (!d.jw[i * 4 + k]) continue;
        const j = d.ji[i * 4 + k];
        if (j === c.clav || j === c.upper) arm = true; else if (!torso.has(j)) other = true;
      }
      if (arm && !other) sh = c;
    }
    let torsoOnly = false;
    if (!sh) {
      // torso-only vertices on top of a shoulder
      torsoOnly = true;
      for (let k = 0; k < 4; k++) if (d.jw[i * 4 + k] && !torso.has(d.ji[i * 4 + k])) torsoOnly = false;
      if (torsoOnly && Math.abs(v.x) > 0.02) sh = shoulders[v.x > 0 ? 0 : 1];
    }
    if (sh) {
      const S = THREE.MathUtils.smoothstep;
      const top = S(v.y, sh.cp.y - 0.14, sh.cp.y - 0.02);
      const droop = S(sh.s * (v.x - sh.cp.x), 0.0, 0.1) * top;
      let dq = dqBlend(DQ_IDENT, DQ[sh.clav], droop);
      dq = dqBlend(dq, DQ[sh.upper], S(sh.s * (v.x - sh.up.x), -0.07, 0.07) * (torsoOnly ? top : 1));
      for (let c = 0; c < 8; c++) b[c] = dq[c];
    }
    // normalise the blend and apply it: p' = R v + t, t = 2 * dual * conj(real)
    const len = Math.hypot(b[0], b[1], b[2], b[3]);
    for (let c = 0; c < 8; c++) b[c] /= len;
    qr.set(b[0], b[1], b[2], b[3]);
    const [rx, ry, rz, rw, dx, dy, dz, dw] = b;
    const tx = 2 * (-dw * rx + dx * rw - dy * rz + dz * ry);
    const ty = 2 * (-dw * ry + dx * rz + dy * rw - dz * rx);
    const tz = 2 * (-dw * rz - dx * ry + dy * rx + dz * rw);
    v.applyQuaternion(qr);
    pos[i * 3] = v.x + tx; pos[i * 3 + 1] = v.y + ty; pos[i * 3 + 2] = v.z + tz;
    nv.set(d.nrm[i * 4], d.nrm[i * 4 + 1], d.nrm[i * 4 + 2]).applyQuaternion(qr).normalize();
    nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = gi[k]; sw[i * 4 + k] = gw[k]; }
  }
  // parts removed for this identity (e.g. the superintendent has no hardhat)
  let index = d.idx;
  if (o.drop && o.drop.length) {
    const cut = d.parts.filter(p => o.drop.includes(p[0]));
    const keep = [];
    outer: for (let t = 0; t < d.idx.length; t += 3) {
      for (const p of cut) if (t >= p[1] && t < p[1] + p[2]) continue outer;
      keep.push(d.idx[t], d.idx[t + 1], d.idx[t + 2]);
    }
    index = n > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  g.setAttribute('kitRegion', new THREE.BufferAttribute(d.reg, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
  return g;
}

function partVertices(d, name) {
  const p = d.parts.find(q => q[0] === name);
  return p ? [p[3], p[3] + p[4]] : null;
}
function bindPos(d, i, out) {
  // position of vertex i (only used on head parts, which the re-pose leaves untouched)
  return out.set(d.pos[i * 3] / 32767 * d.scale[0], d.pos[i * 3 + 1] / 32767 * d.scale[1], d.pos[i * 3 + 2] / 32767 * d.scale[2]);
}

// ------------------------------------------------------------------ clips
// A kit clip retargeted to the game skeleton, stored as the game's ZXY euler pose channels.
export class KitClip {
  constructor(meta, frames, fps) {
    Object.assign(this, meta);
    this.fps = fps;
    this.eul = frames.eul;      // frames x 20 x 3
    this.root = frames.root;    // frames x 3   hips offset from rest (vertical root motion folded in)
    this.motion = frames.motion; // frames x 2  horizontal root travel (x, z) in actor space
    this.cane = frames.cane;    // frames x 4   cane bone local quaternion (null on rigs without one)
  }
  _frame(t) {
    const d = this.duration;
    t = this.loop ? ((t % d) + d) % d : Math.max(0, Math.min(d, t));
    const f = t / d * (this.frames - 1);
    const f0 = Math.min(this.frames - 2, Math.floor(f));
    return [f0, f - f0];
  }
  // write the pose at time t (seconds) into a game Pose
  sample(pose, t) {
    const [f0, a] = this._frame(t), NB = BONES.length, e = this.eul;
    const o0 = f0 * NB * 3, o1 = o0 + NB * 3;
    for (let i = 0; i < NB * 3; i++) {
      let d = e[o1 + i] - e[o0 + i];
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      pose.r[i] = e[o0 + i] + d * a;
    }
    const r = this.root;
    pose.root.set(r[f0 * 3] + (r[f0 * 3 + 3] - r[f0 * 3]) * a, r[f0 * 3 + 1] + (r[f0 * 3 + 4] - r[f0 * 3 + 1]) * a, r[f0 * 3 + 2] + (r[f0 * 3 + 5] - r[f0 * 3 + 2]) * a);
    return pose;
  }
  // horizontal root travel (z forward) at time t
  travel(t) {
    const [f0, a] = this._frame(t), m = this.motion;
    return m[f0 * 2 + 1] + (m[f0 * 2 + 3] - m[f0 * 2 + 1]) * a;
  }
  caneQuat(t, out) {
    if (!this.cane) return null;
    const [f0, a] = this._frame(t), c = this.cane;
    return out.set(c[f0 * 4], c[f0 * 4 + 1], c[f0 * 4 + 2], c[f0 * 4 + 3]).slerp(_q.set(c[f0 * 4 + 4], c[f0 * 4 + 5], c[f0 * 4 + 6], c[f0 * 4 + 7]), a);
  }
}

function retargetClips(entry, buf, joints, rp, hipsRest, cane) {
  if (!entry.anim || !buf) return {};
  const A = entry.anim, NB = BONES.length, out = {};
  const kitIdx = A.bones.map(b => rp.by[b]);
  const iRoot = A.bones.indexOf('Root'), iHips = A.bones.indexOf('Hips'), iCane = A.bones.indexOf('Cane');
  const qInv = rp.W.map(q => q.clone().invert());
  const q = new THREE.Quaternion(), qr = new THREE.Quaternion(), ph = new THREE.Vector3(), pr = new THREE.Vector3();
  for (const c of A.clips) {
    const data = new Float32Array(buf, c.offset, c.frames * A.stride);
    const eul = new Float32Array(c.frames * NB * 3), root = new Float32Array(c.frames * 3), motion = new Float32Array(c.frames * 2);
    const caneQ = cane && iCane >= 0 ? new Float32Array(c.frames * 4) : null;
    for (let f = 0; f < c.frames; f++) {
      const o = f * A.stride, rq = (k) => q.set(data[o + k * 4], data[o + k * 4 + 1], data[o + k * 4 + 2], data[o + k * 4 + 3]);
      const pOff = o + A.bones.length * 4;
      qr.set(data[o + iRoot * 4], data[o + iRoot * 4 + 1], data[o + iRoot * 4 + 2], data[o + iRoot * 4 + 3]);
      pr.set(data[pOff], data[pOff + 1], data[pOff + 2]);
      ph.set(data[pOff + 3], data[pOff + 4], data[pOff + 5]).applyQuaternion(qr);
      // hips carry the root's height; its horizontal travel is handed to the actor (root motion)
      root[f * 3] = ph.x - hipsRest[0]; root[f * 3 + 1] = ph.y + pr.y - hipsRest[1]; root[f * 3 + 2] = ph.z - hipsRest[2];
      motion[f * 2] = pr.x; motion[f * 2 + 1] = pr.z;
      A.bones.forEach((name, k) => {
        if (k === iRoot) return;
        const ki = kitIdx[k], pi = joints[ki].parent;
        rq(k);
        if (k === iHips) q.premultiply(qr);                       // root rotation folds into the hips
        else q.premultiply(rp.W[pi]);
        q.multiply(qInv[ki]);
        if (k === iCane) { if (caneQ) caneQ.set([q.x, q.y, q.z, q.w], f * 4); return; }
        const g = gameBoneOf(name, false);
        _e.setFromQuaternion(q, 'ZXY');
        eul[(f * NB + g) * 3] = _e.x; eul[(f * NB + g) * 3 + 1] = _e.y; eul[(f * NB + g) * 3 + 2] = _e.z;
      });
    }
    out[c.name] = new KitClip({ name: c.name, duration: c.duration, loop: c.loop, rootMotion: c.rootMotion, events: c.events, frames: c.frames }, { eul, root, motion, cane: caneQ }, A.fps);
  }
  return out;
}

// ------------------------------------------------------------------ material
const KIT_PARS = /* glsl */`
attribute float kitRegion;
varying float vKitRegion; varying vec3 vObj;
`;
const KIT_FRAG_PARS = /* glsl */`
varying float vKitRegion; varying vec3 vObj;
uniform vec4 uBlood[10]; uniform float uBloodAmt; uniform float uDecay; uniform float uDirt; uniform float uSeed; uniform float uWetness;
uniform vec3 uSkinTint; uniform vec3 uClothTint; uniform float uEyeGlow; uniform vec3 uEyeCol;
uniform vec4 uFace; uniform vec4 uEyes; uniform vec3 uMouth3; uniform vec3 uChest3; uniform vec3 uHandL3; uniform vec3 uHandR3;
float kh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kh(i), kh(i + vec3(1,0,0)), f.x), mix(kh(i + vec3(0,1,0)), kh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(kh(i + vec3(0,0,1)), kh(i + vec3(1,0,1)), f.x), mix(kh(i + vec3(0,1,1)), kh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float kfbm(vec3 p) { return kn(p) * 0.5 + kn(p * 2.1 + 3.3) * 0.3 + kn(p * 4.3 + 7.1) * 0.2; }
float kitRough; float kitHeight; vec3 kitEyeGlow; vec4 kitNR;
float isReg(float r, float id) { return 1.0 - step(0.5, abs(r - id)); }
vec3 kitPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - grad);
}
`;
// Regions (manifest.regions): 0 face 1 skin 2 cloth 3 lower 4 hair 5 torsoFront 6 torsoBack 7 sleeve 8 gear 9 shoe 10 accent 11 shirt 12 nail
const KIT_ALBEDO = /* glsl */`
{
  float rg = floor(vKitRegion + 0.5);
  float face = isReg(rg, 0.0);
  float skin = clamp(face + isReg(rg, 1.0) + isReg(rg, 12.0), 0.0, 1.0);
  float hair = isReg(rg, 4.0);
  float garment = clamp(isReg(rg, 2.0) + isReg(rg, 3.0) + isReg(rg, 5.0) + isReg(rg, 6.0) + isReg(rg, 7.0), 0.0, 1.0);
  float shirt = isReg(rg, 11.0);
  vec3 op = vObj;
  vec3 col = diffuseColor.rgb;
  float n1 = kfbm(op * 18.0 + uSeed), n2 = kfbm(op * 5.0 + uSeed * 2.0), n3 = kfbm(op * 9.0 - uSeed);
  // ---- dead skin: desaturated toward a grey-green pallor, mottled, bruised, veined
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 dead = mix(vec3(lum), col, 0.38) * uSkinTint * (0.62 + 0.3 * n1);
  dead = mix(dead, dead * vec3(0.58, 0.46, 0.62), smoothstep(0.55, 0.8, n2) * 0.8);
  float veins = 1.0 - smoothstep(0.0, 0.03, abs(kn(op * 30.0 + uSeed) - 0.5));
  dead = mix(dead, vec3(0.13, 0.15, 0.2) * (lum * 1.6 + 0.05), veins * 0.42 * (1.0 - face * 0.5));
  col = mix(col, dead, skin * uDecay);
  // ---- face tile (registered): sunken, bruised sockets and milky dead eyes
  vec2 fu = (vMapUv * 2048.0 - uFace.xy) / uFace.zw;
  vec2 dl = (fu - uEyes.xy) * vec2(1.0, 1.55), dr = (fu - uEyes.zw) * vec2(1.0, 1.55);
  float de = min(length(dl), length(dr));
  float socket = smoothstep(0.15, 0.05, de) * face;
  col = mix(col, col * vec3(0.5, 0.36, 0.38), socket * 0.55 * uDecay);
  float iris = smoothstep(0.034, 0.016, de) * face;
  col = mix(col, vec3(0.6, 0.6, 0.53) * (0.8 + 0.3 * n1), iris * 0.7 * uDecay);
  kitEyeGlow = uEyeCol * iris * uEyeGlow;
  // ---- gore anchored in bind space: mouth, chin drips down the neck and chest, chest blotch, hands
  vec3 dm = (op - uMouth3) * vec3(1.0, 1.25, 1.0);
  float mouth = smoothstep(0.05, 0.012, length(dm) + (n3 - 0.5) * 0.02);
  float cx = op.x * 110.0 + uSeed;
  float hcol = fract(sin(floor(cx) * 91.7 + uSeed) * 4375.5);
  float dripLen = 0.06 + hcol * 0.34;
  float drip = step(0.7, hcol) * smoothstep(0.32, 0.08, abs(fract(cx) - 0.5)) * step(op.y, uMouth3.y - 0.01)
             * smoothstep(uMouth3.y - dripLen * hcol, uMouth3.y - dripLen * 0.3, op.y) * smoothstep(0.06, 0.02, abs(op.x - uMouth3.x))
             * step(uMouth3.z - 0.09, op.z);
  float chest = smoothstep(0.16, 0.0, length((op - uChest3) * vec3(1.4, 0.7, 1.0)) + (n2 - 0.5) * 0.12) * step(uChest3.z - 0.1, op.z) * smoothstep(0.45, 0.7, n3);
  float hands = smoothstep(0.1, 0.0, min(length(op - uHandL3), length(op - uHandR3)) - 0.03) * smoothstep(0.3, 0.6, n2);
  float dried = clamp((mouth * 1.3 + drip * 0.9 + chest * 0.75 + hands * 0.9) * uDecay, 0.0, 1.0);
  // ---- clothing: palette tint, grime, mud at the hem, collars soaked through
  // the kit's photographic atlas runs 3-4x brighter than the game's fabrics (humanoid.js): bring
  // garments, gear and shoes into the same range; reflective accents keep their flare
  col *= mix(vec3(1.0), uClothTint * 0.42, garment);
  col *= 1.0 - 0.45 * clamp(isReg(rg, 8.0) + isReg(rg, 9.0) + shirt, 0.0, 1.0);
  float grime = kfbm(op * 7.0 + 9.0);
  col *= 1.0 - (garment + shirt) * uDirt * 0.35 * grime;
  col = mix(col, col * vec3(0.55, 0.47, 0.38), (garment + isReg(rg, 9.0)) * smoothstep(0.45, 0.08, op.y) * uDirt * 0.7);
  col = mix(col, col * vec3(0.8, 0.72, 0.55), shirt * uDecay * 0.6);
  // ---- dynamic wounds (humanoid.js addBlood: bind-space splats with drips)
  float wound = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 b = uBlood[i];
    if (b.w <= 0.0) continue;
    float d = length(op - b.xyz);
    float edge = b.w * (0.75 + 0.5 * kn(op * 60.0 + float(i)));
    wound = max(wound, smoothstep(edge, edge * 0.35, d));
    vec2 dd = op.xz - b.xz;
    float run = smoothstep(0.012, 0.0, abs(dd.x + 0.004 * sin(op.y * 60.0))) * step(op.y, b.y) * smoothstep(b.y - 0.35 * b.w * 6.0, b.y, op.y);
    wound = max(wound, run * 0.8 * step(0.6, kn(vec3(float(i) * 7.0, 0.0, 0.0) + 1.0)));
  }
  float blood = max(dried, wound * uBloodAmt);
  col = mix(col, mix(vec3(0.15, 0.03, 0.022), vec3(0.28, 0.02, 0.014), wound), blood * (1.0 - hair * 0.4));
  diffuseColor.rgb = col;
  // ---- surface response
#ifdef USE_NORMALMAP
  kitNR = texture2D(normalMap, vNormalMapUv);
  kitRough = kitNR.b;
#else
  kitNR = vec4(0.5, 0.5, 1.0, 1.0);
  kitRough = 0.55 * skin + 0.72 * hair + 0.86 * (1.0 - skin - hair);
#endif
  kitRough = mix(kitRough, 0.16, iris * 0.8);                      // wet eyes catch the flashlight
  kitRough = mix(kitRough, mix(0.55, 0.22, wound), blood * 0.85);
  kitRough = mix(kitRough, kitRough * 0.6, uWetness);
  kitHeight = lum * (1.0 - hair * 0.5) + n1 * 0.3 * uDecay * skin;
}
`;

// Kit material: kit atlas + zombification + game blood (uniform layout matches makeCharacterMaterial).
export function makeKitMaterial(tpl, o = {}) {
  const tex = tpl.tex;
  const mat = new THREE.MeshStandardMaterial({ map: tex.d, normalMap: tex.nr || null, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
  if (tex.nr) { mat.normalScale.set(0.55, 0.55); mat.defines = { USE_PACKED_NORMALMAP: '' }; }
  const blood = []; for (let i = 0; i < 10; i++) blood.push(new THREE.Vector4(0, 0, 0, 0));
  const a = tpl.anchors;
  const u = {
    uBlood: { value: blood }, uBloodAmt: { value: 1 }, uDecay: { value: o.decay ?? 1 }, uDirt: { value: o.dirt ?? 0.5 },
    uSeed: { value: o.seed ?? Math.random() * 50 }, uWetness: { value: o.wet ?? 0 },
    uSkinTint: { value: new THREE.Color(o.skinTint ?? 0xb9bca6) }, uClothTint: { value: new THREE.Color(o.clothTint ?? 0xffffff) },
    uEyeGlow: { value: 0 }, uEyeCol: { value: new THREE.Color(0xfff4d0).multiplyScalar(2.2) },
    uFace: { value: a.face }, uEyes: { value: a.eyes }, uMouth3: { value: a.mouth }, uChest3: { value: a.chest }, uHandL3: { value: a.handL }, uHandR3: { value: a.handR },
  };
  mat.userData.u = u;
  mat.customProgramCacheKey = () => 'kit1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + KIT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitRegion = kitRegion; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + KIT_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + KIT_ALBEDO)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kitRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kitEyeGlow;')
      .replace('#include <normal_fragment_maps>', tex.nr ? '#include <normal_fragment_maps>'
        : '#include <normal_fragment_maps>\nnormal = kitPerturb(-vViewPosition, normal, vec2(dFdx(kitHeight), dFdy(kitHeight)) * 0.04, faceDirection);');
  };
  return mat;
}

// ------------------------------------------------------------------ template
// Stand-in for humanoid.js BodyTemplate: joint table J, shared geometry (near + distance LOD), plus the
// hooks Body and Zombie use for kit bodies (buildBones, makeMaterial, clips, archetype).
export class KitTemplate {
  constructor(kit, id, o = {}) {
    const entry = kit.manifest.enemies.find(e => e.id === id);
    const set = kit.sets[id];
    if (!entry || !set) throw new Error('enemy kit: no ' + id);
    this.kit = id;
    this.entry = entry;
    this.arch = ARCHETYPES[id];
    this.tex = set.tex;
    this.style = o.style || {};                 // per-template material defaults (tints, decay)
    const scale = entry.height / 1.8;
    this.opts = { height: scale, zombie: this.style.decay ?? 1, kit: id, label: entry.label };
    const joints = entry.joints;
    const lods = kit.lods;
    const near = decodeLod(set.geo[lods[0]], entry.lods[lods[0]]);
    // cane length from its geometry (bind space, kit T-pose): hand joint to the lowest point of the tip
    let cane = null;
    if (entry.cane) {
      const cj = joints.find(j => j.name === 'Cane').world;
      let lo = Infinity;
      for (const nm of ['Prop / cane shaft', 'Prop / cane rubber tip']) {
        const r = partVertices(near, nm);
        if (r) for (let i = r[0]; i < r[1]; i++) lo = Math.min(lo, near.pos[i * 3 + 1] / 32767 * near.scale[1]);
      }
      if (lo < Infinity) cane = { length: cj[1] - lo };
    }
    this.hasCane = !!cane;
    const rp = reposeRig(joints, { curl: o.curl ?? 0.55, cane });
    const key = `${id}|${(o.drop || []).join(',')}|${o.curl ?? 0.55}`;
    const cached = kit.cache[key];
    if (cached) { this.geometry = cached.geometry; this.geometryLod = cached.geometryLod; }
    else {
      this.geometry = buildLodGeometry(near, joints, rp, { cane, drop: o.drop });
      this.geometryLod = lods[1] && set.geo[lods[1]] ? buildLodGeometry(decodeLod(set.geo[lods[1]], entry.lods[lods[1]]), joints, rp, { cane, drop: o.drop }) : this.geometry;
      kit.cache[key] = { geometry: this.geometry, geometryLod: this.geometryLod };
    }
    // joint table in the game's naming (ragdoll, hit capsules, eyes)
    const P = (name) => rp.P[rp.by[name]].toArray();
    const J = {
      hips: P('Hips'), spine: P('Spine'), chest: P('Chest'), neck: P('Neck'), head: P('Head'), jaw: P('Jaw'),
    };
    for (const [s, G, K] of [[1, 'L_', 'L_'], [-1, 'R_', 'R_']]) {
      J[G + 'clav'] = P(K + 'Clavicle'); J[G + 'upper'] = P(K + 'UpperArm'); J[G + 'fore'] = P(K + 'Forearm'); J[G + 'hand'] = P(K + 'Hand');
      const hl = rp.bind[rp.by[K + 'Finger1B']].distanceTo(rp.bind[rp.by[K + 'Hand']]) + 0.03;
      const dir = _v.set(s * Math.sin(ARM_ANGLE), -Math.cos(ARM_ANGLE), ARM_DIRS[2][2]).normalize();
      J[G + 'tip'] = [J[G + 'hand'][0] + dir.x * hl, J[G + 'hand'][1] + dir.y * hl, J[G + 'hand'][2] + dir.z * hl];
      J[G + 'thigh'] = P(K + 'Thigh'); J[G + 'shin'] = P(K + 'Calf'); J[G + 'foot'] = P(K + 'Foot'); J[G + 'toe'] = P(K + 'Toe');
    }
    // skull top from the head surfaces (not the hat), so the head capsule hugs the skull
    let top = -Infinity;
    for (const nm of ['Head / registered face', 'Head / back']) {
      const r = partVertices(near, nm);
      if (r) for (let i = r[0]; i < r[1]; i++) top = Math.max(top, near.pos[i * 3 + 1] / 32767 * near.scale[1]);
    }
    J.headTop = [J.head[0], (top > 0 ? top : J.head[1] + 0.19) - 0.02, J.head[2]];
    this.J = J;
    if (cane) this.caneJ = rp.P[rp.by.Cane].toArray();
    this.anchors = this.faceAnchors(kit.manifest, near, J);
    // hardhat / helmet: shots landing above the brow (head-bone space) glance off (zombie.js armourHit)
    const hh = this.arch.hardHead;
    this.hardHead = hh && !(o.drop || []).includes(hh) ? { brow: this.anchors.eye.y + 0.03 - J.head[1] } : null;
    this.clips = retargetClips(entry, set.anim, joints, rp, J.hips, cane);
  }

  // Shader anchors: face tile + eye landmarks (atlas px / face UV), mouth, chest and palms in bind space.
  faceAnchors(man, d, J) {
    const F = man.atlas.face, lm = man.atlas.landmarks;
    const face = new THREE.Vector4(F[0], F[1], F[2], F[3]);
    const eyes = new THREE.Vector4(lm.eyeLeft[0], lm.eyeLeft[1], lm.eyeRight[0], lm.eyeRight[1]);
    // the face vertex whose UV sits on a landmark
    const r = partVertices(d, 'Head / registered face');
    const onFace = (l, fallback) => {
      const out = new THREE.Vector3(...fallback);
      if (!r) return out;
      const mu = (F[0] + l[0] * F[2]) / man.atlas.size, mv = (F[1] + l[1] * F[3]) / man.atlas.size;
      let best = Infinity;
      for (let i = r[0]; i < r[1]; i++) {
        const du = d.uv[i * 2] / 65535 - mu, dv = d.uv[i * 2 + 1] / 65535 - mv;
        if (du * du + dv * dv < best) { best = du * du + dv * dv; bindPos(d, i, out); }
      }
      return out;
    };
    const mouth = onFace(lm.mouth, [J.head[0], J.head[1] - 0.02, J.head[2] + 0.1]);
    const eye = onFace(lm.eyeLeft, [J.head[0], J.head[1] + 0.07, J.head[2] + 0.09]);
    const chest = new THREE.Vector3(J.chest[0], J.chest[1] + 0.02, J.chest[2] + 0.12);
    const palm = (s) => { const h = J[s + 'hand'], t = J[s + 'tip']; return new THREE.Vector3((h[0] + t[0]) / 2, (h[1] + t[1]) / 2, (h[2] + t[2]) / 2); };
    return { face, eyes, eye, mouth, chest, handL: palm('L_'), handR: palm('R_') };
  }

  buildBones() {
    const bones = buildSkeleton(this.J);
    if (this.caneJ) {
      const c = new THREE.Bone();
      c.name = 'cane';
      const h = this.J.R_hand;
      c.position.set(this.caneJ[0] - h[0], this.caneJ[1] - h[1], this.caneJ[2] - h[2]);
      bones[BI.R_hand].add(c);
      bones.push(c);
    }
    return bones;
  }

  makeMaterial(o = {}) {
    const st = this.style;
    const pick = (v) => Array.isArray(v) ? v[(Math.random() * v.length) | 0] : v;
    return makeKitMaterial(this, {
      decay: o.decay ?? st.decay ?? 1, dirt: o.dirt ?? st.dirt ?? 0.5 + Math.random() * 0.3, seed: o.seed ?? Math.random() * 50,
      skinTint: o.skinTint ?? pick(st.skinTint ?? [0xb9bca6, 0xc0b8a4, 0xa9b39e, 0xbcb0a8]), clothTint: o.clothTint ?? pick(st.clothTint ?? 0xffffff),
    });
  }
}

// Decoded kit shared by all templates: raw buffers from Assets, chosen LODs, geometry cache.
export function kitFromAssets(assets) {
  const e = assets.enemies;
  if (!e) return null;
  return { manifest: e.manifest, sets: e.sets, lods: assets.enemyLods, cache: {} };
}

// Procedural poses: counter-rotate the cane against the arm chain so it keeps (w of) its bind
// orientation relative to the actor instead of swinging with the fist.
const CANE_CHAIN = [BI.hips, BI.spine, BI.chest, BI.R_clav, BI.R_upper, BI.R_fore, BI.R_hand];
const _ident = new THREE.Quaternion();
export function steadyCane(bones, w = 0.85) {
  const q = _q.identity();
  for (const b of CANE_CHAIN) q.multiply(bones[b].quaternion);
  bones[CANE].quaternion.copy(q.invert()).slerp(_ident, 1 - w);
}
