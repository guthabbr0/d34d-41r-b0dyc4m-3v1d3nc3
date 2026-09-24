// Procedural weapon models and gloved viewmodel arms (SDF-sculpted, skinned, IK-driven).
// Weapon local frame: -Z forward (muzzle), +Y up, origin at the web of the firing hand on the grip.
import * as THREE from 'three';
import { roundedBoxGeo, mergeStatic } from './builder.js';
import { buildMesh } from '../engine/sdf.js';

function mats() {
  const polymer = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.6 });
  const slide = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 });
  const tritium = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, emissive: 0x4dff6a, emissiveIntensity: 2.2 });
  const lensOff = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, roughness: 0.05, metalness: 0.2, emissive: 0xfff6e8, emissiveIntensity: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb58a3a, roughness: 0.25, metalness: 1.0, envMapIntensity: 1.2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.55, metalness: 0.0 });
  const shellRed = new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.45 });
  return { polymer, slide, steel, dark, tritium, lensOff, brass, wood, shellRed };
}
let M = null;
export function weaponMaterials() { if (!M) M = mats(); return M; }

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

export function buildPistol() {
  const m = weaponMaterials();
  const g = new THREE.Group(); g.name = 'pistol';
  // slide (moves on recoil)
  const slide = new THREE.Group(); slide.name = 'slide';
  slide.add(mesh(roundedBoxGeo(0.0255, 0.03, 0.188, 0.004, 2), m.slide, 0, 0.034, -0.062));
  // rear serrations
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) slide.add(mesh(new THREE.BoxGeometry(0.002, 0.024, 0.0018), m.dark, s * 0.0128, 0.034, 0.012 + i * 0.0035 - 0.012));
  // ejection port (right side, top)
  slide.add(mesh(new THREE.BoxGeometry(0.004, 0.009, 0.03), m.steel, -0.011, 0.047, -0.03));
  // muzzle bore
  const bore = mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.004, 12), m.dark, 0, 0.034, -0.1565); bore.rotation.x = Math.PI / 2; slide.add(bore);
  const barrelEnd = mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.003, 14), m.steel, 0, 0.034, -0.1555); barrelEnd.rotation.x = Math.PI / 2; slide.add(barrelEnd);
  // sights with tritium dots
  slide.add(mesh(new THREE.BoxGeometry(0.018, 0.007, 0.006), m.dark, 0, 0.0525, 0.024));
  slide.add(mesh(new THREE.BoxGeometry(0.004, 0.0075, 0.006), m.dark, 0, 0.0527, -0.146));
  for (const x of [-0.006, 0.006]) slide.add(mesh(new THREE.CircleGeometry(0.0013, 8), m.tritium, x, 0.0535, 0.0272));
  slide.add(mesh(new THREE.CircleGeometry(0.0014, 8), m.tritium, 0, 0.0545, -0.1428));
  g.add(slide);
  // frame + dust cover rail
  g.add(mesh(roundedBoxGeo(0.023, 0.018, 0.17, 0.004, 2), m.polymer, 0, 0.012, -0.058));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.003, 0.005), m.polymer, 0, 0.002, -0.085 - i * 0.01));
  // grip (angled)
  const grip = mesh(roundedBoxGeo(0.029, 0.112, 0.048, 0.008, 2), m.polymer, 0, -0.048, 0.012);
  grip.rotation.x = -0.32; g.add(grip);
  // grip texture band
  const gt = mesh(roundedBoxGeo(0.0295, 0.06, 0.0485, 0.008, 1), new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.95 }), 0, -0.05, 0.013); gt.rotation.x = -0.32; g.add(gt);
  // beavertail
  g.add(mesh(roundedBoxGeo(0.02, 0.012, 0.022, 0.005, 1), m.polymer, 0, 0.004, 0.035));
  // trigger guard
  g.add(mesh(new THREE.BoxGeometry(0.018, 0.004, 0.05), m.polymer, 0, -0.024, -0.036));
  const tgf = mesh(new THREE.BoxGeometry(0.018, 0.026, 0.005), m.polymer, 0, -0.012, -0.061); tgf.rotation.x = -0.25; g.add(tgf);
  const trig = mesh(new THREE.BoxGeometry(0.006, 0.02, 0.004), m.steel, 0, -0.008, -0.03); trig.rotation.x = 0.25; g.add(trig);
  // magazine (separate for reloads)
  const mag = new THREE.Group(); mag.name = 'mag';
  const magBody = mesh(roundedBoxGeo(0.022, 0.12, 0.034, 0.004, 1), m.steel, 0, -0.058, 0.013); magBody.rotation.x = -0.32; mag.add(magBody);
  const plate = mesh(roundedBoxGeo(0.026, 0.01, 0.046, 0.003, 1), m.polymer, 0, -0.11, 0.03); plate.rotation.x = -0.32; mag.add(plate);
  const round = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 8), m.brass, 0, 0.003, 0.0); round.rotation.x = Math.PI / 2; mag.add(round);
  g.add(mag);
  // weapon light under the rail
  const light = new THREE.Group(); light.name = 'wlight';
  light.add(mesh(roundedBoxGeo(0.03, 0.028, 0.072, 0.006, 1), m.polymer, 0, -0.012, -0.108));
  const lensGeo = new THREE.CircleGeometry(0.0115, 18);
  const lens = mesh(lensGeo, m.lensOff, 0, -0.012, -0.1445); lens.rotation.y = Math.PI; light.add(lens);
  const bezel = mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 18), m.steel, 0, -0.012, -0.1443); light.add(bezel);
  g.add(light);
  g.userData = {
    slide, mag, lens: m.lensOff,
    muzzle: new THREE.Vector3(0, 0.034, -0.162),
    lightPos: new THREE.Vector3(0, -0.012, -0.15),
    ejectPort: new THREE.Vector3(-0.012, 0.048, -0.03),
    rightGrip: new THREE.Vector3(0, -0.02, 0.02),
    leftGrip: new THREE.Vector3(0.018, -0.045, -0.005),
    sightY: 0.055,
  };
  slide.userData.dynamic = true; mag.userData.dynamic = true;
  g.updateMatrixWorld(true);
  mergeStatic(g, () => ''); mergeStatic(slide, () => ''); mergeStatic(mag, () => '');
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function buildShotgun() {
  const m = weaponMaterials();
  const g = new THREE.Group(); g.name = 'shotgun';
  // receiver
  g.add(mesh(roundedBoxGeo(0.034, 0.058, 0.2, 0.006, 2), m.slide, 0, 0.012, -0.06));
  // barrel & magazine tube
  const barrel = mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.5, 16), m.slide, 0, 0.028, -0.41); barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const bore = mesh(new THREE.CircleGeometry(0.009, 14), m.dark, 0, 0.028, -0.6605); bore.rotation.y = Math.PI; g.add(bore);
  const tube = mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.42, 14), m.slide, 0, 0.002, -0.37); tube.rotation.x = Math.PI / 2; g.add(tube);
  const cap = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 14), m.steel, 0, 0.002, -0.585); cap.rotation.x = Math.PI / 2; g.add(cap);
  const bead = mesh(new THREE.SphereGeometry(0.003, 8, 6), m.brass, 0, 0.041, -0.64); g.add(bead);
  // pump (fore-end) - moves
  const pump = new THREE.Group(); pump.name = 'pump';
  const pbody = mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.2, 14), m.polymer, 0, 0.0, 0); pbody.rotation.x = Math.PI / 2; pump.add(pbody);
  for (let i = 0; i < 9; i++) { const r = mesh(new THREE.TorusGeometry(0.0225, 0.0022, 5, 16), m.polymer, 0, 0, -0.08 + i * 0.02); pump.add(r); }
  pump.position.set(0, 0.002, -0.28);
  g.add(pump);
  // weapon light on the pump side
  const light = new THREE.Group();
  light.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 12), m.polymer, 0, 0, 0));
  light.children[0].rotation.x = Math.PI / 2;
  const lens = mesh(new THREE.CircleGeometry(0.0115, 16), m.lensOff, 0, 0, -0.051); lens.rotation.y = Math.PI; light.add(lens);
  light.position.set(-0.03, 0.01, -0.02);
  pump.add(light);
  // trigger group, grip wrist, stock
  g.add(mesh(new THREE.BoxGeometry(0.022, 0.03, 0.07), m.polymer, 0, -0.03, -0.02));
  const tg = mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 16, Math.PI), m.polymer, 0, -0.045, -0.03); tg.rotation.set(0, Math.PI / 2, Math.PI); g.add(tg);
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, 0.03); stockShape.lineTo(0.06, 0.028); stockShape.lineTo(0.34, 0.035); stockShape.lineTo(0.36, 0.03);
  stockShape.lineTo(0.36, -0.1); stockShape.lineTo(0.33, -0.105); stockShape.lineTo(0.1, -0.045); stockShape.lineTo(0.04, -0.075); stockShape.lineTo(0.0, -0.03); stockShape.lineTo(0, 0.03);
  const sg = new THREE.ExtrudeGeometry(stockShape, { depth: 0.036, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 6 });
  sg.translate(0, 0, -0.018); sg.rotateY(-Math.PI / 2);
  const stock = mesh(sg, m.polymer, 0, 0.0, 0.04); g.add(stock);
  const pad = mesh(new THREE.BoxGeometry(0.046, 0.14, 0.02), m.dark, 0, -0.035, 0.405); g.add(pad);
  // loading port shell (visible when loading)
  const shell = new THREE.Group(); shell.name = 'loadShell';
  const hull = mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.055, 10), m.shellRed); hull.rotation.x = Math.PI / 2; shell.add(hull);
  const base = mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.012, 10), m.brass, 0, 0, 0.032); base.rotation.x = Math.PI / 2; shell.add(base);
  shell.visible = false;
  g.add(shell);
  g.userData = {
    pump, shell, lens: m.lensOff,
    muzzle: new THREE.Vector3(0, 0.028, -0.665),
    lightPos: new THREE.Vector3(-0.03, 0.012, -0.36),
    ejectPort: new THREE.Vector3(-0.018, 0.02, -0.07),
    rightGrip: new THREE.Vector3(0, -0.03, 0.03),
    leftGrip: new THREE.Vector3(0, -0.018, -0.28),
    sightY: 0.041,
  };
  pump.userData.dynamic = true; shell.userData.dynamic = true;
  g.updateMatrixWorld(true);
  mergeStatic(g, () => ''); mergeStatic(pump, () => '');
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ------------------------------------------------------------------ viewmodel arm
// Skinned arm with 3 bones along +Z: upper (shoulder), fore (elbow), hand (wrist). Gloved, uniform sleeve.
// grip: 'pistol' (vertical handle, right), 'support' (wraps over), 'pump' (horizontal cylinder, palm up)
export function buildArm(side, grip, detail = 1) {
  const s = side;           // +1 left arm, -1 right arm (character sides)
  const U = 0.29, F = 0.26;
  const sh = [0, 0, 0], el = [0, 0, U], wr = [0, 0, U + F];
  const prims = [];
  const B = { upper: 0, fore: 1, hand: 2 };
  // sleeve (navy uniform) over upper arm & forearm, cuff near wrist
  prims.push({ t: 'cone', a: sh, b: el, ra: 0.058, rb: 0.047, bone: B.upper, k: 0.02, mat: 1, layer: 'cloth' });
  prims.push({ t: 'cone', a: el, b: [0, 0, U + F - 0.035], ra: 0.047, rb: 0.04, bone: B.fore, k: 0.02, mat: 1, layer: 'cloth' });
  prims.push({ t: 'sphere', c: el, r: 0.05, bone: B.fore, k: 0.02, mat: 1, layer: 'cloth', wScale: 0.8 });
  // cuff edge
  prims.push({ t: 'cone', a: [0, 0, U + F - 0.05], b: [0, 0, U + F - 0.03], ra: 0.043, rb: 0.043, bone: B.fore, k: 0.004, mat: 1, layer: 'cloth' });
  // glove wrist
  prims.push({ t: 'cone', a: [0, 0, U + F - 0.045], b: [0, 0, U + F + 0.01], ra: 0.033, rb: 0.029, bone: B.hand, k: 0.01, mat: 7 });
  // hand frame: +Z forward (wrist->knuckles). palm faces -X*s ... we define per grip
  const H = (x, y, z) => [x, y, U + F + z];
  if (grip === 'pistol' || grip === 'support' || grip === 'wrist') {
    // palm slab, knuckles vertical (fist around a vertical handle to the inner side)
    const inner = -s; // direction toward the handle (x)
    const R = grip === 'support' ? 0.03 : 0.017;   // handle radius
    const cx = inner * (0.024 + R * 0.4), cz = 0.075;   // handle centre relative to wrist
    prims.push({ t: 'box', c: H(inner * 0.004, -0.004, 0.045), s: [0.016, 0.043, 0.042], r: 0.013, bone: B.hand, k: 0.012, mat: 7 });
    for (let f = 0; f < 4; f++) {
      const y = 0.03 - f * 0.02 - (grip === 'support' ? 0.01 : 0);
      const pts = [];
      const r = R + 0.011;
      // arc around the handle from the outer side to the front and inner side
      for (let k = 0; k <= 3; k++) {
        const a = -Math.PI * 0.5 + (k / 3) * Math.PI * 0.95;
        pts.push(H(cx + Math.sin(a) * r * inner, y - k * 0.003, cz + Math.cos(a) * r * 0.9));
      }
      // knuckle start
      prims.push({ t: 'cone', a: H(inner * 0.002, y, 0.062), b: pts[1], ra: 0.0105, rb: 0.0095, bone: B.hand, k: 0.006, mat: 7 });
      prims.push({ t: 'cone', a: pts[1], b: pts[2], ra: 0.0095, rb: 0.0088, bone: B.hand, k: 0.005, mat: 7 });
      prims.push({ t: 'cone', a: pts[2], b: pts[3], ra: 0.0088, rb: 0.008, bone: B.hand, k: 0.004, mat: 7 });
    }
    // thumb: along the inner side pointing forward
    prims.push({ t: 'cone', a: H(inner * 0.012, 0.03, 0.03), b: H(inner * 0.03, 0.045, 0.075), ra: 0.013, rb: 0.011, bone: B.hand, k: 0.008, mat: 7 });
    prims.push({ t: 'cone', a: H(inner * 0.03, 0.045, 0.075), b: H(inner * 0.036, 0.05, 0.11), ra: 0.011, rb: 0.009, bone: B.hand, k: 0.006, mat: 7 });
  } else if (grip === 'pump') {
    // palm up under a horizontal cylinder running along +Z (fore-end), fingers wrap up the outer side
    prims.push({ t: 'box', c: H(0, -0.01, 0.045), s: [0.042, 0.015, 0.045], r: 0.013, bone: B.hand, k: 0.012, mat: 7 });
    for (let f = 0; f < 4; f++) {
      const z = 0.055 + f * 0.018 - 0.02;
      const x0 = -s * 0.01;
      prims.push({ t: 'cone', a: H(x0, -0.01, z + 0.02), b: H(-s * 0.035, 0.012, z + 0.03), ra: 0.0105, rb: 0.0095, bone: B.hand, k: 0.006, mat: 7 });
      prims.push({ t: 'cone', a: H(-s * 0.035, 0.012, z + 0.03), b: H(-s * 0.03, 0.035, z + 0.03), ra: 0.0095, rb: 0.008, bone: B.hand, k: 0.005, mat: 7 });
    }
    prims.push({ t: 'cone', a: H(s * 0.02, -0.005, 0.03), b: H(s * 0.03, 0.02, 0.07), ra: 0.013, rb: 0.01, bone: B.hand, k: 0.008, mat: 7 });
  }
  const res = buildMesh({ prims, h: detail >= 1 ? 0.0055 : 0.0075, bones: 3, weightFalloff: 70 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(res.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(res.normal, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(res.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(res.skinWeight, 4));
  g.setAttribute('matA', new THREE.BufferAttribute(res.matA, 4));
  g.setAttribute('matB', new THREE.BufferAttribute(res.matB, 4));
  g.setIndex(new THREE.BufferAttribute(res.index, 1));
  g.computeBoundingSphere();
  const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
  bones[1].position.set(0, 0, U); bones[2].position.set(0, 0, F);
  bones[0].add(bones[1]); bones[1].add(bones[2]);
  const skel = new THREE.Skeleton(bones);
  return { geometry: g, bones, skeleton: skel, U, F, H: 0.1 };
}

// Build an arm SkinnedMesh with the gloved/uniform material
export function makeArmMesh(armData, material) {
  const m = new THREE.SkinnedMesh(armData.geometry, material);
  m.add(armData.bones[0]);
  m.bind(armData.skeleton);
  m.frustumCulled = false;
  return m;
}

// Two-bone IK in world space. shoulderPos, targetPos (wrist), pole hint; writes bone world orientations.
const _ab = new THREE.Vector3(), _at = new THREE.Vector3(), _n = new THREE.Vector3(), _el = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const _UPV = new THREE.Vector3(0, 1, 0), _RIGHTV = new THREE.Vector3(1, 0, 0);
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
export function solveArmIK(arm, root, shoulder, wrist, pole, handQuat) {
  // arm: {bones,U,F}; root: object3D the mesh is attached to (world space at identity)
  const U = arm.U, F = arm.F;
  _at.subVectors(wrist, shoulder);
  let d = _at.length();
  const maxD = (U + F) * 0.999;
  if (d > maxD) { _at.multiplyScalar(maxD / d); d = maxD; }
  const dir = _at.clone().normalize();
  // elbow position via law of cosines
  const a = (U * U - F * F + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, U * U - a * a));
  _n.subVectors(pole, shoulder); _n.addScaledVector(dir, -_n.dot(dir));
  if (_n.lengthSq() < 1e-8) _n.set(0, -1, 0).addScaledVector(dir, -dir.y);
  _n.normalize();
  _el.copy(shoulder).addScaledVector(dir, a).addScaledVector(_n, h);
  // upper bone: +Z toward elbow, +Y toward pole-ish
  const orient = (from, to, up, out) => {
    _z.subVectors(to, from).normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() < 1e-8) _x.crossVectors(Math.abs(_z.y) < 0.9 ? _UPV : _RIGHTV, _z);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m4.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m4);
  };
  const qU = orient(shoulder, _el, _n.clone().negate(), new THREE.Quaternion());
  const qF = orient(_el, shoulder.clone().add(_at), _n.clone().negate(), new THREE.Quaternion());
  const bones = arm.bones;
  bones[0].position.copy(shoulder);
  bones[0].quaternion.copy(qU);
  bones[1].quaternion.copy(qU).invert().multiply(qF);
  // hand keeps the requested world orientation
  if (handQuat) bones[2].quaternion.copy(qF).invert().multiply(handQuat);
  else bones[2].quaternion.identity();
  return _el;
}
