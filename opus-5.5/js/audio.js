// All audio is synthesized with WebAudio: no asset files.
const rand = (a, b) => a + Math.random() * (b - a);

export class AudioSys {
  ctx = null;
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.comp = ctx.createDynamicsCompressor(); this.comp.connect(ctx.destination);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.connect(this.comp);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.lp);
    // cheap echo (cave + music reverb-ish)
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.45; this.echo.connect(fb); fb.connect(this.echo);
    this.echoOut = ctx.createGain(); this.echoOut.gain.value = 0.1; this.echo.connect(this.echoOut); this.echoOut.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.music = ctx.createGain(); this.music.gain.value = 0.16; this.music.connect(this.master);
    const mSend = ctx.createGain(); mSend.gain.value = 0.5; this.music.connect(mSend); mSend.connect(this.echo);
    // continuous beds: wind, water, waves, crickets
    this.windG = this.bed(400, 0.6, 'bandpass');
    this.waterG = this.bed(900, 1.2, 'bandpass');
    this.waveG = this.bed(350, 0.7, 'lowpass');
    this.crickets();
    this.timers = { music: rand(4, 12), bird: 3, owl: rand(8, 20), rodent: rand(6, 14), drip: 2, bubble: 1 };
    this.t = 0;
  }
  bed(freq, q, type) {
    const { ctx } = this;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return g;
  }
  crickets() {
    const { ctx } = this;
    const osc = ctx.createOscillator(); osc.frequency.value = 4400;
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(am.gain);
    const gate = ctx.createGain(); gate.gain.value = 0;
    const lfo2 = ctx.createOscillator(); lfo2.type = 'square'; lfo2.frequency.value = 1.3;
    const l2g = ctx.createGain(); l2g.gain.value = 0.5; lfo2.connect(l2g); l2g.connect(gate.gain);
    this.cricketG = ctx.createGain(); this.cricketG.gain.value = 0;
    osc.connect(am); am.connect(gate); gate.connect(this.cricketG); this.cricketG.connect(this.master);
    osc.start(); lfo.start(); lfo2.start();
  }
  // output node: spatial panner at world pos, or master
  out(pos, ref = 5) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 0.8;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }
  noiseHit(dest, t, dur, freq, q, gain, type = 'bandpass') {
    const { ctx } = this;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(dest, t, f0, f1, dur, gain, type = 'sine', attack = 0.005) {
    const { ctx } = this;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  // surface: grass | stone | water | sand
  footstep(surface, pos = null, heavy = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(pos, 6);
    const v = heavy * rand(0.85, 1.1);
    if (surface === 'water') { this.noiseHit(d, t, 0.3, 700, 0.8, 0.5 * v, 'lowpass'); this.noiseHit(d, t + 0.05, 0.2, 1500, 1, 0.2 * v); }
    else if (surface === 'stone') { this.noiseHit(d, t, 0.06, 2500, 2, 0.35 * v); this.tone(d, t, 140, 70, 0.08, 0.3 * v); if (!pos) this.noiseHit(this.echo, t, 0.06, 2500, 2, 0.4 * v); }
    else { this.noiseHit(d, t, 0.14, rand(1500, 2400), 0.6, 0.35 * v); this.noiseHit(d, t + 0.03, 0.1, 4000, 0.8, 0.12 * v, 'highpass'); this.tone(d, t, 110, 55, 0.09, 0.25 * v); }
  }
  land() { if (this.ctx) this.tone(this.master, this.ctx.currentTime, 120, 45, 0.15, 0.45); }
  splash() { if (this.ctx) this.noiseHit(this.master, this.ctx.currentTime, 0.5, 600, 0.6, 0.6, 'lowpass'); }
  pop(pos) { // short dry pop, near-unity gain regardless of distance
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(pos, 50);
    this.tone(d, t, 1400, 260, 0.055, 0.9);
    this.noiseHit(d, t, 0.025, 3000, 0.7, 0.6, 'highpass');
  }
  // ---- ambient one-shots ----
  around(cam, rMin, rMax, y = 0) {
    const a = Math.random() * Math.PI * 2, r = rand(rMin, rMax);
    return { x: cam.x + Math.cos(a) * r, y: cam.y + y, z: cam.z + Math.sin(a) * r };
  }
  bird(pos) {
    const d = this.out(pos, 8); let t = this.ctx.currentTime;
    const base = rand(2200, 3800);
    for (let i = 0, n = 2 + (Math.random() * 5) | 0; i < n; i++, t += rand(0.08, 0.18)) this.tone(d, t, base * rand(0.9, 1.1), base * rand(1.2, 1.6), 0.07, 0.12);
  }
  owl(pos) {
    const d = this.out(pos, 10), t = this.ctx.currentTime, f = rand(340, 420);
    for (const [dt, dur] of [[0, 0.45], [0.75, 0.2], [1.0, 0.5]]) this.tone(d, t + dt, f, f * 0.9, dur, 0.25, 'sine', 0.06);
  }
  rodent(pos) {
    const d = this.out(pos, 4); let t = this.ctx.currentTime;
    if (Math.random() < 0.5) for (let i = 0; i < 3 + Math.random() * 3; i++, t += rand(0.05, 0.15)) this.noiseHit(d, t, 0.06, rand(2500, 5000), 1.5, 0.25); // rustle
    else for (let i = 0; i < 2 + Math.random() * 3; i++, t += rand(0.06, 0.12)) this.tone(d, t, rand(4500, 6500), rand(5000, 7500), 0.035, 0.08, 'triangle'); // squeak
  }
  drip(pos) { const d = this.out(pos, 4), t = this.ctx.currentTime; this.tone(d, t, 1300, 700, 0.08, 0.2); this.tone(this.echo, t, 1300, 700, 0.08, 0.15); }
  bubble() { const t = this.ctx.currentTime; for (let i = 0; i < 4; i++) this.tone(this.master, t + i * rand(0.05, 0.12), rand(300, 500), rand(800, 1200), 0.04, 0.1); }
  // ---- music: short pentatonic phrases (piano or flute) ----
  phrase(night) {
    const t0 = this.ctx.currentTime + 0.1;
    const scale = night ? [57, 60, 62, 64, 67, 69, 72] : [60, 62, 64, 67, 69, 72, 74, 76]; // A minor / C major pentatonic
    const flute = Math.random() < 0.5, n = 6 + ((Math.random() * 7) | 0);
    let idx = (Math.random() * scale.length) | 0, t = t0;
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + ((Math.random() * 5) | 0) - 2));
      const midi = scale[idx] + (flute ? 12 : night ? -12 : 0), f = 440 * 2 ** ((midi - 69) / 12);
      const dur = (night ? 1.6 : 1) * rand(0.5, 1.2);
      flute ? this.fluteNote(f, t, dur) : this.pianoNote(f, t, 2.5);
      if (!flute && i % 4 === 0) this.pianoNote(f / 2, t, 3, 0.5);
      t += dur;
    }
  }
  pianoNote(f, t, dur, amp = 1) {
    [[1, 0.5], [2, 0.18], [3, 0.08], [4.02, 0.04]].forEach(([h, a]) => this.tone(this.music, t, f * h, f * h * 0.999, dur / h, a * amp));
  }
  fluteNote(f, t, dur) {
    const { ctx } = this;
    const o = ctx.createOscillator(); o.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.01, t + 0.4);
    vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.09); g.gain.setValueAtTime(0.3, t + dur - 0.12); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.music); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    this.noiseHit(this.music, t, Math.min(dur, 0.4), f * 2, 2, 0.08);
  }
  // per frame: listener from camera, beds and schedulers from environment
  update(dt, cam, fwd, up, env) {
    if (!this.ctx) return;
    const L = this.ctx.listener, now = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else { L.setPosition(cam.x, cam.y, cam.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
    const { night, under, cave, sea, nearWater, wind } = env, open = 1 - cave;
    const set = (p, v) => p.setTargetAtTime(v, now, 0.3);
    set(this.lp.frequency, under ? 500 : 20000);
    set(this.echoOut.gain, 0.1 + cave * 0.35);
    set(this.windG.gain, under ? 0 : (0.05 + wind * 0.25) * open);
    set(this.waterG.gain, under ? 0.15 : nearWater * 0.12);
    set(this.waveG.gain, under ? 0 : sea * 0.25 * (0.6 + 0.4 * Math.sin(now * 0.7)));
    set(this.cricketG.gain, under ? 0 : night * open * (1 - sea) * 0.02);
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    if (T.music <= 0) { T.music = rand(35, 100); if (!under) this.phrase(night > 0.5); }
    if (T.bird <= 0) { T.bird = rand(2, 8); if (!under && night < 0.3 && cave < 0.5) this.bird(this.around(cam, 8, 30, 6)); }
    if (T.owl <= 0) { T.owl = rand(15, 40); if (!under && night > 0.6 && cave < 0.5) this.owl(this.around(cam, 15, 40, 8)); }
    if (T.rodent <= 0) { T.rodent = rand(6, 18); if (!under && night > 0.6) this.rodent(this.around(cam, 4, 14, -1.4)); }
    if (T.drip <= 0) { T.drip = rand(1.5, 5); if (cave > 0.5 && !under) this.drip(this.around(cam, 2, 10, 2)); }
    if (T.bubble <= 0) { T.bubble = rand(1, 4); if (under) this.bubble(); }
  }
}
