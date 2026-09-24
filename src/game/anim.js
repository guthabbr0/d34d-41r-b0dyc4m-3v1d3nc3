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
    const r = this.r, q = o.r;
    for (let i = 0; i < r.length; i += 3) {
      // near the ZXY singularity (swing ~90 degrees, e.g. the crawler's IK arms) the same rotation can
      // flip to a different euler triple between frames; blend those through quaternions instead
      if (Math.abs(q[i + 1] - r[i + 1]) > 1.6 || Math.abs(q[i + 2] - r[i + 2]) > 1.6) {
        _ba.setFromEuler(_be.set(r[i], r[i + 1], r[i + 2], 'ZXY'));
        _bb.setFromEuler(_be.set(q[i], q[i + 1], q[i + 2], 'ZXY'));
        _be.setFromQuaternion(_ba.slerp(_bb, w), 'ZXY');
        r[i] = _be.x; r[i + 1] = _be.y; r[i + 2] = _be.z;
      } else for (let k = i; k < i + 3; k++) r[k] += (q[k] - r[k]) * w;
    }
    this.root.lerp(o.root, w); this.rootRotY += (o.rootRotY - this.rootRotY) * w;
    return this;
  }
  copy(o) { this.r.set(o.r); this.root.copy(o.root); this.rootRotY = o.rootRotY; return this; }
}

const _e = new THREE.Euler(0, 0, 0, 'ZXY');
const _be = new THREE.Euler(0, 0, 0, 'ZXY'), _ba = new THREE.Quaternion(), _bb = new THREE.Quaternion();
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

// ------------------------------------------------------------------ crawler gait
// On all fours with analytic IK so palms and knees meet the floor for any limb proportions (J = the
// template's bind joints). The torso is posed by FK; each limb then aims at a contact point that stays
// planted while the body passes over it (stance) and swings forward, lifted, to the next one.
// gallop 0 = prowl on hands and knees, 1 = bear-crawl sprint with the knees off the floor.
// phase in cycles (one cycle = one stride of every limb, `stride` metres of travel).
const _cq = [], _cp = [];
for (let i = 0; i < 24; i++) { _cq.push(new THREE.Quaternion()); _cp.push(new THREE.Vector3()); }
const _ce = new THREE.Euler(0, 0, 0, 'ZXY'), _cv = new THREE.Vector3(), _cw = new THREE.Vector3(), _cu = new THREE.Vector3();
const _cqa = new THREE.Quaternion(), _cqb = new THREE.Quaternion();
const jv = (J, n, out) => out.set(J[n][0], J[n][1], J[n][2]);
const qOf = (p, b, out) => out.setFromEuler(_ce.set(p.r[b * 3], p.r[b * 3 + 1], p.r[b * 3 + 2], 'ZXY'));
function setLocal(p, b, qParentWorld, qWorld) {
  _cqa.copy(qParentWorld).invert().multiply(qWorld);
  _ce.setFromQuaternion(_cqa, 'ZXY');
  p.set(b, _ce.x, _ce.y, _ce.z);
}
// world rotation that takes the bind direction a->b (J) onto dir, composed after qParentWorld's frame
function aimWorld(J, a, b, qParentWorld, dir, out) {
  const bind = jv(J, b, _cu).sub(jv(J, a, _cw)).normalize().applyQuaternion(qParentWorld);
  return out.setFromUnitVectors(bind, _cv.copy(dir).normalize()).multiply(qParentWorld);
}
// two-bone IK: elbow/knee position for a chain root -> target with lengths l1, l2, bending toward pole
function solveTwo(root, target, l1, l2, pole, outMid) {
  const d = _cv.subVectors(target, root);
  const len = Math.min(d.length(), (l1 + l2) * 0.999);
  d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = _cw.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return outMid.copy(root).addScaledVector(d, a).addScaledVector(side, h);
}

export function poseCrawl(p, J, phase, o = {}) {
  const g = o.gallop ?? 0, stride = o.stride ?? 0.5, t = o.t ?? 0;
  const tau = Math.PI * 2, ph = phase * tau;
  // torso: pitched forward, rising at the shoulders; hips roll and yaw with the diagonal gait
  const pitch = 1.22 + g * 0.16;
  const bob = Math.abs(Math.sin(ph)) * (0.015 + g * 0.05);
  p.root.set(Math.sin(ph) * 0.02, (0.49 + g * 0.05) - J.hips[1] + bob, -0.12);
  p.set(BI.hips, pitch, Math.sin(ph) * 0.12, Math.sin(ph) * 0.05);
  p.set(BI.spine, 0.05 + Math.sin(ph * 2) * 0.05 * g, -Math.sin(ph) * 0.1, 0);
  p.set(BI.chest, 0.04, -Math.sin(ph) * 0.12, Math.sin(ph) * 0.04);
  p.set(BI.neck, -0.5 - g * 0.1, o.look ?? 0, 0);
  p.set(BI.head, -0.55 + Math.sin(t * 1.3) * 0.06, Math.sin(t * 0.7) * 0.15, Math.sin(t * 0.9) * 0.1);
  p.set(BI.jaw, 0.1 + Math.max(0, Math.sin(t * 3.1)) * 0.3 + g * 0.2);
  // FK of the torso chain in actor space
  const qH = qOf(p, BI.hips, _cq[0]);
  const pH = jv(J, 'hips', _cp[0]).add(p.root);
  const qS = _cq[1].copy(qH).multiply(qOf(p, BI.spine, _cqb));
  const pS = _cp[1].copy(jv(J, 'spine', _cu).sub(jv(J, 'hips', _cw)).applyQuaternion(qH)).add(pH);
  const qC = _cq[2].copy(qS).multiply(qOf(p, BI.chest, _cqb));
  const pC = _cp[2].copy(jv(J, 'chest', _cu).sub(jv(J, 'spine', _cw)).applyQuaternion(qS)).add(pS);
  const lift = 0.1 + g * 0.08;
  for (const [s, P] of SIDES) {
    // diagonal pairs: left hand with right knee
    const armPh = (phase + (s > 0 ? 0 : 0.5)) % 1, legPh = (armPh + 0.5) % 1;
    const stance = (u) => u < 0.5;
    const along = (u) => stance(u) ? 0.5 - u * 2 : -0.5 + (u - 0.5) * 2;     // +0.5 front .. -0.5 back
    const up = (u) => stance(u) ? 0 : Math.sin((u - 0.5) * 2 * Math.PI);
    // arm: clavicle stays, the hand plants ahead of and just inside the shoulder
    p.set(BI[P + 'clav'], 0, 0, 0);
    const pClav = _cp[3].copy(jv(J, P + 'clav', _cu).sub(jv(J, 'chest', _cw)).applyQuaternion(qC)).add(pC);
    const pSh = _cp[4].copy(jv(J, P + 'upper', _cu).sub(jv(J, P + 'clav', _cw)).applyQuaternion(qC)).add(pClav);
    const reachZ = 0.16 - g * 0.04;
    const hand = _cp[5].set(pSh.x * 0.8 + s * 0.02, 0.07 + up(armPh) * lift, pSh.z + reachZ + along(armPh) * stride);
    const l1 = jv(J, P + 'fore', _cu).distanceTo(jv(J, P + 'upper', _cw)), l2 = jv(J, P + 'hand', _cu).distanceTo(jv(J, P + 'fore', _cw));
    const elbow = solveTwo(pSh, hand, l1, l2, _cp[6].set(s * 0.6, 0.2, -1), _cp[7]);
    const qU = aimWorld(J, P + 'upper', P + 'fore', qC, _cp[8].subVectors(elbow, pSh), _cq[3]);
    setLocal(p, BI[P + 'upper'], qC, qU);
    const qF = aimWorld(J, P + 'fore', P + 'hand', qU, _cp[8].subVectors(hand, elbow), _cq[4]);
    setLocal(p, BI[P + 'fore'], qU, qF);
    // claws: fingers forward along the floor, curling off it while the hand swings
    const qW = aimWorld(J, P + 'hand', P + 'tip', qF, _cp[8].set(s * 0.15, -0.45 - up(armPh) * 0.6, 1), _cq[5]);
    setLocal(p, BI[P + 'hand'], qF, qW);
    // leg: the knee plants under and just outside the hip (prowl) or lifts into a crouch (gallop)
    const pHip = _cp[9].copy(jv(J, P + 'thigh', _cu).sub(jv(J, 'hips', _cw)).applyQuaternion(qH)).add(pH);
    const lt = jv(J, P + 'shin', _cu).distanceTo(jv(J, P + 'thigh', _cw)), ls = jv(J, P + 'foot', _cu).distanceTo(jv(J, P + 'shin', _cw));
    const legStride = stride * 0.9;
    let knee, foot;
    if (g < 0.5) {
      knee = _cp[10].set(pHip.x + s * 0.05, 0.07 + up(legPh) * lift * 0.7, pHip.z + 0.06 + along(legPh) * legStride);
      foot = _cp[11].set(knee.x + s * 0.02, 0.1 + up(legPh) * 0.05, knee.z - ls * 0.97);
    } else {
      // bear crawl: the foot plants and the knee rises between hip and foot
      foot = _cp[11].set(pHip.x + s * 0.04, 0.08 + up(legPh) * lift, pHip.z - 0.05 + along(legPh) * legStride);
      knee = solveTwo(pHip, foot, lt, ls, _cp[12].set(s * 0.3, 0.2, 1), _cp[10]);
    }
    const qT = aimWorld(J, P + 'thigh', P + 'shin', qH, _cp[8].subVectors(knee, pHip), _cq[6]);
    setLocal(p, BI[P + 'thigh'], qH, qT);
    const qK = aimWorld(J, P + 'shin', P + 'foot', qT, _cp[8].subVectors(foot, knee), _cq[7]);
    setLocal(p, BI[P + 'shin'], qT, qK);
    const qFt = aimWorld(J, P + 'foot', P + 'toe', qK, _cp[8].set(0, g < 0.5 ? -0.6 : -0.2, g < 0.5 ? -1 : 1), _cq[8]);
    setLocal(p, BI[P + 'foot'], qK, qFt);
  }
  return p;
}

// Upright kneel, clawing up at a standing victim (the crawler's grab).
export function poseKneelGrab(p, t) {
  p.root.set(0, -0.4, 0.06);
  p.set(BI.hips, -0.05, 0, 0);
  p.set(BI.spine, 0.2, Math.sin(t * 5) * 0.06, 0);
  p.set(BI.chest, 0.15 + Math.sin(t * 9) * 0.05, Math.sin(t * 7) * 0.1, 0);
  p.set(BI.neck, 0.05, 0, 0);
  p.set(BI.head, -0.3 + Math.sin(t * 9) * 0.1, Math.sin(t * 6) * 0.15, Math.sin(t * 4) * 0.1);
  p.set(BI.jaw, 0.35 + Math.sin(t * 14) * 0.15);
  for (const [s, P] of SIDES) {
    p.set(BI[P + 'thigh'], -0.1, 0, 0.1 * s);
    p.set(BI[P + 'shin'], 1.6, 0, 0);
    p.set(BI[P + 'foot'], 0.5, 0, 0);
    p.set(BI[P + 'upper'], -1.7 + Math.sin(t * 8 + s) * 0.18, -0.55 * s, -0.1 * s);
    p.set(BI[P + 'fore'], -0.45 + Math.sin(t * 11 + s) * 0.15, 0, 0);
    p.set(BI[P + 'hand'], -0.3, 0, 0);
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
