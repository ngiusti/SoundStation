/**
 * MCP server (stdio) so Claude can design and fine-tune sounds. It is a thin wrapper over
 * src/core/api.ts - the same functions the CLI uses - so there is no second sound engine.
 * Nothing here opens a network port. stdout carries the protocol; never log to it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  CliError, analyzeWavFile, inspectRecipe, listPresets, loadRecipe, renderToFile, renderVariations,
} from "../core/api";
import { validateRecipe } from "../domain/recipe";
import { ENGINE_VERSION } from "../domain/schema";

const WORKSPACE = resolve(process.env.VH_SFX_WORKSPACE ?? join(process.cwd(), "workspace"));

const source = {
  preset: z.string().optional().describe("Factory preset id, e.g. energy-sidearm. See list_presets."),
  recipe: z.any().optional().describe("A complete recipe object (as returned by get_preset, edited). Takes precedence over preset."),
  recipePath: z.string().optional().describe("Path to a recipe JSON file."),
  set: z.record(z.string(), z.number()).optional().describe("Macro values 0-100 keyed by macro id, e.g. {\"body\": 80}."),
  seed: z.number().int().optional().describe("Override the random seed (changes noise and event timing)."),
};

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof CliError ? `${e.message} (exit ${e.exitCode})` : `Unexpected error: ${(e as Error).message}` }],
});
const guard = <A,>(fn: (a: A) => unknown) => async (a: A) => { try { return ok(fn(a)); } catch (e) { return fail(e); } };

function freeOutPath(name: string): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  let n = 1;
  let p: string;
  do { p = join(WORKSPACE, "renders", `${name}_${stamp}_${String(n++).padStart(2, "0")}.wav`); } while (existsSync(p));
  return p;
}

const server = new McpServer({ name: "vh-sfx-lab", version: ENGINE_VERSION });

server.registerTool("list_presets", {
  description: "List factory sound presets with their macros (the plain-language controls). Optional text search over names, tags and descriptions.",
  inputSchema: { query: z.string().optional() },
}, guard(({ query }: { query?: string }) => listPresets(query)));

server.registerTool("get_preset", {
  description: "Return a preset's full recipe JSON. Edit layers, curves, filters or mappings, then pass it back as `recipe` to render. Layer fields: source, startSeconds, durationSeconds, gainDb, amplitudeCurve [[t,v]...], pitchCurveSemitones, filters, effects, spaceSendDb.",
  inputSchema: { id: z.string() },
}, guard(({ id }: { id: string }) => loadRecipe({ preset: id }).recipe));

server.registerTool("validate_recipe", {
  description: "Check a recipe object against the schema and semantic rules. Returns readable errors; changes nothing.",
  inputSchema: { recipe: z.any() },
}, guard(({ recipe }: { recipe: unknown }) => { const v = validateRecipe(recipe); return { ok: v.ok, errors: v.errors }; }));

server.registerTool("inspect_recipe", {
  description: "Summarise a recipe: layers, macros, what each macro maps to, and the effective (macro-resolved) parameter values.",
  inputSchema: source,
}, guard((a: Parameters<typeof inspectRecipe>[0]) => inspectRecipe(a)));

server.registerTool("render", {
  description: "Render a sound to a WAV file with the same engine as the app and return measurements (peak, RMS, spectrum bands, envelope, attack, decay, loop seam). Use the measurements to judge and iterate; the human listens to the file. Output goes under ./workspace/renders unless outPath is given. A recipe sidecar .recipe.json is written next to it for reproducibility.",
  inputSchema: {
    ...source,
    outPath: z.string().optional().describe("Destination .wav path. Default: workspace/renders/<id>_<time>.wav"),
    sampleRate: z.union([z.literal(44100), z.literal(48000)]).optional(),
    channels: z.union([z.literal(1), z.literal(2)]).optional(),
    encoding: z.enum(["pcm16", "pcm24", "float32"]).optional(),
    overwrite: z.boolean().optional(),
  },
}, guard((a: { outPath?: string; sampleRate?: 44100 | 48000; channels?: 1 | 2; encoding?: "pcm16" | "pcm24" | "float32"; overwrite?: boolean } & Parameters<typeof inspectRecipe>[0] & { recipe?: unknown }) => {
  const { recipe: r } = loadRecipe(a);
  const out = a.outPath ?? freeOutPath(r.id);
  return renderToFile({ ...a, out, sidecar: true });
}));

server.registerTool("variations", {
  description: "Generate N reproducible variations of a sound by nudging unlocked macros within a strength and drawing new seeds. Lock macros to keep their character. Writes VH_<category>_<name>_NNN.wav plus per-file recipe sidecars and a manifest.",
  inputSchema: {
    ...source,
    count: z.number().int().min(1).max(100).default(8),
    strength: z.union([z.enum(["subtle", "moderate", "bold"]), z.number().min(0).max(1)]).default("subtle"),
    lock: z.array(z.string()).optional().describe("Macro ids to hold constant."),
    outDir: z.string().optional().describe("Default: workspace/variations/<id>_<time>"),
    overwrite: z.boolean().optional(),
  },
}, guard((a: { count: number; strength: "subtle" | "moderate" | "bold" | number; lock?: string[]; outDir?: string; overwrite?: boolean } & Parameters<typeof inspectRecipe>[0]) => {
  const { recipe: r } = loadRecipe(a);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const res = renderVariations({ ...a, outDir: a.outDir ?? join(WORKSPACE, "variations", `${r.id}_${stamp}`) });
  return res.manifest;
}));

server.registerTool("analyze_wav", {
  description: "Measure any WAV file: duration, peak/RMS dBFS, attack, decay, spectral centroid, octave-band levels, 10 ms envelope, loop-seam diagnostics (set loop=true).",
  inputSchema: { path: z.string(), loop: z.boolean().optional() },
}, guard(({ path, loop }: { path: string; loop?: boolean }) => analyzeWavFile(path, loop)));

server.registerTool("compare_wav", {
  description: "Compare two WAV files (e.g. before/after a tweak): returns both analyses' key numbers and the differences, so you can describe the audible change in plain words.",
  inputSchema: { a: z.string(), b: z.string() },
}, guard(({ a, b }: { a: string; b: string }) => {
  const A = analyzeWavFile(a), B = analyzeWavFile(b);
  const pick = (x: typeof A) => ({ durationSeconds: x.durationSeconds, peakDbfs: x.peakDbfs, rmsDbfs: x.rmsDbfs, attackMs: x.attackMs, decay20DbMs: x.decay20DbMs, spectralCentroidHz: x.spectralCentroidHz, rolloff95Hz: x.rolloff95Hz });
  const bandDiff = A.bands.map((band, i) => ({ band: band.label, aRelDb: band.relDb, bRelDb: B.bands[i].relDb, diff: Math.round((B.bands[i].relDb - band.relDb) * 10) / 10 }));
  return { a: pick(A), b: pick(B), deltaB_minus_A: { rmsDb: Math.round((B.rmsDbfs - A.rmsDbfs) * 10) / 10, peakDb: Math.round((B.peakDbfs - A.peakDbfs) * 10) / 10, centroidHz: B.spectralCentroidHz - A.spectralCentroidHz, durationSeconds: Math.round((B.durationSeconds - A.durationSeconds) * 1000) / 1000 }, bandDiff };
}));

await server.connect(new StdioServerTransport());
