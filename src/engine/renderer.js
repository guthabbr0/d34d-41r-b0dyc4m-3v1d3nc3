import * as THREE from 'three';
import { PostFX } from './post.js';

// Wraps WebGLRenderer + bodycam post chain, handles DPR, dynamic resolution and quality presets.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    gl.setPixelRatio(1);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.shadowMap.autoUpdate = true;
    gl.setClearColor(0x000000, 1);
    gl.info.autoReset = true;
    this.gl = gl;
    this.ctx = gl.getContext();
    this.post = new PostFX(gl);
    this.scale = 1;          // current dynamic scale
    this.maxScale = 1;       // user resolution scale
    this.minScale = 0.5;
    this.dynamic = true;
    this.dprCap = 2;
    this.lastAdjust = 0;
    this.slowN = 0; this.fastN = 0; this.upWait = 150; this.refDt = 0; this.lastUp = -99;
    this.targetFps = 58;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport && window.visualViewport.addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy() { return this.gl.capabilities.getMaxAnisotropy(); }

  applySettings(s) {
    this.maxScale = s.resScale;
    this.scale = Math.min(this.scale, this.maxScale);
    if (!s.dynamicRes) this.scale = this.maxScale;
    this.dynamic = s.dynamicRes;
    this.minScale = Math.min(this.maxScale, s.minScale ?? 0.5);
    this.dprCap = s.dprCap;
    this.targetFps = s.targetFps || 58;
    this.post.configure({ msaa: s.msaa, levels: s.bloomLevels, mbSamples: s.mbSamples, bloom: s.bloom, motionBlur: s.motionBlur });
    const p = this.post.params;
    p.fish = s.fisheye; p.ca = s.chromatic; p.grain = s.grain; p.blocks = s.compression ? 0.35 : 0;
    p.sharpen = s.sharpen; p.mbStrength = s.motionBlur ? s.mbStrength : 0; p.vignette = 0.65;
    this.gl.shadowMap.enabled = s.shadows > 0;
    this.resize(true);
  }

  cssSize() {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    return [w, h];
  }

  resize(force = false) {
    const [cw, ch] = this.cssSize();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    let w = Math.round(cw * dpr * this.scale), h = Math.round(ch * dpr * this.scale);
    // keep even sizes for the mip chain
    w = Math.max(2, w & ~1); h = Math.max(2, h & ~1);
    this.aspect = cw / ch;
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.gl.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.post.setSize(w, h, force);
  }

  // Dynamic resolution. Tracks the display's own frame interval (fastest recent frame, slowly decaying)
  // so a 60 Hz panel can still "prove" headroom: 20 slow frames step down, a run of frames at the
  // display rate steps back up. Hitches over 250 ms (tab switch, GC, compile) are ignored, steps are
  // quantised to 0.05 so render targets are not reallocated for tiny changes, and an upgrade that is
  // immediately undone doubles the wait before the next attempt (no oscillation).
  trackFrame(dt, now) {
    if (!this.dynamic || dt <= 0) return;
    if (dt > 0.25) { this.slowN = 0; this.fastN = 0; return; }
    if (dt > 0.004) this.refDt = Math.min(dt, (this.refDt || dt) * 1.002 + 0.00001);   // ignore rAF double-fires
    const target = 1 / this.targetFps;
    const slow = dt > target * 1.1;
    const fast = dt < Math.max(this.refDt * 1.15, target * 0.85);
    if (slow) { this.slowN = (this.slowN || 0) + 1; this.fastN = 0; }
    else if (fast) { this.fastN = (this.fastN || 0) + 1; this.slowN = Math.max(0, (this.slowN || 0) - 1); }
    let ns = this.scale;
    if (this.slowN >= 20) {
      ns = Math.max(this.minScale, this.scale - (dt > target * 1.6 ? 0.1 : 0.05));
      if (now - (this.lastUp || -99) < 3) this.upWait = Math.min(1200, (this.upWait || 150) * 2);
      this.slowN = 0; this.fastN = 0;
    } else if (this.fastN >= (this.upWait || 150) && this.scale < this.maxScale) {
      ns = Math.min(this.maxScale, this.scale + 0.05);
      this.fastN = 0; this.lastUp = now;
    }
    ns = Math.round(ns * 20) / 20;
    if (Math.abs(ns - this.scale) > 0.001) { this.scale = ns; this.lastAdjust = now; this.resize(); }
  }

  render(scene, camera, dt, time) {
    camera.aspect = this.aspect;
    camera.updateProjectionMatrix();
    const gl = this.gl;
    gl.setRenderTarget(this.post.sceneRT);
    gl.clear(true, true, false);
    const t0 = performance.now();
    gl.render(scene, camera);
    this.sceneInfo = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    const t1 = performance.now();
    this.post.render(camera, dt, time);
    this.timing = { scene: t1 - t0, post: performance.now() - t1 };
  }
}

// Viewmodel (first-person arms/weapon): drawn with a compressed depth range so it never clips into
// walls, and written with alpha = 0 so motion blur leaves it sharp.
export function markViewmodel(object, gl) {
  const ctx = gl.getContext();
  object.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    o.renderOrder = 10;
    o.onBeforeRender = () => { if (!markViewmodel.normalDepth) ctx.depthRange(0, 0.015); };
    o.onAfterRender = () => ctx.depthRange(0, 1);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.transparent) continue;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor; m.blendDst = THREE.ZeroFactor;
      m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.ZeroFactor;
      m.blendEquationAlpha = THREE.AddEquation;
    }
  });
}
