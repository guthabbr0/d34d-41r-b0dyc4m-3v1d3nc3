# DEAD AIR — performance pass

Loop: **budget → scenario → probe → classify → fix → prove → gate**
(recursive-profiling WebGL game-perf skill).

## Target

Minimum spec is the **low tier**: Intel UHD 620-class laptops and 2019 mid-range phones
(Adreno 6xx / Mali G52). The frozen per-frame budget is [`budget.json`](budget.json):

| metric | low-tier budget | note |
|---|---|---|
| draw calls | 150 | |
| triangles | 300 k | |
| main-thread JS in rAF, p95 | 8 ms on the probe machine | about 5 ms on the low tier after the ×4 CPU factor, see below |
| buffer + texture upload | 256 KB / frame | |
| synchronous GL queries, location lookups | 0 | |
| uniform calls | 1 100 / frame | three.js sets ~6–8 uniforms per draw; the generic 100 assumes a hand-rolled renderer |
| program switches | 40 / frame | |
| DOM mutations / layouts | 30 / 10 per s | |
| WebAudio nodes | 60 / s | |
| resident textures | 64 MB | |

## Scenario

[`scenario.cjs`](scenario.cjs), driven by the skill's `webgl_probe.js` (SwiftShader, 1280×800 window,
DPR 1). Deterministic: the render scale is pinned with `--scale`, dynamic resolution is off except in
the `scaler` phase.

| phase | what it exercises |
|---|---|
| menu | title screen, street backdrop, rain, feeding infected |
| intro-drive | car interior cutscene: IK arms on the wheel, wipers, streetlights streaming past |
| lot | checkpoint 0, outdoors, police lightbar, building interior behind the facade |
| corridor | checkpoint 1, interior, fluorescent flicker, flashlight shadows |
| **heavy** | courtyard finale, 12 infected kept alive in the forward arc, officer immortal, pistol held, ragdolls, blood, brass |
| heavy-halfscale | same scene at half the linear render scale (the fill-rate experiment) |
| heavy-medium / heavy-high | preset sweep on the same scene |
| scaler | dynamic resolution on, same scene: render-target churn and recovery |
| menu-return | back to the title: resources must return to the menu baseline |

```
npm run build && python3 -m http.server 8080 &
node <skill>/scripts/webgl_probe.js --url "http://127.0.0.1:8080/index.html?auto=1&q=low&fastcard=1" \
  --scenario perf/scenario.cjs --scale 0.6 --out perf/run-N \
  --chrome /opt/pw-browsers/chromium-1194/chrome-linux/chrome --budget perf/budget.json
node perf/gate.mjs perf/run-N/report.json --phases heavy
node perf/pvs_check.mjs            # portal culling correctness (see below)
```

## What the first report said (run-1, baseline)

The heavy phase CPU profile was **98 % idle**: the game is not JS-bound. The wall was **GPU work**,
with the probe's counters pointing at submission and geometry rather than pixels:

| finding | evidence | cost |
|---|---|---|
| flashlight shadow pass re-drew the level | 156 draws / 186 k triangles per frame in the shadow pass alone (lot) | every wall, floor and ceiling was a caster for a light that sits 25 cm from the lens |
| interior rooms drawn from outside | from the lot, 262 of 434 main-pass draws and ~123 k triangles were rooms and the courtyard hidden behind the building | frustum culling cannot see walls |
| identical materials never merged | props built their own `MeshStandardMaterial` per instance, `mergeStatic` bucketed by uuid | one draw per street light, mailbox, knob... |
| multi-part pickups | a box of shells = 18 draws, ammo/medical boxes 5 draws each | outside the level root, never merged |
| eyes | 2 draws per body | |
| full-detail bodies at any distance | 16 k triangles per infected, 12 infected + shadow copies | |
| particle buffers re-uploaded whole | 76 KB/frame of `bufferSubData` even with no particles alive | |
| HUD wrote the DOM every frame | clock `textContent`, crosshair `left/top` (layout), skip hint text, ammo opacity | |
| dynamic resolution could never scale back up | upgrade required p75 < 80 % of the target interval, impossible on a 60 Hz panel | one hitch halved the picture for the rest of the session |
| per-frame garbage | arm IK (~15 vectors/quaternions per frame), ragdoll mapping (~40 per corpse per frame), light-pool `filter/map/sort/slice`, noise `filter`, audio variant lookup (`Object.keys().filter(regex)` per footstep) | GC pauses on phones |
| composite shader | 3 `tan()` lens evaluations per pixel (one per colour channel); rain-drop and lens-dirt taps even when those effects were zero | ALU/taps per pixel |

## Fixes

1. **Shadow pass**: architectural shells no longer cast (a wall's shadow from a lens-mounted light
   is hidden behind the wall itself); the shadow frustum is clamped to 16 m instead of the light's
   30 m reach; bodies cast only within 12 m.
2. **Portal culling** ([`src/game/portals.js`](../src/game/portals.js)): every wall opening the
   level builder declares becomes a portal between two zones; a closed door closes its portal; each
   frame the camera's zone is flood-filled through portals whose projected rectangle still overlaps
   the narrowing view window. Level meshes live on one three.js layer per zone, so culling is a
   single `camera.layers.mask` write, and the flashlight shadow pass inherits it (three.js tests
   casters against the view camera's layers). Faces are tagged by sampling the zone on a 1 m lattice
   over their footprint plus both sides: anything straddling zones (door jambs, lintels, long walls
   running past several rooms, door leaves) goes to the always-drawn layer.
   A static per-cell PVS bake was built first and discarded: with every openable door assumed open,
   long sight lines through this building make an average cell see 8.9 of 13 zones.
3. **Portal-culling correctness check** ([`pvs_check.mjs`](pvs_check.mjs)): every level mesh gets a
   flat ID colour (black if the portal system keeps it), glass is skipped, and for ~5 600 reachable
   camera poses (two eye heights, six headings, two pitches) with every openable door wide open,
   any coloured pixel names a mesh the camera can see but the culler would drop. It found real bugs
   on the way (long faces tagged by their centre, jambs, sealed rooms defaulting to the street zone,
   the skyline peeking over the roof from the alley) and now reports **0 failing poses** at 3 m
   sampling and **2 of 5 664** at 1.5 m, 3 px each at 112×63, both through hairline cracks between
   wall segments (culling shows black there instead of a distant street lamp).
4. **Batching**: `mergeStatic` buckets by a material *signature* (type, colours, maps, PBR params,
   surface-shader options) instead of uuid; materials animated at runtime (`userData.live`, set by
   the light system) keep their identity. Door hardware shares shadow flags so each leaf is one draw
   per material; pickups are merged at spawn and put on their zone's layer; both eyes are one mesh.
5. **Geometry**: bodies swap to a coarse SDF mesh past 7 m (~4× fewer triangles, same skeleton,
   skin weights and material channels); the two heaviest props were simplified again
   (covered car −45 %, trash bag −50 %).
6. **Uploads**: particle layers upload only the live range (`addUpdateRange`) and nothing when idle.
7. **CPU / GC**: allocation-free arm IK, intro steering-wheel arms, ragdoll-to-skeleton mapping and
   hinge constraints; persistent light-pool array with a correct comparator (it mixed one light's
   intensity with the other's distance); in-place noise compaction; cached audio variants; static
   level nodes frozen (`matrixAutoUpdate = false`); settled corpses freeze their bones and stop
   re-uploading their bone texture until hit again.
8. **HUD**: write-on-change helpers (`setText/setStyle/setClass/setHidden`); crosshair moves by
   `transform` quantised to ¼ px instead of `left/top`; the clock formats once per second; the
   QTE bar scales instead of changing `width`.
9. **Post**: one lens evaluation for all three channels (lateral CA is a per-channel magnification
   about the optical centre), rain-drop / dirt / grain work skipped when zero.
10. **Dynamic resolution**: judged against the display's own refresh interval (fastest recent frame,
    slowly decaying), 20 slow frames step down, 150 frames at the display rate step up, frames over
    250 ms are ignored (it now receives the unclamped frame time), steps are quantised to 0.05 so
    render targets are not reallocated for tiny changes, and an upgrade undone within 3 s doubles
    the wait before the next attempt.
11. **Presets by budget**: LOW is scale 0.7 with floor 0.5 at DPR 1, particles capped at 300
    (MEDIUM 800, HIGH 1 200); device detection sends plain Intel UHD/HD to LOW and only Iris Xe/Arc
    to MEDIUM (fill-rate verdict below).

## Results (run-1 → run-3)

Same scenario, same machine, render scale pinned at 0.6 (768×396 scene and post), LOW preset, DPR 1.
Counts are exact; SwiftShader GPU times are only comparable with each other.

**Heavy phase** (courtyard, 12 infected, full fire, 12 s):

| metric | before | after | note |
|---|---|---|---|
| draw calls / frame | 160 | **118** | shadow pass, merged pickups and door hardware, one eye mesh |
| triangles / frame | 491 k | **286 k** | body LOD past 7 m, shells out of the shadow pass |
| buffer + texture upload / frame | 83 KB | **27 KB** | live-range particle uploads |
| uniform calls / frame | 866 | 744 | follows draws |
| program switches / frame | 57 | 52 | front-to-back sort kept on purpose (overdraw matters more on the low tier) |
| DOM mutations / s | 13.1 | 3.3 | write-on-change HUD |
| layouts / s | 2.1 | 0.9 | crosshair by transform |
| rAF JS p50 / p95 (ms) | 7.3 / 11.5 | 6.5 / 10.0 | see the note on JS below |
| GPU frame, SwiftShader (ms) | 454 | 401 | −12 % at identical pixels |
| budget flags (frozen budget) | 2 | **0** | `node perf/gate.mjs perf/run-3/report.json` passes |

**Every phase**:

| phase | draws | triangles | upload KB/frame | DOM mut/s | GPU ms (SwiftShader) |
|---|---|---|---|---|---|
| menu | 443 → **251** | 199 k → 121 k | 76 → 19 | 2.2 → 0.2 | 526 → 354 |
| intro-drive | 479 → **243** | 277 k → 138 k | 76 → 19 | 4.6 → 0.1 | 621 → 570 |
| lot | 596 → **325** | 521 k → 223 k | 76 → 19 | 6.8 → 0.9 | 584 → 512 |
| corridor | 270 → **163** | 169 k → 127 k | 76 → 19 | 7.1 → 0.4 | 697 → 705 |
| heavy | 160 → **118** | 491 k → 286 k | 83 → 27 | 13.1 → 3.3 | 454 → 401 |
| menu-return | 438 → **244** | 210 k → 118 k | 76 → 19 | 2.5 → 0.2 | 412 → 352 |

Flashlight shadow pass alone (lot): **156 → 42 draws, 186 k → 32 k triangles** per frame.

**Memory** (LOW; the probe cannot see three.js's `texStorage2D` uploads, so the scenario measures
textures in the page):

| resource | before | after | budget |
|---|---|---|---|
| resident textures incl. render targets, LOW | 209 MB | **58 MB** | 64 MB |
| resident textures, MEDIUM | not measured | 182 MB | 192 MB |
| resident textures, HIGH | — | 245 MB | 512 MB |
| synthesised audio bank | 16.6 MB (97 buffers) | same | 24 MB |
| bone textures of culled corpses | leaked, one per body | freed | 0 |

**Leak found by the probe**: every skinned body owns a bone texture and culled corpses never freed
it, so a long horde fight grew GPU memory without bound (6 spawns → 7 textures created, 5 corpses
culled → 0 deleted). `Zombie.dispose()` now disposes the skeleton; the same test deletes all 5.
(The `scaler` phase's `fbo +9 / −0` is not a leak: the preset switch disposes the old targets just
before the phase and three.js creates framebuffers lazily on first use, inside the window. A direct
resize test deletes exactly what it creates at every step.)

**Fill rate**: halving the linear render scale in the heavy scene (1.07 → 0.46 Mpx per frame)
cuts SwiftShader GPU time 401 → 276 ms (−31 %). About half the frame is pixel work and half is
fixed per-frame cost (geometry, the 512² shadow map, small passes), so on LOW the dynamic
resolution scaler has real leverage but the geometry work above was just as necessary.

`fillrate_budget.js` verdicts (scene weight 4, composite 2, bloom chain 0.6):

| preset | display | weighted Mpx/s | UHD 620-class | Iris Xe / M1 |
|---|---|---|---|---|
| LOW, scale 0.7 @ 45 fps | 1280×720, DPR 1 | 134 | OK, 3.7× headroom | OK |
| MEDIUM, scale 0.8 @ 55 fps | 1440×900, DPR 1.25 | 556 | **over** (0.90×) | OK, 4.5× |

Hence the detection change: Intel UHD/HD → LOW, Iris Xe/Arc → MEDIUM.

**A note on JS numbers.** SwiftShader rasterises on the same four CPU cores as the page, and the
main thread blocks on command-buffer back-pressure inside `render()`. The in-game split (heavy
phase, EMA) is **simulation 1.65 ms / frame** and render submission 14.2 ms / frame, most of the
latter being that back-pressure. The CPU profile is 98 % idle over the phase. The gate therefore
holds rAF JS p95 at 12 ms on this machine (measured 10.0) as a regression tripwire, not as the
low-tier target.

## Still over the low-tier targets, in payoff order

1. **Draw calls in outdoor views** (lot 325, menu 251 vs 150). Standing in the lot the camera
   legitimately looks through the entrance, lobby, corridor, 1C and its bedroom window into the
   courtyard, so portal culling keeps those zones. Next steps: split zone meshes into
   sub-zone cells so a narrow portal chain draws only what is inside its rectangle; instance the
   repeated street furniture; merge the police car's static parts per material.
2. **Program switches** (44–77): consolidate material variants (the patched surface shader compiles one
   variant per option combination), or sort opaque draws by program within depth buckets.
3. **Compressed textures** (KTX2/Basis): would take MEDIUM and HIGH under 100 MB and cut upload
   time; needs an encoder in the asset pipeline.
4. **`mediump` fragment precision** for the mobile build, keeping `highp` for the post hashes.

