/**
 * The one rendering engine. Used by the browser UI (in a worker), the CLI, the MCP server and tests.
 * Offline, deterministic, pure TypeScript: same recipe + seed + assets + settings => identical floats
 * on the same runtime.
 */
import type { Recipe, Layer } from "../domain/schema";
import { applyMappings } from "../domain/mapping";
import { stream } from "../domain/random";
import { Biquad, dbToLin, linToDb, panGains, sampleCurve } from "./dsp";
import {
  generateEvents, generateImpact, generateNoise, generateOscillator, generateSample,
  type AssetProvider,
} from "./sources";
import { renderReverb } from "./reverb";

export const MEMORY_BUDGET_BYTES = 512 * 1024 * 1024;
const TAIL_FLOOR_DB = -72;

export class RenderError extends Error {
  constructor(public code: "memory" | "asset" | "invalid", message: string) { super(message); }
}

export interface RenderOptions {
  sampleRate?: number;
  assets?: AssetProvider;
  /** Override recipe export tail settings. */
  tailMode?: "include" | "fixed";
  tailMaxSeconds?: number;
  signal?: { cancelled: boolean };
}

export interface RenderOutput {
  /** Always stereo [L, R]; downmix is an export-stage decision. */
  channels: [Float32Array, Float32Array];
  sampleRate: number;
  frames: number;
  warnings: string[];
  loop: boolean;
  /** Frames of intended sound before the effect tail starts (one-shots). */
  bodyFrames: number;
  tailTruncated: boolean;
  effective: Recipe;
}

function audible(layers: Layer[]): Layer[] {
  const anySolo = layers.some((l) => l.solo && !l.mute);
  return layers.filter((l) => !l.mute && (!anySolo || l.solo));
}

/** Seconds of effect tail beyond the dry sound, bounded. */
function estimateTail(r: Recipe, layers: Layer[]): number {
  let tail = 0;
  const spaceOn = r.master.space.enabled && layers.some((l) => l.spaceSendDb > -70);
  if (spaceOn) tail = Math.max(tail, r.master.space.decaySeconds + r.master.space.preDelayMs / 1000);
  for (const l of layers)
    for (const e of l.effects)
      if (e.type === "delay" && !e.bypass) {
        const repeats = e.feedback < 0.01 ? 1 : Math.min(60, Math.ceil(Math.log(0.001) / Math.log(e.feedback)));
        tail = Math.max(tail, (e.timeMs / 1000) * repeats);
      }
  return tail;
}

interface LayerCtx {
  r: Recipe; sr: number; total: number; origin: number; loop: boolean; cycle: number;
  assets?: AssetProvider; warnings: string[];
}

function renderLayer(layer: Layer, c: LayerCtx): { chans: Float32Array[]; startFrame: number } {
  const { sr, r } = c;
  const scale = c.loop ? 1 : layer.timeScale;
  const startSec = c.loop ? c.origin : layer.startSeconds;
  const durSec = c.loop ? c.total / sr : layer.durationSeconds * scale;
  const startFrame = Math.max(0, Math.round((startSec - c.origin) * sr));
  const activeFrames = Math.max(1, Math.min(c.total - startFrame, Math.round(durSec * sr)));
  const bufFrames = c.total - startFrame; // active region plus room for filters/delay tails
  const tOffset = c.loop ? c.origin + startFrame / sr : 0;

  const amp = sampleCurve(layer.amplitudeCurve, activeFrames, sr, scale, c.loop ? c.cycle : 0, tOffset);
  const pitch = layer.pitchCurveSemitones
    ? sampleCurve(layer.pitchCurveSemitones, activeFrames, sr, scale, c.loop ? c.cycle : 0, tOffset)
    : null;

  const src = layer.source;
  let chans: Float32Array[];
  switch (src.type) {
    case "oscillator": {
      let s = src;
      if (c.loop && !pitch && !s.fm && !s.vibrato) {
        // Snap to an integer number of cycles per loop so the bed is periodic over the cycle.
        const snapped = Math.max(1, Math.round(s.frequencyHz * c.cycle)) / c.cycle;
        s = { ...s, frequencyHz: snapped };
      }
      chans = [generateOscillator(s, activeFrames, sr, pitch)];
      break;
    }
    case "noise":
      chans = [generateNoise(src, activeFrames, stream(r.seed, layer.id, "noise"))];
      break;
    case "resonantImpact":
      chans = [generateImpact(src, activeFrames, sr, stream(r.seed, layer.id, "impact"))];
      break;
    case "eventSequence":
      chans = [generateEvents(src, activeFrames, sr, r.seed, layer.id)];
      break;
    case "sample": {
      const asset = c.assets?.(src.assetId);
      if (!asset) throw new RenderError("asset", `Sample for layer "${layer.name}" is missing (asset ${src.assetId}). Locate the original or remove the layer.`);
      chans = generateSample(src, activeFrames, sr, asset, c.warnings);
      break;
    }
  }

  // Amplitude envelope and optional tremolo.
  for (const ch of chans) {
    for (let i = 0; i < activeFrames; i++) {
      let g = amp[i];
      if (layer.tremolo) {
        const t = i / sr + tOffset;
        g *= 1 - layer.tremolo.depth * (0.5 - 0.5 * Math.sin(2 * Math.PI * layer.tremolo.rateHz * t));
      }
      ch[i] *= g;
    }
  }
  // Widen to the room buffer.
  chans = chans.map((ch) => {
    if (ch.length === bufFrames) return ch;
    const w = new Float32Array(bufFrames);
    w.set(ch.subarray(0, Math.min(ch.length, bufFrames)));
    return w;
  });

  // Filters (cutoff may move over time).
  for (const f of layer.filters) {
    if (f.bypass) continue;
    const curve = f.cutoffCurveOctaves
      ? sampleCurve(f.cutoffCurveOctaves, bufFrames, sr, scale, c.loop ? c.cycle : 0, tOffset)
      : null;
    for (const ch of chans) {
      const bq = new Biquad();
      bq.set(f.type, f.cutoffHz, f.q, sr);
      for (let i = 0; i < bufFrames; i++) {
        if (curve && (i & 15) === 0) bq.set(f.type, f.cutoffHz * Math.pow(2, curve[i]), f.q, sr);
        ch[i] = bq.process(ch[i]);
      }
    }
  }

  // Effects.
  for (const e of layer.effects) {
    if (e.bypass) continue;
    if (e.type === "drive") {
      const gin = dbToLin(e.inputDb), gout = dbToLin(e.outputDb);
      const k = 1 + e.amount * 12;
      const norm = 1 / Math.tanh(k);
      for (const ch of chans) for (let i = 0; i < bufFrames; i++) ch[i] = Math.tanh(k * gin * ch[i]) * norm * gout;
    } else {
      const d = Math.max(1, Math.round((e.timeMs / 1000) * sr));
      for (const ch of chans) {
        const line = new Float32Array(d);
        let w = 0;
        for (let i = 0; i < bufFrames; i++) {
          const delayed = line[w];
          line[w] = ch[i] + delayed * e.feedback;
          if (++w >= d) w = 0;
          ch[i] += delayed * e.mix;
        }
      }
    }
  }
  const g = dbToLin(layer.gainDb);
  for (const ch of chans) for (let i = 0; i < bufFrames; i++) ch[i] *= g;
  return { chans, startFrame };
}

export function renderRecipe(recipe: Recipe, opts: RenderOptions = {}): RenderOutput {
  const sr = opts.sampleRate ?? recipe.exportDefaults.sampleRate;
  const warnings: string[] = [];
  const { effective } = applyMappings(recipe);
  const r = effective;
  const layers = audible(r.layers);
  if (layers.length === 0) warnings.push("All layers are muted or excluded by solo; the render is silent.");
  const loop = r.mode === "loop";

  let total: number, origin = 0, bodyFrames: number, cycleFrames = 0, xfade = 0, preFrames = 0;
  const tailMode = opts.tailMode ?? r.exportDefaults.tailMode;
  if (loop) {
    cycleFrames = Math.round(r.durationSeconds * sr);
    xfade = Math.min(Math.round((r.loop.crossfadeMs / 1000) * sr), Math.floor(cycleFrames * 0.1));
    preFrames = Math.round(r.loop.warmupSeconds * sr);
    total = preFrames + cycleFrames + xfade;
    origin = -r.loop.warmupSeconds;
    bodyFrames = cycleFrames;
  } else {
    let bodySec = r.durationSeconds;
    if (tailMode === "include") for (const l of layers) bodySec = Math.max(bodySec, l.startSeconds + l.durationSeconds * l.timeScale);
    bodyFrames = Math.round(bodySec * sr);
    const tailMax = opts.tailMaxSeconds ?? r.exportDefaults.tailMaxSeconds;
    const tailSec = tailMode === "include" ? Math.min(tailMax, estimateTail(r, layers)) : 0;
    total = bodyFrames + Math.round(tailSec * sr);
    if (tailMode === "fixed") total = Math.round(r.durationSeconds * sr);
  }
  if (total > 120 * sr + preFrames + xfade) throw new RenderError("invalid", "Render is longer than the 120 second limit.");
  const estBytes = total * 4 * (2 * (layers.length + 3) + 2);
  if (estBytes > MEMORY_BUDGET_BYTES)
    throw new RenderError("memory", `This render needs about ${(estBytes / 1048576).toFixed(0)} MiB, over the ${MEMORY_BUDGET_BYTES / 1048576} MiB budget. Shorten the sound, shorten the warm-up, or remove layers.`);

  const L = new Float32Array(total), R = new Float32Array(total);
  const space = new Float32Array(total);
  const ctx: LayerCtx = { r, sr, total, origin, loop, cycle: r.durationSeconds, assets: opts.assets, warnings };
  for (const layer of layers) {
    if (opts.signal?.cancelled) throw new RenderError("invalid", "cancelled");
    const { chans, startFrame } = renderLayer(layer, ctx);
    const stereo = chans.length === 2;
    const [gl, gr] = panGains(layer.pan, stereo);
    const send = dbToLin(layer.spaceSendDb);
    const n = chans[0].length;
    const a = chans[0], b = stereo ? chans[1] : chans[0];
    for (let i = 0; i < n; i++) {
      const j = startFrame + i;
      L[j] += a[i] * gl;
      R[j] += b[i] * gr;
      if (send > 1e-4) space[j] += 0.5 * (a[i] + b[i]) * send;
    }
  }
  if (r.master.space.enabled && layers.some((l) => l.spaceSendDb > -70)) {
    const s = r.master.space;
    renderReverb(space, L, R, { decaySeconds: s.decaySeconds, damping: s.damping, returnDb: s.returnDb, preDelayMs: s.preDelayMs }, sr, r.seed);
  }
  const mg = dbToLin(r.master.gainDb);

  let outL: Float32Array, outR: Float32Array, tailTruncated = false;
  if (loop) {
    outL = new Float32Array(cycleFrames); outR = new Float32Array(cycleFrames);
    const srcs: [Float32Array, Float32Array][] = [[L, outL], [R, outR]];
    // Circular overlap: blend the render's extra tail (beyond the cycle) into the cycle head.
    let corr = 0;
    if (xfade > 0) {
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < xfade; i++) {
        const a = L[preFrames + i], b = L[preFrames + cycleFrames + i];
        sab += a * b; saa += a * a; sbb += b * b;
      }
      corr = saa > 1e-12 && sbb > 1e-12 ? Math.max(0, sab / Math.sqrt(saa * sbb)) : 0;
    }
    for (const [src, dst] of srcs) {
      for (let i = 0; i < cycleFrames; i++) dst[i] = src[preFrames + i] * mg;
      for (let i = 0; i < xfade; i++) {
        const x = (i + 0.5) / xfade; // 0 -> 1
        const lin = x;
        const eq = Math.sin((x * Math.PI) / 2);
        const fin = r.loop.equalPower ? corr * lin + (1 - corr) * eq : lin;
        const fout = r.loop.equalPower ? corr * (1 - lin) + (1 - corr) * Math.cos((x * Math.PI) / 2) : 1 - lin;
        dst[i] = (src[preFrames + i] * fin + src[preFrames + cycleFrames + i] * fout) * mg;
      }
    }
    if (r.master.fadeInMs > 0 || r.master.fadeOutMs > 0 || r.master.crop.startSeconds > 0 || r.master.crop.endSeconds !== null)
      warnings.push("Crop and edge fades are ignored in loop mode; loops use the loop-seam crossfade instead.");
  } else {
    for (let i = 0; i < total; i++) { L[i] *= mg; R[i] *= mg; }
    let end = total;
    if (tailMode === "include") {
      const floor = Math.pow(10, TAIL_FLOOR_DB / 20);
      let last = bodyFrames;
      for (let i = total - 1; i >= bodyFrames; i--) {
        if (Math.abs(L[i]) > floor || Math.abs(R[i]) > floor) { last = i + 1; break; }
      }
      const guard = Math.round(0.01 * sr);
      end = Math.min(total, Math.max(bodyFrames, last + guard));
      if (end === total && total > bodyFrames) {
        let tailEnergy = 0;
        for (let i = Math.max(bodyFrames, total - Math.round(0.02 * sr)); i < total; i++) tailEnergy = Math.max(tailEnergy, Math.abs(L[i]), Math.abs(R[i]));
        if (tailEnergy > floor * 4) { tailTruncated = true; warnings.push("This tail is being cut off. Include more tail or shorten Space."); }
      }
    }
    const cs = Math.min(end - 1, Math.round(r.master.crop.startSeconds * sr));
    const ce = r.master.crop.endSeconds === null ? end : Math.min(end, Math.round(r.master.crop.endSeconds * sr));
    if (ce <= cs) throw new RenderError("invalid", "Crop end must be after crop start.");
    outL = L.slice(cs, ce); outR = R.slice(cs, ce);
    const fi = Math.round((r.master.fadeInMs / 1000) * sr), fo = Math.round((r.master.fadeOutMs / 1000) * sr);
    const n = outL.length;
    for (let i = 0; i < Math.min(fi, n); i++) { const g = i / fi; outL[i] *= g; outR[i] *= g; }
    for (let i = 0; i < Math.min(fo, n); i++) { const g = i / fo; outL[n - 1 - i] *= g; outR[n - 1 - i] *= g; }
  }

  // Safety net: never let NaN/Infinity out of the engine.
  let bad = 0;
  for (const ch of [outL, outR]) for (let i = 0; i < ch.length; i++) if (!Number.isFinite(ch[i])) { ch[i] = 0; bad++; }
  if (bad) warnings.push(`${bad} non-finite samples were replaced with silence. Reduce resonance, drive or feedback.`);

  return { channels: [outL, outR], sampleRate: sr, frames: outL.length, warnings, loop, bodyFrames, tailTruncated, effective };
}

export { linToDb };
