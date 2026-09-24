// Bodycam post-processing chain.
//
//  scene (HDR, depth) ─┬─> motion blur ─┐
//                      └─> 13-tap down chain ─> tent up chain (bloom) ─┐
//                           └─> 1x1 eye adaptation (ping-pong)          │
//                                                                      v
//          composite: fisheye lens + lateral CA + bloom + lens dirt + exposure + filmic
//          tonemap + sensor noise + macroblocking + sharpening + vignette + damage FX
import * as THREE from 'three';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

class FSQuad {
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(g, null);
    this.mesh.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.cam);
  }
}

function mat(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: frag, uniforms, defines,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
}

// 13-tap "Call of Duty" downsample with optional Karis average on the first level.
const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uKaris;
varying vec2 vUv;
float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 res;
  // sanitise: one NaN/Inf pixel would otherwise poison bloom and eye adaptation
  #define SAN(v) v = (any(isnan(v)) || any(isinf(v))) ? vec3(0.0) : min(v, vec3(6e4))
  SAN(a); SAN(b); SAN(c); SAN(d); SAN(e); SAN(f); SAN(g); SAN(h); SAN(i); SAN(j); SAN(k); SAN(l); SAN(m);
  if (uKaris > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
    res = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) /
          (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(res, vec3(0.0)), 1.0);
}`;

const UP_FRAG = /* glsl */`
uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tLow, vUv + vec2(-t.x, t.y)).rgb + texture2D(tLow, vUv + vec2(0.0, t.y)).rgb * 2.0 + texture2D(tLow, vUv + t).rgb
         + texture2D(tLow, vUv + vec2(-t.x, 0.0)).rgb * 2.0 + texture2D(tLow, vUv).rgb * 4.0 + texture2D(tLow, vUv + vec2(t.x, 0.0)).rgb * 2.0
         + texture2D(tLow, vUv - t).rgb + texture2D(tLow, vUv + vec2(0.0, -t.y)).rgb * 2.0 + texture2D(tLow, vUv + vec2(t.x, -t.y)).rgb;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s / 16.0, 1.0);
}`;

const ADAPT_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uSrcSize;
uniform float uDt; uniform float uSpeedUp; uniform float uSpeedDown; uniform float uReset;
varying vec2 vUv;
void main() {
  float sum = 0.0, wsum = 0.0;
  ivec2 sz = ivec2(uSrcSize);
  for (int y = 0; y < sz.y; y++) {
    for (int x = 0; x < sz.x; x++) {
      vec3 c = texelFetch(tSrc, ivec2(x, y), 0).rgb;
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / uSrcSize;
      vec2 d = (uv - vec2(0.5, 0.45)) * vec2(1.0, 1.4);
      float w = exp(-dot(d, d) * 6.0) + 0.08;
      sum += log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4)) * w;
      wsum += w;
    }
  }
  float target = sum / max(wsum, 1e-4);
  float prev = texelFetch(tPrev, ivec2(0), 0).r;
  float speed = target > prev ? uSpeedUp : uSpeedDown;
  float v = prev + (target - prev) * (1.0 - exp(-uDt * speed));
  if (uReset > 0.5 || prev != prev) v = target;
  gl_FragColor = vec4(v, target, 0.0, 1.0);
}`;

const MB_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvViewProj; uniform mat4 uPrevViewProj; uniform float uStrength;
varying vec2 vUv;
const int SAMPLES = MB_SAMPLES;
void main() {
  vec4 c0 = texture2D(tColor, vUv);
  if (c0.a < 0.5 || uStrength <= 0.0) { gl_FragColor = c0; return; }
  float d = texture2D(tDepth, vUv).r;
  vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec4 pp = uPrevViewProj * wp;
  vec2 puv = (pp.xy / pp.w) * 0.5 + 0.5;
  vec2 vel = (vUv - puv) * uStrength;
  float L = length(vel);
  const float maxL = 0.05;
  if (L > maxL) vel *= maxL / L;
  if (L < 0.0008) { gl_FragColor = c0; return; }
  vec3 acc = c0.rgb; float wsum = 1.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES) - 0.5;
    vec4 s = texture2D(tColor, vUv + vel * t);
    float w = step(0.5, s.a);
    acc += s.rgb * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tAdapt; uniform sampler2D tDirt; uniform sampler2D tDrops;
uniform vec2 uRes; uniform vec2 uSrcTexel; uniform float uTime; uniform float uFrame;
uniform float uFish; uniform float uTanPhi; uniform float uPhi; uniform float uCA;
uniform float uBloom; uniform float uDirt; uniform float uGrain; uniform float uVignette; uniform float uSharpen; uniform float uBlocks;
uniform float uKey; uniform float uMinLog; uniform float uMaxLog; uniform float uExpComp;
uniform float uDamage; uniform float uInfect; uniform float uGlitch; uniform float uFade; uniform float uFlash; uniform float uDesat;
uniform float uDrops; uniform float uHeart;
varying vec2 vUv;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

vec3 filmic(vec3 x) {
  // ACES fitted (Narkowicz) with a slightly harder toe to crush blacks like a small sensor
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

// lens model: output uv -> source uv. k scales per-wavelength magnification (lateral CA)
vec2 lens(vec2 uv, float k, float aspect) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float diag = length(vec2(aspect, 1.0)) * 0.5;
  float rho = length(p) / diag;
  float rin = rho;
  if (uFish > 0.0 && rho > 1e-5) {
    float fe = tan(rho * uPhi) / uTanPhi; // equidistant fisheye -> rectilinear
    rin = mix(rho, fe, uFish);
  }
  rin *= k;
  vec2 ps = rho > 1e-5 ? p * (rin / rho) : p * k;
  return ps / vec2(aspect, 1.0) + 0.5;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv;

  // --- digital glitches (datamosh-ish band tearing) ---
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 24.0 + floor(uTime * 17.0) * 3.0);
    float r = hash12(vec2(band, floor(uTime * 23.0)));
    if (r < uGlitch * 0.5) uv.x += (hash12(vec2(band, 7.0)) - 0.5) * 0.12 * uGlitch;
    vec2 blk = floor(uv * vec2(18.0, 10.0));
    if (hash13(vec3(blk, floor(uTime * 12.0))) < uGlitch * 0.12) uv += (vec2(hash12(blk), hash12(blk + 3.1)) - 0.5) * 0.05;
  }

  // --- lens water drops (outdoor rain; the tap is skipped indoors) ---
  vec4 drop = vec4(0.5, 0.5, 0.0, 0.0);
  if (uDrops > 0.0) drop = texture2D(tDrops, vUv);
  vec2 dropOff = (drop.rg - 0.5) * 0.06 * drop.b * uDrops;
  uv += dropOff;

  // lateral CA is a per-channel magnification about the optical centre, so one lens evaluation
  // (one tan) serves all three channels
  float ca = uCA * 0.006 + uInfect * 0.004 * (0.6 + 0.4 * sin(uTime * 2.3)) + uGlitch * 0.01;
  vec2 uvG = lens(uv, 1.0, aspect);
  vec2 uvR = (uvG - 0.5) * (1.0 + ca) + 0.5;
  vec2 uvB = (uvG - 0.5) * (1.0 - ca) + 0.5;

  vec4 cg = texture2D(tColor, uvG);
  vec3 col = vec3(texture2D(tColor, uvR).r, cg.g, texture2D(tColor, uvB).b);
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);

  // in-camera sharpening (the cheap-sensor halo look)
  if (uSharpen > 0.0) {
    vec3 n = texture2D(tColor, uvG + vec2(uSrcTexel.x, 0.0)).rgb + texture2D(tColor, uvG - vec2(uSrcTexel.x, 0.0)).rgb
           + texture2D(tColor, uvG + vec2(0.0, uSrcTexel.y)).rgb + texture2D(tColor, uvG - vec2(0.0, uSrcTexel.y)).rgb;
    vec3 blur = n * 0.25;
    vec3 detail = col - blur;
    // clamp detail relative to local brightness to avoid ringing on light sources
    float lm = max(dot(blur, vec3(0.333)), 1e-4);
    detail = clamp(detail, -lm * 0.6, lm * 0.6);
    col += detail * uSharpen;
  }

  // out-of-frame guard (only visible with extreme settings)
  if (uvG.x < 0.0 || uvG.x > 1.0 || uvG.y < 0.0 || uvG.y > 1.0) col = vec3(0.0);

  // bloom / veiling glare + lens dirt
  if (uBloom > 0.0) {
    vec3 bloom = texture2D(tBloom, uvG).rgb;
    vec3 dirt = uDirt > 0.0 ? texture2D(tDirt, vUv).rgb : vec3(0.0);
    col = col + bloom * (uBloom + dirt * uDirt);
  }

  // water drops darken/brighten edges slightly
  col *= 1.0 - drop.b * uDrops * 0.15 + drop.a * uDrops * 0.1;

  // --- eye adaptation ---
  float adapted = clamp(texelFetch(tAdapt, ivec2(0), 0).r, uMinLog, uMaxLog);
  float exposure = uKey / exp2(adapted) * uExpComp;
  col *= exposure;

  // natural vignetting (cos^4 falloff) + lens shading
  vec2 pc = (vUv - 0.5) * vec2(aspect, 1.0);
  float rho = length(pc) / (length(vec2(aspect, 1.0)) * 0.5);
  float vig = pow(cos(clamp(rho * uPhi * 0.82, 0.0, 1.5)), 4.0);
  col *= mix(1.0, vig, uVignette);

  // damage / infection tint (pre-tonemap so it stays filmic)
  float edge = smoothstep(0.35, 1.05, rho);
  col = mix(col, col * vec3(1.6, 0.35, 0.3), edge * uDamage * 0.85);
  float pulse = uHeart;
  col = mix(col, col * vec3(0.55, 0.25, 0.25), edge * uInfect * (0.35 + 0.35 * pulse));

  vec3 mapped = filmic(col);

  // bodycam grade: slightly desaturated, cyan-green shadows, warm-clipped highlights
  float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  mapped = mix(vec3(luma), mapped, 0.82 - uDesat * 0.8 - uDamage * 0.3);
  mapped += vec3(-0.006, 0.004, 0.006) * (1.0 - smoothstep(0.0, 0.35, luma));
  mapped = max(mapped, 0.0);

  vec3 outc = toSRGB(mapped);

  // --- macroblocking / quantisation in dark areas (streamed footage artefact) ---
  if (uBlocks > 0.0) {
    vec2 bp = floor(gl_FragCoord.xy / 8.0);
    float bn = hash13(vec3(bp, floor(uTime * 6.0)));
    float y = dot(outc, vec3(0.299, 0.587, 0.114));
    float darkness = 1.0 - smoothstep(0.015, 0.14, y);
    float levels = mix(256.0, 72.0, darkness * uBlocks);
    float yq = floor(y * levels + 0.35 + bn * 0.3) / levels;
    outc += (yq - y) * darkness * uBlocks * 0.8;
  }

  // --- sensor noise: gain-dependent luma noise + fine chroma noise ---
  float gain = clamp(log2(max(exposure, 1e-6)) * 0.12 + 0.6, 0.35, 1.6);
  vec2 fc = gl_FragCoord.xy;
  float t = fract(uFrame * 0.618);
  if (uGrain > 0.0) {
    float n1 = hash13(vec3(fc, t * 911.0)) + hash13(vec3(fc + 17.0, t * 577.0)) - 1.0;
    vec3 nc = hash33(vec3(fc, t * 131.0)) - 0.5;
    float ly = dot(outc, vec3(0.299, 0.587, 0.114));
    float amp = uGrain * gain * (0.015 + 0.075 * pow(1.0 - ly, 2.2));
    outc += n1 * amp + nc * amp * 0.45;
  }

  // flashes, fades
  outc = mix(outc, vec3(1.0), uFlash);
  outc *= 1.0 - uFade;
  // dithering
  outc += (hash12(fc + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new FSQuad();
    this.levels = 6;
    this.mbSamples = 8;
    this.enabled = { bloom: true, motionBlur: true };
    this.frame = 0;
    this.prevViewProj = new THREE.Matrix4();
    this.hasPrev = false;
    this._vp = new THREE.Matrix4();
    this._ivp = new THREE.Matrix4();
    this.resetAdapt = true;
    this.params = {
      fish: 0.6, ca: 0.5, bloom: 0.05, dirt: 0.12, grain: 1.0, vignette: 0.6, sharpen: 0.35, blocks: 0.5,
      key: 0.13, minLog: -9.0, maxLog: 5.0, expComp: 1.0,
      damage: 0, infect: 0, glitch: 0, fade: 0, flash: 0, desat: 0, drops: 0, heart: 0,
      mbStrength: 1.0, adaptUp: 3.0, adaptDown: 1.4,
    };

    this.downMat = mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } });
    this.upMat = mat(UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.adaptMat = mat(ADAPT_FRAG, {
      tSrc: { value: null }, tPrev: { value: null }, uSrcSize: { value: new THREE.Vector2() },
      uDt: { value: 0.016 }, uSpeedUp: { value: 2 }, uSpeedDown: { value: 1 }, uReset: { value: 1 },
    });
    this.makeMBMat();
    this.compMat = mat(COMPOSITE_FRAG, {
      tColor: { value: null }, tBloom: { value: null }, tAdapt: { value: null }, tDirt: { value: null }, tDrops: { value: null },
      uRes: { value: new THREE.Vector2() }, uSrcTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFrame: { value: 0 },
      uFish: { value: 0.6 }, uTanPhi: { value: 1 }, uPhi: { value: 1 }, uCA: { value: 0.5 },
      uBloom: { value: 0.05 }, uDirt: { value: 0.2 }, uGrain: { value: 1 }, uVignette: { value: 0.6 }, uSharpen: { value: 0.3 }, uBlocks: { value: 0.5 },
      uKey: { value: 0.13 }, uMinLog: { value: -9 }, uMaxLog: { value: 5 }, uExpComp: { value: 1 },
      uDamage: { value: 0 }, uInfect: { value: 0 }, uGlitch: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uDesat: { value: 0 },
      uDrops: { value: 0 }, uHeart: { value: 0 },
    });

    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.adaptRT = [new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter }),
                    new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })];
    this.adaptIdx = 0;
    this.rtOpts = rtOpts;
    this.down = []; this.up = [];
    this.sceneRT = null;
    this.mbRT = null;
    this.dirtTex = makeDirtTexture();
    this.dropsTex = null;
    this.blankDrops = new THREE.DataTexture(new Uint8Array([128, 128, 0, 0]), 1, 1);
    this.blankDrops.needsUpdate = true;
  }

  makeMBMat() {
    if (this.mbMat) this.mbMat.dispose();
    this.mbMat = mat(MB_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() }, uStrength: { value: 1 },
    }, { MB_SAMPLES: this.mbSamples });
  }

  configure({ msaa = 0, levels = 6, mbSamples = 8, bloom = true, motionBlur = true }) {
    const needRealloc = msaa !== this.msaa || levels !== this.levels;
    this.msaa = msaa; this.levels = levels;
    if (mbSamples !== this.mbSamples) { this.mbSamples = mbSamples; this.makeMBMat(); }
    this.enabled.bloom = bloom; this.enabled.motionBlur = motionBlur;
    if (needRealloc && this.w) this.setSize(this.w, this.h, true);
  }

  setSize(w, h, force = false) {
    if (!force && w === this.w && h === this.h && this.sceneRT) return;
    this.w = w; this.h = h;
    for (const rt of [this.sceneRT, this.mbRT, ...this.down, ...this.up]) rt && rt.dispose();
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      ...this.rtOpts, depthBuffer: true, depthTexture, samples: this.msaa || 0,
    });
    this.mbRT = new THREE.WebGLRenderTarget(w, h, this.rtOpts);
    this.down = []; this.up = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
      this.down.push(new THREE.WebGLRenderTarget(cw, ch, this.rtOpts));
      if (i < this.levels - 1) this.up.push(new THREE.WebGLRenderTarget(cw, ch, this.rtOpts));
    }
    // choose metering level: largest level with <= 64 px width
    this.meterLevel = this.down.findIndex(rt => rt.width <= 64);
    if (this.meterLevel < 0) this.meterLevel = this.down.length - 1;
  }

  // camera: the render camera (for motion blur reprojection and lens model)
  render(camera, dt, time) {
    const r = this.renderer, p = this.params;
    this.frame++;

    // ---- motion blur (source domain) ----
    let src = this.sceneRT.texture;
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (this.enabled.motionBlur && this.hasPrev && p.mbStrength > 0) {
      const m = this.mbMat.uniforms;
      m.tColor.value = this.sceneRT.texture;
      m.tDepth.value = this.sceneRT.depthTexture;
      m.uInvViewProj.value.copy(this._vp).invert();
      m.uPrevViewProj.value.copy(this.prevViewProj);
      // 180 degree shutter at the footage's nominal 30 fps
      m.uStrength.value = Math.min(1.6, (1 / 60) / Math.max(dt, 1 / 240)) * p.mbStrength;
      this.quad.render(r, this.mbMat, this.mbRT);
      src = this.mbRT.texture;
    }
    this.prevViewProj.copy(this._vp);
    this.hasPrev = true;

    // ---- downsample chain (needed for exposure even without bloom) ----
    let prev = src, pw = this.w, ph = this.h;
    const levelsNeeded = this.enabled.bloom ? this.down.length : this.meterLevel + 1;
    for (let i = 0; i < levelsNeeded; i++) {
      const u = this.downMat.uniforms;
      u.tSrc.value = prev; u.uTexel.value.set(1 / pw, 1 / ph); u.uKaris.value = i === 0 ? 1 : 0;
      this.quad.render(r, this.downMat, this.down[i]);
      prev = this.down[i].texture; pw = this.down[i].width; ph = this.down[i].height;
    }

    // ---- eye adaptation ----
    const meter = this.down[this.meterLevel];
    const a = this.adaptMat.uniforms;
    a.tSrc.value = meter.texture; a.uSrcSize.value.set(meter.width, meter.height);
    a.tPrev.value = this.adaptRT[this.adaptIdx].texture;
    a.uDt.value = Math.min(dt, 0.1); a.uSpeedUp.value = p.adaptUp; a.uSpeedDown.value = p.adaptDown;
    a.uReset.value = this.resetAdapt ? 1 : 0; this.resetAdapt = false;
    this.adaptIdx ^= 1;
    this.quad.render(r, this.adaptMat, this.adaptRT[this.adaptIdx]);

    // ---- bloom upsample ----
    let bloomTex = this.down[0].texture;
    if (this.enabled.bloom) {
      let low = this.down[this.down.length - 1].texture;
      for (let i = this.up.length - 1; i >= 0; i--) {
        const u = this.upMat.uniforms;
        u.tLow.value = low; u.tHigh.value = this.down[i].texture;
        u.uTexel.value.set(1 / this.up[i].width, 1 / this.up[i].height); u.uRadius.value = 1.0;
        this.quad.render(r, this.upMat, this.up[i]);
        low = this.up[i].texture;
      }
      bloomTex = low;
    }

    // ---- composite ----
    const c = this.compMat.uniforms;
    c.tColor.value = src; c.tBloom.value = bloomTex; c.tAdapt.value = this.adaptRT[this.adaptIdx].texture;
    c.tDirt.value = this.dirtTex; c.tDrops.value = this.dropsTex || this.blankDrops;
    c.uRes.value.set(this.w, this.h); c.uSrcTexel.value.set(1 / this.w, 1 / this.h);
    c.uTime.value = time; c.uFrame.value = this.frame;
    const fovV = THREE.MathUtils.degToRad(camera.fov) / camera.zoom;
    const tanPhi = Math.tan(fovV / 2) * Math.sqrt(camera.aspect * camera.aspect + 1);
    c.uTanPhi.value = tanPhi; c.uPhi.value = Math.atan(tanPhi);
    c.uFish.value = p.fish; c.uCA.value = p.ca;
    c.uBloom.value = this.enabled.bloom ? p.bloom : 0; c.uDirt.value = this.enabled.bloom ? p.dirt : 0;
    c.uGrain.value = p.grain; c.uVignette.value = p.vignette; c.uSharpen.value = p.sharpen; c.uBlocks.value = p.blocks;
    c.uKey.value = p.key; c.uMinLog.value = p.minLog; c.uMaxLog.value = p.maxLog; c.uExpComp.value = p.expComp;
    c.uDamage.value = p.damage; c.uInfect.value = p.infect; c.uGlitch.value = p.glitch; c.uFade.value = p.fade;
    c.uFlash.value = p.flash; c.uDesat.value = p.desat; c.uDrops.value = this.dropsTex ? p.drops : 0; c.uHeart.value = p.heart;
    this.quad.render(r, this.compMat, null);
  }

  // Lens-model mapping from screen uv to render uv (used to place 2D markers correctly).
  lensUV(u, v, camera) {
    const aspect = this.w / this.h;
    const px = (u - 0.5) * aspect, py = v - 0.5;
    const diag = Math.hypot(aspect, 1) * 0.5;
    const rho = Math.hypot(px, py) / diag;
    if (rho < 1e-5) return [u, v];
    const fovV = THREE.MathUtils.degToRad(camera.fov) / camera.zoom;
    const tanPhi = Math.tan(fovV / 2) * Math.hypot(camera.aspect, 1);
    const phi = Math.atan(tanPhi);
    const rin = rho + (Math.tan(rho * phi) / tanPhi - rho) * this.params.fish;
    return [px * rin / rho / aspect + 0.5, py * rin / rho + 0.5];
  }

  dispose() {
    for (const rt of [this.sceneRT, this.mbRT, ...this.down, ...this.up, ...this.adaptRT]) rt && rt.dispose();
  }
}

// Smudges, fingerprints and dust specks on the camera window, only visible through bloom.
function makeDirtTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const rnd = mulberry(1337);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = 4 + rnd() ** 2 * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.25;
    gr.addColorStop(0, `rgba(255,250,240,${a})`); gr.addColorStop(0.7, `rgba(255,250,240,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // a greasy thumb smear
  g.save(); g.translate(c.width * 0.7, c.height * 0.3); g.rotate(-0.6);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.05})`; g.lineWidth = 2 + rnd() * 3;
    g.beginPath(); g.ellipse(0, 0, 30 + i * 3, 18 + i * 2, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
