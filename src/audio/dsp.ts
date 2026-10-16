/** Small deterministic DSP building blocks. Pure TypeScript, no DOM, no Web Audio. */
import type { Curve } from "../domain/schema";

export const TWO_PI = Math.PI * 2;
export const dbToLin = (db: number) => Math.pow(10, db / 20);
export const linToDb = (x: number) => (x > 1e-12 ? 20 * Math.log10(x) : -240);

/** Sample a breakpoint curve (linear interpolation, clamped ends) to one value per frame. */
export function sampleCurve(
  curve: Curve,
  frames: number,
  sr: number,
  timeScale = 1,
  cycleSeconds = 0,
  offsetSeconds = 0,
): Float32Array {
  const out = new Float32Array(frames);
  let seg = 0;
  let lastT = -1;
  for (let i = 0; i < frames; i++) {
    let t = (i / sr + offsetSeconds);
    if (cycleSeconds > 0) t = ((t % cycleSeconds) + cycleSeconds) % cycleSeconds;
    else t = t / timeScale;
    if (t < lastT) seg = 0;
    lastT = t;
    while (seg < curve.length - 2 && t > curve[seg + 1][0]) seg++;
    const [t0, v0] = curve[seg];
    const [t1, v1] = curve[seg + 1];
    if (t <= t0) out[i] = v0;
    else if (t >= t1) out[i] = v1;
    else out[i] = v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return out;
}

export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  set(type: "lowpass" | "highpass" | "bandpass", cutoffHz: number, q: number, sr: number) {
    const fc = Math.min(Math.max(cutoffHz, 20), sr * 0.45);
    const w0 = (TWO_PI * fc) / sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.min(Math.max(q, 0.3), 20));
    const a0 = 1 + alpha;
    let b0: number, b1: number, b2: number;
    if (type === "lowpass") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (type === "highpass") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Equal-power pan for mono, balance for stereo. Returns [gainL, gainR]. */
export function panGains(pan: number, stereoSource: boolean): [number, number] {
  if (stereoSource) return [Math.min(1, 1 - pan), Math.min(1, 1 + pan)];
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-TWO_PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
