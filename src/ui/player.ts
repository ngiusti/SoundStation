/** Playback of an already-rendered buffer. Play never regenerates audio; it only schedules a finished buffer. */
import { safeGet, safeSet } from "./storage";

export interface PlayOptions { loop?: boolean; monoCheck?: boolean }

class Player {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private bufferSeconds = 0;
  private looping = false;
  private listeners = new Set<() => void>();
  monitorDb = Number(safeGet("monitorDb") ?? -12);

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.applyGain();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }
  private applyGain() { if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(Math.pow(10, this.monitorDb / 20), this.ctx.currentTime, 0.01); }
  setMonitorDb(db: number) { this.monitorDb = db; safeSet("monitorDb", String(db)); this.applyGain(); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((f) => f()); }
  get playing() { return this.src !== null; }

  play(channels: Float32Array[], sampleRate: number, opts: PlayOptions = {}) {
    const ctx = this.ensure();
    this.stop();
    let chans = channels;
    if (opts.monoCheck && channels.length === 2) {
      const m = new Float32Array(channels[0].length);
      for (let i = 0; i < m.length; i++) m[i] = 0.5 * (channels[0][i] + channels[1][i]);
      chans = [m];
    }
    const buf = ctx.createBuffer(chans.length, chans[0].length, sampleRate);
    chans.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = !!opts.loop;
    s.connect(this.gain!);
    s.onended = () => { if (this.src === s) { this.src = null; this.emit(); } };
    s.start();
    this.src = s;
    this.startedAt = ctx.currentTime;
    this.bufferSeconds = buf.duration;
    this.looping = !!opts.loop;
    this.emit();
  }

  stop() {
    if (this.src) {
      const s = this.src;
      this.src = null;
      s.onended = null;
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
      this.emit();
    }
  }

  /** Seconds into the buffer, or null when stopped. */
  position(): number | null {
    if (!this.src || !this.ctx) return null;
    const t = this.ctx.currentTime - this.startedAt;
    return this.looping ? t % this.bufferSeconds : Math.min(t, this.bufferSeconds);
  }

  level(): { peak: number; rms: number } {
    if (!this.analyser || !this.src) return { peak: 0, rms: 0 };
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let p = 0, e = 0;
    for (const v of a) { const x = Math.abs(v); if (x > p) p = x; e += v * v; }
    return { peak: p, rms: Math.sqrt(e / a.length) };
  }
}

export const player = new Player();

/** Last and first portions of a loop, repeated, to hear the seam. At least four repeats. */
export function seamBuffer(channels: Float32Array[], sampleRate: number, repeats = 4): Float32Array[] {
  const n = channels[0].length;
  const w = Math.min(Math.floor(n / 2), Math.round(1.5 * sampleRate));
  return channels.map((c) => {
    const unit = new Float32Array(w * 2);
    unit.set(c.subarray(n - w), 0);
    unit.set(c.subarray(0, w), w);
    const out = new Float32Array(unit.length * repeats);
    for (let r = 0; r < repeats; r++) out.set(unit, r * unit.length);
    return out;
  });
}
