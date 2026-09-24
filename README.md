# DEAD AIR

A first-person zombie shooter told through recovered body-camera footage. Runs in the browser
(WebGL 2, three.js), on desktop and on phones in landscape.

Officer Halloran answers a 03:13 disturbance call at Harlan Court. Evidence item 14-B is what his
camera recorded.

- **Footage look**: equidistant fisheye lens model with per-channel lateral chromatic aberration,
  sensor noise that rises with exposure gain, macroblocking in dark areas, lens dirt and rain drops,
  in-camera sharpening, eye adaptation, bloom, motion blur, filmic tone curve.
- **Bodies**: infected are signed-distance-field sculpts meshed at load (skin, cloth layers, tears,
  procedural wounds), skinned to a 20-bone skeleton, animated procedurally, with verlet ragdolls,
  hit zones, head destruction and dynamic blood.
- **Cutscenes**: in-engine and in-camera — the intro drive (hands on the wheel, wipers, dispatch
  radio), the bite, the finale.
- **Audio**: every sound is synthesised at load and played through a body-mic chain
  (band limiting, compression, clipping), with HRTF panning and per-zone reverb.
- **Settings**: LOW / MEDIUM / HIGH / ULTRA presets chosen by GPU detection, dynamic resolution,
  every lens effect adjustable, touch controls with a floating stick.

## Controls

| action | keyboard & mouse | touch |
|---|---|---|
| move / look | W A S D (or arrows) / mouse | left stick / drag right half |
| fire / aim | left / right mouse | FIRE / AIM |
| reload · flashlight · use | R · F · E | buttons |
| shove (break a grab) | V (mash V / E) | SHOVE |
| sprint · switch weapon | Shift · Q, 1, 2, wheel | buttons |
| pause · skip cutscene | Esc · hold Space | ❚❚ · hold anywhere |

Gamepads work too (standard mapping).

## Run locally

```sh
npm ci
npm run build        # bundles src/ -> build/game.js and assembles the site in dist/web
npm run serve        # http://localhost:8080
```

`npm run watch` rebuilds on change; during development you can also serve the repository root
(`python3 -m http.server 8080`), since `index.html` loads `build/game.js` directly.

Icons: `favicon.svg` is the source (it hides its fine detail when drawn at tab size, via a media
query inside the SVG); `npm run icons` re-renders `favicon.ico` (16/32/48 px) and
`apple-touch-icon.png` (180 px) from it.

Debug URL parameters: `?q=low|medium|high|ultra` forces a preset, `?start=intro|cp0|cp1|cp2` jumps
to a checkpoint, `?auto=1` skips the click-to-start gate.

## Voice-over

Every spoken line lives in [`docs/voice/lines.json`](docs/voice/lines.json) (exact game text,
ElevenLabs-style `[tags]`, cast, timing); [`docs/voice/SCRIPT.md`](docs/voice/SCRIPT.md) is the
readable script and [`docs/voice/HANDOFF.md`](docs/voice/HANDOFF.md) the contract for replacing
speech synthesis with recorded clips. `npm run voice:check` fails when the script and the game
drift apart; `npm run voice:script` regenerates `SCRIPT.md`.

## Deploy (Vercel)

The repository is set up for Vercel's Git integration; pushing is all it takes.
[`vercel.json`](vercel.json) pins the whole pipeline, so no dashboard settings are needed:

| setting | value |
|---|---|
| framework | none (static site) |
| install | `npm ci` (Node 22.x from `package.json` `engines`) |
| build | `npm run build` |
| output | `dist/web` — `index.html`, the content-hashed bundle, icons, `assets/` (about 13 MB) |
| caching | bundle `immutable` for a year (its name changes with its content), assets a week with background revalidation, `index.html` revalidated on every visit |

Any static host works the same way: run `npm run build` and publish `dist/web`.

## Layout

```
src/engine   renderer + bodycam post chain, assets, audio synthesis, input, settings, SDF mesher
src/game     level builder, portal culling, materials, props, player, weapons, zombies, ragdolls, fx, story
src/ui       menus, HUD, settings panel
assets/      Poly Haven textures, models and HDRIs (CC0), already simplified for the web
tools/       build, asset fetch/simplify, headless screenshot harness, voice script checker
perf/        performance scenario, budget, gate and report — see perf/README.md
docs/voice/  voice-over script, line data and integration guide for recorded dialogue
```

## Performance

Measured with a scripted worst-case scenario and a WebGL probe; the full write-up, before/after
tables and budget are in [`perf/README.md`](perf/README.md). In short: portal culling from the
level's own doorways, a much cheaper flashlight shadow pass, material-signature batching, body LOD,
per-preset texture budgets (LOW fits in 58 MB of textures), allocation-free hot loops and a HUD
that only touches the DOM when something changes.

## Credits

Textures, models and HDRIs: [Poly Haven](https://polyhaven.com) (CC0). Engine:
[three.js](https://threejs.org) (MIT). Fonts: Big Shoulders Display, IBM Plex Mono and IBM Plex
Sans Condensed via Google Fonts (SIL Open Font License). Everything else — characters, sound,
voice direction, level — is procedural and made for this project.
