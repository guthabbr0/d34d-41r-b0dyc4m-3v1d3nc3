// Geometry builder: accumulates world-space boxes/quads per material with metric UVs and
// baked contact-occlusion vertex colours, registers collision solids, then merges into a
// handful of draw calls.
import * as THREE from 'three';
import { SURF } from './world.js';
import { vcMaterial } from './materials.js';

class Batch {
  constructor(mat) { this.mat = mat; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
}

export class Builder {
  constructor(world) {
    this.world = world;
    this.batches = new Map();
    this.aoFloorY = [];   // not used directly; occlusion is computed per vertex from height
  }

  batch(mat, zone = '') {
    const key = zone ? mat.uuid + '|' + zone : mat;
    let b = this.batches.get(key);
    if (!b) { b = new Batch(mat); this.batches.set(key, b); }
    return b;
  }

  // Quad with corners p0..p3 (counter-clockwise seen from the normal side).
  // uvs derived from world coordinates projected on the quad's dominant plane.
  quad(mat, p0, p1, p2, p3, n, opts = {}) {
    let zone = '';
    if (this.zoneFn) {
      const cx = (p0.x + p2.x) / 2, cz = (p0.z + p2.z) / 2;
      const size = Math.max(Math.abs(p0.x - p2.x), Math.abs(p0.z - p2.z), Math.abs(p1.x - p3.x), Math.abs(p1.z - p3.z));
      zone = size > 40 ? 'big' : this.zoneFn(cx + n.x * 0.2, cz + n.z * 0.2);
    }
    const b = this.batch(mat, zone);
    const tile = opts.tile ?? mat.userData.tile ?? 2;
    const base = b.count;
    const pts = [p0, p1, p2, p3];
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (const p of pts) {
      b.pos.push(p.x, p.y, p.z);
      b.nor.push(n.x, n.y, n.z);
      let u, v;
      if (ay >= ax && ay >= az) { u = p.x; v = -p.z * Math.sign(n.y || 1); }
      else if (ax >= az) { u = -p.z * Math.sign(n.x); v = p.y; }
      else { u = p.x * Math.sign(n.z); v = p.y; }
      u += opts.uOff || 0; v += opts.vOff || 0;
      b.uv.push(u / tile, v / tile);
      // contact shadow: darken wall bottoms / tops, handled via height (for walls) or given ao
      let ao = 1;
      if (opts.ao !== undefined) ao = typeof opts.ao === 'function' ? opts.ao(p) : opts.ao;
      else if (ay < 0.5 && opts.wallAO !== false) {
        const y0 = opts.floorY ?? 0, y1 = opts.ceilY ?? 3;
        const dh = p.y - y0, dc = y1 - p.y;
        ao = 1;
        if (opts.interior) { ao *= 0.55 + 0.45 * Math.min(1, dh / 0.45); ao *= 0.7 + 0.3 * Math.min(1, dc / 0.35); }
        else ao *= 0.7 + 0.3 * Math.min(1, dh / 0.6);
      }
      b.col.push(ao, ao, ao);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Axis-aligned box with per-face material (mats: single or {px,nx,py,ny,pz,nz}); skip faces via opts.skip.
  box(x0, y0, z0, x1, y1, z1, mats, opts = {}) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const get = (k) => (mats.isMaterial ? mats : (mats[k] || mats.all));
    const skip = opts.skip || '';
    const sub = opts.subdivideY;
    const faces = {
      px: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], V(1, 0, 0)],
      nx: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], V(-1, 0, 0)],
      py: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], V(0, 1, 0)],
      ny: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], V(0, -1, 0)],
      pz: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], V(0, 0, 1)],
      nz: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], V(0, 0, -1)],
    };
    for (const k of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) {
      if (skip.includes(k)) continue;
      const m = get(k);
      if (!m) continue;
      const f = faces[k];
      const fo = { ...opts, ...(opts.face && opts.face[k]) };
      if (sub && (k !== 'py' && k !== 'ny')) {
        // split vertically so vertex AO gradients have resolution
        const cuts = [y0, ...sub.filter(y => y > y0 && y < y1), y1];
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i], c = cuts[i + 1];
          const q = f.slice(0, 4).map(p => V(p[0], p[1] === y0 ? a : c, p[2]));
          this.quad(m, q[0], q[1], q[2], q[3], f[4], fo);
        }
      } else {
        this.quad(m, V(...f[0]), V(...f[1]), V(...f[2]), V(...f[3]), f[4], fo);
      }
    }
    if (opts.solid !== false) {
      this.world.box(x0, y0, z0, x1, y1, z1, { surf: opts.surf ?? (mats.isMaterial ? mats.userData.surf : SURF.CONCRETE) ?? SURF.CONCRETE, ...(opts.solidOpts || {}) });
    }
  }

  // Wall running along X at centre z (thickness t) from x0..x1, heights y0..y1, with openings
  // [{a, b, y0, y1}] in x. matN faces -z, matP faces +z.
  wallX(z, x0, x1, { t = 0.2, y0 = 0, y1 = 3, openings = [], matN, matP, matTop, interiorN = true, interiorP = true, surf } = {}) {
    const segs = splitOpenings(x0, x1, y0, y1, openings);
    for (const s of segs) {
      const mats = { nz: matN, pz: matP, px: matTop || matN || matP, nx: matTop || matN || matP, py: matTop || matN || matP, ny: matTop || matN || matP };
      this.box(s.a, s.y0, z - t / 2, s.b, s.y1, z + t / 2, mats, {
        subdivideY: [0.12, 0.45, 2.55, 2.88], floorY: y0, ceilY: y1, interior: true, surf,
        face: { nz: { interior: interiorN }, pz: { interior: interiorP } },
        skip: s.skipSides ? '' : '',
      });
    }
  }

  wallZ(x, z0, z1, { t = 0.2, y0 = 0, y1 = 3, openings = [], matN, matP, matTop, interiorN = true, interiorP = true, surf } = {}) {
    const segs = splitOpenings(z0, z1, y0, y1, openings);
    for (const s of segs) {
      const mats = { nx: matN, px: matP, pz: matTop || matN || matP, nz: matTop || matN || matP, py: matTop || matN || matP, ny: matTop || matN || matP };
      this.box(x - t / 2, s.y0, s.a, x + t / 2, s.y1, s.b, mats, {
        subdivideY: [0.12, 0.45, 2.55, 2.88], floorY: y0, ceilY: y1, interior: true, surf,
        face: { nx: { interior: interiorN }, px: { interior: interiorP } },
      });
    }
  }

  floor(x0, z0, x1, z1, y, mat, opts = {}) {
    const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const ao = opts.ao ?? 1;
    this.quad(mat, V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), new THREE.Vector3(0, 1, 0), { ao });
    if (opts.solid !== false) this.world.box(x0, y - 0.3, z0, x1, y, z1, { surf: mat.userData?.surf ?? 0, blocksMove: false, blocksSight: false });
  }

  ceiling(x0, z0, x1, z1, y, mat) {
    const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
    this.quad(mat, V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), new THREE.Vector3(0, -1, 0), { ao: 0.9 });
    this.world.box(x0, y, z0, x1, y + 0.3, z1, { blocksMove: false, blocksSight: false });
  }

  // Merge batches into meshes and add to parent.
  finish(parent) {
    const meshes = [];
    for (const b of this.batches.values()) {
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = vcMaterial(b.mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = !mat.transparent;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.batches.clear();
    return meshes;
  }
}

// Split a wall span [a,b]x[y0,y1] into solid boxes around rectangular openings.
function splitOpenings(a, b, y0, y1, openings) {
  const ops = openings.map(o => ({ a: o.a, b: o.b, y0: o.y0 ?? y0, y1: o.y1 ?? 2.1 })).sort((p, q) => p.a - q.a);
  const segs = [];
  let cur = a;
  for (const o of ops) {
    if (o.a > cur) segs.push({ a: cur, b: o.a, y0, y1 });
    if (o.y0 > y0) segs.push({ a: o.a, b: o.b, y0, y1: o.y0 });
    if (o.y1 < y1) segs.push({ a: o.a, b: o.b, y0: o.y1, y1 });
    cur = o.b;
  }
  if (cur < b) segs.push({ a: cur, b, y0, y1 });
  return segs;
}

// ---------- small procedural geometry helpers (for props) ----------

export function roundedBoxGeo(w, h, d, r = 0.01, seg = 2) {
  // cheap rounded box: BoxGeometry with vertices pushed onto rounded corners
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-12) { dir.normalize().multiplyScalar(r); v.copy(c).add(dir); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function mergeGeos(list) {
  // list of {geo, matrix}; all geometries must share attribute layout (position, normal, uv)
  let count = 0, icount = 0;
  for (const { geo } of list) { count += geo.attributes.position.count; icount += geo.index ? geo.index.count : geo.attributes.position.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const idx = count > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const { geo, matrix } of list) {
    const p = geo.attributes.position, n = geo.attributes.normal, t = geo.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
      if (t) uv.set([t.getX(i), t.getY(i)], (vo + i) * 2);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[io++] = geo.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    vo += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Merge static meshes under `root` into one mesh per (material, zone, shadow flags) bucket.
// Objects (or ancestors) with userData.dynamic are left untouched.
export function mergeStatic(root, zoneFn) {
  const buckets = new Map();
  const remove = [];
  const isDynamic = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData && p.userData.dynamic) return true; return false; };
  root.updateMatrixWorld(true);
  const sphere = new THREE.Sphere();
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    if (isDynamic(o)) return;
    const g = o.geometry;
    if (!g.attributes.position || !g.attributes.normal) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    const zone = sphere.radius > 12 ? 'big' : zoneFn(sphere.center.x, sphere.center.z);
    const key = o.material.uuid + '|' + zone + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + (o.renderOrder || 0);
    let b = buckets.get(key);
    if (!b) { b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder || 0, items: [] }; buckets.set(key, b); }
    b.items.push(o);
    remove.push(o);
  });
  const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.items.length < 2) { continue; }
    let vc = 0, ic = 0;
    const hasColor = b.mat.vertexColors;
    for (const o of b.items) { vc += o.geometry.attributes.position.count; ic += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = hasColor ? new Float32Array(vc * 3) : null;
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const o of b.items) {
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv, C = g.attributes.color;
      rel.multiplyMatrices(invRoot, o.matrixWorld);
      nm.getNormalMatrix(rel);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(rel);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        if (T) { uv[(vo + i) * 2] = T.getX(i); uv[(vo + i) * 2 + 1] = T.getY(i); }
        if (col) { if (C) { col[(vo + i) * 3] = C.getX(i); col[(vo + i) * 3 + 1] = C.getY(i); col[(vo + i) * 3 + 2] = C.getZ(i); } else { col[(vo + i) * 3] = col[(vo + i) * 3 + 1] = col[(vo + i) * 3 + 2] = 1; } }
      }
      // mirrored transforms flip winding
      const flip = rel.determinant() < 0;
      if (g.index) {
        for (let i = 0; i < g.index.count; i += 3) {
          const a = g.index.getX(i) + vo, bb = g.index.getX(i + 1) + vo, c = g.index.getX(i + 2) + vo;
          if (flip) { idx[io++] = a; idx[io++] = c; idx[io++] = bb; } else { idx[io++] = a; idx[io++] = bb; idx[io++] = c; }
        }
      } else for (let i = 0; i < P.count; i += 3) { if (flip) { idx[io++] = vo + i; idx[io++] = vo + i + 2; idx[io++] = vo + i + 1; } else { idx[io++] = vo + i; idx[io++] = vo + i + 1; idx[io++] = vo + i + 2; } }
      vo += P.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order;
    m.matrixAutoUpdate = false;
    root.add(m);
    for (const o of b.items) o.parent && o.parent.remove(o);
    merged += b.items.length;
  }
  return merged;
}
