// Light sources are data; a fixed pool of PointLights is re-assigned each frame to the most
// relevant sources (keeps shader permutations constant and the light count mobile-friendly).
import * as THREE from 'three';

export const ZONE_RECTS = [
  ['lobby', -5, -8, 5, 0], ['office', -9, -8, -5, 0], ['corridor', -15, -10.4, 11, -8],
  ['1B', -8.5, -15.5, -2.5, -10.4], ['1C', -2.5, -19.7, 5.5, -10.4],
  ['service', 11, -10.4, 15, -8], ['service', 12.6, -20, 15, -10.4],
  ['laundry', 9, -8, 15, 0], ['maint', 5.5, -19.7, 12.6, -15],
  ['court', -15, -36, 15, -20], ['alley', -60, -52, 60, -36],
  ['lot', -17, 0, 17, 13], ['street', -300, 13, 150, 80],
];

export const ZONE_ADJ = {
  street: ['lot'], lot: ['street', 'lobby', 'office'], lobby: ['lot', 'office', 'corridor'], office: ['lobby', 'lot'],
  corridor: ['lobby', '1B', '1C', 'service'], '1B': ['corridor'], '1C': ['corridor', 'court'],
  service: ['corridor', 'laundry', 'maint', 'court'], laundry: ['service'], maint: ['service'],
  court: ['service', 'alley', '1C'], alley: ['court'],
};

export const OUTDOOR = new Set(['street', 'lot', 'court', 'alley']);

export function zoneAt(x, z) {
  for (const [name, x0, z0, x1, z1] of ZONE_RECTS) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
  return 'street';
}

export class LightSource {
  constructor(o) {
    this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    this.color = new THREE.Color(o.color ?? 0xffffff);
    this.intensity = o.intensity ?? 50;    // candela
    this.distance = o.distance ?? 12;
    this.zone = o.zone || zoneAt(this.pos.x, this.pos.z);
    this.pattern = o.pattern || 'steady';
    this.emissive = o.emissive || null;     // material(s) whose emissiveIntensity follows the light
    this.emissiveBase = o.emissiveBase ?? (this.emissive ? (Array.isArray(this.emissive) ? this.emissive[0].emissiveIntensity : this.emissive.emissiveIntensity) : 0);
    this.on = o.on ?? true;
    this.priority = o.priority ?? 1;
    this.phase = Math.random() * 100;
    this.level = 1;          // current animated multiplier
    this._state = 1; this._timer = 0;
    this.name = o.name || '';
    this.onUpdate = o.onUpdate || null;
  }

  update(dt, t) {
    let v = 1;
    switch (this.pattern) {
      case 'flicker': {
        this._timer -= dt;
        if (this._timer <= 0) {
          if (this._state === 1) { this._state = Math.random() < 0.5 ? 0 : 0.3; this._timer = 0.03 + Math.random() * 0.12; }
          else { this._state = 1; this._timer = Math.random() < 0.3 ? 0.05 + Math.random() * 0.2 : 0.8 + Math.random() * 3.5; }
        }
        v = this._state === 1 ? 0.93 + 0.07 * Math.sin(t * 377) : this._state;
        break;
      }
      case 'dying': {
        // mostly off, occasional stuttering attempts to start
        this._timer -= dt;
        if (this._timer <= 0) {
          this._state = this._state > 0 ? 0 : (Math.random() < 0.6 ? 0.7 : 1);
          this._timer = this._state > 0 ? 0.03 + Math.random() * 0.1 : 0.2 + Math.random() * 2.2;
        }
        v = this._state;
        break;
      }
      case 'buzz': v = 0.85 + 0.15 * Math.abs(Math.sin(t * 188.5 + this.phase)); break;
      case 'strobe': { const c = (t + this.phase) % 1.3; v = c < 0.07 ? 1 : 0; break; }
      case 'police-red': { const c = (t % 0.9); v = (c < 0.09 || (c > 0.16 && c < 0.25)) ? 1 : 0.0; break; }
      case 'police-blue': { const c = ((t + 0.45) % 0.9); v = (c < 0.09 || (c > 0.16 && c < 0.25)) ? 1 : 0.0; break; }
      case 'tv': {
        this._timer -= dt;
        if (this._timer <= 0) { this._state = 0.45 + Math.random() * 0.55; this._timer = 0.04 + Math.random() * 0.14; }
        v = this._state;
        break;
      }
      case 'swing': v = 1; break;
      default: v = 1;
    }
    if (!this.on) v = 0;
    this.level = v;
    if (this.emissive) {
      const e = this.emissiveBase * Math.max(v, this.pattern.startsWith('police') ? 0.04 : 0.02);
      if (Array.isArray(this.emissive)) for (const m of this.emissive) m.emissiveIntensity = e;
      else this.emissive.emissiveIntensity = e;
    }
    if (this.onUpdate) this.onUpdate(this, dt, t);
  }
}

export class LightManager {
  constructor(scene, poolSize = 6) {
    this.scene = scene;
    this.sources = [];
    this.pool = [];
    this.setPool(poolSize);
    this._scored = [];
  }

  setPool(n) {
    for (const p of this.pool) this.scene.remove(p.light);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.pool.push({ light: l, src: null, fade: 0 });
    }
  }

  add(o) { const s = o instanceof LightSource ? o : new LightSource(o); this.sources.push(s); return s; }

  update(dt, t, camPos, camZone) {
    for (const s of this.sources) s.update(dt, t);
    // score
    const adj = ZONE_ADJ[camZone] || [];
    const scored = this._scored; scored.length = 0;
    for (const s of this.sources) {
      if (!s.on) continue;
      let zf = s.zone === camZone ? 1 : adj.includes(s.zone) ? 0.35 : 0.02;
      if (OUTDOOR.has(camZone) && OUTDOOR.has(s.zone)) zf = Math.max(zf, 0.6);
      const d2 = s.pos.distanceToSquared(camPos);
      const range2 = s.distance * s.distance;
      if (d2 > range2 * 2.2 && zf < 1) continue;
      const score = s.priority * zf * Math.sqrt(s.intensity) / (1 + d2 / (range2 * 0.25));
      if (score > 0.002) scored.push([score, s]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const want = new Set();
    for (let i = 0; i < Math.min(this.pool.length, scored.length); i++) want.add(scored[i][1]);
    // keep assignments that are still wanted
    for (const p of this.pool) if (p.src && !want.has(p.src)) p.target = null; else if (p.src) { p.target = p.src; want.delete(p.src); }
    // free slots take new sources
    for (const p of this.pool) {
      if (p.src && p.target === null) {
        // fade out quickly then release
        p.fade -= dt * 8;
        if (p.fade <= 0) { p.src = null; p.fade = 0; }
      }
      if (!p.src && want.size) {
        const s = want.values().next().value; want.delete(s);
        p.src = s; p.fade = 0; p.target = s;
      }
      if (p.src && p.target) p.fade = Math.min(1, p.fade + dt * 6);
      const l = p.light;
      if (p.src) {
        const s = p.src;
        l.position.copy(s.pos);
        l.color.copy(s.color);
        l.distance = s.distance;
        l.intensity = s.intensity * s.level * p.fade;
      } else l.intensity = 0;
    }
  }
}
