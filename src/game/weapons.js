// Weapon handling: viewmodel (gun + IK arms), weapon-mounted light, firing/hitscan, recoil,
// procedural reload / pump / switch / shove animations, ammo.
import * as THREE from 'three';
import { buildPistol, buildShotgun, buildArm, makeArmMesh, solveArmIK, gripPose, weaponMaterials } from './weaponModels.js';
import { markViewmodel } from '../engine/renderer.js';
import { makeCharacterMaterial } from './humanoid.js';
import { SURF } from './world.js';

export const WEAPONS = {
  pistol: { name: 'P17 9mm', mag: 17, damage: 34, pellets: 1, spreadHip: 0.011, spreadAds: 0.0035, delay: 0.14, recoil: 0.032, force: 1.6, reload: 1.55, reloadEmpty: 1.9, auto: false, range: 80,
    hip: new THREE.Vector3(0.075, -0.2, -0.40), ads: new THREE.Vector3(0.0, -0.078, -0.42), sound: 'pistol' },
  shotgun: { name: 'M88 12GA', mag: 6, damage: 17, pellets: 9, spreadHip: 0.055, spreadAds: 0.042, delay: 0.95, recoil: 0.11, force: 2.6, reloadShell: 0.52, auto: false, range: 45,
    hip: new THREE.Vector3(0.1, -0.2, -0.2), ads: new THREE.Vector3(0.0, -0.07, -0.2), sound: 'shotgun' },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const bump = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin((t - a) / (b - a) * Math.PI);

function beamCookie() {
  // realistic LED reflector profile: hot centre, bright ring, soft corona, slight artefacts
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy);
    let v = Math.exp(-r * r * 22) * 1.0 + Math.exp(-Math.pow((r - 0.28) / 0.05, 2)) * 0.18 + Math.exp(-r * r * 3.2) * 0.3;
    v += 0.04 * Math.sin(r * 60) * Math.exp(-r * r * 4);
    v *= r < 0.98 ? 1 : 0;
    const i = (y * S + x) * 4;
    const k = Math.min(255, v * 255 * 1.1);
    img.data[i] = k; img.data[i + 1] = Math.min(255, k * 0.985); img.data[i + 2] = Math.min(255, k * 0.95); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.player = game.player;
    const scene = game.scene;
    this.root = new THREE.Group();   // world-space viewmodel root (aim frame)
    this.root.name = 'viewmodel';
    scene.add(this.root);
    this.guns = { pistol: buildPistol(), shotgun: buildShotgun() };
    this.gunPivot = new THREE.Group();
    this.root.add(this.gunPivot);
    for (const k in this.guns) { this.gunPivot.add(this.guns[k]); this.guns[k].visible = false; }
    // arms
    const detail = game.settings.get('bodyDetail') >= 1 ? 1 : 0;
    this.armMat = makeCharacterMaterial(game.assets, { skin: 0xb08a70, topTex: 'denim_fabric', top: 0x2b3444, topScale: 0.08, glove: 0x0d0d0e, decay: 0, dirt: 0.25, seed: 4 });
    this.armMat.userData.u.uBloodAmt.value = 1;
    this.armMatL = makeCharacterMaterial(game.assets, { skin: 0xb08a70, topTex: 'denim_fabric', top: 0x2b3444, topScale: 0.08, glove: 0x0d0d0e, decay: 0, dirt: 0.25, seed: 4 });
    this.arms = {
      R_pistol: buildArm(-1, 'pistol', detail), L_support: buildArm(1, 'support', detail),
      R_wrist: buildArm(-1, 'wrist', detail), L_pump: buildArm(1, 'pump', detail),
      L_grip: buildArm(1, 'pistol', detail),   // left fist for cutscenes (steering wheel)
    };
    this.armMeshes = {};
    this.armRoot = new THREE.Group();
    scene.add(this.armRoot);
    for (const k in this.arms) {
      const m = makeArmMesh(this.arms[k], k.startsWith('L') ? this.armMatL : this.armMat);
      m.visible = false;
      this.armRoot.add(m);
      this.armMeshes[k] = m;
    }
    markViewmodel(this.root, game.renderer.gl);
    markViewmodel(this.armRoot, game.renderer.gl);
    // weapon light
    const spot = new THREE.SpotLight(0xfff3e6, 1700, 30, 0.5, 0.45, 1.8);
    spot.map = beamCookie();
    spot.castShadow = game.settings.get('shadows') > 0;
    spot.shadow.mapSize.set(game.settings.get('shadowSize'), game.settings.get('shadowSize'));
    spot.shadow.camera.near = 0.15; spot.shadow.camera.far = 40;
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
    // The light reaches 30 m but its shadows only read up close: clamp the shadow frustum so distant
    // casters are culled from the shadow pass (three.js would otherwise use light.distance as far).
    this.shadowFar = 16;
    const baseUpdate = spot.shadow.updateMatrices.bind(spot.shadow), ws = this;
    spot.shadow.updateMatrices = function (light) {
      const d = light.distance; light.distance = ws.shadowFar;
      baseUpdate(light);
      light.distance = d;
    };
    scene.add(spot, spot.target);
    this.spot = spot;
    // state
    this.ammo = { pistol: 17, shotgun: 6 };
    this.reserve = { pistol: 34, shotgun: 0 };
    this.owned = { pistol: true, shotgun: false };
    this.chambered = { pistol: true, shotgun: true };
    this.current = 'pistol';
    this.state = 'idle'; this.stateT = 0;
    this.cool = 0;
    this.swayPos = new THREE.Vector3(); this.swayVel = new THREE.Vector3();
    this.swayRot = new THREE.Vector2(); this.swayRotVel = new THREE.Vector2();
    this.lastQuat = new THREE.Quaternion();
    this.kick = 0; this.kickVel = 0;
    this.slideT = 1; this.pumpT = 1;
    this.reloadStage = 0;
    this.visible = true;
    this.lowered = 0;       // 0 ready .. 1 lowered (cutscenes, sprint)
    this.forceLower = false;
    this.pendingSwitch = null;
    this.holdingMag = null;
    this.lightOn = true;
    this.shots = 0; this.hits = 0;
    this.frame = 0;
    this.equip('pistol', true);
  }

  get def() { return WEAPONS[this.current]; }
  get gun() { return this.guns[this.current]; }

  equip(name, instant = false) {
    for (const k in this.guns) this.guns[k].visible = k === name;
    this.current = name;
    for (const k in this.armMeshes) this.armMeshes[k].visible = false;
    if (name === 'pistol') { this.armMeshes.R_pistol.visible = true; this.armMeshes.L_support.visible = true; }
    else { this.armMeshes.R_wrist.visible = true; this.armMeshes.L_pump.visible = true; }
    if (!instant) { this.state = 'raise'; this.stateT = 0; this.game.audio && this.game.audio.play('holster', { vol: 0.5 }); }
    else { this.state = 'idle'; }
  }

  give(type, amount) {
    if (type === 'shotgun') {
      const first = !this.owned.shotgun;
      this.owned.shotgun = true;
      this.reserve.shotgun += amount;
      if (first) this.requestSwitch('shotgun');
    } else if (type === 'shells') this.reserve.shotgun += amount;
    else if (type === 'ammo') this.reserve.pistol += amount;
  }

  requestSwitch(name) {
    if (!this.owned[name] || name === this.current) return;
    if (this.state === 'lower' || this.state === 'raise') return;
    this.pendingSwitch = name;
    this.state = 'lower'; this.stateT = 0;
    this.game.audio && this.game.audio.play('holster', { vol: 0.4 });
  }

  toggleLight() {
    this.lightOn = !this.lightOn;
    this.game.audio && this.game.audio.play('click', { vol: 0.5 });
  }

  canAct() { return this.state === 'idle' || this.state === 'fire'; }

  update(dt, input, active) {
    this.frame++;
    this.sinceShot = (this.sinceShot ?? 10) + dt;
    const p = this.player, g = this.game;
    this.cool = Math.max(0, this.cool - dt);
    this.stateT += dt;
    const def = this.def;
    if (active && p.alive && !p.scripted) {
      if (input.pressed('light')) this.toggleLight();
      if (input.pressed('swap')) this.requestSwitch(this.current === 'pistol' ? 'shotgun' : 'pistol');
      if (input.pressed('weapon1')) this.requestSwitch('pistol');
      if (input.pressed('weapon2')) this.requestSwitch('shotgun');
      if (input.pressed('reload')) this.startReload();
      if (input.pressed('shove') && !p.grabbedBy && this.canAct()) { this.state = 'shove'; this.stateT = 0; g.onShove && g.onShove(); }
      if (input.pressed('fire')) {
        if (this.state === 'reload' && this.current === 'shotgun' && this.ammo.shotgun > 0) { this.state = 'idle'; this.stateT = 0; }
        else this.tryFire();
      } else if (input.held.fire && this.current === 'pistol' && this.sinceShot > 0.26) this.tryFire();
    }
    // state machine
    switch (this.state) {
      case 'fire': if (this.cool <= 0) this.state = 'idle'; break;
      case 'reload': this._reloadUpdate(dt); break;
      case 'pump': {
        if (this.stateT > 0.18 && !this._pumpEjected) { this._pumpEjected = true; this._eject('hull'); g.audio && g.audio.play('pumpBack', { vol: 0.7 }); }
        if (this.stateT > 0.36 && !this._pumpFwd) { this._pumpFwd = true; g.audio && g.audio.play('pumpFwd', { vol: 0.7 }); }
        if (this.stateT > 0.55) { this.state = 'idle'; this.chambered.shotgun = this.ammo.shotgun > 0; }
        break;
      }
      case 'lower': if (this.stateT > 0.32) { this.equip(this.pendingSwitch || this.current); this.pendingSwitch = null; } break;
      case 'raise': if (this.stateT > 0.35) this.state = 'idle'; break;
      case 'shove': {
        if (this.stateT > 0.14 && !this._shoveHit) { this._shoveHit = true; g.doShove && g.doShove(); }
        if (this.stateT > 0.5) { this.state = 'idle'; this._shoveHit = false; }
        break;
      }
    }
    this.kickVel += (-this.kick * 260 - this.kickVel * 22) * dt;
    this.kick += this.kickVel * dt;
    this.slideT = Math.min(1, this.slideT + dt / 0.09);
  }

  startReload() {
    const d = this.def, cur = this.current;
    if (this.state !== 'idle' && this.state !== 'fire') return;
    if (this.ammo[cur] >= d.mag || this.reserve[cur] <= 0) return;
    this.state = 'reload'; this.stateT = 0; this.reloadStage = 0;
    this.reloadEmpty = this.ammo[cur] === 0;
    this._magDropped = false; this._magIn = false; this._racked = false; this._shellIn = false;
    this.game.onReload && this.game.onReload();
  }

  _reloadUpdate(dt) {
    const g = this.game, cur = this.current, d = this.def, t = this.stateT;
    if (cur === 'pistol') {
      const total = this.reloadEmpty ? d.reloadEmpty : d.reload;
      if (t > 0.22 && !this._magDropped) {
        this._magDropped = true;
        g.audio && g.audio.play('magOut', { vol: 0.8 });
        // drop the old magazine into the world
        const mag = this.gun.userData.mag;
        mag.updateWorldMatrix(true, true);
        const clone = mag.clone(true);
        clone.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.blending = THREE.NormalBlending; o.onBeforeRender = () => {}; o.onAfterRender = () => {}; o.renderOrder = 0; o.castShadow = true; } });
        mag.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
        g.fx.dropMag(clone, _v.set(0, -0.5, 0).addScaledVector(this.player.aimDir, 0.3));
        mag.visible = false;
      }
      if (t > total * 0.55 && !this._magIn) {
        this._magIn = true; this.gun.userData.mag.visible = true;
        g.audio && g.audio.play('magIn', { vol: 0.9 });
        const need = d.mag - this.ammo[cur] + (this.reloadEmpty ? 0 : 0);
        const take = Math.min(need, this.reserve[cur]);
        this.ammo[cur] += take; this.reserve[cur] -= take;
      }
      if (this.reloadEmpty && t > total * 0.78 && !this._racked) { this._racked = true; this.slideT = 0; g.audio && g.audio.play('slide', { vol: 0.9 }); }
      if (t >= total) { this.state = 'idle'; this.chambered.pistol = true; }
    } else {
      // shotgun: shell by shell
      const per = d.reloadShell;
      const lead = 0.3;
      if (t < lead) return;
      const k = (t - lead) % per, n = Math.floor((t - lead) / per);
      if (n > this.reloadStage) {
        this.reloadStage = n;
        if (this.ammo.shotgun < d.mag && this.reserve.shotgun > 0) {
          this.ammo.shotgun++; this.reserve.shotgun--;
          g.audio && g.audio.play('shellIn', { vol: 0.8 });
        }
        if (this.ammo.shotgun >= d.mag || this.reserve.shotgun <= 0) {
          if (!this.chambered.shotgun) { this.state = 'pump'; this.stateT = 0; this._pumpEjected = true; this._pumpFwd = false; }
          else this.state = 'idle';
        }
      }
    }
  }

  tryFire() {
    const g = this.game, cur = this.current, d = this.def;
    if (this.state === 'reload' || this.state === 'lower' || this.state === 'raise' || this.state === 'shove' || this.state === 'pump') return;
    if (this.cool > 0 || p0Blocked(this)) return;
    if (this.ammo[cur] <= 0 || (cur === 'shotgun' && !this.chambered.shotgun)) {
      g.audio && g.audio.play('dry', { vol: 0.6 });
      this.cool = 0.25;
      if (this.reserve[cur] > 0) setTimeout(() => this.startReload(), 150);
      return;
    }
    this.ammo[cur]--;
    this.shots++;
    this.sinceShot = 0;
    this.cool = d.delay;
    this.state = 'fire';
    const p = this.player;
    // muzzle world pos
    const gun = this.gun;
    gun.updateWorldMatrix(true, false);
    const muzzle = _v.copy(gun.userData.muzzle).applyMatrix4(gun.matrixWorld);
    g.fx.muzzleFlash(muzzle.clone(), p.aimDir.clone(), cur === 'shotgun');
    g.audio && g.audio.gunshot(cur, p.zone);
    g.makeNoise && g.makeNoise(p.pos, cur === 'shotgun' ? 34 : 28);
    // hitscan
    const spread = THREE.MathUtils.lerp(d.spreadHip, d.spreadAds, p.ads) * (1 + p.moveAmt * 0.8) + (this.recentShots || 0) * 0.004;
    const o = new THREE.Vector3(), dir0 = new THREE.Vector3();
    p.aimRay(o, dir0);
    const pelletHits = [];
    for (let i = 0; i < d.pellets; i++) {
      const dir = dir0.clone();
      if (spread > 0) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir);
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      }
      pelletHits.push(g.shootRay(o, dir, d, muzzle));
    }
    this.recentShots = Math.min(4, (this.recentShots || 0) + 1);
    clearTimeout(this._rsT); this._rsT = setTimeout(() => { this.recentShots = 0; }, 350);
    // recoil
    const rk = d.recoil * (1 - p.ads * 0.35);
    p.kickRecoil(rk * (0.85 + Math.random() * 0.3), (Math.random() - 0.5) * rk * 0.5);
    p.shake(cur === 'shotgun' ? 0.035 : 0.012, 0.12);
    this.kickVel += cur === 'shotgun' ? 9 : 5;
    if (cur === 'pistol') { this.slideT = 0; this._eject('brass'); }
    else { this.chambered.shotgun = false; if (this.ammo.shotgun > 0 || true) { this.state = 'pump'; this.stateT = -0.12; this._pumpEjected = false; this._pumpFwd = false; this.chambered.shotgun = false; } }
    return pelletHits;
  }

  _eject(kind) {
    const gun = this.gun;
    gun.updateWorldMatrix(true, false);
    const port = _v2.copy(gun.userData.ejectPort).applyMatrix4(gun.matrixWorld);
    const q = gun.getWorldQuaternion(_q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const vel = right.multiplyScalar(1.8 + Math.random()).addScaledVector(up, 1.4 + Math.random()).addScaledVector(this.player.aimDir, -0.4);
    vel.x += this.player.vel.x; vel.z += this.player.vel.z;
    this.game.fx.ejectShell(port.clone(), vel, kind);
  }

  // ------------------------------------------------------------------ viewmodel pose
  updateView(dt) {
    const p = this.player, cam = p.camera;
    markViewmodel.normalDepth = !!this.customArms;
    if (this.customArms) {
      // cutscene: arms driven by explicit world targets, gun hidden (normal depth so they sit behind the wheel)
      for (const k in this.guns) this.guns[k].visible = false;
      this.spot.intensity = 0;
      const c = this.customArms(dt);
      for (const k in this.armMeshes) this.armMeshes[k].visible = false;
      if (c.R) { this.armMeshes.R_pistol.visible = true; solveArmIK(this.arms.R_pistol, null, c.R.shoulder, c.R.wrist, c.R.pole, c.R.quat); }
      if (c.L) { const k = c.L.arm || 'L_support'; this.armMeshes[k].visible = true; solveArmIK(this.arms[k], null, c.L.shoulder, c.L.wrist, c.L.pole, c.L.quat); }
      this.armRoot.updateMatrixWorld(true);
      this._customWas = true;
      return;
    }
    if (this._customWas) { this._customWas = false; this.equip(this.current, true); }
    const def = this.def, cur = this.current, t = this.stateT;
    // aim frame follows the aim orientation (leads the lagging chest camera)
    this.root.position.copy(p.camPos);
    this.root.quaternion.copy(p.aimQuat);
    // sway from rotation delta
    _q.copy(this.lastQuat).invert().multiply(p.aimQuat);
    _e.setFromQuaternion(_q, 'YXZ');
    this.lastQuat.copy(p.aimQuat);
    const k = 1 - p.ads * 0.75;
    this.swayRotVel.x += (-_e.y * 2.2 * k - this.swayRot.x * 90 - this.swayRotVel.x * 14) * dt * 1 + (-_e.y * 2.2 * k) * 0;
    this.swayRotVel.y += (-_e.x * 2.2 * k - this.swayRot.y * 90 - this.swayRotVel.y * 14) * dt;
    this.swayRot.x += this.swayRotVel.x * dt + (-_e.y * 0.9 * k);
    this.swayRot.y += this.swayRotVel.y * dt + (-_e.x * 0.9 * k);
    this.swayRot.x *= Math.max(0, 1 - dt * 10); this.swayRot.y *= Math.max(0, 1 - dt * 10);
    // walk bob (figure 8)
    const ph = p.stepPhase, mv = p.moveAmt * (1 - p.ads * 0.7) * (p.sprinting ? 1.8 : 1);
    const bobX = Math.sin(ph) * 0.012 * mv, bobY = -Math.abs(Math.cos(ph)) * 0.01 * mv;
    const breath = Math.sin(p.breath) * 0.0025 * (1 - p.ads * 0.6);
    // base offset
    const base = _v.copy(def.hip).lerp(def.ads, ease(p.ads));
    // lowered (sprint / scripted)
    const lowerTarget = (p.sprinting ? 0.7 : 0) + (this.forceLower ? 1 : 0) + (p.grabbedBy ? 0.6 : 0);
    this.lowered += (Math.min(1, lowerTarget) - this.lowered) * Math.min(1, dt * 7);
    let ox = base.x + bobX + this.swayRot.x * 0.05, oy = base.y + bobY + breath + this.swayRot.y * 0.05 - this.lowered * 0.12, oz = base.z + this.kick * 0.06;
    let rx = this.kick * 0.9 + this.lowered * 0.7 - this.swayRot.y * 0.6, ry = this.swayRot.x * 0.6 + this.lowered * 0.5, rz = -this.swayRot.x * 0.4 + Math.sin(ph) * 0.02 * mv;
    // state animations
    let magDown = 0, leftAway = 0;
    const leftOff = this._leftOff || (this._leftOff = new THREE.Vector3()); leftOff.set(0, 0, 0);
    if (this.state === 'lower') { const a = ease(t / 0.32); oy -= 0.25 * a; rx += 0.9 * a; }
    if (this.state === 'raise') { const a = 1 - ease(t / 0.35); oy -= 0.25 * a; rx += 0.9 * a; }
    if (this.state === 'shove') {
      const a = bump(t, 0, 0.5);
      oz -= 0.18 * a; ox -= 0.06 * a; ry += 0.9 * a; rz += 0.6 * a; oy += 0.03 * a;
    }
    if (this.state === 'reload') {
      if (cur === 'pistol') {
        const total = this.reloadEmpty ? def.reloadEmpty : def.reload;
        const u = t / total;
        const tilt = bump(u, 0.0, 1.0);
        rz += 0.55 * Math.min(1, tilt * 1.6); rx += 0.25 * tilt; oy += 0.02 * tilt; ox -= 0.03 * tilt;
        // left hand travels to the belt and back
        leftAway = bump(u, 0.12, 0.62);
        leftOff.set(-0.12 * leftAway, -0.25 * leftAway, 0.18 * leftAway);
        if (this.reloadEmpty && u > 0.72) { const r = bump(u, 0.72, 0.92); leftOff.set(0.0, 0.03 * r, 0.06 * r); }
      } else {
        const s = ((t - 0.3) % def.reloadShell) / def.reloadShell;
        const inReload = t > 0.3 ? 1 : ease(t / 0.3);
        rz -= 0.45 * inReload; rx += 0.15 * inReload; oy += 0.02 * inReload;
        leftAway = t > 0.3 ? bump(s, 0, 1) : 0;
        leftOff.set(0.02 * leftAway - 0.03 * inReload, -0.12 * leftAway - 0.05 * inReload, 0.2 * inReload + 0.02 * leftAway);
        this.gun.userData.shell.visible = t > 0.3 && s < 0.7;
      }
    } else if (cur === 'shotgun') this.gun.userData.shell.visible = false;
    // pistol slide
    if (cur === 'pistol') {
      const slideBack = this.ammo.pistol === 0 && this.state !== 'reload' ? 1 : bump(this.slideT, 0, 1);
      this.gun.userData.slide.position.z = 0.028 * slideBack;
    } else {
      // pump travel
      let pt = 0;
      if (this.state === 'pump') pt = this.stateT < 0 ? 0 : bump(Math.min(1, this.stateT / 0.5), 0, 1);
      this.gun.userData.pump.position.z = -0.28 + 0.085 * pt;
      leftOff.z += 0.085 * pt;
    }
    this.gunPivot.position.set(ox, oy, oz);
    this.gunPivot.rotation.set(rx, ry, rz, 'YXZ');
    this.root.updateMatrixWorld(true);
    // weapon light
    const gun = this.gun;
    const lp = _v.copy(gun.userData.lightPos).applyMatrix4(gun.matrixWorld);
    const lq = gun.getWorldQuaternion(_q);
    this.spot.position.copy(lp);
    this.spot.target.position.copy(lp).add(_v2.set(0, 0, -6).applyQuaternion(lq));
    this.spot.target.updateMatrixWorld();
    const on = this.lightOn && this.visible;
    this.spot.intensity = on ? 1700 : 0;
    gun.userData.lens.emissiveIntensity = on ? 30 : 0;
    // arms IK
    this._arms(leftOff, leftAway);
  }

  _arms(leftOff, leftAway) {
    const p = this.player, gun = this.gun, ud = gun.userData, A = _arm;
    const yawQ = _q2.setFromEuler(_e.set(p.pitch * 0.35, p.yaw, 0, 'YXZ'));
    const body = (out, x, y, z) => out.set(x, y, z).applyQuaternion(yawQ).add(p.camPos);
    const gq = gun.getWorldQuaternion(A.gq);
    const lo = A.lo.copy(leftOff).applyQuaternion(p.aimQuat);
    if (this.current === 'pistol') {
      // shoulders relative to the chest camera; they drop as the arms extend to aim so the forearms rise
      // into frame from below instead of sweeping past the lens
      const k = ease(p.ads), sx = 0.2 - 0.01 * k, sy = -0.08 - 0.18 * k, sz = 0.12 - 0.07 * k;
      body(A.shR, sx, sy, sz); body(A.shL, -sx, sy, sz);   // camera +x is the officer's right
      // right fist wraps the grip: bar = the grip's own axis (tilted back 0.32 rad), approached from
      // behind-right so the palm sits on the backstrap and the fingers close over the front strap
      const axis = A.axis.copy(PISTOL_GRIP_AXIS).applyQuaternion(gq);
      A.bar.copy(PISTOL_GRIP_POINT).applyMatrix4(gun.matrixWorld);
      gripPose('pistol', -1, A.bar, axis, A.app.set(-0.42, 0, -1).applyQuaternion(gq), A.wR, A.hqR);
      solveArmIK(this.arms.R_pistol, null, A.shR, A.wR, body(A.pole, 0.5, -0.65, 0.15), A.hqR);
      // support fist wraps the gun hand's fingers from the front-left (thumbs forward)
      A.bar.copy(PISTOL_SUPPORT_POINT).applyMatrix4(gun.matrixWorld);
      gripPose('support', 1, A.bar, axis, A.app.set(0.62, 0, -1).applyQuaternion(gq), A.wL, A.hqL);
      if (leftAway > 0.3) A.hqL.copy(p.aimQuat).multiply(FLIP_Y);   // reload: hand leaves the gun
      A.wL.add(lo);
      solveArmIK(this.arms.L_support, null, A.shL, A.wL, body(A.pole, -0.5, -0.65, 0.15), A.hqL);
    } else {
      // bladed stance: support shoulder forward so the left hand reaches the pump, stock in the
      // firing-side shoulder pocket
      body(A.shR, 0.2, -0.07, 0.16); body(A.shL, -0.17, -0.1, -0.02);
      // right fist around the stock's wrist: index toward the trigger, pinky down the comb
      const axis = A.axis.copy(STOCK_WRIST_AXIS).applyQuaternion(gq);
      A.bar.copy(STOCK_WRIST_POINT).applyMatrix4(gun.matrixWorld);
      gripPose('wrist', -1, A.bar, axis, A.app.set(-1, 0.15, 0.25).applyQuaternion(gq), A.wR, A.hqR);
      solveArmIK(this.arms.R_wrist, null, A.shR, A.wR, body(A.pole, 0.55, -0.7, 0.2), A.hqR);
      const hqL = A.hqL.copy(gq).multiply(FLIP_Y);
      A.wL.set(0.0, -0.035, ud.pump.position.z + 0.075).applyMatrix4(gun.matrixWorld).add(lo);
      solveArmIK(this.arms.L_pump, null, A.shL, A.wL, body(A.pole, -0.55, -0.75, 0.2), hqL);
    }
    this.armRoot.updateMatrixWorld(true);
  }

  setVisible(v) {
    this.visible = v;
    this.root.visible = v; this.armRoot.visible = v;
  }
}
const UP = new THREE.Vector3(0, 1, 0);
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const _arm = {
  gq: new THREE.Quaternion(), hqR: new THREE.Quaternion(), hqL: new THREE.Quaternion(),
  shR: new THREE.Vector3(), shL: new THREE.Vector3(), wR: new THREE.Vector3(), wL: new THREE.Vector3(),
  pole: new THREE.Vector3(), lo: new THREE.Vector3(), axis: new THREE.Vector3(), bar: new THREE.Vector3(), app: new THREE.Vector3(),
};
// pistol grip in gun space (buildPistol: grip centred at (0, -0.048, 0.012), rotated -0.32 rad about X)
const PISTOL_GRIP_AXIS = new THREE.Vector3(0, Math.cos(0.32), -Math.sin(0.32));
const PISTOL_GRIP_POINT = new THREE.Vector3(0, -0.06, 0.016);        // middle of the four fingers
// shotgun stock wrist (buildShotgun: extruded stock profile, narrowest behind the trigger group)
const STOCK_WRIST_AXIS = new THREE.Vector3(0, 0.55, -0.83).normalize();
const STOCK_WRIST_POINT = new THREE.Vector3(0, -0.018, 0.075);
const PISTOL_SUPPORT_POINT = new THREE.Vector3(0.004, -0.066, 0.002); // over the gun hand's fingers
function p0Blocked(ws) { const p = ws.player; return !!p.grabbedBy || !p.alive; }
