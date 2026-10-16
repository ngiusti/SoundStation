import type { Source } from "../domain/schema";
import { Rng, stream } from "../domain/random";
import { TWO_PI, dbToLin } from "./dsp";

export interface DecodedAsset {
  sampleRate: number;
  channels: Float32Array[];
}
export type AssetProvider = (assetId: string) => DecodedAsset | undefined;

/** polyBLEP residual for band-limited saw/square. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

type OscSource = Extract<Source, { type: "oscillator" }>;
type NoiseSource = Extract<Source, { type: "noise" }>;
type ImpactSource = Extract<Source, { type: "resonantImpact" }>;
type SampleSource = Extract<Source, { type: "sample" }>;
type SeqSource = Extract<Source, { type: "eventSequence" }>;

export function generateOscillator(
  s: OscSource,
  frames: number,
  sr: number,
  pitchSemis: Float32Array | null,
  freqScale = 1,
): Float32Array {
  const out = new Float32Array(frames);
  let phase = s.phaseDegrees / 360;
  let mphase = 0;
  let vphase = 0;
  const nyq = sr * 0.45;
  for (let i = 0; i < frames; i++) {
    let f = s.frequencyHz * freqScale;
    if (pitchSemis) f *= Math.pow(2, pitchSemis[i] / 12);
    if (s.vibrato) {
      f *= Math.pow(2, (s.vibrato.depthSemitones * Math.sin(TWO_PI * vphase)) / 12);
      vphase += s.vibrato.rateHz / sr;
      if (vphase >= 1) vphase -= 1;
    }
    f = Math.min(Math.max(f, 1), nyq);
    const dt = f / sr;
    let y: number;
    switch (s.wave) {
      case "sine": {
        let arg = TWO_PI * phase;
        if (s.fm) {
          arg += s.fm.index * Math.sin(TWO_PI * mphase);
          mphase += dt * s.fm.ratio;
          if (mphase >= 1) mphase -= Math.floor(mphase);
        }
        y = Math.sin(arg);
        break;
      }
      case "triangle":
        y = 4 * Math.abs(phase - 0.5) - 1;
        break;
      case "saw":
        y = 2 * phase - 1 - polyBlep(phase, dt);
        break;
      default: {
        y = phase < 0.5 ? 1 : -1;
        y += polyBlep(phase, dt);
        y -= polyBlep((phase + 0.5) % 1, dt);
      }
    }
    out[i] = y;
    phase += dt;
    if (phase >= 1) phase -= Math.floor(phase);
  }
  return out;
}

// Noise is normalised to a common RMS so "pink" and "brown" are not wildly louder/quieter than white.
const NOISE_RMS = 0.3;
const noiseNorm: Record<string, number> = {};
function rawNoise(color: NoiseSource["color"], n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n);
  if (color === "white") {
    for (let i = 0; i < n; i++) out[i] = rng.bipolar();
  } else if (color === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng.bipolar();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = 0.998 * last + 0.05 * rng.bipolar();
      out[i] = last;
    }
  }
  return out;
}
function noiseScale(color: NoiseSource["color"]): number {
  if (noiseNorm[color] === undefined) {
    const buf = rawNoise(color, 1 << 16, new Rng(12345));
    let e = 0;
    for (let i = 8192; i < buf.length; i++) e += buf[i] * buf[i];
    noiseNorm[color] = NOISE_RMS / Math.sqrt(e / (buf.length - 8192));
  }
  return noiseNorm[color];
}
export function generateNoise(s: NoiseSource, frames: number, rng: Rng): Float32Array {
  const out = rawNoise(s.color, frames, rng);
  const k = noiseScale(s.color);
  for (let i = 0; i < frames; i++) out[i] *= k;
  return out;
}

/** Decay constant for a T60: amplitude falls 60 dB over decaySeconds. */
const t60Rate = (decay: number) => 6.907755 / decay;

export function generateImpact(s: ImpactSource, frames: number, sr: number, rng: Rng, freqScale = 1): Float32Array {
  const out = new Float32Array(frames);
  const modes = s.modes.map((m) => ({
    w: TWO_PI * Math.min(m.frequencyHz * freqScale, sr * 0.45) / sr,
    g: dbToLin(m.gainDb),
    k: t60Rate(m.decaySeconds) / sr,
    ph: rng.next() * TWO_PI,
  }));
  const burstN = Math.max(1, Math.round((s.excitation.burstMs / 1000) * sr));
  const burstK = 5 / burstN;
  for (let i = 0; i < frames; i++) {
    let y = 0;
    for (const m of modes) y += m.g * Math.exp(-m.k * i) * Math.sin(m.w * i + m.ph);
    out[i] = y * 0.5;
  }
  // Excitation burst: noise (rough contact) over a click (clean strike), both short and decaying.
  const na = s.excitation.noiseAmount;
  for (let i = 0; i < Math.min(frames, burstN * 6); i++) {
    const env = Math.exp(-burstK * i);
    out[i] += env * (na * rng.bipolar() * 0.8 + (1 - na) * 0.5 * (i === 0 ? 1 : Math.cos((Math.PI * i) / burstN)));
  }
  return out;
}

export function generateSample(
  s: SampleSource,
  frames: number,
  sr: number,
  asset: DecodedAsset,
  warnings: string[],
): Float32Array[] {
  const srcLen = asset.channels[0].length;
  const startF = Math.min(srcLen - 1, Math.max(0, Math.floor(s.startSeconds * asset.sampleRate)));
  const endF = Math.min(srcLen, Math.max(startF + 1, Math.floor((s.endSeconds ?? srcLen / asset.sampleRate) * asset.sampleRate)));
  const rate = (s.playbackRate * asset.sampleRate) / sr;
  const segLen = endF - startF;
  const outLen = Math.min(frames, Math.floor(segLen / rate));
  if (outLen < 1) warnings.push("Sample layer has an empty range.");
  const fadeIn = Math.round((s.fadeInMs / 1000) * sr);
  const fadeOut = Math.round((s.fadeOutMs / 1000) * sr);
  const chans: Float32Array[] = asset.channels.map((src) => {
    const out = new Float32Array(frames);
    for (let i = 0; i < outLen; i++) {
      const p = i * rate;
      const idx = s.reverse ? endF - 1 - p : startF + p;
      const i0 = Math.floor(idx);
      const f = idx - i0;
      const a = src[Math.min(Math.max(i0, 0), srcLen - 1)];
      const b = src[Math.min(Math.max(i0 + 1, 0), srcLen - 1)];
      let v = a + (b - a) * f;
      if (i < fadeIn) v *= i / fadeIn;
      const rem = outLen - 1 - i;
      if (rem < fadeOut) v *= rem / fadeOut;
      out[i] = v;
    }
    return out;
  });
  if (s.channelMode === "mono" && chans.length === 2) {
    const m = new Float32Array(frames);
    for (let i = 0; i < frames; i++) m[i] = 0.5 * (chans[0][i] + chans[1][i]);
    return [m];
  }
  return chans;
}

export function generateEvents(
  s: SeqSource,
  frames: number,
  sr: number,
  seed: number,
  layerId: string,
): Float32Array {
  const out = new Float32Array(frames);
  const rng = stream(seed, layerId, "events");
  const period = 1 / s.ratePerSecond;
  const evFrames = Math.min(frames, Math.max(16, Math.round(s.eventDecaySeconds * 6 * sr)));
  const k = t60Rate(s.eventDecaySeconds) / sr;
  let t = rng.next() * period;
  let n = 0;
  while (t * sr < frames) {
    const start = Math.floor(t * sr);
    const semis = s.pitchRangeSemitones * rng.bipolar();
    const gain = dbToLin(-s.gainRangeDb * rng.next());
    const ratio = Math.pow(2, semis / 12);
    const evRng = stream(seed, layerId, "event", n);
    let burst: Float32Array;
    if (s.inner.type === "oscillator") {
      burst = generateOscillator({ ...s.inner, vibrato: undefined }, evFrames, sr, null, ratio);
    } else if (s.inner.type === "noise") {
      burst = generateNoise(s.inner, evFrames, evRng);
    } else {
      burst = generateImpact(s.inner, evFrames, sr, evRng, ratio);
    }
    const atk = Math.max(1, Math.round(0.001 * sr));
    for (let i = 0; i < evFrames && start + i < frames; i++) {
      const env = Math.exp(-k * i) * (i < atk ? i / atk : 1);
      out[start + i] += burst[i] * env * gain;
    }
    n++;
    t += period * (1 + s.intervalJitter * rng.bipolar());
    if (n > 200000) break;
  }
  return out;
}
