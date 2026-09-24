# Audit: DEAD AIR voice handoff vs. MiMo TTS (mimo-v2.5-tts / -voicedesign / -voiceclone)

Scope: `docs/voice/HANDOFF.md`, `lines.json`, `sfx.json`, `voice-clips.patch`, `tools/voice_script.mjs`,
`src/engine/voice.js`, plus `src/engine/audio.js`, `src/game/story.js`, `vercel.json`, `tools/build.mjs` for verification.
Verified facts: `node tools/voice_script.mjs --check` → 33 lines match 33 spoken strings, exit 0.
`git apply --check docs/voice/voice-clips.patch` → clean at HEAD 6930565 (53 insertions, 1 deletion, only `src/engine/voice.js`).

---

## 1. What lines.json does not give you

**Counts (measured):** 33 lines. radio 13, body-mic 14, distant-outdoor 6. dispatch 12, officer 14, swat 3, swat2 3, radio 1.
Sum of `est_seconds` = **108.2 s (1.80 min)**, not the "about 2 to 2.5 minutes of speech" HANDOFF §3 advertises.

**Delivery brackets: 48 distinct strings**, and they are ElevenLabs v3 prompt grammar, not spoken words. Examples:
`[calm, clipped radio cadence]`, `[tired, steady, raising his voice over the siren]`,
`[breathing heavily, shaken, into the radio]`, `[shouting from a distance, commanding]`,
`[urgent, raising her voice over gunfire on the channel]`, `[breathless, trying to hold it together]`,
`[weak, slurred, unconvincing]`, `[breathing hard, procedural, shaken]`, `[lower, heavier]`, `[shaky]`, `[forced]`,
`[sharper]`, `[emphatic]`, `[slower]`, `[flat]`, `[quiet]`, `[urgent]` (x2), `[louder]` (x3).

There is **no field anywhere** that separates "words to say" from "how to say it" in a machine-readable way.
`tts_text` interleaves them and `script_text` further mixes in `engine_sfx`. So you must write your own tag splitter,
and you must preserve tag *position* — `[urgent]` is mid-sentence in INT-01 and INT-04, `[louder]` is mid-sentence in
1C-02, END-02, END-04. Losing position flattens the performance.

**Missing for clip production:**
- No per-line source/age/hurt-state marker. Halloran's `brief` says "after the bite progressively weaker and slurred",
  but nothing on `1C-06..END-05` says *how much* weaker. `engine/voice.js` today expresses it via
  `SPEAKERS.officer.pitch 0.85 / rate 1.02`; recorded clips silently drop that. 14 lines, no continuity contract.
- No per-line gain/pitch/rate field in the manifest schema. `sayClip` supports `opts.vol`, but the manifest cannot
  express it, so every clip plays at gain 1. Everything the spec asks for in loudness must be baked at encode time,
  once, with no runtime correction.
- Pronunciation table is 6 entries for 33 lines. Uncovered and risky: **"Keston"** (KESS-tun) appears in INT-01 and
  END-02 and is *not* in the per-line `pronunciation` fields, only in the SCRIPT.md table (which is generated, not
  an input). **"Harlan"**, **"Wexley"**, **"Pell Street"** in CRT-03, **"SWAT one"** in END-10, **"Agh!"** in 1C-03.
  "Harlan" is the single most mis-sayable word in the pack: dispatch says it in INT-01, SWAT says it never, nobody
  corrects it.
- Radio squelch on `INT-01/02/04/07`: the doc wants squelch **before** voice; the game plays `radioIn` at 0.6 then the
  static bed. If you bake squelch in *and* the radio bed sits 25–30 dB under the voice, the squelch transient
  (#1 highest peak in the clip) is what your loudness pass will latch onto.
- Nothing states whether the **lead-in squelch may eat into the 50 ms head-trim budget**. It cannot, if you bake it.
  So on the 13 radio lines, `radioBaked: true` and the 50 ms head-trim rule are mutually exclusive. Pick one.

## 2. Tightest lines

Budgets measured against the contract, at a deliberate-broadcast pace of ~2.0–2.5 words/s:

| id | text | constraint | math |
|---|---|---|---|
| **END-07** | `Stop! STOP!` | cap 1.2 s | 2 words. At 2.5 w/s that is **0.80 s** of speech, leaving 0.40 s for the two shouts' gap + tail, then `await this.wait(0.05)` then three shots. MiMo at broadcast pace lands **1.5–2.5 s** and blows the cap outright. |
| **1C-03** | `Agh! It bit me! Get off!` | cap 2.5 s, `est 2.4` | 6 words + a scream onset + a panic beat. MiMo's `[screaming]` onsets run 0.3–0.6 s alone. Over by a wide margin. |
| **INT-05** | `...Copy.` | cap 2.0 s, `est 1.6` | 1 word + `[long exhale]` + a leading ellipsis the model will read as a pause. The exhale alone can eat 1 s. |
| **END-11** | `...Copy, SWAT one.` | `[long pause]` ≤ 0.8 s | 1.6 s of speech + up to 0.8 s lead = 2.4 s. The recording glitches 1.2 s after the line starts (`this.app.glitch(1.2,1.5)`). Fine, but the head pause is the only long silence in the pack and it is exactly the thing MiMo will pad randomly. |
| **CRT-02** | `Sixty seconds, fourteen. Hang on.` | fires at finale t=40 s, no cap | "Sixty seconds" at the 40 s mark of a 98 s hold. A slow read is *diegetically wrong*: she says sixty and the counter has fifty-eight left. |
| **END-09** | `Wait... that's fourteen. That's one of ours.` | no cap, `[whispering]` | Direction says "barely audible on the last sentence." Quiet + the mic chain (7:1 comp @ −22 dB) = the whisper is squashed into the static floor. Loudness spec and direction are in direct conflict. |
| **END-06** | `He's bit! He's bit!` | no cap, words frozen | "bit" not "bitten". MiMo will very likely normalise to "He's been bitten!" — a words-frozen violation the validator cannot catch (§below). |
| **INT-01** | 32 words, the longest | no cap | 9 concept tokens: 21-A-14, Keston, code three, 2250, Wexley, Harlan Court, unit one-C. The first voice the player ever hears. Cold-load fallback risk too (see §3). |

**The hole in the safety net:** `tools/voice_script.mjs` line 30 compares `words(tts_text)` to `words(game_text)`
*after stripping every `[bracket]`* — and it validates `lines.json`, never an audio file. It cannot catch a spoken
tag, a hallucinated trailing sentence, "He's bitten", or dropped words. There is **no clip-level verification step
anywhere in the folder.** Every risk below is unguarded.

## 3. Where MiMo actually breaks the handoff

**a) The bracket vocabulary is the big one.** 48 multi-word English "tags" vs MiMo's documented set
(`[pause] [sigh] [whisper] [shout] [trembling] [cracked voice] [sob] [takes a deep breath] [pant] [laugh] [smile]`).
Only three of yours fold cleanly: `[screaming]/[screaming in pain]`→`[shout]`, `[screaming, alarmed]`→`[shout]`,
`[whispering]`→`[whisper]`. `[voice breaking]`→`[cracked voice]`. The other ~44 have no MiMo equivalent at all —
vocabulary, not audio, is what breaks. Two distinct failure modes, both silent:
- MiMo reads the bracket out loud. The validator strips brackets, so **nothing catches this**, and you ship
  "urgent raising her voice over gunfire on the channel Fourteen SWAT is two minutes out."
- MiMo ignores it and delivers flat radio. No error, just a dead performance.

Mechanically you must: strip every bracket → build the spoken string → write a **separate `user` message** (never
spoken) that carries the direction. That means `tts_text` (§2 of HANDOFF) is not usable as-is, `tts_text_full`
definitely isn't (it has `[radio squelch] [static]` in it), and `HANDOFF §2 "Prompt: tts_text for every line"` is
wrong under MiMo.

**b) Words frozen vs. hallucinated tails.** "Occasionally hallucinates extra speech after the requested text" +
"~50 % garbage rate on single attempts for short punchy lines" is precisely the profile of 8 of your lines:
INT-05, INT-06, INT-07, 1C-05, 1C-08, CP1-01, END-07, END-11 (all ≤ 8 words). INT-05's `[long exhale] ...Copy.` is
the worst: one word of speech wrapped in two non-speech events, on a 2.0 s cap, with a 50 % single-shot garbage
rate. Plan a 4-take minimum for every capped line and an automated tail gate (§4).

**c) The timing caps are not achievable with Naive MiMo.** You need a deterministic fit step. Do not rely on
prompting for pace ("pace is driven heavily by the wording of the direction" = you do not control it reliably).
Concrete recipe for `END-07`:
1. Generate `[shout] Stop! Stop!` — or better, generate "Stop! STOP!" as two separate takes, because a long gap
   between the two words is the other obvious failure.
2. Trim to the last speech sample, allow ≤ 50 ms head / ≤ 150 ms tail.
3. If duration > 1.05 s, time-compress with pitch preservation (`rubberband`, or `atempo` + `asetrate` compensation).
   Do **not** let it exceed ~1.05 s: `story.js:778` is `await this.say('swat2','Stop! STOP!', 0.05)`, then the shot
   loop, so the whole turn has 1.2 s before the shots fire.
4. Hard-fail the take if the trim can't reach the cap.

Same for 1C-03 (2.5 s, plays "during the struggle") and INT-05 (2.0 s, the red light turns green right after).

**d) Loudness.** MiMo gives you no LUFS. −20 LUFS integrated, ≤ −3 dBTP true peak means a real `ffmpeg -af
loudnorm` pass per clip, with measured verification. And the spec's "shouts land hotter by nature, do not normalise
them down" makes END-02/03/04/06/07 the only loud clips in the pack — 6 lines at maybe −14 to −16 LUFS while 27 sit
at −20. That is a 5 dB swing delivered to the game's `voice` bus at gain 1, then through a 7:1 compressor at
−22 dB / soft clipper stage. Level-match by ear against Dispatch vs. Halloran, not against the meter, and accept
that the compressor will flatten the difference anyway.

**e) The dry/baked channel rules work, but one label is dead.** Traced in `src/engine/audio.js:327-338`:
`voice → micIn (HP 140 / peak 2.8k +4 / LP 7.8k / comp 7:1 @ −22 / soft clip) → master`. `voice` is **not**
connected to `revSend`; the patch adds `g.connect(A.revSend)` for swat/swat2, and `revOut` also lands on `micIn`,
so shouted lines get dry + wet and both pass the body-cam chain. That is consistent.
But in the patch (`playClip`), the radio decision is `sp.radio && !clip.radioBaked` — driven **only** by the
speaker map, never by a body-mic crossing. `radioBaked: true` on an officer line is a no-op, and worse, the engine
still won't band-limit it. Keep `radioBaked` strictly to the 13 radio lines.

**f) Body-mic -20 LUFS is the wrong target number.** A dry body-mic line is *supposed* to be the loudest thing in
the mix; the chain's presence boost (+4 dB @ 2.8 kHz) and compander are calibrated by ear, not to EBU. Hitting
−20 LUFS on Halloran and −20 on a −20-clipped radio bed will not produce matching perceived level, which is the one
thing HANDOFF §6 tells you to listen for ("level matching between Dispatch and Halloran"). Normalise the radio set
~3–4 dB lower than the dry set and verify in-engine, not on the meter.

**g) Short speech total is a trap for the spec, not the size.** Measured 108.2 s of `est_seconds`; real MiMo takes
10–20 % longer than the estimates, so ~2.0–2.2 min. Still fine for the ~1.3–2 MB / 25 MB-decoded budget.

## 4. swat vs. swat2 — does swat2 need its own voice?

**Cited interaction evidence, from `story.js` and the line order:**

- Both are on stage simultaneously: `story.js:710` `const swat = [0,1].map(i => this.makeSwat(...))` — the two
  officers are the same mesh built twice. The cast ids only pick voices.
- **No two of these six lines ever overlap in time.** Every one is `await this.say(...)` on the same single-threaded
  corridor, and the patch's `this.chain` serialises clips anyway.
- The voices only ever alternate, never converse:
  `END-02`(swat) → `END-03`(officer) → `END-04`(**swat2**) → `END-05`(officer) → `END-06`(swat) → `END-07`(**swat2**)
  → *(shots)* → `END-08`(swat) → `END-09`(**swat2**) → `END-10`(radio, = swat's actor) → `END-11`(dispatch).
- swat2's three lines are END-04, END-07, END-09. swat's three are END-02, END-06, END-08. swat also owns END-10.

**Verdict: swat2 does not require a third voice, but sharing with *swat* is the wrong pairing.**

- The only place the distinction carries meaning is END-08 → END-09: SWAT ONE (END-08, "Shots fired, shots fired.
  Suspect down.") is answered by SWAT TWO (END-09, "Wait... that's fourteen."). `lines.json` casts END-09's
  direction as "Realisation." If END-09 is the same voice that just said END-08, it reads as one man talking to
  himself and the intended two-man horror beat lands flat.
- Meanwhile `END-04`→`END-05`→`END-06` is swat2 → officer → swat back to back, so the officer/swat boundary is
  crossed more often than the swat/swat2 boundary.
- The contract already blesses reuse: `cast.radio.brief` = "Same actor as SWAT ONE."

**Recommended mapping with 4 built-in voices:**
- `officer` → **Dean** (English male). 14 lines, the whole arc, must be the strongest match.
- `dispatch` → **Mia** (English female).
- `swat` → **Milo**. All three of his lines are at 4–7 m in the rain through the game's `revSend` and will be
  EQ'd/positioned by the engine anyway.
- `swat2` → a **voicedesign** voice ("man, late 20s, higher tenor, tense, on the edge of panic, American"), or
  **voiceclone** if you have a clean sample. Reserve voicedesign for swat2, not for officer: swat2 has only 3 lines,
  so a small design drift across three takes is cheap to re-roll, whereas 14 officer lines on a drifting id is not.
- `radio` → the *same audio asset* as `swat` (Milo), rendered with the band-pass/saturation pass. This is required,
  not just permitted: END-10 is SWAT ONE, and `cast.radio.brief` says so; the engine additionally applies
  `SpEAKERS.radio` (radio true, pitch 0.9) treatment, and the clip is baked.

**Is voiceclone/voicedesign a sound approach?** Yes for exactly one slot (swat2), with caveats:
- voiceclone "appends long non-speech tails" — that is fatal for END-07 (2 words, 1.2 s cap). If you clone, you must
  hard-trim every clone output and gate it.
- Three lines of shouted dialogue across 4–7 m in heavy rain, under reverb, is the *least* likely material to expose
  a synthetic tell. Three lines. Don't over-invest.
- Do not use voiceclone for officer or dispatch: 14 and 12 lines give a drifting clone id far too many chances to
  drift audibly between lines, and you have no per-line pitch/rate to correct it in-engine.
- Do not clone a voice you don't have rights to. `LICENSE` in this repo is public-domain; the asset is not
  necessarily.

## 5. voice-clips.patch vs. HANDOFF.md — mismatches

`git apply --check` is clean at HEAD. The patch touches **only** `src/engine/voice.js`, 53 insertions, 1 deletion
(the deletion is `say(...)` → renamed `saySynth(...)` with `say()` becoming the selector). Real behaviour vs. §4:

| HANDOFF §4 claim | reality |
|---|---|
| "It changes only src/engine/voice.js" | **True** (verified by `--stat`). |
| "the game-side change... (tested, see section 4)" | §4's last paragraph says it was tested with a stand-in pack. Fine. |
| "loads the manifest at start-up and prefetches the clip bytes" | True, but it fires **33 concurrent `fetch()` calls in the constructor** (`this.clipBytes(l)` for every line) with no concurrency limit, at the same moment the page is loading textures/models/HDRI and synthesising the sound bank. On a phone that is a bandwidth pile-up exactly where the player notices it. |
| "the engine's squelch and static wrap radio lines unless the manifest says `radioBaked`" | **Half true.** The *engine* squelch/static is gated on `sp.radio && !clip.radioBaked` — correct. But the **subtitle** call is `this.ui.subtitle(opts.label \|\| sp.label, text, sp.radio, ...)` using `sp.radio`, not the computed `radio`, so a `radioBaked` clip still subtitles as radio (right) and a non-radio clip can never subtitle as radio (also right). No live bug. **But** `clip.radioBaked` has no effect on a body-mic line: the engine will not add radio treatment *and will not band-limit it either*, so labelling a body-mic clip `radioBaked` produces dead, undoctored audio. The doc's "radio lines only" is load-bearing. |
| "the subtitle lasts as long as the clip (+0.6 s)" | True: `buf.duration + 0.6`. |
| "clips play one at a time in call order... queued behind a line that is still playing" | True via `this.chain`. |
| "skipping a cutscene (hold Space) stops the clip and drops queued lines" | True: `cancel()` bumps `this.gen`; queued `sayClip`s resolve to `null`.  |
| "pausing (Esc) suspends the audio context, so the clip pauses and resumes with it" | True, but `pause()`/`resume()` only touch `speechSynthesis`; it works purely as a side effect of `audio.suspend()`. Worth knowing when you debug. |
| **Not stated, and it will bite:** | `playClip` **emits the subtitle and starts the radio squelch/static bed before it awaits the decode** (`this.ui.subtitle(...)` at the top, then `decodeAudioData`). On a phone (≲50 ms decode, per §3) that is a subtitle flash and a squelch burp for a line `cancel()` has already deleted, because `gen` was snapshotted in `sayClip`. Cosmetic, but it looks like a bug in a cutscene. |
| **Not stated:** | `const c = A.ctx` is dereferenced **before** the try block. If `audio.unlock()` hasn't run or the context died, this throws a `TypeError` that bypasses the `saySynth` fallback and rejects up into `story.say()` → `this.safe()` → swallowed. The clip is dead, **speech synthesis does not take over**, and the console shows one error. `audio.ready` is checked in `say()` but `A.ctx` is set in `unlock()`, which is a different moment. |
| **Not stated:** | `saySynth` still has `const sp = SPEAKERS[kind] \|\| SPEAKERS.officer;` (line 68) but no longer uses `sp` in the body — the prefer/pitch/rate path is gone. It relies on `say()` having picked the clip or not. Dead binding; harmless, but it is the kind of thing that means nobody re-read the fallback path. |
| **Mismatch in §4's "after applying it, change the setting hint in src/ui/ui.js"**: | `src/ui/ui.js:56` today is `hint: 'Uses your device’s speech voices. Subtitles are always on.'` — unchanged by the patch, as documented. Correct, but note that the hint is now *conditionally* wrong (it's only wrong when the pack loaded). |
| **Beyond §4, HANDOFF §1 claims `npm run build` copies `assets/voice/`** | True, `tools/build.mjs:54`; the folder does not exist yet. And `vercel.json` caches `/assets/(.*)` for a week — so §1's "give it a new file name when you regenerate" is not advice, it is mandatory. |
| **HANDOFF §1 says the pack is "fetched once when the game loads"** | It's 33 uncoordinated fetches. "Once each" ≠ "once". |

**The undocumented, unavoidable mismatch, which is the real §5 finding:** the manifest key is
`lines[].text`, and `say()` looks clips up by `this.clips.get(text)` — the exact `game_text`. But the load is
**async and racy**: `fetch('assets/voice/manifest.json')` is kicked off in the constructor with no readiness gate.
INT-01 fires 0.8 s after the camera beep. On a cold load or a slow connection, the manifest may not have resolved,
`this.clips` is empty, and the first lines of the intro silently fall back to `speechSynthesis` — the exact thing
you're replacing. Mostly-fine on a warm cache, wrong on a first visit. There is no diagnostic for it either; the
`catch(() => { /* no voice pack */ })` swallows a 404, a JSON parse error and a network failure identically, and
`assets/` not existing yields a 404 that quietly degrades the whole game back to robot voice with zero signal to
you or the player.

## 6. Traps in the audio spec

1. **`radioBaked: true` and the 50 ms head trim are mutually exclusive.** §2 says ≤ 50 ms head; §3 says bake squelch
   in/out on radio lines. Squelch *is* a head transient. You must decide per radio line, and §1's manifest example
   (`radioBaked: true`) silently forces the latter.
2. **22.05 kHz / 64 kbit/s radio files** are legal per §3, but `decodeAudioData` resamples to the AudioContext rate
   (48 kHz on most desktops). A 22.05 k file's baked static bed is resampled by a cheap browser resampler — audible
   as a thin metallic hiss rather than radio noise. **Encode all 40 files at 44.1 kHz.** The file-size saving is
   ≈50 KB for the 10 shorter radio lines; you are paying 50 KB for aliasing.
3. **96 kbit/s CBR mono is a lossy encoder sitting exactly where your spec needs accuracy.** −3 dBTP headroom
   survives MP3 fine, but a 25–30 dB under static bed + CBR 96 k artifacts is a recipe for a warbling bed. Do the
   loudness/trim pass on a lossless intermediate (FLAC/WAV), encode **last**, then re-measure the encoded file, not
   the intermediate. MiMo hands you WAV or VBR MP3 — a re-encode is mandatory, and a re-encode of an already-VBR MP3
   is a second generation loss.
4. **Trim arithmetic vs. `buf.duration`.** `speechSynthesis` timing was `est + 0.6 s`; the clip path is
   `buf.duration + 0.6`. A hallucinated 1.5 s tail on a short line therefore extends the subtitle *and* the scene
   wait. Trim from the last speech sample, not from the first silence you detect — MiMo's tails are non-speech noise
   and a naive silence gate will miss them.
5. **END-11's `[long pause]`** must be *inside* the 0.8 s, and the only way to get it reliably is to generate the
   line, then inject silence at the head yourself. Do not trust MiMo's `[pause]` length.
6. **Loudness is not runtime-correctable.** `opts.vol` exists in the patch but the manifest cannot express it, and
   `SPEAKERS` gain is the single `voiceVol` slider for everything. Get it right at encode time; there is no plan B
   short of re-encoding 33 files.
7. **`sfx.json`'s `radioStatic`/`radioIn` naming is safe, but barely.** `AudioEngine.play()` (`audio.js:422`) falls
   back to prefix-matching variants: `Object.keys(buffers).filter(k => k.startsWith(name) && /^\d+$/.test(k.slice(name.length)))`.
   So a new buffer named `radio` would shadow/collect `radioIn`, `radioOut`, `radioStatic`. Don't add one. Also
   `A.play('breath0', ...)` at `voice.js:54` is still what the patch uses for the static bed — new names are
   optional (HANDOFF §5), so if you skip the sfx pack you keep the fake breath bed and the baked-radio sound will sit
   on top of a hiss that doesn't match it.
8. **`est_seconds` total (108.2 s) ≠ §3's "about 2 to 2.5 minutes"** and "about 1.5 to 2 MB". Recompute after you
   have real takes; the doc numbers are not a budget you can trust for the low-tier memory limit (§3: ~25 MB decoded
   for the whole pack, "more than the low-tier audio budget allows on top of the 16.6 MB sound bank"). **Nothing in
   the patch enforces this** — but §3's whole justification for lazy decoding rests on that 25 MB figure, and your
   MiMo takes will be longer than `est_seconds`.

## 7. Top 5 risks, ordered by likelihood of shipping something broken

1. **MiMo reads the 48 ElevenLabs delivery brackets out loud (or drops them), and no gate catches it.** 44 of 48
   have no MiMo equivalent; `voice_script.mjs` strips brackets by design, so `--check` passes on a clip that speaks
   the stage direction. Line exposure: all 33, worst on the compound ones — INT-01, INT-03, INT-04, 1C-04, CRT-01,
   END-02. Mitigation: strip brackets, move direction to the `user` message, and add a real transcript gate
   (ASR the rendered clip, compare to `game_text` word-for-word) before anything ships.
2. **MiMo hallucinates trailing speech and produces ~50 % garbage on the short lines.** INT-05, INT-06, INT-07,
   1C-05, 1C-08, CP1-01, END-07, END-11. A hallucinated tail on END-07 blows the hardest cap in the game and delays
   the three shots. Mitigation: 4+ takes on every ≤ 8-word line, energy gate + ASR gate, hard trim, reject-on-tail.
3. **The three timing caps are physically impossible at MiMo's delivered pace without post-processing.**
   END-07 1.2 s (2 words), 1C-03 2.5 s (6 words + scream), INT-05 2.0 s (1 word + exhale). You will either ship them
   long (and the shots fire late / the light turns green mid-line) or need pitch-preserving time compression.
   Mitigation: build the fit step into the pipeline and hard-fail takes that can't fit.
4. **Zero clip-level or pack-level verification exists.** No check that 33 files exist, that they're mono 44.1k CBR
   at the right loudness, that the manifest filenames resolve, or that the `text` strings still match `game_text`.
   A single typo in `manifest.json` silently reverts one line to robot voice and there is no signal. Mitigation:
   write the checker; make `voice:check` also validate `assets/voice/manifest.json` against the files on disk and
   against `lines.json`.
5. **Designing/cloning a voice that then drifts, on the two casts with the most lines.** officer (14) and dispatch
   (12). If you voicedesign the officer instead of using a built-in, a drifting id makes Halloran a *different man*
   across the intro/1C/END arc and the engine has no pitch/rate to correct it (the `SPEAKERS.officer.pitch 0.85`
   tuning is bypassed by the clip path entirely). Mitigation: built-in voice for officer and dispatch; voicedesign
   only for the 3-line swat2; listen to the arc end-to-end, not line by line.

**Runner-up, not in the top 5 because it is a five-line fix:** the cold-load race in `voice-clips.patch` (manifest
fetch with no readiness gate + `A.ctx` dereferenced before the try/catch) means "the first lines of the intro fall
back to speech synthesis" on a first visit and "the clip never plays and speech synthesis does not take over either"
if the ctx is missing. Gate on manifest readiness before `story.start()`, move `const c = A.ctx` inside the try.
