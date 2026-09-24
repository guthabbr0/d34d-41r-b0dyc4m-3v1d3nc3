// Static collision world: 3D axis-aligned solids (walls, floors, props), a 2D spatial hash for
// character collision, ray casting for bullets / line of sight, and a flow-field nav grid.
import * as THREE from 'three';

export const SURF = { CONCRETE: 0, METAL: 1, WOOD: 2, FLESH: 3, GLASS: 4, FABRIC: 5, TILE: 6, DIRT: 7 };

export class Solid {
  constructor(minx, miny, minz, maxx, maxy, maxz, opts = {}) {
    this.min = new THREE.Vector3(minx, miny, minz);
    this.max = new THREE.Vector3(maxx, maxy, maxz);
    this.surf = opts.surf ?? SURF.CONCRETE;
    this.blocksMove = opts.blocksMove ?? true;   // blocks characters (2D)
    this.blocksShot = opts.blocksShot ?? true;   // stops bullets
    this.blocksSight = opts.blocksSight ?? true;
    this.walkOver = opts.walkOver ?? false;      // low objects characters ignore (curbs)
    this.enabled = true;
    this.tag = opts.tag || null;
    this.id = -1;
  }
}

const tmpV = new THREE.Vector3();

export class World {
  constructor() {
    this.solids = [];
    this.cell = 2;
    this.hash = new Map();
    this.dynamic = [];   // solids that move (doors) - always tested
  }

  add(s) {
    s.id = this.solids.length;
    this.solids.push(s);
    if (s.dynamic) { this.dynamic.push(s); return s; }
    const c = this.cell;
    for (let x = Math.floor(s.min.x / c); x <= Math.floor(s.max.x / c); x++)
      for (let z = Math.floor(s.min.z / c); z <= Math.floor(s.max.z / c); z++) {
        const k = x * 73856093 ^ z * 19349663;
        let arr = this.hash.get(k);
        if (!arr) { arr = []; this.hash.set(k, arr); }
        arr.push(s);
      }
    return s;
  }

  box(minx, miny, minz, maxx, maxy, maxz, opts) { return this.add(new Solid(minx, miny, minz, maxx, maxy, maxz, opts)); }

  query2D(minx, minz, maxx, maxz, out = []) {
    out.length = 0;
    const c = this.cell;
    const stamp = ++this._stamp || (this._stamp = 1);
    for (let x = Math.floor(minx / c); x <= Math.floor(maxx / c); x++)
      for (let z = Math.floor(minz / c); z <= Math.floor(maxz / c); z++) {
        const arr = this.hash.get(x * 73856093 ^ z * 19349663);
        if (!arr) continue;
        for (const s of arr) { if (s._q !== stamp) { s._q = stamp; out.push(s); } }
      }
    for (const s of this.dynamic) out.push(s);
    return out;
  }

  // Push a circle (x,z,r) out of solids that block movement between heights y0..y1. Returns corrected pos.
  collideCircle(pos, r, y0 = 0.1, y1 = 1.7) {
    const list = this.query2D(pos.x - r - 0.1, pos.z - r - 0.1, pos.x + r + 0.1, pos.z + r + 0.1, this._ql || (this._ql = []));
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const s of list) {
        if (!s.enabled || !s.blocksMove || s.walkOver) continue;
        if (s.max.y < y0 || s.min.y > y1) continue;
        const cx = Math.max(s.min.x, Math.min(pos.x, s.max.x));
        const cz = Math.max(s.min.z, Math.min(pos.z, s.max.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x += dx / d * (r - d); pos.z += dz / d * (r - d);
          } else {
            // centre inside box: push out along smallest axis
            const pxl = pos.x - s.min.x, pxr = s.max.x - pos.x, pzl = pos.z - s.min.z, pzr = s.max.z - pos.z;
            const m = Math.min(pxl, pxr, pzl, pzr);
            if (m === pxl) pos.x = s.min.x - r; else if (m === pxr) pos.x = s.max.x + r;
            else if (m === pzl) pos.z = s.min.z - r; else pos.z = s.max.z + r;
          }
          any = hit = true;
        }
      }
      if (!any) break;
    }
    return hit;
  }

  // Ray vs all solids. Returns {t, point, normal, solid} or null.
  raycast(origin, dir, maxDist, filter = 'shot') {
    let best = maxDist, bestS = null, bestAxis = -1, bestSign = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / (dir.x || 1e-12), iy = 1 / (dir.y || 1e-12), iz = 1 / (dir.z || 1e-12);
    // broadphase by walking hash cells along the ray in 2D
    const cand = this._rayCandidates(origin, dir, maxDist);
    for (const s of cand) {
      if (!s.enabled) continue;
      if (filter === 'shot' && !s.blocksShot) continue;
      if (filter === 'sight' && !s.blocksSight) continue;
      let t1 = (s.min.x - ox) * ix, t2 = (s.max.x - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0, sign = t1 < t2 ? -1 : 1;
      t1 = (s.min.y - oy) * iy; t2 = (s.max.y - oy) * iy;
      let a = Math.min(t1, t2);
      if (a > tmin) { tmin = a; axis = 1; sign = t1 < t2 ? -1 : 1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (s.min.z - oz) * iz; t2 = (s.max.z - oz) * iz;
      a = Math.min(t1, t2);
      if (a > tmin) { tmin = a; axis = 2; sign = t1 < t2 ? -1 : 1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin < best && tmin >= 0) {
        best = tmin; bestS = s; bestAxis = axis; bestSign = sign;
      }
    }
    if (!bestS) return null;
    const n = new THREE.Vector3();
    n.setComponent(bestAxis, bestSign);
    return { t: best, point: origin.clone().addScaledVector(dir, best), normal: n, solid: bestS };
  }

  _rayCandidates(o, d, maxDist) {
    const out = this._rc || (this._rc = []);
    out.length = 0;
    const stamp = ++this._stamp;
    const c = this.cell;
    const steps = Math.ceil(maxDist / (c * 0.5));
    let lx = null, lz = null;
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxDist, i * c * 0.5);
      const x = Math.floor((o.x + d.x * t) / c), z = Math.floor((o.z + d.z * t) / c);
      if (x === lx && z === lz) continue;
      lx = x; lz = z;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const arr = this.hash.get((x + dx) * 73856093 ^ (z + dz) * 19349663);
        if (!arr) continue;
        for (const s of arr) if (s._q !== stamp) { s._q = stamp; out.push(s); }
      }
    }
    for (const s of this.dynamic) out.push(s);
    return out;
  }

  lineOfSight(a, b) {
    tmpV.subVectors(b, a);
    const d = tmpV.length();
    if (d < 1e-4) return true;
    tmpV.divideScalar(d);
    const h = this.raycast(a, tmpV, d - 0.05, 'sight');
    return !h;
  }

  // Highest walkable/sittable surface under (x,z) below height y (for ragdolls & debris).
  groundHeight(x, z, y, r = 0) {
    let g = 0;
    const list = this.query2D(x - r, z - r, x + r, z + r, this._qg || (this._qg = []));
    for (const s of list) {
      if (!s.enabled) continue;
      if (x < s.min.x - r || x > s.max.x + r || z < s.min.z - r || z > s.max.z + r) continue;
      if (s.max.y <= y + 0.05 && s.max.y > g && s.max.y < 1.3) g = s.max.y;
    }
    return g;
  }
}

// Flow-field navigation over a 2D grid. Blocked cells come from solids that block movement.
export class NavGrid {
  constructor(world, minx, minz, maxx, maxz, cell = 0.5) {
    this.world = world;
    this.minx = minx; this.minz = minz; this.cell = cell;
    this.w = Math.ceil((maxx - minx) / cell); this.h = Math.ceil((maxz - minz) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.dist = new Float32Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h * 4);
    this.dynamicBlocks = [];
  }

  rebuild(margin = 0.28) {
    const { w, h, cell } = this;
    this.blocked.fill(0);
    for (const s of this.world.solids) {
      if (!s.enabled || !s.blocksMove || s.walkOver) continue;
      if (s.max.y < 0.3 || s.min.y > 1.6) continue;
      this._mark(s, margin, 1);
    }
  }

  _mark(s, margin, v) {
    const { w, h, cell } = this;
    const x0 = Math.max(0, Math.floor((s.min.x - margin - this.minx) / cell));
    const x1 = Math.min(w - 1, Math.floor((s.max.x + margin - this.minx) / cell));
    const z0 = Math.max(0, Math.floor((s.min.z - margin - this.minz) / cell));
    const z1 = Math.min(h - 1, Math.floor((s.max.z + margin - this.minz) / cell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      // test cell centre distance to box (rounded margin)
      const cx = this.minx + (x + 0.5) * cell, cz = this.minz + (z + 0.5) * cell;
      const dx = Math.max(s.min.x - cx, 0, cx - s.max.x), dz = Math.max(s.min.z - cz, 0, cz - s.max.z);
      if (dx * dx + dz * dz <= margin * margin) this.blocked[z * w + x] = v;
    }
  }

  // Recompute blocked flags of dynamic solids (doors) on top of the static ones.
  setDynamic(solids) { this.dynamicBlocks = solids; }

  idx(x, z) {
    const gx = Math.floor((x - this.minx) / this.cell), gz = Math.floor((z - this.minz) / this.cell);
    if (gx < 0 || gz < 0 || gx >= this.w || gz >= this.h) return -1;
    return gz * this.w + gx;
  }

  // Dijkstra-ish BFS (8-connected with diagonal cost) from target position.
  compute(tx, tz, maxCost = 80) {
    const { w, h, dist, blocked, queue } = this;
    dist.fill(1e9);
    // dynamic blockers (closed doors)
    const dyn = [];
    for (const s of this.dynamicBlocks) if (s.enabled) dyn.push(s);
    const saved = [];
    for (const s of dyn) {
      const x0 = Math.max(0, Math.floor((s.min.x - 0.2 - this.minx) / this.cell)), x1 = Math.min(w - 1, Math.floor((s.max.x + 0.2 - this.minx) / this.cell));
      const z0 = Math.max(0, Math.floor((s.min.z - 0.2 - this.minz) / this.cell)), z1 = Math.min(h - 1, Math.floor((s.max.z + 0.2 - this.minz) / this.cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * w + x; saved.push(i, blocked[i]); blocked[i] = 1; }
    }
    let start = this.idx(tx, tz);
    if (start < 0) return;
    const QL = queue.length;
    let head = 0, tail = 0, count = 0;
    dist[start] = 0; queue[tail] = start; tail = (tail + 1) % QL; count++;
    while (count > 0) {
      const i = queue[head]; head = (head + 1) % QL; count--;
      const d0 = dist[i];
      if (d0 > maxCost) continue;
      const x = i % w, z = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        let dx, dz, c;
        switch (k) {
          case 0: dx = 1; dz = 0; c = 1; break; case 1: dx = -1; dz = 0; c = 1; break;
          case 2: dx = 0; dz = 1; c = 1; break; case 3: dx = 0; dz = -1; c = 1; break;
          case 4: dx = 1; dz = 1; c = 1.414; break; case 5: dx = -1; dz = 1; c = 1.414; break;
          case 6: dx = 1; dz = -1; c = 1.414; break; default: dx = -1; dz = -1; c = 1.414;
        }
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (blocked[j]) continue;
        if (c > 1 && (blocked[z * w + nx] || blocked[nz * w + x])) continue; // no corner cutting
        const nd = d0 + c;
        if (nd < dist[j]) {
          dist[j] = nd;
          if (count < QL) { queue[tail] = j; tail = (tail + 1) % QL; count++; }
        }
      }
    }
    for (let k = 0; k < saved.length; k += 2) blocked[saved[k]] = saved[k + 1];
  }

  // Direction (unit, xz) to move from (x,z) following the field. Returns false if unreachable.
  flow(x, z, out) {
    const { w, h, dist, cell } = this;
    const i = this.idx(x, z);
    if (i < 0) return false;
    const gx = i % w, gz = (i / w) | 0;
    let best = dist[i], bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = gx + dx, nz = gz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const d = dist[nz * w + nx];
      if (d < best - 1e-3) { best = d; bx = dx; bz = dz; }
    }
    if (best >= 1e8 || (bx === 0 && bz === 0)) return false;
    // aim at the neighbour cell centre for smoother paths
    const tx = this.minx + (gx + bx + 0.5) * cell, tz = this.minz + (gz + bz + 0.5) * cell;
    let vx = tx - x, vz = tz - z;
    const L = Math.hypot(vx, vz) || 1;
    out.x = vx / L; out.z = vz / L;
    return true;
  }

  distanceAt(x, z) { const i = this.idx(x, z); return i < 0 ? 1e9 : this.dist[i]; }
}
