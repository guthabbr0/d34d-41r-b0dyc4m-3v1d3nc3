// Portal culling. Every wall opening the level builder declares (doorways, windows) is a portal
// between the zones on its two sides; a closed door closes its portal. Each frame the camera's zone
// is flood-filled through portals whose screen rectangle still overlaps the (narrowing) view window,
// and the camera's layer mask is set to the zones reached. Zone meshes live on one layer per zone
// (lights.js ZONE_LAYER); the flashlight shadow pass tests casters against the same view mask.
import * as THREE from 'three';
import { zoneAtStrict, zoneAt, ZONE_LAYER } from './lights.js';

// open-air neighbours with no wall between them are one visibility region
const REGION = { street: ['street', 'lot'], lot: ['street', 'lot'], court: ['court', 'alley'], alley: ['court', 'alley'] };
const ALL = 0xffffffff;
const _p = new THREE.Vector4(), _vp = new THREE.Matrix4();

export class PortalGraph {
  // openings: [{axis:'x'|'z', at, a, b, y0, y1}] (axis 'x': wall along X at z = at, opening x in [a,b])
  constructor(openings, doors) {
    this.portals = [];
    for (const o of openings) {
      const mid = (o.a + o.b) / 2, side = (s) => o.axis === 'x' ? [mid, o.at + s] : [o.at + s, mid];
      const zA = zoneAtStrict(...side(-0.35)) || zoneAt(...side(-0.35)), zB = zoneAtStrict(...side(0.35)) || zoneAt(...side(0.35));
      if (zA === zB || !ZONE_LAYER[zA] || !ZONE_LAYER[zB]) continue;
      const door = doors.find(d => d.axis === o.axis && Math.abs(d.at - o.at) < 0.25 && d.a < o.b - 0.05 && d.b > o.a + 0.05) || null;
      const c = o.axis === 'x'
        ? [[o.a, o.y0, o.at], [o.b, o.y0, o.at], [o.b, o.y1, o.at], [o.a, o.y1, o.at]]
        : [[o.at, o.y0, o.a], [o.at, o.y0, o.b], [o.at, o.y1, o.b], [o.at, o.y1, o.a]];
      this.portals.push({ zA, zB, door, corners: c.map(v => new THREE.Vector3(...v)) });
    }
    this.byZone = {};
    for (const p of this.portals) for (const z of [p.zA, p.zB]) (this.byZone[z] || (this.byZone[z] = [])).push(p);
    this._rect = [0, 0, 0, 0];
  }

  open(p) {
    const d = p.door;
    return !d || d.kind === 'glass' || d.open > 0.02 || d.target > 0.02;
  }

  // screen rectangle [x0,y0,x1,y1] in NDC of a portal, clipped to `clip`; null if outside
  _project(p, clip) {
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1, behind = 0;
    for (const c of p.corners) {
      _p.set(c.x, c.y, c.z, 1).applyMatrix4(_vp);
      if (_p.w < 0.05) { behind++; continue; }
      const x = _p.x / _p.w, y = _p.y / _p.w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (behind === 4) return null;
    if (behind) { x0 = -1; y0 = -1; x1 = 1; y1 = 1; }   // straddling the lens plane: keep the whole window
    x0 = Math.max(x0, clip[0]); y0 = Math.max(y0, clip[1]); x1 = Math.min(x1, clip[2]); y1 = Math.min(y1, clip[3]);
    return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null;
  }

  // Layer mask of the zones visible from `camera` (matrices must be current).
  mask(camera) {
    const e = camera.matrixWorld.elements;
    const zone = zoneAtStrict(e[12], e[14]);
    if (!zone || zone === 'sealed' || !ZONE_LAYER[zone]) return ALL;
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    let mask = 1;
    const region = REGION[zone] || [zone];
    const home = new Set(region);
    let steps = 0;
    const visit = (z, rect, path) => {
      if (++steps > 400) { mask = ALL; return; }             // pathological: give up conservatively
      for (const rz of REGION[z] || [z]) {
        mask |= 1 << ZONE_LAYER[rz];
        for (const p of this.byZone[rz] || []) {
          if (!this.open(p)) continue;
          const other = p.zA === rz ? p.zB : p.zA;
          if (home.has(other) || path.includes(other)) continue;
          const r = this._project(p, rect);
          if (r) visit(other, r, path.concat(rz));
        }
      }
    };
    for (const z of region) visit(z, [-1, -1, 1, 1], region);
    return mask;
  }
}
