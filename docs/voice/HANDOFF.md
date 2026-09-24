# Voice-over hand-off: replacing speech synthesis with recorded (ElevenLabs) audio

For the agent that produces the voice track and wires it into the game. Nothing in here needs
credentials; everything the game says, and everything the game needs back, is in this folder.

| file | what it is |
|---|---|
| [`lines.json`](lines.json) | the 33 lines: exact game text, TTS prompt with `[tags]`, cast, channel, timing, direction. **Source of truth.** |
| [`SCRIPT.md`](SCRIPT.md) | the same lines as a readable screenplay (generated from `lines.json`) |
| [`sfx.json`](sfx.json) | optional: radio squelch, radio static, siren and a few ambience beds worth replacing, with sound-effect prompts |
| [`voice-clips.patch`](voice-clips.patch) | the game-side change: plays the clips instead of speech synthesis (tested, see section 4) |
| [`../../tools/voice_script.mjs`](../../tools/voice_script.mjs) | `npm run voice:check` keeps `lines.json` in sync with the game; `npm run voice:script` rebuilds `SCRIPT.md` |

Today every line is spoken by the browser's `speechSynthesis`, with a synthesised radio squelch and
static around the radio lines, and subtitled. Subtitles stay: they are always on.

## 1. What to deliver

```
assets/voice/manifest.json
assets/voice/int-01.mp3  ...  assets/voice/end-11.mp3      (33 files, id in lower case)
```

`manifest.json`:

```json
{
  "version": 1,
  "lines": {
    "INT-01": { "file": "int-01.mp3", "text": "Twenty-one Adam fourteen, Keston. Respond code three, twenty-two fifty Wexley Avenue, Harlan Court Apartments, unit one-C.", "radioBaked": true, "duration": 6.12 },
    "INT-03": { "file": "int-03.mp3", "text": "Adam fourteen copies. I'm about a minute out.", "radioBaked": false, "duration": 3.04 }
  }
}
```

- `text` is copied verbatim from `game_text`. The game finds a clip by this string, so no code in
  `story.js` changes, and a line whose clip is missing simply falls back to speech synthesis.
- `radioBaked: true` means the clip already contains its radio squelch and static, so the engine
  must not add its own (radio lines only; `false` or absent for everything else).
- `duration` in seconds, informative (the game measures the decoded clip itself).
- When you regenerate a clip, give it a new file name (`int-01.v2.mp3`) and update the manifest:
  `assets/` is cached for a week on Vercel, so a reused name can serve the old take.
- `npm run build` copies `assets/voice/` (and `assets/sfx/`, see section 5) into the deployed site
  when the folder exists; Vercel builds on push, nothing else to configure.

## 2. Generating the clips

- **Model**: ElevenLabs v3 (`eleven_v3`), the model that performs `[bracket]` audio tags. Earlier
  models read the tags out loud.
- **Prompt**: `tts_text` for every line. For radio lines, `tts_text_full` if you want the model to
  add the squelch and static itself (then set `radioBaked: true`).
- **Voices**: one per cast id in `lines.json` (`cast[].brief` has age, accent, register). `radio` is
  the same voice as `swat` (SWAT ONE heard through a radio).
- **Words are frozen.** Only the `[tags]` may change. The words outside brackets are the subtitle;
  `npm run voice:check` fails if `tts_text` says anything different from `game_text`.
- **Stability**: "Creative" or "Natural" for shouted, screamed and breaking lines (1C, END), "Natural"
  for Dispatch. Generate 2 or 3 takes of each key line (1C-03, 1C-06, END-05, END-07, END-09, END-11)
  and pick one.
- **Timing caps** (`max_seconds`): END-07 at most 1.2 s (the SWAT shots follow it at once),
  INT-05 at most 2.0 s, 1C-03 at most 2.5 s (it plays during the struggle). Everything else can
  run longer than the game's `est_seconds`; the story waits for the clip.
- **Trim**: at most 50 ms of silence at the head and 150 ms at the tail, since the game adds its own
  pauses between lines. Exception: END-11 opens with `[long pause]`; keep that pause under 0.8 s.

### Which bracket goes where

| kind | examples | in the clip? |
|---|---|---|
| delivery | `[shouting]` `[screaming in pain]` `[voice breaking]` `[long exhale]` `[whispering]` | yes |
| `bake_tags` (radio lines) | `[radio squelch]` `[static]` | optional, flag it with `radioBaked` |
| `engine_sfx` | `[siren]` `[shots]` `[gunfire]` `[rain]` `[heartbeat]` `[TV static]` | **never**: the game plays them, so baking them makes them play twice (END-07's three shots, the courtyard gunfire, the sirens) |

`script_text` puts all three together for reading and casting, not as a TTS prompt.

## 3. Audio spec

| | value |
|---|---|
| format | MP3, mono, 44.1 kHz, 96 kbit/s CBR (radio lines can be 22.05 kHz, 64 kbit/s) |
| total | about 2 to 2.5 minutes of speech, so about 1.5 to 2 MB of files |
| loudness | about -20 LUFS integrated per clip for normal speech; shouts land hotter by nature, do not normalise them down to it; true peak at most -3 dBTP |
| body-mic lines (Halloran) | **dry**: no EQ, no reverb, no compression beyond gentle. The game runs every voice through the body-camera microphone chain (high-pass 140 Hz, +4 dB at 2.8 kHz, low-pass 7.8 kHz, 7:1 compressor at -22 dB, soft clipper). Pre-processing stacks on top of it. |
| radio lines (Dispatch, RADIO) | **bake the radio sound**: band-pass about 300 Hz to 3.4 kHz, light saturation, and optionally squelch in/out plus a static bed about 25 to 30 dB under the voice (`radioBaked: true`). The game does not band-limit voices itself. |
| distant-outdoor lines (SWAT) | performed as shouting across 4 to 7 m; deliver dry. The patch sends them to the game's zone reverb as well, so they sit in the courtyard. |

Memory: decoded audio is 176 KB per second (mono float at 44.1 kHz), so the whole pack decoded at
once would be about 25 MB, more than the low-tier audio budget allows on top of the 16.6 MB sound
bank. The patch therefore keeps only the compressed bytes in memory (fetched once when the game
loads) and decodes each clip just before it plays (a few ms to about 50 ms on a phone).

## 4. Game integration: `voice-clips.patch`

```sh
git apply docs/voice/voice-clips.patch
```

It changes only `src/engine/voice.js`, and it does nothing until `assets/voice/manifest.json`
exists. What it does:

- loads the manifest at start-up and prefetches the clip bytes;
- `say(kind, text)` plays the clip whose `text` matches, otherwise uses speech synthesis as today;
- clips go through the `voice` bus, so the body-mic chain and the Voice volume slider apply;
  the "Spoken dialogue" setting turns them off like it turns off speech synthesis;
- clips play one at a time in call order (non-blocking lines such as the courtyard countdown
  queue behind a line that is still playing, which is how `speechSynthesis` behaves);
- the subtitle lasts as long as the clip (+0.6 s);
- the engine's squelch and static wrap radio lines unless the manifest says `radioBaked`;
- SWAT lines also feed the zone reverb;
- skipping a cutscene (hold Space) stops the clip and drops queued lines; pausing (Esc) suspends
  the audio context, so the clip pauses and resumes with it;
- a clip that fails to download or decode falls back to speech synthesis.

Tested at this commit with a stand-in pack of 33 generated tone clips: the intro played all 7
clips in order with the story waiting for each, a skip mid-line stopped the clip with nothing
queued after it, and there were no console errors. After applying it, change the setting hint in
`src/ui/ui.js` ("Uses your device's speech voices") to match.

Optional, not in the patch: place SWAT lines in 3-D by adding a `PannerNode` at the speaker (the
SWAT officers' positions are in `story.js` `ending()`), the same way `audio.play()` does with `pos`.

## 5. Optional: sound effects (`sfx.json`)

The whole sound bank is synthesised at load (`src/engine/audio.js`). Any of it can be replaced by
a file with the same name. `sfx.json` lists the ones that matter most for the voice track (radio
squelch in and out, radio static) and for the scenes around it (siren, body-camera beep, fire alarm,
rain, TV static, car idle), each with a prompt for ElevenLabs Sound Effects, length, loop flag and
where the game uses it.

Deliver `assets/sfx/<name>.mp3` plus `assets/sfx/manifest.json` (`{ "radioIn": "radioIn.mp3", ... }`)
and, in `AudioEngine.generate()` after the synthesised bank is built, decode each file into
`this.buffers[name]` (or `this.rainBuf` for `rain`). Three names are new because today's code
borrows the `breath` buffers for them; replace those borrowings when you add the files:

| new name | today | where |
|---|---|---|
| `radioStatic` | `breath0` at rate 3.5 | `src/engine/voice.js`, the static bed under radio lines |
| `tvStatic` | `breath0` | `src/game/story.js:172`, the TV in apartment 1C |
| `carIdle` | `breath1` at rate 0.35 | `src/game/story.js:320`, the patrol car engine in the intro |

Use the new name with rate 1 when its buffer exists, and keep the old call as the fallback.
`breath0` and `breath1` are also Halloran's out-of-breath sound, which is why they cannot simply be
overwritten.

## 6. How to check it

```sh
npm run voice:check                # lines.json still matches story.js, words unchanged
npm run build && npm run serve     # http://localhost:8080
```

| URL | lines heard |
|---|---|
| `/?start=intro&fastcard=1` | INT-01 to INT-07 (the drive), then LOB-01 in the lobby |
| `/?start=cp0` | LOB-01, then 1C-01 to 1C-08 in apartment 1C |
| `/?start=cp1` | CP1-01, MNT-01 in the maintenance room |
| `/?start=cp2` | CRT-01 to CRT-04 (hold the courtyard for 98 s), END-01 to END-11 |

Listen for: level matching between Dispatch and Halloran; END-07 ending before the shots; nothing
doubled (sirens, shots, squelch); hold Space mid-line (the line stops); Esc mid-line (it pauses).
