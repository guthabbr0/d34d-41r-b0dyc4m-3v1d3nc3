// Procedural animation for the humanoid skeleton. Poses are per-bone euler triples (ZXY order:
// twist about the bone, then swing x, then abduction z) plus a root offset; layers blend by weight.
import * as THREE from 'three';
import { BONES, BI } from './humanoid.js';

const NB = BONES.length;

export class Pose {
  constructor() { this.r = new Float32Array(NB * 3); this.root = new THREE.Vector3(); this.rootRotY = 0; }
  clear() { this.r.fill(0); this.root.set(0, 0, 0); this.rootRotY = 0; return this; }
  set(b, x, y = 0, z = 0) { const i = b * 3; this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z; return this; }
  addB(b, x, y = 0, z = 0, w = 1) { const i = b * 3; this.r[i] += x * w; this.r[i + 1] += y * w; this.r[i + 2] += z * w; }
  blend(o, w) {
    for (let i = 0; i < this.r.length; i++) this.r[i] += (o.r[i] - this.r[i]) * w;
    this.root.lerp(o.root, w); this.rootRotY += (o.rootRotY - this.rootRotY) * w;
    return this;
  }
  copy(o) { this.r.set(o.r); this.root.copy(o.root); this.rootRotY = o.rootRotY; return this; }
}

const _e = new THREE.Euler(0, 0, 0, 'ZXY');
export function applyPose(body, pose) {
  const bones = body.bones;
  for (let b = 0; b < NB; b++) {
    const i = b * 3;
    _e.set(pose.r[i], pose.r[i + 1], pose.r[i + 2], 'ZXY');
    bones[b].quaternion.setFromEuler(_e);
  }
  const hip = bones[0];
  hip.position.copy(body.rest[0]).add(pose.root);
}

// side helpers: abduction sign so that +abd lifts the arm/leg away from the body on both sides
const SIDES = [[1, 'L_'], [-1, 'R_']];

// ------------------------------------------------------------------ poses
export function poseIdle(p, t, o = {}) {
  const sway = Math.sin(t * 0.9 + (o.seed || 0)) * 0.05;
  p.set(BI.spine, 0.12 + sway * 0.4, sway * 0.3, sway * 0.5);
  p.set(BI.chest, 0.1, sway * 0.2, 0);
  p.set(BI.neck, 0.15, 0, 0);
  p.set(BI.head, 0.12 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.43 + 1) * 0.25, (o.headTilt ?? 0.25));
  p.set(BI.jaw, 0.08 + Math.max(0, Math.sin(t * 1.7)) * 0.12);
  for (const [s, P] of SIDES) {
    p.set(BI[P + 'upper'], 0.08 + sway * 0.3 * s, 0, -0.28 * s);
    p.set(BI[P + 'fore'], -0.35, 0, 0);
    p.set(BI[P + 'hand'], -0.2, 0, 0);
    p.set(BI[P + 'thigh'], -0.05, 0, 0.02 * s);
    p.set(BI[P + 'shin'], 0.12, 0, 0);
    p.set(BI[P + 'foot'], -0.07, 0, 0);
  }
  p.root.set(0, -0.03, 0);
  return p;
}

// Shambling walk. phase in radians; stride params; reach (0..1) arms forward.
export function poseShamble(p, phase, o = {}) {
  const A = o.stride ?? 0.38, K = o.knee ?? 0.9, limp = o.limp ?? 0.3, reach = o.reach ?? 0.5, lean = o.lean ?? 0.3;
  const sL = Math.sin(phase), cL = Math.cos(phase);
  // left leg
  const thighL = -A * sL, thighR = A * sL * (1 - limp * 0.5);
  const kneeL = 0.1 + K * Math.pow(Math.max(0, cL), 1.5);
  const kneeR = 0.1 + K * (1 - limp) * Math.pow(Math.max(0, -cL), 1.5);
  p.set(BI.L_thigh, thighL, -0.05, 0.03);
  p.set(BI.R_thigh, thighR, 0.05, -0.03 - limp * 0.06);
  p.set(BI.L_shin, kneeL, 0, 0);
  p.set(BI.R_shin, kneeR, 0, 0);
  p.set(BI.L_foot, -(thighL + kneeL) * 0.75, 0, 0);
  p.set(BI.R_foot, -(thighR + kneeR) * 0.75 + limp * 0.25, 0, 0);
  const bob = Math.abs(cL);
  p.root.set(Math.sin(phase) * 0.03, -0.04 - bob * 0.035 - limp * 0.02 * Math.max(0, -sL), 0);
  p.set(BI.hips, 0, sL * 0.1, sL * 0.05 + limp * 0.05);
  p.set(BI.spine, lean * 0.6, -sL * 0.08, -sL * 0.06);
  p.set(BI.chest, lean * 0.5, -sL * 0.07, -sL * 0.04 - limp * 0.06);
  p.set(BI.neck, 0.1 - lean * 0.2, 0, 0);
  p.set(BI.head, -0.1 + Math.sin(phase * 0.5) * 0.08, Math.sin(phase * 0.25) * 0.2, 0.2 + sL * 0.06);
  p.set(BI.jaw, 0.1 + Math.max(0, Math.sin(phase * 0.7)) * 0.2);
  // arms: blend dangling swing and zombie reach
  for (const [s, P] of SIDES) {
    const sw = s > 0 ? sL : -sL;
    const dangleX = sw * 0.25, reachX = -1.25 + Math.sin(phase * 0.5 + s) * 0.12;
    p.set(BI[P + 'upper'], dangleX * (1 - reach) + reachX * reach, (0.1 * (1 - reach) - 1.1 * reach) * s, (-0.28 * (1 - reach) - 0.06 * reach) * s);
    p.set(BI[P + 'fore'], -0.3 - reach * 0.35 + Math.sin(phase + s) * 0.08, 0, 0);
    p.set(BI[P + 'hand'], -0.3 * reach, 0, 0);
  }
  return p;
}

// Sprinting "fresh" infected: arms flailing, strong lean.
export function poseRun(p, phase, o = {}) {
  const sL = Math.sin(phase), cL = Math.cos(phase);
  const A = 0.75;
  const thighL = -A * sL, thighR = A * sL;
  p.set(BI.L_thigh, thighL - 0.2, 0, 0.03);
  p.set(BI.R_thigh, thighR - 0.2, 0, -0.03);
  p.set(BI.L_shin, 0.3 + 1.4 * Math.max(0, cL), 0, 0);
  p.set(BI.R_shin, 0.3 + 1.4 * Math.max(0, -cL), 0, 0);
  p.set(BI.L_foot, -thighL * 0.4, 0, 0);
  p.set(BI.R_foot, -thighR * 0.4, 0, 0);
  p.root.set(0, -0.08 - Math.abs(cL) * 0.05, 0);
  p.set(BI.hips, 0.1, sL * 0.2, 0);
  p.set(BI.spine, 0.4, -sL * 0.15, 0);
  p.set(BI.chest, 0.25, -sL * 0.15, 0);
  p.set(BI.neck, -0.25, 0, 0);
  p.set(BI.head, -0.2, sL * 0.1, 0.1);
  p.set(BI.jaw, 0.45);
  for (const [s, P] of SIDES) {
    const sw = s > 0 ? -sL : sL;
    p.set(BI[P + 'upper'], -0.9 + sw * 0.7, 0, -0.2 * s);
    p.set(BI[P + 'fore'], -0.8 + sw * 0.3, 0, 0);
    p.set(BI[P + 'hand'], -0.3, 0, 0);
  }
  return p;
}

// Lunge / swipe attack, t in [0,1]
export function poseAttack(p, t, o = {}) {
  const wind = Math.min(1, t / 0.35), strike = THREE.MathUtils.smoothstep(t, 0.35, 0.55), rec = THREE.MathUtils.smoothstep(t, 0.6, 1);
  const k = strike * (1 - rec);
  p.set(BI.spine, 0.1 + 0.35 * k - 0.15 * wind * (1 - strike), 0, 0);
  p.set(BI.chest, 0.1 + 0.3 * k, 0, 0);
  p.set(BI.neck, -0.1 + 0.2 * k, 0, 0);
  p.set(BI.head, -0.25 * k, 0, 0.1);
  p.set(BI.jaw, 0.2 + 0.4 * k + 0.2 * wind);
  for (const [s, P] of SIDES) {
    p.set(BI[P + 'upper'], -1.6 * wind * (1 - k) - 1.1 * k, -0.9 * s * (wind * (1 - k) + k * 0.7), (-0.1 + 0.25 * wind * (1 - k)) * s);
    p.set(BI[P + 'fore'], -0.9 * (1 - k) - 0.25 * k, 0, 0);
    p.set(BI[P + 'hand'], -0.3, 0, 0);
    p.set(BI[P + 'thigh'], s > 0 ? -0.35 * k : 0.15 * k, 0, 0);
    p.set(BI[P + 'shin'], s > 0 ? 0.3 * k + 0.1 : 0.25, 0, 0);
    p.set(BI[P + 'foot'], s > 0 ? 0.05 : -0.2 * k, 0, 0);
  }
  p.root.set(0, -0.06 * k, 0.12 * k);
  return p;
}

// Kneeling over a body, tearing at it.
export function poseFeed(p, t, o = {}) {
  const chew = Math.sin(t * 7.0) * 0.5 + 0.5, tug = Math.max(0, Math.sin(t * 1.3)) ** 3;
  p.root.set(0, -0.5, -0.15);
  p.set(BI.hips, 0.25, 0, 0);
  p.set(BI.spine, 0.45 + tug * 0.1, 0, 0);
  p.set(BI.chest, 0.4 - tug * 0.25, Math.sin(t * 0.8) * 0.1, 0);
  p.set(BI.neck, 0.3 - tug * 0.2, 0, 0);
  p.set(BI.head, 0.35 - tug * 0.5, Math.sin(t * 3.1) * 0.12, Math.sin(t * 2.3) * 0.15);
  p.set(BI.jaw, 0.15 + chew * 0.35);
  for (const [s, P] of SIDES) {
    p.set(BI[P + 'thigh'], -1.35, 0, 0.12 * s);
    p.set(BI[P + 'shin'], 2.25, 0, 0);
    p.set(BI[P + 'foot'], 0.6, 0, 0);
    p.set(BI[P + 'upper'], -0.95 + tug * 0.4 * (s > 0 ? 1 : 0.6), 0.2 * s, -0.15 * s);
    p.set(BI[P + 'fore'], -0.7 - tug * 0.3, 0, 0);
    p.set(BI[P + 'hand'], -0.4, 0, 0);
  }
  return p;
}

// Crawling/rising from the floor for scripted moments (t 0 lying -> 1 standing).
export function poseRise(p, t) {
  const k = THREE.MathUtils.smoothstep(t, 0, 1);
  poseFeed(p, t * 3);
  const s = new Pose(); poseIdle(s, t * 2);
  p.blend(s, k);
  p.root.y = -0.5 * (1 - k);
  return p;
}

// Hit-reaction spring layer: additive angles per bone, critically damped back to zero.
export class HitReact {
  constructor() { this.a = new Float32Array(NB * 3); this.v = new Float32Array(NB * 3); this.push = new THREE.Vector3(); }
  impulse(b, x, y, z) { const i = b * 3; this.v[i] += x; this.v[i + 1] += y; this.v[i + 2] += z; }
  update(dt) {
    const k = 160, c = 2 * Math.sqrt(k) * 0.7;
    for (let i = 0; i < this.a.length; i++) {
      const acc = -k * this.a[i] - c * this.v[i];
      this.v[i] += acc * dt;
      this.a[i] += this.v[i] * dt;
    }
  }
  applyTo(p, w = 1) { for (let i = 0; i < this.a.length; i++) p.r[i] += this.a[i] * w; }
}
