// DEAD AIR perf scenario for recursive-profiling webgl_probe.js.
// Deterministic worst cases: menu backdrop, intro drive, lot, corridor, then the courtyard finale
// with the officer immortal, a horde of 12 kept topped up in the forward arc and the pistol held.
//
//   node <skill>/scripts/webgl_probe.js --url "http://127.0.0.1:8080/index.html?auto=1&q=low&fastcard=1" \
//        --scenario perf/scenario.cjs --out perf/run-N --chrome /opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//        [--budget perf/budget.json] [--quick] [--scale 0.6] [--nosweep]
//
// The render scale is pinned (dynamic resolution off) in every phase except "scaler", so two runs
// of two builds do identical GPU work and only the counts and relative times differ.
module.exports = async function scenario({ evaluate, sleep, waitUntil, phase, log, args }) {
  const S = args.quick ? 0.6 : 1;          // --quick shortens every phase for smoke runs
  const secs = (n) => Math.max(3, Math.round(n * S));

  await waitUntil('game ready', 'window.__DA && window.__DA.ready === true', 240000);

  // one helper namespace in the page: preset switching with a pinned scale, horde driver
  await evaluate(`(() => {
    const A = window.__DA.app, g = window.__DA.game, THREE = window.__DA.THREE;
    const P = window.__PERFDA = {};
    P.pin = ${args.scale ? +args.scale : 0};   // --scale N pins the render scale for every preset
    P.preset = (name, dynamic = false) => {
      A.settings.applyPreset(name, false);
      if (P.pin) A.settings.set('resScale', P.pin, false);
      A.settings.set('dynamicRes', dynamic, false);
      A.settings.set('showFps', false, false);
      A.applySettings();
      A.renderer.scale = A.renderer.maxScale; A.renderer.resize(true);
      return A.renderer.w + 'x' + A.renderer.h;
    };
    // Horde: keep N infected alive 5-12 m ahead of the officer, pistol held, infinite ammo, no grabs.
    P.horde = (n) => {
      const st = A.story, p = g.player, w = g.weapons;
      g.godMode = true; g.noGrab = true;
      let k = 0;
      const fwd = () => new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      st.tick = () => {
        g.noGrab = true;
        if (w.current === 'pistol') { w.ammo.pistol = 17; } else { w.ammo.shotgun = 6; }
        let alive = g.aliveCount();
        while (alive < n) {
          const f = fwd(), r = new THREE.Vector3(-f.z, 0, f.x);
          const d = 6 + (k * 2.3) % 6, lat = ((k * 1.7) % 7) - 3.5;
          const pos = p.pos.clone().addScaledVector(f, d).addScaledVector(r, lat);
          pos.x = Math.max(-14, Math.min(14.2, pos.x)); pos.z = Math.max(-35, Math.min(-20.8, pos.z)); pos.y = 0;
          g.spawnZombie(pos, p.yaw, { alert: true, state: 'chase', runner: k % 5 === 0, variant: k % g.templates.length });
          k++; alive++;
        }
      };
      g.input._set('fire', true, 'perf');
      return g.aliveCount();
    };
    // fill-rate experiment: same scene at half the linear render scale (quarter of the pixels)
    P.scaleTo = (k) => { const R = A.renderer; R.dynamic = false; R.maxScale = R.scale = k; R.resize(true); return R.w + 'x' + R.h; };
    P.stopFire = () => { g.input._set('fire', false, 'perf'); return true; };
    // Resident texture memory estimate (the probe cannot see three.js's texStorage2D uploads):
    // every texture reachable from scene materials, plus the post chain and shadow render targets.
    P.texMb = () => {
      const seen = new Set(); let bytes = 0;
      const bpp = (t) => (t.type === THREE.FloatType ? 16 : t.type === THREE.HalfFloatType ? 8 : 4);
      const add = (t) => {
        if (!t || !t.isTexture || seen.has(t)) return; seen.add(t);
        const img = t.image || {}; const w = img.width || 0, h = img.height || 0;
        const faces = t.isCubeTexture ? 6 : 1, mip = t.generateMipmaps !== false && !t.isRenderTargetTexture ? 4 / 3 : 1;
        bytes += w * h * bpp(t) * faces * mip;
      };
      g.scene.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          for (const k in m) if (m[k] && m[k].isTexture) add(m[k]);
          if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) add(v); }
        }
      });
      const post = A.renderer.post;
      for (const rt of [post.sceneRT, post.mbRT, ...post.down, ...post.up, ...post.adaptRT]) if (rt) { bytes += rt.width * rt.height * 8; if (rt.depthTexture) bytes += rt.width * rt.height * 4; }
      const sm = g.weapons.spot.shadow.map; if (sm) bytes += sm.width * sm.height * 8;
      return +(bytes / 1048576).toFixed(1);
    };
    P.info = () => ({ state: A.state, cp: A.story.checkpoint, zombies: g.zombies.length, alive: g.aliveCount(), scale: A.renderer.scale, size: A.renderer.w + 'x' + A.renderer.h, calls: A.renderer.sceneInfo && A.renderer.sceneInfo.calls });
    return true;
  })()`);

  const preset = args.preset || 'low';
  log('pinned ' + preset + ': ' + await evaluate(`window.__PERFDA.preset(${JSON.stringify(preset)})`));

  // 1. title screen with the menu backdrop (street, rain, feeding infected)
  await sleep(2000);
  log('texture memory estimate at title: ' + await evaluate('window.__PERFDA.texMb()') + ' MB');
  log('synthesised audio bank: ' + await evaluate('(() => { let b = 0, n = 0; for (const k in window.__DA.app.audio.buffers) { const x = window.__DA.app.audio.buffers[k]; b += x.length * x.numberOfChannels * 4; n++; } return (b / 1048576).toFixed(1) + " MB in " + n + " buffers"; })()'));
  await phase('menu', secs(6));

  // 2. intro drive (car interior, wheel arms, wipers, siren, street lights streaming past)
  await evaluate(`window.__DA.app.play('intro'), true`);
  await waitUntil('intro driving', `(() => { const c = window.__DA.game.level.car; return c && c.position.x < 120; })()`, 60000);
  await phase('intro-drive', secs(8), { profile: true });

  // 3. lot / lobby (checkpoint 0) — outdoor, police car lightbar, rain, three lights in the pool
  await evaluate(`window.__DA.app.play('cp0'), true`);
  await sleep(2500);
  await phase('lot', secs(8));

  // 4. corridor (checkpoint 1) — interior, fluorescent flicker, flashlight shadows
  await evaluate(`window.__DA.app.play('cp1'), true`);
  await sleep(2500);
  await phase('corridor', secs(8));

  // 5. heavy: courtyard, 12 infected, full fire, ragdolls, blood, brass
  await evaluate(`window.__DA.app.play('cp2'), true`);
  await sleep(1500);
  log('horde: ' + await evaluate(`window.__PERFDA.horde(12)`));
  await sleep(3000);
  log(JSON.stringify(await evaluate('window.__PERFDA.info()')));
  await phase('heavy', secs(12), { profile: true });
  log('texture memory estimate in heavy: ' + await evaluate('window.__PERFDA.texMb()') + ' MB');
  log('in-game CPU split (EMA ms/frame): ' + await evaluate('JSON.stringify(window.__DA.app.cpu)'));

  // 5b. halve the render scale: GPU time that falls with it is fragment work, what stays is vertices/submission
  const base = await evaluate('window.__DA.app.renderer.scale');
  log('half scale: ' + await evaluate(`window.__PERFDA.scaleTo(${base / 2})`));
  await sleep(1500);
  await phase('heavy-halfscale', secs(6), { shot: false });
  await evaluate(`window.__PERFDA.scaleTo(${base})`);

  // 6. preset sweep on the same heavy scene (pinned scale per preset)
  if (!args.nosweep) {
    for (const q of ['medium', 'high']) {
      log(q + ': ' + await evaluate(`window.__PERFDA.preset('${q}')`));
      await sleep(1500);
      await phase('heavy-' + q, secs(6), { shot: true });
    }
    log(preset + ': ' + await evaluate(`window.__PERFDA.preset(${JSON.stringify(preset)})`));
  }

  // 7. auto resolution scaler on the heavy scene: render-target churn and recovery
  await evaluate(`window.__PERFDA.preset(${JSON.stringify(preset)}, true)`);
  await phase('scaler', secs(12), { shot: false });
  log(JSON.stringify(await evaluate('window.__PERFDA.info()')));
  await evaluate(`window.__PERFDA.stopFire(); window.__PERFDA.preset(${JSON.stringify(preset)})`);

  // 8. soak: back to the title screen; resources must return to the menu baseline
  await evaluate(`window.__DA.app.story.tick = null; window.__DA.app.toMenu(), true`);
  await sleep(2500);
  await phase('menu-return', secs(6));
};
