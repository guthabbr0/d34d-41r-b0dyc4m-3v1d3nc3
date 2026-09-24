// Story director: checkpoints, objectives, triggers, scripted beats and in-engine cutscenes.
// Beats are async functions that await game-time waits, so pausing freezes them.
import * as THREE from 'three';
import { BI } from './humanoid.js';
import { Pose, applyPose, poseFeed, poseIdle, poseShamble, poseRise } from './anim.js';
import { Body, makeCharacterMaterial } from './humanoid.js';
import { buildVan } from './props.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ease = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const lookQuat = (from, to, roll = 0) => {
  _m.lookAt(from, to, _v2.set(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(_m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll));
  return q;
};

class Skip extends Error {}

// Cinematic "chest camera": eased moves + handheld noise, optionally parented to a moving object.
class CineCam {
  constructor() { this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.parent = null; this.tw = null; this.noise = 0.6; this.t = 0; this.aimQuat = null; this.out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), aimQuat: new THREE.Quaternion() }; }
  set(pos, quat) { this.pos.copy(pos); this.quat.copy(quat); this.tw = null; }
  to(pos, quat, dur, easeFn = ease) {
    return new Promise(res => { this.tw = { p0: this.pos.clone(), q0: this.quat.clone(), p1: pos ? pos.clone() : this.pos.clone(), q1: quat ? quat.clone() : this.quat.clone(), t: 0, dur, ease: easeFn, res }; });
  }
  update(dt) {
    this.t += dt;
    if (this.tw) {
      const w = this.tw; w.t += dt;
      const k = w.ease(Math.min(1, w.t / w.dur));
      this.pos.lerpVectors(w.p0, w.p1, k);
      this.quat.slerpQuaternions(w.q0, w.q1, k);
      if (w.t >= w.dur) { this.tw = null; w.res(); }
    }
    const t = this.t, n = this.noise;
    const hand = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.sin(t * 1.3) * 0.006 + Math.sin(t * 3.7) * 0.002) * n, (Math.sin(t * 0.9 + 1) * 0.008 + Math.sin(t * 2.9) * 0.002) * n, Math.sin(t * 0.7) * 0.01 * n, 'YXZ'));
    const o = this.out;
    if (this.parent) {
      this.parent.updateMatrixWorld();
      o.pos.copy(this.pos).applyMatrix4(this.parent.matrixWorld);
      this.parent.getWorldQuaternion(_q);
      o.quat.copy(_q).multiply(this.quat).multiply(hand);
    } else { o.pos.copy(this.pos); o.quat.copy(this.quat).multiply(hand); }
    o.aimQuat.copy(this.aimQuat || o.quat);
    return o;
  }
}

export class Story {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.ui = app.ui;
    this.voice = app.voice;
    this.audio = app.audio;
    this.waits = [];
    this.cam = new CineCam();
    this.cutscene = false;
    this.skipping = false;
    this.canSkip = false;
    this.flags = {};
    this.run = 0;
    this.clock = 0;          // footage clock seconds since 03:13:41
    this.checkpoint = 'intro';
    this.emitters = [];
    this.infectionTarget = 0;
    this.objective = '';
    this.game.story = this;
    this.game.hooks.onPlayerDeath = () => this.onDeath();
    this.game.hooks.onKill = (z) => this.onKill(z);
  }

  // ---------------------------------------------------------------- coroutine plumbing
  wait(sec) {
    const run = this.run;
    if (this.skipping && this.canSkip) return Promise.reject(new Skip());
    return new Promise((res, rej) => this.waits.push({ t: sec, res, rej, run, until: null }));
  }
  waitUntil(fn) { const run = this.run; return new Promise((res, rej) => this.waits.push({ t: Infinity, res, rej, run, until: fn })); }
  async say(kind, text, pad = 0.15) {
    if (this.skipping && this.canSkip) throw new Skip();
    const run = this.run;
    await Promise.race([this.voice.say(kind, text), this.waitUntil(() => this.skipping && this.canSkip)]);
    if (run !== this.run) throw new Skip();
    if (this.skipping && this.canSkip) { this.voice.cancel(); throw new Skip(); }
    await this.wait(pad);
  }
  cancelAll() {
    this.run++;
    this.camFollow = null;
    for (const w of this.waits) w.rej(new Skip());
    this.waits.length = 0;
    this.voice.cancel();
  }

  update(dt) {
    this.clock += dt;
    // waits
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      if (w.run !== this.run) { this.waits.splice(i, 1); w.rej(new Skip()); continue; }
      if (w.until) { if (w.until()) { this.waits.splice(i, 1); w.res(); } continue; }
      w.t -= dt;
      if (w.t <= 0 || (this.skipping && this.canSkip)) { this.waits.splice(i, 1); if (this.skipping && this.canSkip) w.rej(new Skip()); else w.res(); }
    }
    const g = this.game, p = g.player;
    if (this.tick) this.tick(dt);
    if (this.cutscene) {
      if (this.camFollow) this.camFollow(dt);
      const o = this.cam.update(dt);
      p.scripted = o;
      if (!this.cam.parent) p.pos.set(o.pos.x, 0, o.pos.z);
      p.updateRig(0, g.settings.values);
    }
    // triggers
    if (!this.cutscene && p.alive) {
      for (const t of g.level.triggers) {
        const inside = p.pos.x >= t.x0 && p.pos.x <= t.x1 && p.pos.z >= t.z0 && p.pos.z <= t.z1;
        if (inside && !t.fired) { t.fired = true; this.onTrigger(t.name); }
      }
    }
    // infection ramps toward target
    p.infection += (this.infectionTarget - p.infection) * Math.min(1, dt * 0.3);
  }

  setObjective(text) { this.objective = text; this.ui.setObjective(text); }

  // ---------------------------------------------------------------- checkpoints
  async start(point) {
    this.cancelAll();
    const run = this.run;
    const g = this.game, p = g.player, w = g.weapons, L = g.level;
    this.checkpoint = point;
    this.flags = {};
    this.tick = null;
    this.cutscene = false;
    p.scripted = null;
    w.customArms = null; w.forceLower = false;
    w.setVisible(true);
    g.noGrab = false;
    g.resetLevelState();
    this.stopEmitters();
    this.app.setMarker(point);
    // car back to its parking spot
    L.car.position.set(4.2, 0, 8.6); L.car.rotation.set(0, Math.PI / 2 + 0.12, 0);
    L.headlight.intensity = 900;
    if (L.signal) { L.signal.red.emissiveIntensity = 14; L.signal.green.emissiveIntensity = 0; L.signal.src.color.set(0xff2010); }
    g.fx.rainOn = true;
    this.infectionTarget = 0; p.infection = 0;
    p.health = p.maxHealth; p.alive = true;
    w.ammo.pistol = 17; w.reserve.pistol = 34; w.owned.shotgun = false; w.ammo.shotgun = 6; w.reserve.shotgun = 0; w.current = 'pistol'; w.equip('pistol', true); w.lightOn = true;
    this.populateCommon(point);
    if (point === 'intro') { this.clock = 0; await this.safe(() => this.intro(), run); if (run !== this.run) return; this.beginLot(); }
    else if (point === 'cp0') { this.clock = 40; this.beginLot(); }
    else if (point === 'cp1') { this.clock = 60 * 9; this.beginCP1(); }
    else if (point === 'cp2') { this.clock = 60 * 17; this.beginCP2(); }
  }

  async safe(fn, run) {
    try { await fn(); } catch (e) { if (!(e instanceof Skip)) console.error(e); }
    this.skipping = false;
  }

  populateCommon(point) {
    const g = this.game, L = g.level, S = L.spawns, T = g.templates;
    // emitters: fire alarm in the lobby, TV static in 1C
    this.emitters.push(g.audio && g.audio.emitter('fireAlarm', V3(4.6, 2.3, -2.2), 0.55, { ref: 3, rolloff: 1.2 }));
    this.emitters.push(g.audio && g.audio.emitter('breath0', V3(1.2, 0.9, -11.4), 0.2, { ref: 1.2, rolloff: 2 }));
    this.setDressing();
    // bodies that are always there
    g.spawnCorpse(L.markers.lobbyCorpse, 1.2, T[3 % T.length], { keep: true, wounds: 4, pool: 1.4 });
    if (point === 'intro' || point === 'cp0') {
      g.spawnCorpse(S.lotCorpse, 2.4, T[4 % T.length], { keep: true, wounds: 4, pool: 1.3 });
    }
  }

  // Blood trail, drag marks, handprints and debris that tell what happened before the officer arrived.
  setDressing() {
    const g = this.game, L = g.level, fx = g.fx;
    const up = V3(0, 1, 0);
    const trail = L.markers.bloodTrail;
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], b = trail[i + 1];
      const d = b.clone().sub(a); const len = d.length();
      const rot = Math.atan2(d.x, -d.z) + Math.PI;
      for (let t = 0; t < len; t += 0.55) {
        const p = a.clone().addScaledVector(d, t / len).add(V3((Math.random() - 0.5) * 0.12, 0.004, (Math.random() - 0.5) * 0.12));
        fx.bloodDecal(p, up, 10 + (Math.random() * 2 | 0), 0.45 + Math.random() * 0.2, rot + (Math.random() - 0.5) * 0.3);
        if (Math.random() < 0.35) fx.bloodDecal(p.clone().add(V3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), up, 4 + (Math.random() * 4 | 0), 0.06 + Math.random() * 0.08);
      }
    }
    // handprints and smears beside the 1C door, spatter in the lot
    const wallN = V3(0, 0, 1);
    for (const [x, y] of [[0.35, 1.25], [0.2, 0.95], [1.75, 1.4]]) fx.bloodDecal(V3(x, y, -10.32), wallN, 4 + (Math.random() * 4 | 0), 0.22, Math.random() * 6);
    fx.bloodDecal(V3(0.3, 1.1, -10.32), wallN, 8, 0.5, Math.PI);
    fx.bloodDecal(V3(-4.93, 1.2, -4.4), V3(1, 0, 0), 9, 0.6, Math.PI);
    fx.bloodDecal(V3(-12.6, 0.005, 5.7), up, 14, 1.3, 0.4);
    for (let i = 0; i < 8; i++) fx.bloodDecal(V3(-12.6 + (Math.random() - 0.5) * 2.5, 0.005, 5.7 + (Math.random() - 0.5) * 2.5), up, 4 + (Math.random() * 4 | 0), 0.1 + Math.random() * 0.2);
    fx.bloodDecal(V3(-14.18, 1.0, 8.2), V3(1, 0, 0), 5, 0.5, 0);
    // bloody footprints leading out of 1C
    for (let i = 0; i < 7; i++) fx.bloodDecal(V3(1.0 + (i % 2) * 0.18, 0.004, -10.8 + i * 0.62), up, 12, 0.13, Math.PI);
    // shattered entrance glass
    for (let i = 0; i < 26; i++) fx.bloodDecal(V3(0.65 + (Math.random() - 0.5) * 1.6, 0.004, 0.3 + (Math.random() - 0.5) * 1.4), up, 15, 0.05 + Math.random() * 0.12, Math.random() * 6);
    // 1C: spatter around the victim
    for (let i = 0; i < 10; i++) fx.bloodDecal(V3(0.4 + (Math.random() - 0.5) * 2, 0.008, -13 + (Math.random() - 0.5) * 2), up, 4 + (Math.random() * 4 | 0), 0.12 + Math.random() * 0.25);
    fx.bloodDecal(V3(-0.2, 1.3, -15.42), wallN, 6, 0.8, 0);
    fx.bloodDecal(V3(-0.2, 1.2, -15.42), wallN, 9, 0.7, Math.PI);
  }

  stopEmitters() { for (const e of this.emitters) this.audio && this.audio.stop(e, 0.2); this.emitters.length = 0; }

  // ---------------------------------------------------------------- INTRO (drive + arrival)
  async intro() {
    const g = this.game, p = g.player, w = g.weapons, L = g.level, car = L.car, ui = this.ui, A = this.audio;
    this.cutscene = true; this.canSkip = true;
    g.noGrab = true;
    const lotFeeder = this.spawnLotFeeder();
    // drive path (car local +X is forward)
    const pts = [V3(150, 0, 18.8), V3(60, 0, 18.8), V3(22, 0, 18.7), V3(13.5, 0, 17.4), V3(10.2, 0, 14.2), V3(7.6, 0, 11.2), V3(4.9, 0, 9.3), V3(4.2, 0, 8.6)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    let s = 0, speed = 13;
    car.position.copy(pts[0]); car.rotation.set(0, Math.PI, 0);
    w.setVisible(true);
    this.cam.parent = car;
    this.cam.noise = 0.35;
    const seat = V3(-0.22, 1.13, -0.42);
    this.cam.set(seat, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, -Math.PI / 2, 0, 'YXZ')));
    // hands at ten and two on the wheel
    const wheel = car.userData.steering;
    // (persistent targets: this runs every frame of the drive, so nothing is allocated in it)
    const carQ = new THREE.Quaternion(), _tmp = new THREE.Vector3();
    const gripQ = [1, -1].map(side => new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.5, Math.PI / 2, -0.6, 'YXZ')));
    const arm = () => ({ shoulder: new THREE.Vector3(), wrist: new THREE.Vector3(), pole: new THREE.Vector3(), quat: new THREE.Quaternion() });
    const targets = { R: arm(), L: arm() }, both = [targets.R, targets.L];
    w.customArms = () => {
      car.updateMatrixWorld();
      car.getWorldQuaternion(carQ);
      for (let i = 0; i < 2; i++) {
        const t = both[i], side = i === 0 ? 1 : -1;
        t.shoulder.set(-0.34, 1.1, -0.42 + side * 0.3).applyMatrix4(car.matrixWorld);
        t.wrist.set(0, 0.1, side * 0.16).applyMatrix4(wheel.matrixWorld).add(_tmp.set(-0.07, -0.02, side * 0.03).applyQuaternion(carQ));
        t.pole.set(-0.1, 0.5, side > 0 ? 0.5 : -1.4).applyMatrix4(car.matrixWorld);
        t.quat.copy(carQ).multiply(gripQ[i]);
      }
      return targets;
    };
    L.headlight.intensity = 1100;
    ui.showHud(false);
    ui.showOverlay(false);
    // wipers + windshield rain
    const ws = car.userData.windshield;
    let wiperT = 0;
    // --- evidence card ---
    ui.blackout(true);
    await this.wait(0.6);
    const debugFast = /[?&]fastcard=1/.test(location.search);
    if (!debugFast) await Promise.race([ui.card([
      '*EVIDENCE ITEM 14-B*',
      'BODY-WORN CAMERA · VANTA BW-4 · SN X81A0924',
      'OFFICER R. HALLORAN #4471 · KESTON CITY PD · 21-ADAM-14',
      '',
      'RECORDED   2026-09-24 03:13:41 -0500',
      'RECOVERED  2026-09-24 06:52 · 2250 WEXLEY AVE (REAR)',
      '',
      'PRE-EVENT BUFFER: 30 s VIDEO, NO AUDIO',
    ], { hold: 1.6 }), this.waitUntil(() => this.skipping)]);
    if (this.skipping) throw new Skip();
    await this.wait(0);
    ui.hideCard();
    const holdS = (() => { let best = 0; for (let i = 0; i <= 400; i++) { const pt = curve.getPointAt(i / 400); if (pt.x >= 34) best = i / 400 * len; } return best; })();
    this.tick = (dt) => {
      // drive
      const remaining = len - s;
      const turnZone = s > len - 38;
      let target = remaining < 7 ? Math.max(0, remaining * 0.9) : turnZone ? 5.5 : 13;
      // wait at the red light until the radio traffic is over
      if (!this.flags.allowTurn && s > holdS - 40) target = Math.min(target, Math.max(0, (holdS - s) * 0.45));
      speed += (target - speed) * Math.min(1, dt * 1.2);
      s = Math.min(len, s + speed * dt);
      const u = s / len;
      const pt = curve.getPointAt(u), tan = curve.getTangentAt(Math.min(0.999, u + 0.002));
      car.position.copy(pt);
      car.rotation.y = Math.atan2(-tan.z, tan.x);
      p.pos.set(pt.x, 0, pt.z);
      for (const wh of car.userData.wheels) wh.children.forEach(c => { c.rotation.x = 0; });
      // steering wheel follows curvature
      const tan2 = curve.getTangentAt(Math.min(0.999, u + 0.02));
      const steer = Math.atan2(-tan2.z, tan2.x) - car.rotation.y;
      wheel.rotation.x = THREE.MathUtils.clamp(-steer * 6, -1.6, 1.6);
      // wipers
      wiperT += dt;
      const wa = -1.35 + (Math.sin(wiperT * 2.6) * 0.5 + 0.5) * 1.9;
      for (const wp of car.userData.wipers) wp.rotation.z = wa;
      ws.uniforms.uTime.value = wiperT;
      if (car.userData.mdt) car.userData.mdt.userData.draw(wiperT);
    };
    // --- silent buffer footage ---
    ui.showOverlay(true, true);
    this.app.muteWorld(true);
    ui.playback('EVIDENCE PLAYBACK · ITEM 14-B');
    await this.wait(5.5);
    // camera activated: double beep, audio comes in
    A && A.play('beep', { vol: 0.8, norand: true });
    ui.showOverlay(true, false);
    this.app.muteWorld(false);
    this.siren = A && A.play('siren', { vol: 0.25, loop: true, norand: true, bus: 'amb' });
    this.engine = A && A.play('breath1', { vol: 0.25, loop: true, rate: 0.35, norand: true, bus: 'amb' });
    await this.wait(0.8);
    await this.say('dispatch', 'Twenty-one Adam fourteen, Keston. Respond code three, twenty-two fifty Wexley Avenue, Harlan Court Apartments, unit one-C.');
    await this.say('dispatch', 'Multiple callers reporting screaming and an assault in progress. Caller advises the suspect is biting the victim.');
    // glance down at the MDT
    this.cam.to(null, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, -Math.PI / 2 - 0.55, 0, 'YXZ')), 1.2);
    await this.say('officer', 'Adam fourteen copies. I\'m about a minute out.');
    this.cam.to(null, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, -Math.PI / 2, 0, 'YXZ')), 1.4);
    await this.say('dispatch', 'Fourteen, be advised, we\'re holding six similar calls across the east district. Your backup is delayed.');
    await this.say('officer', '...Copy.', 0.4);
    this.flags.allowTurn = true;
    const sg = L.signal;
    if (sg) { sg.red.emissiveIntensity = 0; sg.green.emissiveIntensity = 14; sg.src.color.set(0x20ff70); }
    await this.waitUntil(() => s > len - 42);
    A && this.siren && A.stop(this.siren, 0.6);
    // headlights sweep the lot: look toward the dumpster figure
    await this.waitUntil(() => s > len - 22);
    this.cam.to(null, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -Math.PI / 2 + 0.55, 0, 'YXZ')), 2.2);
    await this.waitUntil(() => s > len - 0.2);
    await this.wait(0.6);
    await this.say('officer', 'Adam fourteen, on scene.');
    await this.say('dispatch', 'Copy fourteen, on scene at zero three fourteen.');
    this.cam.to(null, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, -Math.PI / 2 + 0.25, 0, 'YXZ')), 1.0);
    await this.wait(1.0);
    // exit the car: door, glitch cut outside
    A && A.play('doorMetal', { vol: 0.8, rate: 1.3 });
    A && this.engine && A.stop(this.engine, 0.3);
    this.app.glitch(0.5, 0.45);
    await this.wait(0.25);
    w.customArms = null;
    this.cam.parent = null;
    const stand = p.pos.copy(L.playerStarts.cp0.pos).clone();
    const eye = V3(stand.x, 1.42, stand.z);
    const look = V3(-2, 1.4, 0);
    this.cam.set(eye.clone().add(V3(0.3, -0.25, 0.4)), lookQuat(eye, V3(-8, 1.0, 5)));
    this.cam.noise = 0.9;
    w.forceLower = true;
    await this.cam.to(eye, lookQuat(eye, look), 1.6);
    A && A.play('holster', { vol: 0.8 });
    w.forceLower = false;
    await this.wait(0.35);
    A && A.play('click', { vol: 0.7 });
    w.lightOn = true;
    await this.wait(0.5);
    throwIfSkip(this);
  }

  // ---------------------------------------------------------------- CP0: the lot, lobby, corridor
  spawnLotFeeder() {
    const g = this.game, S = g.level.spawns;
    if (this.flags.lotFeeder) return this.flags.lotFeeder;
    const z = g.spawnZombie(S.lotFeeder, -1.2, { state: 'feed', variant: 0, wakeDist: 9 });
    this.flags.lotFeeder = z;
    return z;
  }

  beginLot() {
    const g = this.game, p = g.player, L = g.level, S = L.spawns, ui = this.ui, T = g.templates;
    this.endCutscene();
    this.cam.parent = null;
    this.checkpoint = 'cp0';
    const car = L.car;
    if (L.signal) { L.signal.red.emissiveIntensity = 14; L.signal.green.emissiveIntensity = 0; L.signal.src.color.set(0xff2010); }
    car.position.set(4.2, 0, 8.6); car.rotation.set(0, Math.PI / 2 + 0.12, 0);
    car.userData.steering.rotation.x = 0;
    for (const wp of car.userData.wipers) wp.rotation.z = -1.35;
    if (this.siren) { this.audio && this.audio.stop(this.siren, 0.3); this.siren = null; }
    if (this.engine) { this.audio && this.audio.stop(this.engine, 0.3); this.engine = null; }
    this.app.muteWorld(false);
    this.ui.blackout(false);
    this.ui.hideCard();
    this.app.setMarker('cp0');
    p.reset(L.playerStarts.cp0.pos, L.playerStarts.cp0.yaw);
    p.pitch = -0.02;
    if (this.flags.introCam) { /* keep */ }
    this.spawnLotFeeder();
    // interior population
    g.spawnZombie(S.office, -2.4, { state: 'dormant', variant: 1, wakeDist: 2.6 });
    const b1 = g.spawnZombie(S.b1, 0.2, { state: 'dormant', variant: 2, wakeDist: 1.2 });
    this.flags.b1 = b1;
    const feeder = g.spawnZombie(L.markers.feeder, Math.PI + 0.3, { state: 'feed', variant: 5 });
    feeder.invulnerable = true; feeder.scriptedIdle = true;
    this.flags.feeder = feeder;
    const victim = g.spawnCorpse(L.markers.victim, 0.9, g.victimTemplate, { keep: true, wounds: 5, pool: 1.5 });
    this.flags.victim = victim;
    this.emitters.push(g.audio && g.audio.emitter('feed0', V3(1, 0.6, -12.8), 0.9, { ref: 1.5, rolloff: 1.5 }));
    ui.showHud(true); ui.showOverlay(true);
    this.setObjective('Respond to the disturbance — Harlan Court, apartment 1C.');
    g.hooks.notify('Hold RMB to aim · LMB to fire · F light · E use');
    this.tick = (dt) => this.lotTick(dt);
  }

  lotTick(dt) {
    // 1A scratching / thumping behind locked doors
    const g = this.game;
    this._thud = (this._thud || 0) - dt;
    if (this._thud <= 0) {
      this._thud = 3 + Math.random() * 5;
      const d = g.player.pos.distanceTo(V3(-11.5, 0, -10.4)) < 9 ? V3(-11.5, 1.1, -10.6) : g.player.pos.distanceTo(V3(3.4, 0, -15.5)) < 9 && !this.flags.bathOpen ? V3(3.4, 1.1, -15.7) : null;
      if (d) { g.audio && g.audio.play('doorMetal', { pos: d, vol: 0.5, rate: 0.6 + Math.random() * 0.2 }); g.audio && g.audio.play('zmoan', { pos: d, vol: 0.4, occluded: true }); }
    }
  }

  onTrigger(name) {
    const g = this.game, L = g.level, S = L.spawns;
    switch (name) {
      case 'lotApproach': if (this.flags.lotFeeder && !this.flags.lotFeeder.dead) this.flags.lotFeeder.wake(); break;
      case 'enterLobby':
        if (this.checkpoint === 'cp0') this.bark('officer', 'Police department! Anybody hurt in here? Call out!');
        break;
      case 'pass1B': {
        if (this.checkpoint !== 'cp0') break;
        const d = L.doors.find(d => d.name === '1B');
        d.target = 1; d.burst = true; d.locked = null;
        g.audio && g.audio.play('doorMetal', { pos: d.center, vol: 1.2, rate: 0.8 });
        g.fx.dust(d.center.clone().setY(1.8), 8, 0.8);
        if (this.flags.b1 && !this.flags.b1.dead) { this.flags.b1.wake(); this.flags.b1.speed = 1.6; }
        g.player.shake(0.03, 0.3);
        setTimeout(() => g.spawnZombie(S.corridorW, Math.PI / 2, { alert: true, state: 'chase', variant: 3 }), 2500);
        break;
      }
      case 'reach1C': case 'in1C':
        if (this.checkpoint === 'cp0' && !this.flags.midDone && !this.flags.midRunning) { this.flags.midRunning = true; this.safe(() => this.midCutscene(), this.run); }
        break;
      case 'serviceEnter': {
        if (!this.flags.laundryDone) {
          this.flags.laundryDone = true;
          const d = L.doors.find(d => d.name === 'laundry');
          setTimeout(() => {
            d.target = 1; d.burst = true;
            g.audio && g.audio.play('doorMetal', { pos: d.center, vol: 1.3, rate: 0.7 });
            g.spawnZombie(S.laundry1, Math.PI, { alert: true, state: 'chase', variant: 4 });
            g.spawnZombie(S.laundry2, Math.PI, { alert: true, state: 'chase', variant: 1 });
          }, 1400);
        }
        break;
      }
      case 'maintEnter':
        if (!this.flags.maintHint) { this.flags.maintHint = true; this.bark('officer', 'That\'s a shotgun on the bench.'); }
        break;
      case 'court':
        if (this.checkpoint !== 'cp2') this.beginCP2(true);
        break;
    }
  }

  bark(kind, text) { this.voice.say(kind, text); }

  onKill(z) {
    const f = this.flags;
    if (z === f.feeder && f.midStage === 'fight') this.safe(() => this.afterFeeder(), this.run);
    if (z === f.risen) this.safe(() => this.afterRisen(), this.run);
    if (this.finale) this.finale.killed++;
  }

  // ---------------------------------------------------------------- MID: apartment 1C
  async midCutscene() {
    const g = this.game, p = g.player, w = g.weapons, L = g.level, A = this.audio, ui = this.ui;
    const feeder = this.flags.feeder;
    this.canSkip = false;
    this.cutscene = true;
    g.noGrab = true;
    ui.prompt(null);
    // take the camera from the current view
    this.cam.parent = null; this.cam.noise = 1.0;
    this.cam.set(p.camPos.clone(), p.viewQuat.clone());
    this.cam.aimQuat = null;
    const eye = V3(1.05, 1.42, -11.3);
    const head = () => feeder.body.bones[BI.head].getWorldPosition(new THREE.Vector3());
    await this.cam.to(eye, lookQuat(eye, head().add(V3(0, -0.2, 0))), 1.2);
    await this.say('officer', 'Police! Get away from him!');
    // feeder lifts its head, looks at us
    feeder.scripted = (z, dt) => { z.vel.set(0, 0, 0); z.state = 'feed'; };
    await this.wait(0.9);
    await this.say('officer', 'Show me your hands! Now!');
    let rise = 0;
    feeder.state = 'idle';
    feeder.scripted = (z, dt) => {
      rise = Math.min(1, rise + dt / 1.3);
      z.yaw = turnTowards(z.yaw, Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z), dt * 3);
      const pf = new Pose(); poseFeed(pf, z.t);
      const pi = new Pose(); poseIdle(pi, z.t, { seed: 2 });
      pf.blend(pi, ease(rise));
      applyPose(z.body, pf); z.root.position.copy(z.pos); z.root.rotation.set(0, z.yaw, 0);
      z.state = 'scripted';
      return true;
    };
    // keep the camera on it
    this.camFollow = (dt) => { if (!this.cam.tw) this.cam.quat.slerp(lookQuat(this.cam.pos, head().add(V3(0, -0.15, 0))), Math.min(1, dt * 8)); };
    await this.wait(1.4);
    A && A.zombieVoice(feeder, 'alert');
    await this.wait(0.5);
    // lunge
    feeder.scripted = null; feeder.state = 'chase'; feeder.alert = true; feeder.speed = 3.2; feeder.invulnerable = false;
    await this.waitUntil(() => feeder.pos.distanceTo(p.pos) < 1.0 || feeder.dead);
    this.camFollow = null;
    // struggle (interactive) - the bite always lands
    this.cutscene = false; p.scripted = null;
    p.unstick();
    this.cam.aimQuat = null;
    p.controls = true;
    g.noGrab = false;
    g.startGrab(feeder);
    g.grab.limit = 99; g.grab.minTime = 1.7;
    ui.notify('SHOVE IT OFF!', 1.5);
    await this.wait(1.5);
    A && A.play('bite', { vol: 1.3 });
    p.damage(22, feeder.pos);
    p.shake(0.14, 0.8);
    this.app.flashRed(0.9);
    this.bark('officer', 'Agh! It bit me! Get off!');
    this.infectionTarget = 0.25;
    this.flags.bitten = true;
    g.addArmBlood && g.addArmBlood();
    await this.waitUntil(() => !g.grab || g.grab.progress >= 1 || g.grab.t > 4.2);
    if (g.grab) g.releaseGrab(feeder, true);
    feeder.speed = 1.3;
    this.flags.midStage = 'fight';
    this.setObjective('Put the attacker down.');
    this.canSkip = false;
  }

  async afterFeeder() {
    const g = this.game, p = g.player, A = this.audio, L = g.level;
    this.flags.midStage = 'after';
    await this.wait(1.6);
    await this.say('officer', 'Dispatch, Adam fourteen. Shots fired, suspect down. Victim is... he\'s not breathing.');
    // victim twitches
    const victim = this.flags.victim;
    for (let i = 0; i < 3; i++) {
      await this.wait(0.7 + Math.random() * 0.4);
      victim.ragdoll.impulse(victim.ragdoll.p[i % 2 ? 4 : 7].clone(), V3((Math.random() - 0.5), 1, (Math.random() - 0.5)).normalize(), 2.2, 0.6);
      A && A.play('struggle', { pos: victim.ragdoll.p[0], vol: 0.6 });
    }
    await this.say('dispatch', 'Fourteen, say again? Are you injured?');
    // the turn: glitch, the victim is up
    this.app.glitch(0.7, 0.6);
    await this.wait(0.3);
    const vp = victim.ragdoll.p[0].clone(); vp.y = 0;
    victim.dispose(); g.zombies.splice(g.zombies.indexOf(victim), 1);
    const risen = g.spawnZombie(vp, Math.atan2(p.pos.x - vp.x, p.pos.z - vp.z), { template: g.victimTemplate, state: 'idle', hp: 90 });
    risen.material.userData.u.uBloodAmt.value = 1;
    for (let i = 0; i < 4; i++) risen.body.addBlood(V3(vp.x + (Math.random() - 0.5) * 0.2, 1.2 + Math.random() * 0.4, vp.z), [2, 1, 4, 3][i], 0.07);
    this.flags.risen = risen;
    let t = 0;
    risen.scripted = (z, dt) => {
      t += dt / 1.8;
      const pr = new Pose(); poseRise(pr, Math.min(1, t));
      applyPose(z.body, pr); z.root.position.copy(z.pos); z.root.rotation.set(0, z.yaw, 0);
      if (t >= 1) { z.scripted = null; z.state = 'chase'; z.alert = true; z.speed = 1.5; A && A.zombieVoice(z, 'alert'); }
      return true;
    };
    this.setObjective('The victim is getting up.');
  }

  async afterRisen() {
    const g = this.game, L = g.level;
    this.flags.midStage = 'done';
    await this.wait(1.2);
    await this.say('officer', 'Dispatch... fourteen. I\'ve been bitten. The victim got back up. They don\'t stop. Send everything you\'ve got.');
    await this.say('dispatch', 'Copy fourteen. SWAT is staging on Pell Street. Can you get to the rear courtyard? They\'ll come in through the alley.');
    await this.say('officer', 'Rear courtyard. Copy.');
    // keys on the body of the superintendent
    const vp = this.flags.risen && this.flags.risen.ragdoll.p[0] ? this.flags.risen.ragdoll.p[0].clone() : L.markers.victim.clone();
    vp.y = 0.03;
    g.addPickup('keys', vp, { label: 'Take the superintendent\'s keys', onTake: () => this.tookKeys() });
    this.setObjective('Search the victim. He was the building superintendent.');
  }

  tookKeys() {
    const g = this.game, S = g.level.spawns;
    this.flags.keys = true;
    const d = g.level.doors.find(d => d.name === 'maintenance');
    d.locked = null;
    g.hooks.notify('Superintendent\'s keys — maintenance door');
    this.setObjective('Get to the rear courtyard through the maintenance door (east corridor).');
    this.app.setMarker('cp1');
    this.flags.midDone = true;
    // horde from the lobby
    setTimeout(() => {
      if (this.checkpoint !== 'cp0' && this.checkpoint !== 'cp1') return;
      g.spawnZombie(S.lobbyA, Math.PI, { alert: true, state: 'chase', variant: 0 });
      g.spawnZombie(S.lobbyB, Math.PI, { alert: true, state: 'chase', variant: 2 });
      g.spawnZombie(S.corridorW, Math.PI / 2, { alert: true, state: 'chase', variant: 4 });
      g.audio && g.audio.play('zscream', { pos: S.lobbyA, vol: 1.2 });
    }, 3000);
    this.checkpoint = 'cp1';
  }

  // ---------------------------------------------------------------- CP1 start (after the bite)
  beginCP1() {
    const g = this.game, p = g.player, L = g.level, S = L.spawns;
    this.endCutscene();
    p.reset(L.playerStarts.cp1.pos, L.playerStarts.cp1.yaw);
    this.flags.bitten = true; this.flags.midDone = true; this.flags.keys = true;
    this.infectionTarget = 0.3; p.infection = 0.3;
    g.weapons.reserve.pistol = 51;
    g.spawnCorpse(L.markers.feeder, 0.4, g.templates[5 % g.templates.length], { keep: true });
    g.spawnCorpse(L.markers.victim.clone().add(V3(0.4, 0, 0.2)), 2.2, g.victimTemplate, { keep: true, wounds: 6 });
    L.doors.find(d => d.name === 'maintenance').locked = null;
    L.doors.find(d => d.name === '1B').target = 1;
    g.addArmBlood && g.addArmBlood();
    this.ui.showHud(true); this.ui.showOverlay(true);
    this.setObjective('Get to the rear courtyard through the maintenance door (east corridor).');
    this.bark('officer', 'Maintenance door, east end. Move.');
    g.spawnZombie(S.lobbyA, Math.PI, { alert: true, state: 'chase', variant: 0 });
    g.spawnZombie(S.corridorW, Math.PI / 2, { alert: true, state: 'chase', variant: 4 });
    g.spawnZombie(S.maint, Math.PI, { state: 'dormant', variant: 3, wakeDist: 3 });
    this.tick = (dt) => this.lotTick(dt);
  }

  // ---------------------------------------------------------------- CP2: courtyard hold-out
  async beginCP2(fromPlay = false) {
    const g = this.game, p = g.player, L = g.level, S = L.spawns, w = g.weapons;
    this.checkpoint = 'cp2';
    this.app.setMarker('cp2');
    this.endCutscene();
    if (!fromPlay) {
      p.reset(L.playerStarts.cp2.pos, L.playerStarts.cp2.yaw);
      this.flags.bitten = true;
      this.infectionTarget = 0.45; p.infection = 0.45;
      w.owned.shotgun = true; w.ammo.shotgun = 6; w.reserve.shotgun = 12; w.reserve.pistol = 51;
      g.addArmBlood && g.addArmBlood();
      L.doors.find(d => d.name === 'rearExit').target = 1;
      this.ui.showHud(true); this.ui.showOverlay(true);
    }
    this.infectionTarget = 0.5;
    const run = this.run;
    this.finale = { t: 0, spawned: 0, killed: 0, next: 2, done: false };
    this.setObjective('Hold the courtyard until SWAT arrives.');
    const safeSay = (k, t) => this.voice.say(k, t);
    safeSay('dispatch', 'Fourteen, SWAT is two minutes out. Hold the courtyard. They\'re coming through the alley.');
    const waves = [
      [4, 'gate', 3, false], [10, 'gate', 1, false], [16, 'alleyW', 2, false], [24, 'rearIn', 1, false], [30, 'alleyE', 2, false],
      [38, 'gate', 2, true], [48, 'alleyW', 2, false], [56, 'rearIn', 2, false], [64, 'gate', 3, false], [74, 'alleyE', 2, true], [84, 'gate', 3, false], [94, 'alleyW', 2, true],
    ];
    let wi = 0;
    const maxAlive = { low: 6, medium: 8, high: 10, ultra: 12 }[g.settings.get('quality')] || 9;
    const radio = [[40, 'Sixty seconds, fourteen. Hang on.'], [70, 'Thirty seconds. Units are on Pell.'], [95, 'SWAT is entering the alley. Do not fire toward the gate.']];
    let ri = 0;
    this.tick = (dt) => {
      const f = this.finale;
      if (!f || f.done) return;
      f.t += dt;
      while (wi < waves.length && f.t >= waves[wi][0]) {
        const [, where, n, runner] = waves[wi++];
        for (let i = 0; i < n; i++) {
          if (g.aliveCount() >= maxAlive) break;
          const base = S[where];
          const pos = base.clone().add(V3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 2));
          g.spawnZombie(pos, Math.PI, { alert: true, state: 'chase', runner: runner && i === 0, variant: (wi + i) % g.templates.length });
          f.spawned++;
        }
      }
      while (ri < radio.length && f.t >= radio[ri][0]) safeSay('dispatch', radio[ri++][1]);
      if (f.t > 98 && !f.done) { f.done = true; this.safe(() => this.ending(), this.run); }
    };
  }

  // ---------------------------------------------------------------- ENDING
  async ending() {
    const g = this.game, p = g.player, w = g.weapons, L = g.level, A = this.audio, ui = this.ui;
    this.canSkip = true;
    g.noGrab = true;
    // van pulls into the alley
    const van = this.van || (this.van = buildVan(g.M));
    g.scene.add(van);
    van.position.set(-40, 0, -42.5); van.rotation.y = 0;
    const vanLights = [L.lights.add({ pos: V3(0, 2.6, -42), color: 0xff1a0a, intensity: 1200, distance: 30, zone: 'alley', pattern: 'police-red', priority: 4 }), L.lights.add({ pos: V3(0, 2.6, -42), color: 0x1a3cff, intensity: 1400, distance: 30, zone: 'alley', pattern: 'police-blue', priority: 4 })];
    this.flags.vanLights = vanLights;
    let vx = -40;
    const sirenE = A && A.play('siren', { pos: van.position, vol: 1.2, loop: true, ref: 6, norand: true });
    // SWAT kills remaining zombies from the gate
    const swatShoot = (target) => {
      const from = V3(5.5, 1.5, -37);
      A && A.play('pistol', { pos: from, vol: 1.3, rate: 0.8 });
      g.fx.muzzleFlash(from, target.clone().sub(from).normalize(), true);
    };
    const vanTick = (dt) => {
      vx = Math.min(4, vx + dt * 9);
      van.position.x = vx;
      for (const l of vanLights) l.pos.set(vx + 2.2, 2.6, -42.5);
      if (sirenE && sirenE._panner && sirenE._panner.positionX) sirenE._panner.positionX.value = vx;
    };
    this.tick = vanTick;
    await this.wait(3.5);
    // clean up the courtyard
    for (const z of g.zombies) if (!z.dead) { swatShoot(z.pos.clone().setY(1.4)); z.updateCaps(g.frame); z.hit({ point: z.caps[0].a.clone(), dir: z.pos.clone().sub(V3(5.5, 1.5, -37)).normalize(), damage: 400, cap: z.caps[0], weapon: 'pistol', force: 2.5, dist: 10 }); await this.wait(0.35); }
    // SWAT hold the gate, rifle lights on the officer
    const gate = V3(5.5, 1.2, -36);
    const swat = [0, 1].map(i => this.makeSwat(V3(4.6 + i * 1.8, 0, -37.4 - i * 0.3)));
    g.floodLight.position.set(5.5, 3, -41); g.floodLight.intensity = 300;
    const lights = g.swatLights;
    let swatT = 0;
    const aimLights = (target) => swat.forEach((s, i) => {
      const lp = s.pos.clone().add(V3(0, 1.42, 0)).add(V3(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(0.55));
      lights[i].position.copy(lp); lights[i].target.position.copy(target).add(V3(Math.sin(swatT * 1.3 + i) * 0.08, -0.15, 0)); lights[i].target.updateMatrixWorld();
      lights[i].intensity = 800;
    });
    this.tick = (dt) => {
      vanTick(dt); swatT += dt;
      swat.forEach(s => { s.yaw = Math.atan2(p.camPos.x - s.pos.x, p.camPos.z - s.pos.z); this.poseSwat(s, 0, swatT); });
      aimLights(p.camPos);
    };
    this.canSkip = false;
    this.voice.say('dispatch', 'Fourteen, SWAT has the rear gate. Walk to them, keep your hands where they can see them.');
    this.setObjective('Walk to the SWAT team at the alley gate.');
    await this.waitUntil(() => p.pos.distanceTo(V3(5.5, 0, -36)) < 7.5 || !p.alive);
    if (!p.alive) return;
    this.canSkip = true;
    // take the camera
    this.cutscene = true;
    this.cam.parent = null; this.cam.noise = 1.1;
    this.cam.set(p.camPos.clone(), p.viewQuat.clone());
    const eye = p.camPos.clone();
    const mid = swat[0].pos.clone().add(swat[1].pos).multiplyScalar(0.5).setY(1.45);
    await this.cam.to(eye, lookQuat(eye, mid), 1.2);
    this.tick = (dt) => {
      vanTick(dt);
      swatT += dt;
      swat.forEach((s, i) => {
        const target = eye.clone().add(gate.clone().sub(eye).setY(0).normalize().multiplyScalar(3.4)).add(V3((i - 0.5) * 1.8, 0, 0)); target.y = 0;
        const d = target.clone().sub(s.pos); d.y = 0;
        const dist = d.length();
        const spd = dist > 0.2 ? 1.1 : 0;
        if (dist > 0.2) s.pos.addScaledVector(d.normalize(), spd * dt);
        s.phase += dt * spd * 5;
        s.yaw = Math.atan2(eye.x - s.pos.x, eye.z - s.pos.z);
        this.poseSwat(s, spd, swatT);
      });
      aimLights(eye);
    };
    await this.say('swat', 'Keston SWAT! Drop the weapon! Drop it now!');
    w.forceLower = true;
    await this.say('officer', 'I\'m a police officer! Twenty-one Adam fourteen!');
    await this.say('swat2', 'Show me your arm. Your left arm. Show me, now!');
    // look down at the bitten forearm
    const armOut = { t: 0 };
    w.customArms = (dt) => {
      armOut.t = Math.min(1, armOut.t + dt / 1.4);
      const q = this.cam.out.quat, c = this.cam.out.pos;
      const k = ease(armOut.t);
      const V = (x, y, z) => V3(x, y, z).applyQuaternion(q).add(c);
      return { L: { shoulder: V(0.24, -0.16, 0.14), wrist: V(0.1 - 0.08 * k, -0.3 + 0.2 * k, -0.3 - 0.02 * k), pole: V(0.8, -0.7, 0.2), quat: q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, -1.4 * k))) } };
    };
    await this.cam.to(null, this.cam.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.1, 0))), 1.6);
    this.infectionTarget = 1.0;
    await this.wait(0.8);
    await this.say('officer', 'It\'s... it\'s nothing. I\'m fine.');
    await this.say('swat', 'He\'s bit! He\'s bit! Get on the ground! On the ground!');
    w.customArms = null; w.setVisible(false);
    await this.cam.to(null, lookQuat(eye, gate.clone().add(V3(0, 0.3, 0))), 1.2);
    // the turn
    A && A.play('heart', { vol: 1.2 }); A && A.play('zmoan', { vol: 1.4, rate: 0.8 });
    this.app.glitch(0.6, 1.2);
    const lurch = eye.clone().add(gate.clone().sub(eye).setY(0).normalize().multiplyScalar(1.1));
    this.cam.noise = 3;
    this.cam.to(lurch, null, 1.4, t => t * t);
    await this.say('swat2', 'Stop! STOP!', 0.05);
    // shots
    for (let i = 0; i < 3; i++) {
      const s = swat[i % 2];
      A && A.play('pistol', { vol: 1.6, rate: 0.85 });
      g.fx.muzzleFlash(s.pos.clone().add(V3(0, 1.45, 0)), eye.clone().sub(s.pos).normalize(), true);
      this.app.flashRed(1);
      g.player.shake(0.2, 0.3);
      await this.wait(0.16);
    }
    // camera falls to the ground
    const ground = lurch.clone(); ground.y = 0.12;
    const fallQ = lookQuat(ground, V3(swat[0].pos.x, 0.25, swat[0].pos.z), 1.35);
    this.cam.noise = 0;
    await this.cam.to(ground, fallQ, 0.55, t => t * t * t);
    A && A.play('hitPlayer', { vol: 1.5 }); A && A.play('magDrop', { vol: 1, rate: 0.7 });
    this.app.glitch(0.9, 0.35);
    this.cam.noise = 0.05;
    this.infectionTarget = 0.2;
    this.app.muteWorld(true, 0.4);
    // boots walk into frame
    this.tick = (dt) => {
      vanTick(dt);
      swat.forEach((s, i) => {
        const target = ground.clone().add(V3(-0.6 + i * 1.3, 0, -1.4 - i * 0.5)); target.y = 0;
        const d = target.clone().sub(s.pos); d.y = 0;
        const dist = d.length(), spd = dist > 0.3 ? 1.0 : 0;
        if (dist > 0.3) s.pos.addScaledVector(d.normalize(), spd * dt);
        s.phase += dt * spd * 5;
        this.poseSwat(s, spd, 0);
        lights[i].target.position.copy(ground); lights[i].target.updateMatrixWorld();
      });
    };
    await this.wait(1.2);
    this.app.muteWorld(false);
    await this.say('swat', 'Shots fired, shots fired. Suspect down.');
    await this.say('swat2', 'Wait... that\'s fourteen. That\'s one of ours.');
    await this.say('radio', 'Dispatch, SWAT one. We need a supervisor and a coroner at twenty-two fifty Wexley, rear alley.', 0.5);
    await this.say('dispatch', '...Copy, SWAT one.', 1.2);
    // freeze / signal lost
    this.app.glitch(1.2, 1.5);
    await this.wait(1.2);
    A && sirenE && A.stop(sirenE, 1);
    this.finishEnding();
  }

  finishEnding() {
    const g = this.game;
    this.cutscene = false; this.tick = null;
    this.app.showEnding({ kills: g.kills, shots: g.weapons.shots, hits: g.weapons.hits, clock: this.clock });
    if (this.van) g.scene.remove(this.van);
    if (this.flags.swat) for (const s of this.flags.swat) g.scene.remove(s.body.root);
    if (this.flags.vanLights) g.level.lights.sources = g.level.lights.sources.filter(s => !this.flags.vanLights.includes(s));
    for (const l of g.swatLights) l.intensity = 0;
    g.floodLight.intensity = 0;
    this.app.clearMarker();
  }

  makeSwat(pos) {
    const g = this.game;
    const mat = makeCharacterMaterial(g.assets, g.swatTemplate.opts.mat);
    const body = new Body(g.swatTemplate, mat);
    body.eyeMat.color.set(0x333333);
    // rifle
    const rifle = new THREE.Group();
    const rm = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.5, metalness: 0.6 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.62), rm); rifle.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.05), rm); r2.position.set(0, -0.09, 0.1); rifle.add(r2);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 40 })); lens.position.set(0.04, 0, 0.312); rifle.add(lens);
    rifle.position.set(-0.05, 0.02, 0.28);
    body.bones[BI.chest].add(rifle);
    rifle.position.set(-0.08, 0.1, 0.3);
    g.scene.add(body.root);
    const s = { body, pos: pos.clone(), yaw: 0, phase: 0 };
    (this.flags.swat || (this.flags.swat = [])).push(s);
    return s;
  }

  poseSwat(s, spd, t) {
    const pose = new Pose();
    if (spd > 0.1) poseShamble(pose, s.phase, { reach: 0, limp: 0, stride: 0.5, lean: 0.15 });
    else poseIdle(pose, t, { seed: 3, headTilt: 0 });
    // rifle aimed: both arms forward
    // rifle shouldered: arms forward-down, forearms folded in toward the chest-mounted rifle
    for (const [sgn, P] of [[1, 'L_'], [-1, 'R_']]) {
      pose.set(BI[P + 'upper'], -0.85, -0.55 * sgn, -0.12 * sgn);
      pose.set(BI[P + 'fore'], -1.05, 0.2 * sgn, 0);
      pose.set(BI[P + 'hand'], -0.2, 0, 0);
    }
    pose.addB(BI.chest, 0.08, 0, 0);
    pose.set(BI.head, 0.05, 0, 0); pose.set(BI.jaw, 0);
    applyPose(s.body, pose);
    s.body.root.position.copy(s.pos);
    s.body.root.rotation.set(0, s.yaw, 0);
  }

  // ---------------------------------------------------------------- DEATH
  async onDeath() {
    const g = this.game, p = g.player, A = this.audio, ui = this.ui;
    if (this.cutscene) return;
    this.cancelAll();
    this.tick = null;
    this.cutscene = true; this.canSkip = false;
    g.noGrab = true;
    g.weapons.setVisible(false);
    ui.prompt(null); ui.qte(false);
    this.cam.parent = null; this.cam.noise = 0.2;
    this.cam.set(p.camPos.clone(), p.viewQuat.clone());
    // the nearest zombie will feed
    let killer = null, best = 1e9;
    for (const z of g.zombies) if (!z.dead) { const d = z.pos.distanceTo(p.pos); if (d < best) { best = d; killer = z; } }
    const ground = p.pos.clone(); ground.y = 0.14;
    const lookAt = killer ? killer.pos.clone().setY(0.4) : ground.clone().add(V3(Math.sin(p.yaw), 0.2, Math.cos(p.yaw)));
    this.app.glitch(0.7, 0.4);
    A && A.play('hitPlayer', { vol: 1.4 });
    await this.cam.to(ground, lookQuat(ground, lookAt, 1.3), 0.6, t => t * t * t).catch(() => {});
    A && A.play('magDrop', { vol: 1, rate: 0.6 });
    if (killer) {
      killer.scripted = (z, dt) => {
        const to = V3(p.pos.x - z.pos.x, 0, p.pos.z - z.pos.z);
        const d = to.length();
        if (d > 0.9) { z.pos.addScaledVector(to.normalize(), dt * 1.0); z.vel.set(0, 0, 0); }
        z.yaw = Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
        const pose = new Pose();
        if (d > 0.9) { z.phase += dt * 5; poseShamble(pose, z.phase, { reach: 0.8 }); } else poseFeed(pose, z.t);
        applyPose(z.body, pose); z.root.position.copy(z.pos); z.root.rotation.set(0, z.yaw, 0);
        return true;
      };
      A && A.zombieVoice(killer, 'feed');
    }
    p.infection = 0.6;
    const t0 = this.clock;
    await new Promise(r => setTimeout(r, 2600));
    this.app.glitch(1, 1);
    await new Promise(r => setTimeout(r, 500));
    ui.show('over');
    document.getElementById('overTime').textContent = ui.setClock(this.clock);
    this.app.onGameOver();
  }

  endCutscene() {
    const g = this.game;
    this.cutscene = false; this.canSkip = false; this.skipping = false;
    if (g.player.scripted && !this.cam.parent) g.player.unstick();
    g.player.scripted = null;
    g.weapons.customArms = null; g.weapons.forceLower = false; g.weapons.setVisible(true);
    g.noGrab = false;
    this.ui.playback(null); this.ui.skipHint(false); this.ui.hideCard();
    this.cam.aimQuat = null;
  }
}

function throwIfSkip(story) { if (story.skipping && story.canSkip) throw new Skip(); }
function turnTowards(a, b, max) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + Math.max(-max, Math.min(max, d)); }
