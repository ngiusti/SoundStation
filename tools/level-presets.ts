/**
 * Sets master.gainDb for the non-hero factory presets from measured peaks, into src/presets/levels.json.
 * One-shots target a -6 dBFS sample peak, loops -16 dBFS. These are meter-based starting levels, not a
 * loudness standard and not a listening judgement. Run: npx tsx tools/level-presets.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import { FACTORY_PRESETS } from "../src/presets";
import { HERO_INPUTS } from "../src/presets/heroes";
import { renderRecipe } from "../src/audio/render";
import { processOutput } from "../src/export/output";
import { analyze } from "../src/audio/analysis";

const heroIds = new Set(HERO_INPUTS.map((h) => h.id));
const file = new URL("../src/presets/levels.json", import.meta.url);
const levels: Record<string, number> = JSON.parse(readFileSync(file, "utf8"));
for (const p of FACTORY_PRESETS) {
  if (heroIds.has(p.id)) continue;
  const out = processOutput(renderRecipe(p), { ...p.exportDefaults, peakPolicy: "none" });
  const a = analyze(out.channels, out.sampleRate);
  const target = p.mode === "loop" ? -16 : -6;
  const gain = Math.round(((levels[p.id] ?? 0) + target - a.peakDbfs) * 2) / 2;
  levels[p.id] = gain;
  console.log(p.id.padEnd(26), `peak ${String(a.peakDbfs).padStart(6)} -> gain ${gain}`);
}
writeFileSync(file, JSON.stringify(levels, null, 2) + "\n");
