/**
 * Sample templates: recipes that need YOUR recording. No audio is bundled. Picking one asks for a WAV, then builds
 * a recipe around it with a few synthetic support layers. Each says what to record.
 */
import { ENGINE_VERSION, SCHEMA_VERSION, type AssetRef, type RecipeInput } from "../domain/schema";
import { parseRecipeOrThrow } from "../domain/recipe";
import type { Recipe } from "../domain/schema";
import { A, N, O, IMP, bp, hp, lp, drive, ly, mac, mp, oct } from "./dsl";

export interface SampleInfo { assetId: string; ref: Omit<AssetRef, "id">; seconds: number }

export interface SampleTemplate {
  id: string;
  name: string;
  description: string;
  /** Plain advice on what to record or import. */
  record: string;
  tags: string[];
  build(s: SampleInfo): RecipeInput;
}

const sample = (s: SampleInfo, o: Record<string, unknown> = {}) => ({ type: "sample", assetId: s.assetId, startSeconds: 0, endSeconds: null, playbackRate: 1, channelMode: "mono", fadeInMs: 2, fadeOutMs: 12, ...o });
const base = (s: SampleInfo, o: Record<string, unknown>): RecipeInput => ({
  schemaVersion: SCHEMA_VERSION as 1, engineVersion: ENGINE_VERSION, family: "samples", seed: 9001, assets: [{ id: s.assetId, ...s.ref }],
  master: { gainDb: 0, space: { enabled: false } }, exportDefaults: { channels: 1, encoding: "pcm24" }, ...o,
} as RecipeInput);
const len = (s: SampleInfo) => Math.max(0.05, Math.min(10, s.seconds));
const ids = (id: string) => ({ id, fileCategory: "Foley" });

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: "tpl-footstep", name: "Single footstep", tags: ["footstep", "step", "foley", "walk", "template"],
    description: "One footstep from your recording, with an optional low thump and a tone control.",
    record: "Record one clean footstep on the surface you want (metal grating, concrete, gravel). Trim to just the step, with a little silence at the start. Mono, 48 kHz is ideal.",
    build: (s) => base(s, { ...ids("footstep"), name: "Single footstep", description: "One footstep from your recording, plus a low thump for weight.", hint: "Increase Weight for a heavier tread; Tone dulls or brightens the step.", tags: ["footstep", "foley", "step"], fileName: "Footstep", durationSeconds: len(s),
      layers: [ly("step", "Your footstep", sample(s), len(s), A([0, 1], [len(s), 1]), { gain: -8 }), ly("thump", "Weight thump", O("sine", 62), 0.18, A([0, 0], [0.004, 1], [0.18, 0]), { gain: -26, pitch: A([0, 5], [0.12, 0]) })],
      macros: [mac("weight", "Weight", "Light", "Heavy", "Adds a low thump."), mac("tone", "Tone", "Dull", "Bright", "Filter on the recording."), mac("pitch", "Pitch", "Low", "High", "Playback speed (changes length too).")],
      mappings: [mp("weight", "layers.thump.gainDb", 22), mp("weight", "layers.step.gainDb", 3), oct("tone", "layers.step.filters.0.cutoffHz", 2), oct("pitch", "layers.step.source.playbackRate", 0.8)],
    }),
  },
  {
    id: "tpl-footsteps", name: "Footsteps sequence", tags: ["footsteps", "walk", "run", "sequence", "foley", "template"],
    description: "Four steps built from one recorded footstep, each slightly different in speed and level.",
    record: "Record one footstep (as for the single footstep). The four steps vary playback speed and level; for real variety, import a different recording per step later in Advanced view.",
    build: (s) => base(s, { ...ids("footsteps"), name: "Footsteps sequence", description: "Four steps from your recording with natural-feeling variation.", hint: "Pace sets the time between steps; Variation changes how different each step is.", tags: ["footsteps", "foley", "walk"], fileName: "Footsteps", durationSeconds: 2.2,
      layers: [
        ly("s1", "Step 1", sample(s, { playbackRate: 1 }), len(s), A([0, 1], [len(s), 1]), { start: 0, gain: -8, pan: -0.15 }),
        ly("s2", "Step 2", sample(s, { playbackRate: 0.96 }), len(s), A([0, 1], [len(s), 1]), { start: 0.5, gain: -9.5, pan: 0.15 }),
        ly("s3", "Step 3", sample(s, { playbackRate: 1.04 }), len(s), A([0, 1], [len(s), 1]), { start: 1.0, gain: -8.5, pan: -0.1 }),
        ly("s4", "Step 4", sample(s, { playbackRate: 0.98 }), len(s), A([0, 1], [len(s), 1]), { start: 1.5, gain: -10, pan: 0.1 }),
      ],
      macros: [mac("pace", "Pace", "Slow", "Fast", "Time between steps."), mac("variation", "Variation", "Even", "Uneven", "How different each step is."), mac("weight", "Weight", "Light", "Heavy", "Overall level.")],
      mappings: [mp("pace", "layers.s2.startSeconds", -0.25), mp("pace", "layers.s3.startSeconds", -0.5), mp("pace", "layers.s4.startSeconds", -0.75),
        oct("variation", "layers.s2.source.playbackRate", 0.2, { polarity: -1 }), oct("variation", "layers.s3.source.playbackRate", 0.2), oct("variation", "layers.s4.source.playbackRate", 0.15, { polarity: -1 }),
        mp("weight", "layers.s1.gainDb", 8), mp("weight", "layers.s2.gainDb", 8), mp("weight", "layers.s3.gainDb", 8), mp("weight", "layers.s4.gainDb", 8)],
    }),
  },
  {
    id: "tpl-firearm-mechanism", name: "Firearm mechanism", tags: ["gun", "weapon", "mechanism", "reload", "bolt", "slide", "foley", "template"],
    description: "A weapon handling action (slide, bolt or reload click) from your recording, sharpened by a synthetic metal click.",
    record: "Record the mechanism itself with a handheld or prop item you own: a bolt pull, slide rack or magazine click. Close to the microphone, quiet room. No gunshots needed.",
    build: (s) => base(s, { ...ids("mechanism"), name: "Firearm mechanism", description: "A mechanical handling sound from your recording plus a metal click for definition.", hint: "Snap adds the synthetic click; Weight adds a low clunk.", tags: ["weapon", "mechanism", "foley"], fileName: "Mechanism", durationSeconds: len(s),
      layers: [ly("rec", "Your recording", sample(s), len(s), A([0, 1], [len(s), 1]), { gain: -8 }),
        ly("click", "Metal click", IMP([[2100, 0, 0.05], [3900, -4, 0.03]], 0.4, 1), 0.12, A([0, 1], [0.12, 1]), { gain: -28 }),
        ly("clunk", "Low clunk", IMP([[150, 0, 0.1], [380, -5, 0.06]], 0.5, 3), 0.2, A([0, 1], [0.2, 1]), { gain: -30 })],
      macros: [mac("snap", "Snap", "Soft", "Snappy", "Level of the added click."), mac("weight", "Weight", "Light", "Heavy", "Level of the added clunk."), mac("brightness", "Brightness", "Dull", "Sharp", "Filter on the recording.")],
      mappings: [mp("snap", "layers.click.gainDb", 24), mp("weight", "layers.clunk.gainDb", 24), oct("brightness", "layers.rec.filters.0.cutoffHz", 2)],
    }),
  },
  {
    id: "tpl-metal-scrape", name: "Metal scrape", tags: ["metal", "scrape", "drag", "scratch", "grind", "foley", "template"],
    description: "A scraping or dragging sound from your recording with an added resonant squeal and grit.",
    record: "Drag a metal object (a tool, a tin lid) across a rough metal or concrete surface, close and steady, for a few seconds. Quiet room.",
    build: (s) => base(s, { ...ids("scrape"), name: "Metal scrape", description: "A scraping sound from your recording with an optional squeal and grit.", hint: "Squeal adds a ringing tone; Grit adds roughness.", tags: ["metal", "scrape", "foley"], fileName: "MetalScrape", durationSeconds: len(s),
      layers: [ly("rec", "Your scrape", sample(s), len(s), A([0, 1], [len(s), 1]), { gain: -8 }),
        ly("squeal", "Squeal", O("saw", 1400, { vibrato: { rateHz: 6, depthSemitones: 0.5 } }), len(s), A([0, 0], [len(s) * 0.2, 1], [len(s) * 0.8, 0.8], [len(s), 0]), { gain: -40, filters: [bp(1800, 4)] }),
        ly("grit", "Grit", N("white"), len(s), A([0, 0], [len(s) * 0.1, 1], [len(s), 0]), { gain: -46, filters: [bp(3000, 0.8)], effects: [drive(0.3)] })],
      macros: [mac("squeal", "Squeal", "None", "Shrill", "Level of the ringing tone."), mac("grit", "Grit", "Smooth", "Rough", "Level of added roughness."), mac("speed", "Speed", "Slow", "Fast", "Playback speed (changes length too).")],
      mappings: [mp("squeal", "layers.squeal.gainDb", 28), mp("grit", "layers.grit.gainDb", 28), oct("speed", "layers.rec.source.playbackRate", 0.8)],
    }),
  },
  {
    id: "tpl-cloth-gear", name: "Cloth and gear movement", tags: ["cloth", "gear", "rustle", "movement", "foley", "armour", "template"],
    description: "Clothing, straps or gear shifting, from your recording with a soft rustle bed.",
    record: "Record fabric, straps or equipment moving: a jacket sleeve, a rucksack strap, a belt buckle. Close to the microphone, avoid wind or breath.",
    build: (s) => base(s, { ...ids("cloth"), name: "Cloth and gear movement", description: "Cloth and gear movement from your recording with an optional rustle layer.", hint: "Rustle adds fabric noise; Jingle adds small metal ticks.", tags: ["cloth", "gear", "foley"], fileName: "ClothGear", durationSeconds: len(s),
      layers: [ly("rec", "Your recording", sample(s), len(s), A([0, 1], [len(s), 1]), { gain: -8 }),
        ly("rustle", "Rustle bed", N("pink"), len(s), A([0, 0], [len(s) * 0.15, 1], [len(s) * 0.85, 0.8], [len(s), 0]), { gain: -44, filters: [hp(2500), lp(9000)] }),
        ly("jingle", "Small metal ticks", IMP([[3100, 0, 0.03], [5200, -5, 0.02]], 0.5, 0.8), 0.1, A([0, 1], [0.1, 1]), { start: Math.min(0.2, len(s) * 0.3), gain: -50 })],
      macros: [mac("rustle", "Rustle", "None", "Noisy", "Fabric noise level."), mac("jingle", "Jingle", "None", "Jangly", "Small metal tick level."), mac("pitch", "Pitch", "Low", "High", "Playback speed (changes length too).")],
      mappings: [mp("rustle", "layers.rustle.gainDb", 30), mp("jingle", "layers.jingle.gainDb", 36), oct("pitch", "layers.rec.source.playbackRate", 0.8)],
    }),
  },
];

/** Build a ready-to-edit recipe from a template and a user's recording. */
export function buildTemplate(t: SampleTemplate, s: SampleInfo): Recipe {
  const r = t.build(s);
  // Every template exposes a tone/brightness filter on the recording through a mapping target; ensure the filter exists.
  const layers = (r.layers as { id: string; filters?: unknown[] }[]).map((l) => (l.id === "step" || l.id === "rec") && !l.filters ? { ...l, filters: [{ type: "lowpass", cutoffHz: 12000, q: 0.707 }] } : l);
  return parseRecipeOrThrow({ ...r, layers });
}
