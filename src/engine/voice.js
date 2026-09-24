// Spoken lines: browser speech synthesis (optional) + radio squelch + subtitles.
// Every line is always subtitled; TTS is an enhancement and fails silently.
const SPEAKERS = {
  dispatch: { label: 'DISPATCH', radio: true, pitch: 1.05, rate: 1.08, prefer: ['female', 'samantha', 'zira', 'aria', 'jenny', 'google us english', 'karen', 'moira', 'susan'] },
  officer: { label: 'OFC. HALLORAN', radio: false, pitch: 0.85, rate: 1.02, prefer: ['male', 'daniel', 'guy', 'david', 'mark', 'alex', 'fred', 'google uk english male', 'christopher', 'eric'] },
  swat: { label: 'SWAT', radio: false, pitch: 0.7, rate: 1.18, prefer: ['male', 'guy', 'david', 'davis', 'tony', 'google uk english male', 'mark', 'alex'] },
  swat2: { label: 'SWAT', radio: false, pitch: 0.95, rate: 1.2, prefer: ['male', 'christopher', 'eric', 'roger', 'ryan', 'daniel'] },
  radio: { label: 'RADIO', radio: true, pitch: 0.9, rate: 1.1, prefer: ['male', 'david', 'guy'] },
};

export class VoiceSystem {
  constructor(settings, audio, ui) {
    this.settings = settings; this.audio = audio; this.ui = ui;
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.queue = Promise.resolve();
    this.token = 0;
    // recorded voice pack (assets/voice/manifest.json); lines without a clip fall back to speech synthesis
    this.clips = new Map();   // game_text -> { file, radioBaked, ... }
    this.bytes = new Map();   // file -> Promise<ArrayBuffer>
    this.chain = Promise.resolve();
    this.gen = 0;             // bumped by cancel()
    this.readyDone = false;
    // Load behind a readiness gate. Without one, a line that fires before the
    // manifest resolves finds no clip and silently falls back to robot voice —
    // which is exactly what INT-01 does 0.8 s after the camera beep on a cold load.
    this.ready = fetch('assets/voice/manifest.json')
      .then(r => { if (!r.ok) throw new Error('manifest HTTP ' + r.status); return r.json(); })
      .then(m => {
        const entries = Object.values(m.lines || {});
        for (const l of entries) this.clips.set(l.text, l);
        return this.prefetch(entries, 6);   // cap concurrency: 33 at once fight the models and HDRIs
      })
      .then(() => this.clips.size)
      .catch(e => {
        // visible, not swallowed: a failed pack must not look like an absent one
        console.warn('[voice] recorded pack unavailable, falling back to speech synthesis —', e && e.message);
        return 0;
      });
    const load = () => { try { this.voices = this.synth ? this.synth.getVoices() : []; } catch (e) { this.voices = []; } };
    if (this.synth) { load(); try { this.synth.addEventListener('voiceschanged', load); } catch (e) { /* old API */ } }
  }

  pick(kind) {
    const sp = SPEAKERS[kind] || SPEAKERS.officer;
    const en = this.voices.filter(v => /^en(-|_|$)/i.test(v.lang));
    if (!en.length) return null;
    const score = (v) => {
      const n = (v.name + ' ' + v.voiceURI).toLowerCase();
      let s = 0;
      if (/en-us/i.test(v.lang)) s += 3;
      if (/natural|neural|premium|enhanced|online/.test(n)) s += 4;
      sp.prefer.forEach((p, i) => { if (n.includes(p)) s += 6 - Math.min(5, i * 0.5); });
      if (kind !== 'dispatch' && /female|woman|samantha|zira|aria|jenny|karen|moira|susan|victoria/.test(n)) s -= 8;
      if (kind === 'dispatch' && /\bmale\b|daniel|david|guy|fred|alex/.test(n)) s -= 4;
      return s;
    };
    const sorted = [...en].sort((a, b) => score(b) - score(a));
    // keep different voices for swat vs officer when possible
    if (kind === 'swat' && sorted.length > 1 && sorted[0] === this.pick('officer')) return sorted[1];
    return sorted[0];
  }

  // Say a line now; resolves when finished (or after an estimated duration).
  say(kind, text, opts = {}) {
    if (!this.readyDone) {
      // Decide clip-vs-synth only once the manifest has settled, otherwise the
      // first line of every scene is spoken by the robot. Bounded, so a dead
      // network cannot stall the story.
      return Promise.race([this.ready, new Promise(r => setTimeout(r, 2500))])
        .then(() => { this.readyDone = true; return this.say(kind, text, opts); });
    }
    const clip = !opts.silent && this.settings.get('voice') && this.audio && this.audio.ready && this.clips.get(text);
    return clip ? this.sayClip(kind, text, clip, opts) : this.saySynth(kind, text, opts);
  }

  // Fetch clip bytes a few at a time. A clip that fails simply falls back per line.
  prefetch(entries, limit) {
    let i = 0;
    const worker = async () => {
      while (i < entries.length) {
        const l = entries[i++];
        try { await this.clipBytes(l); } catch (e) { /* that line falls back to synthesis */ }
      }
    };
    return Promise.all(Array.from({ length: Math.min(limit, entries.length) }, worker));
  }

  clipBytes(l) {
    let b = this.bytes.get(l.file);
    if (!b) this.bytes.set(l.file, b = fetch('assets/voice/' + l.file).then(r => { if (!r.ok) throw new Error(l.file + ' ' + r.status); return r.arrayBuffer(); }));
    return b;
  }

  // Recorded clips play one at a time, in call order (like speechSynthesis queues utterances).
  sayClip(kind, text, clip, opts) {
    const gen = this.gen;
    const run = this.chain.then(() => (gen === this.gen ? this.playClip(kind, text, clip, opts, gen) : null));
    this.chain = run.catch(() => { });
    return run;
  }

  async playClip(kind, text, clip, opts, gen) {
    const sp = SPEAKERS[kind] || SPEAKERS.officer, A = this.audio;
    // ctx must be read inside the try. Dereferenced before it, a missing context
    // throws a TypeError that bypasses this fallback and kills the line outright.
    let buf, c;
    try {
      c = A && A.ctx;
      if (!c) throw new Error('audio context not ready');
      // decodeAudioData detaches its input: decode a copy, keep the bytes for a replay (checkpoint restart)
      buf = await c.decodeAudioData((await this.clipBytes(clip)).slice(0));
    } catch (e) {
      return this.saySynth(kind, text, opts);
    }
    if (gen !== this.gen) return;                                   // cancelled while decoding
    const radio = sp.radio && !clip.radioBaked;
    this.ui && this.ui.subtitle(opts.label || sp.label, text, sp.radio, buf.duration + 0.6);
    if (radio) {
      A.play('radioIn', { bus: 'voice', vol: 0.6, norand: true });
      // radioStatic is the recorded bed (assets/sfx); breath0 at rate 3.5 is the
      // synthesised stand-in it replaces. Keep both so the pack is optional.
      const bed = (A.buffers && A.buffers.radioStatic) ? 'radioStatic' : 'breath0';
      this._static = A.play(bed, { bus: 'voice', vol: 0.12, loop: true, rate: bed === 'breath0' ? 3.5 : 1, norand: true });
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = opts.vol ?? 1;
    src.connect(g); g.connect(A.voice);
    if (kind === 'swat' || kind === 'swat2') g.connect(A.revSend);  // shouted across the courtyard: give it the zone's reverb
    src._gain = g; this.src = src;
    await new Promise((res) => { src.onended = res; src.start(); });
    if (this.src === src) this.src = null;
    if (gen !== this.gen) return;                                   // cancel() already cleaned up
    if (radio) { A.play('radioOut', { bus: 'voice', vol: 0.5, norand: true }); A.stop(this._static, 0.05); }
    await new Promise(r => setTimeout(r, 150));
  }

  saySynth(kind, text, opts = {}) {
    const sp = SPEAKERS[kind] || SPEAKERS.officer;
    const est = Math.max(1.4, text.split(/\s+/).length * 0.36 / (sp.rate || 1)) + 0.25;
    const token = ++this.token;
    const sub = opts.label || sp.label;
    this.ui && this.ui.subtitle(sub, text, sp.radio, est + 0.6);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; if (sp.radio && this.audio) { this.audio.play('radioOut', { bus: 'voice', vol: 0.5, norand: true }); this.audio.stop(this._static, 0.05); } setTimeout(resolve, 150); };
      if (sp.radio && this.audio && this.audio.ready) {
        this.audio.play('radioIn', { bus: 'voice', vol: 0.6, norand: true });
        const bed = (this.audio.buffers && this.audio.buffers.radioStatic) ? 'radioStatic' : 'breath0';
        this._static = this.audio.play(bed, { bus: 'voice', vol: 0.12, loop: true, rate: bed === 'breath0' ? 3.5 : 1, norand: true });
      }
      const useTTS = this.synth && this.settings.get('voice') && this.voices.length && !opts.silent;
      const fallback = setTimeout(finish, (est + (useTTS ? 3.5 : 0)) * 1000 * (opts.timeScale || 1));
      if (useTTS) {
        try {
          const u = new SpeechSynthesisUtterance(text.replace(/[—–]/g, ', ').replace(/\.\.\./g, ', '));
          const v = this.pick(kind);
          if (v) u.voice = v;
          u.lang = v ? v.lang : 'en-US';
          u.pitch = opts.pitch ?? sp.pitch; u.rate = opts.rate ?? sp.rate;
          u.volume = Math.min(1, (this.settings.get('voiceVol') ?? 1) * (this.settings.get('master') ?? 1) * (sp.radio ? 0.85 : 1));
          u.onend = () => { clearTimeout(fallback); finish(); };
          u.onerror = () => { };
          this.synth.speak(u);
        } catch (e) { /* speech unavailable */ }
      }
    });
  }

  // Sequential dialogue helper
  lines(list) {
    let p = Promise.resolve();
    for (const [kind, text, pause = 0.25] of list) p = p.then(() => this.say(kind, text)).then(() => new Promise(r => setTimeout(r, pause * 1000)));
    return p;
  }

  cancel() { this.gen++; this.audio && this.audio.stop(this.src, 0.03); this.src = null; this.token++; try { this.synth && this.synth.cancel(); } catch (e) { /* ignore */ } this.audio && this.audio.stop(this._static, 0.05); this.ui && this.ui.subtitle(null); }
  pause() { try { this.synth && this.synth.pause(); } catch (e) { /* ignore */ } }
  resume() { try { this.synth && this.synth.resume(); } catch (e) { /* ignore */ } }
}
