/**
 * Generative space-techno backing track (Daft Punk-flavored).
 *
 * - 4/4 kick at 124 BPM
 * - Offbeat noise hi-hat
 * - Sawtooth bass cycling Am · F · C · G
 * - Square-wave arpeggiated lead through a low-pass filter
 * - Mute toggle (start/stop is gesture-gated by AudioContext)
 */

const BPM = 124;
const SIXTEENTH = 60 / BPM / 4;
const PATTERN_STEPS = 64; // 4 bars total

// MIDI-ish note frequencies (Hz)
const NOTE = {
  A1: 55,
  C2: 65.41,
  E2: 82.41,
  F2: 87.31,
  G2: 98,
  A2: 110,
  C3: 130.81,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  C5: 523.25,
  E5: 659.25,
  A5: 880
};

// 4-bar chord progression: Am | F | C | G
const CHORDS: { root: number; arp: number[] }[] = [
  { root: NOTE.A1, arp: [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.E4, NOTE.C4, NOTE.A3, NOTE.E4] },
  { root: NOTE.F2,  arp: [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4, NOTE.C4, NOTE.A3, NOTE.F3, NOTE.C4] },
  { root: NOTE.C2,  arp: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.G4, NOTE.E4, NOTE.C4, NOTE.G4] },
  { root: NOTE.G2,  arp: [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.D4, NOTE.G3, NOTE.D4, NOTE.G4, NOTE.D4] }
];

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private muted = false;
  private started = false;

  start() {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = (window as typeof window & {
      AudioContext: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }).AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.18;
    this.master.connect(ctx.destination);

    // Pre-bake a quarter-second of noise for the hi-hat
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * 0.25), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.1;
    window.setInterval(() => this.scheduler(), 25);
    this.started = true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.18;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private scheduler() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const lookahead = 0.12;
    while (this.nextNoteTime < ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += SIXTEENTH;
      this.step = (this.step + 1) % PATTERN_STEPS;
    }
  }

  private playStep(step: number, when: number) {
    const inBar = step % 16;
    const barIndex = Math.floor(step / 16);
    const chord = CHORDS[barIndex];

    // Kick on every beat
    if (inBar % 4 === 0) this.kick(when);

    // Snare/clap on the 2 and 4 (typical disco backbeat — adds tension)
    if (inBar === 4 || inBar === 12) this.snare(when);

    // Hi-hat on offbeats (extra ghost on 3-and)
    if (inBar % 4 === 2) this.hihat(when, 0.18);
    if (inBar % 8 === 6) this.hihat(when, 0.1);

    // Sub-drone holds for the whole bar — fills the low end with suspense
    if (inBar === 0) this.subDrone(chord.root / 2, when, SIXTEENTH * 16);

    // Bass on every beat (root note)
    if (inBar % 4 === 0) this.bass(chord.root, when, SIXTEENTH * 3.6);

    // Filter swell every 2 bars on the lead
    if (step % 32 === 28) this.swell(when, SIXTEENTH * 4);

    // Lead arpeggio on 8th notes
    if (inBar % 2 === 0) {
      const arpIdx = (inBar / 2) | 0;
      this.lead(chord.arp[arpIdx % 8], when);
    }
  }

  private snare(t: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(bp).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + 0.14);
  }

  private subDrone(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
    gain.gain.setValueAtTime(0.16, t + dur - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp).connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  private swell(t: number, dur: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(4500, t + dur);
    bp.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.95, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private hihat(t: number, vol: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + 0.06);
  }

  private bass(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(280, t + dur);
    lp.Q.value = 6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(lp);
    sub.connect(lp);
    lp.connect(gain).connect(this.master!);
    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  private lead(freq: number, t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const detune = ctx.createOscillator();
    detune.type = 'sawtooth';
    detune.frequency.value = freq * 1.005;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    lp.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(lp);
    detune.connect(lp);
    lp.connect(gain).connect(this.master!);
    osc.start(t);
    detune.start(t);
    osc.stop(t + 0.2);
    detune.stop(t + 0.2);
  }
}

export const music = new Music();
