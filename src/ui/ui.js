// DOM user interface: screens, HUD, settings, subtitles, title cards, loading log.
import { PRESETS } from '../engine/settings.js';

const $ = (id) => document.getElementById(id);

const SETTINGS_SCHEMA = {
  Graphics: [
    { key: 'quality', label: 'Quality preset', hint: 'Sets everything below. Changing a single option switches to Custom.', type: 'seg', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], preset: true },
    { key: 'resScale', label: 'Render resolution', hint: 'Share of screen resolution rendered before the footage filter.', type: 'range', min: 0.4, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'dynamicRes', label: 'Dynamic resolution', hint: 'Lowers resolution when the frame rate drops.', type: 'toggle' },
    { key: 'shadows', label: 'Flashlight shadows', type: 'seg', options: [[0, 'Off'], [1, 'On'], [2, 'High']] },
    { key: 'lightPool', label: 'Dynamic lights', hint: 'How many nearby lamps light the scene at once.', type: 'range', min: 2, max: 8, step: 1, fmt: v => `${v}` },
    { key: 'bodyDetail', label: 'Character detail', hint: 'Applies on next load.', type: 'seg', options: [[0, 'Low'], [1, 'Medium'], [2, 'High']] },
    { key: 'lowTex', label: 'Reduced textures', hint: 'Halves texture memory. Applies on next load.', type: 'toggle' },
    { key: 'bloom', label: 'Bloom and lens glare', type: 'toggle' },
    { key: 'motionBlur', label: 'Motion blur', type: 'toggle' },
    { key: 'msaa', label: 'Anti-aliasing (MSAA)', type: 'seg', options: [[0, 'Off'], [4, '4×']] },
    { key: 'rain', label: 'Rain density', type: 'range', min: 0, max: 1.2, step: 0.1, fmt: v => `${Math.round(v / 1.2 * 100)} %` },
    { key: 'maxCorpses', label: 'Bodies kept', hint: 'Oldest bodies are removed past this number.', type: 'range', min: 4, max: 24, step: 2, fmt: v => `${v}` },
    { key: 'showFps', label: 'Show frame rate', type: 'toggle' },
  ],
  Camera: [
    { key: 'fisheye', label: 'Lens distortion', hint: 'Wide-angle barrel distortion of a body-worn camera.', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'chromatic', label: 'Chromatic aberration', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'grain', label: 'Sensor noise', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'compression', label: 'Compression artefacts', type: 'toggle' },
    { key: 'headBob', label: 'Camera motion', hint: 'Walking bob and sway. Lower it if you get motion sick.', type: 'range', min: 0, max: 1.2, step: 0.1, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'fov', label: 'Field of view', type: 'range', min: 65, max: 100, step: 1, fmt: v => `${v}°` },
    { key: 'overlay', label: 'Timestamp overlay', type: 'toggle' },
    { key: 'crosshair', label: 'Aim dot', type: 'seg', options: [['dot', 'Dot'], ['off', 'Off']] },
  ],
  Controls: [
    { key: 'sensitivity', label: 'Mouse / stick sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { key: 'touchSensitivity', label: 'Touch look sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { key: 'invertY', label: 'Invert vertical look', type: 'toggle' },
    { key: 'aimAssist', label: 'Aim assist (touch & gamepad)', type: 'toggle' },
  ],
  Audio: [
    { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'sfx', label: 'Effects', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'ambience', label: 'Ambience', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'voiceVol', label: 'Voices', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
    { key: 'voice', label: 'Spoken dialogue', hint: 'Uses your device’s speech voices. Subtitles are always on.', type: 'toggle' },
  ],
};

export class UI {
  constructor(settings) {
    this.settings = settings;
    this.screens = ['gate', 'loading', 'menu', 'settings', 'controls', 'credits', 'pause', 'over', 'ending'];
    this.notifyT = 0; this.promptOn = false;
    this.subT = 0;
    this.logLines = [];
    this.onSettingChange = null;
    this.clockBase = Date.UTC(2026, 8, 24, 8, 13, 41) ; // 03:13:41 local (-0500)
    this.gameClock = 0;
    this.skipHeld = 0;
    this.settingsReturn = 'menu';
    this._buildSettings();
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.show(this.settingsReturn === 'pause' ? 'pause' : 'menu'));
  }

  show(name, keep = []) {
    for (const s of this.screens) { const el = $(s); if (el) el.hidden = !(s === name || keep.includes(s)); }
    this.current = name;
    const first = name && $(name) && $(name).querySelector('.btn.primary, .btn');
    if (first && !this.touch) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
  }
  hideAll() { for (const s of this.screens) $(s).hidden = true; this.current = null; }

  setTouch(on) {
    this.touch = on;
    document.body.classList.toggle('touch', on);
  }
  showTouch(on) { $('touch').hidden = !(on && this.touch); }
  showHud(on) { $('hud').hidden = !on; }
  showOverlay(on, buffer = false) {
    $('overlay').hidden = !(on && this.settings.get('overlay'));
    $('bcRec').textContent = buffer ? 'BUFFERING · NO AUDIO' : 'REC';
    $('bcRec').classList.toggle('bc-buffer', buffer);
  }

  // ---------------------------------------------------------------- loading
  loadProgress(p, label) {
    $('loadBar').style.width = `${Math.round(p * 100)}%`;
    if (label && label !== this._lastLabel) {
      this._lastLabel = label;
      const log = $('log');
      const prev = log.lastElementChild;
      if (prev) { prev.classList.add('ok'); prev.textContent = prev.textContent.replace('…', ' ✓'); }
      const d = document.createElement('div');
      d.textContent = `> ${label}…`;
      log.appendChild(d);
      while (log.children.length > 7) log.removeChild(log.firstChild);
    }
    $('loadStatus').textContent = p >= 1 ? 'Verified' : `Decoding · ${Math.round(p * 100)} %`;
    const hex = '0123456789abcdef';
    let h = 'SHA-256 ';
    for (let i = 0; i < 64; i++) h += i < p * 64 ? hex[(i * 7 + 3) % 16] : hex[(Math.random() * 16) | 0];
    $('hash').textContent = h;
  }

  // ---------------------------------------------------------------- HUD
  setObjective(text) {
    const el = $('objective');
    if (!text) { el.classList.remove('show'); return; }
    $('objText').textContent = text;
    el.classList.add('show');
    clearTimeout(this._objT);
    this._objT = setTimeout(() => el.classList.remove('show'), 9000);
  }
  flashObjective() { if ($('objText').textContent) { $('objective').classList.add('show'); clearTimeout(this._objT); this._objT = setTimeout(() => $('objective').classList.remove('show'), 5000); } }
  notify(text, dur = 2.4) { const el = $('notify'); el.textContent = text; el.classList.add('show'); this.notifyT = dur; }
  prompt(label) {
    const el = $('prompt');
    if (label) { $('promptText').textContent = label; el.classList.add('show'); }
    else el.classList.remove('show');
    const u = $('tUse'); if (u) u.hidden = !label;
  }
  ammo(w) {
    const cur = w.current;
    $('ammoMag').textContent = w.ammo[cur];
    $('ammoRes').textContent = `/ ${w.reserve[cur]}`;
    $('ammoName').textContent = (w.def.name + (w.state === 'reload' ? ' · RELOADING' : '')).toUpperCase();
    $('ammo').classList.toggle('low', w.ammo[cur] <= Math.ceil(w.def.mag * 0.25));
  }
  crosshair(x, y, show) {
    const c = $('cross');
    c.style.opacity = show && this.settings.get('crosshair') === 'dot' ? 1 : 0;
    c.style.left = `${x}px`; c.style.top = `${y}px`;
  }
  hitMarker(kill) {
    const h = $('hitmark');
    h.classList.toggle('kill', !!kill);
    h.style.opacity = 1;
    clearTimeout(this._hmT); this._hmT = setTimeout(() => { h.style.opacity = 0; }, kill ? 260 : 120);
  }
  qte(show, progress = 0, touch = false) {
    $('qte').classList.toggle('show', show);
    if (show) { $('qteFill').style.width = `${Math.min(100, progress * 100)}%`; $('qteKey').textContent = touch ? 'TAP SHOVE' : 'MASH V / E'; }
  }
  fps(v) { const el = $('fps'); el.hidden = !this.settings.get('showFps'); if (!el.hidden) el.textContent = v; }

  subtitle(who, text, radio, dur) {
    const el = $('subs');
    if (!who) { el.classList.remove('show'); return; }
    el.querySelector('span').innerHTML = `<b>${who}</b>${escapeHtml(text)}`;
    el.classList.toggle('radio', !!radio);
    el.classList.add('show');
    this.subT = dur;
  }

  // Typewriter evidence card. Resolves when typed + held.
  card(lines, { hold = 2, speed = 0.022, clear = false } = {}) {
    const el = $('card'), pre = el.querySelector('pre');
    el.classList.toggle('clear', clear);
    el.classList.add('show');
    const text = Array.isArray(lines) ? lines.join('\n') : lines;
    this._cardToken = (this._cardToken || 0) + 1;
    const tok = this._cardToken;
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (tok !== this._cardToken) return resolve();
        i = Math.min(text.length, i + 2);
        pre.innerHTML = formatCard(text.slice(0, i)) + '<span class="caret"></span>';
        if (i < text.length) setTimeout(step, speed * 1000 * 2);
        else setTimeout(resolve, hold * 1000);
      };
      step();
    });
  }
  hideCard() { this._cardToken = (this._cardToken || 0) + 1; $('card').classList.remove('show'); }
  blackout(on) { const el = $('card'); el.classList.toggle('clear', false); el.querySelector('pre').innerHTML = ''; el.classList.toggle('show', on); }

  skipHint(show, progress = 0, touch = false) {
    $('skip').classList.toggle('show', show);
    $('skipText').textContent = touch ? 'HOLD ANYWHERE TO SKIP' : 'HOLD SPACE TO SKIP';
    $('skipRing').style.strokeDashoffset = `${50.3 * (1 - progress)}`;
  }
  playback(text) { const el = $('playback'); el.hidden = !text; if (text) el.textContent = text; }

  update(dt) {
    if (this.notifyT > 0) { this.notifyT -= dt; if (this.notifyT <= 0) $('notify').classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subs').classList.remove('show'); }
  }

  setClock(sec) {
    const d = new Date(this.clockBase + sec * 1000 - 5 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    $('bcTime').textContent = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} -0500`;
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  // ---------------------------------------------------------------- settings panel
  _buildSettings() {
    const tabs = $('setTabs'), body = $('setBody');
    const names = Object.keys(SETTINGS_SCHEMA);
    this.setTab = names[0];
    const render = () => {
      tabs.innerHTML = '';
      for (const n of names) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = n; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(n === this.setTab));
        b.addEventListener('click', () => { this.setTab = n; render(); });
        tabs.appendChild(b);
      }
      body.innerHTML = '';
      for (const f of SETTINGS_SCHEMA[this.setTab]) body.appendChild(this._row(f, render));
      if (this.setTab === 'Graphics') {
        const n = document.createElement('p'); n.className = 'note';
        const q = this.settings.get('quality');
        n.textContent = `Current preset: ${q.toUpperCase()}${this.settings.detected ? ` · detected: ${this.settings.detected.quality.toUpperCase()}` : ''}. Character detail and texture options take effect after reloading the page.`;
        body.appendChild(n);
      }
    };
    this._renderSettings = render;
    render();
    $('setClose').addEventListener('click', () => this.show(this.settingsReturn));
    $('setDefaults').addEventListener('click', () => {
      const q = (this.settings.detected && this.settings.detected.quality) || 'high';
      this.settings.applyPreset(q);
      render(); this.onSettingChange && this.onSettingChange('quality');
    });
  }

  _row(f, rerender) {
    const s = this.settings;
    const row = document.createElement('div'); row.className = 'row';
    const id = 'set_' + f.key;
    const lab = document.createElement('label'); lab.htmlFor = id; lab.innerHTML = `${f.label}${f.hint ? `<small>${f.hint}</small>` : ''}`;
    row.appendChild(lab);
    const v = s.get(f.key);
    const emit = (val) => {
      if (f.preset) { s.applyPreset(val); rerender(); }
      else s.set(f.key, val);
      this.onSettingChange && this.onSettingChange(f.key);
      if (f.type !== 'range') rerender();
    };
    if (f.type === 'seg') {
      const seg = document.createElement('div'); seg.className = 'seg'; seg.id = id; seg.setAttribute('role', 'group');
      const opts = f.preset ? [...f.options, ...(v === 'custom' ? [['custom', 'Custom']] : [])] : f.options;
      for (const [val, text] of opts) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
        b.setAttribute('aria-pressed', String(v === val));
        if (val !== 'custom') b.addEventListener('click', () => emit(val));
        seg.appendChild(b);
      }
      row.appendChild(seg);
    } else if (f.type === 'toggle') {
      const seg = document.createElement('div'); seg.className = 'seg'; seg.id = id;
      for (const [val, text] of [[true, 'On'], [false, 'Off']]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', String(!!v === val));
        b.addEventListener('click', () => emit(val));
        seg.appendChild(b);
      }
      row.appendChild(seg);
    } else if (f.type === 'range') {
      const wrap = document.createElement('div'); wrap.className = 'range';
      const inp = document.createElement('input'); inp.type = 'range'; inp.id = id; inp.min = f.min; inp.max = f.max; inp.step = f.step; inp.value = v;
      const out = document.createElement('output'); out.textContent = f.fmt(+v);
      inp.addEventListener('input', () => { out.textContent = f.fmt(+inp.value); emit(+inp.value); });
      inp.addEventListener('change', () => rerender());
      wrap.appendChild(inp); wrap.appendChild(out);
      row.appendChild(wrap);
    }
    return row;
  }
  openSettings(from) {
    this.settingsReturn = from;
    this._renderSettings();
    this.show('settings');
  }
}

function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function formatCard(t) { return escapeHtml(t).replace(/\*(.+?)\*/g, '<span class="hl">$1</span>'); }
export { PRESETS };
