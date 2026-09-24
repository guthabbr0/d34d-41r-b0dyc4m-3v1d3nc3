// Harlan Court Apartments, 2250 Wexley Ave. Night, rain.
// World: +X east, +Z south (towards the street). Building footprint x[-15,15] z[-20,0].
import * as THREE from 'three';
import { Builder, mergeStatic } from './builder.js';
import { SURF, Solid } from './world.js';
import { buildPoliceCar } from './car.js';
import * as P from './props.js';
import { LightManager, zoneAt } from './lights.js';
import { mulberry } from '../engine/post.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildLevel({ assets, M, world, scene, quality }) {
  const root = new THREE.Group();
  root.name = 'level';
  scene.add(root);
  const B = new Builder(world);
  B.zoneFn = zoneAt;
  const rnd = mulberry(2250);
  const L = {
    root, doors: [], triggers: [], spawns: {}, pickups: [], animated: [], corpses: [], markers: {},
    interactables: [], lights: null, car: null, windows: [], clothes: [],
  };
  const lights = new LightManager(scene, quality.lightPool);
  L.lights = lights;
  const m = M;

  // ------------------------------------------------------------------ helpers
  const addSolidFor = (obj, opts = {}) => {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    if (opts.shrink) b.expandByScalar(-opts.shrink);
    return world.box(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, opts);
  };
  const place = (id, x, z, ry = 0, o = {}) => {
    const obj = assets.model(id, { height: o.height, cast: o.cast !== false });
    obj.position.set(x, o.y ?? 0, z);
    obj.rotation.set(o.rx ?? 0, ry, o.rz ?? 0);
    if (o.s) obj.scale.multiplyScalar(o.s);
    root.add(obj);
    if (o.solid !== false) addSolidFor(obj, { surf: o.surf ?? SURF.WOOD, blocksSight: o.blocksSight ?? false, blocksMove: o.blocksMove ?? true, walkOver: o.walkOver ?? false, shrink: o.shrink ?? 0.02 });
    return obj;
  };
  const add = (obj, x, y, z, ry = 0, o = {}) => {
    obj.position.set(x, y, z); obj.rotation.y = ry; root.add(obj);
    if (o.solid) addSolidFor(obj, { surf: o.surf ?? SURF.METAL, blocksSight: o.blocksSight ?? false, shrink: o.shrink ?? 0.01 });
    return obj;
  };

  // door: axis 'x' => wall runs along X at z; opening [a,b] in x. axis 'z' => wall along Z at x, opening [a,b] in z.
  const addDoor = (o) => {
    const width = o.b - o.a;
    const d = P.buildDoor(m, { width, kind: o.kind || 'apartment', label: o.label });
    const g = d.group;
    if (o.axis === 'x') { g.position.set(o.a, 0, o.at); g.rotation.y = 0; }
    else { g.position.set(o.at, 0, o.b); g.rotation.y = Math.PI / 2; }
    root.add(g);
    d.frame.position.copy(g.position); d.frame.rotation.copy(g.rotation);
    root.add(d.frame);
    // dynamic solid spanning the opening while closed
    const s = new Solid(
      o.axis === 'x' ? o.a : o.at - 0.06, 0, o.axis === 'x' ? o.at - 0.06 : o.a,
      o.axis === 'x' ? o.b : o.at + 0.06, 2.1, o.axis === 'x' ? o.at + 0.06 : o.b,
      { surf: o.kind === 'metal' ? SURF.METAL : o.kind === 'glass' ? SURF.GLASS : SURF.WOOD, blocksSight: o.kind !== 'glass', tag: 'door' });
    s.dynamic = true;
    world.add(s);
    const door = {
      name: o.name, group: g, pivot: d.pivot, solid: s, axis: o.axis, a: o.a, b: o.b, at: o.at,
      open: 0, target: o.open ?? 0, swing: o.swing ?? 1, locked: o.locked || null, kind: o.kind || 'apartment',
      center: o.axis === 'x' ? V3((o.a + o.b) / 2, 1.1, o.at) : V3(o.at, 1.1, (o.a + o.b) / 2),
      maxAngle: o.maxAngle ?? 1.5,
    };
    door.open = door.target;
    door.init = { open: door.target, locked: door.locked };
    door.pivot.rotation.y = -door.open * door.maxAngle * door.swing;
    s.enabled = door.open < 0.1;
    L.doors.push(door);
    return door;
  };

  // =================================================================== EXTERIOR GROUND
  // street asphalt (long for the drive-in), sidewalks, lot
  B.floor(-160, 16, 170, 28, 0, m.asphalt);
  B.floor(-160, 13, -16, 16, 0, m.sidewalk);
  B.floor(16, 13, 170, 16, 0, m.sidewalk);
  B.floor(-16, 13, 6, 16, 0, m.sidewalk);
  B.floor(14, 13, 16, 16, 0, m.sidewalk);
  B.floor(6, 13, 14, 16, 0, m.asphalt);            // driveway apron
  B.floor(-160, 28, 170, 31, 0, m.sidewalk);        // far sidewalk
  B.floor(-16, 1.5, 16, 13, 0, m.asphalt);         // parking lot
  B.floor(-16, 0, 16, 1.5, 0, m.sidewalk);         // building frontage
  B.floor(-40, -14, -16, 13, 0, m.asphalt, {});    // side lot (west, beyond wall - unreachable)
  // curbs (walk-over strips)
  B.box(-160, 0, 15.85, 6, 0.13, 16.05, m.curb, { solidOpts: { walkOver: true, blocksSight: false } });
  B.box(14, 0, 15.85, 170, 0.13, 16.05, m.curb, { solidOpts: { walkOver: true, blocksSight: false } });
  B.box(-160, 0, 27.95, 170, 0.13, 28.15, m.curb, { solidOpts: { walkOver: true, blocksSight: false } });
  // road paint
  const paintY = new THREE.MeshStandardMaterial({ color: 0xb89a30, roughness: 0.5 });
  const paintW = new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.55 });
  root.add(P.paintQuad(paintY, -160, 21.9, 170, 22.0));
  root.add(P.paintQuad(paintY, -160, 22.1, 170, 22.2));
  for (let x = -158; x < 170; x += 9) root.add(P.paintQuad(paintW, x, 18.9, x + 3, 19.02));
  for (let x = -158; x < 170; x += 9) root.add(P.paintQuad(paintW, x, 25.0, x + 3, 25.12));
  for (let x = -14; x <= 4; x += 3) root.add(P.paintQuad(paintW, x - 0.06, 2.2, x + 0.06, 7.0));   // stalls
  // =================================================================== BUILDING SHELL
  const H = 7.4, CEIL = 3.0;
  // front wall split per room for interior finish
  const frontOps = [{ a: -1.3, b: 1.3, y0: 0, y1: 2.45 }, { a: -4.0, b: -2.2, y0: 0.9, y1: 2.25 }, { a: 2.2, b: 4.0, y0: 0.9, y1: 2.25 }, { a: -7.8, b: -6.2, y0: 1.0, y1: 2.15 }];
  B.wallX(-0.15, -15, 15, { t: 0.3, y1: H, openings: frontOps, matN: m.plaster, matP: m.brick, matTop: m.brick });
  B.wallX(-19.85, -15, 15, { t: 0.3, y1: H, openings: [{ a: -1.5, b: 0.3, y0: 0.95, y1: 2.1 }, { a: 13.2, b: 14.2, y0: 0, y1: 2.1 }], matN: m.brick, matP: m.wallpaper, matTop: m.brick });
  B.wallZ(-14.85, -19.7, -0.3, { t: 0.3, y1: H, matN: m.brick, matP: m.plaster, matTop: m.brick });
  B.wallZ(14.85, -19.7, -0.3, { t: 0.3, y1: H, matN: m.plaster, matP: m.brick, matTop: m.brick });
  // cornice + parapet cap
  B.box(-15.25, H - 0.05, -20.25, 15.25, H + 0.35, -19.7, m.concreteWall, { solid: false });
  B.box(-15.25, H - 0.05, -0.3, 15.25, H + 0.35, 0.25, m.concreteWall, { solid: false });
  B.box(-15.25, H - 0.05, -19.7, -14.7, H + 0.35, -0.3, m.concreteWall, { solid: false });
  B.box(14.7, H - 0.05, -19.7, 15.25, H + 0.35, -0.3, m.concreteWall, { solid: false });
  // floor band between storeys
  B.box(-15.08, 3.3, 0, 15.08, 3.55, 0.08, m.concreteWall, { solid: false });
  B.box(-15.08, 3.3, -20.08, 15.08, 3.55, -20, m.concreteWall, { solid: false });

  // =================================================================== INTERIOR WALLS
  const IW = 0.15;
  B.wallZ(-5, -8, -0.3, { t: IW, y1: CEIL, openings: [{ a: -6.4, b: -5.5 }], matN: m.plaster, matP: m.plaster });
  B.wallZ(5, -8, -0.3, { t: IW, y1: CEIL, matN: m.plaster, matP: m.plaster });
  B.wallZ(-9, -8, -0.3, { t: IW, y1: CEIL, matN: m.plaster, matP: m.plaster });
  B.wallX(-8, -14.7, 14.7, { t: IW, y1: CEIL, openings: [{ a: -2, b: 2, y1: 2.6 }, { a: -12.4, b: -11.5 }, { a: 7, b: 7.9 }, { a: 12.9, b: 13.8 }], matN: m.plaster, matP: m.plaster });
  B.wallX(-10.4, -14.7, 12.6, { t: IW, y1: CEIL, openings: [{ a: -12, b: -11.1 }, { a: -6, b: -5.1 }, { a: 0.6, b: 1.5 }, { a: 8, b: 8.9 }], matN: m.wallpaper, matP: m.plaster });
  B.wallZ(11, -10.4, -8, { t: IW, y1: CEIL, openings: [{ a: -9.65, b: -8.75 }], matN: m.plaster, matP: m.paintedConcrete });
  B.wallZ(12.6, -19.7, -10.4, { t: IW, y1: CEIL, openings: [{ a: -17.6, b: -16.7 }], matN: m.paintedConcrete, matP: m.paintedConcrete });
  B.wallZ(9, -8, -0.3, { t: IW, y1: CEIL, matN: m.plaster, matP: m.whiteTiles });
  B.wallZ(-8.5, -15.5, -10.4, { t: IW, y1: CEIL, matN: m.wallpaper, matP: m.wallpaper });
  B.wallX(-15.5, -8.5, -2.5, { t: IW, y1: CEIL, matN: m.wallpaper, matP: m.wallpaper });
  B.wallZ(-2.5, -19.7, -10.4, { t: IW, y1: CEIL, matN: m.wallpaper, matP: m.wallpaper });
  B.wallZ(5.5, -19.7, -10.4, { t: IW, y1: CEIL, matN: m.wallpaper, matP: m.paintedConcrete });
  B.wallX(-15.5, -2.5, 5.5, { t: IW, y1: CEIL, openings: [{ a: -0.5, b: 0.4 }, { a: 3, b: 3.8 }], matN: m.wallpaper, matP: m.wallpaper });
  B.wallZ(2, -19.7, -15.5, { t: IW, y1: CEIL, matN: m.wallpaper, matP: m.whiteTiles });
  B.wallX(-15, 5.5, 12.6, { t: IW, y1: CEIL, matN: m.paintedConcrete, matP: m.paintedConcrete });

  // =================================================================== FLOORS & CEILINGS
  const rooms = [
    [-5, -8, 5, -0.3, m.lobbyFloor], [-9, -8, -5, -0.3, m.corridorFloor], [-14.7, -10.4, 11, -8, m.corridorFloor],
    [11, -10.4, 14.7, -8, m.concreteFloor], [12.6, -19.7, 14.7, -10.4, m.concreteFloor], [9, -8, 14.7, -0.3, m.concreteFloor],
    [-8.5, -15.5, -2.5, -10.4, m.woodFloor], [-2.5, -15.5, 5.5, -10.4, m.woodFloor], [-2.5, -19.7, 2, -15.5, m.woodFloor],
    [2, -19.7, 5.5, -15.5, m.whiteTiles], [5.5, -19.7, 12.6, -15, m.concreteFloor],
  ];
  for (const [x0, z0, x1, z1, fm] of rooms) {
    B.floor(x0, z0, x1, z1, 0, fm);
    B.ceiling(x0, z0, x1, z1, CEIL, m.ceiling);
  }
  // doorway thresholds are covered by adjacent floors; floors under walls are hidden.

  // =================================================================== COURTYARD & ALLEY
  B.floor(-15, -36, 15, -20, 0, m.courtGround);
  B.floor(-60, -48, 60, -36, 0, m.asphalt);
  // neighbour walls enclosing the courtyard and lot
  B.box(-15.6, 0, -36, -15, 6.5, -20.3, m.brickDry, {});
  B.box(15, 0, -36, 15.6, 6.5, -20.3, m.brickDry, {});
  B.box(-17.2, 0, -20.3, -15.3, 8.5, 13, { nx: m.brickDry, px: m.brick, py: m.concreteWall, pz: m.brick, nz: m.brick }, {});   // west neighbour
  B.box(-60, 0, -52, 60, 7, -48, m.brickDry, {});                  // far side of the alley
  B.box(-60, 0, -48, -30, 6, -36.3, m.brickDry, {});
  B.box(30, 0, -48, 60, 6, -36.3, m.brickDry, {});
  // alley walls behind the neighbour walls (so the courtyard fence line is the only way in)
  B.box(-30, 0, -36.3, -15, 3.2, -36, m.concreteWall, {});
  B.box(15, 0, -36.3, 30, 3.2, -36, m.concreteWall, {});

  // =================================================================== STREET BACKDROP
  for (let x = -150, i = 0; x < 170; i++) {
    const w = 12 + rnd() * 16, h = 8 + rnd() * 16;
    const blk = P.buildBackdropBlock(m, w, h, 12, { brick: rnd() < 0.6, seed: i + 1 });
    blk.position.set(x + w / 2, 0, 38);
    root.add(blk);
    world.box(x, 0, 31.5, x + w, h, 44, { blocksSight: true });
    x += w + 1 + rnd() * 3;
  }
  // east neighbour lot (dark), low building
  const eastBlk = P.buildBackdropBlock(m, 14, 6, 26, { brick: false, seed: 42 });
  eastBlk.position.set(26, 0, -4); root.add(eastBlk);
  world.box(19, 0, -17, 33, 6, 9, {});

  // invisible bounds
  world.box(-160, 0, 30.5, 170, 4, 31.5, { blocksShot: false, blocksSight: false });
  world.box(17.5, 0, -20, 19, 4, 31, { blocksShot: false, blocksSight: false });
  world.box(-30, 0, 13, -28, 4, 31, { blocksShot: false, blocksSight: false });
  world.box(30, 0, 13, 32, 4, 31, { blocksShot: false, blocksSight: false });

  // =================================================================== DOORS
  addDoor({ name: 'entranceL', axis: 'x', at: -0.15, a: -1.3, b: 0, kind: 'glass', open: 0.55, swing: 1, maxAngle: 1.45 });
  addDoor({ name: 'entranceR', axis: 'x', at: -0.15, a: 0, b: 1.3, kind: 'glass', open: 0, locked: 'jammed' });
  addDoor({ name: 'office', axis: 'z', at: -5, a: -6.4, b: -5.5, open: 0.85, swing: -1 });
  addDoor({ name: 'stairs', axis: 'x', at: -8, a: -12.4, b: -11.5, kind: 'metal', locked: 'The stairwell door is barricaded from the other side.', label: 'STAIRS' });
  addDoor({ name: 'storage', axis: 'x', at: -8, a: 7, b: 7.9, locked: 'Storage. Locked.' });
  addDoor({ name: 'laundry', axis: 'x', at: -8, a: 12.9, b: 13.8, kind: 'metal', swing: -1, label: 'LAUNDRY' });
  addDoor({ name: '1A', axis: 'x', at: -10.4, a: -12, b: -11.1, locked: 'Locked. Something is scratching on the other side.', label: '1A' });
  addDoor({ name: '1B', axis: 'x', at: -10.4, a: -6, b: -5.1, label: '1B', swing: 1 });
  addDoor({ name: '1C', axis: 'x', at: -10.4, a: 0.6, b: 1.5, label: '1C', open: 0.3, swing: 1 });
  addDoor({ name: '1D', axis: 'x', at: -10.4, a: 8, b: 8.9, label: '1D', locked: 'Locked.' });
  addDoor({ name: 'maintenance', axis: 'z', at: 11, a: -9.65, b: -8.75, kind: 'metal', locked: 'MAINTENANCE — authorised personnel only. You need a key.', swing: -1 });
  addDoor({ name: 'maintRoom', axis: 'z', at: 12.6, a: -17.6, b: -16.7, kind: 'metal', open: 0.9, swing: 1 });
  addDoor({ name: 'rearExit', axis: 'x', at: -19.85, a: 13.2, b: 14.2, kind: 'metal', swing: -1, label: null });
  addDoor({ name: 'bath1C', axis: 'x', at: -15.5, a: 3, b: 3.8, locked: 'Something heavy keeps slamming against this door.' });
  addDoor({ name: 'bed1C', axis: 'x', at: -15.5, a: -0.5, b: 0.4, open: 1, swing: -1 });

  // =================================================================== EXTERIOR DETAILS
  // entrance canopy with flickering downlight
  const canopy = P.buildCanopy(m);
  canopy.position.set(0, 2.85, 0); root.add(canopy);
  lights.add({ name: 'canopy', pos: V3(0, 2.6, 0.9), color: 0xd8e4ff, intensity: 70, distance: 9, zone: 'lot', pattern: 'flicker', emissive: canopy.userData.lens });
  // address numbers + building sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.55), new THREE.MeshStandardMaterial({ map: P.textTexture('HARLAN COURT', { w: 512, h: 84, bg: '#20201e', fg: '#c9b98a', font: 'bold 60px Georgia' }), roughness: 0.6, metalness: 0.3 }));
  sign.position.set(0, 3.2, 1.81); root.add(sign);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.3), new THREE.MeshStandardMaterial({ map: P.textTexture('2250', { w: 256, h: 110, bg: '#1a1a1a', fg: '#e0d8c0', font: 'bold 84px Arial' }), roughness: 0.5 }));
  num.position.set(2.6, 2.4, 0.02); root.add(num);
  // facade windows (upper floor decorative + ground floor frames)
  const winRnd = mulberry(77);
  for (const x of [-12.5, -9.5, -6.5, -3, 0, 3, 6.5, 9.5, 12.5]) {
    const lit = winRnd() < 0.35;
    const w = P.buildWindow(m, 1.3, 1.5, { lit, cool: winRnd() < 0.3, rnd: winRnd });
    w.position.set(x, 5.2, 0.02); root.add(w);
    const w2 = P.buildWindow(m, 1.3, 1.5, { lit: winRnd() < 0.25, rnd: winRnd });
    w2.position.set(x, 5.2, -20.02); w2.rotation.y = Math.PI; root.add(w2);
  }
  for (const x of [-12, 12]) { const w = P.buildWindow(m, 1.2, 0.6, { lit: false }); w.position.set(x, 2.0, 0.02); root.add(w); }
  for (const x of [-10, -5, 5, 9]) { const w = P.buildWindow(m, 1.2, 1.2, { lit: winRnd() < 0.3, rnd: winRnd }); w.position.set(x, 1.6, -20.02); w.rotation.y = Math.PI; root.add(w); }
  // side-wall windows on the neighbour building (lit, some silhouettes)
  // real openings: lobby windows glass
  for (const [a, b] of [[-4, -2.2], [2.2, 4]]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 1.35), m.glass);
    gl.position.set((a + b) / 2, 1.575, -0.1); root.add(gl);
    world.box(a, 0.9, -0.2, b, 2.25, -0.1, { surf: SURF.GLASS, blocksSight: false, blocksMove: true });
  }
  {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.15), m.glass);
    gl.position.set(-7, 1.575, -0.1); root.add(gl);
    world.box(-7.8, 1.0, -0.2, -6.2, 2.15, -0.1, { surf: SURF.GLASS, blocksSight: false });
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15), m.glass);
    bw.position.set(-0.6, 1.525, -19.8); bw.rotation.y = Math.PI; root.add(bw);
    world.box(-1.5, 0.95, -19.95, 0.3, 2.1, -19.75, { surf: SURF.GLASS, blocksSight: false });
  }

  // street lights
  for (const [x, z, ry] of [[-6, 14.6, Math.PI / 2], [12, 14.6, Math.PI / 2], [-40, 14.6, Math.PI / 2], [-75, 14.6, Math.PI / 2], [-110, 14.6, Math.PI / 2], [-145, 14.6, Math.PI / 2], [-22, 29.5, -Math.PI / 2], [-58, 29.5, -Math.PI / 2], [-93, 29.5, -Math.PI / 2], [-128, 29.5, -Math.PI / 2], [30, 29.5, -Math.PI / 2], [45, 14.6, Math.PI / 2], [80, 14.6, Math.PI / 2], [115, 14.6, Math.PI / 2], [150, 14.6, Math.PI / 2], [65, 29.5, -Math.PI / 2], [100, 29.5, -Math.PI / 2], [135, 29.5, -Math.PI / 2]]) {
    const sl = P.buildStreetLight(m);
    sl.position.set(x, 0, z); sl.rotation.y = ry; root.add(sl);
    world.box(x - 0.2, 0, z - 0.2, x + 0.2, 7, z + 0.2, { surf: SURF.METAL, blocksSight: false });
    sl.updateMatrixWorld(true);
    const lp = sl.userData.lightPos.clone().applyMatrix4(sl.matrixWorld);
    lights.add({ name: 'street', pos: lp, color: 0xffa24a, intensity: 1400, distance: 26, zone: 'street', pattern: x === 12 ? 'buzz' : 'steady', priority: 1.2 });
  }
  // traffic signal + stop line / crosswalk where the patrol car waits in the intro
  const sig = P.buildTrafficSignal(m, 6);
  sig.position.set(30.2, 0, 15.2); root.add(sig);
  world.box(30.05, 0, 15.05, 30.35, 5, 15.35, { surf: SURF.METAL, blocksSight: false });
  sig.updateMatrixWorld(true);
  const sigPos = sig.userData.lampPos.clone().applyMatrix4(sig.matrixWorld);
  L.signal = { ...sig.userData, src: lights.add({ name: 'signal', pos: sigPos.add(V3(1.5, -1, 0)), color: 0xff2010, intensity: 90, distance: 16, zone: 'street', priority: 1.5 }) };
  root.add(P.paintQuad(paintW, 30.6, 16.1, 31.0, 22.0));
  for (let z = 16.4; z < 27.8; z += 0.9) root.add(P.paintQuad(paintW, 27.2, z, 30.2, z + 0.45));
  // utility poles
  for (let x = -150; x < 170; x += 32) { const up = P.buildUtilityPole(m); up.position.set(x + 7, 0, 30); root.add(up); }

  // parking lot props
  const dump = P.buildDumpster(m, { lidOpen: 0.6 });
  add(dump, -14.2, 0, 8.2, Math.PI / 2, { solid: true, surf: SURF.METAL, blocksSight: false });
  place('trashbag', -13.6, 6.6, 0.4);
  place('trashbag', -14.3, 6.1, 2.1, { s: 0.9 });
  place('trashbag', -13.1, 9.9, 1.2, { s: 1.1 });
  place('covered_car', -9, 4.6, 0, { shrink: 0.1, surf: SURF.METAL });
  place('covered_car', -3.1, 4.7, 0.05, { shrink: 0.1, surf: SURF.METAL });
  place('utility_box_01', 14.8, 1.2, -Math.PI / 2, { surf: SURF.METAL });
  place('metal_trash_can', 3.4, 0.7, 0.3, { surf: SURF.METAL });
  place('WetFloorSign_01', 1.7, -1.2, 0.6, { solid: false });
  const fenceE = P.buildChainFence(m, 13, { height: 2.2 });
  fenceE.position.set(16, 0, 0); fenceE.rotation.y = -Math.PI / 2; root.add(fenceE);
  world.box(15.95, 0, 0, 16.05, 2.2, 13, { surf: SURF.METAL, blocksShot: false, blocksSight: false });

  // police car (parked in the lot for gameplay; the intro moves its own copy)
  const car = buildPoliceCar(m, { interior: true });
  car.position.set(4.2, 0, 8.6);
  car.updateMatrixWorld(true);
  mergeStatic(car, () => '');
  car.rotation.y = Math.PI / 2 + 0.12;   // nose toward the building (-z)
  root.add(car);
  L.car = car;
  // headlights (one spot for both lamps) - parked with lights on, washing the entrance
  const head = new THREE.SpotLight(0xfff2dc, 900, 38, 0.55, 0.6, 1.8);
  head.position.set(3.05, 0.72, 0); head.target.position.set(12, 0.2, 0);
  head.castShadow = false;
  car.add(head, head.target);
  L.headlight = head;
  L.carSolid = addSolidFor(car, { surf: SURF.METAL, blocksSight: false, shrink: 0.12 });
  car.updateMatrixWorld(true);
  const redPos = V3(0, 1.62, -0.32).applyMatrix4(car.matrixWorld);
  const bluePos = V3(0, 1.62, 0.32).applyMatrix4(car.matrixWorld);
  L.policeRed = lights.add({ name: 'policeR', pos: redPos, color: 0xff1a0a, intensity: 900, distance: 22, zone: 'lot', pattern: 'police-red', emissive: car.userData.lightbar.red.material, emissiveBase: 40, priority: 3 });
  L.policeBlue = lights.add({ name: 'policeB', pos: bluePos, color: 0x1a3cff, intensity: 1100, distance: 22, zone: 'lot', pattern: 'police-blue', emissive: car.userData.lightbar.blue.material, emissiveBase: 40, priority: 3 });

  // =================================================================== LOBBY
  const mb = P.buildMailboxes(m); add(mb, -4.8, 0, -3.2, Math.PI / 2, { solid: true });
  const elev = P.buildElevator(m); add(elev, 4.93, 0, -4.8, -Math.PI / 2, { solid: false });
  const exitL = P.buildExitSign(m); exitL.position.set(0, 2.72, -0.33); exitL.rotation.y = Math.PI; root.add(exitL);
  const strobe = P.buildStrobe(m); strobe.position.set(4.9, 2.3, -2.2); strobe.rotation.y = -Math.PI / 2; root.add(strobe);
  lights.add({ name: 'strobe', pos: V3(4.6, 2.3, -2.2), color: 0xffffff, intensity: 180, distance: 12, zone: 'lobby', pattern: 'strobe', emissive: strobe.userData.lens, emissiveBase: 60, priority: 1.5 });
  place('fire_alarm', 4.92, -2.55, -Math.PI / 2, { y: 1.35, solid: false, s: 1.4 });
  place('painted_wooden_chair_01', -2.8, -1.6, 2.2, { rx: -Math.PI / 2 + 0.05, y: 0.22 });
  place('WetFloorSign_01', 2.1, -6.6, 1.1, { solid: false });
  // fluorescent fixtures (model + emissive tubes)
  const fixtureHousing = new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.55, metalness: 0.3 });
  const fixtureGeo = new THREE.BoxGeometry(1.24, 0.07, 0.3);
  const fixture = (x, z, zone, pattern, rotY = 0, intensity = 110) => {
    const f = new THREE.Mesh(fixtureGeo, fixtureHousing);
    f.position.set(x, CEIL - 0.035, z); f.rotation.y = rotY; f.castShadow = false; f.receiveShadow = true;
    root.add(f);
    const tubeM = m.emissiveTube.clone();
    const diff = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.012, 0.22), tubeM);
    diff.position.set(x, CEIL - 0.075, z); diff.rotation.y = rotY; diff.userData.dynamic = true;
    root.add(diff);
    return lights.add({ pos: V3(x, CEIL - 0.25, z), color: 0xe4ecff, intensity, distance: 11, zone, pattern, emissive: tubeM, emissiveBase: 30 });
  };
  fixture(0, -2.4, 'lobby', 'dying', 0, 70);
  fixture(0, -6.0, 'lobby', 'flicker', 0, 80);
  // blood trail from the entrance into the corridor (decals added by game), corpse marker
  L.markers.lobbyCorpse = V3(-3.6, 0, -4.4);
  L.markers.bloodTrail = [V3(-0.3, 0, -0.8), V3(-0.6, 0, -2.5), V3(-0.4, 0, -4.2), V3(0.1, 0, -6), V3(0.6, 0, -7.6), V3(0.9, 0, -9.2), V3(1.0, 0, -10.8), V3(0.8, 0, -12.2)];

  // =================================================================== OFFICE
  place('metal_office_desk', -7.1, -2.2, Math.PI, { surf: SURF.METAL });
  place('modern_arm_chair_01', -7.3, -3.3, 0.4);
  place('wooden_bookshelf_worn', -8.62, -6.2, Math.PI / 2, { blocksSight: true });
  place('cardboard_box_01', -6.0, -7.4, 0.3);
  L.pickupSpots = [];
  L.pickupSpots.push({ type: 'ammo', pos: V3(-6.7, 0.8, -2.0) });
  L.pickupSpots.push({ type: 'med', pos: V3(-8.4, 0.0, -1.0) });
  lights.add({ name: 'officeLamp', pos: V3(-7.8, 0.95, -2.1), color: 0xffc07a, intensity: 8, distance: 5, zone: 'office', pattern: 'buzz' });

  // =================================================================== CORRIDOR
  fixture(-11.5, -9.2, 'corridor', 'dying', Math.PI / 2);
  fixture(-5.2, -9.2, 'corridor', 'flicker', Math.PI / 2);
  fixture(1.2, -9.2, 'corridor', 'steady', Math.PI / 2, 90);
  fixture(7.4, -9.2, 'corridor', 'buzz', Math.PI / 2, 70);
  const exitC = P.buildExitSign(m); exitC.position.set(10.9, 2.5, -9.2); exitC.rotation.y = -Math.PI / 2; root.add(exitC);
  place('trashbag', -13.9, -9.9, 0.5, { s: 0.8 });
  place('metal_trash_can', -14.3, -8.4, 1.0, { surf: SURF.METAL, s: 0.8 });
  const maintSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshStandardMaterial({ map: P.textTexture(['MAINTENANCE', 'AUTHORIZED ONLY'], { w: 256, h: 150, bg: '#e8e0c8', fg: '#8a1010', font: 'bold 26px Arial' }) }));
  maintSign.position.set(10.9, 1.7, -8.5); maintSign.rotation.y = -Math.PI / 2; root.add(maintSign);
  L.markers.corridorWest = V3(-13.5, 0, -9.2);

  // =================================================================== APARTMENT 1B (dark studio)
  const mattress = new THREE.Mesh(P.buildBed(m).children[1].geometry, new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 1 }));
  mattress.position.set(-7.3, 0.11, -13.6); mattress.rotation.y = 0.2; root.add(mattress);
  world.box(-8.1, 0, -14.7, -6.5, 0.22, -12.5, { surf: SURF.FABRIC, blocksMove: false, blocksSight: false });
  place('wooden_bookshelf_worn', -4.1, -14.3, 1.35, { rz: 0, rx: -1.45, y: 0.29, blocksSight: false });
  place('trashbag', -3.2, -11.2, 0.3);
  place('boombox', -6.2, -15.2, 0.1, { solid: false });
  place('cardboard_box_01', -8.0, -11.3, 0.5);
  L.pickupSpots.push({ type: 'ammo', pos: V3(-7.4, 0.24, -13.2) });
  lights.add({ name: 'phone', pos: V3(-6.7, 0.1, -12.6), color: 0x8fb8ff, intensity: 1.5, distance: 3, zone: '1B', pattern: 'steady' });

  // =================================================================== APARTMENT 1C
  place('sofa_03', 0.6, -14.9, 0, { surf: SURF.FABRIC });
  place('modern_arm_chair_01', -1.8, -13.0, Math.PI / 2 + 0.3, { surf: SURF.FABRIC });
  place('side_table_01', 0.9, -13.2, 0.1, {});
  const tv = place('Television_01', 1.2, -11.1, Math.PI, { y: 0.55, surf: SURF.GLASS, s: 1.1 });
  place('side_table_01', 1.2, -11.1, Math.PI, { s: 1.0 });
  // TV static screen
  const tvMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 2.5 });
  const tvTex = makeStaticTexture();
  tvMat.emissiveMap = tvTex;
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), tvMat);
  tvScreen.position.set(1.2 + 0.0, 0.55 + 0.26, -11.1 - 0.235); tvScreen.rotation.y = Math.PI;
  root.add(tvScreen);
  L.animated.push((dt, t) => { if ((t * 20 | 0) !== tvTex.userData.f) { tvTex.userData.f = t * 20 | 0; tvTex.userData.draw(); } });
  lights.add({ name: 'tv', pos: V3(1.2, 0.9, -11.6), color: 0xa8c4ff, intensity: 14, distance: 7, zone: '1C', pattern: 'tv', emissive: tvMat, emissiveBase: 2.5, priority: 2 });
  const lamp = P.buildFloorLamp(m);
  lamp.position.set(-1.6, 0.14, -14.6); lamp.rotation.set(0, 0.4, Math.PI / 2 - 0.1); root.add(lamp);
  lights.add({ name: 'floorlamp', pos: V3(-1.1, 0.3, -14.4), color: 0xffb870, intensity: 18, distance: 6, zone: '1C', pattern: 'buzz' });
  const kitchen = P.buildKitchen(m, 2.8);
  kitchen.position.set(5.5, 0, -14.9); kitchen.rotation.y = -Math.PI / 2; root.add(kitchen);
  world.box(4.9, 0, -15.3, 5.5, 0.92, -11.7, { surf: SURF.WOOD, blocksSight: false });
  world.box(4.75, 0, -11.7, 5.5, 1.8, -10.9, { surf: SURF.METAL, blocksSight: true });
  place('vintage_microwave', 5.15, -13.2, -Math.PI / 2, { y: 0.9, s: 0.75, solid: false });
  const table = P.buildTable(m, 1.1, 0.8); add(table, 3.3, 0, -13.2, 0.25, { solid: true, surf: SURF.WOOD });
  place('painted_wooden_chair_01', 2.7, -13.4, Math.PI / 2 + 0.4);
  place('painted_wooden_chair_01', 3.6, -12.3, 2.1, { rx: Math.PI / 2 - 0.1, y: 0.22 });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), m.carpet);
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.8, 0.006, -13.1); rug.receiveShadow = true; root.add(rug);
  // bedroom
  const bed = P.buildBed(m); add(bed, -1.3, 0, -18.4, 0, { solid: true, surf: SURF.FABRIC });
  place('side_table_01', 0.2, -19.3, 0);
  L.pickupSpots.push({ type: 'med', pos: V3(5.1, 0.93, -12.2) });
  L.markers.victim = V3(0.4, 0, -13.0);
  L.markers.feeder = V3(0.9, 0, -12.6);
  L.markers.c1Enter = V3(1.05, 0, -11.4);

  // =================================================================== SERVICE / LAUNDRY / MAINTENANCE
  lights.add({ name: 'emergency', pos: V3(13.7, 2.7, -14), color: 0xff2a10, intensity: 35, distance: 9, zone: 'service', pattern: 'steady', priority: 1.5 });
  const emBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2010, emissiveIntensity: 12 }));
  emBox.position.set(14.65, 2.75, -14); root.add(emBox);
  fixture(13.0, -9.2, 'service', 'flicker', Math.PI / 2, 80);
  fixture(13.6, -18.4, 'service', 'dying', 0, 80);
  const exitR = P.buildExitSign(m); exitR.position.set(13.7, 2.4, -19.66); root.add(exitR);
  for (let i = 0; i < 4; i++) { const w = P.buildWasher(m, { dryer: i % 2 === 1 }); add(w, 9.55 + 0 * i, 0, -1.2 - i * 0.8, Math.PI / 2, { solid: true }); }
  for (let i = 0; i < 3; i++) { const w = P.buildWasher(m, { dryer: true }); add(w, 14.3, 0, -1.3 - i * 0.8, -Math.PI / 2, { solid: true }); }
  fixture(12, -4, 'laundry', 'flicker', 0, 90);
  place('plastic_crate_01', 11.5, -6.8, 0.8);
  place('barrel_03', 13.9, -6.9, 0, { surf: SURF.METAL });
  L.pickupSpots.push({ type: 'shells', pos: V3(11.5, 0.27, -6.8) });
  // maintenance room
  const boiler = P.buildBoiler(m); add(boiler, 6.3, 0, -18.8, 0, { solid: true });
  const bench = P.buildWorkbench(m); add(bench, 9.5, 0, -19.25, 0, { solid: true, surf: SURF.WOOD });
  const shelf = P.buildShelf(m); add(shelf, 11.9, 0, -15.8, Math.PI / 2, { solid: true });
  place('tool_cart', 7.6, -16.0, 0.5, { surf: SURF.METAL });
  place('metal_toolbox', 10.4, -19.2, 0.2, { y: 0.93, solid: false });
  place('old_tyre', 6.2, -15.6, 0, { rx: Math.PI / 2, y: 0.08 });
  L.pickupSpots.push({ type: 'shotgun', pos: V3(9.2, 0.95, -19.1) });
  L.pickupSpots.push({ type: 'shells', pos: V3(8.5, 0.95, -19.0) });
  // swinging bulb
  const bulbM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffd9a0, emissiveIntensity: 25 });
  const bulbPivot = new THREE.Group(); bulbPivot.position.set(8.8, 3.0, -17.2); root.add(bulbPivot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 4), m.plasticBlack); cord.position.y = -0.3; bulbPivot.add(cord);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), bulbM); bulb.position.y = -0.62; bulbPivot.add(bulb);
  const bulbSrc = lights.add({ name: 'bulb', pos: V3(8.8, 2.35, -17.2), color: 0xffcf90, intensity: 45, distance: 9, zone: 'maint', pattern: 'buzz', emissive: bulbM, emissiveBase: 25, priority: 1.5 });
  L.animated.push((dt, t) => {
    bulbPivot.rotation.z = Math.sin(t * 1.3) * 0.18; bulbPivot.rotation.x = Math.sin(t * 0.9 + 1) * 0.1;
    bulbPivot.updateMatrixWorld(); bulb.getWorldPosition(bulbSrc.pos);
  });

  // =================================================================== COURTYARD
  const d1 = P.buildDumpster(m); add(d1, -11.5, 0, -34.6, 0, { solid: true, blocksSight: false });
  const d2 = P.buildDumpster(m, { lidOpen: 1.2 }); add(d2, 9.6, 0, -21.2, 0, { solid: true, blocksSight: false });
  const pt = P.buildPicnicTable(m); add(pt, -4.5, 0, -27.5, 0.3, { solid: true, surf: SURF.WOOD });
  place('barrel_03', 12.8, -33.8, 0, { surf: SURF.METAL });
  place('barrel_03', 13.6, -33.1, 0.4, { surf: SURF.METAL });
  place('barrel_03', -13.9, -22.2, 0, { surf: SURF.METAL, rx: Math.PI / 2, y: 0.32 });
  place('old_tyre', -9.5, -33.8, 0, { rx: Math.PI / 2, y: 0.08 });
  place('old_tyre', -9.3, -33.7, 0.4, { rx: Math.PI / 2, y: 0.24 });
  place('trashbag', -12.9, -34.9, 0.4); place('trashbag', -10.2, -35.3, 1.4); place('trashbag', 8.3, -21.5, 0.2);
  place('plastic_crate_01', 3.2, -24.5, 0.7);
  place('painted_wooden_chair_01', -5.8, -26.4, 2.4);
  place('utility_box_01', 14.7, -26, -Math.PI / 2, { surf: SURF.METAL });
  const cl = P.buildClothesline(m, 7); cl.position.set(-10.5, 0, -25.5); root.add(cl);
  L.clothes = cl.children.filter(c => c.userData.sway !== undefined);
  world.box(-10.55, 0, -25.55, -10.45, 2.3, -25.45, {}); world.box(-3.55, 0, -25.55, -3.45, 2.3, -25.45, {});
  const fenceS = P.buildChainFence(m, 30, { height: 2.4, gaps: [[18.5, 22.5]] });
  fenceS.position.set(-15, 0, -36); root.add(fenceS);
  world.box(-15, 0, -36.05, 3.5, 2.4, -35.95, { surf: SURF.METAL, blocksShot: false, blocksSight: false });
  world.box(7.5, 0, -36.05, 15, 2.4, -35.95, { surf: SURF.METAL, blocksShot: false, blocksSight: false });
  // broken gate leaf lying open
  const gate = P.buildChainFence(m, 2, { height: 2.2 }); gate.position.set(3.5, 0, -36); gate.rotation.y = -1.9; root.add(gate);
  const sec = assets.model('security_light', { cast: false }); sec.position.set(13.7, 3.1, -20.02); sec.rotation.y = Math.PI; root.add(sec);
  lights.add({ name: 'security', pos: V3(13.7, 2.9, -20.6), color: 0xffe2b0, intensity: 380, distance: 20, zone: 'court', pattern: 'steady', priority: 2 });
  const wl = assets.model('industrial_wall_lamp', { cast: false }); wl.position.set(-6, 2.8, -20.02); wl.rotation.y = Math.PI; root.add(wl);
  lights.add({ name: 'courtLamp', pos: V3(-6, 2.7, -20.4), color: 0xffb46a, intensity: 60, distance: 11, zone: 'court', pattern: 'dying' });
  const al = P.buildStreetLight(m, { height: 6.5, arm: 1.5 }); al.position.set(-2, 0, -47.6); al.rotation.y = -Math.PI / 2; root.add(al);
  al.updateMatrixWorld(true);
  lights.add({ name: 'alley', pos: al.userData.lightPos.clone().applyMatrix4(al.matrixWorld), color: 0xffa04a, intensity: 900, distance: 22, zone: 'alley', pattern: 'steady' });
  const al2 = P.buildStreetLight(m, { height: 6.5, arm: 1.5 }); al2.position.set(28, 0, -47.6); al2.rotation.y = -Math.PI / 2; root.add(al2);
  al2.updateMatrixWorld(true);
  lights.add({ name: 'alley2', pos: al2.userData.lightPos.clone().applyMatrix4(al2.matrixWorld), color: 0xffa04a, intensity: 700, distance: 20, zone: 'alley', pattern: 'flicker' });
  L.pickupSpots.push({ type: 'ammo', pos: V3(12.4, 0, -21.2) });
  L.pickupSpots.push({ type: 'shells', pos: V3(11.9, 0, -21.5) });
  L.pickupSpots.push({ type: 'med', pos: V3(-4.5, 0.78, -27.5) });

  // =================================================================== TRIGGERS & SPAWNS
  const T = (name, x0, z0, x1, z1) => L.triggers.push({ name, x0, z0, x1, z1, fired: false });
  T('lotApproach', -16, 1.5, -4, 13);
  T('enterLobby', -5, -8, 5, -0.5);
  T('enterOffice', -9, -8, -5.2, -0.3);
  T('pass1B', -7.5, -10.4, -3.6, -8);
  T('reach1C', 0.2, -10.35, 1.9, -8.8);
  T('in1C', -2.5, -15.5, 5.5, -10.6);
  T('serviceEnter', 11.1, -10.4, 15, -8);
  T('laundryNear', 12.6, -10.4, 15, -8.05);
  T('maintEnter', 5.5, -19.7, 12.6, -15);
  T('rearDoor', 12.6, -19.7, 14.7, -17.8);
  T('court', -15, -36, 15, -20.2);

  L.spawns = {
    lotFeeder: V3(-12.3, 0, 6.0),
    lotCorpse: V3(-12.9, 0, 5.6),
    street1: V3(-26, 0, 21), street2: V3(24, 0, 23),
    office: V3(-8.2, 0, -7.2),
    b1: V3(-5.6, 0, -12.2),
    corridorW: V3(-14.0, 0, -9.2),
    lobbyA: V3(0.5, 0, -1.5), lobbyB: V3(-3, 0, -3), lobbyC: V3(3.5, 0, -6.5),
    laundry1: V3(11.6, 0, -3.5), laundry2: V3(12.8, 0, -5.8),
    maint: V3(10.6, 0, -16.3),
    alleyW: V3(-24, 0, -42), alleyE: V3(24, 0, -42), alleyC: V3(5.5, 0, -44), gate: V3(5.5, 0, -38.5),
    rearIn: V3(13.7, 0, -16),
  };
  L.playerStarts = {
    cp0: { pos: V3(1.7, 0, 10.6), yaw: 0.35 },
    cp1: { pos: V3(1.1, 0, -12.8), yaw: 0 },
    cp2: { pos: V3(12.6, 0, -23.4), yaw: 0.35 },
  };

  // sky dome
  root.add(buildSky());
  B.finish(root);
  for (const d of L.doors) d.group.userData.dynamic = true;
  car.userData.dynamic = true; bulbPivot.userData.dynamic = true; cl.userData.dynamic = true; tvScreen.userData.dynamic = true;
  canopy.userData.dynamic = true; strobe.userData.dynamic = true; emBox.userData.dynamic = true;
  // distant scenery does not need to cast flashlight shadows
  root.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  root.traverse(o => { if (o.isMesh) { o.getWorldPosition(wp); if (wp.z > 24 || wp.z < -44 || wp.x < -24 || wp.x > 24) o.castShadow = false; } });
  L.merged = mergeStatic(root, zoneAt);
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && !o.userData.dynamic) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
  // animated objects must keep auto updates
  bulbPivot.traverse(o => { o.matrixAutoUpdate = true; });
  for (const d of L.doors) d.group.traverse(o => { o.matrixAutoUpdate = true; });
  car.traverse(o => { o.matrixAutoUpdate = true; });
  cl.traverse(o => { o.matrixAutoUpdate = true; });
  return L;
}

function makeStaticTexture() {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 72;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.draw = () => {
    const d = img.data;
    const roll = Math.random() * 72 | 0;
    for (let y = 0; y < 72; y++) {
      const band = Math.abs(y - roll) < 4 ? 60 : 0;
      for (let x = 0; x < 96; x++) {
        const v = (Math.random() * 200 + band) | 0;
        const i = (y * 96 + x) * 4;
        d[i] = v * 0.85; d[i + 1] = v * 0.9; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    t.needsUpdate = true;
  };
  t.userData.draw();
  return t;
}

function buildSky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float y = max(vDir.y, 0.0);
        vec3 zen = vec3(0.004, 0.005, 0.008);
        vec3 hor = vec3(0.05, 0.028, 0.014);
        vec3 c = mix(hor, zen, pow(y, 0.45));
        vec2 uv = vDir.xz / max(vDir.y, 0.08) * 0.6 + vec2(uTime * 0.004, 0.0);
        float cl = n(uv) * 0.6 + n(uv * 2.3) * 0.3 + n(uv * 5.1) * 0.1;
        c += vec3(0.045, 0.028, 0.018) * smoothstep(0.35, 0.9, cl) * (1.0 - y * 0.6);
        gl_FragColor = vec4(c * 1.2, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.name = 'sky';
  sky.userData.dynamic = true;
  return sky;
}
