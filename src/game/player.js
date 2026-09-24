// Player: movement with inertia, chest-mounted bodycam rig (step bob, sway, turn lag, recoil,
// shake), health/infection, and scripted camera takeover for cutscenes.
import * as THREE from 'three';
import { zoneAt, OUTDOOR } from './lights.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

class Spring {
  constructor(k = 120, z = 0.8) { this.x = 0; this.v = 0; this.k = k; this.z = z; this.target = 0; }
  update(dt) {
    const c = 2 * Math.sqrt(this.k) * this.z;
    const a = -this.k * (this.x - this.target) - c * this.v;
    this.v += a * dt; this.x += this.v * dt;
    return this.x;
  }
  kick(v) { this.v += v; }
}

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.03, 700);
    this.camera.rotation.order = 'YXZ';
    this.height = 1.42;
    this.radius = 0.3;
    this.health = 100; this.maxHealth = 100;
    this.alive = true;
    this.infection = 0;          // 0..1 cosmetic after the bite
    this.stamina = 1;
    this.flashlightOn = true;
    this.stepPhase = 0; this.stepAcc = 0;
    this.bob = 0;
    this.ads = 0;
    this.sprinting = false;
    this.moveAmt = 0;
    this.lagYaw = new Spring(260, 0.85); this.lagPitch = new Spring(260, 0.85);
    this.recoilP = new Spring(90, 0.55); this.recoilY = new Spring(90, 0.6); this.rollS = new Spring(60, 0.5);
    this.shakeAmp = 0; this.shakeT = 0;
    this.hurtT = 0; this.lastHurt = -10;
    this.controls = true;
    this.scripted = null;       // {pos, quat} override for cutscenes
    this.lookScale = 1;
    this.zone = 'lot';
    this.time = 0;
    this.aimQuat = new THREE.Quaternion();
    this.viewQuat = new THREE.Quaternion();
    this.camPos = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.prevYaw = 0;
    this.yawVel = 0;
    this.footSurface = 'asphalt';
    this.onStep = null;
    this.grabbedBy = null;
    this.heartbeat = 0;
    this.breath = 0;
  }

  // After a scripted camera hands control back, the player's feet can end up overlapping furniture.
  // Push out of solids; if the spot is still not walkable, walk the nav grid to the nearest free cell.
  unstick() {
    const g = this.game, w = g.world, nav = g.nav;
    for (let i = 0; i < 4; i++) w.collideCircle(this.pos, this.radius);
    const ci = nav.idx(this.pos.x, this.pos.z);
    if (ci < 0 || !nav.blocked[ci]) return;
    const seen = new Set([ci]), q = [ci];
    for (let h = 0; h < q.length && h < 4000; h++) {
      const c = q[h], cx = c % nav.w, cz = (c / nav.w) | 0;
      if (!nav.blocked[c]) { this.pos.x = nav.minx + (cx + 0.5) * nav.cell; this.pos.z = nav.minz + (cz + 0.5) * nav.cell; w.collideCircle(this.pos, this.radius); return; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= nav.w || nz >= nav.h) continue;
        const n = nz * nav.w + nx;
        if (!seen.has(n)) { seen.add(n); q.push(n); }
      }
    }
  }

  reset(p, yaw) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.health = this.maxHealth; this.alive = true; this.stamina = 1;
    this.lagYaw.x = this.lagYaw.v = 0; this.lagPitch.x = this.lagPitch.v = 0;
    this.recoilP.x = this.recoilP.v = 0; this.recoilY.x = this.recoilY.v = 0;
    this.shakeAmp = 0; this.grabbedBy = null; this.prevYaw = yaw;
  }

  kickRecoil(pitch, yaw) {
    this.recoilP.kick(pitch * 18); this.recoilY.kick(yaw * 18);
    this.pitch += pitch * 0.35; this.yaw += yaw * 0.3;
  }

  shake(amount, dur = 0.4) { this.shakeAmp = Math.max(this.shakeAmp, amount); this.shakeT = Math.max(this.shakeT, dur); }

  damage(amount, from) {
    if (!this.alive || this.game.godMode) return;
    this.health -= amount;
    this.lastHurt = this.time;
    this.hurtT = 1;
    this.shake(0.05 + amount * 0.002, 0.45);
    if (from) {
      _v.subVectors(from, this.pos).setY(0).normalize();
      const side = _v.x * Math.cos(this.yaw) - _v.z * Math.sin(this.yaw);
      this.rollS.kick(-side * 1.5);
      this.lagPitch.kick(-0.8);
    }
    if (this.health <= 0) { this.health = 0; this.alive = false; this.game.onPlayerDeath && this.game.onPlayerDeath(); }
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

  update(dt, input, settings) {
    this.time += dt;
    const g = this.game;
    // ---- look
    if (this.controls && this.alive && !this.scripted) {
      const l = input.consumeLook();
      const s = this.lookScale * (this.ads > 0.5 ? 0.7 : 1) * (this.grabbedBy ? 0.25 : 1);
      this.yaw -= l.dx * s;
      this.pitch -= l.dy * s;
      this.pitch = Math.max(-1.35, Math.min(1.3, this.pitch));
    } else input.consumeLook();

    // ---- movement
    const wantAds = this.controls && input.held.aim && this.alive && !this.grabbedBy;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    let mx = 0, my = 0;
    if (this.controls && this.alive && !this.scripted && !this.grabbedBy) { mx = input.move.x; my = input.move.y; }
    const mlen = Math.min(1, Math.hypot(mx, my));
    const wantSprint = (input.held.sprint || input.touchSprint) && my > 0.5 && this.ads < 0.3 && this.stamina > 0.05;
    this.sprinting = wantSprint && mlen > 0.5;
    let speed = 2.35;
    if (this.sprinting) speed = 4.7;
    if (my < -0.1) speed = Math.min(speed, 1.8);
    speed *= 1 - this.ads * 0.42;
    if (this.infection > 0.6) speed *= 0.9;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin yaw, 0, -cos yaw); right = (cos yaw, 0, -sin yaw)
    const wx = (-sy * my + cy * mx), wz = (-cy * my - sy * mx);
    const wl = Math.hypot(wx, wz) || 1;
    const tx = wx / wl * speed * mlen, tz = wz / wl * speed * mlen;
    const accel = mlen > 0.05 ? 8.5 : 11;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * accel);
    this.stamina = Math.max(0, Math.min(1, this.stamina + (this.sprinting ? -dt / 7 : dt / 9)));
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    g.world.collideCircle(this.pos, this.radius);
    // effective velocity after collision
    const evx = (this.pos.x - px) / Math.max(dt, 1e-4), evz = (this.pos.z - pz) / Math.max(dt, 1e-4);
    const hs = Math.hypot(evx, evz);
    this.moveAmt += (Math.min(1, hs / 2.3) - this.moveAmt) * Math.min(1, dt * 8);
    this.zone = zoneAt(this.pos.x, this.pos.z);

    // ---- footsteps / bob
    const stride = this.sprinting ? 1.15 : 0.78;
    const d = hs * dt;
    this.stepAcc += d;
    this.stepPhase += d / stride * Math.PI;
    if (this.stepAcc >= stride) { this.stepAcc -= stride; this.onStep && this.onStep(this.sprinting ? 1 : this.ads > 0.5 ? 0.4 : 0.7); }

    // ---- heartbeat / breathing drivers
    const lowHp = 1 - this.health / this.maxHealth;
    this.breath += dt * (1.3 + (1 - this.stamina) * 2.2 + lowHp * 1.2);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.4);
    if (this.alive && this.time - this.lastHurt > 7 && this.health < this.maxHealth) this.heal(dt * 6);

    this.updateRig(dt, settings);
  }

  updateRig(dt, settings) {
    const cam = this.camera;
    if (this.scripted) {
      cam.position.copy(this.scripted.pos);
      cam.quaternion.copy(this.scripted.quat);
      this.camPos.copy(cam.position);
      this.aimQuat.copy(this.scripted.aimQuat || cam.quaternion);
      this.viewQuat.copy(cam.quaternion);
      this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat);
      cam.updateMatrixWorld();
      return;
    }
    const hb = settings.headBob ?? 1;
    // turn lag: the chest camera trails the aim slightly
    this.yawVel = (this.yaw - this.prevYaw) / Math.max(dt, 1e-4);
    this.prevYaw = this.yaw;
    this.lagYaw.target = 0; this.lagPitch.target = 0;
    this.lagYaw.k = this.ads > 0.5 ? 900 : 300; this.lagPitch.k = this.lagYaw.k;
    this.lagYaw.kick(-this.yawVel * dt * 6 * (1 - this.ads * 0.8));
    const ly = this.lagYaw.update(dt), lp = this.lagPitch.update(dt);
    const rp = this.recoilP.update(dt), ry = this.recoilY.update(dt);
    const rollK = this.rollS.update(dt);
    // step bob
    const amp = this.moveAmt * hb * (this.sprinting ? 2.2 : 1) * (1 - this.ads * 0.6);
    const ph = this.stepPhase;
    const bobY = (Math.abs(Math.sin(ph)) - 0.6) * 0.022 * amp;
    const bobX = Math.sin(ph) * 0.014 * amp;
    const roll = Math.sin(ph) * 0.013 * amp - this.yawVel * 0.012 * hb * (1 - this.ads) + rollK * 0.05;
    const bobPitch = Math.abs(Math.cos(ph)) * 0.008 * amp;
    // breathing idle sway
    const br = Math.sin(this.breath) * (0.0035 + (1 - this.stamina) * 0.006) * hb;
    // shake
    let sx = 0, sy = 0, sr = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 3);
      sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; sr = (Math.random() - 0.5) * a * 0.6;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    const grabShake = this.grabbedBy ? 0.03 : 0;
    // aim orientation
    _e.set(this.pitch + rp * 0.4, this.yaw + ry * 0.4, 0, 'YXZ');
    this.aimQuat.setFromEuler(_e);
    this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat);
    // view orientation = aim + lag + bob + shake
    _e.set(this.pitch + lp + rp + bobPitch + br + sy + (Math.random() - 0.5) * grabShake, this.yaw + ly + ry + sx + (Math.random() - 0.5) * grabShake, roll + sr, 'YXZ');
    this.viewQuat.setFromEuler(_e);
    cam.quaternion.copy(this.viewQuat);
    // chest position: slightly in front of the body centre, follows torso pitch a little
    const fwd = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    cam.position.set(this.pos.x, this.height + bobY, this.pos.z).addScaledVector(fwd, 0.12 + Math.sin(this.pitch) * -0.03);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.addScaledVector(right, bobX);
    // lean the chest cam forward when aiming down, back when aiming up (torso bends)
    cam.position.y += Math.sin(this.pitch) * 0.05;
    this.camPos.copy(cam.position);
    cam.updateMatrixWorld();
  }

  // Aim ray (origin at the camera, direction = aim)
  aimRay(o, d) { o.copy(this.camPos); d.copy(this.aimDir); }

  get outdoor() { return OUTDOOR.has(this.zone); }
}
