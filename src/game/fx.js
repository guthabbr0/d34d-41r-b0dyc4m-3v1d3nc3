// Visual effects: lit billboard particles, atlas decals, blood pools, brass & magazines with
// physics, muzzle flash, rain (GPU-wrapped), and camera-lens water drops.
import * as THREE from 'three';
import { SURF } from './world.js';
import { mulberry } from '../engine/post.js';

const TILE = { SMOKE: 0, MIST: 1, DROP: 2, SPARK: 3, DUST: 4, STAR: 5, CHUNK: 6, SPLASH: 7, STREAK: 8, SPLINTER: 9, GLASS: 10 };

// ------------------------------------------------------------------ procedural atlases
function particleAtlas() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d');
  const rnd = mulberry(4242);
  const at = (i) => [(i % 4) * S, Math.floor(i / 4) * S];
  const blob = (i, col, soft, lumps) => {
    const [x, y] = at(i);
    for (let k = 0; k < lumps; k++) {
      const r = S * (0.12 + rnd() * 0.2), cx = x + S / 2 + (rnd() - 0.5) * S * 0.35, cy = y + S / 2 + (rnd() - 0.5) * S * 0.35;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, col(0.5 / lumps * 6)); gr.addColorStop(soft, col(0.3 / lumps * 6)); gr.addColorStop(1, col(0));
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    }
  };
  g.globalCompositeOperation = 'lighter';
  blob(TILE.SMOKE, a => `rgba(255,255,255,${a})`, 0.5, 14);
  blob(TILE.MIST, a => `rgba(255,255,255,${a})`, 0.4, 18);
  blob(TILE.DUST, a => `rgba(255,255,255,${a * 0.8})`, 0.6, 10);
  g.globalCompositeOperation = 'source-over';
  // droplet
  { const [x, y] = at(TILE.DROP); const gr = g.createRadialGradient(x + 64, y + 64, 0, x + 64, y + 64, 40); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x + 64, y + 64, 40, 0, 7); g.fill(); }
  // spark / streak
  { const [x, y] = at(TILE.SPARK); const gr = g.createRadialGradient(x + 64, y + 64, 0, x + 64, y + 64, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(x, y, S, S); }
  { const [x, y] = at(TILE.STREAK); const gr = g.createLinearGradient(x + 54, 0, x + 74, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + 54, y + 4, 20, S - 8); }
  // muzzle star
  { const [x, y] = at(TILE.STAR); g.save(); g.translate(x + 64, y + 64);
    for (let k = 0; k < 7; k++) { g.rotate(Math.PI * 2 / 7 + rnd() * 0.3); const L = 30 + rnd() * 34; const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(L, 0); g.lineTo(0, 7); g.fill(); }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,170,70,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); g.restore(); }
  // chunk
  { const [x, y] = at(TILE.CHUNK); g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, r = 22 + rnd() * 22; g.lineTo(x + 64 + Math.cos(a) * r, y + 64 + Math.sin(a) * r); } g.fill(); }
  // splash ring
  { const [x, y] = at(TILE.SPLASH); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6; g.beginPath(); g.ellipse(x + 64, y + 64, 50, 50, 0, 0, 7); g.stroke(); }
  // splinter
  { const [x, y] = at(TILE.SPLINTER); g.fillStyle = '#fff'; g.fillRect(x + 58, y + 20, 12, 88); }
  // glass shard
  { const [x, y] = at(TILE.GLASS); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(x + 30, y + 20); g.lineTo(x + 100, y + 50); g.lineTo(x + 60, y + 110); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function decalAtlas(maxSide = 1024) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d');
  const rnd = mulberry(99);
  const at = (i) => [(i % 4) * S, Math.floor(i / 4) * S];
  // 0-3 bullet holes
  for (let i = 0; i < 4; i++) {
    const [x, y] = at(i);
    const cx = x + S / 2, cy = y + S / 2;
    // chipped crater
    const R = i === 3 ? 34 : 60;
    for (let k = 0; k < 40; k++) { const a = rnd() * 6.28, r = R * (0.5 + rnd() * 0.6); g.fillStyle = `rgba(${i === 3 ? '150,150,150' : '70,62,55'},${0.15 + rnd() * 0.3})`; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, 6 + rnd() * 16, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
    gr.addColorStop(0, 'rgba(5,4,3,1)'); gr.addColorStop(0.35, 'rgba(10,8,6,1)'); gr.addColorStop(0.6, 'rgba(40,34,28,0.8)'); gr.addColorStop(1, 'rgba(40,34,28,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, 7); g.fill();
    // radial cracks
    g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const a = rnd() * 6.28, L = R * (0.6 + rnd() * 0.9); g.beginPath(); g.moveTo(cx, cy); let px = cx, py = cy; for (let s = 1; s <= 4; s++) { px = cx + Math.cos(a + (rnd() - 0.5) * 0.4) * L * s / 4; py = cy + Math.sin(a + (rnd() - 0.5) * 0.4) * L * s / 4; g.lineTo(px, py); } g.stroke(); }
  }
  // 4-7 blood splats (directional spatter)
  for (let i = 4; i < 8; i++) {
    const [x, y] = at(i);
    const cx = x + S / 2, cy = y + S / 2;
    const col = () => `rgba(${48 + rnd() * 28 | 0},${4 + rnd() * 6 | 0},${3 + rnd() * 4 | 0},${0.8 + rnd() * 0.2})`;
    g.fillStyle = col(); g.beginPath(); g.arc(cx, cy, 34 + rnd() * 20, 0, 7); g.fill();
    for (let k = 0; k < 60; k++) {
      const a = rnd() * 6.28, r = 20 + rnd() ** 0.7 * 100, sz = (1 - r / 130) * 14 * rnd() + 1.5;
      g.fillStyle = col(); g.beginPath(); g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, sz * (1 + r / 60), sz, a, 0, 7); g.fill();
    }
  }
  // 8-9 drips (vertical runs from a splat)
  for (let i = 8; i < 10; i++) {
    const [x, y] = at(i);
    g.fillStyle = 'rgba(58,5,3,0.95)'; g.beginPath(); g.arc(x + S / 2, y + 50, 40, 0, 7); g.fill();
    for (let k = 0; k < 7; k++) { const dx = x + S / 2 + (rnd() - 0.5) * 70, L = 60 + rnd() * 150, w = 3 + rnd() * 7; g.fillRect(dx - w / 2, y + 50, w, L); g.beginPath(); g.arc(dx, y + 50 + L, w * 0.8, 0, 7); g.fill(); }
  }
  // 10-11 smears / trails
  for (let i = 10; i < 12; i++) {
    const [x, y] = at(i);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(${40 + rnd() * 20 | 0},4,3,${0.3 + rnd() * 0.45})`; g.fillRect(x + 20 + rnd() * 20, y + 10 + k * 7, S - 60 - rnd() * 40, 6 + rnd() * 8); }
  }
  // 12 bloody footprint
  { const [x, y] = at(12); g.fillStyle = 'rgba(48,5,3,0.8)'; g.beginPath(); g.ellipse(x + 128, y + 90, 40, 62, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + 128, y + 190, 32, 40, 0, 0, 7); g.fill(); }
  // 13 scorch / soot
  { const [x, y] = at(13); const gr = g.createRadialGradient(x + 128, y + 128, 0, x + 128, y + 128, 110); gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, S, S); }
  // 14 blood pool
  { const [x, y] = at(14); g.fillStyle = 'rgba(42,3,2,1)'; g.beginPath(); for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28, r = 90 + rnd() * 30; g.lineTo(x + 128 + Math.cos(a) * r, y + 128 + Math.sin(a) * r); } g.fill(); }
  // 15 glass crack
  { const [x, y] = at(15); g.strokeStyle = 'rgba(230,240,255,0.8)'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { const a = rnd() * 6.28; g.beginPath(); g.moveTo(x + 128, y + 128); g.lineTo(x + 128 + Math.cos(a) * 120, y + 128 + Math.sin(a) * 120); g.stroke(); } for (let r = 20; r < 110; r += 30) { g.beginPath(); g.arc(x + 128, y + 128, r, 0, 7); g.stroke(); } }
  // drawn at 1024 (tile art uses absolute pixel sizes), downsampled once for the low texture budget
  let out = c;
  if (maxSide < c.width) { out = document.createElement('canvas'); out.width = out.height = maxSide; const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.drawImage(c, 0, 0, maxSide, maxSide); }
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ particle system
const P_VERT = /* glsl */`
attribute vec4 iPosSize;  // xyz, size
attribute vec4 iColor;    // rgb, alpha
attribute vec4 iMisc;     // rot, tile, stretch, emissive
attribute vec3 iVel;
uniform vec3 uAmbient; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uFlashOn; uniform vec3 uFlashCol;
uniform vec3 uMuzzlePos; uniform float uMuzzle;
uniform vec4 uLights[4]; uniform vec3 uLightCols[4];
uniform float uFogDensity;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
vec3 lightAt(vec3 p) {
  vec3 L = uAmbient;
  vec3 d = p - uFlashPos; float dist = length(d);
  float cone = smoothstep(0.82, 0.96, dot(d / max(dist, 1e-3), uFlashDir));
  L += uFlashCol * uFlashOn * cone / (1.0 + dist * dist * 0.35);
  vec3 dm = p - uMuzzlePos; L += vec3(1.0, 0.7, 0.4) * uMuzzle * 6.0 / (1.0 + dot(dm, dm) * 4.0);
  for (int i = 0; i < 4; i++) { vec3 dl = p - uLights[i].xyz; L += uLightCols[i] * uLights[i].w / (1.0 + dot(dl, dl)); }
  return L;
}
void main() {
  vec3 wp = iPosSize.xyz;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float rot = iMisc.x;
  vec2 q = position.xy;
  vec2 off;
  if (iMisc.z > 0.0) {
    // velocity-aligned streak
    vec3 v1 = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 dir = normalize(v1.xy + vec2(1e-5, 0.0));
    vec2 perp = vec2(-dir.y, dir.x);
    float len = max(iPosSize.w, length(v1.xy) * iMisc.z);
    off = dir * q.y * len + perp * q.x * iPosSize.w * 0.35;
  } else {
    float c = cos(rot), s = sin(rot);
    off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iPosSize.w;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float tile = iMisc.y;
  vUv = (vec2(mod(tile, 4.0), 3.0 - floor(tile / 4.0)) + (position.xy + 0.5)) / 4.0;
  vec3 lit = iMisc.w > 0.5 ? vec3(iMisc.w) : lightAt(wp);
  vCol = vec4(iColor.rgb * lit, iColor.a);
  vFog = exp(-uFogDensity * uFogDensity * dot(mv.xyz, mv.xyz));
}`;
const P_FRAG = /* glsl */`
uniform sampler2D tAtlas; uniform vec3 uFogColor; uniform float uAdditive;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  float a = t.a * vCol.a;
  if (a < 0.003) discard;
  vec3 c = vCol.rgb * mix(t.rgb, vec3(1.0), 0.0);
  if (uAdditive > 0.5) gl_FragColor = vec4(c * a * vFog, 1.0);
  else gl_FragColor = vec4(mix(uFogColor, c, vFog), a);
}`;

class ParticleLayer {
  constructor(scene, atlas, max, additive, shared) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosSize', this.aPos); geo.setAttribute('iColor', this.aCol); geo.setAttribute('iMisc', this.aMisc); geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG,
      uniforms: { ...shared, tAtlas: { value: atlas }, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
    this.geo = geo;
    this.list = [];
  }
  spawn(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(p); return p; }
  update(dt, fx) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { if (p.onDie) p.onDie(p); continue; }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.collide && p.pos.y < (p.floor ?? 0.01)) {
        if (p.onGround) { p.onGround(p); if (p.dead) continue; }
        p.pos.y = p.floor ?? 0.01; p.vel.y *= -0.25; p.vel.x *= 0.5; p.vel.z *= 0.5;
      }
      p.rot += p.rotVel * dt;
      L[w++] = p;
    }
    L.length = w;
    const pos = this.aPos.array, col = this.aCol.array, misc = this.aMisc.array, vel = this.aVel.array;
    for (let i = 0; i < w; i++) {
      const p = L[i], t = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * t;
      const a = p.alpha * (t < p.fadeIn ? t / p.fadeIn : 1) * (1 - Math.max(0, (t - p.fadeOut) / (1 - p.fadeOut)));
      pos[i * 4] = p.pos.x; pos[i * 4 + 1] = p.pos.y; pos[i * 4 + 2] = p.pos.z; pos[i * 4 + 3] = size;
      col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = a;
      misc[i * 4] = p.rot; misc[i * 4 + 1] = p.tile; misc[i * 4 + 2] = p.stretch; misc[i * 4 + 3] = p.emissive;
      vel[i * 3] = p.vel.x; vel[i * 3 + 1] = p.vel.y; vel[i * 3 + 2] = p.vel.z;
    }
    this.geo.instanceCount = w;
    // upload only the live range (the arrays are sized for the worst case), nothing when idle
    if (w > 0 || this.lastW > 0) {
      for (const a of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
        a.clearUpdateRanges();
        if (w > 0) { a.addUpdateRange(0, w * a.itemSize); a.needsUpdate = true; }
      }
    }
    this.lastW = w;
  }
  clear() { this.list.length = 0; this.geo.instanceCount = 0; }
}

function P(o) {
  return Object.assign({
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size0: 0.1, size1: 0.2, alpha: 1, fadeIn: 0.05, fadeOut: 0.5,
    r: 1, g: 1, b: 1, rot: Math.random() * 6.28, rotVel: 0, tile: 0, grav: 0, drag: 0, stretch: 0, emissive: 0, collide: false,
  }, o);
}

// ------------------------------------------------------------------ decals
const DECAL_UV = (i) => [(i % 4) / 4, (3 - Math.floor(i / 4)) / 4, 0.25, 0.25];

class Decals {
  constructor(scene, atlas, max = 380) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    geo.setAttribute('iUV', this.uvAttr);
    const mat = new THREE.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, envMapIntensity: 0.8 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 iUV;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = iUV.xy + uv * iUV.zw;\n#endif');
    };
    mat.customProgramCacheKey = () => 'decal1';
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.next = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  add(point, normal, tile, size, rot = Math.random() * 6.28, stretch = 1) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this._q.setFromUnitVectors(_Z, normal);
    const qr = new THREE.Quaternion().setFromAxisAngle(_Z, rot);
    this._q.multiply(qr);
    this._p.copy(point).addScaledVector(normal, 0.003 + Math.random() * 0.002);
    this._s.set(size, size * stretch, 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    const uv = DECAL_UV(tile);
    this.uvAttr.setXYZW(i, uv[0], uv[1], uv[2], uv[3]);
    this.mesh.instanceMatrix.needsUpdate = true; this.uvAttr.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.next = 0; }
}
const _Z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ rain
const RAIN_VERT = /* glsl */`
attribute vec4 iSeed;
uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uFlashOn;
uniform vec4 uLights[4]; uniform vec3 uLightCols[4]; uniform vec3 uAmbient; uniform float uDensity; uniform vec3 uWind;
uniform float uIndoorX0; uniform float uIndoorX1; uniform float uIndoorZ0; uniform float uIndoorZ1;
varying float vA; varying vec3 vC; varying vec2 vUv;
void main() {
  vec3 speed = vec3(uWind.x, -9.0 - iSeed.w * 2.0, uWind.z);
  vec3 p = iSeed.xyz * uBox + speed * uTime;
  p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
  // no rain inside the building footprint (below the roof)
  float inside = step(uIndoorX0, p.x) * step(p.x, uIndoorX1) * step(uIndoorZ0, p.z) * step(p.z, uIndoorZ1);
  float keep = step(iSeed.w, uDensity) * (1.0 - inside);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vd = (viewMatrix * vec4(speed, 0.0)).xyz * 0.022;
  vec2 dir = normalize(vd.xy + vec2(1e-5, 0.0));
  vec2 perp = vec2(-dir.y, dir.x);
  float len = length(vd.xy) + 0.05;
  mv.xy += dir * position.y * len + perp * position.x * 0.006;
  gl_Position = projectionMatrix * mv;
  gl_Position *= keep;
  vec3 L = uAmbient * 0.6;
  vec3 d = p - uFlashPos; float dist = length(d);
  L += vec3(1.0, 0.95, 0.9) * uFlashOn * smoothstep(0.85, 0.97, dot(d / max(dist, 1e-3), uFlashDir)) * 2.5 / (1.0 + dist * dist * 0.08);
  for (int i = 0; i < 4; i++) { vec3 dl = p - uLights[i].xyz; L += uLightCols[i] * uLights[i].w * 1.3 / (1.0 + dot(dl, dl) * 0.25); }
  vC = L;
  vA = 0.35 * smoothstep(0.2, 2.0, -mv.z);
  vUv = position.xy + 0.5;
}`;
const RAIN_FRAG = /* glsl */`
varying float vA; varying vec3 vC; varying vec2 vUv;
void main() { float a = vA * (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y); gl_FragColor = vec4(vC * a, 1.0); }`;

// ------------------------------------------------------------------ main FX class
export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.scene = scene;
    this.shared = {
      uAmbient: { value: new THREE.Color(0.02, 0.022, 0.028) },
      uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) }, uFlashOn: { value: 1 }, uFlashCol: { value: new THREE.Color(3.0, 2.85, 2.6) },
      uMuzzlePos: { value: new THREE.Vector3() }, uMuzzle: { value: 0 },
      uLights: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uLightCols: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uFogDensity: { value: 0.02 }, uFogColor: { value: new THREE.Color(0x050608) },
    };
    this.atlas = particleAtlas();
    this.decalAtlas = decalAtlas((game.settings.get('texCap') || 1024) <= 256 || game.settings.get('lowTex') ? 512 : 1024);
    // live-particle caps per tier (overdraw budget): low 300, medium 800, high/ultra 1200
    const cap = { low: [220, 80], medium: [600, 200], high: [900, 300], ultra: [900, 300] }[game.settings.get('quality')] || [600, 200];
    this.alpha = new ParticleLayer(scene, this.atlas, cap[0], false, this.shared);
    this.add = new ParticleLayer(scene, this.atlas, cap[1], true, this.shared);
    this.decals = new Decals(scene, this.decalAtlas);
    // blood pools
    this.pools = [];
    this.poolMat = new THREE.MeshStandardMaterial({ map: this.decalAtlas, color: 0xffffff, roughness: 0.06, metalness: 0.1, transparent: true, depthWrite: false, envMapIntensity: 1.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.poolGeo.rotateX(-Math.PI / 2);
    const uv = this.poolGeo.attributes.uv; const u = DECAL_UV(14);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u[0] + uv.getX(i) * u[2], u[1] + uv.getY(i) * u[3]);
    // brass
    this.shells = [];
    const wm = game.weaponMats;
    this.brassGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 8); this.brassGeo.rotateX(Math.PI / 2);
    this.shellGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.06, 8); this.shellGeo.rotateX(Math.PI / 2);
    this.brassMesh = new THREE.InstancedMesh(this.brassGeo, wm.brass, 60); this.brassMesh.count = 0; this.brassMesh.frustumCulled = false; scene.add(this.brassMesh);
    this.hullMesh = new THREE.InstancedMesh(this.shellGeo, wm.shellRed, 30); this.hullMesh.count = 0; this.hullMesh.frustumCulled = false; scene.add(this.hullMesh);
    this.brass = []; this.hulls = [];
    this.mags = [];
    this.gore = [];
    // muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2);
    scene.add(this.muzzleLight);
    this.muzzleT = 0;
    // rain
    this.rain = this.buildRain(game.settings.get('rain'));
    this.rainOn = true;
    // lens drops
    this.dropsCanvas = document.createElement('canvas');
    this.dropsCanvas.width = 192; this.dropsCanvas.height = 108;
    this.dropsCtx = this.dropsCanvas.getContext('2d');
    this.dropsTex = new THREE.CanvasTexture(this.dropsCanvas);
    this.dropsTex.colorSpace = THREE.NoColorSpace;
    this.lensDrops = [];
    this.dropT = 0;
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
    this.splashT = 0;
  }

  buildRain(density) {
    const N = 2400;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    const seeds = new Float32Array(N * 4);
    const r = mulberry(7);
    for (let i = 0; i < N; i++) { seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = r(); }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        ...this.shared, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(18, 12, 18) },
        uDensity: { value: Math.min(1, density / 1.2) }, uWind: { value: new THREE.Vector3(0.8, 0, 0.3) },
        uIndoorX0: { value: -15 }, uIndoorX1: { value: 15 }, uIndoorZ0: { value: -20 }, uIndoorZ1: { value: 0 },
      },
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    this.scene.add(m);
    return m;
  }

  setRainDensity(d) { this.rain.material.uniforms.uDensity.value = Math.min(1, d / 1.2); }

  // ------------------------------------------------------------------ spawners
  muzzleFlash(pos, dir, big = false) {
    this.muzzleT = big ? 0.07 : 0.05;
    this.muzzleLight.position.copy(pos).addScaledVector(dir, 0.1);
    this.muzzleLight.intensity = big ? 90 : 55;
    this.shared.uMuzzlePos.value.copy(pos);
    // flash sprites
    for (let i = 0; i < (big ? 3 : 2); i++) {
      this.add.spawn(P({ pos: pos.clone().addScaledVector(dir, 0.02 + i * 0.04), life: 0.045, size0: (big ? 0.22 : 0.12) * (1 - i * 0.2), size1: (big ? 0.26 : 0.15), tile: TILE.STAR, emissive: 40, r: 1, g: 0.8, b: 0.55, fadeIn: 0, fadeOut: 0.3 }));
    }
    // smoke
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const v = dir.clone().multiplyScalar(0.6 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      this.alpha.spawn(P({ pos: pos.clone().addScaledVector(dir, 0.05), vel: v, life: 1.2 + Math.random() * 1.2, size0: 0.04, size1: 0.35 + Math.random() * 0.25, tile: TILE.SMOKE, drag: 2.5, grav: -0.15, alpha: 0.12, r: 0.8, g: 0.8, b: 0.8, rotVel: (Math.random() - 0.5) * 1.5, fadeIn: 0.05, fadeOut: 0.2 }));
    }
  }

  ejectShell(pos, vel, kind = 'brass') {
    const s = { pos: pos.clone(), vel: vel.clone(), rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), age: 0, rest: false, bounces: 0, kind };
    const arr = kind === 'brass' ? this.brass : this.hulls;
    const cap = kind === 'brass' ? 60 : 30;
    if (arr.length >= cap) arr.shift();
    arr.push(s);
  }

  dropMag(obj, vel) {
    // obj: a cloned magazine mesh in world space
    this.scene.add(obj);
    this.mags.push({ obj, vel: vel.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), rest: false, age: 0 });
    if (this.mags.length > (this.game.settings.get('quality') === 'low' ? 3 : 8)) { const m = this.mags.shift(); this.scene.remove(m.obj); }
  }

  impact(point, normal, surf, dir) {
    const g = this.game;
    const n = normal;
    let tile = 0, size = 0.05;
    if (surf === SURF.METAL) { tile = 3; size = 0.03; }
    else if (surf === SURF.WOOD) { tile = 2; size = 0.045; }
    else if (surf === SURF.GLASS) { tile = 15; size = 0.22; }
    else if (surf === SURF.FABRIC) { tile = 3; size = 0.025; }
    else tile = Math.random() < 0.5 ? 0 : 1;
    this.decals.add(point, n, tile, size * (0.8 + Math.random() * 0.4));
    const refl = dir.clone().reflect(n);
    if (surf === SURF.METAL) {
      for (let i = 0; i < 10; i++) {
        const v = refl.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9)).normalize().multiplyScalar(3 + Math.random() * 6);
        this.add.spawn(P({ pos: point.clone(), vel: v, life: 0.25 + Math.random() * 0.35, size0: 0.012, size1: 0.006, tile: TILE.SPARK, grav: 6, stretch: 0.03, emissive: 25, r: 1, g: 0.75, b: 0.4, fadeIn: 0, collide: true }));
      }
    } else if (surf === SURF.GLASS) {
      for (let i = 0; i < 12; i++) {
        const v = refl.clone().multiplyScalar(-1).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5)).multiplyScalar(2 + Math.random() * 2);
        this.alpha.spawn(P({ pos: point.clone(), vel: v, life: 1.5, size0: 0.02, size1: 0.02, tile: TILE.GLASS, grav: 9.8, rotVel: 10, alpha: 0.7, r: 0.8, g: 0.85, b: 0.9, collide: true, fadeOut: 0.8 }));
      }
    } else {
      const col = surf === SURF.WOOD ? [0.45, 0.32, 0.2] : surf === SURF.TILE ? [0.7, 0.68, 0.64] : [0.6, 0.58, 0.55];
      for (let i = 0; i < 7; i++) {
        const v = n.clone().multiplyScalar(1 + Math.random() * 2.5).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(1.6));
        this.alpha.spawn(P({ pos: point.clone(), vel: v, life: 0.6 + Math.random() * 0.5, size0: 0.01, size1: 0.008, tile: surf === SURF.WOOD ? TILE.SPLINTER : TILE.CHUNK, grav: 9.8, collide: true, r: col[0] * 0.5, g: col[1] * 0.5, b: col[2] * 0.5, rotVel: 12 }));
      }
      for (let i = 0; i < 3; i++) {
        const v = n.clone().multiplyScalar(0.4 + Math.random() * 0.8).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).multiplyScalar(0.4));
        this.alpha.spawn(P({ pos: point.clone().addScaledVector(n, 0.03), vel: v, life: 1.2 + Math.random(), size0: 0.05, size1: 0.35, tile: TILE.DUST, drag: 3, grav: -0.05, alpha: 0.28, r: col[0], g: col[1], b: col[2], rotVel: (Math.random() - 0.5) }));
      }
    }
  }

  bloodHit(point, dir, amount = 1, zone = 'torso') {
    // forward mist + droplets that paint the floor/walls when they land
    const back = dir.clone().negate();
    for (let i = 0; i < 3 + amount * 3; i++) {
      const v = dir.clone().multiplyScalar(0.5 + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
      this.alpha.spawn(P({ pos: point.clone(), vel: v, life: 0.5 + Math.random() * 0.4, size0: 0.05, size1: 0.3 * amount + 0.1, tile: TILE.MIST, drag: 4, grav: 0.3, alpha: 0.5, r: 0.35, g: 0.02, b: 0.015, fadeIn: 0.02, fadeOut: 0.3 }));
    }
    for (let i = 0; i < 4 + amount * 6; i++) {
      const base = Math.random() < 0.7 ? dir : back;
      const v = base.clone().multiplyScalar(1.5 + Math.random() * 3.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5));
      this.alpha.spawn(P({
        pos: point.clone(), vel: v, life: 2, size0: 0.012 + Math.random() * 0.01, size1: 0.01, tile: TILE.DROP, grav: 9.8, drag: 0.4, stretch: 0.02, alpha: 0.95, r: 0.3, g: 0.015, b: 0.01, collide: true, fadeOut: 0.95,
        onGround: (p) => { if (Math.random() < 0.45) this.decals.add(new THREE.Vector3(p.pos.x, 0.0, p.pos.z), UPV, 4 + (Math.random() * 4 | 0), 0.05 + Math.random() * 0.1); p.dead = true; p.age = p.life; },
      }));
    }
    // back-spatter onto the wall behind the target
    const hit = this.game.world.raycast(point, dir, 3.2);
    if (hit) {
      const tile = hit.normal.y > 0.7 ? 4 + (Math.random() * 4 | 0) : (Math.random() < 0.5 ? 8 + (Math.random() * 2 | 0) : 4 + (Math.random() * 4 | 0));
      const rot = hit.normal.y > 0.7 ? Math.random() * 6.28 : Math.PI + (Math.random() - 0.5) * 0.3;
      this.decals.add(hit.point, hit.normal, tile, (0.35 + Math.random() * 0.4) * amount * (1 - hit.t / 5), rot);
    }
  }

  headBurst(point, dir) {
    for (let i = 0; i < 26; i++) {
      const v = dir.clone().multiplyScalar(1 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
      const chunk = Math.random() < 0.4;
      this.alpha.spawn(P({ pos: point.clone(), vel: v, life: 2.5, size0: chunk ? 0.03 : 0.018, size1: chunk ? 0.03 : 0.012, tile: chunk ? TILE.CHUNK : TILE.DROP, grav: 9.8, drag: 0.3, alpha: 1, r: chunk ? 0.25 : 0.3, g: 0.02, b: 0.02, collide: true, rotVel: 8,
        onGround: (p) => { if (Math.random() < 0.5) this.decals.add(new THREE.Vector3(p.pos.x, 0, p.pos.z), UPV, 4 + (Math.random() * 4 | 0), 0.08 + Math.random() * 0.12); p.dead = true; p.age = p.life; } }));
    }
    for (let i = 0; i < 8; i++) {
      const v = dir.clone().multiplyScalar(0.8 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)));
      this.alpha.spawn(P({ pos: point.clone(), vel: v, life: 1 + Math.random() * 0.6, size0: 0.1, size1: 0.6, tile: TILE.MIST, drag: 3, grav: 0.2, alpha: 0.55, r: 0.3, g: 0.02, b: 0.015 }));
    }
    const hit = this.game.world.raycast(point, dir, 4);
    if (hit) this.decals.add(hit.point, hit.normal, 4 + (Math.random() * 4 | 0), 0.9, Math.random() * 6.28);
  }

  bloodDecal(point, normal, tile, size, rot) { this.decals.add(point, normal, tile, size, rot); }

  makeBloodPool() {
    const max = this.game.settings.get('maxCorpses') || 10;
    if (this.pools.length >= max) { const old = this.pools.shift(); old.parent && old.parent.remove(old); }
    const m = new THREE.Mesh(this.poolGeo, this.poolMat);
    m.rotation.y = Math.random() * 6.28;
    m.renderOrder = 1;
    m.receiveShadow = true;
    this.scene.add(m);
    this.pools.push(m);
    return m;
  }

  dust(point, count = 6, spread = 0.4) {
    for (let i = 0; i < count; i++) {
      this.alpha.spawn(P({ pos: point.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 0.2, (Math.random() - 0.5) * spread)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), life: 1.5 + Math.random(), size0: 0.1, size1: 0.6, tile: TILE.DUST, drag: 2, alpha: 0.18, r: 0.6, g: 0.58, b: 0.55 }));
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, t, cam, flash, lightsInfo, outdoor) {
    const sh = this.shared;
    if (flash) {
      sh.uFlashPos.value.copy(flash.pos); sh.uFlashDir.value.copy(flash.dir); sh.uFlashOn.value = flash.on ? 1 : 0;
    }
    if (lightsInfo) for (let i = 0; i < 4; i++) {
      const l = lightsInfo[i];
      if (l) { sh.uLights.value[i].set(l.position.x, l.position.y, l.position.z, Math.min(3, l.intensity / 60)); sh.uLightCols.value[i].copy(l.color); }
      else sh.uLights.value[i].w = 0;
    }
    // muzzle light decay
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzleLight.intensity = 0; else this.muzzleLight.intensity *= 0.6; }
    sh.uMuzzle.value = this.muzzleT > 0 ? 1 : 0;
    this.alpha.update(dt, this); this.add.update(dt, this);
    this._updateShells(dt, this.brass, this.brassMesh, 'brass');
    this._updateShells(dt, this.hulls, this.hullMesh, 'hull');
    for (const m of this.mags) {
      if (m.rest) continue;
      m.age += dt;
      m.vel.y -= 9.8 * dt;
      m.obj.position.addScaledVector(m.vel, dt);
      m.obj.rotation.x += m.spin.x * dt; m.obj.rotation.y += m.spin.y * dt; m.obj.rotation.z += m.spin.z * dt;
      const gy = this.game.world.groundHeight(m.obj.position.x, m.obj.position.z, m.obj.position.y + 0.1) + 0.012;
      if (m.obj.position.y < gy) {
        m.obj.position.y = gy;
        if (Math.abs(m.vel.y) > 1) this.game.audio && this.game.audio.play('magDrop', { pos: m.obj.position, vol: 0.5 });
        m.vel.y *= -0.25; m.vel.x *= 0.5; m.vel.z *= 0.5; m.spin.multiplyScalar(0.4);
        if (m.vel.length() < 0.2) { m.rest = true; m.obj.rotation.set(Math.PI / 2 - 0.3, m.obj.rotation.y, 0); }
      }
    }
    // rain
    if (this.rain) {
      const u = this.rain.material.uniforms;
      u.uTime.value = t; u.uCam.value.copy(cam.position);
      this.rain.visible = this.rainOn;
      // splashes on the ground near the camera when outdoors
      if (outdoor && this.rainOn) {
        this.splashT += dt * 60 * this.game.settings.get('rain');
        while (this.splashT > 1) {
          this.splashT -= 1;
          const p = new THREE.Vector3(cam.position.x + (Math.random() - 0.5) * 12, 0.02, cam.position.z + (Math.random() - 0.5) * 12);
          if (p.x > -15 && p.x < 15 && p.z > -20 && p.z < 0) continue;
          this.alpha.spawn(P({ pos: p, life: 0.25, size0: 0.01, size1: 0.07, tile: TILE.SPLASH, alpha: 0.25, r: 0.8, g: 0.85, b: 0.9, rot: 0, fadeIn: 0 }));
        }
      }
    }
    this._updateLensDrops(dt, cam, outdoor);
    this._updateMotes(dt, cam, outdoor);
  }

  // Dust motes hanging in the air; the particle shader only lights them inside the flashlight cone.
  _updateMotes(dt, cam, outdoor) {
    if (outdoor) return;
    this.moteT = (this.moteT || 0) + dt * 70;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    while (this.moteT > 1) {
      this.moteT -= 1;
      const d = 0.6 + Math.random() * 4.5;
      const p = cam.position.clone().addScaledVector(fwd, d).add(new THREE.Vector3((Math.random() - 0.5) * d * 1.2, (Math.random() - 0.5) * d * 0.9, (Math.random() - 0.5) * d * 1.2));
      if (p.y < 0.1 || p.y > 2.9) continue;
      this.alpha.spawn(P({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.4) * 0.03, (Math.random() - 0.5) * 0.04), life: 4 + Math.random() * 4, size0: 0.004 + Math.random() * 0.006, size1: 0.004 + Math.random() * 0.006, tile: TILE.DROP, alpha: 0.5, r: 0.9, g: 0.9, b: 0.85, fadeIn: 0.25, fadeOut: 0.7, rotVel: 0 }));
    }
  }

  _updateShells(dt, list, mesh, kind) {
    const w = this.game.world;
    let i = 0;
    for (const s of list) {
      if (!s.rest) {
        s.age += dt;
        s.vel.y -= 9.8 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
        const gy = w.groundHeight(s.pos.x, s.pos.z, s.pos.y + 0.05) + 0.005;
        if (s.pos.y < gy) {
          s.pos.y = gy;
          if (Math.abs(s.vel.y) > 0.6 && s.bounces < 4) { s.bounces++; this.game.audio && this.game.audio.play(kind === 'brass' ? 'brass' : 'hull', { pos: s.pos, vol: Math.min(1, Math.abs(s.vel.y) / 3) }); }
          s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; s.spin.multiplyScalar(0.5);
          if (s.vel.lengthSq() < 0.04) { s.rest = true; s.rot.x = Math.PI / 2 * 0 + 0; s.rot.z = 0; }
        }
        // bounce off walls
        const p2 = s.pos.clone();
        if (w.collideCircle(p2, 0.01, s.pos.y - 0.01, s.pos.y + 0.01)) { s.vel.x *= -0.4; s.vel.z *= -0.4; s.pos.x = p2.x; s.pos.z = p2.z; }
      }
      this._q.setFromEuler(s.rot);
      this._m.compose(s.pos, this._q, this._s);
      mesh.setMatrixAt(i++, this._m);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }

  _updateLensDrops(dt, cam, outdoor) {
    const post = this.game.renderer.post;
    const lookUp = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).y;
    const rate = outdoor && this.rainOn ? (1.2 + Math.max(0, lookUp) * 8) * this.game.settings.get('rain') : 0;
    this.dropT += dt * rate;
    while (this.dropT > 1 && this.lensDrops.length < 40) {
      this.dropT -= 1;
      this.lensDrops.push({ x: Math.random(), y: Math.random(), r: 0.006 + Math.random() * 0.02, life: 2 + Math.random() * 5, age: 0, vy: 0 });
    }
    if (this.dropT > 1) this.dropT = 1;
    let any = false;
    for (const d of this.lensDrops) {
      d.age += dt * (outdoor ? 1 : 2.5);
      if (d.r > 0.018) d.vy += dt * 0.02; // big drops slide down
      d.y += d.vy * dt;
    }
    this.lensDrops = this.lensDrops.filter(d => d.age < d.life && d.y < 1.1);
    const W = this.dropsCanvas.width, H = this.dropsCanvas.height;
    const g = this.dropsCtx;
    this._dropFrame = (this._dropFrame || 0) + 1;
    if (this._dropFrame % 3 !== 0) return;
    g.fillStyle = 'rgb(128,128,0)'; g.fillRect(0, 0, W, H);
    for (const d of this.lensDrops) {
      any = true;
      const fade = Math.min(1, (d.life - d.age) / 1.2);
      const cx = d.x * W, cy = d.y * H, r = d.r * W;
      // normal-encoded dome: gradient from left/top to right/bottom
      const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(96,96,${255 * fade | 0},1)`);
      gr.addColorStop(0.7, `rgba(150,150,${230 * fade | 0},1)`);
      gr.addColorStop(1, 'rgba(128,128,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r, r * 1.1, 0, 0, 7); g.fill();
      if (d.vy > 0) { g.fillStyle = `rgba(128,128,${90 * fade | 0},0.6)`; g.fillRect(cx - r * 0.3, cy - r * 3, r * 0.6, r * 3); }
    }
    this.dropsTex.needsUpdate = true;
    post.dropsTex = any ? this.dropsTex : null;
    post.params.drops = 1;
  }

  clear() {
    this.alpha.clear(); this.add.clear(); this.decals.clear();
    for (const p of this.pools) p.parent && p.parent.remove(p);
    this.pools.length = 0;
    this.brass.length = 0; this.hulls.length = 0;
    for (const m of this.mags) this.scene.remove(m.obj);
    this.mags.length = 0;
  }
}
const UPV = new THREE.Vector3(0, 1, 0);
