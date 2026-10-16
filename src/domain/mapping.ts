import type { Recipe, Mapping } from "./schema";
import { cloneRecipe } from "./clone";

/** Declared domain bounds by parameter leaf name. */
export const PARAM_BOUNDS: Record<string, [number, number]> = {
  gainDb: [-60, 12],
  pan: [-1, 1],
  frequencyHz: [10, 16000],
  cutoffHz: [20, 20000],
  q: [0.3, 20],
  timeScale: [0.05, 20],
  durationSeconds: [0.002, 120],
  startSeconds: [0, 120],
  spaceSendDb: [-80, 12],
  decaySeconds: [0.003, 12],
  returnDb: [-60, 6],
  damping: [0, 1],
  preDelayMs: [0, 200],
  index: [0, 8],
  ratio: [0.1, 16],
  depthSemitones: [0, 12],
  rateHz: [0.05, 60],
  depth: [0, 1],
  amount: [0, 1],
  inputDb: [-24, 36],
  outputDb: [-36, 12],
  timeMs: [1, 2000],
  feedback: [0, 0.85],
  mix: [0, 1],
  noiseAmount: [0, 1],
  burstMs: [0.2, 80],
  ratePerSecond: [0.05, 200],
  intervalJitter: [0, 1],
  pitchRangeSemitones: [0, 24],
  gainRangeDb: [0, 24],
  eventDecaySeconds: [0.002, 4],
  playbackRate: [0.1, 8],
};

export interface ResolvedPath {
  parent: Record<string, unknown>;
  key: string;
  value: number;
}

/** Walks `layers.<id>.a.b.0.c`, `master.x`, or top-level keys. Only finite numeric leaves resolve. */
export function resolvePath(recipe: Recipe, target: string): ResolvedPath | null {
  const parts = target.split(".");
  let cur: unknown = recipe;
  let i = 0;
  if (parts[0] === "layers") {
    if (parts.length < 3) return null;
    cur = recipe.layers.find((l) => l.id === parts[1]);
    if (!cur) return null;
    i = 2;
  }
  for (; i < parts.length - 1; i++) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur === null || typeof cur !== "object") return null;
  const key = parts[parts.length - 1];
  const value = (cur as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Protect structural keys that are numeric but are not parameters.
  if (key === "schemaVersion" || key === "seed") return null;
  return { parent: cur as Record<string, unknown>, key, value };
}

export function shape(curve: Mapping["curve"], n: number): number {
  switch (curve) {
    case "easeIn": return n * n;
    case "easeOut": return 1 - (1 - n) * (1 - n);
    case "smooth": return n * n * (3 - 2 * n);
    default: return n;
  }
}

export interface EffectiveValue {
  target: string;
  base: number;
  effective: number;
}

/**
 * Evaluate macros + mappings into effective values without touching the base recipe.
 * effective = clamp(base + sum(deltas)) for linear targets; clamp(base * 2^sum(deltas)) for log2 targets.
 * A mapping's delta is amount * polarity * (curve(n) - curve(n0)), so at the macro's default
 * value the effective value equals the authored base value.
 */
export function applyMappings(recipe: Recipe): { effective: Recipe; table: EffectiveValue[] } {
  const eff = cloneRecipe(recipe);
  const macroById = new Map(recipe.macros.map((m) => [m.id, m]));
  const groups = new Map<string, Mapping[]>();
  for (const m of recipe.mappings) {
    const g = groups.get(m.target) ?? [];
    g.push(m);
    groups.set(m.target, g);
  }
  const table: EffectiveValue[] = [];
  for (const [target, maps] of groups) {
    const res = resolvePath(eff, target);
    if (!res) throw new Error(`Mapping target "${target}" does not resolve to a numeric parameter`);
    const domains = new Set(maps.map((m) => m.domain));
    if (domains.size > 1) throw new Error(`Target "${target}" mixes linear and log2 mappings; use one domain per target`);
    const log = maps[0].domain === "log2";
    let delta = 0;
    for (const m of maps) {
      const macro = macroById.get(m.source);
      if (!macro) throw new Error(`Mapping ${m.id} references unknown macro ${m.source}`);
      const n = shape(m.curve, macro.value / 100);
      const n0 = shape(m.curve, macro.defaultValue / 100);
      delta += m.amount * m.polarity * (n - n0);
    }
    const base = res.value;
    let v = log ? base * Math.pow(2, delta) : base + delta;
    const bounds = PARAM_BOUNDS[res.key];
    let lo = bounds ? bounds[0] : -Infinity;
    let hi = bounds ? bounds[1] : Infinity;
    for (const m of maps) {
      if (m.min !== undefined) lo = Math.max(lo, m.min);
      if (m.max !== undefined) hi = Math.min(hi, m.max);
    }
    v = Math.min(hi, Math.max(lo, v));
    res.parent[res.key] = v;
    table.push({ target, base, effective: v });
  }
  return { effective: eff, table };
}

/** Bake current macro state into base values and remove the chosen mappings (all if ids omitted). */
export function bakeMappings(recipe: Recipe, mappingIds?: string[]): Recipe {
  const ids = new Set(mappingIds ?? recipe.mappings.map((m) => m.id));
  const subset: Recipe = { ...cloneRecipe(recipe), mappings: recipe.mappings.filter((m) => ids.has(m.id)) };
  const { effective } = applyMappings(subset);
  const baked = cloneRecipe(effective);
  baked.mappings = recipe.mappings.filter((m) => !ids.has(m.id));
  return baked;
}

export function setMacro(recipe: Recipe, macroId: string, value: number): Recipe {
  const r = cloneRecipe(recipe);
  const m = r.macros.find((x) => x.id === macroId);
  if (!m) throw new Error(`Unknown macro "${macroId}". Known: ${r.macros.map((x) => x.id).join(", ") || "(none)"}`);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Macro "${macroId}" must be between 0 and 100 (got ${value})`);
  m.value = value;
  return r;
}
