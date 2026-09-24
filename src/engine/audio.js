// Procedural audio: every sound is synthesised at load time (OfflineAudioContext) and played
// through a "body-worn camera microphone" chain: band-limited, heavily compressed, clipping.
import { mulberry } from './post.js';

const SR = 44100;

// ------------------------------------------------------------------ offline synthesis helpers
function oac(dur, ch = 1) { return new OfflineAudioContext(ch, Math.ceil(dur * SR), SR); }
let noiseBuf = null;
function noise(ctx, dur, color = 'white', seed = 1) {
  const b = ctx.createBuffer(1, Math.ceil(dur * SR), SR);
  const d = b.getChannelData(0);
  const r = mulberry(seed);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = r() * 2 - 1;
    if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  const s = ctx.createBufferSource(); s.buffer = b; return s;
}
function env(ctx, node, t0, a, peak, tau, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.setTargetAtTime(0, t0 + a, tau);
  node.connect(g);
  return g;
}
function filt(ctx, type, f, Q = 0.7, gain = 0) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gain; return b; }
function shaper(ctx, drive) {
  const w = ctx.createWaveShaper();
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  w.curve = c; return w;
}
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

// Each recipe returns a Promise<AudioBuffer>
const R = {};

R.pistol = async (v = 0) => {
  const c = oac(0.6); const r = mulberry(11 + v);
  const out = c.createGain(); out.gain.value = 1;
  const clip = shaper(c, 2.6); chain(out, clip, c.destination);
  // supersonic crack
  const n1 = noise(c, 0.05, 'white', 3 + v); chain(env(c, chain(n1, filt(c, 'highpass', 1800)), 0, 0.0005, 1.6, 0.004), out); n1.start(0);
  // muzzle blast body with a falling lowpass
  const n2 = noise(c, 0.5, 'white', 7 + v); const lp = filt(c, 'lowpass', 5000, 0.9);
  lp.frequency.setValueAtTime(5200, 0); lp.frequency.exponentialRampToValueAtTime(420, 0.12);
  chain(env(c, chain(n2, lp), 0, 0.001, 1.3, 0.045 + r() * 0.01), out); n2.start(0);
  // low thump
  const o = c.createOscillator(); o.frequency.setValueAtTime(140, 0); o.frequency.exponentialRampToValueAtTime(48, 0.09);
  chain(env(c, o, 0, 0.002, 1.1, 0.05), out); o.start(0); o.stop(0.5);
  // slide cycling
  const n3 = noise(c, 0.03, 'white', 21 + v); chain(env(c, chain(n3, filt(c, 'bandpass', 3200, 3)), 0.035, 0.001, 0.25, 0.006), out); n3.start(0.035);
  return c.startRendering();
};
R.shotgun = async (v = 0) => {
  const c = oac(0.9); const out = c.createGain(); chain(out, shaper(c, 3.2), c.destination);
  const n1 = noise(c, 0.05, 'white', 41 + v); chain(env(c, chain(n1, filt(c, 'highpass', 1200)), 0, 0.0005, 1.5, 0.006), out); n1.start(0);
  const n2 = noise(c, 0.8, 'white', 43 + v); const lp = filt(c, 'lowpass', 3000, 0.8);
  lp.frequency.setValueAtTime(3500, 0); lp.frequency.exponentialRampToValueAtTime(260, 0.25);
  chain(env(c, chain(n2, lp), 0, 0.002, 1.6, 0.09), out); n2.start(0);
  const o = c.createOscillator(); o.frequency.setValueAtTime(95, 0); o.frequency.exponentialRampToValueAtTime(38, 0.18);
  chain(env(c, o, 0, 0.003, 1.4, 0.09), out); o.start(0); o.stop(0.8);
  return c.startRendering();
};
function clickRecipe(freqs, dur = 0.08, seed = 1, level = 0.8, tau = 0.008, gaps = [0]) {
  return async () => {
    const c = oac(dur + gaps[gaps.length - 1]); const out = c.createGain(); chain(out, c.destination);
    gaps.forEach((t0, k) => {
      for (const f of freqs) {
        const n = noise(c, dur, 'white', seed + k * 7 + f);
        chain(env(c, chain(n, filt(c, 'bandpass', f * (1 + (k % 2) * 0.1), 4)), t0, 0.0008, level, tau), out); n.start(t0);
      }
    });
    return c.startRendering();
  };
}
R.dry = clickRecipe([2400, 4800], 0.06, 5, 1.2, 0.006);
R.click = clickRecipe([1800, 3500], 0.05, 9, 1.0, 0.005, [0, 0.07]);
R.magOut = clickRecipe([1400, 2900], 0.12, 13, 1.0, 0.012, [0, 0.03]);
R.magIn = clickRecipe([1100, 2600, 5200], 0.1, 17, 1.3, 0.01, [0, 0.012]);
R.slide = clickRecipe([900, 2200, 4400], 0.16, 19, 1.2, 0.02, [0, 0.11]);
R.pumpBack = clickRecipe([700, 1900], 0.18, 23, 1.2, 0.03, [0, 0.05]);
R.pumpFwd = clickRecipe([800, 2300], 0.16, 29, 1.3, 0.025, [0, 0.04]);
R.shellIn = clickRecipe([600, 1500, 3000], 0.12, 31, 1.0, 0.015, [0, 0.06]);
R.holster = async () => {
  const c = oac(0.4); const out = c.createGain(); chain(out, c.destination);
  const n = noise(c, 0.4, 'pink', 37); const bp = filt(c, 'bandpass', 1200, 0.8);
  chain(env(c, chain(n, bp), 0, 0.08, 0.6, 0.08), out); n.start(0);
  const n2 = noise(c, 0.05, 'white', 39); chain(env(c, chain(n2, filt(c, 'bandpass', 3000, 3)), 0.22, 0.001, 0.5, 0.01), out); n2.start(0.22);
  return c.startRendering();
};
R.brass = async (v = 0) => {
  const c = oac(0.5); const out = c.createGain(); chain(out, c.destination); const r = mulberry(51 + v);
  const base = 3100 + r() * 800;
  for (const [m, a, tau] of [[1, 0.5, 0.09], [1.63, 0.35, 0.06], [2.41, 0.25, 0.05], [3.3, 0.15, 0.035]]) {
    const o = c.createOscillator(); o.frequency.value = base * m;
    chain(env(c, o, 0, 0.001, a, tau), out); o.start(0); o.stop(0.5);
  }
  return c.startRendering();
};
R.hull = async () => { const c = oac(0.25); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.2, 'white', 55); chain(env(c, chain(n, filt(c, 'bandpass', 900, 2)), 0, 0.001, 1, 0.02), out); n.start(0); return c.startRendering(); };
R.magDrop = clickRecipe([500, 1300, 2600], 0.2, 57, 1.1, 0.03, [0, 0.09]);
R.flesh = async (v = 0) => {
  const c = oac(0.45); const out = c.createGain(); chain(out, c.destination);
  const o = c.createOscillator(); o.frequency.setValueAtTime(120, 0); o.frequency.exponentialRampToValueAtTime(50, 0.1);
  chain(env(c, o, 0, 0.002, 0.9, 0.04), out); o.start(0); o.stop(0.4);
  const n = noise(c, 0.4, 'white', 61 + v); const lp = filt(c, 'lowpass', 1400, 1.2);
  chain(env(c, chain(n, lp), 0, 0.001, 0.9, 0.05), out); n.start(0);
  const n2 = noise(c, 0.3, 'white', 67 + v); const bp = filt(c, 'bandpass', 700, 6);
  bp.frequency.setValueAtTime(400, 0.02); bp.frequency.linearRampToValueAtTime(1600, 0.2);
  chain(env(c, chain(n2, bp), 0.02, 0.02, 0.5, 0.06), out); n2.start(0.02);
  return c.startRendering();
};
R.impactConcrete = async (v = 0) => {
  const c = oac(0.5); const out = c.createGain(); chain(out, c.destination);
  const n = noise(c, 0.05, 'white', 71 + v); chain(env(c, chain(n, filt(c, 'highpass', 900)), 0, 0.0005, 1, 0.01), out); n.start(0);
  for (let k = 0; k < 6; k++) { const t = 0.03 + k * 0.035 * (1 + v * 0.1); const d = noise(c, 0.03, 'white', 73 + k + v * 9); chain(env(c, chain(d, filt(c, 'bandpass', 2500 + k * 300, 3)), t, 0.001, 0.25 / (k + 1), 0.006), out); d.start(t); }
  return c.startRendering();
};
R.impactMetal = async (v = 0) => {
  const c = oac(0.8); const out = c.createGain(); chain(out, c.destination); const r = mulberry(81 + v);
  const n = noise(c, 0.03, 'white', 83); chain(env(c, chain(n, filt(c, 'highpass', 2000)), 0, 0.0005, 0.8, 0.004), out); n.start(0);
  const f = 1800 + r() * 1200;
  for (const [m, a] of [[1, 0.35], [2.7, 0.2], [5.2, 0.12]]) { const o = c.createOscillator(); o.frequency.setValueAtTime(f * m, 0); o.frequency.exponentialRampToValueAtTime(f * m * 0.7, 0.4); chain(env(c, o, 0, 0.001, a, 0.08), out); o.start(0); o.stop(0.7); }
  return c.startRendering();
};
R.impactWood = async (v = 0) => { const c = oac(0.3); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.2, 'white', 91 + v); chain(env(c, chain(n, filt(c, 'bandpass', 700, 1.5)), 0, 0.001, 1.2, 0.025), out); n.start(0); const o = c.createOscillator(); o.frequency.value = 180; chain(env(c, o, 0, 0.001, 0.5, 0.03), out); o.start(0); o.stop(0.3); return c.startRendering(); };
R.impactGlass = async () => {
  const c = oac(1.2); const out = c.createGain(); chain(out, c.destination); const r = mulberry(97);
  const n = noise(c, 0.3, 'white', 99); chain(env(c, chain(n, filt(c, 'highpass', 3000)), 0, 0.001, 0.8, 0.05), out); n.start(0);
  for (let k = 0; k < 18; k++) { const t = r() * 0.6; const o = c.createOscillator(); o.frequency.value = 3000 + r() * 6000; chain(env(c, o, t, 0.001, 0.08, 0.03), out); o.start(t); o.stop(t + 0.2); }
  return c.startRendering();
};
R.footConcrete = async (v = 0) => {
  const c = oac(0.25); const out = c.createGain(); chain(out, c.destination); const r = mulberry(111 + v);
  const n = noise(c, 0.2, 'white', 113 + v); chain(env(c, chain(n, filt(c, 'bandpass', 900 + r() * 500, 1.3)), 0, 0.002, 0.8, 0.018), out); n.start(0);
  const n2 = noise(c, 0.1, 'white', 117 + v); chain(env(c, chain(n2, filt(c, 'highpass', 3500)), 0.035, 0.002, 0.18, 0.01), out); n2.start(0.035);
  const o = c.createOscillator(); o.frequency.value = 70 + r() * 20; chain(env(c, o, 0, 0.003, 0.5, 0.02), out); o.start(0); o.stop(0.2);
  return c.startRendering();
};
R.footWood = async (v = 0) => { const c = oac(0.3); const out = c.createGain(); chain(out, c.destination); const r = mulberry(121 + v); const n = noise(c, 0.2, 'white', 123 + v); chain(env(c, chain(n, filt(c, 'bandpass', 400 + r() * 200, 1.5)), 0, 0.003, 1, 0.03), out); n.start(0); if (v % 2) { const o = c.createOscillator(); o.frequency.setValueAtTime(700 + r() * 300, 0.05); o.frequency.linearRampToValueAtTime(500, 0.25); chain(env(c, o, 0.05, 0.03, 0.05, 0.08), out); o.start(0.05); o.stop(0.3); } return c.startRendering(); };
R.footWet = async (v = 0) => {
  const c = oac(0.35); const out = c.createGain(); chain(out, c.destination); const r = mulberry(131 + v);
  const n = noise(c, 0.3, 'white', 133 + v); chain(env(c, chain(n, filt(c, 'bandpass', 800 + r() * 300, 1.1)), 0, 0.002, 0.7, 0.02), out); n.start(0);
  const n2 = noise(c, 0.3, 'white', 137 + v); const bp = filt(c, 'bandpass', 2500, 2); bp.frequency.setValueAtTime(1800, 0.02); bp.frequency.linearRampToValueAtTime(4000, 0.15);
  chain(env(c, chain(n2, bp), 0.02, 0.01, 0.45, 0.05), out); n2.start(0.02);
  return c.startRendering();
};
R.footTile = async (v = 0) => { const c = oac(0.25); const out = c.createGain(); chain(out, c.destination); const r = mulberry(141 + v); const n = noise(c, 0.2, 'white', 143 + v); chain(env(c, chain(n, filt(c, 'bandpass', 1600 + r() * 600, 1.8)), 0, 0.001, 0.8, 0.012), out); n.start(0); const n2 = noise(c, 0.1, 'white', 147 + v); chain(env(c, chain(n2, filt(c, 'bandpass', 5000, 2)), 0.04, 0.001, 0.15, 0.008), out); n2.start(0.04); return c.startRendering(); };
R.door = async () => {
  const c = oac(1.4); const out = c.createGain(); chain(out, c.destination);
  const n = noise(c, 0.1, 'white', 151); chain(env(c, chain(n, filt(c, 'bandpass', 2000, 3)), 0, 0.001, 0.6, 0.02), out); n.start(0);
  // creak: sawtooth through resonant bandpass with wobbling pitch
  const o = c.createOscillator(); o.type = 'sawtooth';
  const r = mulberry(153); const curve = new Float32Array(64); for (let i = 0; i < 64; i++) curve[i] = 90 + Math.sin(i * 0.7) * 25 + r() * 30;
  o.frequency.setValueCurveAtTime(curve, 0.1, 1.0);
  const bp = filt(c, 'bandpass', 1100, 8);
  const g = c.createGain(); g.gain.setValueAtTime(0, 0.1); g.gain.linearRampToValueAtTime(0.35, 0.3); g.gain.linearRampToValueAtTime(0.2, 0.8); g.gain.linearRampToValueAtTime(0, 1.15);
  chain(o, bp, g, out); o.start(0.1); o.stop(1.3);
  return c.startRendering();
};
R.doorMetal = async () => {
  const c = oac(1.2); const out = c.createGain(); chain(out, c.destination);
  const n = noise(c, 0.1, 'white', 161); chain(env(c, chain(n, filt(c, 'bandpass', 1500, 2)), 0, 0.001, 1, 0.02), out); n.start(0);
  for (const [f, a] of [[210, 0.4], [573, 0.25], [1130, 0.12]]) { const o = c.createOscillator(); o.frequency.value = f; chain(env(c, o, 0.02, 0.002, a, 0.25), out); o.start(0.02); o.stop(1.1); }
  return c.startRendering();
};
R.locked = clickRecipe([700, 1600, 3200], 0.12, 171, 1.2, 0.02, [0, 0.12, 0.22, 0.36]);
R.pickup = async () => { const c = oac(0.5); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.4, 'pink', 181); chain(env(c, chain(n, filt(c, 'bandpass', 1500, 0.8)), 0, 0.05, 0.5, 0.06), out); n.start(0); const n2 = noise(c, 0.05, 'white', 183); chain(env(c, chain(n2, filt(c, 'bandpass', 2500, 3)), 0.25, 0.001, 0.8, 0.012), out); n2.start(0.25); return c.startRendering(); };
R.medkit = async () => { const c = oac(1.0); const out = c.createGain(); chain(out, c.destination); for (let k = 0; k < 3; k++) { const t = k * 0.25; const n = noise(c, 0.25, 'white', 191 + k); const bp = filt(c, 'bandpass', 2500 + k * 400, 1); chain(env(c, chain(n, bp), t, 0.02, 0.6, 0.05), out); n.start(t); } return c.startRendering(); };
R.hitPlayer = async () => { const c = oac(0.5); const out = c.createGain(); chain(out, shaper(c, 2), c.destination); const o = c.createOscillator(); o.frequency.setValueAtTime(90, 0); o.frequency.exponentialRampToValueAtTime(40, 0.2); chain(env(c, o, 0, 0.003, 1.2, 0.08), out); o.start(0); o.stop(0.5); const n = noise(c, 0.3, 'pink', 201); chain(env(c, chain(n, filt(c, 'lowpass', 900)), 0, 0.005, 1, 0.07), out); n.start(0); return c.startRendering(); };
R.grab = async () => { const c = oac(0.7); const out = c.createGain(); chain(out, shaper(c, 2.5), c.destination); const n = noise(c, 0.6, 'pink', 211); const bp = filt(c, 'bandpass', 600, 1); bp.frequency.setValueAtTime(300, 0); bp.frequency.exponentialRampToValueAtTime(2000, 0.3); chain(env(c, chain(n, bp), 0, 0.1, 1, 0.1), out); n.start(0); const o = c.createOscillator(); o.frequency.setValueAtTime(70, 0.25); chain(env(c, o, 0.25, 0.005, 1.4, 0.08), out); o.start(0.25); o.stop(0.6); return c.startRendering(); };
R.bite = async () => {
  const c = oac(1.2); const out = c.createGain(); chain(out, shaper(c, 3), c.destination); const r = mulberry(221);
  for (let k = 0; k < 14; k++) { const t = 0.02 + r() * 0.5; const n = noise(c, 0.05, 'white', 223 + k); chain(env(c, chain(n, filt(c, 'bandpass', 1200 + r() * 2500, 5)), t, 0.001, 0.8, 0.01), out); n.start(t); }
  const n = noise(c, 1.0, 'white', 229); const bp = filt(c, 'bandpass', 500, 3); bp.frequency.setValueAtTime(400, 0.1); bp.frequency.linearRampToValueAtTime(1400, 0.7);
  chain(env(c, chain(n, bp), 0.1, 0.1, 0.8, 0.2), out); n.start(0.1);
  return c.startRendering();
};
R.struggle = async (v = 0) => { const c = oac(0.4); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.35, 'pink', 231 + v); chain(env(c, chain(n, filt(c, 'bandpass', 900 + v * 200, 1.2)), 0, 0.02, 0.9, 0.06), out); n.start(0); return c.startRendering(); };
R.shove = async () => { const c = oac(0.4); const out = c.createGain(); chain(out, c.destination); const o = c.createOscillator(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(45, 0.12); chain(env(c, o, 0, 0.002, 1.2, 0.05), out); o.start(0); o.stop(0.4); const n = noise(c, 0.2, 'white', 241); chain(env(c, chain(n, filt(c, 'lowpass', 1500)), 0, 0.001, 0.8, 0.03), out); n.start(0); return c.startRendering(); };
R.shoveWhoosh = async () => { const c = oac(0.4); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.4, 'pink', 251); const bp = filt(c, 'bandpass', 500, 1.5); bp.frequency.setValueAtTime(400, 0); bp.frequency.exponentialRampToValueAtTime(1800, 0.2); chain(env(c, chain(n, bp), 0, 0.12, 0.6, 0.05), out); n.start(0); return c.startRendering(); };
R.beep = async () => { const c = oac(0.7); const out = c.createGain(); chain(out, c.destination); for (const [t, f] of [[0, 1050], [0.28, 1050]]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.005); g.gain.setValueAtTime(0.18, t + 0.14); g.gain.linearRampToValueAtTime(0, t + 0.15); chain(o, filt(c, 'lowpass', 4000), g, out); o.start(t); o.stop(t + 0.16); } return c.startRendering(); };
R.radioIn = async () => { const c = oac(0.35); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.3, 'white', 261); chain(env(c, chain(n, filt(c, 'bandpass', 2200, 1.2)), 0, 0.003, 0.5, 0.08), out); n.start(0); const o = c.createOscillator(); o.frequency.value = 1400; chain(env(c, o, 0.0, 0.002, 0.15, 0.03), out); o.start(0); o.stop(0.1); return c.startRendering(); };
R.radioOut = async () => { const c = oac(0.5); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 0.4, 'white', 271); const g = c.createGain(); g.gain.setValueAtTime(0.6, 0); g.gain.setValueAtTime(0.6, 0.16); g.gain.linearRampToValueAtTime(0, 0.2); chain(n, filt(c, 'bandpass', 2400, 1), g, out); n.start(0); return c.startRendering(); };
R.heart = async () => { const c = oac(0.8); const out = c.createGain(); chain(out, c.destination); for (const [t, a] of [[0, 1], [0.22, 0.7]]) { const o = c.createOscillator(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12); chain(env(c, o, t, 0.008, a, 0.05), out); o.start(t); o.stop(t + 0.4); } return c.startRendering(); };
R.breath = async (v = 0) => { const c = oac(1.4); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 1.3, 'pink', 281 + v); const bp = filt(c, 'bandpass', v ? 900 : 1400, 1.4); const g = c.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.5, 0.25); g.gain.linearRampToValueAtTime(0.25, 0.6); g.gain.linearRampToValueAtTime(0, 1.2); chain(n, bp, g, out); n.start(0); return c.startRendering(); };
R.thunder = async () => { const c = oac(6); const out = c.createGain(); chain(out, c.destination); const n = noise(c, 6, 'brown', 291); const lp = filt(c, 'lowpass', 400); const g = c.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, 0.4); g.gain.setTargetAtTime(0, 1.2, 1.3); chain(n, lp, g, out); n.start(0); return c.startRendering(); };
R.siren = async () => {
  const c = oac(9); const out = c.createGain(); chain(out, c.destination);
  const o = c.createOscillator(); o.type = 'triangle';
  const curve = new Float32Array(400); for (let i = 0; i < 400; i++) { const t = i / 400 * 9; curve[i] = 800 + 500 * Math.sin(t * 2 * Math.PI / 3.8); }
  o.frequency.setValueCurveAtTime(curve, 0, 9);
  const g = c.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.35, 2); g.gain.linearRampToValueAtTime(0.35, 6); g.gain.linearRampToValueAtTime(0, 9);
  chain(o, filt(c, 'lowpass', 1800), g, out); o.start(0); o.stop(9);
  return c.startRendering();
};

// Zombie vocalisations: glottal source + formants + vocal fry
R.zvoice = async (v = 0, kind = 'moan') => {
  const r = mulberry(1000 + v * 31 + kind.length * 7);
  const dur = kind === 'scream' ? 1.4 + r() * 0.6 : kind === 'death' ? 1.6 : kind === 'attack' ? 0.8 + r() * 0.3 : 1.6 + r() * 1.4;
  const c = oac(dur + 0.2);
  const out = c.createGain(); chain(out, shaper(c, kind === 'scream' || kind === 'attack' ? 4 : 2.2), filt(c, 'highpass', 90), c.destination);
  const f0 = kind === 'scream' ? 280 + r() * 160 : kind === 'attack' ? 170 + r() * 80 : 65 + r() * 55;
  const src = c.createOscillator(); src.type = 'sawtooth';
  const N = 64; const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = i / (N - 1); curve[i] = f0 * (1 + 0.25 * Math.sin(t * 3 + r() * 2) * (kind === 'moan' ? 1 : 0.4) - (kind === 'death' ? t * 0.45 : 0) + (r() - 0.5) * 0.06); }
  src.frequency.setValueCurveAtTime(curve, 0, dur);
  // vocal fry / growl AM
  const am = c.createGain(); am.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.frequency.value = kind === 'moan' ? 22 + r() * 18 : 35 + r() * 25;
  const lfoG = c.createGain(); lfoG.gain.value = kind === 'moan' ? 0.45 : 0.35;
  chain(lfo, lfoG, am.gain);
  const asp = noise(c, dur, 'white', 1100 + v); const aspG = c.createGain(); aspG.gain.value = kind === 'scream' ? 0.35 : 0.2;
  chain(asp, aspG, am);
  src.connect(am);
  const vowels = [[650, 1080, 2650], [500, 900, 2400], [750, 1200, 2600], [400, 800, 2500], [600, 1700, 2700]];
  const vw = vowels[(v + (kind === 'scream' ? 2 : 0)) % vowels.length];
  const env2 = c.createGain();
  env2.gain.setValueAtTime(0, 0);
  env2.gain.linearRampToValueAtTime(kind === 'attack' || kind === 'scream' ? 1 : 0.7, kind === 'attack' ? 0.05 : 0.25);
  if (kind === 'moan') { env2.gain.linearRampToValueAtTime(0.9, dur * 0.5); env2.gain.linearRampToValueAtTime(0.4, dur * 0.8); }
  env2.gain.linearRampToValueAtTime(0, dur);
  for (let k = 0; k < 3; k++) {
    const bp = filt(c, 'bandpass', vw[k] * (0.9 + r() * 0.2) * (kind === 'scream' ? 1.2 : 1), 6 + k * 3);
    if (kind === 'moan') { bp.frequency.setValueAtTime(vw[k] * 0.8, 0); bp.frequency.linearRampToValueAtTime(vw[k] * 1.1, dur * 0.6); }
    const g = c.createGain(); g.gain.value = [1, 0.6, 0.3][k] * 2.2;
    chain(am, bp, g, env2);
  }
  env2.connect(out);
  src.start(0); src.stop(dur); lfo.start(0); lfo.stop(dur); asp.start(0);
  return c.startRendering();
};
R.feed = async (v = 0) => {
  const c = oac(2.5); const out = c.createGain(); chain(out, c.destination); const r = mulberry(1300 + v);
  for (let k = 0; k < 22; k++) {
    const t = r() * 2.3; const n = noise(c, 0.12, 'white', 1310 + k + v * 40);
    const bp = filt(c, 'bandpass', 500 + r() * 1500, 3 + r() * 5);
    chain(env(c, chain(n, bp), t, 0.005, 0.3 + r() * 0.6, 0.03 + r() * 0.05), out); n.start(t);
  }
  return c.startRendering();
};
R.fireAlarm = async () => {
  // temporal-3 horn pattern
  const c = oac(4); const out = c.createGain(); chain(out, c.destination);
  for (let k = 0; k < 3; k++) {
    const t = k * 1.0;
    for (const [f, a] of [[520, 0.25], [1040, 0.12], [1560, 0.06]]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.setValueAtTime(a, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.52);
      chain(o, filt(c, 'lowpass', 3500), g, out); o.start(t); o.stop(t + 0.55);
    }
  }
  return c.startRendering();
};

// Impulse responses for the reverb zones
function makeIR(ctx, dur, decay, bright, early = [], slap = 0) {
  const len = Math.ceil(dur * ctx.sampleRate);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = mulberry(dur * 1000 | 0);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const w = (r() * 2 - 1) * Math.exp(-t * decay);
      lp += (w - lp) * bright;
      d[i] = lp * (t < 0.004 ? t / 0.004 : 1);
    }
    for (const [t, a] of early) { const i = (t * ctx.sampleRate) | 0; if (i < len) d[i] += a * (ch ? 0.9 : 1); }
    if (slap) { const i0 = (slap * ctx.sampleRate) | 0; for (let i = 0; i < 400 && i0 + i < len; i++) d[i0 + i] += (r() * 2 - 1) * 0.35 * Math.exp(-i / 90); }
  }
  return b;
}

export const REVERB_ZONES = {
  outdoor: { dur: 2.2, decay: 2.6, bright: 0.25, wet: 0.35, slap: 0.19 },
  lobby: { dur: 1.4, decay: 4.2, bright: 0.45, wet: 0.5 },
  corridor: { dur: 1.8, decay: 3.4, bright: 0.55, wet: 0.6 },
  room: { dur: 0.6, decay: 9, bright: 0.3, wet: 0.3 },
  service: { dur: 1.6, decay: 3.8, bright: 0.6, wet: 0.55 },
};
export function reverbZone(zone) {
  if (['street', 'lot', 'court', 'alley'].includes(zone)) return 'outdoor';
  if (zone === 'lobby' || zone === 'laundry') return 'lobby';
  if (zone === 'corridor') return 'corridor';
  if (zone === 'service' || zone === 'maint') return 'service';
  return 'room';
}

// ------------------------------------------------------------------ runtime engine
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.zone = 'outdoor';
    this.listener = { pos: [0, 0, 0] };
    this.loops = {};
    this.vcount = {};
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    // mic chain
    this.master = c.createGain();
    this.master.gain.value = this.settings.get('master');
    const hp = filt(c, 'highpass', 140, 0.7), pk = filt(c, 'peaking', 2800, 1, 4), lp = filt(c, 'lowpass', 7800, 0.7);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22; comp.ratio.value = 7; comp.attack.value = 0.002; comp.release.value = 0.28; comp.knee.value = 6;
    const clip = shaper(c, 1.6);
    this.micIn = c.createGain();
    chain(this.micIn, hp, pk, lp, comp, clip, this.master, c.destination);
    // buses
    this.sfx = c.createGain(); this.sfx.gain.value = this.settings.get('sfx');
    this.voice = c.createGain(); this.voice.gain.value = this.settings.get('voiceVol');
    this.amb = c.createGain(); this.amb.gain.value = this.settings.get('ambience');
    this.dry = c.createGain(); this.dry.connect(this.micIn);
    this.sfx.connect(this.dry); this.amb.connect(this.dry); this.voice.connect(this.micIn);
    // reverb send
    this.revSend = c.createGain(); this.revSend.gain.value = 0.5;
    this.convolver = c.createConvolver();
    this.revOut = c.createGain(); this.revOut.gain.value = 0.9;
    chain(this.revSend, this.convolver, this.revOut, this.micIn);
    this.sfx.connect(this.revSend);
    this.irs = {};
    for (const [k, z] of Object.entries(REVERB_ZONES)) this.irs[k] = makeIR(c, z.dur, z.decay, z.bright, [[0.012, 0.3], [0.023, 0.2]], z.slap || 0);
    this.convolver.buffer = this.irs.outdoor;
    // mic self-noise floor (pumps with the compressor)
    const nb = c.createBuffer(1, SR * 2, SR); const nd = nb.getChannelData(0); const r = mulberry(5);
    let b0 = 0; for (let i = 0; i < nd.length; i++) { b0 = 0.97 * b0 + (r() * 2 - 1) * 0.03; nd[i] = b0 * 0.35 + (r() * 2 - 1) * 0.01; }
    const hiss = c.createBufferSource(); hiss.buffer = nb; hiss.loop = true; const hg = c.createGain(); hg.gain.value = 0.09;
    chain(hiss, hg, this.micIn); hiss.start();
  }

  async generate(progress) {
    if (!this.ctx) return;
    const jobs = [];
    const add = (name, fn) => jobs.push([name, fn]);
    for (let v = 0; v < 3; v++) add('pistol' + v, () => R.pistol(v));
    for (let v = 0; v < 2; v++) add('shotgun' + v, () => R.shotgun(v));
    for (const k of ['dry', 'click', 'magOut', 'magIn', 'slide', 'pumpBack', 'pumpFwd', 'shellIn', 'holster', 'hull', 'magDrop', 'impactGlass', 'door', 'doorMetal', 'locked', 'pickup', 'medkit', 'hitPlayer', 'grab', 'bite', 'shove', 'shoveWhoosh', 'beep', 'radioIn', 'radioOut', 'heart', 'thunder', 'siren', 'fireAlarm']) add(k, () => R[k]());
    for (let v = 0; v < 4; v++) { add('brass' + v, () => R.brass(v)); add('flesh' + v, () => R.flesh(v)); add('impactConcrete' + v, () => R.impactConcrete(v)); add('impactMetal' + v, () => R.impactMetal(v)); add('impactWood' + v, () => R.impactWood(v)); }
    for (let v = 0; v < 4; v++) { add('footConcrete' + v, () => R.footConcrete(v)); add('footWood' + v, () => R.footWood(v)); add('footWet' + v, () => R.footWet(v)); add('footTile' + v, () => R.footTile(v)); }
    for (let v = 0; v < 3; v++) { add('struggle' + v, () => R.struggle(v)); add('feed' + v, () => R.feed(v)); }
    for (let v = 0; v < 2; v++) add('breath' + v, () => R.breath(v));
    for (let v = 0; v < 8; v++) add('zmoan' + v, () => R.zvoice(v, 'moan'));
    for (let v = 0; v < 4; v++) { add('zscream' + v, () => R.zvoice(v, 'scream')); add('zattack' + v, () => R.zvoice(v + 3, 'attack')); }
    for (let v = 0; v < 3; v++) add('zdeath' + v, () => R.zvoice(v + 5, 'death'));
    let i = 0;
    const batch = 6;
    for (let s = 0; s < jobs.length; s += batch) {
      const part = jobs.slice(s, s + batch);
      const res = await Promise.all(part.map(([, fn]) => fn().catch(e => { console.warn('audio gen', e); return null; })));
      part.forEach(([n], k) => { if (res[k]) this.buffers[n] = res[k]; });
      i += part.length;
      progress && progress(i / jobs.length);
    }
    // ambience loops
    this.rainBuf = this._rainBuffer();
    this.humBuf = this._humBuffer();
    this.ready = true;
  }

  _rainBuffer() {
    const c = this.ctx, len = SR * 6; const b = c.createBuffer(2, len, SR); const r = mulberry(77);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let b0 = 0, b1 = 0;
      for (let i = 0; i < len; i++) { const w = r() * 2 - 1; b0 = 0.99 * b0 + w * 0.05; b1 = 0.6 * b1 + w * 0.4; d[i] = (b0 + b1 * 0.5) * 0.5; if (r() < 0.0007) d[i] += (r() - 0.5) * 0.8; }
      // crossfade loop seam
      for (let i = 0; i < 2000; i++) { const a = i / 2000; d[i] = d[i] * a + d[len - 2000 + i] * (1 - a); }
    }
    return b;
  }
  _humBuffer() {
    const c = this.ctx, len = SR; const b = c.createBuffer(1, len, SR); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / SR; d[i] = (Math.sin(t * 2 * Math.PI * 120) * 0.5 + Math.sin(t * 2 * Math.PI * 240) * 0.3 + Math.sin(t * 2 * Math.PI * 360) * 0.15 + Math.sin(t * 2 * Math.PI * 1320) * 0.03) * 0.3; }
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.get('master'); this.sfx.gain.value = s.get('sfx'); this.voice.gain.value = s.get('voiceVol'); this.amb.gain.value = s.get('ambience');
  }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    this.listener.pos = [pos.x, pos.y, pos.z];
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02); L.upY.setTargetAtTime(up.y, t, 0.02); L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  setZone(z) {
    const rz = reverbZone(z);
    if (!this.ctx || rz === this.zone) return;
    this.zone = rz;
    this.convolver.buffer = this.irs[rz];
    this.revSend.gain.setTargetAtTime(REVERB_ZONES[rz].wet, this.ctx.currentTime, 0.2);
    this.updateAmbienceZone();
  }

  // play a buffer; opts: pos (Vector3), vol, rate, bus ('sfx'|'amb'|'voice'), occluded, loop, dry
  play(name, opts = {}) {
    if (!this.ready) return null;
    let buf = this.buffers[name];
    if (!buf) {
      // variants
      const vars = Object.keys(this.buffers).filter(k => k.startsWith(name) && /\d$/.test(k) && k.slice(name.length).match(/^\d+$/));
      if (!vars.length) return null;
      buf = this.buffers[vars[(Math.random() * vars.length) | 0]];
    }
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (opts.norand ? 1 : 0.94 + Math.random() * 0.12);
    src.loop = !!opts.loop;
    const g = c.createGain(); g.gain.value = opts.vol ?? 1;
    let node = src;
    if (opts.occluded) { const lp = filt(c, 'lowpass', 900); node.connect(lp); node = lp; }
    node.connect(g);
    let out = g;
    if (opts.pos) {
      const p = c.createPanner();
      p.panningModel = this.settings.get('quality') === 'low' ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse'; p.refDistance = opts.ref ?? 1.6; p.rolloffFactor = opts.rolloff ?? 1.1; p.maxDistance = 60;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y ?? 1; p.positionZ.value = opts.pos.z; }
      else p.setPosition(opts.pos.x, opts.pos.y ?? 1, opts.pos.z);
      g.connect(p); out = p;
      src._panner = p;
    }
    out.connect(opts.bus === 'amb' ? this.amb : opts.bus === 'voice' ? this.voice : this.sfx);
    src.start(this.ctx.currentTime + (opts.delay || 0));
    src._gain = g;
    return src;
  }

  gunshot(kind, zone) {
    this.play(kind === 'shotgun' ? 'shotgun' : 'pistol', { vol: kind === 'shotgun' ? 1.5 : 1.25, norand: false });
  }

  footstep(surface, k, outdoor) {
    const name = surface === 'wood' ? 'footWood' : surface === 'wet' ? 'footWet' : surface === 'tile' ? 'footTile' : 'footConcrete';
    this.play(name, { vol: 0.28 + k * 0.25 });
  }

  impact(surf, pos) {
    const n = surf === 1 ? 'impactMetal' : surf === 2 ? 'impactWood' : surf === 4 ? 'impactGlass' : 'impactConcrete';
    this.play(n, { pos, vol: 0.9 });
  }

  zombieVoice(z, kind) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (z._voiceUntil && now < z._voiceUntil && kind !== 'death') return;
    const name = kind === 'attack' ? 'zattack' : kind === 'alert' ? 'zscream' : kind === 'death' ? 'zdeath' : kind === 'feed' ? 'feed' : 'zmoan';
    const src = this.play(name, { pos: { x: z.pos.x, y: 1.6, z: z.pos.z }, vol: kind === 'alert' ? 1.2 : kind === 'feed' ? 0.8 : 0.9, rate: 0.9 + (z.id % 5) * 0.05, occluded: !z.game.world.lineOfSight(z.game.player.camPos, { x: z.pos.x, y: 1.6, z: z.pos.z, clone() { return this; } }) });
    if (src) { z._voiceUntil = now + src.buffer.duration / src.playbackRate.value; z._voiceSrc = src; }
  }

  // ---------------------------------------------------------------- ambience
  startAmbience() {
    if (!this.ready || this.loops.rain) return;
    const c = this.ctx;
    const rain = c.createBufferSource(); rain.buffer = this.rainBuf; rain.loop = true;
    const rlp = filt(c, 'lowpass', 6000, 0.5); const rg = c.createGain(); rg.gain.value = 0.35;
    chain(rain, rlp, rg, this.amb); rain.start();
    this.loops.rain = { src: rain, lp: rlp, g: rg };
    const hum = c.createBufferSource(); hum.buffer = this.humBuf; hum.loop = true; const hg = c.createGain(); hg.gain.value = 0;
    chain(hum, filt(c, 'lowpass', 2000), hg, this.amb); hum.start();
    this.loops.hum = { src: hum, g: hg };
    this.updateAmbienceZone();
  }
  updateAmbienceZone() {
    if (!this.loops.rain) return;
    const t = this.ctx.currentTime;
    const out = this.zone === 'outdoor';
    this.loops.rain.lp.frequency.setTargetAtTime(out ? 6500 : 700, t, 0.3);
    this.loops.rain.g.gain.setTargetAtTime(out ? 0.4 : 0.22, t, 0.3);
    this.loops.hum.g.gain.setTargetAtTime(out ? 0 : 0.035, t, 0.4);
  }
  // positional looping emitter (fire alarm, TV static)
  emitter(name, pos, vol = 1, opts = {}) {
    if (!this.ready) return null;
    return this.play(name, { pos, vol, loop: true, bus: 'amb', ref: opts.ref ?? 2.5, rolloff: opts.rolloff ?? 1.4, norand: true });
  }
  stop(src, fade = 0.1) {
    if (!src) return;
    try { src._gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade); src.stop(this.ctx.currentTime + fade * 5); } catch (e) { /* already stopped */ }
  }
  duck(amount, time = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.gain.setTargetAtTime(this.settings.get('ambience') * amount, t, 0.1);
    this.amb.gain.setTargetAtTime(this.settings.get('ambience'), t + time, 0.5);
  }
  suspend() { this.ctx && this.ctx.state === 'running' && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.state !== 'running' && this.ctx.resume(); }
}
