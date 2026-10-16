/** Measurements used by the UI and by Claude to "hear" a render as numbers. */
import { fft, linToDb, nextPow2 } from "./dsp";

export interface SeamReport {
  boundaryJump: number;
  meanFirstDifference: number;
  jumpRatio: number;
  windowLevelDiffDb: number;
  warning: string | null;
}

export interface Analysis {
  frames: number;
  sampleRate: number;
  durationSeconds: number;
  channels: number;
  peakDbfs: number;
  rmsDbfs: number;
  crestDb: number;
  dcOffset: number;
  leadingSilenceMs: number;
  attackMs: number;
  /** ms from peak until the 10 ms RMS envelope drops 20 dB below it. null if it never does. */
  decay20DbMs: number | null;
  envelopeDbfs: number[];
  spectralCentroidHz: number;
  rolloff95Hz: number;
  bands: { label: string; centerHz: number; relDb: number }[];
  nonFinite: number;
  overFullScale: number;
  seam?: SeamReport;
  notes: string[];
}

const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export function analyze(chans: Float32Array[], sr: number, opts: { loop?: boolean } = {}): Analysis {
  const n = chans[0].length;
  const mono = new Float32Array(n);
  let nonFinite = 0, over = 0, peak = 0, sumSq = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chans) {
      const v = c[i];
      if (!Number.isFinite(v)) { nonFinite++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > 1) over++;
      m += v / chans.length;
    }
    mono[i] = m;
    sumSq += m * m; sum += m;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const notes: string[] = [];

  let lead = 0;
  const thr = Math.max(peak * 0.01, 1e-5);
  while (lead < n && Math.abs(mono[lead]) < thr) lead++;
  let attack = lead;
  while (attack < n && Math.abs(mono[attack]) < peak * 0.9) attack++;

  // 10 ms RMS envelope
  const win = Math.max(1, Math.round(0.01 * sr));
  const env: number[] = [];
  for (let s = 0; s < n; s += win) {
    let e = 0; const end = Math.min(n, s + win);
    for (let i = s; i < end; i++) e += mono[i] * mono[i];
    env.push(Math.sqrt(e / (end - s)));
  }
  let envPeak = 0, envPeakIdx = 0;
  env.forEach((v, i) => { if (v > envPeak) { envPeak = v; envPeakIdx = i; } });
  let decayMs: number | null = null;
  for (let i = envPeakIdx; i < env.length; i++) if (env[i] < envPeak * 0.1) { decayMs = (i - envPeakIdx) * 10; break; }
  const buckets = 24;
  const envelope: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor((b * env.length) / buckets), z = Math.max(a + 1, Math.floor(((b + 1) * env.length) / buckets));
    let m = 0; for (let i = a; i < Math.min(z, env.length); i++) m = Math.max(m, env[i]);
    envelope.push(Math.round(linToDb(m) * 10) / 10);
  }

  // Averaged spectrum (Hann, 4096, hop 2048, at most 200 windows spread across the file).
  const N = 4096;
  const re = new Float64Array(N), im = new Float64Array(N);
  const power = new Float64Array(N / 2);
  const hops = Math.max(1, Math.floor((n - N) / 2048) + 1);
  const step = Math.max(1, Math.floor(hops / 200));
  let wins = 0;
  const hann = new Float64Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  for (let h = 0; h < hops; h += step) {
    const off = h * 2048;
    for (let i = 0; i < N; i++) { re[i] = (mono[off + i] ?? 0) * hann[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    wins++;
  }
  let total = 0, cen = 0;
  for (let k = 1; k < N / 2; k++) { power[k] /= wins; total += power[k]; cen += power[k] * ((k * sr) / N); }
  let acc = 0, roll = 0;
  for (let k = 1; k < N / 2; k++) { acc += power[k]; if (acc >= total * 0.95) { roll = (k * sr) / N; break; } }
  const bands = BANDS.map((c) => {
    const lo = c / Math.SQRT2, hi = c * Math.SQRT2;
    let e = 0;
    for (let k = 1; k < N / 2; k++) { const f = (k * sr) / N; if (f >= lo && f < hi) e += power[k]; }
    return { label: c >= 1000 ? `${c / 1000}k` : `${c}`, centerHz: c, e };
  });
  const maxB = Math.max(...bands.map((b) => b.e), 1e-30);
  const bandOut = bands.map((b) => ({ label: b.label, centerHz: b.centerHz, relDb: Math.round(linToDb(Math.sqrt(b.e / maxB)) * 10) / 10 }));

  const a: Analysis = {
    frames: n, sampleRate: sr, durationSeconds: n / sr, channels: chans.length,
    peakDbfs: round1(linToDb(peak)), rmsDbfs: round1(linToDb(rms)), crestDb: round1(linToDb(peak) - linToDb(rms)),
    dcOffset: Math.round((sum / Math.max(1, n)) * 1e5) / 1e5,
    leadingSilenceMs: Math.round((lead / sr) * 1000), attackMs: Math.round(((attack - lead) / sr) * 1000 * 10) / 10,
    decay20DbMs: decayMs, envelopeDbfs: envelope,
    spectralCentroidHz: total > 0 ? Math.round(cen / total) : 0, rolloff95Hz: Math.round(roll),
    bands: bandOut, nonFinite, overFullScale: over, notes,
  };
  if (nonFinite) notes.push(`${nonFinite} non-finite samples found.`);
  if (over) notes.push(`${over} samples exceed full scale.`);
  if (a.leadingSilenceMs > 20) notes.push(`${a.leadingSilenceMs} ms of leading silence; trim it unless the delay is intentional.`);
  if (peak < 1e-6) notes.push("Silent.");
  if (opts.loop) a.seam = seamReport(mono, sr);
  return a;
}

export function seamReport(x: Float32Array, sr: number): SeamReport {
  const n = x.length;
  let sd = 0;
  for (let i = 1; i < n; i++) sd += Math.abs(x[i] - x[i - 1]);
  const meanDiff = sd / Math.max(1, n - 1);
  const jump = Math.abs(x[0] - x[n - 1]);
  const w = Math.min(Math.round(0.05 * sr), Math.floor(n / 4));
  const rmsOf = (a: number, b: number) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, b - a)); };
  const diffDb = linToDb(rmsOf(0, w)) - linToDb(rmsOf(n - w, n));
  const ratio = meanDiff > 1e-9 ? jump / meanDiff : jump > 1e-6 ? Infinity : 0;
  const warning = ratio > 6 || Math.abs(diffDb) > 3
    ? "The loop point looks abrupt compared with the rest of the file. Listen across the seam before trusting it."
    : null;
  return { boundaryJump: round5(jump), meanFirstDifference: round5(meanDiff), jumpRatio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : 9999, windowLevelDiffDb: round1(diffDb), warning };
}
const round1 = (x: number) => Math.round(x * 10) / 10;
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
export { nextPow2 };
