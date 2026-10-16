import { RecipeSchema, type Layer, type Recipe } from "../domain/schema";
import { cloneRecipe } from "../domain/clone";
import { validateRecipe } from "../domain/recipe";

export const HISTORY_LIMIT = 100;

export interface AppState {
  recipe: Recipe;
  past: Recipe[];
  future: Recipe[];
  presetId: string | null;
  /** JSON of the last saved/loaded recipe; dirty = differs. */
  baseline: string;
  view: "simple" | "advanced";
  selectedLayerId: string | null;
  /** Bumps on every sound-affecting change. */
  revision: number;
  notice: string | null;
}

export type Action =
  | { type: "load"; recipe: Recipe; presetId: string | null; clean?: boolean }
  | { type: "edit"; fn: (draft: Recipe) => void; label?: string }
  | { type: "undo" } | { type: "redo" }
  | { type: "select"; layerId: string | null }
  | { type: "view"; view: "simple" | "advanced" }
  | { type: "markClean" }
  | { type: "notice"; text: string | null };

export function initialState(recipe: Recipe, presetId: string | null): AppState {
  return { recipe, past: [], future: [], presetId, baseline: JSON.stringify(recipe), view: "simple", selectedLayerId: recipe.layers[0]?.id ?? null, revision: 1, notice: null };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "load":
      return { ...s, recipe: a.recipe, past: [], future: [], presetId: a.presetId, baseline: a.clean === false ? "" : JSON.stringify(a.recipe), selectedLayerId: a.recipe.layers[0]?.id ?? null, revision: s.revision + 1, notice: null };
    case "edit": {
      const draft = cloneRecipe(s.recipe);
      a.fn(draft);
      const parsed = validateRecipe(draft);
      if (!parsed.ok || !parsed.recipe) return { ...s, notice: "That change was not applied: " + parsed.errors[0] };
      if (JSON.stringify(parsed.recipe) === JSON.stringify(s.recipe)) return s;
      const sel = s.selectedLayerId && parsed.recipe.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : parsed.recipe.layers[0]?.id ?? null;
      return { ...s, recipe: parsed.recipe, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.recipe], future: [], revision: s.revision + 1, selectedLayerId: sel, notice: null };
    }
    case "undo": {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, recipe: prev, past: s.past.slice(0, -1), future: [s.recipe, ...s.future], revision: s.revision + 1 };
    }
    case "redo": {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { ...s, recipe: next, past: [...s.past, s.recipe], future: rest, revision: s.revision + 1 };
    }
    case "select": return { ...s, selectedLayerId: a.layerId };
    case "view": return { ...s, view: a.view };
    case "markClean": return { ...s, baseline: JSON.stringify(s.recipe) };
    case "notice": return { ...s, notice: a.text };
  }
}

export const isDirty = (s: AppState) => JSON.stringify(s.recipe) !== s.baseline;

export function newLayer(kind: "oscillator" | "noise" | "resonantImpact" | "eventSequence" | "sample", existing: Layer[], assetId?: string, durationSeconds = 0.5): Layer {
  let n = existing.length + 1;
  while (existing.some((l) => l.id === `layer${n}`)) n++;
  const id = `layer${n}`;
  const src =
    kind === "oscillator" ? { type: "oscillator", wave: "sine", frequencyHz: 220 }
    : kind === "noise" ? { type: "noise", color: "white" }
    : kind === "resonantImpact" ? { type: "resonantImpact", modes: [{ frequencyHz: 400, gainDb: 0, decaySeconds: 0.3 }, { frequencyHz: 1100, gainDb: -6, decaySeconds: 0.15 }], excitation: { noiseAmount: 0.5, burstMs: 3 } }
    : kind === "eventSequence" ? { type: "eventSequence", ratePerSecond: 6, intervalJitter: 0.3, pitchRangeSemitones: 2, gainRangeDb: 4, eventDecaySeconds: 0.05, inner: { type: "resonantImpact", modes: [{ frequencyHz: 900, gainDb: 0, decaySeconds: 0.05 }], excitation: { noiseAmount: 0.5, burstMs: 2 } } }
    : { type: "sample", assetId: assetId ?? "missing", startSeconds: 0, endSeconds: null };
  const names = { oscillator: "Tone", noise: "Noise", resonantImpact: "Impact", eventSequence: "Events", sample: "Recording" };
  return RecipeSchema.shape.layers.element.parse({
    id, name: `${names[kind]} ${n}`, source: src, durationSeconds, gainDb: -14,
    amplitudeCurve: kind === "oscillator" || kind === "noise" ? [[0, 0], [0.005, 1], [durationSeconds, 0]] : [[0, 1], [durationSeconds, 1]],
  });
}
