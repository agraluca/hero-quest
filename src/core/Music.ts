/**
 * "Salt & Steel": an original swashbuckling sea-shanty loop, synthesised live.
 * D minor, 6/8, ~100 bpm (dotted quarter). Driving eighth-note bass, chord
 * stabs on the two big beats, a soft drum and a lead melody. Written for this
 * game, not taken from any existing theme, and no audio files are shipped.
 *
 * Scheduling uses the AudioContext clock with a short look-ahead, so it pauses
 * naturally when the context is suspended (page hidden) and never drifts.
 */

const EIGHTH = 0.2; // seconds per eighth note
const BAR = 6; // eighths per bar (6/8)
const LOOKAHEAD = 0.35;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** chord per bar: root (MIDI) + triad */
const D = [50, 62, 65, 69];
const Bb = [46, 58, 62, 65];
const C = [48, 60, 64, 67];
const Gm = [43, 55, 58, 62];
const A = [45, 57, 61, 64];
const F = [41, 53, 57, 60];
const CHORDS = [D, D, Bb, C, D, Gm, A, A, D, F, C, D, Bb, Gm, A, D];

/** melody per bar as [midi, eighths]; 0 = rest. 16 bars, 6 eighths each. */
const MELODY: [number, number][][] = [
  [[69, 2], [74, 1], [72, 2], [69, 1]],
  [[70, 1], [69, 1], [67, 1], [65, 3]],
  [[65, 2], [67, 1], [70, 2], [74, 1]],
  [[72, 3], [67, 3]],
  [[69, 2], [74, 1], [76, 2], [77, 1]],
  [[74, 1], [72, 1], [70, 1], [67, 3]],
  [[64, 2], [67, 1], [69, 2], [73, 1]],
  [[76, 3], [73, 2], [69, 1]],
  [[74, 3], [69, 3]],
  [[72, 2], [69, 1], [65, 2], [69, 1]],
  [[67, 2], [72, 1], [76, 2], [72, 1]],
  [[74, 3], [0, 3]],
  [[70, 2], [74, 1], [77, 2], [74, 1]],
  [[79, 2], [77, 1], [74, 2], [70, 1]],
  [[73, 1], [76, 1], [73, 1], [69, 3]],
  [[74, 4], [0, 2]],
];

export class Music {
  private out: GainNode;
  private timer: number | null = null;
  private step = 0;
  private t0 = 0;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
    private noise: AudioBuffer,
    volume = 0.16,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    // gentle low-pass keeps it warm and in the background
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    this.out.connect(lp).connect(destination);
  }

  /** Idempotent: only one scheduler ever runs. */
  start(): void {
    if (this.timer !== null) return;
    this.t0 = this.ctx.currentTime + 0.15;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    // a suspended context (hidden page) has a frozen clock, so nothing piles up
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // if we fell far behind (e.g. long suspend), resync instead of bursting notes
    if (this.t0 + this.step * EIGHTH < now - 0.5) {
      this.step = Math.ceil((now - this.t0) / EIGHTH);
    }
    while (this.t0 + this.step * EIGHTH < now + LOOKAHEAD) {
      this.playStep(this.step, this.t0 + this.step * EIGHTH);
      this.step++;
    }
  }

  private playStep(step: number, at: number): void {
    const loopLen = CHORDS.length * BAR;
    const s = step % loopLen;
    const bar = Math.floor(s / BAR);
    const beat = s % BAR;
    const chord = CHORDS[bar];

    // bass: driving eighths, octave bounce on the off-beats, accents on 1 and 4
    const accent = beat === 0 || beat === 3;
    const bassNote = beat === 2 || beat === 5 ? chord[0] + 12 : chord[0];
    this.voice(midi(bassNote), at, EIGHTH * 0.9, 'sawtooth', accent ? 0.34 : 0.22, 700);

    // chord stabs on the two big beats
    if (accent) {
      for (const n of chord.slice(1)) this.voice(midi(n), at, EIGHTH * 1.4, 'square', 0.06, 1800);
    }

    // drum: low thump on 1, rim/snare noise on 4, soft shaker on the rest
    if (beat === 0) this.kick(at);
    else if (beat === 3) this.hit(at, 0.22, 1800, 0.12);
    else this.hit(at, 0.05, 7000, 0.04);

    // melody (second half of the loop gets a little brighter)
    let pos = 0;
    for (const [note, len] of MELODY[bar]) {
      if (pos === beat && note > 0) {
        this.lead(midi(note), at, len * EIGHTH, bar >= 8);
      }
      pos += len;
    }
  }

  private voice(freq: number, at: number, dur: number, type: OscillatorType, vol: number, cutoff: number): void {
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** two slightly detuned voices = a fuller "fiddle/brass" lead */
  private lead(freq: number, at: number, dur: number, bright: boolean): void {
    for (const detune of [-6, 6]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      o.type = bright ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      f.type = 'lowpass';
      f.frequency.value = bright ? 2600 : 2000;
      const v = bright ? 0.11 : 0.15;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(v, at + 0.03);
      g.gain.setValueAtTime(v, at + Math.max(dur - 0.08, 0.04));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f).connect(g).connect(this.out);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  private kick(at: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.15);
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + 0.22);
  }

  private hit(at: number, vol: number, freq: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}
