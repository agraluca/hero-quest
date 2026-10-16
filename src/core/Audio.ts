/**
 * Tiny procedural sound-effect synth on WebAudio, so no audio files are shipped.
 * - The AudioContext is created on the first user gesture (unlock()).
 * - Mute is persisted when storage is available.
 * - suspend()/resume() follow page visibility, so nothing plays while hidden.
 */
export type Sfx =
  | 'tap'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'fireball'
  | 'boom'
  | 'arrow'
  | 'lever'
  | 'wrong'
  | 'coin'
  | 'clear'
  | 'death'
  | 'vanish'
  | 'alert'
  | 'backstab'
  | 'dash'
  | 'bridge'
  | 'chest';

const MUTE_KEY = 'scrambly-hero-quest-muted';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private hidden = false;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable: default unmuted */
    }
  }

  /** Must be called from a user gesture handler. */
  unlock(): void {
    if (this.ctx) {
      if (!this.hidden) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.hidden || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'tap':
        this.tone(660, 880, 0.06, 'triangle', 0.25, t);
        break;
      case 'swing':
        this.noise(0.14, 1800, 600, 0.35, t, 'bandpass');
        break;
      case 'hit':
        this.tone(220, 90, 0.1, 'square', 0.22, t);
        this.noise(0.08, 2500, 800, 0.3, t);
        break;
      case 'hurt':
        this.tone(300, 120, 0.22, 'sawtooth', 0.25, t);
        break;
      case 'fireball':
        this.noise(0.3, 600, 2400, 0.3, t, 'bandpass');
        this.tone(180, 360, 0.25, 'triangle', 0.15, t);
        break;
      case 'boom':
        this.noise(0.35, 900, 120, 0.5, t, 'lowpass');
        this.tone(120, 40, 0.3, 'sine', 0.4, t);
        break;
      case 'arrow':
        this.noise(0.12, 4000, 1500, 0.25, t, 'highpass');
        this.tone(900, 500, 0.08, 'triangle', 0.12, t);
        break;
      case 'lever':
        this.tone(520, 520, 0.05, 'square', 0.18, t);
        this.tone(780, 1040, 0.18, 'triangle', 0.22, t + 0.05);
        break;
      case 'wrong':
        this.tone(220, 200, 0.16, 'square', 0.2, t);
        this.tone(160, 150, 0.25, 'square', 0.2, t + 0.15);
        break;
      case 'coin':
        this.tone(988, 988, 0.06, 'square', 0.12, t);
        this.tone(1319, 1319, 0.14, 'square', 0.12, t + 0.06);
        break;
      case 'clear':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.25, t + i * 0.1));
        break;
      case 'death':
        this.tone(440, 110, 0.6, 'sawtooth', 0.22, t);
        break;
      case 'vanish':
        this.tone(1200, 300, 0.35, 'sine', 0.2, t);
        this.noise(0.3, 3000, 500, 0.15, t, 'bandpass');
        break;
      case 'alert':
        this.tone(880, 880, 0.08, 'square', 0.2, t);
        this.tone(1175, 1175, 0.12, 'square', 0.2, t + 0.09);
        break;
      case 'backstab':
        this.noise(0.1, 5000, 2000, 0.35, t, 'highpass');
        this.tone(1500, 400, 0.2, 'sawtooth', 0.18, t);
        break;
      case 'dash':
        this.noise(0.16, 800, 3000, 0.25, t, 'bandpass');
        break;
      case 'bridge':
        this.tone(110, 220, 0.8, 'triangle', 0.3, t);
        this.noise(0.8, 400, 200, 0.2, t, 'lowpass');
        break;
      case 'chest':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.22, 'triangle', 0.22, t + i * 0.07));
        break;
    }
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(dur: number, f0: number, f1: number, vol: number, at: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, at);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt).connect(g).connect(this.master!);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}
