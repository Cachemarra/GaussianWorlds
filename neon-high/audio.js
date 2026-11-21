// WebAudio procedural spatial sound engine + relaxing/uncanny generative music + player footsteps.
const RELAX_PROGRESSIONS = [
  [
    [174.61, 220.0, 261.63, 329.63, 440.0], // Fmaj7
    [164.81, 196.0, 246.94, 293.66, 392.0], // Em7
    [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
    [130.81, 196.0, 246.94, 293.66, 329.63], // Cmaj7
  ],
  [
    [146.83, 220.0, 277.18, 329.63, 369.99], // Dmaj7
    [123.47, 185.0, 220.0, 293.66, 369.99], // Bm7
    [196.0, 246.94, 293.66, 369.99, 440.0], // Gmaj7
    [110.0, 220.0, 277.18, 329.63, 440.0], // A6
  ],
  [
    [130.81, 196.0, 246.94, 293.66, 392.0], // Cmaj9
    [110.0, 196.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj7
    [196.0, 246.94, 293.66, 329.63, 440.0], // G6
  ],
  [
    [155.56, 196.0, 233.08, 293.66, 349.23], // Ebmaj7
    [130.81, 196.0, 233.08, 293.66, 392.0], // Cm9
    [207.65, 261.63, 311.13, 392.0, 466.16], // Abmaj7
    [116.54, 174.61, 233.08, 293.66, 349.23], // Bb6
  ],
];

const UNCANNY_PROGRESSIONS = [
  [
    [73.42, 146.83, 174.61, 261.63, 329.63], // Dm9 hollow
    [77.78, 155.56, 220.0, 293.66, 349.23], // Ebmaj7#11/Eb
    [110.0, 138.59, 174.61, 233.08, 329.63], // A7b9
    [73.42, 146.83, 220.0, 261.63, 311.13], // Dm(add b9)
  ],
  [
    [92.50, 138.59, 185.0, 220.0, 277.18], // F#m
    [98.0, 146.83, 220.0, 277.18, 369.99], // Gm(maj7)
    [69.30, 138.59, 207.65, 246.94, 329.63], // C#dim7
    [92.50, 138.59, 207.65, 277.18, 329.63], // F#m9
  ],
  [
    [65.41, 130.81, 196.0, 233.08, 311.13], // Cm
    [69.30, 138.59, 196.0, 261.63, 329.63], // Db/C
    [92.50, 130.81, 185.0, 220.0, 293.66], // F#dim/C
    [65.41, 130.81, 196.0, 233.08, 293.66], // Cm9
  ],
];

// Distinct 4-note harmonic chord voicings for discovering/tuning each of the 7 biome anomalies.
const ANOMALY_CHORDS = [
  [349.23, 440.0, 523.25, 659.25], // 0: Meadow (warm Fmaj7)
  [293.66, 440.0, 554.37, 659.25], // 1: Conifer (open Dmaj9)
  [311.13, 392.0, 466.16, 659.25], // 2: Cave (crystalline Eb Lydian)
  [261.63, 392.0, 493.88, 587.33], // 3: Sea (shimmering Cmaj9)
  [220.0, 329.63, 392.0, 493.88],  // 4: Liminal (nostalgic Am9)
  [415.30, 523.25, 622.25, 783.99], // 5: Dreamcore (celestial Abmaj7)
  [293.66, 349.23, 440.0, 554.37], // 6: Terrorcore (haunting Dm(maj7))
];

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export class SpatialAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientFilter = null;
    this.musicGain = null;
    this.reverbNode = null;
    this.muted = false;

    this._humGain = null;
    this._dripTimer = randRange(3.5, 8);
    this._bubbleTimer = randRange(1.5, 3.8);
    this._subRumbleTimer = randRange(22, 45);
    this._pendingTimers = new Set();

    // Music scheduler state
    this._musicMood = "relaxing"; // "relaxing" | "uncanny"
    this._musicPlaying = false;
    this._musicNextTrackTimer = randRange(2.0, 4.0);
    this._musicStepTimer = 0;
    this._musicStepIndex = 0;
    this._musicTotalSteps = 0;
    this._musicProg = null;
    this._musicTrackIdx = 0;
    this._musicBiome = "meadow";
    this._stepInterval = 1.6;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;

      this.ambientFilter = this.ctx.createBiquadFilter();
      this.ambientFilter.type = "lowpass";
      this.ambientFilter.frequency.value = 18000;
      this.ambientFilter.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.85;
      this.musicGain.connect(this.ambientFilter);

      this.reverbNode = this._buildReverb(2.6);
      this.reverbNode.connect(this.musicGain);

      this.masterGain.connect(this.ctx.destination);
      this._initLiminalHum();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  _buildReverb(seconds = 2.6) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.5);
        const white = (Math.random() * 2 - 1) * decay;
        lp = lp * 0.72 + white * 0.28;
        data[i] = lp;
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  _initLiminalHum() {
    // Ultra-subtle warm 120Hz fluorescent hum active only inside Liminal biome.
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 120;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(gain);
    gain.connect(this.ambientFilter);
    osc.start();
    this._humGain = gain;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  _randomAround(origin, minDist, maxDist, minY = 0.2, maxY = 5.0) {
    const ang = Math.random() * Math.PI * 2;
    const dist = randRange(minDist, maxDist);
    return {
      x: origin.x + Math.cos(ang) * dist,
      y: origin.y + randRange(minY, maxY),
      z: origin.z + Math.sin(ang) * dist,
    };
  }

  _schedule(ms, fn) {
    const id = setTimeout(() => {
      this._pendingTimers.delete(id);
      if (this.ctx && this.ctx.state === "running") fn();
    }, ms);
    this._pendingTimers.add(id);
  }

  _disconnectLater(ms, nodes) {
    const id = setTimeout(() => {
      this._pendingTimers.delete(id);
      for (const node of nodes) {
        try {
          node?.disconnect();
        } catch {}
      }
    }, ms);
    this._pendingTimers.add(id);
  }

  _startRandomTrack(mood) {
    this._musicMood = mood;
    const bank = mood === "uncanny" ? UNCANNY_PROGRESSIONS : RELAX_PROGRESSIONS;
    this._musicTrackIdx = Math.floor(Math.random() * bank.length);
    this._musicProg = bank[this._musicTrackIdx];
    this._musicPlaying = true;
    this._musicStepIndex = 0;
    this._musicTotalSteps = 16; // 4 chords x 4 beats
    if (mood === "uncanny") {
      this._stepInterval =
        this._musicBiome === "terrorcore" ? randRange(2.55, 3.25) : randRange(2.1, 2.7);
    } else {
      this._stepInterval = randRange(1.4, 1.9);
    }
    this._musicStepTimer = 0.05;
  }

  playRandomTrackNow(mood = this._musicMood) {
    if (!this.ctx || this.ctx.state !== "running") return;
    this._startRandomTrack(mood);
  }

  _playPadChord(notes, duration) {
    const now = this.ctx.currentTime;
    const isUncanny = this._musicMood === "uncanny";
    const isTerror = isUncanny && this._musicBiome === "terrorcore";
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = isTerror ? 310 : isUncanny ? 420 : 880;
    filter.connect(this.reverbNode);

    const chordNotes = isUncanny ? [notes[0], notes[1], notes[3]] : [notes[0], notes[1], notes[2]];
    const cleanupNodes = [filter];

    for (let i = 0; i < chordNotes.length; i++) {
      const freq = isTerror && i === 0 ? chordNotes[0] * 0.75 : chordNotes[i];
      const osc = this.ctx.createOscillator();
      osc.type = isUncanny ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      if (isUncanny) osc.detune.value = randRange(isTerror ? -10 : -7, isTerror ? 10 : 7);

      const env = this.ctx.createGain();
      const peak = isTerror ? 0.058 : isUncanny ? 0.052 : 0.048;
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(peak, now + duration * 0.35);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.6);

      osc.connect(env);
      env.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.7);
      cleanupNodes.push(osc, env);
    }

    // Add a darker sub-bass root anchor in Terrorcore for heightened tension.
    if (isTerror) {
      const subOsc = this.ctx.createOscillator();
      subOsc.type = "sine";
      const subFreq = Math.max(36, notes[0] * 0.5);
      subOsc.frequency.setValueAtTime(subFreq, now);

      const subEnv = this.ctx.createGain();
      subEnv.gain.setValueAtTime(0.0001, now);
      subEnv.gain.linearRampToValueAtTime(0.05, now + duration * 0.4);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.65);

      subOsc.connect(subEnv);
      subEnv.connect(filter);
      subOsc.start(now);
      subOsc.stop(now + duration + 0.75);
      cleanupNodes.push(subOsc, subEnv);
    }

    this._disconnectLater(Math.ceil((duration + 0.9) * 1000), cleanupNodes);
  }

  _playWarmPiano(freq, duration = 2.8, volume = 0.075, detuneCents = 0) {
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);
    osc1.detune.value = detuneCents;
    osc2.detune.value = detuneCents;

    const h2 = this.ctx.createGain();
    h2.gain.value = 0.14;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1150, now);
    lp.frequency.exponentialRampToValueAtTime(340, now + duration);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(volume, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(lp);
    osc2.connect(h2);
    h2.connect(lp);
    lp.connect(env);
    env.connect(this.reverbNode);
    env.connect(this.musicGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);

    this._disconnectLater(Math.ceil((duration + 0.25) * 1000), [osc1, osc2, h2, lp, env]);
  }

  _playSoftFlute(freq, duration = 2.2, volume = 0.045) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    const vib = this.ctx.createOscillator();
    vib.frequency.value = 4.3;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.006;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(volume, now + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env);
    env.connect(this.reverbNode);

    osc.start(now);
    vib.start(now);
    osc.stop(now + duration + 0.1);
    vib.stop(now + duration + 0.1);

    this._disconnectLater(Math.ceil((duration + 0.25) * 1000), [osc, vib, vibGain, env]);
  }

  _stepMusic() {
    if (!this._musicProg) return;
    const chordIdx = Math.floor(this._musicStepIndex / 4) % this._musicProg.length;
    const beatInChord = this._musicStepIndex % 4;
    const chord = this._musicProg[chordIdx];

    if (beatInChord === 0) {
      this._playPadChord(chord, this._stepInterval * 3.9);
    }

    if (this._musicMood === "relaxing") {
      // Gentle piano arpeggio + occasional lyrical flute or dreamcore bell note.
      const note = chord[1 + ((beatInChord + (Math.random() < 0.35 ? 1 : 0)) % (chord.length - 1))];
      this._playWarmPiano(note, this._stepInterval * 1.9, randRange(0.055, 0.08));
      if (beatInChord === 2 && Math.random() < 0.65) {
        const melody = chord[chord.length - 1] * (this._musicBiome === "dreamcore" ? 2 : 1);
        if (this._musicBiome === "dreamcore") {
          this._playWarmPiano(melody, 2.4, 0.042, 0);
        } else {
          this._playSoftFlute(melody, this._stepInterval * 1.6, 0.042);
        }
      }
    } else {
      // Uncanny nocturnal/dark music: sparse ghostly detuned upright piano + low hollow intervals.
      const isTerror = this._musicBiome === "terrorcore";
      if (Math.random() < (isTerror ? 0.64 : 0.72)) {
        const poolLen = isTerror ? Math.min(3, chord.length) : chord.length;
        const note = chord[Math.floor(Math.random() * poolLen)];
        this._playWarmPiano(
          note,
          this._stepInterval * 2.1,
          randRange(0.04, 0.068),
          randRange(isTerror ? -11 : -8, isTerror ? 11 : 8)
        );
      }
      if (beatInChord === 3 && Math.random() < 0.4) {
        const topNote = isTerror ? chord[0] : chord[chord.length - 1] * 2;
        this._playWarmPiano(topNote, 3.0, isTerror ? 0.045 : 0.03, randRange(-10, 10));
      }
    }

    this._musicStepIndex++;
    if (this._musicStepIndex >= this._musicTotalSteps) {
      this._musicPlaying = false;
      this._musicNextTrackTimer = randRange(12, 26);
    } else {
      this._musicStepTimer = this._stepInterval;
    }
  }

  playSubRumble() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const duration = 3.5;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(78, t);
    lp.Q.value = 0.75;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.06, t + duration * 0.48);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    const baseFreq = randRange(38, 48);
    osc1.frequency.setValueAtTime(baseFreq, t);
    osc1.frequency.linearRampToValueAtTime(baseFreq * 0.88, t + duration);

    const osc2 = this.ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(baseFreq * 1.03, t);
    osc2.frequency.linearRampToValueAtTime(baseFreq * 0.91, t + duration);

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.35;

    osc1.connect(lp);
    osc2.connect(osc2Gain);
    osc2Gain.connect(lp);
    lp.connect(env);
    env.connect(this.ambientFilter || this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration + 0.1);
    osc2.stop(t + duration + 0.1);

    this._disconnectLater(3750, [osc1, osc2, osc2Gain, lp, env]);
  }

  updateAmbient(dt, { isNight, biome = "meadow", isUnderwater = false, playerPos, suppressMusic = false }) {
    this._musicBiome = biome;
    const isDarkBiome = biome === "cave" || biome === "liminal" || biome === "terrorcore";
    const desiredMood = isNight || isDarkBiome ? "uncanny" : "relaxing";

    // Always track mood smoothly even before unlock so state inspection works.
    if (desiredMood !== this._musicMood) {
      this._musicMood = desiredMood;
      if (this._musicPlaying) {
        this._musicPlaying = false;
        this._musicNextTrackTimer = 1.6;
      }
    }

    if (!this.ctx || this.ctx.state !== "running") return;

    const t = this.ctx.currentTime;
    if (this.ambientFilter) {
      this.ambientFilter.frequency.setTargetAtTime(isUnderwater ? 520 : 18000, t, 0.14);
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(suppressMusic ? 0.35 : 0.85, t, 0.45);
    }
    if (this._humGain) {
      this._humGain.gain.setTargetAtTime(biome === "liminal" && !isUnderwater ? 0.012 : 0.0, t, 0.35);
    }

    // Generative background music scheduler.
    if (this._musicPlaying) {
      this._musicStepTimer -= dt;
      if (this._musicStepTimer <= 0) {
        this._stepMusic();
      }
    } else {
      this._musicNextTrackTimer -= dt;
      if (this._musicNextTrackTimer <= 0) {
        this._startRandomTrack(desiredMood);
      }
    }

    // Rare, subtle warm subterranean dread swell only in dark biomes.
    if (isDarkBiome && !isUnderwater) {
      this._subRumbleTimer -= dt;
      if (this._subRumbleTimer <= 0) {
        this.playSubRumble();
        this._subRumbleTimer = randRange(22, 45);
      }
    }

    // Subtle spatial environmental details only underwater or in caves (zero annoying chirps/squeaks).
    if (isUnderwater) {
      this._bubbleTimer -= dt;
      if (this._bubbleTimer <= 0) {
        this.playBubble(this._randomAround(playerPos, 2, 10, -1.5, 2.5));
        this._bubbleTimer = randRange(1.4, 3.6);
      }
    } else if (biome === "cave") {
      this._dripTimer -= dt;
      if (this._dripTimer <= 0) {
        this.playCaveDrip(this._randomAround(playerPos, 6, 22, 0.5, 6.0));
        this._dripTimer = randRange(3.0, 7.5);
      }
    }
  }

  getMusicState() {
    return {
      mood: this._musicMood,
      playing: this._musicPlaying,
      muted: this.muted,
      trackIndex: this._musicTrackIdx,
    };
  }

  playCaveDrip(worldPos) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const panner = this._createPanner(worldPos, 4, 38);
    const now = this.ctx.currentTime;
    const base = randRange(900, 1450);

    for (let echo = 0; echo < 2; echo++) {
      const t = now + echo * 0.16;
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(echo === 0 ? 0.10 : 0.035, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

      osc.connect(gain);
      gain.connect(panner);
      osc.start(t);
      osc.stop(t + 0.085);
    }

    this._disconnectLater(500, [panner]);
  }

  playBubble(worldPos) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const panner = this._createPanner(worldPos, 2, 16);
    const t = this.ctx.currentTime;
    const f = randRange(240, 420);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2.0, t + 0.085);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);

    osc.connect(gain);
    gain.connect(panner);
    osc.start(t);
    osc.stop(t + 0.11);

    this._disconnectLater(260, [panner]);
  }

  playPlayerFootstep(surface = "grass", intensity = 1.0) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const vol = Math.min(1.4, intensity);

    const dur = surface === "water" ? 0.18 : 0.095;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp((-i / ch.length) * (surface === "water" ? 3.5 : 6.0));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === "stone" ? "highpass" : "bandpass";
    const freqMap = {
      grass: 850,
      forest: 1650,
      stone: 1400,
      sand: 2200,
      water: 1150,
      carpet: 520,
    };
    filter.frequency.setValueAtTime((freqMap[surface] || 900) * randRange(0.92, 1.08), t);
    filter.Q.value = surface === "carpet" ? 0.6 : surface === "forest" ? 0.9 : 1.1;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.linearRampToValueAtTime((surface === "carpet" ? 0.14 : surface === "stone" ? 0.16 : 0.24) * vol, t + 0.012);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(t);

    if (surface !== "water") {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(surface === "stone" ? 135 : surface === "carpet" ? 68 : 88, t);
      osc.frequency.exponentialRampToValueAtTime(34, t + 0.065);

      const tGain = this.ctx.createGain();
      tGain.gain.setValueAtTime(0.18 * vol, t);
      tGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

      osc.connect(tGain);
      tGain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.075);
    }

    if (surface === "stone") {
      const echo = this.ctx.createOscillator();
      echo.type = "triangle";
      echo.frequency.setValueAtTime(220, t + 0.11);
      const eGain = this.ctx.createGain();
      eGain.gain.setValueAtTime(0.045 * vol, t + 0.11);
      eGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      echo.connect(eGain);
      eGain.connect(this.masterGain);
      echo.start(t + 0.11);
      echo.stop(t + 0.17);
    }
  }

  playJump(surface = "grass") {
    this.playPlayerFootstep(surface, 1.15);
  }

  playUiClick() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.035);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
    this._disconnectLater(90, [osc, gain]);
  }

  playFlashlightClick(on = true) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const baseFreq = on ? 1600 : 1250;

    // Crisp 18 ms mechanical switch transient.
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, t + 0.018);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.16, t);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

    osc.connect(toneGain);
    toneGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.022);

    // Tactile micro plastic snap.
    const dur = 0.016;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp((-i / ch.length) * 9.0);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(on ? 3200 : 2400, t);
    bp.Q.value = 1.8;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.15, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(t);

    this._disconnectLater(80, [osc, toneGain, noise, bp, nGain]);
  }

  playAnomalyChime(biomeIndex = 0) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const idx = ((Math.floor(biomeIndex) % ANOMALY_CHORDS.length) + ANOMALY_CHORDS.length) % ANOMALY_CHORDS.length;
    const chord = ANOMALY_CHORDS[idx];

    const bus = this.ctx.createGain();
    bus.gain.value = 1.0;

    const wetGain = this.ctx.createGain();
    wetGain.gain.value = 0.9;
    const dryGain = this.ctx.createGain();
    dryGain.gain.value = 0.35;

    bus.connect(wetGain);
    bus.connect(dryGain);
    wetGain.connect(this.reverbNode || this.masterGain);
    dryGain.connect(this.masterGain);

    const cleanupNodes = [bus, wetGain, dryGain];
    const stepSpacing = 0.11;
    const noteDur = 1.85;

    for (let i = 0; i < chord.length; i++) {
      const start = t + i * stepSpacing;
      const freq = chord[i];

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, start);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq * 2, start);

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.value = 0.16;

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2600, start);
      lp.frequency.exponentialRampToValueAtTime(760, start + noteDur);

      const env = this.ctx.createGain();
      const peak = 0.105 - i * 0.008;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(peak, start + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);

      osc1.connect(lp);
      osc2.connect(shimmerGain);
      shimmerGain.connect(lp);
      lp.connect(env);
      env.connect(bus);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + noteDur + 0.08);
      osc2.stop(start + noteDur + 0.08);

      cleanupNodes.push(osc1, osc2, shimmerGain, lp, env);
    }

    this._disconnectLater(2800, cleanupNodes);
  }

  playPortalWhoosh() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

    osc.connect(gain);
    gain.connect(this.reverbNode || this.masterGain);
    osc.start(t);
    osc.stop(t + 0.4);
    this._disconnectLater(500, [osc, gain]);
  }

  playSwimStroke() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const dur = 0.24;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const env = Math.sin((i / ch.length) * Math.PI);
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(210, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    this._disconnectLater(320, [src, lp, gain]);
  }

  updateListener(pos, forward, up) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const listener = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, t);
      listener.positionY.setValueAtTime(pos.y, t);
      listener.positionZ.setValueAtTime(pos.z, t);
      listener.forwardX.setValueAtTime(forward.x, t);
      listener.forwardY.setValueAtTime(forward.y, t);
      listener.forwardZ.setValueAtTime(forward.z, t);
      listener.upX.setValueAtTime(up.x, t);
      listener.upY.setValueAtTime(up.y, t);
      listener.upZ.setValueAtTime(up.z, t);
    } else if (listener.setPosition) {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  _createPanner(worldPos, refDistance = 5, maxDistance = 65) {
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.0;

    if (panner.positionX) {
      const t = this.ctx.currentTime;
      panner.positionX.setValueAtTime(worldPos.x, t);
      panner.positionY.setValueAtTime(worldPos.y, t);
      panner.positionZ.setValueAtTime(worldPos.z, t);
    } else if (panner.setPosition) {
      panner.setPosition(worldPos.x, worldPos.y, worldPos.z);
    }
    panner.connect(this.ambientFilter || this.masterGain || this.ctx.destination);
    return panner;
  }

  playFootstep(worldPos, pitchJitter = 1.0, volume = 1.0) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(worldPos, 6, 70);
    const vol = Math.max(0.05, Math.min(1.5, volume));

    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / data.length) * 4.5);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950 * pitchJitter, t);
    filter.Q.setValueAtTime(1.1, t);

    const rustleGain = this.ctx.createGain();
    rustleGain.gain.setValueAtTime(0.001, t);
    rustleGain.gain.linearRampToValueAtTime(0.95 * vol, t + 0.014);
    rustleGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(rustleGain);
    rustleGain.connect(panner);
    noise.start(t);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(92 * pitchJitter, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.075);

    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.75 * vol, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(thumpGain);
    thumpGain.connect(panner);
    osc.start(t);
    osc.stop(t + 0.09);

    this._disconnectLater(220, [noise, filter, rustleGain, osc, thumpGain, panner]);
  }

  playWhisperBehind(worldPos) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const dur = 0.55;
    const panner = this._createPanner(worldPos, 4, 48);

    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * (dur + 0.04)), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    // Eerie soft low-mid breathy formant (~650 Hz, Q 3.5) with slight 2-syllable drift.
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    const baseFreq = 650 * randRange(0.93, 1.07);
    bp.frequency.setValueAtTime(baseFreq, t);
    bp.frequency.linearRampToValueAtTime(baseFreq * 0.88, t + 0.24);
    bp.frequency.linearRampToValueAtTime(baseFreq * 1.08, t + 0.42);
    bp.Q.setValueAtTime(3.5, t);

    // Subtle secondary airy formant for whisper texture.
    const bpAir = this.ctx.createBiquadFilter();
    bpAir.type = "bandpass";
    bpAir.frequency.setValueAtTime(1320 * randRange(0.94, 1.06), t);
    bpAir.Q.setValueAtTime(4.2, t);

    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.24;

    // Gentle 2-syllable breathy swell over 0.55 s.
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.36, t + 0.12);
    env.gain.linearRampToValueAtTime(0.07, t + 0.25);
    env.gain.linearRampToValueAtTime(0.42, t + 0.39);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(bp);
    bp.connect(env);
    noise.connect(bpAir);
    bpAir.connect(airGain);
    airGain.connect(env);
    env.connect(panner);

    noise.start(t);
    noise.stop(t + dur + 0.03);

    this._disconnectLater(720, [noise, bp, bpAir, airGain, env, panner]);
  }

  playPop(worldPos) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(worldPos, 8, 80);

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.042);

    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(1.1, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.048);

    osc.connect(popGain);
    popGain.connect(panner);
    osc.start(t);
    osc.stop(t + 0.055);

    const snapDur = 0.02;
    const snapBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * snapDur), this.ctx.sampleRate);
    const ch = snapBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp((-i / ch.length) * 8);
    }
    const snapSrc = this.ctx.createBufferSource();
    snapSrc.buffer = snapBuf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1400, t);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.85, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + snapDur);

    snapSrc.connect(hp);
    hp.connect(snapGain);
    snapGain.connect(panner);
    snapSrc.start(t);

    this._disconnectLater(160, [osc, popGain, snapSrc, hp, snapGain, panner]);
  }

  playStalkerPop(worldPos) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(worldPos, 8, 80);

    // Unsettling sharp sub-bass drop (160 Hz -> 28 Hz over 110 ms).
    const subOsc = this.ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(160, t);
    subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.11);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(1.05, t + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.145);

    subOsc.connect(subGain);
    subGain.connect(panner);
    subOsc.start(t);
    subOsc.stop(t + 0.16);

    // Crisp dry static crack.
    const crackDur = 0.045;
    const crackBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * crackDur), this.ctx.sampleRate);
    const ch = crackBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const env = Math.exp((-i / ch.length) * 10.5);
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1850, t);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.92, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);

    crackSrc.connect(hp);
    hp.connect(crackGain);
    crackGain.connect(panner);
    crackSrc.start(t);

    this._disconnectLater(280, [subOsc, subGain, crackSrc, hp, crackGain, panner]);
  }
}
