// Portal-culling correctness check (evaluated in the page after __DA.ready; driven by perf/pvs_check.mjs).
// Every door that can open is swung open. For walkable camera poses in every zone the level is rendered once with
// flat ID materials: meshes the zone table keeps are black, meshes it culls get a unique colour, glass
// is skipped (see-through). Any coloured pixel is a mesh the camera can see but the PVS would cull.
(() => {
  const { THREE, app, game: g } = window.__DA;
  const r = app.renderer.gl, cam = g.player.camera, nav = g.nav, L = g.level;
  const W = 112, H = 63;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const px = new Uint8Array(W * H * 4);
  const zoneAt = window.__DA.zoneAt, BLACK = new THREE.Color(0, 0, 0);

  // ---- scene setup: only level meshes, flat ID materials, doors open
  const hiddenTop = [];
  for (const o of g.scene.children) if (o !== L.root && o.visible) { o.visible = false; hiddenTop.push(o); }
  const meshes = [], saved = [];
  L.root.traverse(o => {
    if ((o.isLine || o.isPoints || o.isSprite) && o.visible) { saved.push([o, o.material, true]); o.visible = false; return; }
    if (!o.isMesh) return;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    saved.push([o, o.material, o.visible]);
    if (m0.transparent && (m0.opacity < 0.99 || m0.blending !== THREE.NormalBlending || /glass/i.test(m0.name || ''))) { o.visible = false; return; }
    if (m0.transmission > 0 || m0.depthWrite === false) { o.visible = false; return; }
    const id = meshes.length + 1;
    o.material = new THREE.MeshBasicMaterial({ color: 0x000000, side: m0.side, fog: false });
    meshes.push({ o, id, color: new THREE.Color((id & 255) / 255, ((id >> 8) & 255) / 255, 0) });
  });
  const doorState = L.doors.map(d => ({ d, rot: d.pivot.rotation.y, en: d.solid.enabled, open: d.open, target: d.target }));
  // worst case: every door that can ever open is wide open; sealed doors (permanently locked) stay shut
  const allOpen = (window.__PVS_DOORS || 'open') === 'open';   // 'init': doors as the level starts
  for (const d of L.doors) {
    if (!d.sealed && allOpen) { d.open = d.target = 1; d.solid.enabled = false; }
    d.pivot.rotation.y = -d.open * d.maxAngle * d.swing; d.group.updateMatrixWorld(true);
  }
  nav.rebuild();

  // ---- reachable cells: flood fill from the checkpoint starts (sealed rooms count as walls)
  const reach = new Uint8Array(nav.w * nav.h), q = [];
  const cellOf = (x, z) => Math.floor((z - nav.minz) / nav.cell) * nav.w + Math.floor((x - nav.minx) / nav.cell);
  for (const k in L.playerStarts) { const c = cellOf(L.playerStarts[k].pos.x, L.playerStarts[k].pos.z); reach[c] = 1; q.push(c); }
  while (q.length) {
    const c = q.pop(), cx = c % nav.w, cz = (c / nav.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= nav.w || nz >= nav.h) continue;
      const n = nz * nav.w + nx;
      if (reach[n] || nav.blocked[n]) continue;
      const x = nav.minx + (nx + 0.5) * nav.cell, z = nav.minz + (nz + 0.5) * nav.cell;
      const zz = zoneAt(x, z);
      // sealed rooms are walls; 'street' south of the lot is the strip behind the neighbour walls (the
      // nav grid leaks through a 0.3 m gap a 0.6 m wide player cannot pass); |x| > 40 is open street
      if (zz === 'sealed' || (zz === 'street' && z < 13) || x > 40 || x < -40 || z > 30) continue;
      reach[n] = 1; q.push(n);
    }
  }

  // ---- poses
  const savedCam = { pos: cam.position.clone(), quat: cam.quaternion.clone(), parent: cam.parent, mask: cam.layers.mask, fov: cam.fov, aspect: cam.aspect };
  if (cam.parent) cam.parent.remove(cam);
  cam.aspect = W / H; cam.fov = 100; cam.updateProjectionMatrix();
  cam.layers.mask = 0xffffffff;
  const st = Math.round(+(window.__PVS_STEP || 1.5) / nav.cell), NY = +(window.__PVS_YAWS || 6);
  const culprit = new Map(), perZone = {}, failZone = {};
  let lastMask = -1, poses = 0, failures = 0;
  for (let gz = 0; gz < nav.h; gz += st) {
    for (let gx = 0; gx < nav.w; gx += st) {
      if (!reach[gz * nav.w + gx]) continue;
      const x = nav.minx + (gx + 0.5) * nav.cell, z = nav.minz + (gz + 0.5) * nav.cell;
      const zone = zoneAt(x, z);
      if ((zone === 'street' || zone === 'alley') && ((gx / st) % 3 || (gz / st) % 3)) continue;   // open areas: sparser
      for (const eye of [1.5, 1.7]) for (let k = 0; k < NY; k++) {
        const yaw = k / NY * Math.PI * 2;
        cam.position.set(x, eye, z);
        cam.rotation.set(eye > 1.6 ? -0.25 : 0.12, yaw, 0, 'YXZ');
        cam.updateMatrixWorld(true);
        const mask = L.visMaskFor(cam);   // exactly what the renderer computes for this view
        if (mask !== lastMask) {
          for (const m of meshes) m.o.material.color.copy((m.o.layers.mask & mask) ? BLACK : m.color);
          lastMask = mask;
        }
        r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(g.scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, W, H, px);
        poses++; perZone[zone] = (perZone[zone] || 0) + 1;
        let bad = 0;
        const hits = new Map();
        for (let i = 0; i < px.length; i += 4) {
          const id = px[i] | (px[i + 1] << 8);
          if (!id || id > meshes.length || px[i + 2]) continue;   // black, or not an ID colour
          bad++; hits.set(id, (hits.get(id) || 0) + 1);
        }
        if (bad > 2) {
          failures++; failZone[zone] = (failZone[zone] || 0) + 1;
          for (const [id, n] of hits) {
            const c = culprit.get(id) || { n: 0, poses: 0, zones: new Set(), at: null };
            c.n += n; c.poses++; c.zones.add(zone); if (!c.at || n > c.atN) { c.at = [+x.toFixed(1), eye, +z.toFixed(1), +yaw.toFixed(2)]; c.atN = n; }
            culprit.set(id, c);
          }
        }
      }
    }
  }

  // ---- restore
  r.setRenderTarget(null); rt.dispose();
  for (const [o, mat, vis] of saved) { if (o.material !== mat) o.material.dispose(); o.material = mat; o.visible = vis; }
  for (const o of hiddenTop) o.visible = true;
  for (const { d, rot, en, open, target } of doorState) { d.pivot.rotation.y = rot; d.solid.enabled = en; d.open = open; d.target = target; d.group.updateMatrixWorld(true); }
  nav.rebuild();
  if (savedCam.parent) savedCam.parent.add(cam);
  cam.position.copy(savedCam.pos); cam.quaternion.copy(savedCam.quat); cam.layers.mask = savedCam.mask;
  cam.fov = savedCam.fov; cam.aspect = savedCam.aspect; cam.updateProjectionMatrix();

  const sph = new THREE.Sphere();
  const describe = (o) => {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    const m = saved.find(s => s[0] === o)[1];
    const mm = Array.isArray(m) ? m[0] : m;
    let layer = 0; for (let b = 0; b < 32; b++) if (o.layers.mask & (1 << b)) { layer = b; break; }
    return { name: o.name || (o.parent && o.parent.name) || o.type, mat: mm.name || (mm.map && mm.map.image && mm.map.image.src ? mm.map.image.src.split('/').pop() : mm.type + ':' + (mm.color ? mm.color.getHexString() : '')),
      layer, zoneTag: o.userData.zone, c: [+sph.center.x.toFixed(1), +sph.center.y.toFixed(1), +sph.center.z.toFixed(1)], r: +sph.radius.toFixed(1), v: o.geometry.attributes.position.count };
  };
  const top = [...culprit.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30)
    .map(([id, c]) => ({ px: c.n, poses: c.poses, seenFrom: [...c.zones], at: c.at, ...describe(meshes[id - 1].o) }));
  return { poses, perZone, failures, failZone, culprits: culprit.size, top };
})()
