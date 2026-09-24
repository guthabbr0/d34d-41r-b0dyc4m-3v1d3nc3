// Procedural police interceptor (exterior + drivable-looking interior for the intro).
// Local frame: +X forward, +Y up, +Z to the car's right. Origin at ground centre.
import * as THREE from 'three';
import { roundedBoxGeo } from './builder.js';

const L = 5.1, W = 1.94;

function sideProfile() {
  const s = new THREE.Shape();
  const arch = (cx) => {
    // wheel arch: semicircle above the sill line
    const r = 0.43, cy = 0.36, n = 10;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      s.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  s.moveTo(-2.55, 0.3);
  s.lineTo(-1.98, 0.3); arch(-1.55); s.lineTo(1.12, 0.3); arch(1.55); s.lineTo(2.5, 0.3);
  s.quadraticCurveTo(2.6, 0.32, 2.6, 0.45);
  s.lineTo(2.6, 0.64);
  s.quadraticCurveTo(2.58, 0.78, 2.4, 0.8);
  s.lineTo(1.05, 0.95);
  s.lineTo(-1.72, 0.98);
  s.lineTo(-2.45, 0.95);
  s.quadraticCurveTo(-2.58, 0.93, -2.6, 0.8);
  s.lineTo(-2.6, 0.45);
  s.quadraticCurveTo(-2.6, 0.31, -2.55, 0.3);
  return s;
}

function extrudeProfile(shape, width, bevel = 0.05, curve = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function doorTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e6ea'; g.fillRect(0, 0, 512, 256);
  // gold/black star seal (generic)
  g.save(); g.translate(92, 128);
  g.fillStyle = '#b89a4a';
  g.beginPath();
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = i % 2 ? 36 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b89a4a'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('14', 0, 1);
  g.restore();
  g.fillStyle = '#101216'; g.font = 'bold 74px Arial Black, Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('POLICE', 170, 110);
  g.font = 'bold 22px Arial'; g.fillText('KESTON CITY  ·  EAST DISTRICT', 172, 168);
  g.font = 'bold 26px Arial'; g.fillText('2A14', 410, 218);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Clip a shape's outline to xmin..xmax (Sutherland-Hodgman) and return a new Shape.
function clipShapeX(shape, xmin, xmax) {
  let poly = shape.getPoints(10);
  const clip = (pts, inside, inter) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(inter(a, b));
    }
    return out;
  };
  const at = (x) => (a, b) => { const t = (x - a.x) / (b.x - a.x); return new THREE.Vector2(x, a.y + (b.y - a.y) * t); };
  poly = clip(poly, p => p.x >= xmin, at(xmin));
  poly = clip(poly, p => p.x <= xmax, at(xmax));
  return new THREE.Shape(poly);
}

export function buildPoliceCar(M, { interior = false } = {}) {
  const car = new THREE.Group();
  car.name = 'policeCar';
  // hollow body shell: full-width nose and tail, thin door skins around the cabin
  const prof = sideProfile();
  const parts = [
    extrudeProfile(clipShapeX(prof, 1.0, 3), W, 0.05, 6),
    extrudeProfile(clipShapeX(prof, -3, -1.68), W, 0.05, 6),
  ];
  for (const side of [-1, 1]) {
    const g2 = extrudeProfile(clipShapeX(prof, -1.75, 1.05), 0.08, 0.02, 6);
    g2.translate(0, 0, side * (W / 2 - 0.05));
    parts.push(g2);
  }
  for (const geo of parts) {
    const body = new THREE.Mesh(geo, M.carPaintBlack);
    body.castShadow = true; body.receiveShadow = true;
    car.add(body);
  }
  // sill / rocker between the wheels (closes the bottom of the cabin)
  const sillFloor = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.06, W - 0.12), M.plasticBlack);
  sillFloor.position.set(-0.33, 0.31, 0); car.add(sillFloor);

  // white door panels with livery
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.3, metalness: 0.3, envMapIntensity: 1.2 });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 0.5), doorMat);
    m.position.set(-0.15, 0.68, side * (W / 2 + 0.004));
    m.rotation.y = side > 0 ? 0 : Math.PI;
    car.add(m);
  }
  const roofWhite = new THREE.Mesh(roundedBoxGeo(1.25, 0.05, 1.62, 0.02, 1), M.carPaintWhite);
  roofWhite.position.set(-0.4, 1.415, 0); car.add(roofWhite);

  // cabin glass (dark from outside) + pillars
  const cab = new THREE.Shape();
  cab.moveTo(1.05, 0.95); cab.lineTo(0.18, 1.39); cab.lineTo(-0.98, 1.39); cab.lineTo(-1.72, 0.98); cab.lineTo(1.05, 0.95);
  const glassMat = interior ? M.carGlassClear : M.glassDark;
  const cabGeo = extrudeProfile(cab, W - 0.2, 0.04, 4);
  const cabin = new THREE.Mesh(cabGeo, glassMat);
  cabin.castShadow = !interior;
  if (!interior) car.add(cabin);
  // pillars (A, B, C) as thin boxes on both sides
  const pillar = (x0, y0, x1, y1, t = 0.07) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const g = new THREE.BoxGeometry(len, t, W - 0.14);
    const m = new THREE.Mesh(g, M.carPaintBlack);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(dy, dx);
    return m;
  };
  if (!interior) {
    const pillars = new THREE.Group();
    // side window frame split: B pillar
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, W - 0.16), M.carPaintBlack);
    b.position.set(-0.3, 1.17, 0); pillars.add(b);
    car.add(pillars);
  }

  // light bar
  const bar = new THREE.Group();
  bar.position.set(-0.35, 1.44, 0);
  const base = new THREE.Mesh(roundedBoxGeo(0.28, 0.09, 1.3, 0.03, 1), M.plasticBlack);
  base.position.y = 0.045; bar.add(base);
  const red = new THREE.Mesh(roundedBoxGeo(0.24, 0.07, 0.58, 0.03, 1), M.lightRed);
  red.position.set(0, 0.1, -0.32); bar.add(red);
  const blue = new THREE.Mesh(roundedBoxGeo(0.24, 0.07, 0.58, 0.03, 1), M.lightBlue);
  blue.position.set(0, 0.1, 0.32); bar.add(blue);
  car.add(bar);
  car.userData.lightbar = { red, blue };
  red.userData.dynamic = true; blue.userData.dynamic = true;

  // wheels
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 24, 1);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.27, 16, 1);
  rimGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const x of [-1.55, 1.55]) for (const z of [-1, 1]) {
    const wgrp = new THREE.Group();
    wgrp.position.set(x, 0.37, z * (W / 2 - 0.16));
    const t = new THREE.Mesh(tireGeo, M.rubber); t.castShadow = true; wgrp.add(t);
    const r = new THREE.Mesh(rimGeo, M.metalDark); wgrp.add(r);
    car.add(wgrp); wheels.push(wgrp);
  }
  car.userData.wheels = wheels;
  for (const w of wheels) w.userData.dynamic = true;

  // lights, grille, push bar
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.42), M.headlight);
  for (const z of [-0.62, 0.62]) { const m = hl.clone(); m.position.set(2.59, 0.7, z); car.add(m); }
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.5), M.taillight);
  for (const z of [-0.6, 0.6]) { const m = tl.clone(); m.position.set(-2.6, 0.78, z); car.add(m); }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.7), M.plasticBlack);
  grille.position.set(2.6, 0.64, 0); car.add(grille);
  const push = new THREE.Group();
  for (const z of [-0.45, 0.45]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.07), M.plasticBlack);
    v.position.set(2.78, 0.62, z); push.add(v);
  }
  for (const y of [0.5, 0.82]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), M.plasticBlack);
    h.position.set(2.8, y, 0); push.add(h);
  }
  car.add(push);
  // mirrors + A-pillar spotlight
  for (const z of [-1, 1]) {
    const m = new THREE.Mesh(roundedBoxGeo(0.1, 0.12, 0.2, 0.02, 1), M.carPaintBlack);
    m.position.set(0.95, 1.02, z * 1.04); car.add(m);
  }
  const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12), M.chrome);
  spot.rotation.z = Math.PI / 2; spot.position.set(0.9, 1.1, -0.98); car.add(spot);

  if (interior) addInterior(car, M);

  car.traverse(o => { if (o.isMesh) { o.receiveShadow = true; if (o.castShadow === undefined) o.castShadow = true; } });
  return car;
}

// ----------------------------------------------------------------------------------------
// Interior for the driving sequence.
function mdtTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  const draw = (t) => {
    g.fillStyle = '#0a1a2a'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#1d3b5c'; g.fillRect(0, 0, 512, 28);
    g.fillStyle = '#cfe3ff'; g.font = 'bold 15px monospace'; g.fillText('K-CAD  MOBILE  ·  UNIT 2A14  ·  EAST DIST', 10, 19);
    g.fillStyle = '#ffd35a'; g.font = 'bold 20px monospace'; g.fillText('CALL 26-0924-0317   PRI 1', 12, 60);
    g.fillStyle = '#e8eef5'; g.font = '16px monospace';
    const lines = ['TYPE : 415 DISTURBANCE / 245 ADW', 'LOC  : 2250 WEXLEY AVE', '       HARLAN COURT APTS  #1C', 'RP   : NEIGHBOR (DISCONNECTED)', 'NOTES: SCREAMING, "HE BIT HER"', '       MULTIPLE CALLS SAME ADDR', '       NO WEAPONS SEEN'];
    lines.forEach((l, i) => g.fillText(l, 12, 92 + i * 22));
    g.fillStyle = (t % 1 < 0.5) ? '#ff4a3a' : '#5a1a14'; g.fillRect(12, 262, 150, 36);
    g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.fillText('EN ROUTE', 44, 286);
    g.fillStyle = '#2a4a6a'; g.fillRect(180, 262, 150, 36); g.fillStyle = '#cfe3ff'; g.fillText('ON SCENE', 214, 286);
    g.fillStyle = '#2a4a6a'; g.fillRect(348, 262, 150, 36); g.fillStyle = '#cfe3ff'; g.fillText('BACKUP', 392, 286);
  };
  draw(0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.draw = (time) => { draw(time); t.needsUpdate = true; };
  return t;
}

const WINDSHIELD_FRAG = /* glsl */`
uniform float uTime; uniform float uWiper; uniform float uRain; uniform vec3 uLightCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vUv * vec2(26.0, 12.0);
  float acc = 0.0; vec2 nrm = vec2(0.0);
  // wiper sweeps: angle in [-1,1] mapped across the screen; drops appear over time after the sweep
  for (int l = 0; l < 3; l++) {
    vec2 q = uv * (1.0 + float(l) * 0.7) + float(l) * 3.7;
    vec2 cell = floor(q), f = fract(q) - 0.5;
    float h = h21(cell + float(l) * 17.0);
    vec2 o = vec2(h21(cell + 5.1), h21(cell + 9.3)) - 0.5;
    float birth = h21(cell + 2.2) * 3.0;
    float age = uTime - birth;
    // time since the wiper passed this spot
    float wipeX = vUv.x;
    float since = mod(uTime - wipeX * 0.45, 2.2);
    float r = 0.18 * smoothstep(0.0, 1.5, since - h * 1.2) * step(0.35, h);
    vec2 d = f - o * 0.6;
    float m = smoothstep(r, r * 0.6, length(d)) * uRain;
    acc = max(acc, m);
    nrm += d * m * 3.0;
  }
  vec3 V = normalize(vV);
  float spec = pow(max(0.0, 1.0 - length(nrm - vec2(0.2, 0.3))), 6.0);
  vec3 col = uLightCol * (spec * 0.9 + 0.04) + vec3(0.01);
  float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
  gl_FragColor = vec4(col + fres * 0.02, acc * 0.55 + 0.06 + fres * 0.15);
}`;

function addInterior(car, M) {
  const g = new THREE.Group();
  g.name = 'interior';
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.75 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.8 });
  // dashboard: low, deep, sloping into the windshield base
  const dash = new THREE.Mesh(roundedBoxGeo(0.62, 0.22, W - 0.2, 0.07, 2), dashMat);
  dash.position.set(0.76, 0.86, 0); g.add(dash);
  const dashTop = new THREE.Mesh(roundedBoxGeo(0.5, 0.05, W - 0.22, 0.025, 1), dashMat);
  dashTop.position.set(0.8, 0.975, 0); dashTop.rotation.z = -0.1; g.add(dashTop);
  // defroster vent strip
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, W - 0.5), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
  vent.position.set(0.92, 0.99, 0); g.add(vent);
  // instrument cluster hood + gauges glow
  const cl = new THREE.Mesh(roundedBoxGeo(0.16, 0.08, 0.4, 0.03, 1), dashMat);
  cl.position.set(0.52, 0.99, -0.42); g.add(cl);
  const gaugeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6fb2ff, emissiveIntensity: 0.9 });
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), gaugeMat);
  for (const z of [-0.52, -0.33]) { const m = gauge.clone(); m.position.set(0.455, 0.94, z); m.rotation.y = -Math.PI / 2; m.rotation.x = 0; g.add(m); }
  // lower dash, footwell, floor pan, transmission tunnel, firewall
  const lower = new THREE.Mesh(roundedBoxGeo(0.3, 0.42, W - 0.24, 0.05, 1), dashMat);
  lower.position.set(0.72, 0.54, 0); g.add(lower);
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, W - 0.12), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1 }));
  floorPan.position.set(-0.1, 0.33, 0); g.add(floorPan);
  const tunnel = new THREE.Mesh(roundedBoxGeo(1.4, 0.22, 0.3, 0.06, 1), trimMat);
  tunnel.position.set(0.1, 0.44, 0); g.add(tunnel);
  const firewall = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, W - 0.12), dashMat);
  firewall.position.set(0.98, 0.62, 0); g.add(firewall);
  // interior glow from the laptop screen so the cabin reads in the dark
  const cabinLight = new THREE.PointLight(0x9cc4ff, 0.8, 2.0, 2);
  cabinLight.position.set(0.3, 1.15, 0.05); g.add(cabinLight);
  car.userData.cabinLight = cabinLight;
  // steering wheel
  const wheel = new THREE.Group();
  wheel.position.set(0.36, 0.95, -0.42);
  wheel.rotation.z = 0.45; // column tilt
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 10, 36), seatMat);
  rim.rotation.y = Math.PI / 2; wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 16), trimMat);
  hub.rotation.z = Math.PI / 2; wheel.add(hub);
  for (const a of [0, 2.2, -2.2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.025), trimMat);
    s.position.set(0, Math.cos(a) * 0.09, Math.sin(a) * 0.09); s.rotation.x = -a; wheel.add(s);
  }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.35, 10), trimMat);
  column.rotation.z = Math.PI / 2 - 0.45; column.position.set(0.52, 0.88, -0.42);
  g.add(column);
  g.add(wheel);
  car.userData.steering = wheel;
  wheel.userData.dynamic = true;
  // seats
  for (const z of [-0.42, 0.42]) {
    const cushion = new THREE.Mesh(roundedBoxGeo(0.55, 0.14, 0.52, 0.05, 2), seatMat);
    cushion.position.set(-0.35, 0.62, z); g.add(cushion);
    const back = new THREE.Mesh(roundedBoxGeo(0.14, 0.68, 0.5, 0.05, 2), seatMat);
    back.position.set(-0.68, 0.98, z); back.rotation.z = -0.22; g.add(back);
  }
  // centre console: radio + MDT laptop
  const cons = new THREE.Mesh(roundedBoxGeo(0.7, 0.28, 0.26, 0.03, 1), trimMat);
  cons.position.set(0.2, 0.62, 0); g.add(cons);
  const radio = new THREE.Mesh(roundedBoxGeo(0.2, 0.06, 0.2, 0.01, 1), M.plasticBlack);
  radio.position.set(0.45, 0.82, 0); radio.rotation.z = -0.35; g.add(radio);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5020, emissiveIntensity: 0.8 });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.02), ledMat);
  led.position.set(0.36, 0.855, 0); led.rotation.set(0, -Math.PI / 2, 0); led.rotateX(-0.35); g.add(led);
  const lapBase = new THREE.Mesh(roundedBoxGeo(0.26, 0.025, 0.34, 0.01, 1), M.plasticBlack);
  lapBase.position.set(0.28, 0.98, 0.05); lapBase.rotation.z = 0.1; g.add(lapBase);
  const mdt = mdtTexture();
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: mdt, emissiveIntensity: 1.6, roughness: 0.3 });
  const lid = new THREE.Group();
  lid.position.set(0.4, 0.99, 0.05);
  const lidBack = new THREE.Mesh(roundedBoxGeo(0.02, 0.22, 0.34, 0.008, 1), M.plasticBlack);
  lidBack.position.set(0.01, 0.11, 0); lid.add(lidBack);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), screenMat);
  scr.position.set(-0.002, 0.11, 0); scr.rotation.y = -Math.PI / 2; lid.add(scr);
  lid.rotation.z = 0.35;
  g.add(lid);
  car.userData.mdt = mdt;
  // shotgun rack between seats (vertical)
  const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 8), M.metalDark);
  rack.position.set(-0.05, 1.05, 0.0); rack.rotation.z = 0.25; g.add(rack);
  // door panels & roof liner
  for (const z of [-1, 1]) {
    const dp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.05), trimMat);
    dp.position.set(-0.1, 0.72, z * (W / 2 - 0.07)); g.add(dp);
  }
  const liner = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, W - 0.2), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 1 }));
  liner.position.set(-0.4, 1.37, 0); g.add(liner);
  // A-pillars & header
  const pil = (z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.07, 0.08), trimMat);
    m.position.set(0.62, 1.17, z); m.rotation.z = Math.atan2(1.39 - 0.95, 0.18 - 1.05); g.add(m);
  };
  pil(-0.86); pil(0.86);
  const header = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, W - 0.2), trimMat);
  header.position.set(0.16, 1.37, 0); g.add(header);
  const mirror = new THREE.Mesh(roundedBoxGeo(0.05, 0.07, 0.24, 0.015, 1), M.plasticBlack);
  mirror.position.set(0.2, 1.3, 0); g.add(mirror);
  // cage partition behind seats
  const cage = new THREE.Mesh(new THREE.PlaneGeometry(0.7, W - 0.2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.85 }));
  cage.rotation.y = Math.PI / 2; cage.rotation.x = Math.PI / 2; cage.position.set(-0.9, 1.08, 0);
  g.add(cage);

  // windshield frame: basis u = across (z), v = up the slope, n = inward normal
  const base = new THREE.Vector3(1.04, 0.955, 0), top = new THREE.Vector3(0.19, 1.385, 0);
  const vAxis = top.clone().sub(base); const slopeLen = vAxis.length(); vAxis.normalize();
  const uAxis = new THREE.Vector3(0, 0, 1);
  const nAxis = new THREE.Vector3().crossVectors(uAxis, vAxis).normalize();
  const frame = new THREE.Group();
  frame.position.copy(base);
  frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(uAxis, vAxis, nAxis));
  g.add(frame);
  const wsGeo = new THREE.PlaneGeometry(W - 0.24, slopeLen);
  wsGeo.translate(0, slopeLen / 2, 0);
  const wsMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWiper: { value: 0 }, uRain: { value: 1 }, uLightCol: { value: new THREE.Color(1.0, 0.7, 0.45) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: WINDSHIELD_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const windshield = new THREE.Mesh(wsGeo, wsMat);
  windshield.renderOrder = 5;
  frame.add(windshield);
  car.userData.windshield = wsMat;
  // wipers pivot at the base of the glass and sweep within its plane
  const wipers = [];
  for (const u of [-0.5, 0.2]) {
    const p = new THREE.Group();
    p.position.set(u, 0.02, -0.015);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.56, 0.012), M.plasticBlack);
    arm.position.y = 0.28; p.add(arm);
    p.rotation.z = -1.35;
    frame.add(p); wipers.push(p);
  }
  car.userData.wipers = wipers;
  for (const w of wipers) w.userData.dynamic = true;
  // side window glass (thin, faint)
  for (const z of [-1, 1]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), M.glass);
    sg.position.set(-0.3, 1.17, z * (W / 2 - 0.1));
    g.add(sg);
  }
  car.add(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
}
