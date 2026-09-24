// Core gameplay runtime: owns the world and all actors, runs the simulation step.
import * as THREE from 'three';
import { World, NavGrid, SURF } from './world.js';
import { MaterialLib, shared as matShared } from './materials.js';
import { buildLevel } from './level.js';
import { zoneAt, zoneAtStrict, OUTDOOR, ZONE_LAYER } from './lights.js';
import { mergeStatic } from './builder.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { weaponMaterials } from './weaponModels.js';
import { FX } from './fx.js';
import { BodyTemplate, zombieVariant, officerVariant, Body, makeCharacterMaterial } from './humanoid.js';
import { Zombie } from './zombie.js';
import { KitTemplate, kitFromAssets } from './kitbody.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Game {
  constructor({ renderer, assets, settings, input, audio }) {
    this.renderer = renderer; this.assets = assets; this.settings = settings; this.input = input; this.audio = audio;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x06070a, 0.022);
    this.scene.environment = assets.env.hansaplatz || null;
    this.scene.environmentIntensity = 0.1;
    this.hemi = new THREE.HemisphereLight(0x1c2432, 0x0a0806, 0.035);
    this.scene.add(this.hemi);
    this.weaponMats = weaponMaterials();
    this.world = new World();
    this.M = new MaterialLib(assets).m;
    this.templates = [];
    this.zombies = [];
    this.actors = [];     // non-zombie characters (SWAT etc.)
    this.frame = 0;
    this.time = 0;
    this.noises = [];
    this.shadowCastDist = 12;   // m: bodies farther than this skip the flashlight shadow pass
    this.lodDist = 7;           // m: bodies farther than this draw the coarse mesh
    this.paused = false;
    this.story = null;
    this.hooks = {};
    this.pickups = [];
    this.interactTarget = null;
    this.grab = null;
    this.kills = 0;
    this.godMode = false;
  }

  // Heavy construction split in stages so the loader can report progress.
  async build(progress) {
    const q = { lightPool: this.settings.get('lightPool') };
    this.level = buildLevel({ assets: this.assets, M: this.M, world: this.world, scene: this.scene, quality: q });
    progress && progress(0.1, 'Reconstructing scene geometry');
    await tick();
    this.nav = new NavGrid(this.world, -32, -50, 32, 32, 0.5);
    this.nav.rebuild();
    this.nav.setDynamic(this.level.doors.map(d => d.solid));
    this.player = new Player(this);
    this.scene.add(this.player.camera);
    this.fx = new FX(this);
    this.weapons = new WeaponSystem(this);
    progress && progress(0.2, 'Calibrating optics');
    await tick();
    const kit = kitFromAssets(this.assets);
    if (kit) this.buildKitTemplates(kit);
    else await this.buildSdfTemplates(progress);
    progress && progress(0.82, 'Reconstructing subjects complete');
    await tick();
    // footsteps
    this.player.onStep = (k) => this.audio && this.audio.footstep(this.surfaceUnder(this.player.pos), k, this.player.outdoor);
    // lights used only by cutscenes exist from the start so shaders never recompile mid-game
    this.swatLights = [0, 1].map(() => { const l = new THREE.SpotLight(0xf4f8ff, 0, 40, 0.35, 0.5, 1.6); l.castShadow = false; this.scene.add(l, l.target); return l; });
    this.floodLight = new THREE.PointLight(0xdfe8ff, 0, 40, 2); this.scene.add(this.floodLight);
    this.setupPickups();
  }

  // Ashworth enemy kit (docs/enemies/README.md). Slots follow story.js `variant` numbers: the lot
  // feeder, the office, apartment 1B, the west corridor, the laundry, the attacker in 1C; the tactical
  // officer only joins the courtyard waves, which cycle through every slot.
  buildKitTemplates(kit) {
    const cast = [
      ['worker', {}],
      ['businessman', {}],
      ['grandmother', {}],
      ['crawler', {}],
      ['businesswoman', {}],
      ['businessman', { style: { clothTint: 0xa89480 } }],   // brown suit: the man in 1C
      ['tactical', {}],
    ];
    for (const [id, o] of cast) this.templates.push(new KitTemplate(kit, id, o));
    // the superintendent: the worker without the hardhat, freshly dead, navy work clothes
    this.victimTemplate = new KitTemplate(kit, 'worker', { drop: ['Gear / hardhat', 'Gear / helmet rim'], style: { decay: 0.3, clothTint: 0x8c9cb4, skinTint: 0xd8cbbd } });
    // Keston SWAT: the tactical kit, alive and in black
    this.swatTemplate = new KitTemplate(kit, 'tactical', { curl: 0.9, style: { decay: 0, dirt: 0.15, clothTint: 0x4a4e58, skinTint: 0xffffff } });
  }

  // Procedural SDF bodies (humanoid.js): the fallback when the enemy kit is unavailable or disabled.
  async buildSdfTemplates(progress) {
    const detail = this.settings.get('bodyDetail');
    const N = detail === 0 ? 4 : 6;
    for (let i = 0; i < N; i++) {
      this.templates.push(new BodyTemplate(this.assets, zombieVariant(i), detail));
      progress && progress(0.2 + 0.6 * (i + 1) / (N + 2), `Reconstructing subject ${i + 1}/${N + 2}`);
      await tick();
    }
    this.swatTemplate = new BodyTemplate(this.assets, officerVariant('swat'), detail);
    progress && progress(0.2 + 0.6 * (N + 1) / (N + 2), `Reconstructing subject ${N + 1}/${N + 2}`);
    await tick();
    const victim = zombieVariant(7);
    victim.zombie = 0.2; victim.top = 'tee'; victim.mat.decay = 0.3; victim.mat.skin = 0xa89484; victim.tears = null; victim.hair = 'short';
    this.victimTemplate = new BodyTemplate(this.assets, victim, detail);
  }

  addArmBlood() {
    const u = this.weapons.armMatL.userData.u.uBlood.value;
    u[0].set(0.0, 0.035, 0.42, 0.06); u[1].set(-0.02, -0.03, 0.45, 0.05); u[2].set(0.02, 0.0, 0.5, 0.05); u[3].set(0.0, 0.02, 0.38, 0.04); u[4].set(-0.03, 0.02, 0.33, 0.035);
  }

  resetLevelState() {
    for (const v of this.weapons.armMatL.userData.u.uBlood.value) v.set(0, 0, 0, 0);
    for (const d of this.level.doors) {
      d.open = d.target = d.init.open; d.locked = d.init.locked; d.burst = false;
      d.pivot.rotation.y = -d.open * d.maxAngle * d.swing; d.solid.enabled = d.open < 0.08;
    }
    for (const t of this.level.triggers) t.fired = false;
    for (const pk of this.pickups) if (!pk.taken) this.scene.remove(pk.obj);
    this.pickups.length = 0;
    this.setupPickups();
    this.clearZombies();
    this.fx.clear();
    this.grab = null; this.player.grabbedBy = null;
    this.noises.length = 0;
    this.extraInteract = [];
    for (const l of this.swatLights) l.intensity = 0;
    this.floodLight.intensity = 0;
    this.kills = 0;
  }

  spawnCorpse(pos, yaw, template, opts = {}) {
    const z = new Zombie(this, template || this.templates[0], { state: 'idle' });
    z.makeCorpse(pos, yaw, opts.sims ?? 150);
    z.keep = !!opts.keep;
    z.material.userData.u.uBloodAmt.value = 1;
    for (let i = 0; i < (opts.wounds ?? 3); i++) {
      const b = z.body.bones[[2, 1, 4, 13][i % 4]];
      const wp = new THREE.Vector3(); b.getWorldPosition(wp);
      wp.x += (Math.random() - 0.5) * 0.1; wp.z += (Math.random() - 0.5) * 0.1;
      z.body.addBlood(wp, [2, 1, 4, 13][i % 4], 0.06 + Math.random() * 0.04);
    }
    if (opts.pool !== false) {
      const bp = this.fx.makeBloodPool();
      if (bp) { z.ragdoll.centre(_v); bp.position.set(_v.x, 0.012, _v.z); bp.scale.setScalar(opts.pool ?? 1.2); }
    }
    this.zombies.push(z);
    return z;
  }

  surfaceUnder(p) {
    const z = zoneAt(p.x, p.z);
    if (z === 'street' || z === 'lot' || z === 'alley') return 'wet';
    if (z === 'court') return 'wet';
    if (z === '1B' || z === '1C') return 'wood';
    if (z === 'service' || z === 'maint' || z === 'laundry') return 'concrete';
    return 'tile';
  }

  // ------------------------------------------------------------------ zombies
  spawnZombie(pos, yaw = 0, opts = {}) {
    const tpl = opts.template || this.templates[(opts.variant ?? (Math.random() * this.templates.length | 0)) % this.templates.length];
    const z = new Zombie(this, tpl, opts);
    z.place(pos, yaw);
    this.zombies.push(z);
    this.limitCorpses();
    return z;
  }

  limitCorpses() {
    const max = this.settings.get('maxCorpses');
    const dead = this.zombies.filter(z => z.dead && !z.keep);
    while (dead.length > max) {
      // remove the corpse furthest from the player
      dead.sort((a, b) => b.ragdoll.p[0].distanceToSquared(this.player.pos) - a.ragdoll.p[0].distanceToSquared(this.player.pos));
      const z = dead.shift();
      z.dispose();
      this.zombies.splice(this.zombies.indexOf(z), 1);
    }
  }

  clearZombies() {
    for (const z of this.zombies) z.dispose();
    this.zombies.length = 0;
    for (const a of this.actors) a.dispose && a.dispose();
    this.actors.length = 0;
  }

  aliveCount() { let n = 0; for (const z of this.zombies) if (!z.dead) n++; return n; }

  // ------------------------------------------------------------------ combat
  shootRay(o, dir, def, muzzle) {
    const world = this.world;
    const wh = world.raycast(o, dir, def.range);
    const maxT = wh ? wh.t : def.range;
    let best = null, bz = null;
    for (const z of this.zombies) {
      if (!z.visible) continue;
      const h = z.raycast(o, dir, maxT, this.frame);
      if (h && (!best || h.t < best.t)) { best = h; bz = z; }
    }
    for (const a of this.actors) {
      if (!a.raycast) continue;
      const h = a.raycast(o, dir, maxT, this.frame);
      if (h && (!best || h.t < best.t)) { best = h; bz = a; }
    }
    if (best) {
      const point = o.clone().addScaledVector(dir, best.t);
      const dist = best.t;
      const falloff = def.pellets > 1 ? Math.max(0.35, 1 - Math.max(0, dist - 6) / 20) : 1;
      bz.hit({ point, dir: dir.clone(), damage: def.damage * falloff, cap: best.cap, weapon: def === WEAPONS.shotgun ? 'shotgun' : 'pistol', force: def.force / Math.sqrt(def.pellets) * (def.pellets > 1 ? 1.4 : 1), dist });
      this.audio && this.audio.play('flesh', { pos: point, vol: 0.9 });
      this.hooks.onHitMarker && this.hooks.onHitMarker(best.cap.zone === 'head');
      this.weapons.hits++;
      return { t: best.t, zombie: bz };
    }
    if (wh) {
      this.fx.impact(wh.point, wh.normal, wh.solid.surf, dir);
      this.audio && this.audio.impact(wh.solid.surf, wh.point);
      // doors & glass react
      return { t: wh.t };
    }
    return null;
  }

  onZombieHit(z, dist, grabChance = 0.35) {
    const p = this.player;
    if (!p.alive || this.grab) return;
    const canGrab = !this.noGrab && this.time - (this.lastGrabEnd || -10) > 6 && Math.random() < grabChance;
    if (canGrab) this.startGrab(z);
    else {
      p.damage(z.runner ? 14 : 18 + Math.random() * 8, z.pos);
      this.audio && this.audio.play('hitPlayer', { vol: 1 });
      this.hooks.onDamage && this.hooks.onDamage();
    }
  }

  startGrab(z) {
    const p = this.player;
    this.grab = { z, t: 0, progress: 0, limit: 2.6 };
    p.grabbedBy = z;
    z.state = 'grab'; z.grabT = 0;
    p.shake(0.08, 0.5);
    this.audio && this.audio.play('grab', { vol: 1 });
    this.audio && this.audio.zombieVoice(z, 'attack');
    this.hooks.onGrab && this.hooks.onGrab(true);
  }

  updateGrab(dt) {
    const gr = this.grab;
    if (!gr) return;
    const p = this.player;
    gr.t += dt;
    gr.progress = Math.max(0, gr.progress - dt * 0.22);
    if (this.input.pressed('mash') || this.input.pressed('fire')) { gr.progress += 0.14; p.shake(0.04, 0.15); this.audio && this.audio.play('struggle', { vol: 0.7 }); }
    // turn view toward the attacker
    const to = _v.subVectors(gr.z.pos, p.pos);
    const want = Math.atan2(-to.x, -to.z);
    let d = ((want - p.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    p.yaw += d * Math.min(1, dt * 6);
    p.pitch += (0.05 - p.pitch) * Math.min(1, dt * 4);
    this.hooks.onGrabProgress && this.hooks.onGrabProgress(gr.progress, 1 - gr.t / gr.limit);
    if (gr.progress >= 1 && gr.t >= (gr.minTime || 0)) this.releaseGrab(gr.z, true);
    else if (gr.progress >= 1) gr.progress = 0.99;
    else if (gr.t >= gr.limit) {
      // bitten
      p.damage(32, gr.z.pos);
      this.audio && this.audio.play('bite', { vol: 1 });
      this.hooks.onDamage && this.hooks.onDamage(true);
      this.releaseGrab(gr.z, false);
    }
  }

  releaseGrab(z, broke) {
    if (!this.grab) return;
    const p = this.player;
    this.grab = null;
    p.grabbedBy = null;
    this.lastGrabEnd = this.time;
    if (!z.dead) {
      z.state = 'chase';
      const away = _v.subVectors(z.pos, p.pos).setY(0).normalize();
      z.react.push.addScaledVector(away, broke ? 4.5 : 2.5);
      z.stagger = broke ? 1.4 : 0.6;
      z.attackCd = 1.5;
      z.react.impulse(1, -8, 0, 0);
    }
    if (broke) this.audio && this.audio.play('shove', { vol: 1 });
    this.hooks.onGrab && this.hooks.onGrab(false);
  }

  doShove() {
    const p = this.player;
    this.audio && this.audio.play('shoveWhoosh', { vol: 0.8 });
    for (const z of this.zombies) {
      if (z.dead) continue;
      _v.subVectors(z.pos, p.pos).setY(0);
      const d = _v.length();
      if (d > 1.7) continue;
      _v.normalize();
      const f = -Math.sin(p.yaw) * _v.x - Math.cos(p.yaw) * _v.z;
      if (f < 0.5) continue;
      z.react.push.addScaledVector(_v, 5);
      z.stagger = 1.1;
      z.react.impulse(1, -10, 0, 0); z.react.impulse(2, -6, 0, 0);
      if (z.state === 'attack') { z.state = 'chase'; z.attackCd = 1.2; }
      z.hp -= 5;
      z.wake();
      this.audio && this.audio.play('shove', { vol: 0.9, pos: z.pos });
    }
  }

  makeNoise(pos, radius) { this.noises.push({ pos: pos.clone(), radius, t: 0.3 }); }
  noiseLevelAt(pos) {
    let n = 0;
    for (const s of this.noises) { const d = s.pos.distanceTo(pos); if (d < s.radius) n = Math.max(n, 1 - d / s.radius + 0.5); }
    return n;
  }

  onZombieDeath(z, info) {
    this.kills++;
    this.hooks.onKill && this.hooks.onKill(z, info);
    this.limitCorpses();
    if (this.grab && this.grab.z === z) this.releaseGrab(z, true);
  }

  onPlayerDeath() {
    if (this.grab) this.releaseGrab(this.grab.z, false);
    this.hooks.onPlayerDeath && this.hooks.onPlayerDeath();
  }

  // ------------------------------------------------------------------ pickups & interaction
  setupPickups() {
    for (const s of this.level.pickupSpots) this.addPickup(s.type, s.pos);
  }

  addPickup(type, pos, opts = {}) {
    let obj, label, amount = 0;
    const A = this.assets;
    if (type === 'ammo') { obj = A.model('ammo_box', { cast: true }); obj.scale.setScalar(1.1); label = 'Take 9mm ammunition'; amount = 17; }
    else if (type === 'med') { obj = A.model('medical_box'); obj.scale.setScalar(0.8); label = 'Use first aid kit'; amount = 55; }
    else if (type === 'shells') { obj = new THREE.Group(); for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.065, 8), this.weaponMats.shellRed); s.rotation.z = Math.PI / 2; s.position.set(0, 0.011, (i - 2.5) * 0.024); obj.add(s); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 8), this.weaponMats.brass); b.rotation.z = Math.PI / 2; b.position.set(0.035, 0.011, (i - 2.5) * 0.024); obj.add(b); } label = 'Take 12-gauge shells'; amount = 6; }
    else if (type === 'shotgun') { obj = this.weapons.guns.shotgun.clone(true); obj.visible = true; obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.blending = THREE.NormalBlending; o.onBeforeRender = () => {}; o.onAfterRender = () => {}; o.renderOrder = 0; o.castShadow = true; o.visible = true; } }); obj.rotation.set(0, Math.PI / 2 + 0.2, Math.PI / 2); label = 'Take the M88 shotgun'; amount = 4; }
    else if (type === 'keys') { obj = new THREE.Group(); const r = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.003, 6, 16), this.M.chrome); r.rotation.x = Math.PI / 2; obj.add(r); for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.05), this.M.metalBrushed); k.position.set((i - 1) * 0.012, 0, 0.04); k.rotation.y = (i - 1) * 0.3; obj.add(k); } label = 'Take the keys'; }
    // multi-part pickups (GLTF parts, a row of shells) become one draw per material, on their zone's layer
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mergeStatic(obj, () => '');
    const layer = ZONE_LAYER[zoneAtStrict(pos.x, pos.z)] || 0;
    obj.traverse(o => { if (o.isMesh) o.layers.set(layer); });
    obj.position.copy(pos);
    if (opts.rotY !== undefined) obj.rotation.y = opts.rotY;
    this.scene.add(obj);
    const pk = { type, obj, pos: pos.clone(), label: opts.label || label, amount: opts.amount ?? amount, taken: false, onTake: opts.onTake };
    this.pickups.push(pk);
    return pk;
  }

  findInteractable() {
    const p = this.player;
    const o = p.camPos, d = p.aimDir;
    let best = null, bestScore = 0;
    const consider = (pos, maxD, obj) => {
      _v.subVectors(pos, o);
      const dist = _v.length();
      if (dist > maxD) return;
      const dot = _v.normalize().dot(d);
      const score = dot - dist * 0.05;
      if (dot > 0.8 && score > bestScore) { bestScore = score; best = obj; }
    };
    for (const pk of this.pickups) if (!pk.taken) consider(pk.pos, 2.1, { kind: 'pickup', pk, label: pk.label });
    for (const door of this.level.doors) {
      if (door.noInteract) continue;
      consider(door.center, 2.0, { kind: 'door', door, label: door.open > 0.5 ? 'Close door' : (door.locked ? 'Try door' : 'Open door') });
    }
    if (this.extraInteract) for (const e of this.extraInteract) if (e.active) consider(e.pos, e.dist || 2.2, { kind: 'custom', e, label: e.label });
    return best;
  }

  interact(t) {
    if (!t) return;
    if (t.kind === 'pickup') this.takePickup(t.pk);
    else if (t.kind === 'door') this.useDoor(t.door);
    else if (t.kind === 'custom') t.e.use();
  }

  takePickup(pk) {
    pk.taken = true;
    this.scene.remove(pk.obj);
    const w = this.weapons;
    if (pk.type === 'ammo') { w.give('ammo', pk.amount); this.hooks.notify && this.hooks.notify(`+${pk.amount} 9mm`); }
    else if (pk.type === 'shells') { w.give('shells', pk.amount); this.hooks.notify && this.hooks.notify(`+${pk.amount} 12GA shells`); }
    else if (pk.type === 'med') { this.player.heal(pk.amount); this.hooks.notify && this.hooks.notify('First aid applied'); }
    else if (pk.type === 'shotgun') { w.give('shotgun', pk.amount); w.ammo.shotgun = 6; this.hooks.notify && this.hooks.notify('M88 shotgun — press Q / 2 to switch'); }
    this.audio && this.audio.play(pk.type === 'med' ? 'medkit' : 'pickup', { vol: 0.9 });
    pk.onTake && pk.onTake(pk);
  }

  useDoor(door, force = false) {
    if (door.locked && !force) {
      this.audio && this.audio.play('locked', { vol: 0.9, pos: door.center });
      this.hooks.notify && this.hooks.notify(door.locked === 'jammed' ? 'The door is jammed.' : door.locked);
      return false;
    }
    door.target = door.target > 0.5 ? 0 : 1;
    this.audio && this.audio.play(door.kind === 'metal' ? 'doorMetal' : 'door', { vol: 0.9, pos: door.center });
    return true;
  }

  updateDoors(dt) {
    for (const d of this.level.doors) {
      if (Math.abs(d.open - d.target) > 1e-3) {
        const speed = d.burst ? 7 : 1.8;
        d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * speed);
        d.pivot.rotation.y = -d.open * d.maxAngle * d.swing;
        d.solid.enabled = d.open < 0.08;
        if (Math.abs(d.open - d.target) <= 1e-3) d.burst = false;
      }
    }
  }

  // ------------------------------------------------------------------ main step
  update(dt) {
    this.time += dt; this.frame++;
    matShared.uTime.value = this.time;
    const p = this.player, input = this.input;
    const control = !this.paused && !p.scripted;
    // noises age
    let nk = 0;
    for (const n of this.noises) { n.t -= dt; if (n.t > 0) this.noises[nk++] = n; }
    this.noises.length = nk;
    p.update(dt, input, this.settings.values);
    // story runs before weapons/viewmodel so scripted cameras and vehicles are in sync this frame
    this.story && this.story.update(dt);
    if (control && p.alive) {
      this.interactTarget = this.findInteractable();
      if (input.pressed('use') && !this.grab) this.interact(this.interactTarget);
    } else this.interactTarget = null;
    this.weapons.update(dt, input, control && p.alive && !this.grab);
    this.updateGrab(dt);
    // nav field toward the player
    if (this.frame % 12 === 0) this.nav.compute(p.pos.x, p.pos.z, 140);
    for (const z of this.zombies) z.update(dt, this.frame);
    for (const a of this.actors) a.update && a.update(dt, this.frame);
    this.updateDoors(dt);
    // animated level bits
    for (const f of this.level.animated) f(dt, this.time);
    for (const c of this.level.clothes) { c.rotation.x = Math.sin(this.time * 1.7 + c.userData.sway) * 0.15; c.rotation.y = Math.sin(this.time * 1.1 + c.userData.sway) * 0.1; }
    // lights
    this.level.lights.update(dt, this.time, p.camPos, p.zone);
    // viewmodel after the rig is final
    this.weapons.updateView(dt);
    const spot = this.weapons.spot, flash = this._flash || (this._flash = { pos: null, dir: new THREE.Vector3(), on: false });
    flash.pos = spot.position; flash.dir.subVectors(spot.target.position, spot.position).normalize(); flash.on = spot.intensity > 0;
    // brightest-looking pool lights for the particle shader (persistent array, no per-frame garbage)
    const pool = this._litPool || (this._litPool = []);
    pool.length = 0;
    for (const s of this.level.lights.pool) if (s.light.intensity > 0) pool.push(s.light);
    if (!this._poolCmp) { const cp = p.camPos; this._poolCmp = (a, b) => b.intensity / (1 + b.position.distanceToSquared(cp)) - a.intensity / (1 + a.position.distanceToSquared(cp)); }
    pool.sort(this._poolCmp);
    this.fx.update(dt, this.time, p.camera, flash, pool, p.outdoor || this.nearOutdoor());
    // per-body render budget: flashlight shadows and mesh LOD by distance to the lens
    const shD2 = this.shadowCastDist * this.shadowCastDist, lodD2 = this.lodDist * this.lodDist;
    for (const z of this.zombies) {
      const c = z.dead ? z.ragdoll.p[0] : z.pos;
      const d2 = (c.x - p.camPos.x) ** 2 + (c.z - p.camPos.z) ** 2;
      z.body.mesh.castShadow = d2 < shD2;
      z.body.setLod(d2 > lodD2 ? 1 : 0);
      if ((this.frame + z.id) % 8 === 0) z.body.setLayer(ZONE_LAYER[zoneAt(c.x, c.z)] || 0);
    }
    // eye shine: zombies facing a lit flashlight catch the light
    for (const z of this.zombies) {
      if (z.dead) continue;
      _v.subVectors(p.camPos, z.pos).setY(0);
      const d = _v.length();
      const facing = (_v.x * Math.sin(z.yaw) + _v.z * Math.cos(z.yaw)) / Math.max(d, 1e-3);
      const lit = this.weapons.spot.intensity > 0 ? Math.max(0, _v2.subVectors(z.pos, p.camPos).setY(0).normalize().dot(_v.set(p.aimDir.x, 0, p.aimDir.z).normalize())) : 0;
      z.body.eyeMat.emissiveIntensity = Math.max(0, facing) ** 3 * Math.pow(lit, 8) * 1.2 * Math.min(1, 6 / (d + 1));
    }
  }

  nearOutdoor() { const z = this.player.zone; return z === 'lobby' && this.player.pos.z > -2; }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
