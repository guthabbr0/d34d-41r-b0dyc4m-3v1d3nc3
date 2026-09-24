#!/usr/bin/env python3
"""
Downloads and optimises the CC0 assets used by DEAD AIR from Poly Haven
(https://polyhaven.com - all assets are CC0 / public domain).

  textures -> assets/tex/<id>_{d,n,r}.jpg   (albedo, OpenGL normal, packed AO/rough/metal)
  models   -> assets/models/<id>.glb         (self-contained GLB, textures downscaled)
  hdris    -> assets/hdri/<id>.hdr           (downsampled RGBE)

Requires: python3, pillow, numpy.   Usage: python3 tools/fetch_assets.py
"""
import io, json, os, struct, sys, urllib.request
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
OUT_TEX = os.path.join(ROOT, 'assets', 'tex')
OUT_MOD = os.path.join(ROOT, 'assets', 'models')
OUT_HDR = os.path.join(ROOT, 'assets', 'hdri')
for d in (CACHE, OUT_TEX, OUT_MOD, OUT_HDR):
    os.makedirs(d, exist_ok=True)

# id: (diffuse px, normal px, arm px)
TEXTURES = {
    'asphalt_02': (1024, 1024, 512),
    'concrete_pavement': (1024, 512, 512),
    'red_brick_03': (1024, 1024, 512),
    'painted_plaster_wall': (1024, 512, 512),
    'decrepit_wallpaper': (1024, 512, 512),
    'floor_tiles_06': (1024, 512, 512),
    'worn_tile_floor': (1024, 512, 512),
    'wood_floor_worn': (1024, 512, 512),
    'ceiling_interior': (512, 512, 256),
    'concrete_floor_worn_001': (1024, 512, 512),
    'painted_concrete': (1024, 512, 512),
    'dirty_concrete': (1024, 512, 512),
    'rusty_metal_02': (512, 512, 512),
    'painted_metal_shutter': (512, 512, 256),
    'wood_peeling_paint_weathered': (512, 512, 512),
    'kitchen_wood': (512, 512, 256),
    'long_white_tiles': (512, 512, 256),
    'denim_fabric': (512, 512, 256),
    'fabric_pattern_07': (512, 512, 256),
    'leather_white': (512, 512, 256),
    'dirty_carpet': (512, 512, 256),
}

# id: max texture size inside the GLB
MODELS = {
    'sofa_03': 1024, 'modern_arm_chair_01': 512, 'Television_01': 512, 'side_table_01': 512,
    'painted_wooden_chair_01': 512, 'metal_trash_can': 512, 'trashbag': 512, 'cardboard_box_01': 512,
    'covered_car': 1024, 'WetFloorSign_01': 256, 'fire_alarm': 256,
    'industrial_wall_lamp': 256, 'security_light': 256, 'medical_box': 512, 'ammo_box': 512,
    'plastic_crate_01': 512, 'utility_box_01': 512, 'metal_office_desk': 512, 'tool_cart': 512,
    'old_tyre': 512, 'barrel_03': 512, 'wooden_bookshelf_worn': 512, 'vintage_microwave': 512,
    'boombox': 512, 'metal_toolbox': 512,
}

HDRIS = {'hansaplatz': 512, 'creepy_bathroom': 512}

API = 'https://api.polyhaven.com'


def fetch(url):
    name = url.split('/')[-1]
    key = os.path.join(CACHE, str(abs(hash(url)) % 10**8) + '_' + name)
    # stable cache key independent of python hash seed
    import hashlib
    key = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest()[:10] + '_' + name)
    if os.path.exists(key):
        with open(key, 'rb') as f:
            return f.read()
    req = urllib.request.Request(url, headers={'User-Agent': 'dead-air-asset-fetch/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except Exception as e:
            print('  retry', url, e)
            if attempt == 3:
                raise
    with open(key, 'wb') as f:
        f.write(data)
    return data


def fetch_json(url):
    return json.loads(fetch(url).decode())


def img_from(data):
    return Image.open(io.BytesIO(data))


def resize(im, px):
    if max(im.size) > px:
        r = px / max(im.size)
        im = im.resize((max(1, round(im.size[0] * r)), max(1, round(im.size[1] * r))), Image.LANCZOS)
    return im


def jpg_bytes(im, q=82):
    b = io.BytesIO()
    im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=False)
    return b.getvalue()


def do_textures():
    for tid, (dp, np_, ap) in TEXTURES.items():
        outs = [os.path.join(OUT_TEX, f'{tid}_{s}.jpg') for s in 'dnr']
        if all(os.path.exists(o) for o in outs):
            continue
        print('texture', tid)
        files = fetch_json(f'{API}/files/{tid}')
        dkey = 'Diffuse' if 'Diffuse' in files else sorted(k for k in files if k.startswith('col'))[0]
        d = img_from(fetch(files[dkey]['1k']['jpg']['url'])).convert('RGB')
        n = img_from(fetch(files['nor_gl']['1k']['jpg']['url'])).convert('RGB')
        if 'arm' in files:
            a = img_from(fetch(files['arm']['1k']['jpg']['url'])).convert('RGB')
        else:
            rough = img_from(fetch(files['Rough']['1k']['jpg']['url'])).convert('L')
            ao = img_from(fetch(files['AO']['1k']['jpg']['url'])).convert('L') if 'AO' in files else Image.new('L', rough.size, 255)
            a = Image.merge('RGB', (ao, rough, Image.new('L', rough.size, 0)))
        with open(outs[0], 'wb') as f: f.write(jpg_bytes(resize(d, dp), 82))
        with open(outs[1], 'wb') as f: f.write(jpg_bytes(resize(n, np_), 88))
        with open(outs[2], 'wb') as f: f.write(jpg_bytes(resize(a, ap), 85))


def pack_glb(gltf, bin_data, images_bytes):
    """gltf: dict whose images have been replaced by bufferView refs; appends images to bin."""
    buf = bytearray(bin_data)
    def align():
        while len(buf) % 4: buf.append(0)
    align()
    for i, data in enumerate(images_bytes):
        off = len(buf)
        buf.extend(data)
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        gltf['images'][i] = {'bufferView': len(gltf['bufferViews']) - 1, 'mimeType': 'image/jpeg'}
        align()
    gltf['buffers'] = [{'byteLength': len(buf)}]
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(buf)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(buf), 0x004E4942) + bytes(buf)
    return bytes(out)


def do_models():
    for mid, px in MODELS.items():
        out = os.path.join(OUT_MOD, f'{mid}.glb')
        if os.path.exists(out):
            continue
        print('model', mid)
        files = fetch_json(f'{API}/files/{mid}')
        g = files['gltf']['1k']['gltf']
        gltf = json.loads(fetch(g['url']).decode())
        inc = g['include']
        bin_name = [k for k in inc if k.endswith('.bin')][0]
        bin_data = fetch(inc[bin_name]['url'])
        # load all images
        imgs = []
        for im in gltf['images']:
            uri = im['uri']
            imgs.append(img_from(fetch(inc[uri]['url'])))
        # repack metallicRoughness: combine rough (G) + metal (B) when a metal map exists
        new_imgs = list(imgs)
        uris = [im['uri'] for im in gltf['images']]
        for mat in gltf.get('materials', []):
            pbr = mat.get('pbrMetallicRoughness', {})
            mr = pbr.get('metallicRoughnessTexture')
            if not mr: continue
            src = gltf['textures'][mr['index']]['source']
            ruri = uris[src]
            muri = ruri.replace('_rough_', '_metal_')
            rough = imgs[src].convert('L')
            if muri != ruri and muri in inc:
                metal = img_from(fetch(inc[muri]['url'])).convert('L').resize(rough.size)
                pbr['metallicFactor'] = 1.0
            else:
                metal = Image.new('L', rough.size, 0)
            new_imgs[src] = Image.merge('RGB', (Image.new('L', rough.size, 255), rough, metal))
        img_bytes = [jpg_bytes(resize(im.convert('RGB'), px), 84) for im in new_imgs]
        # buffer: drop uri
        glb = pack_glb(gltf, bin_data, img_bytes)
        with open(out, 'wb') as f:
            f.write(glb)
        print('   ', len(glb) // 1024, 'KB')


def read_hdr(data):
    # minimal Radiance RGBE reader (new-style RLE)
    f = io.BytesIO(data)
    line = f.readline()
    while True:
        line = f.readline().strip()
        if line == b'':
            break
    dims = f.readline().split()
    h, w = int(dims[1]), int(dims[3])
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        hdr = f.read(4)
        if hdr[0] == 2 and hdr[1] == 2:
            for c in range(4):
                x = 0
                row = out[y, :, c]
                while x < w:
                    cnt = f.read(1)[0]
                    if cnt > 128:
                        cnt -= 128
                        v = f.read(1)[0]
                        row[x:x + cnt] = v
                    else:
                        row[x:x + cnt] = np.frombuffer(f.read(cnt), np.uint8)
                    x += cnt
        else:
            raise ValueError('unsupported hdr encoding')
    rgbe = out.astype(np.float32)
    e = rgbe[..., 3]
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0)
    return rgbe[..., :3] * scale[..., None]


def write_hdr(rgb):
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    mant, ex = np.frexp(m)
    sc = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * sc[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    head = b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode()
    return head + out.tobytes()


def do_hdris():
    for hid, px in HDRIS.items():
        out = os.path.join(OUT_HDR, f'{hid}.hdr')
        if os.path.exists(out):
            continue
        print('hdri', hid)
        files = fetch_json(f'{API}/files/{hid}')
        rgb = read_hdr(fetch(files['hdri']['1k']['hdr']['url']))
        h, w, _ = rgb.shape
        f = w // px
        rgb = rgb[:h - h % f, :w - w % f].reshape(h // f, f, w // f, f, 3).mean(axis=(1, 3))
        with open(out, 'wb') as fo:
            fo.write(write_hdr(rgb.astype(np.float32)))


if __name__ == '__main__':
    do_textures()
    do_models()
    do_hdris()
    total = 0
    for d in (OUT_TEX, OUT_MOD, OUT_HDR):
        for fn in os.listdir(d):
            total += os.path.getsize(os.path.join(d, fn))
    print('total asset size: %.1f MB' % (total / 1e6))
