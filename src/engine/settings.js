// User settings with quality presets, device auto-detection and persistence.
const KEY = 'deadair.settings.v1';

export const PRESETS = {
  low: {
    resScale: 0.7, minScale: 0.5, dynamicRes: true, dprCap: 1, msaa: 0, shadows: 1, shadowSize: 512,
    bloom: true, bloomLevels: 4, motionBlur: false, mbSamples: 4, mbStrength: 0.8, lightPool: 3,
    rain: 0.4, maxCorpses: 6, bodyDetail: 0, lowTex: true, texCap: 256, sharpen: 0.25, targetFps: 45,
  },
  medium: {
    resScale: 0.8, minScale: 0.5, dynamicRes: true, dprCap: 1.25, msaa: 0, shadows: 1, shadowSize: 1024,
    bloom: true, bloomLevels: 5, motionBlur: true, mbSamples: 5, mbStrength: 0.9, lightPool: 5,
    rain: 0.7, maxCorpses: 10, bodyDetail: 1, lowTex: false, texCap: 512, sharpen: 0.3, targetFps: 55,
  },
  high: {
    resScale: 1.0, minScale: 0.6, dynamicRes: true, dprCap: 1.5, msaa: 0, shadows: 2, shadowSize: 1024,
    bloom: true, bloomLevels: 6, motionBlur: true, mbSamples: 8, mbStrength: 1.0, lightPool: 6,
    rain: 1.0, maxCorpses: 16, bodyDetail: 2, lowTex: false, texCap: 1024, sharpen: 0.35, targetFps: 58,
  },
  ultra: {
    resScale: 1.0, minScale: 0.75, dynamicRes: false, dprCap: 2, msaa: 4, shadows: 2, shadowSize: 2048,
    bloom: true, bloomLevels: 7, motionBlur: true, mbSamples: 12, mbStrength: 1.0, lightPool: 8,
    rain: 1.2, maxCorpses: 24, bodyDetail: 2, lowTex: false, texCap: 2048, sharpen: 0.35, targetFps: 58,
  },
};

export const DEFAULTS = {
  quality: 'high',
  // lens / footage look (user facing, independent of preset)
  fisheye: 0.6, chromatic: 0.5, grain: 0.8, compression: true, headBob: 1.0, overlay: true,
  fov: 82, sensitivity: 1.0, touchSensitivity: 1.0, invertY: false, aimAssist: true, crosshair: 'dot',
  subtitles: true, voice: true, master: 0.9, sfx: 1.0, voiceVol: 1.0, ambience: 0.8, showFps: false,
  ...PRESETS.high,
};

export function isTouchDevice() {
  return (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
}

export function detectQuality() {
  const touch = isTouchDevice();
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) || '');
  } catch (e) { /* ignore */ }
  const g = gpu.toLowerCase();
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (/swiftshader|llvmpipe|software/.test(g)) return { quality: 'low', gpu };
  if (touch) {
    const strong = /apple gpu|apple a1[5-9]|apple m|adreno \(tm\) 7[3-9]|adreno.*7[3-9]\d|mali-g7[1-9]|mali-g[89]|immortalis|xclipse/.test(g) || (mem >= 8 && cores >= 8);
    return { quality: strong ? 'medium' : 'low', gpu };
  }
  if (/nvidia|geforce|rtx|gtx|radeon (rx|pro)|amd|apple m[1-9]/.test(g)) return { quality: mem >= 8 ? 'high' : 'medium', gpu };
  // fill-rate budget (perf/README.md): Iris Xe-class holds MEDIUM, UHD 6xx / HD Graphics only LOW
  if (/iris|arc|xe graphics/.test(g)) return { quality: 'medium', gpu };
  if (/intel|uhd|hd graphics/.test(g)) return { quality: 'low', gpu };
  return { quality: 'medium', gpu };
}

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = [];
    this.firstRun = true;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
    if (stored && typeof stored === 'object') {
      this.firstRun = false;
      Object.assign(this.values, stored);
    } else {
      const d = detectQuality();
      this.detected = d;
      this.applyPreset(d.quality, false);
      if (isTouchDevice()) { this.values.fov = 78; this.values.crosshair = 'dot'; this.values.aimAssist = true; }
    }
  }
  get(k) { return this.values[k]; }
  set(k, v, save = true) {
    this.values[k] = v;
    if (k in PRESETS.high && k !== 'quality') this.values.quality = this.matchPreset();
    if (save) this.save();
    this.emit(k);
  }
  applyPreset(name, save = true) {
    if (!PRESETS[name]) return;
    Object.assign(this.values, PRESETS[name]);
    this.values.quality = name;
    if (save) this.save();
    this.emit('quality');
  }
  matchPreset() {
    for (const [n, p] of Object.entries(PRESETS)) {
      if (Object.entries(p).every(([k, v]) => this.values[k] === v)) return n;
    }
    return 'custom';
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* storage unavailable */ } }
  onChange(fn) { this.listeners.push(fn); }
  emit(k) { for (const fn of this.listeners) fn(k, this.values); }
}
