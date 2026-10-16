import { RecipeSchema, type Recipe, SCHEMA_VERSION } from "./schema";
import { resolvePath, PARAM_BOUNDS } from "./mapping";

export interface ValidationResult {
  ok: boolean;
  recipe?: Recipe;
  errors: string[];
}

/** Parse + semantic validation. Never throws. */
export function validateRecipe(input: unknown): ValidationResult {
  if (input && typeof input === "object" && "schemaVersion" in input) {
    const v = (input as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === "number" && v > SCHEMA_VERSION) {
      return { ok: false, errors: [`Recipe schema version ${v} is newer than this app understands (${SCHEMA_VERSION}). Open it in a newer version; nothing was changed.`] };
    }
  }
  const parsed = RecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(recipe)"}: ${i.message}`),
    };
  }
  const r = parsed.data;
  const errors: string[] = [];
  const layerIds = new Set<string>();
  for (const l of r.layers) {
    if (layerIds.has(l.id)) errors.push(`layers: duplicate layer id "${l.id}"`);
    layerIds.add(l.id);
    if (l.source.type === "sample" && !r.assets.some((a) => a.id === (l.source as { assetId: string }).assetId))
      errors.push(`layers.${l.id}: sample asset "${(l.source as { assetId: string }).assetId}" is not listed in assets`);
  }
  const macroIds = new Set<string>();
  for (const m of r.macros) {
    if (macroIds.has(m.id)) errors.push(`macros: duplicate macro id "${m.id}"`);
    macroIds.add(m.id);
  }
  const mapIds = new Set<string>();
  for (const m of r.mappings) {
    if (mapIds.has(m.id)) errors.push(`mappings: duplicate mapping id "${m.id}"`);
    mapIds.add(m.id);
    if (!macroIds.has(m.source)) errors.push(`mappings.${m.id}: unknown macro "${m.source}"`);
    const res = resolvePath(r, m.target);
    if (!res) errors.push(`mappings.${m.id}: target "${m.target}" is not a numeric parameter`);
    else if (!PARAM_BOUNDS[res.key] && (m.min === undefined || m.max === undefined))
      errors.push(`mappings.${m.id}: target "${m.target}" needs explicit min and max`);
  }
  if (r.perform) {
    if (!macroIds.has(r.perform.xMacro)) errors.push(`perform: unknown X macro "${r.perform.xMacro}"`);
    if (!macroIds.has(r.perform.yMacro)) errors.push(`perform: unknown Y macro "${r.perform.yMacro}"`);
    if (r.perform.xMacro === r.perform.yMacro) errors.push("perform: X and Y must be different macros");
  }
  if (r.layers.every((l) => l.mute)) errors.push("layers: every layer is muted, the sound would be silent");
  return errors.length ? { ok: false, errors } : { ok: true, recipe: r, errors: [] };
}

export function parseRecipeOrThrow(input: unknown): Recipe {
  const v = validateRecipe(input);
  if (!v.ok || !v.recipe) throw new Error("Invalid recipe:\n" + v.errors.join("\n"));
  return v.recipe;
}

export { cloneRecipe } from "./clone";
