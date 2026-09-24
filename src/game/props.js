// Procedural props: doors, street furniture, appliances, fences, vehicles, facades.
import * as THREE from 'three';
import { roundedBoxGeo, mergeStatic } from './builder.js';
import { mulberry } from '../engine/post.js';

const _mc = new Map();
// cached standard material so repeated props share materials (and can be merged)
export function sm(params) {
  const key = JSON.stringify(params);
  let m = _mc.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial(params); _mc.set(key, m); }
  return m;
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r, 1), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, mat, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; m.receiveShadow = true; return m; };

export function textTexture(lines, { w = 256, h = 128, bg = '#d8d2c0', fg = '#1a1a1a', font = 'bold 64px Arial', align = 'center' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => g.fillText(l, align === 'center' ? w / 2 : 12, h * (i + 0.5) / arr.length));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- doors
// Door leaf hinged at local origin, closed leaf extends along +X. Returns {group, leaf, pivot}.
export function buildDoor(M, { width = 0.9, height = 2.05, kind = 'apartment', label = null, thick = 0.045 } = {}) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  let mat = M.doorWood;
  if (kind === 'metal') mat = M.metalPainted;
  const leaf = new THREE.Group();
  pivot.add(leaf);
  if (kind === 'glass') {
    const fr = M.metalBrushed;
    leaf.add(box(0.06, height, thick, fr, 0.03, height / 2, 0));
    leaf.add(box(0.06, height, thick, fr, width - 0.03, height / 2, 0));
    leaf.add(box(width, 0.12, thick, fr, width / 2, 0.06, 0));
    leaf.add(box(width, 0.08, thick, fr, width / 2, height - 0.04, 0));
    leaf.add(box(width, 0.05, thick, fr, width / 2, 1.0, 0));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, height - 0.2), M.glass);
    gl.position.set(width / 2, height / 2, 0); leaf.add(gl);
    const bar = cyl(0.015, 0.015, 0.6, M.metalBrushed); bar.position.set(width - 0.12, 1.05, 0.06); leaf.add(bar);
  } else {
    const panel = new THREE.Mesh(roundedBoxGeo(width, height, thick, 0.006, 1), mat);
    panel.position.set(width / 2, height / 2, 0); panel.castShadow = true; panel.receiveShadow = true;
    leaf.add(panel);
    if (kind === 'apartment') {
      // raised panels
      for (const [py, ph] of [[0.55, 0.7], [1.45, 0.8]]) for (const s of [-1, 1]) {
        const rp = new THREE.Mesh(roundedBoxGeo(width * 0.36, ph, 0.012, 0.004, 1), mat);
        rp.position.set(width / 2 + s * width * 0.21, py, s === 0 ? 0 : thick / 2 + 0.004);
        leaf.add(rp);
        const rp2 = rp.clone(); rp2.position.z = -thick / 2 - 0.004; leaf.add(rp2);
      }
      const peep = cyl(0.01, 0.01, thick + 0.02, M.chrome, 8); peep.rotation.x = Math.PI / 2; peep.position.set(width / 2, 1.55, 0); leaf.add(peep);
    }
    if (kind === 'metal') {
      const push = box(width * 0.7, 0.05, 0.06, M.metalBrushed, width / 2, 1.0, -thick / 2 - 0.04); leaf.add(push);
      const kick = box(width - 0.04, 0.25, 0.004, M.metalBrushed, width / 2, 0.14, thick / 2 + 0.003); leaf.add(kick);
    }
    // knob + plate
    for (const s of [-1, 1]) {
      const plate = box(0.05, 0.16, 0.01, M.chrome, width - 0.08, 1.0, s * (thick / 2 + 0.005)); leaf.add(plate);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.chrome);
      knob.position.set(width - 0.08, 0.98, s * (thick / 2 + 0.04)); knob.castShadow = true; leaf.add(knob);
    }
    if (label) {
      const t = textTexture(label, { w: 128, h: 64, bg: '#b8a060', fg: '#20180a', font: 'bold 44px Georgia' });
      const lm = new THREE.MeshStandardMaterial({ map: t, metalness: 0.7, roughness: 0.35 });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), lm);
      pl.position.set(width / 2, 1.72, thick / 2 + 0.002); leaf.add(pl);
    }
  }
  // frame (static, returned separately so it can be merged with the level)
  const frame = new THREE.Group();
  const fm = kind === 'glass' ? M.metalBrushed : M.doorFrame;
  frame.add(box(0.06, height + 0.05, 0.16, fm, -0.03, (height + 0.05) / 2, 0));
  frame.add(box(0.06, height + 0.05, 0.16, fm, width + 0.03, (height + 0.05) / 2, 0));
  frame.add(box(width + 0.12, 0.06, 0.16, fm, width / 2, height + 0.03, 0));
  mergeStatic(leaf, () => '');
  return { group, pivot, leaf, frame };
}

// ---------------------------------------------------------------- street furniture
export function buildStreetLight(M, { height = 7.5, arm = 2.2 } = {}) {
  const g = new THREE.Group();
  const pole = cyl(0.07, 0.11, height, M.metalPainted, 12); pole.position.y = height / 2; g.add(pole);
  const armM = cyl(0.045, 0.045, arm, M.metalPainted, 8); armM.rotation.z = Math.PI / 2; armM.position.set(arm / 2, height - 0.1, 0); g.add(armM);
  const head = rbox(0.75, 0.16, 0.34, 0.06, M.metalPainted, arm + 0.2, height - 0.12, 0); g.add(head);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.24), M.sodium);
  lens.rotation.x = Math.PI / 2; lens.position.set(arm + 0.2, height - 0.205, 0); g.add(lens);
  const base = cyl(0.2, 0.24, 0.4, M.concreteWall || M.metalPainted, 10); base.position.y = 0.2; g.add(base);
  g.userData.lightPos = new THREE.Vector3(arm + 0.2, height - 0.35, 0);
  return g;
}

export function buildUtilityPole(M, { height = 9 } = {}) {
  const g = new THREE.Group();
  const wood = sm({ color: 0x3a2e24, roughness: 0.95 });
  const pole = cyl(0.12, 0.16, height, wood, 10); pole.position.y = height / 2; g.add(pole);
  const cross = box(2.0, 0.1, 0.1, wood, 0, height - 0.6, 0); g.add(cross);
  const tr = cyl(0.25, 0.25, 0.7, M.metalPainted, 10); tr.position.set(0.3, height - 1.5, 0.2); g.add(tr);
  return g;
}

export function buildDumpster(M, { lidOpen = 0.0 } = {}) {
  const g = new THREE.Group();
  const green = sm({ color: 0x1f3a2a, roughness: 0.6, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.1), [M.rust, M.rust, green, green, green, green]);
  body.position.y = 0.72; body.castShadow = body.receiveShadow = true; g.add(body);
  // flared top rim
  g.add(box(1.98, 0.08, 1.18, green, 0, 1.3, 0));
  // lids
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.47, 1.34, -0.58);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.04, 1.16), sm({ color: 0x151515, roughness: 0.8 }));
    lid.position.z = 0.58; lid.castShadow = true;
    pivot.add(lid);
    pivot.rotation.x = s > 0 ? -lidOpen : 0;
    g.add(pivot);
  }
  for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) {
    const w = cyl(0.07, 0.07, 0.05, M.rubber, 10); w.rotation.x = Math.PI / 2; w.position.set(x, 0.08, z); g.add(w);
  }
  return g;
}

export function buildMailboxes(M) {
  const g = new THREE.Group();
  const bodyM = M.metalBrushed;
  g.add(box(1.6, 1.1, 0.25, M.metalPainted, 0, 1.35, 0));
  const t = document.createElement('canvas');
  t.width = 512; t.height = 352;
  const c = t.getContext('2d');
  c.fillStyle = '#8c8f93'; c.fillRect(0, 0, 512, 352);
  let n = 0;
  for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) {
    const x = 8 + k * 63, y = 8 + r * 68;
    c.fillStyle = '#a4a8ad'; c.fillRect(x, y, 58, 62);
    c.strokeStyle = '#55595e'; c.lineWidth = 2; c.strokeRect(x, y, 58, 62);
    c.fillStyle = '#2a2d31'; c.fillRect(x + 22, y + 34, 14, 5);
    c.fillStyle = '#222'; c.font = 'bold 12px Arial'; c.fillText(`${1 + r}${String.fromCharCode(65 + k)}`, x + 6, y + 16);
    n++;
  }
  const tex = new THREE.CanvasTexture(t); tex.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 1.06), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.8 }));
  front.position.set(0, 1.35, 0.126); g.add(front);
  // one hanging open door
  const d = box(0.18, 0.2, 0.01, bodyM, 0.25, 0.92, 0.2); d.rotation.y = -1.2; g.add(d);
  return g;
}

export function buildElevator(M) {
  const g = new THREE.Group();
  g.add(box(1.7, 2.4, 0.08, M.metalBrushed, 0, 1.2, 0));        // surround
  const doorM = sm({ color: 0x8a8e93, roughness: 0.32, metalness: 1, envMapIntensity: 1 });
  g.add(box(0.64, 2.15, 0.05, doorM, -0.33, 1.08, 0.06));
  g.add(box(0.64, 2.15, 0.05, doorM, 0.33, 1.08, 0.06));
  const panel = box(0.12, 0.3, 0.03, M.metalBrushed, 1.05, 1.2, 0.02); g.add(panel);
  const btnM = sm({ color: 0x000000, emissive: 0xffaa33, emissiveIntensity: 3 });
  const b = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), btnM); b.position.set(1.05, 1.25, 0.037); g.add(b);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), new THREE.MeshStandardMaterial({ map: textTexture(['OUT OF', 'ORDER'], { w: 256, h: 128, bg: '#f2f0e8', fg: '#b01010', font: 'bold 44px Arial' }), roughness: 0.9 }));
  sign.position.set(0.05, 1.45, 0.09); sign.rotation.z = 0.06; g.add(sign);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3010, emissiveMap: textTexture('-- E --', { w: 128, h: 48, bg: '#000', fg: '#fff', font: 'bold 30px monospace' }), emissiveIntensity: 2.5 }));
  disp.position.set(0, 2.3, 0.045); g.add(disp);
  return g;
}

export function buildExitSign(M) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.18, 0.06, M.plasticWhite, 0, 0, 0));
  const t = textTexture('EXIT', { w: 128, h: 64, bg: '#000', fg: '#ffffff', font: 'bold 44px Arial' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2010, emissiveMap: t, emissiveIntensity: 14 }));
  m.position.z = 0.031; g.add(m);
  return g;
}

export function buildStrobe(M) {
  const g = new THREE.Group();
  g.add(box(0.12, 0.16, 0.05, sm({ color: 0x9a1010, roughness: 0.5 }), 0, 0, 0));
  const lensM = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffffff, emissiveIntensity: 0, transparent: false });
  const lens = box(0.08, 0.05, 0.03, lensM, 0, -0.03, 0.03); g.add(lens);
  g.userData.lens = lensM;
  return g;
}

// Kitchen run along local +X, counter depth along +Z (back at z=0).
export function buildKitchen(M, len = 3.2) {
  const g = new THREE.Group();
  const top = sm({ color: 0x6a6258, roughness: 0.35, envMapIntensity: 0.6 });
  g.add(box(len, 0.86, 0.6, M.kitchenWood, len / 2, 0.43, 0.3));
  g.add(box(len + 0.02, 0.04, 0.63, top, len / 2, 0.88, 0.31));
  // upper cabinets
  g.add(box(len - 0.8, 0.7, 0.34, M.kitchenWood, (len - 0.8) / 2, 1.85, 0.17));
  // door seams
  for (let x = 0.5; x < len; x += 0.5) g.add(box(0.008, 0.78, 0.005, M.plasticBlack, x, 0.43, 0.603));
  // sink
  g.add(box(0.5, 0.02, 0.38, M.metalBrushed, 1.0, 0.905, 0.3));
  const tap = cyl(0.012, 0.012, 0.25, M.chrome, 8); tap.position.set(1.0, 1.02, 0.08); g.add(tap);
  // stove
  g.add(box(0.76, 0.9, 0.62, M.plasticWhite, len - 0.4, 0.45, 0.31));
  for (const x of [-0.18, 0.18]) for (const z of [0.18, 0.45]) { const b = cyl(0.08, 0.08, 0.01, M.plasticBlack, 16); b.position.set(len - 0.4 + x, 0.905, z); g.add(b); }
  // fridge
  const fr = rbox(0.75, 1.8, 0.7, 0.03, M.plasticWhite, len + 0.4, 0.9, 0.35); g.add(fr);
  g.add(box(0.02, 0.35, 0.03, M.metalBrushed, len + 0.72, 1.2, 0.71));
  // backsplash
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.8, 0.6), M.whiteTiles);
  bs.position.set((len - 0.8) / 2, 1.2, 0.005); bs.receiveShadow = true; g.add(bs);
  return g;
}

export function buildWasher(M, { dryer = false } = {}) {
  const g = new THREE.Group();
  const white = sm({ color: dryer ? 0xc8c6be : 0xd0cec8, roughness: 0.4, envMapIntensity: 0.6 });
  g.add(rbox(0.68, 0.9, 0.68, 0.02, white, 0, 0.45, 0));
  g.add(box(0.68, 0.14, 0.12, white, 0, 0.97, -0.28));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), M.metalBrushed); ring.position.set(0, 0.48, 0.345); g.add(ring);
  const glassD = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), M.glassDark); glassD.position.set(0, 0.48, 0.342); g.add(glassD);
  const coin = box(0.12, 0.06, 0.02, M.metalBrushed, 0.18, 0.97, -0.21); g.add(coin);
  return g;
}

export function buildBoiler(M) {
  const g = new THREE.Group();
  const tankM = sm({ color: 0x5f6a64, roughness: 0.5, metalness: 0.6 });
  const t = cyl(0.42, 0.42, 1.7, tankM, 20); t.position.y = 0.95; g.add(t);
  const capT = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankM); capT.position.y = 1.8; g.add(capT);
  g.add(box(0.9, 0.12, 0.9, M.concreteFloor, 0, 0.06, 0));
  const pipe = cyl(0.05, 0.05, 1.0, M.rust, 8); pipe.position.set(0, 2.5, 0); g.add(pipe);
  const pipe2 = cyl(0.04, 0.04, 2.2, M.rust, 8); pipe2.rotation.z = Math.PI / 2; pipe2.position.set(-1.1, 2.9, 0); g.add(pipe2);
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), M.plasticWhite); gauge.position.set(0, 1.3, 0.425); g.add(gauge);
  const pilotM = sm({ color: 0, emissive: 0x3070ff, emissiveIntensity: 5 });
  const pilot = box(0.06, 0.03, 0.01, pilotM, 0.15, 0.35, 0.42); g.add(pilot);
  return g;
}

export function buildWorkbench(M) {
  const g = new THREE.Group();
  const wood = M.kitchenWood;
  g.add(box(2.0, 0.06, 0.75, wood, 0, 0.9, 0));
  for (const x of [-0.95, 0.95]) for (const z of [-0.33, 0.33]) g.add(box(0.06, 0.9, 0.06, M.metalDark, x, 0.45, z));
  g.add(box(2.0, 0.03, 0.7, wood, 0, 0.25, 0));
  g.add(box(2.0, 0.9, 0.03, sm({ color: 0x6b5a44, roughness: 0.9 }), 0, 1.4, -0.38)); // pegboard
  return g;
}

export function buildShelf(M, { w = 1.2, h = 1.9, d = 0.45 } = {}) {
  const g = new THREE.Group();
  const mm = M.metalPainted;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) g.add(box(0.035, h, 0.035, mm, x, h / 2, z));
  for (let y = 0.15; y < h; y += 0.45) g.add(box(w, 0.025, d, mm, 0, y, 0));
  return g;
}

// ---------------------------------------------------------------- fences
let fenceTex = null;
function chainTexture() {
  if (fenceTex) return fenceTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(210,212,215,1)'; g.lineWidth = 5;
  for (let i = -128; i < 256; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  fenceTex = new THREE.CanvasTexture(c);
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  fenceTex.colorSpace = THREE.SRGBColorSpace;
  fenceTex.anisotropy = 4;
  return fenceTex;
}

// Fence along local +X from 0..len
export function buildChainFence(M, len, { height = 2.2, gaps = [] } = {}) {
  const g = new THREE.Group();
  const tex = chainTexture().clone();
  tex.needsUpdate = true;
  const meshM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const segs = [];
  let cur = 0;
  for (const gp of [...gaps].sort((a, b) => a[0] - b[0])) { if (gp[0] > cur) segs.push([cur, gp[0]]); cur = gp[1]; }
  if (cur < len) segs.push([cur, len]);
  for (const [a, b] of segs) {
    const w = b - a;
    const geo = new THREE.PlaneGeometry(w, height - 0.05);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 5, uv.getY(i) * height * 5);
    const m = new THREE.Mesh(geo, meshM);
    m.position.set(a + w / 2, (height - 0.05) / 2 + 0.03, 0);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    const rail = cyl(0.025, 0.025, w, M.metalBrushed, 8); rail.rotation.z = Math.PI / 2; rail.position.set(a + w / 2, height, 0); g.add(rail);
  }
  for (let x = 0; x <= len + 0.01; x += 2.5) {
    const p = cyl(0.035, 0.035, height + 0.05, M.metalBrushed, 8); p.position.set(Math.min(x, len), (height + 0.05) / 2, 0); g.add(p);
  }
  return g;
}

// ---------------------------------------------------------------- windows & facades
export function buildWindow(M, w, h, { lit = false, cool = false, curtain = true, broken = false, rnd = Math.random } = {}) {
  const g = new THREE.Group();
  const fm = M.paintWhite;
  g.add(box(w + 0.12, 0.06, 0.12, M.concreteWall || fm, 0, -h / 2 - 0.05, 0.05)); // sill
  g.add(box(w, 0.05, 0.05, fm, 0, h / 2, 0.01));
  g.add(box(w, 0.05, 0.05, fm, 0, -h / 2, 0.01));
  g.add(box(0.05, h, 0.05, fm, -w / 2, 0, 0.01));
  g.add(box(0.05, h, 0.05, fm, w / 2, 0, 0.01));
  g.add(box(w, 0.04, 0.04, fm, 0, 0.05, 0.01));
  const glassMat = lit ? (cool ? M.windowLitCool : M.windowLit) : M.glassDark;
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), glassMat);
  gl.position.z = -0.01;
  g.add(gl);
  if (curtain && lit) {
    const cm = sm({ color: 0x000000, emissive: cool ? 0x31404e : 0x4a2f1a, emissiveIntensity: 1.2 });
    const cw = w * (0.25 + rnd() * 0.2);
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(cw, h - 0.06), cm); c1.position.set(-w / 2 + cw / 2 + 0.02, 0, -0.005); g.add(c1);
    const c2 = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.8, h - 0.06), cm); c2.position.set(w / 2 - cw * 0.4 - 0.02, 0, -0.005); g.add(c2);
  }
  return g;
}

// Distant building block with procedural lit windows (for the street / skyline).
let facadeTex = null;
function facadeTexture() {
  if (facadeTex) return facadeTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const rnd = mulberry(99);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    const r = rnd();
    if (r < 0.22) {
      const warm = rnd() < 0.75;
      const b = 0.4 + rnd() * 0.6;
      g.fillStyle = warm ? `rgba(255,${170 + rnd() * 50 | 0},${90 + rnd() * 60 | 0},${b})` : `rgba(150,${180 + rnd() * 40 | 0},255,${b * 0.8})`;
      g.fillRect(x * 32 + 6, y * 32 + 6, 20, 22);
    } else if (r < 0.3) {
      g.fillStyle = 'rgba(40,60,90,0.35)'; g.fillRect(x * 32 + 6, y * 32 + 6, 20, 22);
    }
  }
  facadeTex = new THREE.CanvasTexture(c);
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
  return facadeTex;
}

export function buildBackdropBlock(M, w, h, d, { brick = true, seed = 1 } = {}) {
  const g = new THREE.Group();
  const tex = facadeTexture().clone(); tex.needsUpdate = true;
  tex.repeat.set(w / 8, h / 16);
  tex.offset.set((seed * 0.37) % 1, (seed * 0.61) % 1);
  const baseM = brick ? M.brickDry : M.concreteWall;
  const face = new THREE.MeshStandardMaterial({ map: baseM.map, normalMap: baseM.normalMap, color: brick ? 0x5a4a44 : 0x55524e, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 3 });
  face.map = baseM.map;
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), face);
  // metric uvs for the base map would need per-face repeat; use emissive tiling only.
  b.position.y = h / 2;
  b.receiveShadow = true;
  g.add(b);
  g.add(box(w + 0.3, 0.4, d + 0.3, sm({ color: 0x2a2a2a, roughness: 0.9 }), 0, h + 0.2, 0));
  return g;
}

// ---------------------------------------------------------------- vehicles (SWAT van for the ending)
export function buildVan(M) {
  const g = new THREE.Group();
  const paint = sm({ color: 0x14181e, roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 });
  g.add(rbox(5.6, 2.1, 2.3, 0.12, paint, 0, 1.45, 0));
  g.add(rbox(1.3, 1.2, 2.2, 0.15, paint, 3.1, 1.0, 0));
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), M.glassDark); ws.rotation.y = Math.PI / 2; ws.position.set(2.81, 2.05, 0); g.add(ws);
  const t = textTexture('SWAT', { w: 256, h: 96, bg: '#14181e', fg: '#e8e8e0', font: 'bold 72px Arial' });
  const lm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.66), lm); p.position.set(-0.5, 1.7, s * 1.151); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
  const tireGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 20); tireGeo.rotateX(Math.PI / 2);
  for (const x of [-1.8, 2.3]) for (const z of [-1, 1]) { const w = new THREE.Mesh(tireGeo, M.rubber); w.position.set(x, 0.45, z * 1.05); g.add(w); }
  const hl = box(0.05, 0.15, 0.35, M.headlight, 3.76, 0.95, -0.7); g.add(hl); const hl2 = hl.clone(); hl2.position.z = 0.7; g.add(hl2);
  const red = rbox(0.25, 0.1, 0.5, 0.03, M.lightRed, 2.2, 2.55, -0.6); const blue = rbox(0.25, 0.1, 0.5, 0.03, M.lightBlue, 2.2, 2.55, 0.6);
  g.add(red, blue);
  g.userData.lightbar = { red, blue };
  return g;
}

// ---------------------------------------------------------------- furniture
export function buildBed(M) {
  const g = new THREE.Group();
  const frameM = sm({ color: 0x2c231c, roughness: 0.7 });
  g.add(box(1.45, 0.3, 2.0, frameM, 0, 0.15, 0));
  const mattress = rbox(1.4, 0.22, 1.95, 0.06, sm({ color: 0xb8b0a0, roughness: 0.95 }), 0, 0.41, 0); g.add(mattress);
  const blanket = rbox(1.46, 0.08, 1.2, 0.04, sm({ color: 0x3a4a5a, roughness: 1 }), 0.05, 0.54, 0.35); blanket.rotation.y = 0.08; g.add(blanket);
  const pillow = rbox(0.55, 0.12, 0.35, 0.06, sm({ color: 0xd8d0c0, roughness: 1 }), -0.3, 0.57, -0.75); g.add(pillow);
  g.add(box(1.5, 0.9, 0.06, frameM, 0, 0.45, -1.0));
  return g;
}

export function buildTable(M, w = 1.2, d = 0.8, h = 0.76) {
  const g = new THREE.Group();
  const wood = M.kitchenWood;
  g.add(box(w, 0.04, d, wood, 0, h, 0));
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) g.add(box(0.05, h, 0.05, wood, x, h / 2, z));
  return g;
}

export function buildFloorLamp(M) {
  const g = new THREE.Group();
  const pole = cyl(0.012, 0.012, 1.5, M.metalBrushed, 8); pole.position.y = 0.75; g.add(pole);
  const base = cyl(0.14, 0.15, 0.03, M.metalDark, 16); base.position.y = 0.015; g.add(base);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9, emissive: 0xffb060, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.25, 20, 1, true), shadeM); shade.position.y = 1.55; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), sm({ color: 0, emissive: 0xffd8a0, emissiveIntensity: 20 }));
  bulb.position.y = 1.5; g.add(bulb);
  g.userData.lightPos = new THREE.Vector3(0, 1.5, 0);
  return g;
}

export function buildPlanks(M, w, h) {
  const g = new THREE.Group();
  const wood = sm({ color: 0x6a5238, roughness: 0.9 });
  const r = mulberry(7);
  for (let i = 0; i < 5; i++) {
    const p = box(w + 0.3, 0.14, 0.03, wood, 0, 0.3 + i * h / 5, 0.04 + i * 0.005);
    p.rotation.z = (r() - 0.5) * 0.35; g.add(p);
  }
  return g;
}

export function buildPicnicTable(M) {
  const g = new THREE.Group();
  const wood = sm({ color: 0x5d4a38, roughness: 0.85 });
  g.add(box(1.8, 0.05, 0.75, wood, 0, 0.75, 0));
  for (const z of [-0.65, 0.65]) g.add(box(1.8, 0.04, 0.28, wood, 0, 0.45, z));
  for (const x of [-0.7, 0.7]) for (const s of [-1, 1]) { const l = box(0.06, 0.95, 0.06, wood, x, 0.42, s * 0.35); l.rotation.x = s * 0.55; g.add(l); }
  return g;
}

export function buildCanopy(M) {
  const g = new THREE.Group();
  const cm = sm({ color: 0x1c1f22, roughness: 0.7, metalness: 0.3 });
  g.add(box(4.6, 0.18, 1.8, cm, 0, 0, 0.9));
  g.add(box(4.6, 0.3, 0.05, cm, 0, -0.06, 1.8));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), sm({ color: 0, emissive: 0xdde8ff, emissiveIntensity: 16 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.095, 0.9); g.add(lens);
  g.userData.lens = lens.material;
  return g;
}

export function buildClothesline(M, len) {
  const g = new THREE.Group();
  for (const x of [0, len]) { const p = cyl(0.04, 0.04, 2.3, M.metalDark, 8); p.position.set(x, 1.15, 0); g.add(p); }
  const lineM = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3(t * len, 2.2 - Math.sin(t * Math.PI) * 0.18, 0)); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineM));
  const cols = [0x6a2020, 0x2a3a5a, 0xc8c0b0, 0x303030];
  const r = mulberry(5);
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.17;
    const cm = new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 1, side: THREE.DoubleSide });
    const cw = 0.4 + r() * 0.3, ch = 0.5 + r() * 0.4;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch, 3, 3), cm);
    c.position.set(t * len, 2.2 - Math.sin(t * Math.PI) * 0.18 - ch / 2, 0);
    c.castShadow = true;
    c.userData.sway = r() * 6;
    g.add(c);
  }
  return g;
}

// Road markings & curb strips as flat painted quads (added by level)
export function paintQuad(mat, x0, z0, x1, z1, y = 0.004) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

// Traffic signal on a mast arm; the head faces local +X.
export function buildTrafficSignal(M, arm = 5.5) {
  const g = new THREE.Group();
  const pole = cyl(0.09, 0.12, 5.2, M.metalPainted, 10); pole.position.y = 2.6; g.add(pole);
  const a = cyl(0.06, 0.06, arm, M.metalPainted, 8); a.rotation.x = Math.PI / 2; a.position.set(0, 5.05, arm / 2); g.add(a);
  const housing = sm({ color: 0x1a1c1a, roughness: 0.6, metalness: 0.3 });
  const head = new THREE.Group(); head.position.set(0.05, 4.5, arm - 0.4);
  head.add(box(0.28, 0.95, 0.34, housing, 0, 0, 0));
  const mk = (col) => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: col, emissiveIntensity: 0 });
  const red = mk(0xff2010), amber = mk(0xffa010), green = mk(0x20ff70);
  [[red, 0.3], [amber, 0], [green, -0.3]].forEach(([m, y]) => {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), m); l.position.set(0.141, y, 0); l.rotation.y = Math.PI / 2; head.add(l);
    const visor = box(0.12, 0.02, 0.24, housing, 0.2, y + 0.12, 0); head.add(visor);
  });
  g.add(head);
  red.emissiveIntensity = 14;
  g.userData = { red, amber, green, lampPos: new THREE.Vector3(0.4, 4.5, arm - 0.4) };
  head.userData.dynamic = true;
  return g;
}
