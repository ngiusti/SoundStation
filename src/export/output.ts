/** Output stage: downmix, export gain, peak policy, optional dither + WAV encode. */
import type { RenderOutput } from "../audio/render";
import type { ExportSettings } from "../domain/schema";
import { dbToLin, linToDb } from "../audio/dsp";
import { encodeWav } from "./wav";

export interface OutputReport {
  prePeakDbfs: number;
  postPeakDbfs: number;
  appliedGainDb: number;
  clipped: boolean;
  warnings: string[];
}

export interface ProcessedOutput {
  channels: Float32Array[];
  sampleRate: number;
  report: OutputReport;
}

/** Mono downmix matrix: 0.5 L + 0.5 R. Phase cancellation is reported, never hidden. */
export function downmix(l: Float32Array, r: Float32Array): { mono: Float32Array; cancellationDb: number } {
  const n = l.length;
  const mono = new Float32Array(n);
  let eIn = 0, eOut = 0;
  for (let i = 0; i < n; i++) {
    const m = 0.5 * (l[i] + r[i]);
    mono[i] = m;
    eIn += 0.5 * (l[i] * l[i] + r[i] * r[i]);
    eOut += m * m;
  }
  return { mono, cancellationDb: eIn > 1e-12 ? 10 * Math.log10(Math.max(eOut, 1e-20) / eIn) : 0 };
}

export function processOutput(render: RenderOutput, s: ExportSettings): ProcessedOutput {
  const warnings: string[] = [];
  let chans: Float32Array[];
  if (s.channels === 1) {
    const { mono, cancellationDb } = downmix(render.channels[0], render.channels[1]);
    chans = [mono];
    if (cancellationDb < -3) warnings.push(`Mono downmix loses ${(-cancellationDb).toFixed(1)} dB of energy to phase cancellation. Check the Pan and stereo layers.`);
  } else chans = [render.channels[0].slice(), render.channels[1].slice()];

  let gain = dbToLin(s.exportGainDb);
  const peakOf = (g: number) => { let p = 0; for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]) * g; if (a > p) p = a; } return p; };
  const prePeak = peakOf(1);
  const peakAfterGain = peakOf(gain);
  if (s.peakPolicy === "attenuateOnly") {
    const ceil = dbToLin(s.samplePeakCeilingDbfs);
    if (peakAfterGain > ceil) gain *= ceil / peakAfterGain;
  } else if (s.peakPolicy === "normalize") {
    if (prePeak > 1e-9) gain = dbToLin(s.normalizeTargetDbfs) / prePeak;
    else warnings.push("The sound is silent, so it cannot be normalised.");
  }
  if (gain !== 1) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= gain;
  const post = peakOf(1);
  const clipped = s.encoding !== "float32" && post > 1;
  if (clipped) warnings.push("Samples exceed full scale and will clip in this format. Lower the export gain or use 'Attenuate only if needed'.");
  if (s.encoding === "float32" && post > 1) warnings.push("Peaks exceed full scale; the float32 file preserves them but they will clip in most engines.");
  if (prePeak < 1e-6) warnings.push("The rendered sound is silent.");
  return { channels: chans, sampleRate: render.sampleRate, report: { prePeakDbfs: linToDb(prePeak), postPeakDbfs: linToDb(post), appliedGainDb: linToDb(gain), clipped, warnings } };
}

export function encodeOutput(p: ProcessedOutput, s: ExportSettings, seed: number): Uint8Array {
  return encodeWav(p.channels, p.sampleRate, s.encoding, { dither: s.dither, seed });
}
