// Zombie actor: perception, flow-field chase, attacks/grabs, hit reactions, gore and ragdoll death.
import * as THREE from 'three';
import { Body, BI, makeCharacterMaterial } from './humanoid.js';
import { Pose, applyPose, poseIdle, poseShamble, poseRun, poseAttack, poseFeed, poseKneelGrab, poseCrawl, HitReact } from './anim.js';
import { Ragdoll } from './ragdoll.js';
import { CANE, steadyCane } from './kitbody.js';
import { SURF } from './world.js';

// hit capsules: [bone, fromJoint, toJoint (or null), radius, zone]
const CAPS = [
  ['head', 'head', 'headTop', 0.1, 'head'],
  ['neck', 'neck', 'head', 0.06, 'neck'],
  ['chest', 'chest', 'neck', 0.15, 'torso'],
  ['spine', 'spine', 'chest', 0.14, 'torso'],
  ['hips', 'hips', 'spine', 0.15, 'torso'],
  ['L_upper', 'L_upper', 'L_fore', 0.055, 'arm'], ['L_fore', 'L_fore', 'L_hand', 0.045, 'arm'], ['L_hand', 'L_hand', 'L_tip', 0.04, 'arm'],
  ['R_upper', 'R_upper', 'R_fore', 0.055, 'arm'], ['R_fore', 'R_fore', 'R_hand', 0.045, 'arm'], ['R_hand', 'R_hand', 'R_tip', 0.04, 'arm'],
  ['L_thigh', 'L_thigh', 'L_shin', 0.08, 'leg'], ['L_shin', 'L_shin', 'L_foot', 0.055, 'leg'],
  ['R_thigh', 'R_thigh', 'R_shin', 0.08, 'leg'], ['R_shin', 'R_shin', 'R_foot', 0.055, 'leg'],
];
const ZONE_MUL = { head: 4.0, neck: 2.2, torso: 1.0, arm: 0.55, leg: 0.65 };
const LEG_BONES = [BI.L_thigh, BI.L_shin, BI.L_foot, BI.R_thigh, BI.R_shin, BI.R_foot];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

let ZID = 0;
export class Zombie {
  constructor(game, template, opts = {}) {
    this.id = ++ZID;
    this.game = game;
    this.tpl = template;
    const vmat = { ...(template.opts.mat || {}) };
    this.material = template.makeMaterial ? template.makeMaterial(opts.look) : makeCharacterMaterial(game.assets, vmat);
    this.body = new Body(template, this.material);
    this.root = this.body.root;
    this.root.name = 'zombie' + this.id;
    game.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hp = opts.hp ?? 100;
    this.maxHp = this.hp;
    this.speed = opts.speed ?? (0.85 + Math.random() * 0.45);
    this.runner = !!opts.runner;
    if (this.runner) this.speed = 3.1 + Math.random() * 0.5;
    this.state = opts.state || 'idle';   // idle | dormant | feed | chase | attack | grab | stagger | dead | scripted
    this.alert = opts.alert ?? false;
    this.phase = Math.random() * 6.28;
    this.t = Math.random() * 10;
    this.pose = new Pose(); this.tmpPose = new Pose(); this.prevPose = new Pose();
    this.react = new HitReact();
    this.ragdoll = new Ragdoll(this.body, game.world);
    this.dead = false;
    this.attackT = 0; this.attackCd = 0;
    this.stateT = 0;
    this.stagger = 0;
    this.reach = 0.3 + Math.random() * 0.7;
    this.limp = Math.random() < 0.4 ? 0.3 + Math.random() * 0.5 : Math.random() * 0.15;
    this.voiceT = 1 + Math.random() * 5;
    this.lastSeen = new THREE.Vector3();
    this.flow = new THREE.Vector3();
    this.radius = 0.28;
    this.caps = CAPS.map(c => ({ bone: BI[c[0]], j0: c[1], j1: c[2], r: c[3] * (template.opts.height ?? 1), zone: c[4], a: new THREE.Vector3(), b: new THREE.Vector3() }));
    this.capsFrame = -1;
    this.headless = false;
    this.deathT = 0;
    this.onDeath = opts.onDeath || null;
    this.eyeGlow = 0;
    this.snap = [];
    this.bloodPool = null;
    this.feedTarget = null;
    this.scripted = null;       // function(z, dt) for cutscenes
    this.visible = true;
    this.grabT = 0;
    this.dormantWake = opts.wakeDist ?? 7;
    this.name = opts.name || '';
    // kit archetypes (kitbody.js ARCHETYPES): stats, gait and special movement
    this.arch = template.arch || null;
    this.boundY = 0.95; this.boundR = 1.3;      // cheap ray pre-test sphere (centre height, radius)
    this.voicePitch = 1;
    if (this.arch) this.initArch(opts);
  }

  initArch(opts) {
    const a = this.arch, R = (r) => r[0] + Math.random() * (r[1] - r[0]);
    this.crawler = !!a.crawler; this.cane = !!a.cane;
    if (this.crawler || this.cane) this.runner = false;          // their gaits come from the kit clips
    if (opts.hp === undefined) this.hp = this.maxHp = a.hp;
    if (opts.speed === undefined && !this.runner) this.speed = R(a.speed);
    if (a.reach[1] > 0) this.reach = R(a.reach);
    this.limp = R(a.limp);
    this.voicePitch = a.voice;
    this.clips = this.tpl.clips;
    this.gait = Math.random();
    this.sprint = false; this.burstT = 2 + Math.random() * 5;
    this.auxPose = new Pose();
    this.caneQ = new THREE.Quaternion(); this.caneClip = false;
    this.hardHead = this.tpl.hardHead || null;
    if (this.crawler) { this.radius = 0.34; this.boundY = 0.5; this.boundR = 1.6; }
  }

  place(p, yaw = 0) {
    this.pos.copy(p); this.yaw = yaw;
    this.root.position.copy(p); this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
  }

  get alive() { return !this.dead; }

  // ------------------------------------------------------------------ perception & AI
  update(dt, frame) {
    this.t += dt;
    const g = this.game;
    if (this.dead) {
      this.deathT += dt;
      this.ragdoll.step(dt);
      if (this.bloodPool) {
        const bp = this.bloodPool;
        bp.userData.t += dt;
        const s = Math.min(1, bp.userData.t / 14) * bp.userData.max;
        bp.scale.setScalar(Math.max(0.01, s));
        if (!this.ragdoll.sleeping && bp.userData.t < 3) { this.ragdoll.centre(_v); bp.position.set(_v.x, bp.position.y, _v.z); }
      }
      return;
    }
    if (this.scripted) { const handled = this.scripted(this, dt); if (!handled) this._animate(dt); return; }

    const player = g.player;
    const toP = _v.subVectors(player.pos, this.pos); toP.y = 0;
    const dist = toP.length();
    this.attackCd = Math.max(0, this.attackCd - dt);

    // wake conditions
    if (!this.alert && !this.scriptedIdle) {
      const noise = g.noiseLevelAt ? g.noiseLevelAt(this.pos) : 0;
      const near = dist < (this.state === 'feed' ? 4.0 : this.dormantWake);
      let sees = false;
      if (dist < 16 && (frame + this.id) % 10 === 0) {
        _a.copy(this.pos).setY(1.6); _b.copy(player.pos).setY(1.4);
        const facing = (toP.x * Math.sin(this.yaw) + toP.z * Math.cos(this.yaw)) / Math.max(1e-4, dist);
        sees = (facing > 0.2 || player.flashlightOn && dist < 9) && g.world.lineOfSight(_a, _b);
      }
      if (near || noise > 0.5 || (sees && this.state !== 'dormant') || this.hp < this.maxHp) this.wake();
    }

    switch (this.state) {
      case 'idle': case 'dormant': case 'feed': {
        this.vel.multiplyScalar(0.8);
        if (this.alert) this.state = 'chase';
        break;
      }
      case 'chase': {
        // path: direct if visible & close, else flow field
        let dir = this.flow;
        const direct = dist < 3.5 || ((frame + this.id) % 6 === 0 ? (this._los = g.world.lineOfSight(_a.copy(this.pos).setY(1.2), _b.copy(player.pos).setY(1.2))) : this._los) && dist < 12;
        if (direct) dir.copy(toP).normalize();
        else if (!g.nav.flow(this.pos.x, this.pos.z, dir)) dir.copy(toP).normalize();
        // separation from other zombies
        for (const o of g.zombies) {
          if (o === this || o.dead) continue;
          const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.55 * 0.55 && d2 > 1e-6) { const d = Math.sqrt(d2); dir.x += dx / d * (0.55 - d) * 2; dir.z += dz / d * (0.55 - d) * 2; }
        }
        dir.y = 0; dir.normalize();
        const boost = this.arch ? this.archBoost(dt, dist, direct) : 1;
        const spd = this.speed * boost * (this.stagger > 0 ? 0.25 : 1) * (dist < 1.6 && !this.crawler ? 0.6 : 1);
        this.vel.x += (dir.x * spd - this.vel.x) * Math.min(1, dt * 4);
        this.vel.z += (dir.z * spd - this.vel.z) * Math.min(1, dt * 4);
        // face movement / player
        const want = Math.atan2(dist < 3 ? toP.x : this.vel.x, dist < 3 ? toP.z : this.vel.z);
        this.yaw = turnTo(this.yaw, want, dt * (this.runner ? 6 : 3.2));
        if (this.crawler) {
          // pounce from a few metres out when it has a clear line (kit windowLeap, scaled to the gap)
          const facing = (toP.x * Math.sin(this.yaw) + toP.z * Math.cos(this.yaw)) / Math.max(1e-4, dist);
          if (dist < 3.1 && facing > 0.85 && direct && this.attackCd <= 0 && this.stagger <= 0 && player.alive) this.startPounce(dist);
        } else if (dist < (this.cane ? 1.45 : 1.25) && this.attackCd <= 0 && this.stagger <= 0 && player.alive) {
          this.state = 'attack'; this.attackT = 0; this.didHit = false;
          g.audio && g.audio.zombieVoice(this, 'attack');
        }
        break;
      }
      case 'attack': {
        if (this.crawler) { this.updatePounce(dt, dist, toP); break; }
        this.attackT += dt / (this.runner ? 0.75 : this.cane ? 1.4 : 1.0);
        this.vel.multiplyScalar(0.85);
        this.yaw = turnTo(this.yaw, Math.atan2(toP.x, toP.z), dt * 4);
        if (!this.didHit && this.attackT > 0.48) {
          this.didHit = true;
          const facing = (toP.x * Math.sin(this.yaw) + toP.z * Math.cos(this.yaw)) / Math.max(1e-4, dist);
          if (dist < 1.45 && facing > 0.5 && player.alive) g.onZombieHit(this, dist);
        }
        if (this.attackT >= 1) { this.state = 'chase'; this.attackCd = 0.6 + Math.random() * 0.8; }
        break;
      }
      case 'grab': {
        this.vel.set(0, 0, 0);
        this.grabT += dt;
        this.yaw = turnTo(this.yaw, Math.atan2(toP.x, toP.z), dt * 8);
        // keep at arm's length in front of the player
        const want = _w.copy(player.pos).addScaledVector(toP.normalize(), -0.8);
        this.pos.lerp(_w.setY(0), Math.min(1, dt * 10));
        break;
      }
    }
    this.stagger = Math.max(0, this.stagger - dt);

    // integrate + collide
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x += this.react.push.x * dt; this.pos.z += this.react.push.z * dt;
    this.react.push.multiplyScalar(Math.max(0, 1 - dt * 6));
    g.world.collideCircle(this.pos, this.radius);
    // do not overlap the player
    const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z, pd = Math.hypot(px, pz);
    const minD = this.state === 'grab' ? 0.72 : 0.62;
    if (pd < minD && pd > 1e-4) { this.pos.x = player.pos.x + px / pd * minD; this.pos.z = player.pos.z + pz / pd * minD; }

    // voice
    this.voiceT -= dt;
    if (this.voiceT <= 0 && g.audio) {
      this.voiceT = (this.alert ? 2.5 : 5) + Math.random() * 5;
      if (dist < 25) g.audio.zombieVoice(this, this.state === 'feed' ? 'feed' : this.alert ? 'chase' : 'idle');
    }
    this._animate(dt);
  }

  wake() {
    if (this.alert || this.dead) return;
    this.alert = true;
    if (this.state === 'feed' || this.state === 'dormant' || this.state === 'idle') this.state = 'chase';
    this.stagger = this.state === 'feed' ? 0.8 : 0.2;
    this.game.audio && this.game.audio.zombieVoice(this, 'alert');
  }

  _animate(dt) {
    const p = this.pose.clear();
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.react.update(dt);
    this.caneClip = false;
    if (this.crawler) this._poseCrawler(p, dt, spd);
    else if (this.cane && this.state !== 'feed' && this.state !== 'grab') this._poseCane(p, dt, spd);
    else switch (this.state) {
      case 'feed': poseFeed(p, this.t); break;
      case 'attack': {
        poseShamble(p, this.phase, { reach: this.reach, limp: this.limp, lean: this.arch ? this.arch.lean : 0.3 });
        const a = this.tmpPose.clear(); poseAttack(a, this.attackT);
        p.blend(a, Math.min(1, this.attackT * 4) * Math.min(1, (1 - this.attackT) * 5 + 0.2));
        break;
      }
      case 'grab': {
        poseAttack(p, 0.5);
        p.addB(BI.jaw, 0.3 + Math.sin(this.t * 14) * 0.15);
        p.addB(BI.head, Math.sin(this.t * 9) * 0.12, Math.sin(this.t * 7) * 0.15, 0);
        break;
      }
      default: {
        if ((this.runner || this.sprint) && spd > 1.5) {
          this.phase += dt * spd * 2.4;
          poseRun(p, this.phase);
        } else {
          const stride = 0.55 + this.limp * 0.1;
          this.phase += dt * spd / stride * Math.PI;
          const w = Math.min(1, spd / 0.4);
          const narrow = this.arch && this.arch.stride;      // pencil skirt: short, tight steps
          poseShamble(p, this.phase, { reach: this.alert ? this.reach : this.reach * 0.3, limp: this.limp, stride: narrow ? narrow + spd * 0.05 : 0.34 + spd * 0.08, knee: narrow ? 0.65 : 0.9, lean: this.arch ? this.arch.lean : 0.3 });
          if (w < 1) { const idle = this.tmpPose.clear(); poseIdle(idle, this.t, { seed: this.id }); p.blend(idle, 1 - w); }
        }
      }
    }
    // smooth transitions between states
    this.prevPose.blend(p, Math.min(1, dt * 10));
    const out = this.tmpPose.copy(this.prevPose);
    this.react.applyTo(out);
    applyPose(this.body, out);
    if (this.cane) { if (this.caneClip) this.body.bones[CANE].quaternion.copy(this.caneQ); else steadyCane(this.body.bones); }
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
  }

  // Crawler: IK crawl on all fours (anim.js poseCrawl), prowling on hands and knees and breaking into a
  // bear-crawl sprint with speed, advanced by distance covered; the kit's leap during a pounce; kneeling
  // when it latches on.
  _poseCrawler(p, dt, spd) {
    if (this.state === 'feed') { poseFeed(p, this.t); return; }
    if (this.state === 'grab') { poseKneelGrab(p, this.t); return; }
    if (this.state === 'attack') {
      const C = this.clips;
      C.windowLeap.sample(p, this.attackT);
      // keep the crouch height, scale the arc above it with the leap length
      const base = C.windowLeap.root[1];
      p.root.y = base + (p.root.y - base) * this.leapV;
      return;
    }
    const G = this.arch.gait, k = THREE.MathUtils.smoothstep(spd, 1.2, 2.6);
    const stride = G.prowl + (G.gallop - G.prowl) * k;
    if (spd > 0.05) this.gait = (this.gait + dt * spd / stride) % 1;
    const J = this.tpl.J, look = Math.sin(this.t * 0.37 + this.id) * 0.5 * (1 - Math.min(1, spd / 0.3));
    if (k < 1) poseCrawl(p, J, this.gait, { gallop: 0, stride, t: this.t, look });
    if (k > 0) {
      const a = poseCrawl(this.auxPose.clear(), J, this.gait, { gallop: 1, stride, t: this.t, look });
      if (k < 1) p.blend(a, k); else p.copy(a);
    }
  }

  // Grandmother: the kit's cane walk for spine, arms, head and cane over short shuffling steps matched to
  // ground speed; the kit's cane swing when she attacks.
  _poseCane(p, dt, spd) {
    const C = this.clips;
    if (this.state === 'attack') {
      const t = this.attackT * C.caneAttack.duration;
      C.caneAttack.sample(p, t);
      C.caneAttack.caneQuat(t, this.caneQ); this.caneClip = true;
      return;
    }
    const stride = 0.17;
    this.phase += dt * spd / stride * Math.PI;
    const t = (this.phase / (Math.PI * 2)) % 1 * C.caneWalk.duration;
    C.caneWalk.sample(p, t);
    C.caneWalk.caneQuat(t, this.caneQ); this.caneClip = true;
    const legs = this.auxPose.clear();
    const w = Math.min(1, spd / 0.2);
    if (w > 0) poseShamble(legs, this.phase, { stride: 0.14 + spd * 0.06, knee: 0.55, limp: 0.2, reach: 0, lean: 0 });
    for (const b of LEG_BONES) for (let k = 0; k < 3; k++) p.r[b * 3 + k] = p.r[b * 3 + k] * (1 - w) + legs.r[b * 3 + k] * w;
    p.root.y += legs.root.y * w * 0.5;
    p.addB(BI.head, 0, Math.sin(this.t * 0.4 + this.id) * 0.3 * (1 - w), 0);
  }

  // ------------------------------------------------------------------ kit archetypes
  // Speed multiplier while chasing: erratic commuters sprint in bursts, stalkers rush the last metres,
  // the grandmother lurches once you are close.
  archBoost(dt, dist, direct) {
    const a = this.arch;
    this.sprint = false;
    if (a.erratic && this.alert) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.bursting = !this.bursting;
        this.burstT = this.bursting ? 0.9 + Math.random() * 0.9 : 3 + Math.random() * 4;
        if (this.bursting && dist < 20) this.game.audio && this.game.audio.zombieVoice(this, 'chase');
      }
      if (this.bursting) { this.sprint = true; return 2.7; }
      // twitching head and shoulders between bursts
      if (Math.random() < dt * 1.5) { this.react.impulse(BI.head, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 9); this.react.impulse(BI.chest, 0, (Math.random() - 0.5) * 5, 0); }
    }
    if (a.stalker && direct && dist < 4.5 && dist > 1.3) { this.sprint = true; return 2.4; }
    if (a.cane && direct && dist < 2.6) return 2.0;
    return 1;
  }

  startPounce(dist) {
    this.state = 'attack'; this.attackT = 0; this.didHit = false;
    // horizontal travel of the kit leap is 2.56 m: scale it to land on the player
    this.leapH = THREE.MathUtils.clamp((dist - 0.55) / 2.56, 0.3, 1.2);
    this.leapV = THREE.MathUtils.clamp(this.leapH * 1.1, 0.4, 1);
    this.leapPrev = 0;
    this.game.audio && this.game.audio.zombieVoice(this, 'attack');
  }

  updatePounce(dt, dist, toP) {
    const g = this.game, clip = this.clips.windowLeap;
    this.attackT += dt * 1.15;
    if (this.attackT < 0.2) this.yaw = turnTo(this.yaw, Math.atan2(toP.x, toP.z), dt * 8);   // line up before takeoff
    const tr = clip.travel(this.attackT) * this.leapH, step = tr - this.leapPrev;
    this.leapPrev = tr;
    this.vel.set(Math.sin(this.yaw) * step / dt, 0, Math.cos(this.yaw) * step / dt);
    if (!this.didHit && this.attackT > 0.45 && this.attackT < 1.35 && dist < 1.15 && g.player.alive) {
      this.didHit = true;
      const facing = (toP.x * Math.sin(this.yaw) + toP.z * Math.cos(this.yaw)) / Math.max(1e-4, dist);
      if (facing > 0.3) g.onZombieHit(this, dist, 0.6);
      if (this.state !== 'attack') return;              // it latched on (grab)
      this.attackT = Math.max(this.attackT, 1.25);       // bounced off: drop to the floor
    }
    if (this.attackT >= clip.duration) { this.state = 'chase'; this.vel.set(0, 0, 0); this.attackCd = 1.2 + Math.random() * 1.2; }
  }

  // Plate carriers soak torso hits; hardhats and helmets deflect shots above the brow. Sparks, no blood.
  armourHit(info) {
    const a = this.arch, zone = info.cap.zone;
    let plate = zone === 'torso' && a.armor;
    if (!plate && zone === 'head' && this.hardHead) {
      const hb = this.body.bones[BI.head];
      hb.updateWorldMatrix(true, false);
      const local = _w.copy(info.point).applyMatrix4(_m.copy(hb.matrixWorld).invert());
      plate = local.y > this.hardHead.brow;
    }
    if (!plate) return false;
    const g = this.game;
    g.fx.impact(info.point, _v.copy(info.dir).negate(), SURF.METAL, info.dir);
    g.audio && g.audio.impact(SURF.METAL, info.point);
    this.react.impulse(zone === 'head' ? BI.head : BI.chest, -6, 0, 0);
    return true;
  }

  // ------------------------------------------------------------------ hit detection
  updateCaps(frame) {
    if (this.capsFrame === frame) return;
    this.capsFrame = frame;
    this.root.updateMatrixWorld(true);
    const J = this.tpl.J;
    for (const c of this.caps) {
      const bone = this.body.bones[c.bone];
      bone.getWorldPosition(c.a);
      if (c.j1) {
        _v.set(J[c.j1][0] - J[c.j0][0], J[c.j1][1] - J[c.j0][1], J[c.j1][2] - J[c.j0][2]);
        bone.getWorldQuaternion(_q);
        c.b.copy(c.a).add(_v.applyQuaternion(_q));
      } else c.b.copy(c.a);
    }
  }

  // ray vs capsules; returns {t, cap} of nearest
  raycast(o, d, maxT, frame) {
    // cheap bounding test first
    _v.copy(this.dead ? this.ragdoll.p[0] : this.pos).setY(this.dead ? this.ragdoll.p[0].y : this.boundY);
    const oc = _a.subVectors(o, _v);
    const bproj = oc.dot(d);
    const cdist2 = oc.lengthSq() - bproj * bproj;
    if (cdist2 > this.boundR * this.boundR) return null;
    this.updateCaps(frame);
    let best = null;
    for (const c of this.caps) {
      if (this.headless && c.zone === 'head') continue;
      const t = rayCapsule(o, d, c.a, c.b, c.r);
      if (t !== null && t < maxT && (!best || t < best.t)) best = { t, cap: c };
    }
    return best;
  }

  // ------------------------------------------------------------------ damage
  hit(info) {
    // info: {point, dir, damage, cap, weapon, force}
    const g = this.game;
    const zone = info.cap.zone;
    let dmg = info.damage * ZONE_MUL[zone];
    if (this.invulnerable && !this.dead) {
      g.fx.bloodHit(info.point, info.dir, 0.6, zone);
      this.body.addBlood(info.point, info.cap.bone, 0.04);
      this.react.impulse(BI.chest, -4, 0, 0);
      return;
    }
    if (this.dead) {
      // shooting corpses: physics impulse + blood
      this.ragdoll.impulse(info.point, info.dir, info.force * 0.8, 0.3);
      g.fx.bloodHit(info.point, info.dir, 0.6, zone);
      this.body.addBlood(info.point, info.cap.bone, 0.035);
      return;
    }
    const armour = this.arch ? this.armourHit(info) : false;
    if (armour) dmg *= zone === 'head' ? 0.3 : this.arch.armor;
    this.hp -= dmg;
    this.wake();
    if (!armour) {
      this.body.addBlood(info.point, info.cap.bone, zone === 'head' ? 0.04 : 0.05);
      g.fx.bloodHit(info.point, info.dir, zone === 'head' ? 1.4 : 1, zone);
    }
    // reaction impulses (angles/sec) in local space
    const local = _v.copy(info.dir).applyAxisAngle(_w.set(0, 1, 0), -this.yaw);
    const k = info.force * 0.9;
    const side = Math.sign(info.point.x - this.pos.x) || 1;
    if (zone === 'head' || zone === 'neck') { this.react.impulse(BI.head, -local.z * 9 * k, local.x * 5 * k, -local.x * 6 * k); this.react.impulse(BI.neck, -local.z * 4 * k, 0, 0); }
    else if (zone === 'torso') { this.react.impulse(BI.chest, -local.z * 6 * k, local.x * 5 * k, -local.x * 3 * k); this.react.impulse(BI.spine, -local.z * 4 * k, 0, 0); }
    else if (zone === 'arm') { this.react.impulse(info.cap.bone, -local.z * 10 * k, 0, local.x * 6 * k); this.react.impulse(BI.chest, 0, local.x * 4 * k, 0); }
    else if (zone === 'leg') { this.react.impulse(info.cap.bone, -local.z * 6 * k, 0, 0); this.react.impulse(BI.hips, 0, 0, -local.x * 3 * k); this.stagger = Math.max(this.stagger, 0.5); }
    this.react.push.addScaledVector(_w.copy(info.dir).setY(0), info.force * 0.9);
    if (zone === 'torso' && info.force > 1.5) this.stagger = Math.max(this.stagger, 0.35);
    if (this.state === 'attack' && dmg > 25 && !this.crawler) { this.state = 'chase'; this.attackCd = 0.8; }
    if (this.state === 'grab' && dmg > 20) g.releaseGrab && g.releaseGrab(this, true);
    if (this.hp <= 0) {
      if (zone === 'head' && (info.weapon === 'shotgun' || info.damage * ZONE_MUL.head > 170) && info.dist < 6) this.destroyHead(info);
      this.die(info);
    }
  }

  destroyHead(info) {
    this.headless = true;
    const hb = this.body.bones[BI.head];
    hb.scale.setScalar(0.12);
    this.game.fx.headBurst(info.point, info.dir);
  }

  die(info) {
    if (this.dead) return;
    const g = this.game;
    // capture previous-frame positions for momentum
    this.ragdoll.snapshot(this.snap);
    // advance pose a hair so velocity is non-zero; seed with body velocity
    this.dead = true;
    this.state = 'dead';
    const prev = this.snap.map(p => p.clone().addScaledVector(this.vel, -1 / 60).addScaledVector(this.react.push, -1 / 60));
    this.ragdoll.start(prev, info ? { point: info.point, dir: info.dir, strength: info.force * (info.cap.zone === 'head' ? 1.4 : 1), radius: 0.45 } : null);
    if (info && info.cap.zone === 'leg') this.ragdoll.impulse(info.point, _v.set(0, 0, 0).sub(info.dir).setY(0).normalize(), 0.5, 0.5);
    g.audio && g.audio.zombieVoice(this, 'death');
    this.eyeGlow = 0;
    this.body.eyeMat.emissiveIntensity = 0;
    // blood pool that spreads under the corpse
    const bp = g.fx.makeBloodPool();
    if (bp) {
      this.ragdoll.centre(_v);
      bp.position.set(_v.x, 0.012 + Math.random() * 0.004, _v.z);
      bp.userData.t = 0; bp.userData.max = 0.9 + Math.random() * 0.6;
      this.bloodPool = bp;
    }
    if (this.onDeath) this.onDeath(this);
    g.onZombieDeath && g.onZombieDeath(this, info);
  }

  // Kill silently into a lying pose (pre-simulated corpse)
  makeCorpse(pos, yaw, sims = 180) {
    this.place(pos, yaw);
    poseIdle(this.pose.clear(), 0);
    applyPose(this.body, this.pose);
    this.root.updateMatrixWorld(true);
    this.dead = true; this.state = 'dead';
    this.ragdoll.snapshot(this.snap);
    const prev = this.snap.map(p => p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)));
    this.ragdoll.start(prev);
    // topple: push the upper body
    this.ragdoll.impulse(this.ragdoll.p[4].clone(), new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 3, 1.2);
    for (let i = 0; i < sims; i++) this.ragdoll.step(1 / 60);
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.material.dispose();
    this.body.eyeMat.dispose();
    this.body.skeleton.dispose();   // frees the per-body bone texture (geometry is shared by the template)
    if (this.bloodPool) { this.bloodPool.parent && this.bloodPool.parent.remove(this.bloodPool); }
  }
}

function turnTo(a, b, maxStep) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return a + d;
}

// ray (o, unit d) vs capsule (a,b,r); returns t or null
export function rayCapsule(o, d, a, b, r) {
  const ba = _cBA.subVectors(b, a), oa = _cOA.subVectors(o, a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  let A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t > 0) return t;
    const oc = y <= 0 ? oa : _cOC.subVectors(o, b);
    B = d.dot(oc); C = oc.dot(oc) - r * r; h = B * B - C;
    if (h > 0) { const t2 = -B - Math.sqrt(h); if (t2 > 0) return t2; }
    return null;
  }
  // degenerate (sphere)
  const oc = oa; B = d.dot(oc); C = oc.dot(oc) - r * r; h = B * B - C;
  if (h > 0) { const t2 = -B - Math.sqrt(h); if (t2 > 0) return t2; }
  return null;
}
const _cBA = new THREE.Vector3(), _cOA = new THREE.Vector3(), _cOC = new THREE.Vector3();
