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
    this.frameTimes = [];
    this.lastAdjust = 0;
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

  // Dynamic resolution: nudges render scale to hold the target frame rate.
  trackFrame(dt, now) {
    if (!this.dynamic) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    if (now - this.lastAdjust < 1.5 || this.frameTimes.length < 30) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const target = 1 / this.targetFps;
    let ns = this.scale;
    if (p75 > target * 1.12) ns = Math.max(this.minScale, this.scale - 0.08);
    else if (p75 < target * 0.8) ns = Math.min(this.maxScale, this.scale + 0.05);
    if (Math.abs(ns - this.scale) > 0.001) {
      this.scale = ns; this.lastAdjust = now; this.frameTimes.length = 0;
      this.resize();
    }
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
