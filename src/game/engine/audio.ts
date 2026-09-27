/**
 * Chiptune sound effects from raw WebAudio oscillators, no audio files.
 * The context is created lazily on the first press (browsers require a gesture).
 */
const MUTE_KEY = 'retro-ball:mute';

export class Chip {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* private mode: default to sound on */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, delay = 0, slideTo?: number) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const gn = this.ctx.createGain();
    gn.gain.value = vol;
    src.buffer = buf;
    src.connect(gn).connect(this.ctx.destination);
    src.start(this.ctx.currentTime + delay);
  }

  blip() { this.tone(880, 0.05); }
  select() { this.tone(660, 0.06); this.tone(990, 0.08, 'square', 0.08, 0.06); }
  pitch() { this.tone(300, 0.12, 'triangle', 0.15, 0, 150); }
  mitt() { this.noise(0.05, 0.25); }
  swing() { this.noise(0.08, 0.06); }
  crack() { this.noise(0.12, 0.35); this.tone(1400, 0.06, 'square', 0.06); }
  foul() { this.tone(500, 0.1, 'square', 0.06, 0, 300); }
  strike() { this.tone(220, 0.18, 'square', 0.07); }
  out() { this.tone(330, 0.1); this.tone(220, 0.2, 'square', 0.08, 0.1); }
  cheer() { this.noise(0.9, 0.12); }
  hit() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.1, 'square', 0.07, i * 0.08));
  }
  homer() {
    this.noise(1.2, 0.14);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.07, i * 0.1));
  }
  /** The classic ballpark "charge!" bugle. */
  charge() {
    [392, 523, 659, 784, 0, 659, 784].forEach((f, i) => f && this.tone(f, i === 6 ? 0.35 : 0.12, 'square', 0.07, i * 0.13));
  }
  lose() {
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, i * 0.25));
  }
}
