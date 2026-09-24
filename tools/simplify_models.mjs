import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
const dir = process.argv[2];
const targets = { tool_cart: 0.18, plastic_crate_01: 0.2, cardboard_box_01: 0.15, metal_toolbox: 0.25, trashbag: 0.35, boombox: 0.3, vintage_microwave: 0.35, wooden_bookshelf_worn: 0.35, metal_trash_can: 0.35, old_tyre: 0.35, side_table_01: 0.4, modern_arm_chair_01: 0.5, covered_car: 0.5, metal_office_desk: 0.5, sofa_03: 0.6, utility_box_01: 0.6, security_light: 0.5, industrial_wall_lamp: 0.5, fire_alarm: 0.4, medical_box: 0.5, ammo_box: 0.4 };
await MeshoptSimplifier.ready;
const io = new NodeIO();
for (const [id, ratio] of Object.entries(targets)) {
  const f = `${dir}/${id}.glb`;
  if (!fs.existsSync(f)) continue;
  const doc = await io.read(f);
  const before = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
  await doc.transform(dedup(), weld({}), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: false }), prune());
  const after = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
  await io.write(f, doc);
  console.log(id, before, '->', after, (fs.statSync(f).size / 1024 | 0) + 'KB');
}
