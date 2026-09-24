// Verlet ragdoll ("true body simulation"): particles at joints, distance constraints for bones
// and torso rigidity, joint limits, ground/wall/prop collisions with friction, bullet impulses,
// and mapping of the particle cloud back onto the skinned skeleton.
import * as THREE from 'three';
import { BI } from './humanoid.js';

const PN = ['pelvis', 'spine', 'chest', 'neck', 'head',
  'Lsh', 'Lel', 'Lwr', 'Ltip', 'Rsh', 'Rel', 'Rwr', 'Rtip',
  'Lhip', 'Lkn', 'Lan', 'Ltoe', 'Rhip', 'Rkn', 'Ran', 'Rtoe'];
const P = Object.fromEntries(PN.map((n, i) => [n, i]));
const RADIUS = [0.11, 0.11, 0.12, 0.06, 0.1, 0.06, 0.045, 0.04, 0.035, 0.06, 0.045, 0.04, 0.035, 0.08, 0.06, 0.05, 0.04, 0.08, 0.06, 0.05, 0.04];
const MASS = [3, 2, 3, 1, 1.4, 1, 0.7, 0.5, 0.3, 1, 0.7, 0.5, 0.3, 2, 1.2, 0.7, 0.3, 2, 1.2, 0.7, 0.3];

// bone -> joint particle / child particle for mapping
const LINKS = [
  ['pelvis', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['Lsh', 'Rsh'], ['Lhip', 'Rhip'],
  ['Lsh', 'Lel'], ['Lel', 'Lwr'], ['Lwr', 'Ltip'], ['Rsh', 'Rel'], ['Rel', 'Rwr'], ['Rwr', 'Rtip'],
  ['pelvis', 'Lhip'], ['pelvis', 'Rhip'], ['Lhip', 'Lkn'], ['Lkn', 'Lan'], ['Lan', 'Ltoe'], ['Rhip', 'Rkn'], ['Rkn', 'Ran'], ['Ran', 'Rtoe'],
  ['chest', 'Lsh'], ['chest', 'Rsh'], ['spine', 'Lhip'], ['spine', 'Rhip'],
  // rigidity
  ['Lsh', 'Lhip'], ['Rsh', 'Rhip'], ['Lsh', 'Rhip'], ['Rsh', 'Lhip'], ['neck', 'Lsh'], ['neck', 'Rsh'], ['Lsh', 'spine'], ['Rsh', 'spine'],
  ['pelvis', 'chest'], ['Lhip', 'chest'], ['Rhip', 'chest'],
];
const SOFT = [['head', 'Lsh', 0.35], ['head', 'Rsh', 0.35], ['head', 'chest', 0.5]];
// minimum distances (joint flex limits) as fraction of rest
const MINS = [['Lsh', 'Lwr', 0.3], ['Rsh', 'Rwr', 0.3], ['Lhip', 'Lan', 0.28], ['Rhip', 'Ran', 0.28], ['Lkn', 'chest', 0.55], ['Rkn', 'chest', 0.55],
  ['Lwr', 'pelvis', 0.2], ['Rwr', 'pelvis', 0.2], ['Lan', 'pelvis', 0.3], ['Ran', 'pelvis', 0.3], ['Lkn', 'Rkn', 0.35], ['Lan', 'Ran', 0.25], ['head', 'pelvis', 0.8]];

// which body joint (from bone world matrices) seeds each particle
const SEED = {
  pelvis: ['hips', [0, 0, 0]], spine: ['spine', [0, 0, 0]], chest: ['chest', [0, 0, 0]], neck: ['neck', [0, 0, 0]], head: ['head', 'headTop'],
  Lsh: ['L_upper', [0, 0, 0]], Lel: ['L_fore', [0, 0, 0]], Lwr: ['L_hand', [0, 0, 0]], Ltip: ['L_hand', 'L_tip'],
  Rsh: ['R_upper', [0, 0, 0]], Rel: ['R_fore', [0, 0, 0]], Rwr: ['R_hand', [0, 0, 0]], Rtip: ['R_hand', 'R_tip'],
  Lhip: ['L_thigh', [0, 0, 0]], Lkn: ['L_shin', [0, 0, 0]], Lan: ['L_foot', [0, 0, 0]], Ltoe: ['L_foot', 'L_toe'],
  Rhip: ['R_thigh', [0, 0, 0]], Rkn: ['R_shin', [0, 0, 0]], Ran: ['R_foot', [0, 0, 0]], Rtoe: ['R_foot', 'R_toe'],
};

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3();
const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tm = new THREE.Matrix4(), tm2 = new THREE.Matrix4();

export class Ragdoll {
  constructor(body, world) {
    this.body = body;
    this.world = world;
    const n = PN.length;
    this.p = []; this.o = [];
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    this.cons = []; this.soft = []; this.mins = [];
    this.active = false;
    this.sleep = 0;
    this.sleeping = false;
    this.contact = new Uint8Array(n);
    this.restDir = {};
    this.jointRest = {};
    this.friction = 0.65;
    // bind-space reference positions for rest directions
    const J = body.t.J;
    const jp = (name) => {
      const [bone, off] = SEED[name];
      if (typeof off === 'string') return new THREE.Vector3(...J[off]);
      return new THREE.Vector3(...J[bone]);
    };
    this.bindPos = PN.map(jp);
  }

  // Seed particles from the current (animated) skeleton; vel from previous frame positions.
  start(prevPositions, impulse = null) {
    const body = this.body;
    body.root.updateMatrixWorld(true);
    const J = body.t.J;
    for (let i = 0; i < PN.length; i++) {
      const [boneName, off] = SEED[PN[i]];
      const bone = body.bones[BI[boneName]];
      if (typeof off === 'string') {
        // point offset from joint in bind space, transformed by the bone
        tv.set(J[off][0] - J[boneName][0], J[off][1] - J[boneName][1], J[off][2] - J[boneName][2]);
        tv.applyMatrix4(tm.extractRotation(bone.matrixWorld));
        bone.getWorldPosition(this.p[i]).add(tv);
      } else bone.getWorldPosition(this.p[i]);
      this.o[i].copy(prevPositions ? prevPositions[i] : this.p[i]);
    }
    // constraints with rest lengths from the bind skeleton (scale-invariant)
    const s = body.root.scale.x;
    const L = (a, b) => this.bindPos[P[a]].distanceTo(this.bindPos[P[b]]) * s;
    this.cons = LINKS.map(([a, b]) => [P[a], P[b], L(a, b)]);
    this.soft = SOFT.map(([a, b, k]) => [P[a], P[b], L(a, b), k]);
    this.mins = MINS.map(([a, b, f]) => [P[a], P[b], L(a, b) * f]);
    // move root transform into world space: bones will be driven in world coordinates
    body.root.position.set(0, 0, 0); body.root.rotation.set(0, 0, 0); body.root.scale.set(1, 1, 1);
    body.root.updateMatrixWorld(true);
    this.scale = s;
    this.active = true; this.sleeping = false; this.sleep = 0; this.age = 0;
    body.freeze(false);
    if (impulse) this.impulse(impulse.point, impulse.dir, impulse.strength, impulse.radius);
  }

  // positions snapshot for velocity seeding
  snapshot(out) {
    const body = this.body;
    body.root.updateMatrixWorld(true);
    const J = body.t.J;
    for (let i = 0; i < PN.length; i++) {
      const [boneName, off] = SEED[PN[i]];
      const bone = body.bones[BI[boneName]];
      out[i] = out[i] || new THREE.Vector3();
      if (typeof off === 'string') {
        tv.set(J[off][0] - J[boneName][0], J[off][1] - J[boneName][1], J[off][2] - J[boneName][2]);
        tv.applyMatrix4(tm.extractRotation(bone.matrixWorld));
        bone.getWorldPosition(out[i]).add(tv);
      } else bone.getWorldPosition(out[i]);
    }
    return out;
  }

  impulse(point, dir, strength = 1, radius = 0.35) {
    this.sleeping = false; this.sleep = 0;
    this.body.freeze(false);
    for (let i = 0; i < PN.length; i++) {
      const d = this.p[i].distanceTo(point);
      if (d > radius) continue;
      const w = (1 - d / radius) * strength / MASS[i] * 0.016;
      this.o[i].addScaledVector(dir, -w);
    }
  }

  nearestParticle(point) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < PN.length; i++) { const d = this.p[i].distanceToSquared(point); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  step(dt) {
    if (!this.active || this.sleeping) return;
    this.age += dt;
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    for (let s = 0; s < sub; s++) this._substep(h);
    // sleep detection
    let maxV = 0;
    for (let i = 0; i < PN.length; i++) maxV = Math.max(maxV, this.p[i].distanceToSquared(this.o[i]));
    maxV = Math.sqrt(maxV) / h;
    if (maxV < 0.05 && this.age > 1) { this.sleep += dt; if (this.sleep > 0.8) this.sleeping = true; } else this.sleep = 0;
    this.apply();
    if (this.sleeping) this.body.freeze(true);
  }

  _substep(h) {
    const g = -9.81 * h * h;
    const n = PN.length;
    for (let i = 0; i < n; i++) {
      const p = this.p[i], o = this.o[i];
      const damp = this.contact[i] ? 0.9 : 0.995;
      const vx = (p.x - o.x) * damp, vy = (p.y - o.y) * damp, vz = (p.z - o.z) * damp;
      o.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
    }
    const iters = 8;
    for (let it = 0; it < iters; it++) {
      for (const [a, b, L] of this.cons) this._dist(a, b, L, 1);
      for (const [a, b, L, k] of this.soft) this._dist(a, b, L, k);
      for (const [a, b, Lmin] of this.mins) {
        const pa = this.p[a], pb = this.p[b];
        tv.subVectors(pb, pa); const d = tv.length();
        if (d < Lmin && d > 1e-6) { const w = (Lmin - d) / d * 0.5; const ma = 1 / MASS[a], mb = 1 / MASS[b], ms = ma + mb; pa.addScaledVector(tv, -w * 2 * ma / ms); pb.addScaledVector(tv, w * 2 * mb / ms); }
      }
      this._hinges();
      if (it % 2 === 1 || it === iters - 1) this._collide();
    }
  }

  _dist(a, b, L, k) {
    const pa = this.p[a], pb = this.p[b];
    tv.subVectors(pb, pa);
    const d = tv.length();
    if (d < 1e-6) return;
    const diff = (d - L) / d * k;
    const ma = 1 / MASS[a], mb = 1 / MASS[b], ms = ma + mb;
    pa.addScaledVector(tv, diff * ma / ms);
    pb.addScaledVector(tv, -diff * mb / ms);
  }

  // knees bend forward (toward toes), elbows bend back (away from chest front)
  _hinges() {
    const fwd = tv3;
    // torso forward = (Lsh-Rsh) x (neck - pelvis)
    tv.subVectors(this.p[P.Lsh], this.p[P.Rsh]); tv2.subVectors(this.p[P.neck], this.p[P.pelvis]);
    fwd.crossVectors(tv, tv2).normalize();
    for (const [hip, kn, an, toe] of LEGS) {
      const mid = tv.addVectors(this.p[hip], this.p[an]).multiplyScalar(0.5);
      const f = tv2.subVectors(this.p[toe], this.p[an]).normalize();
      const d = _ba.subVectors(this.p[kn], mid).dot(f);
      if (d < 0.02) this.p[kn].addScaledVector(f, (0.02 - d) * 0.5);
    }
    for (const [sh, el, wr] of ARMS) {
      const mid = tv.addVectors(this.p[sh], this.p[wr]).multiplyScalar(0.5);
      const d = tv2.subVectors(this.p[el], mid).dot(fwd);
      if (d > -0.01) this.p[el].addScaledVector(fwd, (-0.01 - d) * 0.5);
    }
  }

  _collide() {
    const world = this.world;
    const n = PN.length;
    for (let i = 0; i < n; i++) {
      const p = this.p[i], o = this.o[i], r = RADIUS[i] * 0.8;
      this.contact[i] = 0;
      // props / floor: highest surface below
      const gy = world.groundHeight(p.x, p.z, o.y + 0.05, 0) + r;
      if (p.y < gy) {
        p.y = gy; this.contact[i] = 1;
        // friction: pull previous towards current horizontally
        o.x = p.x + (o.x - p.x) * (1 - this.friction) + 0 * (p.x - o.x);
        o.z = p.z + (o.z - p.z) * (1 - this.friction);
        if (o.y < p.y) o.y = p.y + (o.y - p.y) * 0.2; // small bounce damping
      }
      // walls (2D push out for solids taller than the particle)
      const list = world.query2D(p.x - r, p.z - r, p.x + r, p.z + r, this._q || (this._q = []));
      for (const s of list) {
        if (!s.enabled || !s.blocksMove) continue;
        if (p.y - r > s.max.y || p.y + r < s.min.y) continue;
        if (s.max.y < 1.3 && p.y > s.max.y - 0.05) continue; // resting on top of a prop
        const cx = Math.max(s.min.x, Math.min(p.x, s.max.x)), cz = Math.max(s.min.z, Math.min(p.z, s.max.z));
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-10) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
          else if (s.max.y < 1.3) { p.y = Math.max(p.y, s.max.y + r); }
          this.contact[i] = 1;
        }
      }
    }
  }

  // Drive skeleton from particles. Allocation free: runs for every awake ragdoll every frame.
  apply() {
    const body = this.body, bones = body.bones, pp = this.p;
    let qi = 0;
    const nq = () => _QP[qi++];
    const basis = (up, sideV) => {
      // columns: x = side (orthogonalised), y = up, z = x cross y
      const y = up.normalize();
      const x = sideV.addScaledVector(y, -sideV.dot(y)).normalize();
      const z = _bz.crossVectors(x, y);
      return nq().setFromRotationMatrix(tm.makeBasis(x, y, z));
    };
    const vec = (out, a, b) => out.subVectors(pp[b], pp[a]);
    // hips
    const qHips = basis(vec(_ba, P.pelvis, P.spine), vec(_bb, P.Rhip, P.Lhip));
    const qSpine = basis(vec(_ba, P.spine, P.chest), vec(_bb, P.Rsh, P.Lsh).add(vec(_bc, P.Rhip, P.Lhip)));
    const qChest = basis(vec(_ba, P.chest, P.neck), vec(_bb, P.Rsh, P.Lsh));
    const qNeck = basis(vec(_ba, P.neck, P.head), vec(_bb, P.Rsh, P.Lsh));
    const setLocal = (bi, qWorld, qParent) => { bones[bi].quaternion.copy(qParent).invert().multiply(qWorld); };
    const hips = bones[BI.hips];
    hips.position.copy(pp[P.pelvis]);
    hips.quaternion.copy(qHips);
    setLocal(BI.spine, qSpine, qHips);
    setLocal(BI.chest, qChest, qSpine);
    setLocal(BI.neck, qNeck, qChest);
    body.mesh.boundingSphere.center.copy(pp[P.pelvis]);
    body.mesh.boundingBox.setFromCenterAndSize(pp[P.pelvis], _BB);
    bones[BI.head].quaternion.identity();
    bones[BI.jaw].quaternion.setFromAxisAngle(_X, 0.35);
    // limbs: swing-only from parent frames
    const J = body.t.J;
    const limb = (bi, parentQ, jointName, childName, pa, pb) => {
      const cj = J[childName], jj = J[jointName];
      const rest = tv.set(cj[0] - jj[0], cj[1] - jj[1], cj[2] - jj[2]).normalize();
      const cur = tv2.subVectors(pp[pb], pp[pa]).normalize().applyQuaternion(tq2.copy(parentQ).invert());
      const q = tq.setFromUnitVectors(rest, cur);
      bones[bi].quaternion.copy(q);
      return nq().copy(parentQ).multiply(q);
    };
    for (let k = 0; k < 2; k++) {
      const L = LIMBS[k];
      bones[L.clav].quaternion.identity();
      const qU = limb(L.upper, qChest, L.n.upper, L.n.fore, L.sh, L.el);
      const qF = limb(L.fore, qU, L.n.fore, L.n.hand, L.el, L.wr);
      limb(L.hand, qF, L.n.hand, L.n.tip, L.wr, L.tip);
      const qT = limb(L.thigh, qHips, L.n.thigh, L.n.shin, L.hip, L.kn);
      const qS = limb(L.shin, qT, L.n.shin, L.n.foot, L.kn, L.an);
      limb(L.foot, qS, L.n.foot, L.n.toe, L.an, L.toe);
    }
    body.root.updateMatrixWorld(true);
  }

  centre(out) { return out.copy(this.p[P.pelvis]); }
  headPos(out) { return out.copy(this.p[P.head]); }
}
const _X = new THREE.Vector3(1, 0, 0);
const _BB = new THREE.Vector3(2.4, 2.4, 2.4);
const _ba = new THREE.Vector3(), _bb = new THREE.Vector3(), _bc = new THREE.Vector3(), _bz = new THREE.Vector3();
const _QP = Array.from({ length: 24 }, () => new THREE.Quaternion());
// per-side bone/particle index tables (resolved once instead of string-building every frame)
const LIMBS = ['L', 'R'].map(s => {
  const S = s + '_', n = {};
  for (const k of ['upper', 'fore', 'hand', 'tip', 'thigh', 'shin', 'foot', 'toe']) n[k] = S + k;
  return {
    n, clav: BI[S + 'clav'], upper: BI[S + 'upper'], fore: BI[S + 'fore'], hand: BI[S + 'hand'],
    thigh: BI[S + 'thigh'], shin: BI[S + 'shin'], foot: BI[S + 'foot'],
    sh: P[s + 'sh'], el: P[s + 'el'], wr: P[s + 'wr'], tip: P[s + 'tip'], hip: P[s + 'hip'], kn: P[s + 'kn'], an: P[s + 'an'], toe: P[s + 'toe'],
  };
});
const LEGS = [[P.Lhip, P.Lkn, P.Lan, P.Ltoe], [P.Rhip, P.Rkn, P.Ran, P.Rtoe]];
const ARMS = [[P.Lsh, P.Lel, P.Lwr], [P.Rsh, P.Rel, P.Rwr]];
export const RAG_P = P;
