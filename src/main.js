// DEAD AIR — application orchestrator.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Settings, isTouchDevice } from './engine/settings.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { VoiceSystem } from './engine/voice.js';
import { UI, setStyle, setClass } from './ui/ui.js';
import { Game } from './game/game.js';
import { Story } from './game/story.js';
import { zoneAt } from './game/lights.js';

const MARKER_KEY = 'deadair.marker.v1';
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3();

class App {
  constructor() {
    this.settings = new Settings();
    if (q.get('q')) this.settings.applyPreset(q.get('q'), false);
    this.canvas = $('view');
    this.renderer = new Renderer(this.canvas);
    this.renderer.applySettings(this.settings.values);
    this.input = new Input(this.canvas, this.settings);
    this.ui = new UI(this.settings);
    this.audio = new AudioEngine(this.settings);
    this.voice = new VoiceSystem(this.settings, this.audio, this.ui);
    this.touch = isTouchDevice() || q.get('touch') === '1';
    this.ui.setTouch(this.touch);
    if (this.touch) this.input.bindTouch($('touch'));
    this.state = 'gate';
    this.paused = false;
    this.glitchT = 0; this.glitchAmp = 0; this.glitchDur = 1;
    this.redT = 0;
    this.skipHold = 0;
    this.heartT = 0;
    this.lastHud = '';
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.time = 0;
    this.cpu = { sim: 0, render: 0 };   // main-thread ms per frame (EMA): simulation, render submission
    this.worldMuted = false;
    window.__DA = { ready: false, app: this, THREE, zoneAt };
    this.bindUI();
    this.ui.onSettingChange = (k) => this.applySettings(k);
    this.input.onUnlock = () => { if (this.state === 'play' && !this.paused && !this.story.cutscene) this.pause(true); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(true); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.state === 'play' && this.paused && !$('pause').hidden) { e.preventDefault(); this.pause(false); } });
    this.updateOrientationClass();
    window.addEventListener('resize', () => this.updateOrientationClass());
    if (q.get('auto')) this.startLoading();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  updateOrientationClass() {
    document.body.classList.toggle('needs-landscape', this.touch && this.state !== 'gate' && innerHeight > innerWidth);
  }

  bindUI() {
    $('gateGo').addEventListener('click', () => this.startLoading());
    $('mPlay').addEventListener('click', () => this.play('intro'));
    $('mResume').addEventListener('click', () => this.play(this.getMarker() || 'cp0'));
    $('mSettings').addEventListener('click', () => this.ui.openSettings('menu'));
    $('mControls').addEventListener('click', () => { this.ui.settingsReturn = 'menu'; this.ui.show('controls'); });
    $('mCredits').addEventListener('click', () => { this.ui.settingsReturn = 'menu'; this.ui.show('credits'); });
    $('pResume').addEventListener('click', () => this.pause(false));
    $('pSettings').addEventListener('click', () => this.ui.openSettings('pause'));
    $('pRestart').addEventListener('click', () => { this.pause(false, true); this.play(this.getMarker() || 'cp0'); });
    $('pQuit').addEventListener('click', () => this.toMenu());
    $('oRetry').addEventListener('click', () => this.play(this.getMarker() || 'cp0'));
    $('oQuit').addEventListener('click', () => this.toMenu());
    $('eMenu').addEventListener('click', () => this.toMenu());
  }

  // ---------------------------------------------------------------- boot / loading
  async startLoading() {
    if (this.state !== 'gate') return;
    this.state = 'loading';
    this.audio.unlock();
    if (this.touch) {
      try { const el = document.documentElement; const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null; if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) { /* optional */ }
    }
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
    this.updateOrientationClass();
    this.ui.show('loading');
    const ui = this.ui;
    ui.loadProgress(0.01, 'Opening evidence container');
    const assets = new Assets(this.renderer);
    assets.lowTex = this.settings.get('lowTex');
    assets.texCap = this.settings.get('texCap') || 1024;
    assets.anisotropy = Math.min(this.renderer.maxAnisotropy, { low: 2, medium: 4, high: 8, ultra: 16 }[this.settings.get('quality')] || 4);
    this.assets = assets;
    await assets.loadAll((p, l) => ui.loadProgress(p * 0.45, 'Decoding textures and props'));
    ui.loadProgress(0.46, 'Synthesising audio track');
    await this.audio.generate((p) => ui.loadProgress(0.46 + p * 0.12, 'Synthesising audio track'));
    this.game = new Game({ renderer: this.renderer, assets, settings: this.settings, input: this.input, audio: this.audio });
    this.game.hooks.notify = (t) => this.ui.notify(t);
    this.game.hooks.onHitMarker = (head) => this.ui.hitMarker(head);
    this.game.hooks.onDamage = (bite) => { this.redT = Math.max(this.redT, bite ? 1 : 0.6); };
    this.game.hooks.onGrab = (on) => { this.ui.qte(on, 0, this.touch); if (on) this.input.setAimToggle(false); };
    this.game.hooks.onGrabProgress = (p) => this.ui.qte(true, p, this.touch);
    await this.game.build((p, l) => ui.loadProgress(0.58 + p * 0.36, l));
    this.story = new Story(this);
    this.applySettings();
    ui.loadProgress(0.96, 'Compiling shaders');
    await new Promise(r => setTimeout(r, 0));
    this.setupMenuScene();
    try { this.renderer.gl.compile(this.game.scene, this.game.player.camera); } catch (e) { /* optional */ }
    // one throw-away frame (every zone) to upload all geometry and textures up front
    this.renderFrame(1 / 60, true);
    ui.loadProgress(1, 'Integrity verified');
    this.audio.startAmbience();
    await new Promise(r => setTimeout(r, 450));
    this.toMenu();
    if (q.get('start')) this.play(q.get('start'));
    window.__DA.ready = true;
    window.__DA.game = this.game;
  }

  applySettings(k) {
    const s = this.settings.values;
    this.renderer.applySettings(s);
    if (!this.game) return;
    const g = this.game;
    if (g.level.lights.pool.length !== s.lightPool) g.level.lights.setPool(s.lightPool);
    g.fx.setRainDensity(s.rain);
    g.weapons.spot.castShadow = s.shadows > 0;
    g.weapons.shadowFar = { low: 10, medium: 14, high: 16, ultra: 20 }[s.quality] ?? 14;   // m: shadow-pass caster reach
    const sz = s.shadows > 1 ? Math.max(1024, s.shadowSize) : s.shadowSize;
    if (g.weapons.spot.shadow.mapSize.x !== sz) { g.weapons.spot.shadow.mapSize.set(sz, sz); if (g.weapons.spot.shadow.map) { g.weapons.spot.shadow.map.dispose(); g.weapons.spot.shadow.map = null; } }
    this.audio.applyVolumes();
    this.ui.showOverlay(this.state === 'play' || this.state === 'menu');
    $('mQuality').textContent = `Graphics · ${String(s.quality).toUpperCase()}`;
  }

  // ---------------------------------------------------------------- menu backdrop
  setupMenuScene() {
    const g = this.game;
    this.menuCam = { pos: new THREE.Vector3(-7.5, 1.55, 12.8), look: new THREE.Vector3(1.2, 1.6, -1) };
    g.player.pos.set(-7.5, 0, 12.8);
  }

  toMenu() {
    const g = this.game;
    this.state = 'menu';
    this.paused = false;
    this.input.enabled = false;
    this.input.exitLock();
    this.input.clearAll();
    this.voice.cancel();
    if (this.story) { this.story.cancelAll(); this.story.endCutscene(); this.story.stopEmitters(); this.story.tick = null; }
    g.resetLevelState();
    g.weapons.setVisible(false);
    g.player.alive = true;
    // a lone figure under the far streetlight
    const z = g.spawnZombie(new THREE.Vector3(-13.2, 0, 7.4), 1.9, { state: 'idle', variant: 2 });
    z.scriptedIdle = true;
    this.menuZombie = z;
    this.ui.showHud(false); this.ui.showTouch(false); this.ui.showOverlay(true); this.ui.prompt(null); this.ui.qte(false); this.ui.subtitle(null);
    this.ui.skipHint(false); this.ui.playback(null); this.ui.hideCard();
    const m = this.getMarker();
    $('mResume').hidden = !m;
    if (m) $('mResumeWhere').textContent = { cp0: 'Parking lot · 03:14', cp1: 'Apartment 1C · 03:23', cp2: 'Rear courtyard · 03:31' }[m] || '';
    $('menuFoot').textContent = `${this.touch ? 'Touch' : 'Keyboard & mouse'} · ${String(this.settings.get('quality')).toUpperCase()} · ${this.renderer.w}×${this.renderer.h}`;
    document.body.classList.remove('playing');
    this.ui.show('menu');
    this.renderer.post.resetAdapt = true;
  }

  play(point) {
    this.audio.unlock();
    this.state = 'play';
    this.paused = false;
    this.ui.hideAll();
    this.ui.showHud(true);
    this.ui.showTouch(this.touch);
    document.body.classList.add('playing');
    this.updateOrientationClass();
    this.input.enabled = true;
    this.input.clearAll();
    this.input.wantLock = !this.touch;
    if (!this.touch) this.input.requestLock();
    this.renderer.post.resetAdapt = true;
    this.game.weapons.setVisible(true);
    this.story.start(point);
  }

  pause(on, silent = false) {
    if (this.state !== 'play') return;
    if (on === this.paused) return;
    this.paused = on;
    this.game.paused = on;
    if (on) {
      this.input.exitLock();
      this.input.clearAll();
      this.voice.pause();
      this.audio.suspend();
      if (!silent) { this.ui.show('pause'); $('pauseTime').textContent = this.ui.setClock(this.story.clock); }
    } else {
      this.ui.hideAll();
      this.voice.resume();
      this.audio.resume();
      if (!this.touch) this.input.requestLock();
    }
  }

  onGameOver() {
    this.state = 'over';
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.showTouch(false);
    this.ui.showHud(false);
  }

  showEnding(stats) {
    this.state = 'ending';
    this.input.enabled = false; this.input.exitLock();
    this.ui.showTouch(false); this.ui.showHud(false); this.ui.showOverlay(false);
    const acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
    $('endStats').textContent = '';
    for (const t of [`${stats.kills} infected neutralised`, `${stats.shots} rounds fired`, `${acc} % accuracy`, `recording length ${this.ui.setClock(stats.clock)}`]) { const s = document.createElement('span'); s.textContent = t; $('endStats').appendChild(s); }
    this.ui.show('ending');
  }

  // ---------------------------------------------------------------- effects API used by the story
  glitch(amp, dur) { this.glitchAmp = Math.max(this.glitchAmp * (this.glitchT > 0 ? 1 : 0), amp); this.glitchT = dur; this.glitchDur = dur; this.audio && this.audio.play('radioOut', { vol: amp * 0.6, rate: 0.5 + Math.random() * 0.4 }); }
  flashRed(a) { this.redT = Math.max(this.redT, a); }
  muteWorld(on, fade = 0.2) {
    this.worldMuted = on;
    const a = this.audio; if (!a.ctx) return;
    const t = a.ctx.currentTime;
    a.sfx.gain.setTargetAtTime(on ? 0 : this.settings.get('sfx'), t, fade);
    a.amb.gain.setTargetAtTime(on ? 0 : this.settings.get('ambience'), t, fade);
  }
  setMarker(m) { if (m === 'intro') return; try { localStorage.setItem(MARKER_KEY, m); } catch (e) { /* storage unavailable */ } }
  getMarker() { try { return localStorage.getItem(MARKER_KEY); } catch (e) { return null; } }
  clearMarker() { try { localStorage.removeItem(MARKER_KEY); } catch (e) { /* storage unavailable */ } }

  // ---------------------------------------------------------------- per frame
  loop(now) {
    requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    let dt = Math.min(0.05, rawDt);
    this.last = now;
    if (q.get('fixed')) dt = 1 / 30;
    if (dt <= 0) return;
    this.time += dt;
    window.__DA.frames = (window.__DA.frames || 0) + 1;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.ui.fps(`${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.renderer.w}×${this.renderer.h} · sim ${this.cpu.sim.toFixed(1)} ms · draw ${this.cpu.render.toFixed(1)} ms · ${this.renderer.sceneInfo ? this.renderer.sceneInfo.calls : 0} calls`); this.fpsAcc = 0; this.fpsN = 0; }
    if (!this.game || this.state === 'gate' || this.state === 'loading') { this.input.endFrame(); return; }
    const g = this.game, p = g.player, input = this.input;
    input.update(dt);
    if (this.state === 'play') {
      if (input.pressed('pause') && !this.paused && !(this.story.cutscene && this.story.canSkip === false && this.story.flags.midRunning && !this.story.flags.midStage)) this.pause(true);
      if (!this.paused) {
        this.handleSkip(dt);
        this.aimAssist(dt);
        const turbo = +(q.get('turbo') || 1);
        const t0 = performance.now();
        for (let i = 0; i < turbo; i++) { g.update(dt); if (i < turbo - 1) { input.endFrame(); } }
        this.cpu.sim += (performance.now() - t0 - this.cpu.sim) * 0.05;
      }
    } else if (this.state === 'menu') {
      this.menuUpdate(dt);
    } else if (this.state === 'over' || this.state === 'ending') {
      // keep the world alive behind the panel
      g.player.updateRig(dt, this.settings.values);
      if (this.state === 'over') { this.story.update(dt); for (const z of g.zombies) z.update(dt, g.frame); }
      g.level.lights.update(dt, this.time, p.camPos, p.zone);
    }
    this.updateAudio(dt);
    this.updateHud(dt);
    this.updatePost(dt);
    const r0 = performance.now();
    this.renderFrame(dt);
    this.cpu.render += (performance.now() - r0 - this.cpu.render) * 0.05;   // submission cost (EMA, ms)
    this.renderer.trackFrame(rawDt, this.time);   // unclamped: the scaler must see (and ignore) real hitches
    input.endFrame();
  }

  menuUpdate(dt) {
    const g = this.game, p = g.player, t = this.time;
    const c = this.menuCam;
    const pos = _v.copy(c.pos).add(_v2.set(Math.sin(t * 0.05) * 0.8, Math.sin(t * 0.37) * 0.02, Math.cos(t * 0.04) * 0.3));
    const m = new THREE.Matrix4().lookAt(pos, c.look.clone().add(new THREE.Vector3(Math.sin(t * 0.07) * 0.6, 0, 0)), new THREE.Vector3(0, 1, 0));
    const qq = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.9) * 0.004, Math.sin(t * 0.6) * 0.004, Math.sin(t * 0.5) * 0.006)));
    p.scripted = { pos: pos.clone(), quat: qq, aimQuat: qq };
    p.pos.set(pos.x, 0, pos.z);
    p.updateRig(dt, this.settings.values);
    g.time += dt; g.frame++;
    g.level.lights.update(dt, g.time, p.camPos, 'lot');
    for (const f of g.level.animated) f(dt, g.time);
    for (const z of g.zombies) z.update(dt, g.frame);
    const flash = { pos: p.camPos, dir: new THREE.Vector3(0, 0, -1), on: false };
    const pool = g.level.lights.pool.filter(s => s.light.intensity > 0).map(s => s.light);
    g.fx.update(dt, g.time, p.camera, flash, pool.slice(0, 4), true);
    this.ui.setClock(this.time);
  }

  handleSkip(dt) {
    const s = this.story, input = this.input;
    if (!s.cutscene || !s.canSkip) { this.skipHold = 0; this.ui.skipHint(false); return; }
    const held = input.held.skip || input.held.fire || (this.touch && (input.held.fire || input.held.mash || input.move.x !== 0 || input.move.y !== 0 || input.touchHold));
    this.skipHold = held ? this.skipHold + dt : Math.max(0, this.skipHold - dt * 2);
    this.ui.skipHint(true, Math.min(1, this.skipHold / 0.9), this.touch);
    if (this.skipHold > 0.9) { this.skipHold = 0; s.skipping = true; this.voice.cancel(); }
  }

  aimAssist(dt) {
    const g = this.game, p = g.player;
    p.lookScale = 1;
    if (!this.settings.get('aimAssist') || this.input.lastDevice === 'kbm' || p.scripted) return;
    let best = null, bestA = 0.07;
    for (const z of g.zombies) {
      if (z.dead) continue;
      const tgt = _v.copy(z.pos).setY(1.35);
      const d = tgt.distanceTo(p.camPos);
      if (d > 25) continue;
      const dir = tgt.sub(p.camPos).normalize();
      const a = Math.acos(Math.min(1, dir.dot(p.aimDir)));
      if (a < bestA) { bestA = a; best = dir.clone(); }
    }
    if (!best) return;
    const wantYaw = Math.atan2(-best.x, -best.z), wantPitch = Math.asin(best.y);
    let dy = ((wantYaw - p.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const k = Math.min(1, dt * (p.ads > 0.5 ? 3.5 : 1.6));
    p.yaw += dy * k; p.pitch += (wantPitch - p.pitch) * k * 0.7;
    p.lookScale = 0.75;
  }

  updateAudio(dt) {
    const g = this.game, p = g.player, a = this.audio;
    if (!a.ready) return;
    const cam = p.camera;
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion), up = _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    a.setListener(cam.position, fwd, up);
    a.setZone(this.state === 'menu' ? 'lot' : p.zone);
    // heartbeat when hurt or infected
    if (this.state === 'play' && !this.paused) {
      const hp = p.health / p.maxHealth;
      const bpm = hp < 0.4 ? 70 + (0.4 - hp) * 180 : p.infection > 0.35 ? 60 + p.infection * 50 : 0;
      if (bpm > 0) { this.heartT -= dt; if (this.heartT <= 0) { this.heartT = 60 / bpm; a.play('heart', { vol: 0.5 + (1 - hp) * 0.6, norand: true }); } }
      if (p.stamina < 0.3 || hp < 0.3) { this.breathT = (this.breathT || 0) - dt; if (this.breathT <= 0) { this.breathT = 1.4; a.play('breath', { vol: 0.35 }); } }
    }
  }

  updateHud(dt) {
    const g = this.game, p = g.player, ui = this.ui, s = this.story;
    ui.update(dt);
    if (this.state !== 'play') return;
    ui.setClock(s.clock);
    const w = g.weapons;
    const key = `${w.current}${w.ammo[w.current]}${w.reserve[w.current]}${w.state === 'reload'}`;
    if (key !== this.lastHud) { this.lastHud = key; ui.ammo(w); }
    const showHud = !s.cutscene;
    setStyle($('ammo'), 'opacity', showHud ? '0.92' : '0');
    ui.prompt(showHud && g.interactTarget ? g.interactTarget.label : null);
    // crosshair: project the aim point, then through the inverse lens
    if (showHud && p.alive && !this.paused) {
      const o = p.camPos, d = p.aimDir;
      const hit = g.world.raycast(o, d, 40);
      const pt = _v.copy(o).addScaledVector(d, hit ? hit.t : 40);
      pt.project(p.camera);
      let u = pt.x * 0.5 + 0.5, v = pt.y * 0.5 + 0.5;
      // invert the lens mapping by fixed-point iteration
      let su = u, sv = v;
      for (let i = 0; i < 4; i++) { const [lu, lv] = this.renderer.post.lensUV(su, sv, p.camera); su += u - lu; sv += v - lv; }
      ui.crosshair(su * innerWidth, (1 - sv) * innerHeight, p.ads < 0.6 && !g.grab);
    } else ui.crosshair(0, 0, false);
    if (g.grab) ui.qte(true, g.grab.progress, this.touch);
    setClass($('touch'), 'ads', p.ads > 0.5);
  }

  updatePost(dt) {
    const pp = this.renderer.post.params, g = this.game, p = g.player, s = this.settings.values;
    pp.fish = s.fisheye; pp.ca = s.chromatic; pp.grain = s.grain;
    const hp = p.health / p.maxHealth;
    this.redT = Math.max(0, this.redT - dt * 1.6);
    const lowHp = Math.max(0, 0.45 - hp) / 0.45;
    const pulse = Math.pow(Math.max(0, Math.sin(this.time * (1.2 + lowHp * 1.5) * Math.PI)), 6);
    pp.damage = Math.min(1, this.redT * 0.9 + lowHp * (0.35 + 0.25 * pulse) + p.hurtT * 0.3);
    pp.desat = lowHp * 0.5;
    pp.infect = p.infection;
    pp.heart = pulse;
    if (this.glitchT > 0) { this.glitchT -= dt; pp.glitch = this.glitchAmp * Math.min(1, this.glitchT / Math.max(0.05, this.glitchDur) * 2) * (0.6 + Math.random() * 0.4); }
    else pp.glitch = p.infection > 0.5 && Math.random() < 0.01 ? p.infection * 0.3 : 0;
    pp.key = 0.048; pp.minLog = -2.7; pp.maxLog = 4;
    // camera optics
    const cam = p.camera;
    cam.fov = s.fov;
    cam.zoom = 1 + p.ads * 0.28;
    cam.near = 0.03;
  }

  renderFrame(dt, all = false) {
    const g = this.game, cam = g.player.camera;
    // portal culling: draw only the zones visible through open doorways and windows
    cam.aspect = this.renderer.aspect; cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.layers.mask = all ? 0xffffffff : g.level.visMaskFor(cam);
    this.renderer.render(g.scene, cam, dt, this.time);
  }
}

new App();
