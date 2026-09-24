// Material library: PBR sets from Poly Haven scans + shader patches for wet surfaces
// (puddles, rain ripples) and grime (dirt creeping up from floors, large-scale staining).
import * as THREE from 'three';

export const shared = {
  uTime: { value: 0 },
  uWet: { value: 1 },       // outdoor wetness 0..1 (rain)
  uRainRipples: { value: 1 },
};

const NOISE_GLSL = /* glsl */`
varying vec3 vWPos;
uniform float uTime; uniform float uWet; uniform float uRainRipples;
uniform float uGrime; uniform float uGrimeBase; uniform float uPuddles; uniform float uWetAmt;
float dah(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dah(i), dah(i + vec2(1, 0)), f.x), mix(dah(i + vec2(0, 1)), dah(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
vec2 ripples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int l = 0; l < 2; l++) {
    vec2 q = p * (l == 0 ? 2.6 : 3.9) + float(l) * 7.13;
    vec2 cell = floor(q), f = fract(q);
    float h = dah(cell);
    vec2 c = vec2(dah(cell + 1.3), dah(cell + 2.7)) * 0.6 + 0.2;
    float tt = fract(t * (0.8 + h * 0.5) + h);
    vec2 d = f - c; float r = length(d);
    float ring = tt * 0.42;
    float w = exp(-pow((r - ring) * 26.0, 2.0)) * (1.0 - tt) * (1.0 - tt);
    acc += (d / max(r, 1e-3)) * w * sin((r - ring) * 70.0);
  }
  return acc;
}
`;

export function patchSurface(mat, { grime = 0, grimeBase = 0, wet = false, puddles = 0, wetAmt = 1 } = {}) {
  const u = {
    uGrime: { value: grime }, uGrimeBase: { value: grimeBase }, uPuddles: { value: puddles }, uWetAmt: { value: wet ? wetAmt : 0 },
  };
  mat.userData.surfU = u;
  mat.userData.patchOpts = { grime, grimeBase, wet, puddles, wetAmt };
  const key = `s${grime > 0 ? 1 : 0}${grimeBase > 0 ? 1 : 0}${wet ? 1 : 0}${puddles > 0 ? 1 : 0}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, shared);
    if (wet) sh.defines = { ...(sh.defines || {}), SURF_WET: 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float surfStain = fbm2(vWPos.xz * 0.45 + vWPos.y * 0.3);
        diffuseColor.rgb *= mix(1.0, mix(0.62, 1.08, surfStain), uGrime);
        diffuseColor.rgb *= 1.0 - uGrimeBase * (1.0 - smoothstep(0.0, 0.55, vWPos.y)) * (0.6 + 0.4 * surfStain);
        #ifdef SURF_WET
          vec3 wN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
          float up = smoothstep(0.6, 0.9, wN.y);
          float pud = smoothstep(0.52, 0.6, fbm2(vWPos.xz * 0.33 + 3.1)) * uPuddles * up;
          float wetness = uWet * uWetAmt;
          diffuseColor.rgb *= mix(1.0, 0.62, wetness);
          diffuseColor.rgb *= mix(1.0, 0.55, pud * wetness);
        #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef SURF_WET
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wetness);
          roughnessFactor = mix(roughnessFactor, 0.035, pud * wetness);
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef SURF_WET
          vec3 flatN = nonPerturbedNormal;
          normal = normalize(mix(normal, flatN, pud * wetness * 0.9));
          vec2 rp = ripples(vWPos.xz, uTime) * uRainRipples * wetness * up * (0.25 + pud);
          normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * 0.6);
        #endif`);
  };
  return mat;
}

// Vertex-coloured variant (baked contact occlusion) of a library material, cached.
const vcCache = new WeakMap();
export function vcMaterial(m) {
  let c = vcCache.get(m);
  if (c) return c;
  c = m.clone();
  c.vertexColors = true;
  c.userData = { ...m.userData };
  if (m.userData.patchOpts) patchSurface(c, m.userData.patchOpts);
  vcCache.set(m, c);
  return c;
}

export class MaterialLib {
  constructor(assets, quality = 2) {
    this.assets = assets;
    this.q = quality;
    this.m = {};
    this.build();
  }

  pbr(id, o = {}) {
    const s = this.assets.tex[id] || {};
    const mat = new THREE.MeshStandardMaterial({
      map: s.d || null, normalMap: s.n || null,
      roughnessMap: s.r || null, metalnessMap: o.metal ? s.r : null, aoMap: s.r || null,
      roughness: o.rough ?? 1, metalness: o.metal ? 1 : 0,
      color: new THREE.Color(o.color ?? 0xffffff),
      normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
      envMapIntensity: o.env ?? 0.35,
      side: o.side ?? THREE.FrontSide,
    });
    mat.aoMapIntensity = o.ao ?? 1;
    mat.userData.tile = o.tile ?? 2;   // metres per texture repeat (used by geometry builder)
    mat.userData.surf = o.surfType ?? 0;
    if (o.patch) patchSurface(mat, o.patch);
    mat.name = o.name || id;
    return mat;
  }

  build() {
    const m = this.m;
    const outdoorWet = { wet: true, puddles: 1, wetAmt: 1, grime: 0.6 };
    m.asphalt = this.pbr('asphalt_02', { tile: 3, color: 0xb8b8b8, rough: 1, patch: outdoorWet, env: 0.8, name: 'asphalt' });
    m.sidewalk = this.pbr('concrete_pavement', { tile: 1.8, color: 0xc8c4bc, patch: { wet: true, puddles: 0.6, grime: 0.5 }, env: 0.8, name: 'sidewalk' });
    m.curb = this.pbr('concrete_floor_worn_001', { tile: 1.5, color: 0xaaa69d, patch: { wet: true, puddles: 0, grime: 0.4 }, env: 0.7, name: 'curb' });
    m.brick = this.pbr('red_brick_03', { tile: 1.0, color: 0xc0a8a0, patch: { wet: true, wetAmt: 0.45, grime: 0.5, grimeBase: 0.3 }, env: 0.5, name: 'brick' });
    m.brickDry = this.pbr('red_brick_03', { tile: 1.0, color: 0xa89088, patch: { grime: 0.5, grimeBase: 0.35 }, name: 'brickDry' });
    m.plaster = this.pbr('painted_plaster_wall', { tile: 2, color: 0xcfc9b8, patch: { grime: 0.8, grimeBase: 0.6 }, name: 'plaster' });
    m.plasterGreen = this.pbr('painted_plaster_wall', { tile: 2, color: 0x8f9a86, patch: { grime: 0.9, grimeBase: 0.7 }, name: 'plasterGreen' });
    m.wallpaper = this.pbr('decrepit_wallpaper', { tile: 2.5, color: 0xd0c4b0, patch: { grime: 0.7, grimeBase: 0.5 }, name: 'wallpaper' });
    m.lobbyFloor = this.pbr('floor_tiles_06', { tile: 3, color: 0xb0aca4, rough: 0.9, patch: { grime: 0.8 }, env: 0.6, surfType: 6, name: 'lobbyFloor' });
    m.corridorFloor = this.pbr('worn_tile_floor', { tile: 2, color: 0xa09a90, patch: { grime: 0.6 }, env: 0.5, surfType: 6, name: 'corridorFloor' });
    m.woodFloor = this.pbr('wood_floor_worn', { tile: 2, color: 0x9a8a78, patch: { grime: 0.6 }, env: 0.4, surfType: 2, name: 'woodFloor' });
    m.ceiling = this.pbr('ceiling_interior', { tile: 2, color: 0xa8a49a, patch: { grime: 0.8 }, env: 0.2, name: 'ceiling' });
    m.concreteFloor = this.pbr('concrete_floor_worn_001', { tile: 3, color: 0x9a968e, patch: { grime: 0.8 }, name: 'concreteFloor' });
    m.courtGround = this.pbr('dirty_concrete', { tile: 3, color: 0xa8a49c, patch: { wet: true, puddles: 1.1, grime: 0.7 }, env: 0.8, name: 'courtGround' });
    m.paintedConcrete = this.pbr('painted_concrete', { tile: 2, color: 0x9aa89a, patch: { grime: 0.8, grimeBase: 0.6 }, name: 'paintedConcrete' });
    m.concreteWall = this.pbr('dirty_concrete', { tile: 3, color: 0x8e8a84, patch: { wet: true, wetAmt: 0.4, grime: 0.6, grimeBase: 0.4 }, name: 'concreteWall' });
    m.rust = this.pbr('rusty_metal_02', { tile: 1, color: 0xb0b0b0, metal: true, env: 0.8, surfType: 1, name: 'rust' });
    m.shutter = this.pbr('painted_metal_shutter', { tile: 2, color: 0x8a8f94, metal: true, env: 0.8, surfType: 1, name: 'shutter' });
    m.doorWood = this.pbr('wood_peeling_paint_weathered', { tile: 0.76, color: 0x8c7b6a, surfType: 2, name: 'doorWood' });
    m.kitchenWood = this.pbr('kitchen_wood', { tile: 0.6, color: 0xb09c86, surfType: 2, name: 'kitchenWood' });
    m.whiteTiles = this.pbr('long_white_tiles', { tile: 1.27, color: 0xc8c8c0, rough: 0.8, env: 0.7, surfType: 6, name: 'whiteTiles' });
    m.carpet = this.pbr('dirty_carpet', { tile: 0.6, color: 0x8a7a6a, surfType: 5, name: 'carpet' });
    m.denim = this.pbr('denim_fabric', { tile: 0.1, color: 0x4a5870, surfType: 5, name: 'denim' });

    // simple non-textured materials
    m.metalDark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 1.0, envMapIntensity: 0.8 });
    m.metalPainted = new THREE.MeshStandardMaterial({ color: 0x5b6168, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.6 });
    m.metalBrushed = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.35, metalness: 1.0, envMapIntensity: 0.9 });
    m.doorFrame = new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.6, metalness: 0.2 });
    m.rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
    m.plasticBlack = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5, metalness: 0 });
    m.plasticWhite = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.45 });
    m.glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.18, envMapIntensity: 2.0, depthWrite: false });
    m.carGlassClear = new THREE.MeshStandardMaterial({ color: 0x8898a0, roughness: 0.03, transparent: true, opacity: 0.08, envMapIntensity: 1.5, depthWrite: false });
    m.glassDark = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.6 });
    m.windowLit = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 4, roughness: 0.2 });
    m.windowLitCool = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9ab8d8, emissiveIntensity: 2.5, roughness: 0.2 });
    m.emissiveTube = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe8f0ff, emissiveIntensity: 30 });
    m.exitSign = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 18 });
    m.paintWhite = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.7 });
    m.paintYellow = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.6 });
    m.carPaintBlack = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.4 });
    m.carPaintWhite = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.28, metalness: 0.4, envMapIntensity: 1.2 });
    m.chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.5 });
    m.lightRed = new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff0a05, emissiveIntensity: 0 });
    m.lightBlue = new THREE.MeshStandardMaterial({ color: 0x000020, emissive: 0x1030ff, emissiveIntensity: 0 });
    m.headlight = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 20 });
    m.taillight = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1000, emissiveIntensity: 4 });
    m.sodium = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 60 });
    m.fabricDark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 });
    m.bloodPool = new THREE.MeshStandardMaterial({ color: 0x2a0302, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.2, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
}
