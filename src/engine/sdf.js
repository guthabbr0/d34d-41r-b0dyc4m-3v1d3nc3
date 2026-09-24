// Signed-distance sculpting + naive surface nets meshing + automatic skin weights.
// Pure JS (no three.js dependency) so it can run in a worker if needed.
//
// A spec is { prims: [...], h: voxelSize, bones: n }.
// prim = { t:'sphere'|'ell'|'cone'|'box', ... , op:'add'|'sub', k: blend, bone, mat, layer:'body'|'cloth' }
//   sphere: c:[x,y,z], r
//   ell:    c, r:[rx,ry,rz]
//   cone:   a, b, ra, rb           (round cone / capsule)
//   box:    c, s:[hx,hy,hz], r (rounding), q:[x,y,z,w] optional rotation
// Materials: 0 skin, 1 top, 2 bottom, 3 shoes, 4 hair, 5 teeth/nails, 6 mouth, 7 dark (sockets/gloves)

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

function rotInv(q, x, y, z) {
  // rotate vector by inverse of quaternion q
  const qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

export function primDist(p, x, y, z) {
  switch (p.t) {
    case 'sphere': {
      const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r;
    }
    case 'ell': {
      let dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      if (p.q) [dx, dy, dz] = rotInv(p.q, dx, dy, dz);
      const k0 = Math.sqrt((dx / p.r[0]) ** 2 + (dy / p.r[1]) ** 2 + (dz / p.r[2]) ** 2);
      const k1 = Math.sqrt((dx / (p.r[0] * p.r[0])) ** 2 + (dy / (p.r[1] * p.r[1])) ** 2 + (dz / (p.r[2] * p.r[2])) ** 2);
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(p.r[0], p.r[1], p.r[2]);
    }
    case 'cone': {
      // iq round cone
      const ax = p.a[0], ay = p.a[1], az = p.a[2];
      const bax = p.b[0] - ax, bay = p.b[1] - ay, baz = p.b[2] - az;
      const l2 = bax * bax + bay * bay + baz * baz;
      const rr = p.ra - p.rb, a2 = l2 - rr * rr, il2 = 1 / l2;
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const cx = pax * l2 - bax * yy, cy = pay * l2 - bay * yy, cz = paz * l2 - baz * yy;
      const x2 = cx * cx + cy * cy + cz * cz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.ra;
    }
    case 'box': {
      let dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      if (p.q) [dx, dy, dz] = rotInv(p.q, dx, dy, dz);
      const r = p.r || 0;
      const qx = Math.abs(dx) - p.s[0] + r, qy = Math.abs(dy) - p.s[1] + r, qz = Math.abs(dz) - p.s[2] + r;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
  }
  return 1e9;
}

function primBounds(p) {
  switch (p.t) {
    case 'sphere': return [p.c[0] - p.r, p.c[1] - p.r, p.c[2] - p.r, p.c[0] + p.r, p.c[1] + p.r, p.c[2] + p.r];
    case 'ell': { const m = Math.max(...p.r); return [p.c[0] - m, p.c[1] - m, p.c[2] - m, p.c[0] + m, p.c[1] + m, p.c[2] + m]; }
    case 'cone': {
      const m = Math.max(p.ra, p.rb);
      return [Math.min(p.a[0], p.b[0]) - m, Math.min(p.a[1], p.b[1]) - m, Math.min(p.a[2], p.b[2]) - m,
              Math.max(p.a[0], p.b[0]) + m, Math.max(p.a[1], p.b[1]) + m, Math.max(p.a[2], p.b[2]) + m];
    }
    case 'box': { const m = Math.hypot(...p.s); return [p.c[0] - m, p.c[1] - m, p.c[2] - m, p.c[0] + m, p.c[1] + m, p.c[2] + m]; }
  }
  return [0, 0, 0, 0, 0, 0];
}

// value noise for cloth tears / skin lumps (deterministic)
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
    r += w * hash3(ix + dx, iy + dy, iz + dz, seed);
  }
  return r;
}

// ------------------------------------------------------------------ grid evaluation
export function buildMesh(spec) {
  const h = spec.h;
  const prims = spec.prims;
  // bounds
  let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
  for (const p of prims) {
    if (p.op === 'sub') continue;
    const b = primBounds(p);
    bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bz0 = Math.min(bz0, b[2]);
    bx1 = Math.max(bx1, b[3]); by1 = Math.max(by1, b[4]); bz1 = Math.max(bz1, b[5]);
  }
  const pad = h * 3;
  bx0 -= pad; by0 -= pad; bz0 -= pad; bx1 += pad; by1 += pad; bz1 += pad;
  const nx = Math.ceil((bx1 - bx0) / h) + 1, ny = Math.ceil((by1 - by0) / h) + 1, nz = Math.ceil((bz1 - bz0) / h) + 1;
  const N = nx * ny * nz;
  const body = new Float32Array(N).fill(1);
  const cloth = new Float32Array(N).fill(1);
  const band = h * 4;

  const splat = (p, grid) => {
    const b = primBounds(p);
    const m = (p.k || 0) + band;
    const i0 = Math.max(0, Math.floor((b[0] - m - bx0) / h)), i1 = Math.min(nx - 1, Math.ceil((b[3] + m - bx0) / h));
    const j0 = Math.max(0, Math.floor((b[1] - m - by0) / h)), j1 = Math.min(ny - 1, Math.ceil((b[4] + m - by0) / h));
    const k0 = Math.max(0, Math.floor((b[2] - m - bz0) / h)), k1 = Math.min(nz - 1, Math.ceil((b[5] + m - bz0) / h));
    const k = p.k || 0;
    const inflate = p.inflate || 0;
    for (let kk = k0; kk <= k1; kk++) {
      const z = bz0 + kk * h;
      for (let jj = j0; jj <= j1; jj++) {
        const y = by0 + jj * h;
        let idx = (kk * ny + jj) * nx + i0;
        for (let ii = i0; ii <= i1; ii++, idx++) {
          const x = bx0 + ii * h;
          let d = primDist(p, x, y, z) - inflate;
          if (p.bump) d -= p.bump * (noise3(x * p.bumpF, y * p.bumpF, z * p.bumpF, 3) - 0.5);
          if (p.clipY !== undefined) {
            // keep only between clip planes (for cloth regions)
            if (p.clipY[0] !== null) d = Math.max(d, p.clipY[0] - y);
            if (p.clipY[1] !== null) d = Math.max(d, y - p.clipY[1]);
          }
          if (p.clipX !== undefined) {
            if (p.clipX[0] !== null) d = Math.max(d, p.clipX[0] - x);
            if (p.clipX[1] !== null) d = Math.max(d, x - p.clipX[1]);
          }
          const g = grid[idx];
          if (p.op === 'sub') grid[idx] = smax(g, -d, k);
          else if (p.op === 'inter') grid[idx] = smax(g, d, k);
          else grid[idx] = smin(g, d, k);
        }
      }
    }
  };

  for (const p of prims) splat(p, p.layer === 'cloth' ? cloth : body);

  // tears in cloth: carve holes where noise exceeds threshold
  if (spec.tears) {
    const { amount, freq, seed } = spec.tears;
    for (let kk = 0; kk < nz; kk++) for (let jj = 0; jj < ny; jj++) {
      let idx = (kk * ny + jj) * nx;
      for (let ii = 0; ii < nx; ii++, idx++) {
        if (cloth[idx] > band) continue;
        const x = bx0 + ii * h, y = by0 + jj * h, z = bz0 + kk * h;
        const n = noise3(x * freq, y * freq, z * freq, seed) * 0.65 + noise3(x * freq * 2.7, y * freq * 2.7, z * freq * 2.7, seed + 1) * 0.35;
        const t = (n - (1 - amount)) * 0.08;
        if (t > -band) cloth[idx] = Math.max(cloth[idx], t);
      }
    }
  }
  const field = new Float32Array(N);
  for (let i = 0; i < N; i++) field[i] = Math.min(body[i], cloth[i]);

  // ------------------------------------------------------------------ surface nets
  const cellIndex = new Int32Array(N).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float32Array(8);
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = field[((k + co[c][2]) * ny + (j + co[c][1])) * nx + (i + co[c][0])];
      corner[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of E) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t;
      sy += co[a][1] + (co[b][1] - co[a][1]) * t;
      sz += co[a][2] + (co[b][2] - co[a][2]) * t;
      cnt++;
    }
    cellIndex[(k * ny + j) * nx + i] = pos.length / 3;
    pos.push(bx0 + (i + sx / cnt) * h, by0 + (j + sy / cnt) * h, bz0 + (k + sz / cnt) * h);
  }
  const idx = [];
  const C = (i, j, k) => cellIndex[(k * ny + j) * nx + i];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[(k * ny + j) * nx + i];
    const in0 = v0 < 0;
    // x edge
    if (i < nx - 1) {
      const v1 = field[(k * ny + j) * nx + i + 1];
      if ((v1 < 0) !== in0) {
        const a = C(i, j - 1, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i, j - 1, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (in0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
      }
    }
    if (j < ny - 1) {
      const v1 = field[(k * ny + j + 1) * nx + i];
      if ((v1 < 0) !== in0) {
        const a = C(i - 1, j, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i - 1, j, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (in0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); }
      }
    }
    if (k < nz - 1) {
      const v1 = field[((k + 1) * ny + j) * nx + i];
      if ((v1 < 0) !== in0) {
        const a = C(i - 1, j - 1, k), b = C(i, j - 1, k), c = C(i, j, k), d = C(i - 1, j, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (in0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
      }
    }
  }

  // trilinear sampling helpers
  const sample = (x, y, z) => {
    let fx = (x - bx0) / h, fy = (y - by0) / h, fz = (z - bz0) / h;
    fx = Math.min(Math.max(fx, 0), nx - 1.001); fy = Math.min(Math.max(fy, 0), ny - 1.001); fz = Math.min(Math.max(fz, 0), nz - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const g = (a, b, c) => field[((k + c) * ny + (j + b)) * nx + (i + a)];
    const c00 = g(0, 0, 0) * (1 - tx) + g(1, 0, 0) * tx, c10 = g(0, 1, 0) * (1 - tx) + g(1, 1, 0) * tx;
    const c01 = g(0, 0, 1) * (1 - tx) + g(1, 0, 1) * tx, c11 = g(0, 1, 1) * (1 - tx) + g(1, 1, 1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  const sampleBody = (x, y, z) => {
    const i = Math.min(Math.max(Math.round((x - bx0) / h), 0), nx - 1), j = Math.min(Math.max(Math.round((y - by0) / h), 0), ny - 1), k = Math.min(Math.max(Math.round((z - bz0) / h), 0), nz - 1);
    const q = (k * ny + j) * nx + i;
    return [body[q], cloth[q]];
  };

  const vcount = pos.length / 3;
  const P = new Float32Array(pos);
  const Nrm = new Float32Array(vcount * 3);
  // two relaxation + projection passes: smooth the staircase, then snap back to the iso-surface
  const e = h * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (let v = 0; v < vcount; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let gx = sample(x + e, y, z) - sample(x - e, y, z);
      let gy = sample(x, y + e, z) - sample(x, y - e, z);
      let gz = sample(x, y, z + e) - sample(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      const d = sample(x, y, z);
      P[v * 3] = x - gx * d; P[v * 3 + 1] = y - gy * d; P[v * 3 + 2] = z - gz * d;
      Nrm[v * 3] = gx; Nrm[v * 3 + 1] = gy; Nrm[v * 3 + 2] = gz;
    }
  }

  // ------------------------------------------------------------------ materials + skin weights
  const nb = spec.bones;
  const skinIdx = new Uint16Array(vcount * 4);
  const skinW = new Float32Array(vcount * 4);
  const matA = new Float32Array(vcount * 4);
  const matB = new Float32Array(vcount * 4);
  const boneW = new Float32Array(nb);
  const falloff = spec.weightFalloff || 55;
  const mats = new Float32Array(8);
  for (let v = 0; v < vcount; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const [db, dc] = sampleBody(x, y, z);
    const isCloth = dc < db;
    boneW.fill(0);
    // material: nearest primitive of the winning layer decides (with soft blend)
    mats.fill(0);
    let best = 1e9, bestMat = 0;
    for (const p of prims) {
      if (p.op === 'sub' && !p.matOverride) continue;
      const d = primDist(p, x, y, z) - (p.inflate || 0);
      if (p.op !== 'sub') {
        const layerOk = (p.layer === 'cloth') === isCloth;
        const w = Math.exp(-Math.max(d, 0) * falloff) * (p.wScale ?? 1) * (p.layer === 'cloth' && !isCloth ? 0.5 : 1);
        if (p.bone !== undefined && p.noWeight !== true) boneW[p.bone] += w;
        if (layerOk && d < best) { best = d; bestMat = p.mat || 0; }
        if (layerOk) mats[p.mat || 0] += Math.exp(-Math.max(d, 0) * 250);
      } else if (p.matOverride !== undefined && Math.abs(d) < 0.0035) {
        // carved surfaces (mouth, sockets) take a material
        mats[p.matOverride] += 3.0 * (1 - Math.abs(d) / 0.0035);
      }
    }
    let ms = 0;
    for (let i = 0; i < 8; i++) ms += mats[i];
    if (ms < 1e-6) { mats[bestMat] = 1; ms = 1; }
    for (let i = 0; i < 4; i++) { matA[v * 4 + i] = mats[i] / ms; matB[v * 4 + i] = mats[i + 4] / ms; }
    // top-4 bones
    const order = [];
    for (let b = 0; b < nb; b++) if (boneW[b] > 1e-5) order.push(b);
    order.sort((a, b) => boneW[b] - boneW[a]);
    let s = 0;
    for (let i = 0; i < 4 && i < order.length; i++) s += boneW[order[i]];
    for (let i = 0; i < 4; i++) {
      if (i < order.length && s > 0) { skinIdx[v * 4 + i] = order[i]; skinW[v * 4 + i] = boneW[order[i]] / s; }
      else { skinIdx[v * 4 + i] = 0; skinW[v * 4 + i] = 0; }
    }
    if (order.length === 0) { skinIdx[v * 4] = 0; skinW[v * 4] = 1; }
  }
  const index = vcount > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { position: P, normal: Nrm, index, skinIndex: skinIdx, skinWeight: skinW, matA, matB, vcount, tris: idx.length / 3 };
}
