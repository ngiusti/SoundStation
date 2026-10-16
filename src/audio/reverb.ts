/**
 * Original Schroeder/Freeverb-topology algorithmic reverb (parallel damped combs + series allpasses).
 * No impulse responses are used. Comb feedback is derived from the requested T60, so
 * "decaySeconds" is a real reverberation time. Delay lengths get small seeded jitter.
 */
import { stream } from "../domain/random";
import { dbToLin } from "./dsp";

const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];
const SPREAD = 23;

class Comb {
  buf: Float32Array; i = 0; store = 0;
  constructor(len: number, public fb: number, public damp: number) { this.buf = new Float32Array(len); }
  process(x: number) {
    const out = this.buf[this.i];
    this.store = out * (1 - this.damp) + this.store * this.damp;
    this.buf[this.i] = x + this.store * this.fb;
    if (++this.i >= this.buf.length) this.i = 0;
    return out;
  }
}
class Allpass {
  buf: Float32Array; i = 0;
  constructor(len: number) { this.buf = new Float32Array(len); }
  process(x: number) {
    const b = this.buf[this.i];
    const out = -x + b;
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.buf.length) this.i = 0;
    return out;
  }
}

export interface ReverbParams { decaySeconds: number; damping: number; returnDb: number; preDelayMs: number }

/** Mono send in, stereo return out (added to out arrays). */
export function renderReverb(send: Float32Array, outL: Float32Array, outR: Float32Array, p: ReverbParams, sr: number, seed: number) {
  const rng = stream(seed, "space");
  const scale = sr / 44100;
  const mk = (extra: number) =>
    COMB.map((c) => {
      const len = Math.max(8, Math.round((c + extra) * scale * (1 + 0.02 * rng.bipolar())));
      const fb = Math.pow(10, (-3 * (len / sr)) / Math.max(0.05, p.decaySeconds));
      return new Comb(len, Math.min(fb, 0.9995), p.damping * 0.8);
    });
  const combsL = mk(0), combsR = mk(SPREAD);
  const apL = ALLPASS.map((a) => new Allpass(Math.round(a * scale)));
  const apR = ALLPASS.map((a) => new Allpass(Math.round((a + SPREAD) * scale)));
  const pre = Math.round((p.preDelayMs / 1000) * sr);
  const gain = dbToLin(p.returnDb) * 0.045;
  const n = send.length;
  for (let i = 0; i < n; i++) {
    const x = (i >= pre ? send[i - pre] : 0) * gain;
    let l = 0, r = 0;
    for (const c of combsL) l += c.process(x);
    for (const c of combsR) r += c.process(x);
    for (const a of apL) l = a.process(l);
    for (const a of apR) r = a.process(r);
    outL[i] += l * 3; outR[i] += r * 3;
  }
}
