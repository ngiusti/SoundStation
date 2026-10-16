/**
 * Time-varying macro motion (XY pad). Only parameters that can change continuously per sample are
 * automated: layer level, oscillator pitch (log2 mappings), filter cutoff (log2 mappings). Other targets
 * driven by a performed macro keep the macro's static value, and the render reports that.
 */
import type { Layer, Recipe } from "../domain/schema";
import { shape } from "../domain/mapping";
import { sampleCurve } from "./dsp";

export interface LayerAutomation {
  gainDb: Float32Array | null;
  pitchSemis: Float32Array | null;
  cutoffOct: Map<number, Float32Array>;
}

const MAX_GAIN_DB = 60, MAX_PITCH = 48, MAX_OCT = 6;

export function buildLayerAutomation(
  r: Recipe, layer: Layer, frames: number, sr: number, startOffsetSeconds: number, cycleSeconds: number, warnings: Set<string>,
): LayerAutomation | null {
  const pf = r.perform;
  if (!pf || !pf.enabled) return null;
  const curves: Record<string, Float32Array> = {};
  const get = (macroId: string) => {
    if (!curves[macroId]) curves[macroId] = sampleCurve(macroId === pf.xMacro ? pf.xCurve : pf.yCurve, frames, sr, 1, cycleSeconds, startOffsetSeconds);
    return curves[macroId];
  };
  const prefix = `layers.${layer.id}.`;
  const out: LayerAutomation = { gainDb: null, pitchSemis: null, cutoffOct: new Map() };
  for (const m of r.mappings) {
    if (m.source !== pf.xMacro && m.source !== pf.yMacro) continue;
    if (!m.target.startsWith(prefix)) continue;
    const macro = r.macros.find((x) => x.id === m.source)!;
    const nStatic = shape(m.curve, macro.value / 100);
    const motion = get(m.source);
    const delta = (i: number) => m.amount * m.polarity * (shape(m.curve, motion[i] / 100) - nStatic);
    const rest = m.target.slice(prefix.length);
    const cut = /^filters\.(\d)\.cutoffHz$/.exec(rest);
    if (rest === "gainDb" && m.domain === "linear") {
      const a = out.gainDb ?? (out.gainDb = new Float32Array(frames));
      for (let i = 0; i < frames; i++) a[i] = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, a[i] + delta(i)));
    } else if (rest === "source.frequencyHz" && m.domain === "log2" && layer.source.type === "oscillator") {
      const a = out.pitchSemis ?? (out.pitchSemis = new Float32Array(frames));
      for (let i = 0; i < frames; i++) a[i] = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, a[i] + 12 * delta(i)));
    } else if (cut && m.domain === "log2") {
      const k = Number(cut[1]);
      let a = out.cutoffOct.get(k);
      if (!a) { a = new Float32Array(frames); out.cutoffOct.set(k, a); }
      for (let i = 0; i < frames; i++) a[i] = Math.max(-MAX_OCT, Math.min(MAX_OCT, a[i] + delta(i)));
    } else {
      warnings.add(`Motion on “${m.target}” cannot change over time; the control's own value is used for it.`);
    }
  }
  return out;
}
