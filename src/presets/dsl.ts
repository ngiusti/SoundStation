/** Compact authoring helpers for factory presets. They only build plain recipe objects. */
import { ENGINE_VERSION, SCHEMA_VERSION, type RecipeInput } from "../domain/schema";
import levels from "./levels.json";

type Pt = [number, number];
export const A = (...p: Pt[]): Pt[] => p;
export const O = (wave: "sine" | "triangle" | "saw" | "square", frequencyHz: number, extra: Record<string, unknown> = {}) => ({ type: "oscillator", wave, frequencyHz, ...extra });
export const N = (color: "white" | "pink" | "brown" = "white") => ({ type: "noise", color });
export const IMP = (modes: [number, number, number][], noiseAmount = 0.5, burstMs = 3) => ({
  type: "resonantImpact", modes: modes.map(([frequencyHz, gainDb, decaySeconds]) => ({ frequencyHz, gainDb, decaySeconds })), excitation: { noiseAmount, burstMs },
});
export const SEQ = (inner: unknown, ratePerSecond: number, o: Record<string, unknown> = {}) => ({ type: "eventSequence", inner, ratePerSecond, ...o });
export const SAMPLE_PLACEHOLDER = undefined;
export const lp = (cutoffHz: number, q = 0.707, sweep?: Pt[]) => ({ type: "lowpass", cutoffHz, q, ...(sweep ? { cutoffCurveOctaves: sweep } : {}) });
export const hp = (cutoffHz: number, q = 0.707, sweep?: Pt[]) => ({ type: "highpass", cutoffHz, q, ...(sweep ? { cutoffCurveOctaves: sweep } : {}) });
export const bp = (cutoffHz: number, q = 1, sweep?: Pt[]) => ({ type: "bandpass", cutoffHz, q, ...(sweep ? { cutoffCurveOctaves: sweep } : {}) });
export const drive = (amount: number, inputDb = 0) => ({ type: "drive", inputDb, amount, outputDb: 0 });
export const delay = (timeMs: number, feedback = 0.3, mix = 0.3) => ({ type: "delay", timeMs, feedback, mix });

export interface LayerOpts { start?: number; gain?: number; pan?: number; pitch?: Pt[]; filters?: unknown[]; effects?: unknown[]; send?: number; tremolo?: { rateHz: number; depth: number }; scale?: number }
export const ly = (id: string, name: string, source: unknown, dur: number, amp: Pt[], o: LayerOpts = {}) => ({
  id, name, source, durationSeconds: dur, amplitudeCurve: amp,
  ...(o.start !== undefined ? { startSeconds: o.start } : {}), ...(o.gain !== undefined ? { gainDb: o.gain } : {}), ...(o.pan !== undefined ? { pan: o.pan } : {}),
  ...(o.pitch ? { pitchCurveSemitones: o.pitch } : {}), ...(o.filters ? { filters: o.filters } : {}), ...(o.effects ? { effects: o.effects } : {}),
  ...(o.send !== undefined ? { spaceSendDb: o.send } : {}), ...(o.tremolo ? { tremolo: o.tremolo } : {}), ...(o.scale !== undefined ? { timeScale: o.scale } : {}),
});

export const mac = (id: string, label: string, low: string, high: string, help: string, value = 50) => ({ id, label, value, defaultValue: value, lowLabel: low, highLabel: high, help });
let n = 0;
export const mp = (source: string, target: string, amount: number, o: Record<string, unknown> = {}) => ({ id: `m${++n}`, source, target, amount, ...o });
/** log2 mapping: amount in octaves. */
export const oct = (source: string, target: string, amount: number, o: Record<string, unknown> = {}) => mp(source, target, amount, { domain: "log2", ...o });

export interface PresetOpts {
  id: string; name: string; family: string; description: string; hint: string; tags: string[]; fileCategory: string; fileName: string;
  seed: number; duration: number; layers: unknown[]; macros: unknown[]; mappings: unknown[];
  loop?: boolean | { crossfadeMs?: number; warmupSeconds?: number };
  space?: { decaySeconds: number; returnDb?: number; damping?: number; preDelayMs?: number } | false;
  channels?: 1 | 2; perform?: unknown;
}

/**
 * Level offsets come from levels.json, produced by tools/level-presets.ts (peak-based, not by ear).
 * Up to 12 dB goes on master.gainDb; any excess is added to every layer's gain (equivalent, pre-reverb-send).
 */
export function P(o: PresetOpts): RecipeInput {
  n = 0;
  const lv = (levels as Record<string, number>)[o.id] ?? 0;
  const masterPart = Math.max(-12, Math.min(12, lv)), layerPart = lv - masterPart;
  const layers = (o.layers as { gainDb?: number }[]).map((l) => ({ ...l, gainDb: (l.gainDb ?? -12) + layerPart }));
  const loop = o.loop ? (typeof o.loop === "object" ? o.loop : {}) : null;
  return {
    schemaVersion: SCHEMA_VERSION as 1, engineVersion: ENGINE_VERSION, id: o.id, name: o.name, family: o.family, description: o.description, hint: o.hint,
    tags: o.tags, fileCategory: o.fileCategory, fileName: o.fileName, seed: o.seed, durationSeconds: o.duration, mode: loop ? "loop" : "oneShot",
    ...(loop ? { loop: { crossfadeMs: 150, warmupSeconds: 3, equalPower: true, ...loop } } : {}),
    layers: layers as RecipeInput["layers"], macros: o.macros as RecipeInput["macros"], mappings: (o.mappings as { id: string }[]).map((m, i) => ({ ...m, id: `m${i + 1}` })) as RecipeInput["mappings"],
    master: { gainDb: masterPart, space: o.space ? { enabled: true, damping: 0.5, returnDb: -20, preDelayMs: 10, ...o.space } : { enabled: false } },
    exportDefaults: { channels: o.channels ?? (loop ? 2 : 1), encoding: "pcm24" },
    ...(o.perform ? { perform: o.perform } : {}),
  } as RecipeInput;
}
