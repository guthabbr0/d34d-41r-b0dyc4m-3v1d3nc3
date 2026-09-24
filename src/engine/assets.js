import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// Poly Haven CC0 surface sets: <id>_d.jpg (albedo), _n.jpg (GL normal), _r.jpg (AO/rough/metal)
export const TEXTURE_SETS = [
  'asphalt_02', 'concrete_pavement', 'red_brick_03', 'painted_plaster_wall', 'decrepit_wallpaper',
  'floor_tiles_06', 'worn_tile_floor', 'wood_floor_worn', 'ceiling_interior', 'concrete_floor_worn_001',
  'painted_concrete', 'dirty_concrete', 'rusty_metal_02', 'painted_metal_shutter', 'wood_peeling_paint_weathered',
  'kitchen_wood', 'long_white_tiles', 'denim_fabric', 'fabric_pattern_07', 'leather_white', 'dirty_carpet',
];

export const MODELS = [
  'sofa_03', 'modern_arm_chair_01', 'Television_01', 'side_table_01', 'painted_wooden_chair_01', 'metal_trash_can',
  'trashbag', 'cardboard_box_01', 'covered_car', 'WetFloorSign_01', 'fire_alarm',
  'industrial_wall_lamp', 'security_light', 'medical_box', 'ammo_box', 'plastic_crate_01', 'utility_box_01',
  'metal_office_desk', 'tool_cart', 'old_tyre', 'barrel_03', 'wooden_bookshelf_worn', 'vintage_microwave', 'boombox',
  'metal_toolbox',
];

export const HDRIS = ['hansaplatz', 'creepy_bathroom'];

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.tex = {};       // id -> {d, n, r}
    this.models = {};    // id -> THREE.Group (template)
    this.env = {};       // id -> PMREM texture
    this.anisotropy = 4;
    this.lowTex = false;
    this.base = 'assets/';
  }

  async loadAll(onProgress) {
    const manager = new THREE.LoadingManager();
    const texLoader = new THREE.TextureLoader(manager);
    const gltfLoader = new GLTFLoader(manager);
    const hdrLoader = new HDRLoader(manager);
    const jobs = [];
    let done = 0;
    const total = TEXTURE_SETS.length * 3 + MODELS.length + HDRIS.length;
    const tick = (label) => { done++; onProgress && onProgress(done / total, label); };

    const loadTex = (url, srgb) => new Promise((res) => {
      texLoader.load(url, (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (this.lowTex) downscaleTexture(t, 512);
        res(t);
      }, undefined, () => { console.warn('texture failed', url); res(null); });
    });

    for (const id of TEXTURE_SETS) {
      const set = {};
      this.tex[id] = set;
      for (const [k, srgb] of [['d', true], ['n', false], ['r', false]]) {
        jobs.push(loadTex(`${this.base}tex/${id}_${k}.jpg`, srgb).then(t => { set[k] = t; tick('texture ' + id); }));
      }
    }
    for (const id of MODELS) {
      jobs.push(new Promise(res => {
        gltfLoader.load(`${this.base}models/${id}.glb`, (g) => {
          const root = g.scene;
          root.traverse(o => {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true;
              const m = o.material;
              if (m) {
                for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) m[k].anisotropy = Math.min(4, this.anisotropy);
                if (m.transparent && m.alphaMap == null && !m.map?.format) m.transparent = false;
                m.envMapIntensity = 0.6;
              }
            }
          });
          this.models[id] = root;
          tick('model ' + id); res();
        }, undefined, () => { console.warn('model failed', id); this.models[id] = new THREE.Group(); tick('model ' + id); res(); });
      }));
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer.gl);
    for (const id of HDRIS) {
      jobs.push(new Promise(res => {
        hdrLoader.load(`${this.base}hdri/${id}.hdr`, (t) => {
          t.mapping = THREE.EquirectangularReflectionMapping;
          this.env[id] = pmrem.fromEquirectangular(t).texture;
          t.dispose();
          tick('environment ' + id); res();
        }, undefined, () => { console.warn('hdr failed', id); tick('environment ' + id); res(); });
      }));
    }
    await Promise.all(jobs);
    pmrem.dispose();
  }

  // Clone a model template; optionally scale to a target height (m) and set shadow flags.
  model(id, { height, cast = true, receive = true } = {}) {
    const src = this.models[id];
    if (!src) return new THREE.Group();
    const o = src.clone(true);
    o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
    if (height) {
      const b = new THREE.Box3().setFromObject(o);
      const s = height / Math.max(1e-3, b.max.y - b.min.y);
      o.scale.setScalar(s);
    }
    return o;
  }
}

function downscaleTexture(t, max) {
  const img = t.image;
  if (!img || !img.width || Math.max(img.width, img.height) <= max) return;
  const s = max / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  t.image = c;
}
