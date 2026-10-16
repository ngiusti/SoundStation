import { parseRecipeOrThrow } from "../domain/recipe";
import type { Recipe } from "../domain/schema";
import { HERO_INPUTS } from "./heroes";
import * as A from "./family-a";
import * as B from "./family-b";
import * as C from "./family-c";
import * as D from "./family-d";

const FAMILY_ORDER = ["interface", "energy-weapons", "machinery", "doors", "atmosphere", "material-impacts", "communications", "motion"];
const ALL_INPUTS = [...HERO_INPUTS, ...Object.values(A), ...Object.values(B), ...Object.values(C), ...Object.values(D)];

/** Factory presets are validated at load; a broken preset fails loudly instead of at render time. */
export const FACTORY_PRESETS: Recipe[] = ALL_INPUTS.map((p) => parseRecipeOrThrow(p)).sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));

const SYNONYMS: Record<string, string[]> = {
  gun: ["weapon", "pistol", "shot", "blaster"], weapon: ["gun"], spaceship: ["ship"], ship: ["spaceship"],
  alarm: ["warning", "alert"], warning: ["alarm"], door: ["hatch"], hatch: ["door"],
  engine: ["motor", "generator"], motor: ["engine"], radio: ["comms"], comms: ["radio"],
};

export function getPreset(id: string): Recipe | undefined {
  return FACTORY_PRESETS.find((p) => p.id === id);
}

/** Local text matching over name, tags, family and description. Every query word must match. */
export function searchPresets(query: string, family?: string, presets: Recipe[] = FACTORY_PRESETS): Recipe[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return presets.filter((p) => {
    if (family && p.family !== family) return false;
    const hay = `${p.name} ${p.family} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
    return words.every((w) => hay.includes(w) || (SYNONYMS[w] ?? []).some((s) => hay.includes(s)));
  });
}
