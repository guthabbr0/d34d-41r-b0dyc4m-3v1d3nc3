// Unified input: keyboard + mouse (pointer lock), touch (floating stick, look pad, buttons), gamepad.
const ACTIONS = ['fire', 'aim', 'reload', 'light', 'use', 'swap', 'sprint', 'shove', 'pause', 'skip', 'weapon1', 'weapon2', 'mash'];

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.held = {}; this.edge = {}; this.src = {};
    for (const a of ACTIONS) { this.held[a] = false; this.edge[a] = false; }
    this.keys = new Set();
    this.enabled = false;        // gameplay input active
    this.locked = false;
    this.touchMode = false;
    this.lastDevice = 'kbm';
    this.aimToggle = false;
    this.gpIndex = -1;
    this._bind();
  }

  _set(action, down, source = 'k') {
    const key = action + ':' + source;
    if (down) {
      if (!this.src[key]) { this.src[key] = true; if (!this.held[action]) this.edge[action] = true; }
    } else delete this.src[key];
    this.held[action] = Object.keys(this.src).some(k => k.startsWith(action + ':'));
  }

  pressed(a) { return this.edge[a]; }

  _bind() {
    const keymap = {
      KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyR: 'reload', KeyF: 'light', KeyE: 'use', KeyQ: 'swap', KeyV: 'shove',
      Digit1: 'weapon1', Digit2: 'weapon2', Escape: 'pause', KeyP: 'pause', Space: 'skip', Enter: 'skip',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.lastDevice = 'kbm';
      const k = keymap[e.code];
      if (!k) return;
      if (['fwd', 'back', 'left', 'right'].includes(k)) this.keys.add(k);
      else this._set(k, true, 'k');
      if (k === 'shove' || k === 'use' || k === 'skip') this._set('mash', true, 'k' + k);
      if (this.enabled && e.code !== 'Escape' && !e.metaKey && !e.ctrlKey) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = keymap[e.code];
      if (!k) return;
      if (['fwd', 'back', 'left', 'right'].includes(k)) this.keys.delete(k);
      else this._set(k, false, 'k');
      if (k === 'shove' || k === 'use' || k === 'skip') this._set('mash', false, 'k' + k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); for (const k of Object.keys(this.src)) if (k.endsWith(':k') || k.endsWith(':m')) delete this.src[k]; for (const a of ACTIONS) this.held[a] = false; });

    // mouse
    this.canvas.addEventListener('mousedown', (e) => {
      this.lastDevice = 'kbm';
      if (!this.enabled) return;
      if (!this.locked && this.wantLock) this.requestLock();
      if (e.button === 0) this._set('fire', true, 'm');
      if (e.button === 2) this._set('aim', true, 'm');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._set('fire', false, 'm');
      if (e.button === 2) this._set('aim', false, 'm');
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (e.movementX || e.movementY) this.lastDevice = 'kbm';
      if (this.locked || (e.buttons & 3)) {
        const s = 0.0022 * this.settings.get('sensitivity');
        this.look.dx += e.movementX * s;
        this.look.dy += e.movementY * s * (this.settings.get('invertY') ? -1 : 1);
      }
    });
    window.addEventListener('wheel', (e) => { if (this.enabled && Math.abs(e.deltaY) > 20) this._pulse('swap'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.enabled && this.onUnlock) this.onUnlock();
    });
  }

  _pulse(a) { this.edge[a] = true; }

  requestLock() {
    if (this.touchMode) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => {}); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ---------------------------------------------------------------- touch
  bindTouch(el) {
    this.touchMode = true;
    this.touchRoot = el;
    const stick = el.querySelector('#stick'), knob = el.querySelector('#stickKnob');
    const buttons = el.querySelectorAll('[data-act]');
    let stickId = null, stickOrigin = null;
    const lookTouches = new Map();
    const R = 58;

    const onStart = (e) => {
      this.lastDevice = 'touch';
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) {
          const act = btn.dataset.act;
          btn.classList.add('down');
          if (act === 'aim') { this.aimToggle = !this.aimToggle; this._set('aim', this.aimToggle, 't'); btn.classList.toggle('on', this.aimToggle); }
          else this._set(act, true, 't' + t.identifier);
          if (act === 'shove' || act === 'use') this._set('mash', true, 't' + t.identifier + 'm');
          if (btn.dataset.look === '1') lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, btn });
          else lookTouches.set(t.identifier, { btnOnly: true, btn });
          continue;
        }
        if (t.target.closest && t.target.closest('.no-look')) continue;
        const w = window.innerWidth;
        if (t.clientX < w * 0.42 && stickId === null) {
          stickId = t.identifier;
          stickOrigin = { x: t.clientX, y: t.clientY };
          stick.style.transform = `translate(${t.clientX - 70}px, ${t.clientY - 70}px)`;
          stick.classList.add('active');
          knob.style.transform = 'translate(0px, 0px)';
        } else {
          lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
      this.touchHold = lookTouches.size > 0 || stickId !== null;
      if (this.enabled) e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
          const L = Math.hypot(dx, dy);
          if (L > R) {
            // drag the base along (floating stick)
            const k = (L - R) / L;
            stickOrigin.x += dx * k; stickOrigin.y += dy * k;
            stick.style.transform = `translate(${stickOrigin.x - 70}px, ${stickOrigin.y - 70}px)`;
            dx = t.clientX - stickOrigin.x; dy = t.clientY - stickOrigin.y;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / R; this.move.y = -dy / R;
          this.touchSprint = Math.hypot(this.move.x, this.move.y) > 0.97 && this.move.y > 0.7 && L > R * 1.25;
        } else if (lookTouches.has(t.identifier)) {
          const lt = lookTouches.get(t.identifier);
          if (lt.btnOnly) continue;
          const s = 0.0055 * this.settings.get('touchSensitivity') * (this.held.aim ? 0.6 : 1);
          this.look.dx += (t.clientX - lt.x) * s;
          this.look.dy += (t.clientY - lt.y) * s * (this.settings.get('invertY') ? -1 : 1);
          lt.x = t.clientX; lt.y = t.clientY;
        }
      }
      if (this.enabled) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.move.x = 0; this.move.y = 0; this.touchSprint = false;
          stick.classList.remove('active');
        }
        const lt = lookTouches.get(t.identifier);
        if (lt) {
          if (lt.btn) {
            lt.btn.classList.remove('down');
            const act = lt.btn.dataset.act;
            if (act !== 'aim') this._set(act, false, 't' + t.identifier);
            this._set('mash', false, 't' + t.identifier + 'm');
          }
          lookTouches.delete(t.identifier);
        }
      }
      this.touchHold = lookTouches.size > 0 || stickId !== null;
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    this.resetTouch = () => {
      stickId = null; lookTouches.clear(); this.move.x = this.move.y = 0; this.touchSprint = false;
      stick.classList.remove('active');
      for (const b of buttons) b.classList.remove('down');
      for (const k of Object.keys(this.src)) if (k.includes(':t')) delete this.src[k];
      for (const a of ACTIONS) this.held[a] = Object.keys(this.src).some(k => k.startsWith(a + ':'));
    };
  }

  setAimToggle(v) {
    this.aimToggle = v;
    this._set('aim', v, 't');
    const b = this.touchRoot && this.touchRoot.querySelector('[data-act="aim"]');
    if (b) b.classList.toggle('on', v);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    // keyboard movement
    if (!this.touchMode || this.keys.size) {
      const kx = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
      const ky = (this.keys.has('fwd') ? 1 : 0) - (this.keys.has('back') ? 1 : 0);
      if (kx || ky || !this.touchMode) {
        const L = Math.hypot(kx, ky) || 1;
        this.move.x = kx / L; this.move.y = ky / L;
      }
    }
    this._pollGamepad(dt);
  }

  _pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    if (!gp) { if (this.gpWas) { for (const k of Object.keys(this.src)) if (k.endsWith(':g')) delete this.src[k]; this.gpWas = false; } return; }
    const dz = (v) => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
    const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    const any = lx || ly || rx || ry || gp.buttons.some(b => b.pressed);
    if (any) { this.lastDevice = 'pad'; this.gpWas = true; }
    if (this.lastDevice !== 'pad') return;
    this.move.x = lx; this.move.y = -ly;
    const s = 2.6 * this.settings.get('sensitivity') * dt * (this.held.aim ? 0.55 : 1);
    this.look.dx += rx * Math.abs(rx) * s;
    this.look.dy += ry * Math.abs(ry) * s * (this.settings.get('invertY') ? -1 : 1);
    const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
    const map = [[7, 'fire'], [6, 'aim'], [2, 'reload'], [5, 'light'], [0, 'use'], [3, 'swap'], [10, 'sprint'], [1, 'shove'], [9, 'pause'], [0, 'skip'], [0, 'mash'], [1, 'mash']];
    const seen = {};
    for (const [i, a] of map) seen[a] = seen[a] || b(i);
    for (const [a, v] of Object.entries(seen)) this._set(a, v, 'g');
  }

  consumeLook() { const l = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = 0; this.look.dy = 0; return l; }

  endFrame() { for (const a of ACTIONS) this.edge[a] = false; }

  clearAll() {
    for (const k of Object.keys(this.src)) delete this.src[k];
    for (const a of ACTIONS) { this.held[a] = false; this.edge[a] = false; }
    this.keys.clear(); this.look.dx = this.look.dy = 0; this.move.x = this.move.y = 0;
    this.aimToggle = false;
    if (this.resetTouch) this.resetTouch();
  }
}
